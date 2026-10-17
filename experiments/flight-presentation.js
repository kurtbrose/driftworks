(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').ArtCraft} ArtCraft */
    /** @typedef {import('./types').Appearance} Appearance */
    /** @typedef {import('../src/types').World} World */
    /** @typedef {import('./types').Craft} Craft */
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').Pose} Pose */
    /** @typedef {import('./types').Scene} Scene */
    /** @typedef {import('./types').FlightView} FlightView */
    /** @typedef {import('./types').Comparison} Comparison */
    /** @typedef {import('./types').Batch} Batch */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    /** @param {ArtCraft} craft @param {number} wave @param {Pick<Appearance, 'allyArt' | 'enemyArt'>} appearance */
    function model(craft, wave, appearance) {
        return DW.shipPackModels.craftModel(craft, craft.team === 'ally' ? appearance.allyArt : appearance.enemyArt, wave);
    }
    /** @param {HTMLElement} host @param {() => World} getWorld @param {(world: World) => void} setWorld @param {{document: Document}} [environment] */
    function mount(host, getWorld, setWorld, environment) {
        var document = (environment || globalThis).document, units = DW.sim.METERS_PER_UNIT;
        var get = DW.experimentDom(document);
        var scene = DW.scene3d.create(host, getWorld, setWorld, { study: true });
        /** @type {import('./types').Images} */
        var shipImages = new Map();
        DW.shipPackModels.loadTextures().then(function (images) {
            shipImages = images;
        }).catch(/** @param {unknown} error */ function (error) {
            get('art-credit').textContent = String(error);
        });
        var skybox = DW.flightSkybox.create(host);
        var artSelect = get('enemy-art'), allyArt = get('ally-art');
        DW.shipPackModels.populate(artSelect, true);
        DW.shipPackModels.populate(allyArt, true);
        [artSelect, allyArt].forEach(function (select) {
            var option = document.createElement('option');
            option.value = 'mixed';
            option.textContent = 'Mixed fleet · all ship models';
            select.insertBefore(option, select.firstChild);
            select.value = 'mixed';
        });
        function artCredit() {
            var entry = DW.shipPackModels.find(artSelect.value);
            get('art-credit').textContent = artSelect.value === 'mixed' ? 'Mixed fleet · Quaternius CC0 library · changes each wave' : entry ? entry.pack.author + ' / ' + entry.model.name + ' · ' + entry.pack.license + ' · ' + entry.model.triangles.toLocaleString() + ' triangles per ship' : 'Original six-triangle training hull';
        }
        function allyCredit() {
            var entry = DW.shipPackModels.find(allyArt.value);
            get('ally-credit').textContent = allyArt.value === 'mixed' ? 'Mixed fleet · Quaternius CC0 library · changes each wave' : entry ? entry.pack.author + ' / ' + entry.model.name + ' · ' + entry.pack.license : 'Original training blockout';
        }
        allyArt.onchange = allyCredit;
        allyCredit();
        artSelect.onchange = artCredit;
        artCredit();
        // A fresh appearance snapshot is shared with the HUD for this rendered frame.
        /** @returns {Appearance} */
        function appearance() {
            return {
                shipImages: shipImages, allyArt: allyArt.value, enemyArt: artSelect.value,
                paint: { ally: paint('ally'), enemy: paint('enemy') }
            };
        }
        /** @param {string} team */
        function paint(team) {
            return get('faction-paint').checked ? DW.shipPackModels.paintColor(get(team === 'ally' ? 'ally-color' : 'enemy-color').value) : undefined;
        }
        /** @param {Craft} craft @param {Vector} start @param {Vector} end @param {number} wave */
        function hullHit(craft, start, end, wave) {
            return DW.shipPackModels.hullHit(model(craft, wave, { allyArt: allyArt.value, enemyArt: artSelect.value }), craft.pose, start, end, units);
        }
        /** @param {Pose} state */
        function pose(state) {
            scene.setSurfaceCamera(/** @type {Parameters<Scene['setSurfaceCamera']>[0]} */ ({ eye: state.eye, right: state.right, up: state.up, back: state.back }));
        }
        /** @param {FlightView} view @param {Appearance} appearance @param {Comparison} comparison @param {number} elapsed */
        function render(view, appearance, comparison, elapsed) {
            var state = view.state, combat = view.combat, guns = view.guns, world = view.world;
            var livingArt = /** @type {ArtCraft[]} */ (DW.training.alive(combat)).concat(combat.wrecks), actorBatches = /** @type {Batch[]} */ ([]);
            ['ally', 'enemy'].forEach(function (team) {
                var craft = livingArt.filter(function (e) {
                    return (e.team || 'enemy') === team;
                }), selection = team === 'ally' ? appearance.allyArt : appearance.enemyArt;
                if (!craft.length)
                    return;
                var batches = selection ? DW.shipPackModels.sourceFleetGeometry(craft, selection, combat.wave, units, appearance.shipImages, appearance.paint[team]) : DW.training.geometry({ enemies: craft.map(function (e) {
                        return Object.assign({}, e, { hp: 1 });
                    }) });
                batches.forEach(function (batch) {
                    actorBatches.push(batch);
                });
            });
            ['ally', 'enemy'].forEach(function (team) {
                var craft = livingArt.filter(function (e) {
                    return (e.team || 'enemy') === team;
                });
                DW.shipPackModels.scorchGeometry(craft, team === 'ally' ? appearance.allyArt : appearance.enemyArt, combat.wave, units).forEach(function (batch) {
                    actorBatches.push(batch);
                });
            });
            scene.setStudyActors(actorBatches);
            var effectBatches = DW.flightGuns.geometry(DW.training.allGuns(combat, guns), state), engineParts = /** @type {Float32Array[]} */ ([]);
            ['ally', 'enemy'].forEach(function (team) {
                var craft = DW.training.alive(combat).filter(function (e) {
                    return (e.team || 'enemy') === team;
                });
                engineParts.push(DW.shipPackModels.engineGeometry(craft, team === 'ally' ? appearance.allyArt : appearance.enemyArt, combat.wave, units, state, world.elapsedSeconds).vertices);
            });
            var engines = new Float32Array(engineParts.reduce(function (n, p) {
                return n + p.length;
            }, 0)), engineOffset = 0;
            engineParts.forEach(function (p) {
                engines.set(p, engineOffset);
                engineOffset += p.length;
            });
            effectBatches.push({ vertices: engines, color: [.25, .65, 1] });
            scene.setStudyEffects(effectBatches);
            scene.setStudyDiagnostics(comparison);
            skybox.render(state, comparison.scale, comparison.mode === 'empty');
            scene.sync(world);
            scene.render(world, 1, 0, elapsed);
        }
        function renderStats() {
            return { scene: scene.getRenderStats(), sky: skybox.getRenderStats() };
        }
        return { appearance: appearance, hullHit: hullHit, pose: pose, render: render, renderStats: renderStats };
    }
    DW.flightPresentation = { mount: mount, model: model };
}());
