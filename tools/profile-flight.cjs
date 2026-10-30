// Development-only CPU benchmark: real flight/session/geometry, stubbed browser resources.
// GPU, DOM layout, Web Audio and driver costs require the browser diagnostics.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {performance} = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
global.window = global;
global.DRIFTWORKS_TEST_MODE = true;
global.addEventListener = () => {};
const elements = new Map();
function element() {return {value:'',checked:false,children:[],listeners:{},addEventListener(name,fn){this.listeners[name]=fn;},appendChild(child){this.children.push(child);},insertBefore(child){this.children.unshift(child);}};}
global.document = {getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},createElement:element};
const html = fs.readFileSync(path.join(root,'experiments/flight.html'),'utf8');
for(const match of html.matchAll(/<script\b([^>]*)\bsrc="([^"?]+)[^"]*"[^>]*>/g)) {
  const src=match[2];
  if(match[1].includes('module') || src.includes('vendor/') || src==='flight.js')continue;
  vm.runInThisContext(fs.readFileSync(path.resolve(root,'experiments',src),'utf8'),{filename:src});
}
const DW=global.Driftworks;
const baked=process.argv.includes('--baked');
if(baked){const original=DW.shipPackModels.sourceFleetGeometry;DW.shipPackModels.sourceFleetGeometry=function(...args){args[6]=false;return original.apply(this,args);};}
const rows=new Map();
let collecting=false, uploadBytes=0, uploadCalls=0;
function instrument(object,key,label=key){const original=object[key];object[key]=function(...args){if(!collecting)return original.apply(this,args);const start=performance.now();try{return original.apply(this,args);}finally{const row=rows.get(label)||{calls:0,ms:0};row.calls++;row.ms+=performance.now()-start;rows.set(label,row);}};}
for(const key of ['sourceFleetGeometry','scorchGeometry','engineGeometry','craftModel'])instrument(DW.shipPackModels,key);
for(const key of ['surfaceFrame','rockField'])instrument(DW.scene3d,key);
instrument(DW.flightTargetCamera,'radius','targetRadius');
const uploaded=new WeakSet();
function upload(batches){for(const batch of batches){if(!batch.vertices.length)continue;if(!batch.staticGeometry || !uploaded.has(batch.vertices)){if(collecting){uploadCalls++;uploadBytes+=batch.vertices.byteLength;}uploaded.add(batch.vertices);}}}
DW.scene3d.create=()=>({setSurfaceCamera(){},setStudyActors:upload,setStudyEffects:upload,setStudyDiagnostics(){},sync(){},render(){},getRenderStats(){return {};}});
DW.flightSkybox.create=()=>({render(){},getRenderStats(){return {};}});
DW.shipPackModels.loadTextures=()=>({then(fn){fn(new Map());return {catch(){}};}});
const session=DW.flightSession.create({terrainHit(){return null;},surfaceFrame(a,d){return DW.asteroidTerrain.surfaceFrame(a,d);},onGunshot(){},onImpact(){}});
const config={mode:'furball',enabled:true,profile:DW.arcade.profiles[0],weapon:DW.retailWeapons[0]};
session.reset(config);
const presentation=DW.flightPresentation.mount({},()=>session.snapshot().world,()=>{}, {document:global.document});
instrument(session,'advance','sessionAdvance');
instrument(presentation,'render','presentationRender (inclusive)');
const appearance=presentation.appearance(), comparison={mode:'normal',scale:1,mothership:true,actors:true,flat:false};
const controls={throttle:0,throttleRate:0,stop:true,fire:false};
const frames=Number(process.argv[2]||240);
let sample=[];
function runFrame(advance){const start=performance.now();if(advance)session.advance(1/60,controls,config);const view=session.snapshot();view.world.elapsedSeconds+=advance?1/60:0;presentation.render(view,appearance,comparison,1/60);
// The monitor checks bounds when fitting its target.
const target=DW.flightSim.alive(view.combat)[0];if(target)DW.flightTargetCamera.radius(DW.shipPackModels.craftModel(target,'mixed',view.combat.wave));
return performance.now()-start;}
for(let i=0;i<30;i++)runFrame(true);
collecting=true;
for(let i=0;i<frames;i++)sample.push(runFrame(true));
sample.sort((a,b)=>a-b);
console.log(JSON.stringify({frames,mode:baked?'CPU-baked hulls':'cached hull draws',scope:'CPU flight/session and geometry; GPU/DOM/audio excluded; texture images stubbed',p50Ms:sample[Math.floor(frames*.5)],p95Ms:sample[Math.floor(frames*.95)],meanMs:sample.reduce((a,b)=>a+b,0)/frames,uploadMiBPerFrame:uploadBytes/frames/1048576,uploadCallsPerFrame:uploadCalls/frames,stages:[...rows].map(([name,row])=>({name,callsPerFrame:row.calls/frames,msPerFrame:row.ms/frames})).sort((a,b)=>b.msPerFrame-a.msPerFrame)},null,2));
