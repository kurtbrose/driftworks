'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('node:path');
const c={window:{Driftworks:{}},Float32Array};vm.createContext(c);
for(const file of ['src/mesh-builder.js','assets/ships/quaternius-ultimate-spaceships/meshes.js','experiments/ship-packs.js','experiments/hull-panels.js','experiments/livery-sections.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8').replaceAll('export function','function'),c);
const DW=c.window.Driftworks,entry=DW.shipPacks.flatMap(p=>p.models).find(m=>m.name==='Spitfire'),batch=DW.shipPackModels.sourceGeometry(entry,[{eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]}],1),v=batch.vertices,stride=batch.stride||6;
const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<v.length;i+=stride)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],v[i+k]);hi[k]=Math.max(hi[k],v[i+k]);}const extent=Math.max(...hi.map((x,k)=>x-lo[k]));for(let i=0;i<v.length;i+=stride)for(let k=0;k<3;k++)v[i+k]=(v[i+k]-(lo[k]+hi[k])/2)*2/extent;
const source=v.slice(),plan=c.tubularSections(c.analyzeHull([batch]));
assert.deepEqual(v,source,'Section analysis preserves source geometry');
assert(plan.tubes.some(t=>Math.abs(t.axis[1])>.98&&Math.abs(t.center[0])>.5),'Actual faceted pods expose local longitudinal axes');
console.log('Detected',plan.stats.tubes,'local tubes and',plan.stats.transitions,'profile transitions');
console.log('PASS local tubular section inference on the artist model');

function fixture(profile,rotate=p=>p){const g={h:[]},mesh=DW.meshBuilder.create(g),point=(t,r,a)=>rotate([Math.cos(a)*r,t,Math.sin(a)*r]);for(let i=0;i<12;i++)for(let j=0;j<profile.length-1;j++){const a=i*Math.PI/6,b=(i+1)*Math.PI/6;mesh.plate('h',[point(...profile[j],a),point(...profile[j+1],a),point(...profile[j+1],b),point(...profile[j],b)]);}return c.analyzeHull([{vertices:new Float32Array(g.h)}]);}
const shaped=fixture([[-2,1.2],[-1.2,1.2],[-1.2,1],[1.2,1],[1.2,1.2],[2,1.2]]),sections=c.tubularSections(shaped);
assert(sections.stats.transitions>=2,'Radius steps create measured axial sections');
assert.equal(sections.sample([1,0,0],[1,0,0]).slot,0,'Long barrel retains primary surface');assert.equal(sections.sample([1.2,1.6,0],[1,0,0]).slot,1,'Raised collar is a whole contrasting section');
assert.equal(sections.sample([1.08,2,0],[0,1,0]).slot,1,'End-facing shoulder uses contrasting surface');assert.equal(sections.sample([.7,1.6,0],[-1,0,0]).slot,3,'Recessed inner surface uses detail material');
const plain=c.tubularSections(fixture([[-2,1],[2,1]]));assert.equal(plain.stats.transitions,0);assert.equal(plain.sample([1,0,0],[1,0,0]),null,'An uninterrupted cylinder does not get arbitrary thirds');
const g={h:[]};DW.meshBuilder.create(g).block('h',[0,0,0],[1,2,1]);assert.equal(c.tubularSections(c.analyzeHull([{vertices:new Float32Array(g.h)}])).stats.tubes,0,'A rectangular prism is not classified as a tube');
const angle=.61,rotate=p=>[Math.cos(angle)*p[0]-Math.sin(angle)*p[1],Math.sin(angle)*p[0]+Math.cos(angle)*p[1],p[2]],rotated=c.tubularSections(fixture([[-2,1.2],[-1.2,1.2],[-1.2,1],[1.2,1],[1.2,1.2],[2,1.2]],rotate));
assert.equal(rotated.sample(rotate([1.2,1.6,0]),rotate([1,0,0])).slot,1,'Section treatment follows the local axis after rotation');
console.log('PASS generic section roles: barrel, collar, end, inset, rotated axis, straight-tube and box rejection');

const pod=plan.tubes.find(t=>Math.abs(t.axis[1])>.98&&t.center[0]>.5&&t.transitions>0);
const bodyRun=pod.intervals.find(s=>Math.abs(s.radius-pod.body.radius)<pod.body.radius*.03),collarRun=pod.intervals.find(s=>Math.abs(s.radius-pod.body.radius)>pod.body.radius*.08);assert(bodyRun&&collarRun,'Artist pod supplies distinct measured profile sections');
const pointOn=run=>pod.center.map((x,k)=>x+pod.axis[k]*(run.lo+run.hi)/2+(k===0?run.radius:0));
assert.notEqual(plan.sample(pointOn(bodyRun),[1,0,0]).slot,plan.sample(pointOn(collarRun),[1,0,0]).slot,'Artist pod barrel and changed-radius section get distinct materials');

assert.equal(sections.sample([.5,2,0],[0,1,0]).slot,1,'A solid coplanar end cap is not mistaken for a recessed opening');
