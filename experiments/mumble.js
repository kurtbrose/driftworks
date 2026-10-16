(function () {
  'use strict';
  var defaults = { pitch: 150, resonance: 1, roughness: 0.18, breath: 0.12, speed: 1, enunciation: 0.35, variation: 0.35, volume: 0.65, radio: 0, seed: 7, emotion: 'neutral' };
  var presets = {
    Scout: { pitch: 210, resonance: 1.2, roughness: 0.08, breath: 0.1, speed: 1.2 },
    Veteran: { pitch: 95, resonance: 0.8, roughness: 0.45, breath: 0.22, speed: 0.85 },
    Navigator: { pitch: 155, resonance: 1, roughness: 0.1, breath: 0.2, speed: 1 },
    Alien: { pitch: 260, resonance: 0.65, roughness: 0.25, breath: 0.06, speed: 1.1 }
  };
  function voice(options) {
    var v = Object.assign({}, defaults, options);
    ['pitch', 'resonance', 'roughness', 'breath', 'speed', 'variation', 'volume', 'radio', 'enunciation', 'seed'].forEach(function (key) { if (!Number.isFinite(v[key])) v[key] = defaults[key]; });
    v.pitch = Math.max(60, Math.min(360, v.pitch)); v.speed = Math.max(0.5, Math.min(2, v.speed)); v.resonance = Math.max(0.5, Math.min(1.6, v.resonance));
    ['roughness', 'breath', 'variation', 'volume', 'radio', 'enunciation'].forEach(function (key) { v[key] = Math.max(0, Math.min(1, v[key])); });
    return v;
  }
  function random(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(text, seed) { for (var i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619); return seed; }
  function analyze(text, options) {
    text = String(text).slice(0, 600); var v = voice(options), rng = random(hash(text, v.seed)), events = [], time = 0;
    var tokens = text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]/gu) || [], offset = 0;
    tokens.forEach(function (token) {
      if (/^[\p{L}\p{N}]/u.test(token)) {
        var chunks = token.match(/[^aeiou]*[aeiou]+[^aeiou]?(?=[^aeiou]|$)|.+/gi) || [token];
        // Lower articulation folds adjacent text syllables into a single vocal gesture.
        // Keep their combined offsets so subtitle timing still covers every character.
        var grouped = [];
        for (var c = 0; c < chunks.length; c++) {
          var group = chunks[c];
          if (c + 1 < chunks.length && rng() > v.enunciation) group += chunks[++c];
          grouped.push(group);
        }
        chunks = grouped;
        var local = 0;
        chunks.forEach(function (chunk, index) {
          var duration = (0.105 + Math.min(chunk.length, 5) * 0.017 + rng() * 0.035) / v.speed;
          duration *= 0.65 + 0.35 * v.enunciation;
          if (v.emotion === 'urgent') duration *= 0.78;
          if (v.emotion === 'hesitant') duration *= 1.18;
          var vowel = (chunk.match(/[aeiou]/i) || ['aeiou'[Math.floor(rng() * 5)]])[0].toLowerCase();
          var end = offset + local + chunk.length, punctuation = text.slice(offset + token.length).match(/^\s*([?!.,;:]|$)/);
          var contour = punctuation && punctuation[1] === '?' ? 1 + 0.28 * (index + 1) / chunks.length : 1 - 0.16 * (index + 1) / chunks.length;
          events.push({ kind: 'syllable', start: time, duration: duration, vowel: vowel, pitch: v.pitch * contour * (1 + (rng() - 0.5) * v.variation) * (v.emotion === 'urgent' ? 1.15 : 1), from: offset + local, to: end, attack: /^[^aeiou]/i.test(chunk) });
          time += duration + 0.018 * v.enunciation / v.speed; local += chunk.length;
        });
      } else {
        var pause = /[.!?]/.test(token) ? 0.28 : /[,;:\n]/.test(token) ? 0.15 : 0.035;
        pause *= /[.!?,;:\n]/.test(token) ? 0.75 + 0.25 * v.enunciation : 0.3 + 0.7 * v.enunciation;
        events.push({ kind: 'pause', start: time, duration: pause / v.speed, from: offset, to: offset + token.length }); time += pause / v.speed;
      }
      offset += token.length;
    });
    return { text: text, voice: v, events: events, duration: time };
  }
  var vowels = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010], o: [570, 840, 2410], u: [300, 870, 2240] };
  function render(plan, sampleRate) {
    sampleRate = sampleRate || 22050; var pcm = new Float32Array(Math.ceil(plan.duration * sampleRate)), v = plan.voice, rng = random(hash(plan.text, v.seed)), phase = 0;
    plan.events.forEach(function (event) {
      if (event.kind !== 'syllable') return;
      var formants = vowels[event.vowel], count = Math.floor(event.duration * sampleRate), start = Math.floor(event.start * sampleRate);
      for (var i = 0; i < count; i++) {
        var t = i / sampleRate, p = i / count, frequency = event.pitch * (1 + 0.025 * Math.sin(t * 32) + v.roughness * 0.035 * Math.sin(t * 173));
        phase += 2 * Math.PI * frequency / sampleRate; var value = 0;
        for (var h = 1; h <= 24; h++) {
          var hz = frequency * h, weight = 0.06 / h;
          for (var f = 0; f < 3; f++) weight += Math.exp(-Math.pow((hz - formants[f] * v.resonance) / (100 + f * 65), 2)) * (0.7 / (f + 1));
          value += Math.sin(phase * h) * weight;
        }
        var noise = rng() * 2 - 1, envelope = Math.min(1, t / 0.018) * Math.min(1, (event.duration - t) / 0.04);
        var consonant = event.attack ? Math.exp(-t * 85) * noise * 0.45 * v.enunciation : 0;
        value = (value * (0.8 + 0.2 * Math.sin(p * Math.PI)) + noise * v.breath * 0.12 + consonant) * envelope;
        pcm[start + i] = Math.tanh(value * (1 + v.roughness)) * 0.48 * v.volume;
      }
    });
    if (v.radio) {
      var low = 0, band = 0;
      for (var n = 0; n < pcm.length; n++) { low += 0.09 * (pcm[n] - low); band += 0.5 * (pcm[n] - low - band); pcm[n] = pcm[n] * (1 - v.radio) + Math.tanh(band * 3) * 0.5 * v.radio; }
    }
    return pcm;
  }
  window.Driftworks = window.Driftworks || {};
  window.Driftworks.mumble = { defaults: defaults, presets: presets, analyze: analyze, render: render };
}());
