import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { createAgent } = require('../print-agent/server.js');
const directory = mkdtempSync(path.join(os.tmpdir(),'cottage-agent-test-'));
const calls = [];
let active = 0, maxActive = 0, fail = false, server, base, passed = 0;
const options = { jobDirectory:directory, getPrinters: async()=>[{name:'POS-58',port:'USB002',status:0,thermalCandidate:true},{name:'Offline POS',status:128}], spool:async(printer,file)=>{ active++; maxActive=Math.max(maxActive,active); try { if(fail) throw Error('spool interrupted'); calls.push({printer,bytes:readFileSync(file)}); await new Promise(resolve=>setTimeout(resolve,10)); } finally {active--;} } };
async function start() { server=createAgent(options); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); base='http://127.0.0.1:'+server.address().port; }
async function stop() { server.closeIdleConnections(); await new Promise(resolve=>server.close(resolve)); }
async function req(url,body,origin) { const res=await fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined}); return {status:res.status,data:await res.json()}; }
function check(label,value) { assert.ok(value,label);passed++;console.log('  ok    '+label); }
try {
 await start();
 const status=await req('/status'); check('agent advertises raster and deduplication',status.data.features.raster&&status.data.features.deduplication);
 check('printer diagnostics identify USB port',status.data.printerDetails[0].port==='USB002');
 check('production website can reach agent',(await req('/status',null,'https://cottage-skybar-pos.ekapap-j.workers.dev')).status===200);
 check('unrelated websites cannot send print jobs',(await req('/print',{printer:'POS-58',raw:'1b40'},'https://example.com')).status===403);
 check('malformed hex rejected',(await req('/print',{printer:'POS-58',raw:'not hex'})).status===400);
 check('nonexistent Windows queue rejected',(await req('/print',{printer:'missing',raw:'1b40'})).status===400);
 check('offline printer rejected',(await req('/print',{printer:'Offline POS',raw:'1b40'})).status===409);
 check('dry run does not spool',(await req('/print?dry=1',{printer:'POS-58',raw:'1b40'})).status===200&&calls.length===0);
 const job={printer:'POS-58',raw:'1b40'+('ff'.repeat(90000)),jobId:'large-raster'};
 check('receipt images larger than legacy 64KB limit print',(await req('/print',job)).status===200&&calls[0].bytes.length===90002);
 check('repeated job is acknowledged without printing twice',(await req('/print',job)).data.alreadyQueued===true&&calls.length===1);
 check('same job ID with different data rejected',(await req('/print',{...job,raw:'1b40'})).status===409);
 await Promise.all([req('/print',{printer:'POS-58',raw:'1b40',jobId:'parallel-1'}),req('/print',{printer:'POS-58',raw:'1b40',jobId:'parallel-2'})]);
 check('Windows spool jobs are serialized',maxActive===1&&calls.length===3);
 fail=true;check('spool error reported',(await req('/print',{printer:'POS-58',raw:'1b40',jobId:'uncertain'})).status===500);fail=false;
 check('uncertain job cannot silently print again',(await req('/print',{printer:'POS-58',raw:'1b40',jobId:'uncertain'})).status===409);
 await stop(); await start();
 check('deduplication survives restarting print-agent',(await req('/print',job)).data.alreadyQueued===true&&calls.length===3);
} finally {if(server?.listening)await stop();assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep+'cottage-agent-test-'));rmSync(directory,{recursive:true});}
console.log(`\n${passed} passed`);
