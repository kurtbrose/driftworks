(function () {
  'use strict';

  window.DriftworksSharedTests = window.DriftworksSharedTests || {};
  window.DriftworksSharedTests.audio = function (harness, fixtures) {
    var sim = window.Driftworks.sim;
    var game = window.Driftworks.game;
    var hud = window.Driftworks.hud;
    var test = harness.test, assert = harness.assert, assertClose = harness.assertClose;



  test('audio', 'flight mixer preserves urgent impacts and ducks only audible comms', function () {
    var api=window.Driftworks.audio._test, mix=api.normalizeMix({});
    assert(mix.engine<mix.impacts && mix.weapons<mix.comms);
    var idle=api.mixLevels(mix,false,false),speech=api.mixLevels(mix,true,false),hit=api.mixLevels(mix,true,true);
    assertClose(speech.engine/idle.engine,.84);
    assert(speech.weapons<idle.weapons);
    assert(hit.engine<speech.engine && hit.impacts===idle.impacts && hit.comms===idle.comms);
    var muted=api.mixLevels(Object.assign({},mix,{comms:0}),true,false);
    assert(muted.engine===idle.engine && muted.weapons===idle.weapons);
    var silentHit=api.mixLevels(Object.assign({},mix,{impacts:0}),false,true);
    assert(silentHit.engine===idle.engine);
    var off=api.mixLevels(Object.assign({},mix,{ducking:false}),true,true);
    assert(off.engine===idle.engine && off.weapons===idle.weapons);
    var repaired=api.normalizeMix({engine:NaN,weapons:4,impacts:-1,comms:Infinity});
    assert(repaired.engine===.55 && repaired.weapons===1 && repaired.impacts===0 && repaired.comms===.85);
  });

  test('audio', 'engine presets repair invalid values and spool independently of frame rate', function () {
    var engine = window.Driftworks.audio.engine;
    assert(engine.presets.length === 8);
    var repaired = engine.normalize({bass: NaN, pitch: 99, spool: -4, flutter: Infinity});
    assert(repaired.bass === .7 && repaired.pitch === 2 && repaired.spool === .08 && repaired.flutter === 23);
    engine.presets.forEach(function(preset) {
      var tune = engine.normalize(preset.tuning);
      var a = {spool:0, boost:0, ignition:false, active:false};
      var b = {spool:0, boost:0, ignition:false, active:false};
      for(var i=0;i<60;i++) a=engine.step(a,1/60,{throttle:.7},tune);
      for(var j=0;j<30;j++) b=engine.step(b,1/30,{throttle:.7},tune);
      assertClose(a.spool,b.spool);
      assert(a.spool>0 && a.spool<1 && a.boost===0);
      a=engine.step(a,.016,{throttle:1,afterburner:true},tune);assert(a.ignition);
      a=engine.step(a,.016,{throttle:1,afterburner:true},tune);assert(!a.ignition,'Held boost must not retrigger ignition');
      a=engine.step(a,.016,{throttle:0,afterburner:false},tune);
      a=engine.step(a,.016,{throttle:0,afterburner:true},tune);assert(a.ignition);
      a=engine.step(a,0,{throttle:1,active:false},tune);assert(a.spool===0 && a.boost===0 && !a.active);
      var bad=engine.step(a,NaN,{throttle:Infinity},tune);assert(Number.isFinite(bad.spool));
    });
  });

  test('audio', 'layered engine graph starts once, accepts tuning, and stops every source on disposal', function () {
    var params=[], sources=[], gains=[], filters=[];
    function param() {var p={value:0,setTargetAtTime:function(value){assert(Number.isFinite(value));p.value=value;},setValueAtTime:function(value){assert(Number.isFinite(value));p.value=value;},cancelScheduledValues:function(){},exponentialRampToValueAtTime:function(value){assert(value>0);p.value=value;}};params.push(p);return p;}
    function node() {return {connect:function(next){return next;},disconnect:function(){}};}
    function gain() {var n=node();n.gain=param();gains.push(n);return n;}
    function source() {var n=node();n.frequency=param();n.start=function(){n.started=(n.started||0)+1;};n.stop=function(){n.stopped=(n.stopped||0)+1;};sources.push(n);return n;}
    var ctx={currentTime:0,sampleRate:8000,createGain:gain,createOscillator:source,createBufferSource:source,
      createBiquadFilter:function(){var n=node();n.frequency=param();n.Q=param();n.gain=param();filters.push(n);return n;},
      createDynamicsCompressor:function(){var n=node();['threshold','knee','ratio','attack','release'].forEach(function(k){n[k]=param();});return n;},
      createBuffer:function(ch,length){return {getChannelData:function(){return new Float32Array(length);}};}};
    var voice=window.Driftworks.audio.engine.create(ctx,node());
    assert(sources.length===12 && sources.every(function(s){return s.started===1;}));
    voice.update(.1,{throttle:1,afterburner:true,damage:.8,maneuver:1});
    assert(gains[0].gain.value>0);
    assert(filters[1].frequency.value<800 && filters[2].frequency.value<=1600,'Roar should stay dark even during boost');
    assert(filters[3].type==='peaking' && filters[3].frequency.value===1700 && filters[3].gain.value===-9,'Exhaust must leave space for speech');
    assert(gains[14].gain.value>0 && gains[15].gain.value>0,'Roar should have irregular amplitude and filter motion');
    voice.tune({roar:0});
    voice.update(.1,{throttle:1});
    assert(gains[8].gain.value===0 && gains[14].gain.value===0 && gains[15].gain.value===0,'Roar mute must also mute its modulation');
    voice.tune({roar:.55});
    for(var cruise=0;cruise<100;cruise++)voice.update(.1,{throttle:1,acceleration:0});
    var cruiseNoise=gains[8].gain.value, cruiseAir=gains[10].gain.value;
    assert(gains[16].gain.value>cruiseNoise,'Cruise should emphasize growl over broad noise');
    assert(gains[18].gain.value>gains[1].gain.value*10 && gains[19].gain.value>gains[16].gain.value*8,'Low colored rumble should lead the pitched remnants');
    assert(gains[20].gain.value>0 && gains[21].gain.value>0 && gains[22].gain.value>0 && gains[23].gain.value>0,'Low layers should drift and pulse irregularly');
    voice.tune({bass:0,roar:0});voice.update(.1,{throttle:1,acceleration:0});
    [18,19,20,21,22,23].forEach(function(i){assert(gains[i].gain.value===0,'Low layer mutes must include roughness and modulation');});
    voice.tune({bass:.7,roar:.55});
    for(var accelerating=0;accelerating<5;accelerating++)voice.update(.1,{throttle:1,acceleration:1});
    assert(gains[8].gain.value>cruiseNoise*8 && gains[10].gain.value>cruiseAir*2,'Acceleration should swell roar and air');
    for(var settle=0;settle<100;settle++)voice.update(.1,{throttle:1,acceleration:0});
    assertClose(gains[8].gain.value,cruiseNoise);
    for(var burning=0;burning<5;burning++)voice.update(.1,{throttle:1,acceleration:0,afterburner:true});
    assert(gains[8].gain.value>cruiseNoise*8,'Afterburner should roar even at constant speed');
    assert(sources[2].frequency.value > 330 && sources[3].frequency.value > sources[2].frequency.value*2);
    assert(sources[4].frequency.value > sources[3].frequency.value, 'Turbine partials should be slightly detuned');
    assert(gains[3].gain.value < .01 && gains[10].gain.value > gains[3].gain.value, 'Air should carry the turbine; the pure tone stays subtle');
    voice.tune({whine:0});
    voice.update(.1,{throttle:1});
    [3,4,5,10,11].forEach(function(index){assert(gains[index].gain.value===0,'Whine mute must silence tones, air and drift');});
    voice.tune({bass:0,whine:0,roar:0,texture:0,burner:0,volume:0,perspective:'exterior'});
    voice.update(.1,{throttle:1,afterburner:true});assert(gains[0].gain.value===0 && gains[16].gain.value===0 && gains[17].gain.value===0);
    voice.stop();assert(gains[0].gain.value===0);
    voice.dispose();voice.dispose();
    assert(sources.every(function(s){return s.stopped===1;}),'Disposal must be idempotent');
    voice.update(.1,{throttle:1});assert(gains[0].gain.value===0);
  });

  test('audio', 'flight engine bass spools up, releases and cuts on pause', function () {
    var audio = Driftworks.audio;
    audio.flightFeedback(0, 0, false, false);
    var cruise = audio.flightFeedback(.016, 1, false, true);
    assert(cruise.load > 0 && cruise.load < 1 && cruise.boost === 0);
    var boost = audio.flightFeedback(.1, 1, true, true);
    assert(boost.load > cruise.load && boost.boost > 0);
    var release = audio.flightFeedback(.016, 0, false, true);
    assert(release.boost < boost.boost && release.boost > 0);
    var stopped = audio.flightFeedback(0, 1, true, false);
    assert(stopped.load === 0 && stopped.boost === 0);
  });

  test('audio', 'emotions shape synthetic delivery while retaining the pilot voice', function () {
    var api=window.Driftworks.flightComms,mumble=window.Driftworks.mumble,base=mumble.presets.Scout;
    var afraid=api.voiceOptions(base,{current:'afraid',intensity:1});
    var panic=api.voiceOptions(base,{current:'panicked',intensity:1});
    var steady=api.voiceOptions(base,{current:'reassuring',intensity:1});
    assert(afraid.pitch>base.pitch&&afraid.speed>base.speed&&afraid.tremor>0);
    assert(panic.variation>afraid.variation&&steady.speed<base.speed);
    assert(afraid.resonance===base.resonance&&base.pitch===210);
    [afraid,panic,steady].forEach(function(v){
      var plan=mumble.analyze('Stay with me.',v),pcm=mumble.render(plan,8000);
      assert(plan.duration>0&&pcm.length>0&&pcm.every(Number.isFinite));
    });
  });

  // Immediate transport keeps these existing mixer/gap tests synchronous;
  // deferred delivery and worker cancellation are covered by mumble-worker.cjs.
  function radioWorkerStub() {
    this.postMessage = function(request) {
      if (request.kind !== 'render') return;
      var api = window.Driftworks.mumble, pcm = api.render(request.plan, 22050);
      var noise = api.radioNoise(pcm.length, 22050, {effects:.45, edgeScale:2.5, seed:request.radioSeed});
      var result = api.transmit(pcm, 22050, {mode:'radio', seed:request.radioSeed, noise:noise});
      this.onmessage({data:{id:request.id, samples:result.samples, duration:result.duration, speechOffset:result.speechOffset || 0, noise:noise}});
    };
    this.terminate = function() {};
  }

  test('audio', 'radio routes into the shared mixer and clears ducking on end, mute and pause', function () {
    var DW=window.Driftworks, oldChannel=DW.audio.commsChannel, oldActive=DW.audio.setCommsActive;
    var oldWorker=window.Worker;window.Worker=radioWorkerStub;
    var oldRender=DW.mumble.render, oldTransmit=DW.mumble.transmit, sources=[], activity=[], output={};
    var context={state:'running',createBuffer:function(){return {copyToChannel:function(){}};},
      createBufferSource:function(){var source={connect:function(dest){assert(dest===output);},disconnect:function(){},start:function(){},stop:function(){},onended:null};sources.push(source);return source;}};
    DW.audio.commsChannel=function(){return {context:context,output:output};};
    DW.audio.setCommsActive=function(active){activity.push(active);};
    DW.mumble.render=function(){return new Float32Array(16);};
    DW.mumble.transmit=function(){return {samples:new Float32Array(16),duration:.1};};
    try {
      var fields=[{textContent:''},{textContent:''}],toggle={setAttribute:function(){}};
      var panel={querySelector:function(s){return s==='[data-speaker]'?fields[0]:fields[1];},classList:{add:function(){},remove:function(){},toggle:function(){}}};
      var radio=DW.flightComms.mount(panel,toggle),pilot={id:'wing',index:0,team:'ally',mode:'approach',hp:90};
      var combat={enabled:true,dead:false,hull:100,enemies:[pilot]};
      radio.unlock();radio.update(0,combat);pilot.mode='evade';radio.update(0,combat);
      assert(sources.length===1 && activity[activity.length-1]===true);
      sources[0].onended();assert(activity[activity.length-1]===false);
      radio.reset();pilot.mode='approach';radio.update(0,combat);pilot.mode='evade';radio.update(0,combat);
      assert(activity[activity.length-1]===true);
      toggle.onclick();assert(activity[activity.length-1]===false);
      radio.pause();assert(activity[activity.length-1]===false);
    } finally {window.Worker=oldWorker;DW.audio.commsChannel=oldChannel;DW.audio.setCommsActive=oldActive;DW.mumble.render=oldRender;DW.mumble.transmit=oldTransmit;}
  });

  test('audio', 'radio waits for actual playback and a full silent gap before another transmission', function () {
    var DW=window.Driftworks, oldChannel=DW.audio.commsChannel, oldStep=DW.flightComms.step;
    var oldWorker=window.Worker;window.Worker=radioWorkerStub;
    var oldRender=DW.mumble.render, oldTransmit=DW.mumble.transmit, sources=[], clock, busy;
    var context={state:'running',createBuffer:function(){return {copyToChannel:function(){}};},
      createBufferSource:function(){var source={connect:function(){},disconnect:function(){},start:function(){},stop:function(){},onended:null};sources.push(source);return source;}};
    DW.audio.commsChannel=function(){return {context:context,output:{}};};
    DW.mumble.render=function(){return new Float32Array(16);};
    DW.mumble.transmit=function(){return {samples:new Float32Array(16),duration:.1};};
    DW.flightComms.step=function(state,dt,combat,occupied,random,player){clock=state;busy=occupied;return oldStep(state,dt,combat,occupied,function(){return 0;},player);};
    try {
      var fields=[{textContent:''},{textContent:''}],panel={querySelector:function(s){return s==='[data-speaker]'?fields[0]:fields[1];},classList:{add:function(){},remove:function(){},toggle:function(){}}};
      var radio=DW.flightComms.mount(panel,{setAttribute:function(){}}), pilot={id:'w',team:'ally',hp:90,mode:'approach'};
      var combat={enabled:true,hull:100,enemies:[pilot]};
      radio.unlock();radio.update(0,combat);pilot.mode='evade';radio.update(0,combat);
      assert(sources.length===1);
      var ended=sources[0].onended;
      radio.update(20,combat);assert(busy && sources.length===1 && clock.quiet===0);
      ended();clock.wait=0;
      radio.update(1.99,combat);assert(sources.length===1);
      radio.update(.02,combat);assert(sources.length===2);
      ended();radio.update(20,combat);
      assert(busy && sources.length===2,'Old completion must not release the new source');
      sources[1].onended();radio.pause();
    } finally {window.Worker=oldWorker;DW.audio.commsChannel=oldChannel;DW.flightComms.step=oldStep;DW.mumble.render=oldRender;DW.mumble.transmit=oldTransmit;}
  });

  test('audio', 'mumble produces deterministic syllables, pauses, and finite bounded audio', function () {
    var api = window.Driftworks.mumble, line = 'Stay close, pilot! Ready?', plan = api.analyze(line, {seed: 42});
    assert(JSON.stringify(plan) === JSON.stringify(api.analyze(line, {seed: 42})));
    assert(JSON.stringify(plan) !== JSON.stringify(api.analyze(line, {seed: 43})));
    assert(plan.events.some(function(e) { return e.kind === 'pause' && e.duration >= 0.12; }));
    var end = 0;
    plan.events.forEach(function(e) { assert(e.start >= end - 0.000001); assert(e.duration > 0); assert(e.to > e.from && e.to <= line.length); end = e.start + e.duration; });
    var a = api.render(plan, 8000), b = api.render(plan, 8000), peak = 0;
    assert(a.length === Math.ceil(plan.duration * 8000));
    a.forEach(function(value, i) { assert(Number.isFinite(value) && Math.abs(value) <= 1); assert(value === b[i]); peak = Math.max(peak, Math.abs(value)); }); assert(peak > 0.01);
    assert(api.analyze(line, {speed: 2}).duration < plan.duration);
    assert(api.render(api.analyze('')).length === 0);
    assert(api.analyze('x'.repeat(900)).text.length === 600);
    assert(api.analyze('Hello', {pitch: NaN, speed: -1}).duration > 0);
    var muted = api.render(api.analyze('Quiet!', {volume: 0})); assert(muted.every(function(v) { return v === 0; }));
    assert(api.analyze('你好, pilot 👋').events.length > 0);
  });
  test('audio', 'retired radio color does not alter synthesized speech', function () {
    var api = window.Driftworks.mumble, clean = api.render(api.analyze('Ready, pilot!', {seed: 42}), 8000);
    var legacy = api.render(api.analyze('Ready, pilot!', {seed: 42, radio: 1}), 8000);
    assert(clean.length === legacy.length);
    assert(clean.every(function (value, i) { return value === legacy[i]; }));
  });
  test('audio', 'low enunciation compresses syllables and preserves complete text coverage', function () {
    var api = window.Driftworks.mumble, text = 'Navigation communication, ready?', clear = api.analyze(text, {enunciation: 1, compactWords:false}), loose = api.analyze(text, {enunciation: 0, compactWords:false});
    assert(loose.duration < clear.duration * 0.8);
    assert(loose.events.length < clear.events.length);
    var offset = 0;
    loose.events.forEach(function(e) { assert(e.from === offset); offset = e.to; });
    assert(offset === text.length);
    assert(loose.voice.pitch === clear.voice.pitch);
    assert(JSON.stringify(loose) === JSON.stringify(api.analyze(text, {enunciation: 0, compactWords:false})));
    assert(api.analyze(text, {enunciation: NaN}).voice.enunciation === api.defaults.enunciation);
    var pcm = api.render(loose, 8000);
    assert(pcm.some(function(v) { return v !== 0; }));
    assert(pcm.every(function(v) { return Number.isFinite(v) && Math.abs(v) <= 1; }));
  });

  test('audio', 'sound retention drops actual interior sounds without charging their duration', function () {
    var api = window.Driftworks.mumble, text = 'communication';
    var full = api.analyze(text, {enunciation: 1, compactWords:false}), short = api.analyze(text, {enunciation: 0.35, compactWords:false});
    var a = full.events.filter(function(e) { return e.kind === 'syllable'; });
    var b = short.events.filter(function(e) { return e.kind === 'syllable'; });
    assert(b.length < a.length);
    assert(b[0].sourceFrom === a[0].sourceFrom);
    assert(b[b.length - 1].sourceTo === a[a.length - 1].sourceTo);
    assert(b.some(function(e) { return e.to - e.from > e.sourceTo - e.sourceFrom; }));
    b.forEach(function(e) { assert(a.some(function(original) { return original.sourceFrom === e.sourceFrom && original.sourceTo === e.sourceTo && original.vowel === e.vowel; })); });
    assert(short.duration < full.duration * 0.65);
    assert(api.analyze(text, {enunciation: 0}).events.every(function(e) { return !e.attack; }));
    var line = api.analyze('Navigation communication asteroid approaching the perimeter.', {enunciation: 0.35});
    assert(line.duration < 6 * 60 / 240, 'default reduced speech should fit a 240-word/minute reading budget for this line');
  });

  test('audio', 'field has a moving vowel and consonant closure rather than a held beep', function () {
    var api = window.Driftworks.mumble, plan = api.analyze('field', api.presets.Scout), event = plan.events[0];
    assert(event.vowel === 'i' && event.vowelEnd === 'e' && event.closed);
    var samples = api.render(plan, 8000, {style:'original'});
    var staticPlan = JSON.parse(JSON.stringify(plan)); staticPlan.events[0].vowelEnd = 'i'; staticPlan.events[0].closed = false;
    var staticSamples = api.render(staticPlan, 8000, {style:'original'});
    assert(samples.some(function(v, i) { return Math.abs(v - staticSamples[i]) > 0.01; }));
    assert(samples.every(function(v) { return Number.isFinite(v) && Math.abs(v) <= 1; }));
  });

  test('audio', 'mumble pitch travels through phrases and inside syllables without resetting at words', function () {
    var api = window.Driftworks.mumble, plan = api.analyze('Keep your eyes on that asteroid field!', api.presets.Scout);
    var notes = plan.events.filter(function(e) { return e.kind === 'syllable'; });
    assert(notes.every(function(e) { return e.pitchCurve.length === 3 && e.pitchCurve.every(function(p) { return Number.isFinite(p) && p > 0; }); }));
    assert(notes.every(function(e) { return Math.max.apply(null, e.pitchCurve) - Math.min.apply(null, e.pitchCurve) > 0.01; }));
    var rises = false, falls = false;
    notes.forEach(function(e) { if (e.pitchCurve[2] > e.pitchCurve[0]) rises = true; else falls = true; });
    assert(rises && falls);
    for (var n = 1; n < notes.length; n++) assert(Math.abs(Math.log2(notes[n].pitchCurve[0] / notes[n-1].pitchCurve[2])) < 0.04);
    var question = api.analyze('Ready?').events[0], statement = api.analyze('Ready.').events[0];
    assert(question.pitchCurve[2] > statement.pitchCurve[2]);
    assert(api.analyze('Oh!').events[0].pitchCurve[0] !== api.analyze('Oh!').events[0].pitchCurve[2]);
  });

  test('audio', 'flowing vowel comparison overlaps only nearby syllables without changing the plan', function () {
    var api = window.Driftworks.mumble, plan = api.analyze('Keep your eyes. Field!', api.presets.Scout), original = JSON.stringify(plan);
    var a = api.render(plan, 8000), b = api.render(plan, 8000, {style: 'flowing'}), again = api.render(plan, 8000, {style: 'flowing'});
    assert(JSON.stringify(plan) === original && a.length === b.length);
    assert(b.some(function(v, i) { return Math.abs(v - a[i]) > 0.01; }));
    assert(b.every(function(v, i) { return Number.isFinite(v) && Math.abs(v) <= 1 && v === again[i]; }));
    var changed = JSON.parse(original); changed.events.forEach(function(e) { e.attack = !e.attack; e.closed = !e.closed; });
    var noConsonants = api.render(changed, 8000, {style: 'flowing'});
    assert(b.every(function(v, i) { return v === noConsonants[i]; }));
    var first = plan.events[0], gap = Math.floor((first.start + first.duration + 0.002) * 8000);
    assert(a[gap] === 0 && Math.abs(b[gap]) > 0.000001);
    var stop = plan.events.find(function(e) { return plan.text.slice(e.from,e.to) === '.'; });
    assert(b[Math.floor((stop.start + 0.06) * 8000)] === 0);
  });

  test('audio', 'popping vowel groups keep word signatures without held vowels', function () {
    var api = window.Driftworks.mumble;
    ['cool', 'meet', 'field', 'wait', 'out', 'cat'].forEach(function(text) {
      var plan = api.analyze(text, {enunciation: 1, speed: 0.5}), original = JSON.stringify(plan);
      var a = api.render(plan, 8000), b = api.render(plan, 8000, {style:'vowel-groups'});
      assert(a.length === b.length && JSON.stringify(plan) === original);
      assert(b.some(function(v) { return Math.abs(v) > 0.01; }));
      plan.events.filter(function(e) { return e.kind === 'syllable'; }).forEach(function(e) {
        var end = Math.floor(e.start * 8000) + Math.floor(Math.min(e.duration * 0.72, 0.075) * 8000);
        var next = Math.floor((e.start + e.duration) * 8000);
        assert(b.slice(end, next).every(function(v) { return v === 0; }), 'every vowel must release early, including at slow rates');
      });
      assert(b.every(function(v) { return Number.isFinite(v) && Math.abs(v) <= 1; }));
      var again = api.render(plan, 8000, {style:'vowel-groups'}); assert(b.every(function(v,i) { return v === again[i]; }));
    });
    var plan = api.analyze('cool', {enunciation:1}), changed = JSON.parse(JSON.stringify(plan));
    changed.text = 'caal';
    var oo = api.render(plan,8000,{style:'vowel-groups'}), aa = api.render(changed,8000,{style:'vowel-groups'});
    assert(oo.some(function(v,i) { return Math.abs(v-aa[i]) > 0.01; }), 'vowel spelling still changes timbre');
  });

  test('audio', 'tighter mumble pauses shorten phrases without lengthening or compressing vowel bursts', function () {
    var api = window.Driftworks.mumble, text = 'Keep cool. Wait, scout!', a = api.analyze(text, {compactWords:false}), b = api.analyze(text, {pauseScale:0.45, compactWords:false});
    assert(b.duration < a.duration);
    assert(b.events.length === a.events.length);
    b.events.forEach(function(e,i) {
      var old = a.events[i]; assert(e.from === old.from && e.to === old.to);
      if (e.kind === 'syllable') assertClose(e.duration,old.duration);
      else { assert(e.duration > 0); assertClose(e.duration,old.duration*0.45); }
      if (i) assert(e.start >= b.events[i-1].start+b.events[i-1].duration-0.000001);
    });
    var pcm = api.render(b,8000,{style:'vowel-groups'});
    assert(pcm.length === Math.ceil(b.duration*8000));
    assert(pcm.every(function(v) { return Number.isFinite(v) && Math.abs(v)<=1; }));
  });

  test('audio', 'compact word rhythm varies onsets while preserving sentence pauses', function () {
    var api = window.Driftworks.mumble, text = 'Keep your eyes on that asteroid field! Wait, scout.', a = api.analyze(text,{compactWords:false}), b = api.analyze(text,{compactWords:true});
    assert(b.duration < a.duration);
    b.events.forEach(function(e,i) {
      if (e.kind === 'pause') {
        if (text.slice(e.from,e.to) === ',') assertClose(e.duration,a.events[i].duration*0.4);
        else if (/[.!?;]/.test(text.slice(e.from,e.to))) assertClose(e.duration,a.events[i].duration);
        else assert(e.duration < a.events[i].duration);
      }
    });
    var notes = b.events.filter(function(e) { return e.kind === 'syllable'; });
    assert(new Set(notes.map(function(e) { return e.duration.toFixed(3); })).size > 4);
    assert(JSON.stringify(b) === JSON.stringify(api.analyze(text,{compactWords:true})));
    var pcm = api.render(b,8000,{style:'vowel-groups'}); assert(pcm.every(function(v) { return Number.isFinite(v) && Math.abs(v)<=1; }));
  });

  test('audio', 'mumble defaults lock in popping vowels and compact word rhythm', function () {
    var api = window.Driftworks.mumble, plan = api.analyze('Keep cool, scout!');
    assert(plan.voice.compactWords === true);
    var defaults = api.render(plan,8000), explicit = api.render(plan,8000,{style:'vowel-groups'});
    assert(defaults.every(function(v,i) { return v === explicit[i]; }));
    assert(JSON.stringify(plan) === JSON.stringify(api.analyze('Keep cool, scout!',{compactWords:true})));
  });

  test('audio', 'voice character controls independently affect audio and repair old plans', function () {
    var api = window.Driftworks.mumble, text = 'Keep cool, pilot!', base = api.render(api.analyze(text),8000);
    ['formant1','formant2','formant3','brightness','nasality','creak','clipping','contour'].forEach(function(key) {
      var options = {}; options[key] = key.indexOf('formant') === 0 ? 1.3 : 1;
      var plan = api.analyze(text,options), pcm = api.render(plan,8000);
      assert(pcm.every(function(v) { return Number.isFinite(v) && Math.abs(v)<=1; }));
      assert(pcm.some(function(v,i) { return Math.abs(v-base[i])>0.001; }),key);
      var again = api.render(plan,8000); assert(pcm.every(function(v,i) { return v === again[i]; }));
      options[key] = NaN; assert(api.analyze(text,options).voice[key] === api.defaults[key]);
      options[key] = 100; assert(api.analyze(text,options).voice[key] === (key.indexOf('formant') === 0 ? 1.3 : 1));
    });
    var old = api.analyze(text);
    ['formant1','formant2','formant3','brightness','nasality','creak','clipping','contour'].forEach(function(key) { delete old.voice[key]; });
    assert(api.render(old,8000).every(function(v,i) { return v === base[i]; }));
    var flat = api.analyze(text,{variation:0,contour:0});
    assert(flat.events.filter(function(e) { return e.kind === 'syllable'; }).every(function(e) { return e.pitchCurve.every(function(p) { return p === 150; }); }));
  });

  test('audio', 'all voice presets match output level while volume scales and mute stays silent', function () {
    var api = window.Driftworks.mumble;
    function rms(pcm) { return Math.sqrt(pcm.reduce(function(sum,v) { return sum+v*v; },0)/pcm.length); }
    ['Keep cool, pilot!', "We've got company. Keep your eyes on that asteroid field!"].forEach(function(line) {
      Object.keys(api.presets).forEach(function(name) {
        var options = Object.assign({},api.presets[name],{volume:0.65});
        var pcm = api.render(api.analyze(line,options),22050);
        assert(Math.abs(rms(pcm)-0.12*0.65)<0.00001, name+' matched RMS');
        options.volume = 0.325;
        var quiet = api.render(api.analyze(line,options),22050);
        assert(Math.abs(rms(quiet)/rms(pcm)-0.5)<0.00001, name+' volume scales');
        assert(pcm.every(function(v) { return Number.isFinite(v) && Math.abs(v)<=0.95*0.65+0.00001; }));
      });
    });
  });

  test('audio', 'study voices keep comparable levels and nasal bursts retain most of their duration', function () {
    var api = window.Driftworks.mumble, line = "We've got company. Keep your eyes on that asteroid field!";
    var levels = ['Study · dark smooth','Study · nasal clipped','Study · raspy creak'].map(function(name) {
      var pcm = api.render(api.analyze(line,api.presets[name]),22050);
      return Math.sqrt(pcm.reduce(function(sum,v) { return sum + v*v; },0)/pcm.length);
    });
    assert(Math.max.apply(null,levels)/Math.min.apply(null,levels) < 2, 'study levels within 6 dB');
    var preset = api.presets['Study · nasal clipped'];
    var plan = api.analyze('Hello',preset), pcm = api.render(plan,22050);
    var event = plan.events[0], last = 0;
    pcm.forEach(function(v,i) { if (Math.abs(v)>0.000001) last=i; });
    assert(last/22050 > Math.min(event.duration*0.72,0.075)*0.85, 'nasal gesture keeps at least 85% of its base burst');
  });

  test('audio', 'expanded mumble cast renders distinct bounded voices with optional deterministic tremor', function () {
    var api = window.Driftworks.mumble;
    ['Child','Woman · warm','Woman · bright','Old woman','Old man','Man · baritone','Pirate','Ship computer'].forEach(function(name) {
      assert(api.presets[name]);
      var plan = api.analyze('Hello, pilot!',api.presets[name]), pcm = api.render(plan,8000);
      assert(pcm.some(function(v) { return v !== 0; }));
      assert(pcm.every(function(v) { return Number.isFinite(v) && Math.abs(v)<=1; }));
      assert(plan.voice.compactWords);
    });
    var old = api.analyze('Welcome home.',api.presets['Old woman']), dry = JSON.parse(JSON.stringify(old)); dry.voice.tremor = 0;
    var a = api.render(old,8000), b = api.render(dry,8000), again = api.render(old,8000);
    assert(a.some(function(v,i) { return Math.abs(v-b[i])>0.01; }));
    assert(a.every(function(v,i) { return v === again[i]; }));
    assert(api.analyze('Hi',{tremor:NaN}).voice.tremor === 0);
    assert(api.analyze('Hi',{tremor:10}).voice.tremor === 1);
    assert(api.presets.Child.resonance > api.presets['Man · baritone'].resonance);
  });

  test('audio', 'radio transmission adds deterministic bookends and quiet static without changing local speech', function () {
    var api = window.Driftworks.mumble, pcm = api.render(api.analyze('Hello, pilot!'),8000), original = Array.from(pcm);
    var local = api.transmit(pcm,8000,{mode:'local'}), radio = api.transmit(pcm,8000,{mode:'radio',seed:9,volume:0.6});
    assert(local.samples === pcm && local.speechOffset === 0);
    assertClose(radio.speechOffset,0.16); assert(radio.samples.length === pcm.length+3200);
    assert(radio.samples.slice(0,1280).some(function(v) { return Math.abs(v)>0.001; }));
    assert(radio.samples.slice(1280+pcm.length).some(function(v) { return Math.abs(v)>0.001; }));
    assert(radio.samples[0] === 0 && radio.samples[radio.samples.length-1] === 0);
    var again = api.transmit(pcm,8000,{mode:'radio',seed:9,volume:0.6});
    assert(radio.samples.every(function(v,i) { return v===again.samples[i] && Number.isFinite(v) && Math.abs(v)<=1; }));
    assert(pcm.every(function(v,i) { return v===original[i]; }));
    var silent = api.transmit(new Float32Array(800),8000,{mode:'radio',volume:0}); assert(silent.samples.every(function(v) { return v===0; }));
    assert(api.transmit(new Float32Array(0),8000,{mode:'radio'}).samples.length===0);
  });

  test('audio', 'radio effects level makes squelch and static adjustable independently of voice', function () {
    var api = window.Driftworks.mumble, pcm = api.render(api.analyze('Hello!'),8000);
    var off = api.transmit(pcm,8000,{mode:'radio',effects:0}), on = api.transmit(pcm,8000,{mode:'radio',effects:1});
    assert(off.samples.slice(0,1280).every(function(v) { return v===0; }));
    assert(on.samples.slice(0,1280).some(function(v) { return Math.abs(v)>0.05; }));
    var bed = api.transmit(new Float32Array(8000),8000,{mode:'radio',effects:1}), energy = 0;
    bed.samples.slice(1000,7000).forEach(function(v) { energy+=v*v; });
    assert(Math.sqrt(energy/6000)>0.01);
    assert(api.transmit(pcm,8000,{mode:'local',effects:1}).samples===pcm);
  });

  test('audio', 'radio latches vary by take and intermittent static preserves timing and effects controls', function () {
    var api=window.Driftworks.mumble,rate=8000,pcm=new Float32Array(rate*12);
    var a=api.transmit(pcm,rate,{mode:'radio',seed:42}),again=api.transmit(pcm,rate,{mode:'radio',seed:42});
    var b=api.transmit(pcm,rate,{mode:'radio',seed:43}),bed=api.transmit(pcm,rate,{mode:'radio',seed:42,staticBursts:false});
    assert(a.samples.every(function(v,i){return Number.isFinite(v)&&v===again.samples[i];}));
    assert(a.samples.slice(0,1280).some(function(v,i){return Math.abs(v-b.samples[i])>0.01;}));
    var changed=0,unchanged=0;
    for(var i=1280;i<1280+pcm.length;i++) {
      if(Math.abs(a.samples[i]-bed.samples[i])>0.000001)changed++;else unchanged++;
    }
    assert(unchanged>pcm.length*0.7,'static remains intermittent');
    var cleanTakes=0,noisyTakes=0;
    for(var seed=0;seed<12;seed++) {
      var take=api.transmit(pcm,rate,{mode:'radio',seed:seed}),quiet=api.transmit(pcm,rate,{mode:'radio',seed:seed,staticBursts:false});
      if(take.samples.some(function(v,i){return v!==quiet.samples[i];}))noisyTakes++;else cleanTakes++;
    }
    assert(cleanTakes>0&&noisyTakes>0,'some entire takes stay free of static bursts');
    assert(a.speechOffset===bed.speechOffset&&a.duration===bed.duration);
    assert(api.transmit(pcm,rate,{mode:'radio',effects:0,seed:42}).samples.every(function(v){return v===0;}));
  });

  test('audio', 'radio carrier hangs after speech before the closing latch', function () {
    var api=window.Driftworks.mumble, rate=8000, pcm=new Float32Array(rate/2), result=api.transmit(pcm,rate,{mode:'radio',effects:1});
    var start=Math.round(result.speechOffset*rate)+pcm.length, energy=0;
    result.samples.slice(start+160,start+800).forEach(function(v) { energy+=v*v; });
    assert(Math.sqrt(energy/640)>0.015, 'audible carrier must persist through the post-speech beat');
    assert(result.samples.length-start===1920);
    assert(result.samples[result.samples.length-1]===0);
  });

  test('audio', 'radio closes after the last voiced burst instead of waiting for final punctuation', function () {
    var api=window.Driftworks.mumble, plan=api.analyze('Wait outside, scout!'), pcm=api.render(plan,8000);
    var last=plan.events.filter(function(e) { return e.kind==='syllable'; }).pop();
    var speechDuration=last.start+Math.min(last.duration*0.72,0.075);
    var radio=api.transmit(pcm,8000,{mode:'radio',speechDuration:speechDuration});
    assert(speechDuration < plan.duration-0.1);
    assert(radio.samples.length === Math.ceil(speechDuration*8000)+3200);
    assert(api.transmit(pcm,8000,{mode:'local',speechDuration:speechDuration}).samples === pcm);
  });

  test('audio', 'Scout exclamations retain energy without a steep final pitch drop', function () {
    var api = window.Driftworks.mumble;
    [0, 7, 42, 99].forEach(function(seed) {
      var plan = api.analyze("We've got company. Keep your eyes on that asteroid field!", Object.assign({}, api.presets.Scout, {seed: seed}));
      var notes = plan.events.filter(function(e) { return e.kind === 'syllable'; });
      assert(notes[notes.length - 1].pitch >= notes[notes.length - 2].pitch * 0.95);
    });
    var flat = api.analyze('Ready', {variation: 0}), question = api.analyze('Ready?', {variation: 0});
    assert(question.events[0].pitch > flat.events[0].pitch);
  });
  };
})();
