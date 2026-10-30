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
  if (!Driftworks.engineAudio || !Driftworks.audioMixer) throw new Error('Load engine-audio.js and audio-mixer.js before audio.js');
  var engine = Driftworks.engineAudio;
  var mixer = Driftworks.audioMixer.create({getMaster:function(){return settings.sfxVolume;},setMaster:setSfxVolume});
  var lastGunshot = -Infinity;
  function commsChannel() {
    if(!unlock() || !context)return null;
    var output=mixer.channel('comms');
    return output?{context:context,output:output}:null;
  }

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
      mixer.attach(context,sfxBus,master,context.destination);
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

  /** @param {number} frequency @param {number} duration @param {number} gain @param {OscillatorType} type @param {number} [delay] @param {'weapons'|'impacts'} [channel] */
  function beep(frequency, duration, gain, type, delay, channel) {
    if (!settings.sfx || !unlock() || !context || !sfxBus) return;
    var start = context.currentTime + (delay || 0);
    var oscillator = context.createOscillator();
    var envelope = context.createGain();
    oscillator.type = type || 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain || 0.07, start + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope).connect(channel && mixer.channel(channel) || sfxBus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  /** @param {number} duration @param {number} gain @param {BiquadFilterType} filterType @param {number} filterFrequency @param {number} [delay] @param {'weapons'|'impacts'} [channel] */
  function noiseBurst(duration, gain, filterType, filterFrequency, delay, channel) {
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
    source.connect(filter).connect(envelope).connect(channel && mixer.channel(channel) || sfxBus);
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
    if(!settings.sfx || !unlock() || !context || context.currentTime-lastGunshot<.045)return;
    lastGunshot=context.currentTime;
    noiseBurst(0.09, 0.08, 'highpass', 1200 + Math.random() * 300, 0, 'weapons');
    beep(86, 0.07, 0.04, 'sine', 0, 'weapons');
  }

  /** @param {number} strength */
  function playImpact(strength) {
    if(!settings.sfx || !unlock() || !context)return;
    mixer.impact();
    beep(36, 0.18, 0.035 + Math.min(0.035, Math.max(0, strength || 0) * 0.01), 'sine', 0, 'impacts');
    noiseBurst(0.16, 0.055 + Math.min(0.04, (strength || 0) * 0.01), 'lowpass', 520 + Math.random() * 200, 0, 'impacts');
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

  /** Soft spatial-transition cues use the existing SFX bus and mute/volume settings.
   * @param {'enter'|'cross'|'exit'} kind */
  function playWormhole(kind) {
    var notes=kind==='cross'?[130.81,196,261.63]:kind==='enter'?[174.61,220]:[220,174.61];
    notes.forEach(function(frequency,index){beep(frequency,.24,kind==='cross'?.035:.022,'sine',index*.09);});
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

  /** @param {number} dt @param {number} throttle @param {boolean} boost @param {boolean} active @param {{damage?: number; maneuver?: number; thrust?: number; acceleration?: number}} [detail] */
  function setFlightEngine(dt, throttle, boost, active, detail) {
    var feedback = flightFeedback(dt, throttle, boost, active);
    if (!context || !sfxBus) return feedback;
    if (!flightVoice && active) flightVoice = engine.create(context, mixer.channel('engine') || sfxBus, engine.load());
    if (flightVoice) flightVoice.update(dt, Object.assign({}, detail, {throttle: throttle, afterburner: boost, active: active}));
    return feedback;
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

  // Media elements preserve speech pitch while their playback clock drives the fade.
  function createOhioMusic(){return (/** @type {Required<DriftworksNamespace>} */(Driftworks)).ohioSoundtrack.create(mixer.setMusicActive,volumeValue);}

  Driftworks.audio = {
    createOhioMusic: createOhioMusic,
    getMix:mixer.get, setMix:mixer.set, setCommsActive:mixer.setCommsActive, commsChannel:commsChannel, mountMixer:mixer.mount,
    engine: engine,
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
    playWormhole: playWormhole,
    setEngineThrust: setEngineThrust,
    _test: {
      loadSettings: loadSettings, normalizeMix:mixer.normalize, mixLevels:mixer.levels,
      getLastEngineLevel: function () {
        return lastEngineLevel;
      }
    }
  };
})(window);
