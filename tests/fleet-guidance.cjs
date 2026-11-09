'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const context={window:{Driftworks:{}}};vm.runInNewContext(fs.readFileSync('src/fleet-guidance.js','utf8'),context);
const api=context.window.Driftworks.fleetGuidance,distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
function bodies(n){return Array.from({length:n},(_,i)=>({id:'ship-'+i,position:[(i%5-2)*90,Math.floor(i/5)*115,(i%3-1)*35],velocity:[0,25,0],forward:[0,1,0],radius:61,crossRadius:11,halfSize:[9,61,7],packet:Math.floor(i/6)}));}
function run(ships,seconds,turn=false,pressure=false){const group=api.create(ships),origin=group.anchor.slice();let worstAcceleration=0,worstTurn=0,worstSlip=0;
 for(let i=0;i<seconds*20;i++){let time=(i+1)/20,vel=ships.map(b=>b.velocity.slice()),heading=ships.map(b=>b.forward.slice());const turning=turn&&time>=20;
  const route=origin.map((v,k)=>v+(turning?[25*(time-20),500,0]:[0,time*25,0])[k]);
  const threats=pressure?[{position:[group.anchor[0]-750,group.anchor[1],0],radius:2500,weight:2}]:[];
  api.step(group,ships,route,turning?[25,0,0]:[0,25,0],threats,.05);
  ships.forEach((b,j)=>{const speed=Math.hypot(...b.velocity),along=b.velocity.reduce((n,v,k)=>n+v*b.forward[k],0);if(speed>2)worstSlip=Math.max(worstSlip,Math.hypot(...b.velocity.map((v,k)=>v-along*b.forward[k]))/speed);worstAcceleration=Math.max(worstAcceleration,distance(vel[j],b.velocity)/.05);worstTurn=Math.max(worstTurn,Math.acos(Math.max(-1,Math.min(1,heading[j].reduce((n,v,k)=>n+v*b.forward[k],0))))/.05);});
 }return {group,worstAcceleration,worstTurn,worstSlip};}
for(const n of [1,7,30]){const ships=bodies(n),before=JSON.stringify(ships.map(b=>b.position)),result=run(ships,45);
 assert.notEqual(JSON.stringify(ships.map(b=>b.position)),before);assert(ships.every(b=>b.position.every(Number.isFinite)));
 assert(result.worstAcceleration<1.85,'Main thrust, braking and lateral thrust remain bounded');assert(result.worstTurn<.04501,'Each nose turns at a bounded angular rate');
 assert.equal(Object.keys(result.group.slots).length,0,'No assigned positions exist for actors to follow');
 const observed=[0,1,2].map(k=>ships.reduce((n,b)=>n+b.position[k],0)/ships.length);assert(distance(observed,result.group.anchor)<1e-8,'Group anchor observes the actors rather than moving them');}
const turning=bodies(12),initial=distance(turning[0].position,turning[7].position);const turnResult=run(turning,65,true);
assert(turnResult.worstSlip<.05,"Turns keep lateral motion below 5% of speed rather than drifting broadside");
assert(turning.every(b=>b.forward[0]>.45),'Ships actually turn toward the new route');
assert(Math.abs(distance(turning[0].position,turning[7].position)-initial)>10,'Relative positions change through a turn; there are no invisible rods');
assert(distance(turning[0].forward,turning[7].forward)>.005,'Local responses do not produce a shared orientation');
const left=bodies(12),right=bodies(12);run(left,45,false,true);run(right,45);assert(left.reduce((n,b)=>n+b.position[0],0)>right.reduce((n,b)=>n+b.position[0],0)+300,'Pressure causes individual evasive steering');
const reverse=bodies(1);api.step(api.create(reverse),reverse,[0,-1000,0],[0,-25,0],[],1);assert(Math.abs(reverse[0].forward[0])>.01,'Antipodal heading changes have a defined turn axis');
const escorts=[{id:'alpha',position:left[0].position.slice(),velocity:[0,25,0],radius:8},{id:'beta',position:left[11].position.slice(),velocity:[0,25,0],radius:8}],group=api.create(left);
const goals=api.cover(group,left,escorts,[]);assert.equal(new Set(Object.values(group.assignments)).size,2);assert(Object.values(goals).every(p=>p.every(Number.isFinite)));
const joined={...bodies(1)[0],id:'newcomer',position:[700,group.anchor[1]-500,100]};left.push(joined);api.step(group,left,group.anchor,[0,25,0],[],.05);assert(joined.neighborIds);left.splice(0,1);api.step(group,left,group.anchor,[0,25,0],[],.05);assert(left.every(b=>b.position.every(Number.isFinite)));
for(const forward of [[0,1,0],[1,0,0],[0,0,1],[.2,.3,.95]]){const f=api.frame(forward),dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0);assert(Math.abs(dot(f.right,f.up))<1e-8);assert(Math.abs(dot(f.back,f.up))<1e-8);assert(Math.abs(Math.hypot(...f.right)-1)<1e-8);}
const cruising=bodies(30),settled=api.settle(cruising,{speed:25}),start=cruising.map(b=>b.position.slice()),origin=settled.anchor.slice();
assert(settled.settled);assert(settled.settleShift>0);assert.equal(Object.keys(settled.slots).length,0);
for(let i=0;i<600;i++)api.step(settled,cruising,origin.map((v,k)=>v+(k===1?25*(i+1)/20:0)),[0,25,0],[],.05);
assert(Math.max(...cruising.map((b,i)=>distance(b.position,start[i].map((v,k)=>v+(k===1?750:0)))))<1,'An established cruise does not shuffle after time zero');
const quietPositions=cruising.map(b=>b.position.slice());
for(let i=0;i<200;i++)api.step(settled,cruising,settled.anchor,[0,25,0],[{position:[settled.anchor[0]-300,settled.anchor[1],settled.anchor[2]],radius:1500,weight:3}],.05);
assert(cruising.some((b,i)=>Math.abs(b.position[0]-quietPositions[i][0])>3),'A settled fleet still reacts to a new threat');
const mixed=bodies(4);mixed.forEach(b=>{b.forward=[1,0,0];b.velocity=[25,0,0];});const inferred=api.settle(mixed);assert(inferred.forward[0]>.999);assert(mixed.every(b=>b.velocity[0]===25));
const empty=api.settle([]);assert(empty.anchor.every(Number.isFinite));assert(empty.forward.every(Number.isFinite));
const piled=bodies(7);piled.forEach(b=>{b.position=[0,0,0];});api.settle(piled);
assert(piled.every(b=>b.position.every(Number.isFinite)));assert(Math.max(...piled.map(b=>b.position[2]))-Math.min(...piled.map(b=>b.position[2]))>10,'Coincident ships resolve into volume rather than a ruler-straight row');
const tie=bodies(2);tie[0].id='a';tie[1].id='b';tie[0].forward=[1,0,0];tie[1].forward=[-1,0,0];assert(api.settle(tie).forward[0]>.999,'Opposing headings use a stable ID tie break');
// Reproduce the close-view wiggle: a settled convoy makes one turn, then cruises.
// Measure actual nose motion, not just the controller's requested heading.
const damped=bodies(30),dampedGroup=api.settle(damped),dampedOrigin=dampedGroup.anchor.slice(),rates=damped.map(()=>[0,0,0]);let flips=0,angularAcceleration=0;
for(let tick=0;tick<7200;tick++){
 const t=(tick+1)/60,turn=t>=20,old=damped.map(b=>b.forward.slice());
 api.step(dampedGroup,damped,dampedOrigin.map((v,k)=>v+(turn?[25*(t-20),500,0]:[0,25*t,0])[k]),turn?[25,0,0]:[0,25,0],[],1/60);
 damped.forEach((body,i)=>{const a=old[i],b=body.forward,w=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]].map(v=>v*60),prior=rates[i];
  angularAcceleration=Math.max(angularAcceleration,distance(w,prior)*60);
  if(t>25&&Math.hypot(...w)>.002&&Math.hypot(...prior)>.002&&w.reduce((n,v,k)=>n+v*prior[k],0)<0)flips++;
  rates[i]=w;
 });
}
assert(angularAcceleration<.041,'Noses accelerate into and out of turns instead of snapping between steering updates');
assert.equal(flips,0,'A single course order does not produce repeated small steering reversals');
// The live mission rebuilds body views each tick. Angular damping must survive that adapter.
let adapted=bodies(3);const continuous=JSON.parse(JSON.stringify(adapted)),adaptedGroup=api.settle(adapted),continuousGroup=api.settle(continuous);
for(let tick=0;tick<1200;tick++){
 adapted=adapted.map(b=>({id:b.id,position:b.position.slice(),velocity:b.velocity.slice(),forward:b.forward.slice(),radius:b.radius,crossRadius:b.crossRadius,halfSize:b.halfSize,packet:b.packet}));
 for(const [g,ships] of [[adaptedGroup,adapted],[continuousGroup,continuous]])api.step(g,ships,[500,500,0],[25,0,0],[],1/60);
}
assert(adapted.every((b,i)=>distance(b.forward,continuous[i].forward)<1e-9&&distance(b.position,continuous[i].position)<1e-7),'Transient body views retain the same damped motion');
console.log('PASS local flocking: independent motion, bounded handling, settled cruise without startup shuffle, inferred course and reactive pressure');

// Both production 30-transport missions preserve independent steering through
// their real mission adapter; authored launch slots cannot tether moving ships.
for(const mission of ['convoy','fleet-evacuation']){
 const flight=require('../tools/headless.cjs').createFlight({mission,seed:29});
 const combat=flight.snapshot().combat,state=combat.convoy,U=flight.DW.sim.METERS_PER_UNIT;
 assert.equal(state.ships.length,30);assert(state.navigation.settled);
 assert.equal(Object.keys(state.navigation.slots).length,0);
 const slots=JSON.stringify(state.ships.map(ship=>ship.slot));
 // Disturb one vessel after settling: neighbors must react without translating
 // or rotating the whole fleet as one rigid object.
 state.ships[0].position=state.ships[1].position.map((v,k)=>v+(k===0?18/U:0));
 const initial=state.ships.map(ship=>ship.position.slice());
 for(let tick=0;tick<400;tick++){combat.time+=.05;flight.DW.convoyMission.step(combat,.05);}
 const shifts=state.ships.map((ship,i)=>ship.position.map((v,k)=>(v-initial[i][k])*U));
 assert(shifts.some(shift=>distance(shift,shifts[29])>2),mission+' reacts locally rather than moving on invisible rods');
 assert(state.ships.some(ship=>Math.abs(ship.forward[0])+Math.abs(ship.forward[2])>.001),mission+' turns actual hull headings to maneuver');
 assert.equal(JSON.stringify(state.ships.map(ship=>ship.slot)),slots);
 assert(Object.values(state.navigation.controls).some(control=>control.angularVelocity),'Angular steering survives mission body reconstruction');
}
console.log('PASS independent freighter steering in convoy and fleet evacuation missions');
