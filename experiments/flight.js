(async function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    var get = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).experimentDom(document);
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks), model = DW.arcade, host = get('viewer');
    if(DW.flightMissions.current().sky.hyperbolic&&new URLSearchParams(location.search).get('flyby')==='1'){
        await DW.hyperbolicFlyby.mount(host);return;
    }
    var texturesReady=false,textureLoadFailed=false;
    get('fly').disabled=true;get('fly').textContent='Loading ship textures...';
    get('status').textContent='Loading ship textures and preparing graphics...';
    var activeMission=DW.flightMissions.current();
    if(activeMission.sky.gasGiant&&!DW.gasGiantWeather)await new Promise(/** @param {(value:boolean)=>void} resolve */function(resolve){window.addEventListener('gas-weather-ready',function(){resolve(true);},{once:true});});
    var cinematic=activeMission.id==='cinematic';
    var impactWatch=!!activeMission.emptySpace&&!cinematic&&!activeMission.sky.hyperbolic;
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
    if(activeMission.sky.hyperbolic||aegisMode||activeMission.id==='battle'||activeMission.sky.wormhole||activeMission.id==='scramble'){try{await DW.aegisFlight.load();aegis=activeMission.sky.hyperbolic?DW.hyperbolicBattle.create():activeMission.id==='scramble'?DW.aegisFlight.create({state:{team:'ally',position:[0,0,1200],heading:0,velocity:[0,0,0],integrity:20000},opponent:{team:'enemy',position:[0,2000/DW.sim.METERS_PER_UNIT,1200],heading:0,velocity:[0,0,0],integrity:20000},unarmed:true}):cinematic?DW.aegisFlight.createBattle({bridge:true}):activeMission.sky.wormhole?DW.aegisFlight.createEllisPatrol():DW.aegisFlight.createBattle({battlefield:activeMission.id==='battle'});}catch(error){get('status').textContent='Aegis flight could not start: '+String(error);return;}}
    /** @type {import('./types').TerrainHit} */
    var environmentHit = function (start, end, bolt) {
            var asteroid = session.snapshot().asteroid;
            var terrain=DW.flightGuns.intersect(start, end, asteroid.radius, function (point) {
                return DW.asteroidTerrain.rockField(asteroid, /** @type {[number, number, number]} */ (DW.flightSession.rotateVector(point, -asteroid.rotation)));
            });
            var capital=aegis&&aegis.hit(start,end,bolt);
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
    if(activeMission.sky.hyperbolic){
        var curvatureLabel=document.createElement('label'),curvatureSelect=document.createElement('select');curvatureSelect.id='curvature-radius';
        curvatureLabel.textContent='Curvature radius';curvatureLabel.htmlFor=curvatureSelect.id;
        [300,350,400,650,1800,100000].forEach(function(r){var option=document.createElement('option');option.value=String(r);option.textContent=r+' m';curvatureSelect.appendChild(option);});curvatureSelect.value=String(activeMission.sky.hyperbolic);
        document.getElementById('flight-settings')?.append(curvatureLabel,curvatureSelect);curvatureSelect.onchange=function(){session.setCurvature(Number(curvatureSelect.value));reset();};
    }
    var ohioMusic = activeMission.id === 'ohio' ? DW.audio.createOhioMusic() : null;
    var ohioMusicStarted = false;
    var mixerHost=document.getElementById('flight-settings');
    if(mixerHost && ohioMusic) ohioMusic.mount(mixerHost);
    if(mixerHost)DW.audio.mountMixer(mixerHost);
    if(mixerHost&&activeMission.sky.wormhole&&!activeMission.sky.thinShell){
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
    var wormholeRendering=document.getElementById('wormhole-rendering'),shipStretching=/** @type {HTMLInputElement|null} */(document.getElementById('wormhole-stretching'));
    if(wormholeRendering&&shipStretching){
        wormholeRendering.hidden=!activeMission.sky.wormhole;
        shipStretching.checked=new URLSearchParams(location.search).get('bridgeShips')==='warped';
        if(activeMission.sky.wormhole)presentation.setShipStretching(shipStretching.checked);
        shipStretching.onchange=function(){presentation.setShipStretching(!!shipStretching&&shipStretching.checked);blurActiveControl();};
    }
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
        if (watch) return DW.retailWeapons[watch.replay.options.weapon < 0 ? DW.flightSim.defaultWeapon(model.profiles[watch.replay.options.profile]) : watch.replay.options.weapon];
        return DW.retailWeapons[Number(gunSelect.value)];
    }
    function gunLabels() {
        var w = weapon(), units=DW.flightMissions.resolve(get('combat-mode').value).units;
        get('gun-stats').textContent = Math.round(w.speed*units.speedScale)+' '+units.speedLabel + ' · ' + w.fireWait + ' s / volley · ' + Math.round(w.speed*w.lifetime*units.distanceScale)+' '+units.distanceLabel + ' range';
    }
    function banks() {
        gunSelect.textContent = '';
        var primary = DW.flightSim.defaultWeapon(profile()), indexes = [primary].concat(DW.retailWeapons.map(function (_, i) { return i; }).filter(function (i) { return i !== primary; }));
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
        if(aegis&&!aegisMode)aegis.reset(activeMission.id==='battle'||cinematic||activeMission.sky.hyperbolic?session.snapshot().combat:undefined);
        if(aegis&&aegis.spawnPlayer)session.respawn(aegis.spawnPlayer(session.snapshot().state));
        if(cinematic){session.setStartPosition([0,-10000/units,5000/units]);var observer=session.snapshot();observer.state.throttle=0;observer.combat.player.hp=observer.combat.player.maxHp=1e9;observer.combat.hull=observer.combat.maxHull=1e9;observer.combat.enabled=true;get('watch-panel').hidden=true;}
        if(aegis&&aegisMode){
            var snapshot=session.snapshot();aegis.reset(snapshot.combat);var oldEye=snapshot.state.eye.slice(),aegisStart=[-200/units,-1100/units,1200+220/units];
            DW.flightSim.participants(snapshot.combat).filter(function(c){return c.controller!=='input';}).forEach(function(c){c.pose.eye=c.pose.eye.map(function(v,i){return v+aegisStart[i]-oldEye[i];});});
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
    var studies=DW.flightStudies.mount({get watch(){return watch;},get paused(){return paused;},get texturesReady(){return texturesReady;},
        activeMission:activeMission,aegis:aegis,diagnostics:diagnostics,get:get,host:host,pause:pause,presentation:presentation,resume:resume,shipStretching:shipStretching,view:view});
    /** @param {number} t */
    function frame(t) {
        if(ohioMusic && !paused) ohioMusic.update();
        if(studies.benchmarking){requestAnimationFrame(frame);return;}
        var timing = diagnostics.beginFrame(t, paused);
        if (!timing) {
            requestAnimationFrame(frame);
            return;
        }
        var elapsed = timing.elapsed;
        if(studies.enabled&&!paused&&watch&&watch.summary().done){reset();resume();}
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
                if (watch.summary().done&&!studies.enabled) pause();
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
                if(aegis&&aegis.spawnPlayer){session.respawn(aegis.spawnPlayer(after.state));clear();}else pause();
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
        studies.beforeRender(t);
        presentation.render(currentView, appearance, comparison, elapsed);
        studies.afterRender();
        var presentationMs=performance.now()-phaseStart;phaseStart=performance.now();
        drawSubsystem(currentView.state);
        if(aegis){var readout=document.getElementById('aegis-flight-readout');if(readout)readout.textContent=aegis.readout();}
        var inputView = controls.view();
        if (watch) inputView.showMouseStick = false;
        if(!cinematic)flightHud.render(Object.assign({}, currentView, { units: units, paused: paused&&!studies.enabled, speakerId: comms.speakerId(), bridgeCue:bridgeCue, flightDemand:watch?undefined:demand, weapon: weapon() }, inputView, appearance));
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
            if(studies.enabled&&watch)resume();
        }else updateStatus();
    });
    if(importError)status.textContent=importError;
    requestAnimationFrame(frame);
}()).catch(/** @param {unknown} error */function(error){
    console.error(error);
    var status=document.getElementById('status'),button=document.getElementById('fly');
    if(status)status.textContent='Flight could not start. Reload to try again.';
    if(button instanceof HTMLButtonElement){button.disabled=true;button.textContent='Unable to start flight';}
});
