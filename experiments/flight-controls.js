(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').ControlActions} ControlActions */
    /** @typedef {import('./types').ControlEnvironment} ControlEnvironment */
    /** @typedef {import('./types').Mapping} Mapping */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    /** Shared UI component: flight pages need no touch-specific markup.
     * @param {Document} document @param {HTMLSelectElement} inputMode */
    function mountTouchUi(document, inputMode) {
        // Shared flight UI owns its touch component; pages only mount flightControls.
        if (inputMode.options && !Array.from(inputMode.options).some(function (option) { return option.value === 'touch'; })) {
            var touchOption = document.createElement('option');
            touchOption.value = 'touch'; touchOption.textContent = 'Touch / mobile (experimental)';
            inputMode.appendChild(touchOption);
        }
        if (!document.getElementById('touch-controls')) {
            var touchContainer = document.createElement('div');
            touchContainer.innerHTML = "<div id=\"touch-controls\" aria-label=\"Touch flight controls\">\n<button id=\"flight-fullscreen\" class=\"touch-fullscreen\" type=\"button\">Full screen</button>\n<button data-touch=\"pause\" class=\"touch-pause\">Pause</button>\n<div id=\"touch-stick\" role=\"group\" aria-label=\"Drag to steer pitch and yaw\"><span id=\"touch-knob\"></span><span class=\"stick-caption\">STEER</span></div>\n<div class=\"touch-actions\"><button data-touch=\"target\">Target</button><button data-touch=\"weapon\">Weapon</button><button data-touch=\"boost\">Boost</button><button data-touch=\"fire\" class=\"touch-fire\">Fire</button></div>\n<div class=\"touch-throttle\"><button data-touch=\"down\" aria-label=\"Decrease throttle\">−</button><span>THR</span><button data-touch=\"up\" aria-label=\"Increase throttle\">+</button></div>\n</div>";
            var touchElement = touchContainer.firstElementChild;
            if (touchElement) document.body.appendChild(touchElement);
        }
    }
    // Environment injection keeps browser wiring testable without changing input math.
    /** @param {HTMLElement} host @param {ControlActions} actions @param {ControlEnvironment} [environment] */
    function mount(host, actions, environment) {
        environment = environment || { document: globalThis.document, window: globalThis.window, navigator: globalThis.navigator };
        var document = environment.document, window = environment.window, navigator = environment.navigator;
        var get = DW.experimentDom(document);
        var inputMode = get('input-mode'), device = get('device'), bindingHost = get('bindings'), input = DW.flightInput;
        var sensitivity = get('sensitivity'), preferredDevice = '';
        try {
            var savedMode = window.localStorage.getItem('driftworks.flight.input-mode');
            if (savedMode === 'mouse' || savedMode === 'controller') inputMode.value = savedMode;
            var savedSensitivity = Number(window.localStorage.getItem('driftworks.flight.sensitivity'));
            if (Number.isFinite(savedSensitivity) && savedSensitivity >= .3 && savedSensitivity <= 3)
                sensitivity.value = String(savedSensitivity);
            preferredDevice = window.localStorage.getItem('driftworks.flight.device') || '';
        } catch (error) { /* Defaults work without storage. */ }
        sensitivity.oninput = function () {
            try { window.localStorage.setItem('driftworks.flight.sensitivity', sensitivity.value); } catch (error) { /* Optional preference. */ }
        };
        var keys = /** @type {Record<string, boolean>} */ ({}), mouse = [0, 0], mapping = input.defaults(true), padSignature = '', lastPad = /** @type {number | null} */ (null), previousButtons = { bank: false, lock: false, pause: false };
        var rumble = get('rumble');
        rumble.checked = true;
        try { rumble.checked = window.localStorage.getItem('driftworks.flight.rumble') !== 'off'; } catch (error) { /* Optional preference. */ }
        /** @type {GamepadHapticActuator | null} */
        var actuator = null;
        var pulseTime = 0, pulseStrong = 0, pulseWeak = 0, refresh = 0, vibrating = false;
        function stopRumble() {
            if (actuator && vibrating) {
                try { actuator.reset().catch(function () {}); } catch (error) { /* Unsupported or disconnected device. */ }
            }
            vibrating = false;
            pulseTime = 0;
            refresh = 0;
        }
        rumble.onchange = function () {
            stopRumble();
            try { window.localStorage.setItem('driftworks.flight.rumble', rumble.checked ? 'on' : 'off'); } catch (error) { /* Optional preference. */ }
        };
        /** @param {number} dt @param {{boost?: boolean; hit?: boolean; shieldBreak?: boolean; fire?: boolean; contact?: boolean; throat?:number; transit?:boolean}} feedback */
        function haptics(dt, feedback) {
            var pad = pads().find(function (p) { return String(p.index) === device.value; });
            var next = pad && pad.vibrationActuator;
            if (next !== actuator) { stopRumble(); actuator = next || null; }
            if (!actuator || typeof actuator.playEffect !== 'function' || actions.isPaused() || !rumble.checked || (inputMode.value === 'mouse' && mouseActive)) { stopRumble(); return; }
            pulseTime = Math.max(0, pulseTime - dt);
            refresh -= dt;
            var strong = feedback.shieldBreak ? .8 : feedback.hit ? .55 : feedback.contact ? .65 : feedback.transit ? .3 : 0;
            var weak = strong ? .35 : feedback.fire ? .2 : 0;
            if ((strong || weak) && (pulseTime <= 0 || strong >= pulseStrong)) {
                pulseStrong = strong; pulseWeak = weak;
                pulseTime = feedback.shieldBreak ? .25 : feedback.transit ? .18 : strong ? .14 : .055;
                refresh = 0;
            }
            var throat=Math.max(0,Math.min(1,feedback.throat||0));
            strong = Math.max(throat*.08,feedback.boost ? .07 : 0, pulseTime > 0 ? pulseStrong : 0);
            weak = Math.max(throat*.14,feedback.boost ? .12 : 0, pulseTime > 0 ? pulseWeak : 0);
            if (!strong && !weak) { stopRumble(); return; }
            if (refresh > 0) return;
            refresh = .075;
            vibrating = true;
            try {
                actuator.playEffect('dual-rumble', {duration: 110, startDelay: 0, strongMagnitude: strong, weakMagnitude: weak}).catch(function () {});
            } catch (error) { /* Haptics must never interrupt flight. */ }
        }
        var steeringPreset = get('steering-preset');
        var mouseActive = true, uncapturedMouse=false, capturePending=false, captureGeneration=0, lastAxes = /** @type {number[]} */ ([]);
        var padActivity = /** @type {Record<string, {axes: number[]; buttons: boolean[]}>} */ ({});
        steeringPreset.value = 'medium-soft';
        try {
            var savedSteering = window.localStorage.getItem('driftworks.flight.steering');
            if (savedSteering === 'medium-soft' || savedSteering === 'original' || savedSteering === 'wide-linear')
                steeringPreset.value = savedSteering;
        } catch (error) { /* Storage can be unavailable in private or embedded browsers. */ }
        steeringPreset.onchange = function () {
            actions.pause();
            clear();
            try { window.localStorage.setItem('driftworks.flight.steering', steeringPreset.value); } catch (error) { /* Session controls still work. */ }
        };
        mountTouchUi(document, inputMode);
        var fullscreenButton = document.getElementById('flight-fullscreen');
        function enterFullscreen() {
            if (document.fullscreenElement || !document.documentElement || !document.documentElement.requestFullscreen) return;
            document.documentElement.requestFullscreen().catch(function () {
                if (fullscreenButton) fullscreenButton.title = 'Fullscreen was declined. Tap Full screen to retry.';
            });
        }
        if (fullscreenButton) fullscreenButton.onclick = function () {
            if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
            else enterFullscreen();
        };
        get('fly').addEventListener('click', function () { if (inputMode.value === 'touch') enterFullscreen(); });
        document.addEventListener('fullscreenchange', function () {
            if (fullscreenButton) fullscreenButton.textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
        });
        // Pointer IDs keep both thumbs independent; cancellation always releases demand.
        var touch = {pitch: 0, yaw: 0, fire: false, boost: false, throttleRate: 0};
        var touchRoot = document.getElementById('touch-controls');
        var touchStick = document.getElementById('touch-stick');
        var touchKnob = document.getElementById('touch-knob');
        var stickPointer = -1;
        function clearTouch() {
            touch.pitch = touch.yaw = touch.throttleRate = 0;
            touch.fire = touch.boost = false;
            stickPointer = -1;
            if (touchKnob && touchKnob.style) touchKnob.style.transform = '';
            if (touchRoot && touchRoot.querySelectorAll) touchRoot.querySelectorAll('button').forEach(function (button) { button.classList.remove('held'); });
        }
        function touchLayout() {
            document.body.classList.toggle('touch-flight', inputMode.value === 'touch');
            clearTouch();
        }
        function touchDevice() {
            return !!(window.matchMedia && (window.matchMedia('(pointer: coarse)').matches ||
                (navigator.maxTouchPoints > 0 && !window.matchMedia('(any-pointer: fine)').matches)));
        }
        if (touchRoot && touchStick && touchRoot.querySelectorAll) {
            // Old desktop preferences must not disable the phone's default controls.
            // Keep deliberate touch-device overrides separate from the desktop choice.
            var touchPreference = '';
            try { if (window.localStorage.getItem('driftworks.flight.input-mode') === 'touch') inputMode.value = 'touch'; } catch (error) { /* Optional preference. */ }
            try { touchPreference = window.localStorage.getItem('driftworks.flight.touch-input-mode') || ''; } catch (error) { /* Detection works without storage. */ }
            var forcedTouch = new URLSearchParams(window.location.search).get('mobile') === '1';
            if (forcedTouch || touchDevice() && !/^(mouse|controller)$/.test(touchPreference)) inputMode.value = 'touch';
            else if (touchDevice() && /^(mouse|controller)$/.test(touchPreference)) inputMode.value = touchPreference;
            touchLayout();
            /** @param {PointerEvent} e */
            function moveTouch(e) {
                if (e.pointerId !== stickPointer) return;
                if (!touchStick) return;
                var rect = touchStick.getBoundingClientRect(), radius = rect.width * .32;
                var x = (e.clientX - rect.left - rect.width / 2) / radius;
                var y = (e.clientY - rect.top - rect.height / 2) / radius;
                var length = Math.max(1, Math.hypot(x, y)); x /= length; y /= length;
                var demand = input.stickDemand([x, y], .08, 1.4);
                touch.pitch = demand[0]; touch.yaw = demand[1];
                if (touchKnob && touchKnob.style) touchKnob.style.transform = 'translate(' + x * radius + 'px,' + y * radius + 'px)';
            }
            touchStick.addEventListener('pointerdown', function (e) {
                if (actions.isPaused() || stickPointer !== -1 || !touchStick) return;
                e.preventDefault(); stickPointer = e.pointerId; touchStick.setPointerCapture(e.pointerId); moveTouch(e);
            });
            touchStick.addEventListener('pointermove', moveTouch);
            ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) {
                if (!touchStick) return;
                touchStick.addEventListener(name, function (e) {
                    if (/** @type {PointerEvent} */(e).pointerId === stickPointer) {
                        stickPointer = -1; touch.pitch = touch.yaw = 0;
                        if (touchKnob && touchKnob.style) touchKnob.style.transform = '';
                    }
                });
            });
            touchRoot.querySelectorAll('button[data-touch]').forEach(function (button) {
                var pointer = -1, name = button.getAttribute('data-touch');
                button.addEventListener('pointerdown', function (event) {
                    var e = /** @type {PointerEvent} */(event);
                    if (actions.isPaused() || pointer !== -1) return;
                    e.preventDefault(); pointer = e.pointerId; button.setPointerCapture(pointer); button.classList.add('held');
                    if (name === 'fire') touch.fire = true;
                    if (name === 'boost') touch.boost = true;
                    if (name === 'up') touch.throttleRate = 1;
                    if (name === 'down') touch.throttleRate = -1;
                    if (name === 'target') actions.nextTarget();
                    if (name === 'weapon') actions.nextWeapon();
                    if (name === 'pause') actions.pause();
                });
                ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (eventName) {
                    button.addEventListener(eventName, function (event) {
                        if (/** @type {PointerEvent} */(event).pointerId !== pointer) return;
                        pointer = -1; button.classList.remove('held');
                        if (name === 'fire') touch.fire = false;
                        if (name === 'boost') touch.boost = false;
                        if (name === 'up' && touch.throttleRate > 0 || name === 'down' && touch.throttleRate < 0) touch.throttleRate = 0;
                    });
                });
            });
        }
        function clear() {
            stopRumble();
            clearTouch();
            keys = /** @type {Record<string, boolean>} */ ({});
            mouse = [0, 0];
        }
        function resetButtons() {
            previousButtons = { bank: false, lock: false, pause: false };
        }
        function release() {
            uncapturedMouse=false;capturePending=false;captureGeneration++;
            if (document.pointerLockElement === host)
                document.exitPointerLock();
        }
        /** @param {unknown} [error] */function captureFallback(error){
            if(!capturePending)return;capturePending=false;
            if(inputMode.value!=='mouse'||actions.isDead()){actions.captureFailure(error);return;}
            if(uncapturedMouse&&!actions.isPaused())return;
            uncapturedMouse=true;mouseActive=true;actions.resume();
        }
        // Automatic starts cannot request pointer lock without a user gesture.
        // Enable the existing absolute cursor steering path before simulation starts.
        function startUncaptured() {
            capturePending=false;captureGeneration++;
            uncapturedMouse=inputMode.value==='mouse';mouseActive=true;
            actions.resume();
        }
        function capture() {
            uncapturedMouse=false;capturePending=true;var generation=++captureGeneration;
            if (!host.requestPointerLock) {
                captureFallback();
                return;
            }
            try {
                var result = host.requestPointerLock();
                if (result && result.catch)
                    result.catch(/** @param {unknown} error */function(error){if(generation===captureGeneration)captureFallback(error);});
            }
            catch (error) {
                captureFallback(error);
            }
        }
        function pads() {
            try {
                return navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(function (p) {
                    return p !== null;
                }).filter(function (p) {
                    return p.connected;
                }) : [];
            }
            catch (error) {
                return [];
            }
        }
        /** @param {Gamepad} pad */
        function configure(pad) {
            stopRumble();
            lastAxes = [];
            mapping = input.defaults(pad.mapping === 'standard', pad.id);
            try {
                /** @type {unknown} */
                var saved = JSON.parse(window.localStorage.getItem('driftworks.flight.bindings.' + pad.id) || 'null');
                if (saved && typeof saved === 'object') {
                    Object.keys(mapping).forEach(function (key) {
                        var name = /** @type {keyof Mapping} */ (key);
                        var value = /** @type {Record<string, unknown>} */ (saved)[key];
                        if (typeof mapping[name] === 'boolean' && typeof value === 'boolean')
                            mapping[/** @type {'pitchInvert'} */ (name)] = value;
                        else if (typeof mapping[name] === 'number' && typeof value === 'number' && Number.isFinite(value))
                            mapping[/** @type {'pitch'} */ (name)] = name === 'deadzone' ? Math.max(0, Math.min(.5, value)) : Math.max(-1, Math.floor(value));
                    });
                }
            } catch (error) { /* Defaults work when storage is unavailable. */ }
            bindingHost.textContent = '';
            bindingHost.hidden = pad.mapping === 'standard';
            get('controller-layout').hidden = pad.mapping !== 'standard';
            get('deadzone').value = String(mapping.deadzone);
            /** @type {(Exclude<keyof Mapping, 'deadzone' | `${string}Invert`>)[]} */ (['pitch', 'yaw', 'roll', 'throttle', 'fire', 'boost', 'bank', 'pause', 'up', 'down', 'lock']).forEach(function (name) {
                var label = document.createElement('label');
                label.textContent = (name === 'yaw' && pad.mapping !== 'standard' ? 'Yaw / twist axis' : name === 'roll' && pad.mapping !== 'standard' ? 'Roll / stick X axis' : name === 'throttle' ? 'Throttle axis (absolute)' : name === 'up' ? 'Throttle increase button' : name === 'down' ? 'Throttle decrease button' : name) + ' ';
                var selectBinding = document.createElement('select');
                selectBinding.setAttribute('aria-label', name + ' binding');
                var isAxis = ['pitch', 'yaw', 'roll', 'throttle'].indexOf(name) >= 0, count = isAxis ? pad.axes.length : pad.buttons.length;
                for (var n = -1; n < count; n++) {
                    var option = document.createElement('option');
                    option.value = String(n);
                    option.textContent = n < 0 ? 'None' : (isAxis ? 'Axis ' : 'Button ') + n;
                    selectBinding.appendChild(option);
                }
                selectBinding.value = String(mapping[name] < count ? mapping[name] : -1);
                mapping[name] = Number(selectBinding.value);
                selectBinding.onchange = function () {
                    mapping[name] = Number(selectBinding.value);
                    saveBindings();
                };
                label.appendChild(selectBinding);
                if (isAxis) {
                    var invert = document.createElement('input');
                    invert.type = 'checkbox';
                    invert.checked = mapping[ /** @type {'pitchInvert' | 'yawInvert' | 'rollInvert' | 'throttleInvert'} */(name + 'Invert')];
                    invert.setAttribute('aria-label', 'Invert ' + name);
                    invert.onchange = function () {
                        mapping[ /** @type {'pitchInvert' | 'yawInvert' | 'rollInvert' | 'throttleInvert'} */(name + 'Invert')] = invert.checked;
                        saveBindings();
                    };
                    label.appendChild(invert);
                    label.appendChild(document.createTextNode(' invert'));
                }
                bindingHost.appendChild(label);
            });
            previousButtons = { bank: false, lock: false, pause: false };
        }
        function saveBindings() {
            var pad = pads().find(function (p) { return String(p.index) === device.value; });
            if (!pad) return;
            try { window.localStorage.setItem('driftworks.flight.bindings.' + pad.id, JSON.stringify(mapping)); }
            catch (error) { /* Bindings remain usable for this session. */ }
        }
        device.onchange = function () {
            actions.pause();
            lastPad = null;
            var pad = pads().find(function (p) {
                return String(p.index) === device.value;
            });
            if (pad) {
                lastPad = pad.index;
                preferredDevice = pad.id;
                try { window.localStorage.setItem('driftworks.flight.device', preferredDevice); } catch (error) { /* Optional preference. */ }
                configure(pad);
            }
        };
        get('deadzone').onchange = function (e) {
            mapping.deadzone = Math.max(0, Math.min(.5, Number(get('deadzone').value) || 0));
            get('deadzone').value = String(mapping.deadzone);
            saveBindings();
        };
        inputMode.onchange = function () {
            actions.pause();
            touchLayout();
            try {
                window.localStorage.setItem('driftworks.flight.input-mode', inputMode.value);
                if (touchRoot && touchDevice()) window.localStorage.setItem('driftworks.flight.touch-input-mode', inputMode.value);
            } catch (error) { /* Optional preference. */ }
        };
        document.addEventListener('pointerlockchange', function () {
            if (document.pointerLockElement === host) {
                uncapturedMouse=false;capturePending=false;
                if (actions.isDead()) {
                    actions.pause();
                    return;
                }
                actions.resume();
                document.body.classList.add('mouse-captured');
            }
            else if(!uncapturedMouse)
                actions.pause();
        });
        document.addEventListener('pointerlockerror', captureFallback);
        window.addEventListener('blur', actions.pause);
        document.addEventListener('visibilitychange', function () {
            if (document.hidden)
                actions.pause();
        });
        window.addEventListener('keydown', function (e) {
            // Leave browser and OS shortcuts alone; Shift by itself remains boost.
            if (e.ctrlKey || e.altKey || e.metaKey) {
                keys = {};
                return;
            }
            if (e.code === 'F3' && !e.repeat) {
                e.preventDefault();
                actions.toggleDiagnostics();
                return;
            }
            if (e.code === 'Escape') {
                actions.pause();
                return;
            }
            if (e.target && 'tagName' in e.target && /INPUT|SELECT|TEXTAREA|BUTTON/.test(String(e.target.tagName)))
                return;
            if (e.code === 'KeyC' && !actions.isPaused()) {
                mouse = [0, 0];
                e.preventDefault();
                return;
            }
            if (e.code === 'KeyP' && !e.repeat) {
                actions.togglePerformance();
                return;
            }
            if (e.code === 'KeyL' && !e.repeat && !actions.isPaused()) {
                e.preventDefault();
                actions.toggleTargetLock();
                return;
            }
            if (e.code === 'Tab' && !actions.isPaused()) {
                e.preventDefault();
                actions.nextTarget();
                return;
            }
            if (e.code === 'KeyV' && !e.repeat) {
                actions.nextRadarRange();
                e.preventDefault();
                return;
            }
            if (e.code === 'KeyG' && !e.repeat) {
                actions.nextWeapon();
                return;
            }
            if (/^Digit[1-4]$/.test(e.code)) {
                actions.selectProfile(Number(e.code.slice(-1)) - 1);
                return;
            }
            if (['Space', 'KeyW', 'KeyS', 'KeyX', 'KeyQ', 'KeyE', 'KeyA', 'KeyD', 'KeyR', 'KeyF', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) {
                e.preventDefault();
                if (!actions.isPaused())
                    keys[e.code] = true;
            }
        });
        window.addEventListener('keyup', function (e) {
            delete keys[e.code];
        });
        host.addEventListener('contextmenu', function (e) {
            e.preventDefault();
        });
        document.addEventListener('mousedown', function (e) {
            if (!actions.isPaused() && (document.pointerLockElement === host || uncapturedMouse&&host.contains(/** @type {Node} */(e.target))) && (e.button === 0 || e.button === 2))
                keys['mouse' + e.button] = true;
        });
        document.addEventListener('mouseup', function (e) {
            delete keys['mouse' + e.button];
        });
        document.addEventListener('mousemove', function (e) {
            if(!actions.isPaused()&&uncapturedMouse&&inputMode.value==='mouse'){
                var rect=host.getBoundingClientRect();
                if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)return;
                mouseActive=true;stopRumble();
                mouse=input.moveStick([0,0],e.clientX-rect.left-rect.width/2,e.clientY-rect.top-rect.height/2,stickRange(),Number(sensitivity.value));return;
            }
            if (!actions.isPaused() && document.pointerLockElement === host && (e.movementX || e.movementY)) {
                mouseActive = true;
                if (inputMode.value === 'mouse') stopRumble();
                mouse = DW.flightInput.moveStick(mouse, e.movementX, e.movementY, stickRange(), Number(get('sensitivity').value));
            }
        });
        host.addEventListener('mouseleave',function(){if(uncapturedMouse&&!actions.isPaused())actions.pause();});
        function stickRange() {
            var shorter = Math.min(host.clientWidth, host.clientHeight);
            if (steeringPreset.value === 'original') return Math.min(160, shorter * .2);
            return steeringPreset.value === 'medium-soft' ? Math.min(240, shorter * .3) : shorter * .45;
        }
        /** @param {string} a @param {string} b */
        function axis(a, b) {
            return (keys[a] ? 1 : 0) - (keys[b] ? 1 : 0);
        }
        function sample() {
            if (inputMode.value === 'touch') {
                if (actions.isPaused()) clearTouch();
                return {pitch: touch.pitch, yaw: touch.yaw, fire: touch.fire, boost: touch.boost, throttleRate: touch.throttleRate, throttle: null};
            }
            var connected = pads(), signature = connected.map(function (p) {
                return p.index + ':' + p.id;
            }).join('|');
            if (signature !== padSignature) {
                var selected = device.value;
                padSignature = signature;
                device.textContent = '';
                connected.forEach(function (p) {
                    var option = document.createElement('option');
                    option.value = String(p.index);
                    option.textContent = p.id;
                    device.appendChild(option);
                });
                if (connected.some(function (p) {
                    return String(p.index) === selected;
                }))
                    device.value = selected;
                var preferred = connected.find(function (p) { return p.id === preferredDevice; });
                if (preferred) device.value = String(preferred.index);
                if (!connected.length) {
                    var empty = document.createElement('option');
                    empty.value = '';
                    empty.textContent = 'No device detected';
                    device.appendChild(empty);
                }
            }
            if (lastPad !== null && !connected.some(function (p) {
                return p.index === lastPad;
            })) {
                actions.pause();
                lastPad = null;
            }
            // Poll every device: a different connected pad can be picked up at any time.
            var activePad = /** @type {Gamepad | null} */ (null), pressedButton = false;
            var nextActivity = /** @type {typeof padActivity} */ ({});
            connected.forEach(function (candidate) {
                var id = candidate.index + ':' + candidate.id, prior = padActivity[id];
                var buttons = candidate.buttons.map(function (b) { return b.pressed || b.value > .5; });
                var pressed = buttons.some(function (down, index) { return down && !(prior && prior.buttons[index]); });
                var candidateMapping = candidate.index === lastPad ? mapping : input.defaults(candidate.mapping === 'standard', candidate.id);
                var moved = [candidateMapping.pitch, candidateMapping.yaw, candidateMapping.roll, candidate.mapping === 'standard' ? 3 : -1].some(function (index) {
                    var value = candidate.axes[index];
                    // Absolute throttle may rest at an endpoint; discovery alone is not movement.
                    return Number.isFinite(value) && Math.abs(value) > candidateMapping.deadzone &&
                        Math.abs(value - (prior ? prior.axes[index] || 0 : 0)) > .02;
                });
                nextActivity[id] = {axes: Array.from(candidate.axes), buttons: buttons};
                if (pressed || (moved && !actions.isPaused())) {
                    if (!activePad || pressed) { activePad = candidate; pressedButton = pressed; }
                }
            });
            padActivity = nextActivity;
            if (activePad) device.value = String(activePad.index);
            var pad = connected.find(function (p) {
                return String(p.index) === device.value;
            });
            if (lastPad !== null && !pad) {
                actions.pause();
                lastPad = null;
            }
            if (pad && pad.index !== lastPad) {
                lastPad = pad.index;
                configure(pad);
            }
            get('device-status').textContent = pad ? (/thrustmaster|044f|t[ .-]?16000|t[ .-]?flight/i.test(pad.id) ? 'Thrustmaster joystick - ' : pad.mapping !== 'standard' ? 'Generic joystick - ' : '') + pad.id : 'Connect a controller and press a button to detect it.';
            get('device-live').textContent = pad ? 'Axes: ' + pad.axes.map(function (v, i) {
                return i + ':' + v.toFixed(2);
            }).join(' ') + ' | Buttons: ' + pad.buttons.map(function (b, i) {
                return b.pressed ? i : null;
            }).filter(function (v) {
                return v !== null;
            }).join(', ') : '';
            var controls = pad ? input.read(pad, mapping) : { pitch: 0, yaw: 0, roll: 0, side: 0, vertical: 0, throttle: null, throttleRate: 0, fire: false, boost: false, bank: false, lock: false, pause: false };
            if (activePad) {
                mouseActive = false;
                mouse = [0, 0];
                if (pressedButton && actions.isPaused() && !actions.isDead() && !controls.pause && !document.hidden)
                    actions.resume();
            }
            // A held stick or tiny hardware noise must not reclaim input after mouse movement.
            if (pad) {
                var padAxes = pad.axes;
                var changedStick = [mapping.pitch, mapping.yaw, mapping.roll, pad.mapping === 'standard' ? 3 : -1].some(function (index) {
                    var value = padAxes[index];
                    return Number.isFinite(value) && Math.abs(value) > mapping.deadzone && Math.abs(value - (lastAxes[index] || 0)) > .02;
                });
                if (!actions.isPaused() && changedStick) {
                    mouseActive = false;
                    mouse = [0, 0];
                }
                lastAxes = Array.from(pad.axes);
            } else lastAxes = [];
            if (controls.pause && !previousButtons.pause)
                actions.pause();
            if (!actions.isPaused() && controls.bank && !previousButtons.bank) {
                actions.nextWeapon();
            }
            if (!actions.isPaused() && controls.lock && !previousButtons.lock) actions.toggleTargetLock();
            previousButtons = { bank: controls.bank, lock: controls.lock, pause: controls.pause };
            var look = inputMode.value === 'mouse' && mouseActive ? input.stickDemand(mouse, .08, steeringPreset.value === 'medium-soft' ? 1.6 : 1) : [0, 0];
            return { throttle: controls.throttle, throttleRate: axis('KeyW', 'KeyS') + controls.throttleRate, stop: keys.KeyX, pitch: axis('ArrowUp', 'ArrowDown') + look[0] + controls.pitch, yaw: axis('ArrowLeft', 'ArrowRight') + look[1] + controls.yaw, roll: axis('KeyQ', 'KeyE') + controls.roll, side: axis('KeyD', 'KeyA') + (controls.side || 0), vertical: axis('KeyR', 'KeyF') + (controls.vertical || 0), boost: keys.ShiftLeft || keys.ShiftRight || controls.boost, fire: keys.Space || keys.mouse0 || keys.mouse2 || controls.fire };
        }
        function view() {
            return { mouse: mouse, inputMode: inputMode.value, uncapturedMouse:uncapturedMouse, stickRange: stickRange(), showMouseStick: mouseActive && inputMode.value === 'mouse' };
        }
        return { haptics: haptics, sample: sample, view: view, clear: clear, resetButtons: resetButtons, capture: capture, startUncaptured:startUncaptured, release: release };
    }
    DW.flightControls = { mount: mount };
}());
