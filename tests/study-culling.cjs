'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const DW={asteroidTerrain:{},sim:{},meshBuilder:{},miningRig:{}},ctx=vm.createContext({window:{Driftworks:DW},Float32Array,WeakMap,Math});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/scene3d.js'),'utf8'),ctx);
const visible=DW.scene3d.studyBatchVisible;
const camera={right:[1,0,0],up:[0,1,0],back:[0,0,1],distance:0,focal:2};
let seed=503;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
function oracle(batch,target,cam,aspect,corners){
 const c=Math.cos(batch.rotation||0),s=Math.sin(batch.rotation||0),b=batch.basis,scale=batch.scale??1,o=batch.origin||[0,0,0];
 const dots=(p,n)=>p.reduce((sum,v,i)=>sum+v*n[i],0);
 const clips=corners.map(p=>{p=p.map(v=>v*scale);if(b)p=[0,1,2].map(k=>p[0]*b[k]+p[1]*b[k+3]+p[2]*b[k+6]);
  p=[c*p[0]-s*p[1]+o[0]-target[0],s*p[0]+c*p[1]+o[1]-target[1],p[2]+o[2]-target[2]];
  const depth=cam.distance-dots(p,cam.back),x=dots(p,cam.right),y=dots(p,cam.up);
  return [depth-.1,cam.distance+30000-depth,depth*aspect/cam.focal-x,depth*aspect/cam.focal+x,depth/cam.focal-y,depth/cam.focal+y];
 });
 return ![0,1,2,3,4,5].some(k=>clips.every(p=>p[k]<-1e-5));
}
for(let i=0;i<1500;i++){
 const half=[random()*8+.01,random()*8+.01,random()*8+.01],center=[random()*5,random()*5,random()*5],corners=[];
 for(let mask=0;mask<8;mask++)corners.push(center.map((v,k)=>v+(mask&(1<<k)?1:-1)*half[k]));
 const stride=i%2?8:6,vertices=new Float32Array(corners.flatMap(p=>p.concat(Array(stride-3).fill(0)))),angle=random()*7,c=Math.cos(angle),s=Math.sin(angle),tilt=random()*7,ct=Math.cos(tilt),st=Math.sin(tilt);
 const batch={vertices,stride,origin:[random()*100-50,random()*100-50,random()*100-60],rotation:random()*6,scale:random()*4-2,basis:new Float32Array([c*ct,s*ct,-st,-s,c,0,c*st,s*st,ct])};
 const target=[random()*10,random()*10,random()*10],cam=DW.scene3d.view({zoom:1},{width:1200,height:800},{yaw:random()*6,tilt:random()*3});cam.distance=random()*20;
 const aspect=.5+random()*2;
 // Oracle uses actual Float32 source corners, not the pre-rounding inputs.
 const actual=Array.from({length:8},(_,j)=>Array.from(vertices.slice(j*stride,j*stride+3)));
 assert.equal(visible(batch,target,cam,aspect),oracle(batch,target,cam,aspect,actual),'transformed corners and shader clip planes agree');
}
function point(x,y,z){return {vertices:new Float32Array([x,y,z,0,0,1]),color:[1,1,1]};}
assert.equal(visible(point(0,0,-10),[0,0,0],camera,1),true);
assert.equal(visible(point(0,0,10),[0,0,0],camera,1),false,'behind camera');
assert.equal(visible(point(5,0,-10),[0,0,0],camera,1),true,'edge retained');
assert.equal(visible(point(5.1,0,-10),[0,0,0],camera,1),false);
assert.equal(visible(point(0,0,-30001),[0,0,0],camera,1),false,'far plane');
const huge={vertices:new Float32Array([-100,-100,-10,0,0,1,100,100,10,0,0,1]),color:[1,1,1]};
assert.equal(visible(huge,[0,0,0],camera,1),true,'camera inside or near-plane intersection stays visible');
console.log('PASS static actor culling: 1,500 transformed box/clip-plane comparisons, edge/near/far/camera-inside cases');


// Exercise the real setter body: fighter fire + engines occupy the first five
// batches; appended capital fire must survive the renderer boundary too.
const source=fs.readFileSync(path.join(__dirname,'../src/scene3d.js'),'utf8');
const setter=source.match(/setStudyEffects: function\(batches\)\{([^}]+)\}/);
assert.ok(setter,'study effect submission API exists');
const submit=vm.runInNewContext('(function(batches){var study=true,studyEffects=[];'+setter[1]+';return studyEffects;})');
const effects=Array.from({length:9},(_,i)=>({vertices:new Float32Array(18),color:[0,i/9,1]}));
const retained=submit(effects);
assert.equal(retained.length,9,'AA effects after the fighter and engine batches cannot be truncated');
assert.strictEqual(retained[7],effects[7],'AA projectile batch reaches renderer');
effects.length=0;assert.equal(retained.length,9,'renderer owns its batch list snapshot');
console.log('PASS study effects: all nine fighter/engine/capital batches retained without truncation');
