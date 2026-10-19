// Offline integrity and real Three.js loading checks for the converted pack.
// Run: node tools/check-modular-scifi.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {registerHooks} from 'node:module';
import * as THREE from '../vendor/three/build/three.module.js';
registerHooks({resolve(specifier, context, next) {
  return next(specifier === 'three' ? new URL('../vendor/three/build/three.module.js', import.meta.url).href : specifier, context);
}});
const {GLTFLoader} = await import('../vendor/three/examples/jsm/loaders/GLTFLoader.js');
const pack = new URL('../assets/environments/quaternius-ultimate-modular-scifi/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('provenance.json', pack), 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sources = fs.readdirSync(new URL('source/FBX/', pack), {recursive:true}).filter(p => p.endsWith('.fbx'));
assert.equal(manifest.models.length, sources.length);
assert.equal(new Set(manifest.models.map(m => m.id)).size, sources.length);
let meshes = 0;
for (const model of manifest.models) {
  const source = fs.readFileSync(new URL(model.source, pack));
  const bytes = fs.readFileSync(new URL(model.url, pack));
  assert.equal(hash(source), model.sourceSha256, model.source);
  assert.equal(source.length, model.sourceBytes);
  assert.equal(hash(bytes), model.sha256, model.url);
  assert.equal(bytes.length, model.bytes);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  assert.equal(doc.asset.version, '2.0');
  assert.equal(doc.asset.extras.license, 'CC0-1.0');
  assert.ok(!(doc.extensionsRequired || []).length, 'No external decoders required');
  for (const buffer of doc.buffers || []) assert.ok(!buffer.uri, 'Embedded BIN only');
  for (const image of doc.images || []) assert.ok(image.bufferView !== undefined, 'Embedded images only');
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  const bounds = new THREE.Box3().setFromObject(gltf.scene);
  assert.ok(!bounds.isEmpty() && [...bounds.min, ...bounds.max].every(Number.isFinite), model.url);
  let count = 0;
  gltf.scene.traverse(node => {
    if (!node.isMesh) return;
    meshes++; count++;
    const geometry = node.geometry;
    assert.ok(geometry.attributes.position.count > 0);
    assert.ok(geometry.attributes.normal);
    for (const attribute of Object.values(geometry.attributes)) {
      assert.ok(Array.from(attribute.array).every(Number.isFinite), model.url);
    }
    if (geometry.index) {
      assert.equal(geometry.index.count % 3, 0);
      for (const index of geometry.index.array) assert.ok(index < geometry.attributes.position.count);
    }
    geometry.dispose();
  });
  assert.ok(count > 0, model.url);
}
console.log(`Verified ${manifest.models.length} self-contained GLBs and source hashes; Three.js loaded ${meshes} meshes.`);
