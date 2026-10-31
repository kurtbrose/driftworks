'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{Driftworks:{sim:{METERS_PER_UNIT:10},assetUrl:x=>x}},Float32Array,Map,Set,console};vm.createContext(context);
for(const file of ['experiments/retail-profiles.js','experiments/flight-model.js','experiments/flight-missions.js','experiments/mission-ohio.js','experiments/retail-weapons.js','experiments/guns.js','assets/ships/quaternius-ultimate-spaceships/meshes.js','assets/ships/ohio-vehicles/meshes.js','src/ship-catalog.js', 'src/ship-hulls.js', 'src/ship-assets.js', 'src/ship-render.js', 'experiments/ship-packs.js','src/flight-collision.js', 'src/flight-combat.js', 'src/flight-mission-runtime.js', 'src/flight-opponent.js', 'src/flight-blockout.js', 'src/flight-sim.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
const DW=context.window.Driftworks,api=DW.flightSim,player=DW.arcade.create(125),t=api.create('ohio');
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

// Camera motion may turn ribbon width, but never move or bend its axial endpoints.
{
 const pose={eye:[17,8,12],right:[1,0,0],back:[0,-1,0],up:[0,0,1],velocity:[0,0,0],throttle:1};
 const norm=v=>v.map(x=>x/Math.hypot(...v)),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 for(const mounts of [undefined,[[3,-10,2,1.8]]]){
  let reference;
  for(const eye of [[0,0,0],[80,-20,50],[17,-80,12],[17,80,12],[17.3,-80,12.2]])for(const back of [[0,-1,0],norm([.7,-.3,.6]),norm([-.4,.6,-.7])])for(const roll of [0,.73]){
   const r=norm(cross([0,0,1],back)),u=cross(back,r),right=r.map((x,i)=>x*Math.cos(roll)+u[i]*Math.sin(roll)),up=u.map((x,i)=>x*Math.cos(roll)-r[i]*Math.sin(roll)),view={eye,right,up,back};
   const v=DW.shipRender.engineGeometry([{index:0,hp:1,pose}],'',1,10,view,0,mounts).vertices;
   const point=i=>Array.from(v.slice((6+i)*6,(6+i)*6+3));
   const mid=(a,b)=>a.map((x,i)=>(x+b[i])/2),start=mid(point(0),point(1)),end=mid(point(2),point(5));
   const axis=end.map((x,i)=>x-start[i]);
   assert(Math.hypot(...cross(axis,pose.back))<1e-5,'exhaust stays parallel to ship under pitch/yaw/roll/translation');
   const endpoints=[...start,...end];
   if(reference)endpoints.forEach((x,i)=>assert(Math.abs(x-reference[i])<1e-5,'camera-independent flame endpoints'));
   reference=endpoints;assert(v.every(Number.isFinite));
  }
 }
 console.log('PASS exhaust axis: fixed ship-space endpoints through off-axis camera translation, pitch, yaw and roll for fighter and capital mounts');
}
