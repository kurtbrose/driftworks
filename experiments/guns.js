(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').Guns} Guns */
    /** @typedef {import('./types').Pose} Pose */
    /** @typedef {import('./types').Weapon} Weapon */
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').Bolt} Bolt */
    /** @typedef {import('./types').Batch} Batch */
    var units = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).sim.METERS_PER_UNIT;
    // Shared crosshair aim point, measured forward from the eye in metres.
    var convergenceM = 300;
    /** @returns {Guns} */
    function create() {
        return { bolts: [], impacts: [], cooldown: 0, fired: 0, hits: 0 };
    }
    /** @param {Guns} guns @param {Pose} pose @param {Weapon} weapon @param {boolean} trigger @param {number} dt @param {((start: Vector, end: Vector, bolt: Bolt) => Vector | null)} [hitTest] @param {(() => Vector | null)} [aimPoint] */
    function step(guns, pose, weapon, trigger, dt, hitTest, aimPoint) {
        var ready = guns.cooldown <= 1e-9;
        guns.cooldown -= dt;
        guns.impacts = guns.impacts.filter(function (hit) {
            hit.age += dt;
            return hit.age < .22;
        });
        // Advance existing shots before emitting this substep's volley.
        guns.bolts = guns.bolts.filter(function (bolt) {
            var travel = Math.min(dt, bolt.weapon.lifetime - bolt.age);
            var end = bolt.position.map(function (x, i) {
                return x + bolt.direction[i] * bolt.weapon.speed * travel / units;
            });
            var hit = hitTest ? hitTest(bolt.position, end, bolt) : null;
            bolt.age += dt;
            if (hit) {
                guns.impacts.push({ position: hit, age: 0 });
                guns.hits++;
                return false;
            }
            bolt.position = end;
            return bolt.age < bolt.weapon.lifetime;
        });
        if (!trigger) {
            guns.cooldown = Math.max(0, guns.cooldown);
            return;
        }
        if (ready) {
            var target = aimPoint && aimPoint();
            [-1, 1].forEach(function (side) {
                var position = pose.eye.map(function (x, i) {
                    return x + (pose.right[i] * side * 3 - pose.up[i] * 1.3 - pose.back[i] * 4) / units;
                });
                var aim = pose.back.map(function (x, i) {
                    return target ? (target[i] - position[i]) * units :
                        -x * (convergenceM - 4) - pose.right[i] * side * 3 + pose.up[i] * 1.3;
                });
                var distance = Math.hypot.apply(null, aim);
                guns.bolts.push({ position: position, direction: aim.map(function (x) {
                        return x / distance;
                    }), weapon: weapon, age: 0 });
            });
            guns.fired += 2;
            guns.cooldown += weapon.fireWait;
        }
    }
    // Broad-phase sphere plus a swept, refined terrain query prevents tunneling.
    /** @param {Vector} start @param {Vector} end @param {number} radius @param {(point: Vector) => number} field */
    function intersect(start, end, radius, field) {
        var d = end.map(function (x, i) {
            return x - start[i];
        }), a = d.reduce(function (s, x) {
            return s + x * x;
        }, 0);
        if (!a)
            return null;
        var b = 2 * start.reduce(function (s, x, i) {
            return s + x * d[i];
        }, 0), c = start.reduce(function (s, x) {
            return s + x * x;
        }, 0) - radius * radius * 1.21, disc = b * b - 4 * a * c;
        if (disc < 0)
            return null;
        var lo = Math.max(0, (-b - Math.sqrt(disc)) / (2 * a)), hi = Math.min(1, (-b + Math.sqrt(disc)) / (2 * a));
        if (lo > hi)
            return null;
        var count = Math.max(1, Math.ceil(Math.sqrt(a) * (hi - lo) * units));
        /** @param {number} t */
        function point(t) {
            return start.map(function (x, i) {
                return x + d[i] * t;
            });
        }
        var previous = lo;
        for (var j = 0; j <= count; j++) {
            var t = lo + (hi - lo) * j / count, p = point(t);
            if (field(p.map(function (x) {
                return x / radius;
            })) <= 0) {
                var left = previous, right = t;
                for (var k = 0; k < 8; k++) {
                    var mid = (left + right) / 2;
                    if (field(point(mid).map(function (x) {
                        return x / radius;
                    })) <= 0)
                        right = mid;
                    else
                        left = mid;
                }
                return point(right);
            }
            previous = t;
        }
        return null;
    }
    /** @param {Pick<Guns, 'bolts' | 'impacts'>} guns @param {Pose} pose @returns {Batch[]} */
    function geometry(guns, pose) {
        var groups = /** @type {{team: string; color: [number,number,number]; data: number[]}[]} */ ([{ team: 'ally', color: [.15, 1, .35], data: [] }, { team: 'enemy', color: [1, .12, .08], data: [] }, { team: 'player', color: [1, .75, .25], data: [] }]);
        /** @param {Vector} a @param {Vector} b */
        function dot(a, b) {
            return a.reduce(function (sum, x, i) {
                return sum + x * b[i];
            }, 0);
        }
        /** @param {number[]} data @param {Vector} center @param {Vector} along @param {Vector} side @param {number} halfLength @param {number} width @param {number} opacity */
        function quad(data, center, along, side, halfLength, width, opacity) {
            var uv = [[-1, -1], [-1, 1], [1, 1], [-1, -1], [1, 1], [1, -1]];
            uv.forEach(function (p) {
                data.push.apply(data, center.map(function (x, i) {
                    return x + along[i] * p[0] * halfLength + side[i] * p[1] * width;
                }).concat([p[0], p[1], opacity]));
            });
        }
        guns.bolts.forEach(function (bolt) {
            var group = groups.find(function (g) {
                return g.team === (bolt.team || 'player');
            });
            if (!group)
                return;
            var center = bolt.position.map(function (x, i) {
                return x - bolt.direction[i] * bolt.weapon.length * .5 / units;
            });
            var along = bolt.direction.map(function (x, i) {
                return x - pose.back[i] * dot(bolt.direction, pose.back);
            });
            var projected = Math.hypot.apply(null, along);
            along = projected > .0001 ? along.map(function (x) {
                return x / projected;
            }) : pose.up;
            var side = [pose.back[1] * along[2] - pose.back[2] * along[1], pose.back[2] * along[0] - pose.back[0] * along[2], pose.back[0] * along[1] - pose.back[1] * along[0]];
            var width = bolt.weapon.headRadius / units;
            quad(group.data, center, along, side, Math.max(width, bolt.weapon.length * .5 / units * projected + width), width, 1);
        });
        var batches = groups.map(function (g) {
            return { vertices: new Float32Array(g.data), color: g.color };
        });
        var impacts = /** @type {number[]} */ ([]);
        guns.impacts.forEach(function (hit) {
            var r = (.5 + hit.age * 12) * (hit.scale || 1) / units;
            var center = hit.position.map(function (x, i) {
                return x + pose.back[i] * .08 / units;
            });
            quad(impacts, center, pose.up, pose.right, r, r, 1 - hit.age / .22);
        });
        batches.push({ vertices: new Float32Array(impacts), color: [1, .75, .3] });
        return batches;
    }
    /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).flightGuns = { create: create, step: step, intersect: intersect, geometry: geometry };
}());
