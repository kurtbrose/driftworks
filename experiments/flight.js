(async function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    var get = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).experimentDom(document);
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks), model = DW.arcade, host = get('viewer');
    var texturesReady=false,textureLoadFailed=false;
    get('fly').disabled=true;get('fly').textContent='Loading ship textures...';
    get('status').textContent='Loading ship textures and preparing graphics...';
    var activeMission=DW.flightMissions.current();
    if(activeMission.sky.gasGiant&&!DW.gasGiantWeather)await new Promise(/** @param {(value:boolean)=>void} resolve */function(resolve){window.addEventListener('gas-weather-ready',function(){resolve(true);},{once:true});});
    var cinematic=activeMission.id==='cinematic';
    var impactWatch=!!activeMission.emptySpace&&!cinematic;
    if(impactWatch)get('combat-toggle').checked=false;
    if(activeMission.weaponsDisabled){
        get('combat-toggle').disabled=true;get('watch-panel').hidden=true;
        host.setAttribute('aria-label',activeMission.id==='jade-rime'?'Free flight near Rime, with the jade giant overhead':'Free flight above a jade gas giant');
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
    if(aegisMode||activeMission.id==='battle'||activeMission.sky.wormhole||activeMission.id==='scramble'){try{await DW.aegisFlight.load();aegis=activeMission.id==='scramble'?DW.aegisFlight.create({state:{team:'ally',position:[0,0,1200],heading:0,velocity:[0,0,0],integrity:20000},opponent:{team:'enemy',position:[0,2000/DW.sim.METERS_PER_UNIT,1200],heading:0,velocity:[0,0,0],integrity:20000},unarmed:true}):cinematic?DW.aegisFlight.createBattle({bridge:true}):activeMission.sky.wormhole?DW.aegisFlight.createEllisPatrol():DW.aegisFlight.createBattle({battlefield:activeMission.id==='battle'});}catch(error){get('status').textContent='Aegis flight could not start: '+String(error);return;}}
    /** @type {import('./types').TerrainHit} */
    var environmentHit = function (start, end) {
            var asteroid = session.snapshot().asteroid;
            var terrain=DW.flightGuns.intersect(start, end, asteroid.radius, function (point) {
                return DW.asteroidTerrain.rockField(asteroid, /** @type {[number, number, number]} */ (DW.flightSession.rotateVector(point, -asteroid.rotation)));
            });
            var capital=aegis&&aegis.hit(start,end);
            if(capital&&(!terrain||Math.hypot.apply(null,capital.map(function(v,i){return v-start[i];}))<Math.hypot.apply(null,terrain.map(function(v,i){return v-start[i];}))))return capital;
            return terrain;
        };
    environmentHit.onImpact=function(point,bolt,combat){if(aegis&&aegis.damage)aegis.damage(point,bolt.weapon.damage,combat);};
    var subsystemId='';
    var subsystemMarker=document.createElement('div');
    subsystemMarker.style.cssText='position:absolute;z-index:8;pointer-events:none;color:#ffd18b;font:12px monospace;text-align:center;white-space:pre;text-shadow:0 1px 3px #000';
    subsystemMarker.hidden=true;host.appendChild(subsystemMarker);
    function nextSubsystem(){
        if(!aegis||!aegis.components)return;
        var parts=aegis.components().filter(function(p){return p.id.startsWith('capital-enemy-')&&p.hp>0;}),index=parts.findIndex(function(p){return p.id===subsystemId;});
        subsystemId=index+1<parts.length?parts[index+1].id:'';
    }
    if(aegis&&aegis.components&&aegis.components().some(function(p){return p.id.startsWith('capital-enemy-');})){var systemButton=document.createElement('button');systemButton.textContent='Target capital system / U';systemButton.onclick=nextSubsystem;get('fly').after(systemButton);}
    if(aegis&&aegis.components)document.addEventListener('keydown',function(e){if(e.code==='KeyU'&&!e.repeat&&!(e.target instanceof HTMLElement&&/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))){nextSubsystem();e.preventDefault();}});
    /** @param {import('./types').FlightState} state */
    function drawSubsystem(state){
        var part=aegis&&aegis.components&&aegis.components().find(function(p){return p.id===subsystemId;});
        subsystemMarker.hidden=!part;if(!part)return;
        var d=part.position.map(function(v,i){return v-state.eye[i];}),forward=-d.reduce(function(n,v,i){return n+v*state.back[i];},0);
        var w=host.clientWidth,h=host.clientHeight,f=h/(2*Math.tan(Math.PI/8)),x=d.reduce(function(n,v,i){return n+v*state.right[i];},0),y=d.reduce(function(n,v,i){return n+v*state.up[i];},0);
        var sx=forward>0?w/2+x*f/forward:w/2+(x>=0?1:-1)*w,sy=forward>0?h/2-y*f/forward:h/2;
        subsystemMarker.style.left=Math.max(90,Math.min(w-190,sx))+'px';subsystemMarker.style.top=Math.max(70,Math.min(h-90,sy))+'px';
        subsystemMarker.textContent=(forward>0&&sx>0&&sx<w&&sy>0&&sy<h?'[+]':'>>')+' '+part.kind.toUpperCase()+' '+part.id.split('-').pop()+'\n'+(part.hp>0?Math.ceil(part.hp/part.maxHp*100)+'% SYSTEM':'DISABLED')+' / '+Math.round(Math.hypot(...d)*DW.sim.METERS_PER_UNIT)+' m';
    }
    var session = DW.flightSession.create({ seed: document.body.dataset.mission === 'asteroid-patrol' ? Math.floor(Math.random() * 4294967296) : undefined, terrainHit: environmentHit, surfaceFrame: function (asteroid, direction) {
            return DW.asteroidTerrain.surfaceFrame(asteroid, /** @type {[number, number, number]} */ (direction));
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
    if(mixerHost&&activeMission.sky.wormhole){
        var latticeLabel=document.createElement('label'),latticeToggle=document.createElement('input');
        latticeToggle.type='checkbox';latticeToggle.id='bridge-grid';latticeToggle.checked=new URLSearchParams(location.search).get('bridgeGrid')!=='0';
        latticeLabel.append(latticeToggle,document.createTextNode(' Wormhole spatial lattice / amber: asteroid, cyan: Rime'));mixerHost.appendChild(latticeLabel);
    }

    var bridgeFeedback=DW.ellisFeedback.create();
    var bridgeCue=bridgeFeedback.update(session.snapshot().state,0,false,!!activeMission.sky.wormhole);
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
        if(aegisMode){
            document.title='Aegis capital engagement / Driftworks';
            var aegisPanel=document.createElement('div');aegisPanel.id='aegis-flight-readout';aegisPanel.style.cssText='position:fixed;z-index:5;left:20px;top:170px;max-width:330px;white-space:pre-line;font:11px/1.6 monospace;color:#b9d9db;background:#07151dc9;padding:9px;pointer-events:none';(document.querySelector('aside') || document.body).appendChild(aegisPanel);
            get('watch-panel').hidden=true;get('draw-mothership').checked=false;
            var aegisHeading=document.querySelector('header h1');if(aegisHeading)aegisHeading.textContent='DRIFTWORKS / AEGIS ENGAGEMENT';
            var aegisSubtitle=document.querySelector('header > span');if(aegisSubtitle){aegisSubtitle.textContent='GREEN / RED CAPITAL SHIPS';/** @type {HTMLElement} */(aegisSubtitle).style.display='block';}
            var aegisHint=document.querySelector('#launch > p');if(aegisHint)aegisHint.textContent='Fly between two maneuvering dreadnaughts exchanging heavy volleys. Red AA targets allied fighters. Engines start stopped.';
        }
    }
    if(cinematic){
        document.body.classList.add('cinematic-demo');get('draw-mothership').checked=false;
        var demoStyle=document.createElement('style');demoStyle.textContent='body.cinematic-demo #watch-panel{display:none!important}body.cinematic-demo.flight-active aside,body.cinematic-demo.flight-active header,body.cinematic-demo.flight-active footer,body.cinematic-demo.flight-active #subsystem-marker{display:none!important}.cinema-caption{position:fixed;bottom:24px;left:28px;color:#d8e6ee;z-index:12;font:12px monospace;letter-spacing:2px;pointer-events:none;text-shadow:0 2px 5px #000}';document.head.appendChild(demoStyle);
        var caption=document.createElement('div');caption.className='cinema-caption';document.body.appendChild(caption);
        var nextShot=document.createElement('button');nextShot.textContent='Next camera / C';nextShot.onclick=function(){if(director)director.next();};get('fly').after(nextShot);
        window.addEventListener('keydown',function(e){if(e.code==='KeyC'&&director){director.next();e.preventDefault();}});
    }
    var select = get('profile'), stats = get('stats'), status = get('status');
    var watch = /** @type {ReturnType<Required<DriftworksNamespace>['flightWatch']['create']> | null} */ (null);
    var director=cinematic&&aegis?DW.flightWatch.cinema(aegis):null;
    var demoSeconds=0;
    var watchDuration=120,watchOpponentWeapon=-2;
    function view() {
        var snapshot=watch ? watch.snapshot(get('watch-camera').value === 'chase') : session.snapshot();
        return director?Object.assign({},snapshot,{camera:director.camera(snapshot)}):snapshot;
    }
    // The initial reset below creates the sortie before any frame or input runs.
    var paused = true;
    // Copy freshly rendered buffers in the same frame: WebGL does not retain
    // its drawing buffer after compositing. Never resume simulation to capture.
    var screenshotRequest = /** @type {{hud:boolean,resolve:(blob:Blob)=>void,reject:(error:Error)=>void}|null} */ (null);
    var screenshotPanel=document.createElement('div');
    screenshotPanel.style.cssText='pointer-events:auto;margin:12px 0;padding:10px;background:#07151df5';
    var screenshotStatus=document.createElement('small');screenshotStatus.setAttribute('role','status');
    var screenshotDownload=document.createElement('a');screenshotDownload.textContent='Download screenshot';screenshotDownload.hidden=true;
    var screenshotUrl='';
    var screenshotButtons=/** @type {HTMLButtonElement[]} */([]);
    [true,false].forEach(function(hud){
        var button=document.createElement('button');button.type='button';button.textContent=hud?'Copy screenshot':'Copy screenshot (no HUD)';
        button.style.cssText='display:block;width:100%;margin:6px 0';screenshotButtons.push(button);screenshotPanel.appendChild(button);
        button.onclick=function(){
            screenshotButtons.forEach(function(b){b.disabled=true;});screenshotDownload.hidden=true;screenshotStatus.textContent='Capturing…';
            var image=new Promise(/** @param {(blob:Blob)=>void} resolve @param {(error:Error)=>void} reject */function(resolve,reject){screenshotRequest={hud:hud,resolve:resolve,reject:reject};});
            // Start clipboard write during the click, before awaiting the frame.
            var copying=/** @type {Promise<void>} */(Promise.resolve());
            try{copying=navigator.clipboard&&typeof ClipboardItem!=='undefined'?navigator.clipboard.write([new ClipboardItem({'image/png':image})]):Promise.reject(new Error('Image clipboard unavailable'));}
            catch(error){copying=Promise.reject(error);}
            var download=image.then(function(blob){
                if(screenshotUrl)URL.revokeObjectURL(screenshotUrl);
                screenshotUrl=URL.createObjectURL(blob);screenshotDownload.href=screenshotUrl;screenshotDownload.download='driftworks'+(hud?'':'-no-hud')+'.png';screenshotDownload.hidden=false;
            });
            var copied=copying.then(function(){return true;},function(){return false;});
            Promise.all([download,copied]).then(function(results){screenshotStatus.textContent=results[1]?'Screenshot copied. ':'Clipboard unavailable. Download the PNG instead. ';})
                .catch(function(){screenshotStatus.textContent='Screenshot failed. Please try again.';}).finally(function(){screenshotButtons.forEach(function(b){b.disabled=false;});});
        };
    });
    screenshotPanel.appendChild(screenshotStatus);screenshotPanel.appendChild(screenshotDownload);get('launch').appendChild(screenshotPanel);
    function captureScreenshot(){
        const request=screenshotRequest;if(!request)return;screenshotRequest=null;
        try{
            var output=document.createElement('canvas'),layers=Array.from(host.querySelectorAll('canvas'));
            // Sky, scene and scene effects precede the single GPU HUD canvas.
            if(request.hud){var hudCanvas=document.querySelector('canvas.gpu-flight-hud');if(hudCanvas instanceof HTMLCanvasElement)layers.push(hudCanvas);}
            output.width=Math.max(1,Math.round(host.clientWidth*(window.devicePixelRatio||1)));output.height=Math.max(1,Math.round(host.clientHeight*(window.devicePixelRatio||1)));
            const ctx=output.getContext('2d');if(!ctx)throw new Error('Screenshot canvas unavailable');
            ctx.fillStyle='#000';ctx.fillRect(0,0,output.width,output.height);
            layers.forEach(function(layer){if(layer.width&&layer.height)ctx.drawImage(layer,0,0,output.width,output.height);});
            output.toBlob(function(blob){if(blob)request.resolve(blob);else request.reject(new Error('PNG encoding failed'));},'image/png');
        }catch(error){request.reject(error instanceof Error?error:new Error(String(error)));}
    }
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
        if(!texturesReady){
            get('fly').disabled=true;
            get('fly').textContent=textureLoadFailed?'Textures unavailable':'Loading ship textures...';
            status.textContent=textureLoadFailed?'Ship textures could not load. Reload to retry. '+get('art-credit').textContent:'Loading ship textures and preparing graphics...';
            return;
        }
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
        get('fly').textContent = cinematic?'Resume demo':watch ? (watch.summary().done ? 'Restart duel' : 'Watch duel') : session.snapshot().combat.dead ? 'Restart flight' : 'Resume flight';
        updateStatus();
    }
    function pose() {
        var current = view();
        presentation.pose(current.camera || current.state);
    }
    function reset() {
        if(director){director.reset();demoSeconds=0;}
        bridgeFeedback.reset();
        clear();
        diagnostics.resetSimulationClock();
        comms.reset();
        var pilot = get('watch-pilot').value, observing = pilot !== 'manual';
        session.reset({ mode: get('combat-mode').value, enabled: !observing && get('combat-toggle').checked, profile: model.profiles[Number(select.value) || 0] });
        if(aegis&&!aegisMode)aegis.reset(activeMission.id==='battle'||cinematic?session.snapshot().combat:undefined);
        if(cinematic){session.setStartPosition([0,-10000/units,5000/units]);var observer=session.snapshot();observer.state.throttle=0;observer.combat.player.hp=observer.combat.player.maxHp=1e9;observer.combat.hull=observer.combat.maxHull=1e9;observer.combat.enabled=true;get('watch-panel').hidden=true;}
        if(aegis&&aegisMode){
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
        if(!texturesReady)updateStatus();
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
        if(!texturesReady){updateStatus();return;}
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
        if(!texturesReady){updateStatus();return;}
        if (cinematic){resume();return;}
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
    var shieldQuery=new URLSearchParams(location.search),shieldStudy=['whole','own','default'].includes(shieldQuery.get('shields')||''),shieldOn=true,shieldPending=false;
    var shieldPreviewPlaying=false,shieldPreviewStart=0,shieldYaw=0,shieldPitch=0;
    var shieldAngular=shieldQuery.get('shields')==='default'||shieldQuery.get('shieldUnits')==='angle',shieldAmount=.35;
    if(shieldQuery.get('shields')==='own')get('watch-camera').value='cockpit';
    if(shieldStudy){
        var shieldStyle=document.createElement('style');shieldStyle.textContent='body.gpu-hud.shield-study.watching-ai #launch{display:none}';document.head.appendChild(shieldStyle);document.body.classList.add('shield-study');
        var shieldPanel=document.createElement('section'),shieldToggle=document.createElement('button'),shieldBench=document.createElement('button'),shieldFrozen=document.createElement('button'),shieldResume=document.createElement('button'),shieldResult=document.createElement('pre');
        shieldPanel.id='shield-dogfight';shieldPanel.style.cssText='max-height:90vh;overflow:auto;position:fixed;z-index:7;top:15px;left:15px;max-width:420px;padding:12px;background:#07151de8;border:1px solid #386059;font:12px/1.5 monospace';
        shieldResult.style.cssText='white-space:pre-wrap;max-height:35vh;overflow:auto';
        shieldToggle.textContent='Whole-image shields ON / 2px';shieldBench.textContent='Benchmark next shield hit';shieldFrozen.textContent='Benchmark frozen frame';shieldResume.textContent='Pause / resume dogfight';
        var shieldUnits=document.createElement('select'),shieldGlow=document.createElement('input'),shieldGlowLabel=document.createElement('label'),shieldTest=document.createElement('button');
        shieldUnits.setAttribute('aria-label','Shield distortion strength');[['legacy','Legacy 2 backing pixels'],['0','0 degrees / glow only'],['0.05','0.05 degrees'],['0.15','0.15 degrees'],['0.35','0.35 degrees'],['0.75','0.75 degrees'],['1.5','1.5 degrees']].forEach(function(pair){var option=document.createElement('option');option.value=pair[0];option.textContent=pair[1];shieldUnits.appendChild(option);});shieldUnits.value=shieldAngular?'0.35':'legacy';
        shieldGlow.type='checkbox';shieldGlow.checked=true;shieldGlow.setAttribute('aria-label','Shield glow');shieldGlowLabel.append(shieldGlow,document.createTextNode(' Blue glow'));shieldTest.textContent='Freeze scripted shield hit';
        var shieldHint=document.createElement('small');shieldHint.textContent=shieldQuery.get('shields')==='default'?'Default combat shields: external glow, own-hit distortion + glow.':shieldQuery.get('shields')==='own'?'Own shield / cockpit: scene refracts; HUD stays sharp. Scripted button is visual only.':'External fighters: angular bend capped at 25% of projected shield radius.';
        function applyShieldOptics(){shieldAngular=shieldUnits.value!=='legacy';shieldAmount=shieldAngular?Number(shieldUnits.value):2;presentation.setShields(shieldAngular||shieldOn);presentation.setShieldOptics(shieldAngular?(shieldOn?shieldAmount:0):null,shieldGlow.checked);shieldToggle.textContent=shieldAngular?'Displacement '+(shieldOn?shieldAmount+' degrees':'ZERO / same glow'):'Whole-image shields '+(shieldOn?'ON':'OFF')+' / 2px';}
        shieldUnits.onchange=applyShieldOptics;shieldGlow.onchange=applyShieldOptics;
        var hitPreview=document.createElement('button');hitPreview.textContent='Play repeating hits / 0.7 s';
        function holdShieldPreview(){shieldPreviewPlaying=false;hitPreview.textContent='Play repeating hits / 0.7 s';}
        if(shieldQuery.get('shields')==='own'){
            var directionPanel=document.createElement('div'),pad=document.createElement('div'),marker=document.createElement('span'),directionReadout=document.createElement('div'),yawInput=document.createElement('input'),pitchInput=document.createElement('input');
            pad.setAttribute('aria-label','Drag shield hit direction');pad.style.cssText='position:relative;width:100%;height:110px;user-select:none;touch-action:none;cursor:crosshair;border:1px solid #70caff;margin:8px 0;background:linear-gradient(90deg,transparent 49.7%,#426674 50%,transparent 50.3%),linear-gradient(transparent 49.5%,#426674 50%,transparent 50.5%),#102938';
            pad.textContent='← behind / left · FRONT · right / behind →';marker.style.cssText='position:absolute;width:12px;height:12px;border:2px solid #8cdbff;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none';pad.appendChild(marker);
            yawInput.type=pitchInput.type='range';yawInput.min='-180';yawInput.max='180';pitchInput.min='-90';pitchInput.max='90';yawInput.value=pitchInput.value='0';yawInput.setAttribute('aria-label','Hit yaw degrees');pitchInput.setAttribute('aria-label','Hit elevation degrees');
            function updateDirection(){shieldYaw=Number(yawInput.value);shieldPitch=Number(pitchInput.value);marker.style.left=((shieldYaw+180)/360*100)+'%';marker.style.top=((90-shieldPitch)/180*100)+'%';directionReadout.textContent='Yaw '+shieldYaw+'° / elevation '+shieldPitch+'° / hits every 0.7 s. '+(Math.cos(shieldYaw*Math.PI/180)*Math.cos(shieldPitch*Math.PI/180)<-.2?'Behind: waves may fade before reaching the forward view.':'Camera held still; sky and scene refract, HUD stays sharp.');if(!shieldPreviewPlaying){shieldPreviewStart=performance.now();presentation.setShieldPreview(DW.flightShields.preview(shieldYaw,shieldPitch,.12));}}
            directionPanel.append(hitPreview,pad,directionReadout,yawInput,pitchInput);
            [['Front',0,0],['Left',-90,0],['Right',90,0],['Behind',180,0],['Above',0,90],['Below',0,-90]].forEach(function(preset){var button=document.createElement('button');button.textContent=String(preset[0]);button.onclick=function(){pause();yawInput.value=String(preset[1]);pitchInput.value=String(preset[2]);updateDirection();};directionPanel.appendChild(button);});
            yawInput.oninput=pitchInput.oninput=updateDirection;
            /** @param {PointerEvent} e */function dragDirection(e){var rect=pad.getBoundingClientRect();yawInput.value=String(Math.round(Math.max(-180,Math.min(180,(e.clientX-rect.left)/rect.width*360-180))));pitchInput.value=String(Math.round(Math.max(-90,Math.min(90,90-(e.clientY-rect.top)/rect.height*180))));updateDirection();}
            pad.onpointerdown=function(e){pad.setPointerCapture(e.pointerId);dragDirection(e);};pad.onpointermove=function(e){if(pad.hasPointerCapture(e.pointerId))dragDirection(e);};
            hitPreview.onclick=function(){if(shieldPreviewPlaying){holdShieldPreview();return;}pause();shieldGlow.checked=true;shieldOn=true;if(!shieldAngular||shieldAmount===0)shieldUnits.value='0.75';applyShieldOptics();shieldPreviewStart=performance.now();shieldPreviewPlaying=true;hitPreview.textContent='Pause hit animation';shieldResult.textContent='Repeating directional preview / fixed camera and sky / visual hits only. Drag the box or choose a direction. Blue glow enabled.';};
            updateDirection();presentation.setShieldPreview(null);shieldPanel.appendChild(directionPanel);
        }

        shieldTest.onclick=function(){holdShieldPreview();presentation.setShieldPreview(null);pause();presentation.injectShieldHit();shieldResult.textContent='Scripted hit / frozen phase. Toggle displacement to ZERO for the same glow without bending. Choose 0.35–1.5 degrees to compare strengths; resume to see motion.';};
        var shieldMeasure=document.createElement('button');shieldMeasure.textContent='Measure frozen displacement';
        shieldMeasure.onclick=function(){
            if(!texturesReady||benchmarking||!shieldAngular)return;
            holdShieldPreview();pause();var snapshot=view(),art=presentation.appearance(),settings=diagnostics.settings();if(watch){art.allyArt=watch.replay.options.allyHull;art.enemyArt=watch.replay.options.enemyHull;}
            var source=host.querySelector('canvas[aria-label="3D tactical scene"]'),sky=host.querySelector('canvas.flight-skybox');if(!(source instanceof HTMLCanvasElement)||!(sky instanceof HTMLCanvasElement))return;
            var w=source.width,h=source.height;
            /** @param {number} angle */function capture(angle){presentation.setShieldOptics(angle,shieldGlow.checked);presentation.render(snapshot,art,settings,0);var c=document.createElement('canvas');c.width=w;c.height=h;var ctx=c.getContext('2d');if(!ctx)throw new Error('Capture unavailable');ctx.drawImage(/** @type {HTMLCanvasElement} */(sky),0,0,w,h);ctx.drawImage(/** @type {HTMLCanvasElement} */(source),0,0);return ctx.getImageData(0,0,w,h).data;}
            try{capture(0);capture(shieldAmount);var a=capture(0),aa=capture(0),b=capture(shieldAmount),bb=capture(shieldAmount),aaa=capture(0),d=DW.shieldPixelDiff.compare(a,b,[aa,aaa],[bb]);shieldResult.textContent=(d.noise?'INVALID / '+d.noise+' unstable pixels':'Repeat controls: exact match')+'\nFrozen '+snapshot.combat.time.toFixed(3)+' s; '+w+' x '+h+'; '+shieldAmount+' degrees vs zero; same glow\n'+d.changed+' changed pixels ('+(100*d.changed/(w*h)).toFixed(3)+'% of viewport)\n'+d.visibleChanges+' at ≥3/255; '+d.strong+' at ≥10/255; max '+d.max+'/255. Byte thresholds, not perceptual visibility. Scene only; HUD excluded.';}
            catch(error){shieldResult.textContent=String(error);}finally{applyShieldOptics();}
        };
        shieldPanel.append(shieldHint,document.createElement('br'),shieldUnits,shieldGlowLabel,shieldTest,shieldToggle,shieldMeasure,shieldBench,shieldFrozen,shieldResume,shieldResult);document.body.appendChild(shieldPanel);
        shieldToggle.onclick=function(){shieldOn=!shieldOn;applyShieldOptics();};applyShieldOptics();
        shieldFrozen.onclick=function(){if(texturesReady&&presentation.shieldSummary().visible)void benchmarkShields();};
        shieldResume.onclick=function(){holdShieldPreview();presentation.setShieldPreview(null);if(paused)resume();else pause();};
        shieldBench.onclick=function(){holdShieldPreview();presentation.setShieldPreview(null);shieldPending=true;shieldResult.textContent='Waiting for a visible shield hit...';if(paused)resume();};
    }
    async function benchmarkShields(){
        if(benchmarking)return;shieldPreviewPlaying=false;hitPreview.textContent='Play repeating hits / 0.7 s';shieldPending=false;pause();benchmarking=true;shieldToggle.disabled=true;shieldBench.disabled=true;shieldFrozen.disabled=true;shieldResume.disabled=true;shieldPanel.querySelectorAll('select,input,button').forEach(function(c){if(c instanceof HTMLSelectElement||c instanceof HTMLInputElement||c instanceof HTMLButtonElement)c.disabled=true;});
        var snapshot=view(),art=presentation.appearance(),settings=diagnostics.settings(),startWidth=host.clientWidth,startHeight=host.clientHeight;
        if(watch){art.allyArt=watch.replay.options.allyHull;art.enemyArt=watch.replay.options.enemyHull;}
        var active=presentation.shieldSummary();
        /** @type {{on:boolean,cpu:number,total:number,cadence:number,draws:number,triangles:number,width:number,height:number}[]} */var rows=[];
        try{
            for(var on of [false,true,true,false]){
                presentation.setShields(on);var previous=0;
                for(var i=0;i<70;i++){
                    var stamp=await new Promise(/** @param {(t:number)=>void} resolve */function(resolve){requestAnimationFrame(resolve);});
                    if(document.hidden||host.clientWidth!==startWidth||host.clientHeight!==startHeight)throw new Error('Hidden or resized viewport; rerun');
                    var begin=performance.now();presentation.render(snapshot,art,settings,0);var cpu=performance.now()-begin;presentation.completeFrame();var total=performance.now()-begin,stats=presentation.renderStats();
                    if(i>=10)rows.push({on:on,cpu:cpu,total:total,cadence:stamp-previous,draws:stats.scene.drawCalls+stats.sky.drawCalls,triangles:stats.scene.triangles+stats.sky.triangles,width:stats.scene.width,height:stats.scene.height});previous=stamp;
                    shieldResult.textContent='Frozen dogfight ABBA: '+rows.length+' / 240 samples';
                }
            }
            var lines=['Real duel frozen at '+snapshot.combat.time.toFixed(2)+'s; '+(shieldAngular?shieldAmount+' degrees':'2px')+(shieldQuery.get('shields')==='default'?'; fighter 4 / capital 32 hit limits':'; 4 tracked waves max/ship'),active.visible+' visible shields / '+active.waves+' active waves',rows[0].width+' x '+rows[0].height+' backing; DPR '+window.devicePixelRatio,'10 warmup + 60 samples/block, ABBA'];
            [false,true].forEach(function(on){var r=rows.filter(function(row){return row.on===on;});
                /** @param {'cpu'|'total'|'cadence'} key */function pair(key){var a=r.map(function(row){return row[key];}).sort(function(a,b){return a-b;});return a[Math.floor(a.length*.5)].toFixed(2)+' / '+a[Math.floor(a.length*.95)].toFixed(2);}
                lines.push((on?'ON':'OFF')+': submit median/p95 '+pair('cpu')+' ms; synchronized '+pair('total')+' ms; cadence '+pair('cadence')+' ms; '+r[0].draws+' draws / '+r[0].triangles+' triangles');
            });lines.push('Synchronized includes driver, GPU wait + 1px readback. Not GPU-only. AI/physics frozen. Resume to watch.');shieldResult.textContent=lines.join('\n');
        }catch(error){shieldResult.textContent=String(error);}finally{presentation.setShields(shieldAngular||shieldOn);benchmarking=false;shieldToggle.disabled=false;shieldBench.disabled=false;shieldFrozen.disabled=false;shieldResume.disabled=false;shieldPanel.querySelectorAll('select,input,button').forEach(function(c){if(c instanceof HTMLSelectElement||c instanceof HTMLInputElement||c instanceof HTMLButtonElement)c.disabled=false;});diagnostics.reset();}
    }

    if(aegis||activeMission.id==='evacuation'||activeMission.id==='battle'){
        var benchmarkButton=document.createElement('button'),benchmarkOutput=document.createElement('pre');
        benchmarkButton.textContent=activeMission.id==='scramble'?'Benchmark close furball on / off':activeMission.id==='battle'?'Benchmark distant squadrons on / off':activeMission.id==='evacuation'?'Benchmark depot / transports on / off':'Benchmark Aegis on / off';
        benchmarkOutput.id='aegis-benchmark-result';benchmarkOutput.style.whiteSpace='pre-wrap';
        get('perf-reset').after(benchmarkButton,benchmarkOutput);
        var capitalBenchmarkButton=(activeMission.id==='battle'||activeMission.id==='scramble')?document.createElement('button'):null;
        if(capitalBenchmarkButton){capitalBenchmarkButton.textContent='Benchmark capital ships on / off';benchmarkButton.after(capitalBenchmarkButton);capitalBenchmarkButton.onclick=function(){runBenchmark(true);};}
        benchmarkButton.onclick=function(){runBenchmark(false);};
        /** @param {boolean} capitals */async function runBenchmark(capitals){
            if(benchmarking)return;
            pause();benchmarking=true;benchmarkButton.disabled=true;if(capitalBenchmarkButton)capitalBenchmarkButton.disabled=true;
            var snapshot=view(),art=presentation.appearance(),settings=diagnostics.settings();
            /** @type {{on:boolean,cpu:number,interval:number,draws:number,triangles:number}[]} */var rows=[];
            try{
                for(var enabled of [false,true,true,false]){
                    if(aegis&&((activeMission.id!=='battle'&&activeMission.id!=='scramble')||capitals))presentation.setCapital(enabled?aegis:null);else if(activeMission.id==='evacuation')DW.evacuationScenery.visible=enabled;
                    var sampled=activeMission.id==='scramble'&&!capitals?Object.assign({},snapshot,{combat:Object.assign({},snapshot.combat,{enemies:snapshot.combat.enemies.filter(function(c,index){return enabled||index<6;})})}):activeMission.id==='battle'&&!capitals?Object.assign({},snapshot,{combat:Object.assign({},snapshot.combat,{enemies:snapshot.combat.enemies.filter(function(c){return enabled||!c.battleZone||c.battleZone.id===0;})})}):snapshot;
                    var previous=0;
                    for(var i=0;i<110;i++){
                        var stamp=await new Promise(/** @param {(t:number)=>void} resolve */function(resolve){requestAnimationFrame(resolve);});
                        var begin=performance.now();presentation.render(sampled,art,settings,0);
                        var cpu=performance.now()-begin,stats=presentation.renderStats();
                        if(i>=20)rows.push({on:enabled,cpu:cpu,interval:stamp-previous,draws:stats.scene.drawCalls+stats.sky.drawCalls,triangles:stats.scene.triangles+stats.sky.triangles});
                        previous=stamp;
                        benchmarkOutput.textContent='Frozen scene benchmark '+(rows.length)+' / 360 samples';
                    }
                }
                var lines=[(capitals?'Capital ships / ':'')+'Frozen scene / ABBA / 20 warm-up + 90 samples per block','Rendering only; AI and projectiles frozen.'];
                [false,true].forEach(function(on){var r=rows.filter(function(row){return row.on===on;});
                    /** @param {keyof Omit<typeof rows[number],'on'>} key */function mean(key){return r.reduce(function(n,row){return n+row[key];},0)/r.length;}
                    function percentile(/** @type {'cpu'|'interval'} */key,/** @type {number} */fraction){var sorted=r.map(function(row){return row[key];}).sort(function(a,b){return a-b;});return sorted[Math.floor((sorted.length-1)*fraction)];}
                    lines.push((on?'Asset ON':'Asset OFF')+': CPU median/p95 '+percentile('cpu',.5).toFixed(2)+' / '+percentile('cpu',.95).toFixed(2)+' ms, frame median/p95 '+percentile('interval',.5).toFixed(2)+' / '+percentile('interval',.95).toFixed(2)+' ms, '+mean('draws').toFixed(0)+' draws, '+mean('triangles').toFixed(0)+' triangles');
                });
                lines.push('CPU submission only; rAF includes browser pacing, not a GPU timer.');
                benchmarkOutput.textContent=lines.join('\n');
            }catch(error){benchmarkOutput.textContent='Benchmark interrupted: '+String(error);}
            finally{if(aegis)presentation.setCapital(aegis);else if(activeMission.id==='evacuation')DW.evacuationScenery.visible=true;pause();benchmarking=false;benchmarkButton.disabled=false;if(capitalBenchmarkButton)capitalBenchmarkButton.disabled=false;diagnostics.reset();}
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
        if(shieldStudy&&!paused&&watch&&watch.summary().done){reset();resume();}
        var appearance = presentation.appearance();
        if(watch){appearance.allyArt=watch.replay.options.allyHull==='blockout'?'':watch.replay.options.allyHull;appearance.enemyArt=watch.replay.options.enemyHull==='blockout'?'':watch.replay.options.enemyHull;}
        if (!watch) session.configureHulls(appearance.allyArt, appearance.enemyArt);
        var demand = cinematic?{throttle:0,throttleRate:0,fire:false,boost:false,pitch:0,yaw:0,roll:0}:controls.sample();
        if(director&&!paused){director.advance(elapsed);demoSeconds+=elapsed;}
        var simMs=0,capitalMs=0,phaseStart=performance.now();
        if (!paused) {
            var before = view(), beforeSpeed = Math.hypot.apply(null, view().state.velocity), lastHit = before.combat.lastHit, shield = before.combat.shield, fired = before.guns.fired, contact = before.contact;
            if (watch) {
                var previousTime = watch.summary().seconds;
                watch.advance(elapsed, Number(get('watch-speed').value));
                elapsed = watch.summary().seconds - previousTime;
                if (view().guns.fired > fired) DW.audio.playGunshot();
                if (view().combat.lastHit > lastHit) DW.audio.playImpact(1);
                if (watch.summary().done&&!shieldStudy) pause();
            } else session.advance(elapsed, demand, { profile: profile(), weapon: weapon() });
            var after = view();
            bridgeCue=bridgeFeedback.update(after.state,elapsed,!watch,!!DW.flightMissions.resolve(after.combat.mode).sky.wormhole);
            if(bridgeCue.crossed)DW.audio.playWormhole('cross');
            else if(bridgeCue.entered)DW.audio.playWormhole('enter');
            else if(bridgeCue.exited)DW.audio.playWormhole('exit');
            simMs=performance.now()-phaseStart;phaseStart=performance.now();
            if(aegis&&!watch)aegis.step(elapsed,after);
            capitalMs=performance.now()-phaseStart;
            if (!watch && after.contact && !contact) DW.audio.playImpact(2);
            DW.audio.setFlightEngine(elapsed, after.state.throttle, !!demand.boost, !paused && !watch && !after.contact && !after.combat.dead, {acceleration: elapsed > 0 ? Math.max(0, Math.hypot.apply(null, after.state.velocity) - beforeSpeed) / elapsed / Math.max(1, profile().maxVelocity[2] / profile().forwardAccel) : 0, damage: 1 - after.combat.hull / (after.combat.maxHull || after.combat.hull || 1), maneuver: Math.min(1, Math.abs(demand.pitch || 0) + Math.abs(demand.yaw || 0) + Math.abs(demand.roll || 0))});
            if (!watch) controls.haptics(elapsed, {throat:bridgeCue.proximity,transit:bridgeCue.crossed,boost: !after.contact && !after.combat.dead && !!demand.boost, hit: after.combat.lastHit > lastHit, shieldBreak: shield > 0 && after.combat.shield <= 0, fire: after.guns.fired > fired, contact: after.contact && !contact});
            if (!watch && after.combat.dead) {
                pause();
            }
            pose();
            updateStatus();
        }
        if(cinematic&&director){var captionNode=document.querySelector('.cinema-caption');if(captionNode)captionNode.textContent='DRIFTWORKS / '+director.label().toUpperCase()+' / C NEXT / ESC PAUSE';}
        var currentView = view();
        if(paused)bridgeCue=bridgeFeedback.update(currentView.state,0,false,!!DW.flightMissions.resolve(currentView.combat.mode).sky.wormhole);
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
        if(shieldPreviewPlaying)presentation.setShieldPreview(DW.flightShields.preview(shieldYaw,shieldPitch,Math.max(0,(t-shieldPreviewStart)/1000)));
        presentation.render(currentView, appearance, comparison, elapsed);
        if(shieldPending&&presentation.shieldSummary().visibleWave)void benchmarkShields();
        var presentationMs=performance.now()-phaseStart;phaseStart=performance.now();
        drawSubsystem(currentView.state);
        if(aegis){var readout=document.getElementById('aegis-flight-readout');if(readout)readout.textContent=aegis.readout();}
        var inputView = controls.view();
        if (watch) inputView.showMouseStick = false;
        if(!cinematic)flightHud.render(Object.assign({}, currentView, { units: units, paused: paused&&!shieldStudy, speakerId: comms.speakerId(), bridgeCue:bridgeCue, weapon: weapon() }, inputView, appearance));
        captureScreenshot();
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
    presentation.ready.then(function(loaded){
        texturesReady=loaded;textureLoadFailed=!loaded;
        get('fly').disabled=!loaded;
        get('fly').textContent=loaded?(cinematic?'Start demo':'Start flight'):'Textures unavailable';
        if(loaded){
            status.textContent=importError||'Ready - Start flight when ready';
            if(activeMission.id==='scramble'){controls.startUncaptured();}
            if(cinematic)resume();
            if(shieldStudy&&watch)resume();
        }else updateStatus();
    });
    if(importError)status.textContent=importError;
    requestAnimationFrame(frame);
}());
