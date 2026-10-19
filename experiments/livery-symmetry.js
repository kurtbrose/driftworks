/** Geometry-only bilateral reflection analysis. No ship IDs or authored axes.
 * @typedef {{normal:number[],offset:number,coverage:number,error:number}} MirrorPlane */
/** @param {number[]} a @param {number[]} b */
const mirrorDot=(a,b)=>a.slice(0,3).reduce((sum,x,k)=>sum+x*b[k],0);
/** @param {number[]} p @param {MirrorPlane} plane @param {boolean} [direction] */
export function reflectHullPoint(p,plane,direction=false){const d=mirrorDot(p,plane.normal)-(direction?0:plane.offset);return p.slice(0,3).map((x,k)=>x-2*d*plane.normal[k]);}
/** Tests coordinate and covariance axes against reflected geometric vertex positions.
 * Small asymmetric details are tolerated, strongly asymmetric assemblies are rejected.
 * @param {{vertices:Float32Array,stride?:number}[]} batches @returns {MirrorPlane|null} */
export function detectHullSymmetry(batches){
 const unique=new Map(/** @type {[string,number[]][]} */([]));
 batches.forEach(b=>{for(let i=0;i<b.vertices.length;i+=b.stride||6){const p=Array.from(b.vertices.slice(i,i+3));unique.set(p.map(x=>Math.round(x*100000)).join(','),p);}});
 const points=Array.from(unique.values());if(points.length<4)return null;
 const center=[0,1,2].map(k=>points.reduce((sum,p)=>sum+p[k],0)/points.length),cov=[0,1,2].map(i=>[0,1,2].map(j=>points.reduce((sum,p)=>sum+(p[i]-center[i])*(p[j]-center[j]),0)/points.length)),vectors=[[1,0,0],[0,1,0],[0,0,1]];
 // Jacobi eigensolver retains arbitrary model rotations, including transverse axes.
 for(let step=0;step<24;step++){let a=0,b=1;for(const [i,j] of [[0,2],[1,2]])if(Math.abs(cov[i][j])>Math.abs(cov[a][b])){a=i;b=j;}if(Math.abs(cov[a][b])<1e-12)break;
  const angle=.5*Math.atan2(2*cov[a][b],cov[b][b]-cov[a][a]),c=Math.cos(angle),s=Math.sin(angle);
  for(let k=0;k<3;k++){const x=cov[k][a],y=cov[k][b];cov[k][a]=c*x-s*y;cov[k][b]=s*x+c*y;}
  for(let k=0;k<3;k++){const x=cov[a][k],y=cov[b][k];cov[a][k]=c*x-s*y;cov[b][k]=s*x+c*y;const u=vectors[k][a],v=vectors[k][b];vectors[k][a]=c*u-s*v;vectors[k][b]=s*u+c*v;}
 }
 /** @typedef {{p:number[],axis:number,left:Tree|null,right:Tree|null}} Tree */
 /** @param {number[][]} list @param {number} depth @returns {Tree|null} */
 function build(list,depth){if(!list.length)return null;const axis=depth%3;list.sort((a,b)=>a[axis]-b[axis]);const mid=list.length>>1;return {p:list[mid],axis,left:build(list.slice(0,mid),depth+1),right:build(list.slice(mid+1),depth+1)};}
 const root=build(points.slice(),0),extent=Math.max(...[0,1,2].map(k=>Math.max(...points.map(p=>p[k]))-Math.min(...points.map(p=>p[k])))),tolerance=extent*.012;
 const sample=points.filter((p,i)=>i%Math.max(1,Math.ceil(points.length/1500))===0);
 const axes=[[1,0,0],[0,1,0],[0,0,1],...[0,1,2].map(k=>vectors.map(row=>row[k]))];
 /** @type {MirrorPlane|null} */let best=null;
 for(const normal of axes){const projections=points.map(p=>mirrorDot(p,normal)),offset=(Math.min(...projections)+Math.max(...projections))/2,plane={normal,offset,coverage:0,error:0};let matches=0,sum=0;
  for(const p of sample){const q=reflectHullPoint(p,plane);let nearest=Infinity;
   /** @param {Tree|null} node */function visit(node){if(!node)return;const d=node.p.reduce((total,x,k)=>total+(x-q[k])**2,0);nearest=Math.min(nearest,d);const delta=q[node.axis]-node.p[node.axis];visit(delta<0?node.left:node.right);if(delta*delta<nearest)visit(delta<0?node.right:node.left);}
   visit(root);if(nearest<=tolerance*tolerance)matches++;sum+=Math.min(nearest,extent*extent*.01);
  }
  plane.coverage=matches/sample.length;plane.error=Math.sqrt(sum/sample.length)/extent;
  if(!best||plane.coverage>best.coverage+.002||(Math.abs(plane.coverage-best.coverage)<=.002&&plane.error<best.error-1e-5))best=plane;
 }
 return best&&best.coverage>=.9&&best.error<.025?best:null;
}
/** Clip generated triangles to one half, then reflect with reversed winding.
 * Base artist geometry is never modified. @param {Float32Array} vertices @param {MirrorPlane} plane */
export function mirrorTreatmentMesh(vertices,plane){
 const out=/** @type {number[]} */([]);
 for(let i=0;i<vertices.length;i+=24){const tri=[0,1,2].map(j=>Array.from(vertices.slice(i+j*8,i+j*8+8))),poly=/** @type {number[][]} */([]);
  for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],da=mirrorDot(a,plane.normal)-plane.offset,db=mirrorDot(b,plane.normal)-plane.offset;if(da>=0)poly.push(a);if((da>0&&db<0)||(da<0&&db>0)){const t=da/(da-db);poly.push(a.map((x,k)=>x+(b[k]-x)*t));}}
  for(let j=1;j+1<poly.length;j++){const t=[poly[0],poly[j],poly[j+1]];t.forEach(v=>out.push(...v));if(t.every(v=>Math.abs(mirrorDot(v,plane.normal)-plane.offset)<1e-8))continue;[t[0],t[2],t[1]].forEach(v=>out.push(...reflectHullPoint(v,plane),...reflectHullPoint(v.slice(3,6),plane,true),v[6],v[7]));}
 }
 return new Float32Array(out);
}
