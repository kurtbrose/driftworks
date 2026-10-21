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
     * @param {import('./gpu-ui-types').PaintContext} ctx @param {number} x @param {number} y @param {TargetStatus} status */
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
    /** @param {import('./gpu-ui-types').PaintContext} ctx @param {number} w @param {number} h @param {number} angle */
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
        var gpu = DW.gpuUi.create(document.body), combatHud = gpu.painter, bearingHud = gpu.painter;
        document.body.classList.add('gpu-hud');
        var commsPanel = get('comms');
        var lab = document.querySelector('aside'); if (lab) lab.appendChild(telemetry);
        // Keep live text/meter semantics and portrait generation offscreen. The
        // visible play screen is composed exclusively by the GPU HUD.
        ['integrity','instruments','weapons','target-info','comms','reticle','hud-help'].forEach(function(id){
            var element=document.getElementById(id); if(element)element.classList.add('gpu-hud-source');
        });
        var targetRendered = false;
        /** @param {HudView} view */
        function render(view) {
            var state = view.state, combat = view.combat, guns = view.guns, asteroid = view.asteroid, mothership = view.mothership, units = view.units, paused = view.paused, mouse = view.mouse, shipImages = view.shipImages;
            var mission=DW.flightMissions.resolve(combat.mode), displayScale=mission.units.distanceScale, distanceUnit=' '+mission.units.distanceLabel, speedScale=mission.units.speedScale, speedLabel=mission.units.speedLabel;
            var shipDistance = Math.hypot(state.eye[0] - mothership.position.x, state.eye[1] - mothership.position.y, state.eye[2]) * units;
            var distance = Math.hypot.apply(null, state.eye), speed = Math.hypot.apply(null, state.velocity);
            telemetry.textContent = (speed*speedScale).toFixed(0) + ' '+speedLabel+'   /   ' + Math.round(state.throttle * 100) + '% THR\n' + Math.round(distance * units*displayScale) + distanceUnit+' TO CENTER\n' + Math.round(asteroid.radius * 2 * units*displayScale) + distanceUnit+' BODY DIAMETER\n' + Math.round(shipDistance*displayScale) + distanceUnit+' TO MOTHERSHIP\n' + guns.fired + ' SHOTS / ' + guns.hits + ' HITS';
            var w = host.clientWidth, h = host.clientHeight;
            gpu.begin(w, h);
            var chase = document.body.classList.contains('watch-chase');
            if (!paused && view.showMouseStick) {
                var range = view.stickRange, cx = w / 2, cy = h / 2, sx = cx + mouse[0] * range, sy = cy + mouse[1] * range;
                combatHud.strokeStyle = 'rgba(166,239,222,.3)';
                combatHud.beginPath();
                combatHud.arc(cx, cy, 3, 0, Math.PI * 2);
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
            }).length + (' '+mission.teams.enemy.status+' / ') + living.filter(function (e) {
                return e.team === 'ally';
            }).length + (' '+mission.teams.ally.status+' / ') + combat.kills + ' KILLS' + (!living.length && combat.mode === 'asteroid-patrol' ? ' / MISSION COMPLETE' : !living.length || combat.roundOver ? ' / NEXT WAVE ' + Math.max(0, Math.ceil(combat.countdown)) + 's' : '');
            get('shield-meter').max = Math.max(1, combat.maxShield === undefined ? 120 : combat.maxShield);
            get('shield-meter').value = combat.shield;
            get('hull-meter').max = combat.maxHull === undefined ? 100 : combat.maxHull;
            get('hull-meter').value = combat.hull;
            get('hull-meter').dataset.condition = combat.hull / get('hull-meter').max <= .25 ? 'critical' : combat.hull / get('hull-meter').max <= .5 ? 'damaged' : 'healthy';
            get('speed-value').textContent = String(Math.round(Math.hypot.apply(null, state.velocity)*speedScale));
            var speedUnit=document.getElementById('speed-unit');if(speedUnit)speedUnit.textContent=speedLabel;
            get('thrust-value').textContent = (state.throttle < 0 ? 'REV ' : 'THRUST ') + Math.round(Math.abs(state.throttle) * 100) + '%';
            get('thrust-meter').value = Math.abs(state.throttle);
            get('weapon-name').textContent = view.weapon.name;
            var targetPanel = get('target-info');
            targetPanel.hidden = !selected;
            if (selected) {
                var selection = selected.team === 'ally' ? view.allyArt : view.enemyArt, art = DW.flightPresentation.model(selected, combat.wave, view);
                get('target-label').textContent = (combat.targetLocked ? 'LOCKED / ' : 'AUTO / ') + (selected.team === 'ally' ? mission.teams.ally.target : mission.teams.enemy.target)+' / ' + DW.training.callsign(selected);
                get('target-detail').textContent = (art.name || 'Training fighter') + ' / ' + Math.round(Math.hypot.apply(null, selected.pose.eye.map(function (v, i) {
                    return v - state.eye[i];
                })) * units*displayScale) + distanceUnit+' / ' + Math.ceil(selected.hp / selected.maxHp * 100) + '% HULL / ' + Math.ceil(selected.shield || 0) + ' SHIELD';
                get('target-hull').max = selected.maxHp;
                get('target-hull').value = selected.hp;
                get('target-hull').dataset.condition = selected.hp / selected.maxHp <= .25 ? 'critical' : selected.hp / selected.maxHp <= .5 ? 'damaged' : 'healthy';
                get('target-shield').max = Math.max(1, selected.maxShield || 1);
                get('target-shield').value = selected.shield || 0;
                targetRendered = targetCamera.update(selected, selection, combat.wave, units, shipImages, view.paint[selected.team === 'ally' ? 'ally' : 'enemy'], state, performance.now() / 1000);
            }
            if (combat.hitFlash > 0) {
                combatHud.fillStyle = 'rgba(255,55,25,' + (combat.hitFlash * .28) + ')';
                combatHud.fillRect(0, 0, w, h);
            }
            var radarContacts = /** @type {RadarContact[]} */ (living.map(function (e) {
                return { point: e.pose.eye, color: e.team === 'ally' ? '#63f58d' : '#ff655d', selected: e.id === combat.targetId, speaking: e.id === speakerId };
            }));
            if(!mission.emptySpace){
                radarContacts.push({ point: [0, 0, 0], color: '#a6aeb7', landmark: true });
                radarContacts.push({ point: [mothership.position.x, mothership.position.y, 0], color: '#69cfff', landmark: true });
            }
            DW.flightRadar.draw(combatHud, state, radarContacts, units, radarRanges[radarRangeIndex], w, h, paused, combat.mode, document.body.classList.contains('touch-flight'));
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
                combatHud.globalAlpha = 1;
                combatHud.lineWidth = 1.5;
                combatHud.strokeStyle = target ? '#ffe7a3' : e.team === 'ally' ? '#63f58d' : '#ff655d';
                combatHud.fillStyle = combatHud.strokeStyle;
                if (q && Math.abs(q.x) < .9 && Math.abs(q.y) < .78) {
                    var x = w * (q.x + 1) / 2, y = h * (1 - q.y) / 2, r = target ? 18 : 12;
                    if (e.team === 'ally') {
                        combatHud.save();
                        combatHud.strokeStyle = '#05090f';
                        combatHud.lineWidth = 3.5;
                        combatHud.strokeRect(x - r, y - r, r * 2, r * 2);
                        combatHud.restore();
                        combatHud.strokeRect(x - r, y - r, r * 2, r * 2);
                    }
                    else {
                        combatHud.beginPath();
                        combatHud.moveTo(x, y - r);
                        combatHud.lineTo(x + r, y);
                        combatHud.lineTo(x, y + r);
                        combatHud.lineTo(x - r, y);
                        combatHud.closePath();
                        combatHud.save();
                        combatHud.strokeStyle = '#05090f';
                        combatHud.lineWidth = 3.5;
                        combatHud.stroke();
                        combatHud.restore();
                        combatHud.stroke();
                    }
                    if (e.id === speakerId)
                        DW.flightRadar.speakerHalo(combatHud, x, y, r + 6);
                    if (target || e.id === speakerId) combatHud.fillText(Math.round(Math.hypot.apply(null, e.pose.eye.map(function (v, i) {
                        return v - state.eye[i];
                    })) * units*displayScale) + distanceUnit, x, y + r + 15);
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
                        combatHud.fillText((e.team === 'ally' ? mission.teams.ally.target : mission.teams.enemy.target)+' / ' + DW.training.callsign(e), x, y - 37);
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
                    combatHud.save();
                    combatHud.strokeStyle = '#05090f';
                    combatHud.lineWidth = 3.5;
                    combatHud.stroke();
                    combatHud.restore();
                    if (e.team === 'enemy') combatHud.fill();
                    combatHud.stroke();
                    combatHud.restore();
                    if (e.id === speakerId)
                        DW.flightRadar.speakerHalo(combatHud, x, y, 13);
                }
            });

            combatHud.globalAlpha = 1;
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
            // Chase-camera projection differs from the pilot's sight line. Keep
            // instruments while suppressing pilot-relative markers and radar.
            if (chase) gpu.begin(w, h);
            instruments(view, selected, w, h);
            if (!chase && targetBearing !== null) paintTargetBearing(bearingHud, w, h, targetBearing);
            gpu.end();
        }
        /** @param {HudView} view @param {import('./types').Craft | undefined} selected @param {number} w @param {number} h */
        function instruments(view, selected, w, h) {
            var ctx = gpu.painter, combat=view.combat, mission=DW.flightMissions.resolve(combat.mode);
            var compact=w<760, margin=compact?12:24, pw=w<600?(w-margin*3)/2:Math.min(compact?166:224,(w-190)/2-margin*2), bottom=h-margin;
            var ink='#b9e9dc', muted='#719a98', gold='#ffe1a0';
            /** @param {number} x @param {number} y @param {number} width @param {number} height */
            function panel(x,y,width,height){ctx.fillStyle='rgba(3,15,21,.78)';ctx.strokeStyle='rgba(111,185,171,.38)';ctx.lineWidth=1;ctx.panel(x,y,width,height,8);}
            /** @param {string} text @param {number} x @param {number} y @param {number} [size] @param {string} [color] */
            function label(text,x,y,size,color){ctx.font=(size||11)+'px monospace';ctx.fillStyle=color||ink;ctx.textAlign='left';ctx.fillText(text,x,y);}
            /** @param {string} name @param {number} value @param {number} max @param {number} x @param {number} y @param {number} width @param {string} color */
            function meter(name,value,max,x,y,width,color){var fraction=Math.max(0,Math.min(1,value/Math.max(1,max)));label(name,x,y,10,muted);label(Math.round(fraction*100)+'%',x+width-27,y,10,ink);ctx.fillStyle='#233c43';ctx.fillRect(x,y+6,width,4);ctx.fillStyle=color;ctx.fillRect(x,y+6,width*fraction,4);}
            if (document.body.classList.contains('touch-flight')) {
                panel(12,12,Math.min(250,w-202),70);
                meter('SHIELD',combat.shield,combat.maxShield||120,24,29,86,'#79b8e7');
                meter('HULL',combat.hull,combat.maxHull||100,24,54,86,'#91d29b');
                label(Math.round(Math.hypot.apply(null,view.state.velocity)*mission.units.speedScale)+' '+mission.units.speedLabel,124,32,13);
                label('THR '+Math.round(view.state.throttle*100)+'%',124,57,13);
                label(selected ? DW.training.callsign(selected) : 'NO TARGET',12,104,12,gold);
            } else {
            var leftY=bottom-162;
            panel(margin,leftY,pw,162);
            label('YOUR SHIP',margin+14,leftY+23,10,muted);
            meter('SHIELD',combat.shield,combat.maxShield||120,margin+14,leftY+44,pw-28,'#79b8e7');
            meter('HULL',combat.hull,combat.maxHull||100,margin+14,leftY+70,pw-28,combat.hull/(combat.maxHull||100)<.25?'#ff776b':'#91d29b');
            label(String(Math.round(Math.hypot.apply(null,view.state.velocity)*mission.units.speedScale)),margin+14,leftY+115,25);
            label(mission.units.speedLabel,margin+80,leftY+115,11,muted);
            label((view.state.throttle<0?'REV ':'THR ')+Math.round(Math.abs(view.state.throttle)*100)+'%',margin+14,leftY+141,11);
            label(view.weapon.name.slice(0,Math.floor((pw-28)/6.7)),margin+14,leftY-12,11,muted);
            var rightX=w-margin-pw, rightY=bottom-198;
            panel(rightX,rightY,pw,198);
            label(selected?(combat.targetLocked?'TARGET LOCK':'AUTO TARGET'):'NO TARGET',rightX+14,rightY+22,10,selected?gold:muted);
            if(selected){
                label(DW.training.callsign(selected).slice(0,22),rightX+14,rightY+44,16,gold);
                var source=get('target-camera').querySelector('canvas:not(.scene3d-overlay)');
                if(source instanceof HTMLCanvasElement){var fit=Math.min((pw-24)/source.width,76/source.height);ctx.image(source,rightX+(pw-source.width*fit)/2,rightY+51,source.width*fit,source.height*fit,0,targetRendered);}
                var distance=Math.hypot.apply(null,selected.pose.eye.map(function(v,i){return v-view.state.eye[i];}))*view.units*mission.units.distanceScale;
                label(Math.round(distance)+' '+mission.units.distanceLabel,rightX+14,rightY+139,11);
                meter('SHIELD',selected.shield||0,selected.maxShield||1,rightX+14,rightY+157,pw-28,'#79b8e7');
                meter('HULL',selected.hp,selected.maxHp,rightX+14,rightY+181,pw-28,'#91d29b');
            }else label('TAB / ACQUIRE',rightX+14,rightY+50,11,muted);
            }
            // A small reticle replaces the DOM ring and repeated keyboard hints.
            if(!document.body.classList.contains('watch-chase')){
                ctx.strokeStyle='rgba(178,232,214,.8)';ctx.lineWidth=1;
                ctx.beginPath();ctx.arc(w/2,h/2,5,0,Math.PI*2);ctx.stroke();
                ctx.beginPath();ctx.moveTo(w/2-10,h/2);ctx.lineTo(w/2-7,h/2);ctx.moveTo(w/2+7,h/2);ctx.lineTo(w/2+10,h/2);ctx.stroke();
            }
            if(combat.dead||combat.roundOver){ctx.textAlign='center';ctx.font='18px monospace';ctx.fillStyle=gold;ctx.fillText(combat.dead?'SHIP LOST':combat.kills+' KILLS / SORTIE COMPLETE',w/2,h*.29);}
            // Transmissions are temporary; no idle comms box or voice button in play.
            var subtitle=commsPanel.querySelector('[data-subtitle]'),speaker=commsPanel.querySelector('[data-speaker]');
            if(!view.paused&&!commsPanel.classList.contains('idle')&&subtitle&&subtitle.textContent){
                var mobile=document.body.classList.contains('touch-flight');
                var cw=mobile?Math.min(360,w>600?w-370:w-24):Math.min(640,w-margin*2),cx=(w-cw)/2,cy=mobile?(w>600?12:114):margin;
                if(mobile&&w>600)cx=280;
                var portrait=commsPanel.querySelector('canvas.radio-portrait'),hasPortrait=portrait instanceof HTMLCanvasElement&&!portrait.hidden;
                var portraitSize=mobile?52:Math.min(compact?112:128,h<480?96:128);
                var textX=cx+(hasPortrait?portraitSize+30:18),textWidth=cw-(hasPortrait?portraitSize+48:36),fontSize=Math.min(compact?18:32,Math.max(14,Number(get('dialogue-size').value)||22)),columns=Math.max(12,Math.floor(textWidth/(fontSize*.603)));
                if(mobile){fontSize=12;columns=Math.max(12,Math.floor(textWidth/(fontSize*.603)));}
                var words=subtitle.textContent.split(/\s+/),lines=[''];words.forEach(function(word){var last=lines.length-1;if((lines[last]+' '+word).trim().length>columns)lines.push(word);else lines[last]=(lines[last]+' '+word).trim();});
                if(mobile)lines=lines.slice(0,3);
                var ch=Math.max(hasPortrait?portraitSize+24:mobile?64:92,48+lines.length*(fontSize+5));panel(cx,cy,cw,ch);
                if(hasPortrait&&portrait instanceof HTMLCanvasElement)ctx.image(portrait,cx+12,cy+12,portraitSize,portraitSize,1);
                label((speaker&&speaker.textContent)||'COMMS',textX,cy+24,11,gold);
                lines.forEach(function(line,i){label(line,textX,cy+49+i*(fontSize+5),fontSize,ink);});
            }
        }
        return { render: render, cycleRadarRange: function () {
                radarRangeIndex = (radarRangeIndex + 1) % radarRanges.length;
            } };
    }
    DW.flightHud = { paintTargetBearing: paintTargetBearing, mount: mount, targetStatus: targetStatus, paintTargetStatus: paintTargetStatus };
}());
