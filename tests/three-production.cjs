'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'../tools/vendor-three-classic.cjs'),'--check']);
const noop=()=>{},hud=new Proxy({},{get:()=>noop,set:()=>true});
function element(){return {width:1,height:1,clientWidth:640,clientHeight:480,style:{},setAttribute:noop,appendChild:noop,addEventListener(type,callback){this.listeners=this.listeners||{};this.listeners[type]=callback;},querySelector:()=>element(),getContext:type=>{assert.equal(type,'2d','Production never requests a raw GPU context');return hud;}};}
const context=vm.createContext({console,performance,AbortController,Float32Array,Uint8Array,Set,Map,WeakMap,Math,document:{createElement:element},window:null});
context.window=context;context.DRIFTWORKS_TEST_MODE=true;context.addEventListener=noop;
for(const file of require('../tools/script-manifest.cjs').files('threeTests'))vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
const THREE=context.THREE,DW=context.Driftworks,frames=[];
let submissionCanvas;
THREE.WebGLRenderer=class {constructor(options){submissionCanvas=options.canvas;}setSize(){}setRenderTarget(target){this.target=target;}setClearColor(){}clear(){}render(scene){frames.push(scene.children.filter(o=>o.material&&o.visible).map(o=>({geometry:o.geometry,matrix:o.matrix.elements.slice(),uniforms:Object.fromEntries(Object.entries(o.material.uniforms||{}).map(([k,v])=>[k,v.value])),material:o.material,blending:o.material.blending,depthWrite:o.material.depthWrite})));}};
DW.audio=null;
let world=DW.sim.createInitialWorld();Object.assign(world,{asteroids:[],ships:[],platforms:[],wrecks:[],packets:[],selectedShipIds:[]});world.combat.drones=[];
const host=element();
const viewer=DW.scene3d.create(host,()=>world,w=>{world=w;},{study:true});
const viewerCanvas=submissionCanvas;
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


// Probe generation is GPU work; this test verifies ownership/cache and native material wiring.
let probeBakes=0;
THREE.PMREMGenerator=class {fromEquirectangular(){probeBakes++;return {texture:new THREE.Texture(),dispose(){}};}dispose(){}};
const image={width:512,height:256};
const lighting={image,sh:Array.from({length:9},()=>[.1,.1,.1])};
const pose={right:[1,0,0],up:[0,1,0],back:[0,0,1]};
host.listeners['sky-environment']({detail:{lighting,pose}});
const textured=new Float32Array([0,0,0,0,0,1,0,0,1,0,0,0,0,1,1,0,0,1,0,0,0,1,0,1]);
viewer.setStudyActors([{vertices:textured,color:[1,1,1],texture:{width:16,height:16},stride:8,staticGeometry:true,origin:[1,2,3],scale:2},batches[0]]);
viewer.render(world,1,0,0);
const native=frames.at(-1)[0],custom=frames.at(-1)[1];
assert.ok(native.material instanceof THREE.MeshStandardMaterial);
assert.equal(native.material.metalness,0);assert.equal(native.material.roughness,1);
assert.equal(native.material.map.colorSpace,THREE.SRGBColorSpace);
assert.equal(native.material.map.flipY,false,'glTF UV orientation retained');
assert.ok(custom.material instanceof THREE.RawShaderMaterial,'Untextured procedural material preserved');
assert.equal(probeBakes,1);
viewer.render(world,1,0,0);assert.equal(probeBakes,1,'Probe reused across frames');
assert.equal(frames.at(-1)[0].material,native.material,'Native materials pooled');
host.listeners['sky-environment']({detail:{lighting:null,pose}});viewer.render(world,1,0,0);
assert.ok(frames.at(-1)[0].material instanceof THREE.RawShaderMaterial,'Lighting-off comparison retains original path');
host.listeners['sky-environment']({detail:{lighting,pose}});viewer.render(world,1,0,0);assert.equal(probeBakes,1,'Probe reused after sky reselect');
console.log('PASS native sky-lit ships: original rough/nonmetal material, sRGB/UVs, per-renderer PMREM reuse and custom-material isolation');

// Display-space shield capture must not darken native ship PBR or leak to later frames.
const shieldCompiled={uniforms:{},vertexShader:'',fragmentShader:'#include <colorspace_fragment>'};
native.material.onBeforeCompile(shieldCompiled);
assert.match(shieldCompiled.fragmentShader,/if\(uShieldOutput>\.5\)gl_FragColor=sRGBTransferOETF/);
let shieldDisposed=0,shieldFailure=false;
DW.flightShields={create:()=>({render(){assert.equal(shieldCompiled.uniforms.uShieldOutput.value,1);if(shieldFailure)throw new Error('capture failure');return 2;},dispose(){shieldDisposed++;}})};
viewer.setStudyShields([{box:[0,0,.2,.2],waves:[],depth:1}],{});
viewer.render(world,1,0,0);assert.equal(shieldCompiled.uniforms.uShieldOutput.value,0,'normal rendering output restored');
shieldFailure=true;assert.throws(()=>viewer.render(world,1,0,0),/capture failure/);
assert.equal(shieldCompiled.uniforms.uShieldOutput.value,0,'failed capture also restores output');
viewer.setStudyShields([],null);assert.equal(shieldDisposed,1);
console.log('PASS shield native color: capture encoding, normal/exception restoration and disabled-pass disposal');

viewer.setStudyActors([]);viewer.setStudyEffects([]);
viewer.setStudyExplosions([{position:[0,0,0],velocity:[1,0,0],age:.3,size:1,seed:4}]);
viewer.render(world,1,0,0);
const explosionFrame=frames.at(-1);
assert(explosionFrame.some(d=>d.uniforms.uFinish===10),'Flight destruction draws turbulent fire');
assert(explosionFrame.some(d=>d.uniforms.uFinish===11),'Flight destruction draws shockwave');
assert(explosionFrame.filter(d=>d.uniforms.uFinish===10).every(d=>d.blending===THREE.NormalBlending&&!d.depthWrite));
viewer.resetCombat();viewer.render(world,1,0,0);assert.equal(frames.at(-1).length,0,'Reset clears flight explosions');
const tactical=DW.scene3d.create(element(),()=>world,w=>{world=w;});
tactical.consumeCombatEvents([{kind:'ship-destroyed',position:{x:0,y:0},velocity:{x:1,y:0}}]);
tactical.render(world,1,.3,0);assert(frames.at(-1).some(d=>d.uniforms.uFinish===10),'Tactical deaths use the same fire shader');
tactical.render(world,1,0,0);assert(frames.at(-1).some(d=>d.uniforms.uFinish===10),'Pause retains tactical destruction');
tactical.render(world,1,6,0);assert(!frames.at(-1).some(d=>d.uniforms.uFinish===10),'Tactical effects expire');
console.log('PASS production explosions: flight snapshots, tactical deaths, blend state, pause and reset');

viewer.setStudyActors([{vertices:textured,color:[1,1,1],texture:{width:16,height:16},stride:8},batches[0]]);
host.listeners['sky-environment']({detail:{lighting,pose,exposure:.4}});viewer.render(world,1,0,0);
const exposed=frames.at(-1),compiled={uniforms:{},fragmentShader:'#include <opaque_fragment>',vertexShader:''};
exposed[0].material.onBeforeCompile(compiled);
assert.equal(compiled.uniforms.uSkyCameraExposure.value,.4,'native ship receives shared camera exposure');
assert.equal(exposed[1].uniforms.uCameraExposure,.4,'procedural geometry receives same exposure');
assert.ok(exposed[1].material.fragmentShader.indexOf('precision highp float;')<exposed[1].material.fragmentShader.indexOf('uniform float uCameraExposure;'),'raw shader establishes precision before exposure uniform');
host.listeners['sky-environment']({detail:{lighting,pose}});viewer.render(world,1,0,0);
assert.equal(compiled.uniforms.uSkyCameraExposure.value,1,'legacy sky events reset native exposure');
assert.equal(frames.at(-1)[1].uniforms.uCameraExposure,1,'legacy sky events reset procedural exposure');
console.log('PASS shared camera response: native/procedural exposure parity, shader precision and legacy neutral reset');

// The optional Ellis pass reuses submitted geometry and restores every raw/PBR pose.
context.URLSearchParams=URLSearchParams;context.location={search:'?mission=ellis&bridgeGeometry=adaptive'};
for(const file of ['experiments/ellis-optics.js','experiments/ellis-renderer.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
THREE.WebGLRenderer.prototype.setViewport=noop;THREE.WebGLRenderer.prototype.setScissor=noop;THREE.WebGLRenderer.prototype.setScissorTest=noop;
viewer.setStudyActors([{vertices:textured,color:[1,1,1],texture:{width:16,height:16},stride:8,origin:[0,-170,93],scale:2},{...batches[0],origin:[1,-168,93]}]);viewer.setStudyEffects([]);viewer.setStudyExplosions([]);
viewer.setSurfaceCamera({eye:[0,-195,93],right:[1,0,0],up:[0,0,1],back:[0,-1,0]});
viewer.render(world,1,0,0);const ordinary=frames.at(-1)[0],rawOrdinary=frames.at(-1)[1],before=frames.length;
viewer.setStudyBridge(true);viewer.render(world,1,0,0);
assert.equal(frames.length-before,16,'first frame fills charts, primary, half-resolution hit map and compositor');
assert.equal(viewer.getRenderStats().bridgeCaptures,12);
assert.equal(frames[before][0].geometry,ordinary.geometry,'captures share production geometry');
const count=frames.length;viewer.render(world,1,0,0);assert.equal(frames.length-count,6,'steady frame amortizes two capture faces');
assert.equal(viewer.getRenderStats().bridgeCaptures,2);
const chartFlip=frames.length;
viewer.setSurfaceCamera({region:1,eye:[720,-75,93],right:[-1,0,0],up:[0,0,1],back:[0,1,0]});viewer.render(world,1,0,0);
assert.equal(frames.length-chartFlip,16,'crossing refreshes both charts before sampling');
viewer.setSurfaceCamera({eye:[0,-195,93],right:[1,0,0],up:[0,0,1],back:[0,-1,0]});
viewer.setStudyBridge(false);viewer.render(world,1,0,0);
assert.deepEqual(frames.at(-1)[0].matrix,ordinary.matrix,'native PBR matrix restored');
assert.deepEqual(Array.from(frames.at(-1)[1].uniforms.uTarget),Array.from(rawOrdinary.uniforms.uTarget),'raw camera target restored');
assert.deepEqual(Array.from(frames.at(-1)[1].uniforms.uView),Array.from(rawOrdinary.uniforms.uView),'projection restored');
assert.equal(viewer.getRenderStats().bridgeCaptures,0,'ordinary missions retain one pass');
console.log('PASS Ellis scene pass: shared buffers, twelve-face warmup, rolling captures, restored view and reversible disposal');

viewer.setStudyEffects([{vertices:new Float32Array(data),color:[1,.75,.25]}]);
viewer.setStudyBridge(true);const effectStart=frames.length;viewer.render(world,1,0,0);
assert.equal(frames.length-effectStart,17,'effects add one full-resolution pass');
assert.equal(frames[effectStart].length,2,'opaque primary excludes additive bolts');
const effects=frames[effectStart+1];assert.equal(effects.length,1,'separate layer contains only additive effects');
assert.equal(effects[0].uniforms.uFinish,9);assert.equal(effects[0].depthWrite,true,'effect layer records fragment depth');
assert(frames.slice(effectStart+2,-1).every(f=>f.every(d=>d.uniforms.uFinish!==9)),'radial shells exclude depthless effects');
assert.equal(frames.at(-1)[0].uniforms.hasEffects,1,'compositor receives effect layer');
viewer.setStudyBridge(false);viewer.render(world,1,0,0);
assert.equal(frames.at(-1).length,3,'all draw visibility restored');
assert.equal(frames.at(-1)[2].depthWrite,false,'ordinary additive depth state restored');
console.log('PASS Ellis additive effects: separate full-resolution color/depth, shell exclusion and restored draw state');

const mapDraw=frames.find(f=>f.some(d=>d.material.fragmentShader&&d.material.fragmentShader.includes('ELLIS_HIT_MAP_PASS'))).find(d=>d.material.fragmentShader.includes('ELLIS_HIT_MAP_PASS'));
assert.equal(mapDraw.uniforms.useHitMap,1);
assert.deepEqual(Array.from(mapDraw.uniforms.hitSize),[320,240],'hit map is half the main 640 by 480 backing dimensions');
assert.equal(mapDraw.uniforms.hitMap.minFilter,THREE.NearestFilter,'packed hit coordinates are decoded before interpolation');
console.log('PASS Ellis hit map: separate half-resolution pass, packed nearest sampling and unchanged full-resolution output');

viewer.setStudyBridge(false);viewer.setStudyEffects([]);context.location.search='?mission=ellis';
viewer.setStudyBridge(true);const defaultStart=frames.length;viewer.render(world,1,0,0);
assert.equal(frames.length-defaultStart,14,'default retains the validated single-compositor path');
assert.equal(frames.at(-1)[0].uniforms.useHitMap,0,'experimental map is opt-in');
assert.equal(frames.at(-1)[0].uniforms.maxGeometryAngle,1e6,'default does not remove geometry windings');
viewer.setStudyBridge(false);context.location.search='?mission=ellis&bridgeAngle=180';viewer.setStudyBridge(true);viewer.render(world,1,0,0);
assert(Math.abs(frames.at(-1)[0].uniforms.maxGeometryAngle-Math.PI)<1e-10,'angular budget applies only to geometry uniforms');
console.log('PASS Ellis experiment controls: unchanged default, opt-in map and angular budget');
const regionStart=frames.length;
viewer.setStudyBridge(false);context.location.search='?mission=ellis';viewer.setStudyBridge(true);
viewer.setStudyEffects([]);viewer.setStudyExplosions([]);
viewer.setStudyActors([{vertices:data,color:[1,0,0],region:0},{vertices:new Float32Array(data),color:[0,1,0],region:1}]);
viewer.setSurfaceCamera({region:1,eye:[0,-195,93],right:[1,0,0],up:[0,0,1],back:[0,-1,0]});viewer.render(world,1,0,0);
assert.equal(frames[regionStart].length,1,'primary pass excludes other region despite coincident coordinates');
assert.deepEqual(Array.from(frames[regionStart][0].uniforms.uColor),[0,1,0]);
for(let i=1;i<=6;i++)assert.deepEqual(Array.from(frames[regionStart+i][0].uniforms.uColor),[0,1,0],'local atlas contains only local region');
for(let i=7;i<=12;i++)assert.deepEqual(Array.from(frames[regionStart+i][0].uniforms.uColor),[1,0,0],'other atlas contains only other region');
assert.equal(frames.at(-1)[0].uniforms.ellisRegion,1,'optics receives explicit chart independent of eye.x');
console.log('PASS Ellis region rendering: coincident regions stay isolated in primary and both atlases');
viewer.setStudyBridge(false);context.location.search='?mission=ellis&bridgeTemporal=1';viewer.setStudyBridge(true);
viewer.setStudyBridgeRevision('frozen-A');
function temporalFrame(){const start=frames.length;viewer.render(world,1,0,0);return frames.slice(start).flat().find(o=>o.material.fragmentShader&&o.material.fragmentShader.includes('ELLIS_HIT_MAP_PASS'));}
const temporalFirst=temporalFrame();assert.equal(temporalFirst.uniforms.historyValid,0,'first temporal frame is fresh');
const temporalNext=temporalFrame();assert.equal(temporalNext.uniforms.historyValid,1,'unchanged scene and eye permit temporal reuse');
assert.notEqual(temporalNext.uniforms.historyMap,temporalNext.uniforms.hitMap,'history cannot read its current write target');
assert.equal(temporalNext.uniforms.historyMap,temporalFirst.uniforms.hitMap,'completed map becomes next history');
assert.equal(temporalNext.uniforms.hitMap,temporalFirst.uniforms.historyMap,'ping-pong targets alternate');
viewer.setStudyBridgeRevision('moving-B');assert.equal(temporalFrame().uniforms.historyValid,0,'geometry motion rejects all stale empty/hit samples');
assert.equal(temporalFrame().uniforms.historyValid,1);
viewer.setSurfaceCamera({region:1,eye:[.01,-195,93],right:[1,0,0],up:[0,0,1],back:[0,-1,0]});
assert.equal(temporalFrame().uniforms.historyValid,0,'translation invalidates history instead of using straight-ray reprojection');
assert.equal(temporalFrame().uniforms.historyValid,1);
viewer.setSurfaceCamera({region:0,eye:[.01,-195,93],right:[1,0,0],up:[0,0,1],back:[0,-1,0]});
assert.equal(temporalFrame().uniforms.historyValid,0,'region changes invalidate history');
temporalFrame();
const yaw=.005;
viewer.setSurfaceCamera({region:0,eye:[.01,-195,93],right:[Math.cos(yaw),-Math.sin(yaw),0],up:[0,0,1],back:[-Math.sin(yaw),-Math.cos(yaw),0]});
assert.equal(temporalFrame().uniforms.historyValid,1,'small rotation can reproject the same world-ray path');
viewer.setSurfaceCamera({region:0,eye:[.01,-195,93],right:[0,-1,0],up:[0,0,1],back:[-1,0,0]});
assert.equal(temporalFrame().uniforms.historyValid,0,'rapid turns reject history');
host.clientWidth=800;assert.equal(temporalFrame().uniforms.historyValid,0,'resize rejects history');
viewer.setStudyBridgeRevision(null);assert.equal(temporalFrame().uniforms.historyValid,0,'unversioned geometry never reuses history');
assert.equal(temporalFrame().uniforms.historyValid,0);
console.log('PASS Ellis temporal ownership: ping-pong, first frame, geometry motion, translation, region and unversioned invalidation');

viewer.setStudyBridgeRevision('restore');temporalFrame();assert.equal(temporalFrame().uniforms.historyValid,1);
viewerCanvas.listeners.webglcontextlost();
const lostStart=frames.length;assert.equal(temporalFrame().uniforms.historyValid,0,'lost context invalidates hit history');
assert.equal(frames.length-lostStart,16,'lost context forces all twelve capture faces to refill');
assert.equal(temporalFrame().uniforms.historyValid,1);
viewerCanvas.listeners.webglcontextrestored();assert.equal(temporalFrame().uniforms.historyValid,0,'restored context cannot reuse absent GPU contents');
console.log('PASS Ellis context recovery: history discarded and both capture charts refilled');
viewer.setStudyBridge(false);context.location.search='?mission=ellis&bridgeGeometry=objects&bridgeWarpDebug=1&bridgeShips=warped';viewer.setStudyBridge(true);
viewer.setStudyEffects([]);viewer.setStudyExplosions([]);
viewer.setStudyActors([{vertices:data,color:[1,1,1],region:1,origin:[720,-99,93],lensCenter:[720,-99,93],lensRadius:20}]);
viewer.setSurfaceCamera({region:0,eye:[0,-144,93],right:[1,0,0],up:[0,0,1],back:[0,-1,0]});
const objectStart=frames.length;viewer.render(world,1,0,0);
assert.equal(frames.length-objectStart,1,'object approximation has no captures or full-screen tracing passes');
assert.equal(frames.at(-1).length,1,'remote mesh is actually submitted');
const objectDraw=frames.at(-1)[0];assert.equal(objectDraw.uniforms.uLensEnabled,1);assert.equal(objectDraw.uniforms.uLensMode,1,'remote mesh is clipped to transmitted aperture');
assert(Array.from(objectDraw.uniforms.uLensX).every(Number.isFinite));assert(objectDraw.uniforms.uLensViewCenter[2]>0);
assert.equal(viewer.getRenderStats().bridgeObjectPaths,5,'center, three spatial offsets and error probe');
assert.equal(viewer.getRenderStats().bridgeCaptures,0);
viewer.setStudyBridge(false);viewer.render(world,1,0,0);assert.equal(frames.at(-1)[0].uniforms.uLensEnabled,0,'warp uniforms restored for normal rendering');
assert.equal(frames.at(-1)[0].uniforms.uLensMode,0,'aperture mask cannot leak into other missions');
console.log('PASS Ellis object patch: finite real-mesh warp, five paths per object, aperture clipping, no captures and reversible state');
viewer.setStudyBridge(false);context.location.search='?mission=ellis';viewer.setStudyBridge(true);viewer.render(world,1,0,0);
const explicitDraw=frames.slice().reverse().flat().find(d=>d.material.fragmentShader.includes("#define ELLIS_FULL_PASS"));assert.equal(explicitDraw.material.glslVersion,'300 es');
assert(explicitDraw.material.fragmentShader.includes('textureLod(s,uv,0.)'));
assert(!explicitDraw.material.fragmentShader.includes('texture2D('),'divergent geometry traversal uses no implicit texture derivatives');
assert(explicitDraw.material.vertexShader.includes('out vec2 screen'));
console.log('PASS Ellis default explicit LOD: GLSL 3 varying/output conversion and fixed-level texture sampling');

assert(explicitDraw.material.fragmentShader.includes('ordinary*localWeight'),'Full renderer restores nearby ordinary geometry');
assert(explicitDraw.material.fragmentShader.includes('1.-ellisLocalWeight(eye,point,side)'),'Full renderer suppresses nearby captured copies');
viewer.setStudyBridge(false);context.location.search='?mission=ellis&bridgeGeometry=objects';viewer.setStudyBridge(true);
const U=context.window.Driftworks.sim.METERS_PER_UNIT;
viewer.setStudyActors([{vertices:data,color:[1,1,1],region:0,origin:[12/U,-2340/U,1550/U],lensCenter:[12/U,-2340/U,1550/U],lensRadius:5}]);
viewer.setSurfaceCamera({region:0,eye:[0,-2380/U,1550/U],right:[1,0,0],up:[0,0,1],back:[0,-1,0]});viewer.render(world,1,0,0);
const nearbyDraw=frames.at(-1)[0];assert(nearbyDraw);assert.equal(nearbyDraw.uniforms.uLensEnabled,1,'42 m ship uses the shared finite-source optical path');
assert.equal(nearbyDraw.uniforms.uLensMode,3,'Local ship is not sliced by the aperture mask');
console.log('PASS Ellis nearby geometry: rigid optical mesh, no aperture slicing and captured-copy suppression');

// Readable ships never enter mouth captures, and their vertex transform stays
// orthonormal at ranges beyond the old local-frame band, in both render routes.
for(const geometry of ['full','objects'])for(const side of [0,1])for(const x of [12,120,240,480]){
 viewer.setStudyBridge(false);context.location.search='?mission=ellis&bridgeGeometry='+geometry;viewer.setStudyBridge(true);
 const center=[(side*12000+x)/U,(side? -1660:-2340)/U,1550/U];
 viewer.setStudyActors([{vertices:data,color:[.123,.456,.789],region:side,origin:center,lensCenter:center,lensRadius:5}]);
 viewer.setSurfaceCamera({region:0,eye:[0,-2380/U,1550/U],right:[1,0,0],up:[0,0,1],back:[0,-1,0]});
 const start=frames.length;viewer.render(world,1,0,0);
 const hull=frames.slice(start).flat().filter(d=>Math.abs(d.uniforms.uColor?.[0]-.123)<1e-6);
 assert.equal(hull.length,1,'Each ship is submitted exactly once, never to capture atlases');
 const draw=hull[0];assert.equal(draw.uniforms.uLensMode,3,'Readable hull is not sliced by a distance-dependent aperture rule');
 if(draw.uniforms.uLensEnabled){
  const columns=[draw.uniforms.uLensX,draw.uniforms.uLensY,draw.uniforms.uLensZ];
  columns.forEach((a,i)=>columns.forEach((b,j)=>assert(Math.abs(a.reduce((sum,v,k)=>sum+v*b[k],0)-(i===j?1:0))<1e-6,'Optical image preserves hull lengths and angles')));
 }
}
console.log('PASS Ellis readable ships: one intact image at near/far ranges, both charts and both geometry routes');

const studyContext={window:{Driftworks:{sim:{METERS_PER_UNIT:U}}}};
vm.runInNewContext(fs.readFileSync('experiments/ellis-study.js','utf8'),studyContext);
const pursuit=studyContext.window.Driftworks.ellisStudy;
viewer.setStudyBridge(false);context.location.search='?mission=ellis';viewer.setStudyBridge(true);
for(const t of [2.99,3.01,4.49,4.51,14.99,15.01,16.49,16.51]){
 const observer=pursuit.camera('pursuit',t),leader=pursuit.sample(t,'pursuit')[0].pose;
 viewer.setSurfaceCamera(observer);
 viewer.setStudyActors([{vertices:data,color:[.123,.456,.789],region:leader.region,origin:Array.from(leader.eye),lensCenter:Array.from(leader.eye),lensRadius:5}]);
 const start=frames.length;viewer.render(world,1,0,0);
 const hull=frames.slice(start).flat().filter(d=>Math.abs(d.uniforms.uColor?.[0]-.123)<1e-6);
 assert.equal(hull.length,1,'Pursued hull remains one visible submission across leader and observer crossings at '+t);
}
console.log('PASS Ellis pursuit rendering: intact single hull before/after both leader and follower crossings');

// Exercise the actual seven-material capital asset and its real patrol crossing.
for(const file of ['experiments/retail-profiles.js','experiments/flight-model.js','experiments/retail-weapons.js','experiments/guns.js','experiments/flight-missions.js','experiments/mission-ohio.js','experiments/flight-collision.js','experiments/training.js','assets/ships/aegis-kit/flight-rig.js','experiments/aegis-flight.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
for(const geometry of ['full','objects']){
 viewer.setStudyBridge(false);context.location.search='?mission=ellis&bridgeGeometry='+geometry;viewer.setStudyBridge(true);
 const capital=DW.aegisFlight.createEllisPatrol();let clock=0,previousFrame,previousTime;
 for(const t of [30,31.65,5700/180-.000001,5700/180+.000001,31.7,32,34]){
  while(clock<t-1e-8){const dt=Math.min(.05,t-clock);capital.step(dt);clock+=dt;}
  const batches=capital.geometry();viewer.setStudyActors(batches);
  viewer.setSurfaceCamera({region:0,eye:[650/U,-2400/U,1650/U],right:[0,1,0],up:[0,0,1],back:[1,0,0]});
  const start=frames.length;viewer.render(world,1,0,0);
  const hull=frames.slice(start).flat().filter(d=>d.uniforms.uLensMode===3&&d.uniforms.uColor);
  assert.equal(hull.length,batches.length,'every capital material is submitted once at '+t+' s / '+geometry);
  assert.equal(hull.reduce((n,d)=>n+d.geometry.attributes.position.count,0),batches.reduce((n,b)=>n+b.vertices.length/6,0),'all capital vertices survive the throat crossing');
  assert.equal(viewer.getRenderStats().bridgeObjectPaths,1,'all materials use one coherent optical center');
  const d=hull[0],columns=d.uniforms.uLensEnabled?[d.uniforms.uLensX,d.uniforms.uLensY,d.uniforms.uLensZ]:[[0,0,-1],[1,0,0],[0,1,0]];
  const basis=batches[0].basis,orientation=Array.from({length:9},(_,k)=>columns.reduce((sum,c,j)=>sum+c[k%3]*basis[Math.floor(k/3)*3+j],0));
  if(previousFrame&&t-previousTime<.00001)orientation.forEach((v,i)=>assert(Math.abs(v-previousFrame[i])<.002,'optical hull orientation is continuous across antipodal transport'));
  previousFrame=orientation;previousTime=t;
 }
}
console.log('PASS Ellis capital image: actual patrol hull, every material/vertex, one coherent path before and after crossing');

// A heading along the source-end optical ray must appear along the same image
// direction at the observer, while all material batches keep an orthonormal pose.
for(const side of [0,1]){
 viewer.setStudyBridge(false);context.location.search='?mission=ellis';viewer.setStudyBridge(true);
 const eye=[100,-2390,1550],target=[side*12000+150,side?-1600:-2500,1550],h=DW.ellisOptics.primary(eye,target,0,side);assert(h);
 const right=[h.direction[1],-h.direction[0],0];viewer.setSurfaceCamera({region:0,eye:eye.map(x=>x/U),right,up:[0,0,1],back:h.direction.map(v=>-v)});
 const center=target.map(x=>x/U);viewer.setStudyActors([{vertices:data,color:[.123,.456,.789],region:side,origin:center,lensCenter:center,lensRadius:5}]);
 const start=frames.length;viewer.render(world,1,0,0);const d=frames.slice(start).flat().find(d=>Math.abs(d.uniforms.uColor?.[0]-.123)<1e-6);assert(d);
 const c=[d.uniforms.uLensX,d.uniforms.uLensY,d.uniforms.uLensZ],mapped=[0,1,2].map(i=>c.reduce((n,v,j)=>n+v[i]*h.sourceDirection[j],0));
 const expected=[0,0,1];
 mapped.forEach((v,i)=>assert(Math.abs(v-expected[i])<1e-6,'source-end viewing tangent maps to apparent direction '+JSON.stringify({side,mapped,expected,enabled:d.uniforms.uLensEnabled,h})));
}
console.log('PASS Ellis optical headings: forward/reverse path tangents share one rigid image orientation');
assert(explicitDraw.material.fragmentShader.includes('float shellDepth(')&&explicitDraw.material.fragmentShader.includes('far-near>max(5./units,near*.03)'),'surface interpolation retains a depth-discontinuity guard');

viewer.setStudyBridge(false);context.location.search='?mission=ellis';viewer.setStudyBridge(true);
const behindCenter=[150/U,-2500/U,1550/U];viewer.setStudyActors([{vertices:data,color:[.123,.456,.789],region:0,origin:behindCenter,lensCenter:behindCenter,lensRadius:5}]);
viewer.setSurfaceCamera({region:0,eye:[100/U,-2390/U,1550/U],right:[1,0,0],up:[0,0,1],back:[0,-1,0]});
const behindStart=frames.length;viewer.render(world,1,0,0);const behind=frames.slice(behindStart).flat().find(d=>Math.abs(d.uniforms.uColor?.[0]-.123)<1e-6);
assert(behind&&behind.uniforms.uLensEnabled===1&&behind.uniforms.uLensViewCenter[2]<0,'behind-camera optical image never falls back to ordinary screen position');
console.log('PASS Ellis behind-camera image: optical center is retained and near-plane clipping owns visibility');

// Both image position and orientation must survive the observer's chart change.
viewer.setStudyBridge(false);context.location.search='?mission=ellis';viewer.setStudyBridge(true);
for(const crossing of [4.5,16.5]){
 let previous;
 for(const t of [crossing-1e-6,crossing+1e-6]){
  const observer=pursuit.camera('pursuit-offset',t),leader=pursuit.sample(t,'pursuit')[0].pose,center=Array.from(leader.eye);
  viewer.setSurfaceCamera(observer);viewer.setStudyActors([{vertices:data,color:[.123,.456,.789],region:leader.region,origin:center,lensCenter:center,lensRadius:5}]);
  const start=frames.length;viewer.render(world,1,0,0);const d=frames.slice(start).flat().find(d=>Math.abs(d.uniforms.uColor?.[0]-.123)<1e-6);assert(d&&d.uniforms.uLensEnabled===1);
  const frame=[...d.uniforms.uLensX,...d.uniforms.uLensY,...d.uniforms.uLensZ,...d.uniforms.uLensViewCenter];
  if(previous)frame.forEach((v,i)=>assert(Math.abs(v-previous[i])<.002,'off-axis observer crossing keeps optical position/orientation continuous: '+crossing+' / '+i+' / '+v+' vs '+previous[i]));
  previous=frame;
 }
}
console.log('PASS Ellis observer chart crossings: continuous off-axis image position and orientation in both directions');

viewer.setStudyBridge(false);context.location.search='?mission=ellis';viewer.setStudyBridge(true);
viewer.setStudyActors([]);viewer.setStudyEffects([{vertices:new Float32Array(data),color:[.071,.082,.093],projected:true,region:1}]);
viewer.setSurfaceCamera({region:0,eye:[0,-2350/U,1550/U],right:[1,0,0],up:[0,0,1],back:[0,-1,0]});
const projectedStart=frames.length;viewer.render(world,1,0,0);
const projectedEffects=frames.slice(projectedStart).flat().filter(d=>Math.abs(d.uniforms.uColor?.[0]-.071)<1e-6);
assert.equal(projectedEffects.length,1,'Projected cross-chart gunfire is submitted once, after composition, and excluded from all shell captures');
assert.equal(projectedEffects[0].uniforms.uLensEnabled,0,'Preprojected trails do not receive a second optical transform');
viewer.setStudyEffects([]);const clearStart=frames.length;viewer.render(world,1,0,0);
assert(!frames.slice(clearStart).flat().some(d=>Math.abs(d.uniforms.uColor?.[0]-.071)<1e-6),'Pooled projectile draws do not linger after removal');
console.log('PASS optical gunfire presentation: one observer-space overlay, cross-chart visibility, no shell capture/double warp and cleared pooled draws');

// A burst larger than the old 12-explosion limit reaches actual queued draws.
viewer.setStudyBridge(false);viewer.setStudyActors([]);viewer.setStudyEffects([]);
viewer.setSurfaceCamera({eye:[0,0,0],right:[1,0,0],up:[0,1,0],back:[0,0,1]});
const blasts=Array.from({length:60},(_,i)=>({position:[i-30,0,-100],velocity:[0,0,0],age:.2,size:1,seed:i}));
const expectedBlastBatches=blasts.reduce((n,b)=>n+DW.explosions.build(b,[1,0,0],[0,1,0]).length,0);
viewer.setStudyExplosions(blasts);blasts.length=0;viewer.render(world,1,0,0);
assert.equal(viewer.getRenderStats().explosions,60,'All sixty explosions reach rendering, with a retained input snapshot');
assert.equal(viewer.getRenderStats().explosionBatches,expectedBlastBatches);
assert.equal(frames.at(-1).length,expectedBlastBatches,'Every explosion layer reaches the native renderer');
viewer.setStudyExplosions([]);viewer.render(world,1,0,0);
assert.equal(viewer.getRenderStats().explosions,0);assert.equal(frames.at(-1).length,0,'Pooled explosion draws clear without stale blasts');
console.log('PASS explosion capacity: sixty complete blasts, every native layer submitted, input ownership and empty-frame cleanup');
