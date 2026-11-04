import assert from 'node:assert/strict';
const base = process.env.BASE_URL || 'http://127.0.0.1:8795';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use isolated local data');
function client() { return { cookie: '', async req(method, path, body) {
  const r = await fetch(base + path, { method, headers: { Cookie: this.cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.headers.has('set-cookie')) this.cookie = r.headers.get('set-cookie').split(';')[0];
  return { status: r.status, data: await r.json() };
} }; }
const admin = client(), staff = client(), anon = client(); let passed = 0, userID;
const check = (label, value) => { assert.ok(value, label); passed++; console.log('ok ' + label); };
assert.equal((await admin.req('POST', '/api/login', { username: 'admin', password: '1234' })).status, 200);
const snapshot = (await admin.req('GET', '/api/export')).data;
const date = '2024-02-29', listPath = '/api/accounts?from=' + date + '&to=' + date;
const ledger = async () => (await admin.req('GET', listPath)).data.rows;
const cash = async () => (await admin.req('GET', '/api/cash/total?date=' + date)).data.total;
const edit = (r, changes = {}) => ({ revision: r.Revision, date: r.Date1, amount: r.Amount, list: r.List, paymentType: r.PaymentType, quantity: r.Quantity, ...changes });
try {
  const username = 'ledger_' + Date.now();
  userID = (await admin.req('POST', '/api/users', { username, displayName: 'พนักงานบัญชี', password: '5678' })).data.id;
  await staff.req('POST', '/api/login', { username, password: '5678' });
  check('anonymous cannot read accounting', (await anon.req('GET', listPath)).status === 401);
  check('invalid date rejected', (await staff.req('GET', '/api/accounts?from=2024-02-30')).status === 400);
  check('invalid list returns validation error', (await staff.req('POST', '/api/accounts', { list: 1 })).status === 400);
  const initialCash = await cash();
  check('staff creates historical income', (await staff.req('POST', '/api/accounts', { type: 'รายรับ', date, amount: 100, list: 'รายรับทดสอบ', paymentType: 'เงินสด' })).status === 200);
  let row = (await ledger())[0];
  check('historical date and authenticated owner', row.Date1 === date && row.Owner === 'พนักงานบัญชี' && await cash() === initialCash + 100);
  check('staff cannot edit', (await staff.req('PUT', '/api/accounts/' + row.ID, edit(row, { amount: 999 }))).status === 403);
  check('staff cannot delete', (await staff.req('DELETE', '/api/accounts/' + row.ID)).status === 403);
  check('admin changes payment and date', (await admin.req('PUT', '/api/accounts/' + row.ID, edit(row, { date: '2024-03-01', paymentType: 'โอน', amount: 150 }))).status === 200 && await cash() === initialCash && !(await ledger()).some(r => r.ID === row.ID));
  check('stale edits rejected', (await admin.req('PUT', '/api/accounts/' + row.ID, edit(row))).status === 409);
  const itemID = (await admin.req('POST', '/api/items', { name: 'สินค้า ledger', itemTypeId: 2, price: 20, amount: 10 })).data.id;
  const balance = async () => (await admin.req('GET', '/api/items/' + itemID)).data.Amount;
  check('staff purchases stock', (await staff.req('POST', '/api/stock/transaction', { action: 'purchase', itemID, amount: 5, price: 50, paymentType: 'เงินสด', date2: date, place: 'ตลาด' })).status === 200 && await balance() === 15);
  row = (await ledger()).find(r => r.ItemID === itemID);
  check('purchase ledger has classification and quantity', row.DisplayCategory === 'ซื้อของเข้าร้าน' && row.Quantity === 5 && await cash() === initialCash - 50);
  check('purchase edit adjusts stock and cash by delta', (await admin.req('PUT', '/api/accounts/' + row.ID, edit(row, { amount: 70, quantity: 7 }))).status === 200 && await balance() === 17 && await cash() === initialCash - 70);
  row = (await ledger()).find(r => r.ID === row.ID);
  const race = await Promise.all([8, 9].map(quantity => admin.req('PUT', '/api/accounts/' + row.ID, edit(row, { quantity }))));
  check('concurrent edits exactly one winner', race.filter(r => r.status === 200).length === 1 && race.filter(r => r.status === 409).length === 1);
  row = (await ledger()).find(r => r.ID === row.ID);
  check('concurrent stock and cash remain consistent', await balance() === 10 + row.Quantity && await cash() === initialCash - 70);
  const deletes = await Promise.all([1, 2].map(() => admin.req('DELETE', '/api/accounts/' + row.ID)));
  check('duplicate delete reverses only once', deletes.filter(r => r.status === 200).length === 1 && await balance() === 10 && await cash() === initialCash);
  for (const [category, delta] of [['รับเงินสด', 200], ['จ่ายเงินสด', -30]]) {
    check('record cash exchange ' + category, (await staff.req('POST', '/api/accounts', { type: 'แลกเงินสด', date, amount: Math.abs(delta), paymentType: 'เงินสด', category, list: 'แลกเงินสดทดสอบ' })).status === 200);
  }
  check('cash exchanges affect only cash', await cash() === initialCash + 170);
  const month = '/api/report/monthly?year=2024&month=2';
  check('monthly report admin only', (await staff.req('GET', month)).status === 403);
  check('invalid month rejected', (await admin.req('GET', '/api/report/monthly?year=2024&month=13')).status === 400);
  let r = (await admin.req('GET', month)).data;
  check('leap year month covers all days', r.from === '2024-02-01' && r.to === date);
  check('exchange not counted as sales, income or expense', r.totalIncome === 0 && r.totalAccountIncome === 0 && r.sums.cost === 0 && r.balance === 0);
  // Completed sales automatically flow into today's ledger and monthly product totals.
  const today = (await admin.req('GET', '/api/meta')).data.today;
  const currentMonthPath = '/api/report/monthly?year=' + today.slice(0, 4) + '&month=' + today.slice(5, 7);
  const monthBefore = (await admin.req('GET', currentMonthPath)).data;
  const billID = 'ledger-' + crypto.randomUUID();
  check('staff sale succeeds', (await staff.req('POST', '/api/sell', { billID, items: [{ itemID, qty: 2 }], paymentType: 'เงินสด' })).status === 200 && await balance() === 8);
  row = (await admin.req('GET', '/api/accounts?from=' + today)).data.rows.find(r => r.BillID === billID);
  check('closed sale appears in ledger', row && row.DisplayCategory === 'ปิดการขาย' && row.Amount === 40);
  check('sale notes editable without corrupting receipt', (await admin.req('PUT', '/api/accounts/' + row.ID, edit(row, { list: 'หมายเหตุแก้ไข' }))).status === 200);
  const changed = (await admin.req('GET', '/api/accounts?from=' + today)).data.rows.find(r => r.ID === row.ID);
  check('original sale description retained with separate note', changed.List === row.List && changed.Note === 'หมายเหตุแก้ไข');
  row.Revision++;
  check('sale total cannot disagree with receipt', (await admin.req('PUT', '/api/accounts/' + row.ID, edit(row, { amount: 99 }))).status === 400);
  r = (await admin.req('GET', currentMonthPath)).data;
  check('monthly product quantities and revenue', r.sellByDate.some(r => r.name === 'สินค้า ledger' && r.qty === 2 && r.total === 40) && r.totalIncome === monthBefore.totalIncome + 40 && r.balance === monthBefore.balance + 40);
  await admin.req('DELETE', '/api/accounts/' + row.ID);
  check('deleting sale restores stock', await balance() === 10);
  const voucherID = (await admin.req('POST', '/api/vouchers', { date: today, count: 1 })).data.ids[0];
  const voucherBill = 'ledger-voucher-' + crypto.randomUUID();
  assert.equal((await staff.req('POST', '/api/sell', { billID: voucherBill, items: [{ itemID, qty: 1 }], paymentType: 'Voucher', voucherId: voucherID })).status, 200);
  row = (await admin.req('GET', '/api/accounts?from=' + today)).data.rows.find(r => r.BillID === voucherBill);
  check('voucher note can be edited', (await admin.req('PUT', '/api/accounts/' + row.ID, edit(row, { list: 'แก้หมายเหตุ voucher' }))).status === 200);
  assert.equal((await admin.req('DELETE', '/api/accounts/' + row.ID)).status, 200);
  check('voucher reversal still restores redemption and stock', (await admin.req('GET', '/api/vouchers/check/' + voucherID)).data.ok && await balance() === 10);
} finally {
  assert.equal((await admin.req('POST', '/api/import', snapshot)).status, 200);
  if (userID) await admin.req('PUT', '/api/users/' + userID, { active: false });
}
console.log(passed + ' accounting checks passed');
