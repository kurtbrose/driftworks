(function () {
  'use strict';
  var defaults = { pitch: 150, resonance: 1, formant1: 1, formant2: 1, formant3: 1, brightness: 0.5, nasality: 0, creak: 0, clipping: 0, contour: 0.5, roughness: 0.18, tremor: 0, breath: 0.12, speed: 1, pauseScale: 1, compactWords: true, enunciation: 0.35, variation: 0.35, volume: 0.65, seed: 7, emotion: 'neutral' };
  var presets = {
    'Study · dark smooth': { pitch: 150, formant1: 0.9, formant2: 0.85, formant3: 0.9, brightness: 0.08, breath: 0.4, roughness: 0, variation: 0.15, contour: 0.15 },
    'Study · nasal clipped': { pitch: 150, formant1: 1.1, formant2: 1.15, formant3: 1.1, brightness: 0.9, nasality: 0.85, clipping: 0.2, breath: 0.04, roughness: 0.05, contour: 0.9 },
    'Study · raspy creak': { pitch: 150, formant1: 1.15, formant2: 0.9, formant3: 1.05, brightness: 0.75, creak: 0.85, roughness: 0.7, breath: 0.08, contour: 0.35 },
    Scout: { pitch: 210, resonance: 1.2, roughness: 0.08, breath: 0.1, speed: 1.2 },
    Veteran: { pitch: 95, resonance: 0.8, roughness: 0.45, breath: 0.22, speed: 0.85 },
    Navigator: { pitch: 155, resonance: 1, roughness: 0.1, breath: 0.2, speed: 1 },
    'Woman · warm': { pitch: 185, resonance: 1.16, roughness: 0.07, breath: 0.22, speed: 1.05 },
    'Woman · bright': { pitch: 235, resonance: 1.32, roughness: 0.04, breath: 0.12, speed: 1.12 },
    'Man · baritone': { pitch: 105, resonance: 0.88, roughness: 0.16, breath: 0.12, speed: 0.96 },
    Child: { pitch: 305, resonance: 1.48, roughness: 0.03, breath: 0.16, speed: 1.22, variation: 0.5 },
    'Old woman': { pitch: 175, resonance: 1.12, roughness: 0.25, breath: 0.32, speed: 0.92, tremor: 0.75 },
    'Old man': { pitch: 125, resonance: 0.94, roughness: 0.34, breath: 0.28, speed: 0.88, tremor: 0.65 },
    Pirate: { pitch: 115, resonance: 0.72, roughness: 0.65, breath: 0.16, speed: 0.98, enunciation: 0.2 },
    'Ship computer': { pitch: 175, resonance: 1.05, roughness: 0, breath: 0, speed: 1.08, variation: 0 },
    Alien: { pitch: 260, resonance: 0.65, roughness: 0.25, breath: 0.06, speed: 1.1 }
  };
  function voice(options) {
    var v = Object.assign({}, defaults, options);
    ['formant1', 'formant2', 'formant3', 'brightness', 'nasality', 'creak', 'clipping', 'contour', 'pitch', 'resonance', 'roughness', 'tremor', 'breath', 'speed', 'variation', 'volume', 'pauseScale', 'enunciation', 'seed'].forEach(function (key) { if (!Number.isFinite(v[key])) v[key] = defaults[key]; });
    v.pitch = Math.max(60, Math.min(360, v.pitch)); v.speed = Math.max(0.5, Math.min(2, v.speed)); v.resonance = Math.max(0.5, Math.min(1.6, v.resonance));
    ['brightness', 'nasality', 'creak', 'clipping', 'contour', 'roughness', 'tremor', 'breath', 'variation', 'volume', 'pauseScale', 'enunciation'].forEach(function (key) { v[key] = Math.max(0, Math.min(1, v[key])); });
    ['formant1', 'formant2', 'formant3'].forEach(function (key) { v[key] = Math.max(0.7, Math.min(1.3, v[key])); });
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
      var bounce = v.variation * (0.157 + v.contour * 0.2);
      function contour(time) {
        var x = Math.max(0, Math.min(1, (time - first.start) / span));
        var ending = mark === '?' ? 0.22 * x * x : mark === '!' ? 0.025 * x : -0.035 * x;
        return base * Math.pow(2, (bounce * Math.sin(2 * Math.PI * 1.25 * x - 0.6) + ending * v.contour * 2) / 1);
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
    sampleRate = sampleRate || 22050; var pcm = new Float32Array(Math.ceil(plan.duration * sampleRate)), v = voice(plan.voice), rng = random(hash(plan.text, v.seed)), phase = 0;
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
      soundDuration *= 1 - v.clipping * 0.55;
      var group = popping && plan.text.slice(event.sourceFrom, event.sourceTo).toLowerCase().match(/[aeiou][aeiouyw]?/);
      var mapped = group && vowelGroups[group[0]];
      var formants = vowels[mapped ? mapped[0] : event.vowel], targetFormants = vowels[mapped ? mapped[1] : event.vowelEnd] || formants, count = Math.floor(soundDuration * sampleRate), start = Math.floor(event.start * sampleRate);
      for (var i = 0; i < count; i++) {
        var t = i / sampleRate, p = Math.min(1, t / event.duration);
        var curve = event.pitchCurve || [event.pitch, event.pitch, event.pitch];
        var segment = p < 0.5 ? 0 : 1, blend = p < 0.5 ? p * 2 : (p - 0.5) * 2;
        var movingPitch = curve[segment] * Math.pow(curve[segment + 1] / curve[segment], blend);
        var frequency = movingPitch * (1 + 0.025 * Math.sin(t * 32) + v.roughness * 0.035 * Math.sin(t * 173) + (v.tremor || 0) * 0.045 * Math.sin(2 * Math.PI * 2 * (event.start + t)));
        // Move the vocal tract through the syllable instead of holding a static tone.
        var glide = Math.min(1, Math.max(0, (p - 0.15) / 0.7));
        // Flowing speech uses small mouth-shape changes, not a full wah sweep.
        if (flowing) glide *= 0.25;
        if (popping) glide = Math.min(1, t / soundDuration);
        phase += 2 * Math.PI * frequency / sampleRate; var value = 0;
        for (var h = 1; h <= 24; h++) {
          var hz = frequency * h;
          if (hz >= sampleRate * 0.5) break;
          var weight = 0.06 / h;
          for (var f = 0; f < 3; f++) weight += Math.exp(-Math.pow((hz - (formants[f] * (1 - glide) + targetFormants[f] * glide) * v.resonance * v['formant' + (f + 1)] * (flowing ? 1 : 1.04 - 0.08 * p)) / (100 + f * 65), 2)) * (0.7 / (f + 1));
          // Nasal pole plus a broad antiresonance color the same harmonic source.
          weight = weight * (1 - v.nasality * 0.7 * Math.exp(-Math.pow((hz - 1100) / 350, 2))) + v.nasality * 0.65 * Math.exp(-Math.pow((hz - 300) / 100, 2));
          weight *= Math.pow(h, (v.brightness - 0.5) * 1.6);
          value += Math.sin(phase * h) * weight;
        }
        // Alternate glottal pulses and flutter add creak without changing the pitch control.
        value *= 1 - v.creak * (0.35 + 0.3 * Math.sin(phase * 0.5) + 0.2 * Math.sin(phase * 0.23));
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
    // Match utterance RMS after timbre/envelopes, preserving the volume control.
    // One fixed gain preserves the performance dynamics without pumping between vowels.
    var energy = 0, peak = 0;
    for (var j = 0; j < pcm.length; j++) { energy += pcm[j] * pcm[j]; peak = Math.max(peak, Math.abs(pcm[j])); }
    if (energy > 0) {
      var gain = Math.min(0.12 * v.volume / Math.sqrt(energy / pcm.length), 0.95 * v.volume / peak);
      for (var k = 0; k < pcm.length; k++) pcm[k] *= gain;
    }
    return pcm;
  }
  // Contextual transmission is separate from character identity and speech timing.
  function transmit(samples, sampleRate, options) {
    options = options || {};
    if (options.mode !== 'radio' || !samples.length) return { samples: samples, speechOffset: 0, duration: samples.length / sampleRate };
    if (Number.isFinite(options.speechDuration)) samples = samples.subarray(0, Math.max(0, Math.min(samples.length, Math.ceil(options.speechDuration * sampleRate))));
    var lead = Math.round(0.16 * sampleRate), tail = Math.round(0.24 * sampleRate);
    var output = new Float32Array(lead + samples.length + tail);
    var volume = Number.isFinite(options.volume) ? Math.max(0, Math.min(1, options.volume)) : defaults.volume;
    var effects = Number.isFinite(options.effects) ? Math.max(0, Math.min(1, options.effects)) : 0.65;
    var noise = random((options.seed || 0) ^ 0x52414449), low = 0, band = 0, hissLow = 0, noiseBand = 0;
    var character = random((options.seed || 0) ^ 0x53515545);
    function latch() {
      var gate={delay:character()*0.025,duration:0.014+character()*0.05,frequency:1200+character()*1400,steps:[]},time=0;
      while(time<gate.duration) { time+=0.001+character()*0.009; gate.steps.push({until:time,gain:character()<0.35?0.03:0.2+character()*0.65}); }
      return gate;
    }
    var openLatch=latch(), closeLatch=latch();
    // Most transmissions are clean; eligible ones still wait an exponential random gap.
    var burstRate = options.staticBursts === false || character() < 0.6 ? 0 : 0.45;
    function waitBurst() { return -Math.log(Math.max(0.000001,1-character())) / 0.45; }
    var nextBurst = lead/sampleRate + waitBurst(), burstEnd = 0, burstStart = 0, burstGain = 0;
    for (var i = 0; i < output.length; i++) {
      var now = i/sampleRate;
      if (burstRate && now >= nextBurst && i < lead+samples.length) {
        burstStart=now; burstEnd=now+0.025+character()*0.095; burstGain=0.25+character()*0.4;
        nextBurst=burstEnd+waitBurst();
      }
      var burst = burstRate && now < burstEnd ? burstGain*Math.min(1,(now-burstStart)/0.002,(burstEnd-now)/0.004) : 0;
      var speech = i >= lead && i < lead + samples.length ? samples[i - lead] : 0;
      low += 0.08 * (speech - low); band += 0.55 * (speech - low - band);
      var raw = noise() * 2 - 1; hissLow += 0.2 * (raw - hissLow);
      noiseBand += 0.35 * (raw - hissLow - noiseBand);
      var hiss = noiseBand * 2, squelch = 0, chirp = 0;
      var opening = i < lead, closing = i >= lead + samples.length;
      var edgeTime = opening ? i / sampleRate : (i - lead - samples.length) / sampleRate;
      // Electrical gate, not a vocal envelope: steady carrier, sharply keyed
      // crackle bursts, and a brief mechanical contact click at each latch.
      var gate = opening ? openLatch : closeLatch;
      var latchTime = (opening ? edgeTime : edgeTime - 0.12) - gate.delay;
      if ((opening || closing) && latchTime >= 0 && latchTime < gate.duration) {
        for (var g=0;g<gate.steps.length;g++) { if(latchTime<gate.steps[g].until) { squelch=gate.steps[g].gain;break; } }
        chirp = Math.exp(-latchTime * 650) * Math.cos(2 * Math.PI * gate.frequency * latchTime) * 0.24;
      }
      var carrier = opening || closing ? 0.16 : 0.075;
      // Only a 1–3 ms edge ramp prevents digital discontinuities; no soft swell.
      var fade = Math.min(1, i / (0.001 * sampleRate), (output.length - 1 - i) / (0.003 * sampleRate));
      output[i] = (Math.tanh(band * 2.2) * 0.65 + volume * effects * (hiss * (carrier + squelch + burst) + chirp)) * fade;
    }
    return { samples: output, speechOffset: lead / sampleRate, duration: output.length / sampleRate };
  }
  window.Driftworks = window.Driftworks || {};
  window.Driftworks.mumble = { defaults: defaults, presets: presets, analyze: analyze, render: render, transmit: transmit };
}());
