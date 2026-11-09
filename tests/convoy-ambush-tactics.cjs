'use strict';
const assert=require('node:assert/strict'),{createFlight}=require('../tools/headless.cjs');
const f=createFlight({mission:'fleet-evacuation',seed:29}),c=f.snapshot().combat,s=c.convoy;
c.time=s.elapsed=32;f.DW.convoyMission.step(c,0);assert.equal(s.raids.length,1);
s.director.pressure=1;s.director.overload=20;s.director.lastDamageAt=s.elapsed;
f.DW.convoyMission.step(c,0);assert.notEqual(s.raids[0].phase,'withdraw','Capital damage must not cancel a fresh, healthy strike wing');
const striker=c.enemies.find(ship=>ship.convoyRaider?.role==='strike'),r=striker.convoyRaider;
s.raids[0].phase='engage';r.stage='defend';r.breakUntil=c.time-1;striker.targetId='player';
f.DW.convoyMission.stepRaider(c,striker,0);assert.equal(r.stage,'attack');assert(r.commitUntil>c.time);assert(striker.targetId.startsWith('cargo-'),'A healthy striker recommits after a bounded defensive break');
s.raids[0].phase='withdraw';f.DW.convoyMission.stepRaider(c,striker,1/120);
const cargo=s.ships.find(ship=>ship.id===r.cargoId);assert(Math.hypot(...striker.goal.map((v,k)=>(v-cargo.position[k])*f.DW.sim.METERS_PER_UNIT))>6000,'Retreat goal can actually satisfy the 5.5 km departure condition');
f.reset();const fresh=f.snapshot().combat;fresh.convoy.elapsed=22;
assert(f.DW.convoyMission.radio(fresh,0,true).interrupt,'Priority warning can cut through a busy radio channel');
const live=createFlight({mission:'fleet-evacuation',seed:29}),lc=live.snapshot().combat;lc.player.hp=lc.player.maxHp=1000000;
const fired=new Map(),cargoWings=new Set();let cargoShots=0;
for(let t=0;t<90;t+=.25){live.advance(.25);for(const ship of lc.enemies){const delta=ship.guns.fired-(fired.get(ship.id)||0);if(delta>0&&ship.convoyRaider&&ship.targetId?.startsWith('cargo-')){cargoShots+=delta;cargoWings.add(ship.convoyRaider.wing);}fired.set(ship.id,ship.guns.fired);}}
assert(cargoWings.size>=2,'Successive wings must reach cargo firing runs rather than retreating or dogfighting indefinitely');assert(cargoShots>20);
// Continue the actual encounter with the production capital rig: no enemy
// relocation or special durability changes for the combatants being covered.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),DW=live.DW,context=vm.createContext({window:{Driftworks:DW},console});
for(const name of ['assets/ships/aegis-kit/flight-rig.js','src/aegis-sim.js','src/aegis-visual.js','src/aegis-battle.js','experiments/aegis-flight.js','experiments/convoy-scenery.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),context,{filename:name});
DW.flightMissions.current=()=>DW.flightMissions.resolve('fleet-evacuation');const rig=DW.convoyScenery.createArrivalFleet();rig.reset(lc);
live.advance(6);
for(let i=0;i<30*60;i++){live.advance(1/60);rig.step(1/60,live.snapshot());}
const report=rig.telemetry(),pdShots=report.mounts.filter(m=>m.kind==='point-defense').reduce((n,m)=>n+(m.shots||0),0);
assert(pdShots>0,'Bastion must fire at real raiders during its actual arrival and cover window');assert(report.hits>0);
console.log('PASS ambush tactics: pressure does not cancel attacks, bounded defensive breaks, reachable withdrawal, priority interruption, real cargo runs and live Bastion support',JSON.stringify({cargoShots,wings:[...cargoWings],pdShots,hits:report.hits}));
