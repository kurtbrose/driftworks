'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const context={window:{Driftworks:{}},Float32Array};vm.createContext(context);
vm.runInContext(read('src/mesh-builder.js'),context);
vm.runInContext(read('experiments/livery-art.js').replaceAll('export const','var').replaceAll('export function','function'),context);
vm.runInContext(read('experiments/hull-panels.js').replaceAll('export function','function'),context);
const recipes=context.ART_DIRECTIONS;assert.equal(recipes.length,4);assert.equal(new Set(recipes.map(r=>r.geometry)).size,4,'Recipes combine different construction mechanisms');
assert(new Set(recipes.map(r=>r.metalness)).size===4);assert(new Set(recipes.map(r=>r.roughness)).size===4);
for(const r of recipes){assert(r.palette.length===3);assert(r.palette.flat().every(v=>Number.isFinite(v)&&v>=0&&v<=1));}
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
