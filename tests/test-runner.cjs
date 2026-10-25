'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const harness = require('./shared-harness.js');
const runner = require('./run.cjs');
const {suites} = require('./suites.cjs');

assert.doesNotThrow(() => require('./fixtures/mining-clearance.cjs'),
  'Importing shared clearance helpers must not need a runtime or execute sweeps');

// Registration must not execute test callbacks or boot application resources.
// Check directory and profile membership so shared files cannot silently go missing.
{
  const vm = require('node:vm');
  const root = path.resolve(__dirname, '..');
  const expected = ['fixtures.js', ...harness.groups.map(group => group + '.js')];
  assert.deepEqual(fs.readdirSync(path.join(__dirname, 'shared')).sort(), expected.slice().sort());
  const profile = require('../tools/script-manifest.cjs').files('sharedTests');
  assert.deepEqual(profile.filter(file => file.startsWith('tests/shared/')),
    expected.map(file => 'tests/shared/' + file));
  const context = vm.createContext({window: {Driftworks: {sim: {createInitialWorld() {} }}}});
  for (const file of ['tests/population-tests.js', ...expected.map(file => 'tests/shared/' + file)]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
  }
  for (const group of harness.groups) {
    const registered = [];
    context.window.DriftworksSharedTests[group]({
      test: (owner, name, callback) => {
        assert.equal(owner, group, name + ' belongs to its file group');
        assert.equal(typeof callback, 'function');
        registered.push(name);
      }, assert() {}, assertClose() {}
    }, context.window.DriftworksSharedFixtures);
    assert.ok(registered.length, group + ' must register tests');
  }
}

assert.deepEqual(Object.keys(suites), harness.groups, 'Browser and Node group names agree');
const all = runner.validateCoverage();
assert.equal(all.length, harness.groups.reduce((count, group) => count + runner.plan([group]).length, 0));
assert.deepEqual(runner.plan(['flight', 'flight']), runner.plan(['flight']), 'Repeated groups do not run checks twice');
assert.ok(runner.plan(['flight']).every(task => task.group === 'flight'));
assert.throws(() => runner.plan(['typo']), /Unknown test group/);
assert.throws(() => runner.plan([]), /at least one/);
assert.throws(() => runner.plan(['empty'], {empty: []}), /Empty test group/);
assert.throws(() => runner.plan(['a'], {a: ['same.cjs', 'same.cjs']}), /Duplicate test entry/);
assert.throws(() => runner.plan(['a'], {a: ['../escape.cjs']}), /Invalid test entry/);
assert.throws(() => runner.plan(['a'], {a: [{file: 'one.cjs', setup: 'unknown'}]}), /Unknown setup/);

function document() {
  const summary = {}, rows = [];
  return {summary, rows, querySelector: selector => selector === '#summary' ? summary : {appendChild: row => rows.push(row)}, createElement: () => ({appendChild() {}})};
}
for (const group of [null, ...harness.groups]) {
  const dom = document(), called = [];
  const suite = harness.create({document: dom, group, console: {error() {}}});
  for (const registered of harness.groups) suite.test(registered, 'test ' + registered, () => called.push(registered));
  const result = suite.run();
  assert.deepEqual(called, group ? [group] : harness.groups);
  assert.equal(result.total, group ? 1 : harness.groups.length);
  assert.equal(result.registered, harness.groups.length);
  assert.equal(result.failed, 0);
  assert.equal(dom.rows.length, result.total);
  assert.throws(() => suite.test('flight', 'late', () => {}), /after the suite has run/);
  assert.throws(() => suite.run(), /already run/);
}
assert.throws(() => harness.create({document: document(), group: 'typo'}), /Unknown test group/);
const empty = harness.create({document: document(), group: 'assets'});
empty.test('flight', 'unselected failure', () => {throw new Error('must not execute');});
assert.throws(() => empty.run(), /No tests registered/);
const failing = harness.create({document: document(), group: null, console: {error() {}}});
failing.test('flight', 'fails', () => {throw new Error('expected failure');});
failing.test('audio', 'continues', () => {});
assert.deepEqual(failing.run(), {group: null, passed: 1, failed: 1, total: 2, registered: 2});
const duplicate = harness.create({document: document(), group: null});
duplicate.test('flight', 'same', () => {});
assert.throws(() => duplicate.test('audio', 'same', () => {}), /Duplicate test name/);
assert.throws(() => duplicate.test('typo', 'different', () => {}), /Unknown test group/);

const calls = [];
const statuses = [{status: 0}, {status: 1}, {status: null, signal: 'SIGTERM'}, {status: null, error: new Error('spawn failed')}, {status: 0}];
const result = runner.run(Array.from({length: 5}, (_, index) => ({group: 'flight', file: 'one.cjs', args: ['jade-rime'], setup: index === 0 ? 'shared' : undefined})), {
  log() {}, spawn(binary, args, options) {calls.push({binary, args, options}); return statuses.shift();}
});
assert.deepEqual(result, {passed: 2, failed: 3, total: 5});
assert.equal(calls[0].args[0], '--require');
assert.ok(calls[0].args[1].endsWith(path.join('helpers', 'preload-shared.cjs')));
assert.equal(calls[1].args.at(-1), 'jade-rime', 'Mission arguments reach the test process unchanged');
assert.equal(calls[0].options.stdio, 'inherit');
assert.equal(calls[0].options.cwd, path.resolve(__dirname, '..'));

// Real child exit: a delayed assertion fails, and a later passing process cannot
// erase that failure. This also verifies completion waits for asynchronous work.
let child = 0;
assert.equal(runner.run([{group: 'tooling', file: 'one.cjs'}, {group: 'tooling', file: 'two.cjs'}], {
  log() {}, spawn() {return spawnSync(process.execPath, ['-e', child++ === 0 ? "setTimeout(() => {throw new Error('expected');}, 5)" : 'process.exitCode = 0'], {stdio: 'pipe'});}
}).failed, 1);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'driftworks-test-coverage-'));
try {
  fs.writeFileSync(path.join(root, 'one.cjs'), '');
  assert.equal(runner.validateCoverage(root, {a: ['one.cjs']}, {}).length, 1);
  fs.writeFileSync(path.join(root, 'new.cjs'), '');
  assert.throws(() => runner.validateCoverage(root, {a: ['one.cjs']}, {}), /Ungrouped test file/);
  assert.throws(() => runner.validateCoverage(root, {a: ['missing.cjs']}, {}), /Missing test file/);
  assert.throws(() => runner.validateCoverage(root, {a: ['one.cjs']}, {'one.cjs': 'cannot exempt a test'}), /Invalid test helper exemption/);
} finally {fs.rmSync(root, {recursive: true, force: true});}

console.log('PASS test runner: group coverage, selection, isolated setup, async failures, exit status, shared registration and late-test guards');
