'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const DW={};
const controls=new Map();
const defaults={layout:'solo',subject:'A',grammar:'1',scale:'2',relief:'55',wear:'20',seed:'17',primary:'#c5cec9',secondary:'#38474d',accent:'#ee912e'};
let uploaded=new Float32Array(),uploads=0;const depthBiases=[],depthCoefficients=[],frontFaces=[];
const gl=new Proxy({
 createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:()=>({}),getExtension:()=>({}),
 CW:2304,frontFace:value=>frontFaces.push(value),
 polygonOffset:(factor,units)=>depthBiases.push([factor,units]),uniform2fv:(location,values)=>depthCoefficients.push(Array.from(values)),
 bufferData:(target,data)=>{uploaded=data;uploads++;}
},{get:(target,key)=>key in target?target[key]:()=>{}});
const canvas={getContext:()=>gl,addEventListener:()=>{},clientWidth:900,clientHeight:700};
for(const id of ['subject','grammar','scale','relief','wear','seed','primary','secondary','accent','description','scale-value','compare','split-label','spin','shuffle','palette','reset','quarter','top','side','caption','layout','sky','viewer','labels','collection','source-blend','regions','analysis','masks','monochrome','directions','art-style','palette-mode','fields','zones','finish','graphics'])controls.set(id,{value:defaults[id]||'',checked:false,selectedOptions:[{textContent:id}],textContent:'',replaceChildren:()=>{},append:()=>{}});
DW.flightSkybox={create:()=>({render:()=>{}})};
const sandbox={devicePixelRatio:1,window:{Driftworks:DW},document:{createElement:()=>({style:{},append:()=>{}}),getElementById:id=>id==='canvas'?canvas:controls.get(id)},Float32Array,requestAnimationFrame:()=>{}};
vm.createContext(sandbox);
vm.runInContext(read('src/mesh-builder.js'),sandbox);
vm.runInContext(read('assets/ships/quaternius-ultimate-spaceships/meshes.js'),sandbox);
vm.runInContext(read('experiments/ship-packs.js'),sandbox);
DW.shipPackModels.loadTextures=()=>new Promise(()=>{});
// The mothership fixture itself is browser-verified; a compact stand-in keeps this
// harness independent of unrelated terrain/shader setup in scene3d.
DW.scene3d={mothershipHardware:()=>({dark:[0,0,0,0,0,1,1,0,0,0,0,1,0,1,0,0,0,1]}),habitatMesh:()=>new Float32Array([0,0,0,0,0,1,1,0,0,0,0,1,0,1,0,0,0,1])};
const fixture=read('experiments/livery-fixtures.js').replaceAll('export function','function');
vm.runInContext('(function(){'+fixture+';window.fighterHull=fighterHull;window.fleetHull=fleetHull;})();',sandbox);
sandbox.fighterHull=sandbox.window.fighterHull;sandbox.fleetHull=sandbox.window.fleetHull;
vm.runInContext('(function(){'+read('experiments/hull-panels.js').replaceAll('export function','function')+';window.analyzeHull=analyzeHull;window.buildHullPanels=buildHullPanels;window.buildGraphicMarks=buildGraphicMarks;})();',sandbox);
sandbox.analyzeHull=sandbox.window.analyzeHull;sandbox.buildHullPanels=sandbox.window.buildHullPanels;sandbox.buildGraphicMarks=sandbox.window.buildGraphicMarks;
vm.runInContext(read('experiments/livery-art.js').replaceAll('export function','function').replaceAll('export const','const'),sandbox);
vm.runInContext(read('experiments/livery-depth.js').replaceAll('export function','function'),sandbox);
const lab=read('experiments/livery-lab.js').replace(/^import .*;\r?\n/gm,'');
vm.runInContext(lab,sandbox);
for(const subject of ['cube','sphere','cylinder','random','A','B','C','D','E','fighter','carrier','patrol','escort','tug','mothership',...DW.shipPacks.flatMap(pack=>pack.models.map(model=>model.id))]){
 controls.get('subject').value=subject;controls.get('subject').onchange();
 assert(uploaded.length>0,subject);assert.equal(uploaded.length%36,0,subject+' triangle stride');
 assert(uploaded.every(Number.isFinite),subject+' finite vertices and normals');
 for(let i=0;i<uploaded.length;i+=12){assert(Math.max(...uploaded.slice(i,i+3).map(Math.abs))<=1.6,subject+' centered/fitted');assert(Math.hypot(...uploaded.slice(i+3,i+6))>.9,subject+' valid normal');}
 const before=uploads;
 for(let grammar=0;grammar<=6;grammar++){controls.get('grammar').value=String(grammar);controls.get('grammar').oninput();assert(controls.get('description').textContent);}
 assert.equal(vm.runInContext('fittedHull(document.getElementById("subject").value).batches[0].vertices.length',sandbox)>0,true,'Source hull remains available');
}
controls.get('subject').value='random';controls.get('subject').onchange();const first=uploaded.slice();controls.get('subject').onchange();assert.deepEqual(uploaded,first,'Same assembly is reproducible');
controls.get('shuffle').onclick();assert.notDeepEqual(uploaded,first,'New assembly changes geometry');assert.equal(controls.get('seed').value,'17','Assembly and paint seeds are independent');
controls.get('compare').checked=true;controls.get('compare').oninput();assert.equal(controls.get('split-label').hidden,false);
controls.get('reset').onclick();assert.equal(controls.get('compare').checked,false);assert.equal(controls.get('grammar').value,'1');
controls.get('layout').value='hangar';controls.get('layout').onchange();assert(uploaded.length>first.length,'Hangar contains multiple subjects and deck');assert(uploaded.every(Number.isFinite),'Hangar finite');
controls.get('collection').value='artists';controls.get('collection').onchange();assert.equal(vm.runInContext('actors.length',sandbox),12,'Eleven artist hulls plus deck');
const artist=DW.shipPacks[0].models[0];controls.get('subject').value=artist.id;controls.get('subject').onchange();assert(uploaded.length/12>=artist.texturedVertices.length/8,'Full source mesh retained beneath generated plates');assert.equal(uploaded[10],Math.fround(artist.texturedVertices[6]),'Original UV u');assert.equal(uploaded[11],Math.fround(artist.texturedVertices[7]),'Original UV v');assert.equal(uploaded[3],Math.fround(artist.texturedVertices[3]),'Original normals');
controls.get('layout').value='matrix';controls.get('layout').onchange();
assert.equal(vm.runInContext('actors.length',sandbox),9,'Source, six treatments, region diagnostic and hangar deck');
assert.deepEqual(Array.from(vm.runInContext('actors.slice(0,8).map(actor=>actor.style)',sandbox)),[0,1,2,3,4,5,6,1],'Per-copy treatment overrides');
const ranges=vm.runInContext('actors.slice(0,8).map(actor=>({start:actor.start,count:actor.count}))',sandbox),sourceCount=artist.texturedVertices.length/8;
const firstSource=uploaded.slice(ranges[0].start*12,(ranges[0].start+sourceCount)*12);
for(const actor of ranges)assert.deepEqual(uploaded.slice(actor.start*12,(actor.start+sourceCount)*12),firstSource,'Every comparison uses identical source vertices, UVs and normals');
controls.get('subject').value='sphere';controls.get('subject').onchange();assert.equal(controls.get('layout').value,'matrix','Changing subject preserves comparison mode');
assert.equal(controls.get('grammar').disabled,true,'Comparison owns each individual grammar');
controls.get('layout').value='solo';controls.get('layout').onchange();controls.get('grammar').value='5';controls.get('grammar').oninput();vm.runInContext('frame(16)',sandbox);
assert(frontFaces.length>=2&&frontFaces.every(value=>value===2304),'Decal culling matches the viewer clockwise projection');
assert.deepEqual(depthBiases,[[-1,-2],[-2,-4]],'Base paint and markings receive distinct ordered decal passes');
assert.equal(depthCoefficients.length,1,'Camera depth range initialized explicitly');const [depthA,depthB]=depthCoefficients[0];assert(Math.abs((depthA*.2-depthB)/.2+1)<1e-10,'Near plane maps to near clip');assert(Math.abs((depthA*100-depthB)/100-1)<1e-10,'Far plane maps to far clip');assert(depthB>.02*19,'Hangar depth precision improves by at least 19x over the tiny-near-plane projection');
controls.get('subject').value='cube';controls.get('subject').onchange();controls.get('directions').value='art';controls.get('directions').oninput();controls.get('layout').value='matrix';controls.get('layout').onchange();
assert.equal(vm.runInContext('actors.length',sandbox),7,'Four art recipes plus original, region preview and deck');
assert.deepEqual(Array.from(vm.runInContext('actors.slice(0,6).map(a=>a.recipe?.id||0)',sandbox)),[0,1,2,3,4,0],'Each art copy owns a distinct recipe');
assert.equal(controls.get('primary').disabled,true,'Recipe palettes are explicit');controls.get('palette-mode').value='shared';controls.get('palette-mode').oninput();assert.equal(controls.get('primary').disabled,false,'Shared custom colors remain editable');
const unmarked=uploaded.length;controls.get('graphics').checked=true;controls.get('graphics').oninput();assert(uploaded.length>unmarked,'Sparse graphics can be enabled independently');assert(vm.runInContext('actors.some(a=>a.recipe?.id===4&&a.passes.some(p=>p.bias===3))',sandbox),'Retro stencil uses its own ordered decal pass');
const beforeFields=uploads;controls.get('fields').oninput();controls.get('zones').oninput();controls.get('finish').oninput();assert.equal(uploads,beforeFields,'Material layers do not rebuild hull geometry');
console.log('PASS livery lab: all subjects, finite fitted geometry, independent treatments and deterministic assemblies');
