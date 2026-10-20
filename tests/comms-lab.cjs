const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async () => {
  let raf, audio, layers = [], source, disposed = 0;
  const nodes = Object.fromEntries(['screen','original','portrait','palette','timing','noise','volume','scan','amount','status','signal','subtitle','audio-status','audio','speak','stop','pause','line'].map(id => [id,{value:'',textContent:'',appendChild(){},getContext:()=>ctx}]));
  const ctx = {clearRect(){},fillRect(){},drawImage(){},createRadialGradient(){return {addColorStop(){}};}};
  Object.assign(nodes.noise,{value:'35'}); nodes.volume.value='40';nodes.palette.value='green';nodes.scan.value='35';nodes.timing.value='1'; nodes.portrait.value='0'; nodes.line.value='Control, holding position.';
  class Audio {
    constructor(){audio=this;this.currentTime=0;this.state='running';this.destination={};}
    async resume(){}
    createGain(){return {gain:{value:0,setTargetAtTime(){}},connect(){}};}
    createBuffer(channels,length,rate){return {duration:length/rate,copyToChannel(){}};}
    createBufferSource(){source={connect(){},disconnect(){},stop(){this.stopped=true;},start(t){this.started=t;},onended:null};return source;}
    async close(){}
  }
  const DW = {}, lifecycle={};
  const sandbox={window:{Driftworks:DW},document:{getElementById:id=>nodes[id],createElement:()=>({appendChild(){},getContext:()=>ctx})},Image:class{set src(v){this.onload();}},AudioContext:Audio,Float32Array,matchMedia:()=>({matches:false}),performance:{now:()=>0},requestAnimationFrame:fn=>{raf=fn;return 1;},cancelAnimationFrame(){},addEventListener:(name,fn)=>{lifecycle[name]=fn;}};
  Object.values(nodes).forEach(node=>{node.ownerDocument=sandbox.document;});
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('experiments/mumble.js','utf8'),sandbox);
  vm.runInContext(fs.readFileSync('experiments/comms-display.js','utf8'),sandbox);
  vm.runInContext(fs.readFileSync('experiments/speech-sprites/generated-v1/face-blend.js','utf8'),sandbox);
  DW.faceBlend.create=()=>({draw:v=>{layers=v;},dispose(){disposed++;}});
  vm.runInContext(fs.readFileSync('experiments/comms-lab.js','utf8'),sandbox);
  await nodes.speak.onclick();
  assert.ok(source.started > 0);
  const plan=DW.mumble.analyze(nodes.line.value,Object.assign({},DW.mumble.defaults,{seed:17,volume:.55}));
  const syllable=plan.events.find(e=>e.kind==='syllable');
  audio.currentTime=source.started+.16+syllable.start+.025;raf();
  assert.ok(layers.some(l=>['ah','eh','oo'].includes(l.image)),'mouth follows voiced syllable');
  assert.equal(nodes.status.textContent,'RECEIVING');
  nodes.audio.onclick();raf();assert.equal(nodes.audio.textContent,'Unmute audio');
  nodes.pause.onclick();
  source.onended();raf();assert.equal(nodes.signal.textContent,'NO CARRIER');assert.equal(nodes.status.textContent,'CHANNEL CLOSED');
  await nodes.speak.onclick();const previous=source;nodes.stop.onclick();raf();assert.ok(previous.stopped);assert.equal(nodes.signal.textContent,'NO CARRIER');
  await nodes.speak.onclick();nodes.portrait.onchange();assert.ok(disposed>0);raf();assert.equal(nodes.signal.textContent,'NO CARRIER');
  lifecycle.pagehide();
  console.log('PASS comms audition: speech-clock mouth cues, mute, completed cutoff, stop, portrait replacement and disposal');
})().catch(error=>{console.error(error);process.exitCode=1;});
