(function () {
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    /** @typedef {import('./types').ShieldDisc} Disc */
    /** Presentation history only: never writes to combat state. */
    function tracker(){
        /** @type {Map<string,{shield:number,time:number,hits:{normal:number[],time:number}[]}>} */var history=new Map();
        /** @param {import('./types').FlightView} view @param {import('./types').Appearance} art @param {number} aspect */
        function collect(view,art,aspect){
            var camera=view.camera||view.state,now=view.combat.time,units=DW.sim.METERS_PER_UNIT;
            var craft=DW.training.alive(view.combat).slice();if(view.observerCraft)craft.push(view.combat.player);
            var retained=new Set(craft.map(function(c){return c.id;}));history.forEach(function(_,id){if(!retained.has(id))history.delete(id);});
            /** @type {Disc[]} */var discs=[];
            craft.forEach(function(c){
                var shield=c.shield||0,old=history.get(c.id);
                if(!old||now<old.time)old={shield:shield,time:now,hits:[]};
                if(shield<old.shield&&old.shield>0){
                    // Use the nearest fresh collision flash for the surface direction.
                    var point=view.combat.flashes.filter(function(f){return !f.destruction&&f.age<.12;}).sort(function(a,b){return Math.hypot.apply(null,a.position.map(function(v,i){return v-c.pose.eye[i];}))-Math.hypot.apply(null,b.position.map(function(v,i){return v-c.pose.eye[i];}));})[0];
                    var direction=point?point.position.map(function(v,i){return v-c.pose.eye[i];}):camera.eye.map(function(v,i){return v-c.pose.eye[i];});
                    var length=Math.hypot.apply(null,direction)||1;direction=direction.map(function(v){return v/length;});
                    /** @param {number[]} a */function dot(a){return a.reduce(function(sum,v,i){return sum+v*direction[i];},0);}
                    old.hits.unshift({normal:[dot(c.pose.right),dot(c.pose.up),dot(c.pose.back)],time:now});old.hits=old.hits.slice(0,4);
                }
                old.shield=shield;old.time=now;old.hits=old.hits.filter(function(h){return now-h.time<1.2;});history.set(c.id,old);
                if(shield<=0)return;
                var delta=c.pose.eye.map(function(v,i){return v-camera.eye[i];}),depth=-delta.reduce(function(s,v,i){return s+v*camera.back[i];},0);
                var model=DW.flightPresentation.model(c,view.combat.wave,art),radius=DW.shipPackModels.hullRadius(model)*1.18/units;
                if(depth<=radius)return;var center=DW.flightSkybox.project(delta,camera,aspect);if(!center)return;
                var edge=DW.flightSkybox.project(delta.map(function(v,i){return v+camera.up[i]*radius;}),camera,aspect);if(!edge)return;
                var ry=Math.abs(edge.y-center.y),rx=ry/aspect;
                if(ry<.002||Math.abs(center.x)>1+rx||Math.abs(center.y)>1+ry)return;
                /** @type {number[]} */var waves=[];
                old.hits.forEach(function(h){
                    var world=h.normal.map(function(_,i){return c.pose.right[i]*h.normal[0]+c.pose.up[i]*h.normal[1]+c.pose.back[i]*h.normal[2];});
                    /** @param {number[]} axis */function dot(axis){return axis.reduce(function(sum,v,i){return sum+v*world[i];},0);}
                    waves.push(dot(camera.right),dot(camera.up),dot(camera.back),now-h.time);
                });
                discs.push({box:[center.x,center.y,rx,ry],waves:waves,depth:depth});
            });return discs.sort(function(a,b){return b.depth-a.depth;});
        }
        return {collect:collect,reset:function(){history.clear();}};
    }
    /** Native foreground target: hulls are rendered once, then sampled at displaced UVs.
     * @param {import('../src/three-types').Three} THREE @param {import('../src/three-types').Renderer} renderer @param {HTMLCanvasElement} sky */
    function create(THREE,renderer,sky){
        var target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
        target.samples=4;target.texture.colorSpace=THREE.LinearSRGBColorSpace;target.texture.internalFormat='RGBA8';
        // scene3d explicitly encodes native PBR for this display-space capture.
        // RGBA8 avoids automatic decoding when the raw post shader samples it.
        var skyTexture=new THREE.Texture(sky);skyTexture.flipY=true;skyTexture.minFilter=THREE.LinearFilter;skyTexture.magFilter=THREE.LinearFilter;
        /** @type {Record<string,{value:import('../src/three-types').UniformValue}>} */var uniforms={source:{value:target.texture},sky:{value:skyTexture},resolution:{value:[1,1]},box:{value:[0,0,1,1]},hits:{value:new Float32Array(16)},waveCount:{value:0},effect:{value:0}};
        var geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),2));
        var material=new THREE.RawShaderMaterial({vertexShader:'precision highp float;attribute vec2 position;uniform vec4 box;varying vec2 q;void main(){q=position;gl_Position=vec4(box.xy+position*box.zw,0.,1.);}',fragmentShader:`precision highp float;
varying vec2 q;uniform sampler2D source,sky;uniform vec2 resolution;uniform vec4 hits[4];uniform int waveCount;uniform float effect;
void main(){vec2 uv=gl_FragCoord.xy/resolution;if(effect<.5){gl_FragColor=texture2D(source,uv);return;}
float r2=dot(q,q);if(r2>=1.)discard;vec3 n=vec3(q,sqrt(max(0.,1.-r2)));float wave=0.;vec2 slope=vec2(0.);
for(int i=0;i<4;i++){if(i>=waveCount)break;vec4 h=hits[i];float d=dot(n,h.xyz)-cos(h.w*2.6);float pulse=(1.-smoothstep(0.,.24,abs(d)))*(1.-smoothstep(.65,1.2,h.w))*smoothstep(0.,.08,h.w);wave+=pulse;slope+=(h.xy-n.xy*dot(n,h.xyz))*pulse;}
float edge=1.-smoothstep(.975,1.,r2);vec2 shift=slope/(1.+length(slope))*2.*edge;
uv=clamp((gl_FragCoord.xy+shift)/resolution,vec2(.5)/resolution,vec2(1.)-vec2(.5)/resolution);
vec4 hull=texture2D(source,uv);vec3 color=hull.rgb+texture2D(sky,uv).rgb*(1.-hull.a);
color+=vec3(.025,.3,1.)*(pow(r2,5.)*.08+min(wave,2.)*.4)*edge;gl_FragColor=vec4(color,1.);
}`,uniforms:uniforms,side:THREE.DoubleSide,transparent:false,depthTest:false,depthWrite:false,blending:THREE.NoBlending,defaultAttributeValues:{}});
        var post=new THREE.Scene(),camera=new THREE.Camera(),mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;post.add(mesh);
        var width=1,height=1;
        /** @param {import('../src/three-types').Scene} scene @param {import('../src/three-types').Object3D} view @param {Disc[]} discs @param {number} w @param {number} h */
        function render(scene,view,discs,w,h){
            if(w!==width||h!==height){target.dispose();target=new THREE.WebGLRenderTarget(w,h,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});target.samples=4;target.texture.colorSpace=THREE.LinearSRGBColorSpace;target.texture.internalFormat='RGBA8';uniforms.source.value=target.texture;width=w;height=h;}
            uniforms.resolution.value=[w,h];skyTexture.needsUpdate=true;
            try{
                renderer.setRenderTarget(target);renderer.setViewport(0,0,w,h);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,view);
                renderer.setRenderTarget(null);renderer.setViewport(0,0,w,h);renderer.clear();uniforms.effect.value=0;uniforms.box.value=[0,0,1,1];renderer.render(post,camera);
                discs.forEach(function(d){uniforms.effect.value=1;uniforms.box.value=d.box;uniforms.waveCount.value=d.waves.length/4;var hits=/** @type {Float32Array} */(uniforms.hits.value);hits.fill(0);hits.set(d.waves);renderer.render(post,camera);});
            }finally{renderer.setRenderTarget(null);renderer.setViewport(0,0,w,h);}
            return 1+discs.length;
        }
        return {render:render,dispose:function(){target.dispose();skyTexture.dispose();geometry.dispose();material.dispose();}};
    }
    DW.flightShields={tracker:tracker,create:create};
}());
