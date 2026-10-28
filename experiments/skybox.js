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
    var cinemaSky=(/** @type {Required<DriftworksNamespace>} */(window.Driftworks)).flightMissions.current().id==='cinematic';
    var system=missionSky.jadeSystem;
    /** @param {number[]} v */
    function jadeRotate(v){var frame=system?system.frame:[[1,0,0],[0,1,0],[0,0,1]];return frame[0].map(function(_,j){return v.reduce(function(sum,x,i){return sum+x*frame[i][j];},0);});}
    var jadeObserver=system?system.observer:[0,-85000,0];
    var jadeMoons=(system?system.moons:[]).map(function(moon){
        var delta=moon.position.map(function(v,i){return v-jadeObserver[i];}),rangeKm=Math.hypot(...delta);
        return {...moon,rangeKm,direction:jadeRotate(delta.map(function(v){return v/rangeKm;})),radius:Math.asin(moon.diameterKm/2/rangeKm)};
    });
    var moonData=new Float32Array(jadeMoons.flatMap(function(moon){return moon.direction.concat(Math.sin(moon.radius));}));
    var moonRanges=new Float32Array(jadeMoons.map(function(m){return m.rangeKm;}));
    var planetRange=system?Math.hypot(...system.observer):85000;
    var planetRadius=system?Math.asin(system.planetRadiusKm/planetRange):Math.atan(1.31);
    var planetDirection=system?jadeRotate(system.observer.map(function(v){return -v/planetRange;})):[0,1,0];
    var jadePlanetData=new Float32Array(planetDirection.concat(Math.cos(planetRadius)));
    var gasScale=missionSky.jadeSystem&&planetRange>100000?Math.tan(planetRadius)/1.31:1;
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
        if(window.Driftworks.gpuDiagnostics)window.Driftworks.gpuDiagnostics.mark('sky.create');
        var context = canvas.getContext('webgl', { alpha: false, antialias: false });
        if (!context)
            throw new Error('Flight skybox requires WebGL');
        const gl = context;
        var explicitBridgeLod=!!gl.getExtension('EXT_shader_texture_lod');
        var bridgeOptics=missionSky.thinShell?window.Driftworks.thinShellOptics:window.Driftworks.ellisOptics;
        var bridgeDerivatives=!!missionSky.wormhole&&!!gl.getExtension('OES_standard_derivatives');
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
            if(missionSky.hyperbolic){
                fragment=fragment.replace('uniform vec3 right,up,back;','uniform vec3 right,up,back; uniform mat4 hyperbolicInverse; vec3 spaceRay(vec3 v){return normalize((hyperbolicInverse*vec4(1.,v)).yzw);}')
                    .split('normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal)').join('spaceRay(normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal))');
                if(vertex.includes('attribute vec4 star;'))vertex=vertex.replace('uniform vec3 right,up,back;','uniform mat4 hyperbolicForward;uniform vec3 right,up,back;').split('star.xyz').join('starDirection').replace('void main(){','void main(){vec3 starDirection=normalize((hyperbolicForward*vec4(1.,star.xyz)).yzw);');
                if(vertex.includes('attribute vec3 direction;'))vertex=vertex.replace('uniform vec3 right,up,back;','uniform mat4 hyperbolicForward;uniform vec3 right,up,back;').split('dot(direction,').join('dot(spaceDirection,').replace('void main(){','void main(){vec3 spaceDirection=normalize((hyperbolicForward*vec4(1.,direction)).yzw);');
            }
            var p = gl.createProgram();
            if (!p)
                throw new Error('Could not allocate skybox program');
            gl.attachShader(p, shader(gl.VERTEX_SHADER, vertex));
            if(explicitBridgeLod&&fragment.includes('uniform sampler2D ellisTable;'))fragment='#extension GL_EXT_shader_texture_lod : enable\n'+fragment.replace('texture2D(ellisTable,uv)','texture2DLodEXT(ellisTable,uv,0.)');
            if(bridgeDerivatives&&fragment.includes('vec3 jadeSatellites('))fragment=fragment.replace('precision highp float;','#extension GL_OES_standard_derivatives : enable\nprecision highp float;');
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
uniform vec3 bridgeEye;uniform float bridgeEnabled;uniform float bridgeLookup;uniform float bridgeThinShell;uniform float bridgeGrid,bridgeGridPixel,bridgeOutline;
float bridgeFootprint=0.;
uniform sampler2D panorama;
uniform sampler2D noiseMap,rimeSurface;uniform float rimeDetailed;
uniform float exposure;uniform float hdrEnabled;uniform sampler2D hdrEnvironment;
uniform sampler2D ohioPlanet,ohioSun;
uniform samplerCube bakedCube,bakedCubeTo;
uniform float cubeProjection;
uniform vec3 ohioPlanetCenter,ohioPlanetRight,ohioPlanetUp;
uniform vec3 ohioSunCenter,ohioSunRight,ohioSunUp;
uniform float ohioPlanetGain,ohioSunGain;
uniform float bakedBlend;
uniform float impactFlash,impactDebris,impactMotion; uniform vec3 impactDirection;
uniform vec4 jadeRanges,jadePlanet;uniform float jadePlanetRange;
uniform vec4 jadeMoons[4];uniform float moonPixel;
uniform vec3 gasFrameX,gasFrameY,gasFrameZ;uniform float gasScale;
uniform vec4 gasCells[8];uniform vec2 gasDrift[8];uniform float gasFlashes[8];
// The limb is encoded in the texture, so geometry MSAA cannot smooth it.
// Apply a small Gaussian reconstruction only in the source silhouette ring.
vec3 gasLimbSample(samplerCube source,vec3 ray,vec2 uv){
 float rim=length((uv-vec2(.496,.493))/vec2(.462,.456));
 if(ray.y<=0. || rim<.96 || rim>1.04)return textureCube(source,ray).rgb;
 vec3 color=vec3(0.);
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
  vec2 sampleUV=uv+vec2(float(x),float(y))*.00125;
  vec3 direction=vec3((.5-sampleUV.x)*2.856296,1.,(.5-sampleUV.y)*2.856296);
  float weight=(x==0?2.:1.)*(y==0?2.:1.);
  color+=textureCube(source,direction).rgb*weight;
 }
 return color/16.;
}
vec3 gasSurface(vec3 ray){
 // Recipe: yaw 90, pitch 0, roll 0, square card, width 110 degrees.
 vec2 uv=vec2(.5-ray.x/max(ray.y,.00001)/2.856296,.5-ray.z/max(ray.y,.00001)/2.856296);
 vec3 base=gasLimbSample(bakedCube,ray,uv);
 vec3 emission=vec3(0.);
 if(ray.y>0.)for(int i=0;i<8;i++){
  vec2 sourceUV=uv-gasDrift[i];float d=length((sourceUV-gasCells[i].xy)/gasCells[i].zw);
  float a=(1.-smoothstep(.48,1.,d))*gasFlashes[i];
  if(a>.001){
   vec3 sourceRay=normalize(vec3((.5-sourceUV.x)*2.856296,1.,(.5-sourceUV.y)*2.856296));
   // Transfer only the light difference. Translating the lit plate itself would
   // slide the gas bands; the frozen dark sky continues to own all geography.
   vec3 light=max(vec3(0.),textureCube(bakedCubeTo,sourceRay).rgb-textureCube(bakedCube,sourceRay).rgb);
   emission=max(emission,light*a);
  }
 }
 // Recolor only reflected cloud light. Preserve luminance and leave lightning
 // emission separate, so every palette keeps the same night-side exposure.
 float luminance=dot(base,vec3(.2126,.7152,.0722));
 float belt=clamp((base.r-base.b)/max(luminance,.01)*1.8+.18,0.,1.);
 vec3 tint=mix(vec3(.83,.90,.74),vec3(.12,.35,.25),belt);
 vec3 colored=luminance*tint/max(dot(tint,vec3(.2126,.7152,.0722)),.001);
 float peak=max(colored.r,max(colored.g,colored.b));
 colored=vec3(luminance)+(colored-vec3(luminance))*min(1.,(1.-luminance)/max(peak-luminance,.001));
 base=mix(base,colored,.9);
 return min(vec3(1.),base+emission);
}
vec3 impactOptics(vec3 color, vec3 ray){
    float distance=1.-dot(ray,normalize(impactDirection));
    vec3 radiance=impactFlash*vec3(1.,.92,.76)*(12.*exp(-distance/.000004)+.45*exp(-distance/.00007));
    float depth=dot(ray,ohioPlanetCenter);
    if(impactDebris>0. && depth>0.){
        vec2 uv=(1.-vec2(dot(ray,ohioPlanetRight),dot(ray,ohioPlanetUp))/depth)*.5;
        if(cubeProjection>.5)uv.x=1.-uv.x;
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
// Analytic opaque spheres retain sub-degree detail independently of cube resolution.
vec3 jadeSatellites(vec3 sky,vec3 ray){
 float closest=dot(ray,jadePlanet.xyz)>jadePlanet.w?jadePlanetRange:1.e20;
 for(int i=0;i<4;i++){
  vec3 center=jadeMoons[i].xyz;float radius=jadeMoons[i].w;
  float depth=dot(ray,center);if(depth<=0.)continue;
  float r=length(cross(ray,center))/radius;
  // Measure the lensed screen footprint before destination/limb branches.
  float footprint=max(moonPixel,min(bridgeFootprint*.75,radius*.04));
  if(r>1.+footprint/radius)continue;
  float hit=(depth-radius*sqrt(max(0.,1.-min(r*r,1.))))*jadeRanges[i];
  if(hit>closest)continue;closest=hit;
  float coverage=1.-smoothstep(1.-footprint/radius,1.+footprint/radius,r);
  vec3 normal=normalize((ray*depth-center)/radius-ray*sqrt(max(0.,1.-min(r*r,1.))));
  vec3 p=vec3(dot(normal,gasFrameX),dot(normal,gasFrameY),dot(normal,gasFrameZ))*4.+vec3(float(i)*17.3,2.1,8.7);
  float terrain=noise(p)*.65+noise(p*3.1)*.25+noise(p*11.)*.1;
  vec3 dark=vec3(.24,.19,.15),light=vec3(.65,.53,.36);
  if(i==1){dark=vec3(.40,.48,.49);light=vec3(.83,.86,.79);}
  if(i==2){dark=vec3(.15,.13,.12);light=vec3(.48,.43,.37);}
  if(i==3){dark=vec3(.30,.33,.36);light=vec3(.69,.73,.75);}
  vec3 albedo=mix(dark,light,smoothstep(.22,.78,terrain));
  // Rime has irregular frozen seams; the others have muted mottled regolith.
  if(i==1&&rimeDetailed>.5){
   // Fixed observer: project a finished disk on its tangent plane. Never wrap
   // the visible artwork around a sphere or spend pixels on the hidden hemisphere.
   vec3 diskRight=normalize(cross(vec3(0.,0.,1.),center));
   vec3 diskUp=cross(center,diskRight);
   float tangentRadius=radius/sqrt(1.-radius*radius);
   vec2 diskXY=vec2(dot(ray,diskRight),-dot(ray,diskUp))/(depth*tangentRadius);
   vec2 diskUV=vec2(.5)+diskXY*.484;
   vec4 disk=texture2D(rimeSurface,diskUV);
   if(footprint>moonPixel*1.5&&r>.94){
    float stepUV=min(.01,footprint/radius*.242);
    disk=(texture2D(rimeSurface,diskUV+vec2(stepUV,stepUV))+texture2D(rimeSurface,diskUV+vec2(-stepUV,stepUV))+texture2D(rimeSurface,diskUV+vec2(stepUV,-stepUV))+texture2D(rimeSurface,diskUV-vec2(stepUV,stepUV)))*.25;
   }
   albedo=disk.rgb;coverage*=disk.a;
  }
  float sunlight=max(0.,dot(normal,normalize(ohioSunCenter)));
  vec3 color=albedo*pow(sunlight,1./2.2)*exposure;
  sky=mix(sky,color,coverage);
 }
 return sky;
}
${bridgeOptics?bridgeOptics.shader:'uniform float ellisRegion; struct EllisRay {float hit;}; EllisRay ellisInit(vec3 e,vec3 r){return EllisRay(0.);} vec3 ellisExit(EllisRay e){return vec3(0.);} vec3 ellisPoint(EllisRay e,float t,out float side){side=0.;return vec3(0.);}'}
${bridgeOptics&&bridgeOptics.latticeShader?bridgeOptics.latticeShader:'vec4 ellisLattice(EllisRay e,vec3 eye,float pixel){return vec4(0.);}'}
void main(){
    if(hdrEnabled>.5){vec3 hdrRay=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);vec2 uv=vec2(atan(hdrRay.y,hdrRay.x)/6.28318530718+.5,acos(clamp(hdrRay.z,-1.,1.))/3.14159265359);vec3 radiance=max(vec3(0.),texture2D(hdrEnvironment,uv).rgb);gl_FragColor=vec4(pow(vec3(1.)-exp(-radiance*exposure),vec3(1./2.2)),1.);return;}
    if(bridgeEnabled>.5){
        vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
        float side=ellisRegion;
        vec3 offset=(bridgeEye-vec3(side*12000.,-2000.,1550.))/300.;
        float along=dot(offset,ray),impact2=dot(offset,offset)-along*along;
        vec3 outgoing=ray;float destination=side;vec4 lattice=vec4(0.);
        if(bridgeThinShell>.5){
            // Flat exteriors glued antipodally at r=a (zero throat length).
            // Preserve normal velocity and reverse the tangent under the gluing.
            // A missed shell leaves the local sky exactly undeformed.
            if(along<0. && impact2<1.){
                vec3 normal=normalize(offset+ray*(-along-sqrt(max(0.,1.-impact2))));
                outgoing=normalize(2.*dot(ray,normal)*normal-ray);
                destination=1.-side;
            }
        }else if(bridgeLookup>.5){
            EllisRay bridge=ellisInit(bridgeEye,ray);
            if(bridge.hit>.5){outgoing=ellisExit(bridge);float ignored;ellisPoint(bridge,1.,ignored);destination=ignored;if(bridgeGrid>.5)lattice=ellisLattice(bridge,bridgeEye,bridgeGridPixel);}
        }else{
        // Null geodesic: ds²=-dt²+dl²+(l²+a²)dOmega², a=1.
        // Finite integration domain and steps make this a visual approximation.
        if(along<0. && impact2<4.){
            vec3 entry=offset+ray*max(0.,-along-sqrt(max(0.,4.-impact2)));
            float r=max(1.00001,length(entry)),l=sqrt(r*r-1.);
            vec3 radial=entry/r;
            float cosine=dot(ray,radial);
            vec3 tangent=normalize(ray-radial*cosine+vec3(1.e-7));
            float b=r*sqrt(max(0.,1.-cosine*cosine));
            float momentum=cosine,phi=0.;
            for(int i=0;i<192;i++){
                float h=.065,mid=l+momentum*h*.5;
                float accel=b*b*mid/pow(1.+mid*mid,2.);
                phi+=h*b/(1.+mid*mid);
                l+=h*(momentum+accel*h*.5);momentum+=h*accel;
                if(abs(l)>7.)break;
            }
            vec3 radialEnd=radial*cos(phi)+tangent*sin(phi);
            vec3 tangentEnd=-radial*sin(phi)+tangent*cos(phi);
            outgoing=normalize(radialEnd*momentum+tangentEnd*b/sqrt(1.+l*l));
            if(l<0.){destination=1.-side;outgoing=-outgoing;}
        }
        }
        ${bridgeDerivatives?'bridgeFootprint=max(length(dFdx(outgoing)),length(dFdy(outgoing)));':''}
        if(destination>.5){
            vec3 local=vec3(dot(outgoing,gasFrameX),dot(outgoing,gasFrameY),dot(outgoing,gasFrameZ));
            vec3 sourceRay=normalize(vec3(local.x/gasScale,local.y,local.z/gasScale));
            vec3 planet=local.y>0.?gasSurface(sourceRay):vec3(0.);
            gl_FragColor=vec4(clamp(jadeSatellites(planet*exposure+ohioLandmark(ohioSun,outgoing,ohioSunCenter,ohioSunRight,ohioSunUp,ohioSunGain),outgoing),0.,1.),1.);
        }else{
            vec2 uv=vec2(atan(outgoing.y,outgoing.x)/6.28318530718+.5,acos(clamp(outgoing.z,-1.,1.))/3.14159265359);
            vec3 cell=floor(outgoing*1400.);
            float star=pow(fract(sin(dot(cell,vec3(12.9898,78.233,37.719)))*43758.5453),420.);
            gl_FragColor=vec4((texture2D(panorama,uv).rgb+vec3(star*.22)${cinemaSky?'+ohioLandmark(ohioPlanet,outgoing,ohioPlanetCenter,ohioPlanetRight,ohioPlanetUp,ohioPlanetGain)':''})*exposure,1.);
        }
        gl_FragColor.rgb=gl_FragColor.rgb*(1.-lattice.a*.65)+lattice.rgb;
        if(bridgeThinShell<.5&&bridgeLookup>.5&&bridgeOutline>.5){
            // Mark the whole 600 m lensing volume, including same-chart
            // returning rays. Inside it every direction can be distorted;
            // there is no silhouette separating bent and untouched sky.
            float eyeRadius=max(2.000001,length(offset));
            float cone=asin(2./eyeRadius);
            float angle=acos(clamp(-along/eyeRadius,-1.,1.));
            float edge=abs(angle-cone);
            float width=bridgeGridPixel*1.4;
            float rim=(1.-smoothstep(width*.55,width,edge))*smoothstep(2.,2.05,length(offset));
            vec3 rimColor=side<.5?vec3(1.,.48,.10):vec3(.22,1.,.38);
            gl_FragColor.rgb=mix(gl_FragColor.rgb,rimColor,rim*.9);
        }
        return;
    }
    if(style>9.5 && style<11.5){
        vec3 riverRay=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
        vec2 riverUV=vec2(atan(riverRay.y,riverRay.x)/6.28318530718+.5,acos(clamp(riverRay.z,-1.,1.))/3.14159265359);
        gl_FragColor=vec4(texture2D(panorama,riverUV).rgb*exposure,1.);return;
    }
    if(style>22.5){
        vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
        vec3 local=vec3(dot(ray,gasFrameX),dot(ray,gasFrameY),dot(ray,gasFrameZ));
        vec3 sourceRay=normalize(vec3(local.x/gasScale,local.y,local.z/gasScale));
        vec3 planet=local.y>0.?gasSurface(sourceRay):vec3(0.);
        vec3 sun=ohioLandmark(ohioSun,ray,ohioSunCenter,ohioSunRight,ohioSunUp,ohioSunGain);
        gl_FragColor=vec4(clamp(jadeSatellites(planet*exposure+sun,ray),0.,1.),1.);return;
    }
    if(style>21.5){
        vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
        gl_FragColor=vec4(impactOptics(mix(textureCube(bakedCube,ray).rgb,textureCube(bakedCubeTo,ray).rgb,bakedBlend)*exposure,ray),1.);return;
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
            if(missionSky.cubeFaces||!landmarkSky||missionSky.features[0].asset!=='planet-hero-v1/master.png')return;
            planetOverride=source;var entry=landmarkTextures[0];if(!entry||!entry.loaded)return;
            gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,entry.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
        }
        if (landmarkSky) {
            // The planet is lit from its upper left, toward the viewer.
            // +Y faces the planet; the sun is behind the left shoulder (-X,-Y,+Z).
            var landmarkFeatures = cinemaSky?[{asset:'planet-hero-v1/master.png',yaw:90,pitch:-30,roll:0,widthDeg:110,gain:1},missionSky.features[1]]:missionSky.features;
            if(system&&!cinemaSky)landmarkFeatures=landmarkFeatures.map(function(feature){
                var yaw=feature.yaw*Math.PI/180,pitch=feature.pitch*Math.PI/180;
                var direction=jadeRotate([Math.cos(yaw)*Math.cos(pitch),Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch)]);
                return {...feature,yaw:Math.atan2(direction[1],direction[0])*180/Math.PI,pitch:Math.asin(direction[2])*180/Math.PI};
            });
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
                if(missionSky.cubeFaces&&(!missionSky.gasGiant||landmarkTextures.length===1)&&!cinemaSky)return; // Frames are metadata only; never load the source cards in cube mode.
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
        var cubeTexture=gl.createTexture(),cubeLoaded=0;
        if(missionSky.cubeFaces&&!missionSky.cubeStages){
            if(missionSky.cubeFaces.length!==6)throw new Error('A baked skybox requires six faces in +X,-X,+Y,-Y,+Z,-Z order');
            gl.activeTexture(gl.TEXTURE0+5);gl.bindTexture(gl.TEXTURE_CUBE_MAP,cubeTexture);
            for(var faceIndex=0;faceIndex<6;faceIndex++)gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+faceIndex,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
            gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
            canvas.dataset.cube='loading';
            missionSky.cubeFaces.forEach(function(file,index){var image=new Image();image.onload=function(){
                if(image.width!==1024||image.height!==1024){canvas.dataset.cube='error';return;}
                gl.activeTexture(gl.TEXTURE0+5);gl.bindTexture(gl.TEXTURE_CUBE_MAP,cubeTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
                gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+index,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
                cubeLoaded++;if(cubeLoaded===6&&canvas.dataset.cube!=='error'){
                    if(missionSky.gasGiant){gl.generateMipmap(gl.TEXTURE_CUBE_MAP);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);}
                    canvas.dataset.cube='ready';canvas.dataset.ohio='ready';
                }
            };image.onerror=function(){canvas.dataset.cube='error';};image.src=assetUrl('../assets/backgrounds/'+file);});
            gl.activeTexture(gl.TEXTURE0);
        }
        var rimeTexture=missionSky.rimeSurface?gl.createTexture():null,rimeLoaded=false;
        if(missionSky.rimeSurface){
            gl.activeTexture(gl.TEXTURE0+7);gl.bindTexture(gl.TEXTURE_2D,rimeTexture);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([170,175,173,255]));
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
            canvas.dataset.rime='loading';
            var rimeImage=new Image();rimeImage.onload=function(){
                gl.activeTexture(gl.TEXTURE0+7);gl.bindTexture(gl.TEXTURE_2D,rimeTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
                gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,rimeImage);rimeLoaded=true;canvas.dataset.rime='ready';gl.activeTexture(gl.TEXTURE0);
            };rimeImage.onerror=function(){canvas.dataset.rime='error';};rimeImage.src=assetUrl('../assets/backgrounds/'+missionSky.rimeSurface);
            gl.activeTexture(gl.TEXTURE0);
        }
        var gasLitTexture=missionSky.gasGiant?gl.createTexture():null,gasLitLoaded=0,gasTime=0,gasFlashes=new Float32Array(8),gasOffsets=new Float32Array(16);
        var gasWeather=window.Driftworks.gasGiantWeather,gasCellData=gasWeather?new Float32Array(gasWeather.gasGiantCells.flat()):new Float32Array(0);
        if(missionSky.gasGiant){
            gl.activeTexture(gl.TEXTURE0+6);gl.bindTexture(gl.TEXTURE_CUBE_MAP,gasLitTexture);
            for(var gasFace=0;gasFace<6;gasFace++)gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+gasFace,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
            gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
            canvas.dataset.gas='loading';
            ['px','nx','py','ny','pz','nz'].forEach(function(face,index){var image=new Image();image.onload=function(){
                if(image.width!==1024||image.height!==1024){canvas.dataset.gas='error';return;}
                gl.activeTexture(gl.TEXTURE0+6);gl.bindTexture(gl.TEXTURE_CUBE_MAP,gasLitTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
                gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+index,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
                gasLitLoaded++;if(gasLitLoaded===6&&canvas.dataset.gas!=='error'){
                    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
                    canvas.dataset.gas='ready';
                }
            };image.onerror=function(){canvas.dataset.gas='error';};image.src=assetUrl('../assets/backgrounds/gas-giant-lightning-v1/lit-cube/'+face+'.png');});
            gl.activeTexture(gl.TEXTURE0);
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
        if(missionSky.bakedImpact&&typeof host.addEventListener==='function'){
            host.addEventListener('impact-cue',function(event){var detail=/** @type {CustomEvent<{stage:string;seconds?:number}>} */(event).detail;if(detail)cueImpact(detail.stage,detail.seconds);});
            host.addEventListener('impact-reset',resetImpact);
        }
        // At most three stages: cube sets ~72 MiB; archived 4K maps ~96 MiB RGBA.
        /** @type {Map<number,{texture:WebGLTexture|null,ready:boolean}>} */var bakedMaps=new Map();
        var bakedControls=false;
        /** @param {number} index */function bakedMap(index){
            var existing=bakedMaps.get(index);if(existing)return existing;
            var entry={texture:gl.createTexture(),ready:false};bakedMaps.set(index,entry);
            if(missionSky.cubeStages){
                var loaded=0;
                gl.activeTexture(gl.TEXTURE0+5);gl.bindTexture(gl.TEXTURE_CUBE_MAP,entry.texture);
                for(var face=0;face<6;face++)gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+face,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
                gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
                ['px','nx','py','ny','pz','nz'].forEach(function(name,faceIndex){var image=new Image();image.onload=function(){
                    if(bakedMaps.get(index)!==entry)return;
                    if(image.width!==1024||image.height!==1024){canvas.dataset.bakedImpact='error';return;}
                    gl.activeTexture(gl.TEXTURE0+5);gl.bindTexture(gl.TEXTURE_CUBE_MAP,entry.texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
                    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+faceIndex,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
                    loaded++;entry.ready=loaded===6;
                };image.onerror=function(){canvas.dataset.bakedImpact='error';};image.src=assetUrl('../assets/backgrounds/'+missionSky.cubeStages+index+'/'+name+'.png');});
                return entry;
            }
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
                    (missionSky.bakedImpact?document.body:host).appendChild(cueControls);
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
            if(ready&&canvas.dataset.bakedImpact!=='error'){canvas.dataset.bakedImpact='ready';if(missionSky.cubeStages){canvas.dataset.cube='ready';canvas.dataset.ohio='ready';}}
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
        if(landmarkSky&&(missionSky.gasGiant||['planet-hero-v1/master.png','planet-hero-orbital-v2/master.png'].indexOf(missionSky.features[0].asset)>=0)){
            var planet=landmarkTextures[0],visible=/** @type {number[]} */([]);
            for(var star=0;star<starData.length;star+=4){
                var depth=0,px=0,py=0;for(var axis=0;axis<3;axis++){depth+=starData[star+axis]*planet.center[axis];px+=starData[star+axis]*planet.right[axis];py+=starData[star+axis]*planet.up[axis];}
                if(missionSky.gasGiant&&gasScale!==1){
                    var planetDot=planetDirection.reduce(function(sum,v,i){return sum+v*starData[star+i];},0);
                    if(planetDot>Math.cos(planetRadius))continue;
                }else if(depth>0&&(px*px+py*py)/(depth*depth)<.91*.91)continue;
                if(missionSky.gasGiant&&jadeMoons.some(function(moon){
                    var d=moon.direction,dot=starData[star]*d[0]+starData[star+1]*d[1]+starData[star+2]*d[2];
                    return dot>Math.cos(moon.radius);
                }))continue;
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
        var bridgeMode=typeof location==='undefined'?'':new URLSearchParams(location.search).get('bridge');
        var bridgeTable=missionSky.wormhole&&window.Driftworks.ellisOptics&&bridgeMode!=='legacy'?gl.createTexture():null;
        if(bridgeTable){
            var optics=/** @type {Required<DriftworksNamespace>} */(window.Driftworks).ellisOptics;
            gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,bridgeTable);
            gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,optics.size,optics.size,0,gl.RGBA,gl.UNSIGNED_BYTE,optics.table());
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.activeTexture(gl.TEXTURE0);
        }
        var image = new Image();
        image.onload = function () {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
            canvas.dataset.panorama = 'ready';
        };
        if(!landmarkSky||missionSky.wormhole) image.src = assetUrl(missionSky.wormhole?'../assets/backgrounds/hero-composition-v1-8k.jpg':'../assets/backgrounds/all-sky-milky-way.jpg');
        /** @param {WebGLProgram} p @param {Pose} pose @param {number} aspect @param {number} dpr */
        function uniforms(p, pose, aspect, dpr) {
            if(missionSky.hyperbolic){
                var frame=pose.spaceFrame||[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],inverse=/** @type {number[]} */([]);
                for(var col=0;col<4;col++)for(var row=0;row<4;row++)inverse.push((row===0?-1:1)*(col===0?-1:1)*frame[row][col]);
                var magnitude=Math.max(1,...frame.flat().map(function(v){return Math.abs(v);}));
                gl.useProgram(p);gl.uniformMatrix4fv(gl.getUniformLocation(p,'hyperbolicForward'),false,frame.flat().map(function(v){return v/magnitude;}));gl.uniformMatrix4fv(gl.getUniformLocation(p,'hyperbolicInverse'),false,inverse.map(function(v){return v/magnitude;}));
            }
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
                if(window.Driftworks.gpuDiagnostics)window.Driftworks.gpuDiagnostics.mark('sky.render');
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
                gl.uniform1f(gl.getUniformLocation(sky, 'style'), missionSky.gasGiant ? 23 : missionSky.cubeFaces ? 22 : missionSky.bakedImpact ? 21 : landmarkSky ? 20 : style);
                gl.uniform1f(gl.getUniformLocation(sky,'bridgeEnabled'),missionSky.wormhole?1:0);
                var thinShellControl=/** @type {HTMLInputElement|null} */(document.getElementById('bridge-thin-shell'));
                gl.uniform1f(gl.getUniformLocation(sky,'bridgeThinShell'),missionSky.thinShell||thinShellControl&&thinShellControl.checked?1:0);
                var gridControl=/** @type {HTMLInputElement|null} */(document.getElementById('bridge-grid'));
                gl.uniform1f(gl.getUniformLocation(sky,'bridgeGrid'),missionSky.wormhole&&(gridControl?gridControl.checked:new URLSearchParams(typeof location==='undefined'?'':location.search).get('bridgeGrid')!=='0')?1:0);
                gl.uniform1f(gl.getUniformLocation(sky,'bridgeOutline'),missionSky.wormhole&&new URLSearchParams(typeof location==='undefined'?'':location.search).get('bridgeOutline')!=='0'?1:0);
                gl.uniform1f(gl.getUniformLocation(sky,'bridgeGridPixel'),2.2*dpr/(height*viewFocal));
                gl.uniform1f(gl.getUniformLocation(sky,'ellisRegion'),pose.region||0);
                gl.uniform1f(gl.getUniformLocation(sky,'bridgeLookup'),bridgeTable?1:0);
                if(bridgeTable){gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,bridgeTable);gl.uniform1i(gl.getUniformLocation(sky,'ellisTable'),4);gl.activeTexture(gl.TEXTURE0);}
                if(missionSky.wormhole)gl.uniform3fv(gl.getUniformLocation(sky,'bridgeEye'),pose.eye.map(function(v){return v*(/** @type {Required<DriftworksNamespace>} */(window.Driftworks)).sim.METERS_PER_UNIT;}));
                gl.uniform1i(gl.getUniformLocation(sky,'bakedCube'),5);
                gl.uniform1i(gl.getUniformLocation(sky,'bakedCubeTo'),6);
                gl.uniform1f(gl.getUniformLocation(sky,'cubeProjection'),missionSky.cubeStages?1:0);
                gl.uniform1f(gl.getUniformLocation(sky,'bakedBlend'),0);
                gl.uniform1f(gl.getUniformLocation(sky, 'exposure'), effectiveExposure);
                gl.uniform1i(gl.getUniformLocation(sky,'rimeSurface'),rimeTexture?7:0);
                gl.uniform1f(gl.getUniformLocation(sky,'rimeDetailed'),rimeLoaded?1:0);
                if(rimeTexture){gl.activeTexture(gl.TEXTURE0+7);gl.bindTexture(gl.TEXTURE_2D,rimeTexture);}
                gl.uniform1f(gl.getUniformLocation(sky,'hdrEnabled'),hdrTexture?1:0);gl.uniform1i(gl.getUniformLocation(sky,'hdrEnvironment'),4);
                if(hdrTexture){gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_2D,hdrTexture);gl.activeTexture(gl.TEXTURE0);}
                gl.uniform1i(gl.getUniformLocation(sky, 'noiseMap'), 1);
                var flash=impactTime>=0&&impactTime<.8?Math.exp(-impactTime/.12)*(1-Math.exp(-impactTime/.008)):0;
                var impactPlanet=landmarkTextures[0],eventDirection=[0,1,0];
                if(impactPlanet&&(missionSky.cubeStages||missionSky.features[0].asset==='planet-hero-v1/master.png')){
                    var rx=impactPlanet.right.reduce(function(sum,v){return sum+v*v;},0),uy=impactPlanet.up.reduce(function(sum,v){return sum+v*v;},0);
                    eventDirection=impactPlanet.center.map(function(v,i){return v+impactPlanet.right[i]/rx*(missionSky.cubeStages?2*.49-1:1-2*.49)+impactPlanet.up[i]/uy*(1-2*.46);});
                }else flash=0;
                gl.uniform1f(gl.getUniformLocation(sky,'impactFlash'),flash);gl.uniform3fv(gl.getUniformLocation(sky,'impactDirection'),eventDirection);
                gl.uniform1f(gl.getUniformLocation(sky,'impactDebris'),0);gl.uniform1f(gl.getUniformLocation(sky,'impactMotion'),impactMotion);
                if(impactPlanet){
                    gl.uniform3fv(gl.getUniformLocation(sky,'ohioPlanetCenter'),impactPlanet.center);
                    gl.uniform3fv(gl.getUniformLocation(sky,'ohioPlanetRight'),impactPlanet.right);
                    gl.uniform3fv(gl.getUniformLocation(sky,'ohioPlanetUp'),impactPlanet.up);
                }
                if(missionSky.cubeStages){
                    var cube=prepareBaked(elapsed||0);
                    gl.uniform1f(gl.getUniformLocation(sky,'impactFlash'),cube.flash);gl.uniform1f(gl.getUniformLocation(sky,'impactDebris'),cube.debris);gl.uniform1f(gl.getUniformLocation(sky,'impactMotion'),impactMotion);
                    [cube.a,cube.b].forEach(function(map,index){gl.activeTexture(gl.TEXTURE0+5+index);gl.bindTexture(gl.TEXTURE_CUBE_MAP,map);});
                    gl.uniform1f(gl.getUniformLocation(sky,'bakedBlend'),cube.blend);
                }else if(missionSky.cubeFaces){
                    gl.activeTexture(gl.TEXTURE0+5);gl.bindTexture(gl.TEXTURE_CUBE_MAP,cubeTexture);gl.uniform1i(gl.getUniformLocation(sky,'bakedCube'),5);
                    gl.activeTexture(gl.TEXTURE0+6);gl.bindTexture(gl.TEXTURE_CUBE_MAP,missionSky.gasGiant?gasLitTexture:cubeTexture);
                }else if(missionSky.bakedImpact){
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
                if(missionSky.gasGiant){
                    var weather=window.Driftworks.gasGiantWeather,sun=landmarkTextures[1];
                    gl.uniform4fv(gl.getUniformLocation(sky,'jadeMoons[0]'),moonData);
                    gl.uniform4fv(gl.getUniformLocation(sky,'jadeRanges'),moonRanges);
                    gl.uniform4fv(gl.getUniformLocation(sky,'jadePlanet'),jadePlanetData);
                    gl.uniform1f(gl.getUniformLocation(sky,'jadePlanetRange'),planetRange);
                    var frame=system?system.frame:[[1,0,0],[0,1,0],[0,0,1]];
                    ['gasFrameX','gasFrameY','gasFrameZ'].forEach(function(name,i){gl.uniform3fv(gl.getUniformLocation(sky,name),frame[i]);});
                    gl.uniform1f(gl.getUniformLocation(sky,'gasScale'),gasScale);
                    gl.uniform1f(gl.getUniformLocation(sky,'moonPixel'),1/(focal*canvas.height));
                    if(cubeLoaded===6&&gasLitLoaded===6)gasTime+=Math.max(0,elapsed||0);
                    if(weather){
                        gl.uniform4fv(gl.getUniformLocation(sky,'gasCells[0]'),gasCellData);
                        for(var cell=0;cell<8;cell++){gasFlashes[cell]=weather.gasGiantFlash(gasTime,cell);var offset=weather.gasGiantDrift(gasTime,cell);gasOffsets[cell*2]=offset[0];gasOffsets[cell*2+1]=offset[1];}
                        gl.uniform1fv(gl.getUniformLocation(sky,'gasFlashes[0]'),gasFlashes);gl.uniform2fv(gl.getUniformLocation(sky,'gasDrift[0]'),gasOffsets);
                    }
                    if(sun){
                        gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,sun.texture);gl.uniform1i(gl.getUniformLocation(sky,'ohioSun'),3);
                        gl.uniform3fv(gl.getUniformLocation(sky,'ohioSunCenter'),sun.center);gl.uniform3fv(gl.getUniformLocation(sky,'ohioSunRight'),sun.right);gl.uniform3fv(gl.getUniformLocation(sky,'ohioSunUp'),sun.up);gl.uniform1f(gl.getUniformLocation(sky,'ohioSunGain'),sun.gain);
                    }
                }
                if(cinemaSky){
                    var terrestrial=landmarkTextures[0];gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,terrestrial.texture);gl.uniform1i(gl.getUniformLocation(sky,'ohioPlanet'),2);
                    gl.uniform3fv(gl.getUniformLocation(sky,'ohioPlanetCenter'),terrestrial.center);gl.uniform3fv(gl.getUniformLocation(sky,'ohioPlanetRight'),terrestrial.right);gl.uniform3fv(gl.getUniformLocation(sky,'ohioPlanetUp'),terrestrial.up);gl.uniform1f(gl.getUniformLocation(sky,'ohioPlanetGain'),terrestrial.gain);
                }
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
                if(missionSky.wormhole)return;
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
