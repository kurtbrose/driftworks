(function(){
    'use strict';
    var DW=/** @type {import('../src/types').DriftworksNamespace} */(window.Driftworks);
    var assetUrl=/** @type {(value:string)=>string} */(window.Driftworks.assetUrl);
    var times=[0,2,30,60,120,300,600];
    /** @param {number} seconds */function sample(seconds){
        var t=Number.isFinite(seconds)?Math.max(-5,Math.min(600,seconds)):-5,from=0;
        for(var i=1;i<times.length;i++)if(t>=times[i])from=i;
        var to=Math.min(from+1,times.length-1),a=from===to?0:Math.max(0,Math.min(1,(t-times[from])/(times[to]-times[from])));
        return {from:from,to:to,alpha:a*a*(3-2*a)};
    }
    /** @param {string} file */function load(file){return new Promise(/** @param {(image:HTMLImageElement)=>void} resolve */function(resolve,reject){var image=new Image();image.onload=function(){resolve(image);};image.onerror=function(){reject(new Error('Cannot load planet impact '+file));};image.src=assetUrl('../assets/backgrounds/planet-hero-v1/'+file);});}
    /** @param {HTMLCanvasElement} canvas */function context(canvas){var ctx=canvas.getContext('2d');if(!ctx)throw new Error('Planet impact requires Canvas2D');return ctx;}
    async function create(){
        var images=await Promise.all(times.map(function(_,i){return 'registered-v3/'+i+'.png';}).map(load));
        var w=images[0].naturalWidth,h=images[0].naturalHeight;
        if(!w||!h||images.some(function(image){return !image.naturalWidth||!image.naturalHeight||Math.abs(image.naturalWidth/image.naturalHeight-w/h)>1e-6;}))throw new Error('Planet impact plates must match master aspect ratio');
        var canvas=document.createElement('canvas'),layer=document.createElement('canvas');
        [canvas,layer].forEach(function(c){c.width=w;c.height=h;});
        var out=context(canvas),paint=context(layer);
        // Registered sources already contain a feathered event on the identical frozen master.
        var lastTime=NaN,lastEnabled=false;
        return {canvas:canvas,
            /** @param {number} seconds @param {boolean} [enabled] */
            draw:function(seconds,enabled){
                var active=enabled!==false;if(seconds===lastTime&&active===lastEnabled)return false;lastTime=seconds;lastEnabled=active;
                var frame=sample(seconds);out.clearRect(0,0,w,h);out.drawImage(images[0],0,0,w,h);
                if(!active||seconds<=0)return true;
                paint.clearRect(0,0,w,h);paint.globalAlpha=1;paint.drawImage(images[frame.from],0,0,w,h);
                if(frame.alpha>0){paint.globalAlpha=frame.alpha;paint.drawImage(images[frame.to],0,0,w,h);}paint.globalAlpha=1;
                out.drawImage(layer,0,0);return true;
            }
        };
    }
    DW.planetImpact={create:create,sample:sample,times:times};
}());
