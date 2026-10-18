'use strict';
const assert=require('node:assert/strict'),hold=require('../tools/flight-furball-target-lock.cjs');
const pilot={id:'a',team:'ally',hp:100,targetId:'b',retarget:.01,decision:.2,goal:[1,2,3],fire:true};
const target={id:'b',team:'enemy',hp:100,targetId:null,retarget:0};
const combat={enemies:[pilot,target]},before=JSON.parse(JSON.stringify(combat));
hold(combat,121);
assert.equal(pilot.retarget,121);
before.enemies[0].retarget=121;
assert.deepEqual(combat,before,'Only the valid target timer changes');
pilot.retarget=200;hold(combat,121);assert.equal(pilot.retarget,200);
for(const invalid of ['dead','friendly','missing']){
    pilot.retarget=0;target.hp=invalid==='dead'?0:100;target.team=invalid==='friendly'?'ally':'enemy';pilot.targetId=invalid==='missing'?'unknown':'b';
    hold(combat,121);assert.equal(pilot.retarget,0,'Live selector must replace '+invalid+' target');
}
target.hp=100;target.team='enemy';pilot.targetId='b';pilot.hp=0;hold(combat,121);assert.equal(pilot.retarget,0);
console.log('PASS target-lock ablation: holds valid targets; leaves acquisition, death replacement and other inputs unchanged');
