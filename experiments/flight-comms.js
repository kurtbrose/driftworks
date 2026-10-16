(function () {
  'use strict';
  var DW = window.Driftworks;
  var lines = {
    range: ['Range is clear. Enjoy the view, pilot.', 'Keep your turns smooth. We are watching from control.', 'All systems look good from here.'],
    ally: ['On your wing. Keep them busy!', 'Nice flying. Leave a few for the rest of us.', 'Stay loose, pilot. We have your back.'],
    enemy: ['That all you have, pilot?', 'Come closer. My guns are getting lonely.', 'You fly like a cargo hauler!'],
    danger: ['Shields are thin. Break away and regroup!', 'Watch your hull, pilot. Keep moving.']
  };
  var calls = {
    firing: ['Taking the shot!', 'Guns on target!', 'Stay on him!'],
    target: ['Switching targets.', 'Picking up another fighter.', 'New target. Moving in.'],
    attack: ["I've got him!", 'Moving in. Keep him busy!', 'I have a shot. Going in!'],
    evade: ['Taking fire! Cover me!', 'Get this fighter off me!', 'Under pressure. Need a hand!'],
    break: ['Breaking off!', 'Too close. Pulling away!', 'Cover me. Breaking clear!'],
    recover: ['Coming around for another pass.', 'Regrouping. Keep them occupied!', 'Getting back in the fight.'],
    reposition: ['Moving into position. Cover me.', 'Swinging wide. Hold them here!', 'Setting up another run.']
  };
  function create() { return { wait: 4, serial: 0, last: '', danger: false, quiet: 2, time: 0, modes: {}, activity: {}, spoken: {}, quietGap: 2, lastCraft: null }; }
  function onTail(craft, living) {
    return craft.pose && living.some(function (other) {
      if (other.team === craft.team || other.mode !== 'attack' || other.targetId !== craft.id || !other.pose) return false;
      var delta = other.pose.eye.map(function (v, i) { return v - craft.pose.eye[i]; });
      var distance = Math.hypot.apply(null, delta);
      return distance > 0 && delta.reduce(function (sum, v, i) { return sum + v * craft.pose.back[i]; }, 0) / distance > 0.5;
    });
  }
  // Active flight seconds only. No queue: a busy channel drops opportunities.
  function step(state, dt, combat, busy, random) {
    dt = Math.max(0, dt); state.time += dt;
    state.wait = Math.max(0, state.wait - dt);
    state.quiet = busy ? 0 : state.quiet + dt;
    random = random || Math.random;
    var living = combat.enabled ? combat.enemies.filter(function (e) { return e.hp > 0; }) : [];
    var modes = {}, activity = {}, candidates = [];
    living.forEach(function (craft) {
      modes[craft.id] = craft.mode;
      var previous = state.activity[craft.id], event = null;
      activity[craft.id] = { fire: !!craft.fire, targetId: craft.targetId };
      if (state.modes[craft.id] && state.modes[craft.id] !== craft.mode && calls[craft.mode]) event = craft.mode;
      else if (previous && craft.mode === 'attack') {
        if (craft.fire && !previous.fire) event = 'firing';
        else if (craft.targetId && previous.targetId !== craft.targetId) event = 'target';
      }
      if (event && state.time - (state.spoken[craft.id] === undefined ? -Infinity : state.spoken[craft.id]) >= 10) candidates.push({craft: craft, event: event});
    });
    state.activity = activity;
    state.modes = modes;
    Object.keys(state.spoken).forEach(function (id) { if (!(id in modes)) delete state.spoken[id]; });
    if (busy || combat.dead || state.quiet < state.quietGap) return null;
    var kind, choices, craft;
    // Distress calls take priority; shuffle peers so array order does not pick the speaker.
    if (candidates.length) {
      var urgent = candidates.filter(function (e) { return e.event === 'evade' || e.event === 'break'; });
      var pool = urgent.length ? urgent : candidates;
      var otherSpeakers = pool.filter(function (e) { return e.craft.id !== state.lastCraft; });
      if (otherSpeakers.length) pool = otherSpeakers;
      var selected = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
      craft = selected.craft;
      kind = craft.team === 'ally' ? 'ally' : 'enemy';
      choices = selected.event === 'evade' && onTail(craft, living) ? ["He's on my tail! Cover me!"] : calls[selected.event];
      state.spoken[craft.id] = state.time;
    } else if (state.wait > 0) return null;
    var enemies = living.some(function (e) { return e.team !== 'ally'; });
    var allies = living.some(function (e) { return e.team === 'ally'; });
    var danger = combat.enabled && combat.hull < 40;
    kind = kind || (danger && !state.danger ? 'danger' : enemies && random() < 0.5 ? 'enemy' : allies ? 'ally' : 'range');
    state.danger = danger;
    choices = choices || lines[kind];
    var fresh = choices.filter(function (line) { return line !== state.last; });
    if (fresh.length) choices = fresh;
    var text = choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
    state.last = text; state.serial++; state.quiet = 0; state.quietGap = 0.9 + random() * 2.8; state.lastCraft = craft ? craft.id : null; state.wait = 18 + random() * 12;
    var line = { text: text, speaker: kind === 'enemy' ? 'BANDIT / OPEN CHANNEL' : kind === 'ally' ? 'WING / FLIGHT CHANNEL' : 'CONTROL / RANGE CHANNEL', voice: kind === 'enemy' ? 'Pirate' : kind === 'ally' ? 'Scout' : 'Navigator', hostile: kind === 'enemy', seed: state.serial + 37 };
    if (craft) { line.speaker = (craft.team === 'ally' ? 'WING ' : 'BANDIT ') + (Number.isFinite(craft.index) ? craft.index + 1 : craft.id) + ' / ' + craft.mode.toUpperCase(); line.craftId = craft.id; line.mode = craft.mode; line.event = selected.event; }
    return line;
  }
  function mount(panel, toggle) {
    var clock = create(), context, source, generation = 0, muted = false, remaining = 0, channelRemaining = 0;
    var speaker = panel.querySelector('[data-speaker]'), subtitle = panel.querySelector('[data-subtitle]');
    function stop() { generation++; channelRemaining = 0; if (source) { source.onended = null; source.stop(); source.disconnect(); source = null; } panel.classList.remove('transmitting'); }
    function unlock() {
      var Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      try { context = context || new Audio(); context.resume().catch(function () {}); } catch (_) { /* Subtitles remain available. */ }
    }
    function speak(line) {
      speaker.textContent = line.speaker; subtitle.textContent = line.text;
      panel.classList.toggle('hostile', line.hostile); panel.classList.add('transmitting'); remaining = 9;
      try {
        var api = DW.mumble, rate = 22050;
        var plan = api.analyze(line.text, Object.assign({}, api.presets[line.voice], { seed: line.seed, volume: 0.42 }));
        channelRemaining = plan.duration + 0.5;
        if (muted || !context || context.state !== 'running') return;
        var transmission = api.transmit(api.render(plan, rate), rate, { mode: 'radio', effects: 0.45, seed: line.seed });
        var buffer = context.createBuffer(1, transmission.samples.length, rate); buffer.copyToChannel(transmission.samples, 0);
        source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination);
        var ticket = generation, playing = source;
        source.onended = function () { playing.disconnect(); if (ticket === generation) { source = null; panel.classList.remove('transmitting'); } };
        source.start(); channelRemaining = transmission.duration; remaining = Math.max(9, transmission.duration + 2);
      } catch (_) { stop(); }
    }
    toggle.onclick = function () { muted = !muted; toggle.textContent = muted ? 'Voice off' : 'Voice on'; toggle.setAttribute('aria-pressed', String(muted)); if (muted) stop(); };
    window.addEventListener('pagehide', function () { stop(); if (context) context.close(); });
    return {
      unlock: unlock,
      pause: stop,
      reset: function () { stop(); clock = create(); remaining = 0; speaker.textContent = 'RANGE COMMS'; subtitle.textContent = 'Standing by for flight.'; panel.classList.remove('hostile'); },
      update: function (dt, combat) {
        remaining = Math.max(0, remaining - dt); channelRemaining = Math.max(0, channelRemaining - dt);
        if (!remaining) { panel.classList.remove('transmitting'); subtitle.textContent = 'Channel clear.'; }
        var line = step(clock, dt, combat, !!source || channelRemaining > 0, Math.random); if (line) speak(line);
      }
    };
  }
  DW.flightComms = { create: create, step: step, mount: mount };
}());
