'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {suites, helpers} = require('../suites.cjs');
const root = path.resolve(__dirname, '../..');

function plan(selected = Object.keys(suites), definitions = suites) {
  if (!selected.length) throw new Error('Select at least one test group');
  const tasks = [], seen = new Set();
  for (const group of new Set(selected)) {
    if (!Object.hasOwn(definitions, group)) throw new Error('Unknown test group: ' + group);
    if (!definitions[group].length) throw new Error('Empty test group: ' + group);
    for (const entry of definitions[group]) {
      const task = typeof entry === 'string' ? {file: entry} : entry;
      if (!/^[a-z0-9-]+\.cjs$/.test(task.file) || task.args && (!Array.isArray(task.args) || task.args.some(arg => typeof arg !== 'string'))) {
        throw new Error('Invalid test entry in ' + group);
      }
      if (task.setup && task.setup !== 'shared') throw new Error('Unknown setup: ' + task.setup);
      const id = task.file + ' ' + JSON.stringify(task.args || []);
      if (seen.has(id)) throw new Error('Duplicate test entry: ' + id);
      seen.add(id);
      tasks.push({group, ...task});
    }
  }
  return tasks;
}

function validateCoverage(directory = path.join(root, 'tests'), definitions = suites, exemptions = helpers) {
  const tasks = plan(Object.keys(definitions), definitions);
  const registered = new Set(tasks.map(task => task.file));
  const present = new Set(fs.readdirSync(directory, {withFileTypes: true})
    .filter(entry => entry.isFile() && entry.name.endsWith('.cjs')).map(entry => entry.name));
  for (const file of registered) if (!present.has(file)) throw new Error('Missing test file: ' + file);
  for (const file of Object.keys(exemptions)) {
    if (!present.has(file) || registered.has(file) || !exemptions[file]) throw new Error('Invalid test helper exemption: ' + file);
  }
  for (const file of present) {
    if (!registered.has(file) && !Object.hasOwn(exemptions, file)) throw new Error('Ungrouped test file: ' + file);
  }
  return tasks;
}

function run(tasks, options = {}) {
  const spawn = options.spawn || spawnSync, log = options.log || console.log;
  let passed = 0, failed = 0, group;
  for (const task of tasks) {
    if (task.group !== group) {group = task.group; log('\nRunning ' + group + ' tests');}
    const args = task.setup === 'shared' ? ['--require', path.join(root, 'tests/helpers/preload-shared.cjs')] : [];
    args.push(path.join(root, 'tests', task.file), ...(task.args || []));
    // Wait for process exit, including async assertions. Globals, module caches
    // and exitCode resets cannot escape into another test file.
    const result = spawn(process.execPath, args, {cwd: root, stdio: 'inherit'});
    if (result.status === 0 && !result.error && !result.signal) passed++;
    else {
      failed++;
      log('FAIL ' + task.file + (task.args?.length ? ' ' + task.args.join(' ') : '') +
        ': ' + (result.error?.message || result.signal || 'exit ' + result.status));
    }
  }
  log('\n' + (failed ? 'FAIL' : 'PASS') + ': ' + passed + '/' + tasks.length + ' test entries passed' + (failed ? ', ' + failed + ' failed' : ''));
  return {passed, failed, total: tasks.length};
}

function main(args = process.argv.slice(2)) {
  if (args.includes('--help')) {
    console.log('Usage: node tests/run.cjs [--list] [group ...]\nGroups: ' + Object.keys(suites).join(', ') + '\nOmit group names to run the complete suite.');
    return 0;
  }
  validateCoverage();
  const selected = args.filter(arg => arg !== '--list');
  const tasks = plan(selected.length ? selected : Object.keys(suites));
  if (args.includes('--list')) {
    for (const task of tasks) console.log(task.group + ': ' + task.file + (task.args?.length ? ' ' + task.args.join(' ') : '') + (task.setup ? ' [setup: ' + task.setup + ']' : ''));
    return 0;
  }
  return run(tasks).failed ? 1 : 0;
}

module.exports = {plan, validateCoverage, run, main};
