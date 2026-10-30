'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
let mode;
function setup(reference=false){
 const DW={sim:{METERS_PER_UNIT:1}};let lookups=0,hulls=0;
 class CountMap extends Map{get(key){if(typeof key==='string')lookups++;return super.get(key);}}
 const context=vm.createContext({window:{Driftworks:DW},Map:CountMap});
 for(const file of ['experiments/retail-profiles.js','experiments/flight-model.js','experiments/retail-weapons.js','experiments/guns.js','experiments/flight-missions.js','experiments/mission-ohio.js','src/flight-collision.js','src/flight-combat.js','src/flight-sim.js','assets/ships/quaternius-ultimate-spaceships/meshes.js','experiments/ship-packs.js']){
  let source=fs.readFileSync(path.join(root,file),'utf8');
  if(reference&&file==='src/flight-combat.js'){
   const start=source.indexOf('    function trace('),end=source.indexOf('    DW.flightCombat =',start);
   source=source.slice(0,start)+fs.readFileSync(path.join(__dirname,'fixtures/training-trace-reference.txt'),'utf8').replace('bindPlayer(t, player);','t.player.pose = player;').replaceAll('participants(t)','[t.player].concat(t.enemies)')+source.slice(end);
  }
  vm.runInContext(source,context,{filename:file});
 }
 const original=DW.shipPackModels.hullHit;DW.shipPackModels.hullHit=(...args)=>{hulls++;return original(...args);};
 const player=DW.arcade.create(0);player.eye=[0,-500,0];const combat=DW.flightSim.create('training');DW.flightSim.bindPlayer(combat,player);
 if(!reference)DW.flightSim.setCollisionMode(combat,mode);
 const add=(id,point,radius=9)=>{const pose=DW.arcade.create(0);pose.eye=point;const craft=DW.flightSim.createCraft(id,pose,'enemy');craft.hp=craft.maxHp=1e9;craft.shield=0;craft.collision={kind:'sphere',radiusM:radius};combat.enemies.push(craft);return craft;};
 const bolt={position:[0,0,0],direction:[1,0,0],age:0,weapon:{...DW.retailWeapons[0],headRadius:.9}};
 return {DW,combat,player,add,bolt,counts:()=>({lookups,hulls}),trace:(a,b,terrain)=>DW.flightSim.trace(combat,a,b,bolt,'player',terrain,player,.25)};
}
for(mode of ['legacy','grid','tree','grid-events','tree-events']){
const optimized=setup(),reference=setup(true);
let seed=810;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<96;i++){
 const point=[random()*4000-2000,random()*4000-2000,random()*4000-2000];
 for(const f of [optimized,reference]){const e=f.add('craft-'+i,point.slice(),i===0?500:9);if(i%7===0)e.collision={kind:'model',modelId:'quaternius-ultimate-spaceships:Spitfire'};if(i%5===0)e.team='ally';}
}
for(let step=0;step<240;step++){
 const target=step%96,start=optimized.combat.enemies[target].pose.eye.map((v,k)=>v+(k===0?-50:0));
 const end=start.map((v,k)=>v+(k===0?100:random()*40-20));
 const terrain=step%11===0?(a,b)=>a.map((v,k)=>v+(b[k]-v)*.2):undefined;
 for(const f of [optimized,reference]){
  f.combat.time=step/120;const e=f.combat.enemies[(target+1)%96];e.pose.eye=e.pose.eye.map((v,k)=>v+(k===1?30:0));
  if(step===70)f.add('spawn',[0,0,0]);
  if(step===100)f.combat.enemies[0].collision={kind:'sphere',radiusM:600};
  if(step===120)f.combat.enemies[1].team='ally';
  if(step===140)f.combat.enemies[2].hp=0;
 }
 const a=optimized.trace(start,end,terrain),b=reference.trace(start,end,terrain);
 assert.equal(JSON.stringify(a),JSON.stringify(b),'hit position '+step);
 assert.equal(JSON.stringify(optimized.combat.enemies),JSON.stringify(reference.combat.enemies),'damage, marks and near misses '+step);
 assert.equal(JSON.stringify(optimized.combat.radioEvents),JSON.stringify(reference.combat.radioEvents),'events '+step);
}
assert.ok(optimized.counts().hulls<reference.counts().hulls/8,'broad phase rejects remote model hulls');
const sleep=setup();const target=sleep.add('distant',[1000,0,0]);
for(let i=0;i<32;i++)sleep.add('remote-'+i,[5000+i*500,5000,5000]);
sleep.trace([0,0,0],[1,0,0]);const first=sleep.DW.flightSim.collisionStats(sleep.combat);
sleep.trace([1,0,0],[2,0,0]);if(mode.endsWith('-events')){const next=sleep.DW.flightSim.collisionStats(sleep.combat);assert.equal(next.queries,first.queries,'sleep skips spatial queries');assert.equal(next.reuses,first.reuses+1);}
target.pose.eye=[10,0,0];assert.ok(sleep.trace([2,0,0],[3,0,0]),'teleport wakes sleeping shot immediately, within same simulation time');
const spawn=setup();spawn.trace([0,0,0],[1,0,0]);spawn.add('new',[10,0,0]);assert.ok(spawn.trace([1,0,0],[2,0,0]),'spawn invalidates clearance');
const advancing=[setup(),setup(true)];for(const f of advancing)f.add('closing',[400,0,0]);
for(let tick=0;tick<100;tick++){
 for(const f of advancing){f.combat.time=tick/120;f.combat.enemies[0].pose.eye[0]=400-tick*2;}
 const hits=advancing.map(f=>f.trace([tick*3,0,0],[tick*3+3,0,0]));
 assert.equal(JSON.stringify(hits[0]),JSON.stringify(hits[1]),'travel and cumulative target movement wake before contact '+tick);
 assert.equal(JSON.stringify(advancing[0].combat.radioEvents),JSON.stringify(advancing[1].combat.radioEvents),'sleep preserves near-miss event timing '+tick);
}
for(const f of advancing){f.combat.enemies=[];f.combat.time=0;f.trace([-1e6,-1e6,-1e6],[1e6,1e6,1e6]);f.add('reset',[0,0,0],500);}
assert.equal(JSON.stringify(advancing[0].trace([-1000,0,0],[1000,0,0])),JSON.stringify(advancing[1].trace([-1000,0,0],[1000,0,0])),'removal, clock reset and oversized replacement');
const near=setup();near.combat.time=10;near.add('near',[10,20,0]);near.trace([0,0,0],[20,0,0]);assert.equal(near.combat.enemies[0].nearMissAt,10,'near passes are retained outside hull bounds');
const expiry=setup();expiry.add('last',[.5,0,0],.1);const guns=expiry.DW.flightGuns.create();guns.bolts.push({...expiry.bolt,age:expiry.bolt.weapon.lifetime-.001});
expiry.DW.flightGuns.step(guns,expiry.player,expiry.bolt.weapon,false,.01,(a,b)=>expiry.trace(a,b));assert.equal(guns.hits,1,'final lifetime segment is checked');
console.log('PASS projectile broad phase ('+mode+'): 240 exhaustive-reference comparisons; movement, large hulls, teams, spawns, hull swaps, deaths, terrain, marks, near misses, safe sleep and final lifetime segment');

}
