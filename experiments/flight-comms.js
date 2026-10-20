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
    /** @type {Record<string, string[]>} */
    var ohioCalls = {
    "support": [
        "Ope, let me get that fighter off you.",
        "Got your back. That's the neighborly thing.",
        "Hang tight, bud. Bringing the jumper cables.",
        "I'm on your six like salt on a county road.",
        "Scooch over a smidge. I'll take the one behind ya.",
        "Nobody gets left at the rest stop. Coming to help.",
        "Got your tail. You can pay me back in pierogies.",
        "Hold your horses. Cover's coming.",
        "I'll get this one. You get the door on the way out.",
        "Stay with me, bud. We carpooled here."
    ],
    "firing": [
        "Ope. Just gonna squeeze a few rounds past ya.",
        "Sending a little lake effect your way.",
        "Guns are hotter than a seat belt buckle in July.",
        "Little extra stadium mustard on this one.",
        "These rounds got more zip than Grippo's.",
        "Taking the shot. Tell your folks I says hi.",
        "Serving it Cincinnati style. With everything on it.",
        "Guns on. This ain't my first county fair.",
        "Here comes the salt truck, bud.",
        "Putting a little chili on that spaghetti."
    ],
    "target": [
        "Next exit: that fighter.",
        "Taking the scenic route to your six.",
        "New target. Same orange barrels.",
        "That one's wandering like a buggy on a back road.",
        "Got another one. Must be a two-for-one at Meijer.",
        "Changing lanes. Used my blinker and everything.",
        "Found the next fella holding up the left lane.",
        "Well, look what came off the turnpike.",
        "Picking up that one past the water tower.",
        "New contact. Looks like trouble in sensible shoes."
    ],
    "attack": [
        "Welcome to the turnpike. Exact change only.",
        "Coming in hot like a stadium mustard packet.",
        "You've had the passing lane long enough, bud.",
        "Gonna ride your bumper all the way to Toledo.",
        "Coming around faster than a Cedar Point coaster.",
        "I'm on ya like humidity in a church basement.",
        "This lane ends right here, pal.",
        "Time to find out if your warranty covers Ohio.",
        "Here comes the part they don't put on the welcome sign.",
        "Hate to be a bother. Gonna shoot at ya now."
    ],
    "evade": [
        "Ope! Little help over here! Cover me!",
        "This is worse than orange barrel season! Need a hand!",
        "Got a fella on my tail like a state trooper. Cover me!",
        "I'm getting rattled like a shopping cart at Marc's! Need a hand!",
        "More holes than the road after the thaw! Cover me!",
        "This guy's closer than family at a fish fry. Need a hand!",
        "Ope, ope, ope! Get this fighter off me!",
        "I'm sliding around like black ice on I-seventy-one. Cover me!",
        "Bud, I'm getting worked like a snowblower in February! Cover me!",
        "Need a hand! This one's stuck to me like lake-effect snow!"
    ],
    "break": [
        "Just gonna scooch right out of here.",
        "Taking the next exit!",
        "Welp. Gonna head out.",
        "Ope. This is my turn. Breaking off!",
        "Making like a pothole. Opening up some space.",
        "Backing out like Dad with the boat trailer.",
        "Got a little squirrely there. Pulling clear.",
        "That got spicy. And I eat Cincinnati chili.",
        "Gonna duck out before this becomes a whole thing.",
        "Heading out. For real this time. No driveway goodbye."
    ],
    "recover": [
        "Back again. Midwest goodbye took a minute.",
        "Still here. Like road construction.",
        "Had to go around the block. Back in it.",
        "Little duct tape, good as new.",
        "Shook it off like snow off a work boot.",
        "Well, that wasn't too bad. Coulda been worse.",
        "Back on the road. Salt truck's behind me.",
        "We're cooking with gas now, bud.",
        "Had a little lie-down in the corn. I'm good.",
        "Coming back like winter in the middle of April."
    ],
    "reposition": [
        "Taking the long way round the corn.",
        "Meet you by the water tower.",
        "Gonna hang a left where the old barn used to be.",
        "Taking the back roads. Less traffic.",
        "Looping around like I'm looking for parking at the fair.",
        "Just over yonder. Setting up a pass.",
        "Gonna sneak around the outside. Real neighborly-like.",
        "Taking the detour around the detour.",
        "Go past the grain elevator. If you hit space, too far.",
        "Getting situated. Takes a minute in these boots."
    ],
    "enemy": [
        "Your GPS says Ohio. Your GPS is correct.",
        "There is no detour around Ohio.",
        "You're colder than a metal bleacher in Cleveland in January.",
        "Colder than Lake Erie in February, bud.",
        "That's as cold as a Browns tailgate before sunrise.",
        "Your aim's colder than a scraper left in the trunk overnight.",
        "You couldn't hit a pothole on the turnpike.",
        "I've seen faster merges behind a combine.",
        "Your flight plan's got more holes than spring pavement.",
        "Ope. Looks like you took the wrong exit.",
        "You're about as threatening as a goose. Actually, less.",
        "All that flying and you still can't get out of Ohio.",
        "This dogfight could've been a euchre game.",
        "You fly like you're hauling a crockpot with no lid.",
        "Your guns are colder than a detached garage in Ashtabula.",
        "You're getting passed by a fella in work boots."
    ],
    "ally": [
        "If we survive, diner pie is on me.",
        "Space is just the Midwest with fewer exits.",
        "Brought enough buckeyes for everybody. The candy kind.",
        "Tell your folks I says hi. After the shooting.",
        "Welp. Could use a pop about now.",
        "We should get together sometime. I mean it this time.",
        "It's not the vacuum. It's the wind chill.",
        "I packed a casserole. Didn't know what kinda mission this was.",
        "That planet's all Ohio. Still somehow an hour from Columbus.",
        "Ope, sorry. Didn't mean to fly through your whole situation.",
        "Anybody else smell somebody's brakes?",
        "Lake-effect lasers. That's how they get ya.",
        "Cold as a folding chair at a January tailgate out here.",
        "I'm fine. Just gotta slap my knees and say welp first.",
        "This would all go smoother with a church-basement coffee.",
        "We doing euchre after this, or what?",
        "Put the leftovers in an ice cream tub. That's how you know it's home.",
        "Anybody got a scraper? My canopy's colder than a bus stop in Akron.",
        "Ope. Hang on. My good gloves are in the other ship.",
        "If ya need anything, holler. Unless it's directions out of Ohio.",
        "Came for the stars. Stayed because the ramp was closed.",
        "This weather's about as settled as a folding table at the fish fry.",
        "You don't like the space weather, give it twenty minutes.",
        "Cold as the steering wheel before the heater kicks in.",
        "Tell ya what, this beats standing in line at the BMV.",
        "Might be all Ohio, but I still brought an emergency blanket."
    ],
    "range": [
        "You are now entering Ohio. You were also previously in Ohio.",
        "Forecast: lake effect lasers.",
        "Watch for deer. Yes, even here.",
        "Road's closed. Other road's Ohio too.",
        "Bridge may ice before rest of universe.",
        "It's all Ohio. Always has been. Please drive friendly.",
        "Visibility's good. Construction for the next eternity.",
        "Keep right except to pass. That includes spacecraft.",
        "Welcome to Ohio. Mind the orange barrels.",
        "Welp. Radar says more Ohio."
    ],
    "danger": [
        "Hull is looking rough, bud. Time to head home.",
        "That hull's thinner than the ice Dad said was probably fine.",
        "Ope. She's held together with hope and road salt. Break away.",
        "You're rattling like a furnace in an old duplex. Pull clear.",
        "Bud, that's not a check-engine light you can ignore. Break off.",
        "Go on, get outta there. We'll hold the door."
    ],
    "damaged": [
        "Ope! That's gonna need more than duct tape.",
        "Well, there goes the security deposit.",
        "Got dinged worse than a door in a grocery parking lot.",
        "Little body damage. We'll buff 'er out.",
        "That hit like a pothole full of February.",
        "She's making a noise Dad would call expensive."
    ],
    "escaped": [
        "Clear! Like the freeway during the game.",
        "Welp, that got my blood pressure going.",
        "Got out by the skin of my snow tires.",
        "I'm clear. Somebody put the kettle on.",
        "Ope. Thought I was gonna have to call my cousin with the tow truck.",
        "Still here. Stubborn as a frozen garage door."
    ],
    "missed": [
        "Aw, beans. Had that lined up.",
        "Missed by a country mile. The long kind.",
        "Ope. Just aerating the lawn out here.",
        "That shot went clear to Youngstown.",
        "Couldn't hit the broad side of the grain elevator today.",
        "Well. We'll just go around again, then."
    ],
    "confused": [
        "Hang on. Which way's the lake?",
        "Where'd everybody go? I was following the salt truck.",
        "I think I turned where the barn used to be.",
        "Now is that our Ohio or their Ohio?",
        "Directions said past the corn. It's all corn."
    ],
    "panicked": [
        "Ope, ope, ope! This is a whole thing now!",
        "They're everywhere like geese in a parking lot!",
        "This is bad. This is gas-station coffee bad!",
        "I'm fishtailing like a pickup on summer tires!",
        "Somebody get me outta this interchange!"
    ],
    "afraid": [
        "Bud, I could really use a hand here!",
        "I'm shaking like the furnace in February!",
        "This is colder than being locked out in your slippers!",
        "Don't leave me out here like a lawn chair in January!",
        "Little help! This ain't looking too good!"
    ],
    "frustrated": [
        "Oh, for crying out loud!",
        "Would ya just hold still a minute?",
        "This is taking longer than the road work on my exit!",
        "I'm about one missed shot from calling your mother!",
        "Aw, jeez. Had it lined up and everything!"
    ],
    "confident": [
        "We got this. Been through worse winters.",
        "Steady as a crockpot on the floorboard.",
        "We're doing all right, bud. All right.",
        "Keep 'er moving. Like shoveling the driveway.",
        "I didn't put on my good flannel to lose."
    ],
    "relieved": [
        "Welp. Coulda been a whole lot worse.",
        "Oh, jeez. I need to sit on the porch a minute.",
        "Still here. Like the casserole dish nobody picked up.",
        "That's better. Like taking your wet boots off.",
        "I'm clear. Somebody owes me a pop."
    ]
};
    // Named variants are templates so a different addressee does not defeat
    // shared repeat avoidance. Names are resolved from living contacts at delivery.
    /** @type {Record<string, string[]>} */
    var ohioNamedCalls = {
    "ally": [
        "Ope, sorry, {pilot}. Just gonna squeeze past ya.",
        "{pilot}, you bringing that casserole to the fish fry again?",
        "Tell your folks I says hi, {pilot}. After the shooting.",
        "{pilot}, we still doing euchre after this?",
        "Save me a seat at the diner, {pilot}.",
        "{pilot}, your good gloves are still in my ship.",
        "If we make it home, {pilot}, pie's on me.",
        "{pilot}, that's my Tupperware you've got. Keep the leftovers.",
        "You fly like you carry a crockpot with no lid, {pilot}.",
        "{pilot}, remind me to give you your jumper cables back."
    ],
    "enemy": [
        "{pilot}, I know your mother. Don't make me call her.",
        "Ope, {pilot}. Didn't know we were doing THIS at the fish fry.",
        "{pilot}, your aim's colder than a garage in Ashtabula.",
        "I've seen you park better than this, {pilot}.",
        "{pilot}, we're still on for euchre. After I shoot you down.",
        "You can keep the casserole dish, {pilot}. I'm keeping this airspace.",
        "{pilot}, quit hogging the passing lane.",
        "You missed, {pilot}. Just like the turn for the church basement."
    ],
    "evade": [
        "{pilot}, get this guy off me!",
        "Ope, {pilot}, need a hand over here!",
        "{pilot}, cover me! This fella won't take a hint.",
        "{pilot}, he's on my tail like a trooper on the turnpike!",
        "Little help, {pilot}! I still got your casserole dish!",
        "{pilot}, get this fighter off me! I'll buy the perch dinner!",
        "Cover me, {pilot}! This is worse than black ice!",
        "{pilot}, need a hand! We carpooled here!"
    ],
    "damaged": [
        "{pilot}, cover me! She's rattling like the old furnace!",
        "Ope, {pilot}, need a hand! That one went clean through!",
        "{pilot}, get this guy off me! I'm running outta duct tape!",
        "{pilot}, cover me! My check-engine light means it this time!"
    ],
    "support": [
        "I've got him, {pilot}. You just keep 'er moving.",
        "Ope, hang tight, {pilot}. I'll get this fella off ya.",
        "I'm on your attacker, {pilot}. You owe me a perch dinner.",
        "Got your back, {pilot}. Like at the fish fry.",
        "Break clear, {pilot}. I'll hold the door.",
        "I'm on him, {pilot}. Nobody gets left at the rest stop.",
        "{pilot}, I'm covering you. Don't spill that crockpot.",
        "Got him, {pilot}. Save me some pierogies."
    ],
    "acknowledgment": [
        "Thanks, {pilot}. Fish fry's on me.",
        "Copy, {pilot}. Staying on the move.",
        "You saved my bacon, {pilot}. The good thick-cut stuff.",
        "Thanks, {pilot}. I'll bring your Tupperware back.",
        "All right, {pilot}. Owe ya one.",
        "Thanks, {pilot}. Your folks raised you right.",
        "Copy that, {pilot}. Coffee's on me.",
        "Much obliged, {pilot}. I'll get the door next time."
    ],
    "emotionalReply": [
        "Breathe, {pilot}. Like we practiced before the euchre tournament.",
        "Still here with ya, {pilot}. One fella at a time.",
        "{pilot}, you got through that blizzard. You'll get through this.",
        "Easy, {pilot}. We'll make it back for the fish fry.",
        "You're all right, {pilot}. Follow my voice.",
        "{pilot}, hang in there. Your folks are counting on us."
    ],
    "recover": [
        "Back in it, {pilot}. Had to say goodbye to everybody first.",
        "Still here, {pilot}. Like orange barrels.",
        "Coming around, {pilot}. Save me a dance.",
        "I'm clear, {pilot}. Put the kettle on.",
        "Back on your wing, {pilot}. Little duct tape did the trick.",
        "{pilot}, you ain't getting rid of me that easy."
    ],
    "reposition": [
        "Ope, sorry, {pilot}. Just scooching around ya.",
        "Taking the back roads, {pilot}. Meet ya by the water tower.",
        "{pilot}, I'm going around where the old barn used to be.",
        "Give me a smidge of room, {pilot}.",
        "Coming around the outside, {pilot}. Used my blinker.",
        "{pilot}, I'll meet ya past the grain elevator."
    ],
    "break": [
        "Breaking off, {pilot}. This is my exit!",
        "Welp, {pilot}, gonna head out. For real this time.",
        "Cover me, {pilot}. Got a little squirrely there.",
        "{pilot}, I'm taking the detour around the detour."
    ],
    "firing": [
        "Watch your elbows, {pilot}. Sending a few rounds past ya.",
        "{pilot}, putting a little stadium mustard on this one.",
        "Taking the shot, {pilot}. Hold my pop.",
        "Here comes the salt truck, {pilot}."
    ],
    "attack": [
        "Keep him busy, {pilot}. I'm coming round.",
        "{pilot}, time to show this fella how we merge.",
        "Going in, {pilot}. Keep the coffee warm.",
        "{pilot}, I didn't wear my good flannel to lose."
    ],
    "near": [
        "{pilot}, that about took my earflaps off!",
        "Ope, {pilot}. Little close for church clothes.",
        "{pilot}, I felt that one in my good knee.",
        "Almost needed clean long johns there, {pilot}."
    ],
    "missed": [
        "Aw, beans, {pilot}. Had that lined up.",
        "{pilot}, pretend ya didn't see that.",
        "Missed by a country mile, {pilot}. The long kind.",
        "{pilot}, that shot went clear to Youngstown."
    ],
    "afraid": [
        "{pilot}, need a hand here, bud!",
        "Don't leave me out here, {pilot}!",
        "{pilot}, get this guy off me!"
    ],
    "panicked": [
        "{pilot}, cover me! This is a whole thing now!",
        "Ope, {pilot}! Need a hand! They're everywhere!",
        "{pilot}, get this fighter off me! Please!"
    ],
    "confused": [
        "{pilot}, which way's the lake?",
        "{pilot}, are we past the barn or before the barn?",
        "Hang on, {pilot}. Is that our Ohio or their Ohio?"
    ],
    "relieved": [
        "Still here, {pilot}. Coulda been worse.",
        "Welp, {pilot}. I need to sit on the porch a minute.",
        "{pilot}, somebody owes us a pop.",
        "Made it, {pilot}. Like the old snowblower. Stubborn."
    ]
};
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
                emotion.stress = Math.min(1, emotion.stress + 0.08);
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
                    emotion.stress = Math.min(1, emotion.stress + dt * (pursuers > 1 ? 0.1 : 0.06));
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
        return craft ? DW.training.callsign(craft) : 'pilot';
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
            var entry = /** @type {Candidate} */ ({ craft: craft, event: event, data: data || {}, texts: compose(event, data || {}) });
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
                if (distance > 0 && craft.pose.velocity)
                    closing = -delta.reduce(function (sum, v, i) {
                        return sum + v * (craft.pose.velocity[i] - player.velocity[i]);
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
                return e.id === entry.craft.id;
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
        dt = Math.max(0, dt);
        state.time += dt;
        if (combat.enabled && combat.mode === 'ohio' && combat.ohioIntro < 3) {
            if (busy || combat.time < 1 || combat.enemies.length < 9) return null;
            if (combat.ohioIntro === 2) { combat.ohioIntro = 3; state.wait = 8; return null; }
            var introIndex = combat.ohioIntro++;
            var introCraft = combat.enemies[introIndex === 0 ? 0 : 8];
            return {text: introIndex === 0 ? "It's all Ohio?" : 'Always has been.', speaker: DW.training.callsign(introCraft) + ' / OPEN CHANNEL',
                voice: 'Scout', hostile: introIndex === 1, seed: 101 + introIndex * 37, radioSeed: 7919 + introIndex,
                voiceSettings: pilotVoice(introCraft), portraitIndex: introCraft.index, craftId: introCraft.id, event: 'ohioIntro'};
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
        if (busy || combat.dead || state.quiet < state.quietGap)
            return null;
        var kind = /** @type {string | undefined} */ (undefined), choices = /** @type {Choices | undefined} */ (undefined), craft = /** @type {Speaker | undefined} */ (undefined), selected = /** @type {Candidate | undefined} */ (undefined);
        // Frequent events share airtime limits; attack and firing describe the same activity.
        var counts = /** @type {Record<string, number>} */ ({});
        state.recentActivities.forEach(function (kind) {
            counts[kind] = (counts[kind] || 0) + 1;
        });
        candidates = candidates.filter(function (entry) {
            // Enemy broadcasts use only the ambient taunt pool, never flight coordination.
            if (entry.craft.team !== 'ally')
                return false;
            if (/^(support|emotionalReply|acknowledgment)$/.test(entry.event))
                return true;
            if (state.time - (state.spoken[entry.craft.id] === undefined ? -Infinity : state.spoken[entry.craft.id]) < 10)
                return false;
            var category = activityKind(entry.event), last = state.activitySpoken[category];
            return last === undefined || state.time - last >= (category === 'contact' ? 18 : 4) + (counts[category] || 0) * 3;
        });
        if (candidates.length) {
            var urgent = candidates.filter(function (e) {
                return e.event === 'loss' || e.event === 'shield' || e.event === 'damaged' || e.event === 'evade' || e.event === 'break';
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
                return 1 / Math.pow(1 + (counts[category] || 0), 2);
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
                selected.texts = compose('contact', freshContact);
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
        if (combat.mode === 'ohio') {
            // Ambient banter belongs to a real pilot too, with that pilot's
            // stable portrait and voice rather than an anonymous channel voice.
            if (!craft && (kind === 'ally' || kind === 'enemy')) {
                var speakers = living.filter(function (c) { return c.team === kind && c.id !== state.lastCraft; });
                if (!speakers.length) speakers = living.filter(function (c) { return c.team === kind; });
                if (speakers.length) {
                    craft = speakers[Math.min(speakers.length - 1, Math.floor(random() * speakers.length))];
                    selected = { craft: craft, event: kind };
                    state.spoken[craft.id] = state.time;
                }
            }
            var ohioEvent = selected ? selected.event : kind;
            if (ohioEvent === 'emotion' && craft && state.emotions[craft.id]) ohioEvent = state.emotions[craft.id].current;
            choices = ohioCalls[ohioEvent] || choices;
            var addressedId = ohioEvent === 'support' && state.conversation ? state.conversation.caller :
                ohioEvent === 'emotionalReply' && state.emotionalConversation ? state.emotionalConversation.caller :
                ohioEvent === 'acknowledgment' && state.acknowledgment ? state.acknowledgment.responder : null;
            if (addressedId) addressee = living.find(function (c) { return c.id === addressedId; }) || null;
            else if (ohioNamedCalls[ohioEvent]) {
                const speaker = craft;
                var neighbors = living.filter(function (c) {
                    return c.id !== (speaker && speaker.id) && (kind === 'enemy' ? c.team !== 'enemy' : c.team === 'ally');
                });
                if (speaker && /^(evade|damaged|afraid|panicked)$/.test(ohioEvent)) {
                    const attacker = living.find(function (c) { return c.team !== speaker.team && c.targetId === speaker.id && c.mode === 'attack'; });
                    var helping = attacker && neighbors.filter(function (c) { return c.mode === 'attack' && c.targetId === attacker.id; });
                    if (helping && helping.length) neighbors = helping;
                }
                if (neighbors.length) addressee = neighbors[Math.min(neighbors.length - 1, Math.floor(random() * neighbors.length))];
            }
            var variants = addressee && ohioNamedCalls[ohioEvent];
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
            line.speaker = (craft.team === 'ally' ? 'WING ' : 'BANDIT ') + callsign(craft) + ' / ' + (selected.event === 'support' ? 'COVER' : selected.event === 'emotionalReply' ? 'REASSURANCE' : selected.event === 'emotion' ? (feeling ? feeling.current : 'calm').toUpperCase() : selected.event.toUpperCase());
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
