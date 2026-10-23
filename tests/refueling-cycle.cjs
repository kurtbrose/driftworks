'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const timeline={};vm.createContext(timeline);
vm.runInContext(fs.readFileSync('experiments/refueling-cycle.js','utf8').replaceAll('export function','function'),timeline);
const {createRefuelingCycle,stepRefuelingCycle,finishRefueling,sampleRefuelingCycle}=timeline;
const timed=createRefuelingCycle();assert.equal(finishRefueling(timed),false);
stepRefuelingCycle(timed,20);assert.equal(timed.phase,'fueling');assert.equal(sampleRefuelingCycle(timed).arm,1);
stepRefuelingCycle(timed,10);assert.equal(timed.phase,'disconnect');
stepRefuelingCycle(timed,3.9);assert.equal(sampleRefuelingCycle(timed).clearance,0,'No ship motion while arm retracts');
stepRefuelingCycle(timed,.1);assert.equal(timed.phase,'clearance');assert.equal(sampleRefuelingCycle(timed).arm,0);
stepRefuelingCycle(timed,14);assert.equal(timed.phase,'complete');assert.equal(sampleRefuelingCycle(timed).departure,1);
const held=createRefuelingCycle(true);stepRefuelingCycle(held,1000);assert.equal(held.phase,'fueling');
assert.equal(sampleRefuelingCycle(held).arm,1);assert.equal(sampleRefuelingCycle(held).departure,0);
assert(finishRefueling(held));stepRefuelingCycle(held,0);assert.equal(held.phase,'disconnect');
const chunked=createRefuelingCycle();for(let i=0;i<480;i++)stepRefuelingCycle(chunked,.1);
assert.equal(chunked.phase,'complete','Frame chunking preserves total cycle duration');
assert.throws(()=>stepRefuelingCycle(chunked,NaN));
(async()=>{
 const threeURL=pathToFileURL(path.resolve('vendor/three/build/three.module.js')).href,THREE=await import(threeURL);
 const utils=fs.readFileSync('vendor/three/examples/jsm/utils/BufferGeometryUtils.js','utf8').replace("from 'three'",`from '${threeURL}'`);
 const utilsURL='data:text/javascript;base64,'+Buffer.from(utils).toString('base64');
 const loaderCode=fs.readFileSync('vendor/three/examples/jsm/loaders/GLTFLoader.js','utf8').replace("from 'three'",`from '${threeURL}'`).replace("from '../utils/BufferGeometryUtils.js'",`from '${utilsURL}'`);
 const {mergeGeometries}=await import(utilsURL);
 const {GLTFLoader}=await import('data:text/javascript;base64,'+Buffer.from(loaderCode).toString('base64'));
 const arm={};vm.runInNewContext(fs.readFileSync('experiments/depot-arm.js','utf8').replace('export function','function'),arm);
 const html=fs.readFileSync('experiments/refueling-depot.html','utf8');
 const batch=vm.runInNewContext(html.slice(html.indexOf('function batchStaticLiner('),html.indexOf('function showLinerVariants('))+';batchStaticLiner',{THREE,mergeGeometries});
 const controller=html.slice(html.indexOf('// One serviced liner at a time;'),html.indexOf('const sky=DW.flightSkybox.create'));
 const portCode=html.slice(html.indexOf(' // Find an underside contact'),html.indexOf(' root.updateMatrixWorld(true);const envelope='));
 const liners=new Map(),linerPorts=new Map(),linerLocalBounds=new Map(),linerEnvelopes=new Map(),depot=new THREE.Group(),groups=new Map(),elements=new Map(),DW={},events=[];
 const el=id=>{if(!elements.has(id))elements.set(id,{value:0,checked:false,disabled:false,textContent:''});return elements.get(id);};
 depot.rotation.x=-Math.PI/2;depot.updateMatrixWorld(true);
 for(const x of [-112,0])for(const section of ['upper','forearm','wrist']){const g=new THREE.Group();depot.add(g);groups.set(`arm-${x}-${section}`,g);}
 const cruiseAttitude=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-Math.PI/2);
 const dockAttitude=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,-1,0)));
 for(const id of ['commuter','double-decker']){
  const bytes=fs.readFileSync(`assets/ships/civilian-airliners/${id}.glb`),gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const root=new THREE.Group();root.position.set(id==='commuter'?-112:35,-41,80);root.add(batch(gltf.scene,gltf.animations));root.quaternion.copy(cruiseAttitude);root.updateMatrixWorld(true);liners.set(id,root);
  vm.runInNewContext(portCode,{root,id,gltf,THREE,linerPorts});
  const box=new THREE.Box3().setFromObject(root);linerLocalBounds.set(id,box.clone().applyMatrix4(root.matrixWorld.clone().invert()));linerEnvelopes.set(id,{box});
  assert.equal(gltf.scene.parent,null,'Original mesh hierarchy stays detached during motion');
  assert(linerPorts.get(id).normal.y<-.5,'Contact is underneath the ship');
  assert(!linerPorts.get(id).marker,'No added service-dot mesh');
 }
 const context={...timeline,solveDepotArm:arm.solveDepotArm,THREE,cruiseAttitude,dockAttitude,liners,linerPorts,depot,groups,el,DW,data:{},benchmark:null,linerEnvelopes,linerLocalBounds,markers:new THREE.Group(),view(){},pose(){},poseLiners(){for(const root of liners.values())root.quaternion.copy(dockAttitude);},showLiners(){},window:{addEventListener(){},dispatchEvent(e){events.push(e.detail);}},CustomEvent:class{constructor(type,options){this.detail=options.detail;}}};
 vm.createContext(context);vm.runInContext(controller,context);
 for(const id of ['commuter','double-decker']){
  el('cycle-ship').value=id;DW.depotRefueling.start();let fuelPosition=null,connectedFrames=0,previousPosition=liners.get(id).position.clone();
  for(let frame=0;frame<560;frame++){
   context.updateCycle(frame*100);
   const state=DW.depotRefueling.getState();
   const currentPosition=liners.get(id).position;
   assert(Math.abs(currentPosition.x-previousPosition.x)<1e-9&&Math.abs(currentPosition.z-previousPosition.z)<1e-9,'No sideways sliding');
   assert(currentPosition.y>=previousPosition.y-1e-9,'Continuous upward route');
   const forward=new THREE.Vector3(0,0,-1).applyQuaternion(liners.get(id).quaternion);
   assert(forward.distanceTo(new THREE.Vector3(0,1,0))<1e-9,'Bow follows upward traffic throughout cycle');
   previousPosition.copy(currentPosition);
   if(state.phase==='fueling'){
    connectedFrames++;assert.match(el('cycle-status').textContent,/contact error 0.0 mm/,'Real hull port and coupling face coincide');
    const position=liners.get(id).position;if(fuelPosition)assert(position.distanceTo(fuelPosition)<1e-10,'Fueling ship stays still');else fuelPosition=position.clone();
   }
   assert(!el('arm-status').textContent.includes('exceeds'),'Arm targets remain reachable');
  }
  assert(connectedFrames>90);assert.equal(DW.depotRefueling.getState().phase,'complete');
  assert.equal(groups.get(`arm-${id==='commuter'?-112:0}-upper`).scale.x,1,'Rigid arm links are never stretched');
 }
 assert(events.some(e=>e.phase==='fueling')&&events.some(e=>e.phase==='complete'));
 console.log('PASS refueling cycle: deterministic phases, manual trigger hold, safe release ordering, both real hull ports, exact contact, rigid IK, stationary fueling and completion events');
})().catch(e=>{console.error(e);process.exitCode=1;});
