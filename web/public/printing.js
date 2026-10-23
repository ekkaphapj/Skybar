"use strict";
let AGENT = "http://127.0.0.1:9130";
let printerInfo = { available: false, printers: [], raster: false };
let printingReceipt = false;

function printMode() {
  return localStorage.getItem("pos_print_mode") || (typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) ? "android" : "usb");
}
async function fetchWithTimeout(url, ms, options = {}) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "HTTP " + response.status);
    return result;
  } finally { clearTimeout(timer); }
}
async function detectPrinter() {
  let legacy = null;
  for (const port of [9130, 9131]) {
    const base = "http://127.0.0.1:" + port;
    try {
      const result = await fetchWithTimeout(base + "/status", 1800);
      const info = { available: true, printers: result.printers || [], details: result.printerDetails || [], raster: result.features?.raster === true, agent: result.agent };
      if (info.raster) { AGENT = base; printerInfo = info; return info; }
      legacy = info;
    } catch { /* The second port allows an older agent to remain open during an update. */ }
  }
  printerInfo = legacy || { available: false, printers: [], raster: false };
  return printerInfo;
}
function updatePrintModeUI() {
  const mode = printMode();
  $("pr-mode").value = mode;
  $("pr-printer-wrap").classList.toggle("hidden", mode !== "usb");
  for (const name of ["usb", "android", "browser"]) $("pr-" + name + "-help").classList.toggle("hidden", name !== mode);
}
async function refreshPrinterUI() {
  updatePrintModeUI();
  $("pr-width").value = localStorage.getItem("pos_paper_width") || "58";
  if (printMode() === "android") {
    $("pr-status").textContent = "Bluetooth บน Android · ติดตั้งและตั้งค่า RawBT ก่อนทดสอบ";
    return;
  }
  if (printMode() === "browser") {
    $("pr-status").textContent = "พิมพ์ผ่านหน้าต่างเบราว์เซอร์ / บันทึก PDF";
    return;
  }
  await detectPrinter();
  const select = $("pr-printer");
  const thermalName = (name) => /pos[- _]?\d*|thermal|receipt|xprinter|gprinter|rongta|hprt|epson.*tm-|zj[- _]|rp[- _]?\d|rpp|gp[- _]?\d|generic.*text/i.test(name);
  const candidates = printerInfo.printers.filter((name) => thermalName(name) || printerInfo.details.some((p) => p.name === name && p.thermalCandidate));
  const saved = localStorage.getItem("pos_printer_name") || "";
  const chosen = candidates.includes(saved) ? saved : candidates.length === 1 ? candidates[0] : "";
  if (chosen) localStorage.setItem("pos_printer_name", chosen);
  select.innerHTML = '<option value="">— เลือกเครื่อง thermal ESC/POS —</option>' + candidates.map((name) => `<option${name === chosen ? " selected" : ""}>${esc(name)}</option>`).join("");
  $("pr-status").textContent = !printerInfo.available ? "ไม่พบ print-agent · ดาวน์โหลดและเปิด start.bat ก่อน" : !printerInfo.raster ? "print-agent รุ่นเก่า · ดาวน์โหลดรุ่นใหม่ แล้วปิด/เปิดโปรแกรมใหม่" : !candidates.length ? "เชื่อมต่อแล้ว แต่ยังไม่พบคิวเครื่อง thermal · ตรวจ USB และไดรเวอร์ Windows" : chosen ? "พร้อมส่งงาน USB · " + chosen : "เชื่อมต่อแล้ว · เลือกเครื่อง thermal ก่อนพิมพ์";
}
function receiptPayload(rc, testOnly = false) {
  if (rc?.testPayload) return rc.testPayload;
  if (testOnly) return {
    width: 32, shop: "THE COTTAGE SKY BAR", sub: "The Cottage Hotel Udon Thani",
    title: "ทดสอบพิมพ์ / PRINT TEST", bill: "TEST-58MM-" + Date.now(),
    date: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }),
    pay: "ทดสอบเท่านั้น", cus: "ทดสอบภาษาไทย สระและวรรณยุกต์", tableNo: 1,
    items: [{ name: "ชาเย็น หวานน้อย เพิ่มน้ำแข็ง", qty: 2, price: 60 }, { name: "เครื่องดื่มทดสอบชื่อยาวเพื่อดูการตัดบรรทัด", qty: 1, price: 25 }],
    total: 85, footer: "ทดสอบเท่านั้น · ไม่ใช่ยอดขายจริง",
  };
  return {
    width: Number(localStorage.getItem("pos_paper_width") || 58) === 80 ? 48 : 32,
    shop: (rc.shopType ?? shopType) === 0 ? "THE COTTAGE SKY BAR" : "THE COTTAGE MINI MART",
    title: rc.paid ? "ใบเสร็จรับเงิน / RECEIPT" : "ใบแจ้งรายการ / BILL",
    bill: rc.bill, date: rc.date, pay: rc.pay, owner: rc.owner, cus: rc.cus || "", tableNo: rc.tableNo,
    items: rc.lines, total: rc.total, footer: rc.paid ? "ชำระแล้ว / PAID" : "ยังไม่ชำระเงิน / UNPAID",
  };
}
async function printReceiptNow(rc, testOnly = false, copies = 1, jobId) {
  if (printingReceipt) throw new Error("กำลังเตรียมงานพิมพ์ กรุณารอสักครู่");
  printingReceipt = true;
  try {
    const paper = Number(localStorage.getItem("pos_paper_width") || 58);
    const prepared = await Receipt58.prepare(receiptPayload(rc, testOnly), copies, paper, localStorage.getItem("pos_auto_cut") === "1");
    if (printMode() === "android") return await androidPrint(prepared);
    if (printMode() === "browser") return await browserPrint(rc, testOnly, copies, prepared);
    await detectPrinter();
    if (!printerInfo.available) throw new Error("ไม่พบ print-agent บนคอม กรุณาเปิด start.bat จากชุดติดตั้ง");
    if (!printerInfo.raster) throw new Error("กรุณาอัปเดต print-agent เป็นรุ่น 2 จากหน้าตั้งค่าการพิมพ์");
    const printer = localStorage.getItem("pos_printer_name") || "";
    if (!printer || !printerInfo.printers.includes(printer)) throw new Error("เลือกเครื่อง thermal ที่พร้อมใช้ในหน้าตั้งค่าการพิมพ์ก่อน");
    // One job contains both copies. No silent resend/fallback after a timeout:
    // the spooler may already have accepted the job even if its response was lost.
    const result = await fetchWithTimeout(AGENT + "/print", 45000, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ printer, raw: Receipt58.toHex(prepared.bytes), jobId: jobId || "reprint:" + crypto.randomUUID() }),
    });
    if (!result.ok) throw new Error(result.error || "เครื่องพิมพ์ไม่รับงาน");
    return { message: `ส่งใบเสร็จ ${copies} ชุดเข้าคิว Windows แล้ว กรุณาตรวจใบเสร็จที่เครื่องพิมพ์`, route: "usb" };
  } finally { printingReceipt = false; }
}
function androidPrint(prepared) {
  return new Promise((resolve) => {
    const dialog = $("android-print"), link = $("android-print-link");
    const url = Receipt58.rawbtUrl(prepared.bytes);
    const tooLong = url.length > 600000;
    link.href = tooLong ? "#" : url;
    link.classList.toggle("hidden", tooLong);
    $("android-print-message").textContent = tooLong ? "บิลยาวเกินการส่งผ่านลิงก์ กรุณาดาวน์โหลดภาพแล้วเปิดด้วย RawBT เพื่อพิมพ์" : `ใบเสร็จ ${prepared.copies} ชุด · กระดาษ ${prepared.paper} มม. กดปุ่มด้านล่างเพื่อส่งไปแอป`;
    $("android-print-downloads").innerHTML = prepared.images.map((src, i) => `<a class="btn" download="receipt-${i + 1}.png" href="${src}">ดาวน์โหลดภาพชุด ${i + 1}</a>`).join("");
    let handedOff = false;
    link.onclick = () => { handedOff = true; };
    const done = () => {
      dialog.close(); dialog.oncancel = null; link.onclick = null; $("android-print-form").onsubmit = null;
      resolve({ route: "android", message: handedOff ? `ส่งต่อไป RawBT แล้ว กรุณาตรวจว่ากระดาษออกครบ ${prepared.copies} ชุด พิมพ์ซ้ำได้จากประวัติการขาย` : "ยังไม่ได้ยืนยันการพิมพ์บน Android พิมพ์ได้จากประวัติการขาย" });
    };
    $("android-print-form").onsubmit = (e) => { e.preventDefault(); done(); };
    dialog.oncancel = (e) => { e.preventDefault(); done(); };
    dialog.showModal();
  });
}
async function browserPrint(rc, testOnly = false, copies = 1, prepared) {
  prepared ||= await Receipt58.prepare(receiptPayload(rc, testOnly), copies, Number(localStorage.getItem("pos_paper_width") || 58));
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const printWidth = prepared.paper === 80 ? 72 : 48;
  const maxHeight = Math.max(...prepared.images.map((_, i) => prepared.heights?.[i] || 1200));
  const pageHeight = Math.ceil(maxHeight / 8 + 8);
  frame.contentDocument.open();
  frame.contentDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>ใบเสร็จ ${prepared.paper} มม.</title><style>@page{size:${prepared.paper}mm ${pageHeight}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}article{width:${prepared.paper}mm;padding:3mm 0}article+article{break-before:page;page-break-before:always}img{display:block;width:${printWidth}mm;height:auto;margin:0 auto}</style></head><body>${prepared.images.map((src) => `<article class="receipt-copy"><img src="${src}" alt="ใบเสร็จ"></article>`).join("")}</body></html>`);
  frame.contentDocument.close();
  await Promise.all(Array.from(frame.contentDocument.images).map((img) => img.complete ? Promise.resolve() : new Promise((done) => { img.onload = done; img.onerror = done; })));
  try { frame.contentWindow.focus(); frame.contentWindow.print(); }
  catch { throw new Error("เปิดกล่องพิมพ์ไม่สำเร็จ กรุณาเปิดเว็บด้วย Chrome/Edge หรือเลือก USB/RawBT"); }
  finally { setTimeout(() => frame.remove(), 60000); }
  return { route: "browser", message: "เปิดงานพิมพ์ใบเสร็จแล้ว กรุณายืนยันในกล่องพิมพ์ของเบราว์เซอร์" };
}
