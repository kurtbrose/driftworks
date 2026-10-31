(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').Emotion} Emotion */
    /** @typedef {import('./types').CommsState} CommsState */
    /** @typedef {import('./types').Craft} Craft */
    /** @typedef {import('./types').Combat} Combat */
    /** @typedef {import('./types').Identity} Identity */
    /** @typedef {import('./types').FlightState} FlightState */
    /** @typedef {import('./types').Candidate} Candidate */
    /** @typedef {import('./types').Contact} Contact */
    /** @typedef {import('./types').SituationCraft} SituationCraft */
    /** @typedef {import('./types').Speaker} Speaker */
    /** @typedef {import('./types').LineData} LineData */
    /** @typedef {import('./types').Line} Line */
    /** @typedef {import('./types').Choices} Choices */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    var dialogue = DW.flightDialogue;
    var lines = dialogue.lines, calls = dialogue.calls, emotionalLines = dialogue.emotionalLines, emotionalReplies = dialogue.emotionalReplies, emotionStrength = dialogue.emotionStrength, pilotVoice = dialogue.pilotVoice, voiceOptions = dialogue.voiceOptions, numberWords = dialogue.numberWords, compose = dialogue.compose, pickLine = dialogue.pickLine, contactData = dialogue.contactData;
    /** @param {HTMLElement} panel @param {HTMLElement} toggle */
    function mount(panel, toggle) {
        return DW.flightRadio.mount(panel, toggle);
    }
    // Stress is the continuous baseline. Brief event modifiers never suppress fear.
    /** @param {Emotion} emotion @param {number} time */
    function deriveEmotion(emotion, time) {
        var was = emotion.current;
        var panic = was === 'panicked' ? 0.65 : 0.8;
        var fear = was === 'afraid' || was === 'panicked' ? 0.25 : 0.35;
        var modifier = emotion.modifier && time < emotion.modifier.until ? emotion.modifier : null;
        emotion.current = emotion.stress >= panic ? 'panicked' : emotion.stress >= fear ? 'afraid' : modifier ? modifier.current : 'calm';
        emotion.intensity = emotion.current === 'panicked' || emotion.current === 'afraid' ? emotion.stress : modifier ? modifier.intensity * Math.min(1, (modifier.until - time) / 3) : 0;
        if (was !== emotion.current)
            emotion.announced = null;
    }
    /** @param {CommsState} state @param {string} id @param {string} current @param {number} intensity */
    function setEmotion(state, id, current, intensity) {
        var emotion = state.emotions[id];
        if (!emotion)
            return;
        if (current === 'panicked' || current === 'afraid') {
            emotion.stress = Math.max(emotion.stress, current === 'panicked' ? 0.85 : 0.5);
            emotion.recoverAfter = state.time + 6;
        }
        else {
            emotion.modifier = { current: current, intensity: intensity, until: state.time + 10 };
            if (current === 'confused' || current === 'frustrated')
                emotion.stress = Math.max(emotion.stress, Math.min(0.55, emotion.stress + 0.08));
        }
        deriveEmotion(emotion, state.time);
    }
    /** @param {CommsState} state @param {Craft[]} living @param {Combat} combat @param {number} dt */
    function observeEmotions(state, living, combat, dt) {
        if (state.emotionWave !== combat.wave) {
            state.emotions = {};
            state.emotionalConversation = null;
            state.emotionWave = combat.wave;
        }
        var previous = state.situation;
        living.forEach(function (craft) {
            var emotion = state.emotions[craft.id];
            if (!emotion)
                emotion = state.emotions[craft.id] = { current: 'calm', intensity: 0, stress: 0, recoverAfter: 0, modifier: null };
            var old = previous && previous.wave === combat.wave && previous.craft[craft.id];
            var pursuers = living.filter(function (e) {
                return e.team !== craft.team && e.targetId === craft.id && e.mode === 'attack';
            }).length;
            // Integrate only an observed interval, not time before a craft appeared.
            if (old) {
                if (old.pursued && pursuers)
                    {
                    // Pressure has an equilibrium, rather than filling a panic meter.
                    var baseline = pursuers > 1 ? 0.65 : 0.5;
                    var interval = emotion.stress > baseline ? Math.max(0, state.time - Math.max(state.time - dt, emotion.recoverAfter)) : dt;
                    emotion.stress = baseline + (emotion.stress - baseline) * Math.exp(-0.12 * interval);
                }
                else if (!old.pursued && !pursuers) {
                    var recovery = Math.max(0, state.time - Math.max(state.time - dt, emotion.recoverAfter));
                    emotion.stress = Math.max(0, emotion.stress - recovery * 0.035);
                }
                var damage = Math.max(0, old.hp - craft.hp);
                if (damage) {
                    emotion.stress = Math.min(1, emotion.stress + damage * 0.015);
                    if (craft.hp <= 30)
                        emotion.stress = Math.max(emotion.stress, 1);
                    emotion.recoverAfter = state.time + 6;
                }
                if (old.pursued && !pursuers)
                    emotion.modifier = { current: 'relieved', intensity: 0.7, until: state.time + 10 };
            }
            deriveEmotion(emotion, state.time);
        });
        Object.keys(state.emotions).forEach(function (id) {
            if (!living.some(function (c) {
                return String(c.id) === id;
            }))
                delete state.emotions[id];
        });
    }
    /** @param {Identity | null} [craft] */
    function callsign(craft) {
        return craft ? DW.flightSim.callsign(craft) : 'pilot';
    }
    /** @param {CommsState} state @param {Combat} combat @param {Craft[]} living @param {FlightState | undefined} player @returns {Candidate[]} */
    function richer(state, combat, living, player) {
        var result = /** @type {Candidate[]} */ ([]), contacts = /** @type {{target: Craft; data: Contact}[]} */ ([]), previous = state.situation, now = /** @type {Record<string, SituationCraft>} */ ({}), wave = combat.wave;
        if (previous && previous.wave !== wave)
            state.contactReports = {};
        /** @param {Speaker | null | undefined} craft @param {string} event @param {LineData} [data] @param {boolean} [fact] */
        function offer(craft, event, data, fact) {
            if (!craft)
                return;
            var entry = /** @type {Candidate} */ ({ craft: craft, event: event, data: data || {}, texts: compose(event, data || {}, combat.mode) });
            var feeling = /** @type {Record<string, string>} */ ({ loss: 'confused', kill: 'confident', missed: 'frustrated', outnumbered: 'panicked' })[event];
            if (feeling)
                setEmotion(state, craft.id, feeling, 0.8);
            if (fact) {
                entry.expires = state.time + 7;
                entry.wave = wave;
                state.facts.push(entry);
            }
            else
                result.push(entry);
        }
        /** @param {string} team @param {string} [except] */
        function witness(team, except) {
            return living.filter(function (e) {
                return (e.team || 'enemy') === team && e.id !== except;
            }).sort(function (a, b) {
                return (state.spoken[a.id] === undefined ? -Infinity : state.spoken[a.id]) - (state.spoken[b.id] === undefined ? -Infinity : state.spoken[b.id]);
            })[0] || (team === 'ally' ? { id: 'control', team: 'ally', mode: 'range' } : null);
        }
        var sameWave = previous && previous.wave === wave;
        var events = (combat.radioEvents || []).filter(function (e) {
            return e.serial > state.radioSerial;
        });
        events.forEach(function (e) {
            state.radioSerial = Math.max(state.radioSerial, e.serial);
            if (e.wave !== wave || combat.time - e.time > 7)
                return;
            var subject = living.find(function (c) {
                return c.id === e.victim;
            });
            if (e.kind === 'destroyed') {
                var lost = (combat.enemies || []).filter(function (c) {
                    return c.hp <= 0 && (c.team || 'enemy') === e.team;
                }).length;
                offer(witness(e.team), 'loss', { pilot: callsign(e), count: lost }, true);
                var killer = living.find(function (c) {
                    return c.id === e.killer;
                });
                if (killer)
                    offer(witness(killer.team || 'enemy', killer.id), 'kill', { pilot: callsign(killer) }, true);
            }
            else if (e.kind === 'hit' && subject && subject.hp > 30 && !state.facts.some(function(entry){return entry.event === 'hit' && entry.craft.id === e.victim;}))
                offer(subject, 'hit', {}, true);
            else if (e.kind === 'near')
                offer(subject || (e.victim === 'player' ? witness('ally') : null), e.victim === 'player' ? 'nearPlayer' : 'near', {}, true);
            else if (e.kind === 'shield')
                offer(witness('ally'), 'shield', {}, true);
        });
        living.forEach(function (craft) {
            var old = previous && sameWave ? previous.craft[craft.id] : null;
            var pursued = living.some(function (e) {
                return e.team !== craft.team && e.targetId === craft.id && e.mode === 'attack';
            });
            var target = living.find(function (e) {
                return e.id === craft.targetId;
            });
            var contact = craft.pose && (craft.team || 'enemy') === 'enemy' ? contactData(player, craft.pose.eye) : null;
            var inContact = !!contact && contact.distance <= (old && old.inContact ? 3000 : 2500);
            var report = state.contactReports[craft.id];
            if (contact && inContact && !state.facts.some(function (e) {
                return e.contactId === craft.id;
            }) && (!old || !old.inContact || (report && state.time - report.time >= 30 && (report.sector !== contact.sector || report.range !== contact.range))))
                contacts.push({ target: craft, data: contact });
            var closing = 0;
            if (craft.pose && player && player.eye && player.velocity && (craft.team || 'enemy') === 'enemy') {
                var delta = craft.pose.eye.map(function (v, i) {
                    return v - player.eye[i];
                }), distance = Math.hypot.apply(null, delta);
                if(player.curvature){var route=DW.flightHyperbolic.path(player.eye,craft.pose.eye,player.curvature);distance=route.distance;delta=route.direction.map(function(v){return v*distance;});}
                var perceivedVelocity=player.curvature?DW.flightHyperbolic.transport(craft.pose.eye,player.eye,craft.pose.velocity,player.curvature):craft.pose.velocity;
                if (distance > 0 && craft.pose.velocity)
                    closing = -delta.reduce(function (sum, v, i) {
                        return sum + v * (perceivedVelocity[i] - player.velocity[i]);
                    }, 0) / distance;
            }
            var passHit = !!(old && old.targetId === craft.targetId && old.mode === 'attack' && (old.passHit || (target && old.targetHp !== null && target.hp < old.targetHp)));
            now[craft.id] = { inContact: inContact, passHit: passHit, firedPass: !!craft.fire || !!(old && old.mode === 'attack' && craft.mode === 'attack' && old.targetId === craft.targetId && old.firedPass), hp: craft.hp, pursued: pursued, fire: !!craft.fire, targetId: craft.targetId, targetHp: target ? target.hp : null, mode: craft.mode, closing: closing };
            if (!old)
                return;
            if (old.hp > 30 && craft.hp <= 30)
                offer(craft, 'damaged', {}, true);
            if (old.pursued && !pursued && old.mode === 'evade')
                offer(craft, 'escaped', {});
            if (old.mode === 'attack' && target && target.id === old.targetId && !passHit && old.firedPass && craft.mode !== 'attack')
                offer(craft, 'missed', {});
            if (target && old.targetId === target.id && old.targetHp !== null && old.targetHp > 30 && target.hp <= 30)
                offer(craft, 'vulnerable', { pilot: callsign(target) }, true);
            if (old.closing < 50 && closing >= 50)
                offer(witness('ally'), 'closing', { pilot: callsign(craft), speed: Math.round(closing / 10) * 10 });
        });
        if (contacts.length) {
            contacts.sort(function (a, b) {
                return a.data.distance - b.data.distance;
            });
            var spotted = contacts[0], before = state.facts.length;
            offer(witness('ally'), 'contact', spotted.data, true);
            if (state.facts.length > before)
                state.facts[state.facts.length - 1].contactId = spotted.target.id;
        }
        Object.keys(state.contactReports).forEach(function (id) {
            if (!now[id])
                delete state.contactReports[id];
        });
        var allies = living.filter(function (e) {
            return e.team === 'ally';
        }).length, enemies = living.length - allies;
        if (previous && sameWave) {
            if (enemies > 0 && enemies < previous.enemies)
                offer(witness('ally'), 'remaining', { count: enemies }, true);
            if (allies > 0 && enemies > allies && previous.allies >= previous.enemies)
                offer(witness('ally'), 'outnumbered', { friends: allies, enemies: enemies }, true);
            var playerRun = (combat.radioEvents || []).filter(function (e) {
                return e.kind === 'destroyed' && e.killer === 'player' && e.wave === wave && combat.time - e.time <= 20;
            }).length;
            if ((combat.playerKills || 0) > previous.playerKills && playerRun >= 2)
                offer(witness('ally'), 'streak', { count: playerRun }, true);
        }
        state.situation = { wave: wave, craft: now, allies: allies, enemies: enemies, playerKills: combat.playerKills || 0 };
        state.facts = state.facts.filter(function (entry) {
            return (entry.expires || 0) >= state.time && entry.wave === wave && (!entry.contactId || living.some(function (e) {
                var c = e.id === entry.contactId && e.pose ? contactData(player, e.pose.eye) : null;
                return c && c.distance <= 3000;
            })) && (entry.event !== 'remaining' || entry.data?.count === enemies) && (entry.event !== 'shield' || combat.shield <= 0) && (entry.event !== 'outnumbered' || (allies > 0 && enemies > allies)) && (entry.craft.id === 'control' || living.some(function (e) {
                return e.id === entry.craft.id && (entry.event !== 'hit' || e.hp > 30);
            }));
        }).slice(-12);
        return result.concat(state.facts);
    }
    /** @returns {CommsState} */
    function create() {
        return { wait: 4, serial: 0, last: '', recentLines: [], danger: false, quiet: 2, time: 0, modes: {}, activity: {}, spoken: {}, quietGap: 2, lastCraft: null, recentActivities: [], activitySpoken: {}, conversation: null, situation: null, radioSerial: 0, facts: [], contactReports: {}, emotions: {}, emotionWave: null, emotionalConversation: null, acknowledgment: null };
    }
    /** @param {string} event */
    function activityKind(event) {
        return event === 'attack' || event === 'firing' ? 'offense' : event;
    }
    /** @param {Speaker} craft @param {Craft[]} living */
    function onTail(craft, living) {
        const pose = craft.pose;
        if (!pose)
            return false;
        return living.some(function (other) {
            if (other.team === craft.team || other.mode !== 'attack' || other.targetId !== craft.id || !other.pose)
                return false;
            var delta = other.pose.eye.map(function (v, i) {
                return v - pose.eye[i];
            });
            if(pose.curvature){var route=DW.flightHyperbolic.path(pose.eye,other.pose.eye,pose.curvature);delta=route.direction.map(function(v){return v*route.distance;});}
            var distance = Math.hypot.apply(null, delta);
            return distance > 0 && delta.reduce(function (sum, v, i) {
                return sum + v * pose.back[i];
            }, 0) / distance > 0.5;
        });
    }
    /** @param {CommsState} state @param {Craft[]} living */
    function responder(state, living) {
        const request = state.conversation;
        if (!request)
            return null;
        const caller = living.find(function (e) {
            return e.id === request.caller;
        });
        const threat = living.find(function (e) {
            return e.id === request.threat;
        });
        if (state.time > request.expires || !caller || caller.team !== 'ally' || !threat || caller.team === threat.team ||
            threat.targetId !== caller.id || (threat.mode !== 'attack' && threat.mode !== 'evade')) {
            state.conversation = null;
            return null;
        }
        return living.find(function (helper) {
            if (helper.id === caller.id || helper.team !== caller.team || helper.mode !== 'attack' ||
                helper.targetId !== threat.id)
                return false;
            if (helper.fire)
                return true;
            // The reply describes actual movement toward the caller's attacker.
            return helper.pose && threat.pose && helper.pose.velocity && helper.pose.velocity.reduce(function (sum, v, i) {
                return sum + v * (threat.pose.eye[i] - helper.pose.eye[i]);
            }, 0) > 0;
        }) || null;
    }
    // Active flight seconds only. No queue: a busy channel drops opportunities.
    /** @param {CommsState} state @param {number} dt @param {Combat} combat @param {boolean} busy @param {(() => number)} [random] @param {FlightState} [player] @returns {Line | null} */
    function step(state, dt, combat, busy, random, player) {
        var mission=DW.flightMissions.resolve(combat.mode);
        if(DW.flightMissionRuntime.scramblePending(combat)){
            var story=DW.flightMissionRuntime.scrambleCue(combat,busy);
            if(!story)return null;
            return {text:story.text,speaker:story.speaker,voice:'Scout',hostile:false,seed:101,radioSeed:7919,voiceSettings:pilotVoice(combat.enemies[story.index]),portraitIndex:story.index,craftId:'scramble-control',event:'scrambleStory'};
        }
        if(combat.mode==='evacuation')return DW.evacuationMission.step(combat,Math.max(0,dt),busy);
        if(combat.mode==='convoy')return DW.convoyMission.radio(combat,Math.max(0,dt),busy);
        dt = Math.max(0, dt);
        state.time += dt;
        if (DW.flightMissionRuntime.openingPending(combat) && combat.enabled) {
            var intro=DW.flightMissionRuntime.openingCue(combat,busy);
            if(!intro){if(!DW.flightMissionRuntime.openingPending(combat))state.wait=8;return null;}
            var introIndex=intro.index,opening=intro.line,introCraft=intro.craft;
            return {text: opening.text, speaker: (introCraft.team === 'ally' ? mission.teams.ally.radio+' ' : mission.teams.enemy.radio+' ') + DW.flightSim.callsign(introCraft) + ' / '+opening.channel,
                voice: 'Scout', hostile: introCraft.team!=='ally', seed: 101 + introIndex * 37, radioSeed: 7919 + introIndex,
                voiceSettings: pilotVoice(introCraft), portraitIndex: introCraft.index, craftId: introCraft.id, event:'missionIntro'};
        }

        state.wait = Math.max(0, state.wait - dt);
        state.quiet = busy ? 0 : state.quiet + dt;
        random = random || Math.random;
        var living = combat.enabled ? combat.enemies.filter(function (e) {
            return e.hp > 0;
        }) : [];
        observeEmotions(state, living, combat, dt);
        var modes = /** @type {Record<string, string>} */ ({}), activity = /** @type {CommsState['activity']} */ ({}), candidates = combat.enabled ? richer(state, combat, living, player) : [];
        if (!combat.enabled) {
            state.emotionalConversation = null;
            state.acknowledgment = null;
            state.facts = [];
            state.situation = null;
            state.contactReports = {};
            state.radioSerial = combat.radioSerial || 0;
        }
        living.forEach(function (craft) {
            modes[craft.id] = craft.mode;
            var previous = state.activity[craft.id], event = /** @type {string | null} */ (null);
            activity[craft.id] = { fire: !!craft.fire, targetId: craft.targetId };
            if (state.modes[craft.id] && state.modes[craft.id] !== craft.mode && calls[craft.mode])
                event = craft.mode;
            else if (previous && craft.mode === 'attack') {
                if (craft.fire && !previous.fire)
                    event = 'firing';
                else if (craft.targetId && previous.targetId !== craft.targetId)
                    event = 'target';
            }
            if (event && state.time - (state.spoken[craft.id] === undefined ? -Infinity : state.spoken[craft.id]) >= 10)
                candidates.push({ craft: craft, event: event });
        });
        state.activity = activity;
        state.modes = modes;
        Object.keys(state.spoken).forEach(function (id) {
            if (!(id in modes))
                delete state.spoken[id];
        });
        var helper = responder(state, living);
        if (helper)
            candidates.push({ craft: helper, event: 'support' });
        const exchange = state.emotionalConversation;
        if (exchange) {
            const caller = living.find(function (c) {
                return c.id === exchange.caller;
            });
            if (!caller || caller.team !== 'ally' || state.time > exchange.expires)
                state.emotionalConversation = null;
            else {
                var listener = living.find(function (c) {
                    var e = state.emotions[c.id];
                    return c.id !== caller.id && c.team === caller.team && e && emotionStrength[e.current] < 3;
                });
                if (listener)
                    candidates.push({ craft: listener, event: 'emotionalReply', texts: emotionalReplies[exchange.emotion] });
            }
        }
        const acknowledgment = state.acknowledgment;
        if (acknowledgment) {
            var original = living.find(function (c) { return c.id === acknowledgment.caller && c.team === 'ally'; });
            var answering = living.some(function (c) { return c.id === acknowledgment.responder && c.team === 'ally'; });
            if (!original || !answering || acknowledgment.wave !== combat.wave || state.time > acknowledgment.expires)
                state.acknowledgment = null;
            else
                candidates.push({ craft: original, event: 'acknowledgment', texts: dialogue.acknowledgments[acknowledgment.kind] });
        }
        living.forEach(function (c) {
            var e = state.emotions[c.id];
            if (e.current !== 'calm' && e.announced !== e.current)
                candidates.push({ craft: c, event: 'emotion', texts: emotionalLines[e.current] });
            if (e.current === 'calm')
                e.announced = null;
        });
        // Player-facing rival broadcasts get an independent opportunity, rather
        // than waiting for the ambient timer that every allied line resets.
        if(state.time>=10 && state.time-(state.activitySpoken.taunt===undefined?-Infinity:state.activitySpoken.taunt)>=20){
            living.filter(function(c){
                if (c.team !== 'enemy') return false;
                if (c.targetId === 'player') return true;
                // Team dogfights select NPC opponents, so a player lock is not required.
                return mission.encounter.kind === 'furball' && c.mode === 'attack' && living.some(function(target){
                    return target.id === c.targetId && target.team === 'ally';
                });
            }).forEach(function(c){
                candidates.push({craft:c,event:'taunt',texts:lines.enemy});
            });
        }
        if (busy || combat.dead || state.quiet < state.quietGap)
            return null;
        var kind = /** @type {string | undefined} */ (undefined), choices = /** @type {Choices | undefined} */ (undefined), craft = /** @type {Speaker | undefined} */ (undefined), selected = /** @type {Candidate | undefined} */ (undefined);
        // Frequent events share airtime limits; attack and firing describe the same activity.
        var counts = /** @type {Record<string, number>} */ ({});
        state.recentActivities.forEach(function (kind) {
            counts[kind] = (counts[kind] || 0) + 1;
        });
        candidates = candidates.filter(function (entry) {
            // Rivals can taunt and react to hits, but never broadcast flight coordination.
            if (entry.craft.team !== 'ally' && entry.event!=='taunt' && entry.event!=='hit')
                return false;
            if (/^(support|emotionalReply|acknowledgment)$/.test(entry.event))
                return true;
            if (state.time - (state.spoken[entry.craft.id] === undefined ? -Infinity : state.spoken[entry.craft.id]) < 10)
                return false;
            var category = activityKind(entry.event), last = state.activitySpoken[category];
            return last === undefined || state.time - last >= (category === 'contact' ? 18 : category === 'hit' ? 12 : 4) + (counts[category] || 0) * 3;
        });
        if (candidates.length) {
            var urgent = candidates.filter(function (e) {
                return e.event === 'hit' || e.event === 'loss' || e.event === 'shield' || e.event === 'nearPlayer' || e.event === 'damaged' || e.event === 'evade' || e.event === 'break';
            });
            var replies = candidates.filter(function (e) {
                return /^(support|emotionalReply|acknowledgment)$/.test(e.event);
            });
            var pool = replies.length ? replies : urgent.length ? urgent : candidates;
            // Choose an activity before a pilot: eight shooters get no more weight than one recovering craft.
            var categories = /** @type {string[]} */ ([]);
            pool.forEach(function (entry) {
                var category = activityKind(entry.event);
                if (categories.indexOf(category) < 0)
                    categories.push(category);
            });
            var weights = categories.map(function (category) {
                var playerDirected=/^(taunt|contact|closing|nearPlayer|shield|streak)$/.test(category);
                return (playerDirected?6:1) / Math.pow(1 + (counts[category] || 0), 2);
            });
            var draw = random() * weights.reduce(function (sum, weight) {
                return sum + weight;
            }, 0), chosen = categories[categories.length - 1];
            for (var i = 0; i < categories.length; i++) {
                draw -= weights[i];
                if (draw <= 0) {
                    chosen = categories[i];
                    break;
                }
            }
            pool = pool.filter(function (entry) {
                return activityKind(entry.event) === chosen;
            });
            var otherSpeakers = pool.filter(function (e) {
                return e.craft.id !== state.lastCraft;
            });
            if (otherSpeakers.length)
                pool = otherSpeakers;
            selected = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
            craft = selected.craft;
            kind = craft.team === 'ally' ? 'ally' : 'enemy';
            if (selected.contactId) {
                var contactId = selected.contactId, contactTarget = living.find(function (e) {
                    return e.id === contactId;
                }), freshContact = contactTarget ? contactData(player, contactTarget.pose.eye) : null;
                if (!freshContact)
                    return null;
                selected.texts = compose('contact', freshContact, combat.mode);
                state.contactReports[selected.contactId] = { time: state.time, sector: freshContact.sector, range: freshContact.range };
            }
            const selectedCraft = selected.craft;
            if (selected.event === 'loss') {
                selected.data = selected.data || {};
                selected.data.count = (combat.enemies || []).filter(function (e) {
                    return e.hp <= 0 && (e.team || 'enemy') === (selectedCraft.team || 'enemy');
                }).length;
                selected.texts = compose('loss', selected.data);
            }
            if (selected.event === 'outnumbered') {
                selected.texts = compose('outnumbered', { friends: living.filter(function (e) {
                        return e.team === 'ally';
                    }).length, enemies: living.filter(function (e) {
                        return e.team !== 'ally';
                    }).length });
            }
            choices = selected.texts || (selected.event === 'evade' && onTail(craft, living) ? ["He's on my tail! Cover me!"] : calls[selected.event]);
            var deliveryFeeling = state.emotions[craft.id];
            if (deliveryFeeling && deliveryFeeling.current !== 'calm' && /^(attack|firing|target|recover|reposition)$/.test(selected.event))
                choices = emotionalLines[deliveryFeeling.current];
            state.facts = state.facts.filter(function (entry) {
                return entry !== selected;
            });
            state.spoken[craft.id] = state.time;
            state.activitySpoken[chosen] = state.time;
            state.recentActivities.push(chosen);
            if (state.recentActivities.length > 8)
                state.recentActivities.shift();
        }
        else if (state.wait > 0)
            return null;
        var enemies = living.some(function (e) {
            return e.team !== 'ally';
        });
        var allies = living.some(function (e) {
            return e.team === 'ally';
        });
        var danger = combat.enabled && combat.hull < 40;
        kind = kind || (danger && !state.danger ? 'danger' : enemies && random() < 0.5 ? 'enemy' : allies ? 'ally' : 'range');
        state.danger = danger;
        choices = choices || lines[kind];
        var addressee = /** @type {Craft | null} */ (null), namedTexts = /** @type {string[]} */ ([]);
        {
            // Ambient banter belongs to a real pilot too, with that pilot's
            // stable portrait and voice rather than an anonymous channel voice.
            if (mission.comms.ambientCast && !craft && (kind === 'ally' || kind === 'enemy')) {
                var speakers = living.filter(function (c) { return c.team === kind && c.id !== state.lastCraft; });
                if (!speakers.length) speakers = living.filter(function (c) { return c.team === kind; });
                if (speakers.length) {
                    craft = speakers[Math.min(speakers.length - 1, Math.floor(random() * speakers.length))];
                    selected = { craft: craft, event: kind };
                    state.spoken[craft.id] = state.time;
                }
            }
            var missionEvent = selected ? selected.event : kind;
            if (missionEvent === 'emotion' && craft && state.emotions[craft.id]) missionEvent = state.emotions[craft.id].current;
            choices = mission.comms.calls[missionEvent] || (missionEvent==='taunt'?(mission.comms.calls.enemy||choices):choices);
            var addressedChoices=/** @type {Choices} */(choices.map(function(text,index){return DW.flightMissions.address(text,index,kind==='enemy',mission);}));
            addressedChoices.templateKeys=(choices.templateKeys||choices).map(function(text,index){return DW.flightMissions.address(text,index,kind==='enemy',mission);});
            choices=addressedChoices;
            var addressedId = missionEvent === 'support' && state.conversation ? state.conversation.caller :
                missionEvent === 'emotionalReply' && state.emotionalConversation ? state.emotionalConversation.caller :
                missionEvent === 'acknowledgment' && state.acknowledgment ? state.acknowledgment.responder : null;
            if (addressedId) addressee = living.find(function (c) { return c.id === addressedId; }) || null;
            else if (mission.comms.named[missionEvent] && /^(ally|enemy|evade|damaged|afraid|panicked)$/.test(missionEvent)) {
                const speaker = craft;
                var neighbors = living.filter(function (c) {
                    return c.id !== (speaker && speaker.id) && (missionEvent === 'enemy' ? c.team !== (speaker ? speaker.team : 'enemy') : c.team === (speaker ? speaker.team : 'ally'));
                });
                if (speaker && /^(evade|damaged|afraid|panicked)$/.test(missionEvent)) {
                    const attacker = living.find(function (c) { return c.team !== speaker.team && c.targetId === speaker.id && c.mode === 'attack'; });
                    var helping = attacker && neighbors.filter(function (c) { return c.mode === 'attack' && c.targetId === attacker.id; });
                    if (helping && helping.length) neighbors = helping;
                }
                if (neighbors.length) addressee = neighbors[Math.min(neighbors.length - 1, Math.floor(random() * neighbors.length))];
            }
            var variants = addressee && mission.comms.named[missionEvent];
            if (variants) {
                namedTexts = variants.map(function (template) { return template.replace(/\{pilot\}/g, callsign(addressee)); });
                var namedChoices = /** @type {Choices} */ (namedTexts.concat(choices));
                namedChoices.templateKeys = variants.concat(choices.templateKeys || choices);
                choices = namedChoices;
            }
        }
        var text = pickLine(state, choices, random);
        var replyTo = addressee && namedTexts.indexOf(text) >= 0 ? addressee.id : /** @type {string | null} */ (null);
        var feeling = craft && state.emotions[craft.id];
        if (craft && selected && selected.event === 'acknowledgment' && state.acknowledgment) {
            replyTo = state.acknowledgment.responder;
            state.acknowledgment = null;
        }
        if (craft && selected && selected.event === 'emotionalReply' && state.emotionalConversation) {
            replyTo = state.emotionalConversation.caller;
            state.acknowledgment = { caller: replyTo, responder: craft.id, kind: 'emotional', expires: state.time + 5, wave: combat.wave };
            state.emotionalConversation = null;
        }
        else if (craft && selected && feeling && feeling.current !== 'calm' && /^(emotion|attack|firing|target|recover|reposition|damaged|escaped|loss|outnumbered|missed)$/.test(selected.event)) {
            feeling.announced = feeling.current;
            if (emotionalReplies[feeling.current] && !state.emotionalConversation)
                state.emotionalConversation = { caller: craft.id, emotion: feeling.current, expires: state.time + 5 };
        }
        if (craft && selected && selected.event === 'support' && state.conversation) {
            replyTo = state.conversation.caller;
            state.acknowledgment = { caller: replyTo, responder: craft.id, kind: 'support', expires: state.time + 5, wave: combat.wave };
            state.conversation = null;
        }
        else if (craft && !state.conversation && /cover me|need a hand|little help|get this (?:fighter|guy)|on my tail/i.test(text)) {
            const requestingCraft = craft;
            var threats = living.filter(function (e) {
                return e.team !== requestingCraft.team && e.targetId === requestingCraft.id && e.mode === 'attack';
            });
            if (threats.length)
                state.conversation = { caller: craft.id, threat: threats[0].id, expires: state.time + 5 };
        }
        state.last = text;
        state.serial++;
        state.quiet = 0;
        state.quietGap = 2 + random() * 1.7;
        state.lastCraft = craft ? craft.id : null;
        state.wait = 18 + random() * 12;
        /** @type {Line} */
        var line = { voiceSettings: pilotVoice(craft), radioSeed: 0, text: text, speaker: kind === 'enemy' ? 'BANDIT / OPEN CHANNEL' : kind === 'ally' ? 'WING / FLIGHT CHANNEL' : 'CONTROL / RANGE CHANNEL', voice: kind === 'enemy' ? 'Pirate' : kind === 'ally' ? 'Scout' : 'Navigator', hostile: kind === 'enemy', seed: state.serial + 37 };
        if (craft && selected) {
            line.speaker = (craft.team === 'ally' ? mission.teams.ally.radio+' ' : mission.teams.enemy.radio+' ') + callsign(craft) + ' / ' + (selected.event === 'support' ? 'COVER' : selected.event === 'emotionalReply' ? 'REASSURANCE' : selected.event === 'emotion' ? (feeling ? feeling.current : 'calm').toUpperCase() : selected.event.toUpperCase());
            line.craftId = craft.id;
            line.mode = craft.mode;
            line.event = selected.event;
            if (craft.id === 'control')
                line.speaker = 'CONTROL / RANGE CHANNEL';
            if (replyTo)
                line.replyTo = replyTo;
        }
        line.portraitIndex = craft && craft.id !== 'control' && typeof craft.index === 'number' ? craft.index : -1;
        line.voiceSettings = pilotVoice(craft);
        line.seed = line.voiceSettings.seed;
        line.radioSeed = state.serial * 7919 + line.seed;
        if (feeling && selected)
            line.emotion = { current: selected.event === 'emotionalReply' ? 'reassuring' : feeling.current, intensity: selected.event === 'emotionalReply' ? 0.8 : feeling.intensity, stress: feeling.stress };
        return line;
    }
    DW.flightComms = { create: create, step: step, mount: mount, compose: compose, numberWords: numberWords, contactData: contactData, pickLine: pickLine, voiceOptions: voiceOptions, pilotVoice: pilotVoice };
}());
