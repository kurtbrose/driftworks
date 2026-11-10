'use strict';
// Dependency-free static deployment. Keep authoring inputs in Git, out of Pages.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'output', 'gameplay-site');
const inventory = cp.execFileSync('git', ['ls-files', '-z'], {cwd: root}).toString().split('\0').filter(Boolean);
const known = new Set(inventory);
const selected = new Set();
const queue = [];
function add(name) {
  if (/^(tools|tests|docs)\//.test(name)) return;
  if (/\/(original|source)\//.test(name) || /\.(?:fbx|blend|zip|obj|mtl)$/.test(name)) return;
  if (!known.has(name) || selected.has(name)) return;
  selected.add(name); queue.push(name);
}
function tree(prefix) { inventory.filter(name => name.startsWith(prefix)).forEach(add); }
// Runtime-generated ship names and portrait IDs cannot be found through static imports.
for (const name of inventory) {
  if (/^assets\/ships\//.test(name) && !/\/(source|original)\//.test(name) && /\.(js|json|bin|png|webp|jpg|svg)$/.test(name)) add(name);
  if (/^assets\/portraits\/.+\/runtime\//.test(name)) add(name);
}
for (const profile of ['flight', 'asteroidPatrol', 'tactical']) require('./script-manifest.cjs').resolve(profile).forEach(s => add(s.src));
['experiments/flight.html', 'experiments/mission-asteroid-patrol.html', 'rts.html', 'styles.css', 'assets/favicon.svg'].forEach(add);
// Follow complete local literals. Partial directory literals cover runtime filename construction.
function reference(value, owner) {
  value = value.split(/[?#]/)[0];
  if (!value || /^(?:[a-z]+:|\/\/|#)/i.test(value)) return;
  for (const base of [path.posix.dirname(owner), 'experiments', '.']) {
    const target = path.posix.normalize(path.posix.join(base, value));
    if (known.has(target)) { if (!target.endsWith('.html')) add(target); return; }
    if (target.startsWith('assets/') && value.endsWith('/')) { tree(target); return; }
  }
}
for (let i = 0; i < queue.length; i++) {
  const name = queue[i];
  if (name === 'src/asset-versions.js' || !/\.(js|json|html|css|svg)$/.test(name)) continue;
  const text = fs.readFileSync(path.join(root, name), 'utf8');
  for (const match of text.matchAll(/["']([^"'\r\n<>]*?)["']/g)) reference(match[1], name);
  for (const match of text.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) reference(match[1], name);
}
const bytes = [...selected].reduce((sum, name) => sum + fs.statSync(path.join(root, name)).size, 0);
if (bytes > 950_000_000) throw Error('Gameplay package exceeds the 950 MB deployment budget: ' + bytes);
// The destination is fixed inside ignored output; never remove arbitrary user paths.
fs.rmSync(output, {recursive: true, force: true});
for (const name of [...selected].sort()) {
  const target = path.join(output, name);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.copyFileSync(path.join(root, name), target);
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');
fs.writeFileSync(path.join(output, 'index.html'), '<!doctype html>\n<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<title>Driftworks</title><h1>Driftworks</h1><p><a href="experiments/flight.html">Start flight</a></p><p><a href="experiments/flight.html?mission=fleet-evacuation">Fleet evacuation</a></p><p><a href="experiments/mission-asteroid-patrol.html">Asteroid patrol</a></p><p><a href="rts.html">Legacy tactical game</a></p>\n');
console.log(`Gameplay package: ${selected.size} files, ${(bytes / 1e6).toFixed(1)} MB -> ${output}`);
