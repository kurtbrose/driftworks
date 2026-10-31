(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    /** @param {import('./types').FlightStudiesHost} owner */
    function mount(owner){
    // Frozen-snapshot render A/B: same camera, actors and settings, ABBA order.
    var benchmarking=false;
    var shieldQuery=new URLSearchParams(location.search),shieldStudy=['whole','own','default'].includes(shieldQuery.get('shields')||''),shieldOn=true,shieldPending=false;
    var shieldPreviewPlaying=false,shieldPreviewStart=0,shieldYaw=0,shieldPitch=0;
    var shieldAngular=shieldQuery.get('shields')==='default'||shieldQuery.get('shieldUnits')==='angle',shieldAmount=.35;
    if(shieldQuery.get('shields')==='own')owner.get('watch-camera').value='cockpit';
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
        function applyShieldOptics(){shieldAngular=shieldUnits.value!=='legacy';shieldAmount=shieldAngular?Number(shieldUnits.value):2;owner.presentation.setShields(shieldAngular||shieldOn);owner.presentation.setShieldOptics(shieldAngular?(shieldOn?shieldAmount:0):null,shieldGlow.checked);shieldToggle.textContent=shieldAngular?'Displacement '+(shieldOn?shieldAmount+' degrees':'ZERO / same glow'):'Whole-image shields '+(shieldOn?'ON':'OFF')+' / 2px';}
        shieldUnits.onchange=applyShieldOptics;shieldGlow.onchange=applyShieldOptics;
        var hitPreview=document.createElement('button');hitPreview.textContent='Play repeating hits / 0.7 s';
        function holdShieldPreview(){shieldPreviewPlaying=false;hitPreview.textContent='Play repeating hits / 0.7 s';}
        if(shieldQuery.get('shields')==='own'){
            var directionPanel=document.createElement('div'),pad=document.createElement('div'),marker=document.createElement('span'),directionReadout=document.createElement('div'),yawInput=document.createElement('input'),pitchInput=document.createElement('input');
            pad.setAttribute('aria-label','Drag shield hit direction');pad.style.cssText='position:relative;width:100%;height:110px;user-select:none;touch-action:none;cursor:crosshair;border:1px solid #70caff;margin:8px 0;background:linear-gradient(90deg,transparent 49.7%,#426674 50%,transparent 50.3%),linear-gradient(transparent 49.5%,#426674 50%,transparent 50.5%),#102938';
            pad.textContent='← behind / left · FRONT · right / behind →';marker.style.cssText='position:absolute;width:12px;height:12px;border:2px solid #8cdbff;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none';pad.appendChild(marker);
            yawInput.type=pitchInput.type='range';yawInput.min='-180';yawInput.max='180';pitchInput.min='-90';pitchInput.max='90';yawInput.value=pitchInput.value='0';yawInput.setAttribute('aria-label','Hit yaw degrees');pitchInput.setAttribute('aria-label','Hit elevation degrees');
            function updateDirection(){shieldYaw=Number(yawInput.value);shieldPitch=Number(pitchInput.value);marker.style.left=((shieldYaw+180)/360*100)+'%';marker.style.top=((90-shieldPitch)/180*100)+'%';directionReadout.textContent='Yaw '+shieldYaw+'° / elevation '+shieldPitch+'° / hits every 0.7 s. '+(Math.cos(shieldYaw*Math.PI/180)*Math.cos(shieldPitch*Math.PI/180)<-.2?'Behind: waves may fade before reaching the forward view.':'Camera held still; sky and scene refract, HUD stays sharp.');if(!shieldPreviewPlaying){shieldPreviewStart=performance.now();owner.presentation.setShieldPreview(DW.flightShields.preview(shieldYaw,shieldPitch,.12));}}
            directionPanel.append(hitPreview,pad,directionReadout,yawInput,pitchInput);
            [['Front',0,0],['Left',-90,0],['Right',90,0],['Behind',180,0],['Above',0,90],['Below',0,-90]].forEach(function(preset){var button=document.createElement('button');button.textContent=String(preset[0]);button.onclick=function(){owner.pause();yawInput.value=String(preset[1]);pitchInput.value=String(preset[2]);updateDirection();};directionPanel.appendChild(button);});
            yawInput.oninput=pitchInput.oninput=updateDirection;
            /** @param {PointerEvent} e */function dragDirection(e){var rect=pad.getBoundingClientRect();yawInput.value=String(Math.round(Math.max(-180,Math.min(180,(e.clientX-rect.left)/rect.width*360-180))));pitchInput.value=String(Math.round(Math.max(-90,Math.min(90,90-(e.clientY-rect.top)/rect.height*180))));updateDirection();}
            pad.onpointerdown=function(e){pad.setPointerCapture(e.pointerId);dragDirection(e);};pad.onpointermove=function(e){if(pad.hasPointerCapture(e.pointerId))dragDirection(e);};
            hitPreview.onclick=function(){if(shieldPreviewPlaying){holdShieldPreview();return;}owner.pause();shieldGlow.checked=true;shieldOn=true;if(!shieldAngular||shieldAmount===0)shieldUnits.value='0.75';applyShieldOptics();shieldPreviewStart=performance.now();shieldPreviewPlaying=true;hitPreview.textContent='Pause hit animation';shieldResult.textContent='Repeating directional preview / fixed camera and sky / visual hits only. Drag the box or choose a direction. Blue glow enabled.';};
            updateDirection();owner.presentation.setShieldPreview(null);shieldPanel.appendChild(directionPanel);
        }

        shieldTest.onclick=function(){holdShieldPreview();owner.presentation.setShieldPreview(null);owner.pause();owner.presentation.injectShieldHit();shieldResult.textContent='Scripted hit / frozen phase. Toggle displacement to ZERO for the same glow without bending. Choose 0.35–1.5 degrees to compare strengths; resume to see motion.';};
        var shieldMeasure=document.createElement('button');shieldMeasure.textContent='Measure frozen displacement';
        shieldMeasure.onclick=function(){
            if(!owner.texturesReady||benchmarking||!shieldAngular)return;
            holdShieldPreview();owner.pause();var snapshot=owner.view(),art=owner.presentation.appearance(),settings=owner.diagnostics.settings();if(owner.watch){art.allyArt=owner.watch.replay.options.allyHull;art.enemyArt=owner.watch.replay.options.enemyHull;}
            var source=owner.host.querySelector('canvas[aria-label="3D tactical scene"]'),sky=owner.host.querySelector('canvas.flight-skybox');if(!(source instanceof HTMLCanvasElement)||!(sky instanceof HTMLCanvasElement))return;
            var w=source.width,h=source.height;
            /** @param {number} angle */function capture(angle){owner.presentation.setShieldOptics(angle,shieldGlow.checked);owner.presentation.render(snapshot,art,settings,0);var c=document.createElement('canvas');c.width=w;c.height=h;var ctx=c.getContext('2d');if(!ctx)throw new Error('Capture unavailable');ctx.drawImage(/** @type {HTMLCanvasElement} */(sky),0,0,w,h);ctx.drawImage(/** @type {HTMLCanvasElement} */(source),0,0);return ctx.getImageData(0,0,w,h).data;}
            try{capture(0);capture(shieldAmount);var a=capture(0),aa=capture(0),b=capture(shieldAmount),bb=capture(shieldAmount),aaa=capture(0),d=DW.shieldPixelDiff.compare(a,b,[aa,aaa],[bb]);shieldResult.textContent=(d.noise?'INVALID / '+d.noise+' unstable pixels':'Repeat controls: exact match')+'\nFrozen '+snapshot.combat.time.toFixed(3)+' s; '+w+' x '+h+'; '+shieldAmount+' degrees vs zero; same glow\n'+d.changed+' changed pixels ('+(100*d.changed/(w*h)).toFixed(3)+'% of viewport)\n'+d.visibleChanges+' at ≥3/255; '+d.strong+' at ≥10/255; max '+d.max+'/255. Byte thresholds, not perceptual visibility. Scene only; HUD excluded.';}
            catch(error){shieldResult.textContent=String(error);}finally{applyShieldOptics();}
        };
        shieldPanel.append(shieldHint,document.createElement('br'),shieldUnits,shieldGlowLabel,shieldTest,shieldToggle,shieldMeasure,shieldBench,shieldFrozen,shieldResume,shieldResult);document.body.appendChild(shieldPanel);
        shieldToggle.onclick=function(){shieldOn=!shieldOn;applyShieldOptics();};applyShieldOptics();
        shieldFrozen.onclick=function(){if(owner.texturesReady&&owner.presentation.shieldSummary().visible)void benchmarkShields();};
        shieldResume.onclick=function(){holdShieldPreview();owner.presentation.setShieldPreview(null);if(owner.paused)owner.resume();else owner.pause();};
        shieldBench.onclick=function(){holdShieldPreview();owner.presentation.setShieldPreview(null);shieldPending=true;shieldResult.textContent='Waiting for a visible shield hit...';if(owner.paused)owner.resume();};
    }
    async function benchmarkShields(){
        if(benchmarking)return;shieldPreviewPlaying=false;hitPreview.textContent='Play repeating hits / 0.7 s';shieldPending=false;owner.pause();benchmarking=true;shieldToggle.disabled=true;shieldBench.disabled=true;shieldFrozen.disabled=true;shieldResume.disabled=true;shieldPanel.querySelectorAll('select,input,button').forEach(function(c){if(c instanceof HTMLSelectElement||c instanceof HTMLInputElement||c instanceof HTMLButtonElement)c.disabled=true;});
        var snapshot=owner.view(),art=owner.presentation.appearance(),settings=owner.diagnostics.settings(),startWidth=owner.host.clientWidth,startHeight=owner.host.clientHeight;
        if(owner.watch){art.allyArt=owner.watch.replay.options.allyHull;art.enemyArt=owner.watch.replay.options.enemyHull;}
        var active=owner.presentation.shieldSummary();
        /** @type {{on:boolean,cpu:number,total:number,cadence:number,draws:number,triangles:number,width:number,height:number}[]} */var rows=[];
        try{
            for(var on of [false,true,true,false]){
                owner.presentation.setShields(on);var previous=0;
                for(var i=0;i<70;i++){
                    var stamp=await new Promise(/** @param {(t:number)=>void} resolve */function(resolve){requestAnimationFrame(resolve);});
                    if(document.hidden||owner.host.clientWidth!==startWidth||owner.host.clientHeight!==startHeight)throw new Error('Hidden or resized viewport; rerun');
                    var begin=performance.now();owner.presentation.render(snapshot,art,settings,0);var cpu=performance.now()-begin;owner.presentation.completeFrame();var total=performance.now()-begin,stats=owner.presentation.renderStats();
                    if(i>=10)rows.push({on:on,cpu:cpu,total:total,cadence:stamp-previous,draws:stats.scene.drawCalls+stats.sky.drawCalls,triangles:stats.scene.triangles+stats.sky.triangles,width:stats.scene.width,height:stats.scene.height});previous=stamp;
                    shieldResult.textContent='Frozen dogfight ABBA: '+rows.length+' / 240 samples';
                }
            }
            var lines=['Real duel frozen at '+snapshot.combat.time.toFixed(2)+'s; '+(shieldAngular?shieldAmount+' degrees':'2px')+(shieldQuery.get('shields')==='default'?'; fighter 4 / capital 32 hit limits':'; 4 tracked waves max/ship'),active.visible+' visible shields / '+active.waves+' active waves',rows[0].width+' x '+rows[0].height+' backing; DPR '+window.devicePixelRatio,'10 warmup + 60 samples/block, ABBA'];
            [false,true].forEach(function(on){var r=rows.filter(function(row){return row.on===on;});
                /** @param {'cpu'|'total'|'cadence'} key */function pair(key){var a=r.map(function(row){return row[key];}).sort(function(a,b){return a-b;});return a[Math.floor(a.length*.5)].toFixed(2)+' / '+a[Math.floor(a.length*.95)].toFixed(2);}
                lines.push((on?'ON':'OFF')+': submit median/p95 '+pair('cpu')+' ms; synchronized '+pair('total')+' ms; cadence '+pair('cadence')+' ms; '+r[0].draws+' draws / '+r[0].triangles+' triangles');
            });lines.push('Synchronized includes driver, GPU wait + 1px readback. Not GPU-only. AI/physics frozen. Resume to watch.');shieldResult.textContent=lines.join('\n');
        }catch(error){shieldResult.textContent=String(error);}finally{owner.presentation.setShields(shieldAngular||shieldOn);benchmarking=false;shieldToggle.disabled=false;shieldBench.disabled=false;shieldFrozen.disabled=false;shieldResume.disabled=false;shieldPanel.querySelectorAll('select,input,button').forEach(function(c){if(c instanceof HTMLSelectElement||c instanceof HTMLInputElement||c instanceof HTMLButtonElement)c.disabled=false;});owner.diagnostics.reset();}
    }

    if(owner.activeMission.sky.wormhole&&owner.shipStretching){
        var stretchBenchmark=document.createElement('button'),stretchResult=document.createElement('pre');
        stretchBenchmark.textContent='Benchmark rigid / stretched ships';stretchResult.id='stretch-benchmark-result';stretchResult.style.whiteSpace='pre-wrap';
        owner.get('perf-reset').after(stretchBenchmark,stretchResult);
        stretchBenchmark.onclick=async function(){
            if(benchmarking||!owner.texturesReady||!owner.shipStretching)return;
            owner.pause();benchmarking=true;
            var initial=owner.shipStretching.checked,snapshot=owner.view(),art=owner.presentation.appearance(),settings=owner.diagnostics.settings();
            var canvas=/** @type {HTMLCanvasElement|null} */(owner.host.querySelector('canvas[aria-label="3D tactical scene"]'));
            var timer=DW.flightPerformance.gpuTimer(canvas),dimensions=[owner.host.clientWidth,owner.host.clientHeight,window.devicePixelRatio,canvas&&canvas.width,canvas&&canvas.height].join(',');
            var controls=/** @type {(HTMLInputElement|HTMLSelectElement|HTMLButtonElement)[]} */(Array.from(owner.get('launch').querySelectorAll('input,select,button')));
            var disabled=controls.map(function(c){return c.disabled;});controls.forEach(function(c){c.disabled=true;});
            /** @type {{stretch:boolean;cpu:number;interval:number;gpu:number|null;draws:number;triangles:number}[]} */var rows=[];
            function unchanged(){if(document.hidden||dimensions!==[owner.host.clientWidth,owner.host.clientHeight,window.devicePixelRatio,canvas&&canvas.width,canvas&&canvas.height].join(','))throw new Error('Hidden or resized viewport invalidates comparison');}
            try{
                for(var enabled of [false,true,true,false]){
                    owner.presentation.setShipStretching(enabled);var previous=0;
                    for(var i=0;i<110;i++){
                        var stamp=await new Promise(/** @param {(t:number)=>void} resolve */function(resolve){requestAnimationFrame(resolve);});
                        unchanged();timer.poll();
                        let row={stretch:enabled,cpu:0,interval:previous?stamp-previous:0,gpu:/** @type {number|null} */(null),draws:0,triangles:0};
                        // Warm-up frames also drain queries, but never enter the sample set.
                        var measure=i>=20?function(){return timer.begin(function(ms){row.gpu=ms;});}:undefined;
                        var start=performance.now();owner.presentation.render(snapshot,art,settings,0,measure);
                        row.cpu=performance.now()-start;var stats=owner.presentation.renderStats();row.draws=stats.scene.drawCalls+stats.sky.drawCalls;row.triangles=stats.scene.triangles+stats.sky.triangles;
                        if(i>=20)rows.push(row);previous=stamp;
                        stretchResult.textContent='Frozen rigid / stretch benchmark: '+rows.length+' / 360 samples';
                    }
                }
                for(var wait=0;timer.pending()&&wait<120;wait++){await new Promise(/** @param {(t:number)=>void} resolve */function(resolve){requestAnimationFrame(resolve);});unchanged();timer.poll();}
                var lines=['Frozen wormhole / rigid-stretch-stretch-rigid','Renderer: '+timer.renderer,'20 warm-up + 90 samples per block; simulation frozen.','Host width,height,DPR,scene backing width,height: '+dimensions];
                /** @param {number[]} values */function metric(values){if(!values.length)return 'unavailable';values.sort(function(a,b){return a-b;});return values[Math.floor((values.length-1)*.5)].toFixed(2)+' / '+values[Math.floor((values.length-1)*.95)].toFixed(2)+' ms';}
                [false,true].forEach(function(on){var group=rows.filter(function(r){return r.stretch===on;}),gpu=group.filter(function(r){return r.gpu!==null;}).map(function(r){return /** @type {number} */(r.gpu);});
                    lines.push((on?'STRETCHED':'RIGID')+': CPU median/p95 '+metric(group.map(function(r){return r.cpu;}))+', frame interval '+metric(group.map(function(r){return r.interval;})));
                    lines.push('Scene GPU median/p95 '+(timer.available&&timer.valid()&&gpu.length>=group.length*.9?metric(gpu):'unavailable / unsupported, disjoint or insufficient samples')+' ('+gpu.length+'/'+group.length+')');
                    lines.push('Draws '+Math.round(group.reduce(function(n,r){return n+r.draws;},0)/group.length)+' / triangles '+Math.round(group.reduce(function(n,r){return n+r.triangles;},0)/group.length));
                });
                lines.push('Scene GPU includes the wormhole compositor; excludes the separate sky context. Frame intervals include browser pacing. CPU is submission time.');
                stretchResult.textContent=lines.join('\n');
            }catch(error){stretchResult.textContent='Benchmark interrupted: '+String(error);}
            finally{timer.dispose();owner.presentation.setShipStretching(initial);controls.forEach(function(c,i){c.disabled=disabled[i];});benchmarking=false;owner.pause();owner.diagnostics.reset();}
        };
    }

    if(owner.aegis||owner.activeMission.id==='convoy'||owner.activeMission.id==='evacuation'||owner.activeMission.id==='battle'||owner.activeMission.sky.hyperbolic){
        var benchmarkButton=document.createElement('button'),benchmarkOutput=document.createElement('pre');
        benchmarkButton.textContent=owner.activeMission.id==='convoy'?'Benchmark convoy on / off':owner.activeMission.sky.hyperbolic?'Benchmark fleet on / off':owner.activeMission.id==='scramble'?'Benchmark close furball on / off':owner.activeMission.id==='battle'?'Benchmark distant squadrons on / off':owner.activeMission.id==='evacuation'?'Benchmark depot / transports on / off':'Benchmark Aegis on / off';
        benchmarkOutput.id='aegis-benchmark-result';benchmarkOutput.style.whiteSpace='pre-wrap';
        owner.get('perf-reset').after(benchmarkButton,benchmarkOutput);
        var capitalBenchmarkButton=(owner.activeMission.id==='battle'||owner.activeMission.id==='scramble'||owner.activeMission.sky.hyperbolic)?document.createElement('button'):null;
        if(capitalBenchmarkButton){capitalBenchmarkButton.textContent='Benchmark capital ships on / off';benchmarkButton.after(capitalBenchmarkButton);capitalBenchmarkButton.onclick=function(){runBenchmark(true);};}
        benchmarkButton.onclick=function(){runBenchmark(false);};
        var surfaceBenchmarkButton=owner.aegis&&owner.aegis.setSurfaceDetail?document.createElement('button'):null;
        if(surfaceBenchmarkButton){surfaceBenchmarkButton.textContent='Benchmark capital surface detail';benchmarkButton.after(surfaceBenchmarkButton);surfaceBenchmarkButton.onclick=function(){runBenchmark(true,true);};}
        var turretBenchmarkButton=surfaceBenchmarkButton?document.createElement('button'):null;
        if(turretBenchmarkButton&&surfaceBenchmarkButton){turretBenchmarkButton.textContent='Benchmark turret finish';surfaceBenchmarkButton.after(turretBenchmarkButton);turretBenchmarkButton.onclick=function(){runBenchmark(true,true,'turrets');};}
        /** @param {boolean} capitals @param {boolean=} surfaces @param {'turrets'=} scope */async function runBenchmark(capitals,surfaces,scope){
            if(benchmarking)return;
            owner.pause();benchmarking=true;benchmarkButton.disabled=true;if(capitalBenchmarkButton)capitalBenchmarkButton.disabled=true;
            if(surfaceBenchmarkButton)surfaceBenchmarkButton.disabled=true;
            var dimensions=window.innerWidth+','+window.innerHeight+','+window.devicePixelRatio;
            var snapshot=owner.view(),art=owner.presentation.appearance(),settings=owner.diagnostics.settings();
            /** @type {{on:boolean,cpu:number,interval:number,draws:number,triangles:number}[]} */var rows=[];
            try{
                for(var enabled of [false,true,true,false]){
                    if(surfaces&&owner.aegis&&owner.aegis.setSurfaceDetail){owner.aegis.setSurfaceDetail(enabled,scope);owner.presentation.setCapital(owner.aegis);}else if(owner.aegis&&((owner.activeMission.id!=='battle'&&owner.activeMission.id!=='scramble'&&!owner.activeMission.sky.hyperbolic)||capitals))owner.presentation.setCapital(enabled?owner.aegis:null);else if(owner.activeMission.id==='evacuation')DW.evacuationScenery.visible=enabled;else if(owner.activeMission.id==='convoy')DW.convoyScenery.visible=enabled;
                    var sampled=owner.activeMission.sky.hyperbolic&&!capitals?Object.assign({},snapshot,{combat:Object.assign({},snapshot.combat,{enemies:enabled?snapshot.combat.enemies:[],wrecks:enabled?snapshot.combat.wrecks:[]})}):owner.activeMission.id==='scramble'&&!capitals?Object.assign({},snapshot,{combat:Object.assign({},snapshot.combat,{enemies:snapshot.combat.enemies.filter(function(c,index){return enabled||index<6;})})}):owner.activeMission.id==='battle'&&!capitals?Object.assign({},snapshot,{combat:Object.assign({},snapshot.combat,{enemies:snapshot.combat.enemies.filter(function(c){return enabled||!c.battleZone||c.battleZone.id===0;})})}):snapshot;
                    var previous=0;
                    for(var i=0;i<110;i++){
                        var stamp=await new Promise(/** @param {(t:number)=>void} resolve */function(resolve){requestAnimationFrame(resolve);});
                        if(document.hidden||dimensions!==window.innerWidth+','+window.innerHeight+','+window.devicePixelRatio)throw new Error('Hidden or resized viewport invalidates comparison');
                        var begin=performance.now();owner.presentation.render(sampled,art,settings,0);
                        var cpu=performance.now()-begin,stats=owner.presentation.renderStats();
                        if(i>=20)rows.push({on:enabled,cpu:cpu,interval:stamp-previous,draws:stats.scene.drawCalls+stats.sky.drawCalls,triangles:stats.scene.triangles+stats.sky.triangles});
                        previous=stamp;
                        benchmarkOutput.textContent='Frozen scene benchmark '+(rows.length)+' / 360 samples';
                    }
                }
                var lines=[(surfaces?(scope==='turrets'?'Turret finish / ':'Capital surface detail / '):capitals?'Capital ships / ':'')+'Frozen scene / ABBA / 20 warm-up + 90 samples per block','Rendering only; AI and projectiles frozen.'];
                [false,true].forEach(function(on){var r=rows.filter(function(row){return row.on===on;});
                    /** @param {keyof Omit<typeof rows[number],'on'>} key */function mean(key){return r.reduce(function(n,row){return n+row[key];},0)/r.length;}
                    function percentile(/** @type {'cpu'|'interval'} */key,/** @type {number} */fraction){var sorted=r.map(function(row){return row[key];}).sort(function(a,b){return a-b;});return sorted[Math.floor((sorted.length-1)*fraction)];}
                    lines.push((on?'Asset ON':'Asset OFF')+': CPU median/p95 '+percentile('cpu',.5).toFixed(2)+' / '+percentile('cpu',.95).toFixed(2)+' ms, frame median/p95 '+percentile('interval',.5).toFixed(2)+' / '+percentile('interval',.95).toFixed(2)+' ms, '+mean('draws').toFixed(0)+' draws, '+mean('triangles').toFixed(0)+' triangles');
                });
                lines.push('CPU submission only; rAF includes browser pacing, not a GPU timer.');
                benchmarkOutput.textContent=lines.join('\n');
            }catch(error){benchmarkOutput.textContent='Benchmark interrupted: '+String(error);}
            finally{if(owner.aegis){if(surfaces&&owner.aegis.setSurfaceDetail)owner.aegis.setSurfaceDetail(true,scope);owner.presentation.setCapital(owner.aegis);}else if(owner.activeMission.id==='evacuation')DW.evacuationScenery.visible=true;else if(owner.activeMission.id==='convoy')DW.convoyScenery.visible=true;owner.pause();benchmarking=false;benchmarkButton.disabled=false;if(capitalBenchmarkButton)capitalBenchmarkButton.disabled=false;if(surfaceBenchmarkButton)surfaceBenchmarkButton.disabled=false;owner.diagnostics.reset();}
        };
    }

        return {get benchmarking(){return benchmarking;},get enabled(){return shieldStudy;},
            /** @param {number} time */beforeRender:function(time){if(shieldPreviewPlaying)owner.presentation.setShieldPreview(DW.flightShields.preview(shieldYaw,shieldPitch,Math.max(0,(time-shieldPreviewStart)/1000)));},
            afterRender:function(){if(shieldPending&&owner.presentation.shieldSummary().visibleWave)void benchmarkShields();}};
    }
    DW.flightStudies={mount:mount};
}());
