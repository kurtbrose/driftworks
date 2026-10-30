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
    /** @param {Combat} t */function mission(t){return DW.flightMissions.resolve(t.mode);}
    /** @param {Combat} t */function participants(t){return [t.player].concat(t.enemies);}
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
    /** @type {WeakMap<Craft, {target: FlightState, region:number, at: number, position: Vector, velocity: Vector}>} */
    var tracks = new WeakMap();
    /** Sample positions in world space so own motion does not masquerade as target motion.
     * Between samples extrapolate the last belief, including while maneuvering.
     * @param {Combat} t @param {Craft} e @param {FlightState} target */
    function trackAim(t, e, target) {
        var track = tracks.get(e), interval = [.24, .14, .08][e.skill];
        if (!track || track.target !== target || track.region !== (target.region||0) || t.time < track.at) {
            track = {target: target, region:target.region||0, at: t.time, position: target.eye.slice(), velocity: [0, 0, 0]};
            tracks.set(e, track);
        } else if (t.time - track.at >= interval) {
            var elapsed = t.time - track.at;
            var measured = scale(sub(target.eye, track.position), 1 / elapsed);
            if(e.pose.curvature){var observed=DW.flightHyperbolic.path(track.position,target.eye,e.pose.curvature);measured=scale(observed.direction,observed.distance/elapsed);track.velocity=DW.flightHyperbolic.transport(track.position,target.eye,track.velocity,e.pose.curvature);measured=DW.flightHyperbolic.transport(track.position,target.eye,measured,e.pose.curvature);}
            var response = 1 - Math.exp(-elapsed / [.65, .32, .14][e.skill]);
            track.velocity = add(track.velocity, scale(sub(measured, track.velocity), response));
            track.position = target.eye.slice();
            track.at = t.time;
        }
        var position = e.pose.curvature?DW.flightHyperbolic.offset(track.position,scale(track.velocity,t.time-track.at),e.pose.curvature):add(track.position, scale(track.velocity, t.time - track.at));
        var weapon = DW.retailWeapons[e.weaponIndex || 0];
        if(e.pose.curvature){
            var predicted=Object.assign({},target,{eye:position,velocity:scale(DW.flightHyperbolic.transport(track.position,position,track.velocity,e.pose.curvature),U)});
            var curved=DW.flightGuns.lead(e.pose,predicted,weapon,e.pose.curvature);
            e.gunGoal=curved?offset(e.pose,scale(curved.direction,curved.distance)):position;e.gunValid=!!curved;
            return {point:e.gunGoal,time:curved?curved.time:0};
        }
        if(mission(t).sky.thinShell){
            var future=DW.flightGuns.bridgeTravel(track.position,scale(track.velocity,t.time-track.at),track.region);
            var velocity=future.normal?DW.flightGuns.bridgeVector(track.velocity,future.normal):track.velocity;
            var path=DW.flightGuns.lead(e.pose,Object.assign({},target,{eye:future.point,region:future.region,velocity:scale(velocity,U)}),weapon,'thin-shell');
            e.gunGoal=path?add(e.pose.eye,scale(path.direction,path.distance)):position;
            e.gunValid=!!path;
            return {point:e.gunGoal,time:path?path.time:0};
        }
        var solution = intercept(e.pose.eye, position, track.velocity, weapon.speed / U);
        e.gunGoal = solution.point;
        e.gunValid = solution.time > 0 && solution.time <= Math.min(2, weapon.lifetime);
        return solution;
    }
    /** @param {Pose} pose @param {Vector} goal @returns {FlightInput} */
    function steer(pose, goal) {
        var d = unit(spaceDelta(pose,goal)), f = -dot(d, pose.back);
        return { pitch: Math.max(-1, Math.min(1, Math.atan2(dot(d, pose.up), f) * 2)), yaw: Math.max(-1, Math.min(1, -Math.atan2(dot(d, pose.right), f) * 2)), roll: 0 };
    }
    /** @param {Combat} t @param {Craft} e @param {FlightState} player */
    function decide(t, e, player) {
        if (e.opponentStyle === 'fso-pursuit' || e.opponentStyle === 'fso-breaker') { decideFreeSpace(t,e,player); return; }
        if (e.opponentStyle && e.opponentStyle !== 'baseline') { decideStyle(t,e,player); return; }
        var distance = length(spaceDelta(e.pose,player.eye)) * U, active = (mission(t).encounter.kind==='furball') || t.slots.indexOf(e.id) >= 0;
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
            var away = scale(unit(spaceDelta(e.pose,player.eye)),-1), side = scale(e.pose.right, (e.index % 2 ? 1 : -1) * 220 / U);
            goal = offset(e.pose, add(scale(away, 450 / U), side));
        }
        else if (e.mode === 'recover') {
            goal = offset(e.pose, scale(e.pose.back, -220 / U));
        }
        else if (!active) {
            var angle = t.time * .16 + e.index * 2.4;
            goal = offset(player, [Math.cos(angle) * 650 / U, Math.sin(angle) * 650 / U, (150 + Math.sin(angle * .7) * 140) / U]);
        }
        e.goal = goal;
        e.pose.throttle = e.mode === 'recover' ? .65 : e.mode === 'attack' && distance < 450 ? .72 : 1;
        e.decision = [.65, .42, .28][e.skill];
    }
    /** FreeSpace-inspired geometry; distances and velocities are explicit SI here.
     * @param {Craft} e @param {FlightState} target */
    function engagement(e,target) {
        var delta=spaceDelta(e.pose,target.eye), distance=length(delta)*U, direction=unit(delta);
        var forward=scale(e.pose.back,-1), relative=sub(e.pose.curvature?DW.flightHyperbolic.transport(target.eye,e.pose.eye,target.velocity,e.pose.curvature):target.velocity,e.pose.velocity);
        var weapon=DW.retailWeapons[e.weaponIndex||0];
        var gun={point:e.gunGoal || target.eye,time:e.gunValid ? length(spaceDelta(e.pose,e.gunGoal || target.eye))*U/weapon.speed : 0};
        var facing=dot(forward,direction), alignment=dot(forward,unit(spaceDelta(e.pose,gun.point)));
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
        if(!active){e.mode='reposition';e.goal=offset(target,scale(e.pose.right,650/U));e.pose.throttle=.85;e.decision=.42;return;}
        var breaking=e.mode==='break', recovering=e.mode==='recover';
        if(breaking){
            var held=now-(e.maneuverAt||0);
            if(now>=e.until || held>=(e.breakReason==='no-progress'?2:1.5)&&g.distance>=(e.breakReason==='no-progress'?550:450)){
                e.mode='recover';e.until=now+2.5;e.maneuverAt=now;
                e.reentryGoal=offset(target,scale(target.velocity,.8/U));
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
                var ahead=scale(e.pose.back,-1), away=scale(unit(spaceDelta(e.pose,target.eye)),-1);
                var direction=unit(add(add(scale(ahead,.5),away),scale(e.pose.right,(e.index%2?1:-1)*.65)));
                e.extensionGoal=offset(e.pose,scale(direction,1600/U));
                e.breakReason=stalled?'no-progress':'overshoot';
                e.separations=(e.separations||0)+1;
                if(stalled){e.progressEscapes=(e.progressEscapes||0)+1;e.noProgress=0;}
            }else e.mode='attack';
        }
        // Distinct navigation and gun targets: steering prediction is bounded by
        // ship travel time; blend toward projectile lead once facing/range permit.
        var nav=offset(target,scale(target.velocity,Math.min(1.5,g.distance/Math.max(60,e.profile.maxVelocity[2]))/U));
        var blend=Math.max(0,Math.min(1,(g.facing-.3)/.6))*Math.max(0,Math.min(1,(700-g.distance)/350));
        var goal=e.pose.curvature?DW.flightHyperbolic.offset(nav,scale(spaceDelta(Object.assign({},e.pose,{eye:nav}),g.gun.point),blend),e.pose.curvature):add(scale(nav,1-blend),scale(g.gun.point,blend));
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
        var delta=spaceDelta(e.pose,target.eye), distance=length(delta)*U;
        var active=(mission(t).encounter.kind==='furball')||t.slots.indexOf(e.id)>=0;
        var forward=scale(e.pose.back,-1), targetForward=scale(target.back,-1);
        var behind=dot(scale(unit(spaceDelta(e.pose,target.eye)),-1),targetForward)<-.65;
        var style=e.opponentStyle, wasExtending=e.mode==='break';
        if(t.time>=e.until){
            if(wasExtending){e.mode='attack';e.until=t.time+1.8;e.extensionGoal=undefined;}
            else if(distance<(style==='aggressor'?95:style==='passer'?280:155)){
                e.mode='break';e.until=t.time+(style==='passer'?3.8:1.4);
                // Commit to an escape heading instead of continuously turning away.
                e.extensionGoal=offset(e.pose,scale(unit(add(forward,scale(e.pose.right,.35))),1400/U));
            } else {e.mode=active?'attack':'reposition';e.until=t.time+.6;}
        }
        var weapon=DW.retailWeapons[e.weaponIndex||0];
        var lead={point:e.gunGoal || target.eye};
        var goal=lead.point;
        if(e.mode==='break'&&e.extensionGoal)goal=e.extensionGoal;
        else if(!active)goal=offset(target,scale(e.pose.right,650/U));
        else if(style==='aggressor')goal=offset(target,scale(sub(lead.point,target.eye),.35));
        else if(style==='interceptor'&&distance>350&&!behind){
            // Cut toward a bounded future position before settling onto gun lead.
            goal=offset(target,scale(target.velocity,Math.min(1.5,distance/450)/U));
        }
        e.goal=goal;
        e.pose.throttle=e.mode==='break'||style==='passer'?1:style==='aggressor'?.92:distance<350?.68:1;
        e.decision=[.65,.42,.28][e.skill];
    }
    DW.flightOpponent={/** @param {Craft} craft */forget:function(craft){tracks.delete(craft);},intercept:intercept,steer:steer,trackAim:trackAim,decide:decide,progressFreeSpace:progressFreeSpace,
        /** @param {Craft} craft */trackFor:function(craft){return tracks.get(craft);}};
}());
