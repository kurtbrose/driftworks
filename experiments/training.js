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
    var pilotCallsigns = ['Rook', 'Jinx', 'Flint', 'Echo', 'Mako', 'Sable', 'Patch', 'Nova', 'Viper', 'Wraith', 'Razor', 'Hex', 'Talon', 'Knell', 'Cinder', 'Shade'];
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
        state.throttle = Math.max(0, Math.min(1, state.throttle + controls.throttleRate * dt * .5));
        if (controls.stop) state.throttle = 0;
        craft.fire = controls.fire;
        DW.arcade.step(state, craft.profile, controls, dt);
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
    /** @param {Combat} t @param {FlightState} pose */
    function bindPlayer(t, pose) { t.player.pose = pose; return t.player; }
    /** @param {string} mode @returns {Combat} */
    function create(mode) {
        var player = createCraft('player', DW.arcade.create(0), 'ally');
        var t = /** @type {Combat} */ ({ mode: mode || 'training', roundOver: false, enabled: true, time: 0, wave: 0, countdown: 3,
            player: player, enemies: [], wrecks: [], kills: 0, targetId: null, slots: [], slotTimer: 0,
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
    /** @param {Combat} t @param {FlightState} player @param {number} radius */
    function spawn(t, player, radius) {
        bindPlayer(t, player);
        t.wave++;
        t.countdown = 0;
        t.slotTimer = 0;
        t.slots = [];
        var count = t.mode === 'furball' ? 16 : Math.min(6, t.wave + 2);
        t.roundOver = false;
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
                index: i, callsign: callsign({ index: i }), profile: DW.arcade.profiles[i % 3 === 1 ? 1 : 0],
                hp: 90, maxHp: 90, pilot: ['Rookie', 'Veteran', 'Ace'][skill], skill: skill,
                mode: 'approach', decision: i * .13, goal: player.eye.slice()
            }));
            if (t.configured) {
                var craft = t.enemies[t.enemies.length - 1];
                equip(craft, craft.profile, defaultWeapon(craft.profile));
            }
        }
        if (t.mode === 'furball') {
            // Two opposing wings meet above the near side of the asteroid.
            var center = add(player.eye, add(scale(player.back, -450 / U), scale(player.up, 40 / U)));
            if (length(center) < radius + 100 / U)
                center = scale(unit(center), radius + 100 / U);
            t.enemies.forEach(function (e, i) {
                e.team = i < 8 ? 'ally' : 'enemy';
                var side = i < 8 ? -1 : 1, j = i % 8;
                e.pose.eye = add(center, add(scale(player.right, side * (300 + (j % 2) * 80) / U), add(scale(player.back, (j - 3.5) * 65 / U), scale(player.up, ((j % 3) - 1) * 85 / U))));
                face(e.pose, sub(center, e.pose.eye));
                e.pose.throttle = .85;
                e.pose.velocity = scale(e.pose.back, -45);
                e.goal = center.slice();
                e.targetId = null;
                e.retarget = 0;
            });
        }
        if (t.useHullModels) t.enemies.forEach(function (e) {
            var selection = t.hullModels ? ((e.team || 'enemy') === 'ally' ? t.hullModels.ally : t.hullModels.enemy) : 'mixed';
            e.collision = { kind: 'model', modelId: DW.shipPackModels.craftModel(e, selection, t.wave).id };
        });
        var target = t.enemies.find(function (e) {
            return e.team !== 'ally';
        });
        t.targetId = target ? target.id : null;
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
        var distance = length(sub(player.eye, e.pose.eye)) * U, active = t.mode === 'furball' || t.slots.indexOf(e.id) >= 0;
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
        var lead = intercept(e.pose.eye, player.eye, scale(player.velocity, 1 / U), DW.retailWeapons[e.weaponIndex || 0].speed / U);
        var goal = add(player.eye, scale(sub(lead.point, player.eye), [.25, .7, 1][e.skill]));
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
        else {
            // Predictable pilot error, held between human-scale decisions.
            goal = add(goal, scale(e.pose.right, Math.sin(t.time * .9 + e.index) * [32, 16, 6][e.skill] / U));
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
        var gun=intercept(e.pose.eye,target.eye,scale(target.velocity,1/U),weapon.speed/U);
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
        var active=t.mode==='furball'||t.slots.indexOf(e.id)>=0;
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
                e.mode='break';e.maneuverAt=now;e.until=now+(stalled?5:3);
                var ahead=scale(e.pose.back,-1), away=unit(sub(e.pose.eye,target.eye));
                var direction=unit(add(stalled?add(scale(ahead,.5),away):ahead,scale(e.pose.right,(e.index%2?1:-1)*.65)));
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
        if(g.distance<280&&g.closure>10)goal=add(goal,scale(target.back,Math.min(100,g.closure*2)/U));
        if(e.mode==='break'&&e.extensionGoal)goal=e.extensionGoal;
        if(e.mode==='recover'&&e.reentryGoal)goal=e.reentryGoal;
        e.goal=goal;e.gunGoal=g.gun.point;e.gunValid=g.gun.time>0&&g.gun.time<=DW.retailWeapons[e.weaponIndex||0].lifetime;
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
        var active=t.mode==='furball'||t.slots.indexOf(e.id)>=0;
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
        var lead=intercept(e.pose.eye,target.eye,scale(target.velocity,1/U),weapon.speed/U);
        var goal=lead.point;
        if(e.mode==='break'&&e.extensionGoal)goal=e.extensionGoal;
        else if(!active)goal=add(target.eye,scale(e.pose.right,650/U));
        else if(style==='aggressor')goal=add(target.eye,scale(sub(lead.point,target.eye),.35));
        else if(style==='interceptor'&&distance>350&&!behind){
            // Cut toward a bounded future position before settling onto gun lead.
            goal=add(target.eye,scale(target.velocity,Math.min(1.5,distance/450)/U));
        }
        if(e.mode==='attack')goal=add(goal,scale(e.pose.right,Math.sin(t.time*.45+e.index)*[24,12,4][e.skill]/U));
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
        var shieldBefore = e.shield || 0, shieldDamage = weapon.damage * weapon.shieldFactor, absorbed = Math.min(shieldBefore, shieldDamage);
        if (e.shield !== undefined) e.shield = shieldBefore - absorbed;
        e.hp = Math.max(0, e.hp - weapon.damage * weapon.armorFactor * (1 - (shieldDamage > 0 ? absorbed / shieldDamage : 0)));
        if (shieldBefore > 0 && !e.shield) radioEvent(t, { kind:'shield', victim:e.id, team:e.team || 'enemy', index:e.index });
        e.damagedAt = t.time;
        e.hitFlash = .35;
        if (e.hp <= 0) {
            if (shooter === t.player || shooter === t.player.id)
                t.playerKills = (t.playerKills || 0) + 1;
            radioEvent(t, { kind: 'destroyed', victim: e.id, team: e.team || 'enemy', index: e.index, killer: shooter && typeof shooter === 'object' ? shooter.id : shooter || null });
            var pose = { eye: e.pose.eye.slice(), right: e.pose.right.slice(), up: e.pose.up.slice(), back: e.pose.back.slice(), velocity: e.pose.velocity.slice(), throttle: 0 };
            var axis = unit(add(pose.right, scale(pose.up, e.index % 2 ? -.7 : .7)));
            t.wrecks.push({ id: e.id + '-wreck', index: e.index, team: e.team, artWave: t.wave, pose: pose, axis: axis, spin: (e.index % 2 ? -1 : 1) * (.25 + (e.index % 5) * .09), age: 0, scorches: e.scorches || [] });
            // Keep debris across waves, with a bounded rendering/memory budget.
            if (t.wrecks.length > 48)
                t.wrecks.shift();
            e.fire = false;
            e.pose.throttle = 0;
            if ((e.team || 'enemy') !== 'ally')
                t.kills++;
            if (!alive(t).length)
                t.countdown = 5;
            t.flashes.push({ position: e.pose.eye.slice(), age: 0, scale: 14 });
        }
    }
    /** Geometry is selected by serializable simulation state, never by appearance controls.
     * @param {Craft} craft @param {Vector} start @param {Vector} end */
    function hullHit(craft, start, end) {
        var shape = craft.collision || { kind: 'sphere', radiusM: 9 };
        if (shape.kind === 'sphere') return sphereHit(start, end, craft.pose.eye, shape.radiusM / U);
        var model = DW.shipPackModels.find(shape.modelId);
        // The built-in training hull is not part of an asset pack.
        var geometry = model ? model.model : DW.shipPackModels.craftModel(craft, '', 1);
        if (geometry.id !== shape.modelId) throw new Error('Unknown collision model ' + shape.modelId);
        return DW.shipPackModels.hullHit(geometry, craft.pose, start, end, U);
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
    /** @param {Combat} t @param {Vector} start @param {Vector} end @param {Bolt} bolt @param {Craft | string} team @param {TerrainHit | undefined} terrainHit @param {FlightState} player */
    function trace(t, start, end, bolt, team, terrainHit, player) {
        bindPlayer(t, player);
        var hit = terrainHit ? terrainHit(start, end) : null, best = hit ? length(sub(hit, start)) : Infinity;
        var victim = /** @type {Craft | null} */ (null), surface = /** @type {Hit | null} */ (null);
        var shooter = typeof team === 'object' ? team : participants(t).find(function (e) { return e.id === team; });
        var faction = shooter ? shooter.team || 'enemy' : team === 'player' ? 'ally' : 'enemy';
        participants(t).forEach(function (e) {
            if (e.hp <= 0 || e === shooter || (e.team || 'enemy') === faction) return;
            var candidate = hullHit(e, start, end);
            if (candidate) {
                var d = length(sub(candidate.point, start));
                if (d < best) { best = d; hit = candidate.point; victim = e; surface = candidate; }
            }
        });
        var struck = /** @type {Craft | null} */ (victim), hull = /** @type {Hit | null} */ (surface);
        if (struck && hull && hull.model && hull.local && hull.normal)
            DW.shipPackModels.addScorch(struck, { fraction: hull.fraction, point: hull.point, model: hull.model, local: hull.local, normal: hull.normal });
        if (!struck && hit && t.onTerrainImpact) t.onTerrainImpact(hit);
        if (struck) damageCraft(t, struck, bolt.weapon, shooter || team);
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
        participants(t).forEach(function (e) {
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
    /** @param {Combat} t @param {FlightState} player @param {number} dt @param {number} radius @param {TerrainHit} [terrainHit] */
    function step(t, player, dt, radius, terrainHit) {
        if (!t.enabled)
            return;
        bindPlayer(t, player);
        stepWrecks(t, dt, terrainHit);
        t.time += dt;
        participants(t).forEach(function (e) {
            e.hitFlash = Math.max(0, (e.hitFlash || 0) - dt);
            if (e.hp > 0 && e.maxShield !== undefined && t.time - e.damagedAt > 7)
                e.shield = Math.min(e.maxShield, (e.shield || 0) + 12 * dt);
        });
        t.flashes = t.flashes.filter(function (f) {
            f.age += dt;
            return f.age < .22;
        });
        var living = alive(t);
        if (!t.dead && (!living.length || t.roundOver)) {
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
        t.enemies.forEach(function (e) {
            if (e.controller !== 'input') e.fire = false;
            if (e.hp > 0 && e.controller !== 'input') {
                var candidates = participants(t).filter(function (other) { return other.hp > 0 && (other.team || 'enemy') !== (e.team || 'enemy'); });
                var opponent = candidates.length ? candidates[0].pose : null;
                if (t.mode === 'furball') {
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
                if(opponent&&(e.opponentStyle==='fso-pursuit'||e.opponentStyle==='fso-breaker'))progressFreeSpace(t,e,opponent,dt);
                e.decision -= dt;
                if (e.decision <= 0 && opponent)
                    decide(t, e, opponent);
                var goal = e.goal;
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
                e.fire = !!opponent && (t.mode === 'furball' || t.slots.indexOf(e.id) >= 0) && e.mode === 'attack' && distance > 130 && distance < Math.min(760, primary.speed * primary.lifetime) && e.gunValid !== false && aligned > .996 && ((t.time + e.index * .77) % 3) < .8;
            }
            DW.flightGuns.step(e.guns, e.pose, DW.retailWeapons[e.weaponIndex || 0], e.fire, dt, function (start, end, bolt) {
                return trace(t, start, end, bolt, e, terrainHit, player);
            }, function () { return convergencePoint(t, e, DW.retailWeapons[e.weaponIndex || 0], terrainHit); });
        });
        var nowAlive = alive(t);
        if (living.length && !nowAlive.length)
            t.countdown = 5;
        if (t.mode === 'furball' && !t.roundOver && t.wave > 0 && (!nowAlive.some(function (e) {
            return e.team === 'ally';
        }) || !nowAlive.some(function (e) {
            return e.team === 'enemy';
        }))) {
            t.roundOver = true;
            t.countdown = 5;
        }
        var targets = nowAlive.filter(function (e) {
            return e.team !== 'ally';
        });
        if (t.targetId && !targets.some(function (e) {
            return e.id === t.targetId;
        }))
            t.targetId = targets.length ? targets[0].id : null;
    }
    /** @param {Combat} t */
    function cycle(t) {
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
        var result = { bolts: playerGuns.bolts.slice(), impacts: playerGuns.impacts.concat(t.flashes) };
        t.enemies.forEach(function (e) {
            result.bolts = result.bolts.concat(e.guns.bolts.map(function (b) {
                return Object.assign({}, b, { team: e.team || 'enemy' });
            }));
            result.impacts = result.impacts.concat(e.guns.impacts);
        });
        return result;
    }
    DW.training = { stepInput: stepInput, createCraft: createCraft, participants: participants, configureHulls: configureHulls, bindPlayer: bindPlayer, hullHit: hullHit, convergencePoint: convergencePoint, defaultWeapon:defaultWeapon, configure:configure, equip:equip, callsign: callsign, create: create, alive: alive, spawn: spawn, stepWrecks: stepWrecks, steer: steer, intercept: intercept, sphereHit: sphereHit, damageCraft: damageCraft, damageEnemy: damageCraft, damagePlayer: damagePlayer, trace: trace, step: step, cycle: cycle, geometry: geometry, allGuns: allGuns };
}());
