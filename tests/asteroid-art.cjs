'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {loadRuntime} = require('../tools/headless.cjs');
const baseline = require('./fixtures/asteroid-art.json');
const root = path.join(__dirname, '..');
const hash = value => crypto.createHash('sha256')
  .update(typeof value === 'string' || ArrayBuffer.isView(value) ? value : JSON.stringify(value)).digest('hex');

// Captured from the original game.js before extraction. These protect the data
// contract during refactoring; they do not certify GPU output or visual quality.
const DW = loadRuntime();
assert.equal(DW.game, undefined, 'Headless geology must not load the Pixi game');
const art = DW.asteroidArt;
assert.equal(hash(art.shaderSource), baseline.shader, 'Shared GLSL remains byte-identical');
for (const spec of baseline.cases) {
  const asteroid = DW.sim.createInitialWorld(spec.seed).asteroids[spec.index];
  if (spec.id) asteroid.id = spec.id;
  const saved = JSON.stringify(asteroid);
  const visual = art.describe(asteroid, spec.bulk);
  assert.equal(hash(visual), spec.description, 'Preserve authored geology for ' + asteroid.id);
  assert.equal(hash(art.legacyDescribe(asteroid)), spec.legacy, 'Preserve legacy polygon data');
  assert.equal(hash(art.uniforms(visual)), spec.uniforms, 'Preserve uniform packing');
  assert.equal(hash(art.craterBytes(visual)), spec.craters, 'Preserve raw RGBA8 crater data');
  assert.equal(hash([[0, 0], [.78, 0], [-.2, .4]].map(([x, y]) => art.surfaceSample(visual, x, y))), spec.samples);
  assert.equal(JSON.stringify(asteroid), saved, 'Artwork must not mutate simulation state');
}

// Load game compatibility helpers only after proving the headless boundary.
// Browser resources are stubbed solely to capture the assembled Pixi shader.
let fragment;
const context = vm.createContext({window: null, Driftworks: DW, DRIFTWORKS_TEST_MODE: true,
  PIXI: {
    Container: class {addChild() {}},
    Geometry: class {addAttribute() {return this;} addIndex() {return this;}},
    Mesh: class {},
    Texture: {fromBuffer: () => ({baseTexture: {}})},
    Shader: {from(vertex, source) {fragment = source; return {uniforms: {}};}}
  }
});
context.window = context;
vm.runInContext(fs.readFileSync(path.join(root, 'src/game.js'), 'utf8'), context, {filename: 'src/game.js'});
assert.equal(DW.game.asteroidVisualDescription, art.describe, 'Retain the existing game helper');
assert.equal(DW.game.asteroidSurfaceSample, art.surfaceSample);
assert.equal(DW.asteroidArt, art, 'The game must not replace shared geology');
DW.game.createAsteroidGraphic();
assert.equal(hash(fragment), baseline.pixiShader, 'Pixi GLSL assembly remains byte-identical');
const visual = art.describe(DW.sim.createInitialWorld().asteroids[0]);
DW.game.setAsteroidLight(.4, .7);
const light = art.uniforms(visual).uLight;
assert.ok(Math.abs(light[0] - Math.cos(.4) * Math.cos(.7)) < 1e-6);
assert.ok(Math.abs(light[1] - Math.sin(.4) * Math.cos(.7)) < 1e-6);
assert.ok(Math.abs(light[2] - Math.sin(.7)) < 1e-6, 'Retain viewer light controls');

function checkPages(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    if (entry.name.startsWith('.') || ['assets', 'vendor', 'node_modules'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {checkPages(file); continue;}
    if (!entry.name.endsWith('.html')) continue;
    const scripts = Array.from(fs.readFileSync(file, 'utf8').matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g), match =>
      path.resolve(directory, match[1].split('?')[0]));
    const position = name => scripts.indexOf(path.join(root, 'src', name + '.js'));
    for (const consumer of ['scene3d', 'game']) {
      if (position(consumer) < 0) continue;
      assert.ok(position('sim') >= 0 && position('sim') < position('asteroid-art') && position('asteroid-art') < position(consumer),
        path.relative(root, file) + ': load sim, asteroid-art, then ' + consumer);
      assert.equal(scripts.filter(script => script === path.join(root, 'src/asteroid-art.js')).length, 1);
    }
  }
}
checkPages(root);
console.log('PASS shared asteroid artwork: renderer-independent headless loading, preserved geology/GLSL/data, compatibility helpers and HTML dependency order');
