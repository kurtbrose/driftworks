'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../assets/ships/civilian-airliners');
const stations = [[-.5,.7,.73],[-.46,.92,.95],[-.36,1,1],[.12,1,1],
  [.28,.9,.93],[.39,.67,.74],[.46,.36,.43],[.5,.025,.07]];
function section(y, dimensions) {
  const t = y / dimensions.length;
  const i = Math.min(stations.length - 2, stations.findIndex((s, i) => i && t <= s[0]) - 1);
  assert(i >= 0);
  const a = stations[i], b = stations[i+1], before = stations[Math.max(0,i-1)], after = stations[Math.min(stations.length-1,i+2)];
  const f = Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0])));
  return [1,2].map((k) => {
    const m0 = (b[k]-before[k])/(b[0]-before[0])*(b[0]-a[0]);
    const m1 = (after[k]-a[k])/(after[0]-a[0])*(b[0]-a[0]);
    return ((2*f**3-3*f*f+1)*a[k]+(f**3-2*f*f+f)*m0+(-2*f**3+3*f*f)*b[k]+(f**3-f*f)*m1)*(k===1?dimensions.beam:dimensions.height)/2;
  });
}
const measured = [];
for (const key of ['commuter','double-decker']) {
  const bytes = fs.readFileSync(path.join(root,key+'.glb'));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);
  const jsonLength = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20,20+jsonLength));
  const binStart = 20+jsonLength+8;
  const dimensions = JSON.parse(fs.readFileSync(path.join(root,key+'-dimensions.json')));
  assert(!gltf.nodes.some(n=>/Dorsal red ribbon|Graphite ventral keel/.test(n.name||'')),
    'livery must not overlay the hull as a competing surface');
  const hull = gltf.nodes.find(n=>n.name==='Continuous pressure hull');
  const hullPrimitives = gltf.meshes[hull.mesh].primitives;
  assert(hullPrimitives.some(p=>gltf.materials[p.material].name.startsWith('Oxide red livery')),
    'roof paint must use the pressure hull geometry');
  assert(hullPrimitives.some(p=>gltf.materials[p.material].name.startsWith('Porcelain alloy')));
  const seenTriangles = new Set();
  for (const primitive of hullPrimitives) {
    function readAccessor(index) {
      const a=gltf.accessors[index], view=gltf.bufferViews[a.bufferView];
      const offset=binStart+(view.byteOffset||0)+(a.byteOffset||0);
      const width=a.type==='VEC3'?3:1, size=a.componentType===5123?2:4;
      return Array.from({length:a.count},(_,i)=>Array.from({length:width},(_,k)=>{
        const start=offset+i*(view.byteStride||width*size)+k*size;
        return a.componentType===5126?bytes.readFloatLE(start):size===2?bytes.readUInt16LE(start):bytes.readUInt32LE(start);
      }));
    }
    const points=readAccessor(primitive.attributes.POSITION);
    const indices=readAccessor(primitive.indices).flat();
    for(let i=0;i<indices.length;i+=3) {
      const signature=indices.slice(i,i+3).map(index=>points[index].map(v=>v.toFixed(5)).join(',')).sort().join('/');
      assert(!seenTriangles.has(signature),'no coincident hull triangles across paint materials');
      seenTriangles.add(signature);
    }
  }
  function vertices(node) {
    assert(!node.matrix && !node.rotation && !node.scale && !node.translation,'authored metre coordinates');
    const a = gltf.accessors[gltf.meshes[node.mesh].primitives[0].attributes.POSITION];
    assert.equal(a.componentType,5126);
    const view = gltf.bufferViews[a.bufferView], start = binStart+(view.byteOffset||0)+(a.byteOffset||0);
    return Array.from({length:a.count},(_,i) => [0,1,2].map(k=>bytes.readFloatLE(start+i*(view.byteStride||12)+k*4)));
  }
  function extent(node, axis) {
    const values = vertices(node).map(p=>p[axis]);
    return Math.max(...values)-Math.min(...values);
  }
  const doors = gltf.nodes.filter(n=>n.name?.startsWith('Passenger door'));
  const windows = gltf.nodes.filter(n=>n.name?.startsWith('Passenger glazing'));
  assert(doors.length >= 4 && windows.length >= 50);
  for (const node of doors) {
    assert(Math.abs(extent(node,1)-2.10)<1e-4,'actual door height');
    assert(Math.abs(extent(node,2)-1.05)<1e-4,'actual door width');
  }
  for (const node of windows) {
    assert(Math.abs(extent(node,1)-.80)<1e-4,'actual window height');
    assert(Math.abs(extent(node,2)-.65)<1e-4,'actual window width');
  }
  const panes = gltf.nodes.filter(n=>n.name?.startsWith('Flush airline windshield'));
  assert.equal(panes.length,4);
  assert(!gltf.nodes.some(n=>/Bridge red roof|Windshield perimeter frame|Forward and quarter windshield/.test(n.name||'')));
  for (const pane of panes) for (const [x,z,negativeY] of vertices(pane)) {
    const [w,h] = section(-negativeY-.008,dimensions);
    assert(Math.abs((x/w)**2+(z/h)**2-1)<.0001,'windshield follows original hull within float precision');
  }
  const sightlines = JSON.parse(fs.readFileSync(path.join(root,key+'-visibility.json')));
  assert.equal(sightlines.rays.length,30);
  assert(sightlines.rays.every(ray=>ray.blocked.length===0));
  measured.push({windows:windows.length,doors:doors.length,dimensions});
}
assert(measured[1].windows > measured[0].windows*4,'liner adds windows and decks');
assert(Math.abs(measured[1].dimensions.deckFloors[1]-measured[1].dimensions.deckFloors[0]-3.1)<1e-8);
console.log('PASS civilian airliners: metre-scale doors/windows, flush glazing, seated sightlines and single-surface hull paint');
