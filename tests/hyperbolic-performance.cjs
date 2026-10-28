'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const DW=require('../tools/headless.cjs').loadRuntime();
const events=new Map(),nodes=new Map(),noop=()=>{};
const context2d=new Proxy({},{get:(o,key)=>key in o?o[key]:noop});
class Node {
 constructor(id){this.id=id;this.value=id==='radius'?'650':'';this.checked=true;this.options=[];this.style={};this.width=0;this.height=0;this.textContent='';}
 blur(){} addEventListener(){} getContext(){return context2d;}
}
const get=id=>{if(!nodes.has(id))nodes.set(id,new Node(id));return nodes.get(id);};
let now=0,raf,draws=0,lastActors=true,uploads=0;
const scene={setSurfaceCamera:noop,setStudyDiagnostics:v=>{lastActors=v.actors;},prepareStudyTextures:async()=>{uploads++;},resetCombat:noop,setStudyActors:noop,setStudyExplosions:noop,sync:noop,render:()=>{draws++;},completeFrame:noop,getRenderStats:()=>({drawCalls:lastActors?11:0,triangles:lastActors?47674:0})};
DW.scene3d={create:()=>scene};DW.flightRadar={draw:noop};
const requests=[];
DW.shipPackModels.populate=node=>{node.options=[{text:'Raptor',value:'raptor'}];};
DW.shipPackModels.find=id=>({model:{id}});DW.shipPackModels.sourceDraw=()=>({vertices:new Float32Array(),color:[1,1,1]});DW.shipPackModels.textureSources=()=>[];
DW.shipPackModels.loadTextures=ids=>{requests.push(ids);return Promise.resolve(new Map());};
const document={hidden:false,getElementById:get,addEventListener:(name,fn)=>events.set(name,fn)};
const window={Driftworks:DW,addEventListener:(name,fn)=>events.set(name,fn)};
const context=vm.createContext({window,document,innerWidth:1280,innerHeight:720,devicePixelRatio:1,performance:{now:()=>now},requestAnimationFrame:fn=>{raf=fn;},HTMLInputElement:Node,HTMLSelectElement:Node,HTMLButtonElement:Node,console});
vm.runInContext(fs.readFileSync('experiments/hyperbolic-flight-model.js','utf8'),context);
vm.runInContext(fs.readFileSync('experiments/input.js','utf8'),context);
vm.runInContext(fs.readFileSync('experiments/hyperbolic-flight.js','utf8'),context);
const frame=()=>{now+=1000/60;raf(now);};
const key=code=>events.get('keydown')({code,target:{},repeat:false,preventDefault:noop});
const flush=()=>new Promise(setImmediate);
(async()=>{
 await flush();assert.equal(requests.length,1);assert.deepEqual(Array.from(requests[0]),['raptor']);
 frame();get('pause').onclick();frame();const frozen=draws;
 for(let i=0;i<300;i++)frame();assert.equal(draws,frozen,'paused idle must not submit frames');
 key('Tab');frame();assert.equal(draws,frozen+1,'paused target change redraws once');
 events.get('resize')();frame();assert.equal(draws,frozen+2,'paused resize redraws once');
 get('benchmark').onclick();for(let i=0;i<600;i++)frame();frame();assert.equal(lastActors,true,'benchmark restores visible fleet after the final OFF phase');
 const complete=draws;for(let i=0;i<30;i++)frame();assert.equal(draws,complete,'completed benchmark returns to idle');
 get('benchmark').onclick();frame();events.get('resize')();frame();assert.match(get('metrics').textContent,/canceled/,'viewport changes invalidate the measurement');
 get('benchmark').onclick();frame();document.hidden=true;events.get('visibilitychange')();const hidden=draws;for(let i=0;i<20;i++)frame();assert.equal(draws,hidden);assert.match(get('metrics').textContent,/canceled/);
 document.hidden=false;events.get('visibilitychange')();frame();get('pause').onclick();frame();frame();assert.ok(draws>hidden,'resume restarts rendering');
 // Resolve model switches out of order: only the last selection may publish.
 const pending=[];DW.shipPackModels.loadTextures=ids=>new Promise(resolve=>pending.push({ids,resolve}));
 get('ship').value='first';get('ship').onchange();get('ship').value='last';get('ship').onchange();
 const previousUploads=uploads;pending[1].resolve(new Map());await flush();pending[0].resolve(new Map());await flush();assert.equal(uploads,previousUploads+1,'stale model requests must not publish or upload');
 console.log('Hyperbolic performance lifecycle: selected loading, idle pause, benchmark restore/cancel, hidden tabs and stale model requests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
