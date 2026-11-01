'use strict';
const assert=require('node:assert/strict'),{createFlight}=require('../tools/headless.cjs');
function fixture(){const f=createFlight({mission:'convoy',seed:29}),c=f.snapshot().combat,s=c.convoy;return {f,c,s,b:s.battle,update:t=>{c.time=t;s.elapsed=t;s.radio.said=['welcome'];f.DW.convoyMission.step(c,0);},allies:i=>c.enemies.filter(e=>e.team==='ally'&&e.convoyBattle?.front===i),enemies:i=>c.enemies.filter(e=>e.team==='enemy'&&e.convoyBattle?.front===i)};}
const q=fixture(),{f,c,s,b}=q,U=f.DW.sim.METERS_PER_UNIT;
assert.equal(c.enemies.length,110);assert.equal(c.enemies.filter(e=>e.convoyBattle&&e.team==='ally').length,54);assert.equal(c.enemies.filter(e=>e.convoyBattle&&e.team==='enemy').length,54);
assert.equal(new Set(c.enemies.map(e=>e.id)).size,110);assert.equal(b.fronts.length,4);assert(c.enemies.filter(e=>e.convoyBattle).every(e=>e.battleZone&&e.decision<.3&&e.hp===e.maxHp&&e.shield===e.maxShield));
// Dispatch favors a struggling screen and resists minor priority changes.
const d=fixture();d.allies(0).slice(0,3).forEach(e=>{e.hp=0;});d.update(30);assert.equal(d.b.order.id,'front-0');assert.equal(d.s.director.waypoint.kind,'assist');
d.c.targetLocked=true;const target=d.c.targetId;d.allies(1).slice(0,8).forEach(e=>{e.hp=0;});d.update(35);assert.equal(d.b.order.id,'front-0','Minimum service time avoids assignment thrashing');d.update(52);assert.equal(d.b.order.id,'front-1','A clearly worse neighboring fire earns reassignment');assert.equal(d.c.targetId,target);
// A genuine immediate convoy threat interrupts an unfinished background assignment.
d.update(60);const incoming=d.c.enemies.find(e=>e.convoyRaider&&e.hp>0),cargo=d.s.ships[24];incoming.pose.eye=cargo.position.map((v,k)=>v+(k===1?-400/U:0));incoming.targetId=cargo.id;incoming.fire=true;incoming.guns.fired=1;d.update(61);assert.equal(d.b.order.kind,'intercept');assert(d.b.order.priority>=500);assert.equal(d.b.order.packet,4);
d.s.radio.wait=0;d.b.lastCall=-100;const order=d.f.DW.convoyMission.radio(d.c,3,false);assert(order.text.includes('Break off and intercept'));assert.equal(d.c.targetId,target);
// Sector losses release an existing wing, keeping all three initial positions and IDs.
const broken=fixture();broken.allies(0).slice(0,5).forEach(e=>{e.hp=0;});const prior=broken.enemies(0).slice(0,3).map(e=>({id:e.id,eye:e.pose.eye.slice()})),population=broken.c.enemies.length;broken.update(60);
assert(broken.b.fronts[0].released);assert.equal(broken.c.enemies.length,population);for(const before of prior){const after=broken.c.enemies.find(e=>e.id===before.id);assert(after.convoyRaider);assert(!after.convoyBattle&&!after.battleZone);assert.deepEqual(after.pose.eye,before.eye);}
assert.equal(new Set(broken.s.raids.map(g=>g.id)).size,broken.s.raids.length);
// The larger battle cannot consume the arrival exchange or attack cargo during its quiet first minute.
f.advance(13);assert.equal(f.transcript.length,3);assert(f.transcript[0].text.includes('visual range'));assert(f.transcript[1].text.includes('Convoy in sight'));assert(f.transcript[2].text.includes('Glad to have you'));
assert(c.enemies.some(e=>e.convoyBattle&&e.guns.fired>0),'Background fighters shoot real weapons immediately, not index-delayed placeholders');
f.advance(46.9);assert(!s.raidStarted);assert(s.ships.every(ship=>ship.hull===ship.maxHull));assert(c.enemies.some(e=>e.convoyBattle&&e.hp<e.maxHp),'Background fights have real consequences');
f.advance(.1);assert(s.raidStarted);assert(s.raids.length>0);assert(!c.dead);
// Arrival resolves the escort without demanding that the player erase every distant battle.
c.enemies.filter(e=>e.convoyRaider).forEach(e=>{e.hp=0;});s.elapsed=300;f.DW.convoyMission.step(c,0);assert(s.complete);assert(c.enemies.some(e=>e.convoyBattle&&e.team==='enemy'&&e.hp>0));
f.reset();assert.equal(f.snapshot().combat.convoy.battle.fronts.length,4);assert.equal(f.snapshot().combat.convoy.battle.order,null);assert.equal(f.snapshot().combat.enemies.length,110);assert.doesNotThrow(()=>JSON.stringify(f.snapshot().combat.convoy));
const isolated=createFlight({mission:'convoy',seed:29,convoyBattlefield:false});assert(!isolated.snapshot().combat.convoy.battle);assert.equal(isolated.snapshot().combat.enemies.length,2);
console.log('PASS convoy battlefield: 108 real background fighters, live fire/losses, quiet local opening, four fronts, dispatch priority/hysteresis, urgent preemption, physical breakthroughs, arrival and reset');
