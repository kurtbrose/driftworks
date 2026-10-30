'use strict';
const assert=require('node:assert/strict'),create=require('../tools/flight-furball-telemetry.cjs');
const craft=(id,team,y)=>({id,team,hp:100,guns:{fired:0,hits:0},pose:{eye:[0,y,0],back:[0,-1,0],velocity:[0,0,0]},goal:[0,300,0],mode:'attack',targetId:null,decision:.4});
const a=craft('a','ally',0),b=craft('b','enemy',300),c=craft('c','enemy',350),combat={enemies:[a,b,c]};
const DW={sim:{METERS_PER_UNIT:1},flightSim:{intercept:(origin,position)=>({point:position,time:1})}},dt=.1;
const telemetry=create(DW,combat,dt),weapon={speed:500,lifetime:2};
function sample(trigger){const snapshot=telemetry.before(a.guns,a.pose,weapon,trigger);telemetry.after(a.guns,snapshot);}
a.targetId='b';sample(false); // valid opportunity, burst duty closed
a.decision=.3;a.targetId='c';sample(true); // switch between decisions
a.guns.fired=2;a.guns.hits=1;
a.decision=.4;a.targetId='b';sample(false); // switch with a fresh decision
a.mode='break';sample(false);
const summary=telemetry.summary(),pilot=summary.pilots[0];
assert.equal(pilot.switches,2);assert.equal(pilot.acquisitions,1);assert.equal(pilot.switchesWhileGoalHeld,1);
assert(Math.abs(pilot.opportunitySeconds-.3)<1e-10);assert.equal(pilot.opportunityWindows,1);
assert.equal(pilot.gates.notAttack,.1);assert.equal(pilot.gates.dutyClosed,.2);assert.equal(pilot.triggerSeconds,.1);
// Count emitted bolts and hits as deltas around the unchanged gun integrator.
const snapshot=telemetry.before(a.guns,a.pose,weapon,false);a.guns.fired+=2;a.guns.hits++;telemetry.after(a.guns,snapshot);
assert.equal(telemetry.summary().shots,2);assert.equal(telemetry.summary().hits,1);
const aliveSeconds=telemetry.summary().aliveSeconds;
a.hp=0;const deadSnapshot=telemetry.before(a.guns,a.pose,weapon,false);a.guns.hits++;telemetry.after(a.guns,deadSnapshot);
assert.equal(telemetry.summary().hits,2);assert.equal(telemetry.summary().aliveSeconds,aliveSeconds);
console.log('PASS furball telemetry: opportunities, gate accounting, target switches, shot/hit deltas');
