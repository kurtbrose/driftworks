'use strict';
/** @param {number[]} a @param {number[]} b */
function glareDot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
/** @param {number[]} a */
function glareUnit(a){const d=Math.hypot(...a);return a.map(v=>v/d);}
/** @param {number[]} a @param {number[]} b */
function glareCross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
/** @param {number[]} p */
function glareRock(p){return Math.hypot(...p)-1;}
/** @param {number[]} origin @param {number[]} ray */
function glareHit(origin,ray){const b=glareDot(origin,ray),c=glareDot(origin,origin)-1,d=b*b-c;if(d<0)return -1;const near=-b-Math.sqrt(d),far=-b+Math.sqrt(d);return near>.001?near:far>.001?far:-1;}
/** @param {number[]} eye @param {number[]} sun @param {number} radius @param {boolean=} moon */
function glareVisibility(eye,sun,radius,moon=false){
    const right=glareUnit(glareCross(sun,[0,1,0])),up=glareCross(right,sun);let visible=0;
    for(let i=0;i<97;i++){const r=Math.sqrt((i+0.5)/97)*Math.tan(radius),a=i*2.39996323;
        const ray=glareUnit(sun.map((v,k)=>v+r*(Math.cos(a)*right[k]+Math.sin(a)*up[k])));
        if(glareHit(eye,ray)<0&&(!moon||novaMoonHit(eye,ray)<0))visible++;
    }return visible/97;
}
/** @param {number} current @param {number} target @param {number} dt */
function glareExposure(current,target,dt){return current+(target-current)*(1-Math.exp(-Math.max(0,Math.min(dt,.1))/(target<current?.28:1.6)));}

/** @param {number} phase */
function novaProfile(phase){const t=Math.max(0,Math.min(1,phase));return {radius:.035+1.05*t*t,energy:6*(1+2*Math.sin(Math.PI*t)),color:[1,.97-.22*t,.91-.4*t]};}
/** @param {number[]} n */
function novaBasis(n){const x=n[0],y=n[1],z=n[2];return [.282095,.488603*y,.488603*z,.488603*x,1.092548*x*y,1.092548*y*z,.315392*(3*z*z-1),1.092548*x*z,.546274*(x*x-y*y)];}
/** Bake linear HDR radiance and diffuse L2 irradiance once per keyframe.
 * @param {number} phase @param {number} width @param {number} height */
function novaBake(phase,width=512,height=256){
    const profile=novaProfile(phase),pixels=new Float32Array(width*height*3),sh=new Float32Array(27);
    const area=2*Math.PI*(1-Math.cos(profile.radius)),radiance=profile.energy/area;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const lat=(y+.5)/height*Math.PI,lon=((x+.5)/width-.5)*Math.PI*2;
        const n=[Math.sin(lat)*Math.cos(lon),Math.cos(lat),Math.sin(lat)*Math.sin(lon)];
        const angle=Math.acos(Math.max(-1,Math.min(1,-n[2]))),inside=angle<profile.radius;
        const basis=novaBasis(n),weight=Math.sin(lat)*(Math.PI/height)*(Math.PI*2/width);
        for(let c=0;c<3;c++){
            // Keep the dominant emitter out of low-order SH; no invented ambient fill.
            const value=inside?radiance*profile.color[c]:0;
            pixels[(y*width+x)*3+c]=value;
            for(let k=0;k<9;k++)sh[k*3+c]+=(inside?0:value)*basis[k]*weight*(k===0?Math.PI:k<4?2*Math.PI/3:Math.PI/4);
        }
    }return {pixels,sh,profile,width,height};
}
/** Cached finite-source cosine integral; no SH ringing on the unlit side.
 * @param {number} phase @param {number} cosine @param {number} samples */
function novaIrradiance(phase,cosine,samples=512){
    const profile=novaProfile(phase),mu=Math.max(-1,Math.min(1,cosine));
    if(mu<=-Math.sin(profile.radius))return 0;
    let total=0;for(let i=0;i<samples;i++){
        const a=i*2.39996323,z=1-((i+.5)/samples)*(1-Math.cos(profile.radius)),r=Math.sqrt(1-z*z);
        total+=Math.max(0,mu*z+Math.sqrt(1-mu*mu)*r*Math.cos(a));
    }return profile.energy*total/samples;
}
/** @param {number[]} origin @param {number[]} ray */
function novaMoonHit(origin,ray){return glareHit(origin.map((v,k)=>(v-[.25,.22,-1.55][k])/.24),ray)/ (1/.24);}
/** @param {number[]} p @param {number} radius */
function novaShadow(p,radius){let lit=0;for(let i=0;i<32;i++){
    const a=i*2.39996323,z=1-((i+.5)/32)*(1-Math.cos(radius)),r=Math.sqrt(1-z*z);
    if(novaMoonHit(p,[r*Math.cos(a),r*Math.sin(a),-z])<=0)lit++;
}return lit/32;}

if(typeof document!=='undefined') (function(){
    /** @param {string} id */function element(id){const e=document.getElementById(id);if(!e)throw new Error(id);return e;}
    /** @param {string} id */function input(id){return /** @type {HTMLInputElement} */(element('glare-'+id));}
    const canvas=/** @type {HTMLCanvasElement} */(element('glare-view')),status=element('readout');
    const gl=canvas.getContext('webgl',{alpha:false,antialias:false});
    if(!gl){status.textContent='WebGL is unavailable.';return;}
    /** @param {number} type @param {string} source */function shader(type,source){if(!gl)throw new Error('WebGL unavailable');const s=gl.createShader(type);if(!s)throw new Error('Shader allocation failed');gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader compilation failed');return s;}
    const program=gl.createProgram();if(!program)throw new Error('Program allocation failed');
    gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
precision highp float;
uniform vec2 resolution;uniform vec3 eye,forward,right,up,sun;
uniform float radius,visibility,exposure,strength,nova,novaBlend;
uniform sampler2D novaA,novaB,novaCosine;uniform float novaSlot;uniform vec3 irradiance[9];
float rock(vec3 p){return length(p)-1.;}
float hit(vec3 o,vec3 d){float b=dot(o,d),c=dot(o,o)-1.,h=b*b-c;if(h<0.)return -1.;float a=-b-sqrt(h),z=-b+sqrt(h);return a>.001?a:z>.001?z:-1.;}
float moonHit(vec3 o,vec3 d){float t=hit((o-vec3(.25,.22,-1.55))/.24,d);return t*.24;}
vec3 env(vec3 d){vec2 uv=vec2(atan(d.z,d.x)/6.2831853+.5,acos(clamp(d.y,-1.,1.))/3.14159265);return mix(texture2D(novaA,uv).rgb,texture2D(novaB,uv).rgb,novaBlend);}
vec3 diffuseEnv(vec3 n){return max(vec3(0.),irradiance[0]*.282095+irradiance[1]*(.488603*n.y)+irradiance[2]*(.488603*n.z)+irradiance[3]*(.488603*n.x)+irradiance[4]*(1.092548*n.x*n.y)+irradiance[5]*(1.092548*n.y*n.z)+irradiance[6]*(.315392*(3.*n.z*n.z-1.))+irradiance[7]*(1.092548*n.x*n.z)+irradiance[8]*(.546274*(n.x*n.x-n.y*n.y)));}
vec3 sourceIrradiance(float mu){float x=clamp((mu*.5+.5)*255.,0.,255.),lo=floor(x),a=fract(x);float row=floor(novaSlot),blend=novaSlot-row;float next=min(6.,row+1.);vec2 l=vec2((lo+.5)/256.,(row+.5)/7.),r=vec2((min(255.,lo+1.)+.5)/256.,(row+.5)/7.);vec3 first=mix(texture2D(novaCosine,l).rgb,texture2D(novaCosine,r).rgb,a);l.y=(next+.5)/7.;r.y=l.y;return mix(first,mix(texture2D(novaCosine,l).rgb,texture2D(novaCosine,r).rgb,a),blend);}
float shadowDisk(vec3 p,vec3 n,float isMoon){float total=0.,lit=0.;for(int i=0;i<32;i++){float a=float(i)*2.39996323,z=1.-((float(i)+.5)/32.)*(1.-cos(radius));float r=sqrt(1.-z*z);vec3 d=vec3(r*cos(a),r*sin(a),-z);float weight=max(0.,dot(n,d));total+=weight;float t=isMoon>.5?hit(p+n*.003,d):moonHit(p+n*.003,d);lit+=weight*(t<0.?1.:0.);}return total>.0001?lit/total:1.;}
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float terrain(vec3 p){return .55*noise3(p*5.)+.28*noise3(p*17.)+.17*noise3(p*58.);}
void main(){
 vec2 q=(gl_FragCoord.xy*2.-resolution)/resolution.y;
 vec3 ray=normalize(forward+right*q.x*.65+up*q.y*.65);
 float angle=acos(clamp(dot(ray,sun),-1.,1.));
 float t=hit(eye,ray),isMoon=0.;if(nova>.5){float m=moonHit(eye,ray);if(m>0.&&(t<0.||m<t)){t=m;isMoon=1.;}}vec3 color=vec3(.0005,.0008,.0015);
 vec3 grid=ray*420.;float h=hash(floor(grid));
 float star=step(.9986,h)*pow(max(0.,1.-length(fract(grid)-.5)*2.),8.);
 color+=vec3(.65,.75,1.)*star*2.;
 if(nova>.5)color=env(ray)+vec3(.65,.75,1.)*star*2.;else if(angle<radius)color=vec3(70.,65.,54.);
 if(t>0.){
  vec3 p=eye+ray*t;float e=.002;
  vec3 n=normalize(vec3(rock(p+vec3(e,0,0))-rock(p-vec3(e,0,0)),rock(p+vec3(0,e,0))-rock(p-vec3(0,e,0)),rock(p+vec3(0,0,e))-rock(p-vec3(0,0,e))));
  if(isMoon>.5)n=normalize(p-vec3(.25,.22,-1.55));
  float grain=terrain(p);
  vec3 bump=vec3(terrain(p+vec3(.008,0,0))-grain,terrain(p+vec3(0,.008,0))-grain,terrain(p+vec3(0,0,.008))-grain);
  if(nova<.5)n=normalize(n-(bump-n*dot(n,bump))*6.);
  vec3 albedo=mix(vec3(.16,.14,.12),vec3(.36,.32,.26),grain);
  float diffuse=max(0.,dot(n,sun));float shadow=hit(p+n*.012,sun)<0.?1.:.05;
  color=albedo*(vec3(.025,.033,.046)+vec3(5.5,5.1,4.4)*diffuse*shadow);
  if(nova>.5){albedo=isMoon>.5?vec3(.3,.21,.12):vec3(.28,.3,.32);color=albedo*(diffuseEnv(n)+sourceIrradiance(dot(n,sun))*(nova>1.5?shadowDisk(p,n,isMoon):1.))/3.14159265;}
 }
 // The lens veil is after scene occlusion; exposed starlight can wash over rock.
 float glow=exp(-angle*angle/.0035)*1.2+exp(-angle*angle/.05)*.12;
 float alignment=pow(max(0.,dot(forward,sun)),4.);
 if(nova<.5)color+=strength*visibility*vec3(1.,.94,.81)*(glow+.004*alignment);
 color=vec3(1.)-exp(-color*exposure);
 gl_FragColor=vec4(pow(color,vec3(1./2.2)),1.);
}`));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS)){status.textContent=gl.getProgramInfoLog(program);return;}
    gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const location=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
    const novaEnabled=input('nova'),novaPhase=input('nova-phase'),novaPlay=input('nova-play'),novaShadows=input('nova-shadows');
    const floatTextures=gl.getExtension('OES_texture_float');
    const novaCache=/** @type {{texture:WebGLTexture|null,sh:Float32Array,profile:ReturnType<typeof novaProfile>}[]} */([]);
    if(floatTextures){for(let i=0;i<7;i++){
        const baked=novaBake(i/6),texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,baked.width,baked.height,0,gl.RGB,gl.FLOAT,baked.pixels);novaCache.push({texture,sh:baked.sh,profile:baked.profile});
    }}else{novaEnabled.disabled=true;const warning=element('nova-note');warning.textContent='HDR test unavailable: this WebGL context lacks float textures. Original star study remains available.';}
    const cosineValues=new Float32Array(256*7*3);
    if(floatTextures){for(let row=0;row<7;row++)for(let x=0;x<256;x++){
        const profile=novaProfile(row/6),value=novaIrradiance(row/6,x/255*2-1,512);
        for(let c=0;c<3;c++)cosineValues[(row*256+x)*3+c]=value*profile.color[c];
    }
    const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,256,7,0,gl.RGB,gl.FLOAT,cosineValues);gl.uniform1i(gl.getUniformLocation(program,'novaCosine'),2);}
    const shValues=new Float32Array(27);let novaTime=0;
    const sun=glareUnit([0,0,-1]);let orbit=.245,elevation=0,lookX=0,lookY=0,exposure=1,last=0,drag=false,px=0,py=0;
    /** @param {number} angle */function preset(angle){orbit=angle;elevation=lookX=lookY=0;input('sweep').checked=false;}
    novaEnabled.onchange=()=>{input('radius').disabled=novaEnabled.checked;if(novaEnabled.checked)preset(Math.PI-.45);};
    novaPhase.oninput=()=>{novaTime=Number(novaPhase.value);novaPlay.checked=false;};
    element('glare-eclipse').onclick=()=>preset(0);element('glare-limb').onclick=()=>preset(.245);element('glare-clear').onclick=()=>preset(.42);element('glare-lit').onclick=()=>preset(Math.PI);
    canvas.onpointerdown=e=>{drag=true;px=e.clientX;py=e.clientY;canvas.setPointerCapture(e.pointerId);};
    canvas.onpointermove=e=>{if(!drag)return;input('sweep').checked=false;const dx=(e.clientX-px)*.004,dy=(e.clientY-py)*.004;if(e.shiftKey){lookX-=dx;lookY=Math.max(-1.2,Math.min(1.2,lookY+dy));}else{orbit-=dx;elevation=Math.max(-1.2,Math.min(1.2,elevation+dy));}px=e.clientX;py=e.clientY;};
    canvas.onpointerup=canvas.onpointercancel=()=>{drag=false;};
    canvas.onwheel=e=>{e.preventDefault();input('distance').value=String(Math.max(2.2,Math.min(10,Number(input('distance').value)+e.deltaY*.005)));};
    canvas.onkeydown=e=>{if(e.key.startsWith('Arrow')){e.preventDefault();if(e.key==='ArrowLeft')orbit-=.025;if(e.key==='ArrowRight')orbit+=.025;if(e.key==='ArrowUp')elevation=Math.min(1.2,elevation+.025);if(e.key==='ArrowDown')elevation=Math.max(-1.2,elevation-.025);}};
    /** @param {number} now */function frame(now){
        if(!gl)return;requestAnimationFrame(frame);const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(document.hidden)return;
        if(novaPlay.checked&&novaEnabled.checked){novaTime=Math.min(1,novaTime+dt/18);novaPhase.value=String(novaTime);if(novaTime===1)novaPlay.checked=false;}
        if(input('sweep').checked)orbit=.24+Math.sin(now*.00022)*.16;
        const distance=Number(input('distance').value),eye=[distance*Math.sin(orbit)*Math.cos(elevation),distance*Math.sin(elevation),distance*Math.cos(orbit)*Math.cos(elevation)];
        let f=glareUnit(eye.map(v=>-v)),r=glareUnit(glareCross(f,[0,1,0])),u=glareCross(r,f);
        f=glareUnit(f.map((v,k)=>v+r[k]*Math.tan(lookX)+u[k]*Math.tan(lookY)));r=glareUnit(glareCross(f,[0,1,0]));u=glareCross(r,f);
        const novaActive=novaEnabled.checked&&novaCache.length>0,phase=Number(novaPhase.value),slot=phase*6,low=Math.min(5,Math.floor(slot)),blend=slot-low;
        if(novaActive){for(let c=0;c<27;c++)shValues[c]=novaCache[low].sh[c]*(1-blend)+novaCache[low+1].sh[c]*blend;
            gl.uniform3fv(gl.getUniformLocation(program,'irradiance[0]'),shValues);
            gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,novaCache[low].texture);gl.uniform1i(gl.getUniformLocation(program,'novaA'),0);
            gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,novaCache[low+1].texture);gl.uniform1i(gl.getUniformLocation(program,'novaB'),1);}
        gl.uniform1f(gl.getUniformLocation(program,'nova'),novaActive?(novaShadows.checked?2:1):0);gl.uniform1f(gl.getUniformLocation(program,'novaBlend'),blend);gl.uniform1f(gl.getUniformLocation(program,'novaSlot'),slot);
        const radius=novaActive?novaProfile(phase).radius:Number(input('radius').value)*Math.PI/360,visible=glareVisibility(eye,sun,radius,novaActive),facing=Math.max(0,glareDot(f,sun));
        const target=input('adapt').checked?1.9/(1+visible*Math.pow(facing,12)*9):1;
        exposure=glareExposure(exposure,target,dt);
        const scale=Math.min(window.devicePixelRatio||1,1.25)*.8,w=Math.max(1,Math.floor(innerWidth*scale)),h=Math.max(1,Math.floor(innerHeight*scale));
        if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
        gl.uniform2f(gl.getUniformLocation(program,'resolution'),w,h);
        for(const pair of [['eye',eye],['forward',f],['right',r],['up',u],['sun',sun]])gl.uniform3fv(gl.getUniformLocation(program,/** @type {string} */(pair[0])),/** @type {number[]} */(pair[1]));
        for(const pair of [['radius',radius],['visibility',visible],['exposure',exposure],['strength',input('effects').checked?Number(input('strength').value):0]])gl.uniform1f(gl.getUniformLocation(program,/** @type {string} */(pair[0])),/** @type {number} */(pair[1]));
        gl.drawArrays(gl.TRIANGLES,0,6);status.textContent='Star visible '+Math.round(visible*100)+'% / exposure '+exposure.toFixed(2)+'×'+(novaActive?' / HDR stage '+phase.toFixed(2)+' / '+(novaShadows.checked?'32 shadow samples':'cached lighting only'):'')+'\nOrbit '+(orbit*180/Math.PI).toFixed(1)+'° / drag or arrow keys';
    }requestAnimationFrame(frame);
}());
