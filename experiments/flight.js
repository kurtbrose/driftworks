(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    var get = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).experimentDom(document);
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks), model = DW.arcade, host = get('viewer');
    var session = DW.flightSession.create({ hullHit: function (craft, start, end) {
            return presentation.hullHit(craft, start, end, session.snapshot().combat.wave);
        }, terrainHit: function (start, end) {
            var asteroid = session.snapshot().asteroid;
            return DW.flightGuns.intersect(start, end, asteroid.radius, function (point) {
                return DW.scene3d.rockField(asteroid, /** @type {[number, number, number]} */ (point));
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
        return DW.retailWeapons[Number(gunSelect.value)];
    }
    function gunLabels() {
        var w = weapon();
        get('gun-stats').textContent = w.speed + ' m/s · ' + w.fireWait + ' s / volley · ' + (w.speed * w.lifetime) + ' m range';
    }
    function banks() {
        gunSelect.textContent = '';
        var indexes = Number(select.value) === 3 ? [1] : Number(select.value) === 2 ? [1, 0] : [0, 1];
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
        return model.profiles[Number(select.value)];
    }
    function labels() {
        var p = profile();
        stats.textContent = p.role + '\nCruise / boost ' + p.maxVelocity[2] + ' / ' + p.afterburnerVelocity[2] + ' m/s\nAccel / decel ' + p.forwardAccel + ' / ' + p.forwardDecel + ' s\nPitch / yaw / roll (s/360°)\n' + p.rotationTime.join(' / ') + '\nDamp / rotdamp ' + p.damp + ' / ' + p.rotdamp;
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
        get('fly').textContent = session.snapshot().combat.dead ? 'Restart flight' : 'Resume flight';
        status.textContent = 'Paused - Resume flight when ready';
    }
    function pose() {
        presentation.pose(session.snapshot().state);
    }
    function reset() {
        clear();
        comms.reset();
        session.reset({ mode: get('combat-mode').value, enabled: get('combat-toggle').checked, profile: model.profiles[Number(select.value) || 0] });
        get('fly').textContent = 'Start flight';
        pose();
    }
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
        if (session.snapshot().combat.dead) {
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
        if (session.snapshot().combat.dead)
            reset();
        if (controls.view().inputMode !== 'mouse') {
            resume();
            return;
        }
        controls.capture();
    };
    function nextWeapon() {
        gunSelect.selectedIndex = (gunSelect.selectedIndex + 1) % gunSelect.options.length;
        gunLabels();
    }
    var controls = DW.flightControls.mount(host, {
        pause: pause, resume: resume, captureFailure: captureFailure,
        isPaused: function () {
            return paused;
        }, isDead: function () {
            return session.snapshot().combat.dead;
        },
        nextWeapon: nextWeapon, nextTarget: function () {
            DW.training.cycle(session.snapshot().combat);
        },
        nextRadarRange: function () {
            flightHud.cycleRadarRange();
        },
        selectProfile: function (index) {
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
            session.advance(elapsed, demand, { profile: profile(), weapon: weapon() });
            if (session.snapshot().combat.dead) {
                pause();
                status.textContent = 'Training over · Restart training to try again';
            }
            pose();
            status.textContent = session.snapshot().contact ? 'Surface contact · throttle cut' : document.pointerLockElement === host ? 'Mouse captured · Esc pauses & releases' : 'Flight controls active';
        }
        var view = session.snapshot();
        if (!paused) {
            view.world.elapsedSeconds += elapsed;
            comms.update(elapsed, view.combat, view.state);
        }
        var appearance = presentation.appearance(), comparison = diagnostics.settings();
        presentation.render(view, appearance, comparison, elapsed);
        var inputView = controls.view();
        flightHud.render(Object.assign({}, view, { units: units, paused: paused, speakerId: comms.speakerId(), weapon: weapon() }, inputView, appearance));
        diagnostics.endFrame(timing, paused, comparison, presentation.renderStats);
        requestAnimationFrame(frame);
    }
    labels();
    banks();
    reset();
    requestAnimationFrame(frame);
}());
