'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const asset=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/ships/evacuation-shuttle-v1/shuttle.json'),'utf8'));
assert.equal(asset.units,'metres');assert.equal(asset.forward,'+Y');assert.equal(asset.up,'+Z');
const bounds=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];
for(const batch of asset.batches){
 assert.equal(batch.positions.length,batch.normals.length);
 assert.equal(batch.positions.length%9,0);
 assert(batch.positions.every(Number.isFinite));assert(batch.normals.every(Number.isFinite));
 for(let i=0;i<batch.positions.length;i+=3)for(let k=0;k<3;k++){
  bounds[k][0]=Math.min(bounds[k][0],batch.positions[i+k]);bounds[k][1]=Math.max(bounds[k][1],batch.positions[i+k]);
 }
}
assert(Math.abs(bounds[1][1]-bounds[1][0]-60)<.02);
assert(bounds[0][1]-bounds[0][0]>24);
assert(bounds[0][1]-bounds[0][0]<26);
assert(asset.anchors.refuel[2]>8);
assert.deepEqual(asset.anchors.refuelNormal,[0,0,1]);
assert.equal(asset.anchors.engines.length,2);
assert(asset.anchors.engines.every(p=>p[1]<-18));
assert.equal(asset.sourceParts.filter(name=>name.startsWith('Cabin window')).length,24);
assert(!asset.sourceParts.some(name=>/tail|Engine shoulder|Wingtip/.test(name)));
assert(asset.batches.some(batch=>batch.material==='stripe'));
// Cabin glazing must face outward on both sides, rather than disappearing
// behind back-face culling while still passing finite-mesh checks.
let cabinVertices=0;
for(const batch of asset.batches.filter(batch=>batch.material==='glass')){
 for(let i=0;i<batch.positions.length;i+=3){
  const [x,y,z]=batch.positions.slice(i,i+3);
  if(Math.abs(y)<19&&Math.abs(x)>6){
   assert(x*batch.normals[i]+z*batch.normals[i+2]>0);
   cabinVertices++;
  }
 }
}
assert(cabinVertices>100);
console.log('Evacuation transport: 60 m broad hull, shaped glazing, finite meshes and service anchors passed.');
