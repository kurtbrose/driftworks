'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{Driftworks:{sim:{METERS_PER_UNIT:60}}},Math};
vm.runInNewContext(fs.readFileSync('experiments/ellis-feedback.js','utf8'),context);
const api=context.window.Driftworks.ellisFeedback,tracker=api.create();
const pose=(r,region=0)=>({eye:[region*12000/60,(-2000-r)/60,1550/60],region});
const step=(r,region=0,active=true,enabled=true)=>tracker.update(pose(r,region),.1,active,enabled);
assert.equal(step(900).entered,false,'Initialization is silent');
assert.equal(step(549).entered,true);assert.equal(step(560).entered,false);
assert.equal(step(610).exited,false,'Hysteresis prevents shell chatter');
step(580,0,false);assert.equal(step(549).entered,false,'Pause does not re-arm entry');
let cue=step(310,1);assert(cue.crossed);assert.equal(cue.flash,1.8);assert(cue.proximity>.95);
cue=step(310,1);assert(!cue.crossed);assert(cue.flash<1.8);
let flash=cue.flash;assert.equal(step(310,1,false).flash,flash,'Pause freezes arrival hold');
assert(step(620,1).exited);assert(!step(621,1).exited);assert(step(549,1).entered);
assert(step(310,0).crossed,'Return crossing works');
assert.equal(step(310,0,true,false).proximity,0,'Other missions cannot rumble');
tracker.reset();assert(!step(310,1).crossed,'Reset cannot fabricate a crossing');
assert.equal(api.describe(pose(340,1)).gap,40);
console.log('PASS Ellis feedback: entry hysteresis, two-way crossings, pause/reset, distance and mission isolation');

// Exercise the real facade: cue scheduling and the shared mute path.
const oscillators=[];
function param(){return {value:0,setValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},linearRampToValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;},cancelScheduledValues(){}};}
function node(){return {connect(){return this;},disconnect(){},start(){},stop(){},gain:param(),frequency:param(),Q:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param()};}
class AudioContext {
 constructor(){this.currentTime=1;this.state='running';this.sampleRate=8000;this.destination=node();}
 createGain(){return node();}createBiquadFilter(){return node();}createBufferSource(){return node();}createDynamicsCompressor(){return node();}
 createOscillator(){const n=node();oscillators.push(n);return n;}
 createBuffer(_channels,length){return {getChannelData:()=>new Float32Array(length)};}
}
const audioContext={window:{AudioContext,localStorage:{getItem:()=>null,setItem(){}}},Math,Float32Array};
for(const file of ['src/engine-audio.js','src/audio-mixer.js','src/ohio-soundtrack.js', 'src/audio.js'])vm.runInNewContext(fs.readFileSync(file,'utf8'),audioContext);
const audio=audioContext.window.Driftworks.audio;audio.unlock();let count=oscillators.length;
audio.playWormhole('enter');assert.equal(oscillators.length-count,2);count=oscillators.length;
audio.playWormhole('cross');assert.equal(oscillators.length-count,3);assert(oscillators.slice(count).every(n=>n.type==='sine'));
audio.setSfxEnabled(false);count=oscillators.length;audio.playWormhole('enter');audio.playWormhole('cross');audio.playWormhole('exit');assert.equal(oscillators.length,count,'Muted cues allocate no voices');
console.log('PASS Ellis audio: distinct entry/crossing voices and shared SFX mute');

for(const file of ['experiments/flight.html','experiments/mission-asteroid-patrol.html']){const html=fs.readFileSync(file,'utf8');assert(html.indexOf('src="ellis-feedback.js')>=0&&html.indexOf('src="ellis-feedback.js')<html.indexOf('src="flight.js'),'Flight entry point loads feedback before boot: '+file);}
