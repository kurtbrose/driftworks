'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const hash=g=>Object.fromEntries(Object.entries(g).map(([k,v])=>[k,{length:v.length,sha256:crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}]));
for(const fixture of require('./fixtures/mining-geometry.json')) {
  assert.deepEqual(hash(global.Driftworks.miningRig.geometry(...fixture.args)),fixture.groups,JSON.stringify(fixture.args));
}
console.log('PASS mining rig: exact pre-refactor geometry across 49 poses and component modes');
// Caller edits cannot poison the private static cabin cache or later poses.
const model=global.Driftworks.miningRig.geometry;
const baseline=hash(model(1,0,false,0,''));
const edited=model(1,0,false,0,'');
for(const values of Object.values(edited))values.fill(123);
assert.deepEqual(hash(model(1,123,true,0,'')),baseline);
assert.deepEqual(hash(model(1,0,false,0,'')),baseline);

// Static construction is reused, while each request owns its output arrays.
const fs=require('node:fs'),vm=require('node:vm');
const scope={Driftworks:{miningLights:global.Driftworks.miningLights}};scope.window=scope;
vm.createContext(scope);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/mesh-builder.js'),'utf8'),scope);
let builds=0;const create=scope.Driftworks.meshBuilder.create;
scope.Driftworks.meshBuilder.create=groups=>{builds++;return create(groups);};
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/mining-rig.js'),'utf8'),scope);
const first=scope.Driftworks.miningRig.geometry(1,0,false,0,'');const coldBuilds=builds;builds=0;
const second=scope.Driftworks.miningRig.geometry(1,0,false,0,'');
assert.equal(coldBuilds,3,'Cold request constructs main assembly, cabin and fixtures');
assert.equal(builds,1,'Warm request reuses cabin and fixture construction');
assert.deepEqual(hash(first),hash(second));assert.notEqual(first.steel,second.steel);
const groups={paint:[]},builder=global.Driftworks.meshBuilder.create(groups);
builder.block('paint',[0,0,0],[1,2,3]);
assert.equal(groups.paint.length,36*6);
for(let i=0;i<groups.paint.length;i+=6){assert.ok(Math.abs(groups.paint[i])<=1&&Math.abs(groups.paint[i+1])<=2&&Math.abs(groups.paint[i+2])<=3);assert.equal(Math.hypot(...groups.paint.slice(i+3,i+6)),1);}
console.log('PASS procedural assets: reusable block, private static cache, and caller-owned geometry');
