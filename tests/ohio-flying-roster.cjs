'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{Driftworks:{sim:{METERS_PER_UNIT:10},assetUrl:x=>x}},Float32Array,Map,Set,console};vm.createContext(context);
for(const file of ['experiments/retail-profiles.js','experiments/flight-model.js','experiments/flight-missions.js','experiments/mission-ohio.js','experiments/retail-weapons.js','experiments/guns.js','assets/ships/quaternius-ultimate-spaceships/meshes.js','assets/ships/ohio-vehicles/meshes.js','experiments/ship-packs.js','experiments/flight-collision.js','experiments/training.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
const DW=context.window.Driftworks,api=DW.training,player=DW.arcade.create(125),t=api.create('ohio');
api.configure(t,DW.arcade.profiles[0]);t.useHullModels=true;api.spawn(t,player,125);t.openingStep=3;
assert.equal(t.enemies.length,8);assert.equal(t.enemies.filter(e=>e.team==='ally').length,4);
for(const side of ['ally','enemy']){
 const cast=t.enemies.filter(e=>e.team===side);
 assert(cast.some(e=>e.modelId==='ohio-truck'));assert(cast.some(e=>e.modelId==='ohio-tractor'));
}
for(const id of ['ohio-truck','ohio-tractor']){
 const m=DW.shipPackModels.find(id).model;
 assert.equal(m.triangles,m.vertices.length/18);assert(m.vertices.every(Number.isFinite));
 assert.equal(DW.shipPackModels.gunAnchors(m).length,2);assert.equal(DW.shipPackModels.engineAnchors(m).length,2);
 assert.equal(DW.shipPackModels.craftModel({index:0,modelId:id},'mixed',1),m);
 const pose=DW.arcade.create(0);pose.throttle=1;
 const engines=DW.shipPackModels.engineGeometry([{index:0,modelId:id,pose,hp:100}],'mixed',1,10,pose,0);
 assert(engines.vertices.length>0);assert.deepEqual(Array.from(engines.color),[.25,.65,1]);
 const guns=DW.flightGuns.create(),anchors=DW.shipPackModels.gunAnchors(m);
 DW.flightGuns.step(guns,pose,DW.retailWeapons[0],true,0,undefined,undefined,2,anchors);
 assert.equal(guns.bolts.length,2);
 for(let i=0;i<2;i++)for(let k=0;k<3;k++)assert(Math.abs(guns.bolts[i].position[k]-(pose.eye[k]+(pose.right[k]*anchors[i][0]-pose.back[k]*anchors[i][1]+pose.up[k]*anchors[i][2])/10))<1e-8);

}
for(let i=0;i<80;i++)assert(!DW.shipPackModels.mixedModel(i,1).id.startsWith('ohio-'),'generic missions retain spaceship models');
t.reinforcementOrigin=[-15,-72,120];t.reinforcementDirection=[0,-.6,.8];
const seen=new Set(t.enemies.map(e=>e.callsign)),ids=new Set(t.enemies.map(e=>e.id));
for(let turn=0;turn<24;turn++){
 const old=t.enemies[turn%8],side=old.team;
 api.damageCraft(t,old,{damage:1e6,shieldFactor:1,armorFactor:1},t.player);
 const wreck=t.wrecks[t.wrecks.length-1];assert.equal(wreck.modelId,old.modelId,'wreck retains vehicle hull');
 api.step(t,player,0,125);
 assert.equal(t.enemies.length,8);assert.equal(api.alive(t).length,8);assert(!t.roundOver);assert.equal(t.wave,1);
 const replacement=t.enemies[turn%8];assert.equal(replacement.team,side);assert(!ids.has(replacement.id));ids.add(replacement.id);
 assert.deepEqual(Array.from(replacement.pose.eye),[-15,-72,120]);assert(replacement.hangarLaunch);seen.add(replacement.callsign);
 assert.equal(new Set(t.enemies.map(e=>e.index)).size,8,'No active pilot appears twice');
}
assert.equal(seen.size,16,'All sixteen nicknames rotate into the eight active slots');
const launching=t.enemies[0],before=launching.pose.eye.slice();api.step(t,player,.1,125);
assert(launching.pose.eye[2]>before[2]);assert.equal(launching.fire,false);assert(launching.hangarLaunch.remaining<4);
const regular=api.create('furball');api.spawn(regular,player,125);assert.equal(regular.enemies.length,16);assert(!regular.rosterNext);
console.log('PASS Ohio flying roster: 4v4, headlight guns/rear engines, mixed fighters/vehicles, unique rotating cast, immediate barn launches, vehicle wrecks and standard-mission isolation');
