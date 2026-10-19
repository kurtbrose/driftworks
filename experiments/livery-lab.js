import {ART_DIRECTIONS,ART_SHADER,artVertexKey,curvatureField,chunkTreatment,treatmentSamples} from './livery-art.js';
import {perspectiveDepth} from './livery-depth.js';
import {analyzeHull,buildHullPanels} from './hull-panels.js';
import {fighterHull, fleetHull} from './livery-fixtures.js';
const DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
/** @param {string} id */
function control(id){const el=document.getElementById(id);if(!el)throw Error(id);return /** @type {HTMLInputElement} */(el);}
const canvas=/** @type {HTMLCanvasElement} */(document.getElementById('canvas'));
const context=canvas.getContext('webgl',{antialias:true});
if(!context)throw Error('WebGL is required for the livery lab');
const gl=context;
gl.getExtension('OES_standard_derivatives');
const vertex=`attribute vec3 position,normal;attribute vec2 texcoord;varying vec2 sourceUV;attribute vec4 protectedColor;varying vec4 protection;uniform vec3 right,up,back;uniform vec3 origin;uniform float aspect,distance;uniform vec2 depthProjection;varying vec3 p,n;
void main(){sourceUV=texcoord;protection=protectedColor;p=position;n=normal;vec3 q=vec3(dot(p+origin,right),dot(p+origin,up),distance-dot(p+origin,back));gl_Position=vec4(q.x*2.414/aspect,q.y*2.414,q.z*depthProjection.x-depthProjection.y,q.z);}`;
const fragment=`precision highp float;
uniform sampler2D sourceTexture;uniform float hasTexture,sourceBlend,grammar,wear,split,useMasks,monochrome;uniform vec3 primary,secondary,accent,eye;
varying vec2 sourceUV;varying vec4 protection;varying vec3 p,n;
${ART_SHADER}
void main(){
 float g=grammar;if(split>0.&&gl_FragCoord.x<split)g=0.;
 float kind=floor(protection.a+.001),edge=fract(protection.a)*5.;if(kind>1.5&&g==0.&&artStyle<.5)discard;
 vec3 N=normalize(n),color=g==0.?vec3(.48,.51,.53):secondary*.72;
 if(kind>.5&&kind<1.5&&(useMasks>.5||g==0.))color=protection.rgb;
 if(kind>1.5&&kind<2.5){color=primary*protection.r+secondary*protection.g+accent*protection.b;
  float facing=max(0.,dot(N,normalize(vec3(-.6,-.4,1.))));color=mix(color,secondary*.8,wear*.12*(1.-facing));
 }
 if(hasTexture>.5&&kind<2.5){vec3 source=texture2D(sourceTexture,sourceUV).rgb;float dark=1.-smoothstep(.12,.3,max(source.r,max(source.g,source.b)));color=g==0.?source:mix(color,source,max(sourceBlend,dark*useMasks));}
 if(kind>2.5&&kind<3.5)color=protection.rgb;
 bool art=artStyle>.5&&(kind<2.5||kind>3.5);
 if(art){color=artDirection(p,N,edge,kind);if(hasTexture>.5){vec3 source=texture2D(sourceTexture,sourceUV).rgb;float dark=1.-smoothstep(.12,.3,max(source.r,max(source.g,source.b)));color=mix(color,source,max(sourceBlend,dark*useMasks));}}
 if(monochrome>.5&&kind>3.5)discard;
 if(monochrome>.5&&kind<2.5)color=vec3(.62);
 float light=max(0.,dot(N,normalize(vec3(-.6,-.4,1.)))),rim=pow(1.-abs(dot(N,normalize(eye-p))),3.);
 color=color*(.3+light*.82)+vec3(.1,.16,.2)*rim;
 if(art&&monochrome<.5&&artFinish>.5){vec3 V=normalize(eye-p),L=normalize(vec3(-.6,-.4,1.)),H=normalize(V+L);float power=mix(100.,8.,artRoughness),spec=pow(max(0.,dot(N,H)),power)*(.07+artMetalness*.65);
  vec3 environment=mix(vec3(.09,.13,.18),vec3(.7,.75,.72),smoothstep(-.2,.8,N.z));color+=mix(vec3(1.),primary,artMetalness)*spec+environment*artMetalness*.19;
 }
 gl_FragColor=vec4(pow(max(color,vec3(0.)),vec3(.85)),1.);
}`;
/** @param {number} type @param {string} source */
function shader(type,source){const s=gl.createShader(type);if(!s)throw Error('Shader allocation');gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s)||'Shader compilation');return s;}
const program=gl.createProgram();if(!program)throw Error('Program allocation');
gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Shader link');gl.useProgram(program);
// All subjects fit inside 100 display units, including the maximum zoom-out.
gl.uniform2fv(gl.getUniformLocation(program,'depthProjection'),perspectiveDepth(.2,100));
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
/** @type {{start:number,count:number,origin:number[],label:HTMLDivElement|null,texture:WebGLTexture|null,style:number|null,recipe:import('./livery-art').ArtRecipe|null,axis:number[],range:number[],passes:{start:number,count:number,bias:number}[]}[]} */
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
function home(){if(control('layout').value==='matrix'){const size=control('directions').value==='art'?16:20;distance=Math.max(size-1,size*canvas.clientHeight/canvas.clientWidth);return;}const rows=Math.ceil(hangarSubjects().length/5);distance=control('layout').value==='hangar'?Math.max(23,rows*6,24*canvas.clientHeight/canvas.clientWidth):3.7;}


/** Geometry fixtures use meters; only this display copy is normalized. @param {string} subject */
/** @param {string} subject @returns {{vertices:Float32Array,color?:number[],opacity?:number,stride?:number,texture?:HTMLImageElement,role?:string}[]} */
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
  // Correct the calibration barrel's outward winding and normals.
  for(let i=0;i<groups.hull.length;i+=18){const b=groups.hull.slice(i+6,i+12),c=groups.hull.slice(i+12,i+18);groups.hull.splice(i+6,12,...c,...b);for(let j=0;j<3;j++)for(let k=3;k<6;k++)groups.hull[i+j*6+k]*=-1;}
 }else if(subject==='random'){
  let state=assemblySeed;function random(){state=(state*1664525+1013904223)>>>0;return state/4294967296;}
  mesh.block('hull',[0,0,0],[2,7,1]);for(let i=0;i<12;i++){const x=(random()-.5)*6,y=(random()-.5)*12,z=(random()-.5)*2;mesh.block('hull',[x,y,z],[.7+random()*2,1+random()*3,.4+random()]);}
 }else if(subject==='escort'||subject==='tug'){mesh.block('hull',[0,0,0],[subject==='tug'?18:10,5,3]);mesh.block('hull',[0,0,5],[4,9,2]);}
 else mesh.block('hull',[0,0,0],[5,5,5]);
 return [{vertices:new Float32Array(groups.hull)}];
}
/** @type {Map<string,{batches:import('./hull-panels').HullBatch[],extent:number,regions:ReturnType<typeof analyzeHull>,curvature:ReturnType<typeof curvatureField>}>} */
const hullCache=new Map();
/** @type {WeakMap<HTMLImageElement,ImageData>} */const pixels=new WeakMap();
/** @param {HTMLImageElement} image */
function eligibility(image){
 let data=pixels.get(image);if(!data){const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');if(!ctx)throw Error('Texture mask requires Canvas2D');ctx.drawImage(image,0,0);data=ctx.getImageData(0,0,c.width,c.height);pixels.set(image,data);}
 const sample=data;
 /** @param {number[]} uv */return uv=>{const x=Math.max(0,Math.min(sample.width-1,Math.floor(uv[0]*sample.width))),y=Math.max(0,Math.min(sample.height-1,Math.floor(uv[1]*sample.height))),i=(y*sample.width+x)*4,r=sample.data[i],g=sample.data[i+1],b=sample.data[i+2];return Math.max(r,g,b)>85&&!(b>r*1.3&&g>r*1.2);};
}
/** @param {string} subject */
function fittedHull(subject){
 const cacheKey=subject+(subject==='random'?':'+assemblySeed:'')+':'+(control('masks').checked&&sourceImages.has(subject)?'textured':'plain')+':masks='+control('masks').checked;const cached=hullCache.get(cacheKey);if(cached){const image=sourceImages.get(subject);if(image)cached.batches.forEach(batch=>batch.texture=image);return cached;}
 const batches=geometry(subject),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 batches.forEach(b=>{for(let i=0;i<b.vertices.length;i+=(b.stride||6))for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],b.vertices[i+k]);hi[k]=Math.max(hi[k],b.vertices[i+k]);}});
 const extent=Math.max(...hi.map((v,k)=>v-lo[k]));
 const normalized=batches.map(b=>{const vertices=new Float32Array(b.vertices),stride=b.stride||6;for(let i=0;i<vertices.length;i+=stride)for(let k=0;k<3;k++)vertices[i+k]=(vertices[i+k]-(lo[k]+hi[k])/2)*2/extent;return {...b,vertices,eligible:control('masks').checked&&b.texture?eligibility(b.texture):undefined};});
 const inference=control('masks').checked?normalized:[{vertices:new Float32Array(normalized.flatMap(b=>{const data=/** @type {number[]} */([]);for(let i=0;i<b.vertices.length;i+=(b.stride||6))data.push(...b.vertices.slice(i,i+6),b.stride===8?b.vertices[i+6]:0,b.stride===8?b.vertices[i+7]:0);return data;})),stride:8}];
 const result={batches:normalized,extent,regions:analyzeHull(inference,control('masks').checked),curvature:curvatureField(normalized)};hullCache.set(cacheKey,result);return result;
}
/** @type {Map<string,{signature:string,result:ReturnType<typeof buildHullPanels>}>} */const panelCache=new Map();
/** @type {WeakMap<import('./hull-panels').Region[],{seed:number,sample:ReturnType<typeof chunkTreatment>}>} */
const colorCache=new WeakMap();
function rebuild(){
 const matrix=control('layout').value==='matrix',hangar=control('layout').value==='hangar',artMode=control('directions').value==='art',copies=artMode?6:8,diagnosticIndex=copies-1;
 const subjects=hangar?hangarSubjects():matrix?Array.from({length:copies},()=>control('subject').value):[control('subject').value],columns=matrix?(artMode?3:4):5,rows=Math.ceil(subjects.length/columns),halfY=rows*1.8+.9,halfX=columns*1.55+.85;
 let totalRegions=0,totalPlates=0,totalDetails=0,totalSkipped=0;const data=/** @type {number[]} */([]);actors=[];control('labels').replaceChildren();
 /** @type {string[]} */const treatmentNames=['Original','Clean armored','Layered armor','Structural bays','Thermal blankets','Flush paint','Faceted military','Detected regions'];
 subjects.forEach((subject,index)=>{
  const recipe=artMode?(matrix?(index>0&&index<diagnosticIndex?ART_DIRECTIONS[index-1]:null):ART_DIRECTIONS.find(r=>r.id===Number(control('art-style').value))||ART_DIRECTIONS[0]):null;
  const style=recipe?Number(control('grammar').value):matrix?(index===diagnosticIndex?1:index===0?0:index):Number(control('grammar').value),cacheId=subject+':'+style;
  const fitted=fittedHull(subject),batches=fitted.batches,extent=fitted.extent,start=data.length/12;
  const signature=[subject==='random'?assemblySeed:0,control('masks').checked,style,control('scale').value,control('relief').value,control('seed').value,fitted.regions.length].join('|'),previous=panelCache.get(cacheId);
  const structure=previous?.signature===signature?previous.result:buildHullPanels(batches,{style,divisions:Number(control('scale').value),relief:Number(control('relief').value)/100,seed:Number(control('seed').value)||0,regions:fitted.regions});panelCache.set(cacheId,{signature,result:structure});if(panelCache.size>64)panelCache.delete(panelCache.keys().next().value||'');
  totalSkipped+=structure.skipped;
  totalRegions+=structure.regions;totalPlates+=structure.plates;totalDetails+=structure.details;
  batches.forEach(source=>{const b=recipe&&recipe.id!==1?{...source,vertices:treatmentSamples(source.vertices,source.stride||6)}:source;for(let i=0;i<b.vertices.length;i+=(b.stride||6)){data.push(...b.vertices.slice(i,i+6));const color=b.color||[.5,.5,.5],protect=b.opacity!==undefined||['mechanical','structural','marking','cockpit'].includes(b.role||'')||Math.max(...color)<.31;data.push(...color,(protect?1:0)+(fitted.curvature.get(artVertexKey(b.vertices,i))||0)*.2,b.stride===8?b.vertices[i+6]:0,b.stride===8?b.vertices[i+7]:0);}});
  const colorSeed=Number(control('seed').value)||0;let coloring=colorCache.get(fitted.regions);if(recipe&&(!coloring||coloring.seed!==colorSeed)){coloring={seed:colorSeed,sample:chunkTreatment(fitted.regions,colorSeed)};colorCache.set(fitted.regions,coloring);}const sampler=recipe?coloring?.sample:null;
  if(sampler)for(let i=start*12;i<data.length;i+=12){const weights=sampler(data.slice(i,i+3),data.slice(i+3,i+6),(recipe?.id||0),[0,1,2].map(k=>{const t=start*12+Math.floor((i-start*12)/36)*36;return (data[t+k]+data[t+12+k]+data[t+24+k])/3;}));for(let k=0;k<3;k++)data[i+6+k]=weights[k];}
  const passes=[{start,count:data.length/12-start,bias:0}];
  const generated=(matrix?(index===diagnosticIndex?structure.diagnostics:index===0?[]:style===0?[]:structure.panels):control('regions').checked?structure.diagnostics:style===0?[]:structure.panels).slice();
  // Group decals by coat so paint and markings have stable, separate depth
  // layers. Real armor geometry keeps ordinary depth testing and occlusion.
  for(const bias of [0,1,2,3]){
   const layerStart=data.length/12;
   generated.filter(batch=>(batch.decalLayer||0)===bias).forEach(source=>{const batch=recipe&&recipe.id!==1&&!source.diagnostic?{...source,vertices:treatmentSamples(source.vertices,8)}:source;for(let i=0;i<batch.vertices.length;i+=8)data.push(...batch.vertices.slice(i,i+6),...(sampler&&!batch.diagnostic?sampler(Array.from(batch.vertices.slice(i,i+3)),Array.from(batch.vertices.slice(i+3,i+6)),recipe?.id||0,[0,1,2].map(k=>{const t=Math.floor(i/24)*24;return (batch.vertices[t+k]+batch.vertices[t+8+k]+batch.vertices[t+16+k])/3;})):batch.paint),(batch.diagnostic?3:batch.graphic?4:2)+(fitted.curvature.get(artVertexKey(batch.vertices,i))||0)*.2,batch.vertices[i+6],batch.vertices[i+7]);});
   const count=data.length/12-layerStart;if(count)passes.push({start:layerStart,count,bias});
  }
  const origin=hangar||matrix?[(index%columns-(columns-1)/2)*3.1,(Math.floor(index/columns)-(rows-1)/2)*3.6,1.15]:[0,0,0];
  const label=hangar||matrix?document.createElement('div'):null;
  if(label){label.className='hull-label';label.textContent=matrix?(recipe?recipe.name:(index===0?'Original / source':index===diagnosticIndex?'Detected regions / '+structure.regions+' charts':treatmentNames[index])):(/^[A-E]$/.test(subject)?'Barracuda '+subject:artistModels.find(model=>model.id===subject)?.name||subject)+' / '+extent.toFixed(1)+' m';control('labels').append(label);}
  actors.push({start,count:data.length/12-start,origin,label,texture:textureFor(batches[0].texture),style:recipe||matrix?style:null,recipe,axis:structure.axis,range:(()=>{let lo=Infinity,hi=-Infinity;batches.forEach(b=>{for(let i=0;i<b.vertices.length;i+=(b.stride||6)){const t=structure.axis.reduce((sum,v,k)=>sum+v*b.vertices[i+k],0);lo=Math.min(lo,t);hi=Math.max(hi,t);}});return [lo,hi];})(),passes});
  if(!hangar&&!matrix){const select=/** @type {HTMLSelectElement} */(document.getElementById('subject'));control('caption').textContent=select.selectedOptions[0].textContent+' / '+extent.toFixed(1)+' m / '+((data.length/12-start)/3).toLocaleString()+' triangles';}
 });
 if(hangar||matrix){
  const groups={deck:/** @type {number[]} */([]),rail:/** @type {number[]} */([])},mesh=DW.meshBuilder.create(groups);
  mesh.block('deck',[0,0,-.16],[halfX,halfY,.12]);
  for(let x=-Math.floor(halfX);x<=Math.floor(halfX);x++)mesh.block('rail',[x,0,-.025],[.009,halfY-.3,.006]);
  for(let y=-Math.floor(halfY);y<=Math.floor(halfY);y++)mesh.block('rail',[0,y,-.025],[halfX-.3,.009,.006]);
  [-1,1].forEach(sign=>{mesh.block('rail',[sign*(halfX-.1),0,0],[.06,halfY,.08]);[-halfY,halfY].forEach(y=>{mesh.block('deck',[sign*(halfX-.1),y,2],[.16,.16,2.2]);});});
  const start=data.length/12;
  Object.entries(groups).forEach(([key,vertices])=>{for(let i=0;i<vertices.length;i+=6){data.push(...vertices.slice(i,i+6),...(key==='deck'?[.08,.12,.15]:[.21,.27,.29]),1,0,0);}});
  actors.push({start,count:data.length/12-start,origin:[0,0,0],label:null,texture:null,style:null,recipe:null,axis:[0,1,0],range:[-1,1],passes:[{start,count:data.length/12-start,bias:0}]});
  control('caption').textContent=subjects.length+' HULLS / SHARED TREATMENT / DISPLAY SIZES NORMALIZED';
 }
 if(matrix)control('caption').textContent=(artistModels.find(m=>m.id===control('subject').value)?.name||control('subject').value)+(artMode?' / ONE GEOMETRY, FOUR CHUNK TREATMENTS':' / ONE HULL, SIX CONSTRUCTION RULES');
 control('analysis').textContent=(control('masks').checked?'Material-assisted: ':'Geometry only: ')+totalRegions+' regions ('+totalSkipped+' below budget/size threshold) / '+totalPlates+' generated pieces / '+totalDetails+' structural parts';
 if(matrix)control('analysis').textContent=(control('masks').checked?'Material-assisted: ':'Geometry only: ')+fittedHull(control('subject').value).regions.length+' source regions, shared by every copy.';
 gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);count=data.length/12;
}
const descriptions=['Original artist textures, or neutral greybox shading.','A few broad conforming shell plates.','Actual overlapping armor courses over an exposed lower layer.','Shared longitudinal bays, raised transverse frames, stringers and braces.','Large soft pads with boundary-bound inflation, without hard armor edges.','Flush paint zones following existing surfaces, without armor extrusion.','Angular cuts and projected planar caps that change the apparent hull facets.'];
function settings(){const art=control('directions').value==='art';['fields','zones','finish','graphics','palette-mode'].forEach(id=>{const group=control(id).parentElement;if(group)group.hidden=id!=='finish'||!art;});const grammarGroup=control('grammar').parentElement,recipeGroup=control('art-style').parentElement;if(grammarGroup)grammarGroup.hidden=false;if(recipeGroup)recipeGroup.hidden=!art;const custom=false;['primary','secondary','accent'].forEach(id=>control(id).disabled=custom);const matrix=control('layout').value==='matrix';control('collection').disabled=control('layout').value!=='hangar';['grammar','art-style','regions','compare'].forEach(id=>control(id).disabled=matrix&&(id!=='grammar'||!art));control('description').textContent=matrix?(art?'Same geometry treatment and four-color palette. Each copy assigns materials using a different region-local operation.':'Each copy uses a different construction rule. Colors, seed, shape and input mode stay shared.'):art?'Coloration operates on analyzed surface chunks independently of the selected geometry treatment.':descriptions[Number(control('grammar').value)];control('scale-value').textContent=control('scale').value;control('split-label').hidden=matrix||!control('compare').checked;}
control('directions').onchange=home;
control('collection').onchange=()=>{control('layout').value='hangar';settings();rebuild();home();};
control('layout').onchange=()=>{settings();rebuild();home();};
control('subject').onchange=()=>{if(control('layout').value!=='matrix')control('layout').value='solo';settings();setTimeout(()=>{rebuild();home();},0);};
['directions','art-style','grammar','scale','relief','seed','regions','masks','graphics'].forEach(id=>control(id).oninput=()=>{settings();setTimeout(rebuild,0);});
['wear','compare','palette-mode','fields','zones','finish'].forEach(id=>control(id).oninput=settings);
control('shuffle').onclick=()=>{assemblySeed++;control('subject').value='random';rebuild();};
let palette=0;const palettes=[['#c5cec9','#38474d','#ee912e','#12191d'],['#d7dfdd','#253641','#bc3e38','#10151c'],['#d18b31','#26343b','#f2d99b','#151918'],['#657264','#242e2d','#c2bc85','#111612']];
control('palette').onclick=()=>{control('palette-mode').value='shared';settings();palette=(palette+1)%palettes.length;['primary','secondary','accent','detail'].forEach((id,i)=>control(id).value=palettes[palette][i]);};
control('quarter').onclick=()=>{yaw=.22;tilt=.75;home();};control('top').onclick=()=>{yaw=0;tilt=.02;};control('side').onclick=()=>{yaw=Math.PI/2;tilt=Math.PI/2;};
control('reset').onclick=()=>{control('grammar').value='1';control('scale').value='2';control('relief').value='55';control('wear').value='20';control('seed').value='17';control('source-blend').value='0';control('regions').checked=false;control('monochrome').checked=false;control('masks').checked=false;control('compare').checked=false;control('spin').checked=false;palette=0;['primary','secondary','accent','detail'].forEach((id,i)=>control(id).value=palettes[0][i]);yaw=.22;tilt=.75;home();settings();rebuild();};
let dragging=false,lastX=0,lastY=0;
canvas.onpointerdown=/** @param {PointerEvent} e */(e)=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=/** @param {PointerEvent} e */(e)=>{if(!dragging)return;yaw-=(e.clientX-lastX)*.008;tilt=Math.max(.02,Math.min(Math.PI-.02,tilt+(e.clientY-lastY)*.008));lastX=e.clientX;lastY=e.clientY;};
canvas.onpointerup=canvas.onpointercancel=()=>{dragging=false;};
canvas.addEventListener('wheel',e=>{e.preventDefault();distance=Math.max(control('layout').value!=='solo'?8:1.6,Math.min(50,distance*Math.exp(e.deltaY*.001)));},{passive:false});
DW.shipPackModels.loadTextures().then(images=>{sourceImages=images;rebuild();}).catch(/** @param {unknown} error */(error)=>{control('caption').textContent='Artist texture load failed: '+String(error);});
rebuild();home();settings();gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
let last=0;
/** @param {number} now */
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;if(document.hidden)return;if(control('spin').checked)yaw+=dt*.22;
 const ratio=Math.min(devicePixelRatio,2),w=Math.round(canvas.clientWidth*ratio),h=Math.round(canvas.clientHeight*ratio);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}gl.disable(gl.SCISSOR_TEST);gl.viewport(0,0,w,h);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
 const s=Math.sin(yaw),c=Math.cos(yaw),st=Math.sin(tilt),ct=Math.cos(tilt),back=[-s*st,c*st,ct];
 sky.render({eye:[0,0,0],right:[c,s,0],up:[s*ct,-c*ct,st],back},1,!control('sky').checked);vector('right',[c,s,0]);vector('up',[s*ct,-c*ct,st]);vector('back',back);vector('eye',back.map(v=>v*distance));scalar('aspect',w/h);scalar('distance',distance);
 ['primary','secondary','accent','detail'].forEach(id=>{const hex=control(id).value;vector(id,[1,3,5].map(k=>parseInt(hex.slice(k,k+2),16)/255));});
 scalar('monochrome',control('monochrome').checked?1:0);scalar('useMasks',control('masks').checked?1:0);scalar('grammar',Number(control('grammar').value));scalar('wear',Number(control('wear').value)/100);scalar('split',control('layout').value!=='matrix'&&control('compare').checked?w/2:0);scalar('sourceBlend',Number(control('source-blend').value)/100);gl.uniform1i(uniform('sourceTexture'),0);actors.forEach(actor=>{
  scalar('grammar',actor.style===null?Number(control('grammar').value):actor.style);gl.bindTexture(gl.TEXTURE_2D,actor.texture);scalar('hasTexture',actor.texture?1:0);vector('origin',actor.origin);
  const recipe=actor.recipe;scalar('artStyle',recipe?.id||0);scalar('artRoughness',recipe?.roughness||.8);scalar('artMetalness',recipe?.metalness||0);scalar('artLow',actor.range[0]);scalar('artHigh',actor.range[1]);scalar('artSeed',Number(control('seed').value)||0);scalar('artFields',control('fields').checked?1:0);scalar('artZones',control('zones').checked?1:0);scalar('artFinish',control('finish').checked?1:0);vector('artAxis',actor.axis);
  ['primary','secondary','accent','detail'].forEach(id=>{const hex=control(id).value;vector(id,[1,3,5].map(k=>parseInt(hex.slice(k,k+2),16)/255));});
  actor.passes.forEach(pass=>{
   if(pass.bias){// This viewer's right/up/back basis projects outward faces clockwise.
    gl.enable(gl.POLYGON_OFFSET_FILL);gl.frontFace(gl.CW);gl.enable(gl.CULL_FACE);gl.polygonOffset(-pass.bias,-2*pass.bias);}
   else{gl.disable(gl.POLYGON_OFFSET_FILL);gl.disable(gl.CULL_FACE);}
   gl.drawArrays(gl.TRIANGLES,pass.start,pass.count);
  });
  gl.disable(gl.POLYGON_OFFSET_FILL);gl.disable(gl.CULL_FACE);
  if(actor.label){const o=actor.origin,x=o[0]*c+o[1]*s,y=o[0]*s*ct-o[1]*c*ct+(o[2]-1.25)*st,z=distance-(o[0]*back[0]+o[1]*back[1]+(o[2]-1.25)*back[2]);actor.label.style.left=(.5+x*2.414/(w/h)/z*.5)*100+'%';actor.label.style.top=(.5-y*2.414/z*.5)*100+'%';actor.label.hidden=z<=0;}
 });
}
requestAnimationFrame(frame);
