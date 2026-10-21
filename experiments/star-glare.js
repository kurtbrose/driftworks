'use strict';
/** @param {number[]} a @param {number[]} b */
function glareDot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
/** @param {number[]} a */
function glareUnit(a){const d=Math.hypot(...a);return a.map(v=>v/d);}
/** @param {number[]} a @param {number[]} b */
function glareCross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
/** @param {number[]} p */
function glareRock(p){const n=glareUnit(p);return Math.hypot(...p)-(1+0.065*Math.sin(n[0]*7+1)*Math.sin(n[1]*6+2)*Math.sin(n[2]*8)+0.025*Math.sin(n[0]*19+n[2]*11)*Math.sin(n[1]*17));}
/** @param {number[]} origin @param {number[]} ray */
function glareHit(origin,ray){let t=0;for(let i=0;i<100&&t<14;i++){const d=glareRock(origin.map((v,k)=>v+ray[k]*t));if(d<0.0015)return t;t+=Math.max(0.002,d*0.55);}return -1;}
/** @param {number[]} eye @param {number[]} sun @param {number} radius */
function glareVisibility(eye,sun,radius){
    const right=glareUnit(glareCross(sun,[0,1,0])),up=glareCross(right,sun);let visible=0;
    for(let i=0;i<97;i++){const r=Math.sqrt((i+0.5)/97)*Math.tan(radius),a=i*2.39996323;
        const ray=glareUnit(sun.map((v,k)=>v+r*(Math.cos(a)*right[k]+Math.sin(a)*up[k])));
        if(glareHit(eye,ray)<0)visible++;
    }return visible/97;
}
/** @param {number} current @param {number} target @param {number} dt */
function glareExposure(current,target,dt){return current+(target-current)*(1-Math.exp(-Math.max(0,Math.min(dt,.1))/(target<current?.28:1.6)));}

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
uniform float radius,visibility,exposure,strength;
float rock(vec3 p){vec3 n=normalize(p);return length(p)-(1.+.065*sin(n.x*7.+1.)*sin(n.y*6.+2.)*sin(n.z*8.)+.025*sin(n.x*19.+n.z*11.)*sin(n.y*17.));}
float hit(vec3 o,vec3 d){float t=0.;for(int i=0;i<100;i++){float h=rock(o+d*t);if(h<.0015)return t;t+=max(.002,h*.55);if(t>14.)break;}return -1.;}
float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
void main(){
 vec2 q=(gl_FragCoord.xy*2.-resolution)/resolution.y;
 vec3 ray=normalize(forward+right*q.x*.65+up*q.y*.65);
 float angle=acos(clamp(dot(ray,sun),-1.,1.));
 float t=hit(eye,ray);vec3 color=vec3(.0005,.0008,.0015);
 vec3 grid=ray*420.;float h=hash(floor(grid));
 float star=step(.9986,h)*pow(max(0.,1.-length(fract(grid)-.5)*2.),8.);
 color+=vec3(.65,.75,1.)*star*2.;
 if(angle<radius)color=vec3(70.,65.,54.);
 if(t>0.){
  vec3 p=eye+ray*t;float e=.002;
  vec3 n=normalize(vec3(rock(p+vec3(e,0,0))-rock(p-vec3(e,0,0)),rock(p+vec3(0,e,0))-rock(p-vec3(0,e,0)),rock(p+vec3(0,0,e))-rock(p-vec3(0,0,e))));
  float grain=.5+.5*sin(p.x*84.+sin(p.z*51.))*sin(p.y*73.+p.z*31.);
  vec3 albedo=mix(vec3(.16,.14,.12),vec3(.36,.32,.26),grain);
  float diffuse=max(0.,dot(n,sun));float shadow=hit(p+n*.012,sun)<0.?1.:.05;
  color=albedo*(vec3(.014,.019,.028)+vec3(5.5,5.1,4.4)*diffuse*shadow);
 }
 // The lens veil is after scene occlusion; exposed starlight can wash over rock.
 float glow=exp(-angle*angle/.0035)*1.2+exp(-angle*angle/.05)*.12;
 float alignment=pow(max(0.,dot(forward,sun)),4.);
 color+=strength*visibility*vec3(1.,.94,.81)*(glow+.045*alignment);
 color=vec3(1.)-exp(-color*exposure);
 gl_FragColor=vec4(pow(color,vec3(1./2.2)),1.);
}`));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS)){status.textContent=gl.getProgramInfoLog(program);return;}
    gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    const location=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,2,gl.FLOAT,false,0,0);
    const sun=glareUnit([0,0,-1]);let orbit=.245,elevation=0,lookX=0,lookY=0,exposure=1,last=0,drag=false,px=0,py=0;
    /** @param {number} angle */function preset(angle){orbit=angle;elevation=lookX=lookY=0;input('sweep').checked=false;}
    element('glare-eclipse').onclick=()=>preset(0);element('glare-limb').onclick=()=>preset(.245);element('glare-clear').onclick=()=>preset(.42);element('glare-lit').onclick=()=>preset(Math.PI);
    canvas.onpointerdown=e=>{drag=true;px=e.clientX;py=e.clientY;canvas.setPointerCapture(e.pointerId);};
    canvas.onpointermove=e=>{if(!drag)return;input('sweep').checked=false;const dx=(e.clientX-px)*.004,dy=(e.clientY-py)*.004;if(e.shiftKey){lookX-=dx;lookY=Math.max(-1.2,Math.min(1.2,lookY+dy));}else{orbit-=dx;elevation=Math.max(-1.2,Math.min(1.2,elevation+dy));}px=e.clientX;py=e.clientY;};
    canvas.onpointerup=canvas.onpointercancel=()=>{drag=false;};
    canvas.onwheel=e=>{e.preventDefault();input('distance').value=String(Math.max(2.2,Math.min(10,Number(input('distance').value)+e.deltaY*.005)));};
    canvas.onkeydown=e=>{if(e.key.startsWith('Arrow')){e.preventDefault();if(e.key==='ArrowLeft')orbit-=.025;if(e.key==='ArrowRight')orbit+=.025;if(e.key==='ArrowUp')elevation=Math.min(1.2,elevation+.025);if(e.key==='ArrowDown')elevation=Math.max(-1.2,elevation-.025);}};
    /** @param {number} now */function frame(now){
        if(!gl)return;requestAnimationFrame(frame);const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(document.hidden)return;
        if(input('sweep').checked)orbit=.24+Math.sin(now*.00022)*.16;
        const distance=Number(input('distance').value),eye=[distance*Math.sin(orbit)*Math.cos(elevation),distance*Math.sin(elevation),distance*Math.cos(orbit)*Math.cos(elevation)];
        let f=glareUnit(eye.map(v=>-v)),r=glareUnit(glareCross(f,[0,1,0])),u=glareCross(r,f);
        f=glareUnit(f.map((v,k)=>v+r[k]*Math.tan(lookX)+u[k]*Math.tan(lookY)));r=glareUnit(glareCross(f,[0,1,0]));u=glareCross(r,f);
        const radius=Number(input('radius').value)*Math.PI/360,visible=glareVisibility(eye,sun,radius),facing=Math.max(0,glareDot(f,sun));
        const target=input('adapt').checked?1.9/(1+visible*Math.pow(facing,12)*9):1;
        exposure=glareExposure(exposure,target,dt);
        const scale=Math.min(window.devicePixelRatio||1,1.25)*.8,w=Math.max(1,Math.floor(innerWidth*scale)),h=Math.max(1,Math.floor(innerHeight*scale));
        if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
        gl.uniform2f(gl.getUniformLocation(program,'resolution'),w,h);
        for(const pair of [['eye',eye],['forward',f],['right',r],['up',u],['sun',sun]])gl.uniform3fv(gl.getUniformLocation(program,/** @type {string} */(pair[0])),/** @type {number[]} */(pair[1]));
        for(const pair of [['radius',radius],['visibility',visible],['exposure',exposure],['strength',input('effects').checked?Number(input('strength').value):0]])gl.uniform1f(gl.getUniformLocation(program,/** @type {string} */(pair[0])),/** @type {number} */(pair[1]));
        gl.drawArrays(gl.TRIANGLES,0,6);status.textContent='Star visible '+Math.round(visible*100)+'% / exposure '+exposure.toFixed(2)+'×\nOrbit '+(orbit*180/Math.PI).toFixed(1)+'° / drag or arrow keys';
    }requestAnimationFrame(frame);
}());
