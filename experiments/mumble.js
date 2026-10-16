(function () {
  'use strict';
  var defaults = { pitch: 150, resonance: 1, roughness: 0.18, breath: 0.12, speed: 1, pauseScale: 1, compactWords: true, enunciation: 0.35, variation: 0.35, volume: 0.65, radio: 0, seed: 7, emotion: 'neutral' };
  var presets = {
    Scout: { pitch: 210, resonance: 1.2, roughness: 0.08, breath: 0.1, speed: 1.2 },
    Veteran: { pitch: 95, resonance: 0.8, roughness: 0.45, breath: 0.22, speed: 0.85 },
    Navigator: { pitch: 155, resonance: 1, roughness: 0.1, breath: 0.2, speed: 1 },
    Alien: { pitch: 260, resonance: 0.65, roughness: 0.25, breath: 0.06, speed: 1.1 }
  };
  function voice(options) {
    var v = Object.assign({}, defaults, options);
    ['pitch', 'resonance', 'roughness', 'breath', 'speed', 'variation', 'volume', 'radio', 'pauseScale', 'enunciation', 'seed'].forEach(function (key) { if (!Number.isFinite(v[key])) v[key] = defaults[key]; });
    v.pitch = Math.max(60, Math.min(360, v.pitch)); v.speed = Math.max(0.5, Math.min(2, v.speed)); v.resonance = Math.max(0.5, Math.min(1.6, v.resonance));
    ['roughness', 'breath', 'variation', 'volume', 'radio', 'pauseScale', 'enunciation'].forEach(function (key) { v[key] = Math.max(0, Math.min(1, v[key])); });
    return v;
  }
  function random(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(text, seed) { for (var i = 0; i < text.length; i++) seed = Math.imul(seed ^ text.charCodeAt(i), 16777619); return seed; }
  function analyze(text, options) {
    text = String(text).slice(0, 600); var v = voice(options), rng = random(hash(text, v.seed)), events = [], time = 0;
    var rhythm = random(hash(text, v.seed ^ 0x52485954));
    var tokens = text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]/gu) || [], offset = 0;
    tokens.forEach(function (token) {
      if (/^[\p{L}\p{N}]/u.test(token)) {
        var chunks = token.match(/[^aeiou]*[aeiou]+[^aeiou]?(?=[^aeiou]|$)|.+/gi) || [token];
        // Keep a sparse word signature, not concatenated syllables. Skipped sounds
        // consume no audio time, but their text still belongs to a surviving cue.
        var starts = [], cursor = 0;
        chunks.forEach(function(chunk) { starts.push(cursor); cursor += chunk.length; });
        var count = Math.max(1, Math.round(1 + (chunks.length - 1) * v.enunciation));
        if (chunks.length > 2 && v.enunciation > 0) count = Math.max(2, count);
        var retained = [];
        for (var c = 0; c < count; c++) {
          retained.push(count === 1 ? 0 : Math.round(c * (chunks.length - 1) / (count - 1)));
        }
        var wordBudget = (0.07 + 0.015 * Math.min(chunks.length, 3)) / v.speed;
        retained.forEach(function (sourceIndex, index) {
          var chunk = chunks[sourceIndex], local = index === 0 ? 0 : starts[sourceIndex];
          var next = index + 1 < retained.length ? starts[retained[index + 1]] : token.length;
          var duration = (0.105 + Math.min(chunk.length, 5) * 0.017 + rng() * 0.035) / v.speed;
          // Low articulation has a word-level time budget, regardless of spelling.
          if (v.enunciation < 1) duration = Math.min(duration, wordBudget / (count * (1 - v.enunciation)));
          if (v.compactWords) {
            var lightWord = /^(a|an|the|to|of|and|on|in|your|by)$/i.test(token);
            duration = Math.min(duration, (lightWord ? 0.075 : 0.105) / v.speed) * (0.8 + rhythm() * 0.4);
          }
          if (v.emotion === 'urgent') duration *= 0.78;
          if (v.emotion === 'hesitant') duration *= 1.18;
          var vowel = (chunk.match(/[aeiou]/i) || ['aeiou'[Math.floor(rng() * 5)]])[0].toLowerCase();
          var writtenVowels = chunk.match(/[aeiou]/gi) || [vowel];
          var vowelEnd = writtenVowels[writtenVowels.length - 1].toLowerCase();
          var end = offset + next, punctuation = text.slice(offset + token.length).match(/^\s*([?!.,;:]|$)/);
          var mark = punctuation ? punctuation[1] : null, progress = (index + 1) / retained.length;
          // Only phrase endings carry a terminal contour. Exclamations retain energy;
          // a random low syllable must not turn their ending into a pronounced dive.
          var contour = mark === '?' ? 1 + 0.28 * progress : mark === '!' ? 1 + 0.02 * progress : mark === '.' || mark === '' ? 1 - 0.06 * progress : 1;
          var pitch = v.pitch * contour * (1 + (rng() - 0.5) * v.variation) * (v.emotion === 'urgent' ? 1.15 : 1);
          var previousIndex = events.length - 1;
          while (previousIndex >= 0 && events[previousIndex].kind === 'pause' && /^\s+$/.test(text.slice(events[previousIndex].from, events[previousIndex].to))) previousIndex--;
          var previous = events[previousIndex];
          if ((mark === '!' || mark === '.' || mark === '') && index === retained.length - 1 && previous && previous.kind === 'syllable') {
            pitch = Math.max(pitch, previous.pitch * (mark === '!' ? 0.95 : 0.9));
          }
          events.push({ kind: 'syllable', start: time, duration: duration, vowel: vowel, vowelEnd: vowelEnd, closed: /[^aeiou]$/i.test(chunk), pitch: pitch, from: offset + local, to: end, sourceFrom: offset + starts[sourceIndex], sourceTo: offset + starts[sourceIndex] + chunk.length, attack: /^[^aeiou]/i.test(chunk) && rng() < v.enunciation });
          time += duration + 0.018 * v.enunciation * v.pauseScale * (v.compactWords ? 0.4 + rhythm() * 0.5 : 1) / v.speed;
        });
      } else {
        var pause = /[.!?]/.test(token) ? 0.28 : /[,;:\n]/.test(token) ? 0.15 : 0.035;
        pause *= /[.!?,;:\n]/.test(token) ? 0.75 + 0.25 * v.enunciation : 0.3 + 0.7 * v.enunciation;
        if (v.compactWords && token === ',') pause *= 0.4;
        if (v.compactWords && !/[.!?,;:\n]/.test(token)) pause *= 0.25 + rhythm() * 0.4;
        pause *= v.pauseScale;
        events.push({ kind: 'pause', start: time, duration: pause / v.speed, from: offset, to: offset + token.length }); time += pause / v.speed;
      }
      offset += token.length;
    });
    // Phrase-wide intonation follows audio time, spanning words and short gaps.
    // Punctuation resets the gesture; whitespace never resets it.
    var phrase = [];
    function shapePhrase(mark) {
      if (!phrase.length) return;
      var first = phrase[0], last = phrase[phrase.length - 1];
      var span = last.start + last.duration - first.start;
      var base = v.pitch * (v.emotion === 'urgent' ? 1.15 : 1);
      var bounce = 0.055 + v.variation * 0.10;
      function contour(time) {
        var x = Math.max(0, Math.min(1, (time - first.start) / span));
        var ending = mark === '?' ? 0.22 * x * x : mark === '!' ? 0.025 * x : -0.035 * x;
        return base * Math.pow(2, (bounce * Math.sin(2 * Math.PI * 1.25 * x - 0.6) + ending) / 1);
      }
      phrase.forEach(function(event) {
        event.pitchCurve = [contour(event.start), contour(event.start + event.duration / 2), contour(event.start + event.duration)];
      });
      phrase = [];
    }
    events.forEach(function(event) {
      if (event.kind === 'syllable') phrase.push(event);
      else if (/[.!?,;:\n]/.test(text.slice(event.from, event.to))) shapePhrase(text.slice(event.from, event.to));
    });
    shapePhrase('');
    return { text: text, voice: v, events: events, duration: time };
  }
  var vowels = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010], o: [570, 840, 2410], u: [300, 870, 2240] };
  // Deliberately approximate spelling cues, not English pronunciation rules.
  var vowelGroups = { oo: ['u', 'u'], ee: ['i', 'i'], ea: ['i', 'i'], ie: ['i', 'i'], ai: ['e', 'i'], ay: ['e', 'i'], ei: ['e', 'i'], oa: ['o', 'u'], ou: ['a', 'u'], ow: ['a', 'u'], oi: ['o', 'i'], oy: ['o', 'i'], au: ['o', 'o'], aw: ['o', 'o'] };
  function render(plan, sampleRate, options) {
    var style = options && options.style || 'vowel-groups';
    var flowing = style === 'flowing';
    var popping = style === 'vowel-groups';
    sampleRate = sampleRate || 22050; var pcm = new Float32Array(Math.ceil(plan.duration * sampleRate)), v = plan.voice, rng = random(hash(plan.text, v.seed)), phase = 0;
    plan.events.forEach(function (event, eventIndex) {
      if (event.kind !== 'syllable') return;
      var nextIndex = eventIndex + 1;
      while (nextIndex < plan.events.length && plan.events[nextIndex].kind === 'pause' && /^\s+$/.test(plan.text.slice(plan.events[nextIndex].from, plan.events[nextIndex].to))) nextIndex++;
      var next = plan.events[nextIndex];
      // Carry a short release into the next vowel, but never across punctuation.
      var extra = flowing && next && next.kind === 'syllable' && next.start - event.start - event.duration < 0.06 ? next.start - event.start - event.duration + Math.min(0.035, next.duration * 0.35) : 0;
      // B treats every vowel as a short vocal gesture, never a spelling-length hold.
      // Event/reveal timing is unchanged; the unused time becomes a micropause.
      var soundDuration = popping ? Math.min(event.duration * 0.72, 0.075) : event.duration + extra;
      var group = popping && plan.text.slice(event.sourceFrom, event.sourceTo).toLowerCase().match(/[aeiou][aeiouyw]?/);
      var mapped = group && vowelGroups[group[0]];
      var formants = vowels[mapped ? mapped[0] : event.vowel], targetFormants = vowels[mapped ? mapped[1] : event.vowelEnd] || formants, count = Math.floor(soundDuration * sampleRate), start = Math.floor(event.start * sampleRate);
      for (var i = 0; i < count; i++) {
        var t = i / sampleRate, p = Math.min(1, t / event.duration);
        var curve = event.pitchCurve || [event.pitch, event.pitch, event.pitch];
        var segment = p < 0.5 ? 0 : 1, blend = p < 0.5 ? p * 2 : (p - 0.5) * 2;
        var movingPitch = curve[segment] * Math.pow(curve[segment + 1] / curve[segment], blend);
        var frequency = movingPitch * (1 + 0.025 * Math.sin(t * 32) + v.roughness * 0.035 * Math.sin(t * 173));
        // Move the vocal tract through the syllable instead of holding a static tone.
        var glide = Math.min(1, Math.max(0, (p - 0.15) / 0.7));
        // Flowing speech uses small mouth-shape changes, not a full wah sweep.
        if (flowing) glide *= 0.25;
        if (popping) glide = Math.min(1, t / soundDuration);
        phase += 2 * Math.PI * frequency / sampleRate; var value = 0;
        for (var h = 1; h <= 24; h++) {
          var hz = frequency * h, weight = 0.06 / h;
          for (var f = 0; f < 3; f++) weight += Math.exp(-Math.pow((hz - (formants[f] * (1 - glide) + targetFormants[f] * glide) * v.resonance * (flowing ? 1 : 1.04 - 0.08 * p)) / (100 + f * 65), 2)) * (0.7 / (f + 1));
          value += Math.sin(phase * h) * weight;
        }
        var noise = rng() * 2 - 1, envelope = Math.min(1, t / 0.018) * Math.min(1, (event.duration - t) / 0.04);
        if (flowing) {
          var attackTime = Math.min(0.008, soundDuration * 0.1), releaseTime = Math.min(0.035, soundDuration * 0.3);
          envelope = Math.min(1, t / attackTime) * Math.min(1, (soundDuration - t) / releaseTime);
        }
        if (popping) {
          var position = t / soundDuration;
          envelope = Math.sin(Math.PI * Math.pow(position, 0.65));
        }
        var consonant = !flowing && event.attack ? Math.exp(-t * 85) * noise * 0.45 * v.enunciation : 0;
        var closure = flowing ? 1 : event.closed ? 1 - 0.8 * Math.pow(p, 2) : 1 - 0.3 * p;
        var release = !flowing && event.closed ? noise * 0.055 * Math.exp(-Math.pow((p - 0.83) / 0.07, 2)) : 0;
        value = (value * (flowing ? 1 : 0.55 + 0.45 * Math.sin(p * Math.PI)) * closure + noise * v.breath * 0.12 + consonant + release) * envelope;
        pcm[start + i] += Math.tanh(value * (1 + v.roughness)) * (flowing ? 0.38 : 0.48) * v.volume;
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
