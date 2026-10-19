/** @param {Window} global */
(function (global) {
  'use strict';
  /** @type {import('./types').DriftworksNamespace} */
  var Driftworks = (global.Driftworks = global.Driftworks || {});
  /** @param {unknown} value @param {number} fallback */
  function volumeValue(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  }
  /** @typedef {import('./engine-types').EngineTuning} EngineTuning */
  /** @typedef {import('./engine-types').EngineDemand} EngineDemand */
  /** @typedef {import('./engine-types').EngineState} EngineState */
  /** @type {EngineTuning} */
  var engineDefaults = {bass: .7, whine: .45, roar: .55, texture: .3, burner: .75, pitch: 1, spool: .45, flutter: 23, volume: .55, perspective: 'cockpit'};
  /** @param {Partial<EngineTuning>} value @returns {EngineTuning} */
  function normalizeEngine(value) {
    var result = Object.assign({}, engineDefaults);
    /** @type {(keyof Omit<EngineTuning, 'perspective'>)[]} */
    var keys = ['bass', 'whine', 'roar', 'texture', 'burner', 'pitch', 'spool', 'flutter', 'volume'];
    keys.forEach(function (key) {
      var max = key === 'flutter' ? 35 : key === 'pitch' ? 2 : key === 'spool' ? 1.5 : 1;
      var min = key === 'flutter' ? 15 : key === 'pitch' ? .5 : key === 'spool' ? .08 : 0;
      var v = value[key];
      if (typeof v === 'number' && isFinite(v)) result[key] = Math.max(min, Math.min(max, v));
    });
    result.perspective = value.perspective === 'exterior' ? 'exterior' : 'cockpit';
    return result;
  }
  /** @param {string} name @param {string} description @param {Partial<EngineTuning>} tuning */
  function enginePreset(name, description, tuning) { return {name: name, description: description, tuning: normalizeEngine(tuning)}; }
  // Initialized below engineDefaults; all presets use the same graph.
  var enginePresets = [
    enginePreset('Vanguard', 'Balanced fighter: structural bass, turbine shimmer, forceful ignition.', {}),
    enginePreset('Interceptor', 'Quick spool, bright twin turbine, leaner bass.', {bass:.35, whine:.85, roar:.4, pitch:1.5, spool:.2}),
    enginePreset('Heavy bomber', 'Slow machinery, deep hull resonance and heavy exhaust.', {bass:1, whine:.2, roar:.8, pitch:.65, spool:.8, texture:.65, flutter:17}),
    enginePreset('Ion ghost', 'Clean electric drive with a singing turbine and restrained exhaust.', {bass:.45, whine:.8, roar:.12, texture:.08, pitch:1.25, burner:.4}),
    enginePreset('Scrapyard', 'Ragged mechanical flutter, turbulent exhaust and uneven power.', {bass:.75, whine:.25, roar:.85, texture:1, flutter:31, spool:.6}),
    enginePreset('Thunderhead', 'Sub-heavy cinematic drive with a fierce afterburner.', {bass:1, whine:.5, roar:.9, burner:1, pitch:.8, flutter:20, perspective:'exterior'}),
    enginePreset('Classic turbine', 'Jet-like rising whine and a broad, bright exhaust wash.', {bass:.4, whine:1, roar:.8, texture:.2, pitch:1.1, perspective:'exterior'}),
    enginePreset('Deep space tug', 'Low industrial drone, lazy spool, little high-end shimmer.', {bass:.9, whine:.1, roar:.45, texture:.6, spool:1.2, pitch:.5, burner:.5})
  ];
  /** @param {EngineState} state @param {number} dt @param {EngineDemand} demand @param {EngineTuning} tuning @returns {EngineState} */
  function stepEngine(state, dt, demand, tuning) {
    var active = demand.active !== false;
    if (!active) return {spool:0, surge:0, boost:0, ignition:false, active:false};
    var seconds = typeof dt === 'number' && isFinite(dt) ? Math.max(0, Math.min(.25, dt)) : 0;
    var power = Math.pow(volumeValue(demand.throttle, 0), .65);
    var acceleration = volumeValue(demand.acceleration, Math.min(1, Math.max(0, power-state.spool)*2));
    var surge = state.surge || 0;
    return {surge: surge + (acceleration-surge)*(1-Math.exp(-seconds/(acceleration>surge?.08:.4))), spool: state.spool + (power - state.spool) * (1 - Math.exp(-seconds / tuning.spool)),
      boost: state.boost + ((demand.afterburner ? 1 : 0) - state.boost) * (1 - Math.exp(-seconds / .09)),
      ignition: !!demand.afterburner && !state.held, held: !!demand.afterburner, active:true};
  }
  function loadEngineTuning() {
    try {
      var raw = global.localStorage && global.localStorage.getItem('driftworks-engine-tuning-v1');
      if (raw) {
        /** @type {unknown} */ var value = JSON.parse(raw);
        if (value && typeof value === 'object') return normalizeEngine(/** @type {Partial<EngineTuning>} */(value));
      }
    } catch (error) { /* Optional tuning. */ }
    return normalizeEngine({});
  }
  /** @param {EngineTuning} tuning */
  function saveEngineTuning(tuning) {
    try { global.localStorage.setItem('driftworks-engine-tuning-v1', JSON.stringify(normalizeEngine(tuning))); return true; }
    catch (error) { return false; }
  }
  /** @param {AudioContext} ctx @param {AudioNode} destination @param {Partial<EngineTuning>} [initial] @returns {import('./engine-types').EngineVoice} */
  function createEngine(ctx, destination, initial) {
    var tuning = normalizeEngine(initial || {});
    var output = ctx.createGain(), cabin = ctx.createBiquadFilter(), limiter = ctx.createDynamicsCompressor();
    output.gain.value = 0; cabin.type = 'lowpass'; cabin.Q.value = .5;
    limiter.threshold.value = -12; limiter.knee.value = 12; limiter.ratio.value = 6;
    limiter.attack.value = .003; limiter.release.value = .15;
    output.connect(cabin).connect(limiter).connect(destination);
    /** @type {(OscillatorNode | AudioBufferSourceNode)[]} */ var sources = [];
    /** @type {AudioNode[]} */ var nodes = [output, cabin, limiter];
    /** @param {number} frequency @param {OscillatorType} type */
    function tone(frequency, type) {
      var oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = type; oscillator.frequency.value = frequency; gain.gain.value = 0;
      oscillator.connect(gain).connect(output); oscillator.start(); sources.push(oscillator); nodes.push(gain);
      return {source:oscillator, gain:gain};
    }
    var bass = tone(42, 'sine'), body = tone(84, 'triangle'), whine = tone(180, 'sine'), harmonic = tone(362, 'sine');
    var turbineBeat = tone(730, 'sine');
    var sub = tone(32, 'sine'), burnerWhine = tone(1000, 'triangle');
    // Looping colored turbulence and independent amplitude modulation add machinery texture.
    var buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 7.3), ctx.sampleRate);
    var samples = buffer.getChannelData(0), brown = 0;
    for (var i=0; i<samples.length; i++) { brown = (brown + (Math.random()*2-1)*.06)/1.03; samples[i] = brown*2; }
    var noise = ctx.createBufferSource(), exhaust = ctx.createBiquadFilter(), exhaustGain = ctx.createGain();
    noise.buffer = buffer; noise.loop = true; exhaust.type = 'bandpass'; exhaust.Q.value = .55; exhaustGain.gain.value = 0;
    var exhaustDark = ctx.createBiquadFilter(), speechSpace = ctx.createBiquadFilter();
    exhaustDark.type = 'lowpass'; exhaustDark.Q.value = .65;
    speechSpace.type = 'peaking'; speechSpace.frequency.value = 1700;
    speechSpace.Q.value = .65; speechSpace.gain.value = -9;
    noise.connect(exhaust).connect(exhaustDark).connect(speechSpace).connect(exhaustGain).connect(output);
    nodes.push(exhaustDark, speechSpace);
    var crackle = ctx.createBiquadFilter(), crackleGain = ctx.createGain();
    crackle.type = 'highpass'; crackle.frequency.value = 1600; crackleGain.gain.value = 0;
    noise.connect(crackle).connect(crackleGain).connect(output);
    noise.start(); sources.push(noise); nodes.push(exhaust, exhaustGain, crackle, crackleGain);
    // Air and small random pitch variations break up the radio-like pure tone.
    // Keep this branch under the whine control, independent of exhaust/texture.
    var airBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 3), ctx.sampleRate);
    var airSamples = airBuffer.getChannelData(0);
    for (var j=0; j<airSamples.length; j++) airSamples[j] = Math.random()*2-1;
    var turbineAir = ctx.createBufferSource(), airFilter = ctx.createBiquadFilter(), airGain = ctx.createGain();
    turbineAir.buffer = airBuffer; turbineAir.loop = true;
    airFilter.type = 'bandpass'; airFilter.Q.value = .65; airGain.gain.value = 0;
    turbineAir.connect(airFilter).connect(airGain).connect(output);
    turbineAir.start(); sources.push(turbineAir); nodes.push(airFilter, airGain);
    var pitchDrift = ctx.createGain(); pitchDrift.gain.value = 0;
    noise.connect(pitchDrift);
    pitchDrift.connect(whine.source.frequency); pitchDrift.connect(harmonic.source.frequency);
    nodes.push(pitchDrift);
    var flutter = ctx.createOscillator(), flutterGain = ctx.createGain(), wobble = ctx.createOscillator(), wobbleGain = ctx.createGain();
    flutter.frequency.value = tuning.flutter; flutterGain.gain.value = 0;
    flutter.connect(flutterGain); flutterGain.connect(bass.gain.gain); flutterGain.connect(body.gain.gain);
    wobble.frequency.value = 7.3; wobbleGain.gain.value = 0;
    wobble.connect(wobbleGain).connect(exhaustGain.gain);
    flutter.start(); wobble.start(); sources.push(flutter,wobble); nodes.push(flutterGain,wobbleGain);
    // Slow, irregular turbulence gives the roar movement even with texture muted.
    var turbulence = ctx.createBiquadFilter(), turbulenceGain = ctx.createGain(), exhaustDrift = ctx.createGain();
    turbulence.type = 'lowpass'; turbulence.frequency.value = 11; turbulence.Q.value = .5;
    turbulenceGain.gain.value = 0; exhaustDrift.gain.value = 0;
    noise.connect(turbulence);
    turbulence.connect(turbulenceGain).connect(exhaustGain.gain);
    turbulence.connect(exhaustDrift).connect(exhaust.frequency);
    nodes.push(turbulence, turbulenceGain, exhaustDrift);
    // A filtered, pulsing low harmonic carries cruise without a constant noise wash.
    var growl = tone(78, 'sawtooth'), growlFilter = ctx.createBiquadFilter(), growlPulse = ctx.createGain();
    growlFilter.type = 'lowpass'; growlFilter.frequency.value = 220; growlFilter.Q.value = .6;
    growl.source.disconnect(); growl.source.connect(growlFilter).connect(growl.gain);
    growlPulse.gain.value = 0; flutter.connect(growlPulse).connect(growl.gain.gain);
    nodes.push(growlFilter, growlPulse);
    // Low colored noise carries the weight; quiet pitched remnants add definition.
    // Slow stochastic modulation avoids a held note or a regular tremolo pulse.
    var roughHigh = ctx.createBiquadFilter(), roughLow = ctx.createBiquadFilter();
    roughHigh.type = 'highpass'; roughHigh.frequency.value = 24; roughHigh.Q.value = .6;
    roughLow.type = 'lowpass'; roughLow.frequency.value = 155; roughLow.Q.value = .7;
    var roughBass = ctx.createGain(), roughGrowl = ctx.createGain();
    roughBass.gain.value = 0; roughGrowl.gain.value = 0;
    noise.connect(roughHigh).connect(roughLow);
    roughLow.connect(roughBass).connect(output); roughLow.connect(roughGrowl).connect(output);
    var slowMotion = ctx.createBiquadFilter();
    slowMotion.type = 'lowpass'; slowMotion.frequency.value = 2.7; slowMotion.Q.value = .5;
    noise.connect(slowMotion);
    var bassDrift = ctx.createGain(), growlDrift = ctx.createGain(), bassPulse = ctx.createGain(), unevenGrowl = ctx.createGain();
    [bassDrift,growlDrift,bassPulse,unevenGrowl].forEach(function(gain){gain.gain.value=0;slowMotion.connect(gain);});
    bassDrift.connect(bass.source.frequency); bassDrift.connect(body.source.frequency); growlDrift.connect(growl.source.frequency);
    bassPulse.connect(bass.gain.gain); unevenGrowl.connect(growl.gain.gain);
    nodes.push(roughHigh,roughLow,roughBass,roughGrowl,slowMotion,bassDrift,growlDrift,bassPulse,unevenGrowl);
    /** @type {EngineState} */ var state = {spool:0, boost:0, ignition:false, active:false};
    var heldBoost = false, disposed = false;
    /** @param {AudioParam} param @param {number} value @param {number} [time] */
    function target(param, value, time) { param.setTargetAtTime(value, ctx.currentTime, time || .035); }
    function stop() {
      if (disposed) return;
      output.gain.cancelScheduledValues(ctx.currentTime);
      target(output.gain, 0, .015);
      state = {spool:0, boost:0, ignition:false, active:false}; heldBoost = false;
    }
    /** @param {number} dt @param {EngineDemand} demand */
    function update(dt, demand) {
      if (disposed) return state;
      if (demand.active === false) { stop(); return state; }
      var ignition = !!demand.afterburner && !heldBoost;
      // The gate is separate from the one-frame ignition indicator.
      state = stepEngine(state, dt, demand, tuning);
      heldBoost = !!demand.afterburner;
      var power = state.spool, boost = state.boost, damage = volumeValue(demand.damage,0), turn = volumeValue(demand.maneuver,0);
      var outside = tuning.perspective === 'exterior';
      var energy = .08 + power*.92, surge = state.surge || 0;
      var roarActivity = .035 + surge*.7 + boost*.85 + turn*.06;
      target(growl.source.frequency, (62 + power*33)*tuning.pitch);
      target(growl.gain.gain, tuning.roar*energy*(.018+surge*.008+boost*.008));
      target(growlPulse.gain, tuning.roar*energy*.002);
      target(roughLow.frequency, 120 + power*35 + surge*25);
      target(roughBass.gain, tuning.bass*energy*.26);
      target(roughGrowl.gain, tuning.roar*energy*(.18+surge*.04+boost*.04));
      target(bassDrift.gain, tuning.bass*(14+damage*8));
      target(growlDrift.gain, tuning.roar*(32+damage*16));
      target(bassPulse.gain, tuning.bass*energy*.018);
      target(unevenGrowl.gain, tuning.roar*energy*.025);
      target(output.gain, tuning.volume * .65);
      target(cabin.frequency, outside ? 11000 : 2400);
      target(bass.source.frequency, (35 + power*19)*tuning.pitch);
      target(bass.gain.gain, tuning.bass * energy * .018);
      target(body.source.frequency, (70 + power*38)*tuning.pitch);
      target(body.gain.gain, tuning.texture * energy * .012);
      var turbineHz = (330 + Math.pow(power,1.7)*1250 + turn*70)*tuning.pitch;
      var turbineLevel = tuning.whine * (outside ? .8 : 1);
      target(whine.source.frequency, turbineHz);
      target(harmonic.source.frequency, turbineHz*2.003);
      target(turbineBeat.source.frequency, turbineHz*2.017);
      target(whine.gain.gain, turbineLevel * (.001 + power*.006));
      target(harmonic.gain.gain, turbineLevel * power * .003);
      target(turbineBeat.gain.gain, turbineLevel * power * .0025);
      target(airFilter.frequency, turbineHz * 1.35);
      target(airGain.gain, turbineLevel * (.002 + power*.009 + surge*.028 + boost*.025));
      target(pitchDrift.gain, tuning.whine * (7 + power*9 + damage*12));
      target(exhaust.frequency, 110 + power*140 + surge*370 + boost*180);
      target(exhaustDark.frequency, 550 + surge*650 + boost*400);
      target(turbulenceGain.gain, tuning.roar*roarActivity*energy*(.045+damage*.025));
      target(exhaustDrift.gain, tuning.roar*roarActivity*energy*(180+damage*90));
      target(exhaustGain.gain, tuning.roar*roarActivity*(.04+power*.18)*(outside?1.15:.65));
      target(sub.gain.gain, tuning.burner*boost*.17);
      target(burnerWhine.source.frequency, (650+boost*1050)*tuning.pitch);
      target(burnerWhine.gain.gain, tuning.burner*boost*.012);
      target(crackleGain.gain, tuning.burner*boost*(.2+damage*.12)*(outside?1:.45));
      target(flutter.frequency, tuning.flutter + damage*3);
      target(flutterGain.gain, tuning.texture * tuning.bass * energy * (.002+damage*.003));
      target(wobbleGain.gain, tuning.texture*tuning.roar*roarActivity*(power+boost)*(.012+damage*.03));
      if (ignition) {
        var now = ctx.currentTime;
        sub.gain.gain.cancelScheduledValues(now);
        sub.gain.gain.setValueAtTime(tuning.burner*.25,now);
        sub.gain.gain.setTargetAtTime(tuning.burner*.17,now+.025,.09);
        crackleGain.gain.cancelScheduledValues(now);
        crackleGain.gain.setValueAtTime(tuning.burner*.7,now);
        crackleGain.gain.setTargetAtTime(tuning.burner*(outside?.2:.09),now+.025,.07);
        burnerWhine.source.frequency.setValueAtTime(400*tuning.pitch,now);
        burnerWhine.source.frequency.exponentialRampToValueAtTime(1700*tuning.pitch,now+.18);
      }
      return state;
    }
    return {update:update, stop:stop,
      tune:function(value) { tuning = normalizeEngine(Object.assign({},tuning,value)); },
      dispose:function() { if(disposed)return; stop(); disposed=true;
        // Let the output fade before disconnecting, even when disposed while playing.
        sources.forEach(function(source){source.stop(ctx.currentTime+.08);});
        global.setTimeout(function(){sources.forEach(function(source){source.disconnect();});nodes.forEach(function(node){node.disconnect();});},100);
      }};
  }

  Driftworks.engineAudio = {presets: enginePresets, normalize: normalizeEngine, step: stepEngine, create: createEngine, load: loadEngineTuning, save: saveEngineTuning};
})(window);
