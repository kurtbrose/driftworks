'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createFlight}=require('../tools/headless.cjs');
const flight=createFlight({mission:'furball',seed:29});
const DW=flight.DW,api=DW.shipPackModels;
const pack=DW.shipPacks.find(p=>p.id==='concept-trio');
assert.equal(pack.models.length,3);
assert(!pack.missionOnly && !pack.license.includes('CC0'));
const seen=new Set();
for(let wave=1;wave<=3;wave++)for(let i=0;i<16;i++)seen.add(api.mixedModel(i,wave).id);
for(const model of pack.models){
  assert(seen.has(model.id),'concept ship participates in the normal mixed rotation');
  assert.equal(model.vertices.length,model.triangles*18);
  assert.equal(model.texturedVertices.length,model.triangles*24);
  let radius=0;
  for(let i=0;i<model.texturedVertices.length;i+=8){
    const v=model.texturedVertices;
    assert(v.slice(i,i+8).every(Number.isFinite));
    radius=Math.max(radius,Math.hypot(v[i],v[i+1],v[i+2]));
    assert(v[i+6]>0 && v[i+6]<1 && v[i+7]>0 && v[i+7]<1);
  }
  assert(Math.abs(radius-8.5)<1e-5,'matches the placeholder comparison scale');
  const png=fs.readFileSync(path.join(__dirname,'../assets/ships/concept-trio',model.texture));
  assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),512);
  assert.equal(api.gunAnchors(model).length,model.name.includes('Halo')?1:2);
  assert.equal(api.engineAnchors(model).length,2);
  const pose={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]};
  const a=api.sourceDraw(model,pose,10),b=api.sourceDraw(model,pose,10);
  assert(a.staticGeometry && a.vertices===b.vertices,'flight reuses immutable buffers');
  assert(api.hullHit(model,pose,[0,0,2],[0,0,-2],10,.01),'concept hull supports actual mesh collision');
}
flight.advance(.1,{stop:true});
const craft=flight.snapshot().combat.enemies;
assert.equal(craft.length,16);
const spawned=new Set(craft.map(c=>api.craftModel(c,'mixed',1).id));
for(const model of pack.models)assert(spawned.has(model.id),'production furball assigns each concept model');
console.log('PASS concept flight: rotation, production spawns, normalized meshes, textures, attachments, collision and static draw buffers');
