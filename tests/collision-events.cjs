'use strict';
const assert=require('node:assert/strict');
const {loadRuntime,createFlight}=require('../tools/headless.cjs');
function fixture(mode){
 const DW=loadRuntime(),U=DW.sim.METERS_PER_UNIT,player=DW.arcade.create(0);player.eye=[0,-10000/U,0];
 const combat=DW.training.create('training');DW.training.bindPlayer(combat,player);DW.training.setCollisionMode(combat,mode);
 const add=(id,x,y,z=0)=>{const p=DW.arcade.create(0);p.eye=[x/U,y/U,z/U];const e=DW.training.createCraft(id,p,'enemy');e.hp=e.maxHp=1e6;e.shield=0;e.collision={kind:'sphere',radiusM:1};combat.enemies.push(e);return e;};
 const bolt=()=>({position:[0,0,0],direction:[1,0,0],age:0,weapon:{...DW.retailWeapons[0],headRadius:.1}});
 const trace=(b,x,y=0)=>DW.training.trace(combat,[x/U,y/U,0],[(x+2)/U,y/U,0],b,'player',undefined,player);
 return {DW,U,combat,add,bolt,trace,stats:()=>DW.training.collisionStats(combat),batch:fn=>DW.training.collisionBatch(combat,fn)};
}
for(const mode of ['grid-events','tree-events']){
 const f=fixture(mode),a=f.bolt(),b=f.bolt(),ship=f.add('ship',1000,0);
 f.batch(()=>{f.trace(a,0);f.trace(b,0,2000);});assert.equal(f.stats().queued,2);
 const baseline=f.stats();ship.pose.eye[1]=5/f.U;
 f.batch(()=>{f.trace(a,2);f.trace(b,2,2000);});assert.equal(f.stats().moves,baseline.moves,'motion inside padded box leaves proxies intact');assert.equal(f.stats().queries,baseline.queries,'cached corridors remain valid');
 f.batch(()=>{
  ship.pose.eye=[5/f.U,0,0];f.DW.training.collisionChanged(f.combat,ship);
  const before=f.stats();assert.ok(f.trace(a,2),'new envelope wakes affected corridor before contact');f.trace(b,4,2000);
  assert.equal(f.stats().reuses,before.reuses+1,'unaffected corridor remains asleep');
 });
 f.combat.time=.3;f.batch(()=>{});assert.ok(f.stats().popped>=2,'heap drains due events even without a trace');
 const g=fixture(mode),shot=g.bolt();
 g.batch(()=>{g.trace(shot,0);g.add('spawn',5,0);g.DW.training.collisionChanged(g.combat);assert.ok(g.trace(shot,2),'explicit roster notification wakes in-batch spawn');});
 const h=fixture(mode),terrainShot=h.bolt();let terrainCalls=0;
 for(let i=0;i<10;i++)h.batch(()=>h.DW.training.trace(h.combat,[i/h.U,0,0],[(i+1)/h.U,0,0],terrainShot,'player',()=>{terrainCalls++;return null;},h.combat.player.pose));
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
 const flight=createFlight({mission:'furball',seed:29});flight.DW.training.setCollisionMode(flight.snapshot().combat,mode);
 flight.advance(6,{stop:true,fire:true});
 const state=copy({view:flight.snapshot(),events:flight.events,transcript:flight.transcript});
 if(!expected)expected=state;else assert.deepEqual(state,expected,'real-session state, damage, events and dialogue agree for '+mode);
}
console.log('PASS collision variants: real six-second headless flight session, five modes, exact world/combat/projectile/event/transcript agreement');
