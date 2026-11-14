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
const toneNodes=[];let toneContext;
function toneParam(){return {value:0,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},cancelScheduledValues(){}};}
function toneNode(){return {connect(next){return next;},disconnect(){},start(){},stop(time){this.stopped=time;}};}
class ToneContext {
 constructor(){toneContext=this;this.state='running';this.currentTime=0;this.sampleRate=8000;this.destination=toneNode();}
 createGain(){return {...toneNode(),gain:toneParam()};}
 createBiquadFilter(){return {...toneNode(),frequency:toneParam(),Q:toneParam()};}
 createOscillator(){const n={...toneNode(),frequency:toneParam()};toneNodes.push(n);return n;}
 createBufferSource(){return toneNode();}
 createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};}
}
const toneSandbox={window:{AudioContext:ToneContext,localStorage:{getItem:()=>null,setItem(){}},Driftworks:{engineAudio:synth,audioMixer:{create:()=>({attach(){},channel:()=>toneContext.destination})}}}};
vm.createContext(toneSandbox);vm.runInContext(fs.readFileSync(path.join(root,'src/audio.js'),'utf8'),toneSandbox);
const toneApi=toneSandbox.window.Driftworks.audio;
toneApi.setMissileLock(.016,tracking);const tone=toneNodes.find(n=>n.frequency.value===920);assert(tone);assert.equal(tone.type,'square');
for(let i=0;i<600;i++){toneContext.currentTime+=1/60;toneApi.setMissileLock(1/60,{...tracking,locked:true,progress:1});}
assert.equal(toneNodes.filter(n=>n.frequency.value===920).length,1,'held tone reuses one oscillator');assert.equal(tone.stopped,undefined);
toneApi.setMissileLock(.016,{...tracking,tracking:false});assert(tone.stopped>toneContext.currentTime,'loss fades and stops the carrier');
assert.equal(toneNodes.filter(n=>n.frequency.value===920).length,1,'loss creates no melodic notes');
toneApi.setMissileLock(.016,tracking);toneApi.setMissileLock(.016,{...tracking,active:false});assert(toneNodes.filter(n=>n.frequency.value===920).every(n=>n.stopped!==undefined),'pause clears every seeker voice');
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
