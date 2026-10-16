(function () {
  'use strict';
  var api = window.Driftworks.mumble, byId = function (id) { return document.getElementById(id); }, context, source, frame, generation = 0;
  var fields = [['pitch', 'Pitch', 60, 360, 1], ['resonance', 'Vocal size / resonance', 0.5, 1.6, 0.01], ['speed', 'Speaking rate', 0.5, 2, 0.01], ['enunciation', 'Sound retention (low = skip syllables)', 0, 1, 0.01], ['variation', 'Pitch expression', 0, 1, 0.01], ['roughness', 'Rasp', 0, 1, 0.01], ['breath', 'Breathiness', 0, 1, 0.01], ['radio', 'Radio color', 0, 1, 0.01], ['volume', 'Volume', 0, 1, 0.01]];
  fields.forEach(function (field) {
    var row = document.createElement('div'); row.className = 'control';
    var label = document.createElement('label'); label.htmlFor = field[0]; label.textContent = field[1];
    var output = document.createElement('output'); output.id = field[0] + '-value'; label.appendChild(output);
    var input = document.createElement('input'); input.type = 'range'; input.id = field[0]; input.min = field[2]; input.max = field[3]; input.step = field[4]; input.value = api.defaults[field[0]];
    input.oninput = function () { output.value = input.value; }; input.oninput(); row.append(label, input); byId('controls').appendChild(row);
  });
  Object.keys(api.presets).forEach(function (name) { var option = document.createElement('option'); option.textContent = name; byId('preset').appendChild(option); });
  byId('preset').onchange = function () {
    var settings = Object.assign({}, api.defaults, api.presets[byId('preset').value]);
    fields.forEach(function (field) { byId(field[0]).value = settings[field[0]]; byId(field[0]).oninput(); }); byId('speaker').textContent = byId('preset').value;
  };
  byId('preset').value = 'Navigator'; byId('preset').onchange();
  function stop() { generation++; if (source) { source.onended = null; source.stop(); source.disconnect(); source = null; } cancelAnimationFrame(frame); byId('mouth').textContent = '━'; byId('status').textContent = 'READY'; }
  byId('stop').onclick = stop;
  byId('sample').onclick = function () { stop(); byId('text').value = 'Keep your cool. Meet the crew by the moon. Wait outside, scout!'; byId('text').focus(); };
  byId('play').onclick = async function () {
    stop(); var ticket = generation, text = byId('text').value;
    if (!text.trim()) { byId('status').textContent = 'TYPE A LINE'; return; }
    try {
      var Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Web Audio is unavailable in this browser.');
      context = context || new Audio(); await context.resume(); if (ticket !== generation) return;
      var settings = { seed: Number(byId('seed').value), emotion: byId('emotion').value };
      fields.forEach(function (field) { settings[field[0]] = Number(byId(field[0]).value); });
      var plan = api.analyze(text, settings), samples = api.render(plan, 22050), buffer = context.createBuffer(1, samples.length, 22050); buffer.copyToChannel(samples, 0);
      var canvas = byId('wave'), painter = canvas.getContext('2d'); canvas.width = Math.max(300, canvas.clientWidth * devicePixelRatio); painter.clearRect(0, 0, canvas.width, canvas.height); painter.strokeStyle = '#c2ed9b'; painter.beginPath();
      for (var x = 0; x < canvas.width; x++) { var peak = 0, lo = Math.floor(x * samples.length / canvas.width), hi = Math.floor((x + 1) * samples.length / canvas.width); for (var s = lo; s < hi; s++) peak = Math.max(peak, Math.abs(samples[s])); painter.moveTo(x, 45 - peak * 80); painter.lineTo(x, 45 + peak * 80 + 1); } painter.stroke();
      source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination);
      var start = context.currentTime + 0.03; source.start(start); byId('status').textContent = 'TRANSMITTING'; byId('subtitle').textContent = '';
      byId('stats').textContent = plan.events.filter(function (e) { return e.kind === 'syllable'; }).length + ' syllables · ' + plan.duration.toFixed(2) + ' seconds · seed ' + settings.seed;
      source.onended = function () { source.disconnect(); source = null; cancelAnimationFrame(frame); byId('subtitle').textContent = plan.text; byId('mouth').textContent = '━'; byId('status').textContent = 'COMPLETE'; };
      function animate() {
        var elapsed = context.currentTime - start, revealed = 0, active = null;
        plan.events.forEach(function (e) { if (e.start <= elapsed) { revealed = e.to; if (elapsed < e.start + e.duration) active = e; } });
        byId('subtitle').textContent = plan.text.slice(0, revealed); byId('mouth').textContent = active && active.kind === 'syllable' ? (Math.sin(elapsed * 35) > 0 ? '●' : '▪') : '━'; frame = requestAnimationFrame(animate);
      }
      animate();
    } catch (error) { stop(); byId('status').textContent = 'AUDIO ERROR'; byId('stats').textContent = error.message; }
  };
  byId('text').addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); byId('play').click(); } });
  window.addEventListener('pagehide', stop);
}());
