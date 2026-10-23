'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('experiments/evacuation-scenery.js','utf8');
const context={U:16.666666666666668,paint:{}};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('    function buildDepot('),source.indexOf('    /** @type {ReturnType<typeof buildDepot>}'))+'\nthis.build=buildDepot;',context);
const asset=JSON.parse(fs.readFileSync('assets/depots/refueling-v1/depot.json','utf8'));
const before=JSON.stringify(asset.materials),batches=context.build(asset);
const index=asset.batches.findIndex(b=>b.material==='safety-orange');
assert(index>=0);
const color=batches[index].batch.color;
for(const [i,expected] of [0.97769,0.44920,0.17184].entries())assert(Math.abs(color[i]-expected)<.0001,'Safety orange retains its authored display color');
assert.equal(JSON.stringify(asset.materials),before,'Conversion never changes the source palette');
for(let i=0;i<batches.length;i++){
    const out=batches[i].batch,input=asset.batches[i];
    assert.equal(out.vertices.length,input.positions.length/3*(input.uvs?8:6));
    assert.equal(out.staticGeometry,true);
    assert(out.color.every(Number.isFinite));
}
console.log('PASS evacuation depot colors: linear palette converts to display sRGB, safety orange and immutable source colors');
