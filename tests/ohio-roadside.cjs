'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root='assets/environments/ohio-roadside-v1/',catalog=JSON.parse(fs.readFileSync(root+'catalog.json')),raw=fs.readFileSync(root+'geometry.bin');
assert.equal(raw.length,catalog.bytes);assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),catalog.sha256);
for(const source of catalog.sources)assert.equal(crypto.createHash('sha256').update(fs.readFileSync('assets/'+source.path)).digest('hex'),source.sha256);
let queries=0;
const context={window:{Driftworks:{sim:{METERS_PER_UNIT:10},scene3d:{surfaceFrame(_asteroid,direction){queries++;const length=Math.hypot(...direction),normal=direction.map(v=>v/length);return {point:normal,normal};}}}}};
vm.createContext(context);for(const file of ['experiments/flight-missions.js','experiments/mission-ohio.js','experiments/flight-scenery.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
const DW=context.window.Driftworks,definition=DW.flightMissions.resolve('ohio').scenery.find(item=>item.kind==='roadside');
assert.equal(definition.scale,1/3);
for(const name of ['Tractor','Truck','Flatbed'])assert(definition.placements.some(p=>p.model===name));
assert(!definition.placements.some(p=>p.model==='SmallBarn'));
assert(definition.placements.find(p=>p.model==='FuelStop').x>0);
assert(definition.placements.some(item=>item.model==='FuelStop'));assert(!DW.flightMissions.resolve().scenery.length);
const data=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
for(const model of Object.values(catalog.models))for(const part of model.parts){assert(part.count%18===0);assert(part.offset+part.count<=data.length);}
const batches=DW.flightScenery.build({id:'test',radius:125},definition,catalog,data);
assert(batches.length<=24,'palette batching bounds draw count');
let triangles=0;
for(const batch of batches){assert(batch.staticGeometry);assert(!batch.texture);assert(Array.from(batch.vertices).every(Number.isFinite));assert(batch.vertices.length%18===0);triangles+=batch.vertices.length/18;}
assert(triangles<20000,'bounded scenery geometry');assert.equal(queries,9,'Only platform support samples query the terrain');
const road=batches.find(b=>b.color[0]===.075);assert(road);const heights=Array.from(road.vertices).filter((_,i)=>i%6===2);assert(Math.max(...heights)-Math.min(...heights)<1e-6,'Asphalt is a single flat plane');
assert(Math.max(...Array.from(road.vertices).filter((_,i)=>i%6===1))<-30,'Entire stop sits in front of the sign');
console.log(`PASS Ohio roadside: ${triangles} triangles in ${batches.length} static palette batches, local provenance, finite terrain placement and flat supported platform`);
