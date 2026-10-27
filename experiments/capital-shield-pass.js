(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    /** @typedef {import('./types').CapitalShieldFrame} Frame */
    /** @param {import('../src/three-types').Three} THREE @param {import('../src/three-types').Renderer} renderer @param {HTMLCanvasElement} sky */
    function create(THREE,renderer,sky){
        var supported=!!renderer.getContext().getExtension('EXT_color_buffer_float'),units=DW.sim.METERS_PER_UNIT;
        var source=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter}),field=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,type:THREE.HalfFloatType});
        var width=0,height=0;
        var skyTexture=new THREE.Texture(sky);skyTexture.flipY=true;skyTexture.minFilter=THREE.LinearFilter;skyTexture.magFilter=THREE.LinearFilter;
        /** @type {Record<string,{value:import('../src/three-types').UniformValue}>} */var u={units:{value:units},target:{value:[0,0,0]},impact:{value:[0,0,0]},hitNormal:{value:[0,0,1]},age:{value:0},life:{value:.36},radius:{value:36},size:{value:[1,1]},sourceDepth:{value:null},right:{value:[1,0,0]},up:{value:[0,1,0]},outputMode:{value:0}};
        var patchMaterial=new THREE.RawShaderMaterial({vertexShader:`precision highp float;attribute vec3 position,normal;uniform mat4 modelViewMatrix,projectionMatrix;uniform vec3 target;uniform float units;varying vec3 point,n,relative;void main(){point=position;n=normal;relative=position/units-target;gl_Position=projectionMatrix*modelViewMatrix*vec4(relative,1.);}`,fragmentShader:`precision highp float;
varying vec3 point,n,relative;uniform vec3 impact,hitNormal,right,up,cameraPosition;uniform float age,life,radius,outputMode;uniform vec2 size;uniform sampler2D sourceDepth;
void main(){vec3 normal=normalize(n);if(dot(normal,cameraPosition-relative)<=0.)discard;
if(outputMode>1.5){gl_FragColor=vec4(.021,.168,.35,.35);return;}
if(age<0.||age>=life||dot(normal,hitNormal)<.15)discard;vec3 delta=point-impact;float d=length(delta);if(d>radius)discard;
if(outputMode<.5&&gl_FragCoord.z>texture2D(sourceDepth,gl_FragCoord.xy/size).r+.000002)discard;
float t=age/life,front=radius*t;float ring=(1.-smoothstep(0.,5.,abs(d-front)))*pow(1.-t,1.7);float flash=exp(-d*d/12.)*exp(-age/.025);if(ring+flash<.002)discard;
vec3 radial=delta/max(.001,d);vec2 slope=vec2(dot(radial,right),dot(radial,up))*ring;
if(outputMode>.5){gl_FragColor=vec4(vec3(.035,.3,1.)*ring*.85+vec3(.35,.75,1.)*flash,min(1.,ring+flash));return;}
gl_FragColor=vec4(slope,ring,flash);
}`,uniforms:u,side:THREE.DoubleSide,transparent:true,premultipliedAlpha:true,forceSinglePass:true,depthTest:false,depthWrite:false,blending:THREE.AdditiveBlending,defaultAttributeValues:{}});
        /** @type {Record<string,{value:import('../src/three-types').UniformValue}>} */var c={source:{value:source.texture},sky:{value:skyTexture},field:{value:field.texture},size:{value:[1,1]},bend:{value:2}};
        var quad=new THREE.BufferGeometry();quad.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),2));
        var compose=new THREE.RawShaderMaterial({vertexShader:'precision highp float;attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}',fragmentShader:`precision highp float;uniform sampler2D source,sky,field;uniform vec2 size;uniform float bend;void main(){vec2 uv=gl_FragCoord.xy/size;vec4 f=texture2D(field,uv);if(f.b+f.a<.0001){gl_FragColor=texture2D(source,uv);return;}vec2 shift=f.rg/(1.+length(f.rg))*bend;vec2 displaced=clamp(uv+shift/size,vec2(.5)/size,vec2(1.)-vec2(.5)/size);vec4 ship=texture2D(source,displaced);vec3 color=ship.rgb+texture2D(sky,displaced).rgb*(1.-ship.a);color+=vec3(.035,.3,1.)*min(2.,f.b)*.85+vec3(.35,.75,1.)*min(2.,f.a);gl_FragColor=vec4(color,1.);}`,uniforms:c,side:THREE.DoubleSide,transparent:false,depthTest:false,depthWrite:false,blending:THREE.NoBlending,defaultAttributeValues:{}});
        var patchScene=new THREE.Scene(),post=new THREE.Scene(),postCamera=new THREE.Camera(),mesh=new THREE.Mesh(quad,patchMaterial);mesh.frustumCulled=false;patchScene.add(mesh);var full=new THREE.Mesh(quad,compose);full.frustumCulled=false;post.add(full);
        /** @type {Map<string,{geometry:import('../src/three-types').Geometry;triangles:number}>} */var cache=new Map();
        /** @param {Frame} frame @param {number} anchor @param {boolean} heavy @param {boolean} whole */
        function geometry(frame,anchor,heavy,whole){
            var key=whole?'whole':anchor+':'+heavy,cached=cache.get(key);if(cached)return cached;
            var envelope=frame.envelope,indices=whole?envelope.indices:envelope.anchors[anchor].patches[heavy?1:0],data=new Float32Array(indices.length*6);
            indices.forEach(function(id,i){for(var k=0;k<6;k++)data[i*6+k]=envelope.vertices[id*6+k];});
            var buffer=new THREE.InterleavedBuffer(data,6),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.InterleavedBufferAttribute(buffer,3,0));g.setAttribute('normal',new THREE.InterleavedBufferAttribute(buffer,3,3));cached={geometry:g,triangles:indices.length/3};cache.set(key,cached);return cached;
        }
        /** @param {number} w @param {number} h */
        function resize(w,h){if(w===width&&h===height)return;source.dispose();field.dispose();source=new THREE.WebGLRenderTarget(w,h,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});source.samples=4;source.texture.internalFormat='RGBA8';source.texture.colorSpace=THREE.LinearSRGBColorSpace;source.depthTexture=new THREE.DepthTexture(w,h,THREE.UnsignedIntType);field=new THREE.WebGLRenderTarget(Math.ceil(w/2),Math.ceil(h/2),{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,type:THREE.HalfFloatType});width=w;height=h;c.source.value=source.texture;c.field.value=field.texture;u.sourceDepth.value=source.depthTexture;}
        /** @param {import('../src/three-types').Scene} scene @param {import('../src/three-types').Object3D} camera @param {Frame} frame @param {number} w @param {number} h */
        function render(scene,camera,frame,w,h){
            var refract=frame.mode==='refraction'&&supported,wire=frame.mode==='envelope',draws=0,triangles=0;
            if(refract)resize(w,h);
            var fw=Math.ceil(w/2),fh=Math.ceil(h/2),matrix=camera.matrixWorld.elements;u.right.value=matrix.slice(0,3);u.up.value=matrix.slice(4,7);u.target.value=frame.target;u.size.value=[fw,fh];u.outputMode.value=wire?2:refract?0:1;patchMaterial.depthTest=!refract;patchMaterial.wireframe=wire;patchMaterial.blending=wire?THREE.NormalBlending:THREE.AdditiveBlending;
            try{
                renderer.setRenderTarget(refract?source:null);renderer.setViewport(0,0,w,h);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);
                if(refract){skyTexture.needsUpdate=true;renderer.setRenderTarget(field);renderer.setViewport(0,0,fw,fh);renderer.clear();}
                var hits=wire?[{anchor:0,age:0,heavy:false}]:frame.impacts.filter(function(hit){return hit.age>=0&&hit.age<(hit.heavy?.65:.36);});
                hits.forEach(function(hit){var anchor=frame.envelope.anchors[hit.anchor],g=geometry(frame,hit.anchor,hit.heavy,wire||frame.strategy==='whole');mesh.geometry=g.geometry;u.impact.value=frame.envelope.vertices.slice(anchor.vertex*6,anchor.vertex*6+3);u.hitNormal.value=frame.envelope.vertices.slice(anchor.vertex*6+3,anchor.vertex*6+6);u.age.value=hit.age;u.life.value=hit.heavy?.65:.36;u.radius.value=hit.heavy?80:36;renderer.render(patchScene,camera);draws++;triangles+=g.triangles;});
                if(refract){renderer.setRenderTarget(null);renderer.setViewport(0,0,w,h);renderer.clear();c.size.value=[w,h];c.bend.value=frame.bend;renderer.render(post,postCamera);draws++;triangles+=2;}
            }finally{renderer.setRenderTarget(null);renderer.setViewport(0,0,w,h);}
            return {draws:draws,triangles:triangles};
        }
        return {supported:supported,render:render,dispose:function(){source.dispose();field.dispose();skyTexture.dispose();quad.dispose();patchMaterial.dispose();compose.dispose();cache.forEach(function(g){g.geometry.dispose();});cache.clear();}};
    }
    DW.capitalShieldPass={create:create};
}());
