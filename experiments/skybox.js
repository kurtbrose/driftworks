(function () {
    'use strict';
    var assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').Pose} Pose */
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    var options = ['Milky Way  / original', 'A  / Open void', 'B  / Galactic horizon', 'C  / Dark dust', 'D  / Distant sun', 'E  / Cold veil', 'F  / Island universes', 'G / Hero galaxy', 'H / Hero nebula', 'I / Hero sun', 'J / River of stars', 'K / Woven starlight', 'L / Orbital impact experiment'];
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
    var missionSky=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks).flightMissions.current().sky, landmarkSky=missionSky.kind==='landmarks';
    var focal = 1 / Math.tan(Math.PI / 8);
    var impactStages=[{id:'before',label:'Before impact'},{id:'contact',label:'Contact / flash'},{id:'ejecta',label:'Young ejecta'},{id:'plume',label:'Growing plume'},{id:'cooling',label:'Cooling cap'},{id:'fallout',label:'Returning debris'},{id:'aftermath',label:'Regional aftermath'},{id:'fires',label:'Land fires'},{id:'smoke',label:'Smoke veil'}];
    function createImpactCues(){
        var held=0,from=0,to=0,age=0,duration=0,active=false,started=false,flashAge=Infinity;
        /** @type {{stage:number,duration:number}[]} */var queue=[];
        function snapshot(){var a=active?(duration?Math.min(1,age/duration):1):0;return {from:active?from:held,to:active?to:held,blend:a*a*(3-2*a),stage:impactStages[held].id,transitioning:active,queued:queue.length,flashAge:flashAge};}
        return {snapshot:snapshot,
            /** @param {string|number} stage @param {number} [seconds] */
            trigger:function(stage,seconds){var index=typeof stage==='number'?stage:impactStages.findIndex(function(s){return s.id===stage;}),d=seconds===undefined?8:seconds;
                if(!Number.isInteger(index)||index<0||index>=impactStages.length)throw new RangeError('Unknown impact cue');
                if(!Number.isFinite(d)||d<0||d>120)throw new RangeError('Impact transition must be 0–120 seconds');
                if((active&&index===to)||(queue.length&&queue[queue.length-1].stage===index))return true;
                if(queue.length>=16)return false;
                if(!active&&index===held&&!queue.length)return true;
                queue.push({stage:index,duration:d});return true;},
            reset:function(){held=from=to=0;age=duration=0;active=started=false;flashAge=Infinity;queue=[];},
            /** @param {number} elapsed @param {boolean} ready */
            update:function(elapsed,ready){
                if(!Number.isFinite(elapsed)||elapsed<0)throw new RangeError('Invalid cue elapsed time');
                if(!active&&queue.length){var command=queue.shift();if(command){from=held;to=command.stage;duration=command.duration;age=0;active=true;started=false;}}
                if(ready){
                    if(active&&!started){started=true;if(to===1)flashAge=0;}
                    if(Number.isFinite(flashAge))flashAge+=elapsed;
                    if(active){age=Math.min(duration,age+elapsed);if(age>=duration){held=to;active=false;}}
                }
                return snapshot();
            }
        };
    }
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
    /** @param {HTMLElement} host @param {{style?:number,fov?:number,cueControls?:boolean,sources?:import('../src/types').SkyCameraSource[],optics?:boolean}=} config */
    function create(host, config) {
        var effects=window.Driftworks.skyEffects?window.Driftworks.skyEffects.create(host):null;
        var opticsControl=/** @type {HTMLInputElement|null} */(document.getElementById('skybox-optics'));
        if(effects){effects.setEnabled(config&&config.optics!==undefined?config.optics:!opticsControl||opticsControl.checked);if(opticsControl)opticsControl.addEventListener('change',function(){if(effects&&opticsControl)effects.setEnabled(opticsControl.checked);});}
        /** @type {import('../src/types').SkyCameraSource[]|null} */var cameraSources=config&&config.sources?config.sources:null;
        var sourceStyle=-1;
        /** @type {Record<string,import('../src/types').SkyCameraSource[]>} */var authoredSources={};
        /** @type {Record<string,{diskFraction:number,strength:number,color:number[]}>} */var authoredAssetSources={};
        if(effects&&typeof window.fetch==='function'){
            window.fetch(assetUrl('../assets/backgrounds/sky-camera-sources-v1.json')).then(function(response){if(!response.ok)throw new Error('Sky camera sources unavailable');return response.json();}).then(/** @param {{version:number,styles:Record<string,import('../src/types').SkyCameraSource[]>,assets?:Record<string,{diskFraction:number,strength:number,color:number[]}>}} data */function(data){if(data.version!==1||!data.styles||typeof data.styles!=='object')throw new Error('Invalid sky camera source version');authoredSources=data.styles;authoredAssetSources=data.assets||{};sourceStyle=-1;}).catch(function(){authoredSources={};sourceStyle=-1;});
        }
        /** @type {import('../src/types').SkyEnvironmentLighting|null} */var environmentOverride=null;
        /** @type {WebGLTexture|null} */var hdrTexture=null;
        var viewFocal=config&&config.fov?1/Math.tan(Math.max(25,Math.min(150,config.fov))*Math.PI/360):focal;
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
uniform float exposure;uniform float hdrEnabled;uniform sampler2D hdrEnvironment;
uniform sampler2D ohioPlanet,ohioSun;
uniform vec3 ohioPlanetCenter,ohioPlanetRight,ohioPlanetUp;
uniform vec3 ohioSunCenter,ohioSunRight,ohioSunUp;
uniform float ohioPlanetGain,ohioSunGain;
uniform float bakedBlend;
uniform float impactFlash,impactDebris,impactMotion; uniform vec3 impactDirection;
vec3 impactOptics(vec3 color, vec3 ray){
    float distance=1.-dot(ray,normalize(impactDirection));
    vec3 radiance=impactFlash*vec3(1.,.92,.76)*(12.*exp(-distance/.000004)+.45*exp(-distance/.00007));
    float depth=dot(ray,ohioPlanetCenter);
    if(impactDebris>0. && depth>0.){
        vec2 uv=(1.-vec2(dot(ray,ohioPlanetRight),dot(ray,ohioPlanetUp))/depth)*.5;
        // Short, sparse luminous re-entries in fixed planet direction space.
        for(int i=0;i<8;i++){
            float f=float(i),phase=fract(impactMotion/(9.+f*1.7)+f*.173);
            if(phase<.12){
                vec2 start=vec2(.30+fract(sin(f*12.31+2.)*437.1)*.38,.27+fract(sin(f*23.71+7.)*321.9)*.38);
                vec2 head=start+vec2(.012,-.018)*(phase/.12),tail=head-vec2(.004,-.006);
                vec2 segment=head-tail;float along=clamp(dot(uv-tail,segment)/dot(segment,segment),0.,1.);
                float distance=length(uv-(tail+along*segment));
                radiance+=impactDebris*vec3(.7,.66,.55)*exp(-distance*distance/.00000005)*sin(phase/.12*3.14159265)*(.25+.75*along);
            }
        }
    }
    return 1.-(1.-color)*exp(-radiance);
}
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
    if(hdrEnabled>.5){vec3 hdrRay=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);vec2 uv=vec2(atan(hdrRay.y,hdrRay.x)/6.28318530718+.5,acos(clamp(hdrRay.z,-1.,1.))/3.14159265359);vec3 radiance=max(vec3(0.),texture2D(hdrEnvironment,uv).rgb);gl_FragColor=vec4(pow(vec3(1.)-exp(-radiance*exposure),vec3(1./2.2)),1.);return;}
    if(style>9.5 && style<11.5){
        vec3 riverRay=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
        vec2 riverUV=vec2(atan(riverRay.y,riverRay.x)/6.28318530718+.5,acos(clamp(riverRay.z,-1.,1.))/3.14159265359);
        gl_FragColor=vec4(texture2D(panorama,riverUV).rgb*exposure,1.);return;
    }
    if(style>20.5){
        vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);

        vec2 uv=vec2(atan(ray.y,ray.x)/6.28318530718+.5,acos(clamp(ray.z,-1.,1.))/3.14159265359);
        gl_FragColor=vec4(impactOptics(mix(texture2D(ohioPlanet,uv).rgb,texture2D(ohioSun,uv).rgb,bakedBlend)*exposure,ray),1.);return;
    }
    if(style>19.5){
        vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
        vec3 planet=ohioLandmark(ohioPlanet,ray,ohioPlanetCenter,ohioPlanetRight,ohioPlanetUp,ohioPlanetGain);
        vec3 sun=ohioLandmark(ohioSun,ray,ohioSunCenter,ohioSunRight,ohioSunUp,ohioSunGain);
        gl_FragColor=vec4(impactOptics(planet+sun-planet*sun,ray),1.);return;
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
        var landmarkTextures=[];
        /** @type {HTMLCanvasElement|HTMLImageElement|null} */var planetOverride=null;
        /** @param {HTMLCanvasElement|HTMLImageElement} source */function setPlanetImage(source){
            if(!landmarkSky||missionSky.features[0].asset!=='planet-hero-v1/master.png')return;
            planetOverride=source;var entry=landmarkTextures[0];if(!entry||!entry.loaded)return;
            gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,entry.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
        }
        if (landmarkSky) {
            // The planet is lit from its upper left, toward the viewer.
            // +Y faces the planet; the sun is behind the left shoulder (-X,-Y,+Z).
            var landmarkFeatures = missionSky.features;
            landmarkFeatures.forEach(function (feature) {
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
                landmarkTextures.push(entry);
                var image = new Image();
                image.onload = function () {
                    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
                    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,feature.asset==='planet-hero-v1/master.png'&&planetOverride?planetOverride:image);
                    entry.loaded=true;
                    if(canvas.dataset.ohio!=='error')canvas.dataset.ohio=landmarkTextures.every(function(item){return item.loaded;})?'ready':'loading';
                };
                image.onerror=function () {canvas.dataset.ohio='error';};
                image.src=assetUrl('../assets/backgrounds/'+feature.asset);
            });
        }
        var lightingEnabled=true;
        /** @type {Record<string,import('../src/types').SkyEnvironmentLighting>} */ var skyLighting={};
        function getLighting(){if(lightingEnabled&&environmentOverride)return environmentOverride;return lightingEnabled && style>=7 ? skyLighting[['galaxy','nebula','sun','river','woven'][style-7]] || null : null;}
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
        var quality = 1;
        var brightnessControl = /** @type {HTMLInputElement|null} */ (document.getElementById('skybox-brightness'));
        var qualityControl = /** @type {HTMLSelectElement|null} */ (document.getElementById('skybox-quality'));
        if (brightnessControl) {
            const control = brightnessControl;
            control.addEventListener('input', function () { exposure = Math.max(.25, Math.min(3, Number(control.value) || 1)); });
        }
        if (qualityControl) {
            const control = qualityControl;
            control.addEventListener('change', function () { quality = [1,1.5,2].includes(Number(control.value)) ? Number(control.value) : 1; });
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
                var status=document.getElementById('skybox-status');if(status)status.textContent=style===11?'Woven starlight / unique regions with feathered joins.':style===10?'River of stars / earlier repeated-panel comparison.':style>=7?'Hero sky / unique landmarks and one visual family.':'';
                try { window.localStorage.setItem('driftworks-flight-skybox-v1', String(style)); } catch (error) { /* Storage is optional. */ }
            });
        }
        var points = program('attribute vec4 star;uniform vec3 right,up,back; uniform float aspect,focal,pixelRatio;varying float brightness;void main(){float depth=-dot(star.xyz,back);brightness=star.w;gl_Position=depth>0.?vec4(dot(star.xyz,right)*focal/aspect,dot(star.xyz,up)*focal,0.,depth):vec4(2.,2.,2.,1.);gl_PointSize=(0.75+star.w*1.05)*pixelRatio;}', 'precision mediump float;varying float brightness;void main(){float r=length(gl_PointCoord-.5)*2.;float alpha=(1.-smoothstep(.15,1.,r))*brightness;gl_FragColor=vec4(.82,.9,1.,alpha);}');
        // Image-only environment: the existing sky pass projects an outpainted
        // sphere and the untouched native-detail hero plate in the same direction space.
        var impactProgram=program('attribute vec2 position;varying vec2 screen;void main(){screen=position;gl_Position=vec4(position,0.,1.);}',`
precision highp float;
varying vec2 screen;uniform vec3 right,up,back;uniform float aspect,focal,exposure,impactBlend;
uniform sampler2D impactSurround,impactMaster,impactFrom,impactTo;
vec3 surround(vec2 uv){
    vec3 a=texture2D(impactSurround,uv).rgb,b=texture2D(impactSurround,vec2(1.-uv.x,uv.y)).rgb;
    a=mix(a,b,.5*(1.-smoothstep(0.,.035,min(uv.x,1.-uv.x))));
    // Every longitude converges to the same color at each pole.
    a=mix(texture2D(impactSurround,vec2(.5,.001)).rgb,a,smoothstep(0.,.035,uv.y));
    return mix(a,texture2D(impactSurround,vec2(.5,.999)).rgb,smoothstep(.965,1.,uv.y));
}
void main(){
    vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
    vec2 sphereUV=vec2(fract(atan(ray.y,ray.x)/6.28318530718+.5),acos(clamp(ray.z,-1.,1.))/3.14159265359);
    vec3 color=surround(sphereUV);
    // Forward plate: yaw +Y, pitch -5 degrees, 85-degree horizontal extent.
    vec3 center=vec3(0.,.996194698,-.087155743),north=vec3(0.,.087155743,.996194698);
    float depth=dot(ray,center);
    vec2 uv=vec2(.5+ray.x/max(depth,.00001)/1.832662348,.5-dot(ray,north)/max(depth,.00001)/1.031779704);
    if(depth>0. && uv.x>0. && uv.x<1. && uv.y>0. && uv.y<1.){
        vec3 master=texture2D(impactMaster,uv).rgb;
        vec3 event=mix(texture2D(impactFrom,uv).rgb,texture2D(impactTo,uv).rgb,impactBlend);
        float permission=1.-smoothstep(.72,1.,length((uv-vec2(.625,.525))/vec2(.255,.285)));
        vec3 plate=mix(master,event,permission);
        float edge=smoothstep(0.,.13,min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y)));
        color=mix(color,plate,edge);
    }
    gl_FragColor=vec4(color*exposure,1.);
}`);
        var impactTimes=missionSky.bakedImpact?[0,2,30,60,120,300,600]:[0,.25,12,32,60,90,120],impactTime=-5,impactSpeed=1,impactStarted=false,impactLoaded=0;
        /** @type {(WebGLTexture|null)[]} */var impactTextures=[];
        /** @type {HTMLDivElement|null} */var impactControls=null;
        /** @type {HTMLInputElement|null} */var impactSlider=null;
        var impactCues=createImpactCues(),cueMode=!!missionSky.bakedImpact,impactMotion=0;
        /** @type {HTMLDivElement|null} */var cueControls=null;
        /** @param {number} value */function setImpactTime(value){if(Number.isFinite(value)){cueMode=false;impactTime=Math.max(-5,Math.min(missionSky.bakedImpact?600:180,value));}}
        /** @param {string|number} stage @param {number} [seconds] */function cueImpact(stage,seconds){cueMode=true;return impactCues.trigger(stage,seconds);}
        function resetImpact(){cueMode=true;impactCues.reset();impactMotion=0;impactTime=-5;}
        if(missionSky.bakedImpact&&(!config||config.cueControls!==false)&&typeof host.addEventListener==='function'){
            host.addEventListener('impact-cue',function(event){var detail=/** @type {CustomEvent<{stage:string;seconds?:number}>} */(event).detail;if(detail)cueImpact(detail.stage,detail.seconds);});
            host.addEventListener('impact-reset',resetImpact);
        }
        // At most three 4K maps resident (~96 MiB RGBA); no per-frame canvas uploads.
        /** @type {Map<number,{texture:WebGLTexture|null,ready:boolean}>} */var bakedMaps=new Map();
        var bakedControls=false;
        /** @param {number} index */function bakedMap(index){
            var existing=bakedMaps.get(index);if(existing)return existing;
            var entry={texture:gl.createTexture(),ready:false};bakedMaps.set(index,entry);
            gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,entry.texture);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,1,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0]));
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
            var image=new Image();image.onload=function(){
                if(bakedMaps.get(index)!==entry)return;
                if(image.width!==4096||image.height!==2048||Number(gl.getParameter(gl.MAX_TEXTURE_SIZE))<4096){canvas.dataset.bakedImpact='error';return;}
                gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,entry.texture);
                gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);entry.ready=true;
            };image.onerror=function(){canvas.dataset.bakedImpact='error';};
            image.src=assetUrl('../assets/backgrounds/planet-hero-v1/baked-cues-v1/'+index+'.png');return entry;
        }
        /** @param {number} elapsed */function prepareBaked(elapsed){
            if(!bakedControls){
                bakedControls=true;canvas.dataset.bakedImpact='loading';
                var status=document.getElementById('skybox-status');
                if(status&&status.parentElement){
                    impactControls=document.createElement('div');
                    impactControls.innerHTML='<details><summary>Timed artwork diagnostic</summary><label>Artwork reference time <input aria-label="Impact time" type="range" min="-5" max="600" step=".1" value="-5" style="width:100%"></label><label>Diagnostic speed <select aria-label="Impact playback"><option value="1">1×</option><option value="5">5×</option><option value="20">20×</option></select></label></details><button type="button">Restart impact</button><small>Mission cues control playback by default. Restart returns to cue mode.</small>';
                    status.parentElement.appendChild(impactControls);impactSlider=impactControls.querySelector('input');
                    if(impactSlider){const slider=impactSlider;slider.oninput=function(){setImpactTime(Number(slider.value));};}
                    var restart=impactControls.querySelector('button');if(restart)restart.onclick=resetImpact;
                    var speed=impactControls.querySelector('select');if(speed){const select=speed;select.onchange=function(){impactSpeed=Number(select.value)||1;};}
                }
                if((!config||config.cueControls!==false)&&typeof document.body!=='undefined'){
                    cueControls=document.createElement('div');cueControls.className='impact-cues';
                    cueControls.style.cssText='position:fixed;right:14px;top:14px;z-index:12;background:#08151ee8;color:#dcebf0;padding:12px;border:1px solid #46606c;border-radius:7px;font:13px system-ui;max-width:265px';
                    cueControls.innerHTML='<style>.impact-cues button,.impact-cues select{font:13px system-ui;padding:6px;margin:4px 0;color:#dcebf0;background:#172d39;border:1px solid #46606c;border-radius:4px;width:auto}.impact-cues label{display:block}</style><strong>Mission sky cues</strong><p data-cue-status>Holding: Before impact</p><label>Target stage <select aria-label="Impact cue stage">'+impactStages.map(function(s){return '<option value="'+s.id+'">'+s.label+'</option>';}).join('')+'</select></label><label>Blend duration <select aria-label="Impact cue duration"><option value="2">2 seconds</option><option value="8" selected>8 seconds</option><option value="15">15 seconds</option></select></label><button type="button" data-next>Next cue</button> <button type="button" data-trigger>Trigger target</button> <button type="button" data-reset>Reset cues</button><small style="display:block">Each stage holds until triggered. Esc pauses flight and transitions.</small>';
                    (missionSky.bakedImpact&&missionSky.features[0].asset==='planet-hero-v1/master.png'?document.body:host).appendChild(cueControls);
                    var target=/** @type {HTMLSelectElement} */(cueControls.querySelector('[aria-label="Impact cue stage"]')),duration=/** @type {HTMLSelectElement} */(cueControls.querySelector('[aria-label="Impact cue duration"]'));
                    var nextButton=/** @type {HTMLButtonElement} */(cueControls.querySelector('[data-next]')),trigger=/** @type {HTMLButtonElement} */(cueControls.querySelector('[data-trigger]')),reset=/** @type {HTMLButtonElement} */(cueControls.querySelector('[data-reset]'));
                    nextButton.onclick=function(){var s=impactCues.snapshot(),index=Math.min(impactStages.length-1,s.transitioning?s.to+1:s.from+1);target.value=impactStages[index].id;cueImpact(index,Number(duration.value));};
                    trigger.onclick=function(){cueImpact(target.value,Number(duration.value));};reset.onclick=resetImpact;
                }
            }
            impactCues.update(0,false);var cue=impactCues.snapshot();
            var from=0;for(var i=1;i<impactTimes.length;i++)if(impactTime>=impactTimes[i])from=i;
            var to=Math.min(from+1,impactTimes.length-1);
            if(cueMode){from=cue.from;to=cue.to;}
            var next=Math.min(to+1,impactStages.length-1),keep=from===to?[from,next,Math.min(next+1,impactStages.length-1)]:[from,to,next];
            bakedMaps.forEach(function(entry,index){if(keep.indexOf(index)<0){gl.deleteTexture(entry.texture);bakedMaps.delete(index);}});
            var a=bakedMap(from),b=bakedMap(to);keep.forEach(bakedMap);
            var ready=a.ready&&b.ready,blend=from===to?0:Math.max(0,Math.min(1,(impactTime-impactTimes[from])/(impactTimes[to]-impactTimes[from])));
            if(cueMode){cue=impactCues.update(elapsed,ready);a=bakedMap(cue.from);b=bakedMap(cue.to);blend=cue.blend;}
            if(ready)impactMotion+=Math.max(0,elapsed);
            if(ready&&canvas.dataset.bakedImpact!=='error')canvas.dataset.bakedImpact='ready';
            if(impactSlider)impactSlider.value=String(impactTime);
            var label=cueMode?(cue.transitioning?'Blending to '+impactStages[cue.to].label:'Holding: '+impactStages[cue.from].label)+(cue.queued?' / '+cue.queued+' queued':''):'Timed artwork preview / '+impactTime.toFixed(1)+' s';
            if(cueControls){var readout=cueControls.querySelector('[data-cue-status]');if(readout)readout.textContent=ready?label:'Loading cue artwork...';}
            var status=document.getElementById('skybox-status');if(status)status.textContent=canvas.dataset.bakedImpact==='error'?'Baked sky unavailable (requires 4096px textures).':ready?label:'Loading baked sky maps...';
            // A missing frame freezes the event clock; loading cannot skip the flash.
            if(ready&&!cueMode)impactTime=Math.min(600,impactTime+Math.max(0,elapsed)*impactSpeed);
            var pulse=cueMode?cue.flashAge:impactTime;
            var flash=pulse>=0&&pulse<.8?Math.exp(-pulse/.12)*(1-Math.exp(-pulse/.008)):0;
            var debris=cueMode?((cue.from>=5?1:0)*(1-cue.blend)+(cue.to>=5?1:0)*cue.blend):impactTime>=300?1:0;
            return {a:a.texture,b:b.texture,blend:cueMode?blend:blend*blend*(3-2*blend),flash:flash,debris:debris};
        }
        function loadImpact(){
            if(impactStarted)return;impactStarted=true;canvas.dataset.impact='loading';
            ['surround-v1','master','flash','between-12','between-32','between-60','between-90','plume'].forEach(function(name,index){
                var texture=gl.createTexture();impactTextures[index]=texture;
                gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
                gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([2,4,8,255]));
                gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
                var image=new Image();image.onload=function(){
                    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);
                    impactLoaded++;if(impactLoaded===8)canvas.dataset.impact='ready';
                };image.onerror=function(){canvas.dataset.impact='error';};image.src=assetUrl('../assets/backgrounds/impact-v1/'+name+'.png');
            });
            var status=document.getElementById('skybox-status');
            if(status&&status.parentElement){
                impactControls=document.createElement('div');impactControls.innerHTML='<label>Impact time <input aria-label="Impact time" type="range" min="-5" max="180" step="0.1" value="-5" style="width:100%"></label><label>Impact playback <select aria-label="Impact playback"><option value="1">1×</option><option value="5">5×</option><option value="20">20×</option></select></label><button type="button">Restart impact</button>';
                status.parentElement.appendChild(impactControls);
                impactSlider=impactControls.querySelector('input');var speed=impactControls.querySelector('select'),restart=impactControls.querySelector('button');
                if(impactSlider){const slider=impactSlider;slider.oninput=function(){setImpactTime(Number(slider.value));};}
                if(speed){const select=speed;select.onchange=function(){impactSpeed=Number(select.value)||1;};}
                if(restart)restart.onclick=function(){setImpactTime(-5);};
            }
        }
        var quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        var starData = stars(), starBuffer = gl.createBuffer();
        if(landmarkSky&&['planet-hero-v1/master.png','planet-hero-orbital-v2/master.png'].indexOf(missionSky.features[0].asset)>=0){
            var planet=landmarkTextures[0],visible=/** @type {number[]} */([]);
            for(var star=0;star<starData.length;star+=4){
                var depth=0,px=0,py=0;for(var axis=0;axis<3;axis++){depth+=starData[star+axis]*planet.center[axis];px+=starData[star+axis]*planet.right[axis];py+=starData[star+axis]*planet.up[axis];}
                if(depth>0&&(px*px+py*py)/(depth*depth)<.91*.91)continue;
                visible.push(starData[star],starData[star+1],starData[star+2],starData[star+3]);
            }
            starData=new Float32Array(visible);
        }
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
        /** @type {Record<number,WebGLTexture|null>} */ var panoramaTextures={};
        /** @type {Set<number>} */ var panoramaLoading=new Set();
        /** @param {number} selected */
        function loadRiver(selected){
            if(panoramaLoading.has(selected))return;panoramaLoading.add(selected);
            var key=selected===11?'woven':'river';
            var status=document.getElementById('skybox-status');if(status)status.textContent='Loading photographic stellar streams...';
            var texture=gl.createTexture();panoramaTextures[selected]=texture;gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
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
                gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
                gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,source);
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
                canvas.dataset[key]='ready';canvas.dataset[key+'Width']=String(source.width);
                if(status)status.textContent=selected===11?'Woven starlight / twelve unique regions, feathered into one fixed 8K sphere.':'River of stars / earlier repeated-panel comparison.';
            };
            image.onerror=function(){canvas.dataset[key]='error';if(status)status.textContent='Could not load the stellar streams texture.';};
            image.src=assetUrl(selected===11?'../assets/backgrounds/star-river-woven-v1-8k.jpg':'../assets/backgrounds/star-river-photo-v3-8k.jpg');
        }
        var image = new Image();
        image.onload = function () {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
            canvas.dataset.panorama = 'ready';
        };
        if(!landmarkSky) image.src = assetUrl('../assets/backgrounds/all-sky-milky-way.jpg');
        /** @param {WebGLProgram} p @param {Pose} pose @param {number} aspect @param {number} dpr */
        function uniforms(p, pose, aspect, dpr) {
            gl.useProgram(p); /** @type {('right' | 'up' | 'back')[]} */ /** @type {('right' | 'up' | 'back')[]} */
            (['right', 'up', 'back']).forEach(function (key) {
                gl.uniform3fv(gl.getUniformLocation(p, key), pose[key]);
            });
            gl.uniform1f(gl.getUniformLocation(p, 'aspect'), aspect);
            gl.uniform1f(gl.getUniformLocation(p, 'focal'), viewFocal);
            gl.uniform1f(gl.getUniformLocation(p, 'pixelRatio'), dpr);
        }
        var stats = { drawCalls: 0, triangles: 0, points: 0, meshes: 0, materials: 0 };
        if(!landmarkSky&&typeof window.location!=='undefined'&&/(?:[?&])sky=impact(?:&|$)/.test(window.location.search||'')){style=12;if(selector)selector.value='12';}
        return {setEnvironment:/** @param {import('../src/types').SkyEnvironmentLighting|null} value */function(value){
                if(value===environmentOverride)return;
                if(value&&(!value.radiance||value.radiance.length!==512*256*4||!value.radiance.every(Number.isFinite)||value.sh.length!==9||value.sh.some(function(row){return row.length!==3||!row.every(Number.isFinite);})))throw new Error('Expected cached 512x256 RGBA linear HDR radiance and nine RGB SH coefficients');
                if(value&&!gl.getExtension('OES_texture_float'))throw new Error('HDR sky requires float textures');
                if(hdrTexture)gl.deleteTexture(hdrTexture);hdrTexture=null;environmentOverride=value;sourceStyle=-1;
                if(value){var hdrFilter=gl.getExtension('OES_texture_float_linear')?gl.LINEAR:gl.NEAREST;hdrTexture=gl.createTexture();gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,hdrTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,hdrFilter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,hdrFilter);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,512,256,0,gl.RGBA,gl.FLOAT,value.radiance||null);gl.activeTexture(gl.TEXTURE0);}
            },cueImpact:cueImpact,resetImpact:resetImpact,getImpactState:impactCues.snapshot,setCameraSources:/** @param {import('../src/types').SkyCameraSource[]|null} value */function(value){cameraSources=value;sourceStyle=-1;},setOccluders:/** @param {import('../src/types').SkyOccluder[]} value */function(value){if(effects)effects.setOccluders(value);},setOpticsEnabled:/** @param {boolean} value */function(value){if(effects)effects.setEnabled(value);},setPlanetImage:setPlanetImage,setImpactTime:setImpactTime,getLighting:getLighting,setLightingEnabled:/** @param {boolean} enabled */ function(enabled){lightingEnabled=enabled;}, setExposure: /** @param {number} value */ function (value) {exposure=Number.isFinite(value)?Math.max(.25,Math.min(3,value)):1;}, setStyle: /** @param {number} value */ function (value) {style=Number.isInteger(value) && value>=0 && value<options.length ? value : 7;}, getRenderStats: function () {
                return stats;
            }, render: /** @param {Pose} pose @param {number} renderScale @param {boolean} empty @param {number} [elapsed] */ function (pose, renderScale, empty,elapsed) {
                if(effects&&sourceStyle!==style){
                    effects.setSources(cameraSources||(hdrTexture?[]:landmarkSky&&window.Driftworks.skyEffects?window.Driftworks.skyEffects.fromFeatures(missionSky.features,authoredAssetSources):authoredSources[String(style)]||[]));sourceStyle=style;
                }
                var cameraExposure=effects?effects.render(pose,viewFocal,performance.now()/1000,empty):1;
                var effectiveExposure=exposure*cameraExposure;
                // Shared renderer integration: the host delivers the probe and sky basis.
                // No mission or material code needs to choose lights.
                if(typeof host.dispatchEvent==='function' && typeof CustomEvent==='function') {
                    host.dispatchEvent(new CustomEvent('sky-environment',{detail:{lighting:getLighting(),pose:pose,exposure:cameraExposure}}));
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
                if(impactControls)impactControls.hidden=!missionSky.bakedImpact&&(style!==12||landmarkSky);
                if (empty) {
                    gl.clearColor(0, 0, 0, 1);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                    stats = { drawCalls: 0, triangles: 0, points: 0, meshes: 0, materials: 0 };
                    return;
                }
                if(!hdrTexture&&!landmarkSky&&style===12){
                    loadImpact();
                    if(impactLoaded===8)impactTime=Math.min(180,impactTime+Math.max(0,elapsed||0)*impactSpeed);
                    var from=0;for(var i=1;i<impactTimes.length;i++)if(impactTime>=impactTimes[i])from=i;
                    var to=Math.min(from+1,impactTimes.length-1),blend=from===to?0:Math.max(0,Math.min(1,(impactTime-impactTimes[from])/(impactTimes[to]-impactTimes[from])));
                    gl.disable(gl.BLEND);uniforms(impactProgram,pose,width/height,dpr);
                    gl.uniform1f(gl.getUniformLocation(impactProgram,'exposure'),effectiveExposure);gl.uniform1f(gl.getUniformLocation(impactProgram,'impactBlend'),blend*blend*(3-2*blend));
                    [0,1,from+1,to+1].forEach(function(index,unit){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,impactTextures[index]);gl.uniform1i(gl.getUniformLocation(impactProgram,['impactSurround','impactMaster','impactFrom','impactTo'][unit]),unit);});
                    gl.bindBuffer(gl.ARRAY_BUFFER,quad);var position=gl.getAttribLocation(impactProgram,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,6);gl.disableVertexAttribArray(position);
                    if(impactSlider)impactSlider.value=String(impactTime);
                    var status=document.getElementById('skybox-status');if(status)status.textContent=canvas.dataset.impact==='ready'?'Orbital impact / '+impactTime.toFixed(1)+' s / flight pause freezes event':canvas.dataset.impact==='error'?'Impact sky image failed to load.':'Loading eight local impact sky images...';
                    stats={drawCalls:1,triangles:2,points:0,meshes:1,materials:1};return;
                }
                if(!hdrTexture && !landmarkSky && style>=7 && style<=9) loadHeroFeatures();
                if(!hdrTexture && !landmarkSky && style>=10) loadRiver(style);
                stats = { drawCalls: 2, triangles: 2, points: starData.length / 4, meshes: 2, materials: 2 };
                gl.disable(gl.BLEND);
                uniforms(sky, pose, width / height, dpr);
                gl.uniform1f(gl.getUniformLocation(sky, 'style'), missionSky.bakedImpact ? 21 : landmarkSky ? 20 : style);
                gl.uniform1f(gl.getUniformLocation(sky, 'exposure'), effectiveExposure);
                gl.uniform1f(gl.getUniformLocation(sky,'hdrEnabled'),hdrTexture?1:0);gl.uniform1i(gl.getUniformLocation(sky,'hdrEnvironment'),4);
                if(hdrTexture){gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,hdrTexture);gl.activeTexture(gl.TEXTURE0);}
                gl.uniform1i(gl.getUniformLocation(sky, 'noiseMap'), 1);
                var flash=impactTime>=0&&impactTime<.8?Math.exp(-impactTime/.12)*(1-Math.exp(-impactTime/.008)):0;
                var impactPlanet=landmarkTextures[0],eventDirection=[0,1,0];
                if(impactPlanet&&missionSky.features[0].asset==='planet-hero-v1/master.png'){
                    var rx=impactPlanet.right.reduce(function(sum,v){return sum+v*v;},0),uy=impactPlanet.up.reduce(function(sum,v){return sum+v*v;},0);
                    eventDirection=impactPlanet.center.map(function(v,i){return v+impactPlanet.right[i]/rx*(1-2*.49)+impactPlanet.up[i]/uy*(1-2*.46);});
                }else flash=0;
                gl.uniform1f(gl.getUniformLocation(sky,'impactFlash'),flash);gl.uniform3fv(gl.getUniformLocation(sky,'impactDirection'),eventDirection);
                gl.uniform1f(gl.getUniformLocation(sky,'impactDebris'),0);gl.uniform1f(gl.getUniformLocation(sky,'impactMotion'),impactMotion);
                if(impactPlanet){
                    gl.uniform3fv(gl.getUniformLocation(sky,'ohioPlanetCenter'),impactPlanet.center);
                    gl.uniform3fv(gl.getUniformLocation(sky,'ohioPlanetRight'),impactPlanet.right);
                    gl.uniform3fv(gl.getUniformLocation(sky,'ohioPlanetUp'),impactPlanet.up);
                }
                if(missionSky.bakedImpact){
                    var baked=prepareBaked(elapsed||0);
                    gl.uniform1f(gl.getUniformLocation(sky,'impactFlash'),baked.flash);gl.uniform1f(gl.getUniformLocation(sky,'impactDebris'),baked.debris);gl.uniform1f(gl.getUniformLocation(sky,'impactMotion'),impactMotion);
                    [baked.a,baked.b].forEach(function(map,index){gl.activeTexture(gl.TEXTURE0+2+index);gl.bindTexture(gl.TEXTURE_2D,map);gl.uniform1i(gl.getUniformLocation(sky,index===0?'ohioPlanet':'ohioSun'),2+index);});
                    gl.uniform1f(gl.getUniformLocation(sky,'bakedBlend'),baked.blend);
                }else if(landmarkSky) landmarkTextures.forEach(function(entry,index){
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
                gl.bindTexture(gl.TEXTURE_2D,!hdrTexture && !landmarkSky && style>=10 ? panoramaTextures[style] : texture);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
                gl.disableVertexAttribArray(a);
                if(!hdrTexture && !landmarkSky && style>=7 && style<=9 && heroFeatures.length) {
                    uniforms(heroProgram,pose,width/height,dpr);
                    gl.uniform1f(gl.getUniformLocation(heroProgram,'exposure'),effectiveExposure);
                    gl.uniform1i(gl.getUniformLocation(heroProgram,'feature'),0);
                    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_COLOR);
                    var direction=gl.getAttribLocation(heroProgram,'direction'), texcoord=gl.getAttribLocation(heroProgram,'texcoord');
                    gl.enableVertexAttribArray(direction);gl.enableVertexAttribArray(texcoord);
                    var family=['galaxy','nebula','sun','river','woven'][style-7];
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
    /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).flightSkybox = { create: create, createImpactCues:createImpactCues,impactStages:impactStages, stars: stars, project: project, options: options, featureFrame: featureFrame };
}());
