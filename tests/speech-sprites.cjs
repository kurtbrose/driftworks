const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async function () {
  const nodes = Object.fromEntries(['portrait','crew','line','status','script','motion','pace','voice','channel','name','play','stop'].map(id => [id,{value:'0',textContent:'',appendChild(){}}]));
  const crops=[], draws=[];nodes.portrait.getContext=()=>({fillRect(){},drawImage(...args){crops.push(args[1]);draws.push(args.slice(1));}});
  nodes.script.value='Hello, crew!';nodes.pace.value='1';nodes.channel.value='radio';
  let raf, image, resumeResolve, lastSource, audio;
  class Audio {
    constructor(){audio=this;this.currentTime=0;this.state='running';}
    resume(){return new Promise(resolve=>{resumeResolve=resolve;});}
    createBuffer(){return {copyToChannel(){}};}
    createBufferSource(){lastSource={connect(){},disconnect(){},start(){},stop(){this.stopped=true;}};return lastSource;}
    close(){}
  }
  const window={Driftworks:{},AudioContext:Audio,matchMedia:()=>({matches:false}),addEventListener(){}};
  const sandbox={window,document:{getElementById:id=>nodes[id],createElement:()=>({})},Image:class {constructor(){image=this;this.complete=true;this.naturalWidth=1774;}},requestAnimationFrame:fn=>{raf=fn;},console,Float32Array};
  vm.createContext(sandbox);
  sandbox.URL=URL; sandbox.document.baseURI='http://localhost:8000/experiments/speech-sprites/index.html';
  sandbox.document.currentScript={getAttribute:()=> '../../src/asset-versions.js'};
  vm.runInContext(fs.readFileSync('src/asset-versions.js','utf8'),sandbox);
  vm.runInContext(fs.readFileSync('experiments/mumble.js','utf8'),sandbox);
  vm.runInContext(fs.readFileSync('experiments/speech-sprites/speech.js','utf8'),sandbox);
  image.onload();assert.equal(nodes.voice.value,'Woman · warm');
  // Stop while audio unlock is pending must prevent late playback.
  let pending=nodes.play.onclick();nodes.stop.onclick();resumeResolve();await pending;
  assert.equal(lastSource,undefined);
  pending=nodes.play.onclick();resumeResolve();await pending;
  assert.equal(nodes.status.textContent,'● RECEIVING');
  assert.ok(lastSource);raf(200);assert.equal(nodes.line.textContent,''); // radio lead-in
  const plan=window.Driftworks.mumble.analyze(nodes.script.value,Object.assign({},window.Driftworks.mumble.defaults,window.Driftworks.mumble.presets[nodes.voice.value],{seed:17,volume:.55}));
  const cue=plan.events.find(e=>e.kind==='syllable');
  audio.currentTime=.03+.16+cue.start+.025;raf(210);assert.ok(nodes.line.textContent.length>0);assert.notEqual(crops.at(-1),10);
  const pause=plan.events.find(e=>e.kind==='pause' && e.duration>.01);
  audio.currentTime=.03+.16+pause.start+pause.duration/2;raf(220);assert.equal(crops.at(-1),10);
  nodes.motion.checked=true;audio.currentTime=.03+.16+cue.start+.025;raf(230);assert.equal(crops.at(-1),10);
  const playing=lastSource;nodes.stop.onclick();assert.ok(playing.stopped);assert.equal(playing.onended,null);
  nodes.crew.value='4';nodes.crew.onchange();assert.equal(nodes.voice.value,'Old man');
  pending=nodes.play.onclick();resumeResolve();await pending;lastSource.onended();
  assert.equal(nodes.status.textContent,'TRANSMISSION COMPLETE');assert.equal(nodes.line.textContent,'Hello, crew!');
  assert.ok(crops.length);
  const bases=draws.filter(args=>args[2]===190);
  assert.ok(bases.length>2);assert.ok(bases.every(args=>args[0]===10),'Every full portrait draw must use the neutral frame');
  console.log('PASS speech sprites: Mumble playback, radio lead-in, stop during unlock/playback, crew casting and completion');
})().catch(error=>{console.error(error);process.exitCode=1;});
