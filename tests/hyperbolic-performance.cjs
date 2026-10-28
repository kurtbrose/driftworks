'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const DW=require('../tools/headless.cjs').loadRuntime();
const events=new Map(),nodes=new Map(),noop=()=>{};
let inputMode="mouse",actions,captures=0,hudView,hudCalls=0,demand={throttle:null,throttleRate:0,stop:false,pitch:0,yaw:0,roll:0,side:0,vertical:0,boost:false,fire:false};
DW.flightHud={mount:()=>({render:view=>{hudView=view;hudCalls++;},cycleRadarRange:noop})};
DW.flightControls={mount:(_host,callbacks)=>{actions=callbacks;return {clear:noop,release:noop,resetButtons:noop,capture:()=>{captures++;},startUncaptured:()=>callbacks.resume(),sample:()=>demand,view:()=>({mouse:[0,0],inputMode,showMouseStick:false,stickRange:240})};}};
const context2d=new Proxy({},{get:(o,key)=>key in o?o[key]:noop});
class Node {
 constructor(id){this.id=id;this.value=id==='radius'?'650':'';this.checked=id!=='capture-mouse';this.options=[];this.style={};this.width=0;this.height=0;this.textContent='';this.dataset={};this.classList={add:noop,contains:()=>false};}
 blur(){} addEventListener(){} getContext(){return context2d;} appendChild(){} querySelector(){return null;}
}
const get=id=>{if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);};
let now=0,raf,draws=0,lastActors=true,uploads=0;
const scene={setSurfaceCamera:noop,setStudyDiagnostics:v=>{lastActors=v.actors;},prepareStudyTextures:async()=>{uploads++;},resetCombat:noop,setStudyActors:noop,setStudyExplosions:noop,sync:noop,render:()=>{draws++;},completeFrame:noop,getRenderStats:()=>({drawCalls:lastActors?11:0,triangles:lastActors?47674:0})};
DW.scene3d={create:()=>scene};DW.flightRadar={draw:noop};
const requests=[];
DW.shipPackModels.populate=node=>{node.options=[{text:'Raptor',value:'raptor'}];};
DW.shipPackModels.find=id=>({model:{id}});DW.shipPackModels.sourceDraw=()=>({vertices:new Float32Array(),color:[1,1,1]});DW.shipPackModels.textureSources=()=>[];
DW.shipPackModels.loadTextures=ids=>{requests.push(ids);return Promise.resolve(new Map());};
const document={hidden:false,body:{classList:{add:noop,remove:noop}},getElementById:get,addEventListener:(name,fn)=>events.set(name,fn)};
const window={Driftworks:DW,addEventListener:(name,fn)=>events.set(name,fn)};
const context=vm.createContext({window,document,innerWidth:1280,innerHeight:720,devicePixelRatio:1,performance:{now:()=>now},requestAnimationFrame:fn=>{raf=fn;},HTMLCanvasElement:Node,HTMLInputElement:Node,HTMLSelectElement:Node,HTMLButtonElement:Node,console});
vm.runInContext(fs.readFileSync('experiments/hyperbolic-flight-model.js','utf8'),context);
vm.runInContext(fs.readFileSync('experiments/input.js','utf8'),context);
vm.runInContext(fs.readFileSync('experiments/hyperbolic-flight.js','utf8'),context);
const frame=()=>{now+=1000/60;raf(now);};
const flush=()=>new Promise(setImmediate);
(async()=>{
 await flush();assert.equal(requests.length,1);assert.deepEqual(Array.from(requests[0]),['raptor']);
 assert.equal(captures,0,'loading never requests mouse capture');
 frame();assert.ok(hudCalls>0,'the shared flight HUD renders');assert.equal(hudView.combat.mode,'hyperbolic');
 const H=DW.hyperbolicFlight,me={p:[1,0,0,0],axes:[[0,1,0,0],[0,0,1,0],[0,0,0,1]]};
 assert.ok(hudView.aimingSolution,'geodesic lead reaches the shared aiming pip');
 const contact=hudView.combat.enemies[0];assert.ok(Math.abs(Math.hypot(...contact.pose.eye)*hudView.units-H.distance(me.p,H.create().actors[1].p)*650)<1e-6,'HUD radar coordinates preserve intrinsic range');
 get('fly').onclick();frame();assert.equal(hudView.paused,false,'Start flight resumes mouse flight without waiting for pointer lock');assert.equal(captures,0);
 demand.throttle=-.5;frame();assert.equal(hudView.state.throttle,-.5,'absolute joystick throttle and reverse reach the real hyperbolic flight model');
 demand.stop=true;frame();assert.equal(hudView.state.throttle,0,'stop overrides absolute throttle');demand.throttle=null;demand.stop=false;actions.pause();frame();
 const frozen=draws;
 for(let i=0;i<300;i++)frame();assert.equal(draws,frozen,'paused idle must not submit frames');
 actions.nextTarget();frame();assert.equal(draws,frozen+1,'paused target change redraws once');assert.equal(hudView.combat.targetId,'hyperbolic-3');
 events.get('resize')();frame();assert.equal(draws,frozen+2,'paused resize redraws once');
 get('benchmark').onclick();for(let i=0;i<600;i++)frame();frame();assert.equal(lastActors,true,'benchmark restores visible fleet after the final OFF phase');
 const complete=draws;for(let i=0;i<30;i++)frame();assert.equal(draws,complete,'completed benchmark returns to idle');
 get('benchmark').onclick();frame();events.get('resize')();frame();assert.match(get('metrics').textContent,/canceled/,'viewport changes invalidate the measurement');
 get('benchmark').onclick();frame();document.hidden=true;events.get('visibilitychange')();const hidden=draws;for(let i=0;i<20;i++)frame();assert.equal(draws,hidden);assert.match(get('metrics').textContent,/canceled/);
 inputMode='controller';document.hidden=false;events.get('visibilitychange')();frame();get('fly').onclick();frame();frame();assert.ok(draws>hidden,'resume restarts rendering');assert.equal(captures,0,'controller flight does not capture mouse');
 // Resolve model switches out of order: only the last selection may publish.
 const pending=[];DW.shipPackModels.loadTextures=ids=>new Promise(resolve=>pending.push({ids,resolve}));
 get('ship').value='first';get('ship').onchange();get('ship').value='last';get('ship').onchange();
 const previousUploads=uploads;pending[1].resolve(new Map());await flush();pending[0].resolve(new Map());await flush();assert.equal(uploads,previousUploads+1,'stale model requests must not publish or upload');
 // Exercise the actual shared HUD: geometry-specific lead must never be warped
 // or silently replaced with the flat-space solver, including explicit null.
 const arcs=[],painter=new Proxy({arc:(x,y,r)=>arcs.push({x,y,r})},{get:(o,k)=>k in o?o[k]:noop});
 for(const node of nodes.values()){node.dataset={};node.classList={add:noop,contains:()=>false};node.querySelector=()=>null;node.appendChild=noop;}
 get('flight-lanes').checked=false;
 document.querySelector=()=>get('aside');document.body.classList.contains=()=>false;
 DW.gpuUi={create:()=>({painter,begin:()=>{arcs.length=0;},end:noop})};
 DW.flightTargetCamera={mount:()=>({update:()=>false})};DW.flightPresentation={model:()=>({name:'Raptor'})};DW.experimentDom=()=>get;
 vm.runInContext(fs.readFileSync('experiments/skybox.js','utf8'),context);
 vm.runInContext(fs.readFileSync('experiments/flight-hud.js','utf8'),context);
 DW.training.firingSolution=()=>{throw new Error('Hyperbolic HUD must not call the Euclidean lead solver');};
 const shared=DW.flightHud.mount({clientWidth:1280,clientHeight:720});
 hudView.combat.enemies[0].hp=100;hudView.combat.targetId=hudView.combat.enemies[0].id;
 hudView.aimingSolution={direction:[.1,.05,-1],time:.5};
 shared.render(hudView);
 const expected=DW.flightSkybox.project(hudView.aimingSolution.direction,hudView.state,1280/720);
 assert.ok(arcs.some(a=>a.r===7&&Math.abs(a.x-1280*(expected.x+1)/2)<1e-6&&Math.abs(a.y-720*(1-expected.y)/2)<1e-6),'shared pip follows the supplied geodesic direction');
 hudView.aimingSolution=null;shared.render(hudView);assert.ok(!arcs.some(a=>a.r===7),'unreachable targets have no pip or flat-space fallback');
 console.log('Hyperbolic performance lifecycle: selected loading, idle pause, benchmark restore/cancel, hidden tabs and stale model requests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
