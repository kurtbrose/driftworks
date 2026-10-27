'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createFlight}=require('../tools/headless.cjs');
const flight=createFlight({mission:'cinematic'}),DW=flight.DW;
const context=vm.createContext({window:{Driftworks:DW},Float32Array,Map,Math,console});
for(const file of ['assets/ships/aegis-kit/flight-rig.js','experiments/aegis-flight.js','experiments/flight-watch.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
const rig=DW.aegisFlight.createBattle({bridge:true}),director=DW.flightWatch.cinema(rig),U=DW.sim.METERS_PER_UNIT;
flight.session.setStartPosition([0,-10000/U,5000/U]);rig.reset(flight.snapshot().combat);
const buffers=rig.geometry().map(b=>b.vertices);
for(let i=0;i<1800;i++){flight.advance(1/60);rig.step(1/60,flight.snapshot());director.advance(1/60);}
const report=rig.telemetry();console.log(JSON.stringify({capitals:report.capitals,launches:report.launches,enabled:flight.snapshot().combat.enabled,dead:flight.snapshot().combat.dead,roundOver:flight.snapshot().combat.roundOver,wave:flight.snapshot().combat.wave,mounts:report.mounts.slice(0,2)}));
assert.ok(report.shots>0,'capital batteries fire across charts');
console.log('heavy',report.mounts.filter(m=>m.kind==='heavy').map(m=>({shots:m.shots,yaw:m.yaw,el:m.elevation})));
assert.ok(report.capitals.some(c=>c.integrity<20000),'physical bridge rounds damage the opposite capital');
for(const team of ['ally','enemy'])assert.equal(flight.snapshot().combat.enemies.filter(c=>c.hp>0&&c.team===team).length,8,'each hangar fills its wing');
const victim=flight.snapshot().combat.enemies.find(c=>c.team==='enemy');victim.hp=0;
for(let i=0;i<240;i++){flight.advance(1/60);rig.step(1/60,flight.snapshot());}
assert.equal(flight.snapshot().combat.enemies.filter(c=>c.hp>0&&c.team==='enemy').length,8,'loss replaced by hangar launch');
assert.ok(rig.geometry().every((b,i)=>b.vertices===buffers[i]),'immutable mesh buffers retained');
const regions=new Set();for(let i=0;i<6;i++){const pose=director.camera(flight.snapshot());regions.add(pose.region);for(const v of [...pose.eye,...pose.right,...pose.up,...pose.back])assert.ok(Number.isFinite(v));assert.ok(Math.abs(Math.hypot(...pose.back)-1)<1e-8);director.next();}
assert.equal(regions.size,2,'director visits both skies');
director.reset();assert.equal(director.label(),'Bridge establishing');
console.log('PASS cinematic demo: real session, bridge battery hits, both hangars, casualty replacement, stable geometry and both camera charts');
