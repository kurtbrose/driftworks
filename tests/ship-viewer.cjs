// Exercise inspector DOM events without booting WebGL.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async function () {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {value: '', checked: true, clientWidth: 800, clientHeight: 600, addEventListener() {}});
    return elements.get(id);
  }
  let paint, resets = 0;
  const scene = {setOrbit() {resets++;}, setStudyActors(batches) {if (batches.length) paint = batches[0].paint;}};
  const model = {id: 'ship', name: 'Ship', texturedVertices: []};
  const world = {combat: {}};
  const DW = {sim: {createInitialWorld: () => world, METERS_PER_UNIT: 10}, scene3d: {create: () => scene}, shipPackModels: {
    populate() {}, loadTextures: () => Promise.resolve(new Map()),
    find: () => ({model, pack: {id: 'pack', author: 'Author', license: 'CC0', url: ''}}),
    sourceGeometry: (m, poses, units, texture, color) => ({paint: color}),
    paintColor: color => color, engineAnchors: () => []
  }};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../experiments/dom.js'), 'utf8') + '\n' + fs.readFileSync(require('node:path').join(__dirname, '../experiments/ship-pack-viewer.js'), 'utf8'), {
    window: {Driftworks: DW}, document: {getElementById: element}, requestAnimationFrame() {}
  });
  await new Promise(setImmediate);
  const initialResets = resets;
  element('paint-enabled').checked = false;
  element('paint-enabled').onchange();
  await new Promise(setImmediate);
  assert.equal(paint, undefined);
  element('paint-color').value = '#8040ff';
  element('paint-color').oninput();
  await new Promise(setImmediate);
  assert.equal(element('paint-enabled').checked, true);
  assert.equal(paint, '#8040ff');
  assert.equal(resets, initialResets, 'paint edits preserve the camera');
  element('paint-enabled').checked = false;
  element('paint-color').onchange();
  await new Promise(setImmediate);
  assert.equal(paint, '#8040ff');
  assert.equal(element('paint-enabled').checked, true);
  console.log('PASS inspector paint controls');
})().catch(error => {console.error(error); process.exitCode = 1;});

