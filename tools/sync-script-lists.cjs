'use strict';

const fs = require('node:fs');
const path = require('node:path');
const manifest = require('./script-manifest.cjs');
const {hash} = require('./refresh-site-assets.cjs');
const surfaces = [
  {file: 'experiments/hyperbolic-flight.html', profile: 'hyperbolicFlight'},
  {file: 'experiments/capital-shields.html', profile: 'capitalShields'},
  {file: 'experiments/ellis-growth.html', profile: 'flightStudy'},
  {file: 'experiments/ellis-study.html', profile: 'ellisStudy'},
  {file: 'experiments/mission-asteroid-patrol.html', profile: 'asteroidPatrol'},
  {file: 'output/ellis-aim-study.html', profile: 'flightStudy'},
  {file: 'output/ellis-benchmark.html', profile: 'ellisBenchmark'},
  {file: 'output/ellis-capital-benchmark.html', profile: 'ellisCapture'},
  {file: 'output/ellis-curved-performance.html', profile: 'flightStudy'},
  {file: 'rts.html', profile: 'tactical'},
  {file: 'experiments/flight.html', profile: 'flight'},
  {file: 'tests/index.html', profile: 'browserTests'},
  {file: 'experiments/flight-study-worker.js', profile: 'studyWorker', worker: true}
];

function render(root, surface) {
  const relative = src => path.posix.relative(path.posix.dirname(surface.file), src);
  if (surface.worker) {
    return '/* script-manifest:' + surface.profile + ' */\n    var files=' +
      JSON.stringify(manifest.files(surface.profile).map(relative)) + ';\n    /* /script-manifest */';
  }
  const url = src => relative(src) + '?v=' + hash(fs.readFileSync(path.join(root, src)));
  const lines = manifest.resolve(surface.profile).filter(script => script.src !== 'src/asset-versions.js').map(script => {
    if (script.imports) {
      const imports = Object.fromEntries(Object.entries(script.imports).map(([name, src]) => [name, url(src)]));
      return '<script type="importmap">' + JSON.stringify({imports}) + '</script>';
    }
    return '<script' + (script.type ? ' type="' + script.type + '"' : '') + ' src="' + url(script.src) + '"></script>';
  });
  return '<!-- script-manifest:' + surface.profile + ' -->\n' + lines.join('\n') + '\n<!-- /script-manifest -->';
}

function validatePage(html, surface) {
  const local = src => path.posix.normalize(path.posix.join(path.posix.dirname(surface.file), src.split('?')[0]));
  const entries = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].flatMap(match => {
    const src = match[1].match(/\bsrc=["']([^"']+)["']/);
    if (src) {
      if (/\s(?:async|defer)(?:\s|=|$)/.test(match[1])) throw new Error(surface.file + ': unexpected async/defer script');
      return [{src: local(src[1]), ...(/\btype=["']module["']/.test(match[1]) ? {type: 'module'} : {})}];
    }
    if (/\btype=["']importmap["']/.test(match[1])) {
      const data = JSON.parse(match[2]);
      return [{imports: Object.fromEntries(Object.entries(data.imports).map(([name, src]) => [name, local(src)]))}];
    }
    return [];
  });
  if (JSON.stringify(entries) !== JSON.stringify(manifest.resolve(surface.profile))) {
    throw new Error(surface.file + ': scripts outside the generated block differ from profile ' + surface.profile);
  }
}

function sync(root = path.join(__dirname, '..'), check = false) {
  // Validate every profile, including ones consumed directly by Node.
  for (const name of Object.keys(manifest.profiles)) {
    for (const script of manifest.resolve(name)) {
      for (const src of script.imports ? Object.values(script.imports) : [script.src]) {
        if (!fs.statSync(path.join(root, src)).isFile()) throw new Error('Missing script: ' + src);
      }
    }
  }
  let failures = 0;
  for (const surface of surfaces) {
    const file = path.join(root, surface.file);
    const before = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const pattern = surface.worker ? /\/\* script-manifest:[\w]+ \*\/[\s\S]*?\/\* \/script-manifest \*\//g :
      /<!-- script-manifest:[\w]+ -->[\s\S]*?<!-- \/script-manifest -->/g;
    const blocks = [...before.matchAll(pattern)];
    if (blocks.length !== 1) throw new Error(surface.file + ': expected one script-manifest block');
    const after = before.replace(pattern, () => render(root, surface));
    if (!surface.worker) validatePage(after, surface);
    if (before === after) continue;
    if (check) {
      console.error('Stale script list: ' + surface.file + '. Run npm run refresh:assets.');
      failures++;
    } else fs.writeFileSync(file, after);
  }
  return failures;
}

module.exports = {sync, render, surfaces, validatePage};
if (require.main === module) {
  try {
    const failures = sync(path.join(__dirname, '..'), process.argv.includes('--check'));
    process.exitCode = failures ? 1 : 0;
    if (!failures) console.log(process.argv.includes('--check') ? 'Script profiles and generated lists match.' : 'Updated script lists.');
  } catch (error) {console.error(error.message); process.exitCode = 1;}
}
