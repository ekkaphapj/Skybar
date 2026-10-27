import assert from 'node:assert/strict';
const base = process.env.BASE_URL || 'http://127.0.0.1:8801';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Isolated local database only');
let cookie = '', passed = 0;
async function req(method, path, body) {
  const r = await fetch(base + path, { method, headers: { 'Content-Type':'application/json', Cookie:cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.headers.has('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
  return { status:r.status, data:await r.json() };
}
function check(label, value) { assert.ok(value, label); passed++; console.log('ok '+label); }
assert.equal((await req('POST','/api/login',{username:'admin',password:'1234'})).status,200);
const snapshot = (await req('GET','/api/export')).data;
try {
  const initial = (await req('GET','/api/dashboard')).data;
  const busy = new Set((await req('GET','/api/orders')).data.map(o=>o.tableNo));
  const free = Array.from({length:20},(_,i)=>i+1).filter(n=>!busy.has(n)); assert.ok(free.length >= 3);
  for (const guestCount of [0,6,1.5,true,'bad']) check('invalid guest count '+guestCount+' rejected',(await req('POST','/api/orders',{tableNo:free[0],guestCount})).status===400);
  const party = (await req('POST','/api/orders',{tableNo:free[0],guestCount:5,cusName:'โต๊ะห้าคน'})).data;
  check('party size saved on opening',party.guestCount===5);
  check('party size survives reload',(await req('GET','/api/orders/'+party.id)).data.guestCount===5);
  const legacy = (await req('POST','/api/orders',{tableNo:free[1]})).data;
  check('omitted party size defaults to one',legacy.guestCount===1);
  const empty = (await req('POST','/api/orders',{tableNo:free[2],guestCount:''})).data;
  check('blank party size defaults to one',empty.guestCount===1);
  const itemID = (await req('POST','/api/items',{name:'ทดสอบฉากลูกค้า',price:20,itemTypeId:2,amount:30})).data.id;
  await req('PUT','/api/orders/'+party.id,{revision:0,items:[{itemID,qty:2}],cusName:'โต๊ะห้าคน'});
  check('saving bill preserves guest count',(await req('GET','/api/orders/'+party.id)).data.guestCount===5);
  const closed = await req('POST','/api/orders/'+party.id+'/checkout',{revision:1,paymentType:'เงินสด'});
  check('receipt records party size',closed.status===200&&closed.data.guestCount===5);
  const history = (await req('GET','/api/orders/'+party.id)).data;
  check('closed history keeps party size',history.guestCount===5&&history.receipt.guestCount===5);
  await req('POST','/api/stock/transaction',{action:'income',price:100,paymentType:'อื่นๆ',comment:'รายรับทดสอบเต็มจอ'});
  await req('POST','/api/stock/transaction',{action:'expense',price:35,paymentType:'โอน',comment:'รายจ่ายทดสอบเต็มจอ'});
  const d = (await req('GET','/api/dashboard')).data;
  check('today customer tables include open and closed visits',d.todayTables===initial.todayTables+3);
  check('current tables exclude checked out table',d.activeTables===initial.activeTables+2);
  check('fullscreen income includes all account channels',d.dailyIncome===initial.dailyIncome+140);
  check('fullscreen expenses use daily account costs',d.dailyExpense===initial.dailyExpense+35);
  const fixture = (await req('GET','/api/export')).data;
  const boundary = Date.parse(d.date+'T00:00:00Z')-5*3600000;
  for (const offset of [-1,0,86400000-1,86400000]) fixture.tables.TableOrders.push({ID:crypto.randomUUID(),BillID:crypto.randomUUID(),TableNo:20,Status:'closed',OpenedAt:new Date(boundary+offset).toISOString(),GuestCount:1});
  assert.equal((await req('POST','/api/import',fixture)).status,200);
  check('today visit count uses Bangkok 02:00 cutoff',(await req('GET','/api/dashboard')).data.todayTables===d.todayTables+2);
  const oldBackup = structuredClone(fixture); oldBackup.tables.TableOrders.forEach(o=>delete o.GuestCount);
  assert.equal((await req('POST','/api/import',oldBackup)).status,200);
  check('older backups restore with one guest default',(await req('GET','/api/orders')).data.every(o=>o.guestCount===1));
} finally { assert.equal((await req('POST','/api/import',snapshot)).status,200,'Restore test database'); }
console.log(`${passed} scene API checks passed`);
