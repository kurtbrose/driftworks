/* Sun studies: fixed geometry, deterministic local brightness changes. */
'use strict';
/** @param {number} seed */
function sunRandom(seed) {
    return function () { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}
/** @param {number} time @param {number} phase @param {number} strength */
function sunVariation(time, phase, strength) {
    return 1 + strength * (0.65 * Math.sin(time * 0.71 + phase) + 0.35 * Math.sin(time * 1.13 + phase * 2));
}
/** @param {number} elapsed @param {number} delta @param {boolean} paused @param {boolean} hidden */
function sunAdvance(elapsed, delta, paused, hidden) {
    return elapsed + (paused || hidden ? 0 : Math.min(0.05, Math.max(0, delta)));
}
/** @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} radius @param {string} color @param {number} alpha */
function sunGlow(ctx, x, y, radius, color, alpha) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, 'rgba(' + color + ',' + alpha + ')');
    gradient.addColorStop(0.18, 'rgba(' + color + ',' + alpha * 0.55 + ')');
    gradient.addColorStop(0.5, 'rgba(' + color + ',' + alpha * 0.12 + ')');
    gradient.addColorStop(1, 'rgba(' + color + ',0)');
    ctx.fillStyle = gradient; ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}
/** @param {CanvasRenderingContext2D} ctx @param {string} kind @param {number} time @param {{motion:number,exposure:number,size:number,offset:number,stars:boolean}} state @param {HTMLImageElement|null} original @param {boolean=} renderStars */
function sunPaint(ctx, kind, time, state, original, renderStars = true) {
    const n = ctx.canvas.width, x = n * (0.5 + state.offset * 0.5), y = n * 0.5;
    const radius = n * 0.025 * state.size, rand = sunRandom(4207);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, n, n);
    // Star coordinates and apparent sizes never change; only a few vary by 4%.
    for (let i = 0; i < (renderStars ? 85 : 0); i++) {
        const sx = rand() * n, sy = rand() * n, a = 0.12 + rand() * 0.36;
        ctx.fillStyle = 'rgba(200,216,235,' + a * sunVariation(time, i, state.stars && i % 5 === 0 ? 0.04 * state.motion : 0) + ')';
        ctx.fillRect(sx, sy, i % 11 === 0 ? 1.4 : 0.8, i % 11 === 0 ? 1.4 : 0.8);
    }
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(1, state.exposure);
    if (kind === 'baseline') {
        if (original && original.complete && original.naturalWidth) ctx.drawImage(original, x - n * state.size / 2, y - n * state.size / 2, n * state.size, n * state.size);
    } else {
        const gain = state.exposure * sunVariation(time, 0.8, 0.025 * state.motion);
        const tight = kind === 'tight', hdr = kind === 'hdr', surface = kind === 'surface' || kind === 'instrument';
        ctx.globalAlpha = Math.min(1, gain);
        sunGlow(ctx, x, y, radius * (tight ? 5 : hdr ? 22 : 13), '255,225,172', hdr ? 0.65 : 0.48);
        sunGlow(ctx, x, y, radius * (tight ? 2.4 : hdr ? 6 : 5.5), '255,246,218', hdr ? 0.95 : 0.9);
        if (kind === 'asymmetric') {
            for (let i = 0; i < 5; i++) {
                const angle = i * 2.4, bright = sunVariation(time, i * 1.8, state.motion * 0.09);
                sunGlow(ctx, x + Math.cos(angle) * radius * 1.5, y + Math.sin(angle) * radius * 1.5, radius * 6, '255,240,209', 0.12 * bright);
            }
        }
        if (kind === 'anamorphic' || kind === 'spikes') {
            ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.014);
            sunGlow(ctx, 0, 0, n * 0.44, '201,222,255', 0.21); ctx.restore();
            if (kind === 'spikes') {
                ctx.save(); ctx.translate(x, y); ctx.scale(0.014, 1);
                sunGlow(ctx, 0, 0, n * 0.37, '233,241,255', 0.12); ctx.restore();
            }
        }
        if (hdr) {
            // Lens reflections track viewing direction; the stellar disk does not deform.
            sunGlow(ctx, n - x, n * 0.57, radius * 3, '153,188,208', 0.045);
            ctx.strokeStyle = 'rgba(255,235,201,0.025)'; ctx.lineWidth = radius * 0.3;
            ctx.beginPath(); ctx.arc(x, y, radius * 8, 0, Math.PI * 2); ctx.stroke();
        }
        const disk = radius * (surface ? 2.4 : kind === 'white' ? 1.25 : 1);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = Math.min(1, state.exposure);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, disk);
        gradient.addColorStop(0, kind === 'instrument' ? '#ffdb86' : '#fffffc');
        gradient.addColorStop(0.8, kind === 'instrument' ? '#efab42' : '#fffdf1');
        gradient.addColorStop(1, kind === 'instrument' ? '#af6426' : surface ? '#ddd8c8' : '#fff8e4');
        ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, disk, 0, Math.PI * 2); ctx.fill();
        if (surface) {
            const cells = sunRandom(937);
            ctx.save(); ctx.clip();
            // Fixed convection patches evolve in brightness, never slide or rotate.
            for (let i = 0; i < 650; i++) {
                const px = x + (cells() * 2 - 1) * disk, py = y + (cells() * 2 - 1) * disk;
                const a = (kind === 'instrument' ? 0.13 : 0.017) * sunVariation(time, i * 0.83, state.motion * 0.3);
                ctx.fillStyle = 'rgba(86,54,22,' + a + ')'; ctx.beginPath(); ctx.arc(px, py, disk * (0.012 + cells() * 0.026), 0, Math.PI * 2); ctx.fill();
            }
            ctx.fillStyle = kind === 'instrument' ? '#715126' : '#8d8980';
            for (const spot of [[-0.31, 0.21, 0.025], [-0.25, 0.18, 0.014]]) {
                ctx.beginPath(); ctx.arc(x + spot[0] * disk, y + spot[1] * disk, disk * spot[2], 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

if (typeof document !== 'undefined') {
    const sunBench = document.getElementById('sun-bench');
    if (sunBench) {
        const entries = [
            ['baseline', 'Original · baseline', 'The original generated sprite, held completely still.'],
            ['white', '01 / White-hot', 'Nearly white disk and pale bloom; only the surrounding light gently breathes.'],
            ['tight', '02 / Tight corona', 'A concentrated light envelope, with very little distant glow.'],
            ['anamorphic', '03 / Anamorphic glare', 'A faint horizontal optical streak. Camera character rather than stellar structure.'],
            ['asymmetric', '04 / Asymmetric bloom', 'Fixed, overlapping light lobes vary independently by a few percent.'],
            ['spikes', '05 / Diffraction spikes', 'A restrained cross from hypothetical spacecraft optics.'],
            ['hdr', '06 / HDR glare', 'Broader inner bloom, a faint ghost ring and view-dependent lens reflection.'],
            ['surface', '07 / Visible continuum', 'An enlarged nearly white disk, limb darkening, fine grain and two small sunspots.'],
            ['instrument', '08 / Instrument study', 'A deliberately warm, contrast-enhanced cell study. Local brightness evolves faster for comparison; this is an artistic diagnostic view.']
        ];
        const state = {motion: 1, exposure: 1, size: 1, offset: 0, stars: true};
        let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let elapsed = 0, previous = 0;
        const original = new Image();
        const assetUrl = (window.Driftworks.assetUrl) || function (/** @type {string} */ value) { return value; };
        original.src = assetUrl('../assets/backgrounds/features/warm-sun-v1.png');
        const panels = entries.map(function (entry) {
            const article = document.createElement('article'), canvas = document.createElement('canvas');
            canvas.width = canvas.height = 512; canvas.setAttribute('aria-label', entry[1] + ' animated preview');
            article.appendChild(canvas);
            const body = document.createElement('div'), heading = document.createElement('h3'), description = document.createElement('p'), download = document.createElement('button');
            heading.textContent = entry[1]; description.textContent = entry[2]; description.className = 'description';
            download.textContent = 'Save current frame'; download.type = 'button';
            download.onclick = function () { const link = document.createElement('a'); link.download = 'sun-' + entry[0] + '.png'; const clean = document.createElement('canvas'); clean.width = clean.height = 1024; const context = clean.getContext('2d'); if (!context) return; sunPaint(context, entry[0], elapsed, state, original, false); link.href = clean.toDataURL('image/png'); link.click(); };
            body.append(heading, description, download); article.appendChild(body); sunBench.appendChild(article);
            return {kind: entry[0], context: canvas.getContext('2d')};
        });
        for (const key of /** @type {const} */ (['motion', 'exposure', 'size', 'offset'])) {
            const input = /** @type {HTMLInputElement} */ (document.getElementById('sun-' + key));
            input.oninput = function () { state[key] = Number(input.value); const output = document.getElementById('sun-' + key + '-value'); if (output) output.textContent = state[key].toFixed(2) + (key === 'offset' ? '' : '×'); };
        }
        const stars = /** @type {HTMLInputElement} */ (document.getElementById('sun-stars'));
        stars.onchange = function () { state.stars = stars.checked; };
        const pause = /** @type {HTMLButtonElement} */ (document.getElementById('sun-pause'));
        function updatePause() { pause.textContent = paused ? 'Resume motion' : 'Pause motion'; pause.setAttribute('aria-pressed', String(paused)); }
        pause.onclick = function () { paused = !paused; updatePause(); }; updatePause();
        function frame(/** @type {number} */ now) {
            elapsed = sunAdvance(elapsed, (now - (previous || now)) / 1000, paused, document.hidden); previous = now;
            if (!document.hidden) for (const panel of panels) if (panel.context) sunPaint(panel.context, panel.kind, elapsed, state, original);
            window.requestAnimationFrame(frame);
        }
        window.requestAnimationFrame(frame);
    }
}
