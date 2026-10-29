'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {loadRuntime,createFlight}=require('../tools/headless.cjs');
const DW=loadRuntime(),H=DW.flightHyperbolic,U=DW.sim.METERS_PER_UNIT;
const ctx=vm.createContext({window:{Driftworks:DW},Float32Array,Map,WeakMap,Math});
for(const file of ['assets/ships/aegis-kit/flight-rig.js','experiments/aegis-flight.js','src/scene3d.js','experiments/hyperbolic-flyby.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),ctx);
const rig=H.createCapitals(),camera={curvature:650,eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
const near=(a,b,t=1e-4)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
// A long textured triangle exercises independent auxiliary channels and seams.
const sample={color:[1,1,1],stride:8,vertices:new Float32Array([0,0,0,0,0,1,0,0,6,0,0,0,0,1,1,0,0,3,0,0,0,1,0,1]),normalUV:new Float32Array([0,0,2,0,0,2]),bakedDocking:new Float32Array([0,0,0,1,0,0,0,1,0])};
const copy=sample.vertices.slice(),prepared=H.prepareHull(sample);
assert.ok(prepared.vertices.length>sample.vertices.length);assert.deepEqual(sample.vertices,copy);
for(let i=0,j=0;i<prepared.vertices.length;i+=8,j++){
 const x=prepared.vertices[i]/6,y=prepared.vertices[i+1]/3;
 near(prepared.vertices[i+6],x);near(prepared.vertices[i+7],y);
 near(prepared.normalUV[j*2],2*x);near(prepared.normalUV[j*2+1],2*y);
 near(prepared.bakedDocking[j*3],x);near(prepared.bakedDocking[j*3+1],y);
}
assert.equal(H.prepareHull(sample).vertices,prepared.vertices);
assert.notEqual(H.prepareHull({...sample,normalUV:sample.normalUV.slice()}).normalUV,prepared.normalUV,'auxiliary channel identity belongs to the preparation cache');
// The shader's frame representation must agree with intrinsic exponential-map
// points, including after actual session rebasing (not just a changed camera).
function mapped(batch,v){const r=batch.hyperbolicRadius,s=Math.hypot(...v)/r,k=s?Math.sinh(s)/s:1,f=batch.hyperbolicFrame;
 return [0,1,2].map(i=>r*f[i+1]*Math.cosh(s)+k*(f[i+5]*v[0]+f[i+9]*v[1]+f[i+13]*v[2]));}
const first=rig.geometry(camera),half=first.length/2;
assert.equal(first.length,26);first.slice(0,half).forEach((b,i)=>assert.equal(b.vertices,first[i+half].vertices,'two ships share prepared buffers'));
assert.ok(new Set(first.map(b=>b.vertices)).size<first.length);
for(const b of first){const stride=b.stride||6;
 for(let i=0;i<b.vertices.length;i+=3*stride)for(const [a,c] of [[0,1],[1,2],[2,0]]){
 const d=Math.hypot(...[0,1,2].map(k=>b.vertices[i+a*stride+k]-b.vertices[i+c*stride+k]));assert.ok(d*U<=20.001,'curved triangle edges bounded');}
 if(b.normalUV)assert.equal(b.normalUV.length,b.vertices.length/stride*2);
}
const f=createFlight({mission:'hyperbolic',seed:29});f.snapshot().combat.player.plotArmor=true;
for(const radius of [350,650,1800,100000]){
 const c={...camera,curvature:radius};
 const base=rig.geometry(c),original=base.map(b=>b.vertices);
 const center=mapped(base[0],[0,0,0]);near(H.path([0,0,0],center,radius).distance*U,Math.hypot(-120,890,-115),.02);
 for(const local of [[0,0,0],[-652.5/U,0,0],[652.5/U,0,0],[20/U,45/U,79/U]]){
 const q=mapped(base[0],local);near(H.path(center,q,radius).distance*U,Math.hypot(...local)*U,.04);
 }
 rig.geometry(c).forEach((b,i)=>assert.equal(b.vertices,original[i],'no per-frame vertex rebuild'));
 if(radius===100000){const bow=mapped(base[0],[652.5/U,0,0]);const flat=[-120/U+Math.cos(.2)*652.5/U,890/U+Math.sin(.2)*652.5/U,-115/U];bow.forEach((v,i)=>near(v,flat[i],.02));}
}
const snapshot=f.snapshot(),initial=rig.geometry(snapshot.state),samples=initial.map(b=>mapped(b,[100/U,20/U,10/U]));
f.advance(3,{afterburner:true});const rebased=rig.geometry(f.snapshot().state);
rebased.forEach((b,i)=>{
 const expected=H.chartPose({...camera,eye:samples[i]},f.snapshot().state).eye;
 mapped(b,[100/U,20/U,10/U]).forEach((v,k)=>near(v,expected[k],.003));
 assert.equal(b.vertices,initial[i].vertices);
});
// Curved bounds retain every batch containing a visible sampled point, including
// near-plane crossings/camera-inside cases. Fully behind-camera hulls can cull.
const visible=DW.scene3d.studyBatchVisible;
for(const radius of [350,650,1800,100000])for(const back of [[0,-1,0],[0,1,0],[-1,0,0],[1,0,0]]){
 for(const b of rig.geometry({...camera,curvature:radius})){
 const stride=b.stride||6;
 for(let i=0;i<b.vertices.length;i+=stride*197){const p=mapped(b,Array.from(b.vertices.slice(i,i+3))),depth=-p.reduce((s,v,k)=>s+v*back[k],0),right=[-back[1],back[0],0],x=p.reduce((s,v,k)=>s+v*right[k],0);
 if(depth>.1&&depth<30000&&Math.abs(x)<depth/2&&Math.abs(p[2])<depth/2)assert.ok(visible(b,[0,0,0],{back,right,up:[0,0,1],distance:0,focal:2},1),'visible curved hull never culled');}
 }
}
assert.equal(visible(rig.geometry(camera)[0],[0,0,0],{right:[1,0,0],up:[0,0,1],back:[0,1,0],distance:0,focal:2},1),false);
assert.deepEqual(Array.from(rig.effects(camera)),[]);assert.equal(rig.hit([0,0,0],[0,1,0]),null);
console.log('PASS finite capital hulls: metre scale, shared tessellation, near-flat limit, real-session isometry invariance and conservative curved culling');

// Audit the finite-hull frame used by the shader, not just path(). A tiny known
// transverse size and a transported sideways baseline must yield different
// flat-inferred distances: R*sinh(d/R) and R*tanh(d/R).
const single=H.createCapitals({single:true}),audit=createFlight({mission:'hyperbolic',enabled:false});
function projected(d,baseline,local){
 const p=audit.snapshot().state,r=650,anchor=H.offset([0,0,0],[0,-d/U,0],r),eye=H.offset(anchor,[baseline/U,0,0],r);
 Object.assign(p,{eye,curvature:r,spaceFrame:undefined,right:H.transport(anchor,eye,[1,0,0],r),up:[0,0,1],back:H.transport(anchor,eye,[0,-1,0],r),velocity:[0,0,0]});
 audit.DW.flightHyperbolic.rebase(audit.snapshot().combat,()=>undefined);
 const point=mapped(single.geometry(p)[0],local),x=point.reduce((sum,v,k)=>sum+v*p.right[k],0),z=-point.reduce((sum,v,k)=>sum+v*p.back[k],0);
 return Math.atan2(x,z);
}
for(const d of [350,650,1300]){
 const length=.1,baseline=.05,size=projected(d,0,[length/(2*U),0,0])-projected(d,0,[-length/(2*U),0,0]);
 const parallax=projected(d,baseline,[0,0,0])-projected(d,-baseline,[0,0,0]);
 const sizeDistance=length/Math.abs(size),parallaxDistance=2*baseline/Math.abs(parallax);
 near(sizeDistance,650*Math.sinh(d/650),.002);near(parallaxDistance,650*Math.tanh(d/650),.002);
 near(sizeDistance/parallaxDistance,Math.cosh(d/650),.00002);
 assert.ok(sizeDistance>parallaxDistance,'ordinary size/distance substitution cannot reproduce both calibrated cues');
}
for(const r of [350,650,1800,100000]){
 let previous,previousTraffic;
 for(let t=0;t<=28;t+=.5){
  const p=DW.hyperbolicFlyby.sample(t,r),sf=p.spaceFrame,eye=H.chart([sf[0][0],-sf[0][1],-sf[0][2],-sf[0][3]],r);
  near(Math.hypot(...p.right),1);near(Math.hypot(...p.up),1);near(Math.hypot(...p.back),1);
  if(previous){near(H.path(previous.eye,eye,r).distance*U,15,.0001);for(const key of ['right','up','back'])H.transport(previous.eye,eye,previous.pose[key],r).forEach((v,k)=>near(v,p[key][k],.00001));}
  previous={eye,pose:p};
  const traffic=DW.hyperbolicFlyby.traffic(t,p);
  assert.equal(traffic.length,4);
  const canonical=traffic.map(q=>H.chartPose(q,{...camera,curvature:r}));
  traffic.forEach((q,i)=>{
   near(Math.hypot(...q.velocity),70);near(q.velocity.reduce((n,v,k)=>n+v*q.back[k],0),-70);
   assert.equal(q.spaceFrame,p.spaceFrame,'fighters and capital share the exact observer chart');
   if(previousTraffic)near(H.path(previousTraffic[i].eye,canonical[i].eye,r).distance*U,35,.0002);
  });previousTraffic=canonical;
 }
}
console.log('PASS rendered angular-size/parallax distances, fixed-speed camera and matched foreground/background fighter passes at four curvatures');
const crossingCamera=DW.hyperbolicFlyby.sample(14),crossings=DW.hyperbolicFlyby.traffic(14,crossingCamera),hullCenter=mapped(single.geometry(crossingCamera)[0],[0,0,0]);
const direction=p=>p.map(v=>v/Math.hypot(...p));
for(const i of [0,2])direction(crossings[i].eye).forEach((v,k)=>near(v,direction(hullCenter)[k],.00001));
assert.ok(Math.hypot(...crossings[0].eye)<Math.hypot(...hullCenter));
assert.ok(Math.hypot(...crossings[2].eye)>Math.hypot(...hullCenter));
console.log('PASS crossing sightline: foreground fighter, capital, background fighter share a ray in correct depth order');
