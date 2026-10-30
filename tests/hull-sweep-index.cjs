'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const reference=require('./fixtures/bolt-triangle-reference.cjs'),DW={};
for(const file of ['src/ship-catalog.js', 'src/ship-hulls.js', 'src/ship-assets.js', 'src/ship-render.js', "experiments/ship-packs.js"])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{window:{Driftworks:DW}});
const pose={eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
let seed=29;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const vector=()=>[0,0,0].map(()=>random()*12-6);
for(let trial=0;trial<600;trial++){
 const triangles=Array.from({length:trial%7+1},()=>[vector(),vector(),vector()]);
 if(trial%13===0)triangles[0][2]=triangles[0][1].slice();
 const vertices=triangles.flatMap(tri=>tri.flatMap(p=>p.concat([0,0,1])));
 const model={id:'sweep-'+trial,name:'oracle',triangles:triangles.length,vertices};
 const start=vector(),motion=trial%17===0?[0,0,0]:vector(),end=start.map((v,k)=>v+motion[k]);
 for(const radius of [.01,.12,.9,2]){
  let expected=null;
  for(const tri of triangles){const h=reference(start,motion,tri,radius);if(h&&(!expected||h.fraction<expected.fraction))expected=h;}
  const actual=DW.shipPackModels.hullHit(model,pose,start,end,1,radius);
  assert.equal(!!actual,!!expected,'sweep presence trial '+trial+' radius '+radius);
  if(expected){assert.ok(Math.abs(actual.fraction-expected.fraction)<1e-7);for(let k=0;k<3;k++)assert.ok(Math.abs(actual.local[k]-expected.local[k])<1e-6);}
 }
}
const grid=[];for(let x=0;x<32;x++)for(let y=0;y<32;y++)for(const p of [[x*3,y*3,0],[x*3+1,y*3,0],[x*3,y*3+1,0]])grid.push(...p,0,0,1);
let reads=0;const vertices=new Proxy(grid,{get(target,key){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.get(target,key);}});
const model={id:'cached-grid',name:'cached grid',triangles:1024,vertices};
const a=[.2,.2,-2],b=[.2,.2,2];assert.ok(DW.shipPackModels.hullHit(model,pose,a,b,1,.1));reads=0;
assert.ok(DW.shipPackModels.hullHit(model,pose,a,b,1,.1));assert.ok(reads<1000,'cached query must prune distant triangles; reads='+reads);
console.log('PASS indexed hull sweeps: 2,400 original-algorithm comparisons, degenerate/stationary cases and cached spatial pruning');
// Cached scorch draw batches must reproduce the legacy posed geometry exactly.
const layer=[0,0,0,0,0,1,1,0,0,0,0,1,0,1,0,0,0,1];
const craft={index:0,pose:{eye:[3,4,5],right:[0,1,0],back:[1,0,0],up:[0,0,1],velocity:[0,0,0],throttle:0},scorches:[{modelId:'blockout',layers:[layer,layer,layer,layer,layer]}]};
function compareDraw(){const old=DW.shipPackModels.scorchGeometry([craft],'',1,2),draw=DW.shipPackModels.sourceScorchGeometry([craft],'',1,2);
 for(let k=0;k<draw.length;k++){const batch=draw[k],m=batch.basis;for(let i=0;i<batch.vertices.length;i+=3){const position=i%6===0;for(let axis=0;axis<3;axis++){
  const value=m[axis]*batch.vertices[i]+m[3+axis]*batch.vertices[i+1]+m[6+axis]*batch.vertices[i+2];
  const world=position?value*batch.scale+batch.origin[axis]:value;
  assert.ok(Math.abs(world-old[k].vertices[i+axis])<1e-6,'GPU scorch pose matches legacy geometry');
 }}}return draw;}
const first=compareDraw();craft.pose.eye=[-2,8,11];craft.pose.right=[1,0,0];craft.pose.back=[0,-1,0];const second=compareDraw();
assert.ok(first.every((b,i)=>b.vertices===second[i].vertices&&second[i].staticGeometry),'moving a marked hull reuses GPU buffers');
craft.scorches.push({modelId:'blockout',layers:[layer,[],[],[],[]]});const changed=compareDraw();assert.notStrictEqual(first[0].vertices,changed[0].vertices);
craft.scorches=[{modelId:'different-hull',layers:[layer,layer,layer,layer,layer]}];assert.equal(DW.shipPackModels.sourceScorchGeometry([craft],'',1,2).length,0);
console.log('PASS source scorch batches: exact posed geometry, immutable buffers, mark invalidation and hull ownership');
const referenceScorch=require('./fixtures/scorch-reference.cjs');
for(let trial=0;trial<80;trial++){
 const vertices=[];for(let i=0;i<20;i++)for(let j=0;j<3;j++)vertices.push(...vector(),0,0,1);
 const model={id:'burn-'+trial,name:'burn oracle',triangles:20,vertices};
 const center=[0,1,2].map(k=>(vertices[k]+vertices[k+6]+vertices[k+12])/3);
 const e=vertices.slice(6,9).map((v,k)=>v-vertices[k]),f=vertices.slice(12,15).map((v,k)=>v-vertices[k]);
 const normal=[e[1]*f[2]-e[2]*f[1],e[2]*f[0]-e[0]*f[2],e[0]*f[1]-e[1]*f[0]],len=Math.hypot(...normal)||1;
 const hit={fraction:0,point:center,local:center,normal:normal.map(v=>v/len),model};
 const expected={},actual={};referenceScorch(expected,hit);DW.shipPackModels.addScorch(actual,hit);
 assert.equal(JSON.stringify(actual.scorches),JSON.stringify(expected.scorches),'indexed scorch projection remains exact, trial '+trial);
}
console.log('PASS indexed scorch projection: 80 exact comparisons against full-mesh clipping');
