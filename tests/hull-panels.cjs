'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const context={window:{Driftworks:{}},Float32Array};vm.createContext(context);
vm.runInContext(read('src/mesh-builder.js'),context);
vm.runInContext(read('experiments/hull-panels.js').replaceAll('export function','function'),context);
const {analyzeHull,buildHullPanels}=context;
const groups={armor:[]};context.window.Driftworks.meshBuilder.create(groups).block('armor',[0,0,0],[1,1,1]);
const cube={vertices:new Float32Array(groups.armor)},original=cube.vertices.slice(),options={style:1,divisions:2,relief:.6,seed:17};
const regions=analyzeHull([cube]);assert.equal(regions.length,6,'A cube has six coherent faces, not twelve independent triangle panels');
assert(regions.every(region=>region.faces.length===2));
const result=buildHullPanels([cube],options);assert.equal(result.plates,12,'Two broad plates per cube face');assert.equal(result.details,0,'Clean armor leaves its surfaces quiet');
assert.deepEqual(cube.vertices,original,'Analysis and plate construction never mutate source geometry');
assert.deepEqual(buildHullPanels([cube],options),result,'Deterministic reconstruction');
assert.notDeepEqual(buildHullPanels([cube],{...options,seed:91}).panels,result.panels,'Seed changes layout');
for(const role of ['cockpit','mechanical','structural','marking'])assert.equal(buildHullPanels([{...cube,role}],{...options,assisted:true}).plates,0,role+' excluded by semantic role');
assert.equal(buildHullPanels([{...cube,role:'cockpit',color:[.1,.1,.1]}],options).plates,result.plates,'Geometry-only ignores authored tags and dark colors');
assert.equal(buildHullPanels([{...cube,opacity:.3}],{...options,assisted:true}).plates,0,'Glazing excluded');
assert.equal(buildHullPanels([{...cube,eligible:()=>false}],{...options,assisted:true}).plates,0,'Source texture exclusion mask respected');

// Add tessellation without changing the surface: no new construction seams.
const refined=[];
for(let i=0;i<cube.vertices.length;i+=18){const a=Array.from(cube.vertices.slice(i,i+6)),b=Array.from(cube.vertices.slice(i+6,i+12)),c=Array.from(cube.vertices.slice(i+12,i+18)),m=a.map((v,k)=>(v+b[k]+c[k])/3);for(const triangle of [[a,b,m],[b,c,m],[c,a,m]])refined.push(...triangle.flat());}
const subdivided=buildHullPanels([{vertices:new Float32Array(refined)}],options);
assert.equal(subdivided.regions,6,'Region boundaries ignore coplanar tessellation');assert.equal(subdivided.plates,result.plates,'More triangles do not mean more plates');

function mesh(points,triangles){const v=[];triangles.forEach(face=>face.forEach(index=>v.push(...points[index],0,0,1)));return {vertices:new Float32Array(v)};}
const concave=mesh([[0,0,0],[2,0,0],[2,1,0],[1,1,0],[1,2,0],[0,2,0]],[[0,1,3],[1,2,3],[0,3,5],[3,4,5]]);
const fitted=buildHullPanels([concave],{...options,style:5});
assert.equal(fitted.regions,1,'Concave connected surface remains one region');
for(const batch of fitted.panels)for(let i=0;i<batch.vertices.length;i+=8){const [x,y,z]=batch.vertices.slice(i,i+3);assert(x>=-1e-5&&y>=-1e-5&&x<=2.00001&&y<=2.00001,'Plate stays within outer boundary');assert(x<=1.00001||y<=1.00001,'No plate or detail bridges the concave cutout');assert(z>=0,'Plate sits above source surface');}
// A ring has a real inner loop. Do not fill it with a convex replacement polygon.
const ringPoints=[[0,0,0],[2,0,0],[2,2,0],[0,2,0],[.6,.6,0],[1.4,.6,0],[1.4,1.4,0],[.6,1.4,0]],ringFaces=[];
for(let i=0;i<4;i++){const j=(i+1)%4;ringFaces.push([i,j,4+j],[i,4+j,4+i]);}
const ring=buildHullPanels([mesh(ringPoints,ringFaces)],options);assert.equal(ring.regions,1);
for(const batch of ring.panels)for(let i=0;i<batch.vertices.length;i+=8){const x=batch.vertices[i],y=batch.vertices[i+1];assert(x<=.60001||x>=1.39999||y<=.60001||y>=1.39999,'Inner opening remains empty');}
for(const style of [1,2,3,4,5,6]){
 const output=buildHullPanels([cube],{...options,style});assert(output.plates>0);
 for(const batch of output.panels){assert.equal(batch.vertices.length%24,0);assert(batch.vertices.every(Number.isFinite));for(let i=0;i<batch.vertices.length;i+=8)assert(Math.hypot(...batch.vertices.slice(i+3,i+6))>.99,'Finite unit normals on caps, bevels and walls');}
}
function sphere(steps){
 const data=[];
 function point(lat,lon){return [Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];}
 function emit(a,b,c){if(Math.hypot(...a.map((v,k)=>v-b[k]))<1e-8||Math.hypot(...a.map((v,k)=>v-c[k]))<1e-8)return;for(const p of [a,b,c])data.push(...p,...p);}
 for(let j=0;j<steps;j++)for(let i=0;i<steps*2;i++){const a=-Math.PI/2+j*Math.PI/steps,b=a+Math.PI/steps,c=i*Math.PI/steps,d=c+Math.PI/steps,p=point(a,c),q=point(a,d),r=point(b,d),s=point(b,c);emit(p,q,r);emit(p,r,s);}
 return {vertices:new Float32Array(data)};
}
const coarse=buildHullPanels([sphere(12)],options),dense=buildHullPanels([sphere(24)],options);
assert.equal(coarse.regions,6,'Same normal-field detector finds coherent curved charts without a sphere hint');
assert.equal(dense.regions,coarse.regions,'Curved chart count survives increased tessellation');
assert.equal(dense.plates,coarse.plates,'More sphere triangles do not create more plates');
const variants=[1,2,3,4,5,6].map(style=>buildHullPanels([cube],{...options,style}));
assert.equal(new Set(variants.map(v=>v.operation)).size,6,'Six distinct construction operations, not six panel parameter sets');
assert(variants[1].panels.length>variants[0].panels.length,'Layered grammar retains lower shell plus upper courses');
assert(variants[2].details>0,'Industrial grammar emits structural pieces');
assert(variants[3].panels[0].vertices.length>variants[0].panels[0].vertices.length,'Blankets carry actual subdivided padding geometry');
for(const batch of variants[4].panels)for(let i=0;i<batch.vertices.length;i+=8)assert(Math.max(...batch.vertices.slice(i,i+3).map(Math.abs))<1.002,'Paint grammar stays flush');
assert.equal(variants[5].operation,'planar-chine-reconstruction');
console.log('PASS geometry-aware plates: adjacency, semantic exclusions, tessellation independence, concavity, holes, deterministic real geometry');
