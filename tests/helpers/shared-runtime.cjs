'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const files = require('../../tools/script-manifest.cjs').files('sharedTests');

// Use the current realm, as the original runner did: legacy geometry tests
// compare Array/typed-array prototypes and share the production adapter identity.
// Each caller runs in its own child process, so these globals cannot leak.
function install(group) {
  const summary = {}, results = [];
  global.window = global;
  global.DRIFTWORKS_TEST_MODE = true;
  global.DRIFTWORKS_TEST_GROUP = group === undefined ? null : group;
  global.addEventListener = () => {};
  global.document = {
    querySelector: selector => selector === '#summary' ? summary : {appendChild: item => results.push(item)},
    createElement: () => ({appendChild() {}})
  };
  for (const file of files.filter(file => file !== 'tests/tests.js')) {
    vm.runInThisContext(fs.readFileSync(path.join(root, file), 'utf8'), {filename: file});
  }
  return {summary, results, namespace: global.Driftworks};
}

function run(group) {
  const runtime = install(group);
  vm.runInThisContext(fs.readFileSync(path.join(root, 'tests/tests.js'), 'utf8'), {filename: 'tests/tests.js'});
  const result = global.DriftworksTestResult;
  if (!result || !result.total) throw new Error('Shared suite did not report any tests');
  console.log(runtime.summary.textContent);
  return result;
}

module.exports = {install, run};
