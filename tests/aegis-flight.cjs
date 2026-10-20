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
assert.equal(rig.telemetry().mounts.length,12);
const initial=rig.geometry();assert.ok(initial.slice(0,7).every(b=>b.staticGeometry));
rig.step(0,view);assert.equal(rig.telemetry().seconds,0);
rig.step(.05,view);assert.ok(rig.telemetry().mounts.every(m=>Math.abs(m.yaw)<=.45*.05+1e-8&&Math.abs(m.elevation)<=.3*.05+1e-8));
for(let i=0;i<240;i++){view.combat.time+=1/60;rig.step(1/60,view);}
assert.ok(rig.telemetry().shots>0,'upper batteries fire after acquiring a target');
assert.ok(rig.telemetry().hits>0&&view.enemy.hp<10000,'shared projectile/damage resolver hits the target');
assert.equal(view.combat.player.hp,100,'allied support fire cannot damage the player');
assert.ok(rig.telemetry().mounts.filter(m=>m.side<0).every(m=>m.elevation<=0),'underside arcs stay below deck');
assert.strictEqual(rig.geometry()[0].vertices,initial[0].vertices,'static hull buffers are reused');
for(const b of rig.geometry())for(const value of b.vertices)assert.ok(Number.isFinite(value));
rig.reset();const below=fixture(-250);
for(let i=0;i<300;i++){below.combat.time+=1/60;rig.step(1/60,below);}
assert.ok(rig.telemetry().shots>0&&below.enemy.hp<10000,'ventral batteries engage below the ship');
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
console.log('PASS Aegis flight: baked pivots, bounded tracking, upper/lower arcs, real projectile damage, allied safety, hull contact, pause/reset and static buffer reuse');
