import { Hono, type Context } from "hono";
import {
  PAYMENT_TYPES,
  DISCOUNT_TYPE_NAME,
  VOUCHER_MAX_TOTAL,
  businessDate,
  nowTime,
  money,
  discountAmount,
  isValidDate,
} from "./logic";

import { installAuth, type AppEnv as Env } from "./auth";
const app = new Hono<Env>();
installAuth(app);

/* ------------------------------ helpers ------------------------------ */

interface SellLine {
  itemID: number;
  name: string;
  typeName: string;
  qty: number;
  price: number; // final stored line price (negative for discount lines)
}

const bad = (c: any, msg: string, code = 400) => c.json({ error: msg }, code);

/* ------------------------------ meta ------------------------------ */

app.get("/api/meta", (c) =>
  c.json({
    sellers: [c.get("user").displayName],
    user: c.get("user"),
    paymentTypes: PAYMENT_TYPES,
    shopTypes: [
      { id: 0, label: "THE COTTAGE SKY BAR" },
      { id: 1, label: "THE COTTAGE MINI MART" },
    ],
    today: businessDate(),
    time: nowTime(),
  })
);

async function nextBillId(db: D1Database): Promise<string> {
  // Reserve centrally before checking historical bills. Legacy numeric IDs can
  // be very large, so skip collisions rather than starting after their maximum.
  for (;;) {
    const row = await db.prepare("UPDATE BillSequence SET LastValue = LastValue + 1 WHERE ID = 1 RETURNING LastValue").first<{ LastValue: number }>();
    if (!row) throw new Error("ไม่พบลำดับเลขบิล");
    const id = String(row.LastValue);
    const used = await db.prepare(`SELECT 1 FROM TableOrders WHERE BillID = ?
      UNION ALL SELECT 1 FROM Sell WHERE OrderID = ?
      UNION ALL SELECT 1 FROM Account WHERE BillID = ?
      UNION ALL SELECT 1 FROM StockTransaction WHERE BillID = ? LIMIT 1`).bind(id, id, id, id).first();
    if (!used) return id;
  }
}

app.get("/api/billid", async (c) => c.json({ billID: await nextBillId(c.env.DB) }));

app.get("/api/dashboard", async (c) => {
  const date = businessDate();
  const [sales, hourly, popular, accountTotals, tableVisits] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COALESCE(SUM(Price), 0) AS total, COUNT(DISTINCT OrderID) AS bills FROM Sell WHERE Date1 = ?").bind(date),
    c.env.DB.prepare("SELECT CAST(substr(Time1, 1, 2) AS INTEGER) AS hour, SUM(Price) AS total FROM Sell WHERE Date1 = ? GROUP BY hour").bind(date),
    c.env.DB.prepare(`SELECT i.Name1 AS name, SUM(s.Amount) AS qty, SUM(s.Price) AS total FROM Sell s
      JOIN Items i ON i.ID = s.ItemID JOIN ItemType t ON t.ID = i.ItemTypeID
      WHERE s.Date1 = ? AND t.Name1 <> ? GROUP BY i.ID ORDER BY qty DESC, i.ID LIMIT 4`).bind(date, DISCOUNT_TYPE_NAME),
    c.env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN Type = 'รายรับ' THEN Amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN Type = 'รายจ่าย' THEN Amount ELSE 0 END), 0) AS expense FROM Account WHERE Date1 = ?`).bind(date),
    // Bangkok UTC+7 with the business-day cutoff at 02:00 = UTC + 5 hours.
    c.env.DB.prepare(`SELECT COUNT(CASE WHEN date(OpenedAt, '+5 hours') = ? THEN 1 END) AS todayTables,
      COUNT(CASE WHEN Status = 'open' THEN 1 END) AS activeTables FROM TableOrders`).bind(date),
  ]);
  return c.json({ date, revenue: money(Number(sales.results[0]?.total || 0)), bills: Number(sales.results[0]?.bills || 0),
    dailyIncome: money(Number(accountTotals.results[0]?.income || 0)), dailyExpense: money(Number(accountTotals.results[0]?.expense || 0)),
    todayTables: Number(tableVisits.results[0]?.todayTables || 0), activeTables: Number(tableVisits.results[0]?.activeTables || 0),
    hourly: hourly.results, popular: popular.results, updatedAt: new Date().toISOString() });
});

/* ------------------------------ item types & items ------------------------------ */

app.get("/api/item-types", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT ID, Name1 FROM ItemType ORDER BY ID").all();
  return c.json(results);
});

app.post("/api/item-types", async (c) => {
  const { name } = await c.req.json().catch(() => ({ name: undefined }));
  if (!name || !String(name).trim()) return bad(c, "ใส่ชื่อประเภทสินค้า");
  try {
    const r = await c.env.DB.prepare("INSERT INTO ItemType (Name1) VALUES (?)").bind(String(name).trim()).run();
    return c.json({ ok: true, id: r.meta.last_row_id });
  } catch {
    return bad(c, "มีประเภทสินค้านี้อยู่แล้ว");
  }
});

app.get("/api/items", async (c) => {
  const typeName = c.req.query("typeName");
  let sql = `SELECT i.ID, i.Name1, i.Price, t.Name1 AS TypeName, IFNULL(s.Amount, 0) AS Amount
             FROM Items i JOIN ItemType t ON i.ItemTypeID = t.ID LEFT JOIN Stock s ON s.ItemID = i.ID`;
  const binds: unknown[] = [];
  if (typeName) {
    sql += " WHERE t.Name1 = ?";
    binds.push(typeName);
  }
  sql += " ORDER BY t.ID, i.Name1";
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json(results);
});

app.get("/api/items/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return bad(c, "รหัสสินค้าไม่ถูกต้อง");
  const row = await c.env.DB.prepare(
    `SELECT i.ID, i.Name1, i.Price, t.Name1 AS TypeName, IFNULL(s.Amount, 0) AS Amount
     FROM Items i JOIN ItemType t ON i.ItemTypeID = t.ID LEFT JOIN Stock s ON s.ItemID = i.ID
     WHERE i.ID = ?`
  )
    .bind(id)
    .first();
  if (!row) return bad(c, "ไม่พบสินค้า หรือรหัสสินค้าไม่ถูกต้อง", 404);
  return c.json(row);
});

app.post("/api/items", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim();
  const itemTypeId = Number(b.itemTypeId);
  const price = Number(b.price);
  const amount = Number(b.amount ?? 0);
  const owner = c.get("user").displayName;
  let id = Number(b.id);

  if (!name) return bad(c, "ใส่ชื่อสินค้า");
  if (!Number.isInteger(itemTypeId)) return bad(c, "เลือกประเภทสินค้า");
  const type = await c.env.DB.prepare("SELECT ID FROM ItemType WHERE ID = ?").bind(itemTypeId).first();
  if (!type) return bad(c, "เลือกประเภทสินค้า");
  if (!Number.isFinite(price) || price < 0) return bad(c, "ใส่ราคาสินค้าไม่ถูกต้อง");
  if (!Number.isInteger(amount) || amount < 0) return bad(c, "ใส่จำนวนสินค้าไม่ถูกต้อง");

  if (Number.isInteger(id) && id > 0) {
    const dup = await c.env.DB.prepare("SELECT COUNT(ID) AS n FROM Items WHERE ID = ?").bind(id).first();
    if (Number(dup?.n) > 0) return bad(c, "รหัสสินค้านี้มีการบันทึกไว้แล้ว");
  } else {
    id = undefined as unknown as number; // auto-assign
  }

  const today = businessDate();
  const time = nowTime();
  const stmts: D1PreparedStatement[] = [];
  const itemStmt = Number.isInteger(id)
    ? c.env.DB.prepare("INSERT INTO Items (ID, Name1, ItemTypeID, Date1, Owner, Price) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, name, itemTypeId, today, owner, price)
    : c.env.DB.prepare("INSERT INTO Items (Name1, ItemTypeID, Date1, Owner, Price) VALUES (?, ?, ?, ?, ?)")
        .bind(name, itemTypeId, today, owner, price);
  stmts.push(itemStmt);
  stmts.push(
    Number.isInteger(id)
      ? c.env.DB.prepare("INSERT INTO Stock (ItemID, Amount, Date1, Time1) VALUES (?, ?, ?, ?)").bind(id, amount, today, time)
      : c.env.DB.prepare(
          "INSERT INTO Stock (ItemID, Amount, Date1, Time1) VALUES ((SELECT MAX(ID) FROM Items), ?, ?, ?)"
        ).bind(amount, today, time)
  );
  const results = await c.env.DB.batch(stmts);
  const finalId = Number(results[0].meta.last_row_id);
  return c.json({ ok: true, id: finalId });
});

/* ------------------------------ stock ------------------------------ */

app.get("/api/stock", async (c) => {
  const typeName = c.req.query("typeName");
  let sql = `SELECT i.ID AS itemCode, i.Name1 AS name, IFNULL(s.Amount,0) AS amount, s.Date1 AS date, s.Time1 AS time
             FROM Items i JOIN ItemType t ON i.ItemTypeID = t.ID LEFT JOIN Stock s ON s.ItemID = i.ID`;
  const binds: unknown[] = [];
  if (typeName) {
    sql += " WHERE t.Name1 = ?";
    binds.push(typeName);
  }
  sql += " ORDER BY t.Name1, i.Name1";
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json(results);
});

app.get("/api/stock/transactions", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM StockTransaction ORDER BY ID DESC LIMIT 100"
  ).all();
  return c.json(results);
});

/**
 * Parity of Stock.cs:
 *  action 'purchase' (ซื้อเพิ่ม) -> StockTransaction + Account(รายจ่าย) + Stock += qty (+ CASH ถ้าเงินสด)
 *  action 'expense'  (รายจ่ายอื่นๆ) -> Account(รายจ่าย) (+ CASH ถ้าเงินสด)
 *  action 'income'   (รายรับอื่นๆ)  -> Account(รายรับ)  (+ CASH ถ้าเงินสด)
 *  action 'loss'     (สูญหาย/ทิ้ง)  -> StockTransaction(-qty) + Stock -= qty
 */
app.post("/api/stock/transaction", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const owner = c.get("user").displayName;
  const today = businessDate();
  const time = nowTime();


  const db = c.env.DB;
  const stmts: D1PreparedStatement[] = [];

  if (action === "purchase") {
    const itemID = Number(b.itemID);
    const amount = Number(b.amount);
    const price = Number(b.price);
    const paymentType = String(b.paymentType ?? "");
    const place = String(b.place ?? "").trim();
    const comment = String(b.comment ?? "");
    let date2 = String(b.date2 ?? "");
    if (!isValidDate(date2)) date2 = today;

    if (!Number.isInteger(itemID) || itemID <= 0) return bad(c, "รหัสสินค้าไม่ถูกต้อง");
    if (!Number.isInteger(amount) || amount <= 0) return bad(c, "จำนวนสินค้าไม่ถูกต้อง");
    if (!Number.isFinite(price) || price < 0) return bad(c, "ราคาสินค้าไม่ถูกต้อง");
    if (!place) return bad(c, "ใส่สถานที่ด้วย");
    if (!PAYMENT_TYPES.slice(0, 3).includes(paymentType)) return bad(c, "เลือกวิธีชำระเงิน");
    const item = await db.prepare("SELECT Name1 FROM Items WHERE ID = ?").bind(itemID).first();
    if (!item) return bad(c, "ไม่พบรหัสสินค้านี้");

    const list = `รายการซื้อของ ${item.Name1} จำนวน ${amount} ชิ้น`;
    stmts.push(
      db.prepare(
        `INSERT INTO StockTransaction (TransactionType, Amount, Price, DateRecord, Date2, Place, ItemID, PaymentType, Owner, Comment)
         VALUES ('ซื้อเพิ่ม', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(amount, price, today, date2, place, itemID, paymentType, owner, comment),
      db.prepare(
        `INSERT INTO Account (Date1, PaymentType, Amount, Type, BillID, StockTransactionID, List, Owner)
         VALUES (?, ?, ?, 'รายจ่าย', '055', (SELECT MAX(ID) FROM StockTransaction), ?, ?)`
      ).bind(date2, paymentType, price, list, owner),
      db.prepare("UPDATE Stock SET Amount = Amount + ?, Date1 = ?, Time1 = ? WHERE ItemID = ?").bind(amount, today, time, itemID)
    );
    if (paymentType === "เงินสด") {
      stmts.push(
        db.prepare(
          `INSERT INTO CASH (Date1, Type1, List, Time1, Amount, AccountID, Owner)
           VALUES (?, 'รายจ่าย', ?, ?, ?, (SELECT MAX(ID) FROM Account), ?)`
        ).bind(date2, list, time, -price, owner)
      );
    }
  } else if (action === "expense" || action === "income") {
    const price = Number(b.price);
    const paymentType = String(b.paymentType ?? "");
    const comment = String(b.comment ?? "").trim();
    if (!Number.isFinite(price) || price <= 0) return bad(c, "ใส่จำนวนเงินไม่ถูกต้อง");
    if (!comment) return bad(c, "ใส่รายการ");
    if (!PAYMENT_TYPES.slice(0, 3).includes(paymentType)) return bad(c, "เลือกวิธีชำระเงิน");
    const isIncome = action === "income";
    const list = `${isIncome ? "รายรับ" : "รายจ่าย"} ${comment} เป็นเงินจำนวน ${price} บาท`;
    stmts.push(
      db.prepare(
        `INSERT INTO Account (Date1, PaymentType, Amount, Type, List, Owner) VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(today, paymentType, price, isIncome ? "รายรับ" : "รายจ่าย", list, owner)
    );
    if (paymentType === "เงินสด") {
      stmts.push(
        db.prepare(
          `INSERT INTO CASH (Date1, Type1, List, Time1, Amount, AccountID, Owner)
           VALUES (?, ?, ?, ?, ?, (SELECT MAX(ID) FROM Account), ?)`
        ).bind(today, isIncome ? "รายรับ" : "รายจ่าย", list, time, isIncome ? price : -price, owner)
      );
    }
  } else if (action === "loss") {
    const itemID = Number(b.itemID);
    const amount = Number(b.amount);
    const comment = String(b.comment ?? "");
    if (!Number.isInteger(itemID) || itemID <= 0) return bad(c, "รหัสสินค้าไม่ถูกต้อง");
    if (!Number.isInteger(amount) || amount <= 0) return bad(c, "จำนวนสินค้าไม่ถูกต้อง");
    const item = await db.prepare("SELECT Name1 FROM Items WHERE ID = ?").bind(itemID).first();
    if (!item) return bad(c, "ไม่พบรหัสสินค้านี้");
    stmts.push(
      db.prepare(
        `INSERT INTO StockTransaction (TransactionType, Amount, Price, DateRecord, Date2, Place, ItemID, PaymentType, Owner, Comment)
         VALUES ('สูญหาย/ทิ้ง', ?, 0, ?, ?, NULL, ?, 'none', ?, ?)`
      ).bind(-amount, today, today, itemID, owner, comment),
      db.prepare("UPDATE Stock SET Amount = Amount - ?, Date1 = ?, Time1 = ? WHERE ItemID = ?").bind(amount, today, time, itemID)
    );
  } else {
    return bad(c, "เลือกรายการที่ต้องการบันทึก");
  }

  await db.batch(stmts);
  return c.json({ ok: true });
});

/* ------------------------------ cash ------------------------------ */

app.get("/api/cash/total", async (c) => {
  let date = c.req.query("date");
  if (!isValidDate(date)) date = businessDate();
  const row = await c.env.DB.prepare("SELECT SUM(Amount) AS total FROM CASH WHERE Date1 <= ?").bind(date).first();
  return c.json({ date, total: money(Number(row?.total ?? 0)) });
});

app.post("/api/cash/deposit", async (c) => {
  const { amount } = await c.req.json().catch(() => ({ amount: undefined }));
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return bad(c, "ใส่จำนวนเงินไม่ถูกต้อง");
  const today = businessDate();
  const result = await c.env.DB.prepare(
    `INSERT INTO CASH (Date1, Type1, List, Time1, Amount, Owner)
     SELECT ?, 'ตัดจ่าย', 'ตัดจ่ายเงินสด', ?, ?, ?
     WHERE ? <= (SELECT COALESCE(SUM(Amount), 0) FROM CASH WHERE Date1 <= ?)`
  )
    .bind(today, nowTime(), -n, c.get("user").displayName, n, today)
    .run();
  if (!result.meta.changes) return bad(c, "ตัดจ่ายมากกว่าเงินที่มีไม่ได้");
  return c.json({ ok: true });
});

/* ------------------------------ vouchers ------------------------------ */

app.get("/api/vouchers", async (c) => {
  let date = c.req.query("date");
  if (!isValidDate(date)) date = businessDate();
  const { results } = await c.env.DB.prepare("SELECT ID, Date1, Status FROM VOUCHER WHERE Date1 = ? ORDER BY ID").bind(date).all();
  return c.json(results ?? []);
});

app.post("/api/vouchers", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  let date = String(b.date ?? "");
  if (!isValidDate(date)) date = businessDate();
  const count = Number(b.count);
  if (!Number.isInteger(count) || count < 1 || count > 200) return bad(c, "จำนวน Voucher ต้องอยู่ระหว่าง 1-200");

  const { results: existing } = await c.env.DB.prepare("SELECT ID FROM VOUCHER").all();
  const used = new Set<number>((existing ?? []).map((r: any) => Number(r.ID)));
  const created: number[] = [];
  const stmts: D1PreparedStatement[] = [];
  while (created.length < count) {
    const id = 100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
    if (used.has(id)) continue;
    used.add(id);
    created.push(id);
    stmts.push(c.env.DB.prepare("INSERT INTO VOUCHER (ID, Date1, Status, Owner) VALUES (?, ?, 0, ?)").bind(id, date, c.get("user").displayName));
  }
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, date, ids: created });
});

app.get("/api/vouchers/check/:id", async (c) => {
  const id = Number(c.req.param("id"));
  let date = c.req.query("date");
  if (!isValidDate(date)) date = businessDate();
  if (!Number.isInteger(id) || id <= 0) return c.json({ ok: false, reason: "เลข Voucher ไม่ถูกต้อง" });
  const row = await c.env.DB.prepare("SELECT Status FROM VOUCHER WHERE ID = ? AND Date1 = ?").bind(id, date).first();
  const ok = !!row && Number(row.Status) === 0;
  return c.json({ ok, reason: ok ? undefined : "Voucher นี้ไม่สามารถใช้ในวันนี้ได้" });
});

/* ------------------------------ sell (POS) ------------------------------ */

function orderView(row: any) {
  return {
    id: row.ID, tableNo: row.TableNo, cusName: row.CustomerName, openedBy: row.OpenedBy, closedBy: row.ClosedBy,
    guestCount: Number(row.GuestCount || 1),
    shopType: row.ShopType, billID: row.BillID, status: row.Status,
    items: JSON.parse(row.ItemsJSON), owner: row.Owner, roomNo: row.RoomNo,
    revision: row.Revision, openedAt: row.OpenedAt, closedAt: row.ClosedAt,
    date: row.BusinessDate, paymentType: row.PaymentType, total: row.Total,
    receipt: row.ReceiptJSON ? JSON.parse(row.ReceiptJSON) : null,
  };
}

app.get("/api/orders", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM TableOrders WHERE Status = 'open' ORDER BY TableNo").all();
  return c.json(results.map(orderView));
});

app.get("/api/orders/history", async (c) => {
  const from = c.req.query("from"), to = c.req.query("to");
  const offset = Number(c.req.query("offset") || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) return bad(c, "หน้าประวัติไม่ถูกต้อง");
  if ((from && !isValidDate(from)) || (to && !isValidDate(to)) || (from && to && from > to)) return bad(c, "เลือกวันที่ไม่ถูกต้อง");
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM TableOrders WHERE Status = 'closed'
     AND (? = '' OR BusinessDate >= ?) AND (? = '' OR BusinessDate <= ?)
     ORDER BY ClosedAt DESC, ID DESC LIMIT 51 OFFSET ?`
  ).bind(from || "", from || "", to || "", to || "", offset).all();
  return c.json({ orders: results.slice(0, 50).map(orderView), hasMore: results.length > 50 });
});

app.post("/api/orders", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const tableNo = Number(b.tableNo), shopType = Number(b.shopType ?? 0);
  const cusName = String(b.cusName ?? "").trim();
  const guestCount = b.guestCount === undefined || b.guestCount === null || b.guestCount === "" ? 1 : Number(b.guestCount);
  if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 5 || typeof b.guestCount === "boolean") return bad(c, "เลือกจำนวนลูกค้า 1–5 คน");
  if (!Number.isInteger(tableNo) || tableNo < 1 || tableNo > 20) return bad(c, "เลือกโต๊ะ 1–20");
  if (![0, 1].includes(shopType) || cusName.length > 200) return bad(c, "ข้อมูลเปิดการขายไม่ถูกต้อง");
  const id = crypto.randomUUID(), billID = await nextBillId(c.env.DB);
  try {
    await c.env.DB.prepare(
      "INSERT INTO TableOrders (ID, TableNo, CustomerName, ShopType, BillID, OpenedAt, Owner, OpenedBy, GuestCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, tableNo, cusName, shopType, billID, new Date().toISOString(), c.get("user").displayName, c.get("user").displayName, guestCount).run();
  } catch (err) {
    if (String(err).includes("UNIQUE constraint failed: TableOrders.TableNo")) return bad(c, "โต๊ะนี้เปิดการขายอยู่แล้ว กรุณาเปิดจากรายการโต๊ะ", 409);
    throw err;
  }
  return c.json(orderView(await c.env.DB.prepare("SELECT * FROM TableOrders WHERE ID = ?").bind(id).first()));
});

app.get("/api/orders/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM TableOrders WHERE ID = ?").bind(c.req.param("id")).first();
  if (!row) return bad(c, "ไม่พบรายการโต๊ะ", 404);
  return c.json(orderView(row));
});

app.put("/api/orders/:id", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const revision = Number(b.revision), items = b.items;
  const cusName = String(b.cusName ?? "").trim(), owner = c.get("user").displayName;
  const roomNo = Number(b.roomNo || 0);
  if (!Number.isSafeInteger(revision) || revision < 0 || !Array.isArray(items) || items.length > 100 || cusName.length > 200 ||
      !Number.isSafeInteger(roomNo)) return bad(c, "ข้อมูลโต๊ะไม่ถูกต้อง");
  if (items.some((it) => !it || !Number.isSafeInteger(Number(it.itemID)) || Number(it.itemID) <= 0 ||
      !Number.isSafeInteger(Number(it.qty)) || Number(it.qty) < 1 || Number(it.qty) > 9999)) return bad(c, "รายการสินค้าไม่ถูกต้อง");
  const normalized = [];
  let total = 0;
  if (items.length) {
    const ids = [...new Set(items.map((it) => Number(it.itemID)))];
    const { results } = await c.env.DB.prepare(
      `SELECT i.ID, i.Name1, i.Price, t.Name1 AS TypeName FROM Items i JOIN ItemType t ON i.ItemTypeID = t.ID WHERE i.ID IN (${ids.map(() => "?").join(",")})`
    ).bind(...ids).all();
    const catalog = new Map(results.map((row) => [Number(row.ID), row]));
    for (const it of items) {
      const row = catalog.get(Number(it.itemID));
      if (!row) return bad(c, "ไม่พบสินค้าในรายการ");
      const isDiscount = row.TypeName === DISCOUNT_TYPE_NAME;
      const qty = isDiscount ? 1 : Number(it.qty);
      const price = isDiscount ? -discountAmount(total, Number(row.Price)) : money(qty * Number(row.Price));
      total = money(total + price);
      normalized.push({ itemID: Number(row.ID), name: String(row.Name1), typeName: String(row.TypeName), unitPrice: Number(row.Price), qty, price });
    }
  }
  const result = await c.env.DB.prepare(
    `UPDATE TableOrders SET ItemsJSON = ?, CustomerName = ?, Owner = ?, RoomNo = ?, Total = ?, Revision = Revision + 1
     WHERE ID = ? AND Status = 'open' AND Revision = ?`
  ).bind(JSON.stringify(normalized), cusName, owner, roomNo, total, c.req.param("id"), revision).run();
  if (!result.meta.changes) return bad(c, "โต๊ะนี้ถูกแก้ไขหรือเช็คบิลจากอีกหน้าจอ กรุณาโหลดโต๊ะใหม่", 409);
  return c.json({ ok: true, revision: revision + 1, total, items: normalized });
});

app.post("/api/orders/:id/cancel", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!Number.isSafeInteger(b.revision) || b.revision < 0) return bad(c, "ข้อมูลโต๊ะไม่ถูกต้อง");
  const result = await c.env.DB.prepare(
    "DELETE FROM TableOrders WHERE ID = ? AND Status = 'open' AND Revision = ?"
  ).bind(c.req.param("id"), b.revision).run();
  if (!result.meta.changes) return bad(c, "โต๊ะนี้ถูกแก้ไข ยกเลิก หรือเช็คบิลแล้ว กรุณาโหลดโต๊ะใหม่", 409);
  return c.json({ ok: true });
});

app.post("/api/orders/:id/checkout", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM TableOrders WHERE ID = ?").bind(c.req.param("id")).first();
  if (!row) return bad(c, "ไม่พบรายการโต๊ะ", 404);
  if (row.Status !== "open") return bad(c, "โต๊ะนี้เช็คบิลแล้ว กรุณาดูในประวัติการขาย", 409);
  const b = await c.req.json().catch(() => ({}));
  if (Number(b.revision) !== Number(row.Revision)) return bad(c, "ข้อมูลโต๊ะเปลี่ยนแล้ว กรุณาโหลดโต๊ะใหม่", 409);
  return completeSale(c, {
    items: JSON.parse(String(row.ItemsJSON)), billID: row.BillID,
    cusName: row.CustomerName, shopType: row.ShopType, owner: row.Owner, roomNo: row.RoomNo,
    paymentType: b.paymentType, voucherId: b.voucherId,
  }, row);
});

app.post("/api/sell", async (c) => completeSale(c, await c.req.json().catch(() => ({}))));

async function completeSale(c: Context<Env>, b: any, order?: any) {
  const itemsReq: any[] = Array.isArray(b.items) ? b.items : [];
  const paymentType = String(b.paymentType ?? "");
  const owner = c.get("user").displayName;
  const billID = String(b.billID ?? "").trim();
  const roomNoRaw = b.roomNo;
  const cusName = String(b.cusName ?? "");
  const voucherId = b.voucherId != null && b.voucherId !== "" ? Number(b.voucherId) : null;

  if (!billID) return bad(c, "เปิดการขายก่อน (ไม่มีเลขบิล)");
  if (!PAYMENT_TYPES.includes(paymentType)) return bad(c, "เลือกวิธีการชำระเงิน");
  if (itemsReq.length < 1) return bad(c, "ไม่มีรายการสินค้า");
  let roomNo = 0;
  if (roomNoRaw != null && String(roomNoRaw).trim() !== "") {
    roomNo = Number(roomNoRaw);
    if (!Number.isInteger(roomNo)) return bad(c, "ใส่เลขห้องพักไม่ถูกต้อง");
  }

  // Load item data and compute lines exactly like the original POS
  const db = c.env.DB;
  const lines: SellLine[] = [];
  let total = 0;
  for (const it of itemsReq) {
    const itemID = Number(it.itemID);
    const qty = Number(it.qty);
    if (!Number.isInteger(itemID) || itemID <= 0) return bad(c, "รหัสสินค้าไม่ถูกต้อง");
    if (!Number.isInteger(qty) || qty < 1) return bad(c, "จำนวนสินค้าไม่ถูกต้อง");
    const row = await db
      .prepare(
        `SELECT i.ID, i.Name1, i.Price, t.Name1 AS TypeName FROM Items i JOIN ItemType t ON i.ItemTypeID = t.ID WHERE i.ID = ?`
      )
      .bind(itemID)
      .first();
    if (!row) return bad(c, `ไม่พบสินค้ารหัส ${itemID}`);

    if (row.TypeName === DISCOUNT_TYPE_NAME) {
      // Discount pseudo-item: price is the fraction to pay (e.g. 0.9 = 10% off the running total)
      const q = 1;
      const discount = discountAmount(total, Number(row.Price));
      total = money(total - discount);
      lines.push({ itemID, name: String(row.Name1), typeName: String(row.TypeName), qty: q, price: -discount });
    } else {
      const lineTotal = money(qty * Number(row.Price));
      total = money(total + lineTotal);
      lines.push({ itemID, name: String(row.Name1), typeName: String(row.TypeName), qty, price: lineTotal });
    }
  }

  const today = businessDate();
  const time = nowTime();
  const stmts: D1PreparedStatement[] = [];

  if (paymentType === "Voucher") {
    if (!Number.isInteger(voucherId) || voucherId <= 0) return bad(c, "ใส่รหัส Voucher");
    const v = await db.prepare("SELECT ID FROM VOUCHER WHERE ID = ? AND Date1 = ? AND Status = 0").bind(voucherId, today).first();
    if (!v) return bad(c, "คูปองไม่สามารถใช้ได้");
    if (lines.length > 1) return bad(c, "ใช้ Voucher ได้ทีละรายการเท่านั้น");
    if (lines[0].qty !== 1 || lines[0].typeName === DISCOUNT_TYPE_NAME) return bad(c, "ใช้ Voucher ได้กับสินค้า 1 ชิ้นเท่านั้น");
    if (total > VOUCHER_MAX_TOTAL) return bad(c, "ใช้ได้กับเครื่องดื่มไม่มีแอลกอฮอล์เท่านั้น (ราคาเกินกำหนด)");

    const first = lines[0];
    const list = `รายการใช้ Voucher หมายเลข ${voucherId} เป็นเงิน ${total} บาท หมายเลขบิล ${billID}`;
    stmts.push(
      db.prepare(
        `INSERT INTO Sell (Date1, Time1, ItemID, Amount, Price, PaymentType, OrderID, Owner, RoomNo, Cusname)
         VALUES (?, ?, ?, 1, 0, 'Voucher', ?, ?, ?, ?)`
      ).bind(today, time, first.itemID, billID, owner, roomNo, cusName),
      db.prepare(
        `INSERT INTO StockTransaction (TransactionType, Amount, Price, DateRecord, Date2, Place, ItemID, PaymentType, Owner, BillID)
         VALUES ('ขาย', 1, 0, ?, ?, 'ร้าน', ?, 'Voucher', ?, ?)`
      ).bind(today, time, first.itemID, owner, billID),
      db.prepare("UPDATE Stock SET Amount = Amount - 1, Date1 = ?, Time1 = ? WHERE ItemID = ?").bind(today, time, first.itemID),
      db.prepare(
        `INSERT INTO Account (Date1, Time1, PaymentType, Amount, Type, BillID, Owner, List)
         VALUES (?, ?, 'Voucher', 0, 'รายรับ', ?, ?, ?)`
      ).bind(today, time, billID, owner, list),
      db.prepare("UPDATE VOUCHER SET Status = 1 WHERE ID = ?").bind(voucherId)
    );
  } else {
    const list = `รายการขายสินค้า จำนวน ${lines.length} รายการ เป็นเงิน ${total} บาท หมายเลขบิล ${billID}`;
    for (const ln of lines) {
      stmts.push(
        db.prepare(
          `INSERT INTO Sell (Date1, Time1, ItemID, Amount, Price, PaymentType, OrderID, Owner, RoomNo, Cusname)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(today, time, ln.itemID, ln.qty, ln.price, paymentType, billID, owner, roomNo, cusName),
        db.prepare(
          `INSERT INTO StockTransaction (TransactionType, Amount, Price, DateRecord, Date2, Place, ItemID, PaymentType, Owner, BillID)
           VALUES ('ขาย', ?, ?, ?, ?, 'ร้าน', ?, ?, ?, ?)`
        ).bind(ln.qty, ln.price, today, time, ln.itemID, paymentType, owner, billID),
        db.prepare("UPDATE Stock SET Amount = Amount - ?, Date1 = ?, Time1 = ? WHERE ItemID = ?").bind(ln.qty, today, time, ln.itemID)
      );
    }
    stmts.push(
      db.prepare(
        `INSERT INTO Account (Date1, Time1, PaymentType, Amount, Type, BillID, Owner, List)
         VALUES (?, ?, ?, ?, 'รายรับ', ?, ?, ?)`
      ).bind(today, time, paymentType, total, billID, owner, list)
    );
    if (paymentType === "เงินสด") {
      stmts.push(
        db.prepare(
          `INSERT INTO CASH (Date1, Type1, List, Time1, Amount, AccountID, Owner)
           VALUES (?, 'รายรับ', ?, ?, ?, (SELECT MAX(ID) FROM Account), ?)`
        ).bind(today, list, time, total, owner)
      );
    }
  }

  const receipt = {
    ok: true, billID, date: today, time, shopType: Number(b.shopType ?? 0),
    cusName, roomNo, owner, paymentType, voucherId, tableNo: order?.TableNo ?? null,
    guestCount: Number(order?.GuestCount || 1),
    total: paymentType === "Voucher" ? 0 : total,
    lines: lines.map((l) => ({ name: l.name, qty: l.qty, price: paymentType === "Voucher" ? 0 : l.price })),
  };
  if (order) {
    // Abort the whole sale if cancellation deleted the order after checkout read it.
    // SQLite evaluates CASE lazily; invalid JSON deliberately fails the batch.
    stmts.unshift(db.prepare(
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM TableOrders WHERE ID = ?) THEN 1 ELSE json('order_conflict') END"
    ).bind(order.ID));
    stmts.unshift(db.prepare(
      `UPDATE TableOrders SET Status = 'closed', Revision = ?, ClosedAt = ?, BusinessDate = ?, PaymentType = ?, Total = ?, ReceiptJSON = ?, Owner = ?, ClosedBy = ? WHERE ID = ?`
    ).bind(Number(order.Revision) + 1, new Date().toISOString(), today, paymentType, receipt.total, JSON.stringify(receipt), owner, owner, order.ID));
  }
  try {
    await db.batch(stmts);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate_bill")) return bad(c, "เลขบิลนี้บันทึกแล้ว กรุณาค้นหาใบเสร็จเดิม", 409);
    if (message.includes("voucher_already_used")) return bad(c, "คูปองถูกใช้แล้ว");
    if (message.includes("order_conflict") || (order && message.includes("malformed JSON"))) return bad(c, "โต๊ะนี้ถูกแก้ไข ยกเลิก หรือเช็คบิลจากอีกหน้าจอ กรุณาโหลดโต๊ะใหม่", 409);
    throw err;
  }
  return c.json(receipt);
}

app.get("/api/sell/receipt/:billId", async (c) => {
  const billId = c.req.param("billId");
  const { results } = await c.env.DB.prepare(
    `SELECT s.Date1, s.Time1, s.ItemID, s.Amount, s.Price, s.PaymentType, s.OrderID, s.Owner, s.RoomNo, s.Cusname, i.Name1
     FROM Sell s JOIN Items i ON s.ItemID = i.ID WHERE s.OrderID = ? ORDER BY s.ID`
  )
    .bind(billId)
    .all();
  if (!results || results.length === 0) return bad(c, "ไม่พบเลขบิลนี้", 404);
  const total = money(results.reduce((s: number, r: any) => s + Number(r.Price), 0));
  return c.json({ billID: billId, rows: results, total });
});

/* ------------------------------ reports ------------------------------ */

// All reversal queries read their quantities inside the same atomic batch.
// A repeated/concurrent delete therefore cannot restore stock twice.
async function deleteBill(c: Context<Env>, billID: string) {
  const db = c.env.DB;
  const results = await db.batch([
    db.prepare(`UPDATE Stock SET Amount = Amount + (SELECT SUM(Amount) FROM Sell WHERE OrderID = ? AND ItemID = Stock.ItemID),
      Date1 = ?, Time1 = ? WHERE ItemID IN (SELECT ItemID FROM Sell WHERE OrderID = ?)`)
      .bind(billID, businessDate(), nowTime(), billID),
    // Older voucher bills store the voucher number in the account description.
    db.prepare(`UPDATE VOUCHER SET Status = 0 WHERE ID IN (
      SELECT CAST(substr(List, length('รายการใช้ Voucher หมายเลข ') + 1,
        instr(List, ' เป็นเงิน') - length('รายการใช้ Voucher หมายเลข ') - 1) AS INTEGER)
      FROM Account WHERE BillID = ? AND PaymentType = 'Voucher'
        AND substr(List, 1, length('รายการใช้ Voucher หมายเลข ')) = 'รายการใช้ Voucher หมายเลข '
        AND instr(List, ' เป็นเงิน') > length('รายการใช้ Voucher หมายเลข '))`).bind(billID),
    db.prepare("DELETE FROM CASH WHERE AccountID IN (SELECT ID FROM Account WHERE BillID = ? AND StockTransactionID IS NULL)").bind(billID),
    db.prepare("DELETE FROM Account WHERE BillID = ? AND StockTransactionID IS NULL").bind(billID),
    db.prepare("DELETE FROM StockTransaction WHERE BillID = ? AND TransactionType = 'ขาย'").bind(billID),
    db.prepare("DELETE FROM Sell WHERE OrderID = ?").bind(billID),
    db.prepare("DELETE FROM TableOrders WHERE BillID = ? AND Status = 'closed'").bind(billID),
  ]);
  if (!results[5].meta.changes && !results[6].meta.changes) return bad(c, "ไม่พบเลขบิลนี้ หรือถูกลบแล้ว", 404);
  return c.json({ ok: true });
}

app.delete("/api/sell/receipt/:billId", async (c) => deleteBill(c, c.req.param("billId")));

app.delete("/api/accounts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return bad(c, "รหัสรายการไม่ถูกต้อง");
  const db = c.env.DB;
  const row = await db.prepare("SELECT * FROM Account WHERE ID = ?").bind(id).first();
  if (!row) return bad(c, "ไม่พบรายการ หรือถูกลบแล้ว", 404);
  if (row.BillID && !row.StockTransactionID) return deleteBill(c, String(row.BillID));
  const results = await db.batch([
    db.prepare(`UPDATE Stock SET Amount = Amount - (SELECT t.Amount FROM StockTransaction t JOIN Account a ON a.StockTransactionID = t.ID
      WHERE a.ID = ? AND t.TransactionType = 'ซื้อเพิ่ม'), Date1 = ?, Time1 = ?
      WHERE ItemID IN (SELECT t.ItemID FROM StockTransaction t JOIN Account a ON a.StockTransactionID = t.ID
        WHERE a.ID = ? AND t.TransactionType = 'ซื้อเพิ่ม')`).bind(id, businessDate(), nowTime(), id),
    db.prepare("DELETE FROM CASH WHERE AccountID = ?").bind(id),
    db.prepare("DELETE FROM StockTransaction WHERE ID IN (SELECT StockTransactionID FROM Account WHERE ID = ?)").bind(id),
    db.prepare("DELETE FROM Account WHERE ID = ?").bind(id),
  ]);
  if (!results[3].meta.changes) return bad(c, "ไม่พบรายการ หรือถูกลบแล้ว", 404);
  return c.json({ ok: true });
});

app.get("/api/report/today", (c) => report(c, true));
app.get("/api/report", (c) => report(c));

async function report(c: Context<Env>, todayOnly = false) {
  const today = businessDate();
  const isAdmin = c.get("user").role === "admin";
  const from = todayOnly ? today : c.req.query("from");
  const to = todayOnly ? today : c.req.query("to");
  if (!isValidDate(from) || !isValidDate(to)) return bad(c, "เลือกวันที่ไม่ถูกต้อง");
  if (from > to) return bad(c, "เลือกวันที่ไม่ถูกต้อง");
  if (!isAdmin && from !== to) return bad(c, "พนักงานดูรายงานได้ครั้งละ 1 วันเท่านั้น", 403);
  const db = c.env.DB;

  const [stockRemaining, sellByDate, costByDate, cashTx, cashCum, sums, sellSums, voucherIssued, voucherUsed] = await Promise.all([
    db.prepare(
      `SELECT i.Name1 AS name, s.Amount AS amount FROM Stock s JOIN Items i ON s.ItemID = i.ID
       JOIN ItemType t ON t.ID = i.ItemTypeID WHERE t.Name1 <> ? ORDER BY s.Amount, i.ID`
    ).bind(DISCOUNT_TYPE_NAME).all(),
    db.prepare(
      `SELECT i.Name1 AS name, t.Name1 = 'ส่วนลด' AS isDiscount, SUM(s.Amount) AS qty, SUM(s.Price) AS total
       FROM Sell s JOIN Items i ON s.ItemID = i.ID JOIN ItemType t ON t.ID = i.ItemTypeID
       WHERE s.Date1 >= ? AND s.Date1 <= ? GROUP BY i.ID ORDER BY i.Name1, i.ID`
    ).bind(from, to).all(),
    db.prepare(
      `SELECT ID AS id, BillID AS billID, StockTransactionID AS stockTransactionID, Type AS type,
       List AS list, Amount AS amount, PaymentType AS paymentType, Date1 AS date, Owner AS owner
       FROM Account WHERE Date1 >= ? AND Date1 <= ? ORDER BY Type, ID`
    ).bind(from, to).all(),
    db.prepare(
      `SELECT Type1 AS type, Amount AS amount, List AS list, Date1 AS date FROM CASH
       WHERE Date1 >= ? AND Date1 <= ? ORDER BY Date1 DESC, ID DESC`
    ).bind(from, to).all(),
    db.prepare("SELECT SUM(Amount) AS t FROM CASH WHERE Date1 <= ?").bind(to).first(),
    (async () => {
      const [cashIn, transferIn, cost, monthlySell, monthlyCost] = await Promise.all([
        db.prepare(
          `SELECT SUM(Amount) AS t FROM Account WHERE Date1 >= ? AND Date1 <= ? AND Type='รายรับ' AND PaymentType='เงินสด'`
        ).bind(from, to).first(),
        db.prepare(
          `SELECT SUM(Amount) AS t FROM Account WHERE Date1 >= ? AND Date1 <= ? AND Type='รายรับ' AND PaymentType='โอน'`
        ).bind(from, to).first(),
        db.prepare(`SELECT SUM(Amount) AS t FROM Account WHERE Date1 >= ? AND Date1 <= ? AND Type='รายจ่าย'`).bind(from, to).first(),
        isAdmin ? db.prepare(
          `SELECT SUM(Amount) AS t FROM Account WHERE strftime('%m', Date1) = ? AND strftime('%Y', Date1) = ? AND Type='รายรับ'`
        )
          .bind(from.slice(5, 7), from.slice(0, 4))
          .first() : Promise.resolve(null),
        isAdmin ? db.prepare(
          `SELECT SUM(Amount) AS t FROM Account WHERE strftime('%m', Date1) = ? AND strftime('%Y', Date1) = ? AND Type='รายจ่าย'`
        )
          .bind(from.slice(5, 7), from.slice(0, 4))
          .first() : Promise.resolve(null),
      ]);
      return {
        cashIn: Number(cashIn?.t ?? 0),
        transferIn: Number(transferIn?.t ?? 0),
        cost: Number(cost?.t ?? 0),
        monthlySell: Number(monthlySell?.t ?? 0),
        monthlyCost: Number(monthlyCost?.t ?? 0),
      };
    })(),
    (async () => {
      const [cash, transfer] = await Promise.all([
        db.prepare(
          `SELECT SUM(Price) AS t FROM Sell WHERE Date1 >= ? AND Date1 <= ? AND PaymentType='เงินสด'`
        ).bind(from, to).first(),
        db.prepare(`SELECT SUM(Price) AS t FROM Sell WHERE Date1 >= ? AND Date1 <= ? AND PaymentType='โอน'`).bind(from, to).first(),
      ]);
      return { cash: Number(cash?.t ?? 0), transfer: Number(transfer?.t ?? 0) };
    })(),
    db.prepare(`SELECT COUNT(ID) AS n FROM VOUCHER WHERE Date1 >= ? AND Date1 <= ?`).bind(from, to).first(),
    db.prepare(
      `SELECT COUNT(ID) AS n FROM Account WHERE Date1 >= ? AND Date1 <= ? AND PaymentType='Voucher'`
    ).bind(from, to).first(),
  ]);

  const totalIncome = money((sellByDate.results ?? []).reduce((s: number, r: any) => s + Number(r.total ?? 0), 0));

  return c.json({
    from,
    to,
    generatedBy: c.get("user").displayName,
    generatedAt: new Date().toISOString(),
    stockAsOf: "generatedAt",
    totalAccountIncome: money(costByDate.results.reduce((sum, row) => sum + (row.type === "รายรับ" ? Number(row.amount || 0) : 0), 0)),
    totalQuantitySold: sellByDate.results.reduce((sum, row) => sum + (row.isDiscount ? 0 : Number(row.qty || 0)), 0),
    stockRemaining: stockRemaining.results,
    sellByDate: sellByDate.results,
    costByDate: costByDate.results,
    cashTx: cashTx.results,
    totalCashCumulative: money(Number(cashCum?.t ?? 0)),
    sums: {
      cashIn: money(sums.cashIn),
      transferIn: money(sums.transferIn),
      cost: money(sums.cost),
      ...(isAdmin ? { monthlySell: money(sums.monthlySell), monthlyCost: money(sums.monthlyCost), monthLabel: from.slice(5, 7) } : {}),
    },
    sellSums: { cash: money(sellSums.cash), transfer: money(sellSums.transfer) },
    totalIncome,
    ...(isAdmin ? { profit: money(sums.monthlySell - sums.monthlyCost) } : {}),
    voucher: { issued: Number(voucherIssued?.n ?? 0), used: Number(voucherUsed?.n ?? 0) },
  });
}

/* ------------------------------ backup export / import ------------------------------ */

const TABLES = ["ItemType", "Items", "Stock", "Sell", "StockTransaction", "Account", "CASH", "VOUCHER", "TableOrders"] as const;

app.get("/api/export", async (c) => {
  const tables: Record<string, unknown[]> = {};
  const results = await c.env.DB.batch([...TABLES.map((t) => c.env.DB.prepare(`SELECT * FROM ${t}`)),
    c.env.DB.prepare("SELECT LastValue FROM BillSequence WHERE ID = 1")]);
  TABLES.forEach((t, i) => { tables[t] = results[i].results ?? []; });
  return c.json({ exportedAt: new Date().toISOString(), billSequence: results[TABLES.length].results[0].LastValue, tables });
});

app.post("/api/import", async (c) => {
  const body = await c.req.json().catch(() => null);
  const data = body?.tables;
  if (body?.billSequence !== undefined && (!Number.isSafeInteger(body.billSequence) || body.billSequence < 0)) return bad(c, "ลำดับเลขบิลในไฟล์สำรองไม่ถูกต้อง");
  if (!data || typeof data !== "object" || TABLES.filter((t) => t !== "TableOrders").some((t) => !Array.isArray(data[t]))) {
    return bad(c, "ไฟล์สำรองต้องมีข้อมูลครบทุกตาราง");
  }
  if (!Array.isArray(data.TableOrders)) {
    if (data.TableOrders !== undefined) return bad(c, "ข้อมูลโต๊ะในไฟล์สำรองไม่ถูกต้อง");
    const existing = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM TableOrders").first();
    if (Number(existing?.n) > 0) return bad(c, "ไฟล์สำรองเก่าไม่มีข้อมูลโต๊ะ กรุณาใช้ไฟล์สำรองเวอร์ชันใหม่");
    data.TableOrders = [];
  }
  const db = c.env.DB;
  const stmts: D1PreparedStatement[] = [];
  // Children must be deleted before their parents (D1 enforces foreign keys).
  for (const t of [...TABLES].reverse()) {
    stmts.push(db.prepare(`DELETE FROM ${t}`));
  }
  let rows = 0;
  for (const t of TABLES) {
    const list = data[t];
    const schema = await db.prepare(`PRAGMA table_info(${t})`).all();
    const allowed = new Set(schema.results.map((column) => String(column.name)));
    for (const r of list) {
      if (!r || typeof r !== "object" || Array.isArray(r)) return bad(c, "แถวข้อมูลสำรองไม่ถูกต้อง");
      const cols = Object.keys(r);
      if (!cols.length || cols.some((col) => !allowed.has(col))) return bad(c, "คอลัมน์ข้อมูลสำรองไม่ถูกต้อง");
      if (cols.some((col) => r[col] !== null && !["string", "number"].includes(typeof r[col]))) {
        return bad(c, "ค่าข้อมูลสำรองไม่ถูกต้อง");
      }
      const sql = `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
      stmts.push(db.prepare(sql).bind(...cols.map((c2) => (r as any)[c2])));
      rows++;
    }
  }
  stmts.push(
    // Keep the high-water mark even when restoring a backup or deleting bills.
    db.prepare("UPDATE BillSequence SET LastValue = MAX(LastValue, ?) WHERE ID = 1").bind(body.billSequence ?? 0),
    db.prepare(`UPDATE sqlite_sequence SET seq = (SELECT MAX(ID) FROM ItemType) WHERE name = 'ItemType'`)
  );
  try {
    await db.batch(stmts);
  } catch {
    return bad(c, "ข้อมูลสำรองไม่ถูกต้อง นำเข้าไม่สำเร็จและยังคงข้อมูลเดิมไว้");
  }
  return c.json({ ok: true, rows });
});

/* ------------------------------ errors & assets ------------------------------ */

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "เกิดข้อผิดพลาดภายในระบบ: " + (err instanceof Error ? err.message : String(err)) }, 500);
});

app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "ไม่พบ API นี้" }, 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
