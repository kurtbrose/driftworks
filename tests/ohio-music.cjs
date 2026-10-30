const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const media = [];
const window = {localStorage: {getItem: () => null}, addEventListener() {}, Audio: class {
  constructor(url) { this.url=url; this.duration=30; this.currentTime=0; this.plays=0; media.push(this); }
  play() { this.plays++; this.paused=false; return Promise.resolve(); }
  pause() { this.paused=true; }
}};
vm.createContext({window});
const context=vm.createContext({window});
for(const file of ['src/engine-audio.js','src/audio-mixer.js','src/ohio-soundtrack.js', 'src/audio.js']) vm.runInContext(fs.readFileSync(file,'utf8'),context);
window.Driftworks.assetUrl = url => url;
const music=window.Driftworks.audio.createOhioMusic();
const [intro,song]=media;
assert.equal(intro.playbackRate,1.25); assert.equal(intro.preservesPitch,true); assert.equal(song.loop,true);
music.resume(); assert.equal(intro.plays,1); assert.equal(song.plays,0);
intro.currentTime=28.125; music.update();
assert.equal(intro.volume,.325); assert.equal(song.volume,.325); assert.equal(song.plays,1);
music.pause(); assert(intro.paused && song.paused);
music.resume(); assert.equal(song.plays,2);
assert.equal(music.isAnnouncing(),true,'Keep radio excluded through the crossfade');
intro.onended(); assert.equal(music.isAnnouncing(),false,'Release radio when announcer ends'); assert.equal(intro.volume,0); assert.equal(song.volume,.65);
music.pause(); const count=intro.plays; music.resume(); assert.equal(intro.plays,count,'Resume must not replay finished announcer');
song.currentTime=10; music.update(); assert.equal(song.volume,.65,'Hold music level for ten seconds');
song.currentTime=20; music.update(); assert(Math.abs(song.volume-.65*Math.sqrt(.30))<1e-9,'Fade progressively over twenty seconds');
song.currentTime=30; music.update(); assert.equal(song.volume,.65*.30,'Settle to thirty percent of the music slider');
music.pause(); music.resume(); assert.equal(song.volume,.65*.30,'Resume retains quiet level');
song.currentTime=1; music.update(); assert.equal(song.volume,.65*.30,'Looping never restores the loud opening');
console.log('PASS Ohio music: crossfade, ten-second hold, quiet loop and pause/resume');
// The production comms controller must hold the music gate through both lines.
const flight = require('../tools/headless.cjs').createFlight({mission:'ohio', seed:29});
const DW=flight.DW, clock=DW.flightComms.create(), combat=flight.snapshot().combat;
combat.time=2;
const lineCount=DW.flightMissions.resolve('ohio').opening.length;
const step=busy => DW.flightComms.step(clock,.01,combat,busy,()=>.5,flight.snapshot().state);
assert.equal(step(false).text,"It's all Ohio?");
assert(combat.openingStep <= lineCount);
assert.equal(step(true),null); assert.equal(combat.openingStep,1);
assert.equal(step(false).text,'Always has been.');
assert.equal(combat.openingStep,lineCount,'Final line beginning is not completion');
assert.equal(step(true),null); assert.equal(combat.openingStep,lineCount,'Hold while final transmission plays');
assert.equal(step(false),null); assert(combat.openingStep > lineCount,'Release only once channel is free');
console.log('PASS Ohio DJ gate: both opening transmissions finish before music starts');
// Exercise the real flight frame's handoff/chatter guard without a renderer.
const flightSource=fs.readFileSync('experiments/flight.js','utf8').replace(/\r\n/g,'\n');
const guardStart=flightSource.indexOf('        if (!paused) {\n            if (!watch) session.advanceScenery(elapsed);');
assert(guardStart>=0);
const guard=flightSource.slice(guardStart,flightSource.indexOf('        var comparison =',guardStart));
let radioUpdates=0, radioStops=0;
window.Driftworks.flightMissions=DW.flightMissions;
const soundtrack=window.Driftworks.audio.createOhioMusic(),djIntro=media[media.length-2];
soundtrack.resumeIfStarted();assert.equal(djIntro.plays,0,'Resuming before the mission handoff stays quiet');
const handoff={paused:false,watch:false,elapsed:.01,session:{advanceScenery(){}},
  comms:{update(){radioUpdates++;},pause(){radioStops++;}},
  ohioMusic:soundtrack,
  currentView:{combat:{mode:'ohio',openingStep:1},state:{}},activeMission:{opening:[{},{}]}};
vm.createContext(handoff);
vm.runInContext(guard,handoff); assert.equal(radioUpdates,1); assert.equal(djIntro.plays,0);
handoff.currentView.combat.openingStep=3;
vm.runInContext(guard,handoff); assert.equal(djIntro.plays,1); assert.equal(radioStops,1);
const before=radioUpdates;
vm.runInContext(guard,handoff); assert.equal(radioUpdates,before,'No chatter during DJ or crossfade');
djIntro.onended();
vm.runInContext(guard,handoff); assert.equal(radioUpdates,before+1,'Chatter returns once only instrumental remains');
assert.equal(djIntro.plays,1,'DJ starts once');
console.log('PASS Ohio mutual radio exclusion: opening first, DJ alone, chatter returns for instrumental');
