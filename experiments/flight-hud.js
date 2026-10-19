(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').HudView} HudView */
    /** @typedef {import('./types').RadarContact} RadarContact */
    /** @typedef {import('./types').Vector} Vector */
    var get = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).experimentDom(document);
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    /** @typedef {{ id: string, shield: number, hull: number, shieldTrail: number, hullTrail: number, shieldAge: number, hullAge: number, flash: number, time: number }} TargetStatus */
    /** @param {TargetStatus | null} previous @param {{id: string, shield?: number, maxShield?: number, hp: number, maxHp: number} | undefined} target @param {number} time @returns {TargetStatus | null} */
    function targetStatus(previous, target, time) {
        if (!target) return null;
        var shield = Math.max(0, Math.min(1, (target.shield || 0) / (target.maxShield || 1)));
        var hull = Math.max(0, Math.min(1, target.hp / Math.max(1, target.maxHp)));
        if (!previous || previous.id !== target.id || time < previous.time)
            return {id: target.id, shield: shield, hull: hull, shieldTrail: shield, hullTrail: hull, shieldAge: 0, hullAge: 0, flash: 0, time: time};
        var dt = Math.max(0, time - previous.time);
        var shieldAge = shield < previous.shield ? 0 : previous.shieldAge + dt;
        var hullAge = hull < previous.hull ? 0 : previous.hullAge + dt;
        return {id: target.id, shield: shield, hull: hull,
            shieldTrail: shieldAge >= .5 ? shield : Math.max(shield, previous.shieldTrail),
            hullTrail: hullAge >= .5 ? hull : Math.max(hull, previous.hullTrail),
            shieldAge: shieldAge, hullAge: hullAge,
            flash: previous.shield > 0 && shield === 0 ? .22 : Math.max(0, previous.flash - dt), time: time};
    }
    /** Fixed screen-pixel meters below the range label leave the target unobstructed.
     * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {TargetStatus} status */
    function paintTargetStatus(ctx, x, y, status) {
        ctx.save();
        [{y: y + 39, value: status.shield, trail: status.shieldTrail, age: status.shieldAge, color: '#719fe0'},
         {y: y + 47, value: status.hull, trail: status.hullTrail, age: status.hullAge,
          color: status.hull <= .25 ? '#e57469' : status.hull <= .5 ? '#d8b15e' : '#82c68b'}].forEach(function (bar) {
            ctx.globalAlpha = .95;
            ctx.fillStyle = '#05090f';
            ctx.fillRect(x - 27, bar.y - 2, 54, 8);
            ctx.fillStyle = '#38424e';
            ctx.fillRect(x - 25, bar.y, 50, 4);
            ctx.globalAlpha = Math.max(0, 1 - bar.age / .5) * .7;
            ctx.fillStyle = '#d5dce5';
            ctx.fillRect(x - 25 + bar.value * 50, bar.y, Math.max(0, bar.trail - bar.value) * 50, 4);
            ctx.globalAlpha = 1;
            ctx.fillStyle = bar.color;
            ctx.fillRect(x - 25, bar.y, bar.value * 50, 4);
        });
        if (status.flash > 0) {
            ctx.globalAlpha = status.flash / .22 * .7;
            ctx.strokeStyle = '#9bbce9';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - 27, y + 37, 54, 8);
        }
        ctx.restore();
    }
    /** @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} h @param {number} angle */
    function paintTargetBearing(ctx, w, h, angle) {
        var dx = Math.cos(angle), dy = Math.sin(angle);
        var edge = Math.min(w * .44 / Math.max(.001, Math.abs(dx)), h * .34 / Math.max(.001, Math.abs(dy)));
        ctx.save();
        ctx.translate(w / 2 + dx * edge, h / 2 + dy * edge);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(20, 0); ctx.lineTo(-12, -12); ctx.lineTo(-6, 0); ctx.lineTo(-12, 12); ctx.closePath();
        ctx.strokeStyle = '#05090f'; ctx.lineWidth = 4; ctx.stroke();
        ctx.fillStyle = '#ffe7a3'; ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(w / 2 + dx * 76, h / 2 + dy * 76);
        ctx.rotate(angle);
        ctx.beginPath();
        [-7, 5].forEach(function (x) { ctx.moveTo(x - 7, -10); ctx.lineTo(x + 3, 0); ctx.lineTo(x - 7, 10); });
        ctx.strokeStyle = '#05090f'; ctx.lineWidth = 7; ctx.stroke();
        ctx.strokeStyle = '#ffe7a3'; ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
    }
    /** @param {HTMLElement} host */
    function mount(host) {
        var telemetry = get('telemetry'), targetCamera = DW.flightTargetCamera.mount(get('target-camera'));
        /** @type {TargetStatus | null} */
        var status = null;
        var radarRanges = [1000, 2500, 5000, 10000], radarRangeIndex = 2;
        var combatCanvas = document.createElement('canvas');
        combatCanvas.className = 'combat-overlay';
        combatCanvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(combatCanvas);
        var context = combatCanvas.getContext('2d');
        if (!context)
            throw new Error('Flight HUD requires a 2D canvas');
        const combatHud = context;
        // Selected-target guidance stays visible over comms and instrument panels.
        var bearingCanvas = document.createElement('canvas');
        bearingCanvas.className = 'combat-overlay';
        bearingCanvas.style.zIndex = '5';
        bearingCanvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(bearingCanvas);
        var bearingContext = bearingCanvas.getContext('2d');
        if (!bearingContext) throw new Error('Target bearing requires a 2D canvas');
        const bearingHud = bearingContext;
        /** @param {HudView} view */
        function render(view) {
            var state = view.state, combat = view.combat, guns = view.guns, asteroid = view.asteroid, mothership = view.mothership, units = view.units, paused = view.paused, mouse = view.mouse, shipImages = view.shipImages;
            var shipDistance = Math.hypot(state.eye[0] - mothership.position.x, state.eye[1] - mothership.position.y, state.eye[2]) * units;
            var distance = Math.hypot.apply(null, state.eye), speed = Math.hypot.apply(null, state.velocity);
            telemetry.textContent = speed.toFixed(0) + ' m/s   /   ' + Math.round(state.throttle * 100) + '% THR\n' + Math.round(distance * units) + ' m TO CENTER\n' + Math.round(asteroid.radius * 2 * units) + ' m BODY DIAMETER\n' + Math.round(shipDistance) + ' m TO MOTHERSHIP\n' + guns.fired + ' SHOTS / ' + guns.hits + ' HITS';
            var w = host.clientWidth, h = host.clientHeight;
            if (combatCanvas.width !== w || combatCanvas.height !== h) {
                combatCanvas.width = w;
                combatCanvas.height = h;
            }
            if (bearingCanvas.width !== w || bearingCanvas.height !== h) {
                bearingCanvas.width = w;
                bearingCanvas.height = h;
            }
            bearingHud.clearRect(0, 0, w, h);
            combatHud.clearRect(0, 0, w, h);
            if (!paused && view.showMouseStick) {
                var range = view.stickRange, cx = w / 2, cy = h / 2, sx = cx + mouse[0] * range, sy = cy + mouse[1] * range;
                combatHud.strokeStyle = 'rgba(166,239,222,.3)';
                combatHud.beginPath();
                combatHud.arc(cx, cy, range, 0, Math.PI * 2);
                combatHud.stroke();
                combatHud.beginPath();
                combatHud.arc(cx, cy, range * .08, 0, Math.PI * 2);
                combatHud.stroke();
                combatHud.strokeStyle = '#a6efde';
                combatHud.beginPath();
                combatHud.moveTo(cx, cy);
                combatHud.lineTo(sx, sy);
                combatHud.stroke();
                combatHud.beginPath();
                combatHud.arc(sx, sy, 5, 0, Math.PI * 2);
                combatHud.stroke();
            }
            var speakerId = view.speakerId, living = DW.training.alive(combat), selected = living.find(function (e) {
                return e.id === combat.targetId;
            });
            status = targetStatus(status, selected, combat.time);
            get('combat-status').textContent = !combat.enabled ? 'FREE FLIGHT' : combat.dead ? 'SORTIE OVER / ' + combat.kills + ' KILLS' : living.filter(function (e) {
                return e.team === 'enemy';
            }).length + ' HOSTILES / ' + living.filter(function (e) {
                return e.team === 'ally';
            }).length + ' WINGMEN / ' + combat.kills + ' KILLS' + (!living.length && combat.mode === 'asteroid-patrol' ? ' / MISSION COMPLETE' : !living.length || combat.roundOver ? ' / NEXT WAVE ' + Math.max(0, Math.ceil(combat.countdown)) + 's' : '');
            get('shield-meter').max = Math.max(1, combat.maxShield === undefined ? 120 : combat.maxShield);
            get('shield-meter').value = combat.shield;
            get('hull-meter').max = combat.maxHull === undefined ? 100 : combat.maxHull;
            get('hull-meter').value = combat.hull;
            get('hull-meter').dataset.condition = combat.hull / get('hull-meter').max <= .25 ? 'critical' : combat.hull / get('hull-meter').max <= .5 ? 'damaged' : 'healthy';
            get('speed-value').textContent = String(Math.round(Math.hypot.apply(null, state.velocity)));
            get('thrust-value').textContent = 'THRUST ' + Math.round(state.throttle * 100) + '%';
            get('thrust-meter').value = state.throttle;
            var anchors = DW.training.gunAnchors(combat.player), mounts = anchors ? anchors.length : (combat.player.profile.gunMounts || 2);
            get('weapon-name').textContent = view.weapon.name + ' / ' + mounts + (mounts === 1 ? ' gun / ' : ' guns / ') + ((combat.player.profile.gunMounts || 2) / view.weapon.fireWait / mounts).toFixed(1) + ' volleys/s';
            var targetPanel = get('target-info');
            targetPanel.hidden = !selected;
            if (selected) {
                var selection = selected.team === 'ally' ? view.allyArt : view.enemyArt, art = DW.flightPresentation.model(selected, combat.wave, view);
                get('target-label').textContent = (combat.targetLocked ? 'LOCKED / ' : 'AUTO / ') + (selected.team === 'ally' ? 'WING / ' : 'TARGET / ') + DW.training.callsign(selected);
                get('target-detail').textContent = (art.name || 'Training fighter') + ' / ' + Math.round(Math.hypot.apply(null, selected.pose.eye.map(function (v, i) {
                    return v - state.eye[i];
                })) * units) + ' m / ' + Math.ceil(selected.hp / selected.maxHp * 100) + '% HULL / ' + Math.ceil(selected.shield || 0) + ' SHIELD';
                get('target-hull').max = selected.maxHp;
                get('target-hull').value = selected.hp;
                get('target-hull').dataset.condition = selected.hp / selected.maxHp <= .25 ? 'critical' : selected.hp / selected.maxHp <= .5 ? 'damaged' : 'healthy';
                get('target-shield').max = Math.max(1, selected.maxShield || 1);
                get('target-shield').value = selected.shield || 0;
                targetCamera.update(selected, selection, combat.wave, units, shipImages, view.paint[selected.team === 'ally' ? 'ally' : 'enemy'], state, performance.now() / 1000);
            }
            if (combat.hitFlash > 0) {
                combatHud.fillStyle = 'rgba(255,55,25,' + (combat.hitFlash * .28) + ')';
                combatHud.fillRect(0, 0, w, h);
            }
            var radarContacts = /** @type {RadarContact[]} */ (living.map(function (e) {
                return { point: e.pose.eye, color: e.team === 'ally' ? '#63f58d' : '#ff655d', selected: e.id === combat.targetId, speaking: e.id === speakerId };
            }));
            radarContacts.push({ point: [0, 0, 0], color: '#a6aeb7', landmark: true });
            radarContacts.push({ point: [mothership.position.x, mothership.position.y, 0], color: '#69cfff', landmark: true });
            DW.flightRadar.draw(combatHud, state, radarContacts, units, radarRanges[radarRangeIndex], w, h, paused);
            combatHud.font = '12px ui-monospace,monospace';
            combatHud.textAlign = 'center';
            /** @param {Vector} point */
            function projection(point) {
                return DW.flightSkybox.project(point.map(function (x, i) {
                    return x - state.eye[i];
                }), state, w / h);
            }
            var targetBearing = /** @type {number | null} */ (null);
            living.forEach(function (e) {
                var q = projection(e.pose.eye), target = e.id === combat.targetId;
                combatHud.strokeStyle = target ? '#ffe7a3' : e.team === 'ally' ? '#63f58d' : '#ff655d';
                combatHud.fillStyle = combatHud.strokeStyle;
                if (q && Math.abs(q.x) < .9 && Math.abs(q.y) < .78) {
                    var x = w * (q.x + 1) / 2, y = h * (1 - q.y) / 2, r = target ? 18 : 12;
                    if (e.team === 'ally') {
                        combatHud.strokeRect(x - r, y - r, r * 2, r * 2);
                    }
                    else {
                        combatHud.beginPath();
                        combatHud.moveTo(x, y - r);
                        combatHud.lineTo(x + r, y);
                        combatHud.lineTo(x, y + r);
                        combatHud.lineTo(x - r, y);
                        combatHud.closePath();
                        combatHud.stroke();
                    }
                    if (e.id === speakerId)
                        DW.flightRadar.speakerHalo(combatHud, x, y, r + 6);
                    combatHud.fillText(Math.round(Math.hypot.apply(null, e.pose.eye.map(function (v, i) {
                        return v - state.eye[i];
                    })) * units) + ' m', x, y + r + 15);
                    if (target) {
                        combatHud.save();
                        combatHud.strokeStyle = '#ffe7a3';
                        combatHud.lineWidth = 2;
                        combatHud.shadowColor = '#000';
                        combatHud.shadowBlur = 4;
                        [-1, 1].forEach(function (a) {
                            [-1, 1].forEach(function (b) {
                                combatHud.beginPath();
                                combatHud.moveTo(x + a * 28, y + b * 17);
                                combatHud.lineTo(x + a * 28, y + b * 28);
                                combatHud.lineTo(x + a * 17, y + b * 28);
                                combatHud.stroke();
                            });
                        });
                        combatHud.restore();
                        if (status) paintTargetStatus(combatHud, x, y, status);
                        combatHud.fillText((e.team === 'ally' ? 'WING / ' : 'TARGET / ') + DW.training.callsign(e), x, y - 37);
                    }
                }
                else {
                    var delta = e.pose.eye.map(function (v, i) {
                        return v - state.eye[i];
                    }), dx = delta.reduce(function (sum, v, i) {
                        return sum + v * state.right[i];
                    }, 0), dy = -delta.reduce(function (sum, v, i) {
                        return sum + v * state.up[i];
                    }, 0);
                    if (Math.abs(dx) + Math.abs(dy) < .0001)
                        dx = 1;
                    var angle = Math.atan2(dy, dx), edge = Math.min(w * .44 / Math.max(.001, Math.abs(Math.cos(angle))), h * .34 / Math.max(.001, Math.abs(Math.sin(angle))));
                    var x = w / 2 + Math.cos(angle) * edge, y = h / 2 + Math.sin(angle) * edge;
                    if (target) targetBearing = angle;
                    combatHud.save();
                    combatHud.translate(x, y);
                    combatHud.rotate(angle);
                    combatHud.beginPath();
                    combatHud.moveTo(8, 0);
                    combatHud.lineTo(-5, -5);
                    combatHud.lineTo(-5, 5);
                    combatHud.closePath();
                    combatHud.stroke();
                    combatHud.restore();
                    if (e.id === speakerId)
                        DW.flightRadar.speakerHalo(combatHud, x, y, 13);
                }
            });
            if (targetBearing !== null) paintTargetBearing(bearingHud, w, h, targetBearing);
            if (selected) {
                var lead = DW.training.intercept(state.eye, selected.pose.eye, selected.pose.velocity.map(function (v) {
                    return v / units;
                }), view.weapon.speed / units), q = projection(lead.point);
                if (q && Math.abs(q.x) < 1 && Math.abs(q.y) < 1) {
                    combatHud.strokeStyle = '#a9e5dc';
                    combatHud.setLineDash([2, 3]);
                    combatHud.beginPath();
                    combatHud.arc(w * (q.x + 1) / 2, h * (1 - q.y) / 2, 7, 0, Math.PI * 2);
                    combatHud.stroke();
                    combatHud.setLineDash([]);
                }
            }
        }
        return { render: render, cycleRadarRange: function () {
                radarRangeIndex = (radarRangeIndex + 1) % radarRanges.length;
            } };
    }
    DW.flightHud = { paintTargetBearing: paintTargetBearing, mount: mount, targetStatus: targetStatus, paintTargetStatus: paintTargetStatus };
}());
