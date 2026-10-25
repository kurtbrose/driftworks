'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const manifest = require('../tools/script-manifest.cjs');
const {sync, surfaces} = require('../tools/sync-script-lists.cjs');
const {refresh} = require('../tools/refresh-site-assets.cjs');
const definitions = () => structuredClone({groups: manifest.groups, profiles: manifest.profiles, dependencies: manifest.dependencies});

// Browser and Node suites share the same application/test order. Browser-only
// viewer resources are the entire deliberate difference between these profiles.
const browserOnly = new Set(['src/model-viewer.js', 'vendor/three/build/three.global.js']);
assert.deepEqual(manifest.files('browserTests').filter(file => !browserOnly.has(file)), manifest.files('sharedTests'));
assert.ok(!manifest.files('headless').some(file => file.startsWith('vendor/') || file === 'src/game.js'));
assert.throws(() => manifest.files('flight'), /cannot execute module scripts or import maps/);
assert.throws(() => manifest.files('unknown'), /Unknown script profile/);
assert.equal(manifest.resolve('flight').filter(script => script.imports).length, 1);
assert.equal(manifest.resolve('flight').filter(script => script.type === 'module').length, 3);
assert.deepEqual(manifest.resolve('flightStudy'), manifest.resolve('flight').filter(script => script.src !== 'experiments/flight.js'));
assert.ok(manifest.resolve('ellisStudy').at(-1).src === 'experiments/ellis-study.js');
const patrol = manifest.resolve('asteroidPatrol');
assert.deepEqual(patrol.slice(-2).map(script => script.src), ['experiments/ellis-feedback.js', 'experiments/flight.js']);
const original = manifest.files('headless');
original.reverse();
assert.notDeepEqual(manifest.files('headless'), original, 'Each consumer owns its returned list');

function rejects(change, message) {
  const definition = definitions();
  change(definition);
  assert.throws(() => manifest.resolve('headless', definition), message);
}
rejects(d => {d.groups.simulation = ['@simulation'];}, /cycle/);
rejects(d => {d.profiles.headless.entries.push('@missing');}, /Unknown script profile\/group/);
rejects(d => {d.profiles.headless.entries.push('src/sim.js');}, /duplicate script/);
rejects(d => {d.profiles.headless.entries.push('src/../outside.js');}, /repository-relative/);
rejects(d => {d.profiles.headless.omit = ['src/asteroid-art.js'];}, /load src\/asteroid-art.js before src\/scene3d.js/);
rejects(d => {d.profiles.headless.omit = ['src/missing.js'];}, /cannot omit absent/);
rejects(d => {d.profiles.headless.before = [{src: 'src/missing.js', entries: ['src/sim.js']}];}, /missing insertion point/);
rejects(d => {d.profiles.headless.entries.push({src: 'src/new.js', type: 'async'});}, /unsupported script type/);
rejects(d => {d.groups.simulation.reverse();}, /load src\/propulsion.js before src\/sim.js/);

const benchmarkScripts = manifest.resolve('ellisBenchmark');
const probeIndex = benchmarkScripts.findIndex(script => script.src === 'tests/fixtures/ellis-benchmark-probe.js');
assert.equal(benchmarkScripts[probeIndex + 1].src, 'experiments/flight.js', 'Benchmark instrumentation loads before flight boot');
assert.ok(benchmarkScripts.findIndex(script => script.src === 'experiments/flight-presentation.js') < probeIndex);
assert.deepEqual(benchmarkScripts.filter(script => script.src !== 'tests/fixtures/ellis-benchmark-probe.js'), manifest.resolve('flight'));

// Exercise synchronization on an isolated static site, including import maps,
// worker-relative paths, asset versioning, drift detection and repeatability.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'driftworks-script-manifest-'));
const write = (file, text) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
  fs.writeFileSync(path.join(root, file), text);
};
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const log = console.log, error = console.error, diagnostics = [];
try {
  console.log = () => {};
  console.error = message => diagnostics.push(message);
  for (const name of Object.keys(manifest.profiles)) {
    for (const script of manifest.resolve(name)) {
      for (const src of script.imports ? Object.values(script.imports) : [script.src]) write(src, '// fixture\n');
    }
  }
  for (const surface of surfaces) {
    if (surface.worker) {
      write(surface.file, '/* untouched worker preamble */\n/* script-manifest:' + surface.profile + ' */\n/* /script-manifest */\n// untouched worker logic\n');
    } else {
      const helper = path.posix.relative(path.posix.dirname(surface.file), 'src/asset-versions.js');
      const setup = surface.profile === 'tactical' ? '' : '<script>window.DRIFTWORKS_TEST_MODE=true;</script>\n';
      write(surface.file, '<!doctype html>\n<script src="' + helper + '"></script>\n' + setup +
        '<!-- script-manifest:' + surface.profile + ' -->\n<!-- /script-manifest -->\n<p>Untouched content</p>\n');
    }
  }
  assert.equal(sync(root), 0);
  assert.equal(refresh(root), 0);
  assert.equal(sync(root, true), 0, 'Asset versioning and script generation agree');
  assert.ok(read('output/ellis-benchmark.html').includes('ellis-benchmark-probe.js'), 'Asset refresh retains benchmark instrumentation');
  const snapshots = surfaces.map(surface => read(surface.file));
  const tacticalSnapshot = read('rts.html');
  assert.equal(sync(root), 0);
  assert.equal(refresh(root), 0);
  assert.deepEqual(surfaces.map(surface => read(surface.file)), snapshots, 'Repeated refresh is byte-identical');
  assert.ok(read('experiments/flight.html').includes('"three":"../vendor/three/build/three.module.js?v='));
  assert.ok(read('experiments/flight.html').includes('<script type="module" src="evacuation-scenery.js?v='));
  assert.ok(read('experiments/flight-study-worker.js').includes('"../src/propulsion.js"'));
  assert.ok(snapshots.every(text => !text.includes('\r')));
  for (const surface of surfaces) {
    if (!surface.worker && surface.profile !== 'tactical') assert.ok(read(surface.file).includes('window.DRIFTWORKS_TEST_MODE=true;'));
  }

  write('rts.html', read('rts.html').replace(/<script src="src\/propulsion[^\n]+\n/, ''));
  assert.equal(sync(root, true), 1, 'Missing generated dependency fails the check');
  assert.ok(diagnostics.some(message => message.includes('npm run refresh:assets')));
  assert.equal(sync(root), 0);
  write('rts.html', read('rts.html') + '<script src="src/game.js"></script>\n');
  assert.throws(() => sync(root, true), /scripts outside the generated block/);
  write('rts.html', tacticalSnapshot.replace('<!-- /script-manifest -->', ''));
  assert.throws(() => sync(root, true), /expected one script-manifest block/);
  write('rts.html', tacticalSnapshot);
  fs.unlinkSync(path.join(root, 'src/propulsion.js'));
  assert.throws(() => sync(root, true), /ENOENT/);
} finally {
  console.log = log;
  console.error = error;
  fs.rmSync(root, {recursive: true, force: true});
}
console.log('PASS script manifest: shared browser/Node profiles, dependency guards, static tags/import maps, worker paths, drift detection and idempotent asset refresh');
