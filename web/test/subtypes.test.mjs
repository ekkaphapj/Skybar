import assert from 'node:assert/strict';
const BASE=process.env.BASE_URL||'http://127.0.0.1:8795';
assert.ok(['localhost','127.0.0.1'].includes(new URL(BASE).hostname),'Only isolated local database');
function client(){return{cookie:'',async req(method,path,body){const r=await fetch(BASE+path,{method,headers:{'Content-Type':'application/json',Cookie:this.cookie},body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.has('set-cookie'))this.cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,data:await r.json()};}};}
const admin=client(),staff=client();let passed=0,userID;
function check(label,value){assert.ok(value,label);passed++;console.log('ok '+label);}
assert.equal((await admin.req('POST','/api/login',{username:'admin',password:'1234'})).status,200);
const before=(await admin.req('GET','/api/export')).data;
try {
 const username='subtypes_'+Date.now();userID=(await admin.req('POST','/api/users',{username,displayName:'พนักงานย่อย',password:'5678'})).data.id;await staff.req('POST','/api/login',{username,password:'5678'});
 const type=(await admin.req('POST','/api/item-types',{name:'หลักสองระดับ'})).data.id;
 const create=body=>admin.req('POST','/api/item-subtypes',{name:'เบียร์ทดสอบ',price:55.5,itemTypeId:type,...body});
 const first=(await create({})).data.id, second=(await create({name:'ไวน์',price:100})).data.id;
 check('subtypes are directly sellable products',Number.isInteger(first)&&(await admin.req('GET','/api/items/'+first)).data.Price===55.5);
 check('new subtype has zero initial stock',(await admin.req('GET','/api/items/'+first)).data.Amount===0);
 check('duplicate subtype rejected',(await create({})).status===409);
 for(const price of [-1,null,'20',0.001])check('invalid price '+JSON.stringify(price),(await create({name:'invalid',price})).status===400);
 check('missing price rejected',(await admin.req('POST','/api/item-subtypes',{name:'invalid',itemTypeId:type})).status===400);
 check('invalid parent rejected',(await create({itemTypeId:999999999})).status===400);
 for(const name of ['',null,3,'x'.repeat(101)])check('invalid name '+JSON.stringify(name),(await create({name})).status===400);
 for(const [method,path,body]of [['POST','/api/item-subtypes',{name:'forged',price:1,itemTypeId:type}],['PUT','/api/item-subtypes/'+first,{name:'forged',price:1}],['DELETE','/api/item-subtypes/'+first]])check('staff cannot '+method,(await staff.req(method,path,body)).status===403);
 const listed=(await staff.req('GET','/api/item-subtypes?typeID='+type)).data;
 check('listing exposes name and selling price',listed.length===2&&listed.some(s=>s.ID===first&&s.Name1==='เบียร์ทดสอบ'&&s.Price===55.5));
 check('no third level via subtype endpoint',(await create({name:'ระดับสาม',parentSubtypeId:first})).status===400);
 check('no third level via product endpoint',(await admin.req('POST','/api/items',{name:'ระดับสาม',price:1,itemTypeId:type,itemSubtypeId:first})).status===400);
 check('old assign endpoint rejects third level',(await admin.req('PUT','/api/items/'+first+'/subtype',{itemSubtypeId:second})).status===400);
 check('edit name and price',(await admin.req('PUT','/api/item-subtypes/'+first,{name:'เบียร์ใหม่',price:65.75})).status===200);
 let item=(await staff.req('GET','/api/items/'+first)).data;
 check('POS reads edited name and price',item.Name1==='เบียร์ใหม่'&&item.Price===65.75&&item.ItemTypeID===type&&item.ItemSubtypeID===null);
 check('duplicate rename rejected',(await admin.req('PUT','/api/item-subtypes/'+first,{name:'ไวน์',price:1})).status===409);
 const billID='two-level-'+crypto.randomUUID();
 check('sell subtype using edited price',(await staff.req('POST','/api/sell',{billID,paymentType:'เงินสด',items:[{itemID:first,qty:2}]})).data.total===131.5);
 check('sale deducts same subtype stock',(await staff.req('GET','/api/items/'+first)).data.Amount===-2);
 await admin.req('PUT','/api/item-subtypes/'+first,{name:'เบียร์ใหม่',price:99});
 check('past receipt keeps original total',(await staff.req('GET','/api/sell/receipt/'+billID)).data.total===131.5);
 check('purchase replenishes same subtype',(await staff.req('POST','/api/stock/transaction',{action:'purchase',itemID:first,amount:10,price:400,paymentType:'โอน',place:'ตลาด'})).status===200&&(await staff.req('GET','/api/items/'+first)).data.Amount===8);
 const snapshot=(await admin.req('GET','/api/export')).data;
 check('backup contains subtype price',snapshot.tables.Items.some(i=>i.ID===first&&i.Price===99));
 check('backup restores two-level catalog',(await admin.req('POST','/api/import',snapshot)).status===200);
 const legacy=structuredClone(snapshot);
 legacy.tables.ItemSubtype.push({ID:99999999,ItemTypeID:type,Name1:'กลุ่มเก่า'});
 legacy.tables.Items.find(i=>i.ID===first).ItemSubtypeID=99999999;
 check('legacy backup flattened safely',(await admin.req('POST','/api/import',legacy)).status===200&&(await staff.req('GET','/api/items/'+first)).data.ItemSubtypeID===null);
 check('delete subtype removes product from catalog',(await admin.req('DELETE','/api/item-subtypes/'+first)).status===200&&(await staff.req('GET','/api/items/'+first)).status===404);
 check('deleted subtype receipt still available',(await staff.req('GET','/api/sell/receipt/'+billID)).data.total===131.5);
 check('deleted subtype absent from second level',!(await staff.req('GET','/api/item-subtypes?typeID='+type)).data.some(s=>s.ID===first));
} finally {assert.equal((await admin.req('POST','/api/import',before)).status,200);if(userID)await admin.req('PUT','/api/users/'+userID,{active:false});}
console.log(passed+' two-level subtype checks passed');
