// Exercise the real cart functions with a minimal DOM; no application code copied.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const nodes = new Map();
const settings = new Map();
let printedHtml = "", browserPrintCalls = 0;
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {
    value: "", textContent: "", innerHTML: "", selectedIndex: 0,
    classList: { toggle() {}, add() {}, remove() {} }, focus() {},
    open: false,
    showModal() { this.open = true; },
    close() { this.open = false; },
    querySelector() { return node(id + ":tbody"); },
    querySelectorAll() { return []; },
    setAttribute(name, value) { this['attr:' + name] = String(value); },
    getAttribute(name) { return this['attr:' + name] ?? null; },
    removeAttribute(name) { delete this['attr:' + name]; },
  });
  return nodes.get(id);
}
const context = vm.createContext({
  document: {
    getElementById: node,
    querySelectorAll() { return []; },
    body: { appendChild() {} },
    createElement(tag) {
      if (tag === "iframe") return {
        style: {}, remove() {},
        contentDocument: { open() {}, write(html) { printedHtml = html; }, close() {}, images: [] },
        contentWindow: { focus() {}, print() { browserPrintCalls++; } },
      };
      return { textContent: "", get innerHTML() {
        return String(this.textContent).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      } };
    },
  },
  localStorage: { getItem(key) { return settings.get(key) || null; } },
  crypto, AbortController, btoa,
  console, setTimeout(callback, ms) { const timer = setTimeout(callback, ms); timer.unref(); return timer; }, clearTimeout,
});
const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
vm.runInContext(readFileSync(new URL("../public/seat-plan.js", import.meta.url), "utf8"), context);
vm.runInContext(readFileSync(new URL("../public/receipt.js", import.meta.url), "utf8"), context);
vm.runInContext(readFileSync(new URL("../public/printing.js", import.meta.url), "utf8"), context);
vm.runInContext(source.split("/* ---------------- boot ---------------- */")[0], context);
let passed = 0;
function check(label, expression, expected) {
  assert.equal(vm.runInContext(expression, context), expected, label);
  console.log("  ok    " + label); passed++;
}
node("sell-qty").value = "1";
vm.runInContext(`
  addToCart({ ID: 1, Name1: 'เบียร์', Price: 60, TypeName: 'เครื่องดื่ม' });
  addToCart({ ID: 2, Name1: 'อาหาร', Price: 40, TypeName: 'อาหาร' });
  addToCart({ ID: 3, Name1: 'ส่วนลด', Price: 0.9, TypeName: 'ส่วนลด' });
`, context);
check("cart total includes correct discount", "$('sell-total').textContent", "90.00");
vm.runInContext("cart.splice(0, 1); renderCart();", context);
check("removing earlier item recomputes discount", "cart[1].price", -4);
check("recomputed preview total", "$('sell-total').textContent", "36.00");
vm.runInContext("cart.splice(1, 1); renderCart();", context);
check("removing discount restores subtotal", "$('sell-total').textContent", "40.00");
vm.runInContext("voucherOk = true; addToCart({ID: 4, Name1: 'น้ำ', Price: 10, TypeName: 'เครื่องดื่ม'});", context);
check("adding a product invalidates voucher confirmation", "voucherOk", false);
check("names are escaped in attribute and text contexts", `esc('"<img>&')`, "&quot;&lt;img&gt;&amp;");
vm.runInContext("cart = []; renderCart();", context);
check("empty cart has zero total", "$('sell-total').textContent", "0.00");

vm.runInContext("var customerResult; askCustomerName().then(name => { customerResult = name; });", context);
check("customer dialog opens as a native modal", "$('cus-overlay').open", true);
node("cus-input").value = "   ";
node("cus-table").value = "";
let prevented = false;
node("cus-card").onsubmit({ preventDefault() { prevented = true; } });
assert.ok(prevented, "form does not reload the page");
check("table selection is required", "$('cus-overlay').open", true);
node("cus-table").value = "3";
node("cus-input").value = "  ลูกค้าทดสอบ  ";
node("cus-card").onsubmit({ preventDefault() {} });
await new Promise(resolve => setImmediate(resolve));
check("Thai customer name is returned intact", "customerResult.cusName", "ลูกค้าทดสอบ");
check("table number is returned", "customerResult.tableNo", 3);
check("successful submit closes the dialog", "$('cus-overlay').open", false);
check("submit handler is removed after close", "$('cus-card').onsubmit", null);
vm.runInContext("askCustomerName().then(name => { customerResult = name; });", context);
check("reopening clears the previous name", "$('cus-input').value", "");
node("cus-table").value = "4";
node("cus-card").onsubmit({ preventDefault() {} });
await new Promise(resolve => setImmediate(resolve));
check("customer name is optional", "customerResult.cusName", "");
vm.runInContext("askCustomerName().then(name => { customerResult = name; });", context);
node("cus-overlay").oncancel({ preventDefault() {} });
await new Promise(resolve => setImmediate(resolve));
check("Escape cancels customer entry", "customerResult", null);
check("Escape closes the modal", "$('cus-overlay').open", false);
vm.runInContext("askCustomerName().then(name => { customerResult = name; });", context);
node("btn-cus-cancel").onclick();
await new Promise(resolve => setImmediate(resolve));
check("Cancel button returns no customer name", "customerResult", null);
check("Cancel button closes the modal", "$('cus-overlay').open", false);

settings.set("pos_printer_name", "Mock thermal");
vm.runInContext(`
  var printRequests = [];
  Receipt58.prepare = async (receipt, copies, paper) => ({bytes:new Uint8Array([27,64,copies]),images:Array.from({length:copies},()=>'data:image/png;base64,eA=='),heights:Array(copies).fill(100),paper,copies});
  detectPrinter = async () => { printerInfo = { available:true, raster:true, printers:['Mock thermal'] }; };
  fetchWithTimeout = async (url, ms, options) => { printRequests.push(JSON.parse(options.body)); return { ok: true }; };
  toast = () => {};
`, context);
await vm.runInContext(`printReceiptNow({ bill: 'test', date: '2026-10-22', pay: 'เงินสด', cus: '', tableNo: 4, shopType: 0, paid: true, lines: [{name:'น้ำ',qty:1,price:10}],total:10 }, false, 2)`, context);
check("two thermal copies use one spool job", "printRequests.length", 1);
check("both copies are included in the raster packet", "printRequests[0].raw", "1b4002");
check("print jobs have a deduplication key", "printRequests[0].jobId.startsWith('reprint:')", true);
check("optional customer name does not remove table identity", "receiptPayload({bill:'x',date:'x',pay:'เงินสด',cus:'',tableNo:4,paid:true,lines:[],total:0}).tableNo", 4);
settings.delete("pos_printer_name");
await vm.runInContext(`browserPrint({ bill: 'test', date: '2026-10-22', pay: 'เงินสด', cus: '', tableNo: 4, shopType: 0, paid: true, lines: [{name:'น้ำ',qty:1,price:10}],total:10 }, false, 2)`, context);
assert.equal(browserPrintCalls, 1); passed++; console.log("  ok    browser printing uses one print job");
assert.equal((printedHtml.match(/<article class="receipt-copy">/g) || []).length, 2); passed++; console.log("  ok    browser print job contains two receipts");
assert.ok(/page-break-before:\s*always/.test(printedHtml)); passed++; console.log("  ok    browser receipt copies start on separate pages");
assert.ok(printedHtml.includes("size:58mm 21mm")); passed++; console.log("  ok    browser paper size uses valid 58mm dimensions");
vm.runInContext("fetchWithTimeout = async () => { throw new Error('connection lost'); };", context);
settings.set("pos_printer_name", "Mock thermal");
await assert.rejects(vm.runInContext(`printReceiptNow({bill:'x',date:'x',pay:'เงินสด',cus:'',paid:true,lines:[],total:0})`, context), /connection lost/);
assert.equal(browserPrintCalls, 1); passed++; console.log("  ok    ambiguous USB failure never silently resends to browser");
check("print lock releases after failure", "printingReceipt", false);
vm.runInContext('applyIdentity({required:true,user:{id:7,username:"staff",displayName:"พนักงานคนนี้",role:"employee"}})', context);
check("seller is automatically taken from login", "$('sell-seller').value", "พนักงานคนนี้");
check("seller selection cannot be changed", "$('sell-seller').disabled", true);
check("stock actor is automatically taken from login", "$('st-owner').value", "พนักงานคนนี้");
check("item actor is automatically taken from login", "$('ai-owner').value", "พนักงานคนนี้");
check("receipt preserves the original cashier", "receiptFromSale({owner:'ผู้ขายเดิม'}).owner", "ผู้ขายเดิม");
vm.runInContext('askCustomerName(7)', context);
check("clicking a free scene table preselects that table", "$('cus-table').value", "7");
node("btn-cus-cancel").onclick();
vm.runInContext('activeTables = [{tableNo: 7}]; askCustomerName(7)', context);
check("an occupied table cannot be preselected for opening", "$('cus-table').value", "");
node("btn-cus-cancel").onclick();
vm.runInContext('activeTables = []; askCustomerName(21)', context);
check("scene cannot preselect a table outside 1–20", "$('cus-table').value", "");
node("btn-cus-cancel").onclick();
check("employee sees no deletion buttons", "deleteButton('data-delete-account', 7, 'ลบ')", "");
vm.runInContext("currentUser = { role: 'admin' };", context);
check("admin sees deletion controls", "deleteButton('data-delete-account', 7, 'ลบ').includes('data-delete-account=\"7\"')", true);
check("bill identifiers are escaped in delete buttons", "deleteButton('data-delete-bill', '\"<x>', 'ลบ').includes('&quot;&lt;x&gt;')", true);
vm.runInContext(`
  var deletionRequests = [];
  var deleteTestButton = { dataset: { deleteAccount: '7' }, disabled: false };
  api = async (path, options) => { deletionRequests.push({path, options}); return {ok:true}; };
  confirm = () => false;
`, context);
await vm.runInContext('deleteRecord(deleteTestButton)', context);
check("cancelled deletion sends no request", "deletionRequests.length", 0);
vm.runInContext("confirm = () => true; currentUser = {role:'employee'};", context);
await vm.runInContext('deleteRecord(deleteTestButton)', context);
check("employee cannot invoke deletion from UI", "deletionRequests.length", 0);
vm.runInContext("currentUser = {role:'admin'}; foundReceipt = {billID:'old'}; lastReceipt = {bill:'old'};", context);
await vm.runInContext('deleteRecord(deleteTestButton)', context);
check("confirmed account deletion uses DELETE", "deletionRequests[0].path + ':' + deletionRequests[0].options.method", "/api/accounts/7:DELETE");
check("successful deletion clears printable receipt", "foundReceipt === null && lastReceipt === null", true);
check("successful deletion disables receipt deletion", "$('btn-delete-found').disabled", true);
vm.runInContext("deleteTestButton = {dataset:{deleteBill:'bill/a'},disabled:false};", context);
await vm.runInContext('deleteRecord(deleteTestButton)', context);
check("bill deletion encodes the bill identifier", "deletionRequests[1].path", "/api/sell/receipt/bill%2Fa");
vm.runInContext("currentUser = {id:1,role:'admin'}; initReport();", context);
check("admin report starts on first of month", "$('rp-from').value", vm.runInContext("businessDate().slice(0,8)+'01'", context));
check("admin report ends on business today", "$('rp-to').value", vm.runInContext("businessDate()", context));
vm.runInContext("currentUser = {id:2,role:'employee'}; initReport();", context);
check("employee has a single date label", "$('rp-to-label').textContent", "วันที่");
check("employee report resets date on identity switch", "$('rp-to').value", vm.runInContext("businessDate()", context));
vm.runInContext(`
  var revokedReportUrls = [], shareCalls = [];
  URL = { createObjectURL: () => 'blob:test-report', revokeObjectURL: url => revokedReportUrls.push(url) };
  navigator = { canShare: () => true, share: async data => shareCalls.push(data) };
  DailyReportImage = { create: async () => [{name:'report.png',type:'image/png'},{name:'report-2.png',type:'image/png'}] };
  api = async () => ({from:'2026-10-27'});
`, context);
await vm.runInContext('createTodayReport()', context);
check("generated report opens a preview", "$('report-image-dialog').open", true);
check("report offers downloadable PNG", "$('report-image-preview').innerHTML.includes('download=\"report.png\"')", true);
check("download-all enables after images are ready", "$('btn-download-report-all').disabled", false);
await vm.runInContext('downloadDailyReport()', context);
check("mobile save receives all PNG files in one action", "shareCalls[0].files.length", 2);
check("mobile save receives images directly", "shareCalls[0].files.every(file => file.type === 'image/png')", true);
check("mobile save explains native save options", "$('report-image-status').textContent.includes('บันทึกภาพ')", true);
await vm.runInContext('shareDailyReport()', context);
check("native sharing receives generated file", "shareCalls[0].files[0].name", "report.png");
vm.runInContext('navigator.canShare = () => false;', context);
await vm.runInContext('shareDailyReport()', context);
check("unsupported sharing explains LINE fallback", "$('report-image-status').textContent.includes('แนบรูปในแชต LINE')", true);
vm.runInContext(`
  var pngDownloads = [], originalCreateElement = document.createElement;
  document.createElement = tag => tag === 'a' ? {
    click() { pngDownloads.push({name:this.download, href:this.href}); }, remove() {}
  } : originalCreateElement(tag);
`, context);
await vm.runInContext('downloadDailyReport()', context);
check("fallback downloads every PNG individually", "pngDownloads.length", 2);
check("fallback retains first PNG filename", "pngDownloads[0].name", "report.png");
check("fallback retains second PNG filename", "pngDownloads[1].name", "report-2.png");
vm.runInContext('document.createElement = originalCreateElement;', context);
vm.runInContext('resetReport()', context);
check("identity reset clears generated files", "dailyReportFiles.length", 0);
check("identity reset revokes all image object URLs", "revokedReportUrls.length", 2);
check("identity reset disables saving old images", "$('btn-download-report-all').disabled", true);
check("identity reset closes report preview", "$('report-image-dialog').open", false);
vm.runInContext(`
  var singlePrints = [];
  var printPreviewCopies = null;
  var singleReceipt = receiptFromSale({billID:'single-print',date:'2026-10-28',time:'18:30',paymentType:'เงินสด',tableNo:4,total:100,lines:[],owner:'staff'});
  printReceiptNow = async (receipt, test, copies, jobId) => { singlePrints.push({receipt,copies,jobId}); return {message:'ส่งเข้าคิวแล้ว'}; };
  Receipt58.render = async (payload, copy, copies) => { printPreviewCopies = copies; return {toDataURL:()=> 'data:image/png;base64,eA=='}; };
  var checkoutFinished = false;
  showCheckoutSuccess(singleReceipt).then(() => { checkoutFinished = true; });
`, context);
check("checkout does not automatically print", "singlePrints.length", 0);
check("checkout keeps print choices visible", "$('checkout-result').open", true);
check("sale receipts default to one copy", "singleReceipt.copies", 1);
await node("btn-checkout-print").onclick();
check("receipt button sends a single sheet", "singlePrints[0].copies", 1);
check("receipt button prints original", "singlePrints[0].receipt.isCopy", false);
await node("btn-checkout-copy").onclick();
check("copy button sends a separate single sheet", "singlePrints.length + ':' + singlePrints[1].copies", "2:1");
check("copy print has a distinct job ID", "singlePrints[0].jobId !== singlePrints[1].jobId", true);
check("copy title is explicit on paper", "receiptPayload(singlePrints[1].receipt).title.includes('สำเนา')", true);
check("original title is not marked copy", "receiptPayload(singlePrints[0].receipt).title.includes('COPY')", false);
check("printing does not close the checkout choices", "checkoutFinished", false);
vm.runInContext(`
  var finishPrint;
  printReceiptNow = () => new Promise(resolve => {finishPrint=resolve;});
  var printingOne = printSingleReceipt(singleReceipt);
`, context);
await vm.runInContext('printSingleReceipt(singleReceipt, true)', context);
check("original and copy buttons lock together", "$('btn-checkout-print').disabled && $('btn-checkout-copy').disabled", true);
node("checkout-result-form").onsubmit({ preventDefault() {} });
check("checkout cannot dismiss during an active print", "$('checkout-result').open", true);
vm.runInContext('finishPrint({message:"sent"})', context);
await vm.runInContext('printingOne', context);
check("print controls unlock after completion", "$('btn-checkout-copy').disabled", false);
node("checkout-result-form").onsubmit({ preventDefault() {} });
await new Promise(resolve => setImmediate(resolve));
check("checkout can finish without another print", "checkoutFinished", true);
vm.runInContext('printReceiptNow = async () => {throw new Error("offline")};', context);
await vm.runInContext('printSingleReceipt(singleReceipt)', context);
check("print failure is shown without retrying", "$('receipt-print-status').textContent.includes('offline')", true);
check("print failure releases controls", "receiptPrintBusy", false);
vm.runInContext('showReceipt({...singleReceipt,copies:2})', context);
await new Promise(resolve => setImmediate(resolve));
check("old two-copy history previews only one receipt", "printPreviewCopies", 1);
node("rp-sell-table").querySelectorAll = () => [{textContent:'สินค้า'},{textContent:'จำนวน'},{textContent:'ยอดเงิน'}];
vm.runInContext('fillTable("rp-sell-table",[{name:"ชาเย็น",qty:2}], x => [esc(x.name),x.qty,"60.00"])', context);
check("mobile report cells include column labels", "$('rp-sell-table').querySelector('tbody').innerHTML.includes('data-label=\"จำนวน\"')", true);
vm.runInContext('fillTable("rp-sell-table",[],x=>[])', context);
check("empty report explains missing daily entries", "$('rp-sell-table').querySelector('tbody').innerHTML.includes('ไม่มีรายการในวันที่เลือก')", true);
vm.runInContext('activeTables = []; askCustomerName(12)', context);
check("bar B1 preselects existing order slot 12", "$('cus-table').value", "12");
check("bar labels are visible when opening a sale", "$('cus-table').innerHTML.includes('บาร์ B1') && $('cus-table').innerHTML.includes('บาร์ B8')", true);
node("btn-cus-cancel").onclick();
check("bar receipts show physical seat label", "receiptPayload({...singleReceipt,tableNo:12}).tableNo", "B1");
check("receipt retains internal table ID before formatting", "receiptFromSale({tableNo:12}).tableNo", 12);
vm.runInContext('askCustomerName(20)', context);
check("overflow table remains available", "$('cus-table').value", "20");
check("overflow table is clearly labeled", "$('cus-table').innerHTML.includes('โต๊ะเสริม 20')", true);
node("btn-cus-cancel").onclick();
vm.runInContext('askCustomerName(4).then(value => {customerResult = value;})', context);
check("new sale party size starts at one guest", "$('cus-guests').value", "1");
node("cus-guests").value = "5";
node("cus-card").onsubmit({preventDefault(){}});
await new Promise(resolve=>setImmediate(resolve));
check("opening form returns selected party size", "customerResult.guestCount", 5);
vm.runInContext('askCustomerName(4)', context);
check("reopening does not reuse previous party size", "$('cus-guests').value", "1");
node("btn-cus-cancel").onclick();
node('cus-table').options = Array.from({length:20},(_,i)=>({value:String(i+1),disabled:false,textContent:''}));
vm.runInContext(`
  activeTables = [];
  loadActiveTables = async () => { activeTables = [{tableNo:20}]; };
  RooftopScene = {scene: () => '<svg viewBox="50 -160 1350 1010"><g id="scene-table-2"></g></svg>'};
  askCustomerName(2);
`, context);
await node('btn-show-seat-map').onclick();
check("mobile map opens after refreshing table status", "$('btn-show-seat-map').getAttribute('aria-expanded')", "true");
check("newly occupied table becomes unavailable", "$('cus-table').options[19].disabled", true);
check("mobile map uses separate element IDs", "$('cus-seat-map-viewport').innerHTML.includes('id=\"mobile-seat-2\"')", true);
node('cus-seat-map-viewport').onclick({target:{closest:()=>({dataset:{sceneTable:'20'}})}});
check("occupied mobile map seat cannot be selected", "$('cus-table').value", "2");
check("occupied mobile map seat explains its status", "$('cus-seat-map-status').textContent.includes('กำลังขาย')", true);
node('cus-seat-map-viewport').onclick({target:{closest:()=>({dataset:{sceneTable:'3'}})}});
check("free mobile map seat updates the selected table", "$('cus-table').value", "3");
check("selecting a seat closes the temporary map", "$('btn-show-seat-map').getAttribute('aria-expanded')", "false");
await node('btn-show-seat-map').onclick();
let mapKeyPrevented = false;
node('cus-seat-map-viewport').onkeydown({key:'Enter',preventDefault(){mapKeyPrevented=true;},target:{closest:()=>({dataset:{sceneTable:'4'}})}});
check("keyboard can select a free seat on the mobile map", "$('cus-table').value", "4");
assert.ok(mapKeyPrevented, 'keyboard selection must not submit the form');
node('btn-cus-cancel').onclick();
vm.runInContext(`
  activeTables = [];
  var finishMapRefresh;
  loadActiveTables = () => new Promise(resolve => { finishMapRefresh = resolve; });
  askCustomerName(4);
  var pendingSeatMap = $('btn-show-seat-map').onclick();
`, context);
node('btn-cus-cancel').onclick();
vm.runInContext('finishMapRefresh()', context);
await vm.runInContext('pendingSeatMap', context);
check("late map refresh cannot reopen a cancelled dialog", "$('btn-show-seat-map').getAttribute('aria-expanded')", "false");
check("late map refresh does not restore stale map content", "$('cus-seat-map-viewport').innerHTML", "");
vm.runInContext(`
  var cancelCalls = [], confirmCancel = false, cancelMessage = '', nextLocation = '';
  var sessionStorage = { getItem() { return null; }, removeItem(key) { cancelCalls.push(['remove', key]); } };
  toastErr = message => { $('toast').textContent = message; };
  var confirm = message => { cancelMessage = message; return confirmCancel; };
  api = async (path, opts) => { cancelCalls.push([path, opts]); };
  navigate = name => { nextLocation = name; };
  activeOrder = { id: 'cancel-test', tableNo: 3, revision: 2, status: 'open' };
  cart = [{ itemID: 1, qty: 2 }];
`, context);
await vm.runInContext('cancelOrder()', context);
check("declining cancellation makes no request", "cancelCalls.length", 0);
check("declining preserves the table", "activeOrder.id", "cancel-test");
check("confirmation identifies the table", "cancelMessage.includes(SeatPlan.label(3))", true);
vm.runInContext(`
  confirmCancel = true;
  var finishPendingSave;
  orderSaveQueue = new Promise(resolve => { finishPendingSave = () => { activeOrder.revision = 3; resolve(); }; });
  var cancelling = cancelOrder();
`, context);
check("cancellation waits for pending saves", "cancelCalls.length", 0);
check("checkout and duplicate cancellation blocked while waiting", "savingSell", true);
await vm.runInContext('cancelOrder()', context);
vm.runInContext('finishPendingSave()', context);
await vm.runInContext('cancelling', context);
check("cancellation uses latest saved revision", "cancelCalls[0][1].body.revision", 3);
check("cancellation uses the table cancellation endpoint", "cancelCalls[0][0]", "/api/orders/cancel-test/cancel");
check("successful cancellation clears active order", "activeOrder", null);
check("successful cancellation clears cart", "cart.length", 0);
check("successful cancellation returns home", "nextLocation", "main");
check("successful cancellation unlocks controls", "$('view-sell').inert || savingSell", false);
vm.runInContext(`
  activeOrder = { id: 'conflict', tableNo: 3, revision: 1, status: 'open' };
  api = async () => { throw new Error('ข้อมูลโต๊ะเปลี่ยนแล้ว'); };
  nextLocation = '';
`, context);
await vm.runInContext('cancelOrder()', context);
check("failed cancellation preserves active order", "activeOrder.id", "conflict");
check("failed cancellation stays on table", "nextLocation", "");
check("failed cancellation reports error", "$('toast').textContent", "ข้อมูลโต๊ะเปลี่ยนแล้ว");
check("failed cancellation unlocks controls", "$('view-sell').inert || savingSell", false);
console.log(`\n${passed} passed`);
