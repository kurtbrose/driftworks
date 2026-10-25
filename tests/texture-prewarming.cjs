'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'../tools/vendor-three-classic.cjs'),'--check']);
const noop=()=>{},hud=new Proxy({},{get:()=>noop,set:()=>true});
function element(){return {width:1,height:1,clientWidth:640,clientHeight:480,style:{},setAttribute:noop,appendChild:noop,addEventListener(type,callback){this.listeners=this.listeners||{};this.listeners[type]=callback;},querySelector:()=>element(),getContext:type=>{assert.equal(type,'2d','Production never requests a raw GPU context');return hud;}};}
const context=vm.createContext({console,performance,setTimeout,AbortController,Float32Array,Uint8Array,Set,Map,WeakMap,Math,document:{createElement:element},window:null});
context.window=context;context.DRIFTWORKS_TEST_MODE=true;context.addEventListener=noop;
for(const name of ['vendor/three/build/three.global.js',...['propulsion','combat','mining-lights','mining-terrain','logistics','formations','sim','asteroid-art','population','session','tactical/camera','engine-audio','audio-mixer','audio','hud','mesh-builder','mining-rig','explosions','scene3d','game'].map(n=>'src/'+n+'.js')])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),context,{filename:name});
const THREE=context.THREE,DW=context.Driftworks,frames=[];
let submissionCanvas;
THREE.WebGLRenderer=class {constructor(options){submissionCanvas=options.canvas;}setSize(){}setRenderTarget(target){this.target=target;}setClearColor(){}clear(){}render(scene){frames.push(scene.children.filter(o=>o.material&&o.visible).map(o=>({geometry:o.geometry,matrix:o.matrix.elements.slice(),uniforms:Object.fromEntries(Object.entries(o.material.uniforms||{}).map(([k,v])=>[k,v.value])),material:o.material,blending:o.material.blending,depthWrite:o.material.depthWrite})));}};
DW.audio=null;
let world=DW.sim.createInitialWorld();Object.assign(world,{asteroids:[],ships:[],platforms:[],wrecks:[],packets:[],selectedShipIds:[]});world.combat.drones=[];
const host=element();
const viewer=DW.scene3d.create(host,()=>world,w=>{world=w;},{study:true});
const viewerCanvas=submissionCanvas;
const data=new Float32Array([0,0,0,0,0,1,1,0,0,0,0,1,0,1,0,0,0,1]);

(async()=>{
 const uploaded=[];
 THREE.WebGLRenderer.prototype.initTexture=function(texture){uploaded.push(texture);};
 const image={width:4,height:4};
 const warming=viewer.prepareStudyTextures([image,image]);
 assert.equal(uploaded.length,0,'Texture preparation yields before uploading');
 await warming;
 assert.equal(uploaded.length,2,'Duplicate images prepare raw and PBR variants once');
 await viewer.prepareStudyTextures([image]);
 assert.equal(uploaded[0],uploaded[2],'Prewarming reuses the raw texture cache');
 assert.equal(uploaded[1],uploaded[3],'Prewarming reuses the PBR texture cache');
 assert.equal(uploaded[0].image,image);
 console.log('PASS fleet texture prewarming: deferred tasks, deduplicated images and shared GPU texture identity');
})().catch(error=>{console.error(error);process.exitCode=1;});
