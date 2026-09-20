// Run the ordinary-script suite without adding a build or dependency pipeline.
const fs = require('fs');
const vm = require('vm');
global.window = global;
global.DRIFTWORKS_TEST_MODE = true;
let failures = 0;
const summary = {};
global.document = {
  querySelector: selector => selector === '#summary' ? summary : {
    appendChild: item => { if (item.className === 'fail') { failures++; console.log(item.textContent); } }
  },
  createElement: () => ({ appendChild: () => {} })
};
for (const file of ['src/propulsion.js', 'src/combat.js', 'src/logistics.js', 'src/sim.js', 'src/tactical/camera.js', 'src/audio.js', 'src/hud.js', 'src/game.js', 'tests/scenario.js', 'tests/tests.js']) {
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}
console.log(summary.textContent);
const path = require('node:path');
const scenarioDir = path.join(__dirname, 'scenarios');
failures += require('./scenarios.cjs').runFiles(fs.readdirSync(scenarioDir).filter(file => file.endsWith('.json')).sort().map(file => path.join(scenarioDir, file)));
process.exitCode = failures ? 1 : 0;
