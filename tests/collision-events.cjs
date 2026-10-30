'use strict';
const assert=require('node:assert/strict');
const {loadRuntime,createFlight}=require('../tools/headless.cjs');
// The broad phase must work without loading training, rules, renderers or a DOM.
{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
 const context=vm.createContext({window:{Driftworks:{sim:{METERS_PER_UNIT:1}}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/flight-collision.js'),'utf8'),context);
 const DW=context.window.Driftworks,api=DW.flightCollision;
 assert.equal(DW.flightSim,undefined);
 assert.equal(DW.flightCombat,undefined);
 assert.equal(typeof api.hullHit,'function');
 const sphere=api.sphereHit([0,0,0],[10,0,0],[5,0,0],1);
 assert.equal(sphere.fraction,.4);
 assert.deepEqual(Array.from(sphere.point),[4,0,0]);
 const craft=(id,team,x)=>({id,team,hp:10,pose:{eye:[x,0,0]},collision:{kind:'sphere',radiusM:1}});
 for(const mode of ['legacy','grid','tree','grid-events','tree-events']){
  const player=craft('player','ally',-500),first=craft('first','enemy',50),second=craft('second','enemy',50);
  const combat={player,enemies:[first,second],time:0};
  const bolt={age:0,weapon:{headRadius:.1,speed:100,lifetime:2}};
  api.setMode(combat,mode);
  const before=JSON.stringify(combat);
  const query=api.query(combat,[0,0,0],[51,0,0],bolt,'player');
  assert.deepEqual(Array.from(query.candidates,e=>e.craft.id),['first','second']);
  assert.equal(query.shooter,player);assert.equal(query.faction,'ally');
  assert.equal(JSON.stringify(combat),before,'Candidate queries do not apply damage or mutate combat');
  assert.equal(api.batch(combat,()=>23),23,'Batch forwards its return value');
  assert.throws(()=>api.batch(combat,()=>{throw new Error('batch failure');}),/batch failure/);
  first.pose.eye=[500,0,0];api.changed(combat,first);
  assert.ok(api.query(combat,[49,0,0],[51,0,0],bolt,player).candidates.some(e=>e.craft===second),'Batch failure does not leave scheduling suspended');
 }
 assert.throws(()=>api.setMode({},'invalid'),/Unknown collision mode/);
}

function fixture(mode){
 const DW=loadRuntime(),U=DW.sim.METERS_PER_UNIT,player=DW.arcade.create(0);player.eye=[0,-10000/U,0];
 assert.equal(DW.training,DW.flightSim);
 assert.equal(DW.flightSim.trace,DW.flightCombat.trace);
 assert.equal(DW.flightSim.hullHit,DW.flightCollision.hullHit);
 const combat=DW.flightSim.create('training');DW.flightSim.bindPlayer(combat,player);DW.flightSim.setCollisionMode(combat,mode);
 const add=(id,x,y,z=0)=>{const p=DW.arcade.create(0);p.eye=[x/U,y/U,z/U];const e=DW.flightSim.createCraft(id,p,'enemy');e.hp=e.maxHp=1e6;e.shield=0;e.collision={kind:'sphere',radiusM:1};combat.enemies.push(e);return e;};
 const bolt=()=>({position:[0,0,0],direction:[1,0,0],age:0,weapon:{...DW.retailWeapons[0],headRadius:.1}});
 const trace=(b,x,y=0)=>DW.flightSim.trace(combat,[x/U,y/U,0],[(x+2)/U,y/U,0],b,'player',undefined,player);
 return {DW,U,combat,add,bolt,trace,stats:()=>DW.flightSim.collisionStats(combat),batch:fn=>DW.flightSim.collisionBatch(combat,fn)};
}
for(const mode of ['grid-events','tree-events']){
 const f=fixture(mode),a=f.bolt(),b=f.bolt(),ship=f.add('ship',1000,0);
 f.batch(()=>{f.trace(a,0);f.trace(b,0,2000);});assert.equal(f.stats().queued,2);
 const baseline=f.stats();ship.pose.eye[1]=5/f.U;
 f.batch(()=>{f.trace(a,2);f.trace(b,2,2000);});assert.equal(f.stats().moves,baseline.moves,'motion inside padded box leaves proxies intact');assert.equal(f.stats().queries,baseline.queries,'cached corridors remain valid');
 f.batch(()=>{
  ship.pose.eye=[5/f.U,0,0];f.DW.flightSim.collisionChanged(f.combat,ship);
  const before=f.stats();assert.ok(f.trace(a,2),'new envelope wakes affected corridor before contact');f.trace(b,4,2000);
  assert.equal(f.stats().reuses,before.reuses+1,'unaffected corridor remains asleep');
 });
 f.combat.time=.3;f.batch(()=>{});assert.ok(f.stats().popped>=2,'heap drains due events even without a trace');
 const g=fixture(mode),shot=g.bolt();
 g.batch(()=>{g.trace(shot,0);g.add('spawn',5,0);g.DW.flightSim.collisionChanged(g.combat);assert.ok(g.trace(shot,2),'explicit roster notification wakes in-batch spawn');});
 const h=fixture(mode),terrainShot=h.bolt();let terrainCalls=0;
 for(let i=0;i<10;i++)h.batch(()=>h.DW.flightSim.trace(h.combat,[i/h.U,0,0],[(i+1)/h.U,0,0],terrainShot,'player',()=>{terrainCalls++;return null;},h.combat.player.pose));
 assert.equal(terrainCalls,10,'terrain keeps its existing per-segment semantics');assert.ok(h.stats().reuses>=9);
 // Death/revival is a semantic change even while the ship stays within its envelope.
 const r=h.add('revive',5,0);r.hp=0;h.trace(terrainShot,0);r.hp=1e6;assert.ok(h.trace(terrainShot,4),'revival invalidates candidate cache');
 const order=fixture(mode),tie=order.bolt(),first=order.add('first',50,0),second=order.add('second',50,0);
 order.trace(tie,0);order.combat.enemies.reverse();order.trace(tie,48);assert.ok(second.hp<second.maxHp&&first.hp===first.maxHp,'roster reorder preserves first-participant equal-hit tie');
 // Repeated direction changes produce stale heap entries; compaction bounds growth.
 const churn=fixture(mode),churnShot=churn.bolt();for(let i=0;i<1000;i++)churn.trace(churnShot,i%2?10000:-10000);
 assert.ok(churn.stats().queued<300,'lazy queue compacts without unbounded stale events');
 console.log('PASS '+mode+': selective corridor wakeup, padded bounds, heap deadlines, explicit movement/spawn, terrain, revival and stale-event compaction');
}
const copy=value=>JSON.parse(JSON.stringify(value));
let expected;
for(const mode of ['legacy','grid','tree','grid-events','tree-events']){
 const flight=createFlight({mission:'furball',seed:29});flight.DW.flightSim.setCollisionMode(flight.snapshot().combat,mode);
 flight.advance(6,{stop:true,fire:true});
 const state=copy({view:flight.snapshot(),events:flight.events,transcript:flight.transcript});
 if(!expected)expected=state;else assert.deepEqual(state,expected,'real-session state, damage, events and dialogue agree for '+mode);
}
console.log('PASS collision variants: real six-second headless flight session, five modes, exact world/combat/projectile/event/transcript agreement');
