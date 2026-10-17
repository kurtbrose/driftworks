(function () {
    'use strict';
    /** @typedef {import('./types').FlightState} State */
    /** @typedef {import('./types').Profile} Profile */
    /** @typedef {import('./types').Weapon} Weapon */
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').PilotInput} Input */
    /** @typedef {{time:number; position:Vector; velocity:Vector}} Sample */
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    var U = DW.sim.METERS_PER_UNIT;
    var VERSION = 'flight-ai-1';
    var flavors = {
        novice: { reaction: .34, sample: .22, noise: 7, gain: 1.25, damping: .12, lead: .75 },
        practiced: { reaction: .20, sample: .14, noise: 3, gain: 1.8, damping: .23, lead: .94 },
        expert: { reaction: .12, sample: .09, noise: 1, gain: 2.2, damping: .30, lead: 1 }
    };
    /** @param {number} x @param {number} [lo] @param {number} [hi] */
    function clamp(x, lo, hi) { return Math.max(lo === undefined ? -1 : lo, Math.min(hi === undefined ? 1 : hi, x)); }
    /** @param {Vector} a @param {Vector} b */
    function dot(a, b) { return a.reduce(function (s, v, i) { return s + v * b[i]; }, 0); }
    /** @param {Vector} a @param {Vector} b */
    function sub(a, b) { return a.map(function (v, i) { return v - b[i]; }); }
    /** @param {State} s @returns {State} */
    function copy(s) { return { eye:s.eye.slice(), right:s.right.slice(), up:s.up.slice(), back:s.back.slice(), velocity:s.velocity.slice(), rates:s.rates.slice(), ramp:s.ramp.slice(), throttle:s.throttle }; }
    /** Reject rather than silently repair illegal or nonfinite control replays.
     * @param {Input} input @returns {Input} */
    function validate(input) {
        var keys = ['pitch', 'yaw', 'roll', 'side', 'vertical', 'throttle', 'boost', 'fire'];
        if (Object.keys(input).some(function (k) { return keys.indexOf(k) < 0; })) throw new Error('Unknown pilot input');
        [input.pitch, input.yaw, input.roll, input.side, input.vertical].forEach(function (v) {
            if (!Number.isFinite(v) || Math.abs(v) > 1) throw new Error('Illegal flight axis');
        });
        if (!Number.isFinite(input.throttle) || input.throttle < 0 || input.throttle > 1 || typeof input.fire !== 'boolean' || typeof input.boost !== 'boolean') throw new Error('Illegal pilot input');
        return Object.assign({}, input);
    }
    /** @param {State} own @param {Vector} position @param {Vector} velocity @param {Weapon} weapon */
    function solution(own, position, velocity, weapon) {
        var lead = DW.training.intercept(own.eye, position, velocity.map(function (v) { return v / U; }), weapon.speed / U);
        var delta = sub(lead.point, own.eye), range = Math.hypot.apply(null, sub(position, own.eye)) * U;
        var length = Math.hypot.apply(null, delta), direction = delta.map(function (v) { return v / (length || 1); });
        return { point:lead.point, range:range, dot:-dot(direction, own.back), time:lead.time,
            valid:lead.time > 0 && lead.time <= Math.min(2, weapon.lifetime) };
    }
    /** @param {State} own @param {Vector} point @param {number} gain @param {number} damping @returns {Input} */
    function aim(own, point, gain, damping) {
        var d = sub(point, own.eye), f = -dot(d, own.back);
        return { pitch:clamp(Math.atan2(dot(d, own.up), f) * gain - own.rates[0] * damping),
            yaw:clamp(-Math.atan2(dot(d, own.right), f) * gain - own.rates[1] * damping),
            roll:0, side:0, vertical:0, throttle:1, boost:false, fire:false };
    }
    /** Inputs alone mutate the real craft; predictive copies never escape the controller.
     * @param {'perfect'|'human'} category @param {keyof typeof flavors} [flavor] @param {number} [seed] */
    function create(category, flavor, seed) {
        if (category !== 'perfect' && category !== 'human') throw new Error('Unknown pilot category');
        flavor = flavor || 'practiced';
        if (!Object.prototype.hasOwnProperty.call(flavors, flavor)) throw new Error('Unknown human flavor');
        var settings = flavors[flavor], randomState = (seed === undefined ? 1 : seed) >>> 0;
        /** @type {Sample[]} */ var pending = [];
        /** @type {Sample|null} */ var perceived = null;
        var nextSample = 0, nextDecision = 0;
        /** @type {Input} */ var held = { pitch:0, yaw:0, roll:0, side:0, vertical:0, throttle:1, boost:false, fire:false };
        function random() { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296 * 2 - 1; }
        /** Public observation: current visible target pose/velocity, no goals, HP, inputs or future state.
         * @param {number} time @param {State} own @param {Pick<State,'eye'|'velocity'>} target @param {Profile} profile @param {Weapon} weapon @returns {Input} */
        function step(time, own, target, profile, weapon) {
            if (!Number.isFinite(time) || time < 0) throw new Error('Illegal observation time');
            if (category === 'human') {
                if (time + 1e-9 >= nextSample) {
                    // Sensor/estimator uncertainty, not a random decision to lose.
                    pending.push({time:time, position:target.eye.map(function (v) { return v + random() * settings.noise / U; }),
                        velocity:target.velocity.map(function (v) { return v + random() * settings.noise * .35; })});
                    nextSample = time + settings.sample;
                }
                while (pending.length && pending[0].time <= time - settings.reaction + 1e-9) perceived = pending.shift() || null;
                if (!perceived) return validate(held);
                // Do not refresh the estimate using current target truth between observations.
                var observed = perceived, age = Math.min(.7, time - observed.time);
                var position = observed.position.map(function (v, i) { return v + observed.velocity[i] * age / U; });
                var shot = solution(own, position, perceived.velocity, weapon);
                var point = position.map(function (v, i) { return v + (shot.point[i] - v) * settings.lead; });
                held = aim(own, point, settings.gain, settings.damping);
                held.throttle = shot.range < 250 ? .65 : 1;
                held.boost = shot.range > 1000 && shot.dot > .97;
                held.fire = shot.valid && shot.dot > .997;
                return validate(held);
            }
            // Best-effort stress pilot: short deterministic receding-horizon search.
            // Assumes constant target velocity; no opponent intent or future random access.
            var current = solution(own, target.eye, target.velocity, weapon);
            if (time + 1e-9 >= nextDecision) {
                var base = aim(own, current.point, 2.4, .32), best = -Infinity;
                // Search ordinary turn/throttle/boost choices, including stopping.
                // This is intentionally extensible, not a proof of optimal play.
                [0, .55, 1].forEach(function (throttle) {
                    [false, true].forEach(function (boost) {
                        [.6, 1, 1.4].forEach(function (gain) {
                            var trial = copy(own), input = Object.assign({}, base, {pitch:clamp(base.pitch * gain), yaw:clamp(base.yaw * gain), throttle:throttle, boost:boost});
                            trial.throttle = throttle;
                            var score = 0;
                            for (var k = 1; k <= 8; k++) {
                                DW.arcade.step(trial, profile, input, .05);
                                var future = target.eye.map(function (v, i) { return v + target.velocity[i] * k * .05 / U; });
                                var predicted = solution(trial, future, target.velocity, weapon);
                                score += predicted.dot * 3 + (predicted.valid && predicted.dot > .997 ? 3 : 0) - Math.abs(predicted.range - 300) / 1500;
                            }
                            if (score > best) { best = score; held = input; }
                        });
                    });
                });
                nextDecision = time + .1;
            }
            held.fire = current.valid && current.dot > .997;
            return validate(held);
        }
        return { category:category, flavor:category === 'human' ? flavor : 'search', version:VERSION,
            observation:'visible-position-velocity-v1', step:step };
    }
    DW.flightAI = { version:VERSION, flavors:flavors, create:create, validate:validate, solution:solution, copy:copy };
}());
