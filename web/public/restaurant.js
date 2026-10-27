/* A code-drawn isometric restaurant. Every number comes from the POS API. */
(function (root) {
  "use strict";
  const el = id => document.getElementById(id);
  const e = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const number = value => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const countItems = items => (items || []).filter(i => i.typeName !== "ส่วนลด").reduce((n, i) => n + Number(i.qty || 0), 0);
  const scene = (...args) => RooftopScene.scene(...args);
  function model(orders, dashboard, selected = 1) {
    const capacity = SeatPlan.entries(orders).length;
    return { capacity, active: orders.length, free: Math.max(0, capacity - orders.length), pending: orders.reduce((n, o) => n + Number(o.total || 0), 0),
      items: orders.reduce((n, o) => n + countItems(o.items), 0), selected: orders.find(o => Number(o.tableNo) === selected) || null,
      revenue: dashboard ? Number(dashboard.revenue) : null, bills: dashboard ? Number(dashboard.bills) : null };
  }
  let orders = [], dashboard = null, selected = 1, filter = "all", catalog = [], category = "all", mapKey = "", detailKey = "";
  let initialized = false, animationTimer = null, fullscreen = false, activating = false;
  const transitions = new Map();
  function animationFrames(now = Date.now()) {
    for (const [id, phase] of transitions) if (now - phase.startedAt >= 4500) transitions.delete(id);
    return Array.from(transitions.values(), phase => ({ ...phase, elapsed: (now - phase.startedAt) / 1000 }));
  }
  function refresh(nextOrders, nextDashboard) {
    const now = Date.now(), previous = new Map(orders.map(o => [o.id, o])), next = new Map(nextOrders.map(o => [o.id, o]));
    if (initialized) {
      nextOrders.forEach(order => { if (!previous.has(order.id)) transitions.set(order.id, { type: 'arriving', order, startedAt: now }); });
      orders.forEach(order => { if (!next.has(order.id)) transitions.set(order.id, { type: 'leaving', order, startedAt: now }); });
    }
    initialized = true; orders = nextOrders; dashboard = nextDashboard; render();
  }
  const icon = item => /แอลกอฮอล์/.test(item.TypeName || '') && !/ไม่มี/.test(item.TypeName || '') ? '🍹' : /อาหาร/.test(item.TypeName || '') ? '🍲' : /กาแฟ|coffee/i.test(item.Name1 || '') ? '☕' : /เครื่องดื่ม/.test(item.TypeName || '') ? '🥤' : '🍽️';
  function detail(order) {
    const qty = countItems(order?.items);
    return `<div class="selected-table-top"><span class="eyebrow">YOUR SELECTED TABLE</span><span class="table-state ${order ? 'occupied' : ''}">${order ? 'กำลังขาย' : 'พร้อมให้บริการ'}</span></div><h2>${selected >= 12 && selected <= 19 ? "บาร์" : selected >= 20 ? "โต๊ะเสริม" : "โต๊ะ"} <span>${SeatPlan.shortLabel(selected)}</span></h2>` +
      (order ? `<p class="room-customer">☺ ${e(order.cusName || 'ไม่ระบุชื่อ')}</p><p class="room-employee">ผู้เปิด: ${e(order.openedBy || order.owner || '-')}</p><div class="room-order-lines">${order.items.length ? order.items.map(i => `<div><span><b>${Number(i.qty)}</b> ${e(i.name)}</span><strong>${number(i.price)}</strong></div>`).join('') : '<p class="hint">โต๊ะเปิดแล้ว ยังไม่มีรายการสั่ง</p>'}</div><div class="room-subtotal"><span>รวม ${qty} รายการ</span><strong>฿ ${number(order.total)}</strong></div><button class="room-order-action" data-order="${e(order.id)}">ดูรายการ / รับออร์เดอร์ <span>↗</span></button><p class="room-action-hint">เพิ่มรายการและเช็คบิลในหน้ารับออร์เดอร์</p>` :
        `<div class="empty-table-art" aria-hidden="true"><span>🍽️</span><i>✦</i></div><h3 class="room-empty-title">ที่นั่งดี ๆ รอลูกค้าอยู่</h3><p class="room-empty-copy">เปิดโต๊ะ แล้วเริ่มรับออร์เดอร์แรกกันเลย</p><button class="room-order-action" data-room-open="${selected}">＋ เปิดการขาย ${e(SeatPlan.label(selected))}</button><p class="room-action-hint">ใส่ชื่อลูกค้าได้ หรือเว้นว่างก็ได้</p>`);
  }
  function render() {
    if (!el('scene-map')) return;
    const m = model(orders, dashboard, selected);
    for (const [id, value] of Object.entries({ 'scene-active': m.active, 'scene-free': `ว่างอีก ${m.free} จุด`, 'scene-pending': number(m.pending), 'scene-revenue': m.revenue === null ? '—' : number(m.revenue), 'scene-bills': m.bills === null ? '—' : m.bills, 'scene-busy-count': m.active, 'scene-item-count': m.items + ' รายการ' })) el(id).textContent = value;
    el("scene-capacity").textContent = " / " + m.capacity + " จุด";
    for (const [id, value] of Object.entries({ 'scene-today-visits': dashboard?.todayTables ?? '—', 'scene-current-visits': dashboard?.activeTables ?? orders.length,
      'scene-today-income': dashboard ? number(dashboard.dailyIncome) : '—', 'scene-today-expense': dashboard ? number(dashboard.dailyExpense) : '—' })) el(id).textContent = value;
    const phases = animationFrames();
    const nextMap = JSON.stringify([orders.map(o => [o.id, o.tableNo, o.total, o.cusName, o.guestCount]), selected, filter, phases.map(p => [p.order.id, p.type])]);
    if (nextMap !== mapKey) { el('scene-map').innerHTML = scene(orders, selected, filter, phases); el('scene-extra-tables').innerHTML = RooftopScene.extras(orders, selected, filter, m.capacity, phases); mapKey = nextMap; }
    clearTimeout(animationTimer);
    if (phases.length) animationTimer = setTimeout(render, Math.max(50, Math.min(...phases.map(p => 4500 - (Date.now() - p.startedAt)))));
    const nextDetail = JSON.stringify([m.selected, selected]);
    if (detailKey !== nextDetail) { el('scene-selected').innerHTML = detail(m.selected); detailKey = nextDetail; }
    if (el('scene-table-dialog').open && m.selected) renderCurrentBill(m.selected);
    if (el('scene-table-dialog').open && !m.selected) el('scene-table-dialog').close();
    el('scene-activity').innerHTML = orders.length ? orders.slice().sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt))).map(o => `<button class="room-feed-row" data-room-select="${o.tableNo}"><span class="feed-number">${SeatPlan.shortLabel(o.tableNo)}</span><span><strong>${e(SeatPlan.label(o.tableNo))}</strong><small>${e(o.cusName || 'ไม่ระบุชื่อ')} · ${countItems(o.items)} รายการ</small></span><b>฿ ${number(o.total)}</b></button>`).join('') : '<div class="room-feed-empty"><span>☕</span><p>วันนี้เริ่มต้นด้วยออร์เดอร์ดี ๆ<br>เปิดโต๊ะเพื่อต้อนรับลูกค้าได้เลย</p></div>';
    const buckets = Array(12).fill(0);
    for (const row of dashboard?.hourly || []) { const hour = Number(row.hour); if (Number.isInteger(hour) && hour >= 0 && hour < 24) buckets[Math.floor(((hour + 22) % 24) / 2)] += Number(row.total || 0); }
    const max = Math.max(1, ...buckets);
    el('scene-chart').innerHTML = buckets.map((value, i) => `<div class="chart-column" title="${String((i * 2 + 2) % 24).padStart(2, '0')}:00 – ${String((i * 2 + 3) % 24).padStart(2, '0')}:59 · ${dashboard ? number(value) + ' บาท' : 'ไม่มีข้อมูล'}"><div class="chart-track"><span style="height:${Math.max(3, Math.max(0, value) / max * 100)}%" class="${value > 0 ? 'has-sales' : ''}"></span></div><small>${String((i * 2 + 2) % 24).padStart(2, '0')}</small></div>`).join('');
    el('scene-popular').innerHTML = dashboard?.popular?.length ? dashboard.popular.map((p, i) => `<div class="popular-row"><span class="popular-rank">${i + 1}</span><span><strong>${e(p.name)}</strong><small>${Number(p.qty)} รายการ</small></span><b>฿ ${number(p.total)}</b></div>`).join('') : '<p class="room-no-sales">ยอดขายเมนูแรกของวัน<br>จะมาแสดงตรงนี้ ♡</p>';
    el('scene-business-date').textContent = dashboard?.date || 'ยังโหลดข้อมูลไม่ได้';
    el('scene-update').textContent = dashboard ? '● อัปเดต ' + new Date(dashboard.updatedAt).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' }) + ' · รีเฟรชทุก 15 วินาที' : 'โหลดข้อมูลยอดขายไม่สำเร็จ กดรีเฟรชเพื่อลองอีกครั้ง';
  }
  function selectTable(n, keyboard = false) {
    if (!Number.isInteger(n) || !SeatPlan.entries(orders).some(s => s.id === n)) return;
    selected = n; render();
    if (keyboard) el('scene-table-' + n)?.focus();
  }
  function renderCurrentBill(order) {
    el('scene-bill-title').textContent = 'บิลปัจจุบัน · ' + SeatPlan.label(order.tableNo);
    el('scene-bill-content').innerHTML = `<p class="scene-party-count">ลูกค้า ${GuestAnimation.count(order)} คน</p>` + detail(order).replace('data-order=', 'data-view-scene-bill=').replace('ดูรายการ / รับออร์เดอร์', 'ดูบิล');
  }
  function showCurrentBill(tableNo) {
    selected = Number(tableNo); render();
    const order = orders.find(o => Number(o.tableNo) === selected);
    if (!order) return;
    renderCurrentBill(order);
    if (!el('scene-table-dialog').open) el('scene-table-dialog').showModal();
  }
  async function activateTable(n) {
    if (activating) return;
    activating = true;
    try {
      selectTable(n);
      await loadActiveTables();
      const order = orders.find(o => Number(o.tableNo) === n);
      if (order) showCurrentBill(n);
      else await openSell(n, true);
    } catch (err) { toastErr(err.message); }
    finally { activating = false; }
  }
  function fullscreenUI(active) {
    fullscreen = active;
    document.body.classList.toggle('scene-fullscreen', active);
    el('btn-scene-fullscreen').textContent = active ? '⤢ ออกจากเต็มจอ' : '⛶ เต็มจอ';
    el('btn-scene-fullscreen').setAttribute('aria-pressed', String(active));
  }
  async function leaveFullscreen() {
    fullscreenUI(false);
    if (document.fullscreenElement) { try { await document.exitFullscreen(); } catch { /* Keep the page usable when the OS closes fullscreen. */ } }
  }
  async function toggleFullscreen() {
    if (fullscreen) { await leaveFullscreen(); return; }
    fullscreenUI(true);
    try { await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }); }
    catch { /* The same layout fills the browser window when native fullscreen is unavailable. */ }
  }
  function rememberOpened(order, stayInScene) {
    selected = Number(order.tableNo);
    if (!stayInScene) { orders = [...orders.filter(o => o.id !== order.id), order]; initialized = true; }
  }
  function reset() {
    clearTimeout(animationTimer); transitions.clear(); initialized = false; orders = []; dashboard = null; mapKey = ''; detailKey = '';
    el('scene-table-dialog').close(); void leaveFullscreen();
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
    if (!el('food-tiles')) return;
    try { catalog = await api('/api/items'); category = 'all'; el('food-search').value = ''; renderMenu(); }
    catch (err) { el('food-tiles').textContent = 'โหลดเมนูไม่สำเร็จ: ' + err.message; }
  }
  function wire() {
    document.querySelectorAll('[data-desktop-view]').forEach(b => b.onclick = () => setView(b.dataset.desktopView));
    el('restaurant-dashboard').addEventListener('click', event => {
      const table = event.target.closest('[data-scene-table], [data-room-select]');
      if (table) { void activateTable(Number(table.dataset.sceneTable || table.dataset.roomSelect)); return; }
      const open = event.target.closest('[data-room-open]');
      if (open) { void openSell(Number(open.dataset.roomOpen), true); return; }
      const f = event.target.closest('[data-room-filter]');
      if (f) { filter = f.dataset.roomFilter; document.querySelectorAll('[data-room-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === f))); render(); }
    });
    el('scene-map').addEventListener('keydown', event => {
      const table = event.target.closest('[data-scene-table]');
      if (table && ['Enter', ' '].includes(event.key)) { event.preventDefault(); void activateTable(Number(table.dataset.sceneTable)); }
    });
    el('btn-scene-fullscreen').onclick = toggleFullscreen;
    el('btn-close-scene-bill').onclick = () => el('scene-table-dialog').close();
    el('scene-table-dialog').addEventListener('click', async event => {
      const bill = event.target.closest('[data-view-scene-bill]');
      if (!bill) return;
      el('scene-table-dialog').close(); await leaveFullscreen(); await openTable(bill.dataset.viewSceneBill);
    });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) fullscreenUI(false); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && fullscreen && !document.fullscreenElement && !el('cus-overlay').open && !el('scene-table-dialog').open) void leaveFullscreen();
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
      if (item) { el('sell-qty').value = '1'; addToCart(item, false); button.classList.remove('just-added'); requestAnimationFrame(() => button.classList.add('just-added')); button.focus({ preventScroll: true }); }
    };
  }
  root.RestaurantView = { scene, extras: RooftopScene.extras, model, countItems, wire, setView, loadMenu, refresh, rememberOpened, showCurrentBill, leaveFullscreen, reset, animationFrames };
})(globalThis);
