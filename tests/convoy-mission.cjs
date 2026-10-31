'use strict';
const assert=require('node:assert/strict');
const {createFlight}=require('../tools/headless.cjs');
const f=createFlight({mission:'convoy',seed:29});
let {combat:c,state:player,world}=f.snapshot();
const U=f.DW.sim.METERS_PER_UNIT;
assert.equal(f.DW.convoyMission.WING_SIZE,3);
assert.equal(c.enemies.length,5);
assert(c.convoy.speedMps<c.player.profile.maxVelocity[2]/2,'Freighters are substantially slower than fighters');
assert.equal(c.enemies.filter(e=>e.team==='ally').length,2);
assert.equal(c.enemies.filter(e=>e.team==='enemy').length,3);
c.enemies.filter(e=>e.team==='enemy').forEach(e=>{e.hp=0;});
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
assert.equal(c.enemies.length,5);
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
const targets=f.DW.convoyMission.targets(c);assert.equal(targets.length,30);
assert.equal(targets[24].hp,c.convoy.ships[24].hull);
assert(c.enemies.filter(e=>e.team==='enemy').every(e=>e.targetId.startsWith('cargo-')));
f.advance(12,{stop:true});
assert(c.convoy.ships.every(s=>s.hull===s.maxHull),'Distant approach gives the player an interception window');
f.advance(40,{stop:true});
assert(c.enemies.filter(e=>e.team==='enemy').some(e=>e.guns.fired>0),'Raiders fire real projectiles');
assert(c.enemies.filter(e=>e.team==='ally').some(e=>e.guns.fired>0),'Wingmen fight the raiders');
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
f.reset();c=f.snapshot().combat;
for(let i=0;i<1200&&!c.dead;i++){
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
console.log('PASS playable escort loop: real controls, interception, lead, gunfire, raider kills and convoy survival');

// Channel ownership and character identity must survive real threat changes.
f.reset();c=f.snapshot().combat;
const radio=(dt=30,busy=false)=>f.DW.flightComms.step(f.DW.flightComms.create(),dt,c,busy,()=>.5,f.snapshot().state);
assert.equal(radio(2,true),null);assert.equal(c.convoy.radio.opening,0,'Busy channel cannot consume an introduction');
assert.match(radio().speaker,/CONTROL \/ Rook/);
const visualReply=radio();assert.match(visualReply.text,/Affirmative, Control/);assert.equal(visualReply.craftId,c.enemies[0].id);assert.equal(visualReply.portraitIndex,c.enemies[0].index);
const welcome=radio();assert.match(welcome.text,/Glad to have you/);assert.equal(welcome.civilianPortraitIndex,0);
const nearby=radio();assert.match(nearby.text,/bandits approaching/);
assert(!c.convoy.radio.said.includes('range'),'No weapons-range warning while distant');
const raiders=c.enemies.filter(e=>e.team==='enemy'),attacker=raiders[0],target=c.convoy.ships[24];
attacker.pose.eye=at(target,[700,0,0]);
assert.match(radio().text,/entering weapons range.*rear group/);
attacker.fire=true;attacker.guns.fired=1;assert.match(radio().text,/Bandit firing/);attacker.fire=false;
target.hull-=600;const damaged=radio();assert.equal(damaged.craftId,target.id);assert.equal(damaged.civilianPortraitIndex,5);assert.match(damaged.speaker,/Thomas Reed/);
target.hull=0;assert.match(radio().text,/Transport lost in the rear group/);
raiders.forEach(e=>{e.hp=0;});assert.match(radio().text,/No further contacts/);
const cast=[];for(let i=0;i<8;i++){const line=radio();if(line)cast.push(line);}
assert.equal(cast.filter(l=>typeof l.civilianPortraitIndex==='number').length,4,'Only surviving packet captains introduce themselves');
assert(!cast.some(l=>l.craftId===target.id),'Destroyed captain cannot speak');
assert.deepEqual(cast.map(l=>l.civilianPortraitIndex),[0,1,2,4],'Portrait identities match the established civilian roster');
f.reset();c=f.snapshot().combat;assert.deepEqual(Array.from(c.convoy.radio.said),[]);assert.equal(c.convoy.radio.opening,0);
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
assert.match(radio(3).text,/bandits approaching/);
assert.equal(radio(60),null,'Captains do not run a roll call during combat');
const threatened=c.convoy.ships[24];threatened.hull-=100;
assert.equal(radio(),null,'Minor damage does not trigger chatter');
threatened.hull-=500;assert.match(radio().speaker,/Thomas Reed/);
c.convoy.ships[25].hull-=1000;
assert.equal(radio(),null,'Several damaged ships in one packet produce one report');
c.enemies.filter(e=>e.team==='enemy').forEach(e=>{e.hp=0;});assert.match(radio().text,/No further contacts/);
assert.equal(radio(27),null,'Routine chatter waits for 28 actual silent seconds');
assert.match(radio(1).speaker,/Mara Vale/);
console.log('PASS convoy radio pacing: silence after speech, urgent gap, no combat roll call, damage threshold and packet aggregation');

const arrivalFlight=createFlight({mission:'convoy',seed:29});arrivalFlight.advance(13,{stop:true});
const arrivalLines=arrivalFlight.transcript;
assert.equal(arrivalLines.length,3,'The actual channel delivers one short arrival exchange');
assert.equal(arrivalLines[0].craftId,'control');assert.match(arrivalLines[0].text,/visual range/);
assert.equal(arrivalLines[1].craftId,arrivalFlight.snapshot().combat.enemies[0].id);
assert.equal(arrivalLines[2].civilianPortraitIndex,0);assert.match(arrivalLines[2].text,/Glad to have you/);
console.log('PASS convoy arrival radio: real channel timing, Control observation, wing acknowledgment and civilian welcome');
