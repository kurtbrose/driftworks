'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={window:{Driftworks:{}}};vm.runInNewContext(fs.readFileSync('experiments/performance.js','utf8'),c);
const make=c.window.Driftworks.flightPerformance.gpuTimer;
const unsupported=make(null);assert.equal(unsupported.available,false);unsupported.begin(()=>assert.fail())();unsupported.poll();unsupported.dispose();
function fixture(){
 let next=0,ready=false,disjoint=false,lost=false,reads=0,deleted=0,active=false;
 const ext={TIME_ELAPSED_EXT:3,GPU_DISJOINT_EXT:4};
 const gl={QUERY_RESULT_AVAILABLE:1,QUERY_RESULT:2,getExtension:()=>ext,isContextLost:()=>lost,getParameter:()=>disjoint,
  createQuery:()=>({id:++next}),beginQuery(){assert(!active);active=true;},endQuery(){assert(active);active=false;},deleteQuery(){deleted++;},
  getQueryParameter(q,key){if(key===1)return ready;assert(ready,'never read GPU result before available');reads++;return q.id*1000000;}};
 return {timer:make({getContext:()=>gl}),ready:()=>{ready=true;},disjoint:()=>{disjoint=true;},lose:()=>{lost=true;},counts:()=>({reads,deleted,active})};
}
const f=fixture(),values=[];f.timer.begin(ms=>values.push(ms))();f.timer.poll();assert.equal(f.counts().reads,0);f.ready();f.timer.poll();assert.deepEqual(values,[1]);assert.equal(f.timer.pending(),0);assert.equal(f.counts().deleted,1);
for(let i=0;i<12;i++)f.timer.begin(ms=>values.push(ms))();f.timer.poll();assert.equal(f.timer.valid(),true);f.timer.dispose();
const slow=fixture();for(let i=0;i<20;i++)slow.timer.begin(()=>assert.fail())();assert.equal(slow.timer.pending(),8,'bound outstanding queries');slow.timer.dispose();assert.equal(slow.counts().deleted,8);
const d=fixture();d.timer.begin(()=>assert.fail('disjoint sample must be discarded'))();d.disjoint();d.ready();d.timer.poll();assert.equal(d.timer.valid(),false);assert.equal(d.timer.pending(),0);assert.equal(d.counts().reads,0);d.timer.dispose();
const lost=fixture();lost.timer.begin(()=>assert.fail())();lost.lose();lost.timer.poll();assert.equal(lost.timer.valid(),false);lost.timer.dispose();
const active=fixture();active.timer.begin(()=>{});assert.throws(()=>active.timer.begin(()=>{}),/Overlapping/);active.timer.dispose();assert.equal(active.counts().active,false);assert.equal(active.counts().deleted,1);
console.log('PASS async GPU timer: unsupported fallback, nanosecond conversion, nonblocking availability, bounded queue, disjoint/context-loss rejection and active-query cleanup');
