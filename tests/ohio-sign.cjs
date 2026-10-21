'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{Driftworks:{sim:{METERS_PER_UNIT:10}}}};
vm.createContext(context);
for(const file of ['src/mesh-builder.js','experiments/flight-presentation.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const texture={},radius=125,batches=context.window.Driftworks.flightPresentation.ohioSignGeometry(radius,texture);
assert.equal(batches.length,4);
assert(batches.every(b=>b.staticGeometry&&Array.from(b.vertices).every(Number.isFinite)));
const face=batches[3],v=face.vertices;
assert.equal(face.texture,texture);assert.equal(face.stride,8);
// A real front-facing panel above the terrain, centered on the initial forward view.
for(let i=0;i<v.length;i+=8){assert.equal(v[i+1],-31);assert.equal(v[i+4],-1);assert(v[i+2]>radius*.78);}
assert.equal(v[6],0);assert.equal(v[7],1);assert.equal(v[22],1);assert.equal(v[23],0);
const eye=[0,-radius*2.6,radius+30],center=[0,-31,radius*.78+29];
assert(Math.abs(Math.atan2(center[2]-eye[2],center[1]-eye[1]))<.13);
assert(2*Math.atan(55/(center[1]-eye[1]))>18*Math.PI/180);
const steel=batches[0].vertices;
assert(Math.abs(Math.min(...Array.from(v).filter((_,i)=>i%8===2))-radius*.78-5)<1e-4,'panel bottom stays close to the rock');
assert.equal(batches[2].vertices.length,3*36*6,'three modeled luminous floodlight lenses');
const sampled=context.window.Driftworks.flightPresentation.ohioSignGeometry(radius,texture,88)[3].vertices;
assert.equal(Math.min(...Array.from(sampled).filter((_,i)=>i%8===2)),93,'sampled terrain height controls the clearance');
assert(Math.min(...Array.from(steel).filter((_,i)=>i%6===2))<radius*.7,'supports reach inside the terrain');
const svg=fs.readFileSync('assets/backgrounds/ohio-highway-sign.svg','utf8');
for(const text of ['NEXT EXIT','GREATER OHIO','pop. 8,412,000,000'])assert(svg.includes(text));
console.log('PASS Ohio highway sign: exact copy, upright UVs, spawn-facing legibility, grounded supports and cached static batches');
