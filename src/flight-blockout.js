(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('../experiments/types').Vector} Vector */
    /** @typedef {import('../experiments/types').Identity} Identity */
    /** @typedef {import('../experiments/types').Combat} Combat */
    /** @typedef {import('../experiments/types').RadioEvent} RadioEvent */
    /** @typedef {import('../experiments/types').Pose} Pose */
    /** @typedef {import('../experiments/types').FlightState} FlightState */
    /** @typedef {import('../experiments/types').FlightInput} FlightInput */
    /** @typedef {import('../experiments/types').Craft} Craft */
    /** @typedef {import('../experiments/types').Weapon} Weapon */
    /** @typedef {import('../experiments/types').Bolt} Bolt */
    /** @typedef {import('../experiments/types').TerrainHit} TerrainHit */
    /** @typedef {import('../experiments/types').Hit} Hit */
    /** @typedef {import('../experiments/types').ArtCraft} ArtCraft */
    /** @typedef {import('../experiments/types').Batch} Batch */
    /** @typedef {import('../experiments/types').Guns} Guns */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks), U = DW.sim.METERS_PER_UNIT;
    /** @param {Vector} a @param {Vector} b */
    function add(a, b) {
        return a.map(function (x, i) {
            return x + b[i];
        });
    }
    /** @param {Vector} a @param {Vector} b */
    function sub(a, b) {
        return a.map(function (x, i) {
            return x - b[i];
        });
    }
    /** @param {Vector} v @param {number} n */
    function scale(v, n) {
        return v.map(function (x) {
            return x * n;
        });
    }
    /** @param {Vector} a @param {Vector} b */
    function dot(a, b) {
        return a.reduce(function (s, x, i) {
            return s + x * b[i];
        }, 0);
    }
    /** @param {Vector} v */
    function length(v) {
        return Math.hypot.apply(null, v);
    }
    /** @param {Vector} v */
    function unit(v) {
        var n = length(v);
        return n > 1e-8 ? scale(v, 1 / n) : [0, 1, 0];
    }
    /** @param {Vector} a @param {Vector} b */
    function cross(a, b) {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    /** @param {Pose} pose @param {Vector} target */
    function spaceDelta(pose,target){if(!pose.curvature)return sub(target,pose.eye);var path=DW.flightHyperbolic.path(pose.eye,target,pose.curvature);return scale(path.direction,path.distance);}
    /** @param {Pose} pose @param {Vector} vector */
    function offset(pose,vector){return pose.curvature?DW.flightHyperbolic.offset(pose.eye,vector,pose.curvature):add(pose.eye,vector);}
    /** @param {{enemies: (ArtCraft & {hp: number})[]}} t @returns {Batch[]} */
    function geometry(t) {
        var data = /** @type {number[]} */ ([]), points = [[0, 11, 0], [-7, -6, 0], [0, -3, 2.5], [7, -6, 0], [0, -6, -2]], faces = [[0, 1, 2], [0, 2, 3], [0, 4, 1], [0, 3, 4], [1, 4, 2], [2, 4, 3]];
        t.enemies.filter(function (e) {
            return e.hp > 0;
        }).forEach(function (e) {
            var p = e.pose, world = points.map(function (v) {
                return add(p.eye, add(scale(p.right, v[0] / U), add(scale(p.back, -v[1] / U), scale(p.up, v[2] / U))));
            });
            faces.forEach(function (f) {
                var n = unit(cross(sub(world[f[1]], world[f[0]]), sub(world[f[2]], world[f[0]])));
                f.forEach(function (i) {
                    data.push.apply(data, world[i].concat(n));
                });
            });
        });
        return [{ vertices: new Float32Array(data), color: [.85, .29, .12] }];
    }
    DW.flightBlockout={geometry:geometry};
}());
