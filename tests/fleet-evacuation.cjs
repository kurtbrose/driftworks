'use strict';
const assert=require('node:assert/strict');
const {createFlight}=require('../tools/headless.cjs');
const {assertFlightInvariants}=require('../tools/flight-invariants.cjs');
function fixture(){const f=createFlight({mission:'fleet-evacuation',seed:29}),c=f.snapshot().combat,s=c.convoy;return {f,c,s,e:s.evacuation,U:f.DW.sim.METERS_PER_UNIT};}
const q=fixture(),{f,c,s,e,U}=q;
assert.equal(c.enemies.length,20);assert.equal(s.battle.fronts.length,3);assert.equal(e.reserves,9);
assert.equal(f.snapshot().world.asteroids.length,0);assert.equal(f.snapshot().world.ships.length,0);
const starts=e.capitals.map(ship=>ship.position.slice());
f.advance(6);assert.equal(s.battle.order.kind,'escort');assert(f.transcript.some(line=>line.text.includes('Cover the evacuation')));
assert(e.capitals.every((ship,i)=>ship.position.some((v,k)=>v!==starts[i][k])),'Both capitals travel towards tactical stations');
// Reinforcements are visible and announced before any fighters emerge, in finite packets.
c.time=s.elapsed=45;f.DW.convoyMission.step(c,0);assert(s.arrivalPortal&&!s.arrivalPortal.spawned);assert.equal(s.raids.length,0);assert.equal(e.reserves,6);
const entry=s.arrivalPortal.position.slice();c.time=s.elapsed=49;f.DW.convoyMission.step(c,0);assert(s.arrivalPortal.spawned);assert.equal(s.raids.length,1);assert.equal(c.enemies.filter(ship=>ship.convoyRaider).length,3);
const leader=c.enemies.find(ship=>ship.id===s.raids[0].leaderId);assert.deepEqual(leader.pose.eye,entry);
// Active raids bound arrivals even after another window is due.
for(const t of [110,175]){c.time=s.elapsed=t;f.DW.convoyMission.step(c,0);}
assert(e.reserves>=0);assert(e.waves<=3);assert(c.enemies.filter(ship=>ship.hp>0&&ship.convoyRaider).length<=6);
// A depleted wing actually steers away, retains health, and does not teleport.
const friendly=c.enemies.filter(ship=>ship.team==='ally'&&ship.convoyBattle?.front===0);friendly.forEach(ship=>{ship.hp=ship.maxHp*.3;});
const wing=friendly[0],eye=wing.pose.eye.slice(),health=wing.hp;
assert(f.DW.convoyBattle.stepEvacuationWing(c,wing,1/120));assert.equal(wing.mode,'withdraw');assert.equal(wing.targetId,null);assert.equal(wing.hp,health);
assert(Math.hypot(...wing.pose.eye.map((v,k)=>v-eye[k]))*U<10);
// Disabled capitals stop; damaged ones retreat; final withdrawal changes stations.
e.capitals[0].integrity=0;const disabled=e.capitals[0].position.slice();
c.time=s.elapsed=220;f.DW.convoyMission.step(c,.1);assert.equal(e.phase,'withdrawal');assert.deepEqual(e.capitals[0].position,disabled);assert(e.capitals[1].velocity[1]>0);
// Extraction is per transport and removes target/collision ownership without erasing hull.
s.ships[0].position[1]=s.destinationY+.01;f.DW.convoyMission.step(c,0);assert(s.ships[0].arrived);assert(!s.complete);assert(s.ships[0].hull>0);
assert(!f.DW.convoyMission.targets(c).some(ship=>ship.id===s.ships[0].id));
const before=s.ships[0].hull;f.DW.convoyMission.damage(c,s.ships[0].id,f.DW.retailWeapons[0],s.ships[0].position);assert.equal(s.ships[0].hull,before);
// Surviving enemy screens and raiders never force a mop-up objective.
s.ships.forEach(ship=>{ship.arrived=true;});f.DW.convoyMission.step(c,0);assert(s.complete);assert.equal(e.phase,'complete');assert.equal(s.director.waypoint,null);assert.equal(s.battle.order,null);
assert(c.enemies.some(ship=>ship.hp>0&&ship.team==='enemy'));
assert.doesNotThrow(()=>JSON.stringify(s));f.reset();assert.equal(f.snapshot().combat.convoy.evacuation.reserves,9);assert.equal(f.snapshot().combat.enemies.length,20);
const lost=fixture();lost.s.ships.forEach(ship=>{ship.hull=0;});lost.f.DW.convoyMission.step(lost.c,0);assert(lost.s.complete);assert.equal(lost.e.phase,'complete');
const emergency=fixture();emergency.s.elapsed=80;emergency.c.time=80;emergency.e.capitals[0].integrity=0;emergency.f.DW.convoyMission.step(emergency.c,0);assert.equal(emergency.e.phase,'withdrawal');assert(Math.abs(emergency.e.withdrawalAt-80)<1e-8);
emergency.s.radio.said.push('evac-brief');emergency.s.radio.wait=0;assert(emergency.f.DW.convoyMission.radio(emergency.c,3,false).text.includes('Bastion is lost'));
// Real fixed-step session: observe the whole unattended crossing with an invulnerable
// test pilot. No injected outcomes, altered NPC durability, or killed-off hostiles.
const replay=fixture();replay.c.player.hp=replay.c.player.maxHp=1000000;
let maxFighters=0;const samples=[];
for(let t=0;t<350;t+=10){replay.f.advance(10,{stop:true});const view=replay.f.snapshot();assertFlightInvariants(view);maxFighters=Math.max(maxFighters,view.combat.enemies.filter(ship=>ship.hp>0).length);samples.push({seconds:t+10,phase:replay.e.phase,arrived:replay.s.ships.filter(ship=>ship.arrived).length,raids:replay.s.raids.length});if(replay.s.complete)break;}
assert(replay.s.complete,'The real route must finish, including the trailing formation slots');
assert(replay.s.ships.some(ship=>ship.arrived),'Some civilians escape without requiring all attackers to die');
assert(replay.e.waves<=3);assert(replay.e.reserves>=0);assert(maxFighters<=35);
console.log('PASS fleet evacuation: movement, finite announced waves, retreat, per-ship extraction, no mop-up, loss/reset, full fixed-step crossing',JSON.stringify({maxFighters,samples}));
