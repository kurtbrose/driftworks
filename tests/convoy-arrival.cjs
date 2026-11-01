'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
const {createFlight}=require('../tools/headless.cjs'),f=createFlight({mission:'convoy',seed:29,convoyBattlefield:false}),DW=f.DW,U=DW.sim.METERS_PER_UNIT;
const context=vm.createContext({window:{Driftworks:DW},performance,Float32Array,Map,Math,console});
for(const file of ['assets/ships/aegis-kit/flight-rig.js','src/aegis-sim.js','src/aegis-visual.js','src/aegis-battle.js','experiments/aegis-flight.js','experiments/convoy-scenery.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
const fleet=DW.convoyScenery.createArrivalFleet(),batches=fleet.geometry(),half=batches.length/2;
assert(half>0&&Number.isInteger(half));assert(batches.every(b=>b.staticGeometry));
for(let i=0;i<half;i++)assert.equal(batches[i].vertices,batches[i+half].vertices,'Repeated capital hulls share prepared mesh buffers');
const buffers=batches.map(b=>b.vertices);let lo=Infinity,hi=-Infinity;
for(const batch of batches.slice(0,half)){const stride=batch.stride||6,basis=batch.basis,origin=batch.origin;for(let i=0;i<batch.vertices.length;i+=stride){const y=origin[1]+(basis?basis[1]*batch.vertices[i]+basis[4]*batch.vertices[i+1]+basis[7]*batch.vertices[i+2]:batch.vertices[i+1]);lo=Math.min(lo,y);hi=Math.max(hi,y);}}
assert((hi-lo)*U>1200&&(hi-lo)*U<1500,'Use the authored kilometre-scale Aegis, not a resized stand-in');
const view=f.snapshot(),layout=view.combat.convoy.arrivalFleet;assert.equal(layout.length,2);assert(Math.abs(layout[0].position[0]-layout[1].position[0])*U>2800,'Freighters have a clear central reception corridor');
const ship=layout[0],a=ship.position.map((v,k)=>v+(k===0?-200/U:0)),b=ship.position.map((v,k)=>v+(k===0?200/U:0));assert(fleet.hit(a,b),'Reception capitals block actual weapons traces');
for(let i=0;i<30;i++)fleet.step(1/60,view);assert.equal(fleet.telemetry().shots,0,'Receiving fleet does not create an unsolicited capital battle');assert.equal(fleet.telemetry().launches,0);
assert.deepEqual(fleet.geometry().map(b=>b.vertices),buffers);fleet.reset(view.combat);assert.equal(fleet.telemetry().seconds,0);assert.deepEqual(fleet.geometry().map(b=>b.vertices),buffers,'Reset retains immutable geometry');
assert.equal(DW.convoyScenery.visible,true);assert(Number.isFinite(DW.convoyScenery.arrivalPreparationMs));
console.log('PASS arrival fleet: two original Aegis capitals, metre scale, shared static mesh buffers, separate poses, clear corridor, weapons collision, no battle spawning and reset');
