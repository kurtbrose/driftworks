(async function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    var get = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).experimentDom(document);
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks), model = DW.arcade, host = get('viewer');
    var activeMission=DW.flightMissions.current();
    if(activeMission.sky.gasGiant&&!DW.gasGiantWeather)await new Promise(/** @param {(value:boolean)=>void} resolve */function(resolve){window.addEventListener('gas-weather-ready',function(){resolve(true);},{once:true});});
    var impactWatch=!!activeMission.emptySpace;
    if(impactWatch)get('combat-toggle').checked=false;
    if(activeMission.weaponsDisabled){
        get('combat-toggle').disabled=true;get('watch-panel').hidden=true;
        host.setAttribute('aria-label','Free flight above a jade gas giant');
        ['weapons','integrity','target-info'].forEach(function(id){var panel=document.getElementById(id);if(panel)panel.hidden=true;});
        var footer=document.querySelector('footer');if(footer)footer.textContent='W/S throttle · X stop · Shift boost · arrows steer · Q/E roll · A/D lateral · R/F vertical · Esc pause';
    }
    if(activeMission.id!=='default'){
        var modeOption=Array.from(get('combat-mode').options).some(function(option){return option.value===activeMission.id;});
        if(!modeOption){var missionOption=document.createElement('option');missionOption.value=activeMission.id;missionOption.textContent=activeMission.heading;get('combat-mode').appendChild(missionOption);}
        get('combat-mode').value=activeMission.id;
        document.title=activeMission.title;
        var missionHeading=document.querySelector('header h1');if(missionHeading)missionHeading.textContent=activeMission.heading;
        var missionSubtitle=document.querySelector('header > span');if(missionSubtitle)missionSubtitle.textContent=activeMission.subtitle;
        var missionHint=document.querySelector('#launch > p');if(missionHint)missionHint.textContent=activeMission.hint;
    }
    var controlsHelp=document.getElementById('pause-controls');
    if(controlsHelp&&activeMission.units.speedScale!==1)controlsHelp.innerHTML=controlsHelp.innerHTML.replace(/5 m\/s/g,Math.round(5*activeMission.units.speedScale)+' '+activeMission.units.speedLabel);
    var aegisMode=new URLSearchParams(location.search).get('aegis')==='1';
    /** @type {import('./types').AegisFlightRig|null} */var aegis=null;
    if(aegisMode){try{await DW.aegisFlight.load();aegis=DW.aegisFlight.createBattle();}catch(error){get('status').textContent='Aegis flight could not start: '+String(error);return;}}
    var session = DW.flightSession.create({ seed: document.body.dataset.mission === 'asteroid-patrol' ? Math.floor(Math.random() * 4294967296) : undefined, terrainHit: function (start, end) {
            var asteroid = session.snapshot().asteroid;
            var terrain=DW.flightGuns.intersect(start, end, asteroid.radius, function (point) {
                return DW.scene3d.rockField(asteroid, /** @type {[number, number, number]} */ (DW.flightSession.rotateVector(point, -asteroid.rotation)));
            });
            var capital=aegis&&aegis.hit(start,end);
            if(capital&&(!terrain||Math.hypot.apply(null,capital.map(function(v,i){return v-start[i];}))<Math.hypot.apply(null,terrain.map(function(v,i){return v-start[i];}))))return capital;
            return terrain;
        }, surfaceFrame: function (asteroid, direction) {
            return DW.scene3d.surfaceFrame(asteroid, /** @type {[number, number, number]} */ (direction));
        }, onGunshot: function () {
            DW.audio.playGunshot();
        }, onImpact: function () {
            DW.audio.playImpact(1);
        } });
    var ohioMusic = activeMission.id === 'ohio' ? DW.audio.createOhioMusic() : null;
    var ohioMusicStarted = false;
    var mixerHost=document.getElementById('flight-settings');
    if(mixerHost && ohioMusic) ohioMusic.mount(mixerHost);
    if(mixerHost)DW.audio.mountMixer(mixerHost);
    var units = DW.sim.METERS_PER_UNIT;
    var tetherParams = new URLSearchParams(location.search), tetherKm = Number(tetherParams.get('tether'));
    var tetherStudy = [100,50,20,10,2].includes(tetherKm);
    if(tetherStudy) {
        get('combat-toggle').checked=false;
        document.title='Tether greyboxes / Driftworks';
        get('watch-panel').hidden=true;
        var heading=document.querySelector('h1');
        if(heading)heading.textContent='DRIFTWORKS / TETHER SCALE STUDY';
        var launchHint=document.querySelector('#launch > p');
        if(launchHint)launchHint.textContent='Free flight / W-S throttle / X stop / Esc pause';
        var panel=document.createElement('section');
        panel.id='tether-panel';
        panel.style.cssText='position:fixed;z-index:8;top:12px;left:50%;transform:translateX(-50%);background:#182024ee;color:#ddd;padding:12px;font:12px/1.6 monospace;max-width:44vw';
        panel.innerHTML='<b>TETHER GREYBOX / </b><select id="tether-size" aria-label="Tether span"></select> <select id="tether-start" aria-label="Starting position"><option value="hub">Hub  /  300 m away</option><option value="tip">Tip  /  300 m away</option><option value="overview">Overview</option></select><select id="tether-spin" aria-label="Operational spin"><option value="1g">1 g tip load</option><option value="2g">2 g tip load</option><option value="3g">3 g tip load</option></select><div id="tether-readout"></div><small>4 m cable  /  100 m hub  /  40 m tips. Symmetric spin / real seconds. Tip acceleration limited to 1-3 g. Scenery only: no collision / catches. Esc to change study.</small>';
        (document.querySelector('aside') || document.body).appendChild(panel);
        var size=/** @type {HTMLSelectElement} */ (document.getElementById('tether-size'));
        [100,50,20,10,2].forEach(function(km){var option=document.createElement('option');option.value=String(km);option.textContent=km+' km';size.appendChild(option);});
        size.value=String(tetherKm);
        var start=/** @type {HTMLSelectElement} */ (document.getElementById('tether-start'));
        start.value=tetherParams.get('start')||'hub';
        var spin=/** @type {HTMLSelectElement} */ (document.getElementById('tether-spin'));
        spin.value=['1g','2g','3g'].includes(tetherParams.get('spin') || '') ? (tetherParams.get('spin') || '1g') : '1g';
        function changeTether(){tetherParams.set('spin',spin.value);tetherParams.set('tether',size.value);tetherParams.set('start',start.value);location.search=tetherParams.toString();}
        size.onchange=changeTether;start.onchange=changeTether;spin.onchange=changeTether;
    }
    var presentation = DW.flightPresentation.mount(host, function () {
        return session.snapshot().world;
    }, function (w) {
        session.setWorld(w);
    });
    if(aegis){
        presentation.setCapital(aegis);
        document.title='Aegis capital engagement / Driftworks';
        var aegisPanel=document.createElement('div');aegisPanel.id='aegis-flight-readout';aegisPanel.style.cssText='position:fixed;z-index:5;left:20px;top:170px;max-width:330px;white-space:pre-line;font:11px/1.6 monospace;color:#b9d9db;background:#07151dc9;padding:9px;pointer-events:none';(document.querySelector('aside') || document.body).appendChild(aegisPanel);
        get('watch-panel').hidden=true;get('draw-mothership').checked=false;
        var aegisHeading=document.querySelector('header h1');if(aegisHeading)aegisHeading.textContent='DRIFTWORKS / AEGIS ENGAGEMENT';
        var aegisSubtitle=document.querySelector('header > span');if(aegisSubtitle){aegisSubtitle.textContent='GREEN / RED CAPITAL SHIPS';/** @type {HTMLElement} */(aegisSubtitle).style.display='block';}
        var aegisHint=document.querySelector('#launch > p');if(aegisHint)aegisHint.textContent='Fly between two maneuvering dreadnaughts exchanging heavy volleys. Red AA targets allied fighters. Engines start stopped.';
    }
    var select = get('profile'), stats = get('stats'), status = get('status');
    var watch = /** @type {ReturnType<Required<DriftworksNamespace>['flightWatch']['create']> | null} */ (null);
    var watchDuration=120,watchOpponentWeapon=-2;
    function view() {
        return watch ? watch.snapshot(get('watch-camera').value === 'chase') : session.snapshot();
    }
    // The initial reset below creates the sortie before any frame or input runs.
    var paused = true;
    model.profiles.forEach(function (p, i) {
        var option = document.createElement('option');
        option.value = String(i);
        option.textContent = p.name;
        select.appendChild(option);
    });
    var gunSelect = get('gun');
    var diagnostics = DW.flightDiagnostics.mount();
    get('dialogue-size').oninput = function (e) {
        document.documentElement.style.setProperty('--dialogue-size', get('dialogue-size').value + 'px');
    };
    var flightHud = DW.flightHud.mount(host);
    var comms = DW.flightComms.mount(get('comms'), get('comms-voice'));
    function weapon() {
        if (watch) return DW.retailWeapons[watch.replay.options.weapon < 0 ? DW.training.defaultWeapon(model.profiles[watch.replay.options.profile]) : watch.replay.options.weapon];
        return DW.retailWeapons[Number(gunSelect.value)];
    }
    function gunLabels() {
        var w = weapon(), units=DW.flightMissions.resolve(get('combat-mode').value).units;
        get('gun-stats').textContent = Math.round(w.speed*units.speedScale)+' '+units.speedLabel + ' · ' + w.fireWait + ' s / volley · ' + Math.round(w.speed*w.lifetime*units.distanceScale)+' '+units.distanceLabel + ' range';
    }
    function banks() {
        gunSelect.textContent = '';
        var primary = DW.training.defaultWeapon(profile()), indexes = [primary].concat(DW.retailWeapons.map(function (_, i) { return i; }).filter(function (i) { return i !== primary; }));
        indexes.forEach(function (index) {
            var option = document.createElement('option');
            option.value = String(index);
            option.textContent = DW.retailWeapons[index].name;
            gunSelect.appendChild(option);
        });
        gunLabels();
    }
    gunSelect.onchange = gunLabels;
    get('restart-training').onclick = function () {
        pause();
        reset();
        blurActiveControl();
    };
    get('combat-toggle').onchange = function (e) {
        comms.reset();
        session.setCombat(get('combat-mode').value, get('combat-toggle').checked);
        if(aegis)aegis.reset(session.snapshot().combat);
    };
    function profile() {
        if (watch) return model.profiles[watch.replay.options.profile];
        return model.profiles[Number(select.value)];
    }
    function labels() {
        var p = profile();
        var displayUnits=DW.flightMissions.resolve(get('combat-mode').value).units;
        stats.textContent = (p.species || '') + ' · ' + p.role + '\nHull / shields ' + p.hull + ' / ' + p.shield + '\nCruise / boost ' + Math.round(p.maxVelocity[2]*displayUnits.speedScale) + ' / ' + Math.round(p.afterburnerVelocity[2]*displayUnits.speedScale)+' '+displayUnits.speedLabel + '\nAccel / decel ' + p.forwardAccel + ' / ' + p.forwardDecel + ' s\nPitch / yaw / roll (s/360°)\n' + p.rotationTime.join(' / ') + '\nDamp / rotdamp ' + p.damp + ' / ' + p.rotdamp;
    }
    function clear() {
        DW.audio.setFlightEngine(0, 0, false, false);
        controls.clear();
    }
    function updateStatus() {
        var current = view();
        status.textContent = watch && watch.summary().done ? 'Duel complete · Replay duel or choose another pilot' :
            !watch && current.combat.dead ? 'Training over · Restart training to try again' :
            paused ? (watch ? 'AI duel paused · use the watch panel to resume' : 'Paused - Resume flight when ready') :
            watch ? 'Watching test pilot · Esc pauses' : current.contact ? 'Surface contact · throttle cut' :
            document.pointerLockElement === host ? 'Mouse captured · Esc pauses & releases' : controls.view().uncapturedMouse ? 'Cursor steering · center mouse to stop turning · Esc pauses' : 'Flight controls active';
    }
    function pause() {
        paused = true;
        diagnostics.resetSimulationClock();
        comms.pause();
        if(ohioMusic) ohioMusic.pause();
        document.body.classList.remove('flight-active');
        clear();
        controls.release();
        document.body.classList.remove('mouse-captured');
        get('fly').textContent = watch ? (watch.summary().done ? 'Restart duel' : 'Watch duel') : session.snapshot().combat.dead ? 'Restart flight' : 'Resume flight';
        updateStatus();
    }
    function pose() {
        var current = view();
        presentation.pose(current.camera || current.state);
    }
    function reset() {
        clear();
        diagnostics.resetSimulationClock();
        comms.reset();
        var pilot = get('watch-pilot').value, observing = pilot !== 'manual';
        session.reset({ mode: get('combat-mode').value, enabled: !observing && get('combat-toggle').checked, profile: model.profiles[Number(select.value) || 0] });
        if(aegis){
            var snapshot=session.snapshot();aegis.reset(snapshot.combat);var oldEye=snapshot.state.eye.slice(),aegisStart=[-200/units,-1100/units,1200+220/units];
            DW.training.participants(snapshot.combat).filter(function(c){return c.controller!=='input';}).forEach(function(c){c.pose.eye=c.pose.eye.map(function(v,i){return v+aegisStart[i]-oldEye[i];});});
            session.setStartPosition(aegisStart);snapshot.state.ramp=[0,0,0];snapshot.state.throttle=0;
            var forward=[200,1100,-220],forwardLength=Math.hypot.apply(null,forward);forward=forward.map(function(v){return v/forwardLength;});
            var rightLength=Math.hypot(forward[0],forward[1]),right=[forward[1]/rightLength,-forward[0]/rightLength,0];
            snapshot.state.right=right;snapshot.state.back=forward.map(function(v){return -v;});snapshot.state.up=[right[1]*forward[2],-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]];
        }
        if(tetherStudy) {
            var start=tetherParams.get('start');
            session.setStartPosition([start==='tip'?(tetherKm*500-20)/units:0,-(start==='overview'?tetherKm*800:300)/units,1200]);
        }
        session.setOpponentStyle(/** @type {import('./types').OpponentStyle} */(get('watch-style').value));
        var seed = Number(get('watch-seed').value);
        if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) seed = 1;
        get('watch-seed').value = String(seed);
        watch = observing ? DW.flightWatch.create(session, {category:pilot === 'perfect' ? 'perfect' : 'human',
            allyHull:get('watch-art').value,enemyHull:get('watch-enemy-art').value,
            flavor:/** @type {'novice'|'practiced'|'expert'} */ (pilot === 'perfect' ? 'practiced' : pilot.replace('human-', '')), seed:seed,
            start:/** @type {import('./types').DuelOptions['start']} */ (get('watch-start').value), opponentStyle:/** @type {import('./types').OpponentStyle} */(get('watch-style').value), skill:Number(get('watch-skill').value), duration:watchDuration,
            profile:Number(get('watch-profile').value),opponentProfile:Number(get('watch-opponent-profile').value),weapon:Number(get('watch-weapon').value),opponentWeapon:watchOpponentWeapon,unshielded:get('watch-defense').value==='unshielded'}) : null;
        document.body.classList.toggle('watching-ai', observing);
        get('watch-panel').classList.toggle('watch-running', observing);
        [select, gunSelect, get('combat-mode'), get('diameter'), get('combat-toggle'),get('ally-art'),get('enemy-art')].forEach(function (control) { control.disabled = observing; });
        get('fly').textContent = observing ? 'Watch duel' : 'Start flight';
        status.textContent = observing ? 'AI duel paused · Play to watch' : 'Ready · Start flight when ready';
        updateWatch();
        pose();
    }
    function updateWatch() {
        document.body.classList.toggle('watch-chase', !!watch && get('watch-camera').value === 'chase');
        get('watch-play').disabled = !watch;
        get('watch-restart').disabled = !watch;
        get('watch-play').textContent = watch && watch.summary().done ? 'Replay duel' : paused ? 'Play' : 'Pause';
        if (!watch) { get('watch-readout').textContent = 'Manual training opponent style: '+get('watch-style').value+'\nNormal lab ship and wave settings apply. Select an AI pilot for a matched one-on-one duel.'; return; }
        var result = watch.summary(), input = watch.replay.inputs[watch.replay.inputs.length - 1];
        get('watch-readout').textContent = result.seconds.toFixed(2) + 's / '+watch.replay.options.duration+'s · ' + (result.done ? result.outcome === 'player-win' ? 'Test pilot wins' : result.outcome === 'opponent-win' ? 'Opponent wins' : 'Time limit' : paused ? 'Paused' : 'Flying') +
            '\nPilot: ' + result.profile + '\nHull ' + result.playerHull.toFixed(0) + '/' + result.playerMaxHull + ' · shield ' + result.playerShield.toFixed(0) + '/' + result.playerMaxShield +
            '\nOpponent: ' + result.opponentProfile + '\nHull ' + result.opponentHull.toFixed(0) + '/' + result.opponentMaxHull + ' · shield ' + result.opponentShield.toFixed(0) + '/' + result.opponentMaxShield +
            '\nGuns: ' + result.weapon + ' / ' + result.opponentWeapon + '\nOpponent style: '+result.opponentStyle+' · mode: ' + view().combat.enemies[0].mode+'\nSeparations '+result.metrics.separations+' · no-progress escapes '+result.metrics.progressEscapes +
            (input ? '\nPitch ' + input.pitch.toFixed(2) + ' · yaw ' + input.yaw.toFixed(2) + '\nThrottle ' + Math.round(input.throttle * 100) + '% · boost ' + (input.boost ? 'on' : 'off') + ' · fire ' + (input.fire ? 'on' : 'off') : '\nWaiting to start');
    }
    [get('watch-profile'),get('watch-opponent-profile')].forEach(function (control) {
        model.profiles.forEach(function (p, i) { var option=document.createElement('option');option.value=String(i);option.textContent=p.name+' · '+p.species;control.appendChild(option); });
    });
    DW.retailWeapons.forEach(function (w, i) { var option=document.createElement('option');option.value=String(i);option.textContent=w.name;get('watch-weapon').appendChild(option); });
    [['watch-art','ally-art'],['watch-enemy-art','enemy-art']].forEach(function (ids) {
        var destination = get(/** @type {'watch-art'|'watch-enemy-art'} */ (ids[0])), source = get(/** @type {'ally-art'|'enemy-art'} */ (ids[1]));
        Array.from(source.options).forEach(function (option) { destination.appendChild(option.cloneNode(true)); });
        destination.value=source.value;destination.onchange=function(){source.value=destination.value;source.dispatchEvent(new Event('change'));if(watch){pause();reset();}blurActiveControl();};
    });
    [get('watch-pilot'), get('watch-start'), get('watch-skill'),get('watch-style'), get('watch-seed'),get('watch-profile'),get('watch-opponent-profile'),get('watch-weapon'),get('watch-defense')].forEach(function (control) {
        control.onchange = function () { if(control===get('watch-weapon'))watchOpponentWeapon=-2;pause(); reset(); blurActiveControl(); };
    });
    get('watch-camera').onchange = function () { updateWatch(); pose(); blurActiveControl(); };
    get('watch-play').onclick = function () {
        if (!watch) return;
        if (!paused) pause();
        else { if (watch.summary().done) reset(); resume(); }
        updateWatch(); blurActiveControl();
    };
    get('watch-restart').onclick = function () { pause(); reset(); blurActiveControl(); };
    get('combat-mode').onchange = function () {
        var missionParams = new URLSearchParams(location.search);
        var selectedMission=DW.flightMissions.resolve(get('combat-mode').value);
        if(selectedMission.id!=='default'){missionParams.set('mission',selectedMission.id);}else{missionParams.delete('mission');}
        if(missionParams.toString()!==new URLSearchParams(location.search).toString()){location.search=missionParams.toString();return;}
        pause();
        reset();
    };
    select.onchange = function () {
        reset();
        labels();
        banks();
    };
    get('diameter').onchange = function (e) {
        var asteroid = session.snapshot().asteroid, d = Number(get('diameter').value);
        if (!session.setAsteroidDiameter(d)) {
            get('diameter').value = String(asteroid.radius * units * 2);
            return;
        }
        reset();
    };
    get('reset').onclick = function () {
        reset();
        blurActiveControl();
    };
    function blurActiveControl() {
        var active = document.activeElement;
        if (active instanceof HTMLElement)
            active.blur();
    }
    function resume() {
        if (!watch && session.snapshot().combat.dead) {
            updateStatus();
            return;
        }
        DW.audio.unlock();
        if(ohioMusic && ohioMusicStarted) ohioMusic.resume();
        comms.unlock();
        clear();
        controls.resetButtons();
        diagnostics.resetSimulationClock();
        paused = false;
        document.body.classList.add('flight-active');
        blurActiveControl();
        updateStatus();
        if (watch) updateWatch();
    }
    /** @param {unknown} [error] */
    function captureFailure(error) {
        pause();
        if (error instanceof Error && error.message)
            status.dataset.captureError = error.message;
        else if (!status.dataset.captureError)
            status.dataset.captureError = 'Pointer lock rejected by browser';
        status.textContent = 'Mouse capture unavailable. Retry Fly or select Controller / keyboard.';
    }
    get('fly').onclick = function () {
        if (watch) { if (watch.summary().done) reset(); resume(); return; }
        if (session.snapshot().combat.dead)
            reset();
        if (controls.view().inputMode !== 'mouse') {
            resume();
            return;
        }
        controls.capture();
    };
    function nextWeapon() {
        if (watch) return;
        gunSelect.selectedIndex = (gunSelect.selectedIndex + 1) % gunSelect.options.length;
        gunLabels();
    }
    var controls = DW.flightControls.mount(host, {
        pause: pause, resume: resume, captureFailure: captureFailure,
        isPaused: function () {
            return paused;
        }, isDead: function () {
            return view().combat.dead;
        },
        toggleTargetLock: function () {
            if (watch) return;
            session.toggleTargetLock();
        },
        nextWeapon: nextWeapon, nextTarget: function () {
            if (!watch) session.nextTarget();
        },
        nextRadarRange: function () {
            flightHud.cycleRadarRange();
        },
        selectProfile: function (index) {
            if (watch) return;
            select.value = String(index);
            select.dispatchEvent(new Event('change'));
        },
        toggleDiagnostics: function () { pause(); diagnostics.toggleDiagnostics(); var lab=document.getElementById('flight-lab');if(lab instanceof HTMLDetailsElement)lab.open=true; }, togglePerformance: function () { pause(); diagnostics.togglePerformance(); var lab=document.getElementById('flight-lab');if(lab instanceof HTMLDetailsElement)lab.open=true; }
    });
    // Frozen-snapshot render A/B: same camera, actors and settings, ABBA order.
    var benchmarking=false;
    if(aegis||activeMission.id==='evacuation'){
        var benchmarkButton=document.createElement('button'),benchmarkOutput=document.createElement('pre');
        benchmarkButton.textContent=activeMission.id==='evacuation'?'Benchmark depot / transports on / off':'Benchmark Aegis on / off';
        benchmarkOutput.id='aegis-benchmark-result';benchmarkOutput.style.whiteSpace='pre-wrap';
        get('perf-reset').after(benchmarkButton,benchmarkOutput);
        benchmarkButton.onclick=async function(){
            if(benchmarking)return;
            pause();benchmarking=true;benchmarkButton.disabled=true;
            var snapshot=view(),art=presentation.appearance(),settings=diagnostics.settings();
            /** @type {{on:boolean,cpu:number,interval:number,draws:number,triangles:number}[]} */var rows=[];
            try{
                for(var enabled of [false,true,true,false]){
                    if(aegis)presentation.setCapital(enabled?aegis:null);else DW.evacuationScenery.visible=enabled;
                    var previous=0;
                    for(var i=0;i<110;i++){
                        var stamp=await new Promise(/** @param {(t:number)=>void} resolve */function(resolve){requestAnimationFrame(resolve);});
                        var begin=performance.now();presentation.render(snapshot,art,settings,0);
                        var cpu=performance.now()-begin,stats=presentation.renderStats();
                        if(i>=20)rows.push({on:enabled,cpu:cpu,interval:stamp-previous,draws:stats.scene.drawCalls+stats.sky.drawCalls,triangles:stats.scene.triangles+stats.sky.triangles});
                        previous=stamp;
                        benchmarkOutput.textContent='Frozen scene benchmark '+(rows.length)+' / 360 samples';
                    }
                }
                var lines=['Frozen scene / ABBA / 20 warm-up + 90 samples per block','Rendering only; AI and projectiles frozen.'];
                [false,true].forEach(function(on){var r=rows.filter(function(row){return row.on===on;});
                    /** @param {keyof Omit<typeof rows[number],'on'>} key */function mean(key){return r.reduce(function(n,row){return n+row[key];},0)/r.length;}
                    function percentile(/** @type {'cpu'|'interval'} */key,/** @type {number} */fraction){var sorted=r.map(function(row){return row[key];}).sort(function(a,b){return a-b;});return sorted[Math.floor((sorted.length-1)*fraction)];}
                    lines.push((on?'Asset ON':'Asset OFF')+': CPU median/p95 '+percentile('cpu',.5).toFixed(2)+' / '+percentile('cpu',.95).toFixed(2)+' ms, frame median/p95 '+percentile('interval',.5).toFixed(2)+' / '+percentile('interval',.95).toFixed(2)+' ms, '+mean('draws').toFixed(0)+' draws, '+mean('triangles').toFixed(0)+' triangles');
                });
                lines.push('CPU submission only; rAF includes browser pacing, not a GPU timer.');
                benchmarkOutput.textContent=lines.join('\n');
            }catch(error){benchmarkOutput.textContent='Benchmark interrupted: '+String(error);}
            finally{if(aegis)presentation.setCapital(aegis);else DW.evacuationScenery.visible=true;pause();benchmarking=false;benchmarkButton.disabled=false;diagnostics.reset();}
        };
    }
    /** @param {number} t */
    function frame(t) {
        if(ohioMusic && !paused) ohioMusic.update();
        if(benchmarking){requestAnimationFrame(frame);return;}
        var timing = diagnostics.beginFrame(t, paused);
        if (!timing) {
            requestAnimationFrame(frame);
            return;
        }
        var elapsed = timing.elapsed;
        var appearance = presentation.appearance();
        if(watch){appearance.allyArt=watch.replay.options.allyHull==='blockout'?'':watch.replay.options.allyHull;appearance.enemyArt=watch.replay.options.enemyHull==='blockout'?'':watch.replay.options.enemyHull;}
        if (!watch) session.configureHulls(appearance.allyArt, appearance.enemyArt);
        var demand = controls.sample();
        var simMs=0,capitalMs=0,phaseStart=performance.now();
        if (!paused) {
            var before = view(), beforeSpeed = Math.hypot.apply(null, view().state.velocity), lastHit = before.combat.lastHit, shield = before.combat.shield, fired = before.guns.fired, contact = before.contact;
            if (watch) {
                var previousTime = watch.summary().seconds;
                watch.advance(elapsed, Number(get('watch-speed').value));
                elapsed = watch.summary().seconds - previousTime;
                if (view().guns.fired > fired) DW.audio.playGunshot();
                if (view().combat.lastHit > lastHit) DW.audio.playImpact(1);
                if (watch.summary().done) pause();
            } else session.advance(elapsed, demand, { profile: profile(), weapon: weapon() });
            var after = view();
            simMs=performance.now()-phaseStart;phaseStart=performance.now();
            if(aegis&&!watch)aegis.step(elapsed,after);
            capitalMs=performance.now()-phaseStart;
            if (!watch && after.contact && !contact) DW.audio.playImpact(2);
            DW.audio.setFlightEngine(elapsed, after.state.throttle, !!demand.boost, !paused && !watch && !after.contact && !after.combat.dead, {acceleration: elapsed > 0 ? Math.max(0, Math.hypot.apply(null, after.state.velocity) - beforeSpeed) / elapsed / Math.max(1, profile().maxVelocity[2] / profile().forwardAccel) : 0, damage: 1 - after.combat.hull / (after.combat.maxHull || after.combat.hull || 1), maneuver: Math.min(1, Math.abs(demand.pitch || 0) + Math.abs(demand.yaw || 0) + Math.abs(demand.roll || 0))});
            if (!watch) controls.haptics(elapsed, {boost: !after.contact && !after.combat.dead && !!demand.boost, hit: after.combat.lastHit > lastHit, shieldBreak: shield > 0 && after.combat.shield <= 0, fire: after.guns.fired > fired, contact: after.contact && !contact});
            if (!watch && after.combat.dead) {
                pause();
            }
            pose();
            updateStatus();
        }
        var currentView = view();
        if (!paused && !watch) session.acquireTarget();
        if (!paused) {
            if (!watch) session.advanceScenery(elapsed);
            if(!ohioMusic || !ohioMusicStarted || !ohioMusic.isAnnouncing()) {
                comms.update(elapsed, currentView.combat, currentView.state);
            }
            // Comms advances past the opening only after the final transmission ends.
            if(ohioMusic && !ohioMusicStarted && currentView.combat.openingStep > activeMission.opening.length) {
                ohioMusicStarted = true;
                comms.pause();
                ohioMusic.resume();
            }
        }
        var comparison = diagnostics.settings();
        phaseStart=performance.now();
        presentation.render(currentView, appearance, comparison, elapsed);
        var presentationMs=performance.now()-phaseStart;phaseStart=performance.now();
        if(aegis){var readout=document.getElementById('aegis-flight-readout');if(readout)readout.textContent=aegis.readout();}
        var inputView = controls.view();
        if (watch) inputView.showMouseStick = false;
        flightHud.render(Object.assign({}, currentView, { units: units, paused: paused, speakerId: comms.speakerId(), weapon: weapon() }, inputView, appearance));
        if (watch) get('combat-status').textContent = 'AI DUEL / ' + (watch.summary().category === 'perfect' ? 'PERFECT' : watch.summary().flavor.toUpperCase()) + ' VS ' + currentView.combat.enemies[0].pilot.toUpperCase();
        updateWatch();
        var hudMs=performance.now()-phaseStart;
        diagnostics.endFrame(timing, paused, comparison, presentation.renderStats);
        if(aegis&&get('perf-enabled').checked){var perf=get('perf-overlay');perf.textContent=perf.textContent.split('\nStages:')[0]+'\nStages: sim '+simMs.toFixed(1)+' / PD '+capitalMs.toFixed(1)+' / scene '+presentationMs.toFixed(1)+' / HUD '+hudMs.toFixed(1)+' ms';}
        requestAnimationFrame(frame);
    }
    labels();
    banks();
    var importError='';
    try {
        var imported=DW.flightDuel.readWatchSearch(location.search);
        if(imported){
            get('watch-art').value=imported.allyHull==='blockout'?'':imported.allyHull;get('watch-enemy-art').value=imported.enemyHull==='blockout'?'':imported.enemyHull;
            get('watch-style').value=imported.opponentStyle;watchDuration=imported.duration;watchOpponentWeapon=imported.opponentWeapon;
            get('watch-pilot').value=imported.category==='perfect'?'perfect':'human-'+imported.flavor;
            get('watch-start').value=imported.start;get('watch-skill').value=String(imported.skill);get('watch-seed').value=String(imported.seed);
            get('watch-profile').value=String(imported.profile);get('watch-opponent-profile').value=String(imported.opponentProfile);
            get('watch-weapon').value=String(imported.weapon);get('watch-defense').value=imported.unshielded?'unshielded':'retail';
        }
    }catch(error){importError='Could not load study case: '+(error instanceof Error?error.message:String(error));}
    reset();
    if(importError)status.textContent=importError;
    requestAnimationFrame(frame);
}());
