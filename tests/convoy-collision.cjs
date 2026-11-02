'use strict';
const assert=require('node:assert/strict'),{createFlight}=require('../tools/headless.cjs');
const modes=['legacy','grid','tree','grid-events','tree-events'];
function fixture(mode='grid-events'){
 const f=createFlight({mission:'convoy',seed:29,convoyBattlefield:false}),DW=f.DW,c=f.snapshot().combat,U=DW.sim.METERS_PER_UNIT;
 DW.flightCollision.setMode(c,mode);c.enemies=[];const ship=c.convoy.ships[24];c.convoy.ships.forEach(s=>{if(s!==ship)s.hull=0;});ship.position=[0,0,0];c.player.pose.eye=[-1000/U,-1000/U,0];
 const at=p=>p.map(v=>v/U),bolt=()=>({age:0,position:at([-40,0,2.6]),direction:[1,0,0],weapon:{...DW.retailWeapons[0],headRadius:.1}});
 return {f,DW,c,U,ship,at,bolt,trace:(a,b,shot=bolt(),shooter='player')=>DW.flightCombat.trace(c,at(a),at(b),shot,shooter,undefined,c.player.pose)};
}
// Exact hull queries and instance bases follow each ship's independent heading.
{
 const {DW,c,ship,at}=fixture(),localStart=[-40,0,2.6],localEnd=[40,0,2.6];
 const original=DW.convoyMission.trace(c,at(localStart),at(localEnd),.1);assert(original);
 ship.forward=[.6,.48,.64];const basis=DW.fleetGuidance.frame(ship.forward);
 const rotate=p=>p.map((_,k)=>basis.right[k]*p[0]+ship.forward[k]*p[1]+basis.up[k]*p[2]);
 const hit=DW.convoyMission.trace(c,at(rotate(localStart)),at(rotate(localEnd)),.1);assert(hit);
 rotate(original.point).forEach((v,k)=>assert(Math.abs(v-hit.point[k])<1e-7,'Posed exact hull retains the authored contact'));
 const fs=require('node:fs'),vm=require('node:vm'),meta=JSON.parse(fs.readFileSync('assets/ships/industrial-kit/convoy-flight.json','utf8')),bytes=fs.readFileSync('assets/ships/industrial-kit/convoy-flight.bin');
 vm.runInNewContext(fs.readFileSync('experiments/convoy-scenery.js','utf8'),{window:{Driftworks:DW},Float32Array});
 DW.convoyScenery.install(meta,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const batches=DW.convoyScenery.geometry(c),source=batches.map(b=>b.vertices);
 batches.forEach(b=>[b.instanceRights,b.instanceForwards,b.instanceUps].forEach((values,i)=>[basis.right,ship.forward,basis.up][i].forEach((v,k)=>assert(Math.abs(values[k]-v)<1e-6))));
 ship.forward=[1,0,0];const next=DW.convoyScenery.geometry(c);
 next.forEach((b,i)=>{assert.equal(b.vertices,source[i]);assert.equal(b.instanceForwards,batches[i].instanceForwards);assert.equal(b.instanceForwards[0],1);});
}
for(const mode of modes){
 const q=fixture(mode),{DW,c,ship,at,bolt,trace}=q;
 const pose=JSON.stringify(c.enemies),expected=DW.convoyMission.trace(c,at([-40,0,2.6]),at([40,0,2.6]),.1),before=ship.hull;
 const candidate=DW.flightCollision.query(c,at([-40,0,2.6]),at([40,0,2.6]),bolt(),'player').candidates.find(e=>e.craft.id===ship.id);
 assert(candidate,'Cargo is part of shared broadphase in '+mode);assert.equal(candidate.craft.hp,ship.hull);
 assert.deepEqual(trace([-40,0,2.6],[40,0,2.6]),expected.point,'Shared nearest-hit tracing preserves exact hull contact');assert(ship.hull<before,'Friendly rounds retain cargo damage');assert.equal(JSON.stringify(c.enemies),pose,'Cargo never enters fighter lifecycle');assert.equal(c.wrecks.length,0);
 // Use the shared candidate query for convergence too, without calling the old convoy scan.
 DW.convoyMission.trace=()=>{throw Error('Independent convoy projectile scan called');};
 c.player.pose.eye=at([-40,0,2.6]);c.player.pose.back=[-1,0,0];
 assert(DW.flightSim.convergencePoint(c,c.player,bolt().weapon));assert(trace([-40,0,2.6],[40,0,2.6]));
 // A nearer ordinary fighter absorbs the shot; no double-hit through to cargo.
 const blocker=DW.flightSim.createCraft('blocker',DW.arcade.create(0),'enemy');blocker.pose.eye=at([-25,0,2.6]);blocker.collision={kind:'sphere',radiusM:1};blocker.shield=0;c.enemies.push(blocker);const cargoHp=ship.hull;
 trace([-40,0,2.6],[40,0,2.6]);assert(blocker.hp<blocker.maxHp);assert.equal(ship.hull,cargoHp);
 c.enemies=[];DW.convoyMission.damage(c,ship.id,{damage:1e9,armorFactor:1},ship.position);assert.equal(trace([-40,0,2.6],[40,0,2.6]),null,'Destroyed cargo leaves shared candidates');
 q.f.reset();assert.equal(DW.convoyMission.targets(q.f.snapshot().combat).length,30);
}
for(const mode of ['grid-events','tree-events']){
 const {DW,c,ship,U,bolt,trace}=fixture(mode),shot=bolt();ship.position=[5000/U,0,0];
 DW.flightCollision.batch(c,()=>{assert.equal(trace([0,0,2.6],[2,0,2.6],shot),null);});
 const before=DW.flightCollision.stats(c);
 DW.flightCollision.batch(c,()=>{assert.equal(trace([2,0,2.6],[4,0,2.6],shot),null);});assert(DW.flightCollision.stats(c).reuses>before.reuses,'Empty cargo corridors reuse projectile scheduling');
 ship.position[0]=50/U;assert(trace([20,0,2.6],[80,0,2.6],shot),'Cargo movement wakes a sleeping corridor');
}
// Swept body candidates are conservative even when the target moves across a stationary fighter.
{
 const {DW,c,ship,at}=fixture(),previous=c.convoy.ships.map(s=>s.position.slice());previous[24]=at([-100,0,0]);ship.position=at([100,0,0]);
 const from=at([0,0,2.6]),expected=DW.convoyMission.trace(c,from,from,7,previous),indices=DW.flightCollision.sweep(c,from,from,207).filter(e=>e.craft.convoyModel).map(e=>e.craft.index);
 assert(expected);assert.deepEqual(DW.convoyMission.trace(c,from,from,7,previous,indices),expected);
}
// Full production ticks agree between exhaustive and scheduled collision, including damage and radio.
let reference;
for(const mode of ['legacy','grid-events','tree-events']){
 const f=createFlight({mission:'convoy',seed:29});f.DW.flightCollision.setMode(f.snapshot().combat,mode);f.advance(2,{stop:true});
 const state=JSON.stringify({view:f.snapshot(),events:f.events,transcript:f.transcript});if(!reference)reference=state;else assert.equal(state,reference,'Real convoy state agrees for '+mode);
}
console.log('PASS shared convoy collision: five index modes, exact cargo hulls, friendly fire, nearest obstruction, convergence without separate scans, movement wakeups/reuse, swept bodies, destruction/reset and production parity');
