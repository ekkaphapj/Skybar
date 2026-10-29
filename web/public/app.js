/* The Cottage Sky Bar POS - web frontend (parity of the original WinForms app) */
"use strict";

const $ = (id) => document.getElementById(id);
const fmt2 = (n) => Number(n || 0).toFixed(2);
const discountAmount = (total, fractionToPay) => Math.max(0, Math.trunc(Math.round((total * (1 - fractionToPay) + Number.EPSILON) * 100) / 100));

/* ---------------- api helper ---------------- */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) {
    if (res.status === 401) { currentUser = null; location.hash = "#/login"; throw new Error(data?.error || "กรุณาเข้าสู่ระบบ"); }
    throw new Error(data?.error || "เกิดข้อผิดพลาด (" + res.status + ")");
  }
  return data;
}

function toast(msg, ok = true) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast " + (ok ? "ok" : "err");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.add("hidden"), 3500);
}
function toastErr(msg) { toast(msg, false); }

/* ---------------- business date (client, same rule as server) ---------------- */
function businessDate(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
  }).formatToParts(now);
  const get = (t) => Number(p.find((x) => x.type === t).value);
  let y = get("year"), m = get("month"), d = get("day");
  if (get("hour") < 2) {
    const dt = new Date(Date.UTC(y, m - 1, d) - 86400000);
    y = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
  }
  return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

/* ---------------- shared state ---------------- */
let META = { sellers: [], paymentTypes: [], shopTypes: [] };
let currentUser = null;
let staffUsers = [];
let shopType = Number(localStorage.getItem("shopType") || 0);
let itemTypes = [];

function applyIdentity(st) {
  META = st; currentUser = st.user || null;
  const names = currentUser ? [currentUser.displayName] : [];
  for (const id of ["sell-seller", "st-owner", "ai-owner"]) { fillSelect($(id), names); $(id).value = names[0] || ""; $(id).disabled = true; }
  $("btn-logout").classList.toggle("hidden", !currentUser);
  $("sidebar-user").textContent = currentUser ? currentUser.displayName + (currentUser.role === "admin" ? " · ผู้ดูแลระบบ" : " · พนักงาน") : "";
  $("current-user-name").textContent = currentUser ? "ผู้ใช้งาน: " + currentUser.displayName : "";
  document.querySelectorAll("[data-admin-only]").forEach(el => el.classList.toggle("hidden", currentUser?.role !== "admin"));
  resetReport();
  tableLoadVersion++;
  if (typeof RestaurantView !== "undefined") RestaurantView.reset?.();
}
async function loadMeta() { const st = await api("/api/auth/status"); applyIdentity(st); return st; }
function fillSelect(sel, items, keepBlank = false) {
  const cur = sel.value;
  sel.innerHTML = (keepBlank ? "<option value=''>— เลือก —</option>" : "") +
    items.map((x) => `<option>${esc(x)}</option>`).join("");
  if (cur && items.includes(cur)) sel.value = cur;
}
async function loadItemTypes() {
  itemTypes = await api("/api/item-types");
  fillSelect($("sell-type"), itemTypes.map((t) => t.Name1), true);
  fillSelect($("stock-type"), itemTypes.map((t) => t.Name1), true);
  $("ai-type").innerHTML = itemTypes.map((t) => `<option value="${t.ID}">${esc(t.Name1)}</option>`).join("");
}

/* ---------------- router ---------------- */
const views = ["login", "main", "sell", "stock", "cash", "additem", "report", "receipt", "voucher", "history", "users"];
function navigate(name) { location.hash = "#/" + name; }
let currentView = "";
async function route() {
  const name = (location.hash || "#/main").replace("#/", "");
  if (savingSell && name !== "sell") { navigate("sell"); return; }
  if (name !== "main") await RestaurantView.leaveFullscreen();
  if (currentView === "sell" && name !== "sell" && name !== "login" && activeOrder) {
    try { await flushOrder(); }
    catch (e) { toastErr(e.message); navigate("sell"); return; }
  }
  if (name !== "login" && !currentUser) { navigate("login"); return; }
  if (name === "users" && currentUser?.role !== "admin") { navigate("main"); return; }
  const authRequired = META.required;
  if (authRequired && name !== "login" && !sessionStorage.getItem("authed")) {
    // still allow views to attempt load; api() will bounce to login on 401
  }
  views.forEach((v) => $("view-" + v).classList.toggle("hidden", v !== name));
  currentView = name;
  window.scrollTo({ top: 0, behavior: "instant" });
  document.body.dataset.view = name;
  $("app-sidebar").classList.toggle("hidden", name === "login");
  $("mobile-nav").classList.toggle("hidden", name === "login");
  document.querySelectorAll(".app-sidebar [data-nav], .mobile-nav [data-nav]").forEach((button) => {
    if (button.dataset.nav === name) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  try {
  if (name === "main") await initMain();
  if (name === "sell") await initSell();
  if (name === "stock") initStock();
  if (name === "cash") initCash();
  if (name === "additem") initAddItem();
  if (name === "report") initReport();
  if (name === "receipt") initReceiptView();
  if (name === "voucher") initVoucher();
  if (name === "history") await loadHistory();
  if (name === "users") await loadStaffUsers();
  if (name === "login") $("username-input").focus();
  } catch (e) { toastErr(e.message); }
}

/* ---------------- login ---------------- */
let loggingIn = false;
async function tryLogin() {
  if (loggingIn) return;
  loggingIn = true;
  $("login-btn").disabled = true;
  const pin = $("pin-input").value;
  try {
    await api("/api/login", { method: "POST", body: { username: $("username-input").value.trim(), password: pin } });
    $("pin-input").value = "";
    sessionStorage.setItem("authed", "1");
    $("login-error").textContent = "";
    await loadMeta();
    navigate("main");
  } catch (e) { $("login-error").textContent = e.message; }
  finally { loggingIn = false; $("login-btn").disabled = false; }
}

/* ---------------- main menu ---------------- */
async function initMain() {
  $("shop-type").value = String(shopType);
  refreshPrinterUI();
  RestaurantView.setView(localStorage.getItem("pos_desktop_view") || "scene");
  $("scene-shop").value = String(shopType);
  await loadActiveTables();
  if (printerSettingsRequested) { printerSettingsRequested = false; showPrinterSettings(); }
}
let printerSettingsRequested = false;
function showPrinterSettings() {
  $("printer-settings").open = true;
  $("printer-settings").scrollIntoView({ behavior: "smooth", block: "start" });
}
function openPrinterSettings() {
  if (currentView === "main") showPrinterSettings();
  else { printerSettingsRequested = true; navigate("main"); }
}
let activeTables = [];
let tableLoadVersion = 0;
async function loadActiveTables() {
  const version = ++tableLoadVersion;
  const [orders, dashboard] = await Promise.all([api("/api/orders"), api("/api/dashboard").catch(() => null)]);
  if (version !== tableLoadVersion) return;
  activeTables = orders;
  RestaurantView.refresh(orders, dashboard);
  $("active-table-count").textContent = activeTables.length + " โต๊ะ";
  $("summary-active").innerHTML = activeTables.length + " <small>โต๊ะ</small>";
  $("summary-free").innerHTML = (20 - activeTables.length) + " <small>โต๊ะ</small>";
  $("summary-total").innerHTML = fmt2(activeTables.reduce((sum, order) => sum + Number(order.total || 0), 0)) + " <small>บาท</small>";
  $("active-tables").innerHTML = activeTables.length ? activeTables.map((order) =>
    `<button class="btn table-tile" data-order="${esc(order.id)}"><strong>${esc(SeatPlan.label(order.tableNo))}</strong><span>${esc(order.cusName || "ไม่ระบุชื่อ")}</span><small>${order.items.length} รายการ · ${fmt2(order.total)} บาท</small></button>`
  ).join("") : '<div class="empty-tables"><span class="empty-icon">▦</span><strong>พร้อมต้อนรับลูกค้า</strong><p>ยังไม่มีโต๊ะเปิดการขาย เริ่มต้นโต๊ะแรกได้เลย</p><button class="btn primary" data-open-sale>＋ เปิดการขาย</button></div>';
}
function askCustomerName(preferredTable = null) {
  return new Promise((resolve) => {
    const dialog = $("cus-overlay");
    const form = $("cus-card");
    const input = $("cus-input");
    input.value = "";
    $("cus-guests").value = "1";
    const busy = new Set(activeTables.map((order) => Number(order.tableNo)));
    $("cus-table").innerHTML = '<option value="">— เลือกโต๊ะ —</option>' +
      Array.from({ length: 20 }, (_, i) => `<option value="${i + 1}"${busy.has(i + 1) ? " disabled" : ""}>${esc(SeatPlan.label(i + 1))}${busy.has(i + 1) ? " (กำลังขาย)" : ""}</option>`).join("");
    $("cus-table").value = "";
    if (Number.isInteger(preferredTable) && preferredTable >= 1 && preferredTable <= 20 && !busy.has(preferredTable)) $("cus-table").value = String(preferredTable);
    $("cus-error").classList.add("hidden");
    const map = $("cus-seat-map"), viewport = $("cus-seat-map-viewport"), mapButton = $("btn-show-seat-map");
    let mapActive = true;
    const hideMap = () => { map.classList.add("hidden"); mapButton.setAttribute("aria-expanded", "false"); mapButton.textContent = "🗺️ ดูผังโต๊ะและเลือกโต๊ะ"; };
    hideMap();
    mapButton.onclick = async () => {
      if (mapButton.disabled) return;
      if (mapButton.getAttribute("aria-expanded") === "true") { hideMap(); return; }
      mapButton.disabled = true;
      try {
        await loadActiveTables();
        if (!mapActive) return;
        busy.clear(); activeTables.forEach(order => busy.add(Number(order.tableNo)));
        for (const option of $("cus-table").options) if (option.value) {
          const n = Number(option.value); option.disabled = busy.has(n);
          option.textContent = SeatPlan.label(n) + (busy.has(n) ? " (กำลังขาย)" : "");
        }
        if (busy.has(Number($("cus-table").value))) $("cus-table").value = "";
        const selected = Number($("cus-table").value) || 0;
        viewport.innerHTML = RooftopScene.scene(activeTables, selected).replace('viewBox="50 -160 1350 1010"', 'viewBox="90 130 1220 610"')
          .replaceAll('id="scene-table-', 'id="mobile-seat-').replaceAll('id="rooftop-', 'id="mobile-rooftop-').replaceAll('url(#rooftop-', 'url(#mobile-rooftop-');
        $("cus-seat-map-status").textContent = selected ? "เลือกอยู่: " + SeatPlan.label(selected) : "แตะโต๊ะว่างเพื่อเลือก";
        map.classList.remove("hidden"); mapButton.setAttribute("aria-expanded", "true"); mapButton.textContent = "ซ่อนผังโต๊ะ";
      } catch (e) { if (mapActive) toastErr(e.message); }
      finally { if (mapActive) mapButton.disabled = false; }
    };
    $("btn-close-seat-map").onclick = hideMap;
    const selectMapSeat = target => {
      const seat = target.closest("[data-scene-table]");
      if (!seat) return;
      const n = Number(seat.dataset.sceneTable);
      if (!Number.isInteger(n) || n < 1 || n > SeatPlan.capacity) return;
      if (busy.has(n)) { $("cus-seat-map-status").textContent = SeatPlan.label(n) + " กำลังขาย กรุณาเลือกโต๊ะว่าง"; return; }
      $("cus-table").value = String(n);
      $("cus-error").classList.add("hidden");
      hideMap();
    };
    viewport.onclick = event => selectMapSeat(event.target);
    viewport.onkeydown = event => {
      if (["Enter", " "].includes(event.key) && event.target.closest("[data-scene-table]")) {
        event.preventDefault(); selectMapSeat(event.target);
      }
    };
    // Native modal focus is established by the browser. Refocusing from a card
    // click interferes with text selection and IME input in embedded browsers.
    const done = (name) => {
      form.onsubmit = null;
      dialog.oncancel = null;
      $("btn-cus-cancel").onclick = null;
      mapActive = false; mapButton.disabled = false;
      mapButton.onclick = null; $("btn-close-seat-map").onclick = null; viewport.onclick = null; viewport.onkeydown = null;
      hideMap(); viewport.innerHTML = "";
      dialog.close();
      resolve(name);
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      const v = input.value.trim();
      const tableNo = Number($("cus-table").value);
      if (!Number.isInteger(tableNo) || tableNo < 1 || tableNo > 20 || busy.has(tableNo)) { $("cus-error").classList.remove("hidden"); $("cus-table").focus(); return; }
      const guestCount = Number($("cus-guests").value || 1);
      if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 5) { toastErr("เลือกจำนวนลูกค้า 1–5 คน"); return; }
      done({ tableNo, cusName: v, guestCount });
    };
    $("btn-cus-cancel").onclick = () => done(null);
    dialog.oncancel = (event) => { event.preventDefault(); done(null); };
    dialog.showModal();
  });
}
async function openSell(preferredTable = null, stayInScene = false) {
  if (openingOrder) return;
  openingOrder = true;
  try {
  await flushOrder();
  shopType = Number($("shop-type").value);
  localStorage.setItem("shopType", String(shopType));
  await loadActiveTables();
  const selection = await askCustomerName(preferredTable);
  if (!selection) return;
  const order = await api("/api/orders", { method: "POST", body: { ...selection, shopType } });
  RestaurantView.rememberOpened(order, stayInScene);
  if (stayInScene) { await loadActiveTables(); toast("เปิด " + SeatPlan.label(order.tableNo) + " · ลูกค้า " + (order.guestCount || 1) + " คน"); return; }
  sessionStorage.setItem("selectedOrder", order.id);
  if (currentView === "sell") await initSell();
  else navigate("sell");
  } catch (e) { toastErr(e.message); }
  finally { openingOrder = false; }
}
let openingOrder = false;

async function openTable(id) {
  sessionStorage.setItem("selectedOrder", id);
  navigate("sell");
}

let activeOrder = null;
let orderSaveQueue = Promise.resolve();
let orderSaveError = null;
let pendingOrderSaves = 0;
function queueOrderSave() {
  if (!activeOrder || activeOrder.status !== "open") return Promise.resolve();
  const id = activeOrder.id;
  const snapshot = {
    items: cart.map((line) => ({ itemID: line.itemID, qty: line.qty })),
    cusName: $("sell-cus").value, owner: $("sell-seller").value, roomNo: $("sell-room").value,
  };
  pendingOrderSaves++;
  $("order-save-status").textContent = "กำลังบันทึกรายการโต๊ะ…";
  const save = orderSaveQueue.then(async () => {
    if (orderSaveError) throw orderSaveError;
    const result = await api("/api/orders/" + encodeURIComponent(id), { method: "PUT", body: { ...snapshot, revision: activeOrder.revision } });
    activeOrder.revision = result.revision;
    activeOrder.cusName = snapshot.cusName;
    activeOrder.items = result.items;
    activeOrder.total = result.total;
  });
  orderSaveQueue = save.catch((e) => {
    orderSaveError = e;
    toastErr(e.message);
  }).finally(() => {
    pendingOrderSaves--;
    $("order-save-status").textContent = orderSaveError ? "บันทึกไม่สำเร็จ กรุณาโหลดโต๊ะใหม่" : pendingOrderSaves ? "กำลังบันทึกรายการโต๊ะ…" : "บันทึกรายการโต๊ะแล้ว";
  });
  return orderSaveQueue;
}
async function flushOrder() {
  await orderSaveQueue;
  if (orderSaveError) throw orderSaveError;
}
async function closeOrderView() {
  try { if (activeOrder) queueOrderSave(); await flushOrder(); activeOrder = null; sessionStorage.removeItem("selectedOrder"); navigate("main"); }
  catch (e) { toastErr(e.message); }
}
async function reloadOrder() {
  if (orderSaveError && !confirm("โหลดข้อมูลล่าสุดจากระบบ? รายการในหน้าจอที่ยังบันทึกไม่สำเร็จจะถูกแทนที่")) return;
  await orderSaveQueue;
  orderSaveError = null;
  await initSell();
}

let historyOffset = 0;
async function loadHistory() {
  const from = $("history-from").value, to = $("history-to").value;
  if (from && to && from > to) { toastErr("เลือกวันที่ไม่ถูกต้อง"); return; }
  const data = await api(`/api/orders/history?from=${from}&to=${to}&offset=${historyOffset}`);
  $("history-rows").innerHTML = data.orders.map((order) => `<tr><td data-label="โต๊ะ">${esc(SeatPlan.label(order.tableNo))}</td><td data-label="ลูกค้า">${esc(order.cusName || "-")}</td><td data-label="เช็คบิลเมื่อ">${esc(order.date)} ${esc(order.receipt?.time || "")}</td><td data-label="ผู้เช็คบิล">${esc(order.closedBy || order.owner || "-")}</td><td data-label="ชำระโดย">${esc(order.paymentType)}</td><td data-label="ยอดรวม">${fmt2(order.total)} บาท</td><td><button class="btn" data-history-order="${esc(order.id)}">ดูรายการ / ใบเสร็จ</button> ${deleteButton("data-delete-bill", order.billID, "ลบบิล")}</td></tr>`).join("");
  $("history-empty").textContent = data.orders.length ? "" : "ยังไม่มีประวัติการขายในช่วงที่เลือก";
  $("history-page").textContent = "หน้า " + (historyOffset / 50 + 1);
  $("btn-history-prev").disabled = historyOffset === 0;
  $("btn-history-next").disabled = !data.hasMore;
}
function receiptFromSale(sale) {
  return { paid: true, bill: sale.billID, date: sale.date + " " + sale.time, pay: sale.paymentType,
    owner: sale.owner, cus: sale.cusName, tableNo: sale.tableNo, shopType: sale.shopType, lines: sale.lines, total: sale.total, copies: 1 };
}
async function showHistoryOrder(id) {
  const order = await api("/api/orders/" + encodeURIComponent(id));
  if (order.receipt) showReceipt(receiptFromSale(order.receipt));
}

/* ---------------- sell (POS) ---------------- */
let cart = []; // {itemID, name, qty, price, typeName}
let voucherOk = false;

async function initSell() {
  const id = sessionStorage.getItem("selectedOrder");
  if (!id) { navigate("main"); return; }
  await flushOrder();
  const order = await api("/api/orders/" + encodeURIComponent(id));
  if (order.status !== "open") { activeOrder = null; navigate("history"); return; }
  activeOrder = order;
  orderSaveError = null;
  shopType = order.shopType;
  $("sell-bizdate").textContent = businessDate();
  const isSky = shopType === 0;
  $("sell-shopname").textContent = isSky ? "THE COTTAGE SKY BAR" : "THE COTTAGE MINI MART";
  $("sell-cusname").textContent = SeatPlan.label(order.tableNo);
  $("sell-party-size").textContent = (order.guestCount || 1) + " คน";
  $("btn-print-bill").classList.toggle("hidden", !isSky);
  // qty options 1-20 (same as original)
  if (!$("sell-qty").options.length)
    $("sell-qty").innerHTML = Array.from({ length: 20 }, (_, i) => `<option>${i + 1}</option>`).join("");
  if ($("sell-type").options.length <= 1) await loadItemTypes();
  resetSell(false);
  cart = order.items;
  $("sell-billid").value = order.billID;
  $("sell-cus").value = order.cusName;
  $("sell-room").value = order.roomNo || "";
  $("sell-seller").value = currentUser?.displayName || "";
  $("manual-item-entry").open = window.matchMedia("(min-width:851px)").matches;
  $("order-save-status").textContent = "บันทึกรายการโต๊ะแล้ว";
  renderCart();
  await RestaurantView.loadMenu();
}

function resetSell(clearSeller = false) {
  cart = [];
  voucherOk = false;
  $("sell-billid").value = "";
  $("sell-cart").querySelector("tbody").innerHTML = "";
  $("sell-total").textContent = "0.00";
  $("sell-count").textContent = "0 รายการ";
  $("sell-barcode").value = "";
  $("sell-type").selectedIndex = 0;
  $("sell-item").innerHTML = "";
  $("sell-price").value = "";
  $("sell-remain").value = "";
  $("sell-qty").selectedIndex = 0;
  $("sell-payment").selectedIndex = 0;
  $("sell-received").value = "";
  $("sell-change").value = "";
  $("sell-voucher").value = "";
  $("sell-room").value = "";
  $("sell-cus").value = shopType === 0 ? (sessionStorage.getItem("cusName") || "") : "";
  onPaymentChange();
  renderCart();
}

function renderCart() {
  // Keep the preview identical to the server after an earlier item is removed.
  let running = 0;
  for (const line of cart) {
    line.price = line.typeName === "ส่วนลด"
      ? -discountAmount(running, line.unitPrice)
      : Math.round(line.qty * line.unitPrice * 100) / 100;
    running = Math.round((running + line.price) * 100) / 100;
  }
  const tb = $("sell-cart").querySelector("tbody");
  tb.innerHTML = cart
    .map(
      (l, i) => `<tr>
        <td>${esc(l.name)}</td>
        <td class="num">${l.qty}</td>
        <td class="num">${fmt2(l.price)}</td>
        <td><button class="del" data-i="${i}" title="ลบรายการ">✕</button></td>
      </tr>`
    )
    .join("");
  const total = cart.reduce((s, l) => s + l.price, 0);
  $("sell-total").textContent = fmt2(total);
  $("mobile-order-total").textContent = fmt2(total);
  $("sell-count").textContent = cart.length + " รายการ";
}
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML.replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }

function addToCart(item, focusBarcode = true) {
  if (savingSell) return;
  const qty = Number($("sell-qty").value) || 1;
  const total = cart.reduce((s, l) => s + l.price, 0);
  if (item.TypeName === "ส่วนลด") {
    // price is the fraction to pay (e.g. 0.9 = 10% off current total); qty forced to 1 like the original
    const disc = discountAmount(total, Number(item.Price));
    cart.push({ itemID: item.ID, name: item.Name1, qty: 1, price: -disc, unitPrice: Number(item.Price), typeName: item.TypeName });
  } else {
    cart.push({ itemID: item.ID, name: item.Name1, qty, price: Math.round(qty * Number(item.Price) * 100) / 100, unitPrice: Number(item.Price), typeName: item.TypeName });
  }
  $("sell-qty").selectedIndex = 0;
  $("sell-type").selectedIndex = 0;
  $("sell-item").innerHTML = "";
  $("sell-price").value = "";
  $("sell-remain").value = "";
  $("sell-barcode").value = "";
  voucherOk = false;
  renderCart();
  if (focusBarcode) $("sell-barcode").focus();
  queueOrderSave();
}

function onPaymentChange() {
  const p = $("sell-payment").value;
  const isCash = p === "เงินสด", isVc = p === "Voucher";
  $("wrap-received").classList.toggle("hidden", !isCash);
  $("wrap-change").classList.toggle("hidden", !isCash);
  $("wrap-voucher").classList.toggle("hidden", !isVc);
  $("btn-check-voucher").classList.toggle("hidden", !isVc);
  if (!isVc) { voucherOk = false; $("sell-total").textContent = fmt2(cart.reduce((s, l) => s + l.price, 0)); }
}

async function checkVoucher() {
  const id = $("sell-voucher").value.trim();
  if (!id) { toastErr("ใส่รหัส Voucher"); return; }
  const r = await api("/api/vouchers/check/" + encodeURIComponent(id));
  if (!r.ok) { voucherOk = false; toastErr("คูปองไม่สามารถใช้ได้"); return; }
  if (cart.length !== 1 || cart[0].qty !== 1 || cart[0].typeName === "ส่วนลด") { voucherOk = false; toastErr("ใช้ Voucher ได้กับสินค้า 1 ชิ้นเท่านั้น"); return; }
  const total = cart.reduce((s, l) => s + l.price, 0);
  if (total > 30) { voucherOk = false; toastErr("ใช้ได้กับเครื่องดื่มไม่มีแอลกอฮอล์เท่านั้น (ราคาเกินกำหนด)"); return; }
  voucherOk = true;
  $("sell-total").textContent = "0.00";
  toast("คูปองใช้ได้");
}

let savingSell = false;
async function cancelOrder() {
  if (savingSell || !activeOrder) return;
  const order = activeOrder;
  if (!confirm(`แน่ใจหรือไม่ว่าต้องการยกเลิกการขาย ${SeatPlan.label(order.tableNo)}?\nรายการทั้งหมดในบิลนี้จะถูกลบ และไม่บันทึกเป็นยอดขาย`)) return;
  savingSell = true;
  $("view-sell").inert = true;
  $("app-sidebar").inert = true;
  $("mobile-nav").inert = true;
  try {
    await flushOrder();
    await api("/api/orders/" + encodeURIComponent(order.id) + "/cancel", {
      method: "POST", body: { revision: order.revision },
    });
    activeOrder = null;
    sessionStorage.removeItem("selectedOrder");
    resetSell(false);
    toast("ยกเลิกการขาย " + SeatPlan.label(order.tableNo) + " แล้ว");
    navigate("main");
  } catch (e) { toastErr(e.message); }
  finally {
    savingSell = false;
    $("view-sell").inert = false;
    $("app-sidebar").inert = false;
    $("mobile-nav").inert = false;
  }
}
async function saveSell() {
  if (savingSell) return;
  if (!activeOrder) { toastErr("เปิดโต๊ะก่อน"); return; }
  if (cart.length < 1) { toastErr("ไม่มีรายการสินค้า"); return; }
  const paymentType = $("sell-payment").value;
  if (paymentType === "Voucher" && !voucherOk) { toastErr("ตรวจสอบคูปองก่อน"); return; }
  savingSell = true;
  $("app-sidebar").inert = true;
  $("mobile-nav").inert = true;
  $("btn-save-sell").disabled = true;
  $("view-sell").inert = true;
  try {
    queueOrderSave();
    await flushOrder();
    const res = await api("/api/orders/" + encodeURIComponent(activeOrder.id) + "/checkout", {
      method: "POST",
      body: {
        revision: activeOrder.revision,
        paymentType,
        voucherId: paymentType === "Voucher" ? $("sell-voucher").value : null,
      },
    });
    lastReceipt = receiptFromSale(res);
    activeOrder = null;
    sessionStorage.removeItem("selectedOrder");
    await showCheckoutSuccess(lastReceipt);
    $("receipt-overlay").classList.add("hidden");
    resetSell(false);
    navigate("main");
  } catch (e) { toastErr(e.message); }
  finally { savingSell = false; $("btn-save-sell").disabled = false; $("view-sell").inert = false; $("app-sidebar").inert = false; $("mobile-nav").inert = false; }
}

function showCheckoutSuccess(receipt) {
  return new Promise((resolve) => {
    const dialog = $("checkout-result");
    $("checkout-result-message").textContent = `${SeatPlan.label(receipt.tableNo || "-")} · ${fmt2(receipt.total)} บาท · บันทึกการขายแล้ว`;
    $("checkout-print-status").textContent = "เลือกพิมพ์ทีละใบ ตัดกระดาษก่อนกดพิมพ์สำเนา หรือกลับหน้าหลักได้โดยไม่พิมพ์";
    $("btn-checkout-print").onclick = () => printSingleReceipt(receipt, false, "checkout-print-status");
    $("btn-checkout-copy").onclick = () => printSingleReceipt(receipt, true, "checkout-print-status");
    const done = () => {
      if (receiptPrintBusy) return;
      dialog.close(); dialog.oncancel = null; $("checkout-result-form").onsubmit = null;
      $("btn-checkout-print").onclick = null; $("btn-checkout-copy").onclick = null; resolve();
    };
    $("checkout-result-form").onsubmit = (event) => { event.preventDefault(); done(); };
    dialog.oncancel = (event) => { event.preventDefault(); done(); };
    dialog.showModal();
  });
}

function printBillPreview() {
  if (!$("sell-billid").value) { toastErr("ปริ๊มได้เฉพาะร้าน Sky bar และต้องเปิดการขายก่อน"); return; }
  if (cart.length < 1) { toastErr("ไม่มีรายการสินค้า"); return; }
  showReceipt({
    paid: false, bill: $("sell-billid").value, date: new Date().toLocaleString("th-TH"),
    pay: "-", cus: $("sell-cus").value, owner: currentUser?.displayName,
    tableNo: activeOrder?.tableNo, shopType, copies: 1,
    lines: cart.map((l) => ({ name: l.name, qty: l.qty, price: l.price })),
    total: cart.reduce((s, l) => s + l.price, 0),
  });
  printReceiptNow(lastReceipt).catch((e) => toastErr(e.message));
}

/* ---------------- receipt modal + printing ---------------- */
let lastReceipt = null;
let receiptPrintBusy = false;
async function printSingleReceipt(receipt, isCopy = false, statusID = "receipt-print-status") {
  if (!receipt || receiptPrintBusy) return;
  receiptPrintBusy = true;
  const controls = ["btn-checkout-print", "btn-checkout-copy", "btn-checkout-done", "btn-print-receipt", "btn-print-copy", "btn-close-receipt"];
  controls.forEach(id => { $(id).disabled = true; });
  $(statusID).textContent = isCopy ? "กำลังเตรียมสำเนา 1 ใบ…" : "กำลังเตรียมใบเสร็จ 1 ใบ…";
  try {
    const result = await printReceiptNow({ ...receipt, isCopy }, false, 1, `${isCopy ? "copy" : "receipt"}:${crypto.randomUUID()}`);
    $(statusID).textContent = (result?.message || "ส่งงานพิมพ์แล้ว") + " · ตัดกระดาษใบนี้ก่อนพิมพ์ใบถัดไป";
  } catch (e) { $(statusID).textContent = "พิมพ์ไม่สำเร็จ: " + e.message + " · ตรวจเครื่องพิมพ์ก่อนกดพิมพ์ใหม่"; }
  finally { receiptPrintBusy = false; controls.forEach(id => { $(id).disabled = false; }); }
}
function showReceipt(rc) {
  lastReceipt = rc;
  $("r-shop").textContent = (rc.shopType ?? shopType) === 0 ? "THE COTTAGE SKY BAR" : "THE COTTAGE MINI MART";
  $("r-bill").textContent = rc.bill;
  $("r-date").textContent = rc.date;
  $("r-pay").textContent = rc.pay;
  $("r-cus").textContent = rc.cus || "-";
  $("r-table").textContent = rc.tableNo ? SeatPlan.shortLabel(rc.tableNo) : "-";
  $("r-table-line").classList.toggle("hidden", !rc.tableNo);
  $("btn-print-receipt").textContent = rc.paid ? "พิมพ์ใบเสร็จ" : "พิมพ์บิล";
  $("btn-print-copy").classList.toggle("hidden", !rc.paid);
  $("receipt-print-status").textContent = "พิมพ์ครั้งละ 1 ใบ ตัดกระดาษก่อนพิมพ์ใบถัดไป";
  $("r-items").innerHTML = rc.lines
    .map((l) => `<div class="r-item"><span>${esc(l.name)}</span><span>${l.qty}</span><span>${fmt2(l.price)}</span></div>`)
    .join("");
  $("r-total").textContent = fmt2(rc.total);
  $("r-thanks").textContent = rc.paid ? "ชำระแล้ว" : "ขอบคุณค่ะ / THANK YOU";
  $("receipt-overlay").classList.remove("hidden");
  $("r-raster").classList.add("hidden");
  $("receipt-text").classList.remove("hidden");
  Receipt58.render(receiptPayload(rc), 1, 1, Number(localStorage.getItem("pos_paper_width") || 58)).then((canvas) => {
    if (lastReceipt !== rc) return;
    $("r-raster").src = canvas.toDataURL("image/png");
    $("r-raster").classList.remove("hidden");
    $("receipt-text").classList.add("hidden");
  }).catch((e) => toastErr("สร้างภาพใบเสร็จไม่สำเร็จ: " + e.message));
}

/* ---------------- stock ---------------- */
async function initStock() {
  if ($("stock-type").options.length <= 1) await loadItemTypes();
  $("st-date").value = businessDate();
}
async function loadStockTable() {
  if (!$("stock-type").value) { toastErr("เลือกประเภทสินค้า"); return; }
  const rows = await api("/api/stock?typeName=" + encodeURIComponent($("stock-type").value));
  $("stock-table").querySelector("tbody").innerHTML = rows
    .map(
      (r) => `<tr class="clickable" data-id="${r.itemCode}" data-name="${esc(r.name)}">
        <td data-label="รหัส">${r.itemCode}</td><td data-label="สินค้า">${esc(r.name)}</td><td data-label="คงเหลือ" class="num">${r.amount}</td>
        <td data-label="วันที่">${r.date || "-"}</td><td data-label="เวลา">${r.time || "-"}</td></tr>`
    )
    .join("");
}
function onStockActionChange() {
  const a = $("st-action").value;
  const isPurchase = a === "purchase", isLoss = a === "loss";
  $("st-price").disabled = isLoss;
  if (isLoss) $("st-price").value = "0";
  $("st-payment").disabled = isLoss;
  $("st-place").disabled = !isPurchase;
  $("st-date").disabled = !isPurchase;
  $("st-amount").disabled = a === "expense" || a === "income";
  $("st-itemid").disabled = !isPurchase && !isLoss;
  $("st-itemname").disabled = !isPurchase && !isLoss;
  $("st-price-label").textContent = isLoss ? "ราคา (บาท)" : (isPurchase ? "ราคารวม (บาท)" : "จำนวนเงิน (บาท)");
}
async function saveStockTx() {
  const action = $("st-action").value;
  const body = {
    action,
    owner: $("st-owner").value,
    itemID: $("st-itemid").value,
    amount: $("st-amount").value,
    price: $("st-price").value,
    paymentType: $("st-payment").value,
    place: $("st-place").value,
    comment: $("st-comment").value,
    date2: $("st-date").value,
  };
  try {
    await api("/api/stock/transaction", { method: "POST", body });
    toast("บันทึกรายการเรียบร้อย");
    $("st-itemid").value = ""; $("st-itemname").value = ""; $("st-amount").value = "";
    $("st-price").value = ""; $("st-comment").value = "";
    if ($("stock-type").value) loadStockTable();
  } catch (e) { toastErr(e.message); }
}

/* ---------------- cash deposit ---------------- */
async function initCash() {
  const r = await api("/api/cash/total");
  $("cash-total").textContent = fmt2(r.total) + " บาท";
  $("deposit-amount").value = "";
  $("cash-after").textContent = "-";
}
async function saveDeposit() {
  const amt = Number($("deposit-amount").value);
  const cur = parseFloat($("cash-total").textContent) || 0;
  if (!(amt > 0)) { toastErr("ใส่จำนวนเงินไม่ถูกต้อง"); return; }
  if (amt > cur) { toastErr("ตัดจ่ายมากกว่าเงินที่มีไม่ได้"); return; }
  try {
    await api("/api/cash/deposit", { method: "POST", body: { amount: amt } });
    toast("ทำการบันทึกการตัดจ่ายเงินสดเรียบร้อยแล้ว");
    initCash();
  } catch (e) { toastErr(e.message); }
}

/* ---------------- add item ---------------- */
async function initAddItem() {
  if ($("ai-type").options.length <= 1) await loadItemTypes();
}
async function saveItem() {
  try {
    const res = await api("/api/items", {
      method: "POST",
      body: {
        name: $("ai-name").value,
        itemTypeId: Number($("ai-type").value) || undefined,
        price: $("ai-price").value,
        amount: $("ai-amount").value || "0",
        owner: $("ai-owner").value,
        id: $("ai-id").value || undefined,
      },
    });
    toast("บันทึกรายการสินค้าสำเร็จ (รหัส " + res.id + ")");
    $("ai-name").value = ""; $("ai-id").value = ""; $("ai-price").value = ""; $("ai-amount").value = "0";
    loadItemTypes();
  } catch (e) { toastErr(e.message); }
}


/* ---------------- report ---------------- */
let reportIdentity = null;
let dailyReportFiles = [];
let dailyReportUrls = [];
let reportGeneration = 0;
let reportRequest = 0;
function clearReportImages() {
  $("btn-download-report-all").disabled = true;
  dailyReportUrls.forEach(url => URL.revokeObjectURL(url));
  dailyReportUrls = []; dailyReportFiles = [];
  $("report-image-preview").innerHTML = "";
  if ($("report-image-dialog").open) $("report-image-dialog").close();
}
function resetReport() {
  reportGeneration++; reportRequest++;
  reportIdentity = null;
  $("rp-from").value = ""; $("rp-to").value = "";
  $("report-body").classList.add("hidden");
  document.querySelectorAll("#report-body b").forEach(el => { el.textContent = "-"; });
  document.querySelectorAll("#report-body tbody").forEach(el => { el.innerHTML = ""; });
  clearReportImages();
}
function initReport() {
  const isAdmin = currentUser?.role === "admin";
  $("rp-from-field").classList.toggle("hidden", !isAdmin);
  $("rp-to-label").textContent = isAdmin ? "ถึงวันที่" : "วันที่";
  $("report-access-note").textContent = isAdmin ? "เลือกดูรายวันหรือช่วงวันที่ได้" : "เลือกดูรายงานได้ครั้งละ 1 วัน";
  if (reportIdentity !== currentUser?.id) {
    const today = businessDate();
    $("rp-from").value = isAdmin ? today.slice(0, 8) + "01" : today;
    $("rp-to").value = businessDate();
    reportIdentity = currentUser?.id;
  }
}
async function loadReport() {
  const request = ++reportRequest;
  const to = $("rp-to").value;
  const from = currentUser?.role === "admin" ? $("rp-from").value : to;
  if (!from || !to || from > to) { toastErr("เลือกวันที่ไม่ถูกต้อง"); return; }
  const r = await api(`/api/report?from=${from}&to=${to}`);
  if (request !== reportRequest) return;
  $("rp-total-income").textContent = fmt2(r.totalIncome);
  $("rp-account-income").textContent = fmt2(r.totalAccountIncome);
  $("rp-quantity").textContent = r.totalQuantitySold + " ชิ้น";
  $("report-period").textContent = from === to ? "ประจำวันที่ " + from : "ตั้งแต่ " + from + " ถึง " + to;
  $("rp-total-cost").textContent = fmt2(r.sums.cost);
  $("rp-profit").textContent = r.profit === undefined ? "-" : fmt2(r.profit);
  $("rp-cash-cum").textContent = fmt2(r.totalCashCumulative);
  $("rp-cash-in").textContent = fmt2(r.sums.cashIn);
  $("rp-transfer-in").textContent = fmt2(r.sums.transferIn);
  $("rp-sell-cash").textContent = fmt2(r.sellSums.cash);
  $("rp-sell-transfer").textContent = fmt2(r.sellSums.transfer);
  $("rp-month-label").textContent = "รายรับเดือน " + (r.sums.monthLabel || "");
  $("rp-month-label2").textContent = "รายจ่ายเดือน " + (r.sums.monthLabel || "");
  $("rp-month-sell").textContent = r.sums.monthlySell === undefined ? "-" : fmt2(r.sums.monthlySell);
  $("rp-month-cost").textContent = r.sums.monthlyCost === undefined ? "-" : fmt2(r.sums.monthlyCost);
  $("report-body").classList.remove("hidden");
  $("rp-voucher-stats").textContent = `จำนวน Voucher ที่แจกทั้งหมด : ${r.voucher.issued} นำมาใช้ทั้งหมด : ${r.voucher.used}`;

  fillTable("rp-sell-table", r.sellByDate, (x) => [esc(x.name), num(x.qty), fmt2(x.total)]);
  fillTable("rp-cost-table", r.costByDate, (x) => [esc(x.list), fmt2(x.amount), esc(x.paymentType), x.date, esc(x.owner), ...(currentUser?.role === "admin" ? [x.billID && !x.stockTransactionID ? deleteButton("data-delete-bill", x.billID, "ลบทั้งบิล") : deleteButton("data-delete-account", x.id, "ลบรายการ")] : [])]);
  fillTable("rp-cash-table", r.cashTx, (x) => [esc(x.type), fmt2(x.amount), esc(x.list), x.date]);
  fillTable("rp-stock-table", r.stockRemaining, (x) => [esc(x.name), num(x.amount)]);
}
async function createTodayReport() {
  const button = $("btn-report-image");
  if (button.disabled) return;
  button.disabled = true; button.textContent = "กำลังสร้างรูป…";
  const generation = ++reportGeneration;
  try {
    clearReportImages();
    const report = await api("/api/report/today");
    if (generation !== reportGeneration) return;
    const files = await DailyReportImage.create(report);
    if (generation !== reportGeneration) return;
    dailyReportFiles = files;
    dailyReportUrls = dailyReportFiles.map(file => URL.createObjectURL(file));
    $("btn-download-report-all").disabled = !files.length;
    $("report-image-preview").innerHTML = dailyReportUrls.map((url, i) => `<figure><img src="${url}" alt="สรุปการขายประจำวันที่ ${esc(report.from)} หน้า ${i + 1}"><figcaption><a class="btn" href="${url}" download="${dailyReportFiles[i].name}">ดาวน์โหลด PNG${dailyReportFiles.length > 1 ? " หน้า " + (i + 1) : ""}</a></figcaption></figure>`).join("");
    $("report-image-status").textContent = "รายงานวันที่ " + report.from + " · " + dailyReportFiles.length + " รูป";
    $("report-image-dialog").showModal();
  } catch (e) { clearReportImages(); toastErr(e.message); }
  finally { button.disabled = false; button.textContent = "สร้างรายงานวันนี้"; }
}
async function downloadDailyReport() {
  if (!dailyReportFiles.length || $("btn-download-report-all").disabled) return;
  // The native file sheet lets mobile users save or forward all PNGs together.
  // Keep the call inside the original tap so transient user activation is valid.
  if (navigator.canShare?.({ files: dailyReportFiles }) && navigator.share) {
    await shareDailyReport(true);
    return;
  }
  for (let i = 0; i < dailyReportFiles.length; i++) {
    const link = document.createElement("a");
    link.href = dailyReportUrls[i]; link.download = dailyReportFiles[i].name;
    document.body.appendChild(link); link.click(); link.remove();
  }
  $("report-image-status").textContent = `ส่งภาพ PNG ${dailyReportFiles.length} หน้าให้เบราว์เซอร์ดาวน์โหลดแล้ว หากมีคำถามให้อนุญาตดาวน์โหลดหลายไฟล์ หรือกดดาวน์โหลดใต้ภาพที่ต้องการ`;
}
async function shareDailyReport(saveImages = false) {
  if (!dailyReportFiles.length) return;
  const button = $("btn-share-report");
  if (button.disabled) return;
  if (!navigator.canShare?.({ files: dailyReportFiles }) || !navigator.share) {
    $("report-image-status").textContent = "เครื่องนี้ไม่รองรับการแชร์รูปโดยตรง กรุณาดาวน์โหลด PNG แล้วแนบรูปในแชต LINE";
    return;
  }
  button.disabled = true;
  $("btn-download-report-all").disabled = true;
  if (saveImages) $("report-image-status").textContent = "เลือกบันทึกภาพ / บันทึกไปยังไฟล์ เพื่อเก็บ PNG ทุกหน้า หรือเลือก LINE เพื่อส่งต่อทุกภาพพร้อมกัน";
  try { await navigator.share({ files: dailyReportFiles, title: "สรุปการขาย The Cottage Sky Bar" }); }
  catch (e) { if (e.name !== "AbortError") $("report-image-status").textContent = "แชร์รูปไม่สำเร็จ กรุณาดาวน์โหลด PNG แล้วแนบใน LINE"; }
  finally { button.disabled = false; $("btn-download-report-all").disabled = !dailyReportFiles.length; }
}
function num(n) { return `<span class="num">${n}</span>`; }
function deleteButton(attribute, value, label) {
  return currentUser?.role === "admin" ? `<button class="btn danger" ${attribute}="${esc(value)}">${label}</button>` : "";
}
async function deleteRecord(button) {
  if (currentUser?.role !== "admin" || button.disabled) return;
  const billID = button.dataset.deleteBill;
  const message = billID
    ? `ลบบิล ${billID} ถาวร? ระบบจะลบรายรับและเงินสดที่เกี่ยวข้อง คืนสต็อก และคืนสิทธิ์ Voucher`
    : "ลบรายการรายรับ/รายจ่ายนี้ถาวร? รายการเงินสดที่เกี่ยวข้องจะถูกลบด้วย หากเป็นการซื้อสินค้า ระบบจะหักสต็อกที่เคยซื้อเพิ่มกลับ";
  if (!confirm(message)) return;
  button.disabled = true;
  try {
    await api(billID ? "/api/sell/receipt/" + encodeURIComponent(billID) : "/api/accounts/" + button.dataset.deleteAccount, { method: "DELETE" });
    foundReceipt = null; lastReceipt = null;
    $("rc-table").querySelector("tbody").innerHTML = "";
    $("rc-total").textContent = "-";
    $("btn-delete-found").disabled = true;
    if (currentView === "history") await loadHistory();
    if (currentView === "report") await loadReport();
    toast("ลบรายการแล้ว");
  } catch (e) { toastErr(e.message); }
  finally { button.disabled = button.id === "btn-delete-found" ? !foundReceipt : false; }
}
function fillTable(id, rows, cells) {
  const labels = Array.from($(id).querySelectorAll("thead th"), th => th.textContent);
  $(id).querySelector("tbody").innerHTML = (rows || [])
    .map((r) => "<tr>" + cells(r).map((c, i) => `<td data-label="${esc(labels[i] || "")}">${c}</td>`).join("") + "</tr>")
    .join("") || `<tr class="empty-row"><td colspan="${labels.length || 1}">ไม่มีรายการในวันที่เลือก</td></tr>`;
}

/* ---------------- receipt lookup ---------------- */
function initReceiptView() { $("rc-bill").focus(); }
let foundReceipt = null;
async function findReceipt() {
  const id = $("rc-bill").value.trim();
  if (!id) return;
  foundReceipt = null;
  $("btn-delete-found").disabled = true;
  $("rc-table").querySelector("tbody").innerHTML = "";
  $("rc-total").textContent = "-";
  try {
    foundReceipt = await api("/api/sell/receipt/" + encodeURIComponent(id));
    fillTable("rc-table", foundReceipt.rows,
      (r) => [esc(r.Name1), num(r.Amount), fmt2(r.Price), r.Date1, r.Time1, esc(r.Owner), esc(r.PaymentType)]);
    $("rc-total").textContent = fmt2(foundReceipt.total);
    $("btn-delete-found").dataset.deleteBill = foundReceipt.billID;
    $("btn-delete-found").disabled = false;
  } catch (e) { toastErr(e.message); }
}
function printFoundReceipt() {
  if (!foundReceipt) { toastErr("ค้นหาใบเสร็จก่อน"); return; }
  showReceipt({
    paid: true, bill: foundReceipt.billID,
    date: foundReceipt.rows[0].Date1 + " " + foundReceipt.rows[0].Time1,
    owner: foundReceipt.rows[0].Owner, pay: foundReceipt.rows[0].PaymentType, cus: foundReceipt.rows[0].Cusname,
    lines: foundReceipt.rows.map((r) => ({ name: r.Name1, qty: r.Amount, price: r.Price })),
    total: foundReceipt.total,
  });
  printReceiptNow(lastReceipt).catch((e) => toastErr(e.message));
}

/* ---------------- voucher ---------------- */
function initVoucher() {
  if (!$("vc-date").value) $("vc-date").value = businessDate();
  loadVouchers();
}
async function loadVouchers() {
  const rows = await api("/api/vouchers?date=" + $("vc-date").value);
  fillTable("vc-table", rows, (r) => [r.ID, r.Date1, Number(r.Status) === 0 ? "ใช้ได้" : "ใช้แล้ว"]);
}
async function checkVc() {
  const id = $("vc-check").value.trim();
  if (!id) { toastErr("เลข Voucher ไม่ถูกต้อง"); return; }
  const r = await api("/api/vouchers/check/" + encodeURIComponent(id));
  $("vc-check-result").textContent = `Voucher หมายเลข ${id} ${r.ok ? "สามารถ 'ใช้ได้' ในวันนี้" : "'ไม่' สามารถใช้ในวันนี้ได้"}`;
  $("vc-check").value = "";
}
async function genVc() {
  try {
    const r = await api("/api/vouchers", { method: "POST", body: { date: $("vc-date").value, count: Number($("vc-count").value) || 1 } });
    $("vc-gen-result").textContent = "สร้าง Voucher วันที่ " + r.date + " : " + r.ids.join(", ");
    loadVouchers();
  } catch (e) { toastErr(e.message); }
}

/* ---------------- backup ---------------- */
async function exportData() {
  const data = await api("/api/export");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "skybar-backup-" + businessDate() + ".json";
  a.click();
  URL.revokeObjectURL(a.href);
}
async function importData(file) {
  if (!confirm("ต้องการโหลดข้อมูลใหม่ ทับข้อมูลเดิมใช่หรือไม่")) return;
  $("import-status").textContent = "กำลังนำเข้า...";
  try {
    const text = await file.text();
    const r = await api("/api/import", { method: "POST", body: JSON.parse(text) });
    $("import-status").textContent = "นำเข้าข้อมูลสำเร็จ (" + r.rows + " แถว)";
    loadItemTypes();
  } catch (e) { $("import-status").textContent = "นำเข้าไม่สำเร็จ: " + e.message; }
}

/* ---------------- wire events ---------------- */
function wire() {
  RestaurantView.wire();
  document.querySelectorAll(".tbl").forEach((table) => {
    if (table.id === "sell-cart" || table.closest(".table-scroll")) return;
    const wrap = document.createElement("div"); wrap.className = "table-scroll";
    table.parentNode.insertBefore(wrap, table); wrap.appendChild(table);
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-open-sale]")) { openSell(); return; }
    if (e.target.closest("[data-printer-settings]")) { openPrinterSettings(); return; }
    const nav = e.target.closest("[data-nav]");
    // sell buttons in the main menu use onclick=openSell (asks customer name first)
    if (nav && !(nav.dataset.nav === "sell" && nav.closest("#view-main"))) { navigate(nav.dataset.nav); return; }
    const table = e.target.closest("[data-order]");
    if (table) { openTable(table.dataset.order).catch((err) => toastErr(err.message)); return; }
    const deleteTarget = e.target.closest("[data-delete-bill], [data-delete-account]");
    if (deleteTarget) { deleteRecord(deleteTarget); return; }
    const history = e.target.closest("[data-history-order]");
    if (history) { showHistoryOrder(history.dataset.historyOrder).catch((err) => toastErr(err.message)); return; }
    const del = e.target.closest("#sell-cart .del");
    if (del) {
      if (savingSell) return;
      cart.splice(Number(del.dataset.i), 1);
      voucherOk = false;
      renderCart(); onPaymentChange();
      queueOrderSave();
      return;
    }
    const row = e.target.closest("#stock-table tr.clickable");
    if (row) {
      $("st-itemid").value = row.dataset.id;
      $("st-itemname").value = row.dataset.name;
      return;
    }
  });

  // main
  $("btn-export").onclick = exportData;
  $("import-file").onchange = (e) => e.target.files[0] && importData(e.target.files[0]);
  $("btn-logout").onclick = logout;
  $("sidebar-logout").onclick = logout;
  $("staff-form").onsubmit = createStaff;
  $("staff-edit-form").onsubmit = saveStaff;
  $("staff-edit-cancel").onclick = () => $("staff-edit-dialog").close();
  $("staff-list").onclick = e => { const button = e.target.closest("[data-edit-user]"); if (button) editStaff(Number(button.dataset.editUser)); };

  // Native form and a keyboard that edits the currently selected field.
  LoginForm.wire(tryLogin);

  // printer settings
  $("btn-test-print").onclick = async () => {
    $("btn-test-print").disabled = true;
    try { const result = await printReceiptNow(null, true); toast(result?.message || "เตรียมงานพิมพ์แล้ว"); }
    catch (e) { toastErr(e.message); }
    finally { $("btn-test-print").disabled = false; }
  };
  $("btn-preview-print").onclick = () => {
    const p = receiptPayload(null, true);
    showReceipt({ paid: false, bill: p.bill, date: p.date, pay: p.pay, cus: p.cus, tableNo: p.tableNo, shopType: 0, lines: p.items, total: p.total, testPayload: p });
  };
  $("pr-mode").onchange = () => { localStorage.setItem("pos_print_mode", $("pr-mode").value); refreshPrinterUI().catch((e) => toastErr(e.message)); };
  $("pr-printer").onchange = () => localStorage.setItem("pos_printer_name", $("pr-printer").value);
  $("pr-width").onchange = () => localStorage.setItem("pos_paper_width", $("pr-width").value);
  $("btn-mobile-order").onclick = () => $("order-card").scrollIntoView({ behavior: "smooth", block: "start" });

  // sell
  $("btn-close-order").onclick = closeOrderView;
  $("btn-cancel-order").onclick = cancelOrder;
  $("btn-reload-order").onclick = () => reloadOrder().catch((e) => toastErr(e.message));
  $("btn-refresh-tables").onclick = () => loadActiveTables().catch((e) => toastErr(e.message));
  for (const id of ["sell-cus", "sell-seller", "sell-room"]) $(id).onchange = queueOrderSave;
  $("btn-add-item").onclick = addItemFromSelect;
  $("sell-barcode").onkeydown = (e) => e.key === "Enter" && addFromBarcode();
  $("sell-type").onchange = onSellTypeChange;
  $("sell-item").onchange = onSellItemClick;
  $("sell-payment").onchange = onPaymentChange;
  $("sell-received").onkeydown = (e) => {
    if (e.key !== "Enter") return;
    const t = voucherOk ? 0 : cart.reduce((s, l) => s + l.price, 0);
    const ch = Number($("sell-received").value) - t;
    $("sell-change").value = isFinite(ch) ? fmt2(ch) : "";
  };
  $("btn-check-voucher").onclick = checkVoucher;
  $("sell-voucher").oninput = () => { voucherOk = false; renderCart(); };
  $("btn-save-sell").onclick = saveSell;
  $("btn-print-bill").onclick = printBillPreview;
  $("btn-reset-sell").onclick = () => {
    if (savingSell || !confirm("ล้างรายการสินค้าทั้งหมดในโต๊ะนี้? โต๊ะจะยังเปิดอยู่")) return;
    cart = []; voucherOk = false; renderCart(); onPaymentChange(); queueOrderSave();
  };

  // receipt modal
  $("btn-print-receipt").onclick = () => printSingleReceipt(lastReceipt);
  $("btn-print-copy").onclick = () => printSingleReceipt(lastReceipt, true);
  $("btn-close-receipt").onclick = () => $("receipt-overlay").classList.add("hidden");

  // stock
  $("btn-load-stock").onclick = loadStockTable;
  $("st-action").onchange = onStockActionChange;
  $("btn-save-stock").onclick = saveStockTx;

  // cash
  $("deposit-amount").oninput = () => {
    const cur = parseFloat($("cash-total").textContent) || 0;
    const v = Number($("deposit-amount").value);
    $("cash-after").textContent = v > 0 ? fmt2(cur - v) + " บาท" : "-";
  };
  $("btn-deposit").onclick = saveDeposit;

  // add item
  $("btn-save-item").onclick = saveItem;
  $("btn-clear-item").onclick = () => { $("ai-name").value = ""; $("ai-id").value = ""; $("ai-price").value = ""; $("ai-amount").value = "0"; };

  // report
  $("btn-report").onclick = loadReport;
  $("btn-report-today").onclick = () => { $("rp-from").value = businessDate(); $("rp-to").value = businessDate(); loadReport(); };
  $("btn-report-image").onclick = createTodayReport;
  $("btn-download-report-all").onclick = downloadDailyReport;
  $("btn-share-report").onclick = () => shareDailyReport();
  $("btn-close-report-image").onclick = clearReportImages;
  $("report-image-dialog").addEventListener("cancel", clearReportImages);

  // receipt lookup
  $("btn-find-receipt").onclick = findReceipt;
  $("rc-bill").onkeydown = (e) => e.key === "Enter" && findReceipt();
  $("btn-print-found").onclick = printFoundReceipt;

  // voucher
  $("btn-check-vc").onclick = checkVc;
  $("btn-gen-vc").onclick = genVc;
  $("vc-date").onchange = loadVouchers;

  $("btn-history-search").onclick = () => { historyOffset = 0; loadHistory().catch((e) => toastErr(e.message)); };
  $("btn-history-all").onclick = () => { $("history-from").value = ""; $("history-to").value = ""; historyOffset = 0; loadHistory().catch((e) => toastErr(e.message)); };
  $("btn-history-prev").onclick = () => { historyOffset = Math.max(0, historyOffset - 50); loadHistory().catch((e) => toastErr(e.message)); };
  $("btn-history-next").onclick = () => { historyOffset += 50; loadHistory().catch((e) => toastErr(e.message)); };

  // Opening a table is shared by both shop modes.
  $("shop-type").addEventListener("change", () => {});
  document.querySelectorAll("[data-nav='sell']").forEach((b) => {
    if (b.closest("#view-main")) b.onclick = openSell;
  });
  window.addEventListener("beforeunload", (e) => {
    if (pendingOrderSaves || orderSaveError) { e.preventDefault(); e.returnValue = ""; }
  });
  setInterval(() => {
    if (currentView === "main") loadActiveTables().catch(() => {});
  }, 15000);

  // clock
  setInterval(() => {
    const el = $("clock");
    if (el) el.textContent = new Date().toLocaleString("th-TH", { dateStyle: "full", timeStyle: "medium", timeZone: "Asia/Bangkok" });
  }, 1000);
}

async function onSellTypeChange() {
  const t = $("sell-type").value;
  $("sell-item").innerHTML = "";
  $("sell-price").value = "";
  $("sell-remain").value = "";
  if (!t) return;
  const items = await api("/api/items?typeName=" + encodeURIComponent(t));
  $("sell-item").innerHTML = items.map((i) => `<option value="${i.ID}">${esc(i.Name1)}</option>`).join("");
  await onSellItemClick();
}
async function onSellItemClick() {
  const id = $("sell-item").value;
  if (!id) return;
  const it = await api("/api/items/" + id);
  $("sell-price").value = fmt2(it.Price);
  $("sell-remain").value = it.Amount;
}
async function addItemFromSelect() {
  const id = $("sell-item").value;
  if (!id) { toastErr("เลือกสินค้าก่อน"); return; }
  const it = await api("/api/items/" + id);
  addToCart(it);
}
async function addFromBarcode() {
  const code = $("sell-barcode").value.trim();
  if (!code) return;
  try {
    const it = await api("/api/items/" + encodeURIComponent(code));
    addToCart(it);
  } catch (e) {
    toastErr("ไม่พบสินค้า หรือรหัสสินค้าไม่ถูกต้อง");
    $("sell-barcode").value = "";
    $("sell-barcode").focus();
  }
}


/* ---------------- employees ---------------- */
async function logout() {
  if (savingSell) return;
  try { if (activeOrder) await flushOrder(); await api("/api/logout", { method: "POST" }); }
  catch (e) { toastErr(e.message); return; }
  currentUser = null; activeOrder = null; cart = []; lastReceipt = null;
  sessionStorage.clear(); applyIdentity({ required: true, user: null }); navigate("login");
}
async function loadStaffUsers() {
  staffUsers = await api("/api/users");
  $("staff-list").innerHTML = staffUsers.map(u => '<article class="staff-row"><div><strong>' + esc(u.DisplayName) + '</strong><p>' + esc(u.Username) + ' · ' + (u.Role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน') + '</p></div><span class="badge">' + (u.Active ? 'เปิดใช้งาน' : 'ปิดใช้งาน') + '</span><button class="btn" data-edit-user="' + u.ID + '">แก้ไข</button></article>').join("");
}
async function createStaff(e) {
  e.preventDefault(); $("staff-create").disabled = true; $("staff-error").textContent = "";
  try {
    await api("/api/users", { method: "POST", body: { username: $("staff-username").value, displayName: $("staff-name").value, password: $("staff-password").value } });
    $("staff-form").reset(); await loadStaffUsers(); toast("เพิ่มพนักงานแล้ว");
  } catch (e) { $("staff-error").textContent = e.message; }
  finally { $("staff-create").disabled = false; }
}
function editStaff(id) {
  const u = staffUsers.find(row => row.ID === id); if (!u) return;
  $("staff-edit-id").value = id; $("staff-edit-username").textContent = u.Username;
  $("staff-edit-name").value = u.DisplayName; $("staff-edit-password").value = "";
  $("staff-edit-active").checked = !!u.Active; $("staff-edit-active").disabled = u.Role === "admin";
  $("staff-edit-error").textContent = ""; $("staff-edit-dialog").showModal();
}
async function saveStaff(e) {
  e.preventDefault(); const id = Number($("staff-edit-id").value), button = e.submitter;
  if (button) button.disabled = true;
  const body = { displayName: $("staff-edit-name").value, active: $("staff-edit-active").checked };
  if ($("staff-edit-password").value) body.password = $("staff-edit-password").value;
  try {
    await api("/api/users/" + id, { method: "PUT", body }); $("staff-edit-dialog").close();
    if (id === currentUser.id) { currentUser = null; sessionStorage.clear(); navigate("login"); toast("บันทึกแล้ว กรุณาเข้าสู่ระบบใหม่"); }
    else { await loadStaffUsers(); toast("บันทึกข้อมูลพนักงานแล้ว"); }
  } catch (e) { $("staff-edit-error").textContent = e.message; }
  finally { if (button) button.disabled = false; }
}

/* ---------------- boot ---------------- */
(async function boot() {
  wire();
  window.addEventListener("hashchange", route);
  try {
    const st = await loadMeta();
    if (!st.user) { navigate("login"); await route(); return; }
    sessionStorage.setItem("authed", "1");
    if (location.hash === "#/login") navigate("main");
    await route();
  } catch (e) { $("login-error").textContent = e.message; navigate("login"); await route(); }
})();
