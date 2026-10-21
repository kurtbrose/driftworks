(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').Identity} Identity */
    /** @typedef {import('./types').Voice} Voice */
    /** @typedef {import('./types').VoiceNumberKey} VoiceNumberKey */
    /** @typedef {import('./types').Feeling} Feeling */
    /** @typedef {import('./types').LineData} LineData */
    /** @typedef {import('./types').Choices} Choices */
    /** @typedef {import('./types').CommsState} CommsState */
    /** @typedef {import('./types').Pose} Pose */
    /** @typedef {import('./types').Vector} Vector */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    /** @type {Record<string, string[]>} */
    var lines = {
        range: ['Range is clear. Enjoy the view, pilot.', 'Keep your turns smooth. We are watching from control.', 'All systems look good from here.'],
        ally: ['On your wing. Keep them busy!', 'Nice flying. Leave a few for the rest of us.', 'Stay loose, pilot. We have your back.'],
        enemy: ['That all you have, pilot?', 'Come closer. My guns are getting lonely.', 'You fly like a cargo hauler!'],
        danger: ['Shields are thin. Break away and regroup!', 'Watch your hull, pilot. Keep moving.']
    };
    /** @type {Record<string, string[]>} */
    var calls = {
        support: ["I've got him. Keep moving!", 'On your attacker. Break clear!', 'Covering you. Stay loose!'],
        firing: ['Taking the shot!', 'Guns on target!', 'Stay on him!'],
        target: ['Switching targets.', 'Picking up another fighter.', 'New target. Moving in.'],
        attack: ["I've got him!", 'Moving in. Keep him busy!', 'I have a shot. Going in!'],
        evade: ['Taking fire! Cover me!', 'Get this fighter off me!', 'Under pressure. Need a hand!'],
        break: ['Breaking off!', 'Too close. Pulling away!', 'Cover me. Breaking clear!'],
        recover: ['Coming around for another pass.', 'Regrouping. Keep them occupied!', 'Getting back in the fight.'],
        reposition: ['Moving into position. Cover me.', 'Swinging wide. Hold them here!', 'Setting up another run.']
    };
    /** @type {Record<string, string[]>} */
    var emotionalLines = {
        confused: ['Where is everybody?', "What's happening?", "Which one's ours?"],
        panicked: ["They're everywhere!", "There's too many!", "I can't get away!"],
        afraid: ['Help me!', "I can't shake him!", "I'm hit! I'm hit!"],
        frustrated: ['Come on!', 'Just hold still!', 'I had him!'],
        confident: ["We can do this.", 'One more.', 'Stay with me.'],
        relieved: ["I'm clear!", 'Oh, thank God.', "We're still here."]
    };
    /** @type {Record<string, string[]>} */
    var emotionalReplies = {
        confused: ["I'm here! I'm here!", 'Stay with my voice. We are together.'],
        panicked: ["Keep your cool. We're still in this.", 'Breathe. One at a time.'],
        afraid: ["I'm not leaving you. Just keep moving!", 'Keep your cool. Stay with me.'],
        frustrated: ['Take your time. You will get another shot.', 'We can do this.'],
        relieved: ["We're still here.", 'Good. Stay with us.']
    };
    /** @type {Record<string, string[]>} */
    var acknowledgments = { support: ['Copy. Keep him busy!', 'Thanks. Staying on the move.', 'Understood. Breaking clear.'], emotional: ['Copy. Staying with you.', 'Thanks. I needed that.', 'All right. One at a time.'] };
    /** @type {Record<string, number>} */
    var emotionStrength = { calm: 0, confident: 1, relieved: 1, frustrated: 2, confused: 2, afraid: 3, panicked: 4 };
    // Four adult masculine/feminine pairs per wing; index owns identity across rounds.
    // Columns: pitch, F1, F2, F3, brightness, nasal, rasp, breath, creak, rate, contour.
    var pilotCast = [
        [105, .92, .86, .9, .12, .05, .12, .3, 0, .94, .25],
        [195, 1.06, 1.12, 1.1, .65, .15, .04, .12, 0, 1.12, .8],
        [140, 1.12, .95, 1.05, .8, .1, .55, .08, .45, 1.04, .4],
        [225, .94, 1.18, 1.12, .85, .65, .05, .06, 0, 1.16, .65],
        [165, 1.05, 1.14, 1.02, .65, .6, .08, .08, 0, 1.1, .75],
        [175, .88, .94, 1.04, .18, .05, .08, .36, 0, .92, .4],
        [120, 1.18, .9, .95, .5, .3, .3, .12, .2, .88, .15],
        [205, 1.1, 1.02, 1.18, .6, .12, .4, .16, .3, 1.02, .55],
        [150, .86, 1.08, .92, .3, .45, .14, .2, 0, .96, .65],
        [185, 1.16, .92, 1.08, .75, .05, .5, .08, .4, 1.08, .25],
        [95, 1.08, .82, .88, .2, .1, .45, .14, .35, .9, .4],
        [240, 1.08, 1.2, 1.16, .7, .25, .02, .18, 0, 1.18, .9],
        [175, .92, 1.16, 1.12, .9, .7, .1, .05, 0, 1.14, .5],
        [165, 1.12, .88, .94, .15, .1, .12, .4, 0, .98, .2],
        [130, 1.2, 1.06, .9, .7, .1, .65, .08, .55, 1.06, .35],
        [215, .9, 1.08, 1.2, .4, .4, .18, .22, .1, 1, .7]
    ];
    /** @param {Identity | null} [craft] @returns {Partial<Voice> & {seed: number}} */
    function pilotVoice(craft) {
        var index = craft && typeof craft.index === 'number' && Number.isFinite(craft.index) ? Math.abs(Math.floor(craft.index)) % pilotCast.length : -1;
        if (!craft || craft.id === 'control' || index < 0)
            return { pitch: 155, resonance: 1, roughness: 0.1, breath: 0.2, speed: 1, seed: 19 };
        var row = pilotCast[index], result = /** @type {Partial<Voice> & {seed: number}} */ ({ resonance: 1, tremor: 0, clipping: index % 4 === 3 ? 0.2 : 0, enunciation: 0.3 + (index % 3) * 0.08, variation: 0.2 + (index % 4) * 0.1, seed: 101 + index * 37 });
        /** @type {VoiceNumberKey[]} */ (['pitch', 'formant1', 'formant2', 'formant3', 'brightness', 'nasality', 'roughness', 'breath', 'creak', 'speed', 'contour']).forEach(function (key, i) {
            result[key] = row[i];
        });
        return result;
    }
    /** @param {Partial<Voice>} preset @param {Feeling} [emotion] */
    function voiceOptions(preset, emotion) {
        var v = Object.assign({}, preset), e = emotion || { current: 'calm', intensity: 0 }, n = e.intensity;
        var fear = e.current === 'afraid' || e.current === 'panicked';
        var strain = Math.max(fear ? n : 0, e.stress || 0);
        v.pitch = (v.pitch || 150) * (1 + 0.16 * strain + (e.current === 'frustrated' ? 0.06 * n : 0));
        v.speed = (v.speed || 1) * (1 + (fear ? 0.18 : e.current === 'relieved' ? -0.1 : e.current === 'reassuring' ? -0.12 : 0) * n);
        v.variation = (v.variation === undefined ? 0.35 : v.variation) + (e.current === 'panicked' ? 0.3 : e.current === 'reassuring' ? -0.12 : 0) * n;
        v.tremor = (v.tremor || 0) + 0.22 * strain;
        return v;
    }
    /** @type {Record<string, string[]>} */
    var templates = {
        loss: ['We lost {pilot}!', '{pilot} is gone. Stay together!', 'We have lost {count}. Keep your eyes open.'],
        kill: ['Nice shooting, {pilot}!', '{pilot} got one. Keep it up!', 'Good kill, {pilot}!'],
        nearPlayer: ['Close pass, pilot. Stay sharp!', 'That nearly hit you, pilot. Keep moving!'],
        near: ['That was a little close.', 'Too close for comfort!', 'Missed me. Barely.'],
        shield: ["Your shields are gone, pilot. Break clear!", 'Pilot, you are exposed. Get out of there!'],
        damaged: ['My hull is coming apart! Cover me!', 'Taking heavy damage. Need a hand!'],
        vulnerable: ["His hull is failing! Finish him!", '{pilot} is badly damaged. Stay on him!'],
        escaped: ['Finally shook that bastard.', 'Lost my tail. Coming back around.', 'Clear at last. Coming around.'],
        missed: ['Slippery little thing.', 'He got away from that pass.', 'Missed the pass. Coming around.'],
        streak: ['Leave some for us, will you?', 'That is {count} for you, pilot. Save us a few!', 'Pilot is on a roll. {count} kills!'],
        outnumbered: ["We are running out of friends here. {friends} against {enemies}.", 'Only {friends} of us left. Stay together!'],
        remaining: ['{count} hostiles left. Keep the pressure on!', '{count} left. Stay sharp!'],
        contact: ['Pilot, bandit at your {bearing}{height}. About {range} meters.', 'Contact {direction}{height}, roughly {range} meters out.', 'Eyes {direction}{height}, pilot. Hostile about {range} meters.', 'Enemy spotted. Your {bearing}{height}, range about {range} meters.'],
        closing: ['{pilot} closing at {speed} meters per second.', '{pilot} is coming in fast. {speed} meters per second!']
    };
    /** @param {unknown} value @returns {string} */
    function numberWords(value) {
        var n = Number.isFinite(Number(value)) ? Math.max(0, Math.min(999999, Math.round(Number(value)))) : 0, small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
        if (n < 20)
            return small[n];
        if (n < 100)
            return ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'][Math.floor(n / 10)] + (n % 10 ? ' ' + small[n % 10] : '');
        if (n < 1000)
            return small[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberWords(n % 100) : '');
        return numberWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numberWords(n % 1000) : '');
    }
    /** Replace forms of address, preserving named-pilot template placeholders.
     * @param {string} text @param {number} index @param {boolean} [hostile] */
    function ohioAddress(text,index,hostile){
        return text.replace(/\{pilot\}|\b[Pp]ilot\b/g,function(word){
            if(word==='{pilot}')return word;
            var name=hostile?'hotshot':index%2?'neighbor':'bud';
            return word==='Pilot'?name[0].toUpperCase()+name.slice(1):name;
        });
    }
    /** @param {string} kind @param {LineData} data @param {boolean} [ohio] */
    function compose(kind, data, ohio) {
        if(ohio){
            data=Object.assign({},data);
            if(typeof data.range==='number')data.range=Math.round(data.range/.9144/50)*50;
            if(typeof data.speed==='number')data.speed=Math.round(data.speed/.9144/10)*10;
        }
        var variants = kind === 'remaining' && data.count === 1 ? ["One left. Let's wrap this up.", 'Last hostile. Finish this!'] : templates[kind];
        if (kind === 'contact' && data.vertical)
            variants = ['Pilot, contact {direction}, about {range} meters.', 'Hostile {direction}. Roughly {range} meters out.'];
        if(ohio)variants=variants.map(function(text,index){return ohioAddress(text.replace(/meters/g,'yards'),index);});
        var composed = /** @type {Choices} */ (variants.map(function (text) {
            return text.replace(/\{(\w+)\}/g, /** @param {string} _ @param {string} key */ function (_, key) {
                return typeof data[key] === 'number' ? numberWords(data[key]) : String(data[key] === undefined ? 'pilot' : data[key]);
            });
        }));
        composed.templateKeys = variants.slice();
        return composed;
    }
    // Twenty-four tiny records, shared across pilots. Templates count too, so changing
    // a number or callsign does not make the same delivery sound new to the scheduler.
    /** @param {CommsState} state @param {Choices} choices @param {() => number} random */
    function pickLine(state, choices, random) {
        var scored = choices.map(function (text, index) {
            var key = choices.templateKeys ? choices.templateKeys[index] : text, score = 0;
            state.recentLines.forEach(function (entry, i) {
                if (entry.text === text)
                    score += (i + 1) * 2;
                if (entry.key === key)
                    score += i + 1;
            });
            return { text: text, key: key, score: score };
        });
        var nonRepeat = scored.filter(function (entry) {
            return entry.text !== state.last;
        });
        if (nonRepeat.length)
            scored = nonRepeat;
        var best = Math.min.apply(null, scored.map(function (entry) {
            return entry.score;
        }));
        var pool = scored.filter(function (entry) {
            return entry.score === best;
        });
        var chosen = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
        state.recentLines.push({ text: chosen.text, key: chosen.key });
        if (state.recentLines.length > 24)
            state.recentLines.shift();
        state.last = chosen.text;
        return chosen.text;
    }
    /** @param {Pose | undefined} player @param {Vector} point */
    function contactData(player, point) {
        if (!player || !player.eye || !player.right || !player.up || !player.back)
            return null;
        var delta = point.map(function (v, i) {
            return (v - player.eye[i]) * DW.sim.METERS_PER_UNIT;
        }), distance = Math.hypot.apply(null, delta);
        if (distance < 1)
            return null;
        /** @param {Vector} axis */
        function dot(axis) {
            return delta.reduce(function (sum, v, i) {
                return sum + v * axis[i];
            }, 0);
        }
        var right = dot(player.right), forward = -dot(player.back), up = dot(player.up), horizontal = Math.hypot(right, forward);
        var clock = (Math.round(Math.atan2(right, forward) * 6 / Math.PI) + 12) % 12 || 12;
        var direction = forward > Math.abs(right) * 1.5 ? 'ahead of you' : forward < -Math.abs(right) * 1.5 ? 'behind you' : right > 0 ? 'off your right' : 'off your left';
        var bearing = numberWords(clock) + " o'clock", height = up / distance > 0.34 ? ' high' : up / distance < -.34 ? ' low' : '';
        if (horizontal < distance * .25) {
            direction = up > 0 ? 'above you' : 'below you';
            bearing = up > 0 ? 'twelve high overhead' : 'six low underneath';
            height = '';
        }
        return { distance: distance, range: Math.max(100, Math.round(distance / 100) * 100), bearing: bearing, direction: direction, height: height, vertical: horizontal < distance * .25, sector: horizontal < distance * .25 ? direction : clock + height };
    }
    DW.flightDialogue = { ohioAddress:ohioAddress, lines: lines, calls: calls, emotionalLines: emotionalLines, emotionalReplies: emotionalReplies, acknowledgments: acknowledgments, emotionStrength: emotionStrength, pilotCast: pilotCast, pilotVoice: pilotVoice, voiceOptions: voiceOptions, templates: templates, numberWords: numberWords, compose: compose, pickLine: pickLine, contactData: contactData };
}());
