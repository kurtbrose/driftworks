'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {Worker} = require('node:worker_threads');
const {pathToFileURL} = require('node:url');
const workerSource = fs.readFileSync('experiments/mumble-worker.js', 'utf8');
const radioSource = fs.readFileSync('experiments/flight-radio.js', 'utf8');

function radioHarness(options = {}) {
  const workers = [], sources = [], activity = [], cues = [], events = {}, busy = [];
  let line = null;
  const fields = {speaker:{textContent:''}, subtitle:{textContent:''}};
  const context = {state:'running', currentTime:17, createBuffer(channels, length, rate) {
    assert.equal(channels,1); assert.equal(rate,22050);
    return {copyToChannel(samples) { assert.equal(samples.length,length); }};
  }, createBufferSource() { const source = {connect(){},disconnect(){},start(time){this.started=time;},stop(){this.stopped=true;}}; sources.push(source); return source; }};
  class DeferredWorker {
    constructor(url) { if(options.constructorError)throw Error('blocked');this.url=url;this.messages=[];workers.push(this); }
    postMessage(request) { if(options.postError)throw Error('send failed');this.messages.push(request); }
    terminate() { this.terminated=true; }
    deliver(id) { const request=this.messages.find(m=>m.kind==='render');this.onmessage({data:{id:id ?? request.id,samples:new Float32Array(16),duration:2,speechOffset:.4,noise:{effects:.45}}}); }
  }
  const plan = {text:'Ready!',duration:1,events:[],voice:{}};
  const portrait = {show(){cues.push('show');},play(...args){cues.push(args);},stop(){cues.push('stop');},clear(){},finish(){cues.push('finish');},decay(){},update(){}};
  const DW = {assetUrl:url=>url+'?v=test',audio:{commsChannel:()=>({context,output:{}}),setCommsActive:value=>activity.push(value)},
    flightComms:{create:()=>({emotions:{},quiet:0}),step(clock,dt,combat,occupied){busy.push(occupied);const next=line;line=null;return occupied?null:next;}},
    flightDialogue:{voiceOptions:value=>value},flightPortraits:{mount:()=>portrait},mumble:{presets:{Scout:{}},analyze:()=>plan,
      render(){throw Error('Synthesis must never execute on the UI thread');},transmit(){throw Error('Radio filtering must never execute on the UI thread');}}};
  const window = {Driftworks:DW,addEventListener:(name,handler)=>{events[name]=handler;}};
  if(!options.unsupported)window.Worker=DeferredWorker;
  const document = {baseURI:'http://localhost/subdir/studies/ellis-benchmark.html',currentScript:{getAttribute:()=> '../experiments/flight-radio.js?v=radio'}};
  vm.runInNewContext(radioSource,{window,document,URL,Float32Array});
  const panel={querySelector:selector=>selector==='[data-speaker]'?fields.speaker:fields.subtitle,classList:{add(){},remove(){},toggle(){}}},toggle={setAttribute(){}};
  const radio=DW.flightRadio.mount(panel,toggle);
  function emit(){line={text:'Ready!',speaker:'Scout',voice:'Scout',craftId:'wing',seed:7,radioSeed:11};radio.update(0,{},{});}
  radio.unlock();
  return {radio,workers,sources,activity,cues,events,context,fields,toggle,busy,emit};
}

function lifecycle() {
  let h=radioHarness();h.emit();
  assert.equal(h.sources.length,0,'Rendering must return before audio preparation completes');
  assert.match(h.workers[0].url,/\/subdir\/experiments\/mumble-worker.js\?v=test$/);
  assert.match(h.workers[0].messages[0].url,/\/subdir\/experiments\/mumble.js\?v=test$/);
  h.radio.update(9,{},{});assert.equal(h.busy.at(-1),true);assert.equal(h.radio.speakerId(),'wing');
  h.workers[0].deliver(-1);assert.equal(h.sources.length,0,'Wrong job ignored');
  h.context.currentTime=30;h.workers[0].deliver();assert.equal(h.sources[0].started,30);
  assert.equal(h.cues.find(Array.isArray)[2],30,'Portrait starts from actual audio time, after preparation');
  assert.equal(h.cues.find(Array.isArray)[3],.4,'Radio lead-in preserved');
  assert.equal(h.activity.at(-1),true);h.sources[0].onended();assert.equal(h.activity.at(-1),false);assert.equal(h.cues.at(-1),'finish');
  for(const action of ['pause','reset','mute','pagehide']) {
    h=radioHarness();h.emit();const stale=h.workers[0];
    if(action==='mute')h.toggle.onclick();else if(action==='pagehide')h.events.pagehide();else h.radio[action]();
    assert.equal(stale.terminated,true,action+' cancels computation');stale.deliver();assert.equal(h.sources.length,0,action+' ignores late results');
    if(action==='mute')h.toggle.onclick();h.emit();assert.equal(h.workers.length,2);
    stale.deliver();assert.equal(h.sources.length,0,'Old worker cannot satisfy a new request');h.workers[1].deliver();assert.equal(h.sources.length,1);
    h.radio.pause();assert.equal(h.sources[0].stopped,true);
  }
  for(const mode of ['error','messageerror','timeout','constructorError','postError','unsupported']) {
    h=radioHarness({[mode]:true});h.emit();
    if(mode==='error')h.workers[0].onerror({preventDefault(){}});
    if(mode==='messageerror')h.workers[0].onmessageerror();
    if(mode==='timeout')h.radio.update(10,{},{});
    assert.equal(h.sources.length,0);h.radio.update(20,{},{});assert.equal(h.radio.speakerId(),null,mode+' releases the channel');
    h.radio.update(0,{},{});assert.equal(h.busy.at(-1),false);
  }
  h=radioHarness();h.emit();h.context.state='suspended';h.workers[0].deliver();assert.equal(h.sources.length,0);
  console.log('PASS background radio lifecycle: async occupancy, audio-clock cues, stale results, pause/reset/mute/pagehide, failure/timeout and no synchronous synthesis');
}

async function parity() {
  const scope={window:{Driftworks:{}}};vm.runInNewContext(fs.readFileSync('experiments/mumble.js','utf8'),scope);
  const api=scope.window.Driftworks.mumble;
  const worker = new Worker(`const {parentPort}=require('node:worker_threads'),fs=require('node:fs'),vm=require('node:vm');
    global.importScripts=url=>vm.runInThisContext(fs.readFileSync(new URL(url),'utf8'));
    global.postMessage=(message,transfer)=>{parentPort.postMessage(message,transfer);if(message.samples.byteLength!==0)throw Error('PCM was copied rather than transferred');};
    ${workerSource}
    parentPort.on('message',data=>global.onmessage({data}));`,{eval:true});
  try {
    worker.postMessage({kind:'init',url:pathToFileURL(path.resolve('experiments/mumble.js')).href});
    for(const [id,name] of ['Scout','Study · nasal clipped','Study · raspy creak'].entries()) {
      const plan=api.analyze('Ready, pilot!',api.presets[name]);
      const pcm=api.render(plan,22050),noise=api.radioNoise(pcm.length,22050,{effects:.45,edgeScale:2.5,seed:11});
      const expected=api.transmit(pcm,22050,{mode:'radio',seed:11,noise});
      const actual=await new Promise((resolve,reject)=>{const failed=e=>{worker.off('message',done);reject(e);};const done=value=>{worker.off('error',failed);resolve(value);};worker.once('message',done);worker.once('error',failed);worker.postMessage({kind:'render',id,plan,radioSeed:11});});
      assert.equal(actual.id,id);assert.deepEqual(Buffer.from(actual.samples.buffer),Buffer.from(expected.samples.buffer));
      assert.equal(actual.duration,expected.duration);assert.equal(actual.speechOffset,expected.speechOffset);
      assert.equal(JSON.stringify(actual.noise),JSON.stringify(noise));
    }
  } finally {await worker.terminate();}
  console.log('PASS actual speech worker: transferred PCM matches synchronous synthesis/filtering exactly, seeded radio noise and timing preserved');
}
lifecycle();parity().catch(error=>{console.error(error);process.exitCode=1;});
