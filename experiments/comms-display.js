(function () {
    'use strict';
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    /** @param {HTMLCanvasElement} canvas */
    function context(canvas) { var ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable'); return ctx; }
    /** @param {HTMLCanvasElement} target */
    function create(target) {
        var ctx = context(target), base = target.ownerDocument.createElement('canvas');
        base.width = base.height = 256;
        var face = context(base), lastProgress = 0, ramp = /** @type {{at: number; level: number}[]} */ ([]);
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
                if (!progress || progress < lastProgress) ramp = [];
                if (progress && !options.reduced && !ramp.length) {
                    // Random positive increments in both time and severity. Sampling
                    // by sign-off progress also works when the speech clock is frozen.
                    ramp.push({at: 0, level: 0});
                    var at = 0, level = 0;
                    for (var n = 0; n < 8; n++) {
                        at += .25 + Math.random(); level += .1 + Math.random();
                        ramp.push({at: at, level: level});
                    }
                    ramp.forEach(function (point) { point.at /= at; point.level /= level; });
                }
                lastProgress = progress;
                var breakup = 0, texture = 1;
                for (var r = 1; r < ramp.length; r++) {
                    var left = ramp[r - 1], right = ramp[r];
                    if (progress <= right.at) {
                        breakup = left.level + (right.level - left.level) * (progress - left.at) / (right.at - left.at);
                        break;
                    }
                }
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
