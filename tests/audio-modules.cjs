'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const sandbox = {window: {localStorage: {getItem: () => null}}};
vm.createContext(sandbox);
function load(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file}); }
load('src/engine-audio.js');
const synth = sandbox.window.Driftworks.engineAudio;
assert.equal(synth.presets.length, 8);
assert.equal(sandbox.window.Driftworks.audio, undefined, 'Synth must work without the game facade');
load('src/audio-mixer.js');
const mixerFactory = sandbox.window.Driftworks.audioMixer;
const options = {getMaster: () => 1, setMaster: () => {}};
const first = mixerFactory.create(options);
const second = mixerFactory.create(options);
first.set({engine: .2});
assert.equal(first.get().engine, .2);
assert.equal(second.get().engine, .55, 'Mixer instances must own independent preferences/state');
const base=first.get();
const ordinary=first.levels(base,false,false);
first.setMusicActive(true);
assert(Math.abs(first.levels(base,false,false).engine / ordinary.engine - Math.pow(10,-3/20)) < 1e-12);
assert.equal(first.levels(base,false,false).weapons,ordinary.weapons,'Music attenuation affects only engine');
assert.equal(first.get().engine,.2,'Music does not overwrite saved engine preference');
assert(first.levels(base,true,true).engine < first.levels(base,false,false).engine,'Existing comms/impact ducking still applies');
first.setMusicActive(false);
assert.equal(first.levels(base,false,false).engine,ordinary.engine,'Restore engine when music pauses or mutes');
load('src/audio.js');
assert.equal(sandbox.window.Driftworks.audio.engine, synth, 'Facade must share the synth, not duplicate it');
assert.equal(sandbox.window.Driftworks.audio.status().available, false);

const cue=sandbox.window.Driftworks.audio.setMissileLock;
const tracking={active:true,tracking:true,locked:false,progress:.1,key:'target/Harpoon'};
function ticks(progress){cue(0,{...tracking,active:false});let count=0;for(let i=0;i<400;i++)if(cue(.01,{...tracking,progress})==='tick')count++;return count;}
assert(ticks(.9)>ticks(.1)*2,'acquisition cadence speeds up with progress');
cue(0,{...tracking,active:false});assert.equal(cue(.016,{...tracking,progress:1}),'tick','full timer without capture is still acquisition');
assert.equal(cue(.016,{...tracking,locked:true}),'confirm');assert.equal(cue(.016,{...tracking,locked:true}),'none','held lock never repeats confirmation');
assert.equal(cue(.016,{...tracking,tracking:false}),'lost');assert.equal(cue(.016,{...tracking,tracking:false}),'none');
cue(.016,{...tracking,locked:true});assert.equal(cue(.016,{...tracking,active:false}),'none','pause clears quietly');
assert.equal(cue(.016,{...tracking,key:'other/Harpoon'}),'tick','target changes start a fresh acquisition cue');

// Lock audio owns one fixed-pitch voice, including during long held locks.
const noiseNodes=[],toneNodes=[];let toneContext;
function toneParam(){return {value:0,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},cancelScheduledValues(){}};}
function toneNode(){return {connect(next){return next;},disconnect(){},start(){},stop(time){this.stopped=time;}};}
class ToneContext {
 constructor(){toneContext=this;this.state='running';this.currentTime=0;this.sampleRate=8000;this.destination=toneNode();}
 createGain(){return {...toneNode(),gain:toneParam()};}
 createBiquadFilter(){return {...toneNode(),frequency:toneParam(),Q:toneParam()};}
 createOscillator(){const n={...toneNode(),frequency:toneParam()};toneNodes.push(n);return n;}
 decodeAudioData(data){return Promise.resolve({url:data.url});}
 createBufferSource(){const n=toneNode();noiseNodes.push(n);return n;}
 createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};}
}
const fetchedCapital=[];
const toneSandbox={URL,window:{document:{baseURI:"https://game.test/subdir/experiments/flight.html",currentScript:{getAttribute:()=>"../src/audio.js?v=1"}},fetch:async(url)=>{fetchedCapital.push(url);return {ok:true,arrayBuffer:async()=>({url})};},AudioContext:ToneContext,localStorage:{getItem:()=>null,setItem(){}},Driftworks:{engineAudio:synth,audioMixer:{create:()=>({attach(){},impact(){},channel:()=>toneContext.destination})}}}};
vm.createContext(toneSandbox);vm.runInContext(fs.readFileSync(path.join(root,'src/audio.js'),'utf8'),toneSandbox);
const toneApi=toneSandbox.window.Driftworks.audio;
toneApi.setMissileLock(.016,tracking);const tone=toneNodes.find(n=>n.frequency.value===920);assert(tone);assert.equal(tone.type,'square');
for(let i=0;i<600;i++){toneContext.currentTime+=1/60;toneApi.setMissileLock(1/60,{...tracking,locked:true,progress:1});}
assert.equal(toneNodes.filter(n=>n.frequency.value===920).length,1,'held tone reuses one oscillator');assert.equal(tone.stopped,undefined);
toneApi.setMissileLock(.016,{...tracking,tracking:false});assert(tone.stopped>toneContext.currentTime,'loss fades and stops the carrier');
assert.equal(toneNodes.filter(n=>n.frequency.value===920).length,1,'loss creates no melodic notes');
toneApi.setMissileLock(.016,tracking);toneApi.setMissileLock(.016,{...tracking,active:false});assert(toneNodes.filter(n=>n.frequency.value===920).every(n=>n.stopped!==undefined),'pause clears every seeker voice');

const beforeLaunch=toneNodes.length,beforeNoise=noiseNodes.length;toneApi.playMissileLaunch();assert.equal(toneNodes.length,beforeLaunch,'launch has no pitched downward wooomf');assert.equal(noiseNodes.length,beforeNoise+3,'release, impact and ignition share the weapon bus');
toneApi.setSfxEnabled(false);const mutedLaunch=noiseNodes.length;toneApi.playMissileLaunch();assert.equal(noiseNodes.length,mutedLaunch,'muted launch allocates no voices');

async function capitalSamples(){
await toneApi._test.capitalReady();
assert.equal(fetchedCapital.length,3,'load one shared set of three buffers');
assert(fetchedCapital.every(url=>url.startsWith('https://game.test/subdir/assets/audio/capital/')),'audio resolves from script root, including subdirectory deployment');
const U=10000/600,pose={eye:[0,0,0],region:0},round=()=>({region:0});
const distance=toneApi._test.capitalDistance;
assert(Math.abs(distance([-100/U,0,0],[100/U,0,0],[0,30/U,0])-30)<1e-8);
assert.equal(distance([0,0,0],[1,0,0],[-2,0,0]),2*U);
assert.equal(distance([0,0,0],[0,0,0],[0,0,3]),3*U);
let count=noiseNodes.length;const oscillators=toneNodes.length;
toneApi.capitalRound([10,0,0],[0,0,0],round(),[0,0,0],true,pose);
assert.equal(noiseNodes.length,count,'capital cues respect SFX mute');
toneApi.setSfxEnabled(true);
function capital(a,b,bolt,hit=null){toneContext.currentTime+=1;toneApi.capitalRound(a,b,bolt,hit,true,pose);}
capital([200,0,0],[210,0,0],round());assert.equal(noiseNodes.length,count,'distant fire is silent');
capital([0,0,0],[0,0,0],{region:1},[0,0,0]);assert.equal(noiseNodes.length,count,'other region is silent');
const bolt=round();capital([30,0,0],[20,0,0],bolt);assert.equal(noiseNodes.length,++count);
assert(noiseNodes.at(-1).buffer.url.endsWith('/fire.wav'),'firing uses reviewed cannon sample');
capital([20,0,0],[-20,0,0],bolt);assert.equal(noiseNodes.length,++count);
assert(noiseNodes.at(-1).buffer.url.endsWith('/flyby.wav'),'swept pass uses reviewed sub-pressure sample');
capital([-20,0,0],[20,0,0],bolt);assert.equal(noiseNodes.length,count,'same shot never repeats fire or flyby');
capital([20,0,0],[25,0,0],bolt,[25,0,0]);assert.equal(noiseNodes.length,++count);
assert(noiseNodes.at(-1).buffer.url.endsWith('/impact.wav'),'impact uses reviewed one-second sample');
capital([20,0,0],[200,0,0],bolt,[200,0,0]);assert.equal(noiseNodes.length,count,'distant impact is silent');
assert.equal(toneNodes.length,oscillators,'capital cues allocate no old synth oscillators');
await toneApi._test.capitalReady();assert.equal(fetchedCapital.length,3,'decoded buffers are reused');
console.log('PASS capital sample audio: approved buffers, swept distances, firing, single flyby, impact, range, region and mute');
}
capitalSamples().catch(error=>{console.error(error);process.exitCode=1;});
for (const directory of ['', 'tests', 'experiments']) {
  for (const file of fs.readdirSync(path.join(root, directory)).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, directory, file), 'utf8');
    const scripts = Array.from(html.matchAll(/<script[^>]*src="([^"]+)"/g), m => m[1].split('?')[0]);
    const facade = scripts.findIndex(src => src.endsWith('/audio.js'));
    if (facade < 0) continue;
    for (const module of ['engine-audio.js', 'audio-mixer.js']) {
      const position = scripts.findIndex(src => src.endsWith('/' + module));
      assert(position >= 0 && position < facade, directory + '/' + file + ': load ' + module + ' before audio.js');
      assert.equal(scripts.filter(src => src.endsWith('/' + module)).length, 1);
    }
  }
}
const lab = fs.readFileSync(path.join(root, 'experiments/engine-lab.html'), 'utf8');
assert(!/src="[^"]*\/(?:audio|audio-mixer)\.js/.test(lab), 'Engine bench must remain independent of game audio');
console.log('PASS audio modules: standalone synth, shared facade identity and all HTML dependency orders');
