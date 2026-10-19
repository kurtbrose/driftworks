'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const DW={};
const controls=new Map();
const defaults={layout:'solo',subject:'A',grammar:'1',scale:'2',relief:'55',wear:'20',seed:'17',primary:'#c5cec9',secondary:'#38474d',accent:'#ee912e'};
let uploaded=new Float32Array(),uploads=0;
const gl=new Proxy({
 createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getAttribLocation:()=>0,getUniformLocation:()=>({}),getExtension:()=>({}),
 bufferData:(target,data)=>{uploaded=data;uploads++;}
},{get:(target,key)=>key in target?target[key]:()=>{}});
const canvas={getContext:()=>gl,addEventListener:()=>{},clientWidth:900,clientHeight:700};
for(const id of ['subject','grammar','scale','relief','wear','seed','primary','secondary','accent','description','scale-value','compare','split-label','spin','shuffle','palette','reset','quarter','top','side','caption','layout','sky','viewer','labels','collection','source-blend','regions','analysis','masks'])controls.set(id,{value:defaults[id]||'',checked:false,selectedOptions:[{textContent:id}],textContent:'',replaceChildren:()=>{},append:()=>{}});
DW.flightSkybox={create:()=>({render:()=>{}})};
const sandbox={window:{Driftworks:DW},document:{createElement:()=>({style:{},append:()=>{}}),getElementById:id=>id==='canvas'?canvas:controls.get(id)},Float32Array,requestAnimationFrame:()=>{}};
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
vm.runInContext('(function(){'+read('experiments/hull-panels.js').replaceAll('export function','function')+';window.analyzeHull=analyzeHull;window.buildHullPanels=buildHullPanels;})();',sandbox);
sandbox.analyzeHull=sandbox.window.analyzeHull;sandbox.buildHullPanels=sandbox.window.buildHullPanels;
const lab=read('experiments/livery-lab.js').replace(/^import .*;\r?\n/gm,'');
vm.runInContext(lab,sandbox);
for(const subject of ['cube','sphere','cylinder','random','A','B','C','D','E','fighter','carrier','patrol','escort','tug','mothership',...DW.shipPacks.flatMap(pack=>pack.models.map(model=>model.id))]){
 controls.get('subject').value=subject;controls.get('subject').onchange();
 assert(uploaded.length>0,subject);assert.equal(uploaded.length%36,0,subject+' triangle stride');
 assert(uploaded.every(Number.isFinite),subject+' finite vertices and normals');
 for(let i=0;i<uploaded.length;i+=12){assert(Math.max(...uploaded.slice(i,i+3).map(Math.abs))<=1.06,subject+' centered/fitted');assert(Math.hypot(...uploaded.slice(i+3,i+6))>.9,subject+' valid normal');}
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
console.log('PASS livery lab: all subjects, finite fitted geometry, independent treatments and deterministic assemblies');
