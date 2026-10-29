"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {loadRuntime}=require('../tools/headless.cjs');
const DW=loadRuntime(),U=DW.sim.METERS_PER_UNIT;
function fixture(){
 const t=DW.training.create('cinematic'),p=DW.arcade.create(0),q=DW.arcade.create(0);
 p.eye=[-40/U,0,0];q.eye=[0,0,0];
 DW.training.bindPlayer(t,p);const e=DW.training.createCraft('shield-target',q,'enemy');e.controller='input';e.shield=e.maxShield=120;e.collision={kind:'sphere',radiusM:7};t.enemies=[e];t.enabled=true;t.openingStep=100;t.player.collision={kind:'sphere',radiusM:7};return {t,p,e};
}
function shot(speed,start,end){
 const {t,p,e}=fixture();const weapon={...DW.retailWeapons[0],speed,damage:40,shieldFactor:1,armorFactor:1};
 const bolt={weapon,position:[start/U,0,0],direction:[1,0,0],age:0};
 const hit=DW.training.trace(t,bolt.position,[end/U,0,0],bolt,'player',undefined,p);
 return {t,p,e,hit};
}
let f=shot(100,-30,20);assert.ok(f.hit[0]*U<-7);assert.equal(f.e.hp,100);assert.equal(f.e.shield,80);
f=shot(20,-30,20);assert.equal(f.e.hp,60);assert.equal(f.e.shield,120,'slow projectile bypasses live shields');
f=shot(100,-8,20);assert.equal(f.e.hp,60,'a fast shot originating inside the shield hits hull');assert.equal(f.e.shield,120);
f=fixture();DW.training.step(f.t,f.p,.01,100);f.p.velocity=[100,0,0];f.p.eye=[30/U,0,0];DW.training.step(f.t,f.p,.01,100);
assert.ok(f.p.velocity[0]<100&&f.e.pose.velocity[0]>0,'swept fighter collision exchanges momentum');assert.ok(Math.hypot(f.p.velocity[1],f.p.velocity[2])>20,'head-on fighters acquire sideways passing motion');assert.ok(f.t.flashes.length>=2,'both shields flash');assert.equal(f.t.player.hp,100);assert.equal(f.e.hp,100);
const separationBefore=Math.hypot(...f.p.eye.map((v,i)=>v-f.e.pose.eye[i]));
const idle={throttle:null,throttleRate:0,fire:false,pitch:0,yaw:0,roll:0};
for(let i=0;i<20;i++){DW.training.stepInput(f.t.player,idle,1/120);DW.training.stepInput(f.e,idle,1/120);DW.training.step(f.t,f.p,1/120,100);}
assert.ok(Math.hypot(...f.p.eye.map((v,i)=>v-f.e.pose.eye[i]))>separationBefore,'fighter deflection persists through real engine ticks instead of riding the other hull');
f=fixture();DW.training.step(f.t,f.p,.01,100);f.p.velocity=[20,0,0];f.p.eye=[0,0,0];DW.training.step(f.t,f.p,.01,100);assert.equal(f.p.velocity[0],20,'slow fighter enters');
for(const file of ['assets/ships/aegis-kit/flight-rig.js','assets/ships/aegis-kit/shield-envelope.js','experiments/combat-shields.js','experiments/aegis-flight.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),{window:{Driftworks:DW},Float32Array,Map,Math});
function capital(){const state={team:'enemy',position:[0,0,0],heading:0,velocity:[0,0,0],integrity:20000};return {state,rig:DW.aegisFlight.create({state,opponent:{...state,team:'ally',position:[0,2000/U,0]}})};}
let c=capital();f=fixture();f.p.eye=[0,-200/U,0];f.p.velocity=[0,100,0];const view={state:f.p,combat:f.t};c.rig.step(.01,view);f.p.eye=[0,200/U,0];c.rig.step(.01,view);assert.ok(f.p.velocity[1]<0,'capital shield reflects rather than stopping');assert.ok(f.p.eye[1]<0);assert.equal(c.state.integrity,20000);
const weapon={...DW.retailWeapons[0],speed:100},bolt={weapon,position:[0,-200/U,0],direction:[0,1,0],age:0};
c=capital();let h=c.rig.hit(bolt.position,[0,200/U,0],bolt);assert.ok(h);assert.ok(c.rig.damage(h,100,f.t));assert.equal(c.state.integrity,19900,'fast shot drains combined capital defenses without hitting components');
bolt.weapon={...weapon,speed:20};h=c.rig.hit(bolt.position,[0,200/U,0],bolt);assert.ok(h);c.rig.damage(h,100,f.t);assert.equal(c.state.integrity,19800,'slow torpedo hits capital hull');
console.log('PASS permeable shields: fast/slow/inside projectiles, swept fighter momentum, blue-flash events, capital rebound and hull penetration');
