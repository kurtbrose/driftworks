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
    var collision = DW.flightCollision;
    var collisionRadius=collision.radius, collisionNearby=collision.nearby;
    var sphereHit=collision.sphereHit, hullHit=collision.hullHit;
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
    /** @param {Pose} pose @param {Vector} target */
    function spaceDelta(pose,target){if(!pose.curvature)return sub(target,pose.eye);var path=DW.flightHyperbolic.path(pose.eye,target,pose.curvature);return scale(path.direction,path.distance);}
    /** @param {Pose} pose @param {Vector} vector */
    function offset(pose,vector){return pose.curvature?DW.flightHyperbolic.offset(pose.eye,vector,pose.curvature):add(pose.eye,vector);}
    /** @param {Combat} t @param {Omit<RadioEvent, 'serial' | 'time' | 'wave'>} event */
    function radioEvent(t, event) {
        t.radioEvents = t.radioEvents || [];
        t.radioSerial = (t.radioSerial || 0) + 1;
        t.radioEvents.push(Object.assign({}, event, { serial: t.radioSerial, time: t.time, wave: t.wave }));
        if (t.radioEvents.length > 64)
            t.radioEvents.shift();
    }
    // Shield permeability is measured in m/s relative to the defended craft.
    var shieldSpeed=30;
    /** @type {WeakMap<Craft,Vector>} */var contactPositions=new WeakMap();
    /** @param {Combat} t @param {Craft} craft @param {Vector} point */
    function shieldImpact(t,craft,point){
        craft.shield=Math.max(0,(craft.shield||0)-.01);craft.damagedAt=t.time;
        t.flashes.push({position:point.slice(),region:craft.pose.region||0,age:0});
    }
    /** Swept, smooth envelopes avoid trapping craft in concave hull geometry.
     * Slow entrants remain free to accelerate once inside. @param {Combat} t @param {number} dt */
    function shieldContacts(t,dt){
        var roster=[t.player].concat(t.enemies).filter(function(c){return c.hp>0;});
        for(var i=0;i<roster.length;i++)for(var j=i+1;j<roster.length;j++){
            var a=roster[i],b=roster[j];if((a.pose.region||0)!==(b.pose.region||0)||!(a.shield||b.shield))continue;
            var relative=sub(a.pose.velocity,b.pose.velocity);if(length(relative)<=shieldSpeed)continue;
            var end=spaceDelta(b.pose,a.pose.eye),oldA=contactPositions.get(a),oldB=contactPositions.get(b);
            var start=oldA&&oldB?spaceDelta(Object.assign({},b.pose,{eye:oldB}),oldA):sub(end,scale(relative,dt/U));
            var radius=(collisionRadius(a)+collisionRadius(b))*1.18;
            if(length(start)<radius-1e-7)continue;
            var hit=sphereHit(start,end,[0,0,0],radius);if(!hit)continue;
            var normal=unit(hit.point),inward=dot(relative,normal);if(inward>=0)continue;
            var ra=collisionRadius(a),rb=collisionRadius(b),wa=rb*rb*rb/(ra*ra*ra+rb*rb*rb),wb=1-wa;
            // Turn closing motion into a glancing pass, with a small outward
            // component. A head-on hit chooses a stable perpendicular escape.
            var tangent=sub(relative,scale(normal,inward)),slide=length(tangent);
            var side=slide>1e-6?scale(tangent,1/slide):unit(cross(normal,Math.abs(normal[2])<.9?[0,0,1]:[0,1,0]));
            var impulse=add(scale(normal,-1.15*inward),scale(side,Math.sqrt(slide*slide+.9*inward*inward)-slide));
            a.pose.velocity=add(a.pose.velocity,scale(impulse,wa));
            b.pose.velocity=sub(b.pose.velocity,scale(impulse,wb));
            [a,b].forEach(function(c){c.pose.ramp=[dot(c.pose.velocity,c.pose.right),dot(c.pose.velocity,c.pose.up),-dot(c.pose.velocity,c.pose.back)];});
            var correction=sub(scale(normal,radius+1e-6),end);
            a.pose.eye=offset(a.pose,scale(correction,wa));b.pose.eye=offset(b.pose,scale(correction,-wb));
            var point=offset(b.pose,scale(normal,collisionRadius(b)*1.18));
            if(a.shield)shieldImpact(t,a,point);if(b.shield)shieldImpact(t,b,point);
            collision.moved(t,a);collision.moved(t,b);
        }
        roster.forEach(function(c){contactPositions.set(c,c.pose.eye.slice());});
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
            var pose = { curvature:e.pose.curvature,region:e.pose.region||0, eye: e.pose.eye.slice(), right: e.pose.right.slice(), up: e.pose.up.slice(), back: e.pose.back.slice(), velocity: e.pose.velocity.slice(), throttle: 0 };
            var axis = unit(add(pose.right, scale(pose.up, e.index % 2 ? -.7 : .7)));
            t.wrecks.push({ id: e.id + '-wreck', index: e.index, modelId:e.modelId, team: e.team, artWave: t.wave, pose: pose, axis: axis, spin: (e.index % 2 ? -1 : 1) * (.25 + (e.index % 5) * .09), age: 0, scorches: e.scorches || [] });
            // Keep every wreck until its existing 120-second lifecycle expires.
            e.fire = false;
            e.pose.throttle = 0;
            if ((e.team || 'enemy') !== 'ally')
                t.kills++;
            if (!t.enemies.filter(function(e){return e.hp>0;}).length)
                t.countdown = 5;
            t.flashes.push({ region:e.pose.region||0, position: e.pose.eye.slice(), velocity: e.pose.velocity.map(function(v){return v/U;}), age: 0, scale: 14, destruction: true });
        }
    }
    /** @param {Combat} t @param {Vector} start @param {Vector} end @param {Bolt} bolt @param {Craft | string} team @param {TerrainHit | undefined} terrainHit @param {FlightState} player @param {number} [scorchInterval] @param {() => void} [onDamage] */
    function trace(t, start, end, bolt, team, terrainHit, player, scorchInterval, onDamage) {
        t.player.pose = player;
        var hit = terrainHit&&!(bolt.region||0) ? terrainHit(start, end, bolt) : null, travel = length(sub(end,start));
        var best = hit && travel > 0 ? length(sub(hit,start)) / travel : Infinity;
        var shieldContact=false;
        var victim = /** @type {Craft | null} */ (null), surface = /** @type {Hit | null} */ (null);
        var query=collision.query(t,start,end,bolt,team);
        var candidates=query.candidates,shooter=query.shooter,faction=query.faction,radius=query.radius;
        candidates.forEach(function (entry) {
            var e=entry.craft;if(!player.curvature&&!collisionNearby(entry,start,end,radius/U))return;
            if (e.hp <= 0 || e === shooter || (e.team || 'enemy') === faction || (e.pose.region||0)!==(bolt.region||0)) return;
            var relative=sub(scale(bolt.direction||unit(sub(end,start)),bolt.weapon.speed===undefined?1000:bolt.weapon.speed),e.pose.velocity),shell=collisionRadius(e)*1.18;
            var blocked=(e.shield||0)>0&&length(relative)>shieldSpeed&&length(spaceDelta(e.pose,start))>=shell;
            var candidate = blocked?sphereHit(spaceDelta(e.pose,start),spaceDelta(e.pose,end),[0,0,0],shell):hullHit(e, start, end, bolt.weapon.headRadius || 0);
            if(blocked&&candidate)candidate.point=offset(e.pose,candidate.point);
            if (candidate) {
                if (candidate.fraction < best) { best = candidate.fraction; hit = candidate.point; victim = e; surface = candidate; shieldContact=blocked; }
            }
        });
        var struck = /** @type {Craft | null} */ (victim), hull = /** @type {Hit | null} */ (surface);
        if (!shieldContact && struck && hull && hull.model && hull.local && hull.normal && (!scorchInterval || t.time-(scorchTimes.get(struck)??-Infinity)>=scorchInterval)) {
            DW.shipPackModels.addScorch(struck, { fraction: hull.fraction, point: hull.point, model: hull.model, local: hull.local, normal: hull.normal });
            if(scorchInterval)scorchTimes.set(struck,t.time);
        }
        if (!struck && hit && terrainHit && terrainHit.onImpact) terrainHit.onImpact(hit,bolt,t);
        if (!struck && hit && t.onTerrainImpact) t.onTerrainImpact(hit);
        if (struck) {
            var before=onDamage?struck.hp+(struck.shield||0):0;
            if(shieldContact)damageCraft(t,struck,bolt.weapon,shooter||team);
            else {var shields=struck.shield;struck.shield=0;damageCraft(t,struck,bolt.weapon,shooter||team);struck.shield=shields;}
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
    DW.flightCombat = {shieldContacts:shieldContacts, damageCraft:damageCraft, damagePlayer:damagePlayer, trace:trace, radioEvent:radioEvent};
}());
