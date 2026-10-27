'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const flight=require('../tools/headless.cjs').createFlight({mission:'cinematic'}),DW=flight.DW,U=DW.sim.METERS_PER_UNIT;
vm.runInNewContext(fs.readFileSync('experiments/flight-watch.js','utf8'),{window:{Driftworks:DW}});
const director=DW.flightWatch.cinema({telemetry:()=>({capitals:[]})}),view=flight.snapshot();
const pose=DW.arcade.create(0);pose.eye=[0,-200,100];pose.velocity=[70,0,0];
const fighter=DW.training.createCraft('camera-subject',pose,'ally');view.combat.enemies=[fighter];
for(let i=0;i<3;i++)director.next();
let previous=director.camera(view),velocity;
for(let i=0;i<120;i++){
 const yaw=i/120*Math.PI*2;pose.back=[Math.cos(yaw),Math.sin(yaw),0];pose.up=[0,0,i%2?-1:1];pose.eye[0]+=70/60/U;
 director.advance(1/60);const current=director.camera(view);
 const move=current.eye.map((v,k)=>(v-previous.eye[k])*U*60);
 assert.ok(Math.hypot(...move)<=240+1e-6,'camera has a physical speed bound');
 if(velocity)assert.ok(Math.hypot(...move.map((v,k)=>(v-velocity[k])*60))<=22.001,'turning fighter cannot whip camera acceleration');
 const angle=Math.acos(Math.max(-1,Math.min(1,current.back.reduce((sum,v,k)=>sum+v*previous.back[k],0))));
 assert.ok(angle<=.35/60+1e-5,'camera angular motion stays bounded');
 assert.ok(Math.abs(current.right[2])<1e-10,'horizon stays level despite fighter roll');
 const repeated=director.camera(view);assert.ok(repeated.eye.every((v,k)=>Math.abs(v-current.eye[k])<1e-10)&&repeated.back.every((v,k)=>Math.abs(v-current.back[k])<1e-10),'multiple reads per frame never advance camera');
 velocity=move;previous=current;
}
pose.region=1;director.advance(1/60);director.camera(view);
assert.equal(director.label(),'Across the throat','chart transition cuts rather than whipping across charts');
director.reset();for(let i=0;i<3;i++)director.next();director.camera(view);fighter.hp=0;director.advance(1/60);director.camera(view);
assert.equal(director.label(),'Across the throat','subject destruction receives an editorial cut');
console.log('PASS cinematic camera: bounded inertial acceleration/speed, damped aim, level horizon, stable repeated reads, chart/death cuts');

director.reset();for(let i=0;i<6;i++)director.next();
assert.equal(director.label(),'Wormhole orbit');
const orbit=[];for(let i=0;i<4;i++){
 const camera=director.camera(view),center=[0,-2000/U,1550/U],to=center.map((v,k)=>v-camera.eye[k]),distance=Math.hypot(...to);
 assert.equal(camera.region,0);assert.ok(distance*U>1050&&distance*U<1150);
 assert.ok(to.reduce((sum,v,k)=>sum-v/distance*camera.back[k],0)>.999999,'orbit always looks toward the physical mouth');
 orbit.push(camera.eye.map((v,k)=>(v-center[k])*U));director.advance(6);
}
assert.ok(orbit.some(p=>p[0]>1000)&&orbit.some(p=>p[0]<-1000)&&orbit.some(p=>p[1]>1000)&&orbit.some(p=>p[1]<-1000),'camera translates around all four sides of the sphere');
console.log('PASS wormhole orbit: physical 3D eye positions, four-sided parallax, gentle height change and center framing');
