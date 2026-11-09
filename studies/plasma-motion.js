(function () {
    'use strict';
    const modes = [
        ['orb', '01 / Bare plasma ball', 'Control: a round, bright core with a small colored corona. Expect stepping at high apparent speed.'],
        ['tracer', '02 / Tracer reference', 'One continuous exposure along the screen path. Trackable, but the ball becomes a lance.'],
        ['multiples', '03 / Sharp multiples', 'Up to five round exposures. Older copies fade; wide gaps can look like separate ammunition.'],
        ['overlap', '04 / Overlapping exposures', 'Adaptive spacing keeps round impressions touching, with a 24-sample budget. A soft packet with a distinct head.'],
        ['stretch', '05 / Squash & stretch', 'One compact oval, stretched by screen displacement but capped at three radii. Keeps its body; leaves temporal gaps.'],
        ['hybrid', '06 / Compact packet', 'A short stretched head plus up to eight faint round exposures. Trades some continuity for a more solid plasma ball.']
    ];
    const $ = id => document.getElementById(id);
    const controls = ['speed', 'fps', 'shutter', 'radius', 'view', 'camera', 'color'];
    const panels = modes.map(([mode, title, description]) => {
        const article = document.createElement('article');
        const heading = document.createElement('h2'); heading.textContent = title;
        const caption = document.createElement('p'); caption.textContent = description;
        const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', title + ': animated projectile comparison');
        article.append(heading, caption, canvas); $('grid').append(article);
        return {mode, canvas, ctx: canvas.getContext('2d')};
    });
    let time = 0, interval = 1 / 30, paused = false, previousStamp = null, accumulator = 0;
    let settings;
    function read() {
        settings = Object.fromEntries(controls.map(id => [id, $(id).value]));
        for (const key of ['speed', 'fps', 'shutter', 'radius']) settings[key] = Number(settings[key]);
        $('speedValue').textContent = settings.speed + ' m/s';
        $('shutterValue').textContent = settings.shutter + '% frame';
        $('radiusValue').textContent = settings.radius + ' px';
    }
    // The trajectory is continuous in time; exposures never reach behind launch.
    function position(age, lane) {
        const d = age * settings.speed;
        if (settings.view === 'away') return [(lane - 1) * 20, (lane - 1) * 8, 70 + d];
        if (settings.view === 'toward') return [(lane - 1) * 38 + 20, (lane - 1) * 15, 1800 - d];
        return [-1000 + d, (lane - 1) * 95, 1000 + (lane - 1) * 90];
    }
    function project(point, t, w, h) {
        let yaw = 0;
        if (settings.camera === 'sweep') yaw = Math.sin(t * 1.4) * .23;
        if (settings.camera === 'track') yaw = Math.atan2(position((t % 1.8), 1)[0], position((t % 1.8), 1)[2]);
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const x = point[0] * c - point[2] * s, z = point[0] * s + point[2] * c;
        if (z < 35) return null;
        const focal = w * .8;
        return [w / 2 + x * focal / z, h / 2 - point[1] * focal / z];
    }
    function orb(ctx, x, y, r, alpha, stretch, angle) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(angle || 0); ctx.scale(stretch || 1, 1);
        ctx.globalAlpha = alpha;
        const rgb = settings.color === 'orange' ? '255,145,45' : settings.color === 'green' ? '115,255,125' : '65,215,255';
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.5);
        glow.addColorStop(0, 'rgba(255,255,240,1)');
        glow.addColorStop(.22, 'rgba(235,255,255,.95)');
        glow.addColorStop(.43, 'rgba(' + rgb + ',.85)');
        glow.addColorStop(1, 'rgba(' + rgb + ',0)');
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, r * 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    function draw(panel) {
        const {canvas, ctx, mode} = panel, w = canvas.clientWidth, h = canvas.clientHeight;
        const ratio = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
            canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio);
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.fillStyle = '#080f1b'; ctx.fillRect(0, 0, w, h);
        // Static world landmarks share the same camera transform as projectiles.
        for (let i = 0; i < 65; i++) {
            const p = project([Math.sin(i * 127.1) * 2200, Math.cos(i * 43.7) * 650, 2400 + (i % 7) * 170], time, w, h);
            if (p) { ctx.fillStyle = i % 5 ? '#35465e' : '#74849a'; ctx.fillRect(p[0], p[1], 1.3, 1.3); }
        }
        ctx.strokeStyle = '#203449'; ctx.beginPath(); ctx.moveTo(w / 2 - 7, h / 2); ctx.lineTo(w / 2 + 7, h / 2); ctx.moveTo(w / 2, h / 2 - 7); ctx.lineTo(w / 2, h / 2 + 7); ctx.stroke();
        let maxGap = 0;
        const radius = settings.radius;
        for (let volley = Math.max(0, Math.floor((time - 4) / .38)); volley <= Math.floor(time / .38); volley++) {
            const birth = volley * .38, age = time - birth;
            if (age > 3.5) continue;
            for (let lane = 0; lane < 3; lane++) {
                const head = project(position(age, lane), time, w, h);
                const exposure = Math.min(age, interval * settings.shutter / 100);
                const tail = project(position(age - exposure, lane), time - exposure, w, h);
                if (!head || !tail) continue;
                const dx = head[0] - tail[0], dy = head[1] - tail[1], distance = Math.hypot(dx, dy);
                if (head[0] < -100 || head[0] > w + 100 || head[1] < -100 || head[1] > h + 100) continue;
                maxGap = Math.max(maxGap, distance);
                const angle = Math.atan2(dy, dx);
                ctx.globalCompositeOperation = 'lighter';
                if (mode === 'tracer') {
                    ctx.strokeStyle = settings.color === 'orange' ? '#eaa04c' : settings.color === 'green' ? '#78df89' : '#58cce9';
                    ctx.lineWidth = radius * 1.1; ctx.lineCap = 'round';
                    ctx.beginPath(); ctx.moveTo(tail[0], tail[1]); ctx.lineTo(head[0], head[1]); ctx.stroke();
                }
                if (mode === 'multiples' || mode === 'overlap' || mode === 'hybrid') {
                    const cap = mode === 'multiples' ? 5 : mode === 'hybrid' ? 8 : 24;
                    const spacing = radius * (mode === 'multiples' ? 2.5 : 1.1);
                    const count = Math.min(cap, Math.max(1, Math.ceil(distance / spacing) + 1));
                    // Weights sum to a fixed tail budget, preventing brightness from growing with sample count.
                    let total = 0;
                    for (let j = 1; j < count; j++) total += 1 - j / count;
                    for (let j = count - 1; j > 0; j--) {
                        const f = j / (count - 1);
                        const t = time - exposure * f;
                        const p = project(position(age - exposure * f, lane), t, w, h);
                        if (p) orb(ctx, p[0], p[1], radius, (1 - j / count) / total * (mode === 'overlap' ? 1.6 : .85));
                    }
                }
                const stretch = mode === 'stretch' || mode === 'hybrid' ? Math.min(mode === 'hybrid' ? 1.7 : 3, 1 + distance / (radius * 8)) : 1;
                orb(ctx, head[0] - Math.cos(angle) * radius * (stretch - 1), head[1] - Math.sin(angle) * radius * (stretch - 1), radius, 1, stretch, angle);
                ctx.globalCompositeOperation = 'source-over';
            }
        }
        ctx.fillStyle = '#829bb4'; ctx.font = '11px system-ui'; ctx.fillText('exposure travel: ' + maxGap.toFixed(1) + ' px', 12, h - 12);
    }
    function render() {
        panels.forEach(draw);
        $('stats').textContent = (paused ? 'Paused' : 'Running') + ' · ' + settings.fps + ' FPS target · t = ' + time.toFixed(2) + ' s';
    }
    function advance(dt) { interval = dt; time += dt; render(); }
    controls.forEach(id => $(id).addEventListener('input', () => { read(); accumulator = 0; interval = 1 / settings.fps; render(); }));
    $('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Resume' : 'Pause'; accumulator = 0; render(); };
    $('step').onclick = () => { paused = true; $('pause').textContent = 'Resume'; advance(1 / settings.fps); };
    $('reset').onclick = () => { time = 0; accumulator = 0; render(); };
    window.addEventListener('resize', render);
    document.addEventListener('visibilitychange', () => { previousStamp = null; accumulator = 0; });
    function frame(stamp) {
        if (previousStamp !== null && !paused) {
            accumulator += Math.min(.1, (stamp - previousStamp) / 1000);
            if (accumulator >= 1 / settings.fps - .0001) {
                const dt = accumulator; accumulator = 0; advance(dt);
            }
        }
        previousStamp = stamp; requestAnimationFrame(frame);
    }
    read(); render(); requestAnimationFrame(frame);
}());
