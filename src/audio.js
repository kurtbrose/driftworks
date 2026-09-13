(function (global) {
  'use strict';

  var Driftworks = (global.Driftworks = global.Driftworks || {});
  var AudioContextCtor = global.AudioContext || global.webkitAudioContext;
  var storageKey = 'driftworks-audio-settings-v1';
  var context = null;
  var master = null;
  var sfxBus = null;
  var musicBus = null;
  var engineBus = null;
  var engineSource = null;
  var engineFilter = null;
  var musicNodes = [];
  var settings = loadSettings();
  var lastEngineLevel = 0;

  function loadSettings() {
    try {
      var saved = global.localStorage && global.localStorage.getItem(storageKey);
      if (saved) {
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
    if (!ensureContext()) return false;
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

  function setSfxEnabled(enabled) {
    setSfxVolume(enabled ? 1 : 0);
  }

  function setSfxVolume(value) {
    settings.sfxVolume = volumeValue(value, settings.sfxVolume);
    settings.sfx = settings.sfxVolume > 0;
    saveSettings();
    if (unlock()) {
      sfxBus.gain.setTargetAtTime(settings.sfxVolume, context.currentTime, 0.015);
      if (!settings.sfx) setEngineThrust(0);
    }
  }

  function setMusicEnabled(enabled) {
    setMusicVolume(enabled ? 1 : 0);
  }

  function setMusicVolume(value) {
    settings.musicVolume = volumeValue(value, settings.musicVolume);
    settings.music = settings.musicVolume > 0;
    saveSettings();
    if (ensureContext()) {
      musicBus.gain.setTargetAtTime(settings.musicVolume, context.currentTime, 0.08);
      unlock();
    }
  }

  function beep(frequency, duration, gain, type, delay) {
    if (!settings.sfx || !unlock()) return;
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

  function noiseBurst(duration, gain, filterType, filterFrequency, delay) {
    if (!settings.sfx || !unlock()) return;
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

  function createNoiseBuffer(duration) {
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
    if (!settings.sfx || !unlock()) return;
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
    if (!settings.sfx || !unlock()) return;
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

  function playImpact(strength) {
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

  function setEngineThrust(level) {
    if (!context) return;
    var clamped = settings.sfx ? Math.max(0, Math.min(1, level || 0)) : 0;
    lastEngineLevel = clamped;
    var now = context.currentTime;
    engineBus.gain.setTargetAtTime(0.0001 + clamped * 0.026, now, 0.055);
    engineFilter.frequency.setTargetAtTime(180 + clamped * 580, now, 0.08);
  }

  function startMusicBed() {
    [82.41, 123.47, 164.81].forEach(function (frequency, index) {
      var oscillator = context.createOscillator();
      var gain = context.createGain();
      oscillator.type = index === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      gain.gain.value = index === 0 ? 0.012 : 0.006;
      oscillator.connect(gain).connect(musicBus);
      oscillator.start();
      musicNodes.push(oscillator);
    });
  }

  Driftworks.audio = {
    unlock: unlock,
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
