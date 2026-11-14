'use strict';
const assert=require('node:assert/strict'),{createFlight}=require('../tools/headless.cjs');
function fixture(mission='convoy',mode='grid-events',model='container'){
 const flight=createFlight({mission,seed:29,convoyBattlefield:false}),D=flight.DW,c=flight.snapshot().combat,U=D.sim.METERS_PER_UNIT;
 D.flightCollision.setMode(c,mode);c.enemies=[];const ship=c.convoy.ships.find(s=>s.model===model);c.convoy.ships.forEach(s=>{if(s!==ship)s.hull=0;});ship.position=[0,0,0];ship.forward=[0,1,0];c.player.pose.eye=[-200/U,-200/U,0];
 const craft=D.convoyMission.targets(c).find(s=>s.id===ship.id),catalog=D.freighterSim.catalog(model),def=catalog.defs.filter(d=>d.type===(model==='fluid'?'tank':'container')&&d.center[0]>0&&d.center[2]>=0).sort((a,b)=>b.center[0]-a.center[0])[0],index=catalog.defs.indexOf(def);
 const from=[30,def.center[1],def.center[2]].map(v=>v/U),to=[-30,def.center[1],def.center[2]].map(v=>v/U),weapon={...D.retailWeapons[0],damage:model==='fluid'?100:35,armorFactor:1,headRadius:.05};
 const shoot=()=>D.flightCombat.trace(c,from,to,{age:0,position:from.slice(),direction:[-1,0,0],weapon},'player',undefined,c.player.pose);
 return {flight,D,c,U,ship,craft,catalog,index,def,from,to,weapon,shoot};
}
for(const mission of ['convoy','fleet-evacuation'])for(const mode of ['legacy','grid-events','tree-events']){
 const {flight,D,c,U,ship,catalog,index,from,to,shoot}=fixture(mission,mode),module=ship.modules.modules[index],initial=ship.hull;
 assert.equal(catalog.owners.length,catalog.base.vertices.length/18);assert.equal(ship.modules.modules.length,33);
 for(const def of catalog.defs.filter(d=>d.type==='engine')){const mouth=catalog.mouths[def.engineIndex];assert(Math.hypot(def.center[0]-mouth[0],def.center[2]-mouth[2])<1,'Engine component owns the matching physical exhaust mouth');}
 const first=shoot();assert(first);assert.equal(module.health,65);assert.equal(module.marks.length,1);assert.equal(ship.hull,initial-35);
 shoot();assert.equal(module.health,30);const damaged=D.freighterSim.part(ship,index);assert(damaged.added<=400);assert(damaged.model.vertices.every(Number.isFinite));
 shoot();assert.equal(module.health,0);assert(module.debris);assert.equal(c.wrecks.length,0,'Modules do not become fighter casualties');assert.equal(ship.hull,initial-105);
 const beyond=D.freighterSim.hitCraft(D.convoyMission.targets(c).find(s=>s.id===ship.id),from,to,U,.05);assert(!beyond||beyond.point[0]<first[0]-.3/U,'Detached geometry leaves production weapon collision');
 const encoded=JSON.stringify(ship);assert(!encoded.includes('vertices')&&!encoded.includes('texture'),'Entity state excludes meshes and browser resources');const loaded=JSON.parse(encoded),state=D.freighterSim.ensure(loaded);assert.equal(state.modules[index].health,0);assert.equal(D.freighterSim.ensure(loaded),state,'Repeated normalization keeps state identity');
 delete loaded.modules;assert(D.freighterSim.ensure(loaded).modules.every(m=>m.health===m.maxHealth),'Old freighters gain healthy default modules');
 flight.advance(.15,{stop:true});assert(module.debris.pose.velocity.every(Number.isFinite));assert(module.debris.pose.eye.every(Number.isFinite));
 flight.reset();assert(flight.snapshot().combat.convoy.ships.every(s=>s.modules.modules.every(m=>m.health===m.maxHealth&&!m.debris&&m.marks.length===0)),'Sortie reset clears module damage');
}
{
 const {D,ship,index,shoot,c}=fixture('convoy','grid-events','fluid');shoot();const module=ship.modules.modules[index];assert.equal(module.health,80);assert.equal(module.leaks.length,1);assert(module.leaks[0].normal.every(Number.isFinite));shoot();assert.equal(module.health,0);assert(module.debris);D.freighterSim.step(c,.1);assert(module.leaks[0].age>0);
}
{
 const {flight,D,c,U}=fixture();for(const ship of c.convoy.ships){ship.hull=5000;const def=D.freighterSim.catalog(ship.model).defs[0],axes=D.fleetGuidance.frame(ship.forward||[0,1,0]),point=ship.position.map((v,k)=>v+(axes.right[k]*def.center[0]-axes.back[k]*def.center[1]+axes.up[k]*def.center[2])/U);D.convoyMission.damage(c,ship.id,{damage:1000,armorFactor:1},point);}
 D.freighterSim.step(c,1/120);const loose=c.convoy.ships.flatMap(s=>s.modules.modules.filter(m=>m.debris));assert.equal(loose.length,12,'Global debris budget covers the entire convoy');
 loose.forEach(m=>{m.debris.age=18.01;});D.freighterSim.step(c,1/120);assert.equal(c.convoy.ships.flatMap(s=>s.modules.modules.filter(m=>m.debris)).length,0,'Expired pieces are retired without healing their modules');flight.reset();
}
console.log('PASS mission freighters: authored ownership, projectile damage, module detachment/ghost removal, low-poly deformation, punctures, JSON repair/reset, global debris budget and expiry in both convoy missions');
