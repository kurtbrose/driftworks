(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').Model} Model */
    /** @typedef {import('./types').Scene} Scene */
    /** @typedef {import('./types').Craft} Craft */
    /** @typedef {import('./types').Images} Images */
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').Pose} Pose */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    /** @type {WeakMap<Model,{source:number[],radius:number}>} */
    var bounds = new WeakMap();
    /** @param {Model} model */
    function radius(model) {
        var cached = bounds.get(model);
        if (cached && cached.source === model.vertices) return cached.radius;
        var v = model.vertices, r = 1;
        for (var i = 0; i < v.length; i += 6)
            r = Math.max(r, Math.hypot(v[i], v[i + 1], v[i + 2]));
        bounds.set(model,{source:v,radius:r});
        return r;
    }
    /** @param {HTMLElement} host */
    function mount(host) {
        var world = DW.sim.createInitialWorld();
        world.asteroids = [];
        world.ships = [];
        world.platforms = [];
        world.wrecks = [];
        world.packets = [];
        world.combat.drones = [];
        world.selectedShipIds = [];
        var scene = /** @type {Scene | null} */ (null), last = -Infinity;
        return { update: /** @param {Craft} target @param {string} selection @param {number} wave @param {number} units @param {Images} images @param {Vector | undefined} paint @param {Pose} view @param {number} time */ function (target, selection, wave, units, images, paint, view, time) {
                if (!target || !host.clientWidth || document.hidden)
                    return false;
                if (time - last < 1 / 15 && time >= last)
                    return false;
                last = time;
                if (!scene) {
                    scene = DW.scene3d.create(host, function () {
                        return world;
                    }, function (w) {
                        world = w;
                    }, { study: true, viewer: false });
                    scene.setStudyDiagnostics({ mode: 'normal', scale: 1, flat: false, mothership: false, actors: true });
                }
                var model = target.convoyModel?DW.convoyMission.model(target.convoyModel):DW.shipPackModels.craftModel(target, selection, wave), pose = Object.assign({}, target.pose, { eye: [0, 0, 0] });
                var centered = Object.assign({}, target, { pose: pose });
                world.camera = { x: 0, y: 0, zoom: Math.min(host.clientWidth, host.clientHeight) * .46 / (radius(model) / units) };
                // Track aspect relative to the player's view, with a small elevated sensor angle.
                var yaw = Math.atan2(view.back[0], -view.back[1]);
                scene.setOrbit({ yaw: yaw, tilt: 1.12, height: 0 });
                scene.setStudyActors(target.convoyModel?DW.convoyScenery.preview(target.convoyModel):model.texturedVertices ? [DW.shipPackModels.sourceDraw(model, pose, units, images.get(model.id), paint)] : DW.shipPackModels.geometry(model, [pose], units));
                scene.setStudyEffects(target.convoyModel?[]:DW.shipPackModels.scorchGeometry([centered], selection, wave, units));
                scene.sync(world);
                scene.render(world, 1, 0, 1 / 15);
                return true;
            } };
    }
    DW.flightTargetCamera = { radius: radius, mount: mount };
}());
