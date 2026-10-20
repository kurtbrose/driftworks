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
        var closing = false, closingAt = 0, closingElapsed = 0;
        var history = panel.ownerDocument && panel.ownerDocument.getElementById('comms-history');
        var portrait = DW.flightPortraits ? DW.flightPortraits.mount(panel) : null, reassurance = false;
        var clock = create(), context = /** @type {AudioContext | null} */ (null), source = /** @type {AudioBufferSourceNode | null} */ (null), generation = 0, muted = false, showing = false, channelRemaining = 0, currentSpeaker = /** @type {string | null} */ (null);
        var speakerElement = panel.querySelector('[data-speaker]'), subtitleElement = panel.querySelector('[data-subtitle]');
        if (!speakerElement || !subtitleElement)
            throw new Error('Comms requires speaker and subtitle elements');
        const speaker = speakerElement, subtitle = subtitleElement;
        function stop() {
            closing = false;
            if (portrait) portrait.stop();
            reassurance = false;
            DW.audio.setCommsActive(false);
            generation++;
            channelRemaining = 0;
            clock.quiet = 0;
            currentSpeaker = /** @type {string | null} */ (null);
            if (source) {
                source.onended = null;
                source.stop();
                source.disconnect();
                source = null;
            }
            panel.classList.remove('transmitting');
            panel.classList.add('idle');
            subtitle.textContent = '';
            showing = false;
        }
        /** @type {GainNode | null} */ var output = null;
        function unlock() {
            try {
                var channel = DW.audio.commsChannel();
                if(channel) { context=channel.context;output=channel.output; }
            } catch (_) { /* Subtitles remain available. */ }
        }
        /** @param {Line} line */
        function speak(line) {
            closing = false;
            reassurance = line.event === 'emotionalReply';
            if (portrait) portrait.show(line);
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
            showing = true;
            try {
                var api = DW.mumble, rate = 22050;
                var plan = api.analyze(line.text, Object.assign(voiceOptions(line.voiceSettings || api.presets[line.voice], line.emotion), { seed: line.seed, volume: 0.42 }));
                channelRemaining = plan.duration + 1;
                if (muted || !context || !output || context.state !== 'running')
                    return;
                var pcm = api.render(plan, rate);
                var noise = api.radioNoise(pcm.length, rate, {effects: .45, edgeScale: 2.5, seed: line.radioSeed});
                var transmission = api.transmit(pcm, rate, {mode: 'radio', seed: line.radioSeed, noise: noise});
                var buffer = context.createBuffer(1, transmission.samples.length, rate);
                buffer.copyToChannel(new Float32Array(transmission.samples), 0);
                source = context.createBufferSource();
                source.buffer = buffer;
                source.connect(output);
                var ticket = ++generation, playing = source;
                source.onended = function () {
                    playing.disconnect();
                    if (ticket === generation && source === playing) {
                        source = null;
                        channelRemaining = 0; clock.quiet = 0;
                        currentSpeaker = null;
                        DW.audio.setCommsActive(false);
                        panel.classList.remove('transmitting');
                        closing = true; closingAt = context ? context.currentTime : 0; closingElapsed = 0;
                        if (portrait) portrait.finish();
                    }
                };
                var started = context.currentTime || 0;
                source.start(started);
                if (portrait) portrait.play(plan, context, started, transmission.speechOffset, noise);
                DW.audio.setCommsActive(true);
                channelRemaining = transmission.duration;

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
            // The shared game mixer owns the audio context.
        });
        return {
            speakerId: function () {
                return currentSpeaker;
            },
            unlock: unlock,
            pause: stop,
            reset: function () {
                stop();
                if (portrait) portrait.clear();
                clock = create();

                speaker.textContent = 'RANGE COMMS';
                var emotionField = panel.ownerDocument && panel.querySelector('[data-emotion]');
                if (emotionField)
                    emotionField.textContent = '';
                subtitle.textContent = 'Standing by for flight.';
                panel.classList.remove('hostile');
                panel.classList.add('idle');
            },
            update: /** @param {number} dt @param {Combat} combat @param {FlightState} player */ function (dt, combat, player) {
                // Count this whole interval as occupied if playback was active at its start.
                var wasBusy = !!source || channelRemaining > 0;
                channelRemaining = Math.max(0, channelRemaining - dt);
                if (!source && channelRemaining <= 0)
                    currentSpeaker = /** @type {string | null} */ (null);
                if (closing) {
                    closingElapsed += dt;
                    var age = context && Number.isFinite(context.currentTime) ? context.currentTime - closingAt : closingElapsed;
                    if (age >= .5) stop();
                    else if (portrait) portrait.decay(age / .5);
                } else if (showing && !source && channelRemaining <= 0) stop();
                var line = step(clock, dt, combat, wasBusy || !!source || channelRemaining > 0, Math.random, player);
                if (line)
                    speak(line);
                if (portrait) portrait.update(!reassurance && currentSpeaker ? clock.emotions[currentSpeaker] : undefined);
            }
        };
    }
    DW.flightRadio = { mount: mount };
}());
