'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),DW={shipPacks:[]},context=vm.createContext({window:{Driftworks:DW}});
const files=fs.readdirSync(path.join(root,'assets/ships')).map(name=>'assets/ships/'+name+'/meshes.js').filter(file=>fs.existsSync(path.join(root,file)));
for(const file of files)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
for(const file of ['src/ship-catalog.js', 'src/ship-hulls.js', 'src/ship-assets.js', 'src/ship-render.js', "experiments/ship-packs.js"])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const {build}=require('../tools/bake-hull-indices.cjs'),scorchReference=require('./fixtures/scorch-reference.cjs');
const pose={eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]},copy=value=>JSON.parse(JSON.stringify(value));
let models=0;for(const pack of DW.shipPacks)for(const model of pack.models){
 const data=model.hullIndex;assert.equal(data.version,1);assert.equal(data.vertexCount,model.vertices.length);
 assert.equal(data.sourceHash,crypto.createHash('sha256').update(JSON.stringify(model.vertices)).digest('hex'),'bake fingerprint '+model.id);
 const expected=build(model.vertices,Array.from({length:model.vertices.length/18},(_,i)=>i*18));
 assert.deepEqual(structuredClone(data.tree),expected,'exact deterministic bounds/triangle ownership '+model.id);
 let radius=0;for(let i=0;i<model.vertices.length;i+=6)radius=Math.max(radius,Math.hypot(...model.vertices.slice(i,i+3)));assert.equal(data.radius,radius);
 const fallback={...model};delete fallback.hullIndex;
 let treeReads=0;const baked={...model,hullIndex:{...data,get tree(){treeReads++;return data.tree;}}};
 for(let trial=0;trial<12;trial++){
  const offset=Math.floor((model.vertices.length/18-1)*trial/11)*18;
  const p=[0,1,2].map(k=>(model.vertices[offset+k]+model.vertices[offset+6+k]+model.vertices[offset+12+k])/3);
  const a=p.map((v,k)=>v+(k===2?2:0)),b=p.map((v,k)=>v-(k===2?2:0));
  const hit=DW.shipPackModels.hullHit(baked,pose,a,b,1,.12),oracle=DW.shipPackModels.hullHit(fallback,pose,a,b,1,.12);
  const comparable=h=>h&&{fraction:h.fraction,point:h.point,local:h.local,normal:h.normal};assert.deepEqual(copy(comparable(hit)),copy(comparable(oracle)),'baked/fallback sweep '+model.id);
  if(trial===0&&hit){const original={},actual={};scorchReference(original,hit);DW.shipPackModels.addScorch(actual,hit);assert.equal(JSON.stringify(actual),JSON.stringify(original),'exact real-mesh scorch '+model.id);}
 }
 assert.equal(treeReads,1,'tree is adopted once without reconstruction');models++;
}
console.log('PASS baked hull indices: '+models+' models, fingerprints, exact trees/radii, 192 baked/fallback sweeps, real-mesh scorch equality and cached adoption');
