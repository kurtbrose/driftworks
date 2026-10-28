'use strict';
// Offline convex-polyhedron bevel. Coplanar triangles become one face before
// weighting, so triangulation diagonals cannot become bevels or shading seams.
const add=(a,b)=>a.map((v,k)=>v+b[k]),sub=(a,b)=>a.map((v,k)=>v-b[k]),mul=(a,s)=>a.map(v=>v*s);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>mul(a,1/Math.hypot(...a)),key=a=>a.map(v=>Math.round(v*1e5)).join(',');
function bevel(vertices,width){
 if(!(width>0))throw new Error('Positive bevel width required');
 const planes=[],edges=new Map();
 for(let i=0;i<vertices.length;i+=18){
  const p=[0,6,12].map(j=>vertices.slice(i+j,i+j+3)),n=unit(cross(sub(p[1],p[0]),sub(p[2],p[0]))),d=dot(n,p[0]);
  let f=planes.findIndex(q=>dot(q.n,n)>1-1e-8&&Math.abs(q.d-d)<1e-4);
  if(f<0){f=planes.length;planes.push({n,d,kind:'face'});}
  for(let j=0;j<3;j++){const id=[key(p[j]),key(p[(j+1)%3])].sort().join('|');if(!edges.has(id))edges.set(id,[]);edges.get(id).push(f);}
 }
 const originals=planes.slice();
 for(let i=0;i<vertices.length;i+=6)if(originals.some(q=>dot(q.n,vertices.slice(i,i+3))-q.d>1e-3))throw new Error('Bevel study requires a convex closed source');
 for(const adjacent of edges.values()){
  if(adjacent.length!==2)throw new Error('Source is not a closed two-manifold');
  const [a,b]=adjacent;if(a===b)continue;
  const p=originals[a],q=originals[b],sum=add(p.n,q.n),length=Math.hypot(...sum),n=unit(sum);
  // width is the setback measured along either original face from its edge.
  const d=(p.d+q.d)/length-width*Math.sqrt((1-dot(p.n,q.n))/2);
  if(!planes.some(f=>dot(f.n,n)>1-1e-8&&Math.abs(f.d-d)<1e-4))planes.push({n,d,kind:'bevel'});
 }
 const points=new Map();
 for(let a=0;a<planes.length;a++)for(let b=a+1;b<planes.length;b++)for(let c=b+1;c<planes.length;c++){
  const A=planes[a],B=planes[b],C=planes[c],bc=cross(B.n,C.n),den=dot(A.n,bc);if(Math.abs(den)<1e-8)continue;
  const p=mul(add(add(mul(bc,A.d),mul(cross(C.n,A.n),B.d)),mul(cross(A.n,B.n),C.d)),1/den);
  if(planes.every(f=>dot(f.n,p)<=f.d+1e-5))points.set(key(p),p);
 }
 const faces=planes.map(f=>{
  const p=[...points.values()].filter(p=>Math.abs(dot(f.n,p)-f.d)<1e-4);if(p.length<3)return null;
  const center=mul(p.reduce(add,[0,0,0]),1/p.length),u=unit(sub(p[0],center)),v=cross(f.n,u);
  p.sort((a,b)=>Math.atan2(dot(sub(a,center),v),dot(sub(a,center),u))-Math.atan2(dot(sub(b,center),v),dot(sub(b,center),u)));
  let area=0;for(let j=1;j<p.length-1;j++)area+=Math.hypot(...cross(sub(p[j],p[0]),sub(p[j+1],p[0])))/2;
  return {...f,p,area};
 }).filter(Boolean);
 if(faces.filter(f=>f.kind==='face').length!==originals.length)throw new Error('Bevel consumes an original face; reduce width');
 const weighted=new Map();
 for(const f of faces)for(const p of f.p)weighted.set(key(p),add(weighted.get(key(p))||[0,0,0],mul(f.n,f.area)));
 const flat=[],smooth=[];
 for(const f of faces)for(let j=1;j<f.p.length-1;j++)for(const p of [f.p[0],f.p[j],f.p[j+1]]){flat.push(...p,...f.n);smooth.push(...p,...unit(weighted.get(key(p))));}
 return {flat,weighted:smooth,faces:faces.length,bevelFaces:faces.filter(f=>f.kind==='bevel').length,width};
}
module.exports={bevel};
