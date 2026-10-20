'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../assets/ships/concept-trio');
for (const name of ['raptor', 'bulldog', 'halo']) {
  const model = JSON.parse(fs.readFileSync(path.join(root, name + '.json'), 'utf8'));
  const initial = JSON.parse(fs.readFileSync(path.join(root, name + '-initial.json'), 'utf8'));
  function bounds(parts, axis, stride = 8) {
    const values = parts.flatMap(p => p.vertices.filter((v, i) => i % stride === axis));
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
  assert.equal(model.gunMounts.length, name === 'halo' ? 1 : 2, name + ' gun count matches its design');
  model.gunMounts.forEach((mount, index) => {
    assert(model.parts.some(p => p.component === 'gun-' + index), 'mount describes real exported gun geometry');
    assert(mount.position.every(Number.isFinite) && mount.length > 0);
  });
  if (name === 'raptor') {
    const body = model.parts.filter(p => p.assembly === 'delta-body');
    const width = bounds(body, 0), height = bounds(body, 2);
    assert(width[1] - width[0] > 9.8 && height[1] - height[0] > 1.5, 'Raptor delta shell spans the complete arrowhead with a deep center');
    const edges = new Map();
    const key = p => p.map(v => v.toFixed(6)).join(',');
    const roof = [];
    for (const part of body) for (let i = 0; i < part.vertices.length; i += 24) {
      const tri = [0, 8, 16].map(offset => part.vertices.slice(i + offset, i + offset + 3));
      if (part.vertices[i + 5] > .1) roof.push(tri);
      for (let j = 0; j < 3; j++) {
        const edge = [key(tri[j]), key(tri[(j + 1) % 3])].sort().join('|');
        edges.set(edge, (edges.get(edge) || 0) + 1);
      }
    }
    assert([...edges.values()].every(n => n === 2), 'Raptor body is one closed shell without wing-root gaps or overlapping hull pieces');
    function roofHeight(x, y) {
      for (const [a, b, c] of roof) {
        const det = (b[1]-c[1])*(a[0]-c[0]) + (c[0]-b[0])*(a[1]-c[1]);
        if (Math.abs(det) < 1e-10) continue;
        const u = ((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/det;
        const v = ((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/det;
        if (u >= -1e-6 && v >= -1e-6 && u+v <= 1+1e-6) return a[2]*u+b[2]*v+c[2]*(1-u-v);
      }
      assert.fail('Delta roof must cover the entire center-to-edge span');
    }
    let previous = roofHeight(0, 0);
    for (let x = .25; x < 3.5; x += .25) {
      const z = roofHeight(x, 0);
      assert(z < previous && previous-z < .06, 'Delta roof slopes continuously outward without a separate body-to-wing drop');
      previous = z;
    }
    for (const [index,mount] of model.gunMounts.entries()) {
      const x=mount.position[0];
      assert(Math.abs(x)===1.1 && mount.length<.8, 'Raptor uses compact inset muzzles rather than exposed barrels');
      const gun=model.parts.filter(p=>p.component==='gun-'+index);
      const funnels=body.filter(p=>p.component==='gun-port-funnel' && p.vertices[0]*x>0);
      assert(funnels.length>0, 'Gun port is carved into the primary shell with a modeled tapered cavity');
      for(const part of [...gun,...funnels])for(let i=0;i<part.vertices.length;i+=8){
        const [gx,gy,gz]=part.vertices.slice(i,i+3);
        const width=25/7-gy*25/49;
        assert(gz <= .09+.18*(width-Math.abs(gx))+1e-6, 'Gun and cavity remain beneath the existing delta skin; no raised housings');
      }
      const muzzle=mount.position.map((v,i)=>v+mount.axis[i]*mount.length/2);
      const roofAtMuzzle=.09+.18*(25/7-muzzle[1]*25/49-Math.abs(x));
      assert(roofAtMuzzle-muzzle[2]>.15, 'Muzzle is visibly inset below the surrounding skin');
      const rise=mount.axis[2]/mount.axis[1];
      const exitY=muzzle[1]+(roofAtMuzzle-muzzle[2])/(rise+.18*25/49);
      assert(((exitY-2)/.58)**2<.95, 'Barrel points out through its rounded opening without intersecting the hull');
    }
  }
  if (name === 'halo') {
    assert.equal(model.gunMounts[0].position[0], 0, 'Halo has one centerline nose gun');
    const body = bounds(model.parts.filter(p => p.component === 'central-body'), 1);
    const horizontal = model.parts.filter(p => p.component === 'horizontal-ring');
    const ringY = bounds(horizontal, 1), ringZ = bounds(horizontal, 2);
    const vertical = bounds(model.parts.filter(p => p.component === 'vertical-ring'), 1);
    assert(body[1] < ringY[1] - 1, 'Halo hull nose stays well inside the forward crescents');
    assert(ringZ[1] - ringZ[0] > .85 && vertical[1] - vertical[0] > .8, 'Halo curved structures have volumetric beam cross-sections');
  }
  const cockpit = model.parts.filter(p => p.component === 'canopy-glass');
  const crewSource = fs.readFileSync(path.join(root, '../../characters/fighter-cockpit.js'), 'utf8');
  const seated = JSON.parse(crewSource.slice(crewSource.indexOf('={') + 1).trim().replace(/;$/, '')).crew;
  const head = bounds(seated, 2, 6)[1] + model.pilotSeat[2];
  const roof = bounds(cockpit, 2)[1];
  assert(head < roof - .07, name + ' has helmet clearance for the shared 1.80 m seated astronaut');
  const shoulders = bounds(seated, 0, 6), canopyWidth = bounds(cockpit, 0);
  assert(shoulders[0] > canopyWidth[0] + .07 && shoulders[1] < canopyWidth[1] - .07,
    name + ' has lateral room for the suited pilot');
  if (name === 'bulldog') {
    const lamps = model.parts.filter(p => p.material === 'light');
    assert(lamps.some(p => p.vertices[0] < -2), 'left pod retains its own lights');
    assert(lamps.some(p => p.vertices[0] > 2), 'right pod retains its own lights');
    const rightPod = model.parts.filter(p => p.component === 'pod-core' && p.vertices[0] > 0);
    const podX = bounds(rightPod, 0);
    assert((podX[0] + podX[1]) / 2 >= 3, 'Bulldog pods have the wider separation');
    for (const mount of model.gunMounts) {
      assert(Math.abs(mount.position[0]) < podX[0] - .15, 'Bulldog guns stay inboard of the pod end faces');
      assert(mount.position[1] - mount.length / 2 < 1.5, 'Bulldog gun breeches reach back into the attachments');
    }
    assert(model.parts.some(p => p.component === 'cockpit-shroud'), 'Bulldog cockpit has a metal shroud');
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
