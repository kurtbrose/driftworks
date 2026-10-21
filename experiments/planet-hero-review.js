(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    /** @param {string} id */function control(id){var e=document.getElementById(id);if(!e)throw new Error(id);return e;}
    var host=control('viewer'),mission=DW.flightMissions.current(),width=mission.sky.features[0].widthDeg;
    var sky=DW.flightSkybox.create(host,{fov:140}),yaw=90,pitch=-30,drag=false,x=0,y=0;
    var lens=/** @type {HTMLSelectElement} */(control('lens'));
    /** @type {ReturnType<typeof DW.flightSkybox.create>|null} */var flightSky=null;
    /** @type {Awaited<ReturnType<typeof DW.planetImpact.create>>|null} */var animation=null;
    /** @type {ReturnType<typeof DW.flightSkybox.create>|null} */var uploaded=null;
    var time=-5,playing=false,last=0,lastDraw=0;
    var timeline=/** @type {HTMLInputElement} */(control('event-time')),speed=/** @type {HTMLSelectElement} */(control('event-speed')),pristine=/** @type {HTMLInputElement} */(control('pristine'));
    var stages=/** @type {HTMLSelectElement} */(control('event-stage'));
    function toggle(){if(!animation)return;playing=!playing;control('event-play').textContent=playing?'Pause':'Play';}
    control('event-play').onclick=toggle;control('event-reset').onclick=function(){time=-5;};
    timeline.oninput=function(){time=Number(timeline.value);};
    stages.onchange=function(){time=Number(stages.value);if(playing)toggle();};
    DW.planetImpact.create().then(function(value){animation=value;toggle();}).catch(/** @param {unknown} error */function(error){control('event-phase').textContent=String(error);});
    var fly=/** @type {HTMLAnchorElement} */(control('fly'));fly.href='flight.html?mission=planet-impact-baked';
    control('disk').onclick=function(){yaw=90;pitch=-30;};
    control('limb').onclick=function(){yaw=90;pitch=width===80?3:width===140?35:19;};
    control('side').onclick=function(){yaw=90+width*.42;pitch=-25;};
    control('away').onclick=function(){yaw=-90;pitch=15;};
    host.onpointerdown=function(e){drag=true;x=e.clientX;y=e.clientY;host.setPointerCapture(e.pointerId);};
    host.onpointermove=function(e){if(drag){yaw-=(e.clientX-x)*.15;pitch=Math.max(-89,Math.min(89,pitch+(e.clientY-y)*.15));x=e.clientX;y=e.clientY;}};
    host.onpointerup=host.onpointercancel=function(){drag=false;};
    lens.onchange=function(){if(lens.value==='flight'&&!flightSky)flightSky=DW.flightSkybox.create(host,{fov:45});};
    /** @param {number} now */function render(now){
        requestAnimationFrame(render);var dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(document.hidden)return;
        if(playing&&animation)time=Math.min(180,time+dt*Number(speed.value));
        var active=lens.value==='flight'&&flightSky?flightSky:sky;
        if(animation&&(now-lastDraw>=1000/30||!playing||uploaded!==active)){
            var changed=animation.draw(time,!pristine.checked);
            if(changed||uploaded!==active){active.setPlanetImage(animation.canvas);uploaded=active;}lastDraw=now;
            timeline.value=String(time);var sample=DW.planetImpact.sample(time),names=['Pristine','Flash','Hot vapor','Ejecta cap','Cooling cap','Spreading steam','Late ejecta'];
            var exact=Array.from(stages.options).find(function(option){return option.value!==''&&Math.abs(Number(option.value)-time)<.001;});stages.value=exact?exact.value:'';
            control('event-phase').textContent=(pristine.checked?'Pristine reference':names[sample.from]+(sample.alpha>0?' → '+names[sample.to]:''))+' / '+time.toFixed(1)+' s';
        }
        var canvases=host.querySelectorAll('canvas');canvases.forEach(function(c){c.style.visibility=c===canvases[0]&&flightSky?(active===flightSky?'visible':'hidden'):active===sky?'visible':'hidden';});
        var a=yaw*Math.PI/180,b=pitch*Math.PI/180,c=Math.cos(b),s=Math.sin(b);
        if(mission.sky.bakedImpact)active.setImpactTime(pristine.checked?-5:time);
        active.render({eye:[0,0,0],right:[Math.sin(a),-Math.cos(a),0],up:[-Math.cos(a)*s,-Math.sin(a)*s,c],back:[-Math.cos(a)*c,-Math.sin(a)*c,-s]},1,false);
        var image=host.querySelector('canvas[data-ohio="ready"]');control('status').textContent=(image?'Loaded':'Loading')+' / '+width+'° card / yaw '+yaw.toFixed(0)+'° / pitch '+pitch.toFixed(0)+'°';
    }
    requestAnimationFrame(render);
}());
