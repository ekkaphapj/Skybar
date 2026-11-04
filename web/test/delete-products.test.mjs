import assert from 'node:assert/strict';
const base = process.env.BASE_URL || 'http://127.0.0.1:8795';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
function client() { return { cookie: '', async req(method, path, body) {
  const r = await fetch(base + path, { method, headers: { Cookie: this.cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.headers.has('set-cookie')) this.cookie = r.headers.get('set-cookie').split(';')[0];
  return { status: r.status, data: await r.json() };
} }; }
const admin = client(), staff = client(), anonymous = client();
assert.equal((await admin.req('POST', '/api/login', { username: 'admin', password: '1234' })).status, 200);
const snapshot = (await admin.req('GET', '/api/export')).data;
let passed = 0, userID;
function check(label, condition) { assert.ok(condition, label); console.log('ok ' + label); passed++; }
try {
  const username = 'delete_product_' + Date.now();
  userID = (await admin.req('POST', '/api/users', { username, password: '5678', displayName: 'พนักงานทดสอบลบ' })).data.id;
  await staff.req('POST', '/api/login', { username, password: '5678' });
  const itemID = (await admin.req('POST', '/api/items', { name: 'สินค้าทดสอบลบ', price: 20, amount: 10, itemTypeId: 2 })).data.id;
  const path = '/api/items/' + itemID;
  check('anonymous cannot delete', (await anonymous.req('DELETE', path)).status === 401);
  check('staff cannot delete', (await staff.req('DELETE', path)).status === 403);
  check('invalid ID rejected', (await admin.req('DELETE', '/api/items/no')).status === 400);
  const billID = 'delete-product-' + crypto.randomUUID();
  assert.equal((await staff.req('POST', '/api/sell', { billID, paymentType: 'เงินสด', items: [{ itemID, qty: 2 }] })).status, 200);
  const order = (await staff.req('POST', '/api/orders', { tableNo: 19, cusName: 'ทดสอบลบ' })).data;
  assert.equal((await staff.req('PUT', '/api/orders/' + order.id, { revision: 0, items: [{ itemID, qty: 1 }] })).status, 200);
  check('cannot delete a product in an open table', (await admin.req('DELETE', path)).status === 409);
  assert.equal((await staff.req('POST', '/api/orders/' + order.id + '/cancel', { revision: 1 })).status, 200);
  check('admin deletes sold product', (await admin.req('DELETE', path)).status === 200);
  check('deleted product absent from catalog', !(await staff.req('GET', '/api/items')).data.some(r => r.ID === itemID));
  check('deleted product absent from stock', !(await staff.req('GET', '/api/stock')).data.some(r => r.itemCode === itemID));
  check('barcode lookup cannot load deleted product', (await staff.req('GET', path)).status === 404);
  check('cannot sell deleted product', (await staff.req('POST', '/api/sell', { billID: crypto.randomUUID(), paymentType: 'เงินสด', items: [{ itemID, qty: 1 }] })).status === 400);
  check('cannot purchase deleted product', (await staff.req('POST', '/api/stock/transaction', { action: 'purchase', itemID, amount: 2, price: 20, paymentType: 'เงินสด', place: 'ตลาด' })).status === 400);
  const order2 = (await staff.req('POST', '/api/orders', { tableNo: 19 })).data;
  check('cannot add deleted product to table', (await staff.req('PUT', '/api/orders/' + order2.id, { revision: 0, items: [{ itemID, qty: 1 }] })).status === 400);
  await staff.req('POST', '/api/orders/' + order2.id + '/cancel', { revision: 0 });
  const receipt = (await staff.req('GET', '/api/sell/receipt/' + billID)).data;
  check('historical receipt preserved', receipt.rows.some(r => r.ItemID === itemID && r.Name1 === 'สินค้าทดสอบลบ') && receipt.total === 40);
  const today = (await staff.req('GET', '/api/meta')).data.today;
  const report = (await admin.req('GET', `/api/report?from=${today}&to=${today}`)).data;
  check('historical sales preserved in reports', report.sellByDate.some(r => r.name === 'สินค้าทดสอบลบ' && r.qty === 2 && r.total === 40));
  check('stock summary excludes deleted product', !report.stockRemaining.some(r => r.name === 'สินค้าทดสอบลบ'));
  const saved = (await admin.req('GET', '/api/export')).data;
  check('backup retains archived product', saved.tables.Items.some(r => r.ID === itemID && r.DeletedAt));
  check('backup with archived sales restores', (await admin.req('POST', '/api/import', saved)).status === 200);
  check('duplicate delete returns not found', (await admin.req('DELETE', path)).status === 404);
  const raceID = (await admin.req('POST', '/api/items', { name: 'ลบพร้อมกัน', price: 1, amount: 0, itemTypeId: 2 })).data.id;
  const race = await Promise.all([1, 2].map(() => admin.req('DELETE', '/api/items/' + raceID)));
  check('concurrent delete has one winner', race.filter(r => r.status === 200).length === 1 && race.filter(r => r.status === 404).length === 1);
  check('historical sale can still be reversed', (await admin.req('DELETE', '/api/sell/receipt/' + billID)).status === 200);
} finally {
  assert.equal((await admin.req('POST', '/api/import', snapshot)).status, 200);
  if (userID) await admin.req('PUT', '/api/users/' + userID, { active: false });
}
console.log(passed + ' product deletion checks passed');
