'use strict';
const assert=require('node:assert/strict'),{createFlight}=require('../tools/headless.cjs');
const {assertFlightInvariants}=require('../tools/flight-invariants.cjs');
const f=createFlight({mission:'fleet-evacuation',seed:29}),c=f.snapshot().combat,s=c.convoy,e=s.evacuation,U=f.DW.sim.METERS_PER_UNIT;
assert.equal(c.enemies.length,2);assert(c.enemies.every(ship=>ship.team==='ally'));assert.equal(e.phase,'patrol');assert(e.capitals.every(ship=>!ship.present));assert(!s.arrivalPortal);
assert(f.DW.flightMissions.resolve('fleet-evacuation').sky.gasGiant);assert(!f.DW.flightMissions.resolve('fleet-evacuation').weaponsDisabled);
const sky=f.DW.flightMissions.resolve('fleet-evacuation').sky,frame=JSON.parse(JSON.stringify(sky.jadeSystem.frame));
assert(frame[1][2]<-0.9,'Jade lies below the convoy');
assert(Math.acos(frame[1][1])>Math.asin(sky.jadeSystem.planetRadiusKm/Math.hypot(...sky.jadeSystem.observer)),'Forward convoy route clears the visible planet disk');
assert.deepEqual(frame[0],[1,0,0]);assert(Math.abs(frame[1][1]*frame[2][2]-frame[1][2]*frame[2][1]-1)<1e-9,'Proper rotation preserves the entire sky tableau');
assert.deepEqual(JSON.parse(JSON.stringify(f.DW.flightMissions.resolve('gas-giant').sky.jadeSystem.frame)),[[1,0,0],[0,1,0],[0,0,1]],'Weather free flight keeps its existing orientation');
s.elapsed=10;assert.equal(f.DW.convoyAmbush.radio(c),null,'A wingman never replies without a status request');s.elapsed=0;
c.player.hp=c.player.maxHp=1000000;
f.advance(21);assert.equal(f.transcript.length,2);assert(f.transcript[0].speaker.includes('CONTROL'));assert(f.transcript[1].text.includes('Fuel sixty-two percent'));assert(!s.arrivalPortal);
f.advance(38);assert.equal(e.warningAt,null,'Patrol has time to settle');assert(e.capitals.every(ship=>!ship.present));
const samples=[];let maxFighters=0,lastWave=0,previousPhase=s.director.attention.phase,restStart=null,rests=[],warningAt=null,openingAt=null,dodged=false,reliefSeen=false;
for(let t=59;t<700&&!s.complete;t++){
 const before=s.director.attention.phase;f.advance(1);assertFlightInvariants(f.snapshot());
 const a=s.director.attention;maxFighters=Math.max(maxFighters,c.enemies.filter(ship=>ship.hp>0).length);
 if(e.warningAt!==null&&warningAt===null){warningAt=e.warningAt;assert(warningAt>=60);}
 if(s.arrivalPortal&&openingAt===null){openingAt=s.elapsed;assert(e.warningAt!==null);assert(openingAt>=e.warningAt+6);assert.equal(e.capitals[0].present,false);assert(e.capitals[1].present);assert(s.arrivalPortal.position[1]*U>s.ships[0].position[1]*U);}
 if(e.waves&&s.ships.filter(ship=>ship.hull>0).every(ship=>ship.velocity[0]<-1))dodged=true;
 if(a.phase==='rest'&&previousPhase!=='rest'){restStart=s.elapsed;rests.push(a.restDuration);}
 if(e.waves!==lastWave){if(lastWave>0){assert(restStart!==null);assert(s.elapsed-restStart>=9,'New wing waits through actual rest');}lastWave=e.waves;}
 if(e.capitals[0].present&&!reliefSeen){assert.equal(a.phase,'ready','Relief arrives after the fight cools');assert(restStart!==null);reliefSeen=true;}
 if(s.elapsed>=e.rescueAt&&s.elapsed<e.bastionClearAt)assert(s.ships.every(ship=>!ship.arrived),'No cargo is teleported away on relief arrival');
 if(e.waves!==samples.at(-1)?.waves||e.phase!==samples.at(-1)?.phase)samples.push({seconds:Math.round(s.elapsed),phase:e.phase,waves:e.waves});
 previousPhase=a.phase;
}
assert(s.complete);assert(dodged);assert(e.guns.fired>0&&e.capitalHits>0);assert(e.waves>=2&&e.waves<=4);assert(maxFighters<=8,'Waves do not stack into a second dogfight');assert(rests.length>=2&&rests.every(t=>t>=10&&t<=30));assert(e.rescueAt>120);assert(s.ships.some(ship=>ship.arrived));
assert(f.transcript.some(line=>line.text.includes('Spatial discontinuity')));assert(f.transcript.some(line=>line.text.includes('Bastion is inbound')));assert(f.transcript.some(line=>line.text.includes('Bastion to convoy')));
const escaped=s.ships.find(ship=>ship.arrived);assert(!f.DW.convoyMission.targets(c).some(ship=>ship.id===escaped.id));const hull=escaped.hull;f.DW.convoyMission.damage(c,escaped.id,f.DW.retailWeapons[0],escaped.position);assert.equal(escaped.hull,hull);
assert.equal(s.battle.order,null);assert.equal(s.director.waypoint,null);assert.doesNotThrow(()=>JSON.stringify(s));
f.reset();const fresh=f.snapshot().combat;assert.equal(fresh.enemies.length,2);assert.equal(fresh.convoy.evacuation.phase,'patrol');assert.equal(fresh.convoy.evacuation.reserves,12);assert(!fresh.convoy.arrivalPortal);assert.equal(fresh.convoy.evacuation.guns.fired,0);
fresh.convoy.ships.forEach(ship=>{ship.hull=0;});f.DW.convoyMission.step(fresh,0);assert(fresh.convoy.complete);
console.log('PASS dynamically paced convoy ambush: quiet chatter, priority warning, route obstruction/dodge, real capital rounds and damage, bounded waves, delayed Bastion, opposite-direction extraction, ownership and reset',JSON.stringify({maxFighters,rests,rescueAt:e.rescueAt,samples}));
