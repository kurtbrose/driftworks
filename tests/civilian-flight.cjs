'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
for(const name of ['commuter','double-decker']){
    const root='assets/ships/civilian-airliners/'+name;
    const meta=JSON.parse(fs.readFileSync(root+'-flight.json','utf8'));
    assert.equal(meta.sourceSha256,crypto.createHash('sha256').update(fs.readFileSync(root+'.glb')).digest('hex'),'Regenerate flight geometry after changing its GLB');
    const data=fs.readFileSync(root+'-flight.bin');
    assert.equal(meta.batches.length,9,'Preserve every material while batching static surfaces');
    const bounds=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];
    for(const batch of meta.batches){
        assert.equal(batch.count%18,0);assert(batch.offset+batch.count*4<=data.length);
        for(let i=0;i<batch.count;i+=6){
            for(let k=0;k<3;k++){const v=data.readFloatLE(batch.offset+(i+k)*4);assert(Number.isFinite(v));bounds[k][0]=Math.min(bounds[k][0],v);bounds[k][1]=Math.max(bounds[k][1],v);}
            const normal=[3,4,5].map(k=>data.readFloatLE(batch.offset+(i+k)*4));
            assert(Math.abs(Math.hypot(...normal)-1)<.001,'Normals survive node rotations');
        }
    }
    const nominal=name==='commuter'?72:180;
    assert(bounds[1][1]-bounds[1][0]>=nominal-.01&&bounds[1][1]-bounds[1][0]<nominal*1.2,'Authored metre scale and +Y bow survive glTF conversion');
    assert(Math.abs(meta.refuel[2]-bounds[2][0])<3,'Ventral contact stays on the underside');
    assert.equal(meta.forward,'+Y');assert.equal(meta.up,'+Z');
}
console.log('PASS civilian flight buffers: source revisions, nine material groups, node normals, metre scale and ventral contacts');
