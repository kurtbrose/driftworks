(function(){
    'use strict';
    var DW=/** @type {import('./types').DriftworksNamespace} */(window.Driftworks=window.Driftworks||{});
    /** @typedef {import('./types').SkyCameraSource} Source */
    /** @typedef {import('./types').SkyOccluder} Occluder */
    /** @param {number[]} a @param {number[]} b */
    function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
    /** @param {number[]} a */
    function unit(a){var length=Math.hypot.apply(null,a);return a.map(function(v){return v/Math.max(1e-12,length);});}
    /** @param {number[]} a @param {number[]} b */
    function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
    /** @param {number[]} eye @param {number[]} ray @param {Occluder[]} blockers */
    function blocked(eye,ray,blockers){return blockers.some(function(sphere){
        var p=eye.map(function(v,i){return v-sphere.center[i];}),b=dot(p,ray),d=b*b-dot(p,p)+sphere.radius*sphere.radius;
        return d>=0&&-b+Math.sqrt(d)>0;
    });}
    /** @param {Source} source @param {number[]} eye @param {Occluder[]} blockers */
    function visibility(source,eye,blockers){
        var d=unit(source.direction),r=unit(cross(d,Math.abs(d[2])<.9?[0,0,1]:[0,1,0])),u=cross(r,d),visible=0,center=[0,0,0];
        for(var i=0;i<25;i++){
            var a=i*2.39996323,z=1-(i+.5)/25*(1-Math.cos(source.radius)),length=Math.sqrt(Math.max(0,1-z*z));
            var ray=d.map(function(v,k){return v*z+length*(r[k]*Math.cos(a)+u[k]*Math.sin(a));});
            if(!blocked(eye,ray,blockers)){visible++;center=center.map(function(v,k){return v+ray[k];});}
        }return {fraction:visible/25,direction:visible?unit(center):d};
    }
    /** @param {number} current @param {number} target @param {number} dt */
    function adapt(current,target,dt){return current+(target-current)*(1-Math.exp(-Math.max(0,Math.min(.1,dt))/(target<current?.28:1.6)));}
    /** Derive optics from the same placement that draws/bakes each source sprite.
     * @param {{asset:string,yaw:number,pitch:number,widthDeg:number,gain:number}[]} features
     * @param {Record<string,{diskFraction:number,strength:number,color:number[]}>} assets
     * @returns {Source[]} */
    function fromFeatures(features,assets){
        return features.filter(function(feature){return !!assets[feature.asset]&&feature.gain>0;}).map(function(feature){
            var source=assets[feature.asset],yaw=feature.yaw*Math.PI/180,pitch=feature.pitch*Math.PI/180;
            return {direction:[Math.cos(yaw)*Math.cos(pitch),Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch)],radius:feature.widthDeg*Math.PI/360*source.diskFraction,strength:source.strength*feature.gain,color:source.color.slice()};
        });
    }
    /** @param {HTMLElement} host */
    function create(host){
        /** @type {HTMLCanvasElement|null} */ var canvas=null;
        /** @type {CanvasRenderingContext2D|null} */ var ctx=null;
        /** @type {Source[]} */var sources=[];
        /** @type {Occluder[]} */var blockers=[];
        var enabled=true,exposure=1,last=0;
        function clear(){if(ctx&&canvas)ctx.clearRect(0,0,canvas.width,canvas.height);}
        return {
            setSources:/** @param {Source[]} value */function(value){sources=value.map(function(s){
                if(s.direction.length!==3||!s.direction.every(Number.isFinite)||Math.hypot.apply(null,s.direction)<1e-8||!Number.isFinite(s.radius)||s.radius<=0||s.radius>=Math.PI/2||!Number.isFinite(s.strength)||s.strength<0||s.color.length!==3||!s.color.every(function(c){return Number.isFinite(c)&&c>=0;}))throw new Error('Invalid sky camera source');
                return {direction:unit(s.direction),radius:s.radius,strength:s.strength,color:s.color.slice()};
            });},
            setOccluders:/** @param {Occluder[]} value */function(value){blockers=value;},
            setEnabled:/** @param {boolean} value */function(value){enabled=value;if(!value){exposure=1;clear();}},
            render:/** @param {{eye?:number[],right:number[],up:number[],back:number[]}} pose @param {number} focal @param {number} now @param {boolean} empty */function(pose,focal,now,empty){
                var dt=last?Math.max(0,now-last):0;last=now;
                if(!enabled||empty||!sources.length){exposure=1;clear();return exposure;}
                if(!canvas){canvas=document.createElement('canvas');canvas.className='sky-camera-effects';canvas.setAttribute('aria-hidden','true');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;mix-blend-mode:screen;';host.appendChild(canvas);ctx=canvas.getContext('2d');}
                if(!ctx||!canvas)return 1;
                var width=Math.max(1,Math.round(host.clientWidth)),height=Math.max(1,Math.round(host.clientHeight)),aspect=width/height,energy=0;
                if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
                clear();ctx.globalCompositeOperation='screen';var context=ctx;
                sources.forEach(function(source){
                    var visible=visibility(source,pose.eye||[0,0,0],blockers),depth=-dot(visible.direction,pose.back);
                    if(depth<=0||visible.fraction===0)return;
                    var alignment=Math.pow(Math.max(0,-dot(unit(source.direction),pose.back)),8);
                    energy+=source.strength*visible.fraction*alignment;
                    // Extended emitters need screen-derived bloom; do not paint a false central lobe.
                    if(source.radius>.12)return;
                    var x=(dot(visible.direction,pose.right)*focal/aspect/depth+1)*width/2,y=(1-dot(visible.direction,pose.up)*focal/depth)*height/2;
                    // Match the star-glare study's two angular Gaussian lobes, then
                    // compress radiance and encode for the display-space screen layer.
                    var pixelsPerRadian=height*focal/2,extent=.65,size=pixelsPerRadian*extent;
                    var color=source.color.map(function(c){return Math.round(Math.min(1,c)*255);}).join(',');
                    var gradient=context.createRadialGradient(x,y,0,x,y,size);
                    for(var stop=0;stop<=32;stop++){
                        var angle=extent*stop/32;
                        var radiance=source.strength*visible.fraction*(1.2*Math.exp(-angle*angle/.0035)+.12*Math.exp(-angle*angle/.05));
                        var alpha=stop===32?0:Math.pow(1-Math.exp(-radiance),1/2.2);
                        gradient.addColorStop(stop/32,'rgba('+color+','+alpha+')');
                    }
                    context.fillStyle=gradient;context.fillRect(x-size,y-size,size*2,size*2);
                });
                ctx.globalCompositeOperation='source-over';exposure=adapt(exposure,1/(1+energy*1.5),dt);return exposure;
            },
            dispose:function(){if(canvas)canvas.remove();canvas=null;ctx=null;sources=[];blockers=[];}
        };
    }
    DW.skyEffects={create:create,visibility:visibility,adapt:adapt,fromFeatures:fromFeatures};
}());
