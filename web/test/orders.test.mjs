import assert from "node:assert/strict";
const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
assert.ok(["127.0.0.1", "localhost"].includes(new URL(BASE).hostname), "Use a disposable local database");
let cookie = "", passed = 0;
async function req(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { "Content-Type": "application/json", Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.headers.has("set-cookie")) cookie = res.headers.get("set-cookie").split(";")[0];
  return { status: res.status, data: await res.json() };
}
function check(label, condition) { assert.ok(condition, label); console.log("  ok    " + label); passed++; }
assert.equal((await req("POST", "/api/login", { username: process.env.TEST_USERNAME || "admin", password: process.env.TEST_PASSWORD || "1234" })).status, 200);
const snapshot = (await req("GET", "/api/export")).data;
try {
  check("backup includes table orders", Array.isArray(snapshot.tables.TableOrders));
  const occupied = new Set((await req("GET", "/api/orders")).data.map(o => o.tableNo));
  const tables = Array.from({ length: 20 }, (_, i) => i + 1).filter(n => !occupied.has(n));
  assert.ok(tables.length >= 3, "Three free test tables are needed");
  const [tableNo, secondTable, thirdTable] = tables;
  const type = (await req("GET", "/api/item-types")).data.find(t => t.Name1 !== "ส่วนลด");
  const added = await req("POST", "/api/items", { name: "ทดสอบรายการโต๊ะ", itemTypeId: type.ID, price: 10, amount: 30, owner: "เอก" });
  assert.equal(added.status, 200);
  const itemID = added.data.id;
  check("table zero rejected", (await req("POST", "/api/orders", { tableNo: 0 })).status === 400);
  check("table 21 rejected", (await req("POST", "/api/orders", { tableNo: 21 })).status === 400);
  const opened = await req("POST", "/api/orders", { tableNo, cusName: "" });
  check("table opens without customer name", opened.status === 200 && opened.data.cusName === "" && opened.data.tableNo === tableNo);
  const id = opened.data.id;
  check("duplicate active table rejected", (await req("POST", "/api/orders", { tableNo })).status === 409);
  check("table appears in active list", (await req("GET", "/api/orders")).data.some(o => o.id === id));
  const startCash = (await req("GET", "/api/cash/total")).data.total;
  const saved = await req("PUT", "/api/orders/" + id, { revision: 0, items: [{ itemID, qty: 2 }], owner: "เอก", cusName: "คุณสมชาย" });
  check("table items saved with authoritative total", saved.status === 200 && saved.data.total === 20);
  check("open order does not change stock", (await req("GET", "/api/items/" + itemID)).data.Amount === 30);
  check("open order does not change cash", (await req("GET", "/api/cash/total")).data.total === startCash);
  const reopened = (await req("GET", "/api/orders/" + id)).data;
  check("reopening restores items, name and bill", reopened.items[0].qty === 2 && reopened.cusName === "คุณสมชาย" && reopened.billID === opened.data.billID);
  check("stale table update rejected", (await req("PUT", "/api/orders/" + id, { revision: 0, items: [], owner: "เอก" })).status === 409);
  check("bad product update rejected", (await req("PUT", "/api/orders/" + id, { revision: 1, items: [{ itemID: -1, qty: 1 }] })).status === 400);
  check("stale checkout rejected", (await req("POST", "/api/orders/" + id + "/checkout", { revision: 0, paymentType: "เงินสด" })).status === 409);
  const results = await Promise.all([req("POST", "/api/orders/" + id + "/checkout", { revision: 1, paymentType: "เงินสด" }), req("POST", "/api/orders/" + id + "/checkout", { revision: 1, paymentType: "เงินสด" })]);
  check("concurrent checkout commits once", results.filter(r => r.status === 200).length === 1 && results.filter(r => r.status === 409).length === 1);
  check("checkout response identifies table and amount", results.find(r => r.status === 200).data.tableNo === tableNo && results.find(r => r.status === 200).data.total === 20);
  check("checkout cuts stock only once", (await req("GET", "/api/items/" + itemID)).data.Amount === 28);
  check("checkout adds cash only once", (await req("GET", "/api/cash/total")).data.total === startCash + 20);
  check("checked-out table leaves active list", !(await req("GET", "/api/orders")).data.some(o => o.id === id));
  const history = (await req("GET", "/api/orders/history")).data.orders;
  check("checked-out table appears in history", history.some(o => o.id === id && o.receipt.total === 20));
  const closed = (await req("GET", "/api/orders/" + id)).data;
  check("closed receipt can be reopened", closed.status === "closed" && closed.receipt.lines[0].qty === 2);
  check("closed table cannot be edited", (await req("PUT", "/api/orders/" + id, { revision: 2, items: [], owner: "เอก" })).status === 409);
  const next = await req("POST", "/api/orders", { tableNo });
  check("table number reusable with a new bill", next.status === 200 && next.data.billID !== opened.data.billID);
  const raceOpen = await Promise.all([req("POST", "/api/orders", { tableNo: secondTable }), req("POST", "/api/orders", { tableNo: secondTable })]);
  check("concurrent table opening has one winner", raceOpen.filter(r => r.status === 200).length === 1 && raceOpen.filter(r => r.status === 409).length === 1);
  const voucherOrder = (await req("POST", "/api/orders", { tableNo: thirdTable })).data;
  await req("PUT", "/api/orders/" + voucherOrder.id, { revision: 0, items: [{ itemID, qty: 1 }], owner: "เอก" });
  check("invalid voucher checkout rejected", (await req("POST", "/api/orders/" + voucherOrder.id + "/checkout", { revision: 1, paymentType: "Voucher", voucherId: -1 })).status === 400);
  check("failed checkout keeps table open and stock intact", (await req("GET", "/api/orders/" + voucherOrder.id)).data.status === "open" && (await req("GET", "/api/items/" + itemID)).data.Amount === 28);
  const savedBackup = (await req("GET", "/api/export")).data;
  check("backup restores active tables and history", (await req("POST", "/api/import", savedBackup)).status === 200);
  check("restored table contents match", JSON.stringify((await req("GET", "/api/export")).data.tables) === JSON.stringify(savedBackup.tables));
  const legacy = structuredClone(savedBackup); delete legacy.tables.TableOrders;
  check("legacy backup cannot silently discard open tables", (await req("POST", "/api/import", legacy)).status === 400);
} finally {
  assert.equal((await req("POST", "/api/import", snapshot)).status, 200, "restore test data");
}
console.log(`\n${passed} passed`);
