'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const context={window:{Driftworks:{}},Float32Array};vm.createContext(context);
vm.runInContext(read('src/mesh-builder.js'),context);
vm.runInContext(read('experiments/livery-symmetry.js').replaceAll('export function','function'),context);
vm.runInContext(read('experiments/livery-design.js').replaceAll('export function','function'),context);
vm.runInContext(read('experiments/livery-art.js').replace(/^import .*;\r?\n/gm,'').replaceAll('export const','var').replaceAll('export function','function'),context);
vm.runInContext(read('experiments/hull-panels.js').replaceAll('export function','function'),context);
const recipes=context.ART_DIRECTIONS;assert.equal(recipes.length,4);assert(recipes.every(r=>!('geometry' in r)&&!('palette' in r)),'Coloration does not prescribe geometry or palette');
assert(recipes.every(r=>!('roughness' in r)&&!('metalness' in r)),'Assignment algorithms do not prescribe material properties');

const flat={vertices:new Float32Array([0,0,0,0,0,1,2,0,0,0,0,1,0,2,0,0,0,1])};
assert(Array.from(context.curvatureField([flat]).values()).every(v=>v===0),'Planar faces have no manufactured edge wear');
const groups={armor:[]};context.window.Driftworks.meshBuilder.create(groups).block('armor',[0,0,0],[1,1,1]);const batch={vertices:new Float32Array(groups.armor)},original=batch.vertices.slice(),field=context.curvatureField([batch]);
assert(Array.from(field.values()).every(v=>v>.5),'Welded sharp corners produce an orientation-variation signal');assert.deepEqual(batch.vertices,original,'Art analysis leaves geometry untouched');
const regions=context.analyzeHull([batch]);assert.equal(context.buildGraphicMarks(regions,0,0).length,0,'Minimal military direction omits marks');
for(const kind of [1,2,3]){
 const marks=context.buildGraphicMarks(regions,kind,0);assert(marks.length>0,'Eligible planar surfaces accept generic marks');
 for(const mark of marks){assert.equal(mark.decalLayer,3,'Graphics stay separated from paint coats');assert(mark.graphic);assert(mark.vertices.every(Number.isFinite));for(let i=0;i<mark.vertices.length;i+=8){assert(Math.abs(mark.vertices[i])<=1&&Math.abs(mark.vertices[i+1])<=1,'Graphic stays within its eligible face');assert(Math.abs(mark.vertices[i+2]-1)<1e-6,'Graphic is surface supported');}}
}
console.log('PASS art directions: composable recipes, geometric curvature, immutable source and sparse surface-supported decal graphics');

const sample=context.chunkTreatment(regions,17);
const center=sample([0,0,1],[0,0,1],2),boundary=sample([.99,0,1],[0,0,1],2);
assert(center[0]>boundary[0],'Boundary gradient follows actual chart edges');
assert(boundary[1]>center[1],'Boundary uses contrasting material');
for(const style of [1,2,3,4])for(const p of [[0,0,1],[.4,.5,1],[-.8,.2,1]]){
 const w=sample(p,[0,0,1],style);assert(w.every(x=>Number.isFinite(x)&&x>=0));assert(w.reduce((a,b)=>a+b,0)<=1.00001);
 assert.deepEqual(w,context.chunkTreatment(regions,17)(p,[0,0,1],style),'Seeded material assignment is deterministic');
}
assert.deepEqual(sample([0,0,1],[0,0,1],1),sample([.5,.3,1],[0,0,1],1),'Connected-region material stays constant within a flat chunk');
const refined=context.treatmentSamples(batch.vertices,6);assert(refined.length>batch.vertices.length);assert.deepEqual(batch.vertices,original,'Sampling subdivision preserves source mesh');
console.log('PASS chunk coloration: region ownership, boundary gradients, deterministic weights and immutable sampling');

assert.deepEqual(sample([0,0,1],[0,0,1],1),sample([.99,.99,1.01],[0,0,1],1),'Raised plate corners keep the matching surface orientation');
const islandSlots=new Set();for(let x=-.9;x<1;x+=.15)for(let y=-.9;y<1;y+=.15)islandSlots.add(sample([x,y,1],[0,0,1],3).join(','));assert(islandSlots.size>=3,'UV-bearing source vertices still produce multiple region-local material islands');
for(let x=-.9;x<1;x+=.3)for(let y=-.9;y<1;y+=.3)assert.deepEqual(sample([x,y,1],[0,0,1],1),sample([0,0,1],[0,0,1],1),'Region ownership stays stable across its entire planar surface');

const bilateral={hull:[]};const mesh=context.window.Driftworks.meshBuilder.create(bilateral);
mesh.block('hull',[0,0,0],[1,3,.5]);mesh.block('hull',[0,-2,1.2],[.4,.5,.3]);
for(const x of [-2,2])mesh.block('hull',[x,1,.7],[.5,.8,.4]);
const bilateralBatch={vertices:new Float32Array(bilateral.hull)},snapshot=bilateralBatch.vertices.slice();
const plane=context.detectHullSymmetry([bilateralBatch]);assert(plane);assert(Math.abs(plane.normal[0])>.999);assert(plane.coverage>.999);
const angle=.47,tilt=.31,c=Math.cos(angle),sn=Math.sin(angle),ct=Math.cos(tilt),st=Math.sin(tilt);
const rotate=p=>[c*p[0]-sn*p[1],ct*(sn*p[0]+c*p[1])-st*p[2],st*(sn*p[0]+c*p[1])+ct*p[2]];
const moved=new Float32Array(bilateralBatch.vertices);for(let i=0;i<moved.length;i+=6){const p=rotate(Array.from(moved.slice(i,i+3))),n=rotate(Array.from(moved.slice(i+3,i+6)));for(let k=0;k<3;k++){moved[i+k]=p[k]+[2,-1,3][k];moved[i+3+k]=n[k];}}
const rotated=context.detectHullSymmetry([{vertices:moved}]),expected=rotate([1,0,0]);assert(rotated,'Arbitrary model rotation preserves detection');assert(Math.abs(rotated.normal.reduce((sum,x,k)=>sum+x*expected[k],0))>.999,'Covariance candidate recovers rotated mirror plane');
const asym=new Float32Array(Array.from({length:29},(_,i)=>[Math.sin(i*13.1),Math.cos(i*7.7)*1.8,Math.sin(i*3.8)*.4,0,0,1]).flat());assert.equal(context.detectHullSymmetry([{vertices:asym}]),null,'Unrelated random assembly is not forcibly mirrored');
assert.deepEqual(bilateralBatch.vertices,snapshot,'Symmetry inference does not alter source geometry');
const symmetricSample=context.chunkTreatment(regions,17,{normal:[1,0,0],offset:0,coverage:1,error:0});
for(const style of [1,2,3,4])for(const p of [[.2,.3,1],[.8,-.6,1],[1,.2,.4]]){
 const n=p[0]===1?[1,0,0]:[0,0,1];assert.deepEqual(symmetricSample(p,n,style),symmetricSample([-p[0],p[1],p[2]],[-n[0],n[1],n[2]],style),'Mirrored positions and normals use identical material weights');
}
const crossing=new Float32Array([-1,0,1,0,0,1,0,0, 1,0,1,0,0,1,1,0, 1,1,1,0,0,1,1,1]);
const mirrored=context.mirrorTreatmentMesh(crossing,{normal:[1,0,0],offset:0,coverage:1,error:0});assert(mirrored.length>crossing.length);assert(mirrored.every(Number.isFinite));
const keys=new Set();for(let i=0;i<mirrored.length;i+=8)keys.add(context.artVertexKey(mirrored,i));for(let i=0;i<mirrored.length;i+=8)assert(keys.has(context.artVertexKey([-mirrored[i],mirrored[i+1],mirrored[i+2]])),'Every clipped treatment vertex has a reflected counterpart');
for(let i=0;i<mirrored.length;i+=24){const ax=mirrored[i+8]-mirrored[i],ay=mirrored[i+9]-mirrored[i+1],bx=mirrored[i+16]-mirrored[i],by=mirrored[i+17]-mirrored[i+1];assert(ax*by-ay*bx>=0,'Reflection preserves outward triangle winding');}
console.log('PASS symmetry: inferred and rotated planes, asymmetric rejection, canonical materials, clipped mirrored geometry and winding');

const plan=context.designPlan(regions);assert(plan.stats.convex>0,'Cube ridges classify as convex');assert.equal(plan.stats.concave,0,'A convex box has no invented recesses');assert(plan.stats.accentFraction<=.030001,'Accent area is budgeted before mirroring');
const unchanged=[.2,.3,.1];assert.deepEqual(Array.from(plan.apply([0,0,1],[0,0,1],unchanged,5,{contours:0,coherence:0,accents:0})),unchanged,'Zero preference strengths preserve the existing assignment');
const quiet=plan.apply([0,0,1],[0,0,1],[0,0,1],5,{contours:0,coherence:1,accents:1});assert.equal(quiet[2],0,'A large surface cannot become a random accent island');
const ridge=plan.apply([.999,0,1],[0,0,1],[1,0,0],5,{contours:1,coherence:1,accents:1});assert(ridge[1]>0,'Actual convex contours receive material separation');
const guided=context.chunkTreatment(regions,17,null,{contours:0,coherence:0,accents:0});for(const style of [1,2,3,4])assert.deepEqual(guided([.2,.3,1],[0,0,1],style),sample([.2,.3,1],[0,0,1],style),'Disabling preferences restores the selected baseline algorithm');
// A folded open trough has a signed concave join, unlike the convex box.
const trough=[{id:0,area:1,normal:[0,0,1],u:[1,0,0],v:[0,1,0],faces:[{v:[[0,0,0],[1,0,0],[0,1,0]],normal:[0,0,1],area:.5,neighbors:[]}]},{id:1,area:1,normal:[1,0,0],u:[0,1,0],v:[0,0,1],faces:[{v:[[0,1,0],[0,0,0],[0,0,1]],normal:[1,0,0],area:.5,neighbors:[]}]}];
const valleyPlan=context.designPlan(trough);assert(valleyPlan.stats.concave>0,'Signed geometry identifies an actual concave join');const valley=valleyPlan.apply([.001,.4,0],[0,0,1],[1,0,0],0,{contours:1,coherence:0,accents:0});assert(valley.reduce((a,b)=>a+b,0)<.7,'Concave join blends toward the detail surface');
console.log('PASS design preferences: signed contours, sparse accents, quiet broad surfaces and baseline ablation');
