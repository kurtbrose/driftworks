'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createFlight}=require('../tools/headless.cjs');
const flight=createFlight({mission:'fleet-evacuation',seed:29}),DW=flight.DW;
// The production capital facade is browser-owned; exercise it without a GPU,
// using its actual simulation, asset and visual geometry rather than dummy rigs.
const context=vm.createContext({window:{Driftworks:DW},console});
for(const file of ['assets/ships/aegis-kit/flight-rig.js','src/aegis-sim.js','src/aegis-visual.js','src/aegis-battle.js','experiments/aegis-flight.js','experiments/convoy-scenery.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),context,{filename:file});
DW.flightMissions.current=()=>DW.flightMissions.resolve('fleet-evacuation');
const rig=DW.convoyScenery.createArrivalFleet(),view=flight.snapshot();rig.reset(view.combat);
const geometry=rig.geometry(),buffers=geometry.map(batch=>batch.vertices),starts=view.combat.convoy.evacuation.capitals.map(ship=>ship.position.slice());
for(let i=0;i<600;i++){DW.convoyBattle.updateEvacuation(view.combat,1/30);rig.step(1/30,view);}
const report=rig.telemetry();assert(report.shots>0&&report.hits>0);assert.equal(report.launches,0,'Capital hangars must not bypass the finite mission roster');
assert(view.combat.flashes.some(flash=>flash.scale===5));assert(view.combat.flashes.filter(flash=>flash.scale===5).every(flash=>!flash.destruction),'Routine capital hits use impact flashes, not repeated full destruction explosions');
assert(report.capitals.every((ship,i)=>ship.integrity<20000&&ship.position.some((v,k)=>v!==starts[i][k])),'Both moving capitals take real projectile damage');
assert.equal(rig.geometry(),geometry);assert(rig.geometry().every((batch,i)=>batch.vertices===buffers[i]),'Movement preserves shared static GPU buffers');
for(let i=0;i<2;i++)assert.deepEqual(report.capitals[i].position,view.combat.convoy.evacuation.capitals[i].position,'The renderer observes the mission plan');
flight.reset();const reset=flight.snapshot();rig.reset(reset.combat);assert(rig.telemetry().capitals.every(ship=>ship.integrity===20000));
const initial=rig.telemetry().capitals[0].position.slice();DW.convoyBattle.updateEvacuation(reset.combat,1);assert.notDeepEqual(rig.telemetry().capitals[0].position,initial,'Reset reconnects to the replacement combat state');
reset.combat.convoy.complete=true;const shots=rig.telemetry().shots;rig.step(1/30,reset);assert.equal(rig.telemetry().shots,shots);
console.log('PASS evacuation capitals: actual moving armed rigs, reciprocal damage, bounded hangars, shared geometry, reset ownership, completed ceasefire',JSON.stringify({shots:report.shots,hits:report.hits,integrity:report.capitals.map(ship=>ship.integrity)}));
