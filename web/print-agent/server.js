"use strict";
const http = require("node:http");
const { spawn } = require("node:child_process");
const os = require("node:os"), path = require("node:path"), fs = require("node:fs"), crypto = require("node:crypto");
const { buildEscpos } = require("./text-receipt");
const cors = { "Vary": "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Private-Network": "true" };
function json(res, code, value) { res.writeHead(code, { ...cors, "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(value)); }
function powershell(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", ...args], { windowsHide: true });
    let out = "", err = "";
    child.stdout.on("data", (data) => out += data); child.stderr.on("data", (data) => err += data);
    const timer = setTimeout(() => { child.kill(); reject(new Error("หมดเวลารอเครื่องพิมพ์ กรุณาตรวจใบเสร็จที่เครื่องก่อนสั่งซ้ำ")); }, timeout);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error((err || out).trim() || "ส่งงานพิมพ์ไม่สำเร็จ")); });
  });
}
async function printerDetails() {
  const text = await powershell(["-Command", "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Printer | Select-Object Name,PortName,DriverName,PrinterStatus | ConvertTo-Json -Compress"], 12000);
  const parsed = JSON.parse(text || "[]");
  return (Array.isArray(parsed) ? parsed : [parsed]).filter((p) => p?.Name).map((p) => ({ name: p.Name, port: p.PortName, driver: p.DriverName, status: Number(p.PrinterStatus), thermalCandidate: /pos[- _]?\d*|thermal|receipt|xprinter|gprinter|hprt|rongta|epson.*tm-|zj[- _]|generic.*text/i.test(p.Name) || /generic.*text/i.test(p.DriverName) }));
}
function spoolRaw(printer, file) { return powershell(["-ExecutionPolicy", "Bypass", "-File", path.join(__dirname, "rawprint.ps1"), "-PrinterName", printer, "-FilePath", file]); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (chunk) => { size += chunk.length; if (size > 4 * 1024 * 1024) { reject(new Error("ใบเสร็จยาวเกินไป")); req.destroy(); } else chunks.push(chunk); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))); req.on("error", reject);
  });
}
function createAgent({ spool = spoolRaw, getPrinters = printerDetails, jobDirectory = path.join(process.env.LOCALAPPDATA || os.tmpdir(), "CottagePOS") } = {}) {
  fs.mkdirSync(jobDirectory, { recursive: true });
  const file = path.join(jobDirectory, "print-jobs.json");
  let jobs = {};
  try { jobs = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  function saveJobs() { jobs = Object.fromEntries(Object.entries(jobs).slice(-500)); fs.writeFileSync(file + ".tmp", JSON.stringify(jobs)); fs.renameSync(file + ".tmp", file); }
  let queue = Promise.resolve();
  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin) {
      let allowed = false;
      try { const u = new URL(origin); allowed = u.origin === "https://cottage-skybar-pos.ekapap-j.workers.dev" || (["http:", "https:"].includes(u.protocol) && ["localhost", "127.0.0.1"].includes(u.hostname)); } catch {}
      if (!allowed) return json(res, 403, { ok: false, error: "origin not allowed" });
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    if (req.method === "OPTIONS") { res.writeHead(204, cors); res.end(); return; }
    const url = new URL(req.url, "http://127.0.0.1");
    try {
      if (req.method === "GET" && url.pathname === "/status") {
        const details = await getPrinters();
        return json(res, 200, { ok: true, agent: "cottage-pos-print-agent/2.0", features: { raster: true, deduplication: true }, printers: details.map((p) => p.name), printerDetails: details });
      }
      if (req.method !== "POST" || url.pathname !== "/print") return json(res, 404, { error: "not found" });
      const body = JSON.parse(await readBody(req));
      if (body.raw !== undefined && (typeof body.raw !== "string" || body.raw.length > 3 * 1024 * 1024 || !/^(?:[a-fA-F0-9]{2})+$/.test(body.raw))) return json(res, 400, { ok: false, error: "ข้อมูลภาพใบเสร็จไม่ถูกต้องหรือยาวเกินไป" });
      const bytes = body.raw ? Buffer.from(body.raw, "hex") : buildEscpos(body);
      const printer = String(body.printer || "");
      const installed = (await getPrinters()).find((p) => p.name === printer);
      if (!installed) return json(res, 400, { ok: false, error: "ไม่พบเครื่องพิมพ์ที่เลือกใน Windows" });
      if (installed.status & 128) return json(res, 409, { ok: false, error: "เครื่องพิมพ์ offline กรุณาตรวจสายและเปิดเครื่อง" });
      if (url.searchParams.get("dry") === "1") return json(res, 200, { ok: true, dryRun: true, printer, bytes: bytes.length });
      const id = String(body.jobId || crypto.randomUUID());
      if (id.length > 200) return json(res, 400, { ok: false, error: "รหัสงานพิมพ์ไม่ถูกต้อง" });
      const fingerprint = crypto.createHash("sha256").update(printer).update(bytes).digest("hex");
      if (Object.hasOwn(jobs, id)) {
        if (jobs[id].fingerprint !== fingerprint) return json(res, 409, { ok: false, error: "รหัสงานซ้ำกับข้อมูลพิมพ์อื่น" });
        if (jobs[id].status === "sent") return json(res, 200, { ok: true, alreadyQueued: true });
        return json(res, 409, { ok: false, error: "งานนี้อาจถูกส่งแล้ว กรุณาตรวจใบเสร็จที่เครื่องก่อนสั่งซ้ำจากประวัติ" });
      }
      jobs[id] = { fingerprint, status: "pending", at: new Date().toISOString() }; saveJobs();
      const tmp = path.join(os.tmpdir(), "cottage-pos-" + crypto.randomUUID() + ".bin");
      try {
        fs.writeFileSync(tmp, bytes);
        const work = queue.then(() => spool(printer, tmp)); queue = work.catch(() => {});
        await work; jobs[id].status = "sent"; saveJobs();
      } catch (error) { jobs[id].status = "uncertain"; saveJobs(); throw error; }
      finally { try { fs.unlinkSync(tmp); } catch {} }
      console.log("[queued]", bytes.length, "bytes ->", printer);
      return json(res, 200, { ok: true });
    } catch (error) { return json(res, 500, { ok: false, error: error.message }); }
  });
}
function start() {
  const server = createAgent(); let port = Number(process.env.PORT || 9130);
  server.on("error", (error) => { if (error.code === "EADDRINUSE" && port === 9130) { port = 9131; server.listen(port, "127.0.0.1"); } else { console.error(error.message); process.exitCode = 1; } });
  server.on("listening", () => console.log("Cottage POS Print Agent 2.0 · http://127.0.0.1:" + port));
  server.listen(port, "127.0.0.1");
  return server;
}
module.exports = { createAgent, start, printerDetails, spoolRaw };
