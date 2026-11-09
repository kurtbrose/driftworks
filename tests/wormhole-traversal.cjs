'use strict';
const assert=require('node:assert/strict');
const {createFlight}=require('../tools/headless.cjs');
const flight=createFlight({mission:'fleet-evacuation',seed:29}),D=flight.DW;
let view=flight.snapshot(),combat=view.combat,plan=combat.convoy.evacuation;
const U=D.sim.METERS_PER_UNIT;
plan.warningAt=22;plan.incidentAt=28;combat.convoy.director.attention.phase='ready';
combat.time=combat.convoy.elapsed=28;D.convoyMission.step(combat,0);
assert.equal(combat.wormholes.length,1,'Opening a mission mouth registers a real connection');
combat.enemies=[];D.flightSim.collisionChanged(combat);
function approach(link,space,direction){
 const p=view.state,mouth=link.mouths.find(m=>m.space===space);
 p.region=space;p.eye=mouth.position.map((v,k)=>(v+(k===1?direction*(mouth.radius+3):0))/U);
 p.right=[1,0,0];p.up=[0,0,1];p.back=[0,-1,0];p.velocity=[0,-direction*250,0];p.ramp=[0,0,-direction*250];p.rates=[0,0,0];p.throttle=0;
 return p;
}
const hostile=combat.wormholes[0];
// Closed/opening gates are tested through the real session, not just ray math.
combat.time=combat.convoy.elapsed=28;
let p=approach(hostile,0,-1);flight.advance(.1,{throttle:0});assert.equal(p.region,0,'A forming mouth cannot transfer craft');
combat.time=combat.convoy.elapsed=32;
p=approach(hostile,0,-1);flight.advance(.1,{throttle:0});assert.equal(p.region,1,'Player actually enters hostile space');
assert(p.eye.every(Number.isFinite));assert(Math.abs(Math.hypot(...p.velocity)-233.876746)<.01,'Traversal preserves speed apart from ordinary damping');
assert.equal(D.wormholes.skyView(combat.wormholes,1,combat.time,U).localSky,2,'Hostile space selects its destination sky');
assert.equal(D.wormholes.skyView(combat.wormholes,1,combat.time,U).sky,0,'Return mouth looks into the source space');
for(let i=0;i<3;i++)assert(Math.abs(Math.hypot(...[p.right,p.up,p.back][i])-1)<1e-9);
p=approach(hostile,1,1);flight.advance(.1,{throttle:0});assert.equal(p.region,0,'Return crossing restores source space');
plan.rescueAt=40;plan.bastionClearAt=60;plan.exit.opensAt=40;combat.time=combat.convoy.elapsed=40;D.convoyMission.step(combat,0);
const rescue=combat.wormholes.find(link=>link.id==='fleet-rescue');assert(rescue);
combat.time=combat.convoy.elapsed=44;
p=approach(rescue,0,-1);flight.advance(.1,{throttle:0});assert.equal(p.region,2,'Rescue and hostile mouths lead to distinct spaces');
assert.equal(D.wormholes.skyView(combat.wormholes,2,combat.time,U).localSky,1);
p=approach(rescue,2,1);flight.advance(.1,{throttle:0});assert.equal(p.region,0,'Rescue return also uses the shared traversal');
assert.doesNotThrow(()=>JSON.stringify(combat.wormholes),'Connection state stays JSON-safe');
flight.reset();assert(!flight.snapshot().combat.wormholes,'Reset discards the prior sortie connections');
console.log('PASS mission wormhole traversal: forming gate, hostile/rescue destinations, both return paths, sky identity, frame/speed preservation and reset');
