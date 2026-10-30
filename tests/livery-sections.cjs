'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('node:path');
const c={window:{Driftworks:{}},Float32Array};vm.createContext(c);
for(const file of ['src/mesh-builder.js','assets/ships/quaternius-ultimate-spaceships/meshes.js','src/ship-catalog.js', 'src/ship-hulls.js', 'src/ship-assets.js', 'src/ship-render.js', 'experiments/ship-packs.js','experiments/hull-panels.js','experiments/livery-sections.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8').replaceAll('export function','function'),c);
const DW=c.window.Driftworks,entry=DW.shipPacks.flatMap(p=>p.models).find(m=>m.name==='Spitfire'),batch=DW.shipPackModels.sourceGeometry(entry,[{eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]}],1),v=batch.vertices,stride=batch.stride||6;
const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<v.length;i+=stride)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],v[i+k]);hi[k]=Math.max(hi[k],v[i+k]);}const extent=Math.max(...hi.map((x,k)=>x-lo[k]));for(let i=0;i<v.length;i+=stride)for(let k=0;k<3;k++)v[i+k]=(v[i+k]-(lo[k]+hi[k])/2)*2/extent;
const source=v.slice(),artistRegions=c.analyzeHull([batch]),plan=c.tubularSections(artistRegions);
assert.deepEqual(v,source,'Section analysis preserves source geometry');
assert(plan.tubes.some(t=>Math.abs(t.axis[1])>.98&&Math.abs(t.center[0])>.5),'Actual faceted pods expose local longitudinal axes');
console.log('Detected',plan.stats.tubes,'local tubes and',plan.stats.transitions,'profile transitions');
console.log('PASS local tubular section inference on the artist model');

function fixture(profile,rotate=p=>p){const g={h:[]},mesh=DW.meshBuilder.create(g),point=(t,r,a)=>rotate([Math.cos(a)*r,t,Math.sin(a)*r]);for(let i=0;i<12;i++)for(let j=0;j<profile.length-1;j++){const a=i*Math.PI/6,b=(i+1)*Math.PI/6;mesh.plate('h',[point(...profile[j],a),point(...profile[j+1],a),point(...profile[j+1],b),point(...profile[j],b)]);}return c.analyzeHull([{vertices:new Float32Array(g.h)}]);}
const shaped=fixture([[-2,1.2],[-1.2,1.2],[-1.2,1],[1.2,1],[1.2,1.2],[2,1.2]]),sections=c.tubularSections(shaped);
assert(sections.stats.transitions>=2,'Radius steps create measured axial sections');
assert.equal(sections.sample([1,0,0],[1,0,0]).slot,0,'Long barrel retains primary surface');assert.equal(sections.sample([1.2,1.6,0],[1,0,0]).slot,2,'Raised collar is a whole contrasting section');
assert.equal(sections.sample([1.08,2,0],[0,1,0]).slot,2,'End-facing shoulder uses contrasting surface');assert.equal(sections.sample([.7,1.6,0],[-1,0,0]).slot,3,'Recessed inner surface uses detail material');
const plain=c.tubularSections(fixture([[-2,1],[2,1]]));assert.equal(plain.stats.transitions,0);assert.equal(plain.sample([1,0,0],[1,0,0]),null,'An uninterrupted cylinder does not get arbitrary thirds');
const g={h:[]};DW.meshBuilder.create(g).block('h',[0,0,0],[1,2,1]);assert.equal(c.tubularSections(c.analyzeHull([{vertices:new Float32Array(g.h)}])).stats.tubes,0,'A rectangular prism is not classified as a tube');
const angle=.61,rotate=p=>[Math.cos(angle)*p[0]-Math.sin(angle)*p[1],Math.sin(angle)*p[0]+Math.cos(angle)*p[1],p[2]],rotated=c.tubularSections(fixture([[-2,1.2],[-1.2,1.2],[-1.2,1],[1.2,1],[1.2,1.2],[2,1.2]],rotate));
assert.equal(rotated.sample(rotate([1.2,1.6,0]),rotate([1,0,0])).slot,2,'Section treatment follows the local axis after rotation');
console.log('PASS generic section roles: barrel, collar, end, inset, rotated axis, straight-tube and box rejection');

const pod=plan.tubes.find(t=>Math.abs(t.axis[1])>.98&&t.center[0]>.5&&t.transitions>0);
const middle=(pod.body.lo+pod.body.hi)/2,bodyRun=pod.intervals.find(s=>middle>=s.lo&&middle<=s.hi),collarRun=pod.intervals.find(s=>(s.lo+s.hi)/2<pod.body.lo-.02||(s.lo+s.hi)/2>pod.body.hi+.02);assert(bodyRun&&collarRun,'Artist pod supplies distinct measured profile sections');
const pointOn=run=>pod.center.map((x,k)=>x+pod.axis[k]*(run.lo+run.hi)/2+(k===0?run.radius:0));
assert.notEqual(plan.sample(pointOn(bodyRun),[1,0,0]).slot,plan.sample(pointOn(collarRun),[1,0,0]).slot,'Artist pod middle and whole end assembly get distinct materials');

assert.equal(sections.sample([.5,2,0],[0,1,0]).slot,2,'A solid coplanar end cap is not mistaken for a recessed opening');

assert.strictEqual(c.tubularSections(shaped),sections,'Preference edits reuse immutable structural analysis');

for(const file of ['experiments/livery-symmetry.js','experiments/livery-design.js','experiments/livery-art.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export function','function').replaceAll('export const','var'),c);
const finalSample=c.chunkTreatment(artistRegions,17,null,{contours:.75,coherence:.7,accents:.95,sections:1});

const mirroredSample=c.chunkTreatment(artistRegions,17,{normal:[1,0,0],offset:0,coverage:1,error:0},{contours:.75,coherence:.7,accents:.95,sections:1});
const roles=new Map();let checked=0;
for(const r of artistRegions)for(const f of r.faces){const anchor=[0,1,2].map(k=>f.v.reduce((sum,p)=>sum+p[k],0)/3);if(anchor[0]<.7)continue;
 const tube=plan.tubes.find(t=>t.center[0]>.7&&Math.abs(anchor[2]-t.center[2])<t.body.radius*1.1);if(!tube)continue;
 const axial=anchor.reduce((sum,x,k)=>sum+x*tube.axis[k],0),radial=[0,1,2].map(k=>anchor[k]-tube.center[k]-tube.axis[k]*axial),radius=Math.hypot(...radial),outward=f.normal.reduce((sum,x,k)=>sum+x*radial[k],0)/(radius||1);
 if(outward<.8||radius<tube.body.radius*.85||axial<tube.lo||axial>tube.hi)continue;
 const role=axial>tube.body.lo+.01&&axial<tube.body.hi-.01?'barrel':axial<tube.body.lo-.02?'first end assembly':axial>tube.body.hi+.02?'second end assembly':null;if(!role)continue;
 const expected=role==='barrel'?[1,0,0]:[0,0,1];
 for(const weights of [[.2,.3,.5],[.6,.2,.2],[.2,.6,.2]]){const p=[0,1,2].map(k=>f.v.reduce((sum,q,j)=>sum+q[k]*weights[j],0)),value=finalSample(p,f.normal,3,anchor,f.normal);assert.deepEqual(Array.from(value),expected,'Final generated weights stay constant within whole exterior sections, despite material islands/contours');const reflect=v=>[-v[0],v[1],v[2]];assert.deepEqual(mirroredSample(p,f.normal,3,anchor,f.normal),mirroredSample(reflect(p),reflect(f.normal),3,reflect(anchor),reflect(f.normal)),'Whole-section assignment preserves bilateral symmetry');checked++;roles.set(role,expected);}
}
assert(checked>30,'Exercise samples many locations around real faceted pod sections');assert(roles.has('barrel')&&roles.has('first end assembly')&&roles.has('second end assembly'));
console.log('PASS whole-section coherence: final material weights uniform within real pod sections and contrasting across sections');
