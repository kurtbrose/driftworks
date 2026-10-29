'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{loadRuntime}=require('../tools/headless.cjs');
const DW=loadRuntime(),H=DW.flightHyperbolic,U=DW.sim.METERS_PER_UNIT,ctx=vm.createContext({window:{Driftworks:DW},Float32Array,Map,WeakMap,Math});
for(const file of ['assets/ships/aegis-kit/flight-rig.js','experiments/aegis-flight.js','experiments/hyperbolic-battle.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),ctx,{filename:file});
let rig;const surface=(a,b,bolt)=>rig?rig.hit(a,b,bolt):null;surface.onImpact=(p,b,c)=>rig.damage(p,b.weapon.damage,c);
const session=DW.flightSession.create({terrainHit:surface,surfaceFrame:()=>({point:[0,0,0],normal:[0,0,1]}),onGunshot:()=>{},onImpact:()=>{}});
session.reset({mode:'hyperbolic',enabled:true,profile:DW.arcade.profiles[0]});rig=DW.hyperbolicBattle.create();rig.reset(session.snapshot().combat);session.respawn(rig.spawnPlayer(session.snapshot().state));
assert.equal(session.snapshot().state.curvature,400);assert.equal(rig.telemetry().capitals.length,2);assert.equal(rig.components().length,58);
const h=DW.aegisFlightAsset.hangars[0].position,axis=H.offset([0,0,0],[h[0]/U,0,0],400),expected=H.offset(axis,[0,h[1]/U,h[2]/U],400);
assert.ok(H.path(session.snapshot().state.eye,expected,400).distance*U<.001,'player starts inside the actual friendly hangar');
const demand={throttle:0,throttleRate:0,fire:false,boost:false,pitch:0,yaw:0,roll:0};
function step(n){for(let i=0;i<n;i++){session.advance(1/30,demand,{profile:DW.arcade.profiles[0],weapon:DW.retailWeapons[0]});rig.step(1/30,session.snapshot());if(session.snapshot().combat.dead)session.respawn(rig.spawnPlayer(session.snapshot().state));}}
step(180);let report=rig.telemetry();assert.ok(report.capitals.every(c=>c.shots>0&&c.integrity<20000),'both real capitals fire and suffer real damage');assert.ok(report.hits>0);
assert.ok(report.mounts.some(m=>m.kind==='point-defense'&&m.shots>0&&m.targetId.startsWith('wave-')),'point defense fires at fighters');
assert.ok(DW.training.collisionStats(session.snapshot().combat).queries>0,'capital rounds use the spatial collision index');
const buffers=rig.geometry(session.snapshot().state).map(b=>b.vertices);assert.ok(buffers.length>20);rig.geometry(session.snapshot().state).forEach((b,i)=>assert.equal(b.vertices,buffers[i],'immutable articulated mesh buffers are reused'));
assert.ok(rig.effects(session.snapshot().state).every(b=>b.vertices.every(Number.isFinite)));
const old=session.snapshot(),enemies=old.combat.enemies,enemyIds=enemies.map(c=>c.id),time=old.combat.time,capitalHealth=report.capitals.map(c=>c.integrity),shots=report.shots;
for(let i=0;i<3;i++){
 const previous=session.snapshot().state;old.combat.player.hp=0;const pose=rig.spawnPlayer(previous),restored=session.respawn(pose);
 assert.equal(restored.world,old.world);assert.equal(restored.combat,old.combat);assert.equal(restored.combat.enemies,enemies);assert.deepEqual(restored.combat.enemies.map(c=>c.id),enemyIds);assert.equal(restored.combat.time,time);
 assert.notEqual(restored.state,previous);assert.equal(restored.state.spaceFrame,previous.spaceFrame);assert.equal(restored.combat.player.pose,restored.state);assert.equal(restored.combat.player.guns,restored.guns);
 assert.equal(restored.combat.hull,restored.combat.maxHull);assert.equal(restored.combat.shield,restored.combat.maxShield);assert.equal(restored.combat.dead,false);assert.equal(restored.state.throttle,0);assert.ok(restored.state.velocity.every(v=>v===0));
 assert.deepEqual(rig.telemetry().capitals.map(c=>c.integrity),capitalHealth);assert.equal(rig.telemetry().shots,shots,'respawn must not restart the battle');
}
const retired=DW.training.createCraft('hyper-bay-retired',DW.arcade.create(0),'ally');retired.hp=0;old.combat.enemies.push(retired);
const casualty=old.combat.enemies.find(c=>c.hp>0&&c.team==='enemy');casualty.hp=0;const launched=rig.telemetry().launches;step(100);assert.ok(rig.telemetry().launches>launched,'carrier replaces a lost fighter from its hangar');assert.ok(!old.combat.enemies.includes(retired),'dead launched actors retire while their independent wrecks can persist');
const before=rig.telemetry().capitals.map(c=>c.integrity),centre=rig.telemetry().capitals[0].position;
// Visibility/aim probes are read-only; only finalized impacts apply damage.
const a=H.offset(centre,[-500/U,-150/U,0],400),b=H.offset(centre,[-500/U,150/U,0],400);rig.hit(a,b);assert.deepEqual(rig.telemetry().capitals.map(c=>c.integrity),before);
console.log('PASS hyperbolic capital battle: two armed/damageable carriers, fighter defense, spatial-index rounds, hangar reinforcement, buffer reuse and repeated player-only hangar respawns preserving the battle');
