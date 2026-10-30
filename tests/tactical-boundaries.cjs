'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const DW=require('./helpers/shared-runtime.cjs').install().namespace,sim=DW.sim;
let world=sim.createInitialWorld(29);world.asteroids=[];world.platforms=[];world.wrecks=[];
const home=world.ships.find(s=>s.type==='mothership'),tug=world.ships.find(s=>s.type==='tug'),escort=world.ships.find(s=>s.type==='escort');
const empty={homeShipId:null,platformId:null,guardedShipIds:[],recovery:null,asteroidId:null,depotHit:false},point={x:500,y:600},copy=x=>JSON.parse(JSON.stringify(x));
const both=[tug.id,escort.id];
assert.deepEqual(sim.issuePickedContextOrder(world,point,{...empty,homeShipId:home.id,asteroidId:'other',depotHit:true},both),sim.issueReturnOrder(world,both),'home wins over other picks');
assert.deepEqual(sim.issuePickedContextOrder(world,point,empty,[tug.id]),sim.issueMoveOrder(world,point,[tug.id]));
const mixed=sim.issuePickedContextOrder(world,point,{...empty,guardedShipIds:[tug.id]},both);
assert.equal(mixed.ships.find(s=>s.id===tug.id).order.kind,'move');assert.equal(mixed.ships.find(s=>s.id===escort.id).order.kind,'defend');
const before=copy(world);const picked=DW.tacticalPicking.pickContext(world,home.position,DW.game.semanticScale);
assert.equal(picked.homeShipId,home.id);assert(picked.guardedShipIds.every(id=>typeof id==='string'));assert.deepEqual(copy(world),before);
// Mount the real input controller with no renderer and no game module.
const events={},keys={},buttons=new Map();const button=()=>({addEventListener(){},setAttribute(){}});
const canvas={getBoundingClientRect:()=>({left:0,top:0}),addEventListener:(name,fn)=>events[name]=fn,setPointerCapture(){}};
const owner={canvas,toolbar:{querySelector:selector=>{if(!buttons.has(selector))buttons.set(selector,button());return buttons.get(selector);}},host:{clientWidth:800,clientHeight:600},study:false,terrainZoom:false,viewerEnabled:false,orbit:{yaw:0,tilt:.48},focus:true,studyHeight:0,rigLightsEnabled:false,spotlightEnabled:false,workShadowsEnabled:false,pickBatches:[],
 getWorld:()=>world,setWorld:value=>world=value,consume(){},view:DW.scene3d.view,project:DW.scene3d.project,unproject:DW.scene3d.unproject,pickAsteroid:DW.scene3d.pickAsteroid,platformHeight:()=>0,pickStudyBatches:()=>null};
let commands=0;const isolated={sim:{...sim,issuePickedContextOrder(...args){commands++;return sim.issuePickedContextOrder(...args);}},tacticalPicking:DW.tacticalPicking};
const window={Driftworks:isolated,addEventListener:(name,fn)=>keys[name]=fn};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/tactical/input3d.js'),'utf8'),{window,HTMLElement:class {}});
const input=isolated.tacticalInput3d.mount(owner);assert.equal(isolated.game,undefined);
world.selectedShipIds=[tug.id];const expected=DW.scene3d.unproject({x:790,y:590},world.camera,{width:800,height:600},owner.orbit);assert(expected);
events.pointerdown({button:2,altKey:false,clientX:790,clientY:590});assert.equal(commands,1);assert.equal(owner.focus,false);
events.pointerdown({button:0,altKey:false,clientX:20,clientY:30,preventDefault(){}});assert(input.drag);keys.blur();assert.equal(input.drag,null);
input.setRigLightsEnabled(true);assert.equal(owner.rigLightsEnabled,true);
assert.equal(DW.scene3d.habitatMesh,DW.stationModels.habitatMesh);
assert.equal(DW.flightHud.predictFlightPath,DW.flightPrediction.predictPath);
assert.equal(DW.flightSkybox.createImpactCues,DW.impactCues.create);
console.log('PASS tactical boundaries: shared command priorities, mixed selection, ID-only picking, renderer-free input dispatch, blur cleanup and prediction/cue delegation');
