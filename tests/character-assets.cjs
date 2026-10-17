// Protect provenance and offline glTF dependencies from accidental asset moves/edits.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '../assets/characters');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json')));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let models = 0, clips = 0;
for (const pack of catalog) {
  const dir = path.join(root, pack.id);
  const provenance = JSON.parse(fs.readFileSync(path.join(dir, 'provenance.json')));
  assert.equal(provenance.author, 'Quaternius');
  assert.equal(provenance.license, 'CC0-1.0');
  if (provenance.archive && provenance.archive.retained !== false) assert.equal(hash(fs.readFileSync(path.join(dir, provenance.archive.path))), provenance.archive.sha256);
  for (const file of provenance.files) {
    const data = fs.readFileSync(path.join(dir, file.path));
    assert.equal(data.length, file.bytes, file.path);
    assert.equal(hash(data), file.sha256, file.path);
  }
  for (const model of pack.models) {
    const file = path.join(dir, model.path), data = fs.readFileSync(file);
    assert.equal(hash(data), model.sha256);
    const doc = JSON.parse(file.endsWith('.glb') ? data.subarray(20, 20 + data.readUInt32LE(12)).toString() : data.toString());
    assert.deepEqual((doc.animations || []).map((a, i) => a.name || 'Animation ' + (i + 1)), model.animations);
    for (const item of [...(doc.buffers || []), ...(doc.images || [])]) {
      if (!item.uri || item.uri.startsWith('data:')) continue;
      assert(!/^[a-z]+:|^\/\//i.test(item.uri), 'Runtime dependency must be local');
      assert(fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(item.uri))), item.uri);
    }
    models++; clips += model.animations.length;
  }
}
assert.equal(models, 6); assert.equal(clips, 196);
const vendor = path.join(__dirname, '../vendor/three');
for (const file of JSON.parse(fs.readFileSync(path.join(vendor, 'provenance.json'))).files) {
  assert.equal(hash(fs.readFileSync(path.join(vendor, file.path))), file.sha256, file.path);
}
console.log(`Character assets: ${models} models, ${clips} clip variants; provenance hashes and local dependencies verified.`);
