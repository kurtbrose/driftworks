'use strict';
const assert=require('node:assert/strict');
const {kit,THREE:T}=require('../tools/export-industrial-kit.cjs').loadKit();
const bounds=o=>new T.Box3().setFromObject(o,true),size=o=>bounds(o).getSize(new T.Vector3());
for(const name of ['container','mixed','fluid']){
 const root=kit.buildFreighter(name),legacy=kit.buildFreighter(name,{packaging:'frame'}),batch=kit.batchStatic(root);
 assert(bounds(root).min.distanceTo(bounds(batch).min)+bounds(root).max.distanceTo(bounds(batch).max)<1e-5);
 assert(batch.children.length<=9,'shared material batches');
 assert.equal(root.userData.packaging,'compact');
 const command=root.getObjectByName('freight command module');assert(command);
 assert.equal(command.userData.designFamily,'industrial drive cassette');
 assert(!root.getObjectByName('rounded crew pressure shell'),'command uses faceted drive-family housing');
 assert.equal(root.userData.payloadCount,name==='container'?24:name==='mixed'?8:4);
 assert(!root.children.some(o=>o.userData.standardBay),'no oversized standard cage in purpose-built freighters');
 const drives=[];root.traverse(o=>{if(o.name==='drive module')drives.push(o);});assert.equal(drives.length,4);
 assert.equal(root.userData.engineMouths.length,4);
 for(const mouth of root.userData.engineMouths)assert.equal(mouth[1],-root.userData.payloadEnd-11.4,'exhaust follows new physical length');
 assert(size(root).x<size(legacy).x,'reduce vacant longitudinal space without shrinking payloads');
 if(name==='container'){
  assert(size(root).z<size(legacy).z*.85,'remove the vacant lane gap');
  const boxes=[];root.traverse(o=>{if(o.userData.part==='cargo')boxes.push(o);});assert.equal(boxes.length,24);
  const first=boxes[0],original=kit.part('cargo');assert(size(first).distanceTo(size(original))<1e-5,'container dimensions unchanged');
  assert.equal(root.userData.containerPitch,10.6);
 }
 if(name==='fluid'){
  const tanks=root.children.filter(o=>o.userData.capacityShell);assert.equal(tanks.length,4);
  for(const t of tanks){assert.equal(t.userData.capacityShell.length,24);assert.equal(t.userData.capacityShell.diameter,11);assert.equal(t.getObjectByName('domed bulk-fluid vessel').scale.x,1);}
  assert(root.getObjectByName('common transfer manifold'));assert(root.getObjectByName('valve impact shield'));
 }
}
// Production bake keeps source-authored mouths in the flight coordinate convention.
const meta=require('../assets/ships/industrial-kit/convoy-flight.json');
assert.equal(meta.sourceSha256,require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync('assets/ships/industrial-kit/kit.js')).digest('hex'),'flight bake matches its editable source');
for(const name of ['container','mixed','fluid'])assert.deepEqual(meta.variants[name].engineMouths,JSON.parse(JSON.stringify(kit.buildFreighter(name).userData.engineMouths)));
console.log('Freighter packaging: full-size cargo, tight pitch, four uncaged tanks, shared batches and authored exhaust anchors pass.');
