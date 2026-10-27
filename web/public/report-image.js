/* Local PNG rendering: report data stays on the device until the user shares it. */
"use strict";
globalThis.DailyReportImage = (() => {
  const W = 1080, M = 56, BOTTOM = 2540;
  const font = '"Leelawadee UI", "Noto Sans Thai", Tahoma, sans-serif';
  const money = n => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = value => new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'Asia/Bangkok' }).format(new Date(value + 'T12:00:00+07:00'));
  const timestamp = value => new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(new Date(value));
  function wrap(text, width, measure) {
    const parts = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(String(text ?? '')), p => p.segment)
      : Array.from(String(text ?? ''));
    const lines = []; let line = '';
    for (const ch of parts) {
      if (ch === '\n') { lines.push(line); line = ''; continue; }
      if (line && measure(line + ch) > width) { lines.push(line); line = ''; }
      line += ch;
    }
    lines.push(line);
    return lines;
  }
  function layout(r, measure) {
    if (r.from !== r.to) throw new Error('รูปสรุปต้องเป็นรายงานวันเดียว');
    const pages = []; let page, y;
    const next = () => { page = { blocks: [], height: 0 }; pages.push(page); y = 244; };
    const add = (block, height) => { page.blocks.push({ ...block, y, height }); y += height; page.height = y + 110; };
    next();
    const author = wrap('ผู้ออกรายงาน  ' + r.generatedBy, W - 2 * M, measure);
    for (let i = 0; i < author.length; i += 20) {
      const lines = author.slice(i, i + 20);
      if (y + lines.length * 32 > BOTTOM) next();
      add({ type: 'author', lines }, lines.length * 32 + 18);
    }
    if (y + 294 > BOTTOM) next();
    add({ type: 'summary', values: [
      ['รายรับทั้งหมด', money(r.totalAccountIncome) + ' บาท'],
      ['รายจ่ายทั้งหมด', money(r.sums.cost) + ' บาท'],
      ['เงินสดคงเหลือ', money(r.totalCashCumulative) + ' บาท'],
      ['จำนวนสินค้าที่ขาย', Number(r.totalQuantitySold || 0).toLocaleString('th-TH') + ' ชิ้น'],
    ] }, 294);
    const table = (title, headings, widths, rows, note = '') => {
      const heading = continued => {
        if (y + 160 > BOTTOM) next();
        add({ type: 'heading', title: title + (continued ? ' (ต่อ)' : ''), note }, note ? 100 : 76);
        add({ type: 'columns', cells: headings, widths }, 50);
      };
      heading(false);
      if (!rows.length) rows = [['ไม่มีรายการ', ...headings.slice(1).map(() => '—')]];
      rows.forEach((cells, index) => {
        const lines = cells.map((cell, i) => wrap(cell, widths[i] - 32, measure));
        const maxLines = Math.max(...lines.map(a => a.length));
        // Split unusually long descriptions over pages without dropping text.
        for (let start = 0; start < maxLines; start += 20) {
          const part = lines.map(a => a.slice(start, start + 20));
          const height = Math.max(...part.map(a => a.length)) * 32 + 24;
          if (y + height > BOTTOM) { next(); heading(true); }
          add({ type: 'row', cells: part, widths, stripe: index % 2 === 0 }, height);
        }
      });
      add({ type: 'space' }, 22);
    };
    table('01  ยอดขายตามสินค้า', ['สินค้า', 'จำนวน', 'ยอดขาย (บาท)'], [600, 140, 228],
      r.sellByDate.map(x => [x.name, x.isDiscount ? '—' : String(x.qty), money(x.total)]), 'ยอดขายสุทธิ ' + money(r.totalIncome) + ' บาท · จำนวนชิ้นไม่รวมรายการส่วนลด');
    table('02  รายรับและรายจ่าย', ['รายการ / ช่องทางชำระ', 'ประเภท', 'จำนวน (บาท)'], [600, 140, 228],
      r.costByDate.map(x => [x.list + '\n' + x.paymentType, x.type, money(x.amount)]));
    table('03  รายการเงินสด', ['รายการ', 'ประเภท', 'จำนวน (บาท)'], [600, 140, 228],
      r.cashTx.map(x => [x.list, x.type, money(x.amount)]), 'เงินสดสะสมถึงสิ้นวันที่รายงาน รวมยอดยกมาและตัดจ่ายแล้ว');
    table('04  สต็อกคงเหลือ', ['สินค้า', 'คงเหลือ', 'หน่วย'], [600, 140, 228],
      r.stockRemaining.map(x => [x.name, String(x.amount), 'ชิ้น']), 'ยอดสต็อก ณ เวลาออกรายงาน · แสดงจำนวนติดลบด้วย');
    return pages;
  }
  function text(ctx, value, x, y, size = 25, color = '#193e35', weight = 400, align = 'left') {
    ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(String(value), x, y);
  }
  function box(ctx, x, y, width, height, color, radius = 16) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
  }
  function draw(ctx, page, r, index, total) {
    ctx.fillStyle = '#f3f4ee'; ctx.fillRect(0, 0, W, page.height);
    box(ctx, 0, 0, W, 216, '#183e36', 0);
    ctx.fillStyle = '#eac567'; ctx.fillRect(M, 38, 64, 5);
    text(ctx, 'THE COTTAGE SKY BAR', M, 82, 25, '#eac567', 700);
    text(ctx, 'สรุปการขายประจำวัน', M, 137, 43, '#ffffff', 700);
    text(ctx, date(r.from), M, 180, 26, '#e3ebdf');
    text(ctx, `${index + 1} / ${total}`, W - M, 80, 22, '#eac567', 600, 'right');
    for (const b of page.blocks) {
      if (b.type === 'author') b.lines.forEach((line, i) => text(ctx, line, M, b.y + 27 + i * 32, 25));
      if (b.type === 'summary') b.values.forEach(([label, value], i) => {
        const x = M + (i % 2) * 492, y = b.y + Math.floor(i / 2) * 136;
        box(ctx, x, y, 476, 120, i === 2 ? '#183e36' : '#ffffff');
        text(ctx, label, x + 24, y + 38, 23, i === 2 ? '#d6e4d6' : '#657a6b');
        text(ctx, value, x + 24, y + 88, 33, i === 2 ? '#f2d483' : '#193e35', 700);
      });
      if (b.type === 'heading') {
        text(ctx, b.title, M, b.y + 42, 30, '#193e35', 700);
        if (b.note) text(ctx, b.note, M, b.y + 78, 21, '#657a6b');
      }
      if (b.type === 'columns') {
        box(ctx, M, b.y, W - 2 * M, b.height, '#dfe8db', 0);
        let x = M;
        b.cells.forEach((cell, i) => { text(ctx, cell, i ? x + b.widths[i] - 16 : x + 16, b.y + 33, 22, '#375444', 600, i ? 'right' : 'left'); x += b.widths[i]; });
      }
      if (b.type === 'row') {
        box(ctx, M, b.y, W - 2 * M, b.height, b.stripe ? '#ffffff' : '#eaf0e5', 0);
        let x = M;
        b.cells.forEach((lines, i) => {
          lines.forEach((line, n) => text(ctx, line, i ? x + b.widths[i] - 16 : x + 16, b.y + 34 + n * 32, 25, '#193e35', 400, i ? 'right' : 'left'));
          x += b.widths[i];
        });
      }
    }
    text(ctx, 'ออกเมื่อ ' + timestamp(r.generatedAt) + ' (เวลาไทย)', M, page.height - 60, 21, '#657a6b');
    text(ctx, 'THE COTTAGE  /  DAILY REPORT', M, page.height - 27, 17, '#657a6b', 600);
  }
  async function create(report) {
    if (document.fonts?.ready) await document.fonts.ready;
    const scratch = document.createElement('canvas'), ctx = scratch.getContext('2d');
    if (!ctx) throw new Error('เบราว์เซอร์นี้ไม่รองรับการสร้างรูป');
    ctx.font = `400 25px ${font}`;
    const pages = layout(report, value => ctx.measureText(value).width);
    const files = [];
    for (let i = 0; i < pages.length; i++) {
      const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = pages[i].height;
      draw(canvas.getContext('2d'), pages[i], report, i, pages.length);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('สร้างรูปไม่สำเร็จ กรุณาลองใหม่');
      files.push(new File([blob], `cottage-report-${report.from}-${i + 1}.png`, { type: 'image/png' }));
      canvas.width = 0; canvas.height = 0;
    }
    return files;
  }
  return { create, layout, wrap };
})();
