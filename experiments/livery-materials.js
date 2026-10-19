/** Small material vocabulary for previewing region assignments, not asset baking.
 * @typedef {{name:string,color:string,roughness:number,metalness:number,detail:number,wear:number,emission:number,pattern:number}} SurfaceMaterial */
/** @type {Record<string,SurfaceMaterial>} */
export const SURFACE_MATERIALS={
 paint:{name:'Satin painted metal',color:'#c5cec9',roughness:.57,metalness:.12,detail:.14,wear:.12,emission:0,pattern:1},
 ceramic:{name:'Glazed ceramic',color:'#e7e5dc',roughness:.16,metalness:0,detail:.06,wear:.02,emission:0,pattern:0},
 alloy:{name:'Polished alloy',color:'#b5c2ca',roughness:.12,metalness:.95,detail:.04,wear:.06,emission:0,pattern:0},
 brushed:{name:'Brushed titanium',color:'#7f8b98',roughness:.34,metalness:.9,detail:.55,wear:.08,emission:0,pattern:2},
 rubber:{name:'Matte rubber / composite',color:'#242b30',roughness:.96,metalness:0,detail:.45,wear:.06,emission:0,pattern:3},
 thermal:{name:'Quilted thermal fabric',color:'#a89d7d',roughness:.89,metalness:.08,detail:.75,wear:.22,emission:0,pattern:4},
 emitter:{name:'Luminous ceramic',color:'#69c7d9',roughness:.24,metalness:.05,detail:.15,wear:0,emission:.65,pattern:0}
};
/** Palette-independent scalar mixing mirrors the shader's four assignment weights.
 * @param {number[]} weights @param {number[]} values */
export function blendSurfaceProperty(weights,values){const w=weights.slice(0,3).map(x=>Math.max(0,x));w.push(Math.max(0,1-w.reduce((a,b)=>a+b,0)));const sum=w.reduce((a,b)=>a+b,0)||1;return w.reduce((total,x,k)=>total+x/sum*values[k],0);}

export const MATERIAL_SHADER=`
uniform vec3 surface0,surface1,surface2,surface3,effects0,effects1,effects2,effects3;
uniform float materialGrey,materialPixel,mirrorMaterials,mirrorOffset;
uniform vec3 mirrorNormal;
vec4 surfaceWeights(vec3 w){w=max(w,vec3(0.));vec4 a=vec4(w,max(0.,1.-w.r-w.g-w.b));return a/max(.001,dot(a,vec4(1.)));}
// x: relief, y: albedo variation. Fine structure describes a material, not region placement.
vec2 surfacePattern(vec3 p,vec3 N,float type){
 vec3 a=abs(N);vec2 uv=a.z>=a.x&&a.z>=a.y?p.xy:(a.x>=a.y?p.yz:p.xz);
 float fade=1.-smoothstep(.004,.018,materialPixel);
 float grain=sin(uv.x*157.)*sin(uv.y*193.);
 if(type<.5)return vec2(0.);
 if(type<1.5)return vec2(grain*.08,grain*.025)*fade;
 if(type<2.5)return vec2(sin(uv.x*120.)*.06,sin(uv.x*120.)*.018)*fade;
 if(type<3.5)return vec2(grain*.22,grain*.06)*fade;
 vec2 tile=fract(uv*7.);float seam=1.-smoothstep(.02,.10,min(min(tile.x,1.-tile.x),min(tile.y,1.-tile.y)));
 return vec2((cos(uv.x*43.98)+cos(uv.y*43.98))*.22-seam*.3,-seam*.23)*fade;
}
vec3 shadeSurfaces(vec3 base,vec3 point,vec3 N,vec4 w,float boundary){
 vec3 q=point,patternN=N;bool folded=mirrorMaterials>.5&&dot(q,mirrorNormal)<mirrorOffset;if(folded){q-=2.*(dot(q,mirrorNormal)-mirrorOffset)*mirrorNormal;patternN-=2.*dot(patternN,mirrorNormal)*mirrorNormal;}
 float rough=dot(w,vec4(surface0.x,surface1.x,surface2.x,surface3.x));
 float metal=dot(w,vec4(surface0.y,surface1.y,surface2.y,surface3.y));
 float worn=dot(w,vec4(effects0.x,effects1.x,effects2.x,effects3.x));
 float emission=dot(w,vec4(effects0.y,effects1.y,effects2.y,effects3.y));
 vec2 micro=surfacePattern(q,patternN,effects0.z)*surface0.z*w.x+surfacePattern(q,patternN,effects1.z)*surface1.z*w.y+surfacePattern(q,patternN,effects2.z)*surface2.z*w.z+surfacePattern(q,patternN,effects3.z)*surface3.z*w.w;
 // Orientation-varying fine relief; silhouette and coarse hull normals are preserved.
 vec3 tangent=normalize(abs(patternN.z)<.9?cross(patternN,vec3(0,0,1)):cross(patternN,vec3(0,1,0)));
 N=normalize(patternN+tangent*micro.x*.3);if(folded)N-=2.*dot(N,mirrorNormal)*mirrorNormal;
 base*=1.+micro.y;
 base=mix(base,vec3(.43,.46,.47),clamp(boundary*worn,0.,.65));
 if(materialGrey>.5)base=vec3(.52)*(1.+micro.y);
 vec3 V=normalize(eye-point),L=normalize(vec3(-.6,-.4,1.)),H=normalize(V+L);
 float ndl=max(0.,dot(N,L)),fresnel=pow(1.-max(0.,dot(N,V)),5.);
 float exponent=mix(180.,4.,rough*rough),spec=pow(max(0.,dot(N,H)),exponent)*(1.-rough*.65);
 vec3 f0=mix(vec3(.045),base,metal),F=f0+(1.-f0)*fresnel;
 vec3 reflected=reflect(-V,N);float sky=smoothstep(-.2,.65,reflected.z);
 vec3 environment=mix(vec3(.035,.065,.10),vec3(.72,.78,.8),sky);
 vec3 result=base*(.27+ndl*.78)*(1.-metal*.7)+F*spec*2.5+environment*F*(.45+metal*.65)*(1.-rough*.65);
 result+=base*emission*1.6;
 return result;
}
`;
