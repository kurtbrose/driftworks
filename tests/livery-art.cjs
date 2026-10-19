'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const context={window:{Driftworks:{}},Float32Array};vm.createContext(context);
vm.runInContext(read('src/mesh-builder.js'),context);
vm.runInContext(read('experiments/livery-art.js').replaceAll('export const','var').replaceAll('export function','function'),context);
vm.runInContext(read('experiments/hull-panels.js').replaceAll('export function','function'),context);
const recipes=context.ART_DIRECTIONS;assert.equal(recipes.length,4);assert(recipes.every(r=>!('geometry' in r)&&!('palette' in r)),'Coloration does not prescribe geometry or palette');
assert(new Set(recipes.map(r=>r.metalness)).size===4);assert(new Set(recipes.map(r=>r.roughness)).size===4);

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
