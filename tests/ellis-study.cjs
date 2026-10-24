'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const units=60,context={window:{Driftworks:{sim:{METERS_PER_UNIT:units}}},Math};
vm.runInNewContext(fs.readFileSync('experiments/ellis-study.js','utf8'),context);
const study=context.window.Driftworks.ellisStudy;
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function basis(p){for(const v of [p.right,p.up,p.back])assert(Math.abs(dot(v,v)-1)<1e-10);assert(Math.abs(dot(p.right,p.up))<1e-10);assert(Math.abs(dot(p.right,p.back))<1e-10);const [r,u,b]=[p.right,p.up,p.back];assert(dot([r[1]*u[2]-r[2]*u[1],r[2]*u[0]-r[0]*u[2],r[0]*u[1]-r[1]*u[0]],b)>.999999);}
for(const name of ['front','close','side','rim','above','chase','rime']){const p=study.camera(name);basis(p);assert.equal(p.region,name==='rime'?1:0);const center=[p.region*12000,-2000,1550],offset=p.eye.map((v,i)=>v*units-center[i]);assert(Math.hypot(...offset)>300);assert(dot(offset,p.back)>0);}
for(let i=0;i<=720;i++){const tracks=study.sample(i/30,'combined');assert.equal(tracks.length,3);for(const t of tracks){basis(t.pose);assert([0,1].includes(t.pose.region));const c=[t.pose.region*12000,-2000,1550];assert(Math.hypot(...t.pose.eye.map((v,j)=>v*units-c[j]))>=300-1e-8);assert(t.velocity.every(Number.isFinite));}}
assert.equal(study.sample(0,'crossing').length,1);assert.equal(study.sample(0,'orbit').length,2);
for(const time of [6,18]){const a=study.sample(time-1e-6,'crossing')[0].pose,b=study.sample(time+1e-6,'crossing')[0].pose;assert.notEqual(a.region,b.region);const local=p=>p.eye.map((v,i)=>v*units-[p.region*12000,-2000,1550][i]);assert(Math.hypot(...local(a).map((v,i)=>v+local(b)[i]))<1e-6,'mouth crossing is antipodal');assert(dot(a.right,b.right)<-.999999);assert(dot(a.up,b.up)<-.999999);assert(dot(a.back,b.back)>.999999);}
for(const scenario of ['combined','crossing','orbit']){const a=study.sample(0,scenario),b=study.sample(24,scenario);a.forEach((track,i)=>{assert.equal(track.pose.region,b[i].pose.region);assert(Math.hypot(...track.pose.eye.map((v,j)=>v-b[i].pose.eye[j]))<1e-10);});}
console.log('PASS Ellis observation: fixed orthonormal cameras, bounded deterministic tracks and antipodal two-way crossings');

const chase=study.camera('chase'),nearby=study.sample(0,'nearby');
assert.equal(nearby.length,1);assert.equal(nearby[0].pose.region,chase.region);
const nearRange=Math.hypot(...nearby[0].pose.eye.map((v,i)=>(v-chase.eye[i])*units));
assert(Math.abs(nearRange-Math.hypot(12,40))<1e-8,'Nearby fixture reproduces a 42 m chase contact');
console.log('PASS Ellis nearby fixture: fixed local camera and 42 m ship');

for(let t=0;t<24;t+=.05){basis(study.camera('pursuit',t));assert.equal(study.sample(t,'pursuit').length,1);}
for(const [leader,camera] of [[3,4.5],[15,16.5]]){
 assert.notEqual(study.sample(leader-.001,'pursuit')[0].pose.region,study.sample(leader+.001,'pursuit')[0].pose.region);
 assert.notEqual(study.camera('pursuit',camera-.001).region,study.camera('pursuit',camera+.001).region);
 assert.notEqual(study.camera('pursuit',leader+.1).region,study.sample(leader+.1,'pursuit')[0].pose.region,'Fixture covers an actual cross-chart chase interval');
}
console.log('PASS Ellis pursuit fixture: delayed following camera and two leader/observer throat crossings');

for(let t=0;t<24;t+=.05){const p=study.camera('pursuit-offset',t);basis(p);const a=study.camera('pursuit',t);assert.equal(p.region,a.region);const mouth=[p.region*12000,-2000,1550];assert(Math.abs(Math.hypot(...p.eye.map((v,i)=>v*units-mouth[i]))-Math.hypot(...a.eye.map((v,i)=>v*units-mouth[i])))<1e-8,'offset pursuit preserves proper radial crossing');}
console.log('PASS Ellis offset pursuit: continuous angular offset, orthonormal frames and unchanged throat radii');
