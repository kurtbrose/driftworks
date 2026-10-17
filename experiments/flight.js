(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    var get = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).experimentDom(document);
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks), model = DW.arcade, host = get('viewer');
    var session = DW.flightSession.create({ terrainHit: function (start, end) {
            var asteroid = session.snapshot().asteroid;
            return DW.flightGuns.intersect(start, end, asteroid.radius, function (point) {
                return DW.scene3d.rockField(asteroid, /** @type {[number, number, number]} */ (DW.flightSession.rotateVector(point, -asteroid.rotation)));
            });
        }, surfaceFrame: function (asteroid, direction) {
            return DW.scene3d.surfaceFrame(asteroid, /** @type {[number, number, number]} */ (direction));
        }, onGunshot: function () {
            DW.audio.playGunshot();
        }, onImpact: function () {
            DW.audio.playImpact(1);
        } });
    var units = DW.sim.METERS_PER_UNIT;
    var presentation = DW.flightPresentation.mount(host, function () {
        return session.snapshot().world;
    }, function (w) {
        session.setWorld(w);
    });
    var select = get('profile'), stats = get('stats'), status = get('status');
    var watch = /** @type {ReturnType<Required<DriftworksNamespace>['flightWatch']['create']> | null} */ (null);
    var watchDuration=120,watchOpponentWeapon=-2;
    function view() {
        return watch ? watch.snapshot(get('watch-camera').value === 'chase') : session.snapshot();
    }
    // The initial reset below creates the sortie before any frame or input runs.
    var paused = true;
    model.profiles.forEach(function (p, i) {
        var option = document.createElement('option');
        option.value = String(i);
        option.textContent = p.name;
        select.appendChild(option);
    });
    var gunSelect = get('gun');
    var diagnostics = DW.flightDiagnostics.mount();
    get('dialogue-size').oninput = function (e) {
        document.documentElement.style.setProperty('--dialogue-size', get('dialogue-size').value + 'px');
    };
    var flightHud = DW.flightHud.mount(host);
    var comms = DW.flightComms.mount(get('comms'), get('comms-voice'));
    function weapon() {
        if (watch) return DW.retailWeapons[watch.replay.options.weapon < 0 ? DW.training.defaultWeapon(model.profiles[watch.replay.options.profile]) : watch.replay.options.weapon];
        return DW.retailWeapons[Number(gunSelect.value)];
    }
    function gunLabels() {
        var w = weapon();
        get('gun-stats').textContent = w.speed + ' m/s · ' + w.fireWait + ' s / volley · ' + (w.speed * w.lifetime) + ' m range';
    }
    function banks() {
        gunSelect.textContent = '';
        var primary = DW.training.defaultWeapon(profile()), indexes = [primary].concat(DW.retailWeapons.map(function (_, i) { return i; }).filter(function (i) { return i !== primary; }));
        indexes.forEach(function (index) {
            var option = document.createElement('option');
            option.value = String(index);
            option.textContent = DW.retailWeapons[index].name;
            gunSelect.appendChild(option);
        });
        gunLabels();
    }
    gunSelect.onchange = gunLabels;
    get('restart-training').onclick = function () {
        pause();
        reset();
        blurActiveControl();
    };
    get('combat-toggle').onchange = function (e) {
        comms.reset();
        session.setCombat(get('combat-mode').value, get('combat-toggle').checked);
    };
    function profile() {
        if (watch) return model.profiles[watch.replay.options.profile];
        return model.profiles[Number(select.value)];
    }
    function labels() {
        var p = profile();
        stats.textContent = (p.species || '') + ' · ' + p.role + '\nHull / shields ' + p.hull + ' / ' + p.shield + '\nCruise / boost ' + p.maxVelocity[2] + ' / ' + p.afterburnerVelocity[2] + ' m/s\nAccel / decel ' + p.forwardAccel + ' / ' + p.forwardDecel + ' s\nPitch / yaw / roll (s/360°)\n' + p.rotationTime.join(' / ') + '\nDamp / rotdamp ' + p.damp + ' / ' + p.rotdamp;
    }
    function clear() {
        controls.clear();
    }
    function pause() {
        paused = true;
        comms.pause();
        document.body.classList.remove('flight-active');
        clear();
        controls.release();
        document.body.classList.remove('mouse-captured');
        get('fly').textContent = watch ? (watch.summary().done ? 'Restart duel' : 'Watch duel') : session.snapshot().combat.dead ? 'Restart flight' : 'Resume flight';
        status.textContent = watch ? 'AI duel paused · use the watch panel to resume' : 'Paused - Resume flight when ready';
    }
    function pose() {
        var current = view();
        presentation.pose(current.camera || current.state);
    }
    function reset() {
        clear();
        comms.reset();
        var pilot = get('watch-pilot').value, observing = pilot !== 'manual';
        session.reset({ mode: get('combat-mode').value, enabled: !observing && get('combat-toggle').checked, profile: model.profiles[Number(select.value) || 0] });
        var seed = Number(get('watch-seed').value);
        if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) seed = 1;
        get('watch-seed').value = String(seed);
        watch = observing ? DW.flightWatch.create(session.snapshot, {category:pilot === 'perfect' ? 'perfect' : 'human',
            flavor:/** @type {'novice'|'practiced'|'expert'} */ (pilot === 'perfect' ? 'practiced' : pilot.replace('human-', '')), seed:seed,
            start:/** @type {import('./types').DuelOptions['start']} */ (get('watch-start').value), skill:Number(get('watch-skill').value), duration:watchDuration,
            profile:Number(get('watch-profile').value),opponentProfile:Number(get('watch-opponent-profile').value),weapon:Number(get('watch-weapon').value),opponentWeapon:watchOpponentWeapon,unshielded:get('watch-defense').value==='unshielded'}) : null;
        document.body.classList.toggle('watching-ai', observing);
        get('watch-panel').classList.toggle('watch-running', observing);
        [select, gunSelect, get('combat-mode'), get('diameter'), get('combat-toggle')].forEach(function (control) { control.disabled = observing; });
        get('fly').textContent = observing ? 'Watch duel' : 'Start flight';
        status.textContent = observing ? 'AI duel paused · Play to watch' : 'Ready · Start flight when ready';
        updateWatch();
        pose();
    }
    function updateWatch() {
        document.body.classList.toggle('watch-chase', !!watch && get('watch-camera').value === 'chase');
        get('watch-play').disabled = !watch;
        get('watch-restart').disabled = !watch;
        get('watch-play').textContent = watch && watch.summary().done ? 'Replay duel' : paused ? 'Play' : 'Pause';
        if (!watch) { get('watch-readout').textContent = 'Select an AI to watch a one-on-one benchmark duel.'; return; }
        var result = watch.summary(), input = watch.replay.inputs[watch.replay.inputs.length - 1];
        get('watch-readout').textContent = result.seconds.toFixed(2) + 's / '+watch.replay.options.duration+'s · ' + (result.done ? result.outcome === 'player-win' ? 'Test pilot wins' : result.outcome === 'opponent-win' ? 'Opponent wins' : 'Time limit' : paused ? 'Paused' : 'Flying') +
            '\nPilot: ' + result.profile + '\nHull ' + result.playerHull.toFixed(0) + '/' + result.playerMaxHull + ' · shield ' + result.playerShield.toFixed(0) + '/' + result.playerMaxShield +
            '\nOpponent: ' + result.opponentProfile + '\nHull ' + result.opponentHull.toFixed(0) + '/' + result.opponentMaxHull + ' · shield ' + result.opponentShield.toFixed(0) + '/' + result.opponentMaxShield +
            '\nGuns: ' + result.weapon + ' / ' + result.opponentWeapon + '\nOpponent mode: ' + view().combat.enemies[0].mode +
            (input ? '\nPitch ' + input.pitch.toFixed(2) + ' · yaw ' + input.yaw.toFixed(2) + '\nThrottle ' + Math.round(input.throttle * 100) + '% · boost ' + (input.boost ? 'on' : 'off') + ' · fire ' + (input.fire ? 'on' : 'off') : '\nWaiting to start');
    }
    [get('watch-profile'),get('watch-opponent-profile')].forEach(function (control) {
        model.profiles.forEach(function (p, i) { var option=document.createElement('option');option.value=String(i);option.textContent=p.name+' · '+p.species;control.appendChild(option); });
    });
    DW.retailWeapons.forEach(function (w, i) { var option=document.createElement('option');option.value=String(i);option.textContent=w.name;get('watch-weapon').appendChild(option); });
    [['watch-art','ally-art'],['watch-enemy-art','enemy-art']].forEach(function (ids) {
        var destination = get(/** @type {'watch-art'|'watch-enemy-art'} */ (ids[0])), source = get(/** @type {'ally-art'|'enemy-art'} */ (ids[1]));
        Array.from(source.options).forEach(function (option) { destination.appendChild(option.cloneNode(true)); });
        destination.value=source.value;destination.onchange=function(){source.value=destination.value;source.dispatchEvent(new Event('change'));blurActiveControl();};
    });
    [get('watch-pilot'), get('watch-start'), get('watch-skill'), get('watch-seed'),get('watch-profile'),get('watch-opponent-profile'),get('watch-weapon'),get('watch-defense')].forEach(function (control) {
        control.onchange = function () { if(control===get('watch-weapon'))watchOpponentWeapon=-2;pause(); reset(); blurActiveControl(); };
    });
    get('watch-camera').onchange = function () { updateWatch(); pose(); blurActiveControl(); };
    get('watch-play').onclick = function () {
        if (!watch) return;
        if (!paused) pause();
        else { if (watch.summary().done) reset(); resume(); }
        updateWatch(); blurActiveControl();
    };
    get('watch-restart').onclick = function () { pause(); reset(); blurActiveControl(); };
    get('combat-mode').onchange = function () {
        pause();
        reset();
    };
    select.onchange = function () {
        reset();
        labels();
        banks();
    };
    get('diameter').onchange = function (e) {
        var asteroid = session.snapshot().asteroid, d = Number(get('diameter').value);
        if (!Number.isFinite(d) || d < 200 || d > 4000) {
            get('diameter').value = String(asteroid.radius * units * 2);
            return;
        }
        asteroid.radius = d / 2 / units;
        reset();
    };
    get('reset').onclick = function () {
        reset();
        blurActiveControl();
    };
    function blurActiveControl() {
        var active = document.activeElement;
        if (active instanceof HTMLElement)
            active.blur();
    }
    function resume() {
        if (!watch && session.snapshot().combat.dead) {
            status.textContent = 'Training over · Restart training to fly again';
            return;
        }
        DW.audio.unlock();
        comms.unlock();
        clear();
        controls.resetButtons();
        paused = false;
        document.body.classList.add('flight-active');
        blurActiveControl();
        status.textContent = 'Flight controls active · Esc pauses';
        if (watch) { status.textContent = 'Watching test pilot · Esc pauses'; updateWatch(); }
    }
    /** @param {unknown} [error] */
    function captureFailure(error) {
        pause();
        if (error instanceof Error && error.message)
            status.dataset.captureError = error.message;
        else if (!status.dataset.captureError)
            status.dataset.captureError = 'Pointer lock rejected by browser';
        status.textContent = 'Mouse capture unavailable. Retry Fly or select Controller / keyboard.';
    }
    get('fly').onclick = function () {
        if (watch) { if (watch.summary().done) reset(); resume(); return; }
        if (session.snapshot().combat.dead)
            reset();
        if (controls.view().inputMode !== 'mouse') {
            resume();
            return;
        }
        controls.capture();
    };
    function nextWeapon() {
        if (watch) return;
        gunSelect.selectedIndex = (gunSelect.selectedIndex + 1) % gunSelect.options.length;
        gunLabels();
    }
    var controls = DW.flightControls.mount(host, {
        pause: pause, resume: resume, captureFailure: captureFailure,
        isPaused: function () {
            return paused;
        }, isDead: function () {
            return view().combat.dead;
        },
        nextWeapon: nextWeapon, nextTarget: function () {
            DW.training.cycle(session.snapshot().combat);
        },
        nextRadarRange: function () {
            flightHud.cycleRadarRange();
        },
        selectProfile: function (index) {
            if (watch) return;
            select.value = String(index);
            select.dispatchEvent(new Event('change'));
        },
        toggleDiagnostics: diagnostics.toggleDiagnostics, togglePerformance: diagnostics.togglePerformance
    });
    /** @param {number} t */
    function frame(t) {
        var timing = diagnostics.beginFrame(t, paused);
        if (!timing) {
            requestAnimationFrame(frame);
            return;
        }
        var elapsed = timing.elapsed;
        var demand = controls.sample();
        if (!paused) {
            var before = view(), lastHit = before.combat.lastHit, shield = before.combat.shield, fired = before.guns.fired, contact = before.contact;
            if (watch) {
                var previousTime = watch.summary().seconds;
                watch.advance(elapsed, Number(get('watch-speed').value));
                elapsed = watch.summary().seconds - previousTime;
                if (view().guns.fired > fired) DW.audio.playGunshot();
                if (view().combat.lastHit > lastHit) DW.audio.playImpact(1);
                if (watch.summary().done) pause();
            } else session.advance(elapsed, demand, { profile: profile(), weapon: weapon() });
            var after = view();
            if (!watch) controls.haptics(elapsed, {boost: !!demand.boost, hit: after.combat.lastHit > lastHit, shieldBreak: shield > 0 && after.combat.shield <= 0, fire: after.guns.fired > fired, contact: after.contact && !contact});
            if (!watch && after.combat.dead) {
                pause();
                status.textContent = 'Training over · Restart training to try again';
            }
            pose();
            status.textContent = watch ? (watch.summary().done ? 'Duel complete · Replay duel or choose another pilot' : 'Watching test pilot · Esc pauses') : after.contact ? 'Surface contact · throttle cut' : document.pointerLockElement === host ? 'Mouse captured · Esc pauses & releases' : 'Flight controls active';
        }
        var currentView = view();
        if (!paused) {
            if (!watch) currentView.world.elapsedSeconds += elapsed;
            comms.update(elapsed, currentView.combat, currentView.state);
        }
        var appearance = presentation.appearance(), comparison = diagnostics.settings();
        presentation.render(currentView, appearance, comparison, elapsed);
        var inputView = controls.view();
        if (watch) inputView.showMouseStick = false;
        flightHud.render(Object.assign({}, currentView, { units: units, paused: paused, speakerId: comms.speakerId(), weapon: weapon() }, inputView, appearance));
        if (watch) get('combat-status').textContent = 'AI DUEL / ' + (watch.summary().category === 'perfect' ? 'PERFECT' : watch.summary().flavor.toUpperCase()) + ' VS ' + currentView.combat.enemies[0].pilot.toUpperCase();
        updateWatch();
        diagnostics.endFrame(timing, paused, comparison, presentation.renderStats);
        requestAnimationFrame(frame);
    }
    labels();
    banks();
    var importError='';
    try {
        var imported=DW.flightDuel.readWatchSearch(location.search);
        if(imported){
            watchDuration=imported.duration;watchOpponentWeapon=imported.opponentWeapon;
            get('watch-pilot').value=imported.category==='perfect'?'perfect':'human-'+imported.flavor;
            get('watch-start').value=imported.start;get('watch-skill').value=String(imported.skill);get('watch-seed').value=String(imported.seed);
            get('watch-profile').value=String(imported.profile);get('watch-opponent-profile').value=String(imported.opponentProfile);
            get('watch-weapon').value=String(imported.weapon);get('watch-defense').value=imported.unshielded?'unshielded':'retail';
        }
    }catch(error){importError='Could not load study case: '+(error instanceof Error?error.message:String(error));}
    reset();
    if(importError)status.textContent=importError;
    requestAnimationFrame(frame);
}());
