(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').SessionEnvironment} SessionEnvironment */
    /** @typedef {import('./types').Snapshot} Snapshot */
    /** @typedef {import('./types').Profile} Profile */
    /** @typedef {import('./types').Demand} Demand */
    /** @typedef {import('./types').Weapon} Weapon */
    /** @typedef {import('../src/types').World} World */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks), model = DW.arcade;
    // Browser resources and artwork queries are supplied by the flight composition root.
    /** @param {SessionEnvironment} environment */
    function create(environment) {
        var world = DW.sim.createInitialWorld(), asteroid = world.asteroids[0], units = DW.sim.METERS_PER_UNIT;
        asteroid.position = { x: 0, y: 0 };
        asteroid.rotation = 0;
        asteroid.radius = 300 / units;
        var home = world.ships.find(function (ship) {
            return ship.type === 'mothership';
        });
        if (!home)
            throw new Error('Flight session requires a mothership');
        const mothership = home;
        // Fixed production artwork scale, roughly 2 km between the body and ship centers.
        mothership.position = { x: 900 / units, y: 1800 / units };
        mothership.previousPosition = { x: 900 / units, y: 1800 / units };
        mothership.rotation = 0;
        mothership.velocity = { x: 0, y: 0 };
        mothership.previousVelocity = { x: 0, y: 0 };
        world.asteroids = [asteroid];
        world.ships = [mothership];
        world.platforms = [];
        world.wrecks = [];
        world.packets = [];
        world.selectedShipIds = [];
        world.combat.drones = [];
        var state = model.create(asteroid.radius), guns = DW.flightGuns.create(), combat = DW.training.create('training'), contact = false;
        // A short-lived view of session-owned objects, not a detached copy.
        // Read again after transitions that may replace state, combat, guns or world.
        /** @returns {Snapshot} */
        function snapshot() {
            return { world: world, asteroid: asteroid, mothership: mothership, state: state, guns: guns, combat: combat, contact: contact };
        }
        /** @param {string} mode @param {boolean} enabled */
        function setCombat(mode, enabled) {
            combat = DW.training.create(mode);
            combat.enabled = enabled;
            if (!enabled) {
                combat.enemies = [];
                combat.countdown = 0;
            }
            return snapshot();
        }
        /** @param {{mode: string; enabled: boolean; profile: Profile}} config */
        function reset(config) {
            combat = DW.training.create(config.mode);
            combat.enabled = config.enabled;
            guns = DW.flightGuns.create();
            state = model.createSortie(asteroid.radius, config.profile);
            contact = false;
            if (combat.enabled)
                DW.training.spawn(combat, state, asteroid.radius);
            return snapshot();
        }
        /** @param {number} elapsed @param {Demand} controls @param {{profile: Profile; weapon: Weapon}} config */
        function advance(elapsed, controls, config) {
            // Fixed small substeps keep response independent of display refresh rate.
            var remaining = elapsed;
            contact = false;
            while (remaining > 0) {
                var dt = Math.min(1 / 120, remaining);
                remaining -= dt;
                if (controls.throttle !== null)
                    state.throttle = controls.throttle;
                state.throttle = Math.max(0, Math.min(1, state.throttle + (controls.throttleRate) * dt * .5));
                if (controls.stop)
                    state.throttle = 0;
                model.step(state, config.profile, controls, dt);
                combat.hullHit = environment.hullHit;
                var playerHitBefore = combat.lastHit;
                DW.training.step(combat, state, dt, asteroid.radius, environment.terrainHit);
                var firedBefore = guns.fired, hitsBefore = guns.hits;
                DW.flightGuns.step(guns, state, config.weapon, !combat.dead && controls.fire, dt, function (start, end, bolt) {
                    return DW.training.trace(combat, start, end, bolt, 'player', environment.terrainHit, state);
                });
                if (guns.fired > firedBefore)
                    environment.onGunshot();
                if (guns.hits > hitsBefore || combat.lastHit > playerHitBefore)
                    environment.onImpact();
                if (combat.dead)
                    break;
                var length = Math.hypot.apply(null, state.eye), direction = state.eye.map(function (x) {
                    return x / (length || 1);
                });
                if (length < asteroid.radius * 1.12 + 5 / units) {
                    var surface = environment.surfaceFrame(asteroid, direction);
                    if (model.contact(state, surface.point, asteroid.radius))
                        contact = true;
                }
            }
            return snapshot();
        }
        return { snapshot: snapshot, reset: reset, setCombat: setCombat, advance: advance, setWorld: /** @param {World} value */ function (value) {
                world = value;
            } };
    }
    DW.flightSession = { create: create };
}());
