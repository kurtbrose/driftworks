'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const DW={sim:{METERS_PER_UNIT:20}},sandbox={window:{Driftworks:DW},Float32Array,Map,Math};
vm.runInNewContext(fs.readFileSync('assets/ships/aegis-kit/shield-envelope.js','utf8'),sandbox);
const e=DW.aegisShieldEnvelope;
const baker=require('../tools/bake-shield-envelope.cjs');assert.equal(fs.readFileSync('assets/ships/aegis-kit/shield-envelope.js','utf8'),baker.serialized(baker.build()),'baked asset matches the current algorithm and parameters');
assert.equal(e.sha256,crypto.createHash('sha256').update(fs.readFileSync(e.source)).digest('hex'));
vm.runInNewContext(fs.readFileSync(e.source,'utf8'),sandbox);
const factor=Math.pow(2,.25),profiles=e.profiles,step=(profiles.at(-1).x-profiles[0].x)/(profiles.length-1);
function contains(batch,pivot){for(let i=0;i<batch.vertices.length;i+=6){const p=batch.vertices.slice(i,i+3).map((v,k)=>v+pivot[k]),index=Math.max(0,Math.min(profiles.length-2,Math.floor((p[0]-profiles[0].x)/step))),a=profiles[index],b=profiles[index+1],t=Math.max(0,Math.min(1,(p[0]-a.x)/step)),w=a.w+(b.w-a.w)*t,lo=a.lo+(b.lo-a.lo)*t,hi=a.hi+(b.hi-a.hi)*t;assert.ok((Math.abs(p[1])/(w*factor))**4+(Math.abs(p[2]-(lo+hi)/2)/((hi-lo)/2*factor))**4<=1.0001,'original source vertex must remain inside fitted envelope');}}
const source=DW.aegisFlightAsset;source.batches.forEach(b=>contains(b,[0,0,0]));for(const part of [...source.turrets,...source.engines||[]])part.batches.forEach(b=>contains(b,part.position));
assert.ok(e.vertices.every(Number.isFinite));assert.equal(e.indices.length%3,0);
const edges=new Map();for(let i=0;i<e.indices.length;i+=3){const face=e.indices.slice(i,i+3);assert.equal(new Set(face).size,3);for(let j=0;j<3;j++){const ids=[face[j],face[(j+1)%3]].sort((a,b)=>a-b),key=ids.join(',');edges.set(key,(edges.get(key)||0)+1);}}
assert.ok([...edges.values()].every(n=>n===2),'closed envelope with no open seams');
for(let i=0;i<e.vertices.length;i+=6)assert.ok(Math.abs(Math.hypot(...e.vertices.slice(i+3,i+6))-1)<.00002);
const full=e.indices.length/3;let max=0;
for(const a of e.anchors){for(const p of a.patches){assert.ok(p.every(i=>i>=0&&i<e.vertices.length/6));assert.equal(p.length%3,0);}max=Math.max(max,a.patches[0].length/3);}
assert.ok(max<full*.2,'each gun patch remains local');
// Every full-surface triangle that touches a hit sphere must survive patch selection.
for(const a of e.anchors.filter((_,i)=>i%31===0))for(const [level,radius] of [[0,36],[1,80]]){
    const point=e.vertices.slice(a.vertex*6,a.vertex*6+3),included=new Set();for(let i=0;i<a.patches[level].length;i+=3)included.add(a.patches[level].slice(i,i+3).join(','));
    for(let i=0;i<e.indices.length;i+=3){const face=e.indices.slice(i,i+3),touches=face.some(id=>Math.hypot(...e.vertices.slice(id*6,id*6+3).map((v,k)=>v-point[k]))<=radius);if(touches)assert.ok(included.has(face.join(',')),'conservative local patch must not cut visible wave triangles');}
}
vm.runInNewContext(fs.readFileSync('experiments/capital-shield-pass.js','utf8'),sandbox);
let created=0,disposed=0,bound=null,geometryCount=0;const calls=[];
class Target{constructor(w,h,options){this.width=w;this.height=h;this.options=options;this.texture={};created++;}dispose(){disposed++;}}
class Geometry{constructor(){geometryCount++;}setAttribute(){}dispose(){}}
class Material{constructor(options){Object.assign(this,options);}dispose(){}}
class Scene{constructor(){this.children=[];}add(m){this.children.push(m);}}
class Texture{dispose(){}}
class Mesh{constructor(g,m){this.geometry=g;this.material=m;}}
const THREE={WebGLRenderTarget:Target,Texture,BufferGeometry:Geometry,BufferAttribute:class{},InterleavedBuffer:class{},InterleavedBufferAttribute:class{},RawShaderMaterial:Material,DepthTexture:Texture,Scene,Camera:class{},Mesh,DoubleSide:2,NoBlending:0,AdditiveBlending:2,NormalBlending:1,LinearFilter:1,HalfFloatType:16,UnsignedIntType:32,LinearSRGBColorSpace:'linear'};
const renderer={getContext:()=>({getExtension:()=>({})}),setRenderTarget(t){bound=t;},setViewport(){},setClearColor(){},clear(){},render(s){calls.push({scene:s,target:bound});}};
const camera={matrixWorld:{elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,10,1]}},sourceScene=new Scene(),pass=DW.capitalShieldPass.create(THREE,renderer,{});
const frame={envelope:e,target:[0,0,0],mode:'refraction',strategy:'patches',bend:2,impacts:[{anchor:4,age:.15,heavy:false},{anchor:11,age:.2,heavy:false},{anchor:15,age:.4,heavy:false}]};
const result=pass.render(sourceScene,camera,frame,800,600);
assert.equal(calls.filter(c=>c.scene===sourceScene).length,1);assert.equal(result.draws,3,'two active patches and one resolve; expired hit omitted');
assert.equal(result.triangles,2+(e.anchors[4].patches[0].length+e.anchors[11].patches[0].length)/3);
assert.equal(calls[1].scene.children[0].material.premultipliedAlpha,true,'signed additive field must use ONE/ONE blending');assert.equal(calls[1].scene.children[0].material.forceSinglePass,true);assert.equal(calls[1].target.width,400);assert.equal(calls[1].target.height,300);assert.notEqual(calls[0].target,calls[1].target);assert.equal(calls.at(-1).target,null);
const prepared=geometryCount,allocated=created;pass.render(sourceScene,camera,frame,800,600);assert.equal(geometryCount,prepared,'no aging-hit geometry rebuilding');assert.equal(created,allocated,'targets reused');
frame.strategy='whole';const reference=pass.render(sourceScene,camera,frame,800,600);assert.equal(reference.triangles,full*2+2);assert.ok(reference.triangles>result.triangles*5);
frame.mode='glow';calls.length=0;pass.render(sourceScene,camera,frame,800,600);assert.ok(calls.every(c=>c.target===null),'glow requires no scene capture or field target');
pass.dispose();assert.equal(disposed,created);
console.log('Capital shields: closed finite envelope, conservative local patches, expiry, shared half-resolution field, one source capture, buffer reuse and glow path pass.');
