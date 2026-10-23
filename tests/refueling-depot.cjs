'use strict';
// Offline asset contract: catches incomplete exports and broken articulation data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/depots/refueling-v1/depot.json'), 'utf8'));
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
  if(batch.material==='caution-paint'){
    assert.equal(batch.uvs.length,batch.positions.length/3*2);
    assert(batch.uvs.every(Number.isFinite));
    assert.equal(data.textures[batch.material],'caution-paint.png');
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
