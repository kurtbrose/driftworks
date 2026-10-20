(function () {
    'use strict';
    /** @param {string} id */
    function el(id) { return /** @type {HTMLElement} */ (document.getElementById(id)); }
    /** @param {string} id */
    function input(id) { return /** @type {HTMLInputElement} */ (el(id)); }
    /** @param {string} id */
    function select(id) { return /** @type {HTMLSelectElement} */ (el(id)); }
    /** @param {HTMLCanvasElement} canvas */
    function context(canvas) { var c = canvas.getContext('2d'); if (!c) throw new Error('Canvas unavailable'); return c; }
    var screen = /** @type {HTMLCanvasElement} */ (el('screen')), ctx = context(screen);
    var original = context(/** @type {HTMLCanvasElement} */ (el('original')));
    var image = new Image(), loaded = false, frozen = false;
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    var display = DW.commsDisplay.create(screen);
    var animated = document.createElement('canvas');
    /** @type {import('./speech-sprites/generated-v1/types').FaceRenderer | null} */ var renderer = null;
    /** @type {import('./types').SpeechPlan | null} */ var plan = null;
    /** @type {ReturnType<typeof DW.mumble.transmit> | null} */ var transmission = null;
    /** @type {import('./types').RadioNoise | null} */ var channelNoise = null;
    var started = 0, sequence = 0, active = false, muted = false, blinkAt = 0;
    /** @type {AudioContext | null} */ var audio = null;
    /** @type {AudioBufferSourceNode | null} */ var speech = null;
    /** @type {GainNode | null} */ var master = null;
    var closed = false, frame = 0, generation = 0;
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    /** @returns {number} */ function time() { return audio ? audio.currentTime : performance.now() / 1000; }
    for (var i = 0; i < 8; i++) { var option = document.createElement('option'); option.value = String(i); option.textContent = 'Crew ' + (i + 1); select('portrait').appendChild(option); }
    function load() {
        var ticket = ++generation, next = new Image(); loaded = false; el('status').textContent = 'LOADING';
        next.onload = function () { if (ticket !== generation) return; image = next;
            if (renderer) renderer.dispose();
            /** @type {Record<string, import('./speech-sprites/generated-v1/types').FaceSource>} */ var poses = {};
            ['master','ah','oo','blink','smile','angry','afraid'].forEach(function (name, index) { poses[name] = {image: image, rect: [index * 256, 0, 256, 256]}; });
            poses.eh = poses.ah; renderer = DW.faceBlend.create(animated, poses); loaded = true; original.clearRect(0, 0, 256, 256); original.drawImage(image, 0, 0, 256, 256, 0, 0, 256, 256); el('status').textContent = 'STANDBY'; };
        next.onerror = function () { if (ticket === generation) el('status').textContent = 'PORTRAIT LOAD FAILED'; };
        next.src = '../assets/portraits/dogfight/runtime/portrait-' + select('portrait').value + '.png';
    }
    select('portrait').onchange = function () { stop(); load(); }; load();
    input('noise').oninput = function () { el('amount').textContent = input('noise').value + '%'; };
    function stop() {
        sequence++; active = false; plan = null; transmission = null;
        if (speech) { speech.onended = null; speech.stop(); speech.disconnect(); speech = null; }
        frozen = false; el('pause').textContent = 'Freeze picture';
        el('status').textContent = 'CHANNEL CLOSED';
    }
    el('stop').onclick = stop;
    el('pause').onclick = function () { frozen = !frozen; el('pause').textContent = frozen ? 'Resume picture' : 'Freeze picture'; };
    el('audio').onclick = function () { muted = !muted; el('audio').textContent = muted ? 'Unmute audio' : 'Mute audio'; };
    el('speak').onclick = async function () {
        stop(); var ticket = sequence;
        var text = /** @type {HTMLTextAreaElement} */ (el('line')).value.trim();
        if (!text || !loaded) return;
        try {
            if (!audio) { audio = new AudioContext(); master = audio.createGain(); master.gain.value = 0; master.connect(audio.destination); }
            await audio.resume(); if (ticket !== sequence || closed) return;
            var api = DW.mumble;
            var settings = Object.assign({}, api.defaults, {seed: 17 + Number(select('portrait').value), volume: .55});
            plan = api.analyze(text, settings);
            var pcm = api.render(plan, 22050), seed = Math.floor(Math.random() * 2147483647);
            channelNoise = api.radioNoise(pcm.length, 22050, {effects: Number(input('noise').value) / 100, seed: seed, edgeScale: Number(select('timing').value)});
            transmission = api.transmit(pcm, 22050, {mode: 'radio', seed: seed, noise: channelNoise});
            var buffer = audio.createBuffer(1, transmission.samples.length, 22050); buffer.copyToChannel(new Float32Array(transmission.samples), 0);
            speech = audio.createBufferSource(); speech.buffer = buffer; speech.connect(/** @type {GainNode} */ (master));
            started = audio.currentTime + .04; active = true; blinkAt = started + 2.8;
            speech.onended = function () { if (ticket !== sequence) return; active = false; if (speech) { speech.disconnect(); speech = null; } el('status').textContent = 'CHANNEL CLOSED'; };
            speech.start(started); el('audio-status').textContent = 'Receiving local Mumble speech. Audio and picture share one radio noise input.';
        } catch (error) { stop(); el('audio-status').textContent = 'Audio unavailable: ' + String(error); }
    };
    function draw() {
        if (closed) return;
        frame = requestAnimationFrame(draw);
        if (audio && master) master.gain.setTargetAtTime(muted ? 0 : Number(input('volume').value) / 100, audio.currentTime, .01);
        if (!loaded) return;
        var elapsed = time() - started;
        if (!active || !transmission || !plan || !renderer || elapsed < 0 || elapsed >= transmission.duration) {
            ctx.fillStyle = '#010704'; ctx.fillRect(0, 0, 512, 512);
            el('signal').textContent = 'NO CARRIER'; return;
        }
        if (frozen) return;
        var cue = DW.faceBlend.speechCue(plan, elapsed - transmission.speechOffset);
        /** @type {import('./speech-sprites/generated-v1/types').FaceLayer[]} */ var layers = [];
        if (!reduced) {
            if (cue.alpha > 0) layers.push({image: cue.image, shape: [48,61,13,8,20], alpha: 1});
            if (time() > blinkAt + .14) blinkAt = time() + 3.4;
            if (time() >= blinkAt) layers.push({image:'blink',shape:[38.5,44.6,7.4,4.3,25],alpha:1},{image:'blink',shape:[56.5,44.6,7.4,4.3,25],alpha:1});
        }
        renderer.draw(layers);
        el('subtitle').textContent = plan.text.slice(0, cue.revealed);
        el('status').textContent = elapsed < transmission.speechOffset ? 'ACQUIRING' : elapsed > transmission.speechOffset + plan.duration ? 'CLOSING CHANNEL' : 'RECEIVING';
        var t = time();
        var noise = display.draw(animated, channelNoise, elapsed, plan.duration, {palette: select('palette').value, scanlines: Number(input('scan').value), reduced: reduced});
        el('signal').textContent = 'SIGNAL ' + Math.round((1 - noise * .55) * 100) + '%';
    }
    frame = requestAnimationFrame(draw);
    addEventListener('pagehide', function () { closed = true; stop(); cancelAnimationFrame(frame); if (renderer) renderer.dispose(); if (audio) void audio.close(); });
}());
