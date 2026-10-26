'use strict';
const assert=require('node:assert/strict');
const {createFlight}=require('../tools/headless.cjs');
const f=createFlight({mission:'battle',seed:29}),U=f.DW.sim.METERS_PER_UNIT;
let t=f.snapshot().combat;
t.player.hp=t.player.maxHp=1e9;
assert.equal(t.enemies.length,30);
for(let zone=0;zone<5;zone++) {
 const wing=t.enemies.filter(e=>e.battleZone.id===zone);
 assert.equal(wing.length,6);assert.equal(wing.filter(e=>e.team==='ally').length,3);
 assert.ok(wing.every(e=>e.collision.kind==='model'),'real model hulls');
}
const homes=t.enemies.map(e=>JSON.stringify(e.battleZone.center));
f.advance(25,{stop:true});t=f.snapshot().combat;
assert.ok(t.enemies.reduce((n,e)=>n+e.guns.fired,0)>100,'real gunfire');
assert.ok(t.enemies.reduce((n,e)=>n+e.guns.hits,0)>0,'real damage');
for(let z=0;z<5;z++)assert.ok(t.enemies.some(e=>e.hp>0&&e.battleZone.id===z),'zones remain populated');
t.enemies.forEach((e,i)=>{assert.equal(JSON.stringify(e.battleZone.center),homes[i]);if(e.hp>0)assert.ok(Math.hypot(...e.pose.eye.map((v,k)=>(v-e.battleZone.center[k])*U))<1300,'bounded zone pursuit');});
const own=t.enemies.find(e=>e.hp>0&&e.team==='enemy'&&e.battleZone.id===1),home=own.battleZone.center;
own.pose.eye=home.map((v,k)=>v+(k===0?1400/U:0));own.targetId=t.player.id;own.retarget=0;
const before=own.pose.eye.slice();f.advance(.05,{stop:true});
assert.equal(own.mode,'return-zone');assert.equal(own.targetId,null,'no distant fallback target');assert.equal(own.fire,false);
assert.ok(Math.hypot(...own.pose.eye.map((v,k)=>(v-before[k])*U))<30,'return uses physics, not teleportation');
// A player crossing into the defended zone is a real eligible opponent.
t.enemies.filter(e=>e.team==='ally').forEach(e=>{e.pose.eye=home.map((v,k)=>v+(k===0?5000/U:0));});
f.snapshot().state.eye=home.map((v,k)=>v+(k===0?100/U:0));
own.pose.eye=home.slice();own.targetId=null;own.retarget=0;
f.advance(.05,{stop:true});assert.equal(own.targetId,t.player.id);
const ordinary=createFlight({mission:'furball',seed:29});assert.equal(ordinary.snapshot().combat.enemies.length,16);assert.ok(ordinary.snapshot().combat.enemies.every(e=>!e.battleZone));
console.log('PASS battle zones: real model hulls, live fire/damage, distributed ownership, physical return, pursuit limits and player intrusion');
