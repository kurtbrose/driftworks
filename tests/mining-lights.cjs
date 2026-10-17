const assert=require('node:assert/strict');
const L=global.Driftworks.miningLights;
const identity=L.model;
const roof=L.irradiance(identity,[0,0,14.1],[0,0,1]);
assert.ok(roof[2]>.4,'Docking roof remains illuminated without sunlight');
assert.ok(L.irradiance(identity,[4.4,0,13.4],[1,0,0])[2]>.2,'Wash reaches the upper hull and docking coaming');
assert.ok(L.irradiance(identity,[0,0,1],[0,0,1])[0]<.1,'Deck retains coarse occlusion underneath');
assert.deepEqual(L.irradiance(identity,[100,100,100],[0,0,1]),[0,0,0]);
const pose={world:p=>[10-p[1]*2,20+p[0]*2,30+p[2]*2],rotate:p=>[-p[1],p[0],p[2]]};
const moved=L.rig(pose,2);
for(const p of [[0,0,14],[22,12,1],[-10,2,6]]){
 const expected=L.irradiance(identity,p,[0,0,1]),actual=L.irradiance(moved,pose.world(p),[0,0,1]);
 expected.forEach((v,k)=>assert.ok(Math.abs(v-actual[k])<1e-12,'Lighting follows rig rotation, translation and physical scale'));
}
assert.deepEqual(L.irradiance(L.rig(pose,2,0),pose.world([0,0,14]),[0,0,1]),[0,0,0]);
assert.equal(L.uniforms([identity,moved,identity],[0,0,0],0,1).uRigCount,2);
assert.equal(Object.values(L.fixtureCounts).reduce((a,b)=>a+b),51);
assert.equal(L.fields.length,3,'Many visible fixtures share three lighting fields');
const fixtures=global.Driftworks.scene3d.miningPlatformLights();
assert.equal(fixtures,global.Driftworks.scene3d.miningPlatformLights(),'Static fixtures reuse cached geometry');
assert.ok(fixtures.lamp.length>0);
console.log('Mining lights: broad illumination, occlusion, docking wash and rigid transforms passed');

const vertexData=new Float32Array([0,0,14.1,0,0,1, 0,0,1,0,0,1, 20,0,14,0,0,1]);
const original=Array.from(vertexData),baked=L.bakeDocking(vertexData);
assert.equal(L.bakeDocking(vertexData),baked,'Unchanged local geometry reuses its bake');
assert.deepEqual(Array.from(vertexData),original,'Baking preserves geometry and normals');
assert.ok(baked[2]>.4,'Fixed docking roof stores independent blue illumination');
assert.deepEqual(Array.from(baked.slice(3)),[0,0,0,0,0,0],'Moving equipment and terrain receive no fixed hull bake');
const transformed=global.Driftworks.miningTerrain.transform({vertices:vertexData,bakedDocking:baked},pose);
assert.equal(transformed.bakedDocking,baked,'Landing transforms preserve the independent local lighting attribute');
assert.deepEqual(Array.from(L.bakeDocking(new Float32Array(vertexData))),Array.from(baked),'Rebuilt geometry reuses identical lighting samples');
console.log('Mining docking bake: cached local illumination survives landing transforms without changing albedo');
const catalog=global.Driftworks.originalShipModels.find(m=>m.id==='driftworks:mining-rig');
const full=catalog.geometry(1),small=catalog.geometry(10);
assert.ok(full.some(b=>b.bakedDocking&&b.bakedDocking.some(v=>v>0)),'Reusable model catalog carries baked lighting');
full.forEach((b,i)=>assert.equal(b.bakedDocking,small[i].bakedDocking,'Catalog scaling preserves light contribution'));
