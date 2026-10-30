import assert from 'node:assert/strict';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8795';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(BASE).hostname), 'Only isolated local database');
function client() { return { cookie: '', async req(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.headers.has('set-cookie')) this.cookie = r.headers.get('set-cookie').split(';')[0];
  return { status: r.status, data: await r.json() };
} }; }
const admin = client(), staff = client(), anonymous = client();
let passed = 0;
function check(label, value) { assert.ok(value, label); passed++; console.log('  ok    ' + label); }
check('admin login', (await admin.req('POST', '/api/login', { username: 'admin', password: '1234' })).status === 200);
const before = (await admin.req('GET', '/api/export')).data;
let userID;
try {
  const username = 'stock_' + Date.now();
  const created = await admin.req('POST', '/api/users', { username, displayName: 'พนักงานสต็อก', password: '5678' }); userID = created.data.id;
  check('staff login', (await staff.req('POST', '/api/login', { username, password: '5678' })).status === 200);
  const types = (await admin.req('GET', '/api/item-types')).data;
  const create = async (name, type) => (await admin.req('POST', '/api/items', { name, itemTypeId: type, price: 10, amount: 20 })).data.id;
  const itemID = await create('สต็อก <ทดสอบ>', types[0].ID), otherID = await create('อีกหมวด', types[1].ID);
  const balance = () => admin.req('GET', '/api/items/' + itemID);
  const history = async () => (await staff.req('GET', '/api/stock/transactions?itemID=' + itemID)).data;
  check('anonymous cannot read stock', (await anonymous.req('GET', '/api/stock')).status === 401);
  const stock = (await staff.req('GET', '/api/stock')).data;
  check('staff sees all categories and balances', stock.some(r => r.itemCode === itemID && r.amount === 20 && r.typeName === types[0].Name1) && stock.some(r => r.itemCode === otherID && r.typeName === types[1].Name1));
  check('category filter', (await staff.req('GET', '/api/stock?typeName=' + encodeURIComponent(types[1].Name1))).data.every(r => r.typeName === types[1].Name1));
  for (const action of ['purchase', 'loss']) check('staff cannot ' + action, (await staff.req('POST', '/api/stock/transaction', { action, itemID, amount: 2, price: 10, paymentType: 'เงินสด', place: 'ตลาด' })).status === 403);
  check('staff cannot adjust', (await staff.req('PUT', '/api/stock/' + itemID, { amount: 50, expectedAmount: 20 })).status === 403);
  check('staff cannot create initial stock', (await staff.req('POST', '/api/items', { name: 'blocked', itemTypeId: types[0].ID, amount: 50, price: 1 })).status === 403);
  check('denied writes do not change stock or history', (await balance()).data.Amount === 20 && (await history()).length === 0);
  for (const amount of [null, '', 1.5, '30', 1e20]) check('invalid quantity rejected: ' + JSON.stringify(amount), (await admin.req('PUT', '/api/stock/' + itemID, { amount, expectedAmount: 20 })).status === 400);
  check('missing expected quantity rejected', (await admin.req('PUT', '/api/stock/' + itemID, { amount: 30 })).status === 400);
  check('missing item rejected', (await admin.req('PUT', '/api/stock/999999999', { amount: 30, expectedAmount: 20 })).status === 404);
  check('admin changes balance', (await admin.req('PUT', '/api/stock/' + itemID, { amount: 30, expectedAmount: 20, owner: 'forged' })).status === 200 && (await balance()).data.Amount === 30);
  const audit = (await history())[0];
  check('audit uses authenticated identity and exact delta', audit.TransactionType === 'แก้ไขโดย admin' && audit.Owner === 'admin' && audit.Amount === 10 && audit.Comment.includes('20 → 30') && audit.ItemName === 'สต็อก <ทดสอบ>');
  check('stale quantity rejected', (await admin.req('PUT', '/api/stock/' + itemID, { amount: 40, expectedAmount: 20 })).status === 409);
  check('same balance is a no-op', (await admin.req('PUT', '/api/stock/' + itemID, { amount: 30, expectedAmount: 30 })).data.changed === false && (await history()).length === 1);
  const race = await Promise.all([31, 32].map(amount => admin.req('PUT', '/api/stock/' + itemID, { amount, expectedAmount: 30 })));
  check('concurrent edits have exactly one winner', race.filter(r => r.status === 200).length === 1 && race.filter(r => r.status === 409).length === 1 && (await history()).length === 2);
  const current = (await balance()).data.Amount;
  check('negative balances supported', (await admin.req('PUT', '/api/stock/' + itemID, { amount: -2, expectedAmount: current })).status === 200);
  check('zero balance supported', (await admin.req('PUT', '/api/stock/' + itemID, { amount: 0, expectedAmount: -2 })).status === 200);
  for (let i = 0; i < 102; i++) assert.equal((await admin.req('PUT', '/api/stock/' + itemID, { amount: i + 1, expectedAmount: i })).status, 200);
  const page1 = await history();
  const page2 = (await staff.req('GET', '/api/stock/transactions?itemID=' + itemID + '&before=' + page1.at(-1).ID)).data;
  check('history pages without missing or duplicate entries', page1.length === 100 && page2.length === 6 && new Set([...page1, ...page2].map(r => r.ID)).size === 106);
  check('history filters individual product', (await staff.req('GET', '/api/stock/transactions?itemID=' + otherID)).data.length === 0);
  check('invalid history filter rejected', (await staff.req('GET', '/api/stock/transactions?itemID=no')).status === 400);
  const after = (await admin.req('GET', '/api/export')).data;
  check('balance adjustments do not create financial entries', after.tables.Account.length === before.tables.Account.length && after.tables.CASH.length === before.tables.CASH.length);
  check('admin can purchase stock', (await admin.req('POST', '/api/stock/transaction', {action:'purchase',itemID,amount:3,price:30,paymentType:'เงินสด',place:'ตลาด'})).status === 200);
  check('admin can record loss', (await admin.req('POST', '/api/stock/transaction', {action:'loss',itemID,amount:1})).status === 200);
  check('staff can sell through POS', (await staff.req('POST', '/api/sell', {items:[{itemID,qty:2}],paymentType:'เงินสด',billID:(await staff.req('GET','/api/billid')).data.billID})).status === 200);
  const changes = await history();
  check('sales show stock decrease', changes[0].TransactionType === 'ขาย' && changes[0].StockChange === -2);
  check('loss and purchase show correct signs', changes[1].StockChange === -1 && changes[2].StockChange === 3);
} finally {
  assert.equal((await admin.req('POST', '/api/import', before)).status, 200);
  if (userID) await admin.req('PUT', '/api/users/' + userID, { active: false });
}
console.log('\n' + passed + ' stock checks passed');
