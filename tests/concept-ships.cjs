'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../assets/ships/concept-trio');
for (const name of ['raptor', 'bulldog', 'halo']) {
  const model = JSON.parse(fs.readFileSync(path.join(root, name + '.json'), 'utf8'));
  const initial = JSON.parse(fs.readFileSync(path.join(root, name + '-initial.json'), 'utf8'));
  function bounds(parts, axis) {
    const values = parts.flatMap(p => p.vertices.filter((v, i) => i % 8 === axis));
    return [Math.min(...values), Math.max(...values)];
  }
  for (const axis of [0, 1]) {
    const before = bounds(initial.parts, axis), after = bounds(model.parts, axis);
    const span = before[1] - before[0];
    assert(Math.abs(after[0] - before[0]) < span * .1 && Math.abs(after[1] - before[1]) < span * .1,
      name + ' keeps its established plan silhouette while adding detail');
  }
  const initialTriangles = initial.parts.reduce((sum, p) => sum + p.vertices.length / 24, 0);
  const refinedTriangles = model.parts.reduce((sum, p) => sum + p.vertices.length / 24, 0);
  assert(refinedTriangles > initialTriangles * 2, name + ' details are modeled, not just painted');
  for (const material of ['plate', 'trim', 'machinery']) {
    assert(model.parts.some(p => p.material === material), name + ' has separate armor and mechanical detail');
  }
  if (name === 'bulldog') {
    const lamps = model.parts.filter(p => p.material === 'light');
    assert(lamps.some(p => p.vertices[0] < -2), 'left pod retains its own lights');
    assert(lamps.some(p => p.vertices[0] > 2), 'right pod retains its own lights');
  }
  const counts = [0, 1, 2].map(stage => model.parts.filter(p => p.stage <= stage).reduce((n, p) => n + p.vertices.length / 24, 0));
  assert(counts[0] > 0 && counts[1] > counts[0] && counts[2] > counts[1], name + ' has three progressive stages');
  for (const part of model.parts) {
    assert(model.colors[part.material]);
    assert.equal(part.vertices.length % 24, 0);
    assert(part.vertices.every(Number.isFinite));
    for (let i = 0; i < part.vertices.length; i += 8) {
      assert(Math.abs(Math.hypot(...part.vertices.slice(i + 3, i + 6)) - 1) < 1e-6);
    }
  }
  const gltf = JSON.parse(fs.readFileSync(path.join(root, name + '.gltf'), 'utf8'));
  const bytes = Buffer.from(gltf.buffers[0].uri.split(',')[1], 'base64');
  assert.equal(bytes.length, gltf.buffers[0].byteLength);
  let exported = 0;
  for (const primitive of gltf.meshes[0].primitives) {
    const position = gltf.accessors[primitive.attributes.POSITION];
    const normal = gltf.accessors[primitive.attributes.NORMAL];
    const uv = gltf.accessors[primitive.attributes.TEXCOORD_0];
    assert.equal(position.count, normal.count);
    assert.equal(position.count, uv.count);
    exported += position.count / 3;
  }
  assert.equal(exported, counts[2], 'export includes every final-stage triangle');
  for (const view of gltf.bufferViews) assert(view.byteOffset + view.byteLength <= bytes.length);
  for (const image of gltf.images) assert(fs.existsSync(path.join(root, image.uri)));
}
console.log('PASS concept ships: progressive stages, finite meshes, unit normals and complete glTF exports');
