'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({window:{Driftworks:{}},Float32Array,Math});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/explosions.js'),'utf8'),context);
const api=context.window.Driftworks.explosions,right=[1,0,0],up=[0,1,0];
const blast={position:[10,20,30],velocity:[3,-2,1],age:.3,size:1.75,seed:27};
const snapshot=b=>api.build(b,right,up).map(x=>({...x,vertices:Array.from(x.vertices),color:Array.from(x.color)}));
const initial=snapshot(blast);
assert.deepEqual(initial,snapshot(blast),'Paused/scrubbed snapshots are repeatable');
assert(initial.some(b=>b.finish===10)&&initial.some(b=>b.finish===11));
assert(!snapshot({...blast,age:.4}).some(b=>b.finish===11),'Shockwave expires early');
assert(!snapshot({...blast,age:1.3}).some(b=>b.finish===10),'Fireball expires before wreckage');
assert.equal(snapshot({...blast,age:5.5}).length,0,'All visual layers expire');
assert.equal(snapshot({...blast,age:-1}).length,0);
for(const age of [0,.03,.2,.8,1.8,5.4])for(const b of snapshot({...blast,age})){
  assert.equal(b.vertices.length%18,0);assert(b.vertices.every(Number.isFinite));
}
const stationary=snapshot({...blast,velocity:[0,0,0]});
initial.forEach((b,j)=>b.vertices.forEach((v,i)=>{
  const component=i%6;if(component<3)assert(Math.abs(v-stationary[j].vertices[i]-blast.velocity[component]*blast.age)<.00001,'All layers inherit ship drift');
}));
const translated=snapshot({...blast,position:[110,220,330]});
initial.forEach((b,j)=>b.vertices.forEach((v,i)=>{const c=i%6;if(c<3)assert(Math.abs(translated[j].vertices[i]-v-[100,200,300][c])<.0001);}));
console.log('PASS explosions: deterministic pause/scrub, finite geometry, inherited drift, world anchoring and layer expiry');
