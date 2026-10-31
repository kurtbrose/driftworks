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
    var opponentPolicy=DW.flightOpponent;
    var intercept=opponentPolicy.intercept,steer=opponentPolicy.steer,trackAim=opponentPolicy.trackAim,decide=opponentPolicy.decide,progressFreeSpace=opponentPolicy.progressFreeSpace;
    var geometry=DW.flightBlockout.geometry;
    var collision = DW.flightCollision;
    if (!collision) throw new Error('Flight collision module did not load.');
    // Compatibility exports delegate to the modules that own collision and combat.
    var sphereHit=collision.sphereHit, hullHit=collision.hullHit;
    var combat=DW.flightCombat;
    var shieldContacts=combat.shieldContacts, damageCraft=combat.damageCraft;
    var damagePlayer=combat.damagePlayer, trace=combat.trace, radioEvent=combat.radioEvent;
    var setCollisionMode=collision.setMode,collisionBatch=collision.batch;
    var collisionChanged=collision.changed,collisionStats=collision.stats;
    var collisionRadius=collision.radius,collisionNearby=collision.nearby;
    /** @param {Combat} combat */
    function mission(combat){return DW.flightMissions.resolve(combat.mode);}
    /** @param {Combat} combat */
    function openingPending(combat){return DW.flightMissionRuntime.openingPending(combat);}
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
    /** @param {Craft} craft @param {import('../experiments/types').Demand} controls @param {number} dt */
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
     * @param {Combat} t @param {import('../experiments/types').Demand} controls @param {Weapon} weapon
     * @param {number} dt @param {number} radius @param {TerrainHit} [terrainHit]
     * @param {() => void} [afterCombat] @param {() => void} [afterMovement] */
    function stepControlled(t, controls, weapon, dt, radius, terrainHit, afterCombat, afterMovement) {
        var craft = t.player, pose = craft.pose, guns = craft.guns;
        DW.flightSim.stepInput(craft, controls, dt);
        var hullBefore = t.hull, shieldBefore = t.shield, hitBefore = t.lastHit;
        DW.flightSim.step(t, pose, dt, radius, terrainHit, afterMovement);
        var playerDamaged = t.hull < hullBefore || t.shield < shieldBefore;
        if (afterCombat) afterCombat();
        var firedBefore = guns.fired, hitsBefore = guns.hits;
        // Finish the gun tick after death to age existing bolts; suppress new fire.
        collisionBatch(t,function(){DW.flightGuns.step(guns, pose, weapon, !mission(t).weaponsDisabled && !t.dead && !openingPending(t) && controls.fire, dt, function (start, end, bolt) {
            return DW.flightSim.trace(t, start, end, bolt, 'player', terrainHit, pose);
        }, function () { return DW.flightSim.convergencePoint(t, craft, weapon, terrainHit); }, craft.profile.gunMounts, DW.flightSim.gunAnchors(craft), t.player.pose.curvature||(mission(t).sky.thinShell?'thin-shell':!!mission(t).sky.wormhole));});
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
     * @param {import('../experiments/types').Profile} profile */
    function defaultWeapon(profile) {
        var found = (profile.defaultWeapons || []).map(function (name) { return DW.retailWeapons.findIndex(function (w) { return w.name === name; }); }).find(function (i) { return i >= 0; });
        return found === undefined ? 0 : found;
    }
    /** @param {Combat} t @param {import('../experiments/types').Profile} profile @param {boolean} [unshielded] */
    function configure(t, profile, unshielded) {
        t.configured = true;
        t.player.profile = profile;
        t.player.weaponIndex = defaultWeapon(profile);
        t.maxHull = profile.hull === undefined ? 100 : profile.hull;
        t.maxShield = unshielded ? 0 : profile.shield === undefined ? 120 : profile.shield;
        t.hull = t.maxHull; t.shield = t.maxShield;
    }
    /** @param {Craft} e @param {import('../experiments/types').Profile} profile @param {number} weaponIndex @param {boolean} [unshielded] */
    function equip(e, profile, weaponIndex, unshielded) {
        e.profile = profile; e.maxHp = profile.hull === undefined ? 90 : profile.hull; e.hp = e.maxHp;
        e.maxShield = unshielded ? 0 : profile.shield || 0; e.shield = e.maxShield; e.weaponIndex = weaponIndex;
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
        // Stagger both wings within two seconds, even in large encounters.
        for (var i = 0; i < count; i++) {
            var pose = DW.arcade.create(radius), lateral = (i - (count - 1) / 2) * 180;
            pose.eye = add(player.eye, add(scale(player.back, -(350 + i * 65) / U), add(scale(player.right, lateral / U), scale(player.up, (85 + (i % 2) * 65) / U))));
            var safe = radius + 90 / U;
            if (!mission(t).emptySpace&&length(pose.eye) < safe)
                pose.eye = scale(unit(pose.eye), safe);
            face(pose, sub(player.eye, pose.eye));
            pose.throttle = .6;
            var skill = Math.min(2, Math.floor((t.wave - 1 + i) / 3));
            t.enemies.push(Object.assign(createCraft('wave-' + t.wave + '-' + i, pose, 'enemy'), {
                controller: 'ai', opponentStyle:t.opponentStyle||'baseline', collision: { kind: 'sphere', radiusM: 9 }, shield: 0, maxShield: 0,
                index: i, callsign: mission(t).encounter.callsigns[i] || callsign({ index: i }), profile: DW.arcade.profiles[i % 3 === 1 ? 1 : 0],
                hp: 90, maxHp: 90, pilot: ['Rookie', 'Veteran', 'Ace'][skill], skill: skill,
                mode: 'approach', decision: (i % 16) * .13, goal: player.eye.slice()
            }));
            if (t.configured) {
                var craft = t.enemies[t.enemies.length - 1];
                equip(craft, craft.profile, defaultWeapon(craft.profile));
            }
        }
        if (mission(t).encounter.kind==='furball') {
            // Two opposing wings meet above the near side of the asteroid.
            var center = add(player.eye, add(scale(player.back, -450 / U), scale(player.up, 40 / U)));
            if (!mission(t).emptySpace&&length(center) < radius + 100 / U)
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
        if(t.mode==='battle') {
            var half=Math.ceil(count/2);
            t.enemies.forEach(function(e,i){
                var local=i%half, zone=Math.floor(local/3), slot=local%3;
                var lane=zone===0?[0,450,100]:zone===1?[-1600,1800,650]:zone===2?[1600,2000,1000]:zone===3?[-2600,3600,1200]:[2500,3900,700];
                var home=add(player.eye,add(scale(player.right,lane[0]/U),add(scale(player.back,-lane[1]/U),scale(player.up,lane[2]/U))));
                e.battleZone={id:zone,center:home,radiusM:1000};
                // Independent approach positions and headings, never a rigid formation.
                var side=e.team==='ally'?-1:1, jitter=i*2.399963;
                e.pose.eye=add(home,add(scale(player.right,(side*280+Math.sin(jitter)*140)/U),add(scale(player.back,Math.cos(jitter)*230/U),scale(player.up,Math.sin(jitter*1.7)*180/U))));
                face(e.pose,sub(add(home,scale(player.up,Math.sin(jitter)*70/U)),e.pose.eye));
                e.pose.velocity=scale(e.pose.back,-(40+slot*11));
                e.goal=home.slice();e.decision=(i%7)*.09;
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
        if(t.mode==='scramble'){
            player.eye=[-103.5/U,-25/U,1200];player.velocity=[0,0,0];player.ramp=[0,0,0];player.throttle=1;
            player.right=[1,0,0];player.up=[0,0,1];player.back=[0,-1,0];
            t.scramble={beat:0,radio:0};
            t.enemies.forEach(function(e,i){
                e.team=i<3?'ally':'enemy';
                e.pose.eye=[(-103.5+(i===0?-12:i===1?12:28))/U,(i<3?-16:1100+(i-3)*160)/U,1200+(i<3?0:220)/U];
                e.pose.right=[1,0,0];e.pose.up=[0,0,1];e.pose.back=[0,-1,0];
                e.pose.velocity=[0,0,0];e.pose.throttle=1;
                e.hangarLaunch={remaining:10};
                if(i===0||i>=3)e.plotArmor=true;
            });
            // A fight is already underway immediately beyond the hangar mouth.
            // Uneven, overlapping encounters: pursuit, crossing, escape and recovery.
            // Slots alternate teams, but neither positions nor targets form mirrored pairs.
            var melee=[
                [-128,205,48,5,83,0,.35],[52,294,105,8,57,1,-.8],
                [114,173,-32,9,71,2,.6],[-42,382,67,6,96,0,-.2],
                [-185,344,-58,1,46,1,1.1],[28,192,136,10,78,0,-.65],
                [176,438,24,3,64,3,.5],[-71,146,-46,0,91,2,-1],
                [-8,478,172,11,54,0,.15],[142,315,82,2,87,0,-.45],
                [-116,258,119,7,69,0,.9],[73,414,-76,4,43,3,-.3]
            ];
            melee.forEach(function(slot,index){
                var side=index%2,pose=DW.arcade.create(0),target=melee[slot[3]],mode=['attack','break','evade','recover'][slot[5]];
                pose.eye=[(-103.5+slot[0])/U,slot[1]/U,1200+slot[2]/U];
                var direction=[target[0]-slot[0],target[1]-slot[1],target[2]-slot[2]];
                if(mode!=='attack')direction=[direction[1]*(index%3?1:-1),-direction[0],80-index*17];
                face(pose,direction);
                var c=Math.cos(slot[6]),sn=Math.sin(slot[6]),right=pose.right.slice(),up=pose.up.slice();
                pose.right=add(scale(right,c),scale(up,sn));pose.up=add(scale(up,c),scale(right,-sn));
                pose.velocity=scale(pose.back,-slot[4]);pose.ramp=[0,0,slot[4]];pose.throttle=.65+(index%4)*.1;
                var craft=createCraft('scramble-furball-'+index,pose,side?'enemy':'ally');
                craft.controller='ai';craft.index=6+index;craft.callsign=(side?'Raider ':'Cover ')+(index+4);
                craft.skill=index%3;craft.pilot=['Rookie','Veteran','Ace'][craft.skill];craft.mode=mode;
                craft.decision=(index%5)*.047;craft.until=.45+(index%7)*.31;
                craft.targetId='scramble-furball-'+slot[3];craft.retarget=1.7+(index%5)*.23;
                craft.goal=add(pose.eye,scale(unit(direction),260/U));
                equip(craft,craft.profile,defaultWeapon(craft.profile));
                if(t.useHullModels)craft.collision={kind:'model',modelId:DW.shipPackModels.craftModel(craft,'mixed',t.wave).id};
                t.enemies.push(craft);
            });

        }
        if(t.mode==='convoy')DW.convoyMission.start(t,player);
        if(t.mode==='evacuation')DW.evacuationMission.start(t,player);
        if(t.mode==='ellis'||t.mode==='thin-shell')t.enemies.forEach(function(e,i){
            var region=i%4>=2?1:0,shift=(region-(player.region||0))*12000/U;
            e.pose.region=region;e.pose.eye[0]+=shift;e.goal[0]+=shift;
        });
        if(player.curvature)t.enemies.forEach(function(e){e.pose.curvature=player.curvature;e.pose.eye=DW.flightHyperbolic.offset(player.eye,sub(e.pose.eye,player.eye),player.curvature||650);e.goal=DW.flightHyperbolic.offset(player.eye,sub(e.goal,player.eye),player.curvature||650);});
        var target = t.enemies.find(function (e) {
            return e.team !== 'ally'&&(mission(t).sky.wormhole||(e.pose.region||0)===(t.player.pose.region||0));
        });
        t.targetId = target ? target.id : null;
        t.targetLocked = false;
    }
    /** Zone ownership limits pursuit; real opponents inside a neighboring zone's
     * overlap (including the player) remain eligible. @param {Craft} own @param {Craft} other */
    function zoneEligible(own,other) {
        var zone=own.battleZone;
        return !zone || length(sub(other.pose.eye,zone.center))*U<=zone.radiusM && length(sub(other.pose.eye,own.pose.eye))*U<1200;
    }
    /** @param {Combat} t @param {Craft} shooter @param {Craft} target @param {Weapon} weapon */
    function firingSolution(t,shooter,target,weapon){
        if(shooter.hp<=0||target.hp<=0||(shooter.team||'enemy')===(target.team||'enemy'))return null;
        var anchors=gunAnchors(shooter),launch=anchors&&anchors.length?anchors.reduce(function(sum,p){return sum+Math.max(0,p[1]);},0)/anchors.length:4;
        return DW.flightGuns.lead(shooter.pose,target.pose,weapon,t.player.pose.curvature||(mission(t).sky.thinShell?'thin-shell':!!mission(t).sky.wormhole),launch);
    }
    /** Resolve a shared muzzle aim point only along the crosshair ray; no target snapping or lead.
     * @param {Combat} t @param {Craft} shooter @param {Weapon} weapon @param {TerrainHit} [terrainHit]
     * @returns {Vector | null} */
    function convergencePoint(t, shooter, weapon, terrainHit) {
        var start = shooter.pose.eye;
        if((mission(t).sky.wormhole||shooter.pose.curvature)&&shooter===t.player){
            var target=t.enemies.find(function(c){return c.id===t.targetId&&c.hp>0;}),solution=target?firingSolution(t,shooter,target,weapon):null;
            // Choose convergence RANGE only. The point stays exactly on the
            // player's firing ray; turning off the pip must still miss.
            return solution?offset(shooter.pose,scale(shooter.pose.back,-solution.distance)):null;
        }
        if(shooter.pose.curvature&&shooter.gunValid&&shooter.gunGoal)return offset(shooter.pose,scale(shooter.pose.back,-length(spaceDelta(shooter.pose,shooter.gunGoal))));
        if(mission(t).sky.thinShell&&shooter.gunValid&&shooter.gunGoal)return add(start,scale(shooter.pose.back,-length(sub(shooter.gunGoal,start))));
        var end = offset(shooter.pose, scale(shooter.pose.back, -weapon.speed * weapon.lifetime / U));
        var terrain = terrainHit&&!(shooter.pose.region||0) ? terrainHit(start, end) : null;
        var best = terrain ? length(sub(terrain, start)) : Infinity;
        var point = /** @type {Vector | null} */ (null);
        participants(t).forEach(function (craft) {
            if (craft === shooter || craft.hp <= 0 || (craft.team || 'enemy') === (shooter.team || 'enemy') || (craft.pose.region||0)!==(shooter.pose.region||0)) return;
            var hit = hullHit(craft, start, end);
            if (!hit) return;
            var distance = length(sub(hit.point, start));
            // The gun controller retracts its launch points for point-blank surfaces.
            if (distance * U > .01 && distance < best) { best = distance; point = hit.point; }
        });
        return point;
    }
    /** @param {Combat} t @param {number} dt @param {TerrainHit} [terrainHit] */
    function stepWrecks(t, dt, terrainHit) {
        t.wrecks = t.wrecks.filter(function (w) {
            w.age += dt;
            if (w.age >= 120)
                return false;
            var p = w.pose, before=p.eye.slice(),next = add(p.eye, scale(p.velocity, dt / U)), hit = terrainHit&&!(p.region||0) ? terrainHit(p.eye, next) : null;
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
            if(p.curvature){var after=DW.flightHyperbolic.offset(before,sub(p.eye,before),p.curvature);p.right=DW.flightHyperbolic.transport(before,after,p.right,p.curvature);p.up=DW.flightHyperbolic.transport(before,after,p.up,p.curvature);p.back=DW.flightHyperbolic.transport(before,after,p.back,p.curvature);p.velocity=DW.flightHyperbolic.transport(before,after,p.velocity,p.curvature);p.eye=after;}
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
    // A tick-local index follows sequential movement. Entries retain the original
    // living roster order, including craft destroyed later in this tick.
    /** @param {Craft[]} living */
    function separationGrid(living) {
        var cell=64/U;
        /** @typedef {{craft:Craft,order:number,x:number,y:number,z:number,region:number}} Neighbor */
        /** @typedef {Map<number,Map<number,Map<number,Neighbor[]>>>} RegionCells */
        /** @type {Map<number,RegionCells>} */ var regions=new Map();
        /** @param {number} region @param {number} x @param {number} y @param {number} z */
        function bucket(region,x,y,z){
            var xs=regions.get(region);if(!xs){xs=new Map();regions.set(region,xs);}
            var ys=xs.get(x);if(!ys){ys=new Map();xs.set(x,ys);}
            var zs=ys.get(y);if(!zs){zs=new Map();ys.set(y,zs);}
            var result=zs.get(z);if(!result){result=[];zs.set(z,result);}return result;
        }
        var entries=new Map(living.map(function(craft,order){var p=craft.pose.eye,entry={craft:craft,order:order,x:Math.floor(p[0]/cell),y:Math.floor(p[1]/cell),z:Math.floor(p[2]/cell),region:craft.pose.region||0};bucket(entry.region,entry.x,entry.y,entry.z).push(entry);return [craft,entry];}));
        return {
            nearby:/** @param {Craft} craft */ function(craft){
                var p=craft.pose.eye,x=Math.floor(p[0]/cell),y=Math.floor(p[1]/cell),z=Math.floor(p[2]/cell),xs=regions.get(craft.pose.region||0);
                /** @type {Neighbor[]} */ var result=[];
                if(xs)for(var i=x-1;i<=x+1;i++){
                    var ys=xs.get(i);if(!ys)continue;
                    for(var j=y-1;j<=y+1;j++){var zs=ys.get(j);if(!zs)continue;
                        for(var k=z-1;k<=z+1;k++){var near=zs.get(k);if(near)for(var entry of near)result.push(entry);}
                    }
                }
                result.sort(function(a,b){return a.order-b.order;});
                return result.map(function(entry){return entry.craft;});
            },
            moved:/** @param {Craft} craft */ function(craft){
                var entry=entries.get(craft);if(!entry)return;var p=craft.pose.eye,x=Math.floor(p[0]/cell),y=Math.floor(p[1]/cell),z=Math.floor(p[2]/cell),region=craft.pose.region||0;
                if(x===entry.x&&y===entry.y&&z===entry.z&&region===entry.region)return;
                var before=bucket(entry.region,entry.x,entry.y,entry.z);before.splice(before.indexOf(entry),1);
                entry.x=x;entry.y=y;entry.z=z;entry.region=region;bucket(region,x,y,z).push(entry);
            }
        };
    }
    /** @param {Combat} t @param {FlightState} player @param {number} dt @param {number} radius @param {TerrainHit} [terrainHit] @param {() => void} [afterMovement] */
    function step(t, player, dt, radius, terrainHit, afterMovement) {
        if (!t.enabled){if(afterMovement)afterMovement();return;}
        bindPlayer(t, player);
        stepWrecks(t, dt, terrainHit);
        t.time += dt;
        if (openingPending(t)){if(afterMovement)afterMovement();return;}
        participants(t).forEach(function (e) {
            e.hitFlash = Math.max(0, (e.hitFlash || 0) - dt);
            if (e.hp > 0 && e.maxShield !== undefined && t.time - e.damagedAt > 7)
                e.shield = Math.min(e.maxShield, (e.shield || 0) + 12 * dt);
        });
        t.flashes = t.flashes.filter(function (f) {
            f.age += dt;
            return f.age < (f.destruction ? 5.5 : .22);
        });
        if(t.convoy)DW.convoyMission.step(t,dt);
        replenish(t,player,radius);
        var living = alive(t);
        if (!t.dead && t.mode !== 'cinematic' && t.mode !== 'asteroid-patrol' && t.mode !== 'evacuation' && t.mode !== 'scramble' && t.mode !== 'convoy' && (!living.length || t.roundOver)) {
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
        /** @param {Craft} e */function fireGuns(e){
            if(t.scramble&&t.time<10&&t.enemies.indexOf(e)>=3&&t.enemies.indexOf(e)<6)return;
            DW.flightGuns.step(e.guns, e.pose, DW.retailWeapons[e.weaponIndex || 0], e.fire, dt, function (start, end, bolt) {
                return trace(t, start, end, bolt, e, terrainHit, player);
            }, function () { return convergencePoint(t, e, DW.retailWeapons[e.weaponIndex || 0], terrainHit); }, e.profile.gunMounts, gunAnchors(e), t.player.pose.curvature||(mission(t).sky.thinShell?'thin-shell':!!mission(t).sky.wormhole));
        }
        var neighbors=separationGrid(living), roster=participants(t), byId=new Map((t.mode==='battle'?roster:living).map(function(craft){return [craft.id,craft];}));
        collisionBatch(t,function(){t.enemies.forEach(function (e) {
            if (e.controller !== 'input') e.fire = false;
            if(e.hp>0&&e.hangarLaunch){
                if(t.scramble&&e.team==='ally'){
                    var launchAge=Math.max(0,t.time-[.2,.55,.95][e.index]);
                    e.pose.velocity=[0,Math.min(90,launchAge*180),0];
                    e.pose.ramp=[0,0,e.pose.velocity[1]];
                    if(e.pose.eye[1]*U>60)e.hangarLaunch.remaining=0;
                }
                e.pose.eye=add(e.pose.eye,scale(e.pose.velocity,dt/U));
                e.hangarLaunch.remaining-=dt;e.fire=false;
                if(e.hangarLaunch.remaining<=0){delete e.hangarLaunch;if(t.scramble&&e.team==='enemy')delete e.plotArmor;e.mode='approach';e.goal=player.eye.slice();e.decision=0;}
            } else if (e.hp > 0 && e.controller !== 'input') {
                if(t.convoy){DW.convoyMission.stepWing(e,player,e.index,dt);return;}
                /** @type {FlightState|null} */ var opponent = null;
                if (mission(t).encounter.kind==='furball') {
                    e.retarget -= dt;
                    var target = e.targetId ? byId.get(e.targetId) : undefined;
                    if(target && !(target.hp > 0 && target.team !== e.team && ((target.pose.region||0)===(e.pose.region||0)||(t.mode==='cinematic'||t.mode==='thin-shell')) && zoneEligible(e,target)))target=undefined;
                    if((t.mode==='cinematic'||t.mode==='thin-shell')&&target&&(target.pose.region||0)!==(e.pose.region||0)&&living.some(function(other){return other.hp>0&&other.team!==e.team&&(other.pose.region||0)===(e.pose.region||0);}))target=undefined;
                    if (!target || e.retarget <= 0) {
                        // Only the nearest three are used. Stable insertion preserves
                        // roster tie order without sorting every opponent or recomputing distances.
                        /** @type {{craft:Craft,distance:number}[]} */ var choices=[];
                        (e.battleZone?roster:living).forEach(function(other){
                            if(!(other.hp>0)||other.team===e.team||((other.pose.region||0)!==(e.pose.region||0)&&(t.mode!=='cinematic'&&t.mode!=='thin-shell'))||!zoneEligible(e,other))return;
                            var distance=length(spaceDelta(e.pose,other.pose.eye))+((other.pose.region||0)===(e.pose.region||0)?0:100000),at=0;
                            while(at<choices.length&&choices[at].distance<=distance)at++;
                            if(at<3){choices.splice(at,0,{craft:other,distance:distance});if(choices.length>3)choices.pop();}
                        });
                        var choice=choices[e.index % choices.length];
                        target = choice ? choice.craft : undefined;
                        e.targetId = target ? target.id : null;
                        e.retarget = 2.5 + (e.index % 3) * .7;
                    }
                    opponent = target ? target.pose : null;
                }
                if(!opponent&&!e.battleZone){var candidate=roster.find(function(other){return other.hp>0&&(other.pose.region||0)===(e.pose.region||0)&&(other.team||'enemy')!==(e.team||'enemy');});opponent=candidate?candidate.pose:null;}
                var transit=(t.mode==='cinematic'||t.mode==='thin-shell')&&opponent&&(opponent.region||0)!==(e.pose.region||0);
                if(transit){
                    // Navigate to the other chart through its physical mouth, then
                    // hand the fighter straight back to ordinary pursuit AI.
                    var mouth=[(e.pose.region||0)*12000/U,-2000/U,1550/U];
                    e.goal=mouth;e.mode='transit';e.pose.throttle=1;e.decision=0;opponentPolicy.forget(e);e.gunValid=false;
                }
                else if (opponent) trackAim(t, e, opponent);
                else { opponentPolicy.forget(e); e.gunValid = false; }
                if(opponent&&!transit&&(e.opponentStyle==='fso-pursuit'||e.opponentStyle==='fso-breaker'))progressFreeSpace(t,e,opponent,dt);
                e.decision -= dt;
                if (e.decision <= 0 && opponent && !transit)
                    decide(t, e, opponent);
                var goal = e.mode === 'attack' && (!e.opponentStyle || e.opponentStyle === 'baseline') ? (e.gunGoal || e.goal) : e.goal;
                if(e.battleZone) {
                    var zone=e.battleZone, fromHome=length(sub(e.pose.eye,zone.center))*U;
                    if(fromHome>zone.radiusM)zone.returning=true;
                    if(fromHome<zone.radiusM*.6)zone.returning=false;
                    if(zone.returning || !opponent) {
                        var phase=t.time*.09+e.index*2.399963;
                        goal=add(zone.center,[Math.sin(phase)*180/U,Math.cos(phase*.73)*180/U,Math.sin(phase*1.31)*100/U]);
                        e.goal=goal;e.mode=fromHome>zone.radiusM*.6?'return-zone':'patrol';
                        e.pose.throttle=.75;e.gunValid=false;
                    }
                }
                var future = add(e.pose.eye, scale(e.pose.velocity, 1.6 / U)), avoid = radius + 65 / U;
                if (!mission(t).emptySpace&&!(e.pose.region||0)&&(length(future) < avoid || length(e.pose.eye) < avoid))
                    goal = add(e.pose.eye, add(scale(unit(e.pose.eye), 400 / U), scale(e.pose.right, 180 / U)));
                // Clear the carrier's mouth while still allowing normal break/evade steering.
                if(t.scramble&&e.pose.eye[1]*U<120&&goal[1]*U<180)goal=add(goal,[0,180/U-goal[1],0]);
                // Separate nearby craft using steering demand, never velocity changes.
                (e.pose.curvature?living:neighbors.nearby(e)).forEach(function (other) {
                    if (other.id === e.id||(other.pose.region||0)!==(e.pose.region||0))
                        return;
                    var away = scale(spaceDelta(e.pose,other.pose.eye),-1), d = length(away) * U;
                    if (d < 50)
                        goal = add(goal, scale(unit(away), (50 - d) * 8 / U));
                });
                var control = steer(e.pose, goal), distance = opponent ? length(spaceDelta(e.pose,opponent.eye)) * U : Infinity;
                control.roll = e.mode === 'evade' ? Math.sin(t.time * 1.8 + e.index) * .65 : 0;
                control.boost = !!opponent && distance > 1200 && dot(unit(spaceDelta(e.pose,goal)), scale(e.pose.back, -1)) > .95;
                stepInput(e, Object.assign({ throttle: e.pose.throttle, throttleRate: 0, fire: false }, control), dt);
                // Conservative safety shell keeps AI craft clear of the asteroid.
                var safe = radius + 20 / U;
                if (!mission(t).emptySpace&&!(e.pose.region||0)&&length(e.pose.eye) < safe) {
                    e.pose.eye = scale(unit(e.pose.eye), safe);
                    e.mode = 'break';
                    e.until = t.time + 2;
                }
                var aim = unit(spaceDelta(e.pose,e.gunGoal || e.goal)), aligned = dot(aim, scale(e.pose.back, -1));
                var primary = DW.retailWeapons[e.weaponIndex || 0];
                e.fire = !!opponent && !transit && ((mission(t).encounter.kind==='furball') || t.slots.indexOf(e.id) >= 0) && e.mode === 'attack' && distance > 130 && distance < Math.min(760, primary.speed * primary.lifetime) && e.gunValid !== false && aligned > Math.cos(Math.atan2(5, Math.max(130, distance)));
            }
            neighbors.moved(e);
            collision.moved(t,e);
            if(!mission(t).sky.wormhole)fireGuns(e);
        });
        shieldContacts(t,dt);
        if(afterMovement)afterMovement();
        if(mission(t).sky.wormhole)t.enemies.forEach(fireGuns);
        });
        if(t.scramble&&t.time<10){
            var story=t.scramble;
            // Every story hit is a real visible bolt/hull contact, never a timer.
            t.enemies.slice(3,6).forEach(function(e,i){
                var run=t.time-[0,.6,1.1][i],side=i===0?-1:1,phase=run*.85+i*1.7;
                var x=-103.5+side*(125-16*run)+Math.sin(phase)*28;
                var y=600-85*run,z=420-85*run+Math.sin(run*.65+i)*18;
                var velocity=[side*-16+Math.cos(phase)*23.8,-85,-85+Math.cos(run*.65+i)*11.7];
                e.pose.eye=[x/U,y/U,1200+z/U];e.pose.velocity=velocity;
                face(e.pose,velocity);
                // Roll into the escape rather than sliding an upright hull down a rail.
                var bank=Math.sin(run*.7+i)*.65,c=Math.cos(bank),sn=Math.sin(bank),right=e.pose.right.slice(),up=e.pose.up.slice();
                e.pose.right=add(scale(right,c),scale(up,sn));e.pose.up=add(scale(up,c),scale(right,-sn));
                var victim=t.enemies[i===0?0:1];
                var weapon=Object.assign({},DW.retailWeapons[0],{damage:i===0?100000:16,shieldFactor:1,armorFactor:1,fireWait:.13});
                const aim=DW.flightGuns.lead(e.pose,victim.pose,weapon,false,0);
                var burst=victim.hp>0&&(i===0?t.time>.8&&t.time<8:i===1?t.time>1.6&&t.time<3.5:t.time>2.1&&t.time<4.2);
                DW.flightGuns.step(e.guns,e.pose,weapon,burst,dt,function(start,end,bolt){
                    if(victim.hp<=0)return null;
                    var hit=hullHit(victim,start,end,bolt.weapon.headRadius||0);
                    if(!hit)return null;
                    if(i===0)delete victim.plotArmor;
                    damageCraft(t,victim,bolt.weapon,e);
                    story.beat++;
                    t.flashes.push({position:hit.point.slice(),velocity:victim.pose.velocity.map(function(v){return v/U;}),age:0,scale:2,destruction:false});
                    return hit.point;
                },aim?function(){return aim.point;}:undefined,1,[[0,0,0]]);

            });
        }
        replenish(t,player,radius);
        var nowAlive = alive(t);
        if (living.length && !nowAlive.length)
            t.countdown = 5;
        if (t.mode!=='hyperbolic' && t.mode!=='cinematic' && t.mode!=='evacuation' && !mission(t).encounter.reinforcements && (mission(t).encounter.kind==='furball') && !t.roundOver && t.wave > 0 && ((!t.hangarSupport&&!nowAlive.some(function (e) {
            return e.team === 'ally';
        })) || !nowAlive.some(function (e) {
            return e.team === 'enemy';
        }))) {
            t.roundOver = true;
            t.countdown = 5;
        }
        var targets = nowAlive.filter(function (e) {
            return e.team !== 'ally'&&(mission(t).sky.wormhole||(e.pose.region||0)===(t.player.pose.region||0));
        });
        if (t.targetId && !nowAlive.some(function (e) {
            return e.id === t.targetId&&(mission(t).sky.wormhole||(e.pose.region||0)===(player.region||0));
        }))
            { t.targetId = targets.length ? targets[0].id : null; t.targetLocked = false; }
    }
    /** Acquire the nearest hull crossed by the forward sight line; retain the last contact in empty space.
     * @param {Combat} t @param {FlightState} state */
    function acquireTarget(t, state) {
        var living = alive(t).filter(function(e){return mission(t).sky.wormhole||(e.pose.region||0)===(state.region||0);});
        if (!living.some(function (e) { return e.id === t.targetId; })) {
            t.targetId = null;
            t.targetLocked = false;
        }
        if (t.targetLocked) return;
        if(mission(t).sky.wormhole){
            // Select the visible primary image, using its apparent rigid hull bound.
            // Collision itself still tests the authored hull along the curved shot.
            var nearest=Infinity;
            living.forEach(function(craft){
                var path=DW.flightGuns.ballisticPath(state.eye,craft.pose.eye,state.region||0,craft.pose.region||0,mission(t).sky.thinShell?'thin-shell':true);if(!path)return;
                var along=-dot(path.direction,state.back);if(along<=0)return;
                var off=path.distance*Math.sqrt(Math.max(0,1-along*along));
                if(off<=collisionRadius(craft)&&path.distance<nearest){nearest=path.distance;t.targetId=craft.id;}
            });
            return;
        }
        var start = state.eye, move=scale(state.back,-1000000),best=Infinity;
        if(state.curvature){var extent=living.reduce(function(max,c){return Math.max(max,length(spaceDelta(state,c.pose.eye))+collisionRadius(c));},1);move=sub(offset(state,scale(state.back,-extent)),start);}
        var route=mission(t).sky.wormhole?DW.flightGuns.bridgeTravel(start,move,state.region||0):{segments:[{start:start,end:add(start,move),region:state.region||0}]},traveled=0;
        route.segments.forEach(function(segment){
            living.forEach(function(craft){
                if((craft.pose.region||0)!==segment.region)return;
                var hit=hullHit(craft,segment.start,segment.end);if(!hit)return;
                var distance=traveled+length(sub(hit.point,segment.start));if(distance<best){best=distance;t.targetId=craft.id;}
            });traveled+=length(sub(segment.end,segment.start));
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
            return e.team !== 'ally'&&(mission(t).sky.wormhole||(e.pose.region||0)===(t.player.pose.region||0));
        }), index = list.findIndex(function (e) {
            return e.id === t.targetId;
        });
        t.targetId = list.length ? list[(index + 1) % list.length].id : null;
    }
    /** @param {Combat} t @param {Guns} playerGuns */
    function allGuns(t, playerGuns) {
        var result = { bolts: playerGuns.bolts.slice(), impacts: playerGuns.impacts.concat(t.flashes.filter(function(f){return !f.destruction;})) };
        t.enemies.forEach(function (e) {
            e.guns.bolts.forEach(function(b){result.bolts.push(Object.assign({},b,{team:e.team||'enemy'}));});
            e.guns.impacts.forEach(function(hit){result.impacts.push(hit);});
        });
        return result;
    }
    DW.flightSim = { rebaseGeometry:function(t){if(t.player.pose.curvature){DW.flightHyperbolic.rebase(t,function(c){return opponentPolicy.trackFor(c);});collision.changed(t);}}, setCollisionMode: setCollisionMode, collisionBatch: collisionBatch, collisionStats: collisionStats, collisionChanged: collisionChanged, stepControlled: stepControlled, acquireTarget: acquireTarget, toggleTargetLock: toggleTargetLock, gunAnchors: gunAnchors, stepInput: stepInput, createCraft: createCraft, participants: participants, configureHulls: configureHulls, bindPlayer: bindPlayer, hullHit: hullHit, firingSolution:firingSolution, convergencePoint: convergencePoint, defaultWeapon:defaultWeapon, configure:configure, equip:equip, callsign: callsign, create: create, alive: alive, spawn: spawn, stepWrecks: stepWrecks, steer: steer, intercept: intercept, sphereHit: sphereHit, damageCraft: damageCraft, damageEnemy: damageCraft, damagePlayer: damagePlayer, trace: trace, step: step, cycle: cycle, geometry: geometry, allGuns: allGuns };
    DW.training = DW.flightSim; // Compatibility for saved probes and external callers.
}());

