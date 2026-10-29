import assert from 'node:assert/strict';
const base = process.env.BASE_URL || 'http://127.0.0.1:8787';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Disposable local database only');
let cookie = '', passed = 0;
async function req(method, path, body) {
  const res = await fetch(base + path, { method, headers: {'Content-Type':'application/json', Cookie:cookie}, body:body === undefined ? undefined : JSON.stringify(body) });
  if (res.headers.has('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
  const data = await res.json();
  assert.equal(res.status, 200, JSON.stringify(data));
  return data;
}
function check(label, value) { assert.ok(value, label); passed++; console.log('ok ' + label); }
await req('POST', '/api/login', {username:'admin', password:'1234'});
const snapshot = await req('GET', '/api/export');
try {
  const ids = (await Promise.all(Array.from({length:12}, () => req('GET', '/api/billid')))).map(x => x.billID);
  check('new bill IDs are short decimal numbers', ids.every(id => /^[1-9]\d{0,8}$/.test(id)));
  check('concurrent allocations never duplicate', new Set(ids).size === ids.length);
  const sorted = ids.map(Number).sort((a,b) => a-b);
  check('concurrent bill numbers run consecutively', sorted.every((n,i) => n === sorted[0]+i));
  const busy = new Set((await req('GET', '/api/orders')).map(x => x.tableNo));
  const tableNo = Array.from({length:20}, (_,i) => i+1).find(n => !busy.has(n));
  assert.ok(tableNo);
  const order = await req('POST', '/api/orders', {tableNo});
  check('opening a table uses the same sequence', Number(order.billID) === sorted.at(-1)+1);
  await req('POST', `/api/orders/${order.id}/cancel`, {revision:0});
  const reopened = await req('POST', '/api/orders', {tableNo});
  check('cancelled bill number is never reused', Number(reopened.billID) === Number(order.billID)+1);
  const beforeRestore = await req('GET', '/api/export');
  await req('POST', '/api/import', snapshot);
  check('restoring an older backup never rolls sequence backwards', Number((await req('GET', '/api/billid')).billID) > beforeRestore.billSequence);
  const imported = structuredClone(snapshot);
  const high = Number((await req('GET', '/api/billid')).billID)+100;
  imported.billSequence = high;
  await req('POST', '/api/import', imported);
  check('backup preserves reserved and cancelled bill numbers', Number((await req('GET', '/api/billid')).billID) === high+1);
  const legacy = structuredClone(beforeRestore); delete legacy.billSequence;
  const importedBill = high+100;
  legacy.tables.TableOrders.find(x => x.ID === reopened.id).BillID = String(importedBill);
  await req('POST', '/api/import', legacy);
  check('legacy imports advance sequence past existing short bills', Number((await req('GET', '/api/billid')).billID) === importedBill+1);
} finally { await req('POST', '/api/import', snapshot); }
console.log(`${passed} bill sequence checks passed`);
