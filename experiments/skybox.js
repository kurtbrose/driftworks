(function () {
    'use strict';
    var assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').Pose} Pose */
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    var options = ['Milky Way  / original', 'A  / Open void', 'B  / Galactic horizon', 'C  / Dark dust', 'D  / Distant sun', 'E  / Cold veil', 'F  / Island universes', 'G / Hero galaxy', 'H / Hero nebula', 'I / Hero sun', 'J / River of stars'];
    /** @typedef {{asset:string,yaw:number,pitch:number,roll:number,widthDeg:number,gain:number}} HeroFeature */
    /** @param {HeroFeature} feature @param {number} aspect */
    function featureFrame(feature, aspect) {
        var yaw=feature.yaw*Math.PI/180, pitch=feature.pitch*Math.PI/180, roll=feature.roll*Math.PI/180;
        var center=[Math.cos(pitch)*Math.cos(yaw),Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch)];
        var east=[-Math.sin(yaw),Math.cos(yaw),0];
        var north=[-Math.sin(pitch)*Math.cos(yaw),-Math.sin(pitch)*Math.sin(yaw),Math.cos(pitch)];
        var right=east.map(function (v,i) {return v*Math.cos(roll)+north[i]*Math.sin(roll);});
        var up=north.map(function (v,i) {return v*Math.cos(roll)-east[i]*Math.sin(roll);});
        var extent=Math.tan(feature.widthDeg*Math.PI/360), vertices=/** @type {number[]} */ ([]);
        [[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]].forEach(function (corner) {
            for(var i=0;i<3;i++) vertices.push(center[i]+right[i]*corner[0]*extent+up[i]*corner[1]*extent/aspect);
            vertices.push((corner[0]+1)/2,(1-corner[1])/2);
        });
        return new Float32Array(vertices);
    }
    /** @type {Promise<Record<string,import('../src/types').SkyEnvironmentLighting>>|null} */
    var lightingCache=null;
    function loadSkyLighting(){
        if(!lightingCache){
            var url=new URL(assetUrl('../assets/backgrounds/sky-lighting-v1.json'),window.location.href);
            lightingCache=window.fetch(url).then(function(response){if(!response.ok)throw new Error('Sky lighting cache unavailable');return response.json();})
                .then(/** @param {{version:number,families:Record<string,{sh:number[][],map:string,radiance?:string}>}} data */ function(data){
                    if(data.version!==1 || !data.families)throw new Error('Invalid sky lighting cache');
                    return Promise.all(Object.keys(data.families).map(function(key){
                        return new Promise(/** @param {(entry:{key:string,value:import('../src/types').SkyEnvironmentLighting})=>void} resolve */ function(resolve,reject){
                            var image=new Image();image.onload=async function(){
                                try{
                                    var family=data.families[key];
                                    /** @type {Float32Array|undefined} */ var radiance;
                                    if(family.radiance){
                                        var response=await window.fetch(assetUrl(family.radiance,url.href));
                                        if(!response.ok)throw new Error('Sky radiance cache unavailable');
                                        var bytes=await response.arrayBuffer();
                                        if(bytes.byteLength!==512*256*4*4)throw new Error('Invalid sky radiance dimensions');
                                        radiance=new Float32Array(bytes);
                                    }
                                    resolve({key:key,value:{sh:family.sh,map:family.map,image:image,radiance:radiance}});
                                }catch(error){reject(error);}
                            };
                            image.onerror=function(){reject(new Error('Sky reflection cache unavailable'));};image.src=assetUrl(data.families[key].map,url.href);
                        });
                    })).then(function(entries){
                        /** @type {Record<string,import('../src/types').SkyEnvironmentLighting>} */ var result={};
                        entries.forEach(function(entry){result[entry.key]=entry.value;});return result;
                    });
                });
        }
        return lightingCache;
    }
    var ohioMission = typeof window.location !== 'undefined' && /[?&]mission=ohio(?:&|$)/.test(window.location.search || '');
    var focal = 1 / Math.tan(Math.PI / 8);
    function stars() {
        var data = /** @type {number[]} */ ([]), seed = 58319;
        function random() {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        }
        for (var i = 0; i < 3200; i++) {
            var z = random() * 2 - 1, angle = random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
            data.push(r * Math.cos(angle), r * Math.sin(angle), z, .4 + Math.pow(random(), 3) * .6);
        }
        return new Float32Array(data);
    }
    /** @param {Vector} direction @param {Pose} pose @param {number} aspect */
    function project(direction, pose, aspect) {
        /** @param {Vector} a @param {Vector} b */
        function dot(a, b) {
            return a.reduce(function (sum, x, i) {
                return sum + x * b[i];
            }, 0);
        }
        var depth = -dot(direction, pose.back);
        return depth > 0 ? { x: dot(direction, pose.right) * focal / aspect / depth, y: dot(direction, pose.up) * focal / depth } : null;
    }
    /** @param {HTMLElement} host @param {{style?:number}=} config */
    function create(host, config) {
        var canvas = document.createElement('canvas');
        canvas.className = 'flight-skybox';
        canvas.setAttribute('aria-hidden', 'true');
        host.prepend(canvas);
        var context = canvas.getContext('webgl', { alpha: false, antialias: false });
        if (!context)
            throw new Error('Flight skybox requires WebGL');
        const gl = context;
        /** @param {number} type @param {string} source */
        function shader(type, source) {
            var sh = gl.createShader(type);
            if (!sh)
                throw new Error('Could not allocate skybox shader');
            gl.shaderSource(sh, source);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
                throw new Error(gl.getShaderInfoLog(sh) || 'Could not compile skybox shader');
            return sh;
        }
        /** @param {string} vertex @param {string} fragment */
        function program(vertex, fragment) {
            var p = gl.createProgram();
            if (!p)
                throw new Error('Could not allocate skybox program');
            gl.attachShader(p, shader(gl.VERTEX_SHADER, vertex));
            gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fragment));
            gl.linkProgram(p);
            if (!gl.getProgramParameter(p, gl.LINK_STATUS))
                throw new Error(gl.getProgramInfoLog(p) || 'Could not link skybox program');
            return p;
        }
        // All features are functions of a unit direction: no translation, seams or image enlargement.
        var sky = program('attribute vec2 position; varying vec2 screen; void main(){screen=position;gl_Position=vec4(position,0.,1.);}', `
precision highp float;
varying vec2 screen;
uniform vec3 right,up,back;
uniform float aspect,focal,style;
uniform sampler2D panorama;
uniform sampler2D noiseMap;
uniform float exposure;
uniform sampler2D ohioPlanet,ohioSun;
uniform vec3 ohioPlanetCenter,ohioPlanetRight,ohioPlanetUp;
uniform vec3 ohioSunCenter,ohioSunRight,ohioSunUp;
uniform float ohioPlanetGain,ohioSunGain;
// Same tangent-plane UVs and edge treatment as the authored landmark quads,
// composed directly into the opaque background instead of blended over it.
vec3 ohioLandmark(sampler2D sourceMap,vec3 ray,vec3 center,vec3 horizontal,vec3 vertical,float gain){
    float depth=dot(ray,center);
    if(depth<=0.)return vec3(0.);
    vec2 p=vec2(dot(ray,horizontal),dot(ray,vertical))/depth;
    if(abs(p.x)>1. || abs(p.y)>1.)return vec3(0.);
    vec2 uv=(vec2(1.)-p)*.5;
    vec4 source=texture2D(sourceMap,uv);
    float edge=smoothstep(0.,.035,min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y)));
    return clamp(max(vec3(0.),(source.rgb-2./255.)/(1.-2./255.))*source.a*edge*gain*exposure,0.,1.);
}
// Continuous directional noise. The texture supplies random values, not visible grain.
float noise(vec3 p){
    vec3 cell=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    vec2 uv=cell.xy+vec2(37.,17.)*cell.z+f.xy;
    float a=texture2D(noiseMap,(uv+.5)/256.).r;
    float b=texture2D(noiseMap,(uv+vec2(37.5,17.5))/256.).r;
    return mix(a,b,f.z);
}
float cloud(vec3 p){
    float sum=0., weight=.52;
    for(int i=0;i<6;i++){sum+=weight*noise(p);p=p*2.03+vec3(13.1,7.7,19.3);weight*=.49;}
    return sum;
}
vec3 galaxy(vec3 ray,vec3 center,vec3 axis){
    if(dot(ray,center)<.9) return vec3(0.);
    vec3 d=ray-center;
    float x=dot(d,axis), y=dot(d,normalize(cross(center,axis)))*4.5;
    float r=length(vec2(x,y));
    float angle=atan(y,x);
    float arms=pow(.5+.5*cos(angle*2.-log(r+.002)*4.5),5.);
    float disk=exp(-r*38.)*(1.-smoothstep(.015,.11,r));
    float knots=cloud(ray*160.);
    float core=exp(-r*r/.000026);
    float lane=smoothstep(.0,.005,abs(y+.0015*sin(x*100.)));
    return vec3(.16,.22,.32)*disk*(.3+arms*2.)*(.45+knots)*(.4+.6*lane)+vec3(.9,.72,.46)*core;
}
void main(){
    if(style>9.5 && style<10.5){
        vec3 riverRay=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
        vec2 riverUV=vec2(atan(riverRay.y,riverRay.x)/6.28318530718+.5,acos(clamp(riverRay.z,-1.,1.))/3.14159265359);
        gl_FragColor=vec4(texture2D(panorama,riverUV).rgb*exposure,1.);return;
    }
    if(style>10.5){
        vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
        vec3 planet=ohioLandmark(ohioPlanet,ray,ohioPlanetCenter,ohioPlanetRight,ohioPlanetUp,ohioPlanetGain);
        vec3 sun=ohioLandmark(ohioSun,ray,ohioSunCenter,ohioSunRight,ohioSunUp,ohioSunGain);
        gl_FragColor=vec4(planet+sun-planet*sun,1.);return;
    }
    if(style>6.5){gl_FragColor=vec4(0.,0.,0.,1.);return;}
    vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
    vec3 color=vec3(.00003,.00006,.00012);
    float latitude=dot(ray,normalize(vec3(.25,.12,1.)));
    float structure=.5, fine=.5;
    if((style>1.5 && style<3.5) || (style>4.5 && style<5.5)){
        structure=cloud(ray*9.);fine=cloud(ray*38.);
    }
    float warped=latitude+(structure-.5)*.12;
    if(style<.5){
        vec2 uv=vec2(atan(ray.y,ray.x)/6.28318530718+.5,acos(clamp(ray.z,-1.,1.))/3.14159265359);
        gl_FragColor=vec4(texture2D(panorama,uv).rgb*.65*exposure,1.);return;
    }else if(style<1.5){
        color=vec3(.00003,.00006,.00012);
    }else if(style<2.5){
        float band=exp(-warped*warped/.0015);
        float lane=smoothstep(.018,.05,abs(warped+(fine-.5)*.035));
        color+=mix(vec3(.006,.004,.002),vec3(.065,.085,.12),lane)*band*(.25+structure*.9)*( .4+fine);
    }else if(style<3.5){
        float haze=exp(-latitude*latitude/.22);
        float edge=smoothstep(.32,.62,structure);
        float rim=exp(-pow((structure-.43)*15.,2.));
        color+=vec3(.025,.055,.1)*haze*(edge*.8+rim*.25)*(.35+fine*1.2);
    }else if(style<4.5){
        float d=length(ray-normalize(vec3(.3,1.,.06)));
        color+=vec3(1.,.78,.46)*(exp(-d*d/.000008)*5.+.16*exp(-d*d/.0004)+.008*exp(-d*d/.012));
    }else if(style<5.5){
        float veil=pow(smoothstep(.45,1.,dot(ray,normalize(vec3(-.8,.7,.1)))),2.);
        float wisps=pow(max(0.,1.-abs(structure-.46)*5.),5.);
        color+=vec3(.025,.065,.12)*veil*(.12+wisps)*(.3+fine*1.4);
    }else{
        color+=galaxy(ray,normalize(vec3(-.22,1.,.04)),normalize(vec3(1.,.22,.35)));
    }
    // Explicit display transfer keeps faint structures visible rather than crushing them to black.
    gl_FragColor=vec4(pow(max(color*exposure,vec3(0.)),vec3(1./2.2)),1.);
}`);
        var heroProgram = program(`
attribute vec3 direction; attribute vec2 texcoord;
uniform vec3 right,up,back; uniform float aspect,focal;
varying vec2 uv;
void main(){uv=texcoord;gl_Position=vec4(dot(direction,right)*focal/aspect,dot(direction,up)*focal,0.,-dot(direction,back));}`, `
precision highp float; varying vec2 uv;
uniform sampler2D feature; uniform float gain,exposure;
void main(){
    vec4 source=texture2D(feature,uv);
    float edge=smoothstep(0.,.035,min(min(uv.x,uv.y),min(1.-uv.x,1.-uv.y)));
    vec3 color=max(vec3(0.),(source.rgb-2./255.)/(1.-2./255.))*source.a*edge*gain*exposure;
    gl_FragColor=vec4(clamp(color,0.,1.),1.);
}`);
        /** @type {{buffer:WebGLBuffer|null,texture:WebGLTexture|null,gain:number,family:string}[]} */
        var heroFeatures=[];
        var heroLoading=false;
        /** @type {{texture:WebGLTexture|null,center:number[],right:number[],up:number[],gain:number,loaded:boolean}[]} */
        var ohioTextures=[];
        if (ohioMission) {
            // The planet is lit from its upper left, toward the viewer.
            // +Y faces the planet; the sun is behind the left shoulder (-X,-Y,+Z).
            var ohioAssets = [
                {asset:'ohio-planet-v1.png',yaw:90,pitch:4,roll:0,widthDeg:44,gain:1},
                {asset:'features/warm-sun-v1.png',yaw:225,pitch:30,roll:0,widthDeg:7,gain:1}
            ];
            ohioAssets.forEach(function (feature) {
                var vertices=featureFrame(feature,1), center=/** @type {number[]} */ ([]), horizontal=/** @type {number[]} */ ([]), vertical=/** @type {number[]} */ ([]);
                for(var axis=0;axis<3;axis++){
                    center.push((vertices[axis]+vertices[25+axis])/2);
                    horizontal.push((vertices[5+axis]-vertices[axis])/2);
                    vertical.push((vertices[10+axis]-vertices[axis])/2);
                }
                var horizontalLength=horizontal.reduce(function(sum,v){return sum+v*v;},0);
                var verticalLength=vertical.reduce(function(sum,v){return sum+v*v;},0);
                var texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
                // Complete black placeholder: either image may load first or fail.
                gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));
                gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
                var entry={texture:texture,center:center,right:horizontal.map(function(v){return v/horizontalLength;}),
                    up:vertical.map(function(v){return v/verticalLength;}),gain:feature.gain,loaded:false};
                ohioTextures.push(entry);
                var image = new Image();
                image.onload = function () {
                    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
                    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
                    entry.loaded=true;
                    if(canvas.dataset.ohio!=='error')canvas.dataset.ohio=ohioTextures.every(function(item){return item.loaded;})?'ready':'loading';
                };
                image.onerror=function () {canvas.dataset.ohio='error';};
                image.src=assetUrl('../assets/backgrounds/'+feature.asset);
            });
        }
        var lightingEnabled=true;
        /** @type {Record<string,import('../src/types').SkyEnvironmentLighting>} */ var skyLighting={};
        function getLighting(){return lightingEnabled && style>=7 ? skyLighting[['galaxy','nebula','sun','river'][style-7]] || null : null;}
        function loadHeroFeatures() {
            if(heroLoading || typeof window.fetch !== 'function') return;
            heroLoading=true;
            loadSkyLighting().then(function(data){skyLighting=data;canvas.dataset.lighting='ready';}).catch(/** @param {unknown} error */ function(error){canvas.dataset.lighting=String(error);});
            var status=document.getElementById('skybox-status');
            if(status) status.textContent='Loading detailed sky features...';
            var manifestUrl=new URL(assetUrl('../assets/backgrounds/hero-layout-v1.json'),window.location.href);
            window.fetch(manifestUrl).then(function (response) {
                if(!response.ok) throw new Error('Sky layout: '+response.status);
                return response.json();
            }).then(/** @param {{version:number,library:Record<string,{file:string,aspect:number,family:string}>,features:HeroFeature[]}} layout */ function (layout) {
                if(layout.version!==1) throw new Error('Unsupported sky layout');
                return Promise.all(Object.keys(layout.library).map(function (key) {
                    return new Promise(/** @param {(entry:{key:string,texture:WebGLTexture|null})=>void} resolve */ function (resolve,reject) {
                        var image=new Image();
                        image.onload=function () {
                            var texture=gl.createTexture();
                            gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
                            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
                            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
                            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
                            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
                            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
                            resolve({key:key,texture:texture});
                        };
                        image.onerror=function () {reject(new Error('Could not load sky feature '+key));};
                        image.src=assetUrl(layout.library[key].file,manifestUrl.href);
                    });
                })).then(function (textures) {
                    heroFeatures=layout.features.map(function (feature) {
                        var buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
                        gl.bufferData(gl.ARRAY_BUFFER,featureFrame(feature,layout.library[feature.asset].aspect),gl.STATIC_DRAW);
                        var source=textures.find(function (entry) {return entry.key===feature.asset;});
                        return {buffer:buffer,texture:source ? source.texture : null,gain:feature.gain,family:layout.library[feature.asset].family};
                    });
                    canvas.dataset.hero='ready';
                    if(status) status.textContent='Hero sky: unique landmarks, one visual family, full-detail source textures.';
                });
            }).catch(/** @param {unknown} error */ function (error) {
                canvas.dataset.hero='error';
                if(status) status.textContent=String(error);
            });
        }
        var style = config && typeof config.style==='number' ? config.style : 7;
        var exposure = 1;
        var quality = 1.5;
        var brightnessControl = /** @type {HTMLInputElement|null} */ (document.getElementById('skybox-brightness'));
        var qualityControl = /** @type {HTMLSelectElement|null} */ (document.getElementById('skybox-quality'));
        if (brightnessControl) {
            const control = brightnessControl;
            control.addEventListener('input', function () { exposure = Math.max(.25, Math.min(3, Number(control.value) || 1)); });
        }
        if (qualityControl) {
            const control = qualityControl;
            control.addEventListener('change', function () { quality = [1,1.5,2].includes(Number(control.value)) ? Number(control.value) : 1.5; });
        }
        var selector = /** @type {HTMLSelectElement|null} */ (config ? null : document.getElementById('skybox-style'));
        if (selector) {
            const control = selector;
            options.forEach(function (label, index) {
                var option = document.createElement('option');
                option.value = String(index); option.textContent = label; control.appendChild(option);
            });
            try { var savedText=window.localStorage.getItem('driftworks-flight-skybox-v1'); var saved = Number(savedText); if (savedText!==null && Number.isInteger(saved) && saved >= 0 && saved < options.length) style = saved; } catch (error) { /* Storage is optional. */ }
            selector.value = String(style);
            selector.addEventListener('change', function () {
                var value = Number(control.value);
                style = Number.isInteger(value) && value >= 0 && value < options.length ? value : 0;
                var status=document.getElementById('skybox-status');if(status)status.textContent=style===10?'River of stars / dense stellar streams and dark lanes.':style>=7?'Hero sky / unique landmarks and one visual family.':'';
                try { window.localStorage.setItem('driftworks-flight-skybox-v1', String(style)); } catch (error) { /* Storage is optional. */ }
            });
        }
        var points = program('attribute vec4 star;uniform vec3 right,up,back; uniform float aspect,focal,pixelRatio;varying float brightness;void main(){float depth=-dot(star.xyz,back);brightness=star.w;gl_Position=depth>0.?vec4(dot(star.xyz,right)*focal/aspect,dot(star.xyz,up)*focal,0.,depth):vec4(2.,2.,2.,1.);gl_PointSize=(0.75+star.w*1.05)*pixelRatio;}', 'precision mediump float;varying float brightness;void main(){float r=length(gl_PointCoord-.5)*2.;float alpha=(1.-smoothstep(.15,1.,r))*brightness;gl_FragColor=vec4(.82,.9,1.,alpha);}');
        var quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        var starData = stars(), starBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW);
        // Shared 256-square lattice; linear sampling makes the six noise octaves smooth.
        var noiseTexture = gl.createTexture(), noisePixels = new Uint8Array(256*256*4), noiseSeed = 98173;
        for (var n=0;n<noisePixels.length;n+=4) {
            noiseSeed=(Math.imul(noiseSeed,1664525)+1013904223)>>>0;
            noisePixels[n]=noisePixels[n+1]=noisePixels[n+2]=noiseSeed>>>24; noisePixels[n+3]=255;
        }
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D,noiseTexture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,256,0,gl.RGBA,gl.UNSIGNED_BYTE,noisePixels);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.REPEAT);
        gl.activeTexture(gl.TEXTURE0);
        var texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([2, 4, 8]));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        /** @type {WebGLTexture|null} */ var riverTexture=null;
        var riverLoading=false;
        function loadRiver(){
            if(riverLoading)return;riverLoading=true;
            var status=document.getElementById('skybox-status');if(status)status.textContent='Loading 8K stellar streams...';
            riverTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,riverTexture);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
            if(typeof window.fetch==='function')loadSkyLighting().then(function(data){skyLighting=data;canvas.dataset.lighting='ready';}).catch(/** @param {unknown} error */ function(error){canvas.dataset.lighting=String(error);});
            var image=new Image();
            image.onload=function(){
                var limit=Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 4096;
                /** @type {HTMLImageElement|HTMLCanvasElement} */ var source=image;
                if(image.width>limit){
                    var resized=document.createElement('canvas');resized.width=limit;resized.height=limit/2;
                    var context=resized.getContext('2d');if(!context)throw new Error('Sky texture resize unavailable');
                    context.drawImage(image,0,0,resized.width,resized.height);source=resized;
                }
                gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,riverTexture);
                gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,source);
                gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
                canvas.dataset.river='ready';canvas.dataset.riverWidth=String(source.width);
                if(status)status.textContent='River of stars / fixed stellar streams, dark lanes and a separate point-star foreground.';
            };
            image.onerror=function(){canvas.dataset.river='error';if(status)status.textContent='Could not load the stellar streams texture.';};
            image.src=assetUrl('../assets/backgrounds/star-river-v1-8k.jpg');
        }
        var image = new Image();
        image.onload = function () {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
            canvas.dataset.panorama = 'ready';
        };
        if(!ohioMission) image.src = assetUrl('../assets/backgrounds/all-sky-milky-way.jpg');
        /** @param {WebGLProgram} p @param {Pose} pose @param {number} aspect @param {number} dpr */
        function uniforms(p, pose, aspect, dpr) {
            gl.useProgram(p); /** @type {('right' | 'up' | 'back')[]} */ /** @type {('right' | 'up' | 'back')[]} */
            (['right', 'up', 'back']).forEach(function (key) {
                gl.uniform3fv(gl.getUniformLocation(p, key), pose[key]);
            });
            gl.uniform1f(gl.getUniformLocation(p, 'aspect'), aspect);
            gl.uniform1f(gl.getUniformLocation(p, 'focal'), focal);
            gl.uniform1f(gl.getUniformLocation(p, 'pixelRatio'), dpr);
        }
        var stats = { drawCalls: 0, triangles: 0, points: 0, meshes: 0, materials: 0 };
        return {getLighting:getLighting,setLightingEnabled:/** @param {boolean} enabled */ function(enabled){lightingEnabled=enabled;}, setExposure: /** @param {number} value */ function (value) {exposure=Number.isFinite(value)?Math.max(.25,Math.min(3,value)):1;}, setStyle: /** @param {number} value */ function (value) {style=Number.isInteger(value) && value>=0 && value<options.length ? value : 7;}, getRenderStats: function () {
                return stats;
            }, render: /** @param {Pose} pose @param {number} renderScale @param {boolean} empty */ function (pose, renderScale, empty) {
                // Shared renderer integration: the host delivers the probe and sky basis.
                // No mission or material code needs to choose lights.
                if(typeof host.dispatchEvent==='function' && typeof CustomEvent==='function') {
                    host.dispatchEvent(new CustomEvent('sky-environment',{detail:{lighting:getLighting(),pose:pose}}));
                }
                // Keep sky sampling and point footprints independent of scene resolution.
                var dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1) * quality), width = Math.round(host.clientWidth * dpr), height = Math.round(host.clientHeight * dpr);
                if (!width || !height)
                    return;
                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width;
                    canvas.height = height;
                }
                gl.viewport(0, 0, width, height);
                if (empty) {
                    gl.clearColor(0, 0, 0, 1);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    stats = { drawCalls: 0, triangles: 0, points: 0, meshes: 0, materials: 0 };
                    return;
                }
                if(!ohioMission && style>=7 && style<=9) loadHeroFeatures();
                if(!ohioMission && style===10) loadRiver();
                stats = { drawCalls: 2, triangles: 2, points: starData.length / 4, meshes: 2, materials: 2 };
                gl.disable(gl.BLEND);
                uniforms(sky, pose, width / height, dpr);
                gl.uniform1f(gl.getUniformLocation(sky, 'style'), ohioMission ? 11 : style);
                gl.uniform1f(gl.getUniformLocation(sky, 'exposure'), exposure);
                gl.uniform1i(gl.getUniformLocation(sky, 'noiseMap'), 1);
                if(ohioMission) ohioTextures.forEach(function(entry,index){
                    var prefix=index===0?'ohioPlanet':'ohioSun';
                    gl.activeTexture(gl.TEXTURE0+2+index);gl.bindTexture(gl.TEXTURE_2D,entry.texture);
                    gl.uniform1i(gl.getUniformLocation(sky,prefix),2+index);
                    gl.uniform3fv(gl.getUniformLocation(sky,prefix+'Center'),entry.center);
                    gl.uniform3fv(gl.getUniformLocation(sky,prefix+'Right'),entry.right);
                    gl.uniform3fv(gl.getUniformLocation(sky,prefix+'Up'),entry.up);
                    gl.uniform1f(gl.getUniformLocation(sky,prefix+'Gain'),entry.gain);
                });
                gl.activeTexture(gl.TEXTURE0);
                gl.bindBuffer(gl.ARRAY_BUFFER, quad);
                var a = gl.getAttribLocation(sky, 'position');
                gl.enableVertexAttribArray(a);
                gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
                gl.bindTexture(gl.TEXTURE_2D,!ohioMission && style===10 ? riverTexture : texture);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
                gl.disableVertexAttribArray(a);
                if(!ohioMission && style>=7 && style<=9 && heroFeatures.length) {
                    uniforms(heroProgram,pose,width/height,dpr);
                    gl.uniform1f(gl.getUniformLocation(heroProgram,'exposure'),exposure);
                    gl.uniform1i(gl.getUniformLocation(heroProgram,'feature'),0);
                    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_COLOR);
                    var direction=gl.getAttribLocation(heroProgram,'direction'), texcoord=gl.getAttribLocation(heroProgram,'texcoord');
                    gl.enableVertexAttribArray(direction);gl.enableVertexAttribArray(texcoord);
                    var family=ohioMission ? 'ohio' : ['galaxy','nebula','sun','river'][style-7];
                    var visibleFeatures=heroFeatures.filter(function (feature) {return feature.family===family;});
                    visibleFeatures.forEach(function (feature) {
                        gl.bindBuffer(gl.ARRAY_BUFFER,feature.buffer);
                        gl.vertexAttribPointer(direction,3,gl.FLOAT,false,20,0);gl.vertexAttribPointer(texcoord,2,gl.FLOAT,false,20,12);
                        gl.bindTexture(gl.TEXTURE_2D,feature.texture);gl.uniform1f(gl.getUniformLocation(heroProgram,'gain'),feature.gain);
                        gl.drawArrays(gl.TRIANGLES,0,6);
                    });
                    gl.disableVertexAttribArray(direction);gl.disableVertexAttribArray(texcoord);
                    stats.drawCalls+=visibleFeatures.length;stats.triangles+=visibleFeatures.length*2;stats.meshes+=visibleFeatures.length;stats.materials+=visibleFeatures.length;
                }
                uniforms(points, pose, width / height, dpr);
                gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
                a = gl.getAttribLocation(points, 'star');
                gl.enableVertexAttribArray(a);
                gl.vertexAttribPointer(a, 4, gl.FLOAT, false, 0, 0);
                gl.enable(gl.BLEND);
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
                gl.drawArrays(gl.POINTS, 0, starData.length / 4);
                gl.disableVertexAttribArray(a);
            } };
    }
    /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).flightSkybox = { create: create, stars: stars, project: project, options: options, featureFrame: featureFrame };
}());
