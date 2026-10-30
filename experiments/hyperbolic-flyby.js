(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks),H=DW.flightHyperbolic,U=DW.sim.METERS_PER_UNIT;
    /** Observer follows one geodesic (3 m/s at strong curvature, otherwise 30 m/s). Attitude is parallel transported,
     * never aimed at the ship. Return an observer-centred chart, not an ordinary
     * translated camera in the player's Gans chart.
     * @param {number} seconds @param {number} [radius] @returns {import('./types').FlightState} */
    function sample(seconds,radius){
        radius=radius||400;
        var close=radius<100,speed=close?3:30,location=close?[-35,-100,60]:[-350,-600,170];
        var anchor=H.offset([0,0,0],location.map(function(v){return v/U;}),radius),eye=H.offset(anchor,[(seconds-14)*speed/U,0,0],radius);
        var forward=H.path(anchor,[0,0,0],radius).direction,n=Math.hypot(forward[0],forward[1]),right=[forward[1]/n,-forward[0]/n,0],back=forward.map(function(v){return -v;});
        var up=[back[1]*right[2]-back[2]*right[1],back[2]*right[0]-back[0]*right[2],back[0]*right[1]-back[1]*right[0]];
        var p=H.point(eye,radius),frame=[p.map(function(v,i){return i?-v:v;})];
        for(var k=0;k<3;k++)frame.push([-p[k+1],...p.slice(1).map(function(v,i){return (i===k?1:0)+v*p[k+1]/(p[0]+1);})]);
        return {curvature:radius,spaceFrame:frame,eye:[0,0,0],right:H.transport(anchor,eye,right,radius),up:H.transport(anchor,eye,up,radius),back:H.transport(anchor,eye,back,radius),velocity:H.transport(anchor,eye,[speed,0,0],radius),rates:[0,0,0],ramp:[0,0,0],throttle:0};
    }
    /** Ten formation slots move through one common Lorentz isometry, keeping
     * intrinsic spacing and clearance from the capital's longitudinal axis.
     * Nose directions use the actual orbit tangent, including formation keeping.
     * @param {number} seconds @param {import('./types').Pose} camera */
    function traffic(seconds,camera){
        var radius=camera.curvature||400,close=radius<100,pace=close?6:70,s=(seconds-14)*pace/radius,ch=Math.cosh(s),sh=Math.sinh(s);
        return Array.from({length:10},/** @param {unknown} _ @param {number} index */function(_,index){
            var slot=[(index%5-2)*(close?25:95)/U,-(close?65:120)/U,(index<5?1:-1)*(close?35:70)/U],p=H.point(H.offset([0,0,0],slot,radius),radius);
            var q=[p[0]*ch+p[1]*sh,p[0]*sh+p[1]*ch,p[2],p[3]],eye=H.chart(q,radius);
            var velocity=H.lower(q,[q[1],q[0],0,0]).map(function(v){return v*pace;}),speed=Math.hypot(...velocity);
            var forward=velocity.map(function(v){return v/speed;}),back=forward.map(function(v){return -v;}),n=Math.hypot(forward[0],forward[1]);
            var right=[forward[1]/n,-forward[0]/n,0],up=[back[1]*right[2]-back[2]*right[1],back[2]*right[0]-back[0]*right[2],back[0]*right[1]-back[1]*right[0]];
            var pose={curvature:radius,eye:eye,right:right,up:up,back:back,velocity:velocity,rates:[0,0,0],ramp:[0,0,speed],throttle:1},mapped=H.chartPose(pose,camera);
            return Object.assign({},pose,mapped,{velocity:mapped.back.map(function(v){return -v*speed;})});
        });
    }
    /** A clean production-renderer view. Controls exist only while paused.
     * @param {HTMLElement} host */
    async function mount(host){
        document.title='Capital ship flyby / Driftworks';
        var style=document.createElement('style');
        style.textContent='body.hyperbolic-flyby> :not(#viewer):not(#flyby-menu):not(script):not(style){display:none!important}body.hyperbolic-flyby #viewer{cursor:none}#flyby-menu{position:fixed;z-index:20;left:50%;top:50%;transform:translate(-50%,-50%);padding:24px;background:#07151df2;border:1px solid #386059;border-radius:8px;max-width:360px;font:14px/1.6 system-ui;color:#cce7df}#flyby-menu[hidden]{display:none}#flyby-menu button{margin:5px 6px 5px 0}';
        document.head.appendChild(style);document.body.classList.add('hyperbolic-flyby');
        var menu=document.createElement('section');menu.id='flyby-menu';menu.setAttribute('aria-label','Flyby controls');
        var heading=document.createElement('h1'),status=document.createElement('p');heading.textContent='Capital ship flyby';status.textContent='Preparing the ship and renderer…';menu.append(heading,status);document.body.appendChild(menu);
        var session=DW.flightSession.create({seed:29,terrainHit:function(){return null;},surfaceFrame:function(asteroid,direction){return DW.asteroidTerrain.surfaceFrame(asteroid,/** @type {[number,number,number]} */(direction));},onGunshot:function(){},onImpact:function(){}});
        session.reset({mode:'hyperbolic',enabled:false,profile:DW.arcade.profiles[0]});
        var snapshot=session.snapshot();snapshot.world.asteroids=[];snapshot.world.ships=[];
        var presentation=DW.flightPresentation.mount(host,function(){return snapshot.world;},function(w){snapshot.world=w;},{document:document,emptySky:true});
        try{await DW.aegisFlight.load();if(!await presentation.ready)throw new Error('Ship textures could not be prepared');}
        catch(error){status.textContent='Flyby could not start: '+String(error);return;}
        var capital=H.createCapitals({single:true});presentation.setCapital(capital);presentation.setShields(false);
        var appearance=presentation.appearance(),comparison={mode:'normal',flat:false,scale:1,mothership:false,actors:true};
        appearance.allyArt=appearance.enemyArt='concept-trio:raptor';
        var fighters=Array.from({length:10},/** @param {unknown} _ @param {number} i */function(_,i){return DW.flightSim.createCraft('flyby-'+i,DW.arcade.create(0),'ally');});
        var time=0,previous=0,paused=false,ready=true,showFighters=true;
        status.textContent='Ten fighters fly in a wide box close beside the capital. The camera holds its attitude. Space pauses the image; Esc opens these controls.';
        var play=document.createElement('button'),replay=document.createElement('button'),exit=document.createElement('a');
        play.textContent='Resume';replay.textContent='Replay';exit.textContent='Return to free flight';exit.href='./flight.html?mission=hyperbolic';
        var trafficButton=document.createElement('button');trafficButton.textContent='Hide fighters';
        trafficButton.onclick=function(){showFighters=!showFighters;trafficButton.textContent=showFighters?'Hide fighters':'Show fighters';};
        menu.append(play,replay,trafficButton,document.createElement('br'),exit);menu.hidden=true;
        play.onclick=function(){paused=false;menu.hidden=true;previous=0;};
        replay.onclick=function(){time=0;paused=false;menu.hidden=true;previous=0;};
        document.addEventListener('keydown',function(e){
            if(e.code==='Escape'){menu.hidden=!menu.hidden;paused=!menu.hidden;if(paused&&(time<.7||time>13.3))time=6;previous=0;e.preventDefault();}
            if(e.code==='Space'&&menu.hidden){paused=!paused;if(paused&&(time<.7||time>13.3))time=6;previous=0;e.preventDefault();}
        });
        document.addEventListener('visibilitychange',function(){previous=0;});
        window.addEventListener('pagehide',function(){ready=false;},{once:true});
        /** @param {number} stamp */function frame(stamp){
            if(!ready)return;
            var dt=previous&&!document.hidden?Math.min(.1,(stamp-previous)/1000):0;previous=stamp;
            if(!paused&&!document.hidden)time=(time+dt)%14;
            var takeTime=8+Math.min(14,time),pose=sample(takeTime);
            var poses=traffic(takeTime,pose);fighters.forEach(function(c,i){c.pose=poses[i];});snapshot.combat.enemies=showFighters?fighters:[];
            var view=Object.assign({},snapshot,{state:pose});
            presentation.pose(pose);presentation.render(view,appearance,comparison,0);
            // Reset the loop only while black; no in-world camera jump or labels.
            host.style.opacity=String(Math.min(1,time/.7,Math.max(0,(14-time)/.7)));
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }
    DW.hyperbolicFlyby={sample:sample,traffic:traffic,mount:mount};
}());
