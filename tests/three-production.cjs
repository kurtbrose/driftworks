'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'../tools/vendor-three-classic.cjs'),'--check']);
const noop=()=>{},hud=new Proxy({},{get:()=>noop,set:()=>true});
function element(){return {width:1,height:1,clientWidth:640,clientHeight:480,style:{},setAttribute:noop,appendChild:noop,addEventListener:noop,querySelector:()=>element(),getContext:type=>{assert.equal(type,'2d','Production never requests a raw GPU context');return hud;}};}
const context=vm.createContext({console,performance,AbortController,Float32Array,Uint8Array,Set,Map,WeakMap,Math,document:{createElement:element},window:null});
context.window=context;context.DRIFTWORKS_TEST_MODE=true;context.addEventListener=noop;
for(const name of ['vendor/three/build/three.global.js',...['propulsion','combat','mining-lights','mining-terrain','logistics','formations','sim','population','session','tactical/camera','engine-audio','audio-mixer','audio','hud','mesh-builder','mining-rig','scene3d','game'].map(n=>'src/'+n+'.js')])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),context,{filename:name});
const THREE=context.THREE,DW=context.Driftworks,frames=[];
THREE.WebGLRenderer=class {setSize(){}setRenderTarget(target){this.target=target;}setClearColor(){}clear(){}render(scene){frames.push(scene.children.map(o=>({geometry:o.geometry,uniforms:Object.fromEntries(Object.entries(o.material.uniforms).map(([k,v])=>[k,v.value])),material:o.material,blending:o.material.blending,depthWrite:o.material.depthWrite})));}};
DW.audio=null;
let world=DW.sim.createInitialWorld();Object.assign(world,{asteroids:[],ships:[],platforms:[],wrecks:[],packets:[],selectedShipIds:[]});world.combat.drones=[];
const viewer=DW.scene3d.create(element(),()=>world,w=>{world=w;},{study:true});
const data=new Float32Array([0,0,0,0,0,1,1,0,0,0,0,1,0,1,0,0,0,1]);
const batches=[{vertices:data,color:[.2,.3,.4],origin:[1,2,3],staticGeometry:true},{vertices:new Float32Array(data),color:[.7,.6,.5],origin:[4,5,6],opacity:.5}];
viewer.setStudyActors(batches);viewer.setStudyEffects([{vertices:new Float32Array(data),color:[1,.2,.1]}]);
viewer.render(world,1,0,0);assert.equal(frames.length,1,'One Three render submits the whole pass');
const first=frames[0];assert.equal(first.length,3);
assert.deepEqual(Array.from(first[0].uniforms.uColor),batches[0].color);assert.deepEqual(Array.from(first[1].uniforms.uColor),batches[1].color);
assert.deepEqual(Array.from(first[0].uniforms.uOrigin),batches[0].origin,'Queued draws retain their own transforms');
assert.equal(first[0].blending,THREE.NoBlending);assert.equal(first[1].blending,THREE.NormalBlending);assert.equal(first[2].blending,THREE.AdditiveBlending);assert.equal(first[1].depthWrite,false);
assert.ok(first[0].geometry instanceof THREE.BufferGeometry);assert.ok(first[0].material instanceof THREE.RawShaderMaterial);
viewer.render(world,1,0,0);assert.equal(frames[1][0].geometry,first[0].geometry,'Static geometry retained');assert.equal(frames[1][0].material,first[0].material,'Draw materials pooled');
const dynamic=frames[1][1].geometry.getAttribute('aPosition').data;viewer.render(world,1,0,0);assert.equal(frames[2][1].geometry.getAttribute('aPosition').data,dynamic,'Same-size dynamic uploads reuse GPU buffers');
viewer.setStudyActors([batches[0]]);viewer.setStudyEffects([]);viewer.render(world,1,0,0);assert.equal(frames.at(-1).length,1,'Unused pooled draws are removed');
console.log('PASS Three production submission: native geometry/materials, per-draw uniforms, alpha/additive ordering, one render per pass and buffer/material reuse');

