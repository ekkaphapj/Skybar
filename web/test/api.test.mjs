// Integration tests against a running dev/prod instance.
// Usage: BASE_URL=http://127.0.0.1:8787 [PIN=xxxx] node test/api.test.mjs
import { businessDate } from "../src/logic.ts";

const BASE = process.env.BASE_URL || "http://127.0.0.1:8787";
const credentials = { username: process.env.TEST_USERNAME || "admin", password: process.env.TEST_PASSWORD || "1234" };
let cookie = "";

let pass = 0, fail = 0;
function ok(label, cond, extra = "") {
  if (cond) { pass++; console.log(`  ok    ${label}`); }
  else { fail++; console.error(`  FAIL  ${label} ${extra}`); }
}
function eqn(label, actual, expected, eps = 0.005) {
  const a = Number(actual), e = Number(expected);
  ok(label, Number.isFinite(a) && Math.abs(a - e) < eps, `(got ${actual}, want ${expected})`);
}

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const biz = businessDate();
const bill = (tag) => tag + Date.now().toString().slice(-6);

console.log(`Target: ${BASE}  (business date: ${biz})`);
{
  const r = await req("POST", "/api/login", credentials);
  ok("login with account", r.status === 200 && r.data.ok);
}

console.log("== meta & item types ==");
{
  const r = await req("GET", "/api/meta");
  ok("meta ok", r.status === 200);
  eqn("only logged-in actor is selectable", r.data.sellers.length, 1);
  ok("payment types", JSON.stringify(r.data.paymentTypes) === JSON.stringify(["เงินสด", "โอน", "อื่นๆ", "Voucher"]));
  ok("session identifies seller", r.data.sellers[0] === r.data.user.displayName);
}
{
  const r = await req("GET", "/api/item-types");
  ok("item types loaded", r.status === 200 && r.data.length >= 5);
  ok("discount type seeded", r.data.some((t) => t.Name1 === "ส่วนลด"));
  globalThis.typeId = Object.fromEntries(r.data.map((t) => [t.Name1, t.ID]));
}

console.log("== add items (AddItem parity) ==");
async function addItem(body) { return req("POST", "/api/items", body); }
{
  const r1 = await addItem({ id: 1001, name: "โค้ก", itemTypeId: typeId["เครื่องดื่มไม่มีแอลกอฮอล์"], price: 25, amount: 10, owner: "โอปอ" });
  const r2 = await addItem({ id: 1002, name: "เบียร์ช้าง", itemTypeId: typeId["เครื่องดื่มแอลกอฮอล์"], price: 60, amount: 5, owner: "โอปอ" });
  const r3 = await addItem({ id: 1003, name: "ชาเย็น", itemTypeId: typeId["เครื่องดื่มไม่มีแอลกอฮอล์"], price: 30, amount: 8, owner: "เอก" });
  const r4 = await addItem({ id: 1000, name: "ส่วนลด 10%", itemTypeId: typeId["ส่วนลด"], price: 0.9, amount: 0, owner: "เอก" });
  ok("4 items created", [r1, r2, r3, r4].every((r) => r.status === 200));
  const dup = await addItem({ id: 1001, name: "ซ้ำ", itemTypeId: typeId["อาหาร"], price: 1, amount: 1, owner: "โอปอ" });
  ok("duplicate id rejected", dup.status === 400 && dup.data.error.includes("มีการบันทึกไว้แล้ว"));
  const noName = await addItem({ itemTypeId: typeId["อาหาร"], price: 1, amount: 1, owner: "โอปอ" });
  ok("missing name rejected", noName.status === 400);
}
{
  const r = await req("GET", "/api/items/1001");
  ok("get item by id (barcode)", r.status === 200 && r.data.Price === 25 && r.data.Amount === 10);
  const r404 = await req("GET", "/api/items/99999");
  ok("unknown item 404", r404.status === 404);
}

console.log("== stock: purchase / loss / expense / income (Stock.cs parity) ==");
{
  const p = await req("POST", "/api/stock/transaction", { action: "purchase", itemID: 1001, amount: 6, price: 120, paymentType: "เงินสด", owner: "โอปอ", place: "ตลาดหนองบัว", comment: "ซื้อครั้งแรก" });
  ok("purchase saved", p.status === 200);
  const s = await req("GET", "/api/items/1001");
  eqn("stock 1001 = 10+6 = 16", s.data.Amount, 16);
  const noPlace = await req("POST", "/api/stock/transaction", { action: "purchase", itemID: 1001, amount: 1, price: 1, paymentType: "เงินสด", owner: "โอปอ" });
  ok("purchase without place rejected", noPlace.status === 400);
}
{
  const l = await req("POST", "/api/stock/transaction", { action: "loss", itemID: 1001, amount: 2, owner: "โอปอ", comment: "ขวดแตก" });
  ok("loss saved", l.status === 200);
  const s = await req("GET", "/api/items/1001");
  eqn("stock 1001 = 16-2 = 14", s.data.Amount, 14);
}
{
  const e = await req("POST", "/api/stock/transaction", { action: "expense", price: 50, paymentType: "โอน", owner: "โอปอ", comment: "ค่าไฟ" });
  ok("expense saved", e.status === 200);
  const i = await req("POST", "/api/stock/transaction", { action: "income", price: 200, paymentType: "เงินสด", owner: "เอก", comment: "เงินเข้าอื่น" });
  ok("income saved", i.status === 200);
}
{
  const r = await req("GET", "/api/cash/total");
  eqn("cash total = -120 + 200 = 80", r.data.total, 80);
}

console.log("== sell: cash (SellForm parity) ==");
const B1 = bill("91");
{
  const r = await req("POST", "/api/sell", { items: [{ itemID: 1001, qty: 2 }, { itemID: 1003, qty: 1 }], paymentType: "เงินสด", owner: "โอปอ", billID: B1, roomNo: "205", cusName: "คุณสมชาย", shopType: 0 });
  ok("cash sell saved", r.status === 200, JSON.stringify(r.data));
  eqn("total = 2*25 + 30 = 80", r.data.total, 80);
  eqn("line1 price 50", r.data.lines[0].price, 50);
  eqn("line2 price 30", r.data.lines[1].price, 30);
  ok("business date on rows", r.data.date === biz);
  const s1 = await req("GET", "/api/items/1001");
  const s2 = await req("GET", "/api/items/1003");
  eqn("stock 1001 = 12", s1.data.Amount, 12);
  eqn("stock 1003 = 7", s2.data.Amount, 7);
  const cash = await req("GET", "/api/cash/total");
  eqn("cash cumulative = 80+80 = 160", cash.data.total, 160);
  const rc = await req("GET", "/api/sell/receipt/" + B1);
  ok("receipt lookup 2 rows", rc.status === 200 && rc.data.rows.length === 2);
  eqn("receipt total 80", rc.data.total, 80);
}

console.log("== sell: discount line (ส่วนลด parity) ==");
const B2 = bill("92");
{
  // Correct the original floating-point bug: 10% of 60 must discount 6 baht.
  const r = await req("POST", "/api/sell", { items: [{ itemID: 1002, qty: 1 }, { itemID: 1000, qty: 1 }], paymentType: "โอน", owner: "แพรว", billID: B2, cusName: "Mini Mart", shopType: 1 });
  ok("discount sell saved", r.status === 200, JSON.stringify(r.data));
  eqn("beer line 60", r.data.lines[0].price, 60);
  eqn("discount line = -6", r.data.lines[1].price, -6);
  eqn("total = 54", r.data.total, 54);
  const s = await req("GET", "/api/items/1002");
  eqn("stock 1002 = 4", s.data.Amount, 4);
  const cash = await req("GET", "/api/cash/total");
  eqn("cash unchanged (โอน) = 160", cash.data.total, 160);
}

console.log("== voucher (VoucherForm parity) ==");
let vcId;
{
  const g = await req("POST", "/api/vouchers", { date: biz, count: 3 });
  ok("3 vouchers created", g.status === 200 && g.data.ids.length === 3);
  vcId = g.data.ids[0];
  const chk = await req("GET", "/api/vouchers/check/" + vcId);
  ok("voucher usable", chk.data.ok === true);
  const chkBad = await req("GET", "/api/vouchers/check/123456");
  ok("unknown voucher not usable", chkBad.data.ok === false);
}
const B3 = bill("93");
{
  const r = await req("POST", "/api/sell", { items: [{ itemID: 1003, qty: 1 }], paymentType: "Voucher", owner: "ดรีม", billID: B3, voucherId: vcId, shopType: 0 });
  ok("voucher sell saved", r.status === 200, JSON.stringify(r.data));
  eqn("voucher sell qty 1", r.data.lines[0].qty, 1);
  const rc = await req("GET", "/api/sell/receipt/" + B3);
  ok("voucher sell stored price 0", rc.status === 200 && rc.data.rows[0].Price === 0);
  ok("voucher sell stored amount 1", rc.data.rows[0].Amount === 1);
  const chk = await req("GET", "/api/vouchers/check/" + vcId);
  ok("voucher marked used", chk.data.ok === false);
  const reuse = await req("POST", "/api/sell", { items: [{ itemID: 1003, qty: 1 }], paymentType: "Voucher", owner: "ดรีม", billID: bill("94"), voucherId: vcId, shopType: 0 });
  ok("reuse rejected", reuse.status === 400);
  const s = await req("GET", "/api/items/1003");
  eqn("stock 1003 = 6", s.data.Amount, 6);
  // fresh unused voucher for limit tests
  const g2 = await req("POST", "/api/vouchers", { date: biz, count: 1 });
  const v2 = g2.data.ids[0];
  const overLimit = await req("POST", "/api/sell", { items: [{ itemID: 1002, qty: 1 }], paymentType: "Voucher", owner: "ดรีม", billID: bill("95"), voucherId: v2, shopType: 0 });
  ok("voucher over 30 baht rejected", overLimit.status === 400);
  const multi = await req("POST", "/api/sell", { items: [{ itemID: 1001, qty: 1 }, { itemID: 1003, qty: 1 }], paymentType: "Voucher", owner: "ดรีม", billID: bill("96"), voucherId: v2, shopType: 0 });
  ok("multi-item voucher rejected", multi.status === 400);
}

console.log("== cash deposit (CashDepositForm parity) ==");
{
  const d = await req("POST", "/api/cash/deposit", { amount: 50 });
  ok("deposit saved", d.status === 200);
  const cash = await req("GET", "/api/cash/total");
  eqn("cash = 160 - 50 = 110", cash.data.total, 110);
  const bad = await req("POST", "/api/cash/deposit", { amount: -5 });
  ok("negative deposit rejected", bad.status === 400);
}

console.log("== report (ReportForm parity) ==");
{
  const r = await req("GET", `/api/report?from=${biz}&to=${biz}`);
  ok("report ok", r.status === 200, JSON.stringify(r.data).slice(0, 300));
  eqn("totalIncome (sell grid) = 80+54 = 134", r.data.totalIncome, 134);
  eqn("sums.cost (รายจ่าย) = 120+50 = 170", r.data.sums.cost, 170);
  eqn("sums.cashIn = 200+80 = 280", r.data.sums.cashIn, 280);
  eqn("sums.transferIn = 54", r.data.sums.transferIn, 54);
  eqn("sellSums.cash = 80", r.data.sellSums.cash, 80);
  eqn("sellSums.transfer = 54", r.data.sellSums.transfer, 54);
  eqn("totalCashCumulative = 110", r.data.totalCashCumulative, 110);
  eqn("monthlySell = 200+80+54 = 334", r.data.sums.monthlySell, 334);
  eqn("monthlyCost = 170", r.data.sums.monthlyCost, 170);
  eqn("profit (monthly) = 164", r.data.profit, 164);
  eqn("voucher issued = 4 (3+1 จากชุดทดสอบ limit)", r.data.voucher.issued, 4);
  eqn("voucher used = 1", r.data.voucher.used, 1);
  const coke = r.data.sellByDate.find((x) => x.name === "โค้ก");
  eqn("report coke qty 2", coke.qty, 2);
  eqn("report coke total 50", coke.total, 50);
  const disc = r.data.sellByDate.find((x) => x.name === "ส่วนลด 10%");
  eqn("discount row -6", disc.total, -6);
  ok("bad range rejected", (await req("GET", "/api/report?from=2026-10-25&to=2026-10-20")).status === 400);
}

console.log("== receipt lookup 404 ==");
{
  const r = await req("GET", "/api/sell/receipt/notexist999");
  ok("unknown bill 404", r.status === 404);
}

console.log("== export ==");
{
  const r = await req("GET", "/api/export");
  ok("export has 9 tables including table orders", Object.keys(r.data.tables).length === 9);
  eqn("export items >= 4", r.data.tables.Items.length, 4);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
