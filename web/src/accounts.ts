import type { Hono } from 'hono';
import type { AppEnv } from './auth';
import { businessDate, nowTime, isValidDate, money } from './logic';

export function installAccounts(app: Hono<AppEnv>) {
  app.get('/api/accounts', async c => {
    const from = c.req.query('from') || businessDate(), to = c.req.query('to') || from;
    if (!isValidDate(from) || !isValidDate(to) || from > to) return c.json({ error: 'เลือกวันที่ไม่ถูกต้อง' }, 400);
    const rows = await c.env.DB.prepare(`SELECT a.*, t.ItemID, t.Amount AS Quantity, t.Place,
      i.ItemTypeID, i.ItemSubtypeID, i.Name1 AS ItemName,
      CASE WHEN t.TransactionType = 'ซื้อเพิ่ม' THEN 'ซื้อของเข้าร้าน'
        WHEN a.Type = 'แลกเงินสด' THEN a.Category
        WHEN a.BillID IS NOT NULL AND a.BillID <> '' THEN 'ปิดการขาย'
        ELSE 'อื่นๆ' END AS DisplayCategory
      FROM Account a LEFT JOIN StockTransaction t ON t.ID = a.StockTransactionID
      LEFT JOIN Items i ON i.ID = t.ItemID WHERE a.Date1 BETWEEN ? AND ? ORDER BY a.Date1 DESC, a.ID DESC`).bind(from, to).all();
    return c.json({ from, to, rows: rows.results });
  });

  // Cash exchanges move the cash balance, but are neither revenue nor expense.
  app.post('/api/accounts', async c => {
    const b = (await c.req.json().catch(() => ({}))) || {};
    const type = b.type, date = b.date, amount = b.amount, list = typeof b.list === 'string' ? b.list.trim() : '';
    const exchange = type === 'แลกเงินสด';
    if (!['รายรับ', 'รายจ่าย', 'แลกเงินสด'].includes(type) || !isValidDate(date) ||
        typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount !== money(amount) ||
        typeof list !== 'string' || !list || list.length > 500 ||
        !['เงินสด', 'โอน', 'อื่นๆ'].includes(b.paymentType) ||
        (exchange && !['รับเงินสด', 'จ่ายเงินสด'].includes(b.category))) return c.json({ error: 'ข้อมูลรายการไม่ถูกต้อง' }, 400);
    const owner = c.get('user').displayName, time = nowTime(), token = crypto.randomUUID();
    const db = c.env.DB;
    await db.batch([
      db.prepare(`INSERT INTO Account (Date1, Time1, Type, Amount, PaymentType, List, Owner, Category, EditToken)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(date, time, type, amount, exchange ? 'เงินสด' : b.paymentType, list, owner, exchange ? b.category : 'อื่นๆ', token),
      db.prepare(`INSERT INTO CASH (Date1, Time1, Type1, Amount, List, Owner, AccountID)
        SELECT Date1, ?, Type, Amount * ?, List, ?, ID FROM Account WHERE EditToken = ? AND PaymentType = 'เงินสด'`)
        .bind(time, type === 'รายรับ' || (exchange && b.category === 'รับเงินสด') ? 1 : -1, owner, token),
    ]);
    return c.json({ ok: true });
  });

  app.put('/api/accounts/:id', async c => {
    if (c.get('user').role !== 'admin') return c.json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' }, 403);
    const id = Number(c.req.param('id')), b = (await c.req.json().catch(() => ({}))) || {};
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(b.revision) || b.revision < 0 ||
        !isValidDate(b.date) || typeof b.list !== 'string' || !b.list.trim() || b.list.length > 500 ||
        typeof b.amount !== 'number' || !Number.isFinite(b.amount) || b.amount < 0 || b.amount !== money(b.amount) ||
        !['เงินสด', 'โอน', 'อื่นๆ', 'Voucher'].includes(b.paymentType)) return c.json({ error: 'ข้อมูลรายการไม่ถูกต้อง' }, 400);
    const db = c.env.DB, row = await db.prepare('SELECT * FROM Account WHERE ID = ?').bind(id).first<any>();
    if (!row) return c.json({ error: 'ไม่พบรายการ' }, 404);
    const sale = !!row.BillID && !row.StockTransactionID;
    // Receipt totals and voucher redemption must continue to agree with sales.
    if (sale && (b.amount !== row.Amount || b.date !== row.Date1 || b.paymentType !== row.PaymentType)) return c.json({ error: 'ยอดบิลขายต้องตรงกับสินค้า หากบิลผิดให้ลบบิลและบันทึกการขายใหม่' }, 400);
    if ((row.PaymentType === 'Voucher' || b.paymentType === 'Voucher') && b.paymentType !== row.PaymentType) return c.json({ error: 'เปลี่ยนช่องทาง Voucher ไม่ได้' }, 400);
    if (row.Type === 'แลกเงินสด' && b.paymentType !== 'เงินสด') return c.json({ error: 'รายการแลกเงินสดต้องใช้ช่องทางเงินสด' }, 400);
    if (row.StockTransactionID && (!Number.isSafeInteger(b.quantity) || b.quantity <= 0)) return c.json({ error: 'ใส่จำนวนสินค้าที่ซื้อให้ถูกต้อง' }, 400);
    const token = crypto.randomUUID(), today = businessDate(), time = nowTime(), owner = c.get('user').displayName;
    const guard = `EXISTS (SELECT 1 FROM Account WHERE ID = ? AND EditToken = ?)`;
    const stmts = [db.prepare('UPDATE Account SET Revision = Revision + 1, EditToken = ? WHERE ID = ? AND Revision = ?').bind(token, id, b.revision)];
    if (row.StockTransactionID) {
      // Read the old purchase inside the atomic batch, so edits cannot apply a stale delta.
      stmts.push(db.prepare(`UPDATE Stock SET Amount = Amount + ? - (SELECT t.Amount FROM StockTransaction t JOIN Account a ON a.StockTransactionID = t.ID WHERE a.ID = ?), Date1 = ?, Time1 = ?
        WHERE ItemID = (SELECT t.ItemID FROM StockTransaction t JOIN Account a ON a.StockTransactionID = t.ID WHERE a.ID = ?) AND ${guard}`)
        .bind(b.quantity, id, today, time, id, id, token));
      stmts.push(db.prepare(`UPDATE StockTransaction SET Amount = ?, Price = ?, Date2 = ?, PaymentType = ?, Comment = ?
        WHERE ID = (SELECT StockTransactionID FROM Account WHERE ID = ?) AND ${guard}`)
        .bind(b.quantity, b.amount, b.date, b.paymentType, b.list.trim(), id, id, token));
    }
    stmts.push(db.prepare(`DELETE FROM CASH WHERE AccountID = ? AND ${guard}`).bind(id, id, token));
    // Voucher reversal reads the original system description; keep sale notes separate.
    stmts.push(db.prepare(`UPDATE Account SET Date1 = ?, Amount = ?, PaymentType = ?, ${sale || row.StockTransactionID ? 'Note' : 'List'} = ? WHERE ID = ? AND EditToken = ?`).bind(b.date, b.amount, b.paymentType, b.list.trim(), id, token));
    if (row.StockTransactionID) {
      stmts.push(db.prepare(`UPDATE Account SET List = (SELECT 'รายการซื้อของ ' || i.Name1 || ' จำนวน ' || t.Amount || ' ชิ้น'
        FROM StockTransaction t JOIN Items i ON i.ID = t.ItemID WHERE t.ID = Account.StockTransactionID)
        WHERE ID = ? AND EditToken = ?`).bind(id, token));
    }
    stmts.push(db.prepare(`INSERT INTO CASH (Date1, Time1, Type1, Amount, List, Owner, AccountID)
      SELECT Date1, ?, Type, Amount * CASE WHEN Type = 'รายรับ' OR (Type = 'แลกเงินสด' AND Category = 'รับเงินสด') THEN 1 ELSE -1 END,
      List, ?, ID FROM Account WHERE ID = ? AND EditToken = ? AND PaymentType = 'เงินสด'`).bind(time, owner, id, token));
    const results = await db.batch(stmts);
    if (!results[0].meta.changes) return c.json({ error: 'รายการถูกแก้ไขแล้ว กรุณาโหลดใหม่' }, 409);
    return c.json({ ok: true });
  });
}
