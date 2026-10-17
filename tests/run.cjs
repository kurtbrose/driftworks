// Run the ordinary-script suite without adding a build or dependency pipeline.
const fs = require('fs');
const vm = require('vm');
global.window = global;
global.DRIFTWORKS_TEST_MODE = true;
// Browser-resource mounts register lifecycle cleanup; headless tests drive it directly.
global.addEventListener = () => {};
let failures = 0;
const summary = {};
global.document = {
  querySelector: selector => selector === '#summary' ? summary : {
    appendChild: item => { if (item.className === 'fail') { failures++; console.log(item.textContent); } }
  },
  createElement: () => ({ appendChild: () => {} })
};
for (const file of ['src/propulsion.js', 'src/combat.js', 'src/logistics.js', 'src/formations.js', 'src/sim.js', 'src/population.js', 'src/session.js', 'src/tactical/camera.js', 'src/audio.js', 'src/hud.js', 'src/scene3d.js', 'src/game.js', 'tests/scenario.js', 'tests/population-tests.js', 'experiments/dom.js', 'experiments/retail-profiles.js', 'experiments/skybox.js', 'experiments/retail-weapons.js', 'experiments/guns.js', 'experiments/training.js', 'experiments/performance.js', 'experiments/input.js', 'experiments/flight-model.js', 'experiments/radar.js', 'assets/ships/quaternius-ultimate-spaceships/meshes.js', 'experiments/ship-packs.js', 'experiments/target-camera.js', 'experiments/mumble.js', 'experiments/flight-dialogue.js', 'experiments/flight-comms.js', 'experiments/flight-radio.js', 'experiments/flight-presentation.js', 'experiments/flight-diagnostics.js', 'experiments/flight-controls.js', 'experiments/flight-session.js', 'experiments/flight-hud.js', 'tests/fixtures/asteroid-surface-scene3d.js', 'tests/terrain-lab.js', 'tests/tests.js']) {
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}
console.log(summary.textContent);
const path = require('node:path');
const scenarioDir = path.join(__dirname, 'scenarios');
failures += require('./scenarios.cjs').runFiles(fs.readdirSync(scenarioDir).filter(file => file.endsWith('.json')).sort().map(file => path.join(scenarioDir, file)));
process.exitCode = failures ? 1 : 0;


require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'ship-viewer.cjs')], {stdio: 'inherit'});
require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'character-assets.cjs')], {stdio: 'inherit'});
require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'character-paints.cjs')], {stdio: 'inherit'});
require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'character-bodies.cjs')], {stdio: 'inherit'});

require('./mining-study-navigation.cjs');
