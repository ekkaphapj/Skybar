import assert from 'node:assert/strict';
const base = process.env.BASE_URL || 'http://127.0.0.1:8798';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Local test database only');
function client() {
  return { cookie: '', async req(method, path, body) {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Cookie: this.cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.headers.has('set-cookie')) this.cookie = r.headers.get('set-cookie').split(';')[0];
    return { status: r.status, data: await r.json() };
  } };
}
const admin = client(), staff = client(), anon = client();
let passed = 0;
function check(label, value) { assert.ok(value, label); passed++; console.log('ok ' + label); }
assert.equal((await admin.req('POST', '/api/login', { username: 'admin', password: '1234' })).status, 200);
const snapshot = (await admin.req('GET', '/api/export')).data;
const initialDashboard = (await admin.req('GET', '/api/dashboard')).data;
const tables = async () => (await admin.req('GET', '/api/export')).data.tables;
const stock = async id => (await admin.req('GET', '/api/items/' + id)).data.Amount;
const cash = async () => (await admin.req('GET', '/api/cash/total')).data.total;
try {
  const username = 'delete_' + Date.now();
  const user = await admin.req('POST', '/api/users', { username, displayName: 'Delete test', password: '5678' });
  assert.equal(user.status, 200);
  await staff.req('POST', '/api/login', { username, password: '5678' });
  check('anonymous delete rejected', (await anon.req('DELETE', '/api/accounts/1')).status === 401);
  check('employee account delete rejected', (await staff.req('DELETE', '/api/accounts/1')).status === 403);
  check('employee bill delete rejected', (await staff.req('DELETE', '/api/sell/receipt/missing')).status === 403);
  check('cross-origin delete rejected', (await fetch(base + '/api/accounts/1', { method: 'DELETE', headers: { Cookie: admin.cookie, Origin: 'https://other.example' } })).status === 403);
  check('invalid ID rejected', (await admin.req('DELETE', '/api/accounts/-1')).status === 400);
  check('missing bill rejected', (await admin.req('DELETE', '/api/sell/receipt/missing')).status === 404);
  const itemID = (await admin.req('POST', '/api/items', { name: 'Delete product', itemTypeId: 2, price: 20, amount: 50 })).data.id;
  const startCash = await cash();
  for (const action of ['income', 'expense']) {
    const date = (await admin.req('GET', '/api/meta')).data.today;
    const reportBefore = (await admin.req('GET', `/api/report?from=${date}&to=${date}`)).data;
    await admin.req('POST', '/api/stock/transaction', { action, price: 100, paymentType: 'เงินสด', comment: 'Delete test' });
    const a = (await tables()).Account.at(-1);
    const report = (await admin.req('GET', '/api/meta')).data.today;
    check('report includes deletion identity', (await admin.req('GET', `/api/report?from=${report}&to=${report}`)).data.costByDate.some(r => r.id === a.ID));
    check(action + ' deleted', (await admin.req('DELETE', '/api/accounts/' + a.ID)).status === 200);
    check(action + ' cash reversed', await cash() === startCash);
    check(action + ' cash row removed', !(await tables()).CASH.some(c => c.AccountID === a.ID));
    const reportAfter = (await admin.req('GET', `/api/report?from=${date}&to=${date}`)).data;
    check(action + ' report totals restored', reportAfter.totalAccountIncome === reportBefore.totalAccountIncome && reportAfter.sums.cost === reportBefore.sums.cost && reportAfter.totalCashCumulative === reportBefore.totalCashCumulative);
    check(action + ' repeated delete rejected', (await admin.req('DELETE', '/api/accounts/' + a.ID)).status === 404);
  }
  await admin.req('POST', '/api/stock/transaction', { action: 'purchase', itemID, amount: 5, price: 40, paymentType: 'เงินสด', place: 'test' });
  const purchase = (await tables()).Account.at(-1);
  const purchaseRace = await Promise.all([1, 2].map(() => admin.req('DELETE', '/api/accounts/' + purchase.ID)));
  check('concurrent purchase deletion commits once', purchaseRace.filter(r => r.status === 200).length === 1 && purchaseRace.some(r => r.status === 404));
  check('purchase stock and cash reversed once', await stock(itemID) === 50 && await cash() === startCash);
  check('purchase stock transaction removed', !(await tables()).StockTransaction.some(t => t.ID === purchase.StockTransactionID));
  for (const paymentType of ['เงินสด', 'โอน', 'Voucher']) {
    const occupied = new Set((await admin.req('GET', '/api/orders')).data.map(o => o.tableNo));
    const tableNo = Array.from({ length: 20 }, (_, i) => i + 1).find(n => !occupied.has(n));
    const order = (await admin.req('POST', '/api/orders', { tableNo })).data;
    await admin.req('PUT', '/api/orders/' + order.id, { revision: 0, items: [{ itemID, qty: 1 }] });
    let voucherId;
    if (paymentType === 'Voucher') voucherId = (await admin.req('POST', '/api/vouchers', { count: 1 })).data.ids[0];
    assert.equal((await admin.req('POST', '/api/orders/' + order.id + '/checkout', { revision: 1, paymentType, voucherId })).status, 200);
    const account = (await tables()).Account.find(a => a.BillID === order.billID);
    const paths = ['/api/sell/receipt/' + encodeURIComponent(order.billID), '/api/accounts/' + account.ID];
    const deleted = await Promise.all(paths.map(path => admin.req('DELETE', path)));
    check(paymentType + ' concurrent bill/account deletion commits once', deleted.filter(r => r.status === 200).length === 1 && deleted.some(r => r.status === 404));
    check(paymentType + ' stock/cash restored once', await stock(itemID) === 50 && await cash() === startCash);
    const t = await tables();
    check(paymentType + ' history and ledgers removed', !t.TableOrders.some(o => o.ID === order.id) && !t.Sell.some(s => s.OrderID === order.billID) && !t.Account.some(a => a.BillID === order.billID) && !t.StockTransaction.some(s => s.BillID === order.billID));
    check(paymentType + ' receipt unavailable', (await admin.req('GET', paths[0])).status === 404);
    if (voucherId) check('voucher can be used again', (await admin.req('GET', '/api/vouchers/check/' + voucherId)).data.ok);
  }
  const billID = 'direct-delete-' + Date.now();
  await admin.req('POST', '/api/sell', { billID, items: [{ itemID, qty: 3 }], paymentType: 'เงินสด' });
  check('legacy/direct bill deletable', (await admin.req('DELETE', '/api/sell/receipt/' + billID)).status === 200);
  check('direct bill stock/cash restored', await stock(itemID) === 50 && await cash() === startCash);
  const item2 = (await admin.req('POST', '/api/items', { name: 'Delete second product', itemTypeId: 2, price: 15, amount: 30 })).data.id;
  const today = (await admin.req('GET', '/api/meta')).data.today;
  const report = async () => (await admin.req('GET', `/api/report?from=${today}&to=${today}`)).data;
  const openOrder = (await admin.req('POST', '/api/orders', { tableNo: 1 })).data;
  const openBefore = await report();
  await admin.req('PUT', '/api/orders/' + openOrder.id, { revision: 0, items: [{ itemID, qty: 2 }, { itemID: item2, qty: 1 }] });
  const removal = await admin.req('PUT', '/api/orders/' + openOrder.id, { revision: 1, items: [{ itemID: item2, qty: 1 }] });
  const openAfter = await report();
  check('removing an uncharged item does not change stock or cash', removal.status === 200 && await stock(itemID) === 50 && await stock(item2) === 30 && await cash() === startCash);
  check('removing an uncharged item does not change the accounts', openAfter.totalAccountIncome === openBefore.totalAccountIncome && openAfter.sums.cost === openBefore.sums.cost);
  check('checkout only charges remaining item', (await admin.req('POST', '/api/orders/' + openOrder.id + '/checkout', { revision: 2, paymentType: 'เงินสด' })).data.total === 15 && await stock(itemID) === 50 && await stock(item2) === 29);
  check('deleting that bill restores the remaining item', (await admin.req('DELETE', '/api/sell/receipt/' + encodeURIComponent(openOrder.billID))).status === 200 && await stock(item2) === 30 && await cash() === startCash);
  for (const paymentType of ['เงินสด', 'โอน']) {
    const before = await report();
    const bill = `multi-${paymentType}-${Date.now()}`;
    const sale = await admin.req('POST', '/api/sell', { billID: bill, items: [
      { itemID, qty: 2 }, { itemID: item2, qty: 3 }, { itemID, qty: 1 },
    ], paymentType });
    check(paymentType + ' multi-line sale succeeds', sale.status === 200);
    check(paymentType + ' stock deducted for each product and duplicate line', await stock(itemID) === 47 && await stock(item2) === 27);
    const during = await report();
    check(paymentType + ' sale reflected in report', during.totalIncome === before.totalIncome + 105 && during.totalAccountIncome === before.totalAccountIncome + 105 && during.totalQuantitySold === before.totalQuantitySold + 6);
    check(paymentType + ' cash balance reflects payment channel', await cash() === startCash + (paymentType === 'เงินสด' ? 105 : 0));
    check(paymentType + ' multi-line bill deleted', (await admin.req('DELETE', '/api/sell/receipt/' + encodeURIComponent(bill))).status === 200);
    const after = await report();
    check(paymentType + ' all product stock and cash restored', await stock(itemID) === 50 && await stock(item2) === 30 && await cash() === startCash);
    check(paymentType + ' report totals restored', after.totalIncome === before.totalIncome && after.totalAccountIncome === before.totalAccountIncome && after.totalQuantitySold === before.totalQuantitySold && after.sums.cost === before.sums.cost);
    check(paymentType + ' unrelated product unaffected', (await admin.req('DELETE', '/api/sell/receipt/' + encodeURIComponent(bill))).status === 404 && await stock(item2) === 30);
  }
  check('other records unchanged', JSON.stringify((await tables()).Account) === JSON.stringify(snapshot.tables.Account));
  const dashboard = (await admin.req('GET', '/api/dashboard')).data;
  check('dashboard excludes deleted bills', dashboard.bills === initialDashboard.bills && dashboard.revenue === initialDashboard.revenue);
  await admin.req('PUT', '/api/users/' + user.data.id, { active: false });
} finally {
  assert.equal((await admin.req('POST', '/api/import', snapshot)).status, 200, 'Restore isolated data');
}
console.log(`${passed} deletion checks passed`);
