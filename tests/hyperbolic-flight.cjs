'use strict';
const assert=require('node:assert/strict');
const DW=require('../tools/headless.cjs').loadRuntime();
global.window={Driftworks:DW};
require('../experiments/hyperbolic-flight-model.js');
const H=DW.hyperbolicFlight;
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const p=[1,0,0,0],v=[0,0,0,-1],w=[0,1,0,0];
near(H.distance(p,H.exp(p,v,2)),2);
near(H.dot(H.exp(p,v,2),H.transport(p,v,w,2)),0);
near(H.dot(H.transport(p,v,w,2),H.transport(p,v,w,2)),1);
near(H.segmentDistance(p,v,H.exp(p,v,.5),1),0);
near(H.segmentDistance(p,v,H.exp(p,v,2),1),1);
const a={p:p.slice(),axes:[[0,1,0,0],[0,0,1,0],[0,0,0,1]]};
H.move(a,[10,20,-50],650);near(H.distance(p,a.p)*650,Math.hypot(10,20,50));
// Center projection and radar describe the same bearing but different depth.
const local=H.relative({p,axes:[[0,1,0,0],[0,0,1,0],[0,0,0,1]]},a.p);
near(local[0]/local[2],a.p[1]/a.p[3]);
near(Math.hypot(...local)*650,Math.hypot(10,20,50));
// Transverse angular size uses R*sinh(d/R), not Euclidean d.
const center=H.exp(p,v,2),corner=H.exp(center,w,1/650);
near(corner[1]/-corner[3],Math.tanh(1/650)/Math.sinh(2));
for(const radius of [350,650,1800,100000]){
 const world=H.create(radius),shooter=world.actors[0],target=world.actors[1];
 target.p=[1,0,0,0];target.axes=shooter.axes.map(v=>v.slice());
 H.move(target,[80,30,-500],radius);target.flight.velocity=[190,20,-50];
 const lead=H.lead(world,shooter,target);assert.ok(lead,'reachable crossing target needs a pip');
 const direction=H.tangent(shooter,lead.direction);
 const bolt=H.exp(shooter.p,direction,(16+1000*lead.time)/radius);
 const future={p:target.p.slice(),axes:target.axes.map(v=>v.slice())};H.move(future,target.flight.velocity.map(v=>v*lead.time),radius);
 assert.ok(H.distance(bolt,future.p)*radius<.01,'aiming at the pip must meet the predicted target');
 assert.ok(Math.abs(lead.direction[0]-H.relative(shooter,target.p)[0]/Math.hypot(...H.relative(shooter,target.p)))>.01,'pip must lead lateral motion');
 target.flight.velocity=[0,0,0];const stationary=H.lead(world,shooter,target);assert.ok(stationary);near(stationary.time,(H.distance(shooter.p,target.p)*radius-16)/1000,1e-5);
 H.move(target,[0,0,-2500],radius);assert.equal(H.lead(world,shooter,target),null,'out-of-lifetime targets have no pip');
 target.dead=1;assert.equal(H.lead(world,shooter,target),null);
}
for(const radius of [350,650,1800,100000]){
 const world=H.create(radius);
 for(let i=0;i<7200;i++){
  H.step(world,1/120,{auto:true});
  if(i%120===0)for(const actor of world.actors){assert.ok(actor.p.every(Number.isFinite));near(H.dot(actor.p,actor.p),-1,1e-5);actor.axes.forEach(axis=>{near(H.dot(actor.p,axis),0,1e-5);near(H.dot(axis,axis),1,1e-5);});}
 }
 assert.ok(world.shots>0);assert.ok(world.hits>0);assert.ok(world.score[0]+world.score[1]>0);
 console.log('H3 battle',radius,world.score,world.shots,world.hits);
}
const escape=H.create(350);
for(let i=0;i<14400;i++){H.step(escape,1/120,{auto:false,boost:true,fire:true});if(i%120===0)assert.ok(escape.actors.every(a=>a.p.every(Number.isFinite)));}
console.log('H3 real arcade flight, geodesics, transport, combat and sustained escape passed');
