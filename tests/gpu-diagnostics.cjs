'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('experiments/gpu-diagnostics.js','utf8'),storage=new Map();
function boot(debug){
 const events={},root={},saved=[],Canvas=class {constructor(){this.className='flight-skybox';this.width=1920;this.height=1080;this.parentElement={id:'viewer'};}};
 const element=()=>({style:{},append(){},textContent:'',onclick:null});
 const ctx={window:{Driftworks:{},addEventListener:(name,fn)=>{root[name]=fn;}},document:{addEventListener:(name,fn,capture)=>{assert.equal(capture,true);events[name]=fn;},createElement:element,body:{appendChild:e=>saved.push(e)}},HTMLCanvasElement:Canvas,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},location:{pathname:'/experiments/flight.html',search:debug?'?mission=ellis&gpuDebug=1':'?mission=ellis'},URLSearchParams,performance,Date,Math,console};
 vm.runInNewContext(source,ctx);return {api:ctx.window.Driftworks.gpuDiagnostics,events,Canvas,saved};
}
const first=boot(true);assert.equal(JSON.parse(first.api.snapshot()).records.at(-1).detail.lod,'explicit');first.api.mark('ellis.primary');first.api.mark('ellis.composition');
first.events.webglcontextlost({target:new first.Canvas(),statusMessage:'test reset'});
let data=JSON.parse(first.api.snapshot()),lost=data.records.at(-1);assert.equal(lost.kind,'webglcontextlost');assert.equal(lost.stage,'ellis.composition');assert.equal(lost.detail.canvas.width,1920);assert.equal(lost.recent.length,2);
const second=boot(false);data=JSON.parse(second.api.snapshot());assert(data.records.some(r=>r.kind==='webglcontextlost'),'loss evidence survives a new page instance');
second.api.mark('ignored');assert.equal(JSON.parse(second.api.snapshot()).sequence,0,'default mode does not collect per-pass markers');
assert.equal(first.saved.length,1);assert.equal(second.saved.length,0,'diagnostic panel is opt-in');
console.log('PASS graphics diagnostics: persistent context loss, capture listeners, recent stage breadcrumbs and opt-in UI');
