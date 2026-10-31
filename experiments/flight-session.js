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
    // Six-hour principal-axis spin; vectors use the renderer's +Z axis.
    var spinRate = 2 * Math.PI / (6 * 60 * 60), fixedStep = 1 / 120;
    /** @param {number[]} vector @param {number} angle */
    function rotateVector(vector, angle) {
        var c = Math.cos(angle), s = Math.sin(angle);
        return [vector[0] * c - vector[1] * s, vector[0] * s + vector[1] * c, vector[2]];
    }
    // Browser resources and artwork queries are supplied by the flight composition root.
    /** @param {SessionEnvironment} environment */
    function create(environment) {
        var world = DW.sim.createInitialWorld(environment.seed), asteroid = world.asteroids[0], units = DW.sim.METERS_PER_UNIT;
        // Geology is keyed by asteroid ID, independently of the world's spin RNG.
        if (environment.seed !== undefined) asteroid.id = 'patrol-rock-' + (environment.seed >>> 0);
        asteroid.position = { x: 0, y: 0 };
        asteroid.rotation = 0;
        asteroid.radius = 1250 / units;
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
        var state = model.create(asteroid.radius), guns = DW.flightGuns.create(), combat = DW.flightSim.create('training'), contact = false, grounded = false;
        combat.useHullModels = true;
        DW.flightSim.bindPlayer(combat, state).guns = guns;
        var bridgeVector=DW.flightGuns.bridgeVector,crossBridge=DW.flightGuns.crossBridge;
        var activeProfile = model.profiles[0], remainder = 0,curvatureOverride=0;
        var opponentStyle = /** @type {import('./types').OpponentStyle} */ ('baseline');
        var hulls = /** @type {{ally: string; enemy: string} | null} */ (null);
        function configureCombat() {
            combat.opponentStyle = opponentStyle;
            if (hulls) DW.flightSim.configureHulls(combat, hulls.ally, hulls.enemy);
        }
        // A short-lived view of session-owned objects, not a detached copy.
        // Read again after transitions that may replace state, combat, guns or world.
        /** @returns {Snapshot} */
        function snapshot() {
            return { world: world, asteroid: asteroid, mothership: mothership, state: state, guns: guns, combat: combat, contact: contact };
        }
        /** Set physical size; the caller resets the sortie after a successful edit.
         * @param {number} meters @returns {boolean} */
        function setAsteroidDiameter(meters) {
            if (!Number.isFinite(meters) || meters < 200 || meters > 4000) return false;
            asteroid.radius = meters / 2 / units;
            applyGeology(combat.mode);
            return true;
        }
        /** Place a stationary study start in scene units and restart its scenery clock.
         * @param {number[]} eye */
        function setStartPosition(eye) {
            if (eye.length !== 3 || !eye.every(Number.isFinite)) throw new Error('Invalid start position');
            state.eye = eye.slice();
            state.velocity = [0, 0, 0];
            world.elapsedSeconds = 0;
            contact = false;
            grounded = false;
            remainder = 0;
        }
        /** @param {import('./types').OpponentStyle} style */
        function setOpponentStyle(style) {
            opponentStyle = style;
            combat.opponentStyle = style;
            combat.enemies.forEach(function (enemy) { enemy.opponentStyle = style; });
        }
        /** Collision and muzzle selection are gameplay configuration, even when paused.
         * @param {string} ally @param {string} enemy */
        function configureHulls(ally, enemy) {
            hulls = { ally: ally, enemy: enemy };
            DW.flightSim.configureHulls(combat, ally, enemy);
        }
        var launchRadius=-1,launchMode='',launchLocal=/** @type {number[]|null} */(null);
        // Match the roadside deck's nine support samples once, then rotate its barn doorway.
        function updateLaunchOrigin(){
            var definition=DW.flightMissions.resolve(combat.mode);const reserve=definition.encounter.reinforcements;
            if(!reserve)return;
            if(launchRadius!==asteroid.radius||launchMode!==combat.mode){
                launchRadius=asteroid.radius;launchMode=combat.mode;launchLocal=null;
                var roadside=definition.scenery.find(function(item){return item.kind==='roadside';});
                var building=roadside&&roadside.placements&&roadside.placements.find(function(item){return item.model===reserve.launchModel;});
                if(roadside&&building){
                    launchLocal=DW.roadsideLayout.describe(asteroid,roadside,environment.surfaceFrame).launchOrigin(building);
                }
            }
            if(launchLocal){combat.reinforcementOrigin=rotateVector(launchLocal,asteroid.rotation);combat.reinforcementDirection=rotateVector([0,-.6,.8],asteroid.rotation);}
        }
        function acquireTarget() { DW.flightSim.acquireTarget(combat, state); }
        function toggleTargetLock() { acquireTarget(); DW.flightSim.toggleTargetLock(combat); }
        function nextTarget() { DW.flightSim.cycle(combat); }
        /** Presentation clock: manual frames or completed watch ticks, not physics time.
         * @param {number} elapsed */
        function advanceScenery(elapsed) {
            if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('Invalid elapsed time');
            world.elapsedSeconds += elapsed;
        }
        /** @param {string} mode */
        function applyGeology(mode) {
            var mission=DW.flightMissions.resolve(mode);
            world.asteroids=mission.emptySpace||(mode==='evacuation'||mode==='scramble'||mode==='convoy')?[]:[asteroid];world.ships=mission.emptySpace||(mode==='evacuation'||mode==='scramble'||mode==='convoy')?[]:[mothership];
            DW.asteroidTerrain.setStudyParameters(asteroid, {bulk: mission.asteroidBulk});
        }
        /** @param {string} mode @param {boolean} enabled */
        function setCombat(mode, enabled) {
            applyGeology(mode);
            combat = DW.flightSim.create(mode);
            combat.useHullModels = true;
            DW.flightSim.bindPlayer(combat, state).guns = guns;
            DW.flightSim.configure(combat, activeProfile);
            configureCombat();
            combat.enabled = enabled&&(!DW.flightMissions.resolve(mode).emptySpace||mode==='cinematic'||!!DW.flightMissions.resolve(mode).sky.hyperbolic);
            if (!combat.enabled) {
                combat.enemies = [];
                combat.countdown = 0;
            } else if (DW.flightMissions.resolve(mode).encounter.immediate) {
                DW.flightSim.spawn(combat, state, asteroid.radius);
            }
            return snapshot();
        }
        /** @param {{mode: string; enabled: boolean; profile: Profile}} config */
        function reset(config) {
            applyGeology(config.mode);
            combat = DW.flightSim.create(config.mode);
            activeProfile = config.profile;
            DW.flightSim.configure(combat, activeProfile);
            combat.enabled = config.enabled&&(!DW.flightMissions.resolve(config.mode).emptySpace||config.mode==='cinematic'||!!DW.flightMissions.resolve(config.mode).sky.hyperbolic);
            guns = DW.flightGuns.create();
            state = model.createSortie(asteroid.radius, config.profile, config.mode);
            if(state.curvature&&curvatureOverride)state.curvature=curvatureOverride;
            combat.useHullModels = true;
            DW.flightSim.bindPlayer(combat, state).guns = guns;
            contact = false;
            grounded = false;
            remainder = 0;
            configureCombat();
            if (combat.enabled&&config.mode!=='cinematic'){
                DW.flightSim.spawn(combat, state, asteroid.radius);
            }
            return snapshot();
        }
        /** Configure the stationary cinematic observer after the encounter rig resets. */
        function prepareCinematicObserver(){
            setStartPosition([0,-10000/units,5000/units]);
            state.throttle=0;combat.player.hp=combat.player.maxHp=1e9;
            combat.hull=combat.maxHull=1e9;combat.enabled=true;
        }
        /** Preserve the encounter's relative placement while facing the Aegis study hull. */
        function prepareAegisStudy(){
            var oldEye=state.eye.slice(),start=[-200/units,-1100/units,1200+220/units];
            DW.flightSim.participants(combat).filter(function(c){return c.controller!=='input';}).forEach(function(c){c.pose.eye=c.pose.eye.map(function(v,i){return v+start[i]-oldEye[i];});});
            setStartPosition(start);state.ramp=[0,0,0];state.throttle=0;
            var forward=[200,1100,-220],length=Math.hypot.apply(null,forward);forward=forward.map(function(v){return v/length;});
            var rightLength=Math.hypot(forward[0],forward[1]),right=[forward[1]/rightLength,-forward[0]/rightLength,0];
            state.right=right;state.back=forward.map(function(v){return -v;});state.up=[right[1]*forward[2],-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]];
        }
        /** @param {number} elapsed @param {Demand} controls @param {{profile: Profile; weapon: Weapon}} config */
        function advance(elapsed, controls, config) {
            if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('Invalid elapsed time');
            // Like duels, retain fractional time and execute only complete ticks.
            // Every tick completed by this call uses this call's sampled demand.
            remainder += elapsed;
            if (remainder + 1e-10 >= fixedStep) contact = false;
            while (remainder + 1e-10 >= fixedStep) {
                var dt = fixedStep;
                remainder = Math.max(0, remainder - dt);
                var wasGrounded = grounded, angle = spinRate * dt;
                asteroid.rotation = (asteroid.rotation + angle) % (2 * Math.PI);
                // Contact is an arcade stop relative to the moving terrain.
                if (grounded) {
                    state.eye = rotateVector(state.eye, angle);
                    state.right = rotateVector(state.right, angle);
                    state.up = rotateVector(state.up, angle);
                    state.back = rotateVector(state.back, angle);
                }
                grounded = false;
                combat.player.profile = config.profile;
                combat.player.weaponIndex = DW.retailWeapons.indexOf(config.weapon);
                combat.onTerrainImpact = function (point) {
                    var marks = combat.terrainScorches || (combat.terrainScorches = []);
                    marks.push(rotateVector(point, -asteroid.rotation));
                    if (marks.length > 96) marks.shift();
                };
                updateLaunchOrigin();
                var emptySpace=DW.flightMissions.resolve(combat.mode).emptySpace||(combat.mode==='evacuation'||combat.mode==='scramble'||combat.mode==='convoy');
                var bridge=DW.flightMissions.resolve(combat.mode).sky.wormhole;
                var travelers=bridge?[state,...combat.enemies.map(function(c){return c.pose;}),...combat.wrecks.map(function(c){return c.pose;})]:[];
                var travelingCraft=bridge?[combat.player,...combat.enemies]:[];
                var previous=travelers.map(function(p){return p.eye.slice();});
                var previousFrames=travelingCraft.map(function(c){return DW.flightCollision.radius(c)>300/units?{right:c.pose.right.slice(),up:c.pose.up.slice(),back:c.pose.back.slice()}:null;});
                var feedback = DW.flightSim.stepControlled(combat, controls, config.weapon, dt, asteroid.radius, emptySpace?undefined:environment.terrainHit,undefined,bridge?function(){
                    var changed=false;
                    travelers.forEach(function(pose,index){
                        var craft=travelingCraft[index],radius=craft?DW.flightCollision.radius(craft):0;
                        if(craft&&radius>300/units){
                            var center=[(pose.region||0)*12000/units,-2000/units,1550/units];
                            var normal=previous[index].map(function(v,k){return v-center[k];}),length=Math.hypot.apply(null,normal);
                            normal=normal.map(function(v){return v/(length||1);});
                            var contact=DW.flightGuns.throatContact(previous[index],pose.eye,pose.velocity,pose.region||0,radius,DW.flightCollision.throatRadius(craft,normal));
                            if(contact){
                                pose.eye=contact.eye;pose.velocity=contact.velocity;
                                var frame=previousFrames[index];if(frame){pose.right=frame.right;pose.up=frame.up;pose.back=frame.back;}
                                changed=true;return;
                            }
                        }
                        var crossing=crossBridge(previous[index],pose.eye,pose.region||0);if(!crossing)return;
                        changed=true;pose.region=1-(pose.region||0);pose.eye=crossing.eye;
                        pose.right=bridgeVector(pose.right,crossing.normal);pose.up=bridgeVector(pose.up,crossing.normal);pose.back=bridgeVector(pose.back,crossing.normal);pose.velocity=bridgeVector(pose.velocity,crossing.normal);
                    });
                    if(changed)DW.flightSim.collisionChanged(combat);
                }:undefined);
                if(state.curvature)DW.flightSim.rebaseGeometry(combat);
                if (feedback.fired)
                    environment.onGunshot();
                if (feedback.impact)
                    environment.onImpact();
                if (combat.dead) {
                    remainder = 0;
                    break;
                }
                var length = Math.hypot.apply(null, state.eye), direction = state.eye.map(function (x) {
                    return x / (length || 1);
                });
                if (!emptySpace&&!(state.region||0)&&length < asteroid.radius * 1.12 + 5 / units) {
                    var surface = environment.surfaceFrame(asteroid, rotateVector(direction, -asteroid.rotation));
                    grounded = model.contact(state, rotateVector(surface.point, asteroid.rotation), asteroid.radius);
                    // Preserve resting contact at the exact clearance boundary.
                    if (!grounded && wasGrounded && Math.hypot.apply(null, state.velocity) < 1e-8 &&
                        Math.abs(Math.hypot.apply(null, state.eye) - Math.hypot.apply(null, surface.point) * asteroid.radius - 5 / units) < 1e-9)
                        grounded = true;
                    if (grounded) contact = true;
                }
            }
            return snapshot();
        }
        return { prepareCinematicObserver:prepareCinematicObserver, prepareAegisStudy:prepareAegisStudy, snapshot: snapshot, reset: reset, setCombat: setCombat, advance: advance,
            respawn:/** @param {import('./types').FlightState} pose */function(pose){
                state=pose;guns=DW.flightGuns.create();DW.flightSim.bindPlayer(combat,state).guns=guns;
                DW.flightSim.configure(combat,activeProfile);combat.player.damagedAt=combat.time;combat.player.hitFlash=0;combat.player.fire=false;
                combat.targetId=null;combat.targetLocked=false;contact=false;grounded=false;remainder=0;
                DW.flightSim.collisionChanged(combat,combat.player);return snapshot();
            },
            setCurvature:/** @param {number} radius */function(radius){if(!Number.isFinite(radius)||radius<100)throw new Error('Invalid curvature radius');curvatureOverride=radius;},
            setAsteroidDiameter: setAsteroidDiameter, setStartPosition: setStartPosition,
            setOpponentStyle: setOpponentStyle, configureHulls: configureHulls,
            acquireTarget: acquireTarget, toggleTargetLock: toggleTargetLock, nextTarget: nextTarget,
            advanceScenery: advanceScenery, setWorld: /** @param {World} value */ function (value) {
                world = value;
            } };
    }
    DW.flightSession = { create: create, rotateVector: rotateVector };
}());
