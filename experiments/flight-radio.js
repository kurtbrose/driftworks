(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').Line} Line */
    /** @typedef {import('./types').Combat} Combat */
    /** @typedef {import('./types').FlightState} FlightState */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    /** @param {HTMLElement} panel @param {HTMLElement} toggle */
    function mount(panel, toggle) {
        var create = DW.flightComms.create, step = DW.flightComms.step, voiceOptions = DW.flightDialogue.voiceOptions;
        var history = panel.ownerDocument && panel.ownerDocument.getElementById('comms-history');
        var clock = create(), context = /** @type {AudioContext | null} */ (null), source = /** @type {AudioBufferSourceNode | null} */ (null), generation = 0, muted = false, remaining = 0, channelRemaining = 0, currentSpeaker = /** @type {string | null} */ (null);
        var speakerElement = panel.querySelector('[data-speaker]'), subtitleElement = panel.querySelector('[data-subtitle]');
        if (!speakerElement || !subtitleElement)
            throw new Error('Comms requires speaker and subtitle elements');
        const speaker = speakerElement, subtitle = subtitleElement;
        function stop() {
            generation++;
            channelRemaining = 0;
            currentSpeaker = /** @type {string | null} */ (null);
            if (source) {
                source.onended = null;
                source.stop();
                source.disconnect();
                source = null;
            }
            panel.classList.remove('transmitting');
        }
        function unlock() {
            var Audio = window.AudioContext || window.webkitAudioContext;
            if (!Audio)
                return;
            try {
                context = context || new Audio();
                context.resume().catch(function () {
                });
            }
            catch (_) { /* Subtitles remain available. */
            }
        }
        /** @param {Line} line */
        function speak(line) {
            currentSpeaker = line.craftId && line.craftId !== 'control' ? line.craftId : null;
            var emotionField = panel.ownerDocument && panel.querySelector('[data-emotion]');
            speaker.textContent = emotionField ? line.speaker.split(' / ')[0] : line.speaker;
            subtitle.textContent = line.text;
            if (emotionField)
                emotionField.textContent = line.emotion && line.emotion.current !== 'calm' ? line.emotion.current : line.speaker.split(' / ')[1] || 'CHANNEL';
            if (history) {
                var item = history.ownerDocument.createElement('li');
                item.textContent = line.speaker + ': ' + line.text;
                history.prepend(item);
                while (history.children.length > 12)
                    history.lastElementChild?.remove();
            }
            panel.classList.remove('idle');
            panel.classList.toggle('hostile', line.hostile);
            panel.classList.add('transmitting');
            remaining = 9;
            try {
                var api = DW.mumble, rate = 22050;
                var plan = api.analyze(line.text, Object.assign(voiceOptions(line.voiceSettings || api.presets[line.voice], line.emotion), { seed: line.seed, volume: 0.42 }));
                channelRemaining = plan.duration + 0.5;
                if (muted || !context || context.state !== 'running')
                    return;
                var transmission = api.transmit(api.render(plan, rate), rate, { mode: 'radio', effects: 0.45, seed: line.radioSeed });
                var buffer = context.createBuffer(1, transmission.samples.length, rate);
                buffer.copyToChannel(new Float32Array(transmission.samples), 0);
                source = context.createBufferSource();
                source.buffer = buffer;
                source.connect(context.destination);
                var ticket = generation, playing = source;
                source.onended = function () {
                    playing.disconnect();
                    if (ticket === generation) {
                        source = null;
                        channelRemaining = 0;
                        currentSpeaker = /** @type {string | null} */ (null);
                        panel.classList.remove('transmitting');
                    }
                };
                source.start();
                channelRemaining = transmission.duration;
                remaining = Math.max(9, transmission.duration + 2);
            }
            catch (_) {
                stop();
            }
        }
        toggle.onclick = function () {
            muted = !muted;
            toggle.textContent = muted ? 'Voice off' : 'Voice on';
            toggle.setAttribute('aria-pressed', String(muted));
            if (muted)
                stop();
        };
        window.addEventListener('pagehide', function () {
            stop();
            if (context)
                context.close();
        });
        return {
            speakerId: function () {
                return currentSpeaker;
            },
            unlock: unlock,
            pause: stop,
            reset: function () {
                stop();
                clock = create();
                remaining = 0;
                speaker.textContent = 'RANGE COMMS';
                var emotionField = panel.ownerDocument && panel.querySelector('[data-emotion]');
                if (emotionField)
                    emotionField.textContent = '';
                subtitle.textContent = 'Standing by for flight.';
                panel.classList.remove('hostile');
                panel.classList.remove('idle');
            },
            update: /** @param {number} dt @param {Combat} combat @param {FlightState} player */ function (dt, combat, player) {
                remaining = Math.max(0, remaining - dt);
                channelRemaining = Math.max(0, channelRemaining - dt);
                if (!source && channelRemaining <= 0)
                    currentSpeaker = /** @type {string | null} */ (null);
                if (!remaining) {
                    panel.classList.remove('transmitting');
                    subtitle.textContent = 'Channel clear.';
                    panel.classList.add('idle');
                }
                var line = step(clock, dt, combat, !!source || channelRemaining > 0, Math.random, player);
                if (line)
                    speak(line);
            }
        };
    }
    DW.flightRadio = { mount: mount };
}());
