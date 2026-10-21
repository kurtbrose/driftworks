(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    /** @param {string} id */function control(id){var e=document.getElementById(id);if(!e)throw new Error(id);return e;}
    var host=control('viewer'),mission=DW.flightMissions.current(),width=mission.sky.features[0].widthDeg;
    var sky=DW.flightSkybox.create(host,{fov:140}),yaw=90,pitch=-30,drag=false,x=0,y=0;
    var lens=/** @type {HTMLSelectElement} */(control('lens'));
    /** @type {ReturnType<typeof DW.flightSkybox.create>|null} */var flightSky=null;
    var fly=/** @type {HTMLAnchorElement} */(control('fly'));fly.href='flight.html?mission='+mission.id;
    control('disk').onclick=function(){yaw=90;pitch=-30;};
    control('limb').onclick=function(){yaw=90;pitch=width===80?3:width===140?35:19;};
    control('side').onclick=function(){yaw=90+width*.42;pitch=-25;};
    control('away').onclick=function(){yaw=-90;pitch=15;};
    host.onpointerdown=function(e){drag=true;x=e.clientX;y=e.clientY;host.setPointerCapture(e.pointerId);};
    host.onpointermove=function(e){if(drag){yaw-=(e.clientX-x)*.15;pitch=Math.max(-89,Math.min(89,pitch+(e.clientY-y)*.15));x=e.clientX;y=e.clientY;}};
    host.onpointerup=host.onpointercancel=function(){drag=false;};
    lens.onchange=function(){if(lens.value==='flight'&&!flightSky)flightSky=DW.flightSkybox.create(host,{fov:45});};
    function render(){
        requestAnimationFrame(render);if(document.hidden)return;
        var active=lens.value==='flight'&&flightSky?flightSky:sky;
        var canvases=host.querySelectorAll('canvas');canvases.forEach(function(c){c.style.visibility=c===canvases[0]&&flightSky?(active===flightSky?'visible':'hidden'):active===sky?'visible':'hidden';});
        var a=yaw*Math.PI/180,b=pitch*Math.PI/180,c=Math.cos(b),s=Math.sin(b);
        active.render({eye:[0,0,0],right:[Math.sin(a),-Math.cos(a),0],up:[-Math.cos(a)*s,-Math.sin(a)*s,c],back:[-Math.cos(a)*c,-Math.sin(a)*c,-s]},1,false);
        var image=host.querySelector('canvas[data-ohio="ready"]');control('status').textContent=(image?'Loaded':'Loading')+' / '+width+'° card / yaw '+yaw.toFixed(0)+'° / pitch '+pitch.toFixed(0)+'°';
    }
    requestAnimationFrame(render);
}());
