(function () {
    'use strict';
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    /** @param {HTMLCanvasElement} canvas */
    function context(canvas) { var ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable'); return ctx; }
    /** @param {HTMLCanvasElement} target */
    function create(target) {
        var ctx = context(target), base = target.ownerDocument.createElement('canvas');
        base.width = base.height = 256;
        var face = context(base), nextBurst = -Infinity, burst = 0, texture = 0, lastProgress = 0;
        return {
            /** @param {CanvasImageSource} source @param {import('./types').RadioNoise | null} pattern @param {number} elapsed @param {number} speechDuration @param {import('./types').CommsDisplayOptions} [options] */
            draw: function (source, pattern, elapsed, speechDuration, options) {
                options = options || {};
                var t = elapsed;
                // Same precomputed radio input as audio; never inspect the audio output.
                var noise = pattern ? DW.mumble.radioNoiseAt(pattern, elapsed).strength : 0;
                // Audio latch steps can be just 1 ms long. A short visual peak hold
                // keeps them visible between display frames without adding new events.
                var visualNoise = noise;
                var edge = !!pattern && (elapsed < pattern.lead / pattern.sampleRate || elapsed >= pattern.lead / pattern.sampleRate + speechDuration);
                var hold = edge ? .25 : .04;
                if (pattern) for (var age = .001; age <= hold; age += .001) {
                    visualNoise = Math.max(visualNoise, DW.mumble.radioNoiseAt(pattern, elapsed - age).strength);
                }

                var progress = Math.max(0, Math.min(1, options.breakup || 0));
                if (!progress || progress < lastProgress) { nextBurst = -Infinity; burst = 0; }
                lastProgress = progress;
                if (progress && !options.reduced && elapsed >= nextBurst) {
                    // A failing signal sputters in irregular packets, with recoveries.
                    // Progress raises the odds, rather than smoothly fading noise in.
                    burst = Math.random() < .24 ? .03 + Math.random() * .15 : Math.min(1, .15 + progress * .65 + Math.random() * .65);
                    texture = Math.floor(Math.random() * 3);
                    nextBurst = elapsed + .018 + Math.random() * .065;
                }
                var breakup = progress ? burst : 0;
                if (progress > .94) { breakup = Math.max(.95, breakup); texture = 1; }
                var s = {strength: Math.max(visualNoise, breakup * .35)}, palette = options.palette || 'green', reduced = !!options.reduced;
                face.clearRect(0, 0, 256, 256); face.fillStyle = '#07100c'; face.fillRect(0, 0, 256, 256);
                face.filter = palette === 'color' ? 'none' : 'grayscale(1) contrast(1.18)';
                face.drawImage(source, 0, 0, 256, 256); face.filter = 'none';
                if (palette === 'green' || palette === 'amber') { face.globalCompositeOperation = 'multiply'; face.fillStyle = palette === 'green' ? '#8bffb0' : '#ffc878'; face.fillRect(0, 0, 256, 256); face.globalCompositeOperation = 'source-over'; }
                ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, 512, 512); ctx.drawImage(base, 0, 0, 512, 512);
                if (!reduced) {
                    var y = Math.floor(Math.random() * 246);
                    var shift = Math.round(s.strength * 44 * (Math.random() * 2 - 1));
                    if (shift) ctx.drawImage(base, 0, y, 256, 10, shift, y * 2, 512, 20);
                    ctx.fillStyle = 'rgba(190,255,210,' + (s.strength * .16) + ')'; ctx.fillRect(0, (t * 42) % 560 - 40, 512, 36);
                    // Geometry and snow are fresh random samples, while event timing
                    // still comes from the shared radio noise input.
                    var random = Math.random;
                    for (var k = 0; k < noise * 1400 + Math.pow(breakup, 3) * 14000; k++) {
                        var x = random() * 512, sy = random() * 512;
                        var width = random() < .92 ? 1 + random() * (2 + breakup * 18) : 3 + random() * (8 * s.strength + breakup * 18);
                        var height = breakup > 0 ? 1 + random() * (2 + breakup * 14) : random() < .8 ? 1 : 2;
                        if (progress && texture === 0) { width = 1 + random() * 3; height = 1 + random() * 2; }
                        if (progress && texture === 2) { width = 8 + random() * (12 + breakup * 85); height = 1 + random() * 3; }
                        var light = random() > .42;
                        var opacity = Math.min(1, random() * (.16 + s.strength * .78) + breakup * .9);
                        ctx.fillStyle = light ? 'rgba(206,255,216,' + opacity + ')' : 'rgba(0,0,0,' + opacity + ')';
                        ctx.fillRect(Math.floor(x), Math.floor(sy), width, height);
                    }
                }
                ctx.fillStyle = 'rgba(0,0,0,' + (options.scanlines === undefined ? 35 : options.scanlines) / 180 + ')'; for (var row = 0; row < 512; row += 4) ctx.fillRect(0, row, 512, 1);
                var vignette = ctx.createRadialGradient(256, 235, 100, 256, 256, 350); vignette.addColorStop(0, '#0000'); vignette.addColorStop(1, '#0009'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, 512, 512);
                return noise;
            }
        };
    }
    DW.commsDisplay = {create: create};
}());
