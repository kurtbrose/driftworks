'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const excluded = new Set(['.git', 'node_modules', '.agents', '.codex']);
function files(root, dir = '') {
  return fs.readdirSync(path.join(root, dir), {withFileTypes: true}).flatMap(entry => {
    const name = path.posix.join(dir, entry.name);
    return entry.name.startsWith('.') || excluded.has(entry.name) || entry.isSymbolicLink() ? [] : entry.isDirectory() ? files(root, name) : [name];
  });
}
function hash(bytes, text = true) {
  return crypto.createHash('sha256').update(text ? bytes.toString('latin1').replace(/\r\n/g, '\n') : bytes, text ? 'latin1' : undefined).digest('hex').slice(0, 12);
}
function refresh(root, check = false) {
  const names = fs.existsSync(path.join(root, '.git')) ? require('node:child_process').execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {cwd: root, maxBuffer: 32 * 1024 * 1024}).toString().split('\0').filter(name => name && fs.existsSync(path.join(root, name))).sort() : files(root).sort();
  const versions = {};
  for (const name of names.filter(name => name !== 'src/asset-versions.js' && !name.startsWith('experiments/portrait-lab/results/') && /^(assets|src|experiments|vendor)\//.test(name) && /\.(?:js|css|png|jpe?g|webp|svg|gif|json|glb|gltf|mp3|wav|ogg|bin)$/.test(name))) {
    versions[name] = hash(fs.readFileSync(path.join(root, name)), /\.(js|css|json|svg|gltf)$/.test(name));
  }
  const runtime = `(function () {\n  'use strict';\n  var DW = /** @type {import('./types').DriftworksNamespace} */ (window.Driftworks = window.Driftworks || {});\n  var root = typeof document !== 'undefined' && document.currentScript ? new URL('../', new URL(document.currentScript.getAttribute('src') || '', document.baseURI)).href : '';\n  /** @type {Record<string,string>} */\n  var versions = ${JSON.stringify(versions, null, 2)};\n  /** @param {string} value @param {string=} base */\n  DW.assetUrl = function (value, base) {\n    if (!root) return value;\n    var url = new URL(value, base || document.baseURI);\n    if (url.href.startsWith(root)) {\n      var key = decodeURI(url.pathname.slice(new URL(root).pathname.length));\n      if (versions[key]) url.searchParams.set('v', versions[key]);\n    }\n    return url.href;\n  };\n})();\n`;
  let failures = 0;
  // Image/script assignments are dynamic requests, so HTML versioning cannot
  // protect them. Keep authored request sites routed through the URL map.
  for (const name of names.filter(name => /^(src|experiments)\/.+\.js$/.test(name) && name !== 'src/asset-versions.js' && !name.startsWith('experiments/portrait-lab/'))) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    if (/\bassetUrl\(/.test(source) && !source.includes('(window.Driftworks.assetUrl)')) { console.error('Missing asset URL helper binding: ' + name); failures++; }
    for (const match of source.matchAll(/\.src\s*=\s*([^;]+);/g)) {
      if (!match[1].startsWith('assetUrl(')) {
        console.error('Unversioned dynamic resource assignment: ' + name + ': ' + match[0]); failures++;
      }
    }
    if (/\bfetch\(\s*['"][.][.\/][^'"]+/.test(source)) {
      console.error('Unversioned dynamic fetch: ' + name); failures++;
    }
  }
  function update(name, after) {
    const file = path.join(root, name);
    const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (before.replace(/\r\n/g, '\n') === after.replace(/\r\n/g, '\n')) return;
    if (check) { console.error('Missing or stale asset versions: ' + name); failures++; }
    else fs.writeFileSync(file, after);
  }
  update('src/asset-versions.js', runtime);
  for (const name of names.filter(name => name.endsWith('.html'))) {
    let text = fs.readFileSync(path.join(root, name), 'utf8');
    const helper = path.posix.relative(path.posix.dirname(name), 'src/asset-versions.js');
    text = text.replace(/<script\b[^>]*src=["'][^"']*asset-versions\.js[^"']*["'][^>]*><\/script>\s*/gi, '');
    {
      text = text.replace(/<script\b/i, `<script src="${helper}"></script>\n<script`);
    }
    text = text.replace(/(<(?:script|link|img|source)\b[^>]*\b(?:src|href)=['"])([^'"?#]+)(?:\?([^'"#]*))?(#[^'"]*)?(['"][^>]*>)/gi,
      (match, prefix, asset, query, fragment, suffix) => {
        if (/^(?:[a-z]+:|\/\/|#)/i.test(asset) || !/\.(?:js|css|png|jpe?g|svg|webp|gif|ico)$/.test(asset)) return match;
        const target = path.resolve(root, path.posix.dirname(name), asset);
        if (!target.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(target)) {
          console.error('Missing local asset: ' + name + ' -> ' + asset); failures++; return match;
        }
        const params = new URLSearchParams(query);
        params.set('v', hash(target === path.join(root, 'src/asset-versions.js') ? Buffer.from(runtime) : fs.readFileSync(target), /\.(js|css|svg)$/.test(asset)));
        return prefix + asset + '?' + params + (fragment || '') + suffix;
      });
    // Import maps and inline background URLs do not have src/href attributes.
    text = text.replace(/(<script\b[^>]*type=["']importmap["'][^>]*>)([\s\S]*?)(<\/script>)/gi, (match, open, json, close) => {
      const data = JSON.parse(json);
      for (const key of Object.keys(data.imports || {})) data.imports[key] = versionURL(data.imports[key]);
      return open + JSON.stringify(data) + close;
    });
    text = text.replace(/(\bfrom\s+["'])([^"']+)(["'])/g, (match, open, value, close) => /^(?:\.\.?\/)/.test(value) ? open + versionURL(value) + close : match);
    text = text.replace(/(url\(["']?)([^"')]+)(["']?\))/g, (match, open, value, close) => open + versionURL(value) + close);
    function versionURL(value) {
      if (/^(?:[a-z]+:|\/\/|#)/i.test(value)) return value;
      const url = new URL(value, 'https://site.invalid/' + name);
      const key = decodeURI(url.pathname.slice(1));
      if (versions[key]) url.searchParams.set('v', versions[key]);
      else { console.error('Missing local resource: ' + name + ' -> ' + value); failures++; return value; }
      return value.split(/[?#]/)[0] + '?' + url.searchParams + url.hash;
    }
    update(name, text);
  }
  // JSON manifests use relative child URLs; verify these independently of HTML.
  for (const name of ['assets/backgrounds/hero-layout-v1.json', 'assets/backgrounds/sky-lighting-v1.json']) {
    if (!names.includes(name)) continue;
    const data = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
    const refs = name.includes('hero-layout') ? Object.values(data.library).map(entry => entry.file) : Object.values(data.families).map(entry => entry.map);
    for (const ref of refs) {
      const key = path.posix.normalize(path.posix.join(path.posix.dirname(name), ref));
      if (!versions[key]) { console.error('Missing dynamic sky asset: ' + key); failures++; }
    }
  }
  if (failures) process.exitCode = 1;
  else console.log(check ? 'Site asset versions match.' : 'Updated site asset versions.');
  return failures;
}
module.exports = {refresh, hash};
if (require.main === module) refresh(path.resolve(__dirname, '..'), process.argv.includes('--check'));
