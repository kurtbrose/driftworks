'use strict';
const assert=require('node:assert/strict');
const {createFlight}=require('../tools/headless.cjs');
const f=createFlight({mission:'convoy',seed:29});
let {combat:c,state:player,world}=f.snapshot();
const U=f.DW.sim.METERS_PER_UNIT;
assert.equal(f.DW.convoyMission.WING_SIZE,3);
assert.equal(c.enemies.length,2);
assert(c.convoy.speedMps<c.player.profile.maxVelocity[2]/2,'Freighters are substantially slower than fighters');
assert.equal(c.enemies.filter(e=>e.team==='ally').length,2);
assert.equal(c.enemies.filter(e=>e.team==='enemy').length,0);
assert(!c.convoy.raidStarted);
// Isolate route/formation checks from the separately tested first-contact gate.
c.convoy.raidStarted=true;
assert.equal(world.asteroids.length,0);
assert.equal(world.ships.length,0);
assert.equal(c.convoy.ships.length,30);
assert.equal(new Set(c.convoy.ships.map(s=>s.id)).size,30);
const ids=c.convoy.ships.map(s=>s.id).join(','),slots=JSON.stringify(c.convoy.ships.map(s=>s.slot));
require('node:vm').runInNewContext(require('node:fs').readFileSync('experiments/convoy-scenery.js','utf8'),{window:{Driftworks:f.DW},Float32Array});
const fs=require('node:fs'),meta=JSON.parse(fs.readFileSync('assets/ships/industrial-kit/convoy-flight.json','utf8')),bytes=fs.readFileSync('assets/ships/industrial-kit/convoy-flight.bin');
const data=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
for(const variant of Object.values(meta.variants)){
    assert.equal(variant.collision.vertexCount,variant.batches.reduce((n,b)=>n+b.count/8*6,0),'Collision index covers the exact render triangles');
    assert.equal(variant.collision.version,1);
    const collisionVertices=new Float32Array(variant.collision.vertexCount);let offset=0;
    for(const b of variant.batches)for(let i=b.offset/4;i<b.offset/4+b.count;i+=8)for(let k=0;k<6;k++)collisionVertices[offset++]=data[i+k];
    assert.equal(variant.collision.sourceHash,require('node:crypto').createHash('sha256').update(Buffer.from(collisionVertices.buffer)).digest('hex'),'Baked hull index fingerprints the render mesh positions and normals');
    assert(variant.batches.reduce((n,b)=>n+b.count/24,0)>50000,'Use detailed authored DW-14 ships');
    assert.equal(variant.batches.filter(b=>b.textured).length,1,'Retain the authored paint atlas material');
    for(const b of variant.batches)for(let i=b.offset/4;i<b.offset/4+b.count;i+=24){
        const a=[0,1,2].map(k=>data[i+8+k]-data[i+k]),c=[0,1,2].map(k=>data[i+16+k]-data[i+k]);
        const n=[a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]];
        assert(n.reduce((sum,v,k)=>sum+v*data[i+3+k],0)>=-1e-9,'Axis conversion preserves outward winding');
    }
}
f.DW.convoyScenery.install(meta,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const batches=f.DW.convoyScenery.geometry(c),buffers=batches.map(b=>b.vertices);
assert.equal(batches.length,26,'Instance the 30 authored ships without losing any materials');
assert(batches.every(b=>b.instanceOffsets.length===30),'Ten copies of each authored configuration');
assert.equal(new Set(buffers).size,26,'Repeated ships share the 26 immutable material buffers');
assert.equal(new Set(c.convoy.ships.map(s=>s.packet)).size,5,'Five readable packets');
for(let p=0;p<5;p++){
    const ships=c.convoy.ships.filter(s=>s.packet===p);assert.equal(ships.length,6);
    assert.equal(ships[0].callsign,f.DW.convoyMission.packets[p].ship);
    assert(new Set(ships.map(s=>s.slot[2])).size>2,'Each packet occupies volume');
}
const extent=k=>Math.max(...c.convoy.ships.map(s=>s.slot[k]))-Math.min(...c.convoy.ships.map(s=>s.slot[k]));
assert(extent(0)*U>600&&extent(0)*U<700&&extent(2)*U>400&&extent(2)*U<450&&extent(1)*U<850,'Bounded 3D packet formation with crossing corridors');
for(let i=0;i<30;i++)for(let j=i+1;j<30;j++)assert(Math.hypot(...c.convoy.ships[i].slot.map((v,k)=>v-c.convoy.ships[j].slot[k]))*U>100,'Safe staggered centre spacing');
const initialVertices=Array.from(buffers[0]);

const separation=e=>Math.hypot(...e.pose.eye.map((v,i)=>(v-player.eye[i])*U));
f.advance(60);
assert(Math.abs(c.convoy.elapsed-60)<1e-6);
const moved=f.DW.convoyScenery.geometry(c);
assert(moved.every((b,i)=>b.vertices===buffers[i]),'Moving fleet reuses immutable GPU geometry');
assert.deepEqual(Array.from(buffers[0]),initialVertices);
assert(Math.abs(moved[0].origin[1]*U-1500)<1e-5,'GPU origin follows the simulation route');
for(const s of c.convoy.ships){
    assert(Math.abs((s.position[1]-s.slot[1])*U-1500)<1e-5);
    assert.equal(s.hull,s.maxHull);
    assert(!s.arrived);
}
assert(c.enemies.filter(e=>e.team==='ally').every(e=>separation(e)<180),'Both wingmen keep up at convoy speed');
// Turns, boost, and a stopped player exercise actual wing flight, not rigid placement.
f.advance(2,{yaw:.3,boost:true});
f.advance(8,{yaw:0,boost:false});
f.advance(25,{stop:true});
assert(c.enemies.filter(e=>e.team==='ally').every(e=>separation(e)<500),'Wingmen recover after a boost and turn');
f.advance(204.9,{stop:true});
assert(!c.convoy.complete,'Cannot arrive early');
f.advance(.1,{stop:true});
assert(c.convoy.complete);
assert(c.convoy.ships.every(s=>s.arrived&&s.velocity.every(v=>v===0)));
assert.equal(c.wave,1,'Convoy encounter never spawns generic training waves');
assert.equal(c.enemies.length,2);
assert.equal(JSON.stringify(c.convoy.ships.map(s=>s.slot)),slots);
const positions=JSON.stringify(c.convoy.ships.map(s=>s.position));
f.advance(10,{fire:true,stop:true});
assert.equal(JSON.stringify(c.convoy.ships.map(s=>s.position)),positions,'Arrival preserves formation');
assert(c.player.guns.fired>0,'Escort weapons are live');
f.reset();c=f.snapshot().combat;
assert.equal(c.convoy.elapsed,0);
assert(!c.convoy.complete);
assert.equal(c.convoy.ships.map(s=>s.id).join(','),ids);
assert(c.convoy.ships.every(s=>!s.arrived&&s.hull===s.maxHull));
console.log('PASS convoy: 30 stable freighters, three-fighter wing, real follow flight, 7.5 km route, arrival, no waves, reset');

// Exact source hulls retain both solid payloads and the open scaffold interior.
f.reset();c=f.snapshot().combat;
const cargo=c.convoy.ships[24],mixed=c.convoy.ships[25];
const at=(ship,p)=>p.map((v,k)=>ship.position[k]+v/U);
const solid=f.DW.convoyMission.trace(c,at(cargo,[-20,0,2.6]),at(cargo,[20,0,2.6]),.1);
assert(solid&&solid.shipId===cargo.id,'Container/truss geometry is collidable');
assert.equal(f.DW.convoyMission.trace(c,at(mixed,[0,-42,-4]),at(mixed,[0,-42,4]),.1),null,'Empty scaffold remains hollow');
assert.equal(f.DW.convoyMission.trace(c,at(cargo,[-30,0,70]),at(cargo,[30,0,70]),7),null,'Clearance above the actual hull is unobstructed');
// A real fixed tick must stop a fighter even when it crosses the whole ship.
let pose=f.snapshot().state;
pose.eye=at(cargo,[-30,0,2.6]);pose.right=[0,-1,0];pose.up=[0,0,1];pose.back=[-1,0,0];
pose.velocity=[20000,25,0];pose.ramp=[0,0,20000];pose.throttle=1;
f.advance(1/120);
assert((pose.eye[0]-cargo.position[0])*U< -5,'Swept contact prevents high-speed tunneling');
assert(pose.velocity[0]<0,'Normal velocity rebounds from the heavy freighter');
assert.deepEqual(Array.from(cargo.velocity),[0,25,0],'Ramming does not derail the convoy');
assert(pose.ramp.every(Number.isFinite));
// Repeat for an AI wingman, through the same participant collision path.
f.reset();c=f.snapshot().combat;const wing=c.enemies[0],ship=c.convoy.ships[24];
wing.pose.eye=at(ship,[-30,0,2.6]);wing.pose.right=[0,-1,0];wing.pose.up=[0,0,1];wing.pose.back=[-1,0,0];
wing.pose.velocity=[20000,25,0];wing.pose.ramp=[0,0,20000];
f.advance(1/120);
assert((wing.pose.eye[0]-ship.position[0])*U< -5,'Wingmen also collide with freighters');
// Freighter motion matters even when the fighter requests no movement.
f.reset();c=f.snapshot().combat;pose=f.snapshot().state;const overtaker=c.convoy.ships[24];
c.convoy.ships.forEach(s=>{if(s!==overtaker)s.hull=0;});c.enemies.forEach(e=>{e.hp=0;});
pose.eye=at(overtaker,[2.6,50,2.6]);pose.velocity=[0,0,0];pose.ramp=[0,0,0];pose.throttle=0;
const startY=pose.eye[1];f.advance(3,{stop:true});
assert(pose.eye[1]>startY+.1/U,'Moving hull pushes a stationary fighter out of its way');
assert(pose.velocity[1]>0,'Contact is resolved relative to freighter velocity');
f.reset();c=f.snapshot().combat;
assert.equal(f.DW.convoyMission.trace(c,[10000,10000,10000],[10001,10000,10000],7),null);
console.log('PASS convoy collision: authored surfaces and open bays, high-speed CCD, wingmen, moving hulls, clearance and reset');

// The playable encounter starts armed and threatens actual damageable cargo.
f.reset();c=f.snapshot().combat;
assert(!f.DW.flightMissions.resolve('convoy').weaponsDisabled);
f.advance(60);assert(c.convoy.raidStarted);
const targets=f.DW.convoyMission.targets(c);assert.equal(targets.length,30);
assert.equal(targets[24].hp,c.convoy.ships[24].hull);
assert.equal(c.enemies.filter(e=>e.team==='enemy'&&e.convoyRaider.role==='strike').length,2);
assert.equal(c.enemies.filter(e=>e.team==='enemy'&&e.convoyRaider.role==='cover').length,1);
c.enemies.filter(e=>e.team==='ally').forEach(e=>{e.hp=0;});
Object.assign(f.snapshot().state,{eye:[-10000/U,-10000/U,1200+5000/U],velocity:[0,0,0],ramp:[0,0,0],throttle:0});
f.advance(12,{stop:true});
assert(c.convoy.ships.every(s=>s.hull===s.maxHull),'Distant approach gives the player an interception window');
f.advance(78,{stop:true});
assert(c.enemies.filter(e=>e.team==='enemy').some(e=>e.guns.fired>0),'Raiders fire real projectiles');
assert(c.convoy.ships.some(s=>s.hull<s.maxHull),'Actual raider rounds damage cargo');
// A player volley hits the same surface, then destruction removes that target.
f.reset();c=f.snapshot().combat;c.enemies.forEach(e=>{e.hp=0;});pose=f.snapshot().state;
const victim=c.convoy.ships[24];pose.eye=at(victim,[-40,0,2.6]);pose.right=[0,-1,0];pose.up=[0,0,1];pose.back=[-1,0,0];pose.velocity=[0,25,0];pose.ramp=[0,0,0];pose.throttle=0;
f.session.acquireTarget();assert.equal(c.targetId,victim.id,'Crosshair acquires cargo hull');
f.session.toggleTargetLock();assert(c.targetLocked);
const hp=victim.hull;f.advance(.5,{fire:true,stop:true});assert(victim.hull<hp,'Player rounds damage freighters');
const proxy=f.DW.convoyMission.targets(c).find(t=>t.id===victim.id);assert.equal(proxy.hp,victim.hull,'HUD health aliases actual cargo health');
f.DW.convoyMission.damage(c,victim.id,{damage:1e9,armorFactor:1},victim.position);
assert.equal(victim.hull,0);assert(!f.DW.convoyMission.targets(c).some(t=>t.id===victim.id));
assert(c.flashes.some(e=>e.destruction),'Cargo loss produces a visible explosion');
f.advance(1/120,{stop:true});assert.notEqual(c.targetId,victim.id,'Destroyed cargo cannot retain a target lock');
// Surviving attackers keep the escort unresolved after the arrival time.
f.reset();c=f.snapshot().combat;c.convoy.elapsed=300;
c.convoy.ships.forEach(s=>{s.arrived=true;s.position[1]=s.slot[1]+c.convoy.destinationY;});
f.DW.convoyMission.step(c,1/120);assert(!c.convoy.complete);
c.enemies.filter(e=>e.team==='enemy').forEach(e=>{e.hp=0;});f.DW.convoyMission.step(c,1/120);assert(c.convoy.complete);
f.reset();c=f.snapshot().combat;c.convoy.ships.forEach(s=>{s.hull=0;});f.DW.convoyMission.step(c,1/120);assert(c.convoy.complete,'Total cargo loss ends the escort');
console.log('PASS escort combat: weapons, real raiders and defending wingmen, cargo damage/targets/losses, victory and failure');

// Close the actual chase/aim/shoot loop through the normal control and gun paths.
f.reset();c=f.snapshot().combat;f.advance(60);
// Form the screen with the wing rather than boosting alone into three healthy fighters.
f.advance(4);
for(let i=0;i<2400&&!c.dead;i++){
    const enemies=c.enemies.filter(e=>e.team==='enemy'&&e.hp>0);if(!enemies.length)break;
    const target=enemies.find(e=>e.id===c.targetId)||enemies[0];c.targetId=target.id;
    const state=f.snapshot().state,weapon=f.DW.retailWeapons[c.player.weaponIndex];
    const lead=f.DW.flightSim.firingSolution(c,c.player,target,weapon),steering=f.DW.flightSim.steer(state,lead?lead.point:target.pose.eye);
    const distance=Math.hypot(...state.eye.map((v,k)=>v-target.pose.eye[k]))*U;
    f.advance(.05,{...steering,throttle:1,fire:true,boost:distance>900});
}
assert(!c.dead&&c.playerKills>0,'Pilot can intercept and kill real attackers');
assert(c.enemies.filter(e=>e.team==='enemy').every(e=>e.hp<=0),'The fixed raid can be defeated');
assert(c.convoy.ships.every(s=>s.hull>0),'Prompt interception can save the whole convoy');
assert(c.enemies.filter(e=>e.team==='ally').some(e=>e.guns.fired>0),'Wingmen fight the raiders');
f.advance(50,{stop:true});
assert.equal(c.convoy.radio.phase,'cruise','A real completed fight passes through assessment and returns to cruise');
assert(c.convoy.radio.said.includes('flight-report')&&c.convoy.radio.said.includes('convoy-report')&&c.convoy.radio.said.includes('report-complete'));
console.log('PASS playable escort loop: real controls, interception, lead, gunfire, raider kills and convoy survival');

// Channel ownership and character identity must survive real threat changes.
f.reset();c=f.snapshot().combat;
const radio=(dt=30,busy=false)=>f.DW.flightComms.step(f.DW.flightComms.create(),dt,c,busy,()=>.5,f.snapshot().state);
const startRaid=()=>f.DW.convoyMission.step(c,Math.max(0,60-c.convoy.elapsed));
assert.equal(radio(2,true),null);assert.equal(c.convoy.radio.opening,0,'Busy channel cannot consume an introduction');
assert.match(radio().speaker,/CONTROL \/ Rook/);
const visualReply=radio();assert.match(visualReply.text,/Affirmative, Control/);assert.equal(visualReply.craftId,c.enemies[0].id);assert.equal(visualReply.portraitIndex,c.enemies[0].index);
const welcome=radio();assert.match(welcome.text,/Glad to have you/);assert.equal(welcome.civilianPortraitIndex,0);
startRaid();
const nearby=radio();assert.match(nearby.text,/bandits? in one group/);
assert(!c.convoy.radio.said.includes('range'),'No weapons-range warning while distant');
const raiders=c.enemies.filter(e=>e.team==='enemy'),attacker=raiders[0],target=c.convoy.ships[24];
attacker.pose.eye=at(target,[700,0,0]);
assert.match(radio().text,/entering weapons range.*rear group/);
attacker.fire=true;attacker.guns.fired=1;assert.match(radio().text,/Bandit firing/);attacker.fire=false;
target.hull-=600;const damaged=radio();assert.equal(damaged.craftId,target.id);assert.equal(damaged.civilianPortraitIndex,5);assert.match(damaged.speaker,/Thomas Reed/);
target.hull=0;assert.match(radio().text,/Transport lost in the rear group/);
raiders.forEach(e=>{e.hp=0;});assert.match(radio().text,/No further contacts/);
const cast=[];for(let i=0;i<8;i++){const line=radio();if(line)cast.push(line);}
assert.equal(cast.filter(l=>typeof l.civilianPortraitIndex==='number').length,4,'Only surviving captains join the cruising conversations');
assert(!cast.some(l=>l.craftId===target.id),'Destroyed captain cannot speak');
assert.deepEqual(cast.filter(l=>typeof l.civilianPortraitIndex==='number').map(l=>l.civilianPortraitIndex).sort(),[0,1,2,4],'Portrait identities match the established civilian roster');
f.reset();c=f.snapshot().combat;assert.deepEqual(Array.from(c.convoy.radio.said),[]);assert.equal(c.convoy.radio.opening,0);
assert.equal(c.convoy.radio.phase,'arrival');assert.equal(c.convoy.radio.report,0);assert.equal(c.convoy.radio.chat,0);assert.equal(c.convoy.radio.chatTurn,0);
startRaid();
const closeRaider=c.enemies.find(e=>e.team==='enemy');closeRaider.pose.eye=at(c.convoy.ships[24],[600,0,0]);closeRaider.fire=true;closeRaider.guns.fired=1;
assert.match(radio().text,/Bandit firing/);
for(let i=0;i<8;i++)radio();
assert(!c.convoy.radio.said.includes('range')&&!c.convoy.radio.said.includes('nearby'),'A busy channel never reports an obsolete lower tension stage after firing');
assert(!c.convoy.radio.said.includes('visual-reply')&&!c.convoy.radio.said.includes('welcome'),'Urgent traffic cancels stale arrival acknowledgments and greetings');
console.log('PASS convoy cast: Control, stable captain/ship identities, busy-channel preservation, live tension reports, damage/loss and reset');

f.reset();c=f.snapshot().combat;
assert.match(radio(1).speaker,/Rook/);
assert.equal(c.convoy.radio.wait,28);
assert.equal(radio(60,true),null);assert.equal(c.convoy.radio.wait,28,'Speaking never consumes the silence gap');
assert.equal(radio(2),null,'Even urgent facts leave breathing room');
assert.match(radio(1).text,/Affirmative, Control/);
assert.match(radio(3).text,/Glad to have you/);
startRaid();
assert.match(radio(3).text,/bandits? in one group/);
assert.equal(radio(60),null,'Captains do not run a roll call during combat');
const threatened=c.convoy.ships[24];threatened.hull-=100;
assert.equal(radio(),null,'Minor damage does not trigger chatter');
threatened.hull-=500;assert.match(radio().speaker,/Thomas Reed/);
c.convoy.ships[25].hull-=1000;
assert.equal(radio(),null,'Several damaged ships in one packet produce one report');
c.enemies.filter(e=>e.team==='enemy').forEach(e=>{e.hp=0;});assert.match(radio().text,/No further contacts/);
assert.match(radio(3).text,/Remaining on station/);
assert.match(radio(3).text,/Rear group: 2 damaged, 0 lost/);
assert.match(radio(3).text,/Maintain course and speed/);
assert.equal(radio(27),null,'Routine chatter waits for 28 actual silent seconds');
assert.match(radio(1).text,/dockside diner/);
assert.match(radio(3).speaker,/Mara Vale/);
console.log('PASS convoy radio pacing: silence after speech, urgent gap, no combat roll call, damage threshold and packet aggregation');

const arrivalFlight=createFlight({mission:'convoy',seed:29});arrivalFlight.advance(13,{stop:true});
const arrivalLines=arrivalFlight.transcript;
assert.equal(arrivalLines.length,3,'The actual channel delivers one short arrival exchange');
assert.equal(arrivalLines[0].craftId,'control');assert.match(arrivalLines[0].text,/visual range/);
assert.equal(arrivalLines[1].craftId,arrivalFlight.snapshot().combat.enemies[0].id);
assert.equal(arrivalLines[2].civilianPortraitIndex,0);assert.match(arrivalLines[2].text,/Glad to have you/);
console.log('PASS convoy arrival radio: real channel timing, Control observation, wing acknowledgment and civilian welcome');

const breathingFlight=createFlight({mission:'convoy',seed:29}),bc=breathingFlight.snapshot().combat;
breathingFlight.advance(1,{fire:true});assert(bc.player.guns.fired>0,'Weapons stay live in the quiet leg');
breathingFlight.advance(58.9);
assert(!bc.convoy.raidStarted);assert.equal(bc.enemies.length,2,'Only the two wingmen exist before first contact');
assert(bc.convoy.ships.every(s=>s.hull===s.maxHull));
assert.equal(breathingFlight.transcript.length,3,'Opening exchange is followed by quiet, without a false all-clear or roll call');
bc.targetId=bc.convoy.ships[0].id;bc.targetLocked=true;
breathingFlight.advance(.1);
assert(bc.convoy.raidStarted);const incoming=bc.enemies.filter(e=>e.team==='enemy');assert.equal(incoming.length,3);
assert.equal(bc.targetId,bc.convoy.ships[0].id,'Contact does not override a deliberate target lock');
assert(incoming.every(e=>e.guns.fired===0),'Contact starts as a distant approach, without immediate gunfire');
assert(incoming.every(e=>bc.convoy.ships.every(s=>Math.hypot(...s.position.map((v,k)=>v-e.pose.eye[k]))*U>2000)),'Approach spawns outside the entire moving formation');
assert(breathingFlight.transcript.some(l=>/bandits? in one group/.test(l.text)),'Control reports the new approach');
breathingFlight.DW.convoyMission.step(bc,0);assert.equal(bc.enemies.length,5,'First raid spawns only once');
breathingFlight.reset();assert(!breathingFlight.snapshot().combat.convoy.raidStarted);assert.equal(breathingFlight.snapshot().combat.enemies.length,2);
console.log('PASS convoy breathing room: quiet first minute, live weapons, moving-frame approach, contact report, target-lock agency and reset');

// Assess real damage before a short civilian conversation; combat can break in again.
f.reset();c=f.snapshot().combat;startRaid();radio();
c.enemies.filter(e=>e.team==='enemy').forEach(e=>{e.hp=0;});
c.enemies[0].hp=c.enemies[0].maxHp*.6;c.enemies[1].hp=0;
c.convoy.ships[6].hull-=1;c.convoy.ships[7].hull-=400;c.convoy.ships[8].hull=0;
assert.match(radio().text,/report damage/);assert.equal(c.convoy.radio.phase,'damage-report');
assert.equal(radio(60,true),null);assert.equal(c.convoy.radio.report,1,'Busy channel preserves the requested report');
assert.equal(radio(2),null);
const flightReport=radio(1);assert.equal(flightReport.craftId,c.enemies[0].id);assert.match(flightReport.text,/Hull at 60 percent/);assert.match(flightReport.text,/1 fighter lost/);
const freightReport=radio(3);assert.equal(freightReport.civilianPortraitIndex,1);assert.match(freightReport.text,/Port group: 2 damaged, 1 lost/);
assert.match(radio(3).text,/29 transports accounted for; 2 damaged, 1 lost/);assert.equal(c.convoy.radio.phase,'cruise');
assert.equal(radio(27),null,'Assessment closes before a full quiet gap');
assert.match(radio(1).text,/dockside diner/);assert.equal(c.convoy.radio.chatTurn,1);
const renewed=c.enemies.find(e=>e.team==='enemy');renewed.hp=renewed.maxHp;
assert.equal(radio(0,true),null);assert.equal(c.convoy.radio.phase,'combat');assert.equal(c.convoy.radio.chatTurn,0);assert.equal(c.convoy.radio.chat,1,'Renewed contact discards a pending casual reply');
assert.match(radio().text,/bandits? in one group/);
renewed.hp=0;assert.match(radio().text,/report damage/);
radio();radio();radio();assert.equal(c.convoy.radio.phase,'cruise');
assert.match(radio().text,/rattle yours or mine/);assert.match(radio(3).text,/If it stops/);
assert(!c.convoy.radio.said.includes('chat-0-1'),'The abandoned diner reply is never replayed');

f.reset();c=f.snapshot().combat;startRaid();radio();c.enemies.filter(e=>e.team==='enemy').forEach(e=>{e.hp=0;});
radio();assert.match(radio(3).text,/No damage/);assert.match(radio(3).text,/no damage reported/);assert.match(radio(3).text,/0 damaged, 0 lost/);
f.reset();c=f.snapshot().combat;startRaid();radio();c.enemies.forEach(e=>{e.hp=0;});c.convoy.ships[0].hull=0;
radio();assert.match(radio(3).text,/No wingman response/);const absentLead=radio(3);assert.equal(absentLead.craftId,'control');assert.equal(absentLead.civilianPortraitIndex,undefined);assert.match(absentLead.text,/Upper group: 0 damaged, 1 lost/);
console.log('PASS convoy radio phases: factual damage assessment, dead/missing speakers, sparse CB exchanges, renewed-contact interruption and fresh debrief');

// One physical wing approaches from a common bearing, then responds to interception.
f.reset();c=f.snapshot().combat;startRaid();
const raidWing=c.enemies.filter(e=>e.team==='enemy'),raidLeader=raidWing[0];
for(const e of raidWing){assert.equal(e.maxHp,e.profile.hull);assert.equal(e.maxShield,e.profile.shield);assert(e.retarget<5);assert.equal(e.opponentStyle,'fso-breaker');}
assert.equal(c.convoy.raid.phase,'approach');
assert(raidWing.every(e=>(e.pose.eye[0]-c.convoy.ships[24].position[0])*U>2000),'All three arrive from the same starboard quarter');
const wingSpan=()=>Math.max(...raidWing.flatMap(a=>raidWing.map(b=>Math.hypot(...a.pose.eye.map((v,k)=>v-b.pose.eye[k]))*U)));
assert(wingSpan()<350,'Initial loose wedge is one group');
c.enemies.filter(e=>e.team==='ally').forEach(e=>{e.hp=0;});
pose=f.snapshot().state;Object.assign(pose,{eye:[-10000/U,-10000/U,1500],velocity:[0,0,0],ramp:[0,0,0],throttle:0});
const leaderStart=raidLeader.pose.eye.slice();f.advance(10,{stop:true});
assert.equal(c.convoy.raid.phase,'approach');assert(wingSpan()<400,'Actual steering retains cohesion over the approach');
assert(Math.hypot(...raidLeader.pose.eye.map((v,k)=>v-leaderStart[k]))*U>300);
assert(raidWing.every(e=>e.guns.fired===0),'Formation approach does not fire prematurely');
pose.eye=raidLeader.pose.eye.map((v,k)=>v-raidLeader.pose.back[k]*600/U);pose.right=raidLeader.pose.right.map(v=>-v);pose.up=raidLeader.pose.up.slice();pose.back=raidLeader.pose.back.map(v=>-v);
c.targetId='cargo-01';
f.DW.flightSim.damageCraft(c,raidLeader,{damage:20,shieldFactor:1,armorFactor:1},c.player);
f.advance(1/60,{stop:true});
assert.equal(c.convoy.raid.phase,'engage');assert.equal(raidLeader.targetId,'player','A struck raider responds to the interceptor, regardless of the player selection');
assert.equal(raidWing[2].targetId,'player','Cover pilot supports the intercepted wing');
assert.equal(raidWing[1].targetId,raidWing[1].convoyRaider.cargoId,'An unengaged striker can still threaten the cargo');
raidLeader.shield=0;f.DW.flightSim.damageCraft(c,raidLeader,{damage:raidLeader.maxHp*.65,shieldFactor:1,armorFactor:1},c.player);
f.advance(1/60,{stop:true});assert.equal(raidLeader.convoyRaider.stage,'extend');assert.equal(raidLeader.mode,'regroup','Critical damage aborts the run');
raidWing[1].convoyRaider.stage='extend';f.advance(1/60,{stop:true});assert.equal(c.convoy.raid.phase,'regroup','Finished or aborted passes regroup as a wing');
raidLeader.hp=0;f.advance(1/60,{stop:true});assert.equal(c.convoy.raid.leaderId,raidWing[1].id,'Surviving pilot assumes the lead');
raidWing[1].hp=0;f.advance(1/60,{stop:true});assert.equal(c.convoy.raid.leaderId,raidWing[2].id);assert.equal(raidWing[2].convoyRaider.role,'strike');
assert(raidWing[2].pose.eye.every(Number.isFinite));
f.reset();assert.equal(f.snapshot().combat.convoy.raid,undefined);assert.equal(f.snapshot().combat.enemies.length,2);
console.log('PASS convoy raider wing: normal defenses, same-bearing formation, shared physical flight, cover/strike roles, interceptor response, abort/regroup, succession and reset');
