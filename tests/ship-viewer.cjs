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
  DW.originalShipModels=[{id:'driftworks:mining-rig',name:'Asteroid mining rig',author:'Driftworks',study:'../tests/mining-platform-orbit.html',provenance:'../assets/ships/driftworks-originals/README.md',geometry:()=>[{vertices:new Float32Array(18),color:[.8,.6,.3]}]}];
  scene.setStudyEffects=()=>{};
  element('ship-model').value='driftworks:mining-rig';element('ship-model').onchange();
  await new Promise(setImmediate);
  assert.equal(element('paint-enabled').disabled,true);assert.equal(element('show-engines').disabled,true);
  assert.ok(element('metadata').textContent.includes('Driftworks original'));
  assert.equal(element('source').href,'../tests/mining-platform-orbit.html');
  assert.ok(element('provenance').href.includes('driftworks-originals'));
  element('ship-model').value='ship';element('ship-model').onchange();await new Promise(setImmediate);
  assert.equal(element('paint-enabled').disabled,false);assert.equal(element('show-engines').disabled,false);
  console.log('PASS inspector paint controls and distinct original model catalog entry');
})().catch(error => {console.error(error); process.exitCode = 1;});

