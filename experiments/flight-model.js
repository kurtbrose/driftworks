(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').Profile} Profile */
    /** @typedef {import('./types').FlightState} FlightState */
    /** @typedef {import('./types').FlightInput} FlightInput */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    var profiles = DW.retailFlightProfiles, units = DW.sim.METERS_PER_UNIT;
    /** @param {Vector} a @param {Vector} b */
    function cross(a, b) {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    /** @param {Vector} v */
    function unit(v) {
        var n = Math.hypot.apply(null, v);
        return v.map(function (x) {
            return x / n;
        });
    }
    /** @param {Vector} v @param {Vector} axis @param {number} angle */
    function rotate(v, axis, angle) {
        var c = Math.cos(angle), s = Math.sin(angle), d = v.reduce(function (t, x, i) {
            return t + x * axis[i];
        }, 0), k = cross(axis, v);
        return v.map(function (x, i) {
            return x * c + k[i] * s + axis[i] * d * (1 - c);
        });
    }
    /** @param {number} radius */
    function create(radius) {
        return { eye: [0, -radius * 2.6, 0], right: [1, 0, 0], up: [0, 0, 1], back: [0, -1, 0], velocity: [0, 0, 0], rates: [0, 0, 0], ramp: [0, 0, 0], throttle: 0 };
    }
    // Start above the asteroid so the forward combat approach stays clear of terrain.
    /** @param {number} radius @param {Profile} profile @param {string} [missionId] */
    function createSortie(radius, profile, missionId) {
        var state = create(radius);
        var mission=DW.flightMissions.resolve(missionId),spawn=mission.encounter.spawn;
        if(mission.emptySpace){
            var angle=-30*Math.PI/180;
            state.eye=[0,-radius*3,radius*2];
            state.up=[0,-Math.sin(angle),Math.cos(angle)];state.back=[0,-Math.cos(angle),-Math.sin(angle)];
            return state;
        }
        state.eye[1]=-radius*spawn.backRadii;
        state.eye[2] = radius + spawn.altitudeMeters / units;
        state.throttle = 1;
        state.ramp[2] = profile.maxVelocity[2];
        state.velocity = state.back.map(function (v) {
            return -v * profile.maxVelocity[2];
        });
        return state;
    }
    /** @param {Vector} a @param {Vector} b */
    function dot(a, b) {
        return a.reduce(function (sum, x, i) {
            return sum + x * b[i];
        }, 0);
    }
    /** @param {number} current @param {number} target @param {number} tau @param {number} dt */
    function ramp(current, target, tau, dt) {
        var distance = Math.abs(target - current);
        if (distance < tau / 3)
            tau = distance / 3;
        return tau < .0001 ? target : target + (current - target) * Math.exp(-dt / tau);
    }
    /** @param {FlightState} state @param {Profile} p @param {FlightInput} input @param {number} dt */
    function step(state, p, input, dt) {
        dt = Math.max(0, Math.min(.05, dt));
        if (!dt)
            return state;
        var forward = state.back.map(function (x) {
            return -x;
        }), basis = [state.right, state.up, forward];
        var max = input.boost ? p.afterburnerVelocity : p.maxVelocity;
        // Maneuvering velocities are m/s, independent of retail profile strafe limits.
        // Normalize diagonals and combined keyboard/pad demands to a 5 m/s target.
        var side = input.side || 0, vertical = input.vertical || 0;
        var length = Math.max(1, Math.hypot(side, vertical));
        var target = [side / length * 5, vertical / length * 5,
            input.boost ? max[2] : state.throttle < 0 ? 5 * Math.max(-1, state.throttle) : max[2] * state.throttle];
        var taus = [2, 2, state.throttle < 0 && !input.boost ? 2 :
            target[2] > 0 && target[2] >= state.ramp[2] ? (input.boost ? p.afterburnerAccel : p.forwardAccel) : p.forwardDecel];
        state.ramp = state.ramp.map(function (v, i) {
            return ramp(v, target[i], taus[i], dt);
        });
        // Retail normal flight damps lateral slip, while forward speed follows the engine ramp directly.
        var local = basis.map(function (axis) {
            return dot(state.velocity, axis);
        });
        var next = local.map(function (v, i) {
            return i === 2 || p.damp < .0001 ? state.ramp[i] : state.ramp[i] + (v - state.ramp[i]) * Math.exp(-dt / p.damp);
        });
        var displacement = local.map(function (v, i) {
            return i === 2 || p.damp < .0001 ? state.ramp[i] * dt : state.ramp[i] * dt + (v - state.ramp[i]) * p.damp * (1 - Math.exp(-dt / p.damp));
        });
        state.velocity = [0, 1, 2].map(function (i) {
            return basis.reduce(function (sum, axis, j) {
                return sum + axis[i] * next[j];
            }, 0);
        });
        state.eye = state.eye.map(function (v, i) {
            return v + basis.reduce(function (sum, axis, j) {
                return sum + axis[i] * displacement[j];
            }, 0) / units;
        });
        var controls = [input.pitch || 0, input.yaw || 0, input.roll || 0].map(function (v) {
            return Math.max(-1, Math.min(1, v));
        });
        var goals = controls.map(function (v, i) {
            return v * 2 * Math.PI / p.rotationTime[i];
        });
        // Retail's default automatic bank is half the requested yaw rate, opposite in engine coordinates.
        goals[2] -= goals[1] * .5;
        var axes = [state.right, state.up, state.back];
        goals.forEach(function (goal, i) {
            state.rates[i] = goal + (state.rates[i] - goal) * Math.exp(-dt / p.rotdamp);
            var axis = axes[i].slice(), angle = state.rates[i] * dt;
            state.right = rotate(state.right, axis, angle);
            state.up = rotate(state.up, axis, angle);
            state.back = rotate(state.back, axis, angle);
            axes = [state.right, state.up, state.back];
        });
        state.back = unit(state.back);
        state.right = unit(cross(state.up, state.back));
        state.up = unit(cross(state.back, state.right));
        return state;
    }
    /** @param {FlightState} state @param {Vector} point @param {number} radius */
    function contact(state, point, radius) {
        var limit = Math.hypot.apply(null, point) * radius + 5 / units;
        var distance = Math.hypot.apply(null, state.eye);
        if (distance >= limit)
            return false;
        state.eye = unit(state.eye).map(function (x) {
            return x * limit;
        });
        state.velocity = [0, 0, 0];
        state.ramp = [0, 0, 0];
        state.throttle = 0;
        return true;
    }
    DW.arcade = { profiles: profiles, create: create, createSortie: createSortie, step: step, contact: contact };
}());
