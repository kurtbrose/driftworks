'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(__dirname,'..'),DW={sim:{METERS_PER_UNIT:10000/600}},ctx=vm.createContext({window:{Driftworks:DW},Float32Array,Map,Math,console});
cp.execFileSync(process.execPath,[path.join(root,'tools/bake-aegis-flight.cjs'),'--check'],{stdio:'pipe'});
for(const file of ['experiments/retail-profiles.js','experiments/flight-model.js','experiments/retail-weapons.js','experiments/guns.js','experiments/training.js','assets/ships/aegis-kit/flight-rig.js','experiments/aegis-flight.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
const U=DW.sim.METERS_PER_UNIT;
function position(x,y,z){return [x/U,y/U,1200+z/U];}
function fixture(targetZ=250){
 const state=DW.arcade.create(0);state.eye=position(0,-1200,200);
 const combat=DW.training.create('training');combat.enabled=true;DW.training.bindPlayer(combat,state);
 const pose=DW.arcade.create(0);pose.eye=position(-1000,0,targetZ);
 const enemy=DW.training.createCraft('target',pose,'enemy');enemy.controller='ai';enemy.hp=enemy.maxHp=10000;enemy.shield=0;enemy.collision.radiusM=15;
 combat.enemies=[enemy];return {state,combat,guns:DW.flightGuns.create(),world:{},enemy};
}
const rig=DW.aegisFlight.create(),view=fixture();
assert.equal(rig.telemetry().mounts.length,24);
assert.equal(rig.telemetry().mounts.filter(m=>m.kind==='heavy').length,12);
const initial=rig.geometry();assert.ok(initial.slice(0,7).every(b=>b.staticGeometry));
assert.ok(initial.every(b=>b.staticGeometry),'all ship geometry is uploaded once');
assert.ok(new Set(initial.map(b=>b.vertices)).size<initial.length,'identical turret meshes share vertex buffers');
const buffers=initial.map(b=>b.vertices),bases=initial.map(b=>b.basis),beforeMatrices=bases.map(b=>b&&Array.from(b));
rig.step(0,view);assert.equal(rig.telemetry().seconds,0);
rig.step(.05,view);assert.ok(rig.telemetry().mounts.every(m=>Math.abs(m.yaw)<=2.8*.05+1e-8&&Math.abs(m.elevation)<=2.2*.05+1e-8));
for(let i=0;i<240;i++){view.combat.time+=1/60;rig.step(1/60,view);}
assert.ok(rig.telemetry().shots>0,'upper batteries fire after acquiring a target');
assert.ok(rig.telemetry().hits>0&&view.enemy.hp<10000,'shared projectile/damage resolver hits the target');
assert.ok(rig.telemetry().mounts.filter(m=>m.kind==='heavy').every(m=>m.yaw===0&&m.elevation===0),'main batteries do not chase fighters');
assert.equal(view.combat.player.hp,100,'allied support fire cannot damage the player');
assert.ok(rig.telemetry().mounts.filter(m=>m.side<0).every(m=>m.elevation<=0),'underside arcs stay below deck');
assert.strictEqual(rig.geometry()[0].vertices,initial[0].vertices,'static hull buffers are reused');
const animated=rig.geometry();assert.strictEqual(animated,initial,'frame batching allocates no replacement array');
assert.ok(animated.every((b,i)=>b.vertices===buffers[i]&&b.basis===bases[i]),'animation changes transforms rather than vertex/GPU buffers');
assert.ok(animated.some((b,i)=>b.basis&&b.basis.some((v,k)=>Math.abs(v-beforeMatrices[i][k])>1e-4)),'GPU rotation bases follow tracking');
for(const b of animated.filter(b=>b.basis)){
 const a=b.basis;for(let i=0;i<3;i++)for(let j=0;j<3;j++){let dot=0;for(let k=0;k<3;k++)dot+=a[i*3+k]*a[j*3+k];assert.ok(Math.abs(dot-(i===j?1:0))<1e-5,'GPU basis stays orthonormal');}
}
for(const b of rig.geometry())for(const value of b.vertices)assert.ok(Number.isFinite(value));
rig.reset();const below=fixture(-250);
for(let i=0;i<300;i++){below.combat.time+=1/60;rig.step(1/60,below);}
assert.ok(rig.telemetry().shots>0&&below.enemy.hp<10000,'ventral batteries engage below the ship');
// A crossing fighter at combat speed must be hit with actual moving projectiles.
rig.reset();const crossing=fixture(220);crossing.enemy.pose.eye=position(-650,-500,220);crossing.enemy.pose.velocity=[0,170,0];
for(let i=0;i<300;i++){
 crossing.combat.time+=1/120;crossing.enemy.pose.eye=crossing.enemy.pose.eye.map((v,k)=>v+crossing.enemy.pose.velocity[k]/120/U);
 rig.step(1/120,crossing);
}
assert.ok(rig.telemetry().hits>=5&&crossing.enemy.hp<10000,'PD intercepts a fighter crossing at 170 m/s');
rig.reset();const blocked=fixture(0);
for(let i=0;i<240;i++)rig.step(1/60,blocked);
assert.equal(rig.telemetry().shots,0,'targets behind the hull plane do not draw fire');
const hit=rig.hit(position(0,-100,0),position(0,100,0));assert.ok(hit);assert.ok(hit[1]<0,'first hull surface wins');
assert.equal(rig.hit(position(0,-100,100),position(0,100,100)),null);
rig.reset();const contact=fixture();contact.state.eye=position(0,-100,0);rig.step(.01,contact);
contact.state.eye=position(0,100,0);rig.step(.01,contact);
assert.equal(rig.telemetry().contacts,1);assert.ok(contact.state.eye[1]<0);assert.equal(contact.state.throttle,0);
rig.reset();assert.equal(rig.telemetry().shots,0);assert.equal(rig.telemetry().seconds,0);
const disabled=fixture();disabled.combat.enabled=false;for(let i=0;i<300;i++)rig.step(1/60,disabled);assert.equal(rig.telemetry().shots,0);
// Cosmetic scorch projection is bounded; projectile damage is never throttled.
const markView=fixture(),fakeModel={id:'mark-test'},savedPacks=DW.shipPackModels;let marks=0;
markView.enemy.collision={kind:'model',modelId:fakeModel.id};
DW.shipPackModels={find:()=>({model:fakeModel}),hullHit:()=>({fraction:.5,point:markView.enemy.pose.eye,local:[0,0,0],normal:[0,0,1],model:fakeModel}),addScorch:()=>{marks++;}};
const bolt={weapon:{...DW.retailWeapons[0],damage:1},age:0,position:position(-1001,0,250),direction:[1,0,0]};
for(let i=0;i<100;i++){markView.combat.time=i*.01;DW.training.trace(markView.combat,position(-1001,0,250),position(-999,0,250),bolt,'player',undefined,markView.state,.25);}
assert.equal(marks,4,'PD marks are limited to four per victim per second');assert.ok(markView.enemy.hp<9950,'all projectile damage is still applied');
DW.training.trace(markView.combat,position(-1001,0,250),position(-999,0,250),bolt,'player',undefined,markView.state);assert.equal(marks,5,'ordinary fighter marks retain existing behavior');
DW.shipPackModels=savedPacks;
console.log('PASS Aegis flight: baked pivots, bounded tracking, upper/lower arcs, real projectile damage, allied safety, hull contact, pause/reset and static buffer reuse');

// Hit accounting reports real damage directly, once per trace, including lethal hits.
const reportView=fixture();let reports=0;
function reportTrace(weapon,terrain){return DW.training.trace(reportView.combat,position(-1001,0,250),position(-999,0,250),{...bolt,weapon},'player',terrain,reportView.state,undefined,()=>reports++);}
reportTrace({...bolt.weapon,damage:0});assert.equal(reports,0,'zero damage does not count');
reportTrace({...bolt.weapon,damage:1},()=>position(-1001,0,250));assert.equal(reports,0,'terrain occlusion does not count');
reportView.enemy.shield=10;reportTrace({...bolt.weapon,damage:1});assert.equal(reports,1,'shield damage counts once');
reportView.enemy.shield=0;reportView.enemy.hp=.01;reportTrace({...bolt.weapon,damage:100});assert.equal(reports,2,'lethal hull damage counts once');
reportTrace({...bolt.weapon,damage:100});assert.equal(reports,2,'dead targets do not count');
// A retained target wins over a newly closer contact, then death triggers reacquisition.
const lockedView=fixture(),lockRig=DW.aegisFlight.create();lockedView.combat.enabled=false;
for(let i=0;i<60;i++)lockRig.step(1/60,lockedView);
const lockedAngles=lockRig.telemetry().mounts.map(m=>m.yaw);
const intruder=DW.training.createCraft('closer',DW.arcade.create(0),'enemy');intruder.pose.eye=position(0,100,250);lockedView.combat.enemies.unshift(intruder);
for(let i=0;i<60;i++)lockRig.step(1/60,lockedView);
assert.deepEqual(lockRig.telemetry().mounts.map(m=>m.yaw),lockedAngles,'valid lock is retained despite a nearer contact');
lockedView.enemy.hp=0;for(let i=0;i<60;i++)lockRig.step(1/60,lockedView);
assert.ok(lockRig.telemetry().mounts.some((m,i)=>Math.abs(m.yaw-lockedAngles[i])>.1),'dead lock reacquires');
console.log('PASS Aegis accounting and targeting: shield/lethal/zero/occluded/dead hits, lock retention and reacquisition');
