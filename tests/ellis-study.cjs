'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const units=60,context={window:{Driftworks:{sim:{METERS_PER_UNIT:units}}},Math};
vm.runInNewContext(fs.readFileSync('experiments/ellis-study.js','utf8'),context);
const study=context.window.Driftworks.ellisStudy;
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
function basis(p){for(const v of [p.right,p.up,p.back])assert(Math.abs(dot(v,v)-1)<1e-10);assert(Math.abs(dot(p.right,p.up))<1e-10);assert(Math.abs(dot(p.right,p.back))<1e-10);const [r,u,b]=[p.right,p.up,p.back];assert(dot([r[1]*u[2]-r[2]*u[1],r[2]*u[0]-r[0]*u[2],r[0]*u[1]-r[1]*u[0]],b)>.999999);}
for(const name of ['detail','front','close','side','rim','above','chase','rime']){const p=study.camera(name);basis(p);assert.equal(p.region,name==='rime'?1:0);const center=[p.region*12000,-2000,1550],offset=p.eye.map((v,i)=>v*units-center[i]);assert(Math.hypot(...offset)>300);assert(dot(offset,p.back)>0);}
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

for(const name of ['axis-sweep','throat-orbit','tumble']){
 const start=study.sample(0,name)[0],end=study.sample(24,name)[0];
 for(let i=0;i<=720;i++){
  const t=i/30,tracks=study.sample(t,name);assert.equal(tracks.length,1);
  const a=tracks[0];basis(a.pose);
  const center=[a.pose.region*12000,-2000,1550];
  assert(Math.hypot(...a.pose.eye.map((v,j)=>v*units-center[j]))>=300);
  const dt=1e-4,b=study.sample(t+dt,name)[0],c=study.sample(t-dt,name)[0];
  a.velocity.forEach((v,j)=>assert(Math.abs(v-(b.pose.eye[j]-c.pose.eye[j])*units/(2*dt))<1e-5,'velocity matches the scripted path'));
 }
 for(const key of ['eye','right','up','back'])assert(Math.hypot(...start.pose[key].map((v,j)=>v-end.pose[key][j]))<1e-10,'loop closes in position and orientation');
}
assert.equal(study.sample(0,'axis-sweep')[0].pose.eye[0]*units,12000);
assert(Math.abs(study.sample(6,'axis-sweep')[0].pose.eye[0]*units-12030)<1e-8);
assert.deepEqual(Array.from(study.sample(6,'tumble')[0].pose.eye),Array.from(study.sample(0,'tumble')[0].pose.eye));
console.log('PASS Ellis stress fixtures: single fighters, closed loops, finite frames and analytic velocities');

// The close stress camera and opposite-mouth sources must produce a resolved,
// central optical image, rather than merely submitting an invisible actor.
vm.runInNewContext(fs.readFileSync('experiments/ellis-optics.js','utf8'),context);
const detail=study.camera('detail'),optics=context.window.Driftworks.ellisOptics;
for(const name of ['tumble','axis-sweep'])for(let t=0;t<=24;t+=.5){
 const source=study.sample(t,name)[0].pose;
 const eye=detail.eye.map(v=>v*units),target=source.eye.map(v=>v*units);
 const h=optics.primary(eye,target,detail.region,source.region);assert(h);
 const depth=-dot(h.direction,detail.back);
 assert(depth>.9,'stress image stays near the center in detail view');
 assert(h.length<220,'12 m fighter is resolved at the close stress range');
}
console.log('PASS Ellis stress visibility: central primary images within 220 m in throat detail view');

for(const name of ['dogfight','dogfight-crossing']){
 let split=0,minRange=Infinity,maxRange=0;
 for(let frame=0;frame<720;frame++){
  const t=frame/30,leader=study.sample(t,name)[0],view=study.camera(name,t);
  basis(leader.pose);basis(view);
  for(const p of [leader.pose,view]){
   const mouth=[p.region*12000,-2000,1550];
   const radius=Math.hypot(...p.eye.map((v,j)=>v*units-mouth[j]));
   assert(radius>=300-1e-8&&radius<351,'pursuit remains inside the 600 m lensing volume');
  }
  const h=optics.primary(view.eye.map(v=>v*units),leader.pose.eye.map(v=>v*units),view.region,leader.pose.region);
  assert(h,'leader has a primary image throughout pursuit');
  assert(-dot(h.direction,view.back)>.999999,'chase aims at the optical image');
  assert(h.length>12&&h.length<220,'pursuit image is resolved with separation exceeding hull length');
  minRange=Math.min(minRange,h.length);maxRange=Math.max(maxRange,h.length);
  if(view.region!==leader.pose.region)split++;
  const dt=1e-5,a=study.sample(t-dt,name)[0].pose,b=study.sample(t+dt,name)[0].pose;
  if(a.region===b.region)leader.velocity.forEach((v,j)=>assert(Math.abs(v-(b.eye[j]-a.eye[j])*units/(2*dt))<1e-4));
 }
 assert.equal(split>0,name==='dogfight-crossing');
 for(const fn of [t=>study.camera(name,t),t=>study.sample(t,name)[0].pose]){
  const a=fn(.123),b=fn(24.123);assert.equal(a.region,b.region);
  for(const key of ['eye','right','up','back'])assert(Math.hypot(...a[key].map((v,j)=>v-b[key][j]))<1e-9);
 }
 console.log(`PASS Ellis ${name}: 720 frames, zero missing primary images, optical range ${minRange.toFixed(1)}-${maxRange.toFixed(1)} m, ${split} split-chart frames`);
}
for(const t of [6,18]){
 assert.notEqual(study.sample(t-.001,'dogfight-crossing')[0].pose.region,study.sample(t+.001,'dogfight-crossing')[0].pose.region);
 assert.notEqual(study.camera('dogfight-crossing',t+.699).region,study.camera('dogfight-crossing',t+.701).region);
}
for(const time of [6.7,18.7]){
 const before=study.camera('dogfight-crossing',time-1e-6),after=study.camera('dogfight-crossing',time+1e-6);
 const mouth=[before.region*12000,-2000,1550],radial=before.eye.map((v,i)=>v*units-mouth[i]);
 const n=radial.map(v=>v/Math.hypot(...radial));
 for(const axis of ['right','up','back']){
  // Chart identification is a half-turn about the throat radial axis.
  const transported=before[axis].map((v,i)=>2*n[i]*dot(before[axis],n)-v);
  assert(dot(transported,after[axis])>.999999,'full chase frame must remain continuous across chart crossing: '+axis);
 }
}
console.log('PASS Ellis chase frame: no artificial roll snap at either off-equator throat crossing');

for(const name of ['yoyo','yoyo-throat']){
 const a=study.yoYo(0,name),far=study.yoYo(12,name),end=study.yoYo(24,name);
 assert.equal(a.distance,10);assert.equal(far.distance,240);assert.equal(end.distance,10);
 basis(a.view);assert.equal(study.sample(0,name).length,0,'calibration replaces fighters');
 for(let i=0;i<720;i++){
  const frame=study.yoYo(i/30,name);basis(frame.view);
  for(const p of frame.points){
   assert(p.point.every(Number.isFinite));
   const radial=Math.hypot(p.point[0]-p.region*12000,p.point[1]+2000,p.point[2]-1550);
   assert(radial>=300-1e-9,'intrinsic placement never puts a corner inside the chart sphere');
  }
  const center=frame.points[4],radial=Math.hypot(center.point[0]-center.region*12000,center.point[1]+2000,center.point[2]-1550);
  assert(Math.abs(radial-Math.hypot(300,frame.observerL-frame.distance))<1e-10);
 }
}
// At l=0 the transverse geodesic stays on the neck and has arc angle s/a.
const neck=study.yoYoAt(120,120,1.5);
for(const p of neck.points.slice(0,4)){
 const delta=[p.point[0],p.point[1]+2000,p.point[2]-1550];
 assert(Math.abs(Math.hypot(...delta)-300)<1e-10);
 assert(Math.abs(Math.atan2(Math.hypot(delta[0],delta[2]),-delta[1])-Math.hypot(1.5,1.5)/300)<1e-12);
}
const yoyoReport=require('../tools/measure-ellis-yoyo.cjs').measure();
for(const c of yoyoReport.cases.filter(c=>c.observerProperRadiusMeters>=10))assert(c.localFlatnessPass,'near-throat direct images converge to ordinary perspective');
console.log('PASS Ellis yo yo: intrinsic placement, source chart crossing, closed radial loop and near-throat local-flatness limit');
console.log('Ellis yo yo on-throat diagnostic: localFlatnessPass='+yoyoReport.cases.find(c=>c.observerProperRadiusMeters===0).localFlatnessPass+' (tracked independently; not asserted as accepted optics)');
