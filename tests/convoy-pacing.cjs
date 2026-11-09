'use strict';
const assert=require('node:assert/strict'),{createFlight}=require('../tools/headless.cjs');
function fixture(){const f=createFlight({mission:'fleet-evacuation',seed:29}),c=f.snapshot().combat,s=c.convoy,e=s.evacuation,a=s.director.attention;return {f,c,s,e,a,step(dt){c.time+=dt;f.DW.convoyMission.step(c,dt);},enemy(){const pose=f.DW.arcade.create(0);pose.eye=c.player.pose.eye.slice();const enemy=f.DW.flightSim.createCraft('attention-bandit',pose,'enemy');enemy.targetId=c.player.id;c.enemies.push(enemy);return enemy;}};}
const q=fixture(),enemy=q.enemy();
q.step(180);assert.equal(q.a.phase,'combat');assert.equal(q.e.warningAt,null,'Dogfighting postpones even the opening incident');assert.equal(q.e.waves,0);
q.step(240);assert(q.s.elapsed>400,'Dynamic progression must not freeze at the old route-clock limit');assert.equal(q.e.warningAt,null);
enemy.targetId=null;enemy.pose.eye[0]+=10000/q.f.DW.sim.METERS_PER_UNIT;
q.step(.1);assert.equal(q.a.phase,'cooling');q.step(7.9);assert.equal(q.e.warningAt,null);q.step(.1);assert.equal(q.a.phase,'rest');assert(q.a.restDuration>=10&&q.a.restDuration<=30);
q.step(q.a.restDuration-1);assert.equal(q.e.warningAt,null);q.a.radioBusy=true;q.step(1.1);assert.equal(q.e.warningAt,null,'An unfinished briefing also holds the next incident');q.a.radioBusy=false;q.step(.1);assert.notEqual(q.e.warningAt,null);
// A pursued withdrawing survivor is still a dogfight, regardless of reserve count,
// pressure, elapsed time or whether the protected convoy is now safe.
const r=fixture();r.e.warningAt=0;r.e.incidentAt=0;r.a.phase='ready';r.step(0);r.step(4);assert.equal(r.e.waves,1);
const survivor=r.c.enemies.find(c=>c.team==='enemy');r.s.raids[0].phase='withdraw';survivor.pose.eye=r.c.player.pose.eye.map((v,k)=>v+(k===0?500/r.f.DW.sim.METERS_PER_UNIT:0));survivor.targetId=null;
r.e.waves=2;r.e.nextWaveAt=0;r.e.incidentAt=-200;r.c.player.guns.fired++;r.step(.1);assert.equal(r.a.phase,'combat');assert.equal(r.e.rescueAt,1000000);
r.c.player.guns.fired++;r.step(120);assert.equal(r.e.rescueAt,1000000,'Relief cannot advance over player firing at nearby survivors');
r.s.radio.said.push('discontinuity','break-course');assert.equal(r.f.DW.convoyAmbush.radio(r.c),null,'Strategic exposition waits for a lull');
// Renewed combat resets the whole rest, not just the remaining seconds.
survivor.pose.eye[0]+=10000/r.f.DW.sim.METERS_PER_UNIT;r.step(.1);r.step(8);assert.equal(r.a.phase,'rest');assert.equal(r.f.DW.convoyAmbush.radio(r.c).key,'rally','The earned rest admits the deferred briefing');r.step(5);
if(!r.c.enemies.includes(survivor))r.c.enemies.push(survivor);survivor.pose.eye=r.c.player.pose.eye.slice();survivor.targetId=r.c.player.id;r.step(.1);assert.equal(r.a.phase,'combat');assert.equal(r.a.rest,0);assert.equal(r.e.rescueAt,1000000);
survivor.hp=0;r.step(.1);r.step(8);assert.equal(r.a.phase,'rest');r.step(r.a.restDuration+.1);assert(r.e.rescueAt<1000000);assert.equal(r.e.rescueAt,r.s.elapsed);
// Shooting empty space does not count as a dogfight. Incoming damage does.
const empty=fixture();empty.c.player.guns.fired++;empty.step(60);assert.notEqual(empty.e.warningAt,null);
const damage=fixture();damage.c.player.shield-=1;damage.step(.1);assert.equal(damage.a.phase,'combat');damage.f.reset();assert.equal(damage.f.snapshot().combat.convoy.director.attention.phase,'settling');
const artillery=fixture();artillery.s.ships[0].hull-=100;artillery.step(.1);assert.equal(artillery.a.phase,'settling','Remote artillery pressure alone does not invent a player dogfight');
const attackCapital=fixture();attackCapital.e.capitals[1].present=true;attackCapital.e.capitals[1].region=0;attackCapital.e.capitals[1].position=attackCapital.c.player.pose.eye.slice();attackCapital.c.player.guns.fired++;attackCapital.step(.1);assert.equal(attackCapital.a.phase,'combat','Actively attacking a native capital occupies the pilot');
const remoteFight=fixture(),remoteBandit=remoteFight.enemy();remoteBandit.pose.region=1;remoteBandit.guns.fired=1;remoteFight.c.player.guns.fired++;remoteFight.step(.1);assert.equal(remoteFight.a.phase,'settling','Same-coordinate craft in another chart do not invent a local dogfight');
assert.doesNotThrow(()=>JSON.stringify(r.s));
console.log('PASS dynamic attention: sustained dogfight blocks beats, uncapped clock, cooling, variable rest, occupied radio, pursued survivors, reset on renewed combat, damage, empty-space fire and replacement reset');
