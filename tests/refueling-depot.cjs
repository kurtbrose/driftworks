'use strict';
// Offline asset contract: catches incomplete exports and broken articulation data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const data = require('./depot-asset.cjs');
const paintPng=fs.readFileSync(path.join(__dirname,'../assets/depots/refueling-v1/caution-paint.png'));
assert.equal(paintPng.subarray(1,4).toString(),'PNG');
assert.equal(paintPng.readUInt32BE(16),512);
assert.equal(paintPng.readUInt32BE(20),64);
const armContext = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../experiments/depot-arm.js'), 'utf8').replace('export function', 'function'), armContext);
for (let reach = 24; reach <= 58; reach += 2) for (let height = -32; height <= 12; height += 2) {
  for (const yaw of [-.6,0,.6]) {
    const pose = armContext.solveDepotArm(reach,height,yaw,-.6);
    const length = v=>Math.hypot(...v);
    assert(Math.abs(length(pose.elbow)-32)<1e-8);
    assert(Math.abs(length(pose.wrist.map((v,i)=>v-pose.elbow[i]))-32)<1e-8);
    assert(Math.abs(length(pose.aim)-1)<1e-8);
    assert(pose.wrist.every(Number.isFinite));
    if (!pose.clamped) assert(Math.abs(length(pose.wrist)-Math.hypot(reach,height))<1e-8);
  }
}
assert(armContext.solveDepotArm(100,0,0,0).clamped);
console.log('Depot arm reach solver: fixed links, reachable targets and bounded extension passed.');
assert.equal(data.units, 'metres');
assert.equal(data.up, 'Z');
assert.equal(data.tankSlots,32);
assert.equal(data.installedTanks,28);
assert.deepEqual(data.inactiveModules,['hub-112']);
assert.deepEqual(data.parkedArms,[112]);
assert(!data.batches.some(batch=>batch.group==='hub-112'&&(batch.material==='lamp'||batch.material.endsWith('-light'))));
assert(data.batches.some(batch=>batch.group==='hub-112'&&batch.material==='shell'),'Inactive hub retains the white shell');
assert(!data.batches.some(batch=>batch.group==='hub-112'&&['wear','caution-paint','safety-orange'].includes(batch.material)),'Inactivity uses dark lights without gray paint or a caution collar');
assert(!data.sourceParts.some(name=>/^hub-112\/(isolation-valve|locked-valve-handle)/.test(name)));
assert(data.batches.some(batch=>batch.group==='hub-0'&&batch.material==='lamp'));
for(const x of [-112,0,112]){
  const prefix='hub-'+x+'/',parts=data.sourceParts.filter(name=>name.startsWith(prefix)).map(name=>name.slice(prefix.length).replace(/\.\d+$/,''));
  for(const name of ['pressure-trunk','observation-skirt','window-sill','roof-cap','spine-bulkhead','spine-interface-shoe','arm-load-saddle','shoulder-clevis-cheek','lower-service-shoulder'])assert(parts.includes(name),'Manufactured hub contains '+name);
  assert.equal(parts.filter(name=>name==='window').length,8,'Eight recessed observation bays');
  for(const name of ['pressure-access-cover','sump-service-cover','roof-access-hatch','trunk-panel-seam','roof-facet-panel'])assert(!parts.includes(name),'Flush skin details do not require raised '+name+' geometry');
  assert(!parts.includes('collar'),'Remove the stacked oversized cylindrical collars');
  assert(data.batches.some(b=>b.group==='hub-'+x&&b.material==='hub-paint'&&b.uvs),'Pressure hulls retain surface-specific painted UVs');
  const hull=data.batches.find(b=>b.group==='hub-'+x&&b.material==='station-paint'),n=Math.SQRT1_2;
  let outwardSkin=0,roofVertices=0;
  for(let i=0;i<hull.positions.length/3;i++){
    const p=hull.positions.subarray(i*3,i*3+3),normal=hull.normals.subarray(i*3,i*3+3);
    const radial=((p[0]-x)-p[1])*n;
    const px=hull.uvs[i*2]*2048,py=(1-hull.uvs[i*2+1])*2048;
    if(Math.abs(radial-8.2)<.001&&p[2]>=-10&&p[2]<=9.5&&normal[0]*n-normal[1]*n>.999){
      assert(px>=1543.9&&px<=1784.1,'Each facet samples its own strip');
      assert(Math.abs(py-(40+(9.5-p[2])/19.5*690))<.003,'Body UVs continue across geometry sections without restarting a motif');outwardSkin++;
    }
    if(Math.abs(p[2]-22.25)<.001&&normal[2]>.999){
      assert(Math.abs(px-(384+(p[0]-x)*42))<.003);
      assert(Math.abs(py-(1664-p[1]*42))<.003,'Roof UVs use one affine XY projection, without trapezoid distortion');roofVertices++;
    }
  }
  assert(outwardSkin>=6&&roofVertices>=6,'Outward skin and planar roof UVs survive the bake');
}
// Geometric clearance, not just a parts-name check: even the bevelled corners
// of the clipped spine must stop outside each hub's pressure trunk.
const spineFrame=data.batches.find(b=>b.group==='spine'&&b.material==='frame');
for(let i=0;i<spineFrame.positions.length;i+=3)for(const x of [-112,0,112])assert(Math.abs(spineFrame.positions[i]-x)>=9.4,'Truss members terminate at the structural interface instead of penetrating the pressure trunk');
assert(data.sourceParts.some(name=>name.includes('/truss-splice-plate')));
assert(!data.sourceParts.some(name=>/offline-placard|offline-stencil|chevron|hazard-panel|empty-bay-warning|arm-high-visibility/.test(name)));
assert.equal(data.sourceParts.filter(name=>/\/tank-[-\d]/.test(name)).length,28);
assert.equal(data.sourceParts.filter(name=>name.includes('/isolated-feed')).length,4);
assert(!data.sourceParts.some(name=>/antenna|hose/.test(name)));
for(const fixture of ['port-lens','starboard-lens'])assert.equal(data.sourceParts.filter(name=>name.includes('/'+fixture)).length,3);
assert.equal(data.sourceParts.filter(name=>name.includes('/spine-end-clearance-lens')).length,4);
assert.equal(data.sourceParts.filter(name=>name.includes('/rack-corner-clearance-lens')).length,16);
assert(!data.sourceParts.some(name=>/rack-upper-corner|corner-marker-support|\/cradle/.test(name)));
assert.equal(data.sourceParts.filter(name=>name.includes('/isolated-branch')).length,4);
assert.equal(data.sourceParts.filter(name=>name.includes('/tank-foot')).length,56);
for(const [part,count] of [['transfer-isolation-valve',28],['bank-transfer-manifold',8],['bank-main-junction',8],['tank-row-collector',16],['transfer-pump-cassette',16],['pump-impact-shield',8],['pump-inlet',16]]){
  assert.equal(data.sourceParts.filter(name=>name.split('/')[1].replace(/\.\d+$/,'')===part).length,count,part+' is present in every bank');
}
assert(data.sourceParts.some(name=>name.includes('/coating-loss')));
assert(data.sourceParts.some(name=>name.includes('/replacement-panel')));
for(const name of ['red-light','green-light','white-light','safety-yellow','safety-orange'])assert(data.materials[name]);
const groups = new Set(data.batches.map(batch => batch.group));
assert.equal([...groups].filter(name => name.startsWith('tank-bank-')).length, 8);
assert.equal(Object.keys(data.pivots).length, 9);
for (const [name, pivot] of Object.entries(data.pivots)) {
  assert(groups.has(name));
  assert.equal(pivot.length, 3);
  assert(pivot.every(Number.isFinite));
}
let smoothTriangles = 0;
for (const batch of data.batches) {
  assert(batch.positions.length > 0 && batch.positions.length % 9 === 0);
  assert.equal(batch.positions.length, batch.normals.length);
  assert(batch.positions.every(Number.isFinite));
  assert(batch.normals.every(Number.isFinite));
  assert(data.materials[batch.material]);
  if(data.textures[batch.material]){
    assert.equal(batch.uvs.length,batch.positions.length/3*2);
    assert(batch.uvs.every(Number.isFinite));
    assert(['caution-paint.png','../../ships/industrial-kit/panels.png','hub-surfaces.png'].includes(data.textures[batch.material]));
  }
  for (let i=0;i<batch.normals.length;i+=9) {
    if (Math.hypot(...batch.normals.slice(i,i+3).map((v,k)=>v-batch.normals[i+3+k]))>.001) smoothTriangles++;
  }
  for (let i = 0; i < batch.normals.length; i += 3) {
    assert(Math.abs(Math.hypot(...batch.normals.slice(i, i + 3)) - 1) < .001);
  }
}
assert(smoothTriangles>1000, 'Rounded depot surfaces must retain interpolated corner normals');
console.log('Refueling depot mesh, modules and arm pivots passed.');
const context = {window:{Driftworks:{}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/ships/aegis-kit/reference-fighter.js'), 'utf8'), context);
const fighter = context.window.Driftworks.aegisReferenceFighter;
assert.equal(fighter.source.lengthMeters, 12);
assert.equal(fighter.source.metersPerUnit, 9);
const bounds = [[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];
for (const batch of fighter.batches) for (let i=0;i<batch.vertices.length;i+=6) {
  for (let axis=0;axis<3;axis++) {
    const value=batch.vertices[i+axis]*9;
    bounds[axis][0]=Math.min(bounds[axis][0],value);
    bounds[axis][1]=Math.max(bounds[axis][1],value);
  }
}
// The bake rotates the ship's longitudinal axis onto X; wingspan is larger.
assert(Math.abs(bounds[0][1]-bounds[0][0]-12)<.01);
console.log('Depot reference fighters retain their authored 12 m size.');
