(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').VoiceNumberKey} VoiceNumberKey */
    /** @typedef {import('./types').Voice} Voice */
    /** @typedef {import('./types').Cue} Cue */
    /** @typedef {import('./types').Syllable} Syllable */
    var api = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).mumble, byId = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).experimentDom(document), context = /** @type {AudioContext | null} */ (null), source = /** @type {AudioBufferSourceNode | null} */ (null), frame = 0, generation = 0, radioTake = 0;
    /** @type {[Exclude<VoiceNumberKey, 'pauseScale'>, string, number, number, number][]} */
    var fields = [['pitch', 'Pitch', 60, 360, 1], ['resonance', 'Vocal size / resonance', 0.5, 1.6, 0.01], ['formant1', 'F1 / vowel openness', 0.7, 1.3, 0.01], ['formant2', 'F2 / vowel color', 0.7, 1.3, 0.01], ['formant3', 'F3 / upper resonance', 0.7, 1.3, 0.01], ['brightness', 'Brightness (dark to buzzy)', 0, 1, 0.01], ['nasality', 'Nasality', 0, 1, 0.01], ['creak', 'Vocal creak', 0, 1, 0.01], ['clipping', 'Clipped vowel bursts', 0, 1, 0.01], ['contour', 'Phrase contour strength', 0, 1, 0.01], ['speed', 'Speaking rate', 0.5, 2, 0.01], ['enunciation', 'Sound retention (low = skip syllables)', 0, 1, 0.01], ['variation', 'Pitch expression', 0, 1, 0.01], ['roughness', 'Rasp', 0, 1, 0.01], ['tremor', 'Slow voice tremor', 0, 1, 0.01], ['breath', 'Breathiness', 0, 1, 0.01], ['volume', 'Volume', 0, 1, 0.01]];
    fields.forEach(function (field) {
        var row = document.createElement('div');
        row.className = 'control';
        var label = document.createElement('label');
        label.htmlFor = field[0];
        label.textContent = field[1];
        var output = document.createElement('output');
        output.id = field[0] + '-value';
        label.appendChild(output);
        var input = document.createElement('input');
        input.type = 'range';
        input.id = field[0];
        input.min = String(field[2]);
        input.max = String(field[3]);
        input.step = String(field[4]);
        input.value = String(api.defaults[field[0]]);
        input.oninput = function () {
            output.value = input.value;
        };
        output.value = input.value;
        row.append(label, input);
        byId('controls').appendChild(row);
    });
    byId('radio-effects').oninput = function () {
        byId('radio-effects-value').value = byId('radio-effects').value;
    };
    Object.keys(api.presets).forEach(function (name) {
        var option = document.createElement('option');
        option.textContent = name;
        byId('preset').appendChild(option);
    });
    byId('preset').onchange = function () {
        var settings = Object.assign({}, api.defaults, api.presets[byId('preset').value]);
        fields.forEach(function (field) {
            byId(field[0]).value = String(settings[field[0]]);
            byId(field[0]).dispatchEvent(new Event('input'));
        });
        byId('speaker').textContent = byId('preset').value;
    };
    byId('preset').value = 'Navigator';
    byId('preset').dispatchEvent(new Event('change'));
    function stop() {
        generation++;
        if (source) {
            source.onended = null;
            source.stop();
            source.disconnect();
            source = null;
        }
        cancelAnimationFrame(frame);
        byId('mouth').textContent = '━';
        byId('status').textContent = 'READY';
    }
    byId('stop').onclick = stop;
    byId('sample').onclick = function () {
        stop();
        byId('text').value = 'Keep your cool. Meet the crew by the moon. Wait outside, scout!';
        byId('text').focus();
    };
    byId('test-radio').onclick = async function () {
        stop();
        var ticket = generation;
        try {
            var Audio = window.AudioContext || window.webkitAudioContext;
            context = context || new Audio();
            await context.resume();
            if (ticket !== generation)
                return;
            var result = api.transmit(new Float32Array(22050 * 6), 22050, { mode: 'radio', volume: Number(byId('volume').value), effects: Number(byId('radio-effects').value), seed: Number(byId('seed').value) + (++radioTake) * 7919 });
            var buffer = context.createBuffer(1, result.samples.length, 22050);
            buffer.copyToChannel(new Float32Array(result.samples), 0);
            source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(context.destination);
            byId('status').textContent = 'RADIO TEST';
            byId('stats').textContent = '6-second radio channel · occasional irregular static (some takes stay clean) · closing squelch';
            var playing = source;
            source.onended = function () {
                playing.disconnect();
                source = null;
                byId('status').textContent = 'COMPLETE';
            };
            source.start();
        }
        catch (error) {
            stop();
            byId('stats').textContent = String(error);
        }
    };
    byId('play').onclick = async function () {
        stop();
        var ticket = generation, text = byId('text').value;
        if (!text.trim()) {
            byId('status').textContent = 'TYPE A LINE';
            return;
        }
        try {
            var Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio)
                throw new Error('Web Audio is unavailable in this browser.');
            context = context || new Audio();
            await context.resume();
            if (ticket !== generation)
                return;
            /** @type {Partial<Voice> & {seed: number}} */
            var settings = { seed: Number(byId('seed').value), emotion: byId('emotion').value };
            fields.forEach(function (field) {
                settings[field[0]] = Number(byId(field[0]).value);
            });
            var plan = api.analyze(text, settings);
            var lastVoice = plan.events.filter(function (e) {
                return e.kind === 'syllable';
            }).pop();
            var speechDuration = lastVoice ? lastVoice.start + Math.min(lastVoice.duration * 0.72, 0.075) : plan.duration;
            var transmission = api.transmit(api.render(plan, 22050), 22050, { mode: byId('channel').value, speechDuration: speechDuration, volume: settings.volume, seed: settings.seed + (++radioTake) * 7919, effects: Number(byId('radio-effects').value) });
            var samples = transmission.samples, buffer = context.createBuffer(1, samples.length, 22050);
            buffer.copyToChannel(new Float32Array(samples), 0);
            var canvas = byId('wave'), painter = canvas.getContext('2d');
            if (!painter)
                throw new Error('Waveform requires a 2D canvas');
            canvas.width = Math.max(300, canvas.clientWidth * devicePixelRatio);
            painter.clearRect(0, 0, canvas.width, canvas.height);
            painter.strokeStyle = '#c2ed9b';
            painter.beginPath();
            for (var x = 0; x < canvas.width; x++) {
                var peak = 0, lo = Math.floor(x * samples.length / canvas.width), hi = Math.floor((x + 1) * samples.length / canvas.width);
                for (var s = lo; s < hi; s++)
                    peak = Math.max(peak, Math.abs(samples[s]));
                painter.moveTo(x, 45 - peak * 80);
                painter.lineTo(x, 45 + peak * 80 + 1);
            }
            painter.stroke();
            source = context.createBufferSource();
            source.buffer = buffer;
            source.connect(context.destination);
            const audioContext = context;
            var start = context.currentTime + 0.03;
            source.start(start);
            byId('status').textContent = 'TRANSMITTING';
            byId('subtitle').textContent = '';
            byId('stats').textContent = plan.events.filter(function (e) {
                return e.kind === 'syllable';
            }).length + ' syllables · ' + transmission.duration.toFixed(2) + ' seconds · seed ' + settings.seed + ' · ' + byId('channel').value;
            var playing = source;
            source.onended = function () {
                playing.disconnect();
                source = null;
                cancelAnimationFrame(frame);
                byId('subtitle').textContent = plan.text;
                byId('mouth').textContent = '━';
                byId('status').textContent = 'COMPLETE';
            };
            function animate() {
                var elapsed = audioContext.currentTime - start - transmission.speechOffset, revealed = 0, active = /** @type {Cue | Syllable | null} */ (null);
                for (var e of plan.events) {
                    if (e.start <= elapsed) {
                        revealed = e.to;
                        if (elapsed < e.start + e.duration)
                            active = e;
                    }
                }
                byId('subtitle').textContent = plan.text.slice(0, revealed);
                byId('mouth').textContent = active && active.kind === 'syllable' ? (Math.sin(elapsed * 35) > 0 ? '●' : '▪') : '━';
                frame = requestAnimationFrame(animate);
            }
            animate();
        }
        catch (error) {
            stop();
            byId('status').textContent = 'AUDIO ERROR';
            byId('stats').textContent = String(error);
        }
    };
    byId('text').addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            byId('play').click();
        }
    });
    window.addEventListener('pagehide', stop);
}());
