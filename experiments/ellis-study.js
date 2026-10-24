(function(){
    'use strict';
    /** @typedef {import('./types').Pose} Pose */
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks),units=DW.sim.METERS_PER_UNIT;
    /** @param {number[]} v */
    function unit(v){var length=Math.hypot.apply(null,v);return v.map(function(x){return x/length;});}
    /** @param {number[]} a @param {number[]} b */
    function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
    /** @param {number[]} eye @param {number[]} forward @param {number} region @returns {Pose} */
    function pose(eye,forward,region){var f=unit(forward),right=unit(cross(f,[0,0,1]));return {eye:eye.map(function(v){return v/units;}),right:right,up:cross(right,f),back:f.map(function(v){return -v;}),region:region};}
    /** Fixed chart-local camera positions, in metres. @param {string} name @returns {Pose} */
    function camera(name){
        var presets=/** @type {Record<string,number[]>} */({front:[0,-2900,1550],chase:[0,-2380,1550],close:[0,-2340,1550],side:[650,-2400,1650],rim:[400,-2200,1550],above:[0,-2500,2200],rime:[12000,-1100,1550]});
        var eye=presets[name]||presets.front,region=name==='rime'?1:0;
        return pose(eye,[region*12000-eye[0],-2000-eye[1],1550-eye[2]],region);
    }
    /** Deterministic 24-second loop; no AI, damage, or random state.
     * The crossing uses signed Ellis proper radius and the same antipodal chart convention.
     * @param {number} time @param {string} scenario */
    function sample(time,scenario){
        if(scenario==='nearby')return [{pose:pose([12,-2340,1550],[Math.sin(time*.4)*.2,1,0],0),velocity:[0,0,0]}];
        var phase=time*Math.PI/12,normal=unit([.12,-1,.035]),l=-800*Math.cos(phase),side=l<0?0:1,r=Math.hypot(300,l),sign=side===0?1:-1;
        var center=[side*12000,-2000,1550],eye=center.map(function(v,i){return v+normal[i]*r*sign;}),speed=800*Math.PI/12*Math.sin(phase),forward=normal.map(function(v){return -v;});
        var crossing=pose(eye,forward,side);
        // The radial half-turn reverses both transverse basis vectors.
        if(side===1){crossing.right=crossing.right.map(function(v){return -v;});crossing.up=crossing.up.map(function(v){return -v;});}
        var result=scenario==='orbit'?[]:[{pose:crossing,velocity:normal.map(function(v){return -v*speed*Math.abs(l)/Math.max(.001,r);})}];
        if(scenario!=='crossing')for(var i=0;i<2;i++){
            var angle=phase+i*1.3,region=i,radius=410+i*90,point=[region*12000+radius*Math.sin(angle),-2000-radius*Math.cos(angle),1550+70*Math.sin(phase*2+i)],velocity=[radius*Math.cos(angle)*Math.PI/12,radius*Math.sin(angle)*Math.PI/12,140*Math.cos(phase*2+i)*Math.PI/12];
            result.push({pose:pose(point,velocity,region),velocity:velocity});
        }
        return result;
    }
    DW.ellisStudy={camera:camera,sample:sample};
    if(typeof document==='undefined')return;
    /** @template {HTMLElement} T @param {string} id @returns {T} */
    function get(id){var e=document.getElementById(id);if(!e)throw new Error('Missing study control '+id);return /** @type {T} */(e);}
    var params=new URLSearchParams(location.search),cameraName=params.get('camera')||'front',time=Number(params.get('time'))||0,playing=params.get('paused')!=='1',last=0,lastDraw=0;
    var session=DW.flightSession.create({seed:29,terrainHit:function(){return null;},surfaceFrame:function(_a,d){return {point:d};},onGunshot:function(){},onImpact:function(){}});
    var snapshot=session.reset({mode:'ellis',enabled:false,profile:DW.arcade.profiles[0]});
    // Keep just the sky and scripted craft, avoiding unrelated scene occluders.
    snapshot.world.asteroids=[];snapshot.world.ships=[];
    var presentation=DW.flightPresentation.mount(get('viewer'),function(){return snapshot.world;},function(w){snapshot.world=w;session.setWorld(w);});
    var model=/** @type {HTMLSelectElement} */(get('enemy-art')),ally=/** @type {HTMLSelectElement} */(get('ally-art')),timeline=/** @type {HTMLInputElement} */(get('timeline')),scenario=/** @type {HTMLSelectElement} */(get('scenario')),renderer=/** @type {HTMLSelectElement} */(get('renderer')),speedSelect=/** @type {HTMLSelectElement} */(get('speed'));
    var first=Array.from(model.options).find(function(o){return o.value&&o.value!=='mixed';});if(first)model.value=first.value;if(params.get('ship'))model.value=params.get('ship')||model.value;
    speedSelect.value=params.get('speed')||'1';scenario.value=params.get('pass')||'combined';
    /** @type {HTMLInputElement} */(get('bridge-grid')).checked=params.get('bridgeGrid')!=='0';renderer.value=params.get('bridgeGeometry')==='full'?'full':'objects';
    function cameraUI(){document.querySelectorAll('button[data-camera]').forEach(function(b){b.setAttribute('aria-pressed',b.getAttribute('data-camera')===cameraName?'true':'false');});get('camera-note').textContent=(cameraName==='rime'?'Rime chart':'Asteroid chart')+' · fixed camera · throat radius 300 m';}
    document.querySelectorAll('button[data-camera]').forEach(function(b){b.addEventListener('click',function(){cameraName=b.getAttribute('data-camera')||'front';if(cameraName==='chase')scenario.value='nearby';cameraUI();draw();});});
    function playback(){get('play').textContent=playing?'Pause':'Play';}
    get('play').onclick=function(){playing=!playing;playback();};
    get('step').onclick=function(){playing=false;time=(time+1/30)%24;playback();draw();};
    get('reset').onclick=function(){time=0;draw();};
    var exactTime=/** @type {HTMLInputElement} */(get('time'));exactTime.oninput=exactTime.onchange=function(){playing=false;time=Math.max(0,Math.min(24,Number(exactTime.value)||0));playback();draw();};
    timeline.oninput=function(){playing=false;time=Number(timeline.value);playback();draw();};
    renderer.onchange=function(){var url=new URL(location.href);url.searchParams.set('bridgeGeometry',renderer.value);url.searchParams.set('time',String(time));url.searchParams.set('camera',cameraName);url.searchParams.set('pass',scenario.value);url.searchParams.set('paused',playing?'0':'1');url.searchParams.set('ship',model.value);url.searchParams.set('speed',speedSelect.value);url.searchParams.set('bridgeGrid',/** @type {HTMLInputElement} */(get('bridge-grid')).checked?'1':'0');location.href=url.href;};
    function draw(){
        var view=camera(cameraName),tracks=sample(time,scenario.value);ally.value=model.value;
        snapshot.combat.enemies=tracks.map(function(track,i){var state=Object.assign(DW.arcade.create(1),track.pose,{velocity:track.velocity,throttle:.5}),craft=DW.training.createCraft('study-'+i,state,i===2?'ally':'enemy');craft.index=i;return craft;});
        snapshot.world.elapsedSeconds=time;
        presentation.pose(view);presentation.render(Object.assign({},snapshot,{camera:view}),presentation.appearance(),{mode:'normal',scale:1,flat:false,mothership:false,actors:true},0);
        timeline.value=String(time);if(document.activeElement!==exactTime)exactTime.value=time.toFixed(2);
        var stats=presentation.renderStats().scene;
        get('readout').textContent='24 s loop / '+(playing?'playing':'paused')+'\n'+tracks.map(function(track,i){return (i===0&&scenario.value!=='orbit'?'Crossing ship':'Orbit ship')+' · '+(track.pose.region===1?'Rime':'asteroid');}).join('\n')+'\n'+renderer.options[renderer.selectedIndex].text+'\n'+stats.drawCalls+' draws · '+Math.round(stats.triangles).toLocaleString()+' triangles'+(renderer.value==='objects'?'\n'+stats.bridgeObjectPaths+' paths · probe error '+Number(stats.bridgeObjectError||0).toFixed(2)+' px':'');
    }
    /** @param {number} now */
    function tick(now){var dt=last?Math.min(.05,(now-last)/1000):0;last=now;if(!document.hidden&&playing)time=(time+dt*Number(speedSelect.value))%24;if(!document.hidden&&now-lastDraw>=1000/30){draw();lastDraw=now;}requestAnimationFrame(tick);}
    cameraUI();playback();draw();requestAnimationFrame(tick);
}());
