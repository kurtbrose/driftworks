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
// Filter each harmonic against its actual projected pixel footprint. Distant
// detail converges to its average instead of beating against the pixel grid.
float materialWave(float phase,float frequency){
 #ifdef MATERIAL_DERIVATIVES
 float width=abs(dFdx(phase))+abs(dFdy(phase));
 #else
 float width=frequency*materialPixel*4.;
 #endif
 return sin(phase)*(1.-smoothstep(.6,2.6,width));
}
float materialNormalVariance(vec3 normal){
 #ifdef MATERIAL_DERIVATIVES
 vec3 dx=dFdx(normal),dy=dFdy(normal);return min(.35,(dot(dx,dx)+dot(dy,dy))*2.);
 #else
 return 0.;
 #endif
}
vec2 surfacePlane(vec2 uv,float type){
 float grain=materialWave(uv.x*157.,157.)*materialWave(uv.y*193.,193.);
 if(type<.5)return vec2(0.);
 if(type<1.5)return vec2(grain*.08,grain*.025);
 if(type<2.5){float brush=materialWave(uv.x*120.,120.);return vec2(brush*.06,brush*.018);}
 if(type<3.5)return vec2(grain*.22,grain*.06);
 vec2 phase=uv*43.98;
 float u=materialWave(phase.x+1.5708,43.98),v=materialWave(phase.y+1.5708,43.98);
 // Band-limited seam profile: no fract/smoothstep discontinuities at tile borders.
 float seam=.25+.12*(u+v)+.06*(materialWave(phase.x*2.+1.5708,87.96)+materialWave(phase.y*2.+1.5708,87.96))+.02*(materialWave(phase.x*3.+1.5708,131.94)+materialWave(phase.y*3.+1.5708,131.94));
 return vec2((u+v)*.22-seam*.3,-seam*.23);
}
// Blend three projections continuously; changing the dominant normal no longer
// switches texture coordinates along a diagonal across a curved hull.
vec2 surfacePattern(vec3 p,vec3 N,float type){
 vec3 blend=pow(abs(N),vec3(4.));blend/=max(.0001,blend.x+blend.y+blend.z);
 return surfacePlane(p.yz,type)*blend.x+surfacePlane(p.xz,type)*blend.y+surfacePlane(p.xy,type)*blend.z;
}
vec3 shadeSurfaces(vec3 base,vec3 point,vec3 N,vec4 w,float boundary){
 vec3 q=point,patternN=N;bool folded=mirrorMaterials>.5&&dot(q,mirrorNormal)<mirrorOffset;if(folded){q-=2.*(dot(q,mirrorNormal)-mirrorOffset)*mirrorNormal;patternN-=2.*dot(patternN,mirrorNormal)*mirrorNormal;}
 float rough=dot(w,vec4(surface0.x,surface1.x,surface2.x,surface3.x));
 float metal=dot(w,vec4(surface0.y,surface1.y,surface2.y,surface3.y));
 float worn=dot(w,vec4(effects0.x,effects1.x,effects2.x,effects3.x));
 float emission=dot(w,vec4(effects0.y,effects1.y,effects2.y,effects3.y));
 vec2 micro=surfacePattern(q,patternN,effects0.z)*surface0.z*w.x+surfacePattern(q,patternN,effects1.z)*surface1.z*w.y+surfacePattern(q,patternN,effects2.z)*surface2.z*w.z+surfacePattern(q,patternN,effects3.z)*surface3.z*w.w;
 // Orientation-varying fine relief; silhouette and coarse hull normals are preserved.
 float signZ=patternN.z>=0.?1.:-1.,basis=-1./(signZ+patternN.z);vec3 tangent=vec3(1.+signZ*patternN.x*patternN.x*basis,signZ*patternN.x*patternN.y*basis,-signZ*patternN.x);
 N=normalize(patternN+tangent*micro.x*.3);if(folded)N-=2.*dot(N,mirrorNormal)*mirrorNormal;
 rough=sqrt(min(1.,rough*rough+materialNormalVariance(N)));
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
