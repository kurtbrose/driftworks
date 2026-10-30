'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadRuntime,createFlight}=require('../tools/headless.cjs'),root=path.resolve(__dirname,'..');
// Geometry queries must load without catalog, browser resources or a renderer.
const isolated={};vm.runInNewContext(fs.readFileSync(path.join(root,'src/ship-hulls.js'),'utf8'),{window:{Driftworks:isolated}});
assert.equal(isolated.shipHulls.hullRadius({vertices:[3,4,0,0,0,1]}),5);
assert.equal(isolated.shipAssets,undefined);assert.equal(isolated.shipRender,undefined);
const DW=loadRuntime();
for(const [owner,methods] of Object.entries({shipCatalog:['find','craftModel','gunAnchors'],shipHulls:['hullHit','hullRadius','addScorch'],shipAssets:['loadTextures','populate'],shipRender:['geometry','sourceDraw','sourceScorchGeometry']}))for(const key of methods)assert.equal(DW.shipPackModels[key],DW[owner][key]);
assert.equal(DW.flightSim.geometry,DW.flightBlockout.geometry);assert.equal(DW.flightSim.steer,DW.flightOpponent.steer);
// Transmission completion is an explicit input to mission progression.
const flight=createFlight({mission:'ohio',seed:29}),combat=flight.snapshot().combat,life=flight.DW.flightMissionRuntime,opening=flight.DW.flightMissions.resolve('ohio').opening;
assert(opening.length);combat.time=1;
assert.equal(life.openingCue(combat,true),null);assert.equal(combat.openingStep,0);
for(let i=0;i<opening.length;i++){const cue=life.openingCue(combat,false);assert.equal(cue.index,i);assert.equal(cue.line,opening[i]);}
assert(life.openingPending(combat));assert.equal(life.openingCue(combat,true),null);assert(life.openingPending(combat));
assert.equal(life.openingCue(combat,false),null);assert.equal(life.openingPending(combat),false);
// Capital gameplay can be created and damaged with no visual module, Image or DOM.
for(const file of ['assets/ships/aegis-kit/flight-rig.js','src/aegis-sim.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{window:{Driftworks:DW}});
assert.equal(DW.aegisVisual,undefined);
const U=DW.sim.METERS_PER_UNIT,state={team:'ally',position:[0,0,1200],heading:0,velocity:[0,0,0],integrity:20000};
const sim=DW.aegisSim.create({state,opponent:state});assert.equal(sim.geometry,undefined);assert.equal(sim.effects,undefined);
assert.equal(sim.components().length,29);assert(sim.visualState().parts.every(p=>!('batches' in p)&&!('basis' in p)));
const point=sim.hit([-2000/U,0,1200],[2000/U,0,1200]);assert(point);assert(sim.damage(point,5,combat));assert.equal(state.integrity,19995);
assert.equal(DW.aegisVisual,undefined);
console.log('PASS module boundaries: standalone hull queries and capital gameplay, compatibility delegates, opponent/art ownership and transmission-completed mission progression');
