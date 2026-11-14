(async function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    var get = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).experimentDom(document);
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks), model = DW.arcade, host = get('viewer');
    if(DW.flightMissions.current().sky.hyperbolic&&new URLSearchParams(location.search).get('flyby')==='1'){
        await DW.hyperbolicFlyby.mount(host);return;
    }
    var texturesReady=false,textureLoadFailed=false,flightError='';
    get('fly').disabled=true;get('fly').textContent='Loading ship textures...';
    get('status').textContent='Loading ship textures and preparing graphics...';
    var activeMission=DW.flightMissions.current();
    var multiplayerMode=new URLSearchParams(location.search).get('multiplayer')==='1';
    /** @type {ReturnType<typeof import('./multiplayer-flight').mount>|null} */var multiplayer=null;
    if(multiplayerMode&&!DW.multiplayerFlight)await new Promise(/** @param {(value:void)=>void} resolve */function(resolve){window.addEventListener('multiplayer-flight-ready',function(){resolve();},{once:true});});
    if(['convoy','fleet-evacuation'].includes(activeMission.id))host.setAttribute('aria-label','Convoy escort / intercept raiders and protect thirty freighters');
    var battleMode=activeMission.id==='battle'||!!activeMission.combatSandbox;
    var cinematic=activeMission.id==='cinematic';
    var overviewMode=battleMode&&new URLSearchParams(location.search).get('view')==='overhead';
    var impactWatch=!!activeMission.emptySpace&&!activeMission.combatSandbox&&!cinematic&&!activeMission.sky.hyperbolic;
    if(impactWatch)get('combat-toggle').checked=false;
    if(activeMission.weaponsDisabled){
        get('combat-toggle').disabled=true;get('watch-panel').hidden=true;
        host.setAttribute('aria-label',['convoy','fleet-evacuation'].includes(activeMission.id)?'Escort thirty cargo vessels with two wingmates':activeMission.id==='jade-rime'?'Free flight near Rime, with the jade giant overhead':'Free flight above a jade gas giant');
        (['convoy','fleet-evacuation'].includes(activeMission.id)?['weapons']:['weapons','integrity','target-info']).forEach(function(id){var panel=document.getElementById(id);if(panel)panel.hidden=true;});
        var footer=document.querySelector('footer');if(footer)footer.textContent='W/S throttle · X stop · hold W at max / double-tap W boost · arrows steer · Q/E roll · A/D lateral · R/F vertical · Esc pause';
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
    if(activeMission.sky.hyperbolic||aegisMode||battleMode||activeMission.sky.wormhole||activeMission.id==='scramble'||['convoy','fleet-evacuation'].includes(activeMission.id)){try{await DW.aegisFlight.load();aegis=['convoy','fleet-evacuation'].includes(activeMission.id)?DW.convoyScenery.createArrivalFleet():activeMission.sky.hyperbolic?DW.hyperbolicBattle.create():activeMission.id==='scramble'?DW.aegisFlight.create({state:{team:'ally',position:[0,0,1200],heading:0,velocity:[0,0,0],integrity:20000},opponent:{team:'enemy',position:[0,2000/DW.sim.METERS_PER_UNIT,1200],heading:0,velocity:[0,0,0],integrity:20000},unarmed:true}):cinematic?DW.aegisFlight.createBattle({bridge:true}):activeMission.sky.wormhole?DW.aegisFlight.createEllisPatrol():DW.aegisFlight.createBattle({battlefield:battleMode});}catch(error){get('status').textContent='Aegis flight could not start: '+String(error);return;}}
    /** @type {import('./types').TerrainHit} */
    var environmentHit = function (start, end, bolt) {
            var asteroid = session.snapshot().asteroid;
            var terrain=bolt&&bolt.region?null:DW.flightGuns.intersect(start, end, asteroid.radius, function (point) {
                return DW.asteroidTerrain.rockField(asteroid, /** @type {[number, number, number]} */ (DW.flightSession.rotateVector(point, -asteroid.rotation)));
            });
            var capital=aegis&&aegis.hit(start,end,bolt);
            if(capital&&(!terrain||Math.hypot.apply(null,capital.map(function(v,i){return v-start[i];}))<Math.hypot.apply(null,terrain.map(function(v,i){return v-start[i];}))))return capital;
            return terrain;
        };
    environmentHit.allRegions=true;
    environmentHit.onImpact=function(point,bolt,combat){if(aegis&&aegis.damage)aegis.damage(point,bolt.weapon.damage,combat,bolt.region||0);};
    /** Sight remains available when empty-space missions suppress asteroid contact. @type {import('./types').TerrainHit} */
    var visibilityHit=function(start,end,probe){
        var mode=session.snapshot().combat.mode,empty=DW.flightMissions.resolve(mode).emptySpace||['evacuation','scramble','convoy','fleet-evacuation'].includes(mode);
        return empty?(aegis?aegis.hit(start,end,probe):null):environmentHit(start,end,probe);
    };
    visibilityHit.allRegions=true;
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
    var session = DW.flightSession.create({ seed: document.body.dataset.mission === 'asteroid-patrol' ? Math.floor(Math.random() * 4294967296) : undefined, terrainHit: environmentHit, visibilityHit:visibilityHit, surfaceFrame: function (asteroid, direction) {
            return DW.asteroidTerrain.surfaceFrame(asteroid, /** @type {[number, number, number]} */ (direction));
        }, onGunshot: function () {
            DW.audio.playGunshot();
        }, onMissileLaunch:function(){DW.audio.playMissileLaunch();}, onImpact: function () {
            DW.audio.playImpact(1);
        } });
    if(activeMission.sky.hyperbolic){
        var curvatureLabel=document.createElement('label'),curvatureSelect=document.createElement('select');curvatureSelect.id='curvature-radius';
        curvatureLabel.textContent='Curvature radius';curvatureLabel.htmlFor=curvatureSelect.id;
        [300,350,400,650,1800,100000].forEach(function(r){var option=document.createElement('option');option.value=String(r);option.textContent=r+' m';curvatureSelect.appendChild(option);});curvatureSelect.value=String(activeMission.sky.hyperbolic);
        document.getElementById('flight-settings')?.append(curvatureLabel,curvatureSelect);curvatureSelect.onchange=function(){session.setCurvature(Number(curvatureSelect.value));reset();};
    }
    var ohioMusic = activeMission.id === 'ohio' ? DW.audio.createOhioMusic() : null;
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
    var overviewCamera=overviewMode&&aegis?DW.flightWatch.battleOverview(aegis):null;
    var demoSeconds=0;
    var watchDuration=120,watchOpponentWeapon=-2;
    function view() {
        var snapshot=watch ? watch.snapshot(get('watch-camera').value === 'chase') : session.snapshot();
        if(overviewCamera)return Object.assign({},snapshot,{camera:overviewCamera});
        return director?Object.assign({},snapshot,{camera:director.camera(snapshot)}):snapshot;
    }
    // The initial reset below creates the sortie before any frame or input runs.
    var paused = true;
    var missileSettings=document.createElement('details'),missileSettingsKey='';
    missileSettings.id='missile-loadout';
    document.getElementById('flight-settings')?.appendChild(missileSettings);
    function updateMissileSettings(){
        var craft=session.snapshot().combat.player,rack=DW.flightMissiles.rack(craft),key=craft.profile.name+'|'+rack.banks.map(function(b){return b.name;}).join('|');
        if(key===missileSettingsKey)return;missileSettingsKey=key;
        missileSettings.replaceChildren();var summary=document.createElement('summary');summary.textContent='Missile loadout';missileSettings.appendChild(summary);
        var profile=DW.retailMissiles.profiles.find(function(p){return p.name===craft.profile.name;});
        rack.banks.forEach(function(bank,index){
            var label=document.createElement('label'),select=document.createElement('select');label.textContent='Secondary bank '+(index+1);select.setAttribute('aria-label',label.textContent);
            (profile?profile.allowed:[]).filter(function(name){return DW.retailMissiles.missiles.some(function(w){return w.name===name;});}).forEach(function(name){var option=document.createElement('option');option.value=name;option.textContent=name;select.appendChild(option);});
            if(!Array.from(select.options).some(function(o){return o.value===bank.name;})){var unavailable=document.createElement('option');unavailable.value=bank.name;unavailable.textContent=bank.name+' (unavailable)';select.appendChild(unavailable);}
            select.value=bank.name;label.appendChild(select);missileSettings.appendChild(label);
            select.onchange=function(){if(!paused)return;DW.flightMissiles.equipBank(session.snapshot().combat.player,index,select.value);missileSettingsKey='';updateMissileSettings();};
        });
        var note=document.createElement('small');note.textContent='Right mouse / B: fire missile. H: countermeasure. M: secondary bank. Aspect missiles need a steady target for homing. Changing type preserves remaining ammunition cargo; Reset rearms.';missileSettings.appendChild(note);
    }
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
        DW.audio.setMissileLock(0,{active:false,tracking:false,locked:false,progress:0,key:''});
        DW.audio.setFlightEngine(0, 0, false, false);
        controls.clear();
    }
    function updateStatus() {
        if(flightError){status.textContent=flightError;return;}
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
    var tacticalCamera = DW.flightWatch.tactical();
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
        if(multiplayerMode)session.prepareMultiplayer(multiplayer?multiplayer.isGuest():false);
        if(aegis&&!aegisMode)aegis.reset(activeMission.id==='fleet-evacuation'||battleMode||cinematic||activeMission.sky.hyperbolic?session.snapshot().combat:undefined);
        if(aegis&&aegis.spawnPlayer)session.respawn(aegis.spawnPlayer(session.snapshot().state));
        if(overviewMode&&aegis){overviewCamera=DW.flightWatch.battleOverview(aegis);session.setStartPosition(overviewCamera.eye);}
        if(cinematic){session.prepareCinematicObserver();get('watch-panel').hidden=true;}
        if(aegis&&aegisMode){aegis.reset(session.snapshot().combat);session.prepareAegisStudy();}
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
        if(multiplayerMode){get('combat-mode').disabled=get('diameter').disabled=get('combat-toggle').disabled=true;}
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
        if(flightError)return;
        if(!texturesReady){updateStatus();return;}
        if (!watch && session.snapshot().combat.dead) {
            updateStatus();
            return;
        }
        DW.audio.unlock();
        if(ohioMusic) ohioMusic.resumeIfStarted();
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
        if (cinematic||overviewMode){resume();return;}
        if (watch) { if (watch.summary().done) reset(); resume(); return; }
        if (session.snapshot().combat.dead)
            reset();
        if (controls.view().inputMode !== 'mouse') {
            resume();
            return;
        }
        controls.capture();
    };
    if(battleMode){
        var overviewLink=document.createElement('a');overviewLink.textContent=overviewMode?'Return to flight':'Watch battle from above';
        var overviewParams=new URLSearchParams(location.search);if(overviewMode)overviewParams.delete('view');else overviewParams.set('view','overhead');overviewLink.href='?'+overviewParams.toString();
        get('fly').after(overviewLink);
        if(overviewMode){
            document.body.classList.add('battle-overview');get('watch-panel').hidden=true;
            var overviewStyle=document.createElement('style');overviewStyle.textContent='body.battle-overview #launch,body.battle-overview #integrity,body.battle-overview #instruments,body.battle-overview #weapons,body.battle-overview #target-info,body.battle-overview header,body.battle-overview footer{display:none!important}#battle-overview-controls{position:fixed;right:12px;top:12px;z-index:30;width:265px;max-height:calc(100vh - 24px);overflow:auto;background:#07151ded;color:#d8e6ee;border:1px solid #547078;padding:12px;font:12px/1.5 monospace}#battle-overview-controls label,#battle-overview-controls small{display:block;margin-top:7px}#battle-overview-controls select{width:100%}#battle-overview-controls label:has(input[type=checkbox]){display:flex;align-items:center}#battle-overview-controls input[type=checkbox]{width:auto;margin:0 8px 0 0}#battle-overview-controls button{margin:5px 5px 8px 0}#battle-overview-controls a{color:#aadddf}';document.head.appendChild(overviewStyle);
            var overviewPanel=document.createElement('section');overviewPanel.id='battle-overview-controls';overviewPanel.setAttribute('aria-label','Overhead battle review');
            var overviewTitle=document.createElement('strong');overviewTitle.textContent='BATTLE / FIXED OVERHEAD VIEW';
            var overviewPlay=document.createElement('button');overviewPlay.textContent='Start battle';overviewPlay.onclick=function(){if(paused)resume();else pause();};
            var overviewRestart=document.createElement('button');overviewRestart.textContent='Restart battle';overviewRestart.onclick=function(){pause();reset();resume();};
            var overviewReadout=document.createElement('div');overviewReadout.id='battle-overview-readout';
            overviewPanel.append(overviewTitle,document.createElement('br'),overviewPlay,overviewRestart,overviewReadout,overviewLink);
            var effectMenu=document.getElementById('projectile-visual-style')?.closest('details');if(effectMenu){effectMenu.open=true;var presetControl=document.getElementById('gun-effect-preset'),effectSummary=effectMenu.querySelector('summary');if(presetControl&&presetControl.previousElementSibling&&effectSummary)effectSummary.after(presetControl.previousElementSibling,presetControl,...Array.from(effectMenu.querySelectorAll('label')).filter(function(label){return !!label.querySelector('input[type=checkbox]');}));overviewPanel.append(effectMenu);}
            document.body.append(overviewPanel);
        }
    }
    function nextWeapon() {
        if (watch) return;
        gunSelect.selectedIndex = (gunSelect.selectedIndex + 1) % gunSelect.options.length;
        gunLabels();
    }
    var controls = DW.flightControls.mount(host, {
        restart:function(){reset();resume();},
        pause: pause, resume: resume, captureFailure: captureFailure,
        keepFlyingOnBlur:function(){return !!multiplayer&&multiplayer.aiActive();},
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
    var backgroundPrevious=performance.now();
    /** @param {number} t @param {boolean} [background] */
    function frame(t,background) {
        if(document.hidden&&multiplayer&&multiplayer.aiActive()&&!background)return;
        if(paused)updateMissileSettings();
        if(ohioMusic && !paused) ohioMusic.update();
        if(studies.benchmarking)return;
        var timing = diagnostics.beginFrame(t, paused, !!(DW.flightVr&&DW.flightVr.forHost(host)?.active()));
        if (!timing) {
            return;
        }
        var elapsed = background?Math.min(1,Math.max(0,(t-backgroundPrevious)/1000)):timing.elapsed;
        backgroundPrevious=t;
        if(studies.enabled&&!paused&&watch&&watch.summary().done){reset();resume();}
        var appearance = presentation.appearance();
        if(watch){appearance.allyArt=watch.replay.options.allyHull==='blockout'?'':watch.replay.options.allyHull;appearance.enemyArt=watch.replay.options.enemyHull==='blockout'?'':watch.replay.options.enemyHull;}
        if (!watch) session.configureHulls(appearance.allyArt, appearance.enemyArt);
        var pilotDemand=controls.sample(view().state.throttle);
        var demand = cinematic||overviewMode?{throttle:0,throttleRate:0,fire:false,boost:false,pitch:0,yaw:0,roll:0}:pilotDemand;
        if(multiplayer)demand=multiplayer.pilotDemand(demand,elapsed);
        if(multiplayer)multiplayer.update(demand,paused);
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
        var seekerView=view(),seekerRack=DW.flightMissiles.rack(seekerView.combat.player),seekerWeapon=DW.flightMissiles.weapon(seekerView.combat.player);
        DW.audio.setMissileLock(elapsed,{active:!paused&&!watch&&!cinematic&&!overviewMode&&!seekerView.combat.dead&&!!seekerWeapon&&seekerWeapon.homing==='aspect',tracking:!!seekerRack.indicator,locked:seekerRack.locked,progress:seekerWeapon&&seekerWeapon.minLockTime?seekerRack.lock/seekerWeapon.minLockTime:0,key:seekerRack.targetId+'/'+seekerRack.bank+'/'+(seekerWeapon?seekerWeapon.name:'')});
        if(cinematic&&director){var captionNode=document.querySelector('.cinema-caption');if(captionNode)captionNode.textContent='DRIFTWORKS / '+director.label().toUpperCase()+' / C NEXT / ESC PAUSE';}
        var currentView = view();
        if (!watch && !cinematic && !overviewMode && !(DW.flightVr&&DW.flightVr.forHost(host)?.active())) {
            tacticalCamera(currentView, controls.view().tactical, paused ? 1 : timing.elapsed);
            presentation.pose(currentView.camera || currentView.state);
            currentView.world = view().world;
        }
        document.body.classList.toggle('tactical-view', !watch && !cinematic && !paused && !!currentView.camera);
        if(paused)bridgeCue=bridgeFeedback.update(currentView.state,0,false,!!DW.flightMissions.resolve(currentView.combat.mode).sky.wormhole);
        if (!paused && !watch) session.acquireTarget();
        if (!paused) {
            if (!watch) session.advanceScenery(elapsed);
            if(!ohioMusic || ohioMusic.canSpeak()) {
                comms.update(elapsed, currentView.combat, currentView.state);
            }
            if(ohioMusic)ohioMusic.updateMission(currentView.combat,function(){comms.pause();});
        }
        if(background){DW.audio.setFlightEngine(0,0,false,false);return;}
        var comparison = diagnostics.settings();
        phaseStart=performance.now();
        studies.beforeRender(t);
        presentation.render(currentView, appearance, comparison, elapsed);
        studies.afterRender();
        var presentationMs=performance.now()-phaseStart;phaseStart=performance.now();
        drawSubsystem(currentView.state);
        if(aegis){var readout=document.getElementById('aegis-flight-readout');if(readout)readout.textContent=aegis.readout();}
        if(overviewMode&&overviewPlay&&overviewReadout){overviewPlay.textContent=texturesReady?(paused?'Play battle':'Pause battle'):'Loading ships...';overviewPlay.disabled=!texturesReady;overviewReadout.textContent=(paused?'PAUSED / ':'')+currentView.combat.time.toFixed(1)+' s / '+(aegis?aegis.telemetry().hits:0)+' capital hits';}
        var inputView = controls.view();
        if (watch) inputView.showMouseStick = false;
        if(!cinematic&&!overviewMode)flightHud.render(Object.assign({}, currentView, { units: units, paused: paused&&!studies.enabled, speakerId: comms.speakerId(), bridgeCue:bridgeCue, flightDemand:watch?undefined:demand, weapon: weapon() }, inputView, appearance));
        presentation.vrOverlay(currentView.combat.hitFlash);
        captureScreenshot();
        if (watch) get('combat-status').textContent = 'AI DUEL / ' + (watch.summary().category === 'perfect' ? 'PERFECT' : watch.summary().flavor.toUpperCase()) + ' VS ' + currentView.combat.enemies[0].pilot.toUpperCase();
        updateWatch();
        var hudMs=performance.now()-phaseStart;
        diagnostics.endFrame(timing, paused, comparison, presentation.renderStats);
        if(aegis&&get('perf-enabled').checked){var perf=get('perf-overlay');perf.textContent=perf.textContent.split('\nStages:')[0]+'\nStages: sim '+simMs.toFixed(1)+' / PD '+capitalMs.toFixed(1)+' / scene '+presentationMs.toFixed(1)+' / HUD '+hudMs.toFixed(1)+' ms';}
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
    if(multiplayerMode){
        const net=DW.multiplayerFlight;
        multiplayer=net.mount(session,()=>({profile:Number(select.value),weapon:DW.retailWeapons.indexOf(weapon()),model:DW.shipCatalog.craftModel(session.snapshot().combat.player,presentation.appearance().allyArt,0).id}),{resume:resume,pause:pause,ready:()=>texturesReady&&!flightError});
        get('watch-panel').hidden=true;get('combat-toggle').checked=false;get('combat-toggle').disabled=true;get('combat-mode').disabled=true;get('diameter').disabled=true;
        const networkHeading=document.querySelector('header h1');if(networkHeading)networkHeading.textContent='DRIFTWORKS / MULTIPLAYER FLIGHT';
        var hint=document.querySelector('#launch > p');if(hint)hint.textContent='Fly with a wingmate. Open Multiplayer to connect. Each pilot controls their own fighter; shared combat is not enabled yet.';
    }
    presentation.ready.then(function(loaded){
        texturesReady=loaded;textureLoadFailed=!loaded;
        get('fly').disabled=!loaded;
        get('fly').textContent=loaded?(cinematic?'Start demo':'Start flight'):'Textures unavailable';
        if(loaded){
            status.textContent=importError||(['convoy','fleet-evacuation'].includes(activeMission.id)?'Rendezvous / Join the convoy and take up escort stations. Tab cycles hostiles; L locks; Space or click fires.':'Ready - Start flight when ready');
            if(activeMission.id==='scramble'){controls.startUncaptured();}
            if(cinematic)resume();
            if(studies.enabled&&watch)resume();
        }else updateStatus();
    });
    if(importError)status.textContent=importError;
    /** @param {number} t @param {boolean} [background] */
    function runFrame(t,background){
        if(flightError)return;
        try{frame(t,background);}catch(error){
            console.error('Flight frame failed',error);
            flightError='Flight stopped: '+String(error)+'. Reload to retry; console has the full stack trace.';
            try{pause();}catch(pauseError){console.error('Flight cleanup failed',pauseError);}
            // Silence persistent engine audio even if another pause handler failed.
            DW.audio.setFlightEngine(0,0,false,false);
            document.body.classList.remove('flight-active');
            get('fly').disabled=true;get('fly').textContent='Flight stopped / reload';
            status.textContent=flightError;
        }
    }
    presentation.setAnimationLoop(function(t){runFrame(t);});
    if(multiplayer){
        document.addEventListener('visibilitychange',function(){backgroundPrevious=performance.now();diagnostics.resetSimulationClock();});
        const backgroundTimer=setInterval(function(){if(document.hidden&&!paused&&multiplayer&&multiplayer.aiActive())runFrame(performance.now(),true);},100);
        window.addEventListener('pagehide',function(){clearInterval(backgroundTimer);});
    }
}()).catch(/** @param {unknown} error */function(error){
    console.error(error);
    var status=document.getElementById('status'),button=document.getElementById('fly');
    if(status)status.textContent='Flight could not start: '+String(error)+'. Reload to retry; console has the full stack trace.';
    if(button instanceof HTMLButtonElement){button.disabled=true;button.textContent='Unable to start flight';}
});
