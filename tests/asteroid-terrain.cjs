'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const hash = value => crypto.createHash('sha256').update(ArrayBuffer.isView(value)
  ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : JSON.stringify(value)).digest('hex');

// No document, WebGL, Three, Pixi or scene controller in this runtime.
const context = vm.createContext({console});
context.window = context;
for (const file of require('../tools/script-manifest.cjs').files('terrain')) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
}
const DW = context.Driftworks;
assert.equal(DW.scene3d, undefined, 'CPU terrain does not load a scene controller');
const api = DW.asteroidTerrain;
const results = {};
for (const seed of [29, 503]) {
  const asteroid = DW.sim.createInitialWorld(seed).asteroids[0];
  for (const excavated of [false, true]) {
    if (excavated) asteroid.excavation = {level: 1, depthM: 150, pocketRadius: .2,
      tunnelAngle: .4, tunnelTurn: .2, pocketOffset: {x: .1, y: -.1}};
    const saved = JSON.stringify(asteroid);
    const fields = [[0, 0, 0], [.9, .1, .2], [-.6, .2, -.3]].map(p =>
      [api.rockField(asteroid, p), api.rockField(asteroid, p, false)]);
    const frames = [[1, 0, 0], [0, 0, -1], [.4, .6, .2]].map(d => api.surfaceFrame(asteroid, d));
    const mesh = api.asteroidMesh(asteroid, 14, false);
    assert.ok(mesh.length && Array.from(mesh).every(Number.isFinite));
    results[seed + '/' + excavated] = {fields: hash(fields), frames: hash(frames),
      mesh: hash(mesh), cutaway: hash(api.asteroidMesh(asteroid, 14)),
      impacts: hash(api.impactBytes(asteroid))};
    assert.equal(JSON.stringify(asteroid), saved, 'Terrain queries preserve persistent state');
  }
  const original = api.visualFor(asteroid);
  const changed = api.setStudyParameters(asteroid, {roughness: .5, craterDepth: .7});
  assert.notEqual(original, changed);
  results[seed + '/study'] = hash(api.asteroidMesh(asteroid, 14, false));
  assert.equal(api.visualFor(asteroid), changed, 'Study invalidation retains the new visual');
}
// Release invalidates only the requested asteroid, including study overrides.
const world = DW.sim.createInitialWorld(29), asteroid = world.asteroids[0];
const other = Object.assign({}, asteroid, {id: 'retained-terrain'});
const retained = api.visualFor(other), visual = api.visualFor(asteroid), impacts = api.impactsFor(asteroid);
api.release(asteroid.id);
assert.notEqual(api.visualFor(asteroid), visual);
assert.notEqual(api.impactsFor(asteroid), impacts);
assert.equal(api.visualFor(other), retained);
const fixture = path.join(__dirname, 'fixtures/asteroid-terrain.json');
assert.deepEqual(results, JSON.parse(fs.readFileSync(fixture, 'utf8')));
// Compatibility loading must reuse the same CPU functions and cache owner.
vm.runInContext(fs.readFileSync(path.join(root, 'src/scene3d.js'), 'utf8'), context, {filename: 'src/scene3d.js'});
for (const name of ['rockField', 'surfaceFrame', 'asteroidMesh', 'visualFor',
  'setStudyParameters', 'platformSurface', 'platformSurfaceGeometry', 'platformSurfacePose']) {
  assert.equal(DW.scene3d[name], api[name], 'Preserve scene3d alias ' + name);
}
console.log('PASS CPU asteroid terrain: original fields, frames, mesh bytes, excavation, study invalidation and renderer-free loading');
