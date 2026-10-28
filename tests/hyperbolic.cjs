'use strict';
const assert=require('node:assert/strict');
global.window={Driftworks:{}};
require('../experiments/hyperbolic-model.js');
const H=window.Driftworks.hyperbolic;
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const origin=[1,0,0], forward=[0,0,1];
near(H.distance(origin,H.exp(origin,forward,2)),2);
const a={p:origin.slice(),f:forward.slice(),r:[0,1,0]};
H.move(a,1.2);near(H.dot(a.p,a.p),-1);near(H.dot(a.f,a.f),1);near(H.dot(a.p,a.f),0);
near(H.segmentDistance({p:origin,f:forward,r:[0,1,0]},H.exp(origin,forward,.3),1),0);
near(H.segmentDistance({p:origin,f:forward,r:[0,1,0]},H.exp(origin,forward,2),1),1);
H.turn(a,.7);near(H.dot(a.f,a.r),0);near(H.dot(a.f,a.f),1);
for(const radius of [350,700,1800,100000]){
  const w=H.create(radius);let hits=0;
  for(let i=0;i<14400;i++){
    H.step(w,1/120,{auto:true,turn:0,throttle:0,fire:false});
    if(w.bursts.length)hits++;
    if(i%120===0)for(const f of w.fighters){assert.ok(f.p.every(Number.isFinite));near(H.dot(f.p,f.p),-1,1e-5);near(H.dot(f.f,f.f),1,1e-5);near(H.dot(f.p,f.f),0,1e-5);}
  }
  assert.ok(hits>0,'AI must land hits');assert.ok(w.score[0]+w.score[1]>0,'battle must produce kills');assert.ok(w.shots.length<200);
  console.log('120 s battle',radius,w.score);
}
console.log('Hyperbolic geodesics, transported frames, swept hits and battles passed');
const escape=H.create(350);
for(let i=0;i<14400;i++){
  H.step(escape,1/120,{auto:false,turn:0,throttle:1,fire:true});
  if(i%120===0)for(const f of escape.fighters){assert.ok(f.p.every(Number.isFinite));near(H.dot(f.p,f.p),-1,1e-5);}
}
console.log('Two-minute manual escape stays numerically stable');
