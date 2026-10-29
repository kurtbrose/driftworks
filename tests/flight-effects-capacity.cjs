"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('../tools/stress-flight.cjs');
const f=fixture(128,29,'dense'),D=f.DW,{combat,state}=f.snapshot(),weapon={...D.retailWeapons[0],damage:1e6,shieldFactor:1,armorFactor:1};
assert.ok(combat.enemies.every(e=>e.decision<2),'Both large wings become active within two seconds');
// A real simultaneous loss burst must retain every explosion and wreck.
for(let i=0;i<60;i++)D.training.damageCraft(combat,combat.enemies[i*2],weapon,null);
assert.equal(combat.flashes.filter(f=>f.destruction).length,60);
assert.equal(combat.wrecks.length,60);
const presentation=fs.readFileSync(require.resolve('../experiments/flight-presentation.js'),'utf8');
const submit=presentation.match(/scene\.setStudyExplosions\(([\s\S]+?\}\))\);/);assert.ok(submit);
let submitted;
vm.runInNewContext('scene.setStudyExplosions('+submit[1]+');',{scene:{setStudyExplosions:b=>submitted=b},combat,units:D.sim.METERS_PER_UNIT,explosionSeeds:new WeakMap()});
assert.equal(submitted.length,60,'Presentation passes every live destruction to the scene');
const bolt={position:state.eye.map((v,i)=>v-state.back[i]*200/D.sim.METERS_PER_UNIT),direction:state.back.map(v=>-v),weapon:D.retailWeapons[0],age:.1};
combat.enemies.forEach(e=>{e.guns.bolts=Array.from({length:32},()=>({...bolt,position:bolt.position.slice()}));e.guns.impacts=[{position:bolt.position.slice(),age:.05}];});
const all=D.training.allGuns(combat,f.snapshot().guns),batches=D.flightGuns.geometry(all,state);
assert.equal(all.bolts.length,4096,'All shots survive fleet aggregation, including shots from destroyed shooters');
assert.equal(batches.slice(0,3).reduce((n,b)=>n+b.vertices.length/36,0),4096,'Every live shot produces a quad');
assert.equal(batches[3].vertices.length/36,128,'Every impact produces a quad');
// Lifetime expiry, rather than fleet count, owns cleanup.
combat.enemies.forEach(e=>{e.guns.bolts=[];e.guns.impacts=[];});
combat.flashes.forEach(b=>b.age=5.5-1/240);combat.wrecks.forEach(w=>w.age=120-1/240);
f.advance(1/120,{stop:true});
assert.equal(f.snapshot().combat.flashes.length,0);assert.equal(f.snapshot().combat.wrecks.length,0);
console.log('PASS fleet effects: bounded AI startup, 60 simultaneous destructions/wrecks through presentation, 4096 complete bolt quads, impacts and lifetime cleanup');
