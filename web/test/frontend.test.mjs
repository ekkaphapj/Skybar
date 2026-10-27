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
console.log(`\n${passed} passed`);
