'use strict';
const assert=require('node:assert/strict'),{createFlight}=require('../tools/headless.cjs');
function fixture(){const f=createFlight({mission:'convoy',seed:29}),c=f.snapshot().combat,s=c.convoy,U=f.DW.sim.METERS_PER_UNIT;return {f,c,s,U,step:dt=>{c.time+=dt;f.DW.convoyMission.step(c,dt);},members:wing=>c.enemies.filter(e=>e.hp>0&&e.convoyRaider?.wing===wing)};}
const q=fixture(),{f,c,s,step,members,U}=q;
step(1);assert.equal(s.director.waypoint.kind,'patrol');const initial=s.director.waypoint.position.slice();step(1);assert(Math.abs((s.director.waypoint.position[1]-initial[1])*U-25)<1e-6);
step(57);assert.equal(s.raids.length,0);step(1);assert.equal(members(0).length,3);assert.equal(s.director.phase,'contact');assert.equal(s.director.waypoint.kind,'intercept');
const cargo=s.ships[24],attacker=members(0)[0];attacker.pose.eye=cargo.position.map((v,k)=>v+(k===1?-800/U:0));step(0);assert.equal(s.director.phase,'threatened');attacker.targetId=cargo.id;attacker.fire=true;attacker.guns.fired=1;step(3);assert.equal(s.director.phase,'under-fire');attacker.fire=false;
// Existing actors hold outside the fight, with unchanged durability and no scripted shots.
step(15);assert.equal(s.raids.length,2);assert.equal(s.raids[1].phase,'hold');assert.equal(members(1).length,3);const hold=members(1)[0],eye=hold.pose.eye.slice(),hp=hold.hp;
assert(f.DW.convoyMission.stepRaider(c,hold,1/60));assert.equal(hold.fire,false);assert.equal(hold.hp,hp);assert(hold.pose.eye.some((v,k)=>v!==eye[k]),'Holding uses normal flight, not frozen actors');
assert.equal(new Set(c.enemies.map(e=>e.id)).size,c.enemies.length);
// With a tight escort screen, the reserve remains held beyond its minimum wait.
const centre=s.ships[12].position.slice();[c.player,...c.enemies.filter(e=>e.team==='ally')].forEach(e=>{e.pose.eye=centre.slice();});
attacker.pose.eye=cargo.position.map((v,k)=>v+(k===0?2000/U:0));step(21);assert.equal(s.raids[1].phase,'hold','Successful screening does not automatically buy another attack');
// Chasing the main wing away exposes a gap, committing the existing reserve without spawning.
[c.player,...c.enemies.filter(e=>e.team==='ally')].forEach(e=>{e.pose.eye=centre.map((v,k)=>v+(k===0?2500/U:0));});
const positions=members(1).map(e=>e.pose.eye.slice()),count=c.enemies.length;c.targetLocked=true;c.targetId=attacker.id;step(0);
assert.equal(s.raids[1].phase,'approach');assert.equal(c.enemies.length,count);assert.equal(c.targetId,attacker.id);assert.deepEqual(members(1).map(e=>e.pose.eye),positions,'Committing changes orders, never teleports');assert(s.director.events.some(e=>e.kind==='commit'));
// Losing a wing triggers an actual retreat; survivors are not awarded as kills.
members(0).slice(1).forEach(e=>{e.hp=0;});step(0);assert.equal(s.raids[0].phase,'withdraw');const survivor=members(0)[0],kills=c.playerKills;f.DW.convoyMission.stepRaider(c,survivor,1/60);assert.equal(survivor.fire,false);assert.equal(survivor.mode,'withdraw');assert.equal(survivor.hp,survivor.maxHp);
survivor.pose.eye=cargo.position.map((v,k)=>v+(k===0?9000/U:0));step(4);assert(!c.enemies.some(e=>e.id===survivor.id));assert.equal(s.director.withdrawn,1);assert.equal(c.playerKills,kills);assert.equal(s.raids[0].phase,'departed');
// Beating the main raid makes its held reserve leave, rather than forcing a replacement attack.
const won=fixture();won.step(60);won.step(18);won.members(0).forEach(e=>{e.hp=0;});won.step(7);assert.equal(won.s.raids[1].phase,'withdraw');assert.equal(won.s.director.waypoint.kind,'patrol');
// The player can engage held ships. They immediately defend with ordinary live weapons.
const poke=fixture();poke.step(60);poke.step(18);const reserve=poke.members(1)[0];poke.c.player.pose.eye=reserve.pose.eye.map((v,k)=>v+(k===0?200/poke.U:0));poke.step(0);assert.equal(poke.s.raids[1].phase,'engage');assert.equal(reserve.hp,reserve.maxHp);
// Sustained overload relieves pressure while enemies are alive; a brief spike does not.
const hurt=fixture();hurt.step(60);const striker=hurt.members(0)[0],victim=hurt.s.ships[24];striker.pose.eye=victim.position.map((v,k)=>v+(k===1?-500/hurt.U:0));striker.targetId=victim.id;striker.fire=true;striker.guns.fired=1;hurt.c.player.hp*=.3;victim.hull-=600;hurt.step(3);assert.notEqual(hurt.s.raids[0].phase,'withdraw');hurt.step(3);assert.equal(hurt.s.raids[0].phase,'withdraw');assert(hurt.members(0).every(e=>e.hp>0));
// Reports gate a later encounter; the finite budget and arrival cutoff remain intact.
const clean=fixture();clean.step(60);clean.members(0).forEach(e=>{e.hp=0;});clean.step(1);const recovery=clean.s.director.nextRaidAt-clean.s.elapsed;assert(recovery>=45&&recovery<=85);clean.s.radio.phase='damage-report';clean.step(recovery);assert.equal(clean.s.director.raids,1);clean.s.radio.phase='cruise';clean.step(0);assert.equal(clean.s.director.raids,2);
clean.members(1).forEach(e=>{e.hp=0;});clean.step(1);clean.s.elapsed=211;clean.s.director.nextRaidAt=211;clean.step(0);assert.equal(clean.s.director.raids,2);clean.s.elapsed=300;clean.step(0);assert(clean.s.complete);assert.equal(clean.s.director.waypoint,null);
const arrival=fixture();arrival.step(60);arrival.s.elapsed=300;arrival.step(0);assert(!arrival.s.complete);assert(arrival.s.director.waypoint);assert.equal(arrival.s.arrivalFleet.length,2);assert(arrival.s.arrivalFleet.every(ship=>Math.abs(ship.position[0]*arrival.U)>1000));
const late=fixture();late.step(60);late.s.elapsed=300;late.members(0).slice(1).forEach(e=>{e.hp=0;});late.step(0);const leaving=late.members(0)[0];leaving.pose.eye=late.s.ships[24].position.map((v,k)=>v+(k===0?9000/late.U:0));late.step(4);assert(late.s.complete,'Withdrawal timers keep running after the route clock reaches arrival');assert(!late.c.enemies.includes(leaving));
f.reset();assert.equal(f.snapshot().combat.convoy.raids.length,0);assert.equal(f.snapshot().combat.convoy.director.withdrawn,0);assert.doesNotThrow(()=>JSON.stringify(s));
// Radio orders wait for channel ownership and report the current order, not a stale queue entry.
const radioCase=fixture();radioCase.step(60);radioCase.step(18);radioCase.members(1)[0].hp=0;radioCase.s.radio.wait=0;
assert.equal(radioCase.f.DW.convoyMission.radio(radioCase.c,3,true),null);assert(radioCase.s.director.events.length>0);
assert.match(radioCase.f.DW.convoyMission.radio(radioCase.c,3,false).text,/2 additional contacts holding/);
radioCase.members(1)[0].hp=0;radioCase.step(0);assert.equal(radioCase.s.raids[1].phase,'withdraw','Depleted reserves also break off');
const stale=fixture();stale.step(60);stale.step(18);stale.members(0).forEach(e=>{e.hp=0;});stale.step(7);stale.s.radio.wait=0;
const call=stale.f.DW.convoyMission.radio(stale.c,3,false);assert.match(call.text,/breaking off/);assert(!call.text.includes('holding outside'));
// A surviving raider must actually fly out through the production fixed-step session.
const retreat=createFlight({mission:'convoy',seed:29}),rc=retreat.snapshot().combat;retreat.advance(60);rc.convoy.director.raids=3;
const attackers=rc.enemies.filter(e=>e.team==='enemy'),escaping=attackers[0],departureStart=escaping.pose.eye.slice();attackers.slice(1).forEach(e=>{e.hp=0;});rc.enemies.filter(e=>e.team==='ally').forEach(e=>{e.hp=0;});retreat.advance(70,{stop:true});
assert.equal(rc.convoy.director.withdrawn,1);assert(!rc.enemies.includes(escaping));assert.equal(rc.playerKills,0);assert(Math.hypot(...escaping.pose.eye.map((v,k)=>v-departureStart[k]))*retreat.DW.sim.METERS_PER_UNIT>2000,'Retreat covers physical distance before departure');
console.log('PASS convoy tactics: independent wings, held reserves, gap commits, contested holds, live retreats, earned relief, overload response, player locks, pacing, arrival fleet and reset');
