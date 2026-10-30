(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('../experiments/types').Pack} Pack */
    /** @typedef {import('../experiments/types').Model} Model */
    /** @typedef {import('../experiments/types').Pose} Pose */
    /** @typedef {import('../experiments/types').Batch} Batch */
    /** @typedef {import('../experiments/types').ArtCraft} ArtCraft */
    /** @typedef {import('../experiments/types').Vector} Vector */
    /** @typedef {import('../experiments/types').Images} Images */
    /** @typedef {import('../experiments/types').HullHit} HullHit */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    /** @param {string} id */
    function find(id) {
        var result = /** @type {{pack: Pack; model: Model} | null} */ (null);
        (DW.shipPacks || []).forEach(function (pack) {
            pack.models.forEach(function (model) {
                if (model.id === id)
                    result = { pack: pack, model: model };
            });
        });
        return result;
    }
    /** @param {number} index @param {number} wave */
    function mixedModel(index, wave) {
        var packs = (DW.shipPacks || []).filter(function(pack){return !pack.missionOnly;}), models = /** @type {Model[]} */ ([]), longest = Math.max.apply(null, packs.map(function (p) {
            return p.models.length;
        }));
        // Interleave the general-purpose packs across waves; mission-only art stays out.
        for (var i = 0; i < longest; i++)
            packs.forEach(function (pack) {
                if (pack.models[i])
                    models.push(pack.models[i]);
            });
        return models.length ? models[(index + Math.max(0, wave - 1) * 16) % models.length] : null;
    }
    // Reviewed nozzle centers in normalized ship metres: right X, forward Y, up Z.
    // Fourth value is nozzle radius. These are art attachments, not physics data.
    /** @type {Record<string, number[][]>} */
    var engineMounts = {
        Bob: [[-1.69, -3.23, -.267, .85], [1.69, -3.23, -.267, .85]],
        Challenger: [[-1.345, -5.73, -.746, .65], [1.345, -5.73, -.746, .65]],
        Dispatcher: [[-1.564, -7.63, -.22, .48], [1.564, -7.63, -.22, .48], [0, -7.99, .436, .35]],
        Executioner: [[-5.574, -5.92, .007, .48], [5.574, -5.92, .007, .48], [-1.185, -5.70, -.388, .48], [1.185, -5.70, -.388, .48]],
        Imperial: [[-2.556, -7.85, -.306, .48], [2.556, -7.85, -.306, .48], [0, -7.50, -.329, .8]],
        Insurgent: [[-2.295, -7.66, .271, .4], [2.295, -7.66, .271, .4], [-3.531, -7.23, -1.02, .45], [3.531, -7.23, -1.02, .45]],
        Omen: [[-2.029, -4.61, -.823, .65], [2.029, -4.61, -.823, .65]],
        Pancake: [[-2.041, -3.71, .286, .75], [2.041, -3.71, .286, .75]],
        Spitfire: [[-6.421, -4.20, .906, .65], [-6.421, -4.20, -1.095, .65], [6.421, -4.20, .906, .65], [6.421, -4.20, -1.095, .65]],
        Striker: [[-2.176, -6.09, -.273, .38], [2.176, -6.09, -.273, .38], [0, -8.05, .632, .27]],
        Zenith: [[-1.47, -7.68, -.088, .6], [1.47, -7.68, -.088, .6]]
    };
    // Muzzle centers inspected on the shipped mesh, in the same local metres as
    // sourceDraw: right X, forward Y, up Z. Keep asymmetric barrels asymmetric.
    /** @type {Record<string, number[][]>} */
    var gunMounts = {
        Bob: [[0, 4.402, -.389]],
        Challenger: [[0, 2.822, -.76]],
        Dispatcher: [[-1.278, 7.962, -2.308], [1.278, 7.962, -2.308]],
        Executioner: [[-1.19, 5.429, -.321], [1.19, 5.429, -.321]],
        Imperial: [[-1.55, 4.95, -.46], [1.55, 4.95, -.46]],
        Insurgent: [[-1.969, 3.1, -1.276], [1.969, 3.1, -1.276]],
        Omen: [[0, 6.898, -.45]],
        Pancake: [[-2.904, 5.455, -1.839], [2.904, 5.455, -1.839]],
        Spitfire: [[-.986, 1.575, .429], [.986, 1.575, .429]],
        Striker: [[-1.763, 5.314, -.668], [1.764, 4.041, .079]],
        Zenith: [[0, 3.323, -.34]]
    };
    /** @param {Model} model @returns {Vector[]} */
    function gunAnchors(model) {
        if(model.gunMounts)return model.gunMounts;
        if (model.id === 'blockout') return [[-3, 4, -1.3], [3, 4, -1.3]];
        var anchors = gunMounts[model.name];
        if (!anchors) throw new Error('No reviewed gun anchors for ' + model.id);
        return anchors;
    }
    /** @param {Model} model */
    function engineAnchors(model) {
        return model.engineMounts || engineMounts[model.name] || [];
    }
    /** @param {Vector} a @param {Vector} b */
    function dot3(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }
    /** @param {Vector} a @param {Vector} b */
    function minus(a, b) {
        return a.map(function (v, i) {
            return v - b[i];
        });
    }
    /** @param {Vector} a @param {Vector} b */
    function cross3(a, b) {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    /** @param {Vector} a @param {Vector} b @param {Vector} c */
    function normal(a, b, c) {
        var n = cross3(minus(b, a), minus(c, a)), l = Math.hypot.apply(null, n) || 1;
        return n.map(function (v) {
            return v / l;
        });
    }
    // Collision and decals share the displayed model's local metre coordinates.
    var blockout = /** @type {Model} */ ({ id: 'blockout', name: 'Training fighter', triangles: 6, vertices: [] });
    (function () {
        var p = [[0, 11, 0], [-7, -6, 0], [0, -3, 2.5], [7, -6, 0], [0, -6, -2]];
        [[0, 1, 2], [0, 2, 3], [0, 4, 1], [0, 3, 4], [1, 4, 2], [2, 4, 3]].forEach(function (f) {
            var n = normal(p[f[0]], p[f[1]], p[f[2]]);
            f.forEach(function (i) {
                blockout.vertices.push.apply(blockout.vertices, p[i].concat(n));
            });
        });
    }());
    /** @param {ArtCraft} e @param {string} selection @param {number} wave */
    function craftModel(e, selection, wave) {
        return (e.modelId ? find(e.modelId)?.model : null) || (selection === 'mixed' ? mixedModel(e.index, e.artWave || wave) : find(selection)?.model) || blockout;
    }
    DW.shipCatalog = {find:find,mixedModel:mixedModel,craftModel:craftModel,gunAnchors:gunAnchors,engineAnchors:engineAnchors};
}());
