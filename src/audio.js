/** @param {Window} global */
(function (global) {
  'use strict';

  /** @typedef {import('./types').DriftworksNamespace} DriftworksNamespace */
  /** @type {DriftworksNamespace} */
  var Driftworks = (global.Driftworks = global.Driftworks || {});
  /** @type {typeof AudioContext | undefined} */
  var AudioContextCtor = global.AudioContext || global.webkitAudioContext;
  var storageKey = 'driftworks-audio-settings-v1';
  /** @type {AudioContext | null} */
  var context = null;
  /** @type {GainNode | null} */
  var master = null;
  /** @type {GainNode | null} */
  var sfxBus = null;
  /** @type {GainNode | null} */
  var musicBus = null;
  /** @type {GainNode | null} */
  var engineBus = null;
  /** @type {AudioBufferSourceNode | null} */
  var engineSource = null;
  /** @type {BiquadFilterNode | null} */
  var engineFilter = null;
  /** @type {AudioNode[]} */
  var musicNodes = [];
  /** @type {import('./engine-types').EngineVoice | null} */
  var flightVoice = null;
  var flightLoad = 0, flightBoost = 0;

  /** @type {{ sfx: boolean, music: boolean, sfxVolume: number, musicVolume: number }} */
  var settings = loadSettings();
  var lastEngineLevel = 0;

  function loadSettings() {
    try {
      var saved = global.localStorage && global.localStorage.getItem(storageKey);
      if (saved) {
        /** @type {{ sfxVolume?: unknown, musicVolume?: unknown, sfx?: unknown, music?: unknown }} */
        var parsed = JSON.parse(saved) || {};
        var sfxVolume = volumeValue(parsed.sfxVolume, parsed.sfx === false ? 0 : 1);
        var musicVolume = volumeValue(parsed.musicVolume, parsed.music ? 1 : 0);
        return { sfx: sfxVolume > 0, music: musicVolume > 0, sfxVolume: sfxVolume, musicVolume: musicVolume };
      }
    } catch (error) {
      // Audio preferences are noncritical.
    }
    return { sfx: true, music: false, sfxVolume: 1, musicVolume: 0 };
  }

  /** @param {unknown} value @param {number} fallback @returns {number} */
  function volumeValue(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  }

  function saveSettings() {
    try {
      if (global.localStorage) global.localStorage.setItem(storageKey, JSON.stringify(settings));
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function ensureContext() {
    if (!AudioContextCtor) return false;
    if (!context) {
      context = new AudioContextCtor();
      master = context.createGain();
      sfxBus = context.createGain();
      musicBus = context.createGain();
      engineBus = context.createGain();
      master.gain.value = 2.6; // 4x original output; channel sliders retain their 0–100% range.
      sfxBus.gain.value = settings.sfxVolume;
      musicBus.gain.value = settings.musicVolume;
      engineBus.gain.value = 0.0001;
      sfxBus.connect(master);
      musicBus.connect(master);
      engineBus.connect(sfxBus);
      master.connect(context.destination);
      startEngineNoise();
      startMusicBed();
    }
    return true;
  }

  function unlock() {
    if (!ensureContext() || !context) return false;
    if (context.state === 'suspended') {
      context.resume();
    }
    return true;
  }

  function status() {
    return {
      available: !!AudioContextCtor,
      unlocked: !!context && context.state === 'running',
      sfx: !!settings.sfx,
      music: !!settings.music,
      sfxVolume: settings.sfxVolume,
      musicVolume: settings.musicVolume
    };
  }

  /** @param {boolean} enabled */
  function setSfxEnabled(enabled) {
    setSfxVolume(enabled ? 1 : 0);
  }

  /** @param {number} value */
  function setSfxVolume(value) {
    settings.sfxVolume = volumeValue(value, settings.sfxVolume);
    settings.sfx = settings.sfxVolume > 0;
    saveSettings();
    if (unlock() && context && sfxBus) {
      sfxBus.gain.setTargetAtTime(settings.sfxVolume, context.currentTime, 0.015);
      if (!settings.sfx) setEngineThrust(0);
    }
  }

  /** @param {boolean} enabled */
  function setMusicEnabled(enabled) {
    setMusicVolume(enabled ? 1 : 0);
  }

  /** @param {number} value */
  function setMusicVolume(value) {
    settings.musicVolume = volumeValue(value, settings.musicVolume);
    settings.music = settings.musicVolume > 0;
    saveSettings();
    if (ensureContext() && context && musicBus) {
      musicBus.gain.setTargetAtTime(settings.musicVolume, context.currentTime, 0.08);
      unlock();
    }
  }

  /** @param {number} frequency @param {number} duration @param {number} gain @param {OscillatorType} type @param {number} [delay] */
  function beep(frequency, duration, gain, type, delay) {
    if (!settings.sfx || !unlock() || !context || !sfxBus) return;
    var start = context.currentTime + (delay || 0);
    var oscillator = context.createOscillator();
    var envelope = context.createGain();
    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain || 0.07, start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope).connect(sfxBus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  /** @param {number} duration @param {number} gain @param {BiquadFilterType} filterType @param {number} filterFrequency @param {number} [delay] */
  function noiseBurst(duration, gain, filterType, filterFrequency, delay) {
    if (!settings.sfx || !unlock() || !context || !sfxBus) return;
    var start = context.currentTime + (delay || 0);
    var source = context.createBufferSource();
    var filter = context.createBiquadFilter();
    var envelope = context.createGain();
    source.buffer = createNoiseBuffer(duration);
    filter.type = filterType || 'bandpass';
    filter.frequency.setValueAtTime(filterFrequency || 900, start);
    filter.Q.value = 1.4;
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain || 0.08, start + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(envelope).connect(sfxBus);
    source.start(start);
  }

  /** @param {number} duration @returns {AudioBuffer} */
  function createNoiseBuffer(duration) {
    if (!context) throw new Error('Audio context is not initialized');
    var length = Math.max(1, Math.floor(context.sampleRate * duration));
    var buffer = context.createBuffer(1, length, context.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function playSelect() {
    beep(880, 0.055, 0.045, 'sine');
  }

  function playMove() {
    beep(520, 0.055, 0.045, 'sine');
    beep(780, 0.07, 0.04, 'sine', 0.055);
  }

  function playInvalid() {
    if (!settings.sfx || !unlock() || !context || !sfxBus) return;
    var start = context.currentTime;
    var oscillator = context.createOscillator();
    var envelope = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(180, start);
    oscillator.frequency.exponentialRampToValueAtTime(95, start + 0.13);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.035, start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    oscillator.connect(envelope).connect(sfxBus);
    oscillator.start(start);
    oscillator.stop(start + 0.16);
  }

  function playMiningTick() {
    if (!settings.sfx || !unlock() || !context || !sfxBus) return;
    var start = context.currentTime;
    var source = context.createBufferSource();
    var lowpass = context.createBiquadFilter();
    var growl = context.createOscillator();
    var growlGain = context.createGain();
    var envelope = context.createGain();
    source.buffer = createNoiseBuffer(0.18);
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(230 + Math.random() * 70, start);
    lowpass.Q.value = 3.8;
    growl.type = 'sawtooth';
    growl.frequency.setValueAtTime(58 + Math.random() * 12, start);
    growl.frequency.linearRampToValueAtTime(44 + Math.random() * 8, start + 0.18);
    growlGain.gain.setValueAtTime(0.0001, start);
    growlGain.gain.exponentialRampToValueAtTime(0.028, start + 0.012);
    growlGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.065, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
    source.connect(lowpass).connect(envelope).connect(sfxBus);
    growl.connect(growlGain).connect(sfxBus);
    source.start(start);
    growl.start(start);
    growl.stop(start + 0.2);
  }

  function playGunshot() {
    noiseBurst(0.11, 0.08, 'highpass', 1200 + Math.random() * 300);
    beep(86, 0.09, 0.04, 'sine');
  }

  /** @param {number} strength */
  function playImpact(strength) {
    beep(36, 0.18, 0.035 + Math.min(0.035, Math.max(0, strength || 0) * 0.01), 'sine');
    noiseBurst(0.16, 0.055 + Math.min(0.04, (strength || 0) * 0.01), 'lowpass', 520 + Math.random() * 200);
  }

  function playDock() {
    noiseBurst(0.08, 0.05, 'lowpass', 260);
    beep(440, 0.06, 0.025, 'sine', 0.07);
  }

  function playDelivery() {
    noiseBurst(0.08, 0.045, 'lowpass', 240);
    beep(520, 0.06, 0.035, 'sine', 0.055);
    beep(660, 0.06, 0.032, 'sine', 0.12);
    beep(880, 0.11, 0.03, 'sine', 0.185);
  }

  function playWarning() {
    beep(420, 0.13, 0.045, 'square');
    beep(315, 0.16, 0.04, 'square', 0.18);
  }

  function startEngineNoise() {
    if (!context || !engineBus) return;
    engineSource = context.createBufferSource();
    engineSource.buffer = createNoiseBuffer(1.5);
    engineSource.loop = true;
    engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 240;
    engineFilter.Q.value = 0.7;
    engineSource.connect(engineFilter).connect(engineBus);
    engineSource.start();
  }

  /** @param {number} level */
  function setEngineThrust(level) {
    if (!context || !engineBus || !engineFilter) return;
    var clamped = settings.sfx ? Math.max(0, Math.min(1, level || 0)) : 0;
    lastEngineLevel = clamped;
    var now = context.currentTime;
    engineBus.gain.setTargetAtTime(0.0001 + clamped * 0.026, now, 0.055);
    engineFilter.frequency.setTargetAtTime(180 + clamped * 580, now, 0.08);
  }

  // Speaker envelope follows flight demand without adding controller vibration.
  /** @param {number} dt @param {number} throttle @param {boolean} boost @param {boolean} active */
  function flightFeedback(dt, throttle, boost, active) {
    var target = active ? volumeValue(throttle, 0) : 0;
    var blend = 1 - Math.exp(-Math.max(0, Math.min(.25, dt || 0)) / .065);
    flightLoad = active ? flightLoad + (target - flightLoad) * blend : 0;
    flightBoost = active ? flightBoost + ((boost ? 1 : 0) - flightBoost) * blend : 0;
    return { load: flightLoad, boost: flightBoost };
  }

  /** @param {number} dt @param {number} throttle @param {boolean} boost @param {boolean} active @param {{damage?: number; maneuver?: number; thrust?: number}} [detail] */
  function setFlightEngine(dt, throttle, boost, active, detail) {
    var feedback = flightFeedback(dt, throttle, boost, active);
    if (!context || !sfxBus) return feedback;
    if (!flightVoice && active) flightVoice = createEngine(context, sfxBus, loadEngineTuning());
    if (flightVoice) flightVoice.update(dt, Object.assign({}, detail, {throttle: throttle, afterburner: boost, active: active}));
    return feedback;
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
    if (!active) return {spool:0, boost:0, ignition:false, active:false};
    var seconds = typeof dt === 'number' && isFinite(dt) ? Math.max(0, Math.min(.25, dt)) : 0;
    var power = Math.pow(volumeValue(demand.throttle, 0), .65);
    return {spool: state.spool + (power - state.spool) * (1 - Math.exp(-seconds / tuning.spool)),
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
    var buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 3), ctx.sampleRate);
    var samples = buffer.getChannelData(0), brown = 0;
    for (var i=0; i<samples.length; i++) { brown = (brown + (Math.random()*2-1)*.06)/1.03; samples[i] = brown*2; }
    var noise = ctx.createBufferSource(), exhaust = ctx.createBiquadFilter(), exhaustGain = ctx.createGain();
    noise.buffer = buffer; noise.loop = true; exhaust.type = 'bandpass'; exhaust.Q.value = .55; exhaustGain.gain.value = 0;
    noise.connect(exhaust).connect(exhaustGain).connect(output);
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
      var thrust = volumeValue(demand.thrust, volumeValue(demand.throttle,0)), outside = tuning.perspective === 'exterior';
      var energy = .08 + power*.92;
      target(output.gain, tuning.volume * .65);
      target(cabin.frequency, outside ? 11000 : 2400);
      target(bass.source.frequency, (35 + power*19)*tuning.pitch);
      target(bass.gain.gain, tuning.bass * energy * .11);
      target(body.source.frequency, (70 + power*38)*tuning.pitch);
      target(body.gain.gain, tuning.texture * energy * .028);
      var turbineHz = (330 + Math.pow(power,1.7)*1250 + turn*70)*tuning.pitch;
      var turbineLevel = tuning.whine * (outside ? .8 : 1);
      target(whine.source.frequency, turbineHz);
      target(harmonic.source.frequency, turbineHz*2.003);
      target(turbineBeat.source.frequency, turbineHz*2.017);
      target(whine.gain.gain, turbineLevel * (.001 + power*.006));
      target(harmonic.gain.gain, turbineLevel * power * .003);
      target(turbineBeat.gain.gain, turbineLevel * power * .0025);
      target(airFilter.frequency, turbineHz * 1.35);
      target(airGain.gain, turbineLevel * (.012 + power*.065));
      target(pitchDrift.gain, tuning.whine * (7 + power*9 + damage*12));
      target(exhaust.frequency, 180 + power*1600 + boost*1600 + thrust*350);
      target(exhaustGain.gain, tuning.roar*(.015+power*.28+thrust*.08+turn*.07)*(outside?1.4:.65));
      target(sub.gain.gain, tuning.burner*boost*.17);
      target(burnerWhine.source.frequency, (650+boost*1050)*tuning.pitch);
      target(burnerWhine.gain.gain, tuning.burner*boost*.012);
      target(crackleGain.gain, tuning.burner*boost*(.2+damage*.12)*(outside?1:.45));
      target(flutter.frequency, tuning.flutter + damage*3);
      target(flutterGain.gain, tuning.texture * tuning.bass * energy * (.012+damage*.015));
      target(wobbleGain.gain, tuning.texture*tuning.roar*(power+boost)*(.012+damage*.03));
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

  function startMusicBed() {
    if (!context || !musicBus) return;
    var audioContext = context;
    var musicOutput = musicBus;
    [82.41, 123.47, 164.81].forEach(function (frequency, index) {
      var oscillator = audioContext.createOscillator();
      var gain = audioContext.createGain();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.value = index === 0 ? 0.012 : 0.006;
      oscillator.connect(gain).connect(musicOutput);
      oscillator.start();
      musicNodes.push(oscillator);
    });
  }

  Driftworks.audio = {
    engine: {presets: enginePresets, normalize: normalizeEngine, step: stepEngine, create: createEngine, load: loadEngineTuning, save: saveEngineTuning},
    unlock: unlock,
    flightFeedback: flightFeedback,
    setFlightEngine: setFlightEngine,
    status: status,
    setSfxEnabled: setSfxEnabled,
    setMusicEnabled: setMusicEnabled,
    setSfxVolume: setSfxVolume,
    setMusicVolume: setMusicVolume,
    playSelect: playSelect,
    playMove: playMove,
    playInvalid: playInvalid,
    playMiningTick: playMiningTick,
    playGunshot: playGunshot,
    playImpact: playImpact,
    playDock: playDock,
    playDelivery: playDelivery,
    playWarning: playWarning,
    setEngineThrust: setEngineThrust,
    _test: {
      loadSettings: loadSettings,
      getLastEngineLevel: function () {
        return lastEngineLevel;
      }
    }
  };
})(window);
