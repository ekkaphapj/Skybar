/* Shared receipt layout: Thai text is shaped by the browser and printed as dots. */
(function (root) {
  "use strict";
  const clean = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ");
  function wrapText(text, maxWidth, measure) {
    const graphemes = typeof Intl.Segmenter === "function"
      ? Array.from(new Intl.Segmenter("th", { granularity: "grapheme" }).segment(clean(text)), (part) => part.segment)
      : Array.from(clean(text));
    const lines = [];
    let line = "";
    for (const char of graphemes) {
      if (line && measure(line + char) > maxWidth) { lines.push(line.trimEnd()); line = ""; }
      line += char;
    }
    if (line || !lines.length) lines.push(line.trimEnd());
    return lines;
  }
  function concat(chunks) {
    const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    return result;
  }
  function packRaster(rgba, width, height, threshold = 170) {
    if (!Number.isInteger(width) || width < 8 || width > 832 || width % 8 || !Number.isInteger(height) || height < 1 || height > 24000 || rgba.length !== width * height * 4) throw new Error("ขนาดภาพใบเสร็จไม่ถูกต้อง");
    const packed = new Uint8Array(width / 8 * height);
    for (let pixel = 0; pixel < width * height; pixel++) {
      const i = pixel * 4, alpha = rgba[i + 3] / 255;
      const gray = (0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * alpha + 255 * (1 - alpha);
      if (gray < threshold) packed[pixel >> 3] |= 128 >> (pixel & 7);
    }
    return packed;
  }
  function escpos(packed, width, height, cut = false) {
    if (packed.length !== width / 8 * height) throw new Error("ข้อมูลภาพใบเสร็จไม่ครบ");
    const stride = width / 8;
    const chunks = [new Uint8Array([27, 64, 27, 97, 0])];
    // Small raster bands work with the limited buffer of common POS-58 printers.
    for (let y = 0; y < height; y += 96) {
      const rows = Math.min(96, height - y);
      chunks.push(new Uint8Array([29, 118, 48, 0, stride & 255, stride >> 8, rows & 255, rows >> 8]));
      chunks.push(packed.subarray(y * stride, (y + rows) * stride));
    }
    chunks.push(new Uint8Array([27, 100, 4]));
    if (cut) chunks.push(new Uint8Array([29, 86, 1]));
    return concat(chunks);
  }
  function toBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  const toHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  function rawbtUrl(bytes) {
    return "rawbt:base64," + toBase64(bytes);
  }
  let logoPromise;
  function loadLogo() {
    if (!logoPromise) logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = "/logo.png";
    });
    return logoPromise;
  }
  async function render(receipt, copy = 1, copies = 1, paper = 58) {
    if (document.fonts?.ready) await document.fonts.ready;
    const width = Number(paper) === 80 ? 576 : 384;
    const pad = 14, right = width - pad, usable = width - pad * 2;
    const scale = width / 384;
    const logo = await loadLogo();
    const measureCanvas = document.createElement("canvas"), measure = measureCanvas.getContext("2d");
    const ops = [];
    let y = 16;
    const font = (size, bold) => `${bold ? "700" : "400"} ${Math.round(size * scale)}px Tahoma, 'Noto Sans Thai', 'Leelawadee UI', Arial, sans-serif`;
    const text = (value, { size = 22, bold = false, align = "left", x, gap = 5 } = {}) => {
      const style = font(size, bold);
      measure.font = style;
      for (const line of wrapText(value, usable, (s) => measure.measureText(s).width)) {
        ops.push({ type: "text", text: line, font: style, align, x: x ?? (align === "center" ? width / 2 : align === "right" ? right : pad), y });
        y += Math.ceil(size * scale * 1.45);
      }
      y += gap;
    };
    const rule = () => { y += 8; ops.push({ type: "rule", y }); y += 14; };
    if (logo) { ops.push({ type: "logo", y, width: Math.round(100 * scale), height: Math.round(88 * scale) }); y += 100 * scale; }
    text(receipt.shop || "THE COTTAGE SKY BAR", { size: 24, bold: true, align: "center" });
    text("The Cottage Hotel · Udon Thani", { size: 16, align: "center" });
    rule();
    text(receipt.title || "ใบเสร็จรับเงิน / RECEIPT", { size: 22, bold: true, align: "center" });
    if (receipt.tableNo) text("โต๊ะ " + receipt.tableNo, { size: 30, bold: true, align: "center" });
    text("เลขบิล / Bill", { size: 17 });
    text(receipt.bill || "-", { size: 17 });
    text(receipt.date || "-", { size: 19 });
    text("ลูกค้า: " + (receipt.cus || "ไม่ระบุชื่อ"), { size: 20 });
    if (receipt.owner) text("ผู้ขาย: " + receipt.owner, { size: 20 });
    text("ชำระโดย: " + (receipt.pay || "-"), { size: 20 });
    rule();
    text("รายการ                       จำนวน / ยอดเงิน", { size: 18, bold: true });
    for (const item of receipt.items || []) {
      text(item.name, { size: 22, bold: true, gap: 0 });
      const qty = Number(item.qty), price = Number(item.price);
      const amount = price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      ops.push({ type: "text", text: `${qty} × ${(price / (qty || 1)).toFixed(2)}`, font: font(20, false), align: "left", x: pad, y });
      ops.push({ type: "text", text: amount, font: font(22, true), align: "right", x: right, y });
      y += Math.ceil(38 * scale);
    }
    rule();
    text("รวมทั้งสิ้น / TOTAL", { size: 22, bold: true });
    text(Number(receipt.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " บาท", { size: 34, bold: true, align: "right" });
    rule();
    text(receipt.footer || "ขอบคุณค่ะ / THANK YOU", { size: 22, bold: true, align: "center" });
    text("ขอบคุณที่ใช้บริการ", { size: 20, align: "center" });
    text(`ชุดที่ ${copy}/${copies}${copies === 2 ? copy === 1 ? " · ลูกค้า" : " · ร้านค้า" : ""}`, { size: 17, align: "center" });
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = Math.ceil(y + 16);
    if (canvas.height > 24000) throw new Error("ใบเสร็จยาวเกินไป กรุณาลดจำนวนรายการ");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, width, canvas.height);
    ctx.fillStyle = "black"; ctx.textBaseline = "top";
    for (const op of ops) {
      if (op.type === "text") { ctx.font = op.font; ctx.textAlign = op.align; ctx.fillText(op.text, op.x, op.y); }
      if (op.type === "rule") { ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(pad, op.y); ctx.lineTo(right, op.y); ctx.stroke(); }
      if (op.type === "logo") ctx.drawImage(logo, (width - op.width) / 2, op.y, op.width, op.height);
    }
    return canvas;
  }
  async function prepare(receipt, copies = 1, paper = 58, cut = false) {
    if (![1, 2].includes(copies)) throw new Error("จำนวนชุดพิมพ์ต้องเป็น 1 หรือ 2");
    const images = [], heights = [], chunks = [];
    for (let i = 1; i <= copies; i++) {
      const canvas = await render(receipt, i, copies, paper);
      images.push(canvas.toDataURL("image/png"));
      heights.push(canvas.height);
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      chunks.push(escpos(packRaster(data.data, canvas.width, canvas.height), canvas.width, canvas.height, cut));
    }
    return { bytes: concat(chunks), images, heights, paper: Number(paper), copies };
  }
  root.Receipt58 = { clean, wrapText, concat, packRaster, escpos, toBase64, toHex, rawbtUrl, render, prepare };
})(globalThis);
