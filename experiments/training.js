(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').Identity} Identity */
    /** @typedef {import('./types').Combat} Combat */
    /** @typedef {import('./types').RadioEvent} RadioEvent */
    /** @typedef {import('./types').Pose} Pose */
    /** @typedef {import('./types').FlightState} FlightState */
    /** @typedef {import('./types').FlightInput} FlightInput */
    /** @typedef {import('./types').Craft} Craft */
    /** @typedef {import('./types').Weapon} Weapon */
    /** @typedef {import('./types').Bolt} Bolt */
    /** @typedef {import('./types').TerrainHit} TerrainHit */
    /** @typedef {import('./types').Hit} Hit */
    /** @typedef {import('./types').ArtCraft} ArtCraft */
    /** @typedef {import('./types').Batch} Batch */
    /** @typedef {import('./types').Guns} Guns */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks), U = DW.sim.METERS_PER_UNIT;
    /** @param {Combat} combat */
    function mission(combat){return DW.flightMissions.resolve(combat.mode);}
    /** @param {Combat} combat */
    function openingPending(combat){return mission(combat).opening.length>0&&combat.openingStep<mission(combat).opening.length+1;}
    /** Presentation-only rate limit for rapid-fire surface marks, never damage. @type {WeakMap<Craft,number>} */
    var scorchTimes=new WeakMap();
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
    // Cast slots also own the recurring voices; names stay stable across waves.
    var pilotCallsigns = DW.flightMissions.resolve().encounter.callsigns;
    /** @param {Identity | null} [craft] */
    function callsign(craft) {
        if (!craft || craft.id === 'control')
            return 'Control';
        if (craft.callsign)
            return craft.callsign;
        return typeof craft.index === 'number' && Number.isFinite(craft.index) ? pilotCallsigns[Math.abs(Math.floor(craft.index)) % pilotCallsigns.length] : 'Unknown';
    }
    /** Every participant owns its pose, defenses, weapons and collision shape.
     * @param {string} id @param {FlightState} pose @param {string} team @returns {Craft} */
    function createCraft(id, pose, team) {
        return { id: id, index: 0, callsign: id, team: team, controller: 'input', pose: pose,
            profile: DW.arcade.profiles[0], hp: 100, maxHp: 100, shield: 120, maxShield: 120,
            collision: { kind: 'sphere', radiusM: 7 }, weaponIndex: 0, pilot: '', skill: 0, mode: 'idle', decision: 0,
            until: 0, goal: pose.eye.slice(), guns: DW.flightGuns.create(), damagedAt: -100,
            hitFlash: 0, fire: false, targetId: null, retarget: 0 };
    }
    /** @param {Craft} craft @param {import('./types').Demand} controls @param {number} dt */
    function stepInput(craft, controls, dt) {
        if (craft.hp <= 0) { craft.fire = false; return; }
        var state = craft.pose;
        if (controls.throttle !== null) state.throttle = controls.throttle;
        state.throttle = Math.max(-1, Math.min(1, state.throttle + controls.throttleRate * dt * .5));
        if (controls.stop) state.throttle = 0;
        craft.fire = controls.fire;
        DW.arcade.step(state, craft.profile, controls, dt);
    }
    /** Shared manual/duel tick: controlled movement, combat/NPCs, then controlled guns.
     * The optional observer samples metrics after combat and before controlled gun damage.
     * Scenery rotation, contact, audio, clocks and termination belong to the caller.
     * @param {Combat} t @param {import('./types').Demand} controls @param {Weapon} weapon
     * @param {number} dt @param {number} radius @param {TerrainHit} [terrainHit]
     * @param {() => void} [afterCombat] */
    function stepControlled(t, controls, weapon, dt, radius, terrainHit, afterCombat) {
        var craft = t.player, pose = craft.pose, guns = craft.guns;
        DW.training.stepInput(craft, controls, dt);
        var hullBefore = t.hull, shieldBefore = t.shield, hitBefore = t.lastHit;
        DW.training.step(t, pose, dt, radius, terrainHit);
        var playerDamaged = t.hull < hullBefore || t.shield < shieldBefore;
        if (afterCombat) afterCombat();
        var firedBefore = guns.fired, hitsBefore = guns.hits;
        // Finish the gun tick after death to age existing bolts; suppress new fire.
        collisionBatch(t,function(){DW.flightGuns.step(guns, pose, weapon, !mission(t).weaponsDisabled && !t.dead && !openingPending(t) && controls.fire, dt, function (start, end, bolt) {
            return DW.training.trace(t, start, end, bolt, 'player', terrainHit, pose);
        }, function () { return DW.training.convergencePoint(t, craft, weapon, terrainHit); }, craft.profile.gunMounts, DW.training.gunAnchors(craft));});
        return { playerDamaged: playerDamaged, fired: guns.fired > firedBefore,
            impact: guns.hits > hitsBefore || t.lastHit > hitBefore };
    }
    /** @param {Combat} t @returns {Craft[]} */
    function participants(t) { return [t.player].concat(t.enemies); }
    /** Apply shared flight/duel model choices before stepping or rendering.
     * @param {Combat} t @param {string} ally @param {string} enemy */
    function configureHulls(t, ally, enemy) {
        t.useHullModels = true;
        t.hullModels = { ally: ally, enemy: enemy };
        participants(t).forEach(function (craft) {
            var selection = (craft.team || 'enemy') === 'ally' ? ally : enemy;
            var id = DW.shipPackModels.craftModel(craft, selection, t.wave).id;
            if (craft.collision.kind === 'model' && craft.collision.modelId === id) return;
            craft.collision = { kind: 'model', modelId: id };
            // Surface marks belong to their original mesh.
            craft.scorches = [];
        });
    }
    /** @param {Craft} craft @returns {Vector[] | undefined} */
    function gunAnchors(craft) {
        if (craft.collision.kind !== 'model') return undefined;
        var entry = DW.shipPackModels.find(craft.collision.modelId);
        return DW.shipPackModels.gunAnchors(entry ? entry.model : DW.shipPackModels.craftModel(craft, '', 1));
    }
    /** @param {Combat} t @param {FlightState} pose */
    function bindPlayer(t, pose) { t.player.pose = pose; return t.player; }
    /** @param {string} mode @returns {Combat} */
    function create(mode) {
        var player = createCraft('player', DW.arcade.create(0), 'ally');
        var t = /** @type {Combat} */ ({ mode: mode || 'training', openingStep: 0, roundOver: false, enabled: true, time: 0, wave: 0, countdown: 3,
            player: player, enemies: [], wrecks: [], kills: 0, targetId: null, targetLocked: false, slots: [], slotTimer: 0,
            flashes: [], radioEvents: [], radioSerial: 0, playerKills: 0, configured: false, hull: 100, shield: 120, lastHit: -100, hitFlash: 0, dead: false });
        // Compatibility views for the HUD and older local callers; craft state is canonical.
        Object.defineProperties(t, {
            hull: { enumerable: false, get: function () { return t.player.hp; }, set: function (/** @type {number} */ v) { t.player.hp = v; } },
            shield: { enumerable: false, get: function () { return t.player.shield || 0; }, set: function (/** @type {number} */ v) { t.player.shield = v; } },
            maxHull: { enumerable: false, get: function () { return t.player.maxHp; }, set: function (/** @type {number} */ v) { t.player.maxHp = v; } },
            maxShield: { enumerable: false, get: function () { return t.player.maxShield; }, set: function (/** @type {number} */ v) { t.player.maxShield = v; } },
            lastHit: { enumerable: false, get: function () { return t.player.damagedAt; }, set: function (/** @type {number} */ v) { t.player.damagedAt = v; } },
            hitFlash: { enumerable: false, get: function () { return t.player.hitFlash || 0; }, set: function (/** @type {number} */ v) { t.player.hitFlash = v; } },
            dead: { enumerable: false, get: function () { return t.player.hp <= 0; }, set: function (/** @type {boolean} */ v) { t.player.hp = v ? 0 : t.player.hp || t.player.maxHp; } }
        });
        return t;
    }
    /** First supported default primary; unsupported subsystem weapons are not approximated.
     * @param {import('./types').Profile} profile */
    function defaultWeapon(profile) {
        var found = (profile.defaultWeapons || []).map(function (name) { return DW.retailWeapons.findIndex(function (w) { return w.name === name; }); }).find(function (i) { return i >= 0; });
        return found === undefined ? 0 : found;
    }
    /** @param {Combat} t @param {import('./types').Profile} profile @param {boolean} [unshielded] */
    function configure(t, profile, unshielded) {
        t.configured = true;
        t.player.profile = profile;
        t.player.weaponIndex = defaultWeapon(profile);
        t.maxHull = profile.hull === undefined ? 100 : profile.hull;
        t.maxShield = unshielded ? 0 : profile.shield === undefined ? 120 : profile.shield;
        t.hull = t.maxHull; t.shield = t.maxShield;
    }
    /** @param {Craft} e @param {import('./types').Profile} profile @param {number} weaponIndex @param {boolean} [unshielded] */
    function equip(e, profile, weaponIndex, unshielded) {
        e.profile = profile; e.maxHp = profile.hull === undefined ? 90 : profile.hull; e.hp = e.maxHp;
        e.maxShield = unshielded ? 0 : profile.shield || 0; e.shield = e.maxShield; e.weaponIndex = weaponIndex;
    }
    /** @param {Combat} t @param {Omit<RadioEvent, 'serial' | 'time' | 'wave'>} event */
    function radioEvent(t, event) {
        t.radioEvents = t.radioEvents || [];
        t.radioSerial = (t.radioSerial || 0) + 1;
        t.radioEvents.push(Object.assign({}, event, { serial: t.radioSerial, time: t.time, wave: t.wave }));
        if (t.radioEvents.length > 64)
            t.radioEvents.shift();
    }
    /** @param {Pick<Combat, 'enemies'>} t */
    function alive(t) {
        return t.enemies.filter(function (e) {
            return e.hp > 0;
        });
    }
    /** @param {Pose} pose @param {Vector} direction */
    function face(pose, direction) {
        var forward = unit(direction), reference = Math.abs(forward[2]) > .95 ? [0, 1, 0] : [0, 0, 1];
        pose.right = unit(cross(forward, reference));
        pose.up = unit(cross(pose.right, forward));
        pose.back = scale(forward, -1);
    }
    // Constant-speed intercept in SI seconds, using world-space target velocity.
    /** @param {Vector} origin @param {Vector} position @param {Vector} velocity @param {number} speed */
    function intercept(origin, position, velocity, speed) {
        var delta = sub(position, origin), a = dot(velocity, velocity) - speed * speed, b = 2 * dot(delta, velocity), c = dot(delta, delta), time = 0;
        if (Math.abs(a) < 1e-8) {
            if (b < 0)
                time = -c / b;
        }
        else {
            var disc = b * b - 4 * a * c;
            if (disc >= 0) {
                var roots = [(-b - Math.sqrt(disc)) / (2 * a), (-b + Math.sqrt(disc)) / (2 * a)].filter(function (x) {
                    return x > 0;
                });
                if (roots.length)
                    time = Math.min.apply(null, roots);
            }
        }
        return { point: add(position, scale(velocity, Math.min(2, time))), time: time };
    }
    // Sortie-local perception history; never read target velocity for gun aiming.
    /** @type {WeakMap<Craft, {target: FlightState, at: number, position: Vector, velocity: Vector}>} */
    var tracks = new WeakMap();
    /** Sample positions in world space so own motion does not masquerade as target motion.
     * Between samples extrapolate the last belief, including while maneuvering.
     * @param {Combat} t @param {Craft} e @param {FlightState} target */
    function trackAim(t, e, target) {
        var track = tracks.get(e), interval = [.24, .14, .08][e.skill];
        if (!track || track.target !== target || t.time < track.at) {
            track = {target: target, at: t.time, position: target.eye.slice(), velocity: [0, 0, 0]};
            tracks.set(e, track);
        } else if (t.time - track.at >= interval) {
            var elapsed = t.time - track.at;
            var measured = scale(sub(target.eye, track.position), 1 / elapsed);
            var response = 1 - Math.exp(-elapsed / [.65, .32, .14][e.skill]);
            track.velocity = add(track.velocity, scale(sub(measured, track.velocity), response));
            track.position = target.eye.slice();
            track.at = t.time;
        }
        var position = add(track.position, scale(track.velocity, t.time - track.at));
        var weapon = DW.retailWeapons[e.weaponIndex || 0];
        var solution = intercept(e.pose.eye, position, track.velocity, weapon.speed / U);
        e.gunGoal = solution.point;
        e.gunValid = solution.time > 0 && solution.time <= Math.min(2, weapon.lifetime);
        return solution;
    }
    /** @param {Combat} t @param {FlightState} player @param {number} radius */
    function spawn(t, player, radius) {
        bindPlayer(t, player);
        t.wave++;
        t.countdown = 0;
        t.slotTimer = 0;
        t.slots = [];
        var count = mission(t).encounter.count || Math.min(6,t.wave+2);
        t.roundOver = false;
        var retainedAllies=t.hangarSupport?t.enemies.filter(function(e){return e.hp>0&&e.team==='ally';}):[];
        t.enemies = [];
        for (var i = 0; i < count; i++) {
            var pose = DW.arcade.create(radius), lateral = (i - (count - 1) / 2) * 180;
            pose.eye = add(player.eye, add(scale(player.back, -(350 + i * 65) / U), add(scale(player.right, lateral / U), scale(player.up, (85 + (i % 2) * 65) / U))));
            var safe = radius + 90 / U;
            if (length(pose.eye) < safe)
                pose.eye = scale(unit(pose.eye), safe);
            face(pose, sub(player.eye, pose.eye));
            pose.throttle = .6;
            var skill = Math.min(2, Math.floor((t.wave - 1 + i) / 3));
            t.enemies.push(Object.assign(createCraft('wave-' + t.wave + '-' + i, pose, 'enemy'), {
                controller: 'ai', opponentStyle:t.opponentStyle||'baseline', collision: { kind: 'sphere', radiusM: 9 }, shield: 0, maxShield: 0,
                index: i, callsign: mission(t).encounter.callsigns[i] || callsign({ index: i }), profile: DW.arcade.profiles[i % 3 === 1 ? 1 : 0],
                hp: 90, maxHp: 90, pilot: ['Rookie', 'Veteran', 'Ace'][skill], skill: skill,
                mode: 'approach', decision: i * .13, goal: player.eye.slice()
            }));
            if (t.configured) {
                var craft = t.enemies[t.enemies.length - 1];
                equip(craft, craft.profile, defaultWeapon(craft.profile));
            }
        }
        if (mission(t).encounter.kind==='furball') {
            // Two opposing wings meet above the near side of the asteroid.
            var center = add(player.eye, add(scale(player.back, -450 / U), scale(player.up, 40 / U)));
            if (length(center) < radius + 100 / U)
                center = scale(unit(center), radius + 100 / U);
            var wingSize=Math.ceil(count/2);
            t.enemies.forEach(function (e, i) {
                e.team = i < wingSize ? 'ally' : 'enemy';
                var side = i < wingSize ? -1 : 1, j = i % wingSize;
                e.pose.eye = add(center, add(scale(player.right, side * (300 + (j % 2) * 80) / U), add(scale(player.back, (j - (wingSize-1)/2) * 65 / U), scale(player.up, ((j % 3) - 1) * 85 / U))));
                face(e.pose, sub(center, e.pose.eye));
                e.pose.throttle = .85;
                e.pose.velocity = scale(e.pose.back, -45);
                e.goal = center.slice();
                e.targetId = null;
                e.retarget = 0;
            });
        }
        var reserve=mission(t).encounter.reinforcements,art=mission(t).encounter.craftModels||[];
        if(reserve){
            var half=Math.ceil(count/2),split=reserve.rosterSplit;
            t.rosterNext={ally:half,enemy:half};t.replacementSerial=0;
            t.enemies.forEach(function(e,i){e.index=i<half?i:split+i-half;e.callsign=mission(t).encounter.callsigns[e.index];});
        }
        t.enemies.forEach(function(e){if(art.length)e.modelId=art[e.index%art.length]||undefined;});
        if (t.useHullModels) t.enemies.forEach(function (e) {
            var selection = t.hullModels ? ((e.team || 'enemy') === 'ally' ? t.hullModels.ally : t.hullModels.enemy) : 'mixed';
            e.collision = { kind: 'model', modelId: DW.shipPackModels.craftModel(e, selection, t.wave).id };
        });
        if(t.hangarSupport)t.enemies=t.enemies.filter(function(e){return e.team!=='ally';}).concat(retainedAllies);
        if(t.mode==='evacuation')DW.evacuationMission.start(t,player);
        var target = t.enemies.find(function (e) {
            return e.team !== 'ally';
        });
        t.targetId = target ? target.id : null;
        t.targetLocked = false;
    }
    /** @param {Pose} pose @param {Vector} goal @returns {FlightInput} */
    function steer(pose, goal) {
        var d = unit(sub(goal, pose.eye)), f = -dot(d, pose.back);
        return { pitch: Math.max(-1, Math.min(1, Math.atan2(dot(d, pose.up), f) * 2)), yaw: Math.max(-1, Math.min(1, -Math.atan2(dot(d, pose.right), f) * 2)), roll: 0 };
    }
    /** @param {Combat} t @param {Craft} e @param {FlightState} player */
    function decide(t, e, player) {
        if (e.opponentStyle === 'fso-pursuit' || e.opponentStyle === 'fso-breaker') { decideFreeSpace(t,e,player); return; }
        if (e.opponentStyle && e.opponentStyle !== 'baseline') { decideStyle(t,e,player); return; }
        var distance = length(sub(player.eye, e.pose.eye)) * U, active = (mission(t).encounter.kind==='furball') || t.slots.indexOf(e.id) >= 0;
        if (t.time >= e.until) {
            if (distance < 140) {
                e.mode = 'break';
                e.until = t.time + 2.5 + (2 - e.skill) * .6;
            }
            else if (e.hp < e.maxHp * .5 && t.time - e.damagedAt < 3) {
                e.mode = 'evade';
                e.until = t.time + 2.5;
            }
            else if (e.mode === 'break' || e.mode === 'evade') {
                e.mode = 'recover';
                e.until = t.time + 1.1;
            }
            else {
                e.mode = active ? 'attack' : 'reposition';
                e.until = t.time + .8;
            }
        }
        var goal = (e.gunGoal || player.eye).slice();
        if (e.mode === 'break' || e.mode === 'evade') {
            var away = unit(sub(e.pose.eye, player.eye)), side = scale(e.pose.right, (e.index % 2 ? 1 : -1) * 220 / U);
            goal = add(e.pose.eye, add(scale(away, 450 / U), side));
        }
        else if (e.mode === 'recover') {
            goal = add(e.pose.eye, scale(e.pose.back, -220 / U));
        }
        else if (!active) {
            var angle = t.time * .16 + e.index * 2.4;
            goal = add(player.eye, [Math.cos(angle) * 650 / U, Math.sin(angle) * 650 / U, (150 + Math.sin(angle * .7) * 140) / U]);
        }
        e.goal = goal;
        e.pose.throttle = e.mode === 'recover' ? .65 : e.mode === 'attack' && distance < 450 ? .72 : 1;
        e.decision = [.65, .42, .28][e.skill];
    }
    /** FreeSpace-inspired geometry; distances and velocities are explicit SI here.
     * @param {Craft} e @param {FlightState} target */
    function engagement(e,target) {
        var delta=sub(target.eye,e.pose.eye), distance=length(delta)*U, direction=unit(delta);
        var forward=scale(e.pose.back,-1), relative=sub(target.velocity,e.pose.velocity);
        var weapon=DW.retailWeapons[e.weaponIndex||0];
        var gun={point:e.gunGoal || target.eye,time:e.gunValid ? length(sub(e.gunGoal || target.eye,e.pose.eye))*U/weapon.speed : 0};
        var facing=dot(forward,direction), alignment=dot(forward,unit(sub(gun.point,e.pose.eye)));
        return {distance:distance,facing:facing,closure:-dot(relative,direction),gun:gun,
            useful:gun.time>0&&gun.time<=weapon.lifetime&&distance>130&&distance<Math.min(760,weapon.speed*weapon.lifetime)&&alignment>.996};
    }
    /** ai_chase/SM_GET_AWAY and attack_set_accel inspired adaptation, not a port.
     * No-progress clock observes opportunities/damage, never future pilot intent.
     * @param {Combat} t @param {Craft} e @param {FlightState} target @param {number} dt */
    function progressFreeSpace(t,e,target,dt) {
        var g=engagement(e,target);
        e.opportunityHold=g.useful?(e.opportunityHold||0)+dt:0;
        var victim=participants(t).find(function(c){return c.pose===target;});
        var damaged=t.time-e.damagedAt<dt*1.5 || !!victim&&t.time-victim.damagedAt<dt*1.5;
        e.noProgress=g.distance<800&&!damaged&&(e.opportunityHold||0)<.25?(e.noProgress||0)+dt:0;
    }
    /** Tactical goals -> existing steer -> shared stepInput/arcade.step.
     * @param {Combat} t @param {Craft} e @param {FlightState} target */
    function decideFreeSpace(t,e,target) {
        var g=engagement(e,target), now=t.time;
        var active=(mission(t).encounter.kind==='furball')||t.slots.indexOf(e.id)>=0;
        if(!active){e.mode='reposition';e.goal=add(target.eye,scale(e.pose.right,650/U));e.pose.throttle=.85;e.decision=.42;return;}
        var breaking=e.mode==='break', recovering=e.mode==='recover';
        if(breaking){
            var held=now-(e.maneuverAt||0);
            if(now>=e.until || held>=(e.breakReason==='no-progress'?2:1.5)&&g.distance>=(e.breakReason==='no-progress'?550:450)){
                e.mode='recover';e.until=now+2.5;e.maneuverAt=now;
                e.reentryGoal=add(target.eye,scale(target.velocity,.8/U));
                e.breakCooldown=now+6;
            }
        }else if(recovering){
            if(now>=e.until || now-(e.maneuverAt||0)>=.6&&g.facing>.85){e.mode='attack';}
        }else{
            var overshoot=g.distance<260&&g.closure>25&&g.facing>.5;
            var stalled=e.opponentStyle==='fso-breaker'&&(e.noProgress||0)>7&&g.distance<800&&!g.useful;
            // A productive tail is not broken merely because range is short.
            if(now>=(e.breakCooldown||0)&&((g.distance<95&&!g.useful)||overshoot||stalled)){
                e.mode='break';e.maneuverAt=now;e.until=now+(stalled?5:6);
                // Open range even when the current forward vector points at the target.
                var ahead=scale(e.pose.back,-1), away=unit(sub(e.pose.eye,target.eye));
                var direction=unit(add(add(scale(ahead,.5),away),scale(e.pose.right,(e.index%2?1:-1)*.65)));
                e.extensionGoal=add(e.pose.eye,scale(direction,1600/U));
                e.breakReason=stalled?'no-progress':'overshoot';
                e.separations=(e.separations||0)+1;
                if(stalled){e.progressEscapes=(e.progressEscapes||0)+1;e.noProgress=0;}
            }else e.mode='attack';
        }
        // Distinct navigation and gun targets: steering prediction is bounded by
        // ship travel time; blend toward projectile lead once facing/range permit.
        var nav=add(target.eye,scale(target.velocity,Math.min(1.5,g.distance/Math.max(60,e.profile.maxVelocity[2]))/U));
        var blend=Math.max(0,Math.min(1,(g.facing-.3)/.6))*Math.max(0,Math.min(1,(700-g.distance)/350));
        var goal=add(scale(nav,1-blend),scale(g.gun.point,blend));
        // Overshoot spacing is navigation only; relinquish it as gun lead takes priority.
        if(g.distance<280&&g.closure>10)goal=add(goal,scale(target.back,(1-blend)*Math.min(100,g.closure*2)/U));
        if(e.mode==='break'&&e.extensionGoal)goal=e.extensionGoal;
        if(e.mode==='recover'&&e.reentryGoal)goal=e.reentryGoal;
        e.goal=goal;
        // Positive forward floor, no stop/reverse/strafe. Match projected target
        // speed with a range correction, accounting for closure and facing.
        var along=dot(target.velocity,scale(e.pose.back,-1));
        var desired=along+(g.distance-330)*.16-g.closure*.35;
        e.pose.throttle=e.mode==='break'?1:e.mode==='recover'?.85:g.facing<.3?.85:Math.max(.45,Math.min(1,desired/e.profile.maxVelocity[2]));
        e.decision=[.65,.42,.28][e.skill];
    }
    /** Experimental personalities select goals; shared steering/physics execute them.
     * @param {Combat} t @param {Craft} e @param {FlightState} target */
    function decideStyle(t,e,target) {
        var delta=sub(target.eye,e.pose.eye), distance=length(delta)*U;
        var active=(mission(t).encounter.kind==='furball')||t.slots.indexOf(e.id)>=0;
        var forward=scale(e.pose.back,-1), targetForward=scale(target.back,-1);
        var behind=dot(unit(sub(e.pose.eye,target.eye)),targetForward)<-.65;
        var style=e.opponentStyle, wasExtending=e.mode==='break';
        if(t.time>=e.until){
            if(wasExtending){e.mode='attack';e.until=t.time+1.8;e.extensionGoal=undefined;}
            else if(distance<(style==='aggressor'?95:style==='passer'?280:155)){
                e.mode='break';e.until=t.time+(style==='passer'?3.8:1.4);
                // Commit to an escape heading instead of continuously turning away.
                e.extensionGoal=add(e.pose.eye,scale(unit(add(forward,scale(e.pose.right,.35))),1400/U));
            } else {e.mode=active?'attack':'reposition';e.until=t.time+.6;}
        }
        var weapon=DW.retailWeapons[e.weaponIndex||0];
        var lead={point:e.gunGoal || target.eye};
        var goal=lead.point;
        if(e.mode==='break'&&e.extensionGoal)goal=e.extensionGoal;
        else if(!active)goal=add(target.eye,scale(e.pose.right,650/U));
        else if(style==='aggressor')goal=add(target.eye,scale(sub(lead.point,target.eye),.35));
        else if(style==='interceptor'&&distance>350&&!behind){
            // Cut toward a bounded future position before settling onto gun lead.
            goal=add(target.eye,scale(target.velocity,Math.min(1.5,distance/450)/U));
        }
        e.goal=goal;
        e.pose.throttle=e.mode==='break'||style==='passer'?1:style==='aggressor'?.92:distance<350?.68:1;
        e.decision=[.65,.42,.28][e.skill];
    }
    /** @param {Vector} start @param {Vector} end @param {Vector} center @param {number} radius */
    function sphereHit(start, end, center, radius) {
        var delta = sub(end, start), offset = sub(start, center), a = dot(delta, delta), c = dot(offset, offset) - radius * radius;
        if (c <= 0)
            return { fraction: 0, point: start.slice() };
        if (a < 1e-14)
            return null;
        var b = 2 * dot(offset, delta), disc = b * b - 4 * a * c;
        if (disc < 0)
            return null;
        var f = (-b - Math.sqrt(disc)) / (2 * a);
        return f >= 0 && f <= 1 ? { fraction: f, point: add(start, scale(delta, f)) } : null;
    }
    /** Compatibility entry point; all participants use the same damage resolver.
     * @param {Combat} t @param {Weapon} weapon */
    function damagePlayer(t, weapon) { damageCraft(t, t.player, weapon); }
    /** @param {Combat} t @param {Craft} e @param {Weapon} weapon @param {Craft | string | null} [shooter] */
    function damageCraft(t, e, weapon, shooter) {
        if (e.hp <= 0)
            return;
        var hpBefore = e.hp;
        var shieldBefore = e.shield || 0, shieldDamage = weapon.damage * weapon.shieldFactor, absorbed = Math.min(shieldBefore, shieldDamage);
        if (e.shield !== undefined) e.shield = shieldBefore - absorbed;
        e.hp = Math.max(e.plotArmor ? 1 : 0, e.hp - weapon.damage * weapon.armorFactor * (1 - (shieldDamage > 0 ? absorbed / shieldDamage : 0)));
        if (shieldBefore > 0 && !e.shield) radioEvent(t, { kind:'shield', victim:e.id, team:e.team || 'enemy', index:e.index });
        if (e.hp > 0 && (e.hp < hpBefore || (e.shield || 0) < shieldBefore))
            radioEvent(t, { kind: 'hit', victim: e.id, team: e.team || 'enemy', index: e.index });
        e.damagedAt = t.time;
        e.hitFlash = .35;
        if (e.hp <= 0) {
            if (shooter === t.player || shooter === t.player.id)
                t.playerKills = (t.playerKills || 0) + 1;
            radioEvent(t, { kind: 'destroyed', victim: e.id, team: e.team || 'enemy', index: e.index, killer: shooter && typeof shooter === 'object' ? shooter.id : shooter || null });
            var pose = { eye: e.pose.eye.slice(), right: e.pose.right.slice(), up: e.pose.up.slice(), back: e.pose.back.slice(), velocity: e.pose.velocity.slice(), throttle: 0 };
            var axis = unit(add(pose.right, scale(pose.up, e.index % 2 ? -.7 : .7)));
            t.wrecks.push({ id: e.id + '-wreck', index: e.index, modelId:e.modelId, team: e.team, artWave: t.wave, pose: pose, axis: axis, spin: (e.index % 2 ? -1 : 1) * (.25 + (e.index % 5) * .09), age: 0, scorches: e.scorches || [] });
            // Keep debris across waves, with a bounded rendering/memory budget.
            if (t.wrecks.length > 48)
                t.wrecks.shift();
            e.fire = false;
            e.pose.throttle = 0;
            if ((e.team || 'enemy') !== 'ally')
                t.kills++;
            if (!alive(t).length)
                t.countdown = 5;
            t.flashes.push({ position: e.pose.eye.slice(), velocity: e.pose.velocity.map(function(v){return v/U;}), age: 0, scale: 14, destruction: true });
            if(t.flashes.length>48)t.flashes.splice(0,t.flashes.length-48);
        }
    }
    /** Geometry is selected by serializable simulation state, never by appearance controls.
     * @param {Craft} craft @param {Vector} start @param {Vector} end @param {number} [boltRadius] */
    function hullHit(craft, start, end, boltRadius) {
        var shape = craft.collision || { kind: 'sphere', radiusM: 9 };
        if (shape.kind === 'sphere') return sphereHit(start, end, craft.pose.eye, (shape.radiusM + (boltRadius || 0)) / U);
        var model = DW.shipPackModels.find(shape.modelId);
        // The built-in training hull is not part of an asset pack.
        var geometry = model ? model.model : DW.shipPackModels.craftModel(craft, '', 1);
        if (geometry.id !== shape.modelId) throw new Error('Unknown collision model ' + shape.modelId);
        return DW.shipPackModels.hullHit(geometry, craft.pose, start, end, U, boltRadius);
    }
    /** Resolve a shared muzzle aim point only along the crosshair ray; no target snapping or lead.
     * @param {Combat} t @param {Craft} shooter @param {Weapon} weapon @param {TerrainHit} [terrainHit]
     * @returns {Vector | null} */
    function convergencePoint(t, shooter, weapon, terrainHit) {
        var start = shooter.pose.eye, end = add(start, scale(shooter.pose.back, -weapon.speed * weapon.lifetime / U));
        var terrain = terrainHit ? terrainHit(start, end) : null;
        var best = terrain ? length(sub(terrain, start)) : Infinity;
        var point = /** @type {Vector | null} */ (null);
        participants(t).forEach(function (craft) {
            if (craft === shooter || craft.hp <= 0 || (craft.team || 'enemy') === (shooter.team || 'enemy')) return;
            var hit = hullHit(craft, start, end);
            if (!hit) return;
            var distance = length(sub(hit.point, start));
            // The gun controller retracts its launch points for point-blank surfaces.
            if (distance * U > .01 && distance < best) { best = distance; point = hit.point; }
        });
        return point;
    }
    /** @typedef {{craft:Craft, x:number,y:number,z:number,r:number,key:string,shape:string,team:string,alive:boolean,order:number}} CollisionEntry */
    /** @typedef {{entries:CollisionEntry[],cells:Map<string,CollisionEntry[]>,large:CollisionEntry[],motion:number,epoch:number,time:number}} CollisionIndex */
    /** @type {WeakMap<Combat,CollisionIndex>} */var collisionIndices=new WeakMap();
    /** @type {WeakMap<Bolt,{index:CollisionIndex,epoch:number,motion:number,point:Vector,radius:number,faction:string}>} */var collisionSleeps=new WeakMap();
    var collisionCell=128/U, sleepClearance=100/U;
    /** @typedef {'legacy'|'grid'|'tree'|'grid-events'|'tree-events'} CollisionMode */
    /** @typedef {{min:number[],max:number[]}} CollisionBox */
    /** @template T @typedef {{box:CollisionBox,value:T|null,parent:SpaceNode<T>|null,left:SpaceNode<T>|null,right:SpaceNode<T>|null,height:number,keys:string[]}} SpaceNode */
    /** @template T @typedef {{root:SpaceNode<T>|null,cells:Map<string,Set<SpaceNode<T>>>,large:Set<SpaceNode<T>>,tree:boolean}} Space */
    /** @typedef {{entry:CollisionEntry,node:SpaceNode<CollisionEntry>}} ShipProxy */
    /** @typedef {{at:number,active:boolean,epoch:number,faction:string,radius:number,raw:CollisionBox,node:SpaceNode<CollisionEvent>|null,candidates:CollisionEntry[]}} CollisionEvent */
    /** @typedef {{mode:CollisionMode,index:CollisionIndex,ships:Space<CollisionEntry>,corridors:Space<CollisionEvent>,proxies:Map<Craft,ShipProxy>,events:WeakMap<Bolt,CollisionEvent>,heap:CollisionEvent[],activeEvents:number,depth:number,epoch:number,stats:{syncs:number,moves:number,queries:number,reuses:number,popped:number,wakes:number}}} CollisionEngine */
    /** @type {WeakMap<Combat,CollisionMode>} */var collisionModes=new WeakMap();
    /** @type {WeakMap<Combat,CollisionEngine>} */var collisionEngines=new WeakMap();
    /** @param {CollisionBox} a @param {CollisionBox} b */
    function boxesOverlap(a,b){return a.min[0]<=b.max[0]&&a.max[0]>=b.min[0]&&a.min[1]<=b.max[1]&&a.max[1]>=b.min[1]&&a.min[2]<=b.max[2]&&a.max[2]>=b.min[2];}
    /** @param {CollisionBox} a @param {CollisionBox} b */
    function boxContains(a,b){return a.min[0]<=b.min[0]&&a.max[0]>=b.max[0]&&a.min[1]<=b.min[1]&&a.max[1]>=b.max[1]&&a.min[2]<=b.min[2]&&a.max[2]>=b.max[2];}
    /** @param {Vector} a @param {Vector} b @param {number} padding @returns {CollisionBox} */
    function segmentBox(a,b,padding){return {min:[Math.min(a[0],b[0])-padding,Math.min(a[1],b[1])-padding,Math.min(a[2],b[2])-padding],max:[Math.max(a[0],b[0])+padding,Math.max(a[1],b[1])+padding,Math.max(a[2],b[2])+padding]};}
    /** @param {CollisionBox} a @param {CollisionBox} b */
    function boxUnion(a,b){return {min:[Math.min(a.min[0],b.min[0]),Math.min(a.min[1],b.min[1]),Math.min(a.min[2],b.min[2])],max:[Math.max(a.max[0],b.max[0]),Math.max(a.max[1],b.max[1]),Math.max(a.max[2],b.max[2])]};}
    /** @param {CollisionBox} a */
    function boxArea(a){var x=a.max[0]-a.min[0],y=a.max[1]-a.min[1],z=a.max[2]-a.min[2];return x*y+y*z+z*x;}
    /** @template T @param {boolean} tree @returns {Space<T>} */
    function makeSpace(tree){return {root:null,cells:new Map(/** @type {[string,Set<SpaceNode<T>>][]} */([])),large:new Set(/** @type {SpaceNode<T>[]} */([])),tree:tree};}
    /** @param {CollisionBox} box @returns {string[]|null} */
    function boxKeys(box){
        var lo=box.min.map(function(v){return Math.floor(v/collisionCell);}),hi=box.max.map(function(v){return Math.floor(v/collisionCell);});
        if((hi[0]-lo[0]+1)*(hi[1]-lo[1]+1)*(hi[2]-lo[2]+1)>512)return null;
        var keys=/** @type {string[]} */([]);for(var x=lo[0];x<=hi[0];x++)for(var y=lo[1];y<=hi[1];y++)for(var z=lo[2];z<=hi[2];z++)keys.push(x+','+y+','+z);return keys;
    }
    /** @template T @param {SpaceNode<T>} n */
    function refitNode(n){if(n.left&&n.right){n.box=boxUnion(n.left.box,n.right.box);n.height=1+Math.max(n.left.height,n.right.height);}}
    /** AVL rotations keep insertion orders from producing a linear tree.
     * @template T @param {Space<T>} space @param {SpaceNode<T>|null} node */
    function refitSpace(space,node){
        while(node){
            refitNode(node);var left=node.left,right=node.right;
            if(left&&right&&Math.abs(left.height-right.height)>1){
                var heavy=left.height>right.height?left:right,isLeft=heavy===left;
                var inner=isLeft?heavy.right:heavy.left,outer=isLeft?heavy.left:heavy.right;
                if(inner&&outer&&inner.height>outer.height){
                    // First rotate the heavy child toward its taller inner grandchild.
                    var transfer=isLeft?inner.left:inner.right;
                    if(isLeft){heavy.right=transfer;inner.left=heavy;node.left=inner;}else{heavy.left=transfer;inner.right=heavy;node.right=inner;}
                    if(transfer)transfer.parent=heavy;heavy.parent=inner;inner.parent=node;refitNode(heavy);refitNode(inner);heavy=inner;
                }
                var parent=node.parent,bridge=isLeft?heavy.right:heavy.left;
                if(isLeft){node.left=bridge;heavy.right=node;}else{node.right=bridge;heavy.left=node;}
                if(bridge)bridge.parent=node;node.parent=heavy;heavy.parent=parent;
                if(!parent)space.root=heavy;else if(parent.left===node)parent.left=heavy;else parent.right=heavy;
                refitNode(node);refitNode(heavy);node=heavy;
            }
            node=node.parent;
        }
    }
    /** @template T @param {Space<T>} space @param {CollisionBox} box @param {T} value @returns {SpaceNode<T>} */
    function spaceInsert(space,box,value){
        var leaf=/** @type {SpaceNode<T>} */({box:box,value:value,parent:null,left:null,right:null,height:0,keys:[]});
        if(!space.tree){var keys=boxKeys(box);if(!keys)space.large.add(leaf);else {leaf.keys=keys;keys.forEach(function(key){var bucket=space.cells.get(key);if(!bucket){bucket=new Set(/** @type {SpaceNode<T>[]} */([]));space.cells.set(key,bucket);}bucket.add(leaf);});}return leaf;}
        if(!space.root){space.root=leaf;return leaf;}
        var sibling=space.root;
        while(sibling.left&&sibling.right){var l=sibling.left,r=sibling.right;sibling=boxArea(boxUnion(l.box,box))-boxArea(l.box)<boxArea(boxUnion(r.box,box))-boxArea(r.box)?l:r;}
        var parent=sibling.parent,branch=/** @type {SpaceNode<T>} */({box:boxUnion(box,sibling.box),value:null,parent:parent,left:sibling,right:leaf,height:1,keys:[]});
        sibling.parent=branch;leaf.parent=branch;if(!parent)space.root=branch;else if(parent.left===sibling)parent.left=branch;else parent.right=branch;
        refitSpace(space,branch);return leaf;
    }
    /** @template T @param {Space<T>} space @param {SpaceNode<T>} leaf */
    function spaceRemove(space,leaf){
        if(!space.tree){space.large.delete(leaf);leaf.keys.forEach(function(key){var bucket=space.cells.get(key);if(bucket){bucket.delete(leaf);if(!bucket.size)space.cells.delete(key);}});return;}
        var parent=leaf.parent;if(!parent){space.root=null;return;}var sibling=parent.left===leaf?parent.right:parent.left,grand=parent.parent;
        if(!sibling)return;sibling.parent=grand;if(!grand)space.root=sibling;else if(grand.left===parent)grand.left=sibling;else grand.right=sibling;
        leaf.parent=null;refitSpace(space,grand);
    }
    /** @template T @param {Space<T>} space @param {CollisionBox} box @returns {T[]} */
    function spaceQuery(space,box){
        var result=/** @type {T[]} */([]);
        if(space.tree){var stack=/** @type {SpaceNode<T>[]} */([]);if(space.root)stack.push(space.root);while(stack.length){var node=stack.pop();if(!node||!boxesOverlap(node.box,box))continue;if(node.value!==null)result.push(node.value);else {if(node.left)stack.push(node.left);if(node.right)stack.push(node.right);}}return result;}
        var keys=boxKeys(box),seen=new Set(/** @type {SpaceNode<T>[]} */([]));
        /** @param {SpaceNode<T>} leaf */function visit(leaf){if(!seen.has(leaf)){seen.add(leaf);if(leaf.value!==null&&boxesOverlap(leaf.box,box))result.push(leaf.value);}}
        if(keys)keys.forEach(function(key){var bucket=space.cells.get(key);if(bucket)bucket.forEach(visit);});else space.cells.forEach(function(bucket){bucket.forEach(visit);});
        space.large.forEach(visit);return result;
    }
    /** @param {CollisionEngine} engine @param {CollisionEvent} event */
    function wakeCollision(engine,event){if(!event.active)return;event.active=false;engine.activeEvents--;if(event.node)spaceRemove(engine.corridors,event.node);event.node=null;engine.stats.wakes++;}
    /** @param {CollisionEngine} engine @param {CollisionEvent} event */
    function pushCollisionEvent(engine,event){var heap=engine.heap,i=heap.length;heap.push(event);while(i){var p=(i-1)>>1;if(heap[p].at<=event.at)break;heap[i]=heap[p];i=p;}heap[i]=event;}
    /** @param {CollisionEngine} engine @param {number} time */
    function drainCollisionEvents(engine,time){
        var heap=engine.heap;
        while(heap.length&&heap[0].at<=time){var event=heap[0],last=heap.pop();if(heap.length&&last){var i=0;while(i*2+1<heap.length){var c=i*2+1;if(c+1<heap.length&&heap[c+1].at<heap[c].at)c++;if(heap[c].at>=last.at)break;heap[i]=heap[c];i=c;}heap[i]=last;}engine.stats.popped++;wakeCollision(engine,event);}
        // Direction changes and teleports can leave stale events before their deadlines.
        if(heap.length>engine.activeEvents*2+256){var live=heap.filter(function(e){return e.active;});heap.length=0;live.forEach(function(e){pushCollisionEvent(engine,e);});}
    }
    /** @param {Combat} t @param {CollisionMode} mode */
    function setCollisionMode(t,mode){if(['legacy','grid','tree','grid-events','tree-events'].indexOf(mode)<0)throw new Error('Unknown collision mode');collisionModes.set(t,mode);collisionEngines.delete(t);collisionIndices.delete(t);}
    /** @param {Combat} t */
    function getCollisionEngine(t){
        var mode=collisionModes.get(t)||'grid-events';if(mode==='legacy')return null;
        var engine=collisionEngines.get(t);
        if(!engine){engine={mode:mode,index:{entries:[],cells:new Map(/** @type {[string,CollisionEntry[]][]} */([])),large:[],motion:0,epoch:0,time:t.time},ships:makeSpace(mode.indexOf('tree')===0),corridors:makeSpace(mode.indexOf('tree')===0),proxies:new Map(/** @type {[Craft,ShipProxy][]} */([])),events:new WeakMap(),heap:[],activeEvents:0,depth:0,epoch:0,stats:{syncs:0,moves:0,queries:0,reuses:0,popped:0,wakes:0}};collisionEngines.set(t,engine);}
        return engine;
    }
    /** @param {CollisionEngine} engine @param {Craft} craft @param {number} order */
    function moveCollisionProxy(engine,craft,order){
        var shape=craft.collision,signature=!shape?'sphere:9':shape.kind==='sphere'?'sphere:'+shape.radiusM:'model:'+shape.modelId;
        var proxy=engine.proxies.get(craft),entry=proxy?proxy.entry:null,p=craft.pose.eye,team=craft.team||'enemy';
        if(!entry||entry.shape!==signature){if(proxy)spaceRemove(engine.ships,proxy.node);entry={craft:craft,x:p[0],y:p[1],z:p[2],r:collisionRadius(craft),key:'',shape:signature,team:team,alive:craft.hp>0,order:order};proxy=undefined;engine.epoch++;}
        if(entry.team!==team||entry.alive!==(craft.hp>0)||entry.order!==order){engine.epoch++;entry.team=team;}entry.alive=craft.hp>0;entry.order=order;entry.x=p[0];entry.y=p[1];entry.z=p[2];
        var actual=segmentBox(p,p,entry.r);
        if(!proxy||!boxContains(proxy.node.box,actual)){
            if(proxy)spaceRemove(engine.ships,proxy.node);
            var padded=segmentBox(p,p,entry.r+32/U);
            // Unknown bounds remain global; their envelope overlaps every corridor.
            spaceQuery(engine.corridors,padded).forEach(function(event){wakeCollision(engine,event);});
            proxy={entry:entry,node:spaceInsert(engine.ships,padded,entry)};engine.proxies.set(craft,proxy);engine.stats.moves++;
        }
        return entry;
    }
    /** Full observation is retained for public direct queries; managed batches notify movement explicitly.
     * @param {Combat} t @param {CollisionEngine} engine */
    function syncCollisionEngine(t,engine){
        if(engine.depth)return;engine.stats.syncs++;
        if(t.time<engine.index.time){engine.heap.forEach(function(event){wakeCollision(engine,event);});engine.heap.length=0;engine.epoch++;}engine.index.time=t.time;
        var seen=new Set(/** @type {Craft[]} */([])),entries=engine.index.entries;
        for(var i=0;i<=t.enemies.length;i++){var craft=i?t.enemies[i-1]:t.player;seen.add(craft);entries[i]=moveCollisionProxy(engine,craft,i);}
        if(entries.length!==t.enemies.length+1)engine.epoch++;entries.length=t.enemies.length+1;
        engine.proxies.forEach(function(proxy,craft){if(!seen.has(craft)){spaceRemove(engine.ships,proxy.node);engine.proxies.delete(craft);engine.epoch++;}});
        drainCollisionEvents(engine,t.time);
    }
    /** @template T @param {Combat} t @param {() => T} work @returns {T} */
    function collisionBatch(t,work){var engine=getCollisionEngine(t);if(!engine)return work();syncCollisionEngine(t,engine);engine.depth++;try{return work();}finally{engine.depth--;}}
    /** Notify an in-batch movement; omit craft after arbitrary roster/state edits.
     * @param {Combat} t @param {Craft} [craft] */
    function collisionChanged(t,craft){var engine=getCollisionEngine(t);if(!engine)return;var proxy=craft&&engine.proxies.get(craft);if(craft&&proxy){moveCollisionProxy(engine,craft,proxy.entry.order);return;}var depth=engine.depth;engine.depth=0;try{syncCollisionEngine(t,engine);}finally{engine.depth=depth;}}
    /** @param {Combat} t */
    function collisionStats(t){var engine=getCollisionEngine(t);return engine?Object.assign({mode:engine.mode,queued:engine.heap.length},engine.stats):{mode:'legacy',queued:0,syncs:0,moves:0,queries:0,reuses:0,popped:0,wakes:0};}
    /** @param {Combat} t @param {CollisionEngine} engine @param {Vector} start @param {Vector} end @param {Bolt} bolt @param {string} faction @param {Craft|undefined} shooter */
    function eventCollisionCandidates(t,engine,start,end,bolt,faction,shooter){
        var radius=bolt.weapon.headRadius||0,margin=Math.max(30,radius)/U,raw=segmentBox(start,end,0),event=engine.events.get(bolt),scheduled=engine.mode.indexOf('-events')>=0;
        if(scheduled&&event&&event.active&&event.epoch===engine.epoch&&event.faction===faction&&event.radius===radius&&t.time<event.at&&boxContains(event.raw,raw)){engine.stats.reuses++;return event.candidates;}
        if(event)wakeCollision(engine,event);
        // Legacy direct callers may supply a damage-only bolt without ballistic metadata.
        var remaining=bolt.weapon.lifetime-bolt.age,horizon=Number.isFinite(remaining)&&Number.isFinite(bolt.weapon.speed)&&bolt.weapon.speed>0?Math.min(.25,Math.max(0,remaining)):0,span=Math.hypot(end[0]-start[0],end[1]-start[1],end[2]-start[2]);
        if(scheduled&&horizon>0&&span>0){var travel=bolt.weapon.speed*horizon/U,future=end.map(function(v,k){return v+(end[k]-start[k])/span*travel;});raw=segmentBox(start,future,0);}
        var query={min:raw.min.map(function(v){return v-margin;}),max:raw.max.map(function(v){return v+margin;})};engine.stats.queries++;
        var candidates=spaceQuery(engine.ships,query).filter(function(e){return e.craft.hp>0&&e.craft!==shooter&&e.team!==faction;}).sort(function(a,b){return a.order-b.order;});
        if(scheduled&&horizon>0){event={at:t.time+horizon,active:true,epoch:engine.epoch,faction:faction,radius:radius,raw:raw,node:null,candidates:candidates};event.node=spaceInsert(engine.corridors,query,event);engine.events.set(bolt,event);engine.activeEvents++;pushCollisionEvent(engine,event);}
        return candidates;
    }
    /** @param {Craft} craft */
    function collisionRadius(craft){
        var shape=craft.collision;
        if(!shape||shape.kind==='sphere')return (shape?shape.radiusM:9)/U;
        // Minimal test adapters without a bound API retain the exhaustive path.
        if(!DW.shipPackModels||!DW.shipPackModels.hullRadius)return Infinity;
        var model=DW.shipPackModels.find(shape.modelId);
        var geometry=model?model.model:DW.shipPackModels.craftModel(craft,'',1);
        if(geometry.id!==shape.modelId)throw new Error('Unknown collision model '+shape.modelId);
        return DW.shipPackModels.hullRadius(geometry)/U;
    }
    /** Refresh against actual poses on EVERY query, including interleaved movement within a step.
     * The cumulative displacement budget makes sleeping safe under acceleration and teleports.
     * No speed prediction, frame-order assumption or delayed damage is needed.
     * @param {Combat} t */
    function collisionIndex(t){
        var engine=getCollisionEngine(t);if(engine){syncCollisionEngine(t,engine);return engine.index;}
        var index=collisionIndices.get(t);
        if(!index){index={entries:[],cells:new Map(/** @type {[string,CollisionEntry[]][]} */([])),large:[],motion:0,epoch:0,time:t.time};collisionIndices.set(t,index);}
        var rebuild=index.entries.length!==t.enemies.length+1;
        if(t.time<index.time){index.epoch++;}index.time=t.time;
        for(var i=0;i<=t.enemies.length;i++){
            var craft=i?t.enemies[i-1]:t.player,entry=index.entries[i],p=craft.pose.eye;
            var shape=craft.collision,signature=!shape?'sphere:9':shape.kind==='sphere'?'sphere:'+shape.radiusM:'model:'+shape.modelId;
            var team=craft.team||'enemy',living=craft.hp>0;
            if(!entry||entry.craft!==craft||entry.shape!==signature){
                entry={craft:craft,x:p[0],y:p[1],z:p[2],r:collisionRadius(craft),key:'',shape:signature,team:team,alive:living,order:i};
                index.entries[i]=entry;index.epoch++;rebuild=true;
            }
            if(entry.team!==team||entry.alive!==living){entry.team=team;entry.alive=living;index.epoch++;}
            if(!entry.key||p[0]!==entry.x||p[1]!==entry.y||p[2]!==entry.z){
                index.motion+=Math.hypot(p[0]-entry.x,p[1]-entry.y,p[2]-entry.z);
                entry.x=p[0];entry.y=p[1];entry.z=p[2];
                var key=Math.floor(p[0]/collisionCell)+','+Math.floor(p[1]/collisionCell)+','+Math.floor(p[2]/collisionCell);
                if(key!==entry.key){entry.key=key;rebuild=true;}
            }
        }
        if(index.entries.length>t.enemies.length+1){index.entries.length=t.enemies.length+1;index.epoch++;}
        if(rebuild){index.cells.clear();index.large.length=0;for(var j=0;j<index.entries.length;j++){var e=index.entries[j];
            if(e.r>collisionCell){index.large.push(e);continue;}
            var bucket=index.cells.get(e.key);if(!bucket){bucket=[];index.cells.set(e.key,bucket);}bucket.push(e);
        }}
        return index;
    }
    /** @param {CollisionIndex} index @param {Vector} a @param {Vector} b @param {number} margin */
    function collisionCandidates(index,a,b,margin){
        // A handful of scalar box checks beats hash lookups for a small encounter.
        if(index.entries.length<=24)return index.entries;
        var lo=[0,0,0],hi=[0,0,0];for(var k=0;k<3;k++){lo[k]=Math.floor((Math.min(a[k],b[k])-margin-collisionCell)/collisionCell);hi[k]=Math.floor((Math.max(a[k],b[k])+margin+collisionCell)/collisionCell);}
        // Long diagonal traces must not enumerate an unbounded volume of empty cells.
        if((hi[0]-lo[0]+1)*(hi[1]-lo[1]+1)*(hi[2]-lo[2]+1)>4096)return index.entries;
        var result=index.large.slice();
        for(var x=lo[0];x<=hi[0];x++)for(var y=lo[1];y<=hi[1];y++)for(var z=lo[2];z<=hi[2];z++){
            var bucket=index.cells.get(x+','+y+','+z);if(bucket)for(var j=0;j<bucket.length;j++)result.push(bucket[j]);
        }
        return result.sort(function(a,b){return a.order-b.order;});
    }
    /** @param {CollisionEntry} e @param {Vector} a @param {Vector} b @param {number} margin */
    function collisionNearby(e,a,b,margin){
        var r=e.r+margin;
        return e.x>=Math.min(a[0],b[0])-r&&e.x<=Math.max(a[0],b[0])+r&&e.y>=Math.min(a[1],b[1])-r&&e.y<=Math.max(a[1],b[1])+r&&e.z>=Math.min(a[2],b[2])-r&&e.z<=Math.max(a[2],b[2])+r;
    }
    /** @param {Combat} t @param {Vector} start @param {Vector} end @param {Bolt} bolt @param {Craft | string} team @param {TerrainHit | undefined} terrainHit @param {FlightState} player @param {number} [scorchInterval] @param {() => void} [onDamage] */
    function trace(t, start, end, bolt, team, terrainHit, player, scorchInterval, onDamage) {
        bindPlayer(t, player);
        var hit = terrainHit ? terrainHit(start, end) : null, travel = length(sub(end,start));
        var best = hit && travel > 0 ? length(sub(hit,start)) / travel : Infinity;
        var victim = /** @type {Craft | null} */ (null), surface = /** @type {Hit | null} */ (null);
        var index=collisionIndex(t);
        var shooter = typeof team === 'object' ? team : index.entries.find(function (e) { return e.craft.id === team; })?.craft;
        var faction = shooter ? shooter.team || 'enemy' : team === 'player' ? 'ally' : 'enemy';
        var radius=bolt.weapon.headRadius||0,margin=Math.max(30,radius)/U,sleep=collisionSleeps.get(bolt);
        var sleeping=sleep&&sleep.index===index&&sleep.epoch===index.epoch&&sleep.radius===radius&&sleep.faction===faction&&
            Math.max(Math.hypot(start[0]-sleep.point[0],start[1]-sleep.point[1],start[2]-sleep.point[2]),Math.hypot(end[0]-sleep.point[0],end[1]-sleep.point[1],end[2]-sleep.point[2]))+index.motion-sleep.motion<sleepClearance;
        var engine=getCollisionEngine(t);
        var candidates=engine?eventCollisionCandidates(t,engine,start,end,bolt,faction,shooter):sleeping?[]:collisionCandidates(index,start,end,margin+sleepClearance).filter(function(entry){
            return entry.craft.hp>0&&entry.craft!==shooter&&entry.team!==faction&&collisionNearby(entry,start,end,margin+sleepClearance);
        });
        if(!engine&&!sleeping&&!candidates.length)collisionSleeps.set(bolt,{index:index,epoch:index.epoch,motion:index.motion,point:end.slice(),radius:radius,faction:faction});
        candidates.forEach(function (entry) {
            var e=entry.craft;if(!collisionNearby(entry,start,end,radius/U))return;
            if (e.hp <= 0 || e === shooter || (e.team || 'enemy') === faction) return;
            var candidate = hullHit(e, start, end, bolt.weapon.headRadius || 0);
            if (candidate) {
                if (candidate.fraction < best) { best = candidate.fraction; hit = candidate.point; victim = e; surface = candidate; }
            }
        });
        var struck = /** @type {Craft | null} */ (victim), hull = /** @type {Hit | null} */ (surface);
        if (struck && hull && hull.model && hull.local && hull.normal && (!scorchInterval || t.time-(scorchTimes.get(struck)??-Infinity)>=scorchInterval)) {
            DW.shipPackModels.addScorch(struck, { fraction: hull.fraction, point: hull.point, model: hull.model, local: hull.local, normal: hull.normal });
            if(scorchInterval)scorchTimes.set(struck,t.time);
        }
        if (!struck && hit && t.onTerrainImpact) t.onTerrainImpact(hit);
        if (struck) {
            var before=onDamage?struck.hp+(struck.shield||0):0;
            damageCraft(t, struck, bolt.weapon, shooter || team);
            if(onDamage&&struck.hp+(struck.shield||0)<before)onDamage();
        }
        // Report close projectile passes, clipped at the first collision so occluded bolts cannot speak.
        var endPoint = hit || end, delta = sub(endPoint, start), span = dot(delta, delta);
        /** @param {Pose} pose @param {{nearMissAt?: number}} entity @param {string} id @param {string} factionName */
        function near(pose, entity, id, factionName) {
            if (!pose || span < 1e-12 || t.time - (entity.nearMissAt === undefined ? -100 : entity.nearMissAt) < 6)
                return;
            var fraction = Math.max(0, Math.min(1, dot(sub(pose.eye, start), delta) / span));
            var meters = length(sub(pose.eye, add(start, scale(delta, fraction)))) * U;
            if (meters > 10 && meters < 30) {
                entity.nearMissAt = t.time;
                radioEvent(t, { kind: 'near', victim: id, team: factionName });
            }
        }
        candidates.forEach(function (entry) {
            var e=entry.craft;
            if (e.hp > 0 && (e.team || 'enemy') !== faction && victim !== e)
                near(e.pose, e, e.id, e.team || 'enemy');
        });
        return hit;
    }
    /** @param {Combat} t @param {number} dt @param {TerrainHit} [terrainHit] */
    function stepWrecks(t, dt, terrainHit) {
        t.wrecks = t.wrecks.filter(function (w) {
            w.age += dt;
            if (w.age >= 120)
                return false;
            var p = w.pose, next = add(p.eye, scale(p.velocity, dt / U)), hit = terrainHit ? terrainHit(p.eye, next) : null;
            if (hit) {
                p.velocity = [0, 0, 0];
                w.spin = 0;
            }
            else
                p.eye = next;
            var angle = w.spin * dt, c = Math.cos(angle), s = Math.sin(angle);
            /** @param {Vector} v */
            function rotate(v) {
                return add(add(scale(v, c), scale(cross(w.axis, v), s)), scale(w.axis, dot(w.axis, v) * (1 - c)));
            }
            p.back = unit(rotate(p.back));
            p.right = unit(cross(rotate(p.up), p.back));
            p.up = unit(cross(p.back, p.right));
            return true;
        });
    }
    /** Replace each lost AI slot with the next cast member on its own team.
     * Launch origins are supplied by the session in scene units; no terrain or browser resources here.
     * @param {Combat} t @param {FlightState} player @param {number} radius */
    function replenish(t,player,radius){
        const config=mission(t).encounter.reinforcements;if(!config||!t.rosterNext)return;
        var names=mission(t).encounter.callsigns,art=mission(t).encounter.craftModels||[];
        var assigned=new Set(t.enemies.filter(function(e){return e.hp>0;}).map(function(e){return e.index;}));
        t.enemies=t.enemies.map(function(old){
            if(old.hp>0)return old;
            var side=/** @type {'ally'|'enemy'} */(old.team==='ally'?'ally':'enemy'),next=t.rosterNext;
            if(!next)return old;
            var index=0;do{index=(side==='enemy'?config.rosterSplit:0)+(next[side]++%config.rosterSplit);}while(assigned.has(index));assigned.add(index);
            var pose=DW.arcade.create(radius),direction=t.reinforcementDirection||[0,-.6,.8];
            pose.eye=(t.reinforcementOrigin||[0,0,radius+10/U]).slice();face(pose,direction);
            pose.velocity=scale(direction,config.launchSpeed);pose.throttle=1;
            var craft=createCraft('reserve-'+(t.replacementSerial=(t.replacementSerial||0)+1),pose,side);
            craft.index=index;craft.callsign=names[index];craft.modelId=art[index%art.length]||undefined;
            craft.skill=old.skill;craft.pilot=old.pilot;craft.controller='ai';craft.opponentStyle=t.opponentStyle||'baseline';craft.profile=DW.arcade.profiles[index%3===1?1:0];
            equip(craft,craft.profile,defaultWeapon(craft.profile));
            craft.hangarLaunch={remaining:config.launchSeconds};craft.mode='launch';craft.goal=player.eye.slice();
            if(t.useHullModels){var selection=t.hullModels?(side==='ally'?t.hullModels.ally:t.hullModels.enemy):'mixed';craft.collision={kind:'model',modelId:DW.shipPackModels.craftModel(craft,selection,t.wave).id};}
            return craft;
        });
    }
    /** @param {Combat} t @param {FlightState} player @param {number} dt @param {number} radius @param {TerrainHit} [terrainHit] */
    function step(t, player, dt, radius, terrainHit) {
        if (!t.enabled)
            return;
        bindPlayer(t, player);
        stepWrecks(t, dt, terrainHit);
        t.time += dt;
        if (openingPending(t)) return;
        participants(t).forEach(function (e) {
            e.hitFlash = Math.max(0, (e.hitFlash || 0) - dt);
            if (e.hp > 0 && e.maxShield !== undefined && t.time - e.damagedAt > 7)
                e.shield = Math.min(e.maxShield, (e.shield || 0) + 12 * dt);
        });
        t.flashes = t.flashes.filter(function (f) {
            f.age += dt;
            return f.age < (f.destruction ? 5.5 : .22);
        });
        replenish(t,player,radius);
        var living = alive(t);
        if (!t.dead && t.mode !== 'asteroid-patrol' && t.mode !== 'evacuation' && (!living.length || t.roundOver)) {
            t.countdown -= dt;
            if (t.countdown <= 0) {
                spawn(t, player, radius);
                living = alive(t);
            }
        }
        t.slotTimer -= dt;
        if (t.slotTimer <= 0) {
            // Two committed attack slots rotate every six seconds; other pilots reposition.
            var offset = Math.floor(t.time / 6) % Math.max(1, living.length);
            t.slots = living.slice(offset).concat(living.slice(0, offset)).slice(0, 2).map(function (e) {
                return e.id;
            });
            t.slotTimer = 3;
        }
        collisionBatch(t,function(){t.enemies.forEach(function (e) {
            if (e.controller !== 'input') e.fire = false;
            if(e.hp>0&&e.hangarLaunch){
                e.pose.eye=add(e.pose.eye,scale(e.pose.velocity,dt/U));
                e.hangarLaunch.remaining-=dt;e.fire=false;
                if(e.hangarLaunch.remaining<=0){delete e.hangarLaunch;e.mode='approach';e.goal=player.eye.slice();e.decision=0;}
            } else if (e.hp > 0 && e.controller !== 'input') {
                var candidates = participants(t).filter(function (other) { return other.hp > 0 && (other.team || 'enemy') !== (e.team || 'enemy'); });
                var opponent = candidates.length ? candidates[0].pose : null;
                if (mission(t).encounter.kind==='furball') {
                    e.retarget -= dt;
                    var target = living.find(function (other) {
                        return other.id === e.targetId && other.hp > 0 && other.team !== e.team;
                    });
                    if (!target || e.retarget <= 0) {
                        var choices = living.filter(function (other) {
                            return other.hp > 0 && other.team !== e.team;
                        });
                        choices.sort(function (a, b) {
                            return length(sub(a.pose.eye, e.pose.eye)) - length(sub(b.pose.eye, e.pose.eye));
                        });
                        // Commit to a nearby opponent for a few seconds rather than snapping targets.
                        target = choices[e.index % Math.min(3, choices.length)];
                        e.targetId = target ? target.id : null;
                        e.retarget = 2.5 + (e.index % 3) * .7;
                    }
                    opponent = target ? target.pose : opponent;
                }
                if (opponent) trackAim(t, e, opponent);
                else { tracks.delete(e); e.gunValid = false; }
                if(opponent&&(e.opponentStyle==='fso-pursuit'||e.opponentStyle==='fso-breaker'))progressFreeSpace(t,e,opponent,dt);
                e.decision -= dt;
                if (e.decision <= 0 && opponent)
                    decide(t, e, opponent);
                var goal = e.mode === 'attack' && (!e.opponentStyle || e.opponentStyle === 'baseline') ? (e.gunGoal || e.goal) : e.goal;
                var future = add(e.pose.eye, scale(e.pose.velocity, 1.6 / U)), avoid = radius + 65 / U;
                if (length(future) < avoid || length(e.pose.eye) < avoid)
                    goal = add(e.pose.eye, add(scale(unit(e.pose.eye), 400 / U), scale(e.pose.right, 180 / U)));
                // Separate nearby craft using steering demand, never velocity changes.
                living.forEach(function (other) {
                    if (other.id === e.id)
                        return;
                    var away = sub(e.pose.eye, other.pose.eye), d = length(away) * U;
                    if (d < 50)
                        goal = add(goal, scale(unit(away), (50 - d) * 8 / U));
                });
                var control = steer(e.pose, goal), distance = opponent ? length(sub(opponent.eye, e.pose.eye)) * U : Infinity;
                control.roll = e.mode === 'evade' ? Math.sin(t.time * 1.8 + e.index) * .65 : 0;
                control.boost = distance > 1200 && dot(unit(sub(goal, e.pose.eye)), scale(e.pose.back, -1)) > .95;
                stepInput(e, Object.assign({ throttle: e.pose.throttle, throttleRate: 0, fire: false }, control), dt);
                // Conservative safety shell keeps AI craft clear of the asteroid.
                var safe = radius + 20 / U;
                if (length(e.pose.eye) < safe) {
                    e.pose.eye = scale(unit(e.pose.eye), safe);
                    e.mode = 'break';
                    e.until = t.time + 2;
                }
                var aim = unit(sub(e.gunGoal || e.goal, e.pose.eye)), aligned = dot(aim, scale(e.pose.back, -1));
                var primary = DW.retailWeapons[e.weaponIndex || 0];
                e.fire = !!opponent && ((mission(t).encounter.kind==='furball') || t.slots.indexOf(e.id) >= 0) && e.mode === 'attack' && distance > 130 && distance < Math.min(760, primary.speed * primary.lifetime) && e.gunValid !== false && aligned > Math.cos(Math.atan2(5, Math.max(130, distance)));
            }
            var engine=getCollisionEngine(t);if(engine){var proxy=engine.proxies.get(e);moveCollisionProxy(engine,e,proxy?proxy.entry.order:0);}
            DW.flightGuns.step(e.guns, e.pose, DW.retailWeapons[e.weaponIndex || 0], e.fire, dt, function (start, end, bolt) {
                return trace(t, start, end, bolt, e, terrainHit, player);
            }, function () { return convergencePoint(t, e, DW.retailWeapons[e.weaponIndex || 0], terrainHit); }, e.profile.gunMounts, gunAnchors(e));
        });});
        replenish(t,player,radius);
        var nowAlive = alive(t);
        if (living.length && !nowAlive.length)
            t.countdown = 5;
        if (t.mode!=='evacuation' && !mission(t).encounter.reinforcements && (mission(t).encounter.kind==='furball') && !t.roundOver && t.wave > 0 && ((!t.hangarSupport&&!nowAlive.some(function (e) {
            return e.team === 'ally';
        })) || !nowAlive.some(function (e) {
            return e.team === 'enemy';
        }))) {
            t.roundOver = true;
            t.countdown = 5;
        }
        var targets = nowAlive.filter(function (e) {
            return e.team !== 'ally';
        });
        if (t.targetId && !nowAlive.some(function (e) {
            return e.id === t.targetId;
        }))
            { t.targetId = targets.length ? targets[0].id : null; t.targetLocked = false; }
    }
    /** Acquire the nearest hull crossed by the forward sight line; retain the last contact in empty space.
     * @param {Combat} t @param {FlightState} state */
    function acquireTarget(t, state) {
        var living = alive(t);
        if (!living.some(function (e) { return e.id === t.targetId; })) {
            t.targetId = null;
            t.targetLocked = false;
        }
        if (t.targetLocked) return;
        var start = state.eye, end = add(start, scale(state.back, -1000000)), best = Infinity;
        living.forEach(function (craft) {
            var hit = hullHit(craft, start, end);
            if (!hit) return;
            var distance = length(sub(hit.point, start));
            if (distance < best) { best = distance; t.targetId = craft.id; }
        });
    }
    /** @param {Combat} t */
    function toggleTargetLock(t) {
        t.targetLocked = !t.targetLocked && alive(t).some(function (e) { return e.id === t.targetId; });
    }
    /** @param {Combat} t */
    function cycle(t) {
        t.targetLocked = false;
        var list = alive(t).filter(function (e) {
            return e.team !== 'ally';
        }), index = list.findIndex(function (e) {
            return e.id === t.targetId;
        });
        t.targetId = list.length ? list[(index + 1) % list.length].id : null;
    }
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
    /** @param {Combat} t @param {Guns} playerGuns */
    function allGuns(t, playerGuns) {
        var result = { bolts: playerGuns.bolts.slice(), impacts: playerGuns.impacts.concat(t.flashes.filter(function(f){return !f.destruction;})) };
        t.enemies.forEach(function (e) {
            result.bolts = result.bolts.concat(e.guns.bolts.map(function (b) {
                return Object.assign({}, b, { team: e.team || 'enemy' });
            }));
            result.impacts = result.impacts.concat(e.guns.impacts);
        });
        return result;
    }
    DW.training = { setCollisionMode: setCollisionMode, collisionBatch: collisionBatch, collisionStats: collisionStats, collisionChanged: collisionChanged, stepControlled: stepControlled, acquireTarget: acquireTarget, toggleTargetLock: toggleTargetLock, gunAnchors: gunAnchors, stepInput: stepInput, createCraft: createCraft, participants: participants, configureHulls: configureHulls, bindPlayer: bindPlayer, hullHit: hullHit, convergencePoint: convergencePoint, defaultWeapon:defaultWeapon, configure:configure, equip:equip, callsign: callsign, create: create, alive: alive, spawn: spawn, stepWrecks: stepWrecks, steer: steer, intercept: intercept, sphereHit: sphereHit, damageCraft: damageCraft, damageEnemy: damageCraft, damagePlayer: damagePlayer, trace: trace, step: step, cycle: cycle, geometry: geometry, allGuns: allGuns };
}());

