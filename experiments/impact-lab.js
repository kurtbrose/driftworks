(function () {
    'use strict';
    var assetUrl=/** @type {(value:string)=>string} */(window.Driftworks.assetUrl);
    /** @param {string} id */
    function element(id){var e=document.getElementById(id);if(!e)throw new Error(id);return e;}
    /** @param {HTMLCanvasElement} canvas */
    function context(canvas){var c=canvas.getContext('2d');if(!c)throw new Error('Canvas unavailable');return c;}
    var canvas=/** @type {HTMLCanvasElement} */(element('sky')),out=context(canvas);
    var layer=document.createElement('canvas'),mask=document.createElement('canvas'),paint=context(layer),m=context(mask);
    var slider=/** @type {HTMLInputElement} */(element('time')),speed=/** @type {HTMLSelectElement} */(element('speed'));
    var sequence=/** @type {HTMLSelectElement} */(element('sequence')),stage=/** @type {HTMLSelectElement} */(element('stage'));
    var frames=[{name:'master',time:0,label:'Pristine master'},{name:'flash',time:.25,label:'Impact flash'},
        {name:'between-12',time:12,label:'Vapor dome'},{name:'between-32',time:32,label:'Low ejecta'},
        {name:'between-60',time:60,label:'Rising column'},{name:'between-90',time:90,label:'Maturing plume'},
        {name:'plume',time:120,label:'Developed plume'}];
    var t=-5,playing=false,last=0,zoom=1,panX=0,panY=0,drag=false,x=0,y=0;
    /** @type {HTMLImageElement[]} */var images=[];
    /** @param {string} name */
    function load(name){return new Promise(/** @param {(image:HTMLImageElement)=>void} resolve */function(resolve,reject){var image=new Image();image.onload=function(){resolve(image);};image.onerror=function(){reject(new Error('Unable to load '+name));};image.src=assetUrl('../assets/backgrounds/impact-v1/'+name+'.png');});}
    function toggle(){playing=!playing;element('play').textContent=playing?'Pause':'Play';}
    element('play').onclick=toggle;element('reset').onclick=function(){t=-5;};element('view').onclick=function(){zoom=1;panX=panY=0;};
    slider.oninput=function(){t=Number(slider.value);};
    stage.onchange=function(){t=Number(stage.value);if(playing)toggle();};
    window.addEventListener('keydown',function(e){if(e.code==='Space'&&e.target===document.body){e.preventDefault();toggle();}});
    canvas.onpointerdown=function(e){drag=true;x=e.clientX;y=e.clientY;canvas.setPointerCapture(e.pointerId);};
    canvas.onpointermove=function(e){if(drag){panX+=e.clientX-x;panY+=e.clientY-y;x=e.clientX;y=e.clientY;}};
    canvas.onpointerup=canvas.onpointercancel=function(){drag=false;};
    canvas.addEventListener('wheel',function(e){e.preventDefault();zoom=Math.max(1,Math.min(2.5,zoom-e.deltaY*.001));},{passive:false});
    /** @param {number} value */
    function smooth(value){value=Math.max(0,Math.min(1,value));return value*value*(3-2*value);}
    function draw(){
        var w=images[0].naturalWidth,h=images[0].naturalHeight;
        // Frozen master + destination-in feathering, matching face-blend.js.
        // Keep native art resolution rather than the portrait's 512px surface.
        paint.globalAlpha=1;paint.globalCompositeOperation='source-over';paint.clearRect(0,0,w,h);
        var from=0,to=0,alpha=0;
        if(sequence.value==='original'){
            paint.drawImage(images[0],0,0);paint.globalAlpha=smooth(t/.25);paint.drawImage(images[1],0,0);
            paint.globalAlpha=smooth((t-3)/117);paint.drawImage(images[6],0,0);
        }else{
            for(var i=1;i<frames.length;i++)if(t>=frames[i].time)from=i;
            to=Math.min(from+1,frames.length-1);
            alpha=from===to?0:smooth((t-frames[from].time)/(frames[to].time-frames[from].time));
            paint.drawImage(images[from],0,0);
            if(alpha>0){paint.globalAlpha=alpha;paint.drawImage(images[to],0,0);}
        }
        paint.globalAlpha=1;
        paint.globalCompositeOperation='destination-in';paint.drawImage(mask,0,0);paint.globalCompositeOperation='source-over';
        var ratio=Math.min(window.devicePixelRatio||1,2),cw=Math.round(innerWidth*ratio),ch=Math.round(innerHeight*ratio);
        if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
        var scale=Math.min(cw/w,ch/h)*zoom,dw=w*scale,dh=h*scale;
        panX=Math.max(-Math.max(0,(dw-cw)/2)/ratio,Math.min(Math.max(0,(dw-cw)/2)/ratio,panX));
        panY=Math.max(-Math.max(0,(dh-ch)/2)/ratio,Math.min(Math.max(0,(dh-ch)/2)/ratio,panY));
        var left=(cw-dw)/2+panX*ratio,top=(ch-dh)/2+panY*ratio;
        out.fillStyle='#010308';out.fillRect(0,0,cw,ch);out.drawImage(images[0],left,top,dw,dh);out.drawImage(layer,left,top,dw,dh);
        slider.value=String(t);var seconds=Math.floor(Math.abs(t));element('clock').textContent=(t<0?'−':'+')+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
        element('phase').textContent=sequence.value==='original'?(t<0?'Pristine master':t<3?'Impact flash':t<120?'Ejecta / steam rising':'Developed plume'):
            frames[from].label+(alpha>0?' → '+frames[to].label:'');
    }
    /** @param {number} now */
    function render(now){var dt=last?Math.min((now-last)/1000,.1):0;last=now;if(playing&&!document.hidden)t=Math.min(180,t+dt*Number(speed.value));draw();requestAnimationFrame(render);}
    Promise.all(frames.map(function(frame){return load(frame.name);})).then(function(loaded){
        images=loaded;var w=images[0].naturalWidth,h=images[0].naturalHeight;
        if(images.some(function(image){return image.naturalWidth!==w||image.naturalHeight!==h;}))throw new Error('Matched plates must have identical dimensions');
        layer.width=mask.width=w;layer.height=mask.height=h;
        // Fixed permission region includes the rising plume; outside is master-only.
        m.save();m.translate(w*.625,h*.525);m.scale(w*.255,h*.285);
        var gradient=m.createRadialGradient(0,0,0,0,0,1);gradient.addColorStop(0,'white');gradient.addColorStop(.72,'white');gradient.addColorStop(1,'transparent');
        m.fillStyle=gradient;m.fillRect(-1,-1,2,2);m.restore();
        element('error').textContent='';toggle();requestAnimationFrame(render);
    }).catch(/** @param {unknown} error */function(error){element('error').textContent=error instanceof Error?error.message:String(error);});
}());
