"use strict";
/* ---------------- CP874 (Windows Thai / TIS-620 compatible) encoder ---------------- */
function encode874(s) {
  const out = [];
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    let b = null;
    if (c < 0x80) b = c;
    else if (c === 0x20ac) b = 0x80;
    else if (c === 0x2026) b = 0x85;
    else if (c === 0x2018) b = 0x91;
    else if (c === 0x2019) b = 0x92;
    else if (c === 0x201c) b = 0x93;
    else if (c === 0x201d) b = 0x94;
    else if (c === 0x2022) b = 0x95;
    else if (c === 0x2013) b = 0x96;
    else if (c === 0x2014) b = 0x97;
    else if (c === 0x00a0) b = 0xa0;
    else if (c >= 0x0e01 && c <= 0x0e3a) b = 0xa1 + (c - 0x0e01);
    else if (c === 0x0e3f) b = 0xdf;
    else if (c >= 0x0e40 && c <= 0x0e44) b = 0xe0 + (c - 0x0e40);
    else if (c >= 0x0e45 && c <= 0x0e49) b = 0xe5 + (c - 0x0e45);
    else if (c >= 0x0e4a && c <= 0x0e4c) b = 0xea + (c - 0x0e4a);
    else if (c === 0x0e4d) b = 0xed;
    else if (c === 0x0e4e) b = 0xee;
    else if (c === 0x0e4f) b = 0xef;
    else if (c >= 0x0e50 && c <= 0x0e59) b = 0xf0 + (c - 0x0e50);
    else if (c === 0x0e5a) b = 0xfa;
    else if (c === 0x0e5b) b = 0xfb;
    if (b === null) b = 0x3f; // '?'
    out.push(b);
  }
  return Buffer.from(out);
}

/* ---------------- text helpers ---------------- */
const chars = (s) => Array.from(String(s ?? ""));
const clip = (s, n) => (chars(s).length <= n ? String(s ?? "") : chars(s).slice(0, n).join(""));
const padLeft = (s, n) => (chars(s).length >= n ? chars(s).join("") : " ".repeat(n - chars(s).length) + s);
const padBoth = (s, n) => {
  const a = chars(s);
  if (a.length >= n) return a.join("");
  const left = Math.floor((n - a.length) / 2);
  return " ".repeat(left) + a.join("");
};

/* ---------------- ESC/POS receipt builder ---------------- */
function buildEscpos(p) {
  const W = Number(p.width) === 48 ? 48 : 32; // 58mm ~ 32 ตัวอักษร, 80mm ~ 48 ตัวอักษร
  const chunks = [];
  const push = (buf) => chunks.push(buf);
  const cmd = (...b) => push(Buffer.from(b));
  const txt = (s) => push(encode874(s));
  const nl = () => push(Buffer.from("\n"));
  const line = (s) => { txt(s); nl(); };

  cmd(0x1b, 0x40); // init
  // เครื่องพิมพ์บางรุ่นต้องเลือก code table ก่อน (ตั้ง env CODE_TABLE เช่น 21 หรือ 255)
  if (process.env.CODE_TABLE && process.env.CODE_TABLE !== "") {
    cmd(0x1b, 0x74, Number(process.env.CODE_TABLE));
  }

  // หัวใบเสร็จ
  cmd(0x1b, 0x61, 0x01); // center
  const shop = chars(p.shop);
  if (shop.length > 0 && shop.length <= Math.floor(W / 2)) {
    cmd(0x1d, 0x21, 0x11); // ตัวใหญ่ 2 เท่า (ความกว้างลดลงครึ่งหนึ่ง)
    line(shop.join(""));
    cmd(0x1d, 0x21, 0x00);
  } else {
    cmd(0x1b, 0x45, 0x01); // ชื่อยาวเกิน — ใช้ตัวขนาดปกติหนาแทน
    line(padBoth(p.shop, W));
    cmd(0x1b, 0x45, 0x00);
  }
  line(clip(p.sub, W));
  cmd(0x1b, 0x45, 0x01); // bold
  line(clip(p.title, W));
  cmd(0x1b, 0x45, 0x00);
  line("-".repeat(W));

  // ข้อมูลบิล
  cmd(0x1b, 0x61, 0x00); // left
  line(clip("ID: " + p.bill, W));
  line(clip("Date: " + p.date, W));
  line(clip("ชำระโดย: " + p.pay, W));
  line(clip("ลูกค้า: " + p.cus, W));
  line("-".repeat(W));

  // รายการสินค้า: ชื่อ (W-14) + จำนวน 4 + ราคา 10
  for (const it of p.items || []) {
    const name = clip(it.name, W - 14);
    line(name + padLeft(String(it.qty ?? ""), 4) + padLeft(Number(it.price ?? 0).toFixed(2), 10));
  }
  line("-".repeat(W));

  // ยอดรวม (ตัวหนา)
  cmd(0x1b, 0x45, 0x01);
  line(padLeft("รวม/Total " + Number(p.total ?? 0).toFixed(2), W));
  cmd(0x1b, 0x45, 0x00);
  line("-".repeat(W));

  // ท้ายใบเสร็จ
  cmd(0x1b, 0x61, 0x01);
  cmd(0x1b, 0x45, 0x01);
  line(clip(p.footer, W));
  cmd(0x1b, 0x45, 0x00);

  nl(); nl(); nl(); // ดันกระดาษ
  cmd(0x1d, 0x56, 0x01); // partial cut
  return Buffer.concat(chunks);
}


module.exports = { buildEscpos, encode874 };
