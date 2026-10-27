(async function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    /** @param {string} id */function input(id){return /** @type {HTMLInputElement} */(document.getElementById(id));}
    var host=/** @type {HTMLElement} */(document.getElementById('viewer')),world=DW.sim.createInitialWorld(),units=DW.sim.METERS_PER_UNIT;
    world.asteroids=[];world.ships=[];world.platforms=[];world.wrecks=[];world.packets=[];world.combat.drones=[];world.selectedShipIds=[];world.camera={x:0,y:0,zoom:8};
    var scene=DW.scene3d.create(host,function(){return world;},function(w){world=w;},{study:true,viewer:true}),sky=DW.flightSkybox.create(host,{style:7,optics:false});
    sky.setStyle(7);world.camera.zoom=host.clientWidth*.82/(1335.42/units);
    scene.setStudyDiagnostics({mode:'normal',flat:false,scale:1,mothership:false,actors:true});scene.setOrbit({yaw:0,tilt:1.03,height:0});
    try{await DW.aegisFlight.load();}catch(error){input('status').textContent=String(error);return;}
    var rig=DW.aegisFlight.create({opponent:{team:'enemy',position:[0,0,0],heading:0,velocity:[0,0,0],integrity:20000},unarmed:true,state:{team:'ally',position:[0,0,0],heading:0,velocity:[0,0,0],integrity:20000}});
    scene.setStudyActors(rig.geometry());
    var envelope=DW.aegisShieldEnvelope,time=0,last=0,next=0,randomState=29,busy=false,dropped=0;
    /** @type {{anchor:number;born:number;heavy:boolean}[]} */var impacts=[];
    /** @type {import('./types').CapitalShieldFrame['impacts']|null} */var frozen=null;
    function random(){randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;}
    function pose(){var orbit=scene.getOrbit(),s=Math.sin(orbit.yaw),c=Math.cos(orbit.yaw),st=Math.sin(orbit.tilt),ct=Math.cos(orbit.tilt),back=[-s*st,c*st,ct],distance=host.clientHeight*(1/Math.tan(Math.PI/8))/(2*world.camera.zoom);return {eye:[world.camera.x+back[0]*distance,world.camera.y+back[1]*distance,(orbit.height||0)+back[2]*distance],right:[c,s,0],up:[s*ct,-c*ct,st],back:back};}
    function visible(){var p=pose();return envelope.anchors.map(function(a,i){return {id:i,position:envelope.vertices.slice(a.vertex*6,a.vertex*6+3),normal:envelope.vertices.slice(a.vertex*6+3,a.vertex*6+6)};}).filter(function(a){var delta=a.position.map(function(v,i){return p.eye[i]*units-v;});var q=DW.flightSkybox.project(a.position.map(function(v,i){return v/units-p.eye[i];}),p,host.clientWidth/host.clientHeight);return delta.reduce(function(sum,v,i){return sum+v*a.normal[i];},0)>0&&!!q&&Math.abs(q.x)<.95&&Math.abs(q.y)<.95;});}
    /** @param {boolean} heavy @param {number=} anchor */function hit(heavy,anchor){var front=visible();if(!front.length)return;impacts.push({anchor:anchor===undefined?front[Math.floor(random()*front.length)].id:anchor,born:time+(input('pause').checked?-.10:.15),heavy:heavy});if(impacts.length>128){dropped++;impacts.shift();}}
    input('hit').onclick=function(){hit(false);};input('heavy').onclick=function(){hit(true);};
    input('side').onclick=function(){scene.setOrbit({yaw:0,tilt:1.03,height:0});};input('bow').onclick=function(){scene.setOrbit({yaw:1.24,tilt:1.05,height:0});};input('under').onclick=function(){scene.setOrbit({yaw:.2,tilt:2.08,height:0});};
    /** @type {number[]} */var down=[];host.addEventListener('pointerdown',function(e){down=[e.clientX,e.clientY];});host.addEventListener('pointerup',function(e){if(busy||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;var rect=host.getBoundingClientRect(),p=pose(),x=(e.clientX-rect.left)/rect.width*2-1,y=1-(e.clientY-rect.top)/rect.height*2,closest=-1,distance=Infinity;visible().forEach(function(a){var q=DW.flightSkybox.project(a.position.map(function(v,i){return v/units-p.eye[i];}),p,rect.width/rect.height);if(q){var d=(q.x-x)*(q.x-x)+(q.y-y)*(q.y-y);if(d<distance){distance=d;closest=a.id;}}});if(closest>=0&&distance<.08)hit(false,closest);});
    /** @param {number} dt @param {string=} effect @param {string=} strategy @param {string=} submission @param {number=} bend */
    function render(dt,effect,strategy,submission,bend){
        var p=pose(),mode=effect||input('mode').value,active=frozen||impacts.map(function(h){return {anchor:h.anchor,heavy:h.heavy,age:time-h.born};});
        // Small incoming streaks are separate source-scene effects, identical in A/B.
        /** @type {number[]} */var bolts=[];impacts.forEach(function(h){var age=time-h.born;if(age<-.15||age>0)return;var a=envelope.anchors[h.anchor],point=envelope.vertices.slice(a.vertex*6,a.vertex*6+3),normal=envelope.vertices.slice(a.vertex*6+3,a.vertex*6+6),t=-age/.15,offset=normal.map(function(v,i){return v*180+(i===0?60:0);}),head=point.map(function(v,i){return v+offset[i]*t;}),tail=head.map(function(v,i){return v+offset[i]*.08;});[head,tail,tail,head,tail,head].forEach(function(v,k){var sign=[-1,-1,1,-1,1,1][k];bolts.push((v[0]+p.right[0]*sign*.6)/units,(v[1]+p.right[1]*sign*.6)/units,(v[2]+p.right[2]*sign*.6)/units,0,0,1);});});
        /** @type {import('./types').Batch[]} */var sourceEffects=bolts.length?[{vertices:new Float32Array(bolts),color:[1,.55,.08]}]:[];scene.setStudyEffects(sourceEffects.concat(mode==='combat'?DW.combatShields.capital(envelope,active.map(function(h){return {anchor:h.anchor,time:-h.age,heavy:h.heavy};}),0,[0,0,0],0,0):[]));
        var canvas=host.querySelector('canvas.flight-skybox');scene.setStudyCapitalShield(mode==='off'||mode==='combat'?null:{envelope:envelope,target:[world.camera.x,world.camera.y,scene.getOrbit().height||0],mode:mode,strategy:strategy||input('strategy').value,submission:submission||input('submission').value,bend:bend===undefined?Number(input('bend').value):bend,impacts:active},canvas instanceof HTMLCanvasElement?canvas:null);
        world.elapsedSeconds=time;sky.render(p,1,false,dt);scene.sync(world);scene.render(world,1,0,dt);
        return scene.getRenderStats();
    }
    ['all','a','b','diff'].forEach(function(view){input('pixel-'+view).onclick=function(){input('pixel-images').dataset.view=view;};});
    input('pixel-close').onclick=function(){input('pixel-review').hidden=true;};
    input('pixel-compare').onclick=function(){
        if(busy||!sky.getLighting())return;
        var front=visible();if(!front.length)return;
        busy=true;var saved=frozen,savedImpacts=impacts;impacts=[];
        frozen=Array.from({length:Number(input('stress').value)},function(/** @type {unknown} */_,i){return {anchor:front[(i*37)%front.length].id,age:.04+(i%7)*.04,heavy:false};});
        try{
            var amount=Number(input('bend').value),canvas=host.querySelector('canvas:not(.flight-skybox):not(.scene3d-overlay)'),skyCanvas=host.querySelector('canvas.flight-skybox');
            if(!(canvas instanceof HTMLCanvasElement)||!(skyCanvas instanceof HTMLCanvasElement))throw new Error('Scene canvases unavailable');
            var w=canvas.width,h=canvas.height;
            /** @param {number} bend */function capture(bend){
                render(0,'refraction',undefined,undefined,bend);
                if(scene.getRenderStats().shieldFloat!==1)throw new Error('Refraction unsupported: glow fallback cannot measure displacement');
                var copy=document.createElement('canvas');copy.width=w;copy.height=h;var ctx=copy.getContext('2d');if(!ctx)throw new Error('2D capture unavailable');
                ctx.drawImage(/** @type {HTMLCanvasElement} */(skyCanvas),0,0,w,h);ctx.drawImage(/** @type {HTMLCanvasElement} */(canvas),0,0,w,h);return {canvas:copy,image:ctx.getImageData(0,0,w,h)};
            }
            // All captures occur synchronously: camera, clock, incoming bolts and glow stay fixed.
            capture(0);capture(amount);
            var a=capture(0),repeatA=capture(0),b=capture(amount),repeatB=capture(amount),returnA=capture(0),metrics=DW.shieldPixelDiff.compare(a.image.data,b.image.data,[repeatA.image.data,returnA.image.data],[repeatB.image.data]);
            var heat=document.createElement('canvas');heat.width=w;heat.height=h;var context=heat.getContext('2d');if(!context)throw new Error('2D diff unavailable');var diff=context.createImageData(w,h);diff.data.set(metrics.heat);context.putImageData(diff,0,0);
            var review=input('pixel-review'),images=input('pixel-images');images.replaceChildren();images.dataset.view='all';
            [a.canvas,b.canvas,heat].forEach(function(c,i){var figure=document.createElement('figure'),caption=document.createElement('figcaption');caption.textContent=['A: displacement 0 px, glow retained','B: displacement '+amount+' px, same glow','Absolute RGB difference ×16 (red)'][i];figure.append(caption,c);images.append(figure);});
            input('pixel-results').textContent=(metrics.noise?'INVALID: repeated captures differ in '+metrics.noise+' pixels.':'Repeat control: 0 changed pixels (A/A, B/B and return to A).')+'\n'+w+' × '+h+' backing pixels; '+frozen.length+' deterministic gun waves; '+input('submission').value+' / '+input('strategy').value+'\n'+metrics.changed.toLocaleString()+' pixels changed ('+(100*metrics.changed/(w*h)).toFixed(3)+'% of viewport)\n'+metrics.visibleChanges.toLocaleString()+' pixels with max RGB difference ≥3/255; '+metrics.strong.toLocaleString()+' ≥10/255\nMaximum channel difference '+metrics.max+'/255; mean absolute RGB difference '+metrics.mean.toFixed(4)+'/255. Thresholds measure byte differences, not perceptual visibility. Glow is identical; both sides use the refraction pipeline. Frozen source time '+time.toFixed(3)+' s; zoom '+world.camera.zoom.toFixed(3)+'; yaw '+scene.getOrbit().yaw.toFixed(3)+'; tilt '+scene.getOrbit().tilt.toFixed(3);
            review.hidden=false;
        }catch(error){input('results').textContent=String(error);}finally{frozen=saved;impacts=savedImpacts;busy=false;}
    };
    input('bench').onclick=async function(){
        if(busy)return;var front=visible();if(!front.length){input('results').textContent='No visible shield surface; frame the ship first.';return;}busy=true;var controls=Array.from(document.querySelectorAll('input,select,button'));controls.forEach(function(c){if(c instanceof HTMLInputElement||c instanceof HTMLSelectElement||c instanceof HTMLButtonElement)c.disabled=true;});
        var before=JSON.stringify([world.camera,scene.getOrbit(),host.clientWidth,host.clientHeight]),count=Number(input('stress').value),mode=input('mode').value==='off'?'refraction':input('mode').value,patchComparison=input('comparison').value==='patches',batchComparison=input('comparison').value==='batch';
        frozen=Array.from({length:count},function(/** @type {unknown} */_,i){return {anchor:front[(i*37)%front.length].id,age:.04+(i%7)*.04,heavy:false};});
        /** @type {{b:boolean;cpu:number;total:number;cadence:number;draws:number;triangles:number;width:number;height:number}[]} */var rows=[];
        try{for(var b of [false,true,true,false]){var previous=0;for(var i=0;i<75;i++){var stamp=await new Promise(/** @param {(t:number)=>void} resolve */function(resolve){requestAnimationFrame(resolve);});if(document.hidden||JSON.stringify([world.camera,scene.getOrbit(),host.clientWidth,host.clientHeight])!==before)throw new Error('Camera, viewport or visibility changed; rerun');var start=performance.now(),stats=render(0,patchComparison||batchComparison?mode:b?mode:'off',patchComparison?(b?'patches':'whole'):input('strategy').value,batchComparison?(b?'batched':'individual'):input('submission').value),cpu=performance.now()-start;scene.completeFrame();var total=performance.now()-start;if(i>=15)rows.push({b:b,cpu:cpu,total:total,cadence:stamp-previous,draws:stats.drawCalls+sky.getRenderStats().drawCalls,triangles:stats.triangles+sky.getRenderStats().triangles,width:stats.width,height:stats.height});previous=stamp;input('results').textContent='Frozen ABBA / '+rows.length+' of 240 samples';}}
            var lines=[rows[0].width+' x '+rows[0].height+'; DPR '+window.devicePixelRatio+'; '+count+' gun waves','Mode '+mode+(scene.getRenderStats().shieldFloat===0?' (glow fallback)':'')+'; '+(mode==='refraction'?input('bend').value+'px; half-resolution field':'direct glow; no capture'),'Camera zoom '+world.camera.zoom.toFixed(3)+'; yaw '+scene.getOrbit().yaw.toFixed(3)+'; tilt '+scene.getOrbit().tilt.toFixed(3),'15 warmup + 60 samples/block; frozen camera/time'];
            [false,true].forEach(function(b){var group=rows.filter(function(r){return r.b===b;});/** @param {'cpu'|'total'|'cadence'} key */function pair(/** @type {'cpu'|'total'|'cadence'} */key){var values=group.map(function(r){return r[key];}).sort(function(a,b){return a-b;});return values[Math.floor(values.length*.5)].toFixed(2)+' / '+values[Math.floor(values.length*.95)].toFixed(2);}
                lines.push((batchComparison?(b?'BATCHED':'INDIVIDUAL'):patchComparison?(b?'PATCHES':'WHOLE'):(b?'ON':'OFF'))+': CPU '+pair('cpu')+' ms; synchronized '+pair('total')+' ms; cadence '+pair('cadence')+' ms; '+group[0].draws+' draws / '+group[0].triangles+' triangles');});lines.push('Median / p95. Synchronized includes 1px readback, CPU, driver + GPU wait; not GPU-only. Scripted frozen impacts, no AI.');input('results').textContent=lines.join('\n');
        }catch(error){input('results').textContent=String(error);}finally{frozen=null;busy=false;controls.forEach(function(c){if(c instanceof HTMLInputElement||c instanceof HTMLSelectElement||c instanceof HTMLButtonElement)c.disabled=false;});}
    };
    /** @param {number} stamp */function frame(stamp){requestAnimationFrame(frame);var dt=Math.min(.05,(stamp-last)/1000||0);last=stamp;if(busy||!input('pixel-review').hidden)return;if(!input('pause').checked){time+=dt;impacts=impacts.filter(function(h){return time-h.born<(h.heavy?.65:.36);});if(input('barrage').checked){var emitted=0;while(time>=next&&emitted++<30){hit(false);next+=1/Number(input('rate').value);}}else next=time;}
        var stats=render(dt),active=impacts.filter(function(h){return time>=h.born;}).length;input('pixel-compare').disabled=!sky.getLighting();input('bench').disabled=!sky.getLighting()||input('mode').value==='envelope';input('status').textContent='Aegis / original metre scale'+(stats.shieldFloat===0?' / glow fallback':'')+'\n'+envelope.indices.length/3+' envelope triangles; '+envelope.anchors.length+' patch anchors\n'+active+' active hits / '+dropped+' evicted\n'+stats.width+' x '+stats.height+'; '+stats.drawCalls+' main draws\n'+stats.triangles.toLocaleString()+' main triangles\n'+stats.cpuMs.toFixed(2)+' ms scene submission\n'+(sky.getLighting()?'Sky ready; benchmark available':'Warming local sky / lighting…');}
    requestAnimationFrame(frame);
}());
