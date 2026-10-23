// Run only against a disposable local database with migrations applied.
import assert from "node:assert/strict";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(BASE).hostname), "Use a local test database");
let cookie = "", passed = 0;
async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method, headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.headers.has("set-cookie")) cookie = res.headers.get("set-cookie").split(";")[0];
  return { status: res.status, data: await res.json() };
}
function check(label, value) { assert.ok(value, label); passed++; console.log("  ok    " + label); }
assert.equal((await req("POST", "/api/login", { username: process.env.TEST_USERNAME || "admin", password: process.env.TEST_PASSWORD || "1234" })).status, 200);
const snapshot = (await req("GET", "/api/export")).data;
const types = (await req("GET", "/api/item-types")).data;
const today = (await req("GET", "/api/meta")).data.today;
try {
  const product = await req("POST", "/api/items", {
    name: 'ทดสอบ " <สินค้า>', itemTypeId: types.find(t => t.Name1 === "เครื่องดื่มไม่มีแอลกอฮอล์").ID,
    price: 10, amount: 20, owner: "เอก",
  });
  check("automatic product ID identifies the inserted item", product.status === 200 &&
    (await req("GET", "/api/items/" + product.data.id)).data.Name1 === 'ทดสอบ " <สินค้า>');
  const id = product.data.id;
  const sell = { items: [{ itemID: id, qty: 1 }], owner: "เอก", paymentType: "เงินสด" };
  const billID = "regression-" + crypto.randomUUID();
  const sales = await Promise.all([req("POST", "/api/sell", { ...sell, billID }), req("POST", "/api/sell", { ...sell, billID })]);
  check("concurrent duplicate bill commits exactly once", sales.filter(r => r.status === 200).length === 1 && sales.filter(r => r.status === 409).length === 1);
  check("duplicate bill rolls back stock and receipt rows", (await req("GET", "/api/items/" + id)).data.Amount === 19 &&
    (await req("GET", "/api/sell/receipt/" + billID)).data.rows.length === 1);
  const voucher = (await req("POST", "/api/vouchers", { date: today, count: 1 })).data.ids[0];
  const voucherSale = { ...sell, paymentType: "Voucher", voucherId: voucher };
  check("voucher rejects quantity two", (await req("POST", "/api/sell", { ...voucherSale, billID: crypto.randomUUID(), items: [{ itemID: id, qty: 2 }] })).status === 400);
  const vouchers = await Promise.all([req("POST", "/api/sell", { ...voucherSale, billID: crypto.randomUUID() }), req("POST", "/api/sell", { ...voucherSale, billID: crypto.randomUUID() })]);
  check("concurrent voucher redemption commits exactly once", vouchers.filter(r => r.status === 200).length === 1 && vouchers.filter(r => r.status === 400).length === 1);
  check("voucher response matches stored zero total", vouchers.find(r => r.status === 200).data.total === 0 && vouchers.find(r => r.status === 200).data.lines[0].price === 0);
  check("voucher race rolls back the losing stock change", (await req("GET", "/api/items/" + id)).data.Amount === 18);
  const balance = (await req("GET", "/api/cash/total")).data.total;
  check("server rejects excess cash withdrawal", (await req("POST", "/api/cash/deposit", { amount: Math.max(1, balance + 1) })).status === 400);
  const funding = Math.max(0, -balance) + 100;
  await req("POST", "/api/stock/transaction", { action: "income", price: funding, paymentType: "เงินสด", owner: "เอก", comment: "ทดสอบ" });
  const available = (await req("GET", "/api/cash/total")).data.total;
  const withdrawals = await Promise.all([req("POST", "/api/cash/deposit", { amount: available }), req("POST", "/api/cash/deposit", { amount: available })]);
  check("concurrent cash withdrawals cannot overdraw", withdrawals.filter(r => r.status === 200).length === 1 && withdrawals.filter(r => r.status === 400).length === 1 && (await req("GET", "/api/cash/total")).data.total === 0);
  const billIds = await Promise.all(Array.from({ length: 8 }, () => req("GET", "/api/billid")));
  check("bill IDs generated in the same second are unique", new Set(billIds.map(r => r.data.billID)).size === 8);
  check("impossible report date rejected", (await req("GET", "/api/report?from=2026-02-30&to=2026-03-01")).status === 400);
  const backup = (await req("GET", "/api/export")).data;
  check("partial backup rejected", (await req("POST", "/api/import", { tables: { Items: [] } })).status === 400);
  const malformed = structuredClone(backup);
  malformed.tables.Items[0]["Name1) VALUES ('bad'); --"] = "bad";
  check("unrecognized backup column rejected", (await req("POST", "/api/import", malformed)).status === 400);
  const brokenRelation = structuredClone(backup);
  brokenRelation.tables.Items[0].ItemTypeID = 9999999;
  check("invalid backup foreign key rejected", (await req("POST", "/api/import", brokenRelation)).status === 400);
  check("failed imports preserve all eight tables", JSON.stringify((await req("GET", "/api/export")).data.tables) === JSON.stringify(backup.tables));
  check("full backup restores with foreign keys enabled", (await req("POST", "/api/import", backup)).status === 200);
  check("restored data matches all eight exported tables", JSON.stringify((await req("GET", "/api/export")).data.tables) === JSON.stringify(backup.tables));
} finally {
  assert.equal((await req("POST", "/api/import", snapshot)).status, 200, "Restore pre-test data");
}
console.log(`\n${passed} passed`);
