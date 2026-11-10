'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('experiments/evacuation-scenery.js','utf8');
const context={U:16.666666666666668,paint:{kind:'caution'},machineryPaint:{kind:'industrial'},stationPaint:{kind:'station'}};
vm.createContext(context);
vm.runInContext(source.match(/var depotTextures=([^;]+);/)[0],context);
vm.runInContext(source.slice(source.indexOf('    function buildDepot('),source.indexOf('    /** @type {ReturnType<typeof buildDepot>}'))+'\nthis.build=buildDepot;',context);
const asset = require('./depot-asset.cjs');
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
    if(input.uvs){
        assert.equal(out.stride,8);
        assert.equal(out.texture,input.material==='caution-paint'?context.paint:input.material==='station-paint'?context.stationPaint:context.machineryPaint,'Each fitted surface samples its own image');
        for(let v=0;v<input.uvs.length/2;v++){
            assert.equal(out.vertices[v*8+6],input.uvs[v*2]);
            assert.equal(out.vertices[v*8+7],Math.fround(1-input.uvs[v*2+1]),'Flight flipY=false textures address image rows from the top');
        }
    }else assert.equal(out.texture,undefined);
}
console.log('PASS evacuation depot materials: linear palette, safety orange, shared freighter/caution texture routing and preserved UVs');
