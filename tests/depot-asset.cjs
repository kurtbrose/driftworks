'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={TextDecoder,Float32Array,Uint16Array,Uint32Array,DataView,Uint8Array,JSON};
vm.createContext(context);
vm.runInContext(fs.readFileSync('experiments/depot-asset.js','utf8').replace('export function','function'),context);
const bytes=fs.readFileSync('assets/depots/refueling-v1/depot.glb');
const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
assert(bytes.length<14*1024*1024,'Depot stays compact without decimation');
assert.equal(doc.meshes.length,138,'Keep material batches and articulated modules');
assert.deepEqual(doc.nodes[0].rotation,[-Math.SQRT1_2,0,0,Math.SQRT1_2]);
let triangles=0,vertices=0;
for(const mesh of doc.meshes)for(const primitive of mesh.primitives){
    const position=doc.accessors[primitive.attributes.POSITION],normal=doc.accessors[primitive.attributes.NORMAL],index=doc.accessors[primitive.indices];
    assert.equal(position.componentType,5126);assert.equal(position.count,normal.count);
    assert.equal(index.type,'SCALAR');assert([5123,5125].includes(index.componentType));
    const view=doc.bufferViews[index.bufferView],offset=28+bytes.readUInt32LE(12)+view.byteOffset;
    for(let i=0;i<index.count;i++)assert((index.componentType===5123?bytes.readUInt16LE(offset+i*2):bytes.readUInt32LE(offset+i*4))<position.count,'Index remains inside its vertex buffer');
    triangles+=index.count/3;vertices+=position.count;
}
assert.equal(triangles,375793);assert.equal(vertices,439838);
const paint=doc.materials.find(m=>m.name==='caution-paint');
assert.equal(paint.pbrMetallicRoughness.baseColorTexture.index,0);
assert.deepEqual(doc.samplers,[{wrapS:10497,wrapT:10497}]);
assert.equal(doc.images[0].uri,'caution-paint.png');
const light=doc.materials.find(m=>m.name==='red-light');
assert.equal(light.extensions.KHR_materials_emissive_strength.emissiveStrength,2);
assert.throws(()=>context.decodeDepot(new ArrayBuffer(12)),/Invalid depot GLB/);
module.exports=context.decodeDepot(buffer);
