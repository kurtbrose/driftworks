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
    /** Independent intrinsic placement of a transverse calibration point.
     * Integrates ds^2=dl^2+(300^2+l^2)dphi^2 from the source center;
     * it deliberately does not call the optical inverse or projectile integrator.
     * Tangent axes are parallel transported along the radial yo-yo trajectory.
     * @param {number} l @param {number} x @param {number} y */
    function yoYoPoint(l,x,y){
        var distance=Math.hypot(x,y),b=Math.hypot(300,l),state=[l,0,0];
        var count=Math.max(8,Math.ceil(distance/.1)),h=distance/count;
        /** @param {number[]} q */function derivative(q){var r2=90000+q[0]*q[0];return [q[1],b*b*q[0]/(r2*r2),b/r2];}
        for(var i=0;i<count;i++){
            var a=derivative(state),c=derivative(state.map(function(v,j){return v+a[j]*h/2;}));
            var d=derivative(state.map(function(v,j){return v+c[j]*h/2;})),e=derivative(state.map(function(v,j){return v+d[j]*h;}));
            state=state.map(function(v,j){return v+h*(a[j]+2*c[j]+2*d[j]+e[j])/6;});
        }
        var region=state[0]<0?1:0,sign=region?-1:1,r=Math.hypot(300,state[0]),s=Math.sin(state[2]);
        return {point:[region*12000+sign*r*s*x/Math.max(1e-30,distance),-2000-sign*r*Math.cos(state[2]),1550+sign*r*s*y/Math.max(1e-30,distance)],region:region};
    }
    /** A physical 3 m square for playback; callers can shrink it with distance
     * for the local-flatness limit measurement. Coordinates are metres.
     * @param {number} distance @param {number} observerL @param {number=} halfSize */
    function yoYoAt(distance,observerL,halfSize){
        var size=halfSize===undefined?1.5:halfSize,l=observerL-distance;
        var offsets=[[-size,-size],[size,-size],[size,size],[-size,size],[0,0]];
        var points=offsets.map(function(p){return yoYoPoint(l,p[0],p[1]);});
        var view=pose([0,-2000-Math.hypot(300,observerL),1550],[0,1,0],0);
        return {view:view,points:points,expected:offsets.map(function(p){return [p[0]/distance,p[1]/distance];}),distance:distance,observerL:observerL,halfSize:size};
    }
    /** @param {number} time @param {string} name */
    function yoYo(time,name){return yoYoAt(10+115*(1-Math.cos(time*Math.PI/12)),name==='yoyo-throat'?0:120);}
    /** Scripted combat-shaped path, not a flight-dynamics solution.
     * @param {number} time @param {boolean} crossing */
    function dogfight(time,crossing){
        var w=Math.PI/12,t=time*w,angle=2*t,latitude=.12*Math.sin(3*t),latSpeed=.36*w*Math.cos(3*t);
        var l=crossing?-180*Math.cos(t):-180,dl=crossing?180*w*Math.sin(t):0;
        var side=l>0?1:0,sign=side? -1:1,r=Math.hypot(300,l),dr=l*dl/r;
        var n=[Math.cos(latitude)*Math.sin(angle),-Math.cos(latitude)*Math.cos(angle),Math.sin(latitude)];
        var dn=[-Math.sin(latitude)*latSpeed*Math.sin(angle)+2*w*Math.cos(latitude)*Math.cos(angle),Math.sin(latitude)*latSpeed*Math.cos(angle)+2*w*Math.cos(latitude)*Math.sin(angle),Math.cos(latitude)*latSpeed];
        var eye=n.map(function(v,i){return [side*12000,-2000,1550][i]+sign*r*v;});
        var velocity=n.map(function(v,i){return sign*(dr*v+r*dn[i]);});
        return {pose:pose(eye,velocity,side),velocity:velocity};
    }
    /** Fixed chart-local camera positions, or a delayed chase pose. @param {string} name @param {number=} time @returns {Pose} */
    function camera(name,time){
        if(name.startsWith('yoyo'))return yoYo(time||0,name).view;
        if(name==='dogfight'||name==='dogfight-crossing'){
            var crossing=name==='dogfight-crossing',leader=dogfight(time||0,crossing),follower=dogfight((time||0)-.7,crossing);
            var eye=follower.pose.eye.map(function(v){return v*units;}),target=leader.pose.eye.map(function(v){return v*units;});
            // Follow the optical bearing, including the split-chart chase interval.
            var hit=DW.ellisOptics.primary(eye,target,follower.pose.region||0,leader.pose.region||0);
            var view=pose(eye,hit?hit.direction:follower.pose.back.map(function(v){return -v;}),follower.pose.region||0);
            // Use a tangent up reference so the chart half-turn transports the
            // entire camera frame. Negating a global-Z frame adds a roll snap
            // whenever the observer is away from the equatorial plane.
            var radial=unit(eye.map(function(v,i){return v-[(view.region||0)*12000,-2000,1550][i];}));
            var up=radial.map(function(v,i){return ((i===2?1:0)-v*radial[2])*(view.region===1?-1:1);});
            view.right=unit(cross(view.back.map(function(v){return -v;}),up));
            view.up=cross(view.right,view.back.map(function(v){return -v;}));
            return view;
        }
        if(name==='pursuit'||name==='pursuit-offset'){
            var t=(time||0)+3,view=sample(t-1.5,'crossing')[0].pose;
            var delta=-Math.cos(t*Math.PI/12)+Math.cos((t-1.5)*Math.PI/12);
            if(delta<0){view.right=view.right.map(function(v){return -v;});view.back=view.back.map(function(v){return -v;});}
            if(name==='pursuit-offset'){
                var c=Math.cos(.15),s=Math.sin(.15),mouth=[(view.region||0)*12000/units,-2000/units,1550/units];
                /** @param {number[]} v */function rotate(v){return [c*v[0]-s*v[1],s*v[0]+c*v[1],v[2]];}
                view.eye=rotate(view.eye.map(function(v,i){return v-mouth[i];})).map(function(v,i){return v+mouth[i];});
                view.right=rotate(view.right);view.up=rotate(view.up);view.back=rotate(view.back);
            }
            return view;
        }
        var presets=/** @type {Record<string,number[]>} */({detail:[0,-2315,1550],front:[0,-2900,1550],chase:[0,-2380,1550],close:[0,-2340,1550],side:[650,-2400,1650],rim:[400,-2200,1550],above:[0,-2500,2200],rime:[12000,-1100,1550]});
        var eye=presets[name]||presets.front,region=name==='rime'?1:0;
        return pose(eye,[region*12000-eye[0],-2000-eye[1],1550-eye[2]],region);
    }
    /** Deterministic 24-second loop; no AI, damage, or random state.
     * The crossing uses signed Ellis proper radius and the same antipodal chart convention.
     * @param {number} time @param {string} scenario */
    function sample(time,scenario){
        if(scenario.startsWith('yoyo'))return [];
        if(scenario==='dogfight'||scenario==='dogfight-crossing')return [dogfight(time,scenario==='dogfight-crossing')];
        if(scenario==='pursuit')return sample(time+3,'crossing');
        // Single-actor stress fixtures: chart positions in metres, analytic velocities.
        var w=Math.PI/12,t=time*w;
        if(scenario==='axis-sweep'){
            var x=30*Math.sin(t),vx=30*w*Math.cos(t);
            return [{pose:pose([12000+x,-1685,1550],[1,0,0],1),velocity:[vx,0,0]}];
        }
        if(scenario==='throat-orbit'){
            var r=330,point=[r*Math.sin(t),-2000-r*Math.cos(t),1550];
            var tangent=[r*w*Math.cos(t),r*w*Math.sin(t),0];
            return [{pose:pose(point,tangent,0),velocity:tangent}];
        }
        if(scenario==='tumble'){
            var view=pose([12012,-1685,1555],[Math.sin(t),Math.cos(t),.35*Math.sin(2*t)],1);
            var roll=t,c=Math.cos(roll),s=Math.sin(roll),right=view.right.slice(),up=view.up.slice();
            view.right=right.map(function(v,i){return c*v+s*up[i];});
            view.up=up.map(function(v,i){return c*v-s*right[i];});
            return [{pose:view,velocity:[0,0,0]}];
        }
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
    DW.ellisStudy={camera:camera,sample:sample,yoYo:yoYo,yoYoAt:yoYoAt};
    if(typeof document==='undefined')return;
    /** @template {HTMLElement} T @param {string} id @returns {T} */
    function get(id){var e=document.getElementById(id);if(!e)throw new Error('Missing study control '+id);return /** @type {T} */(e);}
    var params=new URLSearchParams(location.search),cameraName=params.get('camera')||(((params.get('pass')||'').startsWith('dogfight')||(params.get('pass')||'').startsWith('yoyo'))?params.get('pass')||'dogfight':['axis-sweep','throat-orbit','tumble'].includes(params.get('pass')||'')?'detail':'front'),time=Number(params.get('time'))||0,playing=params.get('paused')!=='1',last=0,lastDraw=0;
    var session=DW.flightSession.create({seed:29,terrainHit:function(){return null;},surfaceFrame:function(_a,d){return {point:d};},onGunshot:function(){},onImpact:function(){}});
    var snapshot=session.reset({mode:'ellis',enabled:false,profile:DW.arcade.profiles[0]});
    // Keep just the sky and scripted craft, avoiding unrelated scene occluders.
    if(params.get('bridgeScenery')!=='1')snapshot.world.asteroids=[];snapshot.world.ships=[];
    var presentation=DW.flightPresentation.mount(get('viewer'),function(){return snapshot.world;},function(w){snapshot.world=w;session.setWorld(w);});
    var model=/** @type {HTMLSelectElement} */(get('enemy-art')),ally=/** @type {HTMLSelectElement} */(get('ally-art')),timeline=/** @type {HTMLInputElement} */(get('timeline')),scenario=/** @type {HTMLSelectElement} */(get('scenario')),renderer=/** @type {HTMLSelectElement} */(get('renderer')),speedSelect=/** @type {HTMLSelectElement} */(get('speed'));
    var first=Array.from(model.options).find(function(o){return o.value&&o.value!=='mixed';});if(first)model.value=first.value;if(params.get('ship'))model.value=params.get('ship')||model.value;
    speedSelect.value=params.get('speed')||'1';scenario.value=params.get('pass')||'combined';
    /** @type {HTMLInputElement} */(get('bridge-grid')).checked=params.get('bridgeGrid')!=='0';renderer.value=params.get('bridgeGeometry')==='full'?'full':params.get('bridgeShips')==='warped'?'affine':'objects';
    var capital=/** @type {import('./types').AegisFlightRig|null} */(null),capitalTime=0;
    DW.aegisFlight.load().then(function(){capital=DW.aegisFlight.createEllisPatrol();draw();});
    /** @param {number} t */function capitalAt(t){
        if(!capital)return null;
        var target=t+5700/180-6;
        if(target<capitalTime){capital.reset();capitalTime=0;}
        while(capitalTime<target-1e-8){var dt=Math.min(.05,target-capitalTime);capital.step(dt,snapshot);capitalTime+=dt;}
        return capital;
    }
    var stressHints=/** @type {Record<string,string>} */({yoyo:'Yo yo: 3 m amber square approaches and recedes, 10-240 m proper separation. Cyan: ordinary-perspective size. Observer 120 m proper distance from throat.', 'yoyo-throat':'Yo yo on throat: same 3 m target and cyan flat reference; observer at the neck. Numerical limit checks also test sub-metre separations.',dogfight:'Scripted turning pursuit: two laps near the throat, vertical jinks, camera follows 0.7 s behind. No weapons or AI.', 'dogfight-crossing':'Turning pursuit with two throat crossings; leader crosses at 6 / 18 s, camera at 6.7 / 18.7 s. No weapons or AI.', 'axis-sweep':'Remote fighter sweeps across the front/detail camera optical axis at 0 / 12 s. Watch image loss and jumps.', 'throat-orbit':'One fighter circles 30 m outside the throat. Compare silhouette distortion from each fixed camera.',tumble:'Fixed remote center, rotating hull. Isolates orientation-dependent approximation failures.'});
    function cameraUI(){model.disabled=scenario.value.startsWith('yoyo');get('study-hint').textContent=stressHints[scenario.value]||(scenario.value==='capital'?'Aegis center crosses at 6 s. Scrub to inspect the entire hull.':cameraName.startsWith('pursuit')?'Leader crosses at 3 / 15 s; you follow at 4.5 / 16.5 s.':'Throat crossings at 6 s and 18 s. Pause to compare the same frame.');document.querySelectorAll('button[data-camera]').forEach(function(b){b.toggleAttribute('disabled',scenario.value.startsWith('yoyo'));b.setAttribute('aria-pressed',b.getAttribute('data-camera')===cameraName?'true':'false');});get('camera-note').textContent=(camera(cameraName,time).region?'Rime chart':'Asteroid chart')+((cameraName.startsWith('pursuit')||cameraName.startsWith('dogfight'))?' · pursuit camera':' · fixed camera')+' · throat radius 300 m';}
    document.querySelectorAll('button[data-camera]').forEach(function(b){b.addEventListener('click',function(){cameraName=b.getAttribute('data-camera')||'front';if(cameraName.startsWith('dogfight'))scenario.value=cameraName;if(cameraName==='chase')scenario.value='nearby';if(cameraName.startsWith('pursuit'))scenario.value='pursuit';cameraUI();draw();});});
    function playback(){get('play').textContent=playing?'Pause':'Play';}
    get('play').onclick=function(){playing=!playing;playback();};
    get('step').onclick=function(){playing=false;time=(time+1/30)%24;playback();draw();};
    get('reset').onclick=function(){time=0;draw();};
    var exactTime=/** @type {HTMLInputElement} */(get('time'));exactTime.oninput=exactTime.onchange=function(){playing=false;time=Math.max(0,Math.min(24,Number(exactTime.value)||0));playback();draw();};
    timeline.oninput=function(){playing=false;time=Number(timeline.value);playback();draw();};
    renderer.onchange=function(){var url=new URL(location.href);url.searchParams.set('bridgeGeometry',renderer.value==='full'?'full':'objects');url.searchParams.set('bridgeShips',renderer.value==='affine'?'warped':'rigid');url.searchParams.set('time',String(time));url.searchParams.set('camera',cameraName);url.searchParams.set('pass',scenario.value);url.searchParams.set('paused',playing?'0':'1');url.searchParams.set('ship',model.value);url.searchParams.set('speed',speedSelect.value);url.searchParams.set('bridgeGrid',/** @type {HTMLInputElement} */(get('bridge-grid')).checked?'1':'0');location.href=url.href;};
    scenario.onchange=function(){if(scenario.value.startsWith('dogfight')||scenario.value.startsWith('yoyo'))cameraName=scenario.value;else if(cameraName.startsWith('dogfight')||cameraName.startsWith('yoyo'))cameraName='detail';cameraUI();draw();};
    function draw(){
        var view=camera(cameraName,time),isCapital=scenario.value==='capital',tracks=isCapital?[]:sample(time,scenario.value);presentation.setCapital(isCapital?capitalAt(time):null);ally.value=model.value;cameraUI();
        var isYoYo=scenario.value.startsWith('yoyo'),yoYoError=0,yoYoMissing=0;
        var reference=get('yoyo-reference');reference.style.display=isYoYo?'block':'none';
        presentation.setCalibration([]);
        if(isYoYo){
            var frame=yoYo(time,scenario.value);view=frame.view;
            var center=frame.points[4],vertices=/** @type {number[]} */([]);
            [0,1,2,0,2,3].forEach(function(index){vertices.push.apply(vertices,frame.points[index].point.map(function(v,i){return (v-center.point[i])/units;}));vertices.push(0,-1,0);});
            presentation.setCalibration([{vertices:new Float32Array(vertices),color:[1,.45,.12],finish:7,origin:/** @type {[number,number,number]} */(center.point.map(function(v){return v/units;})),region:center.region,lensCenter:center.point.map(function(v){return v/units;}),lensRadius:3}]);
            var height=get('viewer').clientHeight,width=get('viewer').clientWidth,half=frame.halfSize/frame.distance*height/(2*Math.tan(Math.PI/8));
            frame.points.slice(0,4).forEach(function(p,i){
                var hit=DW.ellisOptics.primary(view.eye.map(function(v){return v*units;}),p.point,0,p.region),dot=get('yoyo-point-'+i);
                dot.style.display=hit&&hit.direction[1]>0?'block':'none';
                if(!hit||hit.direction[1]<=0){yoYoMissing++;return;}
                var x=hit.direction[0]/hit.direction[1],y=hit.direction[2]/hit.direction[1],scale=height/(2*Math.tan(Math.PI/8));
                dot.setAttribute('cx',String(width/2+x*scale));dot.setAttribute('cy',String(height/2-y*scale));
                yoYoError=Math.max(yoYoError,Math.hypot(x-frame.expected[i][0],y-frame.expected[i][1])*scale);
            });
            var box=get('yoyo-box');box.setAttribute('x',String(width/2-half));box.setAttribute('y',String(height/2-half));box.setAttribute('width',String(2*half));box.setAttribute('height',String(2*half));
        }
        snapshot.combat.enemies=tracks.map(function(track,i){var state=Object.assign(DW.arcade.create(1),track.pose,{velocity:track.velocity,throttle:.5}),craft=DW.training.createCraft('study-'+i,state,i===2?'ally':'enemy');craft.index=i;return craft;});
        snapshot.world.elapsedSeconds=time;
        presentation.pose(view);presentation.render(Object.assign({},snapshot,{camera:view}),presentation.appearance(),{mode:'normal',scale:1,flat:false,mothership:false,actors:true},0);
        timeline.value=String(time);if(document.activeElement!==exactTime)exactTime.value=time.toFixed(2);
        var stats=presentation.renderStats().scene;
        var yoYoNote=isYoYo?'\nProper separation '+yoYo(time,scenario.value).distance.toFixed(2)+' m\nFlat-reference error '+yoYoError.toFixed(3)+' px / '+yoYoMissing+' missing\nDots: direct solver / cyan: flat reference':'';
        get('readout').textContent=yoYoNote+'\n24 s loop / '+(playing?'playing':'paused')+'\n'+tracks.map(function(track,i){return (stressHints[scenario.value]?'Stress fighter':i===0&&scenario.value!=='orbit'?'Crossing ship':'Orbit ship')+' · '+(track.pose.region===1?'Rime':'asteroid');}).join('\n')+(isCapital?'\nAegis · '+(capital&&capital.geometry()[0].region?'Rime':'asteroid')+' · center crosses at 6 s':'')+'\n'+renderer.options[renderer.selectedIndex].text+'\n'+stats.drawCalls+' draws · '+Math.round(stats.triangles).toLocaleString()+' triangles'+(renderer.value!=='full'?'\n'+stats.bridgeObjectPaths+(renderer.value==='affine'?' paths · single-probe error '+Number(stats.bridgeObjectError||0).toFixed(2)+' px':' image paths · rigid hulls'):'');
    }
    /** @param {number} now */
    function tick(now){var dt=last?Math.min(.05,(now-last)/1000):0;last=now;if(!document.hidden&&playing)time=(time+dt*Number(speedSelect.value))%24;if(!document.hidden&&now-lastDraw>=1000/30){draw();lastDraw=now;}requestAnimationFrame(tick);}
    cameraUI();playback();draw();requestAnimationFrame(tick);
}());
