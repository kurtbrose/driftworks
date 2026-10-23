import {gasGiantCells,gasGiantFlash,gasGiantDrift} from './gas-giant-weather.js';
const assetUrl=/** @type {(value:string)=>string} */(window.Driftworks.assetUrl);
/** @param {string} id */
function element(id){const e=document.getElementById(id);if(!e)throw new Error(id);return e;}
const canvas=/** @type {HTMLCanvasElement} */(element('sky'));
const gl=canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false});
if(!gl)throw new Error('WebGL required');
/** @param {number} type @param {string} source */
function shader(type,source){
    if(!gl)throw new Error('WebGL unavailable');
    const s=gl.createShader(type);if(!s)throw new Error('Shader allocation failed');
    gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)||'Shader failed');return s;
}
const program=gl.createProgram();if(!program)throw new Error('Program allocation failed');
gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 position;varying vec2 screen;void main(){screen=position;gl_Position=vec4(position,0.,1.);}'));
gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision highp float;
varying vec2 screen;uniform samplerCube darkSky,litSky;uniform float aspect,focal,yaw,pitch;
uniform vec4 cells[8];uniform float flashes[8];uniform vec2 drift[8];
uniform vec3 palettePale,paletteBelt;uniform float paletteAmount;
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
void main(){
 vec3 ray=normalize(vec3(screen.x*aspect/focal,1.,screen.y/focal));
 float c=cos(pitch),s=sin(pitch);ray=vec3(ray.x,ray.y*c-ray.z*s,ray.y*s+ray.z*c);
 c=cos(yaw);s=sin(yaw);ray=vec3(ray.x*c+ray.y*s,ray.y*c-ray.x*s,ray.z);
 // Recipe: yaw 90, pitch 0, roll 0, square card, width 110 degrees.
 vec2 uv=vec2(.5-ray.x/max(ray.y,.00001)/2.856296,.5-ray.z/max(ray.y,.00001)/2.856296);
 vec3 base=gasLimbSample(darkSky,ray,uv);
 vec3 emission=vec3(0.);
 if(ray.y>0.)for(int i=0;i<8;i++){
  vec2 sourceUV=uv-drift[i];float d=length((sourceUV-cells[i].xy)/cells[i].zw);
  float a=(1.-smoothstep(.48,1.,d))*flashes[i];
  if(a>.001){
   vec3 sourceRay=normalize(vec3((.5-sourceUV.x)*2.856296,1.,(.5-sourceUV.y)*2.856296));
   // Transfer only the light difference. Translating the lit plate itself would
   // slide the gas bands; the frozen dark sky continues to own all geography.
   vec3 light=max(vec3(0.),textureCube(litSky,sourceRay).rgb-textureCube(darkSky,sourceRay).rgb);
   emission=max(emission,light*a);
  }
 }
 // Recolor only reflected cloud light. Preserve luminance and leave lightning
 // emission separate, so every palette keeps the same night-side exposure.
 float luminance=dot(base,vec3(.2126,.7152,.0722));
 float belt=clamp((base.r-base.b)/max(luminance,.01)*1.8+.18,0.,1.);
 vec3 tint=mix(palettePale,paletteBelt,belt);
 vec3 colored=luminance*tint/max(dot(tint,vec3(.2126,.7152,.0722)),.001);
 float peak=max(colored.r,max(colored.g,colored.b));
 colored=vec3(luminance)+(colored-vec3(luminance))*min(1.,(1.-luminance)/max(peak-luminance,.001));
 base=mix(base,colored,paletteAmount);
 gl_FragColor=vec4(min(vec3(1.),base+emission),1.);
}`));
gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||'Link failed');gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
/** @param {string} name */const uniform=name=>gl.getUniformLocation(program,name);
const locations={aspect:uniform('aspect'),focal:uniform('focal'),yaw:uniform('yaw'),pitch:uniform('pitch'),flashes:uniform('flashes[0]'),drift:uniform('drift[0]')};
gl.uniform4fv(uniform('cells[0]'),new Float32Array(gasGiantCells.flat()));
gl.uniform1i(uniform('darkSky'),0);gl.uniform1i(uniform('litSky'),1);
/** @param {string} stage @param {number} unit */
async function loadCube(stage,unit){
    if(!gl)throw new Error('WebGL unavailable');
    const images=await Promise.all(['px','nx','py','ny','pz','nz'].map(face=>new Promise(/** @param {(image:HTMLImageElement)=>void} resolve */(resolve,reject)=>{
        const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Cannot load '+stage+'/'+face));image.src=assetUrl('../assets/backgrounds/gas-giant-lightning-v1/'+stage+'/'+face+'.png');
    })));
    if(images.some(image=>image.width!==1024||image.height!==1024))throw new Error('Expected six square 1024px faces');
    const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_CUBE_MAP,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    images.forEach((image,i)=>gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+i,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image));
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
}
const fov=/** @type {HTMLInputElement} */(element('fov')),activity=/** @type {HTMLInputElement} */(element('activity')),mode=/** @type {HTMLSelectElement} */(element('mode'));
const palette=/** @type {HTMLSelectElement} */(element('palette')),colorStrength=/** @type {HTMLInputElement} */(element('color-strength'));
/** @type {Record<string,number[][]>} */
const palettes={original:[[1,1,1],[1,1,1]],cobalt:[[.65,.78,1],[.09,.22,.65]],teal:[[.74,.94,.92],[.04,.40,.39]],jade:[[.83,.90,.74],[.12,.35,.25]],lavender:[[.88,.82,.93],[.42,.27,.52]],burgundy:[[.87,.77,.76],[.44,.08,.15]]};
const paletteLocations={pale:uniform('palettePale'),belt:uniform('paletteBelt'),amount:uniform('paletteAmount')};
const reduced=matchMedia('(prefers-reduced-motion: reduce)');let playing=!reduced.matches,yaw=0,pitch=0,time=0,last=0,burst=-100,drag=false,x=0,y=0;
function playLabel(){element('play').textContent=playing?'Pause':'Play';}playLabel();
element('play').onclick=()=>{playing=!playing;playLabel();};
reduced.onchange=()=>{if(reduced.matches){playing=false;playLabel();}};
element('home').onclick=()=>{yaw=pitch=0;fov.value='110';};
element('burst').onclick=()=>{burst=time;};
canvas.onpointerdown=/** @param {PointerEvent} e */e=>{drag=true;x=e.clientX;y=e.clientY;canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=/** @param {PointerEvent} e */e=>{if(drag){yaw-=(e.clientX-x)*.004;pitch=Math.max(-Math.PI/2,Math.min(Math.PI/2,pitch+(e.clientY-y)*.004));x=e.clientX;y=e.clientY;}};
canvas.onpointerup=canvas.onpointercancel=()=>{drag=false;};
canvas.addEventListener('wheel',e=>{e.preventDefault();fov.value=String(Math.max(45,Math.min(115,Number(fov.value)+e.deltaY*.04)));},{passive:false});
window.addEventListener('keydown',e=>{if(e.code==='Space'&&e.target===document.body){e.preventDefault();playing=!playing;playLabel();}});
const weights=new Float32Array(8),offsets=new Float32Array(16);
let drawnTime=NaN,drawnYaw=NaN,drawnPitch=NaN,drawnFov='',drawnMode='',drawnBurst=NaN,statusText='',drawnPalette='',drawnStrength='';
/** @param {number} now */
function render(now){
    if(!gl)return;
    const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(playing&&!document.hidden)time+=dt*Number(activity.value);
    const ratio=Math.min(devicePixelRatio,2),w=Math.round(innerWidth*ratio),h=Math.round(innerHeight*ratio);
    const resized=canvas.width!==w||canvas.height!==h;
    if(resized){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);}
    // Pause, static comparisons and hidden tabs do not need identical GPU frames.
    const sampleTime=mode.value==='live'?time:0;
    if(!resized&&sampleTime===drawnTime&&yaw===drawnYaw&&pitch===drawnPitch&&fov.value===drawnFov&&mode.value===drawnMode&&burst===drawnBurst&&palette.value===drawnPalette&&colorStrength.value===drawnStrength){requestAnimationFrame(render);return;}
    drawnTime=sampleTime;drawnYaw=yaw;drawnPitch=pitch;drawnFov=fov.value;drawnMode=mode.value;drawnBurst=burst;
    drawnPalette=palette.value;drawnStrength=colorStrength.value;
    const colors=palettes[palette.value]||palettes.original;
    gl.uniform3fv(paletteLocations.pale,colors[0]);gl.uniform3fv(paletteLocations.belt,colors[1]);gl.uniform1f(paletteLocations.amount,palette.value==='original'?0:Number(colorStrength.value));
    for(let i=0;i<8;i++)weights[i]=mode.value==='dark'?0:mode.value==='lit'?1:Math.max(gasGiantFlash(time,i),time-burst<1.5?Math.exp(-(time-burst)*4):0);
    for(let i=0;i<8;i++){const offset=gasGiantDrift(time,i);offsets[i*2]=mode.value==='lit'?0:offset[0];offsets[i*2+1]=mode.value==='lit'?0:offset[1];}
    gl.uniform2fv(locations.drift,offsets);
    gl.uniform1fv(locations.flashes,weights);gl.uniform1f(locations.aspect,w/h);gl.uniform1f(locations.focal,Math.min(1,w/h)/Math.tan(Number(fov.value)*Math.PI/360));gl.uniform1f(locations.yaw,yaw);gl.uniform1f(locations.pitch,pitch);
    gl.drawArrays(gl.TRIANGLES,0,6);canvas.dataset.ready='true';
    const text='Six-face sky / '+weights.filter(v=>v>.1).length+' active cells';
    if(text!==statusText){statusText=text;element('status').textContent=text;}
    requestAnimationFrame(render);
}
Promise.all([loadCube('dark-cube',0),loadCube('lit-cube',1)]).then(()=>requestAnimationFrame(render)).catch(/** @param {unknown} e */e=>{element('status').textContent=e instanceof Error?e.message:String(e);});
