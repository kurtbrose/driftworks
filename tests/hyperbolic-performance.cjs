const assert=require('node:assert/strict'),fs=require('node:fs');
const {createFlight,loadRuntime}=require('../tools/headless.cjs');
const {referenceHull}=require('../tools/benchmark-hyperbolic.cjs');
const DW=loadRuntime(),H=DW.flightHyperbolic,U=DW.sim.METERS_PER_UNIT;
let seed=29,hits=0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(const radius of [350,650,1800]){
 const craft=DW.training.createCraft('sweep',DW.arcade.create(0),'enemy');craft.collision={kind:'model',modelId:'concept-trio:raptor'};craft.pose.curvature=radius;craft.pose.eye=H.offset([0,0,0],[200,300,70].map(v=>v/U),radius);
 const local=v=>{const n=Math.hypot(...v),length=radius/U*Math.atanh(n/radius);return H.offset(craft.pose.eye,v.map(x=>x*length/(n||1)),radius);};
 for(let i=0;i<128;i++){
  const a=local([random()*50-25,-40,random()*20-10]),b=local([random()*50-25,40,random()*20-10]),head=[0,.3,1.5][i%3];
  const fast=DW.training.hullHit(craft,a,b,head),slow=referenceHull(DW,craft,a,b,head,DW.training.hullHit);
  assert.equal(!!fast,!!slow,'conservative broad phase must never discard an authored-hull hit');if(fast){hits++;assert.ok(Math.abs(fast.fraction-slow.fraction)<1e-6);}
 }
}
assert.ok(hits>10,'differential sweep must include real mesh contacts');

for(const radius of [350,650,1800,100000]){
 const f=createFlight({mission:'hyperbolic',seed:29});f.snapshot().state.curvature=radius;f.snapshot().combat.enemies.forEach(c=>c.pose.curvature=radius);
 const modes=new Set();let samples=0;
 for(let i=0;i<1200;i++){
  f.advance(1/120,{fire:true,boost:true,yaw:.45,pitch:.12});const v=f.snapshot();if(v.combat.dead)break;
  if(i%120===0){samples++;for(const c of [v.combat.player,...v.combat.enemies]){assert.ok(c.pose.eye.every(Number.isFinite));assert.ok(c.pose.velocity.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...c.pose.right)-1)<1e-5);modes.add(c.mode);}for(const b of f.DW.training.allGuns(v.combat,v.guns).bolts){assert.equal(b.curvature,radius);assert.ok(b.position.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...b.direction)-1)<1e-5);}}
 }
 assert.ok(samples>1);assert.ok(modes.size>1);assert.equal(f.snapshot().state.curvature,radius);
}
const page=fs.readFileSync('experiments/hyperbolic-flight.html','utf8');assert.match(page,/flight\.html\?mission=hyperbolic/);assert.doesNotMatch(page,/hyperbolic-flight(?:-model)?\.js/);
console.log('PASS sustained production hyperbolic sessions: native AI/guns, four curvatures, finite rebasing and canonical entry');
