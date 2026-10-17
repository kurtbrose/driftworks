(function () {
    'use strict';
    /** @typedef {import('./types').Mapping} Mapping */
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @param {number} value @param {number} zone */
    function deadzone(value, zone) {
        value = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
        zone = Math.max(0, Math.min(.5, zone));
        return Math.abs(value) <= zone ? 0 : Math.sign(value) * (Math.abs(value) - zone) / (1 - zone);
    }
    // Persistent virtual stick displacement; radial clamp prevents diagonal overdrive.
    /** @param {number[]} position @param {number} dx @param {number} dy @param {number} range @param {number} sensitivity */
    function moveStick(position, dx, dy, range, sensitivity) {
        var x = position[0] + dx * sensitivity / Math.max(1, range), y = position[1] + dy * sensitivity / Math.max(1, range), length = Math.hypot(x, y);
        return length > 1 ? [x / length, y / length] : [x, y];
    }
    /** @param {number[]} position @param {number} zone @param {number} [exponent] */
    function stickDemand(position, zone, exponent) {
        // Linear radial demand keeps equal travel increments equally responsive.
        var length = Math.hypot(position[0], position[1]), demand = Math.pow(deadzone(Math.min(1, length), zone), exponent || 1);
        return length > 0 ? [-position[1] * demand / length, -position[0] * demand / length] : [0, 0];
    }
    /** @param {boolean} standard @param {string} [deviceId] */
    function defaults(standard, deviceId) {
        // Flight sticks use X for bank and twist for yaw. Browser axis layouts
        // vary; every binding remains editable in the controller settings.
        var joystick = !standard && deviceId !== undefined;
        return { pitch: 1, yaw: joystick ? 2 : 0, roll: joystick ? 0 : 2, throttle: standard ? -1 : 3, pitchInvert: standard || joystick, yawInvert: false, rollInvert: false, throttleInvert: true, fire: standard ? 7 : 0, boost: standard ? 0 : 1, bank: standard ? 3 : 2, pause: standard ? 9 : 7, up: joystick ? -1 : 12, down: joystick ? -1 : 13, deadzone: .12 };
    }
    /** @param {Gamepad} pad @param {Mapping} map */
    function read(pad, map) {
        /** @param {'pitch' | 'yaw' | 'roll'} name */
        function axis(name) {
            var index = map[name];
            if (index < 0 || !Number.isFinite(pad.axes[index]))
                return 0;
            return deadzone(pad.axes[index], map.deadzone) * (map[ /** @type {'pitchInvert' | 'yawInvert' | 'rollInvert'} */(name + 'Invert')] ? -1 : 1);
        }
        /** @param {'fire' | 'boost' | 'bank' | 'pause' | 'up' | 'down'} name */
        function button(name) {
            var b = pad.buttons[map[name]];
            return !!(b && (b.pressed || b.value > .5));
        }
        var raw = pad.axes[map.throttle], throttle = map.throttle >= 0 && Number.isFinite(raw) ? Math.max(0, Math.min(1, (1 + (map.throttleInvert ? -raw : raw)) / 2)) : null;
        var stickThrottle = pad.mapping === 'standard' && map.throttle < 0 ? -deadzone(pad.axes[3], map.deadzone) : 0;
        return { pitch: axis('pitch'), yaw: -axis('yaw'), roll: -axis('roll'), throttle: throttle, throttleRate: Math.max(-1, Math.min(1, stickThrottle + (button('up') ? 1 : 0) - (button('down') ? 1 : 0))), fire: button('fire'), boost: button('boost'), bank: button('bank'), pause: button('pause') };
    }
    /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).flightInput = { deadzone: deadzone, moveStick: moveStick, stickDemand: stickDemand, defaults: defaults, read: read };
}());
