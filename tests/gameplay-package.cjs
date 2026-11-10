'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
cp.execFileSync(process.execPath, ['tools/package-gameplay.cjs'], {cwd: root, stdio: 'inherit'});
const output = path.join(root, 'output/gameplay-site');
for (const name of ['experiments/flight.html', 'experiments/mission-asteroid-patrol.html', 'rts.html', 'assets/ships/industrial-kit/cargo-paint.js', 'assets/ships/industrial-kit/convoy-flight.bin', 'assets/ships/industrial-kit/convoy-flight.json', 'experiments/mumble-worker.js']) {
  assert.deepEqual(fs.readFileSync(path.join(output, name)), fs.readFileSync(path.join(root, name)), name);
}
for (const name of ['tools', 'tests', 'docs', '.git', 'studies/object-viewer.html', 'assets/characters/quaternius-universal-animation-library/original']) assert.ok(!fs.existsSync(path.join(output, name)), name);
for (const name of ['experiments/flight.html', 'experiments/mission-asteroid-patrol.html', 'rts.html']) {
  const text = fs.readFileSync(path.join(output, name), 'utf8');
  for (const match of text.matchAll(/<(?:script|link|img|source)\b[^>]*\b(?:src|href)=["']([^"']+)["']/g)) {
    const url = match[1].split(/[?#]/)[0];
    if (!url || /^(?:[a-z]+:|\/\/)/i.test(url)) continue;
    assert.ok(fs.existsSync(path.resolve(output, path.dirname(name), url)), name + ' -> ' + url);
  }
}
const base = path.join(output, 'assets/backgrounds/flight-environments-v1');
const catalog = JSON.parse(fs.readFileSync(path.join(base, 'catalog.json'), 'utf8'));
for (const environment of Object.values(catalog.environments)) for (const face of environment.faces) assert.ok(fs.existsSync(path.join(base, face)), face);
console.log('Gameplay package regression checks passed');
