'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function load() {
  const context = vm.createContext({});
  context.window = context;
  for (const file of ['src/propulsion.js', 'src/combat.js', 'src/logistics.js', 'src/formations.js', 'src/sim.js', 'src/population.js', 'src/session.js', 'tests/scenario.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  return context.Driftworks.scenario;
}

function runFiles(files) {
  const replay = load();
  let failures = 0;
  for (const file of files) {
    try {
      const scenario = JSON.parse(fs.readFileSync(file, 'utf8'));
      const world = replay.run(scenario);
      replay.check(world, scenario.assertions);
      console.log(`PASS ${scenario.name || path.basename(file)} (tick ${scenario.ticks})`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${file}: ${error.message}`);
    }
  }
  return failures;
}

module.exports = { runFiles };
if (require.main === module) {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: node tests/scenarios.cjs path/to/scenario.json [...]');
    process.exitCode = 1;
  } else process.exitCode = runFiles(files) ? 1 : 0;
}
