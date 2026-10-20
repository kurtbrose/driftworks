'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{performance}=require('node:perf_hooks');
const root=path.join(__dirname,'..'),DW={sim:{METERS_PER_UNIT:10000/600}},ctx=vm.createContext({window:{Driftworks:DW},Float32Array,Map,Math});
for(const file of ['experiments/retail-profiles.js','experiments/flight-model.js','experiments/retail-weapons.js','experiments/guns.js','experiments/training.js','assets/ships/aegis-kit/flight-rig.js','experiments/aegis-flight.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const rig=DW.aegisFlight.create(),first=rig.geometry();
for(let i=0;i<10;i++)rig.geometry();
const start=performance.now();let replaced=0;
for(let i=0;i<120;i++){const next=rig.geometry();for(let j=0;j<next.length;j++)if(next[j].vertices!==first[j].vertices)replaced+=next[j].vertices.byteLength;}
console.log(JSON.stringify({batches:first.length,triangles:first.reduce((n,b)=>n+b.vertices.length/18,0),geometryMsPerFrame:(performance.now()-start)/120,recreatedVertexBytesPerFrame:replaced/120}));
for(const file of ['assets/ships/quaternius-ultimate-spaceships/meshes.js','experiments/ship-packs.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
const model=DW.shipPackModels.find('quaternius-ultimate-spaceships:Spitfire').model,v=model.vertices;
const craft=DW.training.createCraft('benchmark',DW.arcade.create(0),'enemy');
const impact={fraction:0,point:[0,0,0],model,local:[0,1,2].map(k=>(v[k]+v[k+6]+v[k+12])/3),normal:v.slice(3,6)};
DW.shipPackModels.addScorch(craft,impact);
const markStart=performance.now();for(let i=0;i<20;i++)DW.shipPackModels.addScorch(craft,impact);
console.log(JSON.stringify({fighterTriangles:v.length/18,scorchMsPerImpact:(performance.now()-markStart)/20}));
const pose=DW.arcade.create(0);pose.eye=[0,0,0];
const collisionStart=performance.now();for(let i=0;i<100;i++)DW.shipPackModels.hullHit(model,pose,[0,-1,0],[0,1,0],DW.sim.METERS_PER_UNIT,DW.retailWeapons[0].headRadius||0);
console.log(JSON.stringify({meshCollisionMsPerTrace:(performance.now()-collisionStart)/100,headRadius:DW.retailWeapons[0].headRadius}));
for(const padding of [0,.12]){const begin=performance.now();for(let i=0;i<100;i++)DW.shipPackModels.hullHit(model,pose,[0,-1,0],[0,1,0],DW.sim.METERS_PER_UNIT,padding);console.log(JSON.stringify({headRadius:padding,collisionMs:(performance.now()-begin)/100}));}
for(const method of ['scorchGeometry','sourceScorchGeometry']){DW.shipPackModels[method]([craft],model.id,1,DW.sim.METERS_PER_UNIT);const begin=performance.now();for(let i=0;i<50;i++)DW.shipPackModels[method]([craft],model.id,1,DW.sim.METERS_PER_UNIT);console.log(JSON.stringify({method,msPerDraw:(performance.now()-begin)/50}));}
