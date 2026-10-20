const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
(async function () {
  const nodes = Object.fromEntries(['line','voice','mood','speak','stop','motion','status','subtitle','timing','pace','channel','blink','proof','face'].map(id => [id,{value:'',textContent:'',checked:false,appendChild(){},addEventListener(){}}]));
  nodes.line.value='Keep your cool, crew!';nodes.pace.value='1';nodes.channel.value='radio';nodes.mood.value='neutral';nodes.blink.checked=true;
  let raf, audio, resume, playing, lastLayers;
  const lifecycle={};
  class Audio {
    constructor(){audio=this;this.currentTime=0;this.state='running';}
    resume(){return new Promise(resolve=>{resume=resolve;});}
    createBuffer(){return {copyToChannel(){}};}
    createBufferSource(){playing={connect(){},disconnect(){},start(){},stop(){this.stopped=true;}};return playing;}
    close(){this.closed=true;}
  }
  const window={Driftworks:{},AudioContext:Audio,matchMedia:()=>({matches:false}),addEventListener:(name,fn)=>{lifecycle[name]=fn;}};
  const sandbox={window,document:{getElementById:id=>nodes[id],createElement:()=>({})},Image:class{set src(value){this.onload();}},requestAnimationFrame:fn=>{raf=fn;},console,Float32Array};
  vm.createContext(sandbox);
  sandbox.URL=URL; sandbox.document.baseURI='http://localhost:8000/experiments/flight.html';
  sandbox.document.currentScript={getAttribute:()=> '../src/asset-versions.js'};
  vm.runInContext(fs.readFileSync('src/asset-versions.js','utf8'),sandbox);
  for(const file of ['experiments/mumble.js','experiments/speech-sprites/generated-v1/face-blend.js'])vm.runInContext(fs.readFileSync(file,'utf8'),sandbox);
  const blend=window.Driftworks.faceBlend, api=window.Driftworks.mumble;
  const plan=api.analyze(nodes.line.value,Object.assign({},api.defaults,api.presets['Woman · warm'],{seed:17,volume:.55}));
  const vowel=plan.events.find(e=>e.kind==='syllable'&&/[ou]/.test(e.vowel));
  assert.equal(blend.speechCue(plan,-.1).alpha,0);
  assert.equal(blend.speechCue(plan,vowel.start+.025).image,'oo');
  assert.ok(blend.speechCue(plan,vowel.start+.025).alpha>0);
  assert.equal(blend.speechCue(plan,plan.duration+.1).alpha,0);
  blend.create=()=>({draw:layers=>{lastLayers=layers;},protectedChanges:()=>0});
  vm.runInContext(fs.readFileSync('experiments/speech-sprites/generated-v1/talking.js','utf8'),sandbox);
  await Promise.resolve();await Promise.resolve();
  assert.equal(nodes.speak.disabled,false);
  let pending=nodes.speak.onclick();nodes.stop.onclick();resume();await pending;
  assert.equal(playing,undefined,'Stopping during audio unlock prevents late playback');
  pending=nodes.speak.onclick();resume();await pending;raf(1000);
  assert.equal(nodes.subtitle.textContent,'');assert.equal(lastLayers.length,0,'Radio lead-in has no speaking mouth');
  audio.currentTime=.03+.16+vowel.start+.025;raf(1100);
  assert.ok(lastLayers.some(layer=>layer.image==='oo'));assert.ok(nodes.subtitle.textContent.length);
  nodes.mood.value='smile';raf(1150);
  const smile=lastLayers.find(layer=>layer.image==='smile-soft');
  assert.equal(smile.alpha,1,'Smile uses the coordinated whole-face edit without neutral-face ghosting');
  const mouth=lastLayers.find(layer=>layer.image==='oo');
  assert.equal(mouth.alpha,1,'A speaking mouth replaces rather than crossfades the resting lips');
  // The opaque mask core must cover the union of broad-smile and speech lips,
  // including the wide corners and lower lip, rather than feather across them.
  for(const [x,y] of [[39.5,60],[56.5,60],[41,64],[55,64],[48,65]]){
    const [cx,cy,rx,ry,feather]=mouth.shape;
    assert.ok(Math.hypot((x-cx)/rx,(y-cy)/ry)<1-feather/100,'Old lip outlines must lie inside the opaque core');
  }
  nodes.mood.value='angry';raf(3000);
  assert.ok(lastLayers.some(layer=>layer.image==='angry'));
  assert.ok(lastLayers.some(layer=>layer.image==='oo'));
  assert.ok(lastLayers.some(layer=>layer.image==='blink'),'Blink and speech can coexist');
  assert.ok(lastLayers.every(layer=>layer.image!=='shout'));
  nodes.motion.checked=true;raf(3100);assert.equal(lastLayers.length,1,'Reduced motion keeps only the static expression');
  const old=playing;nodes.stop.onclick();assert.ok(old.stopped);assert.equal(old.onended,null);raf(3200);
  assert.ok(lastLayers.every(layer=>layer.image!=='oo'));
  pending=nodes.speak.onclick();resume();await pending;playing.onended();
  assert.equal(nodes.status.textContent,'TRANSMISSION COMPLETE');assert.equal(nodes.subtitle.textContent,nodes.line.value);
  lifecycle.pagehide();assert.ok(audio.closed);
  console.log('PASS talking face: voiced mouth timing, radio silence, independent blink/expression layers, reduced motion, cancellation and completion');
})().catch(error=>{console.error(error);process.exitCode=1;});
