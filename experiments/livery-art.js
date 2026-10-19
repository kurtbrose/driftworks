/** Art recipes combine independent color-field, surface-finish and marking layers.
 * Geometry references existing construction grammars; no hull-specific settings.
 * @typedef {{id:number,name:string,geometry:number,palette:number[][],roughness:number,metalness:number,markings:number}} ArtRecipe */
/** @type {ArtRecipe[]} */
export const ART_DIRECTIONS=[
 {id:1,name:'Clean aerospace',geometry:1,palette:[[.88,.86,.78],[.12,.19,.23],[.23,.57,.65]],roughness:.42,metalness:.12,markings:1},
 {id:2,name:'Industrial workhorse',geometry:5,palette:[[.83,.40,.08],[.08,.12,.13],[.98,.77,.25]],roughness:.83,metalness:.22,markings:2},
 {id:3,name:'Armored military',geometry:6,palette:[[.27,.34,.27],[.045,.065,.075],[.78,.29,.12]],roughness:.65,metalness:.34,markings:0},
 {id:4,name:'Retro alloy',geometry:0,palette:[[.69,.74,.77],[.18,.23,.28],[.79,.12,.08]],roughness:.19,metalness:.92,markings:3}
];
/** @param {ArrayLike<number>} p @param {number} [offset] */
export function artVertexKey(p,offset=0){return [0,1,2].map(k=>Math.round(p[offset+k]*100000)).join(',');}
/** Geometric normal variation at welded vertices, independent of camera and paint.
 * This is an edge/curvature proxy, not ambient occlusion or semantic recognition.
 * @param {{vertices:Float32Array,stride?:number}[]} batches */
export function curvatureField(batches){
 /** @type {Map<string,{sum:number[],weight:number}>} */const accum=new Map();
 batches.forEach(b=>{const stride=b.stride||6,v=b.vertices;for(let i=0;i<v.length;i+=stride*3){const a=[v[i+stride]-v[i],v[i+stride+1]-v[i+1],v[i+stride+2]-v[i+2]],c=[v[i+stride*2]-v[i],v[i+stride*2+1]-v[i+1],v[i+stride*2+2]-v[i+2]],n=[a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]],weight=Math.hypot(...n);if(weight<1e-10)continue;
  if(n[0]*v[i+3]+n[1]*v[i+4]+n[2]*v[i+5]<0)for(let k=0;k<3;k++)n[k]*=-1;
  for(let j=0;j<3;j++){const key=artVertexKey(v,i+j*stride),entry=accum.get(key)||{sum:[0,0,0],weight:0};for(let k=0;k<3;k++)entry.sum[k]+=n[k];entry.weight+=weight;accum.set(key,entry);}
 }});
 /** @type {Map<string,number>} */const field=new Map();accum.forEach((entry,key)=>field.set(key,Math.min(1,Math.max(0,(1-Math.hypot(...entry.sum)/entry.weight)*8))));return field;
}

// Continuous hull-space fields, never a repeating panel grid. The material model
// is a lightweight preview response rather than a full PBR/environment renderer.
export const ART_SHADER=`
uniform float artStyle,artRoughness,artMetalness,artLow,artHigh,artSeed,artFields,artZones,artFinish;
uniform vec3 artAxis;
float artHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7))+artSeed)*43758.5453);}
float artNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(artHash(i),artHash(i+vec3(1,0,0)),f.x),mix(artHash(i+vec3(0,1,0)),artHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(artHash(i+vec3(0,0,1)),artHash(i+vec3(1,0,1)),f.x),mix(artHash(i+vec3(0,1,1)),artHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 artDirection(vec3 point,vec3 N,float edge,float kind){
 float t=clamp((dot(point,artAxis)-artLow)/max(.001,artHigh-artLow),0.,1.);
 t=mix(.5,t,artFields);float upper=mix(1.,smoothstep(-.45,.65,N.z),artZones),end=abs(dot(N,artAxis))*artZones;edge*=artZones;
 vec3 transverse=cross(artAxis,vec3(0,0,1));if(length(transverse)<.1)transverse=cross(artAxis,vec3(0,1,0));transverse=normalize(transverse);
 float side=dot(point,transverse),mottle=artNoise(point*18.)*.65+artNoise(point*69.)*.35;
 mottle=mix(.5,mottle,artFinish);vec3 c=primary;
 if(artStyle<1.5){
  c=mix(primary*.62,primary,smoothstep(.05,.86,t));
  float ceramic=(1.-upper)*.8+smoothstep(.7,.95,end)*.55;c=mix(c,secondary,clamp(ceramic,0.,.9));
  c=mix(c,accent,smoothstep(.82,.84,t)*(1.-smoothstep(.89,.91,t))*.8);c*=.985+mottle*.03;
 }else if(artStyle<2.5){
  float zone=smoothstep(.22,.24,t)*(1.-smoothstep(.7,.72,t));c=mix(secondary,primary,zone*.9+upper*.1);
  c=mix(c,accent,smoothstep(.72,.74,t)*(1.-smoothstep(.84,.86,t)));
  c*=.84+mottle*.23;float chips=edge*wear*smoothstep(.55,.82,mottle);c=mix(c,vec3(.55,.59,.58),chips*.75);
 }else if(artStyle<3.5){
  float composite=smoothstep(.55,.78,end)*.7+(1.-upper)*.5;
  c=mix(primary,secondary,clamp(composite,0.,.95));c*=.85+artNoise(point*3.)*.25;
  c=mix(c,accent,smoothstep(.90,.92,t)*(1.-smoothstep(.93,.95,t))*.6);
  c=mix(c,vec3(.44,.48,.45),edge*wear*.5);
 }else{
  float brush=sin(dot(point,artAxis)*90.)*.006*artFinish;c=mix(secondary,primary,.55+upper*.45)+brush;
  float stripe=1.-smoothstep(.095,.11,abs(side));float pin=1.-smoothstep(.025,.035,abs(abs(side)-.30));
  c=mix(c,accent,max(stripe,pin*.8)*artFields*(1.-smoothstep(.6,.85,end)));c*=.92+t*.14;
 }
 // Generated graphic marks carry paint weights, with no source-texture dependency.
 if(kind>3.5)c=primary*protection.r+secondary*protection.g+accent*protection.b;
 return c;
}
`;
