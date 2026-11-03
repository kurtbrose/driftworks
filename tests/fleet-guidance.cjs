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
console.log('PASS local flocking: no slots, emergent relative motion, bounded headings/acceleration, pressure, membership and escort coverage');
