/* A code-drawn isometric restaurant. Every number comes from the POS API. */
(function (root) {
  "use strict";
  const el = id => document.getElementById(id);
  const e = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const number = value => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const countItems = items => (items || []).filter(i => i.typeName !== "ส่วนลด").reduce((n, i) => n + Number(i.qty || 0), 0);
  const project = (x, y, z = 0) => [450 + (x - y) * 32, 220 + (x + y) * 17 - z * 24];
  const points = vertices => vertices.map(v => project(...v).map(n => n.toFixed(1)).join(",")).join(" ");
  const polygon = (vertices, fill, extra = "") => `<polygon points="${points(vertices)}" fill="${fill}" ${extra}/>`;
  function box(x, y, z, w, d, h, colors) {
    return polygon([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], colors[1]) +
      polygon([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], colors[2]) +
      polygon([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], colors[0]);
  }
  function person(x, y, color, chef = false, scale = 1) {
    return `<g transform="translate(${x},${y}) scale(${scale})" aria-hidden="true"><ellipse cy="7" rx="16" ry="7" fill="#3b514c" opacity=".12"/><path d="M-8-5l-3 11m16-11 4 11" stroke="#344e4b" stroke-width="7" stroke-linecap="round"/><path d="M-10-27q10-9 20 0l3 23h-26z" fill="${color}"/><path d="M-10-23l-6 12m26-12 6 10" stroke="#e8ae83" stroke-width="6" stroke-linecap="round"/><circle cy="-39" r="12" fill="#f7c69b"/><path d="M-12-40q-1-17 14-12 11 2 10 16l-5-9-17 5" fill="#493e38"/><circle cx="-4" cy="-38" r="1.3" fill="#493e38"/><circle cx="4" cy="-38" r="1.3" fill="#493e38"/><path d="M-3-32q3 3 6 0" stroke="#a86c58" fill="none" stroke-width="1.5"/>${chef ? '<path d="M-13-47q-10-14 3-15 7-12 14-1 16-1 10 16z" fill="#fffdf2"/><rect x="-12" y="-48" width="24" height="7" rx="2" fill="#eee9db"/>' : ''}</g>`;
  }
  function plant(x, y, scale = 1) {
    const [px, py] = project(x, y);
    return `<g transform="translate(${px},${py}) scale(${scale})" aria-hidden="true"><ellipse cy="6" rx="23" ry="9" fill="#304b3c" opacity=".12"/><path d="M-17-17h34l-5 27q-12 8-24 0z" fill="#d78f66"/><ellipse cy="-17" rx="17" ry="7" fill="#eeac7c"/><path d="M0-14v-55" stroke="#36644d" stroke-width="4"/><path d="M0-21q-38-5-30-31 25 0 30 31M0-30q34-2 30-30-25 1-30 30M0-42q-27-10-15-32 21 9 15 32M0-55q20-9 13-29-19 3-13 29" fill="#67946a"/><path d="M0-22l-20-19M0-31l20-17" stroke="#96b584" stroke-width="2"/></g>`;
  }
  function chair(x, y, busy) {
    const colors = busy ? ["#f4b88e", "#d38f65", "#b77a54"] : ["#c1d7c4", "#8eb19a", "#729580"];
    return box(x, y, .12, .52, .52, .55, colors) + box(x, y + .4, .62, .52, .12, .68, colors);
  }
  function tableShape(n, order, selected, filter) {
    const col = (n - 1) % 5, row = Math.floor((n - 1) / 5);
    const x = 2.3 + col * 2.65, y = 2.5 + row * 2.45;
    const busy = !!order, [cx, cy] = project(x, y, 1.7);
    const muted = filter === "busy" && !busy || filter === "free" && busy;
    const shape = `<ellipse cx="${cx}" cy="${cy + 53}" rx="49" ry="23" fill="#6f644e" opacity=".09"/>` +
      chair(x - 1, y - .25, busy) + chair(x - .2, y - 1, busy) +
      (busy ? person(...project(x - .7, y - .1, .8), n % 2 ? "#8ca9d5" : "#e8a28d", false, .64) : "") +
      box(x - .09, y - .09, .1, .18, .18, 1.4, ["#b88662", "#9b7055", "#8f614c"]) +
      box(x - .72, y - .56, 1.45, 1.44, 1.12, .2, busy ? ["#eeb88e", "#d99469", "#bc805b"] : ["#f3d6a0", "#dbb27d", "#c69c6c"]) +
      chair(x + .53, y + .32, busy) +
      (busy ? `<ellipse cx="${cx + 20}" cy="${cy + 1}" rx="8" ry="4" fill="#fff9e8"/><ellipse cx="${cx + 20}" cy="${cy + 1}" rx="5" ry="2.6" fill="#c9dca9"/>` : "") +
      `<ellipse cx="${cx}" cy="${cy + 4}" rx="17" ry="11" fill="${busy ? '#a66b4e' : '#927753'}" opacity=".14"/><circle cx="${cx}" cy="${cy - 3}" r="14" fill="${busy ? '#ed8c70' : '#fff9e9'}" stroke="${busy ? '#d5765e' : '#ddc49c'}" stroke-width="1.3"/><text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="14" font-weight="800" fill="${busy ? '#fff' : '#725d43'}">${String(n).padStart(2, '0')}</text>` +
      (busy ? `<rect x="${cx - 35}" y="${cy + 35}" width="70" height="20" rx="10" fill="#fffaf0" stroke="#e2c5a6"/><text x="${cx}" y="${cy + 49}" font-size="11" text-anchor="middle" font-weight="700" fill="#8c614a">฿ ${number(order.total)}</text>` : "");
    return `<g id="scene-table-${n}" data-scene-table="${n}" class="scene-table${selected === n ? ' is-selected' : ''}${muted ? ' is-muted' : ''}" role="button" tabindex="${muted ? '-1' : '0'}" aria-label="โต๊ะ ${n} ${busy ? 'กำลังขาย ' + e(order.cusName || '') + ' ยอด ' + number(order.total) + ' บาท' : 'ว่าง'}" aria-pressed="${selected === n}"><title>โต๊ะ ${n} · ${busy ? e(order.cusName || 'ไม่ระบุชื่อ') + ' · ' + number(order.total) + ' บาท' : 'ว่าง — คลิกเพื่อเปิดการขาย'}</title><ellipse class="table-selection" cx="${cx}" cy="${cy + 34}" rx="54" ry="31" fill="#c9d9ef" fill-opacity=".28" stroke="#779ab5" stroke-width="3" stroke-dasharray="5 5"/>${shape}</g>`;
  }
  function scene(orders, selected = 1, filter = "all") {
    const occupied = new Map(orders.map(o => [Number(o.tableNo), o]));
    let tiles = "";
    for (let x = 0; x <= 16; x++) tiles += polygon([[x, 0, .02], [x, 12, .02]], "none", 'stroke="#c4a97f" stroke-width="1" opacity=".35"');
    for (let y = 0; y <= 12; y++) tiles += polygon([[0, y, .02], [16, y, .02]], "none", 'stroke="#c4a97f" stroke-width="1" opacity=".35"');
    const tables = Array.from({ length: 20 }, (_, i) => i + 1).sort((a, b) => {
      const depth = n => ((n - 1) % 5) * 2.65 + Math.floor((n - 1) / 5) * 2.45;
      return depth(a) - depth(b);
    }).map(n => tableShape(n, occupied.get(n), selected, filter)).join("");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 65 1080 730" class="restaurant-svg" aria-label="ผังร้านจำลอง 3 มิติ โต๊ะ 1 ถึง 20"><defs><linearGradient id="room-sky" x2="0" y2="1"><stop stop-color="#c9e0da"/><stop offset="1" stop-color="#eef0d4"/></linearGradient><radialGradient id="room-halo"><stop stop-color="#fff7dd"/><stop offset="1" stop-color="#f2f1e5" stop-opacity="0"/></radialGradient><filter id="room-shadow" x="-30%" width="160%" y="-30%" height="180%"><feDropShadow dx="0" dy="20" stdDeviation="16" flood-color="#6a785f" flood-opacity=".13"/></filter></defs>
      <ellipse cx="550" cy="470" rx="500" ry="310" fill="url(#room-halo)"/><g filter="url(#room-shadow)">
      ${box(0, 0, -.65, 16, 12, .65, ['#efddbc', '#c2a780', '#bda17a'])}
      ${polygon([[0, 0, 0], [0, 12, 0], [0, 12, 5.7], [0, 0, 5.7]], '#b9ccaf')}
      ${polygon([[0, 0, 0], [16, 0, 0], [16, 0, 5.7], [0, 0, 5.7]], '#f3ecd5')}
      ${box(-.13, -.13, 5.7, 16.2, .18, .2, ['#fcf5df', '#d2c7a8', '#bfb799'])}
      ${box(-.13, -.13, 5.7, .18, 12.25, .2, ['#d9e2c9', '#9fb498', '#91a78a'])}
      ${polygon([[.03, 2.2, 1.6], [.03, 9.7, 1.6], [.03, 9.7, 4.7], [.03, 2.2, 4.7]], '#77947a', 'stroke="#f7eed7" stroke-width="10"')}
      ${polygon([[.06, 2.35, 1.8], [.06, 9.5, 1.8], [.06, 9.5, 4.5], [.06, 2.35, 4.5]], 'url(#room-sky)')}
      ${[4.1, 6, 7.9].map(y => polygon([[.09, y, 1.7], [.09, y, 4.6]], 'none', 'stroke="#f5efda" stroke-width="5"')).join('')}
      ${polygon([[.1, 2.2, 3.2], [.1, 9.7, 3.2]], 'none', 'stroke="#f5efda" stroke-width="5"')}
      ${tiles}
      <g transform="translate(710 238) rotate(28)"><rect x="-122" y="-41" width="244" height="75" rx="10" fill="#426651"/><rect x="-116" y="-35" width="232" height="63" rx="7" fill="none" stroke="#b6c18a"/><text text-anchor="middle" y="-8" font-size="24" font-weight="800" letter-spacing="2" fill="#fcf3cf">THE COTTAGE</text><text text-anchor="middle" y="13" font-size="11" letter-spacing="3" fill="#d6dfb9">SKY BAR &amp; KITCHEN</text></g>
      ${box(3, .55, 0, 11.4, .95, 1.8, ['#9a765a', '#bd9974', '#9b7658'])}${box(2.85, .43, 1.8, 11.7, 1.14, .16, ['#f5e7c9', '#ddc9a6', '#ccb18f'])}
      ${[4, 4.5, 5.1, 11.9, 12.4, 13].map((x, i) => box(x, .8, 2, .23, .25, .65, [i % 2 ? '#76986f' : '#cd9a65', '#527c61', '#456650'])).join('')}
      ${person(...project(8.1, .46, 1.1), '#f5f0da', true, .86)}
      ${plant(.7, 11.2, 1.3)}${plant(15.3, .65, 1.1)}
      ${tables}
      ${person(...project(7.5, 11.2, .1), '#78977c', false, 1.05)}
      ${plant(15.5, 11.4, 1.2)}
      </g><g transform="translate(667 741)"><rect width="202" height="33" rx="16" fill="#e5ebdf"/><circle cx="21" cy="16" r="5" fill="#7c9b73"/><text x="36" y="21" font-size="12" fill="#61765e" font-weight="600">WELCOME TO THE COTTAGE</text></g></svg>`;
  }
  function model(orders, dashboard, selected = 1) {
    return { active: orders.length, free: 20 - orders.length, pending: orders.reduce((n, o) => n + Number(o.total || 0), 0),
      items: orders.reduce((n, o) => n + countItems(o.items), 0), selected: orders.find(o => Number(o.tableNo) === selected) || null,
      revenue: dashboard ? Number(dashboard.revenue) : null, bills: dashboard ? Number(dashboard.bills) : null };
  }
  let orders = [], dashboard = null, selected = 1, filter = "all", catalog = [], category = "all", mapKey = "", detailKey = "";
  const icon = item => /แอลกอฮอล์/.test(item.TypeName || '') && !/ไม่มี/.test(item.TypeName || '') ? '🍹' : /อาหาร/.test(item.TypeName || '') ? '🍲' : /กาแฟ|coffee/i.test(item.Name1 || '') ? '☕' : /เครื่องดื่ม/.test(item.TypeName || '') ? '🥤' : '🍽️';
  function detail(order) {
    const qty = countItems(order?.items);
    return `<div class="selected-table-top"><span class="eyebrow">YOUR SELECTED TABLE</span><span class="table-state ${order ? 'occupied' : ''}">${order ? 'กำลังขาย' : 'พร้อมให้บริการ'}</span></div><h2>โต๊ะ <span>${String(selected).padStart(2, '0')}</span></h2>` +
      (order ? `<p class="room-customer">☺ ${e(order.cusName || 'ไม่ระบุชื่อ')}</p><p class="room-employee">ผู้เปิด: ${e(order.openedBy || order.owner || '-')}</p><div class="room-order-lines">${order.items.length ? order.items.map(i => `<div><span><b>${Number(i.qty)}</b> ${e(i.name)}</span><strong>${number(i.price)}</strong></div>`).join('') : '<p class="hint">โต๊ะเปิดแล้ว ยังไม่มีรายการสั่ง</p>'}</div><div class="room-subtotal"><span>รวม ${qty} รายการ</span><strong>฿ ${number(order.total)}</strong></div><button class="room-order-action" data-order="${e(order.id)}">ดูรายการ / รับออร์เดอร์ <span>↗</span></button><p class="room-action-hint">เพิ่มรายการและเช็คบิลในหน้ารับออร์เดอร์</p>` :
        `<div class="empty-table-art" aria-hidden="true"><span>🍽️</span><i>✦</i></div><h3 class="room-empty-title">ที่นั่งดี ๆ รอลูกค้าอยู่</h3><p class="room-empty-copy">เปิดโต๊ะ แล้วเริ่มรับออร์เดอร์แรกกันเลย</p><button class="room-order-action" data-room-open="${selected}">＋ เปิดการขายโต๊ะนี้</button><p class="room-action-hint">ใส่ชื่อลูกค้าได้ หรือเว้นว่างก็ได้</p>`);
  }
  function render() {
    if (!el('scene-map')) return;
    const m = model(orders, dashboard, selected);
    for (const [id, value] of Object.entries({ 'scene-active': m.active, 'scene-free': `ว่างอีก ${m.free} โต๊ะ`, 'scene-pending': number(m.pending), 'scene-revenue': m.revenue === null ? '—' : number(m.revenue), 'scene-bills': m.bills === null ? '—' : m.bills, 'scene-busy-count': m.active, 'scene-item-count': m.items + ' รายการ' })) el(id).textContent = value;
    const nextMap = JSON.stringify([orders.map(o => [o.tableNo, o.total, o.cusName]), selected, filter]);
    if (nextMap !== mapKey) { el('scene-map').innerHTML = scene(orders, selected, filter); mapKey = nextMap; }
    const nextDetail = JSON.stringify([m.selected, selected]);
    if (detailKey !== nextDetail) { el('scene-selected').innerHTML = detail(m.selected); detailKey = nextDetail; }
    el('scene-activity').innerHTML = orders.length ? orders.slice().sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt))).map(o => `<button class="room-feed-row" data-room-select="${o.tableNo}"><span class="feed-number">${String(o.tableNo).padStart(2, '0')}</span><span><strong>โต๊ะ ${o.tableNo}</strong><small>${e(o.cusName || 'ไม่ระบุชื่อ')} · ${countItems(o.items)} รายการ</small></span><b>฿ ${number(o.total)}</b></button>`).join('') : '<div class="room-feed-empty"><span>☕</span><p>วันนี้เริ่มต้นด้วยออร์เดอร์ดี ๆ<br>เปิดโต๊ะเพื่อต้อนรับลูกค้าได้เลย</p></div>';
    const buckets = Array(12).fill(0);
    for (const row of dashboard?.hourly || []) { const hour = Number(row.hour); if (Number.isInteger(hour) && hour >= 0 && hour < 24) buckets[Math.floor(((hour + 22) % 24) / 2)] += Number(row.total || 0); }
    const max = Math.max(1, ...buckets);
    el('scene-chart').innerHTML = buckets.map((value, i) => `<div class="chart-column" title="${String((i * 2 + 2) % 24).padStart(2, '0')}:00 – ${String((i * 2 + 3) % 24).padStart(2, '0')}:59 · ${dashboard ? number(value) + ' บาท' : 'ไม่มีข้อมูล'}"><div class="chart-track"><span style="height:${Math.max(3, Math.max(0, value) / max * 100)}%" class="${value > 0 ? 'has-sales' : ''}"></span></div><small>${String((i * 2 + 2) % 24).padStart(2, '0')}</small></div>`).join('');
    el('scene-popular').innerHTML = dashboard?.popular?.length ? dashboard.popular.map((p, i) => `<div class="popular-row"><span class="popular-rank">${i + 1}</span><span><strong>${e(p.name)}</strong><small>${Number(p.qty)} รายการ</small></span><b>฿ ${number(p.total)}</b></div>`).join('') : '<p class="room-no-sales">ยอดขายเมนูแรกของวัน<br>จะมาแสดงตรงนี้ ♡</p>';
    el('scene-business-date').textContent = dashboard?.date || 'ยังโหลดข้อมูลไม่ได้';
    el('scene-update').textContent = dashboard ? '● อัปเดต ' + new Date(dashboard.updatedAt).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }) + ' · รีเฟรชทุก 15 วินาที' : 'โหลดข้อมูลยอดขายไม่สำเร็จ กดรีเฟรชเพื่อลองอีกครั้ง';
  }
  function selectTable(n, keyboard = false) {
    if (!Number.isInteger(n) || n < 1 || n > 20) return;
    selected = n; render();
    if (keyboard) el('scene-table-' + n)?.focus();
  }
  function setView(mode) {
    mode = mode === 'list' ? 'list' : 'scene';
    document.body.dataset.desktopView = mode;
    document.querySelectorAll('[data-desktop-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.desktopView === mode)));
    localStorage.setItem('pos_desktop_view', mode);
  }
  function renderMenu() {
    const search = (el('food-search')?.value || '').trim().toLocaleLowerCase('th-TH');
    const categories = [...new Set(catalog.filter(i => i.TypeName !== 'ส่วนลด').map(i => i.TypeName))];
    el('food-categories').innerHTML = ['all', ...categories].map(c => `<button type="button" data-food-category="${e(c)}" aria-pressed="${category === c}">${c === 'all' ? 'เมนูทั้งหมด' : e(c)}</button>`).join('');
    const items = catalog.filter(i => i.TypeName !== 'ส่วนลด' && (category === 'all' || i.TypeName === category) && String(i.Name1).toLocaleLowerCase('th-TH').includes(search));
    el('food-tiles').innerHTML = items.length ? items.map(i => `<button type="button" class="food-tile" data-food-item="${Number(i.ID)}" aria-label="เพิ่ม ${e(i.Name1)} 1 รายการ ราคา ${number(i.Price)} บาท"><span class="food-art ${/อาหาร/.test(i.TypeName) ? 'food-meal' : ''}"><span>${icon(i)}</span><i>✦</i></span><span class="food-name">${e(i.Name1)}</span><small>คงเหลือ ${Number(i.Amount)} · ${e(i.TypeName)}</small><span class="food-tile-bottom"><strong>฿ ${number(i.Price)}</strong><b>＋</b></span></button>`).join('') : '<p class="hint food-no-results">ไม่พบเมนูที่ค้นหา ลองเลือกประเภทอื่นหรือเพิ่มสินค้าก่อน</p>';
  }
  async function loadMenu() {
    if (!el('food-tiles') || !window.matchMedia('(min-width:1050px)').matches) return;
    try { catalog = await api('/api/items'); category = 'all'; el('food-search').value = ''; renderMenu(); }
    catch (err) { el('food-tiles').textContent = 'โหลดเมนูไม่สำเร็จ: ' + err.message; }
  }
  function wire() {
    document.querySelectorAll('[data-desktop-view]').forEach(b => b.onclick = () => setView(b.dataset.desktopView));
    el('restaurant-dashboard').addEventListener('click', event => {
      const table = event.target.closest('[data-scene-table], [data-room-select]');
      if (table) { selectTable(Number(table.dataset.sceneTable || table.dataset.roomSelect)); return; }
      const open = event.target.closest('[data-room-open]');
      if (open) { openSell(Number(open.dataset.roomOpen)); return; }
      const f = event.target.closest('[data-room-filter]');
      if (f) { filter = f.dataset.roomFilter; document.querySelectorAll('[data-room-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === f))); render(); }
    });
    el('scene-map').addEventListener('keydown', event => {
      const table = event.target.closest('[data-scene-table]');
      if (table && ['Enter', ' '].includes(event.key)) { event.preventDefault(); selectTable(Number(table.dataset.sceneTable), true); }
    });
    el('scene-refresh').onclick = async () => {
      el('scene-refresh').disabled = true;
      try { await loadActiveTables(); } catch (err) { toastErr(err.message); }
      finally { el('scene-refresh').disabled = false; }
    };
    el('scene-shop').onchange = () => {
      el('shop-type').value = el('scene-shop').value; shopType = Number(el('scene-shop').value); localStorage.setItem('shopType', String(shopType));
    };
    el('food-search').oninput = renderMenu;
    el('desktop-food-menu').onclick = event => {
      const c = event.target.closest('[data-food-category]');
      if (c) { category = c.dataset.foodCategory; renderMenu(); return; }
      const button = event.target.closest('[data-food-item]');
      if (!button || savingSell) return;
      const item = catalog.find(i => Number(i.ID) === Number(button.dataset.foodItem));
      if (item) { el('sell-qty').value = '1'; addToCart(item); button.classList.remove('just-added'); requestAnimationFrame(() => button.classList.add('just-added')); button.focus(); }
    };
  }
  root.RestaurantView = { scene, model, countItems, wire, setView, loadMenu, refresh(nextOrders, nextDashboard) { orders = nextOrders; dashboard = nextDashboard; render(); } };
})(globalThis);
