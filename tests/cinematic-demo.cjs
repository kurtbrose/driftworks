'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createFlight}=require('../tools/headless.cjs');
const flight=createFlight({mission:'cinematic'}),DW=flight.DW;
const context=vm.createContext({window:{Driftworks:DW},Float32Array,Map,Math,console});
for(const file of ['assets/ships/aegis-kit/flight-rig.js','experiments/aegis-flight.js','experiments/flight-watch.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
const rig=DW.aegisFlight.createBattle({bridge:true}),director=DW.flightWatch.cinema(rig),U=DW.sim.METERS_PER_UNIT;
flight.session.setStartPosition([0,-10000/U,5000/U]);
const observer=flight.snapshot().combat;observer.player.hp=observer.player.maxHp=observer.hull=observer.maxHull=1e9;
assert.equal(observer.enemies.length,0,'all demo fighters must originate in hangars');rig.reset(observer);
if(process.argv.includes('--batteries')){
 const view=flight.snapshot();view.combat.hangarSupport=false;const fired=new Set();
 for(let i=0;i<1200;i++){rig.step(1/60,view);if(i%60===0)rig.telemetry().mounts.forEach((m,index)=>{if(m.kind==='heavy'&&m.shots>0)fired.add(index);});}
 console.log('Broadside heavy batteries firing:',fired.size,'/ 24');
 assert.equal(fired.size,24,'all main batteries have clear firing arcs');process.exit(0);
}
assert.ok(rig.telemetry().capitals.every(c=>c.mainBatteryClear),'initial opposite-side window is open');
const buffers=rig.geometry().map(b=>b.vertices);
const heavyFired=new Set();
for(let i=0;i<1800;i++){flight.advance(1/30);rig.step(1/30,flight.snapshot());director.advance(1/30);if(i%30===0)rig.telemetry().mounts.forEach((m,index)=>{if(m.kind==='heavy'&&m.shots>0)heavyFired.add(index);});}
const report=rig.telemetry();
const radial=report.capitals.map((c,index)=>[(c.position[0]*U-index*12000)/675,(c.position[1]*U+2000)/675]);
assert.equal(report.capitals[0].mainBatteryClear,radial[0][0]*radial[1][0]+radial[0][1]*radial[1][1]<-.25,'engagement follows actual angular separation');
report.capitals.forEach((c,index)=>{const x=c.position[0]*U-index*12000,y=c.position[1]*U+2000;assert.ok(Math.abs(Math.hypot(x,y)-675)<1e-6,'capital remains just outside 600 m distortion radius');assert.ok(Math.abs(c.position[2]*U-1550)<1e-6,'capital orbit is horizontal at mouth height');assert.ok(Math.abs(Math.cos(c.heading)*x+Math.sin(c.heading)*y)<1e-6,'long hull remains tangent, with its broadside inward');});
console.log('Fighter rounds:',flight.snapshot().combat.enemies.reduce((n,c)=>n+c.guns.fired,0),'launches:',report.launches);
assert.ok(flight.snapshot().combat.enemies.some(c=>c.guns.fired>0),'autonomous fighters actually fire at their opponents');
assert.ok(report.shots>0,'capital batteries fire across charts');
assert.equal(heavyFired.size,24,'broadside placement exposes all twelve heavy batteries on each capital');
assert.ok(report.capitals.every(c=>c.integrity<20000),'physical bridge rounds damage the opposite capital');
for(const team of ['ally','enemy'])assert.ok(flight.snapshot().combat.enemies.some(c=>c.hp>0&&c.team===team),'each hangar launches an active wing');
const victim=flight.snapshot().combat.enemies.find(c=>c.hp>0&&c.team==='enemy');victim.hp=0;
for(let i=0;i<240;i++){flight.advance(1/60);rig.step(1/60,flight.snapshot());}
assert.ok(rig.telemetry().launches>report.launches,'loss replaced by hangar launch');
assert.ok(flight.snapshot().combat.enemies.some(c=>c.targetId),'fighters acquire actual opposing fighters across charts');
assert.ok(flight.snapshot().combat.enemies.every(c=>!c.battleZone),'fighters have no zone leash');
assert.ok(rig.geometry().filter((b,i)=>b.vertices===buffers[i]).length>buffers.length*.8,'intact geometry buffers retained while destroyed components may change');
const regions=new Set();for(let i=0;i<6;i++){const pose=director.camera(flight.snapshot());regions.add(pose.region);for(const v of [...pose.eye,...pose.right,...pose.up,...pose.back])assert.ok(Number.isFinite(v));assert.ok(Math.abs(Math.hypot(...pose.back)-1)<1e-8);director.next();}
assert.equal(regions.size,2,'director visits both skies');
director.reset();assert.equal(director.label(),'Bridge establishing');
console.log('PASS cinematic demo: real session, bridge battery hits, both hangars, casualty replacement, stable geometry and both camera charts');
