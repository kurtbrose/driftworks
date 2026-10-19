/** Chunk coloration operations; geometry and palette are selected independently.
 * @typedef {{id:number,name:string,roughness:number,metalness:number}} ArtRecipe */
/** @type {ArtRecipe[]} */
export const ART_DIRECTIONS=[
 {id:1,name:'Connected region materials',roughness:.7,metalness:.12},
 {id:2,name:'Boundary-distance enamel',roughness:.65,metalness:.18},
 {id:3,name:'Irregular material islands',roughness:.8,metalness:.08},
 {id:4,name:'Layer edges / dark boundaries',roughness:.6,metalness:.3}
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

/** Add sampling vertices without moving the surface or altering source buffers.
 * @param {Float32Array} vertices @param {number} stride */
export function treatmentSamples(vertices,stride){
 const out=/** @type {number[]} */([]);
 /** @param {number[][]} tri @param {number} depth */
 function split(tri,depth){
  const span=Math.max(...tri.map((a,i)=>Math.hypot(...a.slice(0,3).map((x,k)=>x-tri[(i+1)%3][k]))));
  if(depth===0||span<.055){tri.forEach(p=>out.push(...p));return;}
  const mids=tri.map((a,i)=>a.map((x,k)=>(x+tri[(i+1)%3][k])/2));
  for(const p of mids){const l=Math.hypot(...p.slice(3,6))||1;for(let k=3;k<6;k++)p[k]/=l;}
  split([tri[0],mids[0],mids[2]],depth-1);split([mids[0],tri[1],mids[1]],depth-1);split([mids[2],mids[1],tri[2]],depth-1);split(mids,depth-1);
 }
 for(let i=0;i<vertices.length;i+=stride*3)split([0,1,2].map(j=>Array.from(vertices.slice(i+j*stride,i+(j+1)*stride))),2);
 return new Float32Array(out);
}

/** Region-local treatment analysis. No equipment semantics or source paint.
 * @param {import('./hull-panels').Region[]} regions @param {number} seed */
export function chunkTreatment(regions,seed){
 const hash=/** @param {number} n */n=>{const x=Math.sin(n*127.1+seed*31.7)*43758.5453;return x-Math.floor(x);};
 const dot=/** @param {number[]} a @param {number[]} b */(a,b)=>a.slice(0,3).reduce((sum,x,k)=>sum+x*b[k],0);
 const charts=regions.map(r=>{
  const points=r.faces.flatMap(f=>f.v),center=[0,1,2].map(k=>points.reduce((sum,p)=>sum+p[k],0)/points.length);
  const edges=new Map(/** @type {[string,{a:number[],b:number[],count:number}][]} */([]));
  r.faces.forEach(f=>f.v.forEach((a,i)=>{const b=f.v[(i+1)%3],ka=artVertexKey(a),kb=artVertexKey(b),key=ka<kb?ka+'|'+kb:kb+'|'+ka;const e=edges.get(key);if(e)e.count++;else edges.set(key,{a,b,count:1});}));
  const bounds=edges.size?Array.from(edges.values()).filter(e=>e.count===1):[];
  const uv=points.map(p=>[dot(p,r.u),dot(p,r.v)]),lo=[0,1].map(k=>Math.min(...uv.map(p=>p[k]))),hi=[0,1].map(k=>Math.max(...uv.map(p=>p[k])));
  return {r,center,bounds,lo,hi,scale:Math.sqrt(r.area),slot:hash(r.id+1)<.45?0:hash(r.id+7)<.6?1:2};
 });
 // KD tree over face centroids; query several candidates to disambiguate nearby surfaces by normal.
 const faceBuckets=new Map(/** @type {[string,{chart:typeof charts[number],normal:number[],p:number[],count:number}][]} */([]));
 charts.forEach(chart=>chart.r.faces.forEach(f=>{const p=[0,1,2].map(k=>f.v.reduce((sum,v)=>sum+v[k],0)/3),key=chart.r.id+':'+p.map(x=>Math.floor(x/.08)).join(',');const old=faceBuckets.get(key);if(old){for(let k=0;k<3;k++)old.p[k]+=p[k];old.count++;}else faceBuckets.set(key,{chart,normal:chart.r.normal,p,count:1});}));
 const faces=Array.from(faceBuckets.values()).map(f=>({...f,p:f.p.map(x=>x/f.count)}));
 /** @typedef {{item:typeof faces[number],axis:number,left:Tree|null,right:Tree|null}} Tree */
 /** @param {typeof faces} items @param {number} depth @returns {Tree|null} */
 function tree(items,depth){if(!items.length)return null;const axis=depth%3;items.sort((a,b)=>a.p[axis]-b.p[axis]);const mid=items.length>>1;return {item:items[mid],axis,left:tree(items.slice(0,mid),depth+1),right:tree(items.slice(mid+1),depth+1)};}
 const direction=/** @param {number[]} n */n=>{let k=0;for(let j=1;j<3;j++)if(Math.abs(n[j])>Math.abs(n[k]))k=j;return k*2+(n[k]<0?1:0);};
 const roots=[0,1,2,3,4,5].map(i=>tree(faces.filter(f=>direction(f.normal)===i),0));
 const lookup=new Map(/** @type {[string,typeof faces[number]][]} */([]));
 const root=tree(faces,0),cache=new Map(/** @type {[string,number[]][]} */([]));
 /** @param {number[]} p @param {number[]} n @param {number} style @param {number[]} [anchor] @returns {number[]} */
 return function sample(p,n,style,anchor=p){
  const key=artVertexKey(p)+':'+n.map(x=>Math.round(x*100)).join(',')+':'+style+':'+artVertexKey(anchor);const old=cache.get(key);if(old)return old;
  let best=Infinity;let found=faces[0];
  /** @param {Tree|null} node */function visit(node){if(!node)return;const d=node.item.p.reduce((sum,x,k)=>sum+(x-anchor[k])**2,0),score=d*.1+dot(anchor.map((x,k)=>x-node.item.p[k]),node.item.normal)**2+(1-Math.max(-1,Math.min(1,dot(n,node.item.normal))))*.4;if(score<best){best=score;found=node.item;}const delta=anchor[node.axis]-node.item.p[node.axis];visit(delta<0?node.left:node.right);if(delta*delta*.1<best)visit(delta<0?node.right:node.left);}
  const lookupKey=artVertexKey(anchor)+':'+n.map(x=>Math.round(x*100)).join(',');const known=lookup.get(lookupKey);if(known)found=known;else{visit(roots[direction(n)]||root);if(found)lookup.set(lookupKey,found);}if(!found)return [1,0,0];
  const face=found,c=face.chart;
  let distance=Infinity;if(style===2||style===4)c.bounds.forEach(e=>{const ab=e.b.map((x,k)=>x-e.a[k]),ap=p.map((x,k)=>x-e.a[k]),t=Math.max(0,Math.min(1,dot(ap,ab)/(dot(ab,ab)||1)));distance=Math.min(distance,Math.hypot(...ap.map((x,k)=>x-ab[k]*t)));});
  const edge=1-Math.min(1,distance/Math.max(.008,c.scale*.16));
  const w=[0,0,0,0];
  if(style===1){w[c.slot]=1;} // Whole connected charts, no global bands.
  else if(style===2){w[0]=1-edge;w[1]=edge*.72;w[2]=edge*.28;} // True chart boundary distance.
  else if(style===3){ // Unequal material islands in each chart's own tangent frame.
   const uv=[dot(p,c.r.u),dot(p,c.r.v)];let nearest=Infinity,slot=0;
   for(let j=0;j<4;j++){const site=[0,1].map(k=>c.lo[k]+hash(c.r.id*19+j*3+k)*(c.hi[k]-c.lo[k]));const d=uv.reduce((sum,x,k)=>sum+(x-site[k])**2,0)/(j===0?1.6:1);if(d<nearest){nearest=d;slot=j;}}
   w[slot]=1;
  }else{const slope=1-Math.max(0,dot(n,c.r.normal));w[c.slot]=1;const dark=Math.min(.85,edge*.4+slope*1.7);w[c.slot]*=1-dark;w[3]+=dark;}
  // Newly exposed plate sidewalls use the detail material.
  const side=1-Math.max(0,dot(n,c.r.normal));if(side>.45){for(let k=0;k<3;k++)w[k]*=.25;}
  const result=w.slice(0,3);cache.set(key,result);return result;
 };
}

// Color weights are generated from analyzed chunks on the CPU. The shader only
// interpolates those assignments and shades the selected materials.
export const ART_SHADER=`
uniform float artStyle,artRoughness,artMetalness,artLow,artHigh,artSeed,artFields,artZones,artFinish;
uniform vec3 artAxis,detail;
vec3 artDirection(vec3 point,vec3 N,float edge,float kind){
 vec3 weights=max(vec3(0.),protection.rgb);
 return primary*weights.r+secondary*weights.g+accent*weights.b+detail*max(0.,1.-weights.r-weights.g-weights.b);
}
`;
