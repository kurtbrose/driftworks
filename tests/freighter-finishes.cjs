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
  const block=new T.Group();root.children.filter(o=>o.name==='exchangeable cargo cassette').forEach(o=>block.add(o.clone()));
  assert(size(block).z<size(legacy).z*.85,'remove vacant lane space in the cargo block');
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
// Attachment checks use actual transformed geometry, not only socket labels.
for(const name of ['container','mixed','fluid']){
 const root=kit.buildFreighter(name);root.updateWorldMatrix(true,true);const end=root.userData.payloadEnd;
 const drives=root.children.filter(o=>o.name==='drive module');
 for(const wing of root.children.filter(o=>o.name==='drive radiator'))for(const drive of drives)assert(!bounds(wing).intersectsBox(bounds(drive)),'radiators clear drive housings and vents');
 const service=root.children.find(o=>o.userData.part==='service'&&Math.abs(o.position.x-end-4)<1e-6);
 for(const support of root.children.filter(o=>o.name==='radiator support'))assert(bounds(service.getObjectByName('service panel')).containsPoint(new T.Vector3(...support.userData.attachment.start)),'radiator booms start in solid service housing');
 for(const rail of root.children.filter(o=>o.name==='seated coupling rail'))assert(Math.hypot(Math.abs(rail.position.y)-.09,Math.abs(rail.position.z)-.09)<rail.userData.shaftRadius,'reinforcement rails intersect their coupling shaft');
 const cassettes=root.children.filter(o=>o.name==='exchangeable cargo cassette');
 for(const cassette of cassettes){
  const web=cassette.children.find(o=>o.isMesh&&o.name!=='cassette corner lock'),cargo=cassette.children.filter(o=>o.userData.part==='cargo');
  for(const lock of cassette.children.filter(o=>o.name==='cassette corner lock')){assert(bounds(lock).intersectsBox(bounds(web)),'corner locks contact the shear web');assert(cargo.some(o=>bounds(lock).intersectsBox(bounds(o))),'corner locks reach container fittings');}
 }
 const cargo=cassettes.flatMap(c=>c.children.filter(o=>o.userData.part==='cargo'));
 for(const mount of root.children.filter(o=>o.name==='RCS mounting assembly')){
  const pod=mount.getObjectByName('rcs');const outrigger=mount.getObjectByName('RCS outrigger');if(outrigger){assert(bounds(outrigger).intersectsBox(bounds(pod)),'outrigger meets pod housing');if(mount.userData.mountKind==='cargo')assert(cassettes.some(c=>bounds(outrigger).intersectsBox(bounds(c.children.find(o=>o.isMesh&&o.name!=='cassette corner lock')))),'outrigger meets cargo web');else assert(root.children.filter(o=>o.userData.part==='service'&&Math.abs(o.position.x-end-1)<1e-6).some(o=>bounds(outrigger).intersectsBox(bounds(o))),'outrigger meets pump housing');}for(const box of cargo)assert(!bounds(pod).intersectsBox(bounds(box)),'RCS jets and housings clear cargo');
  const axis=new T.Vector3(0,0,1).applyQuaternion(pod.quaternion);assert(axis.z*Math.sign(mount.position.z)>0,'lateral RCS nozzles face outboard');
 }
 if(name==='fluid'){
  const vessels=root.children.filter(o=>o.userData.capacityShell);
  for(const mount of root.children.filter(o=>o.name==='RCS mounting assembly'))mount.traverse(o=>{
   if(!o.isMesh)return;const p=o.geometry.attributes.position;
   for(let i=0;i<p.count;i++){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);for(const tank of vessels){const dx=Math.abs(v.x-tank.position.x);if(dx>=12)continue;const radius=dx<=8?5.5:5.5*Math.sqrt(1-((dx-8)/4)**2);assert(Math.hypot(v.y,v.z-tank.position.z)>=radius-1e-4,'tanker RCS clears the actual domed vessel');}}
  });
  const branches=root.children.filter(o=>o.name==='tank transfer branch');assert.equal(branches.length,4);
  for(const branch of branches){
   const wheel=branch.getObjectByName('valve handwheel'),stem=branch.getObjectByName('valve stem'),valve=branch.getObjectByName('transfer isolation valve');
   const axis=new T.Vector3(0,0,1).applyQuaternion(wheel.quaternion);assert(Math.abs(axis.y)>.999,'handwheel axis follows its vertical stem');
   assert.equal(wheel.position.x,stem.position.x);assert.equal(wheel.position.z,stem.position.z);assert.equal(valve.position.z,stem.position.z);
   assert(stem.position.y+stem.geometry.parameters.height/2>=wheel.position.y-1e-6,'stem reaches handwheel');
   assert.equal(branch.children.filter(o=>o.name==='handwheel spoke').length,3,'rim connects to hub');
   assert(wheel.position.y-wheel.geometry.parameters.tube>.92,'handwheel clears shared manifold');
   const outlet=branch.getObjectByName('tank outlet penetration');assert(Math.abs(outlet.position.z)+outlet.geometry.parameters.height/2>.7,'outlet penetrates tank shell');
   assert(branch.getObjectByName('transfer riser'));assert(branch.getObjectByName('manifold branch connection'));
  }
  const shield=root.getObjectByName('valve impact shield'),pumps=root.children.filter(o=>o.userData.part==='service'&&Math.abs(o.position.x-end-1)<1e-6);
  assert(pumps.every(p=>bounds(p).max.y<bounds(shield).min.y),'shield clears pump hatches and handles');
  const allService=root.children.filter(o=>o.userData.part==='service');
  for(const mount of root.children.filter(o=>o.name==='RCS mounting assembly'))for(const pump of allService)assert(!bounds(mount.getObjectByName('rcs')).intersectsBox(bounds(pump)),'tanker RCS housings and nozzles clear pump packages');
  const collars=root.children.filter(o=>o.name==='transfer port collar');assert.equal(collars.length,2);
  for(const port of collars){assert(Math.abs(port.position.z)+port.geometry.parameters.height/2>3.05,'transfer ports protrude beyond pump housings');for(const pump of pumps)pump.traverse(o=>{if(o.name==='vent panel')assert(!bounds(port).intersectsBox(bounds(o)),'transfer ports clear ventilation grilles');});}
  const posts=root.children.filter(o=>o.name==='shield standoff');assert.equal(posts.length,4);for(const post of posts)assert(bounds(post).intersectsBox(bounds(shield)),'shield standoffs meet plate');
 }
}
// Hardware shells and trim address the dedicated padded sheet, not full cargo art.
for(const root of [kit.part('engine'),kit.buildFreighter('container')])root.traverse(o=>{
 if(!o.userData.hardwareFinish)return;
 const uv=o.geometry.attributes.uv;
 for(let i=0;i<uv.count;i++){
  const px=uv.getX(i)*2048-1024,py=(1-uv.getY(i))*2048-1536;
  assert(px>=15.99&&px<=496.01&&py>=15.99&&py<=496.01,'hardware UVs remain inside padded tile 14');
  if(o.userData.hardwareFinish==='shell')assert(px<=272.01&&py<=240.01,'shell faces and chamfers sample quiet paint only');
 }
});
// Keep incidental curved hardware modest while retaining the bell silhouette.
const engine=kit.part('engine');let engineTriangles=0;
engine.traverse(o=>{
 if(!o.isMesh)return;
 engineTriangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;
 if(o.geometry.type==='TorusGeometry'){
  const n=o.geometry.attributes.normal,last=o.geometry.parameters.tubularSegments;
  assert(Math.hypot(n.getX(0)-n.getX(last),n.getY(0)-n.getY(last),n.getZ(0)-n.getZ(last))<1e-5,'smooth ring normal seam');
 }
});
assert(engineTriangles<=2000,'engine hardware triangle budget');
assert.equal(engine.getObjectByName('recessed engine bell').geometry.parameters.segments,32,'retain the visible bell outline');
// Small functional details stay readable without extra material submissions.
assert(engine.getObjectByName('engineId identification'));
assert(engine.getObjectByName('engine bell inner liner').material.color.getHex()<engine.getObjectByName('recessed engine bell').material.color.getHex(),'darker internal liner');
const command=kit.buildFreighter('container').getObjectByName('freight command module');
assert(command.getObjectByName('commandId identification'));
const bay=command.getObjectByName('freight observation bay');assert(bay);
const windows=bay.children.filter(o=>o.userData.observationWindow);assert.equal(windows.length,8,'V windscreen, sides and four planar overhead facets');
command.updateWorldMatrix(true,true);assert(new T.Box3().setFromObject(bay,true).min.x< -18.9,'observation bay projects ahead of the pressure housing in ship metres');
const forward=windows.filter(o=>o.name.startsWith('forward canopy '));assert.equal(forward.length,2);
assert(forward[0].geometry.attributes.normal.getZ(0)*forward[1].geometry.attributes.normal.getZ(0)<0,'windscreen facets meet in a V');
for(const pane of forward){
 const p=pane.geometry.attributes.position,x=Array.from({length:p.count},(_,i)=>p.getX(i));
 assert(Math.max(...x)-Math.min(...x)>.3,'front panes sweep back from the prow ridge');
}
assert.equal(bay.userData.prow,'faceted wedge');
assert.equal(command.children.filter(o=>o.name==='cylinder / glass').length,0,'replace the small portholes');
for(const pane of windows){
 const p=pane.geometry.attributes.position,n=pane.geometry.attributes.normal;
 const origin=new T.Vector3().fromBufferAttribute(p,0),normal=new T.Vector3().fromBufferAttribute(n,0);
 for(let j=0;j<p.count;j++)assert(Math.abs(new T.Vector3().fromBufferAttribute(p,j).sub(origin).dot(normal))<1e-5,'each glazing panel remains planar');
 for(let i=0;i<p.count;i+=3){const a=new T.Vector3().fromBufferAttribute(p,i),b=new T.Vector3().fromBufferAttribute(p,i+1),c=new T.Vector3().fromBufferAttribute(p,i+2);assert(b.sub(a).cross(c.sub(a)).dot(new T.Vector3().fromBufferAttribute(n,i))>0,'canopy triangle winding follows outward normals');}
}
assert.equal(kit.batchStatic(command).children.length,5,'canopy reuses existing command materials');
assert.equal(kit.batchStatic(engine).children.length,5,'polish reuses existing engine material batches');
// Production bake keeps source-authored mouths in the flight coordinate convention.
const meta=require('../assets/ships/industrial-kit/convoy-flight.json');
assert.equal(meta.sourceSha256,require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync('assets/ships/industrial-kit/kit.js')).digest('hex'),'flight bake matches its editable source');
for(const name of ['container','mixed','fluid'])assert.deepEqual(meta.variants[name].engineMouths,JSON.parse(JSON.stringify(kit.buildFreighter(name).userData.engineMouths)));
console.log('Freighter packaging: full-size cargo, tight pitch, four uncaged tanks, shared batches and authored exhaust anchors pass.');
