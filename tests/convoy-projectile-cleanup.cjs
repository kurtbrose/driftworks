'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createFlight}=require('../tools/headless.cjs'),f=createFlight({mission:'fleet-evacuation',seed:29}),DW=f.DW,view=f.snapshot(),c=view.combat,s=c.convoy,e=s.evacuation,U=DW.sim.METERS_PER_UNIT;
const context=vm.createContext({window:{Driftworks:DW},console});
for(const file of ['assets/ships/aegis-kit/flight-rig.js','src/aegis-sim.js','src/aegis-visual.js','src/aegis-battle.js','experiments/aegis-flight.js','experiments/convoy-scenery.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
DW.flightMissions.current=()=>DW.flightMissions.resolve('fleet-evacuation');
// Observe the production facade's actual gun state, including both native mount types.
const simulations=[],create=DW.aegisSim.create;DW.aegisSim.create=function(options){const sim=create(options);simulations.push(sim);return sim;};
e.capitals[0].present=true;const rig=DW.convoyScenery.createArrivalFleet();rig.reset(c);
const b=e.capitals[0],pose=DW.arcade.create(0),co=Math.cos(b.heading),si=Math.sin(b.heading);
pose.eye=b.position.map((v,k)=>v+([co*-650-si*-500,si*-650+co*-500,220][k])/U);
const target=DW.flightSim.createCraft('completion-target',pose,'enemy');target.hp=target.maxHp=1000000;target.shield=0;c.enemies.push(target);DW.flightSim.collisionChanged(c);
for(let i=0;i<180;i++)rig.step(1/30,view);assert(rig.telemetry().shots>0,'Fixture first establishes live capital fire');
const native=simulations[0].visualState(),mounts=['point-defense','heavy'].map(kind=>native.mounts.find(m=>m.source.kind===kind));
function round(weapon){return {position:[100000/U,0,1200],direction:[1,0,0],weapon,age:0,team:'ally'};}
for(const m of native.mounts){m.guns.bolts=[];m.guns.impacts=[];}
for(const m of mounts)m.guns.bolts.push(round({...DW.retailWeapons[0],speed:700,lifetime:8}));
const scripted=round({...DW.retailWeapons[0],speed:850,lifetime:7});e.guns.bolts.push(scripted);e.bombardUntil=1000000;e.rescueAt=1000000;
s.complete=true;e.phase='complete';const shots=rig.telemetry().shots,scriptedShots=e.guns.fired;
const before=mounts.map(m=>m.guns.bolts[0].position[0]),scriptedBefore=scripted.position[0];
DW.convoyMission.step(c,.1);rig.step(.1,view);
assert(scripted.position[0]>scriptedBefore&&scripted.age>0,'Mission battery rounds keep moving after the final callout');
mounts.forEach((m,i)=>assert(m.guns.bolts[0].position[0]>before[i]&&m.guns.bolts[0].age>0,'Native capital rounds keep moving after completion'));
for(let i=0;i<100;i++){DW.convoyMission.step(c,.1);rig.step(.1,view);}
assert.equal(e.guns.bolts.length,0,'Mission battery rounds expire');assert(native.mounts.every(m=>!m.guns.bolts.length),'All native capital rounds expire');
assert.equal(rig.telemetry().shots,shots,'Completed escort does not start new capital bursts');assert.equal(e.guns.fired,scriptedShots,'Completed escort does not restart bombardment');assert.equal(s.elapsed,0,'Projectile cleanup does not advance mission progression');
f.reset();rig.reset(f.snapshot().combat);assert(simulations[0].visualState().mounts.every(m=>!m.guns.bolts.length));
console.log('PASS completion cleanup: mission battery, native PD/heavy rounds move and expire; no new shots, no mission progression and reset clears gun state');
