// Execute the real worker with deterministic local resources and a stale-cache trap.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto'),assert=require('node:assert/strict');
const blobs=new Map(),executed=[],messages=[],fetched=new Map();let serial=0,context;
const sandbox={TextEncoder,URLSearchParams,crypto:webcrypto,
  Blob:class {constructor(parts){this.text=parts.join('');}},
  URL:{createObjectURL(blob){const id='blob:study-'+serial++;blobs.set(id,blob.text);return id;},revokeObjectURL(id){blobs.delete(id);}},
  fetch:async function(file,options){assert.equal(options.cache,'no-cache');const source=fs.readFileSync(path.resolve(__dirname,'../experiments',file),'utf8').replace(/\r\n/g,'\n');fetched.set(file,source);return {ok:true,text:async()=>source};},
  importScripts:function(url){assert.ok(blobs.has(url),'Execute the fetched snapshot, never an importScripts cached path');const source=blobs.get(url);executed.push(createHash('sha256').update(source).digest('hex'));vm.runInContext(source,context);},
  postMessage:message=>messages.push(message)
};
context=vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../experiments/flight-study-worker.js'),'utf8'),context);
sandbox.onmessage({data:{ships:[1],styles:['baseline','fso-pursuit','fso-breaker'],weapons:[-1],starts:['headOn'],pilots:['perfect'],skills:[1],seeds:1,seed:1,duration:1,pairing:'mirror',defenses:'retail'}}).then(()=>{
  assert.equal(messages.at(-1).kind,'done',JSON.stringify(messages.at(-1)));
  const ready=messages.find(m=>m.kind==='ready');assert.equal(ready.total,3);
  assert.equal(executed.length,fetched.size);assert.equal(blobs.size,0);
  assert.deepEqual(executed,[...fetched.keys()].map(file=>ready.manifest.hashes[file]));
  const rows=messages.filter(m=>m.kind==='rows').flatMap(m=>m.rows);assert.equal(rows.length,3);
  assert.ok(rows.every(row=>row.summary.ticks===120));
  console.log('PASS flight study worker: fetched source equals executed/fingerprinted source, ordered imports, cleanup and all three technique variants');
}).catch(error=>{console.error(error);process.exitCode=1;});
