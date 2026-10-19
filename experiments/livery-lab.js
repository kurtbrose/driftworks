import {fighterHull, fleetHull} from './livery-fixtures.js';
const DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
/** @param {string} id */
function control(id){const el=document.getElementById(id);if(!el)throw Error(id);return /** @type {HTMLInputElement} */(el);}
const canvas=/** @type {HTMLCanvasElement} */(document.getElementById('canvas'));
const context=canvas.getContext('webgl',{antialias:true});
if(!context)throw Error('WebGL is required for the livery lab');
const gl=context;
gl.getExtension('OES_standard_derivatives');
const vertex=`attribute vec3 position,normal;attribute vec2 texcoord;varying vec2 sourceUV;attribute vec4 protectedColor;varying vec4 protection;uniform vec3 right,up,back;uniform vec3 origin;uniform float aspect,distance;varying vec3 p,n;
void main(){sourceUV=texcoord;protection=protectedColor;p=position;n=normal;vec3 q=vec3(dot(p+origin,right),dot(p+origin,up),distance-dot(p+origin,back));gl_Position=vec4(q.x*2.414/aspect,q.y*2.414,q.z*.999-.02,q.z);}`;
const fragment=`#extension GL_OES_standard_derivatives : enable
precision highp float;uniform sampler2D sourceTexture;uniform float hasTexture,sourceBlend;varying vec2 sourceUV;varying vec4 protection;varying vec3 p,n;uniform vec3 primary,secondary,accent;uniform float grammar,density,relief,wear,seed,split;uniform vec3 eye;
float hash(vec2 a){return fract(sin(dot(a,vec2(127.1,311.7))+seed)*43758.5453);}
float line(float x,float w){return 1.-smoothstep(w,w+fwidth(x),abs(x));}
vec4 surface(vec2 uv,float g){
 vec2 q=uv*density;if(g==3.)q*=vec2(.45,1.8);if(g==4.)q*=2.6;if(g==1.)q*=.65;
 if(g==6.)q.x+=q.y*.35+floor(q.y)*.2;
 vec2 cell=floor(q),f=fract(q),edge=min(f,1.-f);float id=hash(cell);
 float gap=1.-smoothstep(.018,.035,min(edge.x,edge.y));
 float border=1.-smoothstep(.035,.10,min(edge.x,edge.y));
 float stripe=step(.74,fract(p.y*1.3+.07));
 vec3 color=mix(primary,secondary,step(.79,id)*.55);float h=0.;
 if(g==1.){color=mix(primary,secondary,step(.94,id)*.7);color=mix(color,secondary,gap*.65);color=mix(color,accent,stripe*.65*step(.72,p.x));h=border*.12;}
 if(g==2.){color*=.84+id*.22;color=mix(color,secondary,gap);h=(1.-border)*(.3+id*.6);color=mix(color,accent,step(.87,id)*(1.-gap));}
 if(g==3.){float ribs=line(f.y-.5,.065);color=mix(secondary,primary,(1.-gap)*.85);color=mix(color,accent,ribs*.65);h=ribs*.9+(1.-border)*.25;}
 if(g==4.){float ceramic=step(0.,p.z+.15);color=mix(secondary,primary,ceramic);color*=.82+id*.22;color=mix(color,secondary,gap*.8);float quilt=sin(f.x*3.14159)*sin(f.y*3.14159);h=quilt*.5; color=mix(color,accent,step(.93,id)*ceramic*.55);}
 if(g==5.){color=mix(color,secondary,gap);float hatch=step(.68,id)*step(.23,f.x)*step(f.x,.77)*step(.22,f.y)*step(f.y,.78);color=mix(color,secondary,hatch*.8);float hazard=step(.5,fract((q.x+q.y)*6.));color=mix(color,mix(secondary,accent,hazard),step(.94,id));h=border*.2+hatch*.3;}
 if(g==6.){color=mix(secondary,primary,.25+id*.45);color=mix(color,secondary,gap);color=mix(color,accent,step(.98,id)*step(.5,f.x));h=(1.-border)*(.2+abs(f.x-f.y)*.45);color*=.9+step(f.x,f.y)*.1;}
 float bolt=1.-smoothstep(.022,.04,length(f-vec2(.12)));if(g==5.||g==2.)color=mix(color,secondary,bolt);
 float scratches=step(.975,hash(floor(uv*800.)))*wear; color=mix(color,secondary,scratches*.6+border*wear*.18);
 return vec4(color,h);
}
void main(){
 vec3 N=normalize(n),weights=pow(abs(N),vec3(8.));weights/=weights.x+weights.y+weights.z;
 float g=grammar;if(split>0.&&gl_FragCoord.x<split)g=0.;
 vec4 sampleColor=surface(p.yz,g)*weights.x+surface(p.xz,g)*weights.y+surface(p.xy,g)*weights.z;
 vec3 color=sampleColor.rgb;float h=sampleColor.a;
 vec3 dp1=dFdx(p),dp2=dFdy(p);vec3 R1=cross(dp2,N),R2=cross(N,dp1);float det=dot(dp1,R1);vec3 grad=(dFdx(h)*R1+dFdy(h)*R2)/(abs(det)+.000001)*sign(det);
 if(g==0.){color=vec3(.48,.51,.53);grad=vec3(0.);}
 if(hasTexture>.5){vec3 source=texture2D(sourceTexture,sourceUV).rgb;
  float dark=1.-smoothstep(.12,.3,max(source.r,max(source.g,source.b)));
  color=g==0.?source:mix(color,source,max(sourceBlend,dark));
  if(g==0.)grad=vec3(0.);
 }
 if(protection.a>.5){color=protection.rgb;grad=vec3(0.);}
 N=normalize(N-grad*relief*.018);float light=max(0.,dot(N,normalize(vec3(-.6,-.4,1.))));float rim=pow(1.-abs(dot(N,normalize(eye-p))),3.);
 color=color*(.25+light*.9)+vec3(.12,.19,.23)*rim;
 gl_FragColor=vec4(pow(color,vec3(.85)),1.);
}`;
/** @param {number} type @param {string} source */
function shader(type,source){const s=gl.createShader(type);if(!s)throw Error('Shader allocation');gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Shader compilation');return s;}
const program=gl.createProgram();if(!program)throw Error('Program allocation');
gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Shader link');gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
['position','normal'].forEach((name,i)=>{const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,48,i*12);});
const protectionLocation=gl.getAttribLocation(program,'protectedColor');gl.enableVertexAttribArray(protectionLocation);gl.vertexAttribPointer(protectionLocation,4,gl.FLOAT,false,48,24);
const uvLocation=gl.getAttribLocation(program,'texcoord');gl.enableVertexAttribArray(uvLocation);gl.vertexAttribPointer(uvLocation,2,gl.FLOAT,false,48,40);
/** @param {string} name */
function uniform(name){return gl.getUniformLocation(program,name);}
/** @param {string} name @param {number} value */
function scalar(name,value){gl.uniform1f(uniform(name),value);}
/** @param {string} name @param {number[]} value */
function vector(name,value){gl.uniform3fv(uniform(name),value);}
const sky=DW.flightSkybox.create(control('viewer'));
/** @type {{start:number,count:number,origin:number[],label:HTMLDivElement|null,texture:WebGLTexture|null}[]} */
let actors=[];
let count=0,yaw=.22,tilt=.75,distance=28,assemblySeed=1;
const artistModels=(DW.shipPacks||[]).flatMap(pack=>pack.models).filter(model=>model.texturedVertices);
const artistIds=artistModels.map(model=>model.id);
const artistGroup=document.createElement('optgroup');artistGroup.label='Artist ships / Quaternius';
artistModels.forEach(model=>{const option=document.createElement('option');option.value=model.id;option.textContent=model.name+' / Quaternius';artistGroup.append(option);});control('subject').append(artistGroup);
/** @type {Map<string,HTMLImageElement>} */let sourceImages=new Map();
/** @type {WeakMap<HTMLImageElement,WebGLTexture>} */const textures=new WeakMap();
/** @param {HTMLImageElement|undefined} image */
function textureFor(image){if(!image)return null;const cached=textures.get(image);if(cached)return cached;const texture=gl.createTexture();if(!texture)throw Error('Texture allocation');gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,0);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);textures.set(image,texture);return texture;}
function hangarSubjects(){const studies=['cube','sphere','cylinder','random','escort','A','B','C','D','E','fighter','carrier','patrol','tug','mothership'];return control('collection').value==='artists'?artistIds:control('collection').value==='studies'?studies:studies.concat(artistIds);}
function home(){const rows=Math.ceil(hangarSubjects().length/5);distance=control('layout').value==='hangar'?Math.max(23,rows*6,24*canvas.clientHeight/canvas.clientWidth):3.7;}


/** Geometry fixtures use meters; only this display copy is normalized. @param {string} subject */
/** @param {string} subject @returns {{vertices:Float32Array,color?:number[],opacity?:number,stride?:number,texture?:HTMLImageElement}[]} */
function geometry(subject){
 if(artistIds.includes(subject)){const entry=DW.shipPackModels.find(subject);if(!entry)throw Error('Missing artist hull '+subject);return [DW.shipPackModels.sourceGeometry(entry.model,[{eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]}],1,sourceImages.get(subject))];}

 if(/^[A-E]$/.test(subject))return fighterHull(subject);
 if(['fighter','carrier','patrol'].includes(subject))return fleetHull(subject,0,0,1);
 if(subject==='mothership'){const api=DW.scene3d,groups=api.mothershipHardware(1);return [{vertices:api.habitatMesh(192)},...Object.entries(groups).map(([key,v])=>({vertices:new Float32Array(v),color:key==='dark'?[.12,.16,.18]:key==='light'?[.64,.93,.89]:undefined}))];}
 const groups={hull:/** @type {number[]} */([])},mesh=DW.meshBuilder.create(groups);
 if(subject==='sphere'){
  /** @param {number} lat @param {number} lon */
  function point(lat,lon){return [Math.cos(lat)*Math.cos(lon)*5,Math.cos(lat)*Math.sin(lon)*5,Math.sin(lat)*5];}
  for(let j=0;j<32;j++)for(let i=0;i<64;i++){let a=-Math.PI/2+j*Math.PI/32,b=a+Math.PI/32,c=i*Math.PI/32,d=c+Math.PI/32;const quad=[point(a,c),point(a,d),point(b,d),point(b,c)];if(j===0)mesh.plate('hull',[quad[0],quad[2],quad[3]]);else if(j===31)mesh.plate('hull',[quad[0],quad[1],quad[2]]);else mesh.plate('hull',quad);}
  for(let i=0;i<groups.hull.length;i+=6){const l=Math.hypot(...groups.hull.slice(i,i+3));for(let k=0;k<3;k++)groups.hull[i+3+k]=groups.hull[i+k]/l;}
 }else if(subject==='cylinder'){
  // Dense barrel rather than the intentionally eight-sided mechanical joint helper.
  for(let i=0;i<96;i++){const a=i*Math.PI/48,b=(i+1)*Math.PI/48;const v=[[Math.cos(a)*4,-6,Math.sin(a)*4],[Math.cos(b)*4,-6,Math.sin(b)*4],[Math.cos(b)*4,6,Math.sin(b)*4],[Math.cos(a)*4,6,Math.sin(a)*4]];mesh.plate('hull',v);mesh.plate('hull',[[0,-6,0],v[1],v[0]]);mesh.plate('hull',[[0,6,0],v[3],v[2]]);}
 }else if(subject==='random'){
  let state=assemblySeed;function random(){state=(state*1664525+1013904223)>>>0;return state/4294967296;}
  mesh.block('hull',[0,0,0],[2,7,1]);for(let i=0;i<12;i++){const x=(random()-.5)*6,y=(random()-.5)*12,z=(random()-.5)*2;mesh.block('hull',[x,y,z],[.7+random()*2,1+random()*3,.4+random()]);}
 }else if(subject==='escort'||subject==='tug'){mesh.block('hull',[0,0,0],[subject==='tug'?18:10,5,3]);mesh.block('hull',[0,0,5],[4,9,2]);}
 else mesh.block('hull',[0,0,0],[5,5,5]);
 return [{vertices:new Float32Array(groups.hull)}];
}
function rebuild(){
 const hangar=control('layout').value==='hangar';
 const subjects=hangar?hangarSubjects():[control('subject').value],rows=Math.ceil(subjects.length/5),halfY=rows*1.8+.9;
 const data=/** @type {number[]} */([]);actors=[];control('labels').replaceChildren();
 subjects.forEach((subject,index)=>{
  const batches=geometry(subject),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  batches.forEach(b=>{for(let i=0;i<b.vertices.length;i+=(b.stride||6))for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],b.vertices[i+k]);hi[k]=Math.max(hi[k],b.vertices[i+k]);}});
  const extent=Math.max(...hi.map((v,k)=>v-lo[k])),start=data.length/12;
  batches.forEach(b=>{for(let i=0;i<b.vertices.length;i+=(b.stride||6)){for(let k=0;k<3;k++)data.push((b.vertices[i+k]-(lo[k]+hi[k])/2)*2/extent);data.push(...b.vertices.slice(i+3,i+6));const color='color' in b&&b.color?b.color:[.5,.5,.5];const protect=('opacity' in b)||Math.max(...color)<.31;data.push(...color,protect?1:0,b.stride===8?b.vertices[i+6]:0,b.stride===8?b.vertices[i+7]:0);}});
  const origin=hangar?[(index%5-2)*3.1,(Math.floor(index/5)-(rows-1)/2)*3.6,1.15]:[0,0,0];
  const label=hangar?document.createElement('div'):null;
  if(label){label.className='hull-label';label.textContent=(/^[A-E]$/.test(subject)?'Barracuda '+subject:artistModels.find(model=>model.id===subject)?.name||subject)+' / '+extent.toFixed(1)+' m';control('labels').append(label);}
  actors.push({start,count:data.length/12-start,origin,label,texture:textureFor(batches[0].texture)});
  if(!hangar){const select=/** @type {HTMLSelectElement} */(document.getElementById('subject'));control('caption').textContent=select.selectedOptions[0].textContent+' / '+extent.toFixed(1)+' m / '+((data.length/12-start)/3).toLocaleString()+' triangles';}
 });
 if(hangar){
  const groups={deck:/** @type {number[]} */([]),rail:/** @type {number[]} */([])},mesh=DW.meshBuilder.create(groups);
  mesh.block('deck',[0,0,-.16],[8.6,halfY,.12]);
  for(let x=-8;x<=8;x++)mesh.block('rail',[x,0,-.025],[.009,halfY-.3,.006]);
  for(let y=-Math.floor(halfY);y<=Math.floor(halfY);y++)mesh.block('rail',[0,y,-.025],[8.3,.009,.006]);
  [-1,1].forEach(sign=>{mesh.block('rail',[sign*8.5,0,0],[.06,halfY,.08]);[-halfY,halfY].forEach(y=>{mesh.block('deck',[sign*8.5,y,2],[.16,.16,2.2]);});});
  const start=data.length/12;
  Object.entries(groups).forEach(([key,vertices])=>{for(let i=0;i<vertices.length;i+=6){data.push(...vertices.slice(i,i+6),...(key==='deck'?[.08,.12,.15]:[.21,.27,.29]),1,0,0);}});
  actors.push({start,count:data.length/12-start,origin:[0,0,0],label:null,texture:null});
  control('caption').textContent=subjects.length+' HULLS / SHARED TREATMENT / DISPLAY SIZES NORMALIZED';
 }
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);count=data.length/12;
}
const descriptions=['Untreated geometry for silhouette comparison.','Broad plating, sparse seams and a restrained identification band.','Overlapping plate shading, dark joints and varied armor depth.','Elongated bays with repeated structural ribs.','Fine ceramic tiles and softly quilted insulation.','Service hatches, fasteners, hazard panels and edge wear.','Staggered angular panels and subdued alternating armor.'];
function settings(){control('description').textContent=descriptions[Number(control('grammar').value)];control('scale-value').textContent=control('scale').value;control('split-label').hidden=!control('compare').checked;}
control('collection').onchange=()=>{control('layout').value='hangar';rebuild();home();};
control('layout').onchange=()=>{rebuild();home();};
control('subject').onchange=()=>{control('layout').value='solo';rebuild();home();};
['grammar','scale','relief','wear','compare'].forEach(id=>control(id).oninput=settings);
control('shuffle').onclick=()=>{assemblySeed++;control('subject').value='random';rebuild();};
let palette=0;const palettes=[['#c5cec9','#38474d','#ee912e'],['#d7dfdd','#253641','#bc3e38'],['#d18b31','#26343b','#f2d99b'],['#657264','#242e2d','#c2bc85']];
control('palette').onclick=()=>{palette=(palette+1)%palettes.length;['primary','secondary','accent'].forEach((id,i)=>control(id).value=palettes[palette][i]);};
control('quarter').onclick=()=>{yaw=.22;tilt=.75;home();};control('top').onclick=()=>{yaw=0;tilt=.02;};control('side').onclick=()=>{yaw=Math.PI/2;tilt=Math.PI/2;};
control('reset').onclick=()=>{control('grammar').value='1';control('scale').value='8';control('relief').value='55';control('wear').value='20';control('seed').value='17';control('source-blend').value='0';control('compare').checked=false;control('spin').checked=false;palette=0;['primary','secondary','accent'].forEach((id,i)=>control(id).value=palettes[0][i]);yaw=.22;tilt=.75;home();settings();};
let dragging=false,lastX=0,lastY=0;
canvas.onpointerdown=/** @param {PointerEvent} e */(e)=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=/** @param {PointerEvent} e */(e)=>{if(!dragging)return;yaw-=(e.clientX-lastX)*.008;tilt=Math.max(.02,Math.min(Math.PI-.02,tilt+(e.clientY-lastY)*.008));lastX=e.clientX;lastY=e.clientY;};
canvas.onpointerup=canvas.onpointercancel=()=>{dragging=false;};
canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(control('layout').value==='hangar'?8:1.6,Math.min(50,distance*Math.exp(e.deltaY*.001)));},{passive:false});
DW.shipPackModels.loadTextures().then(images=>{sourceImages=images;rebuild();}).catch(/** @param {unknown} error */(error)=>{control('caption').textContent='Artist texture load failed: '+String(error);});
rebuild();home();settings();gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
let last=0;
/** @param {number} now */
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;if(document.hidden)return;if(control('spin').checked)yaw+=dt*.22;
 const ratio=Math.min(devicePixelRatio,2),w=Math.round(canvas.clientWidth*ratio),h=Math.round(canvas.clientHeight*ratio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const s=Math.sin(yaw),c=Math.cos(yaw),st=Math.sin(tilt),ct=Math.cos(tilt),back=[-s*st,c*st,ct];
 sky.render({eye:[0,0,0],right:[c,s,0],up:[s*ct,-c*ct,st],back},1,!control('sky').checked);vector('right',[c,s,0]);vector('up',[s*ct,-c*ct,st]);vector('back',back);vector('eye',back.map(v=>v*distance));scalar('aspect',w/h);scalar('distance',distance);
 ['primary','secondary','accent'].forEach(id=>{const hex=control(id).value;vector(id,[1,3,5].map(k=>parseInt(hex.slice(k,k+2),16)/255));});
 scalar('grammar',Number(control('grammar').value));scalar('density',Number(control('scale').value));scalar('relief',Number(control('relief').value)/100);scalar('wear',Number(control('wear').value)/100);scalar('seed',Number(control('seed').value)||0);scalar('split',control('compare').checked?w/2:0);scalar('sourceBlend',Number(control('source-blend').value)/100);gl.uniform1i(uniform('sourceTexture'),0);actors.forEach(actor=>{gl.bindTexture(gl.TEXTURE_2D,actor.texture);scalar('hasTexture',actor.texture?1:0);vector('origin',actor.origin);gl.drawArrays(gl.TRIANGLES,actor.start,actor.count);
  if(actor.label){const o=actor.origin,x=o[0]*c+o[1]*s,y=o[0]*s*ct-o[1]*c*ct+(o[2]-1.25)*st,z=distance-(o[0]*back[0]+o[1]*back[1]+(o[2]-1.25)*back[2]);actor.label.style.left=(.5+x*2.414/(w/h)/z*.5)*100+'%';actor.label.style.top=(.5-y*2.414/z*.5)*100+'%';actor.label.hidden=z<=0;}
 });
}
requestAnimationFrame(frame);
