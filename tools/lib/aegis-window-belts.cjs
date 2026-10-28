'use strict';
// Bake the approved shallow belts into actual hull facets; no per-window boxes.
const assert=require('node:assert/strict');
module.exports=function(base,source,rawUV){
const authored=base,glass=base.interiors.find(b=>b.kind==='windows');
const bounds=(v,stride)=>[0,1,2].map(k=>{const a=v.filter((n,i)=>i%stride===k);return [Math.min(...a),Math.max(...a)];});
const windows=Array.from({length:glass.vertices.length/216},(_,i)=>({index:i,bounds:bounds(glass.vertices.slice(i*216,(i+1)*216),6)}));
const center=b=>b.map(a=>(a[0]+a[1])/2),used=new Set(),patterns=[],belts=[];
for(const r of source){const b=bounds(r.vertices,6),p=center(b),side=Math.sign(p[1]),items=windows.filter(w=>{const q=center(w.bounds);return !used.has(w.index)&&q[0]>b[0][0]&&q[0]<b[0][1]&&q[2]>b[2][0]&&q[2]<b[2][1]&&Math.sign(q[1])===side&&Math.abs(q[1]-p[1])<2;});if(!items.length)continue;
 items.forEach(w=>used.add(w.index));const x0=Math.min(b[0][0]+2,Math.min(...items.map(w=>w.bounds[0][0]))-.5),x1=Math.max(b[0][1]-2,Math.max(...items.map(w=>w.bounds[0][1]))+.5),z0=b[2][0],z1=b[2][1];
 const layout=items.map(w=>({tile:w.index%8,x:(w.bounds[0][0]-x0)/(x1-x0),y:(z1-w.bounds[2][1])/(z1-z0),w:(w.bounds[0][1]-w.bounds[0][0])/(x1-x0),h:(w.bounds[2][1]-w.bounds[2][0])/(z1-z0)}));
 const key=JSON.stringify(layout.map(o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,Number(v.toFixed(4))]))));let pattern=patterns.findIndex(o=>o.key===key);if(pattern<0){pattern=patterns.length;patterns.push({key,layout});}
 belts.push({...r,side,items,x0,x1,z0,z1,pattern,y:p[1]});
}
assert.equal(used.size,480,'all approved windows must map to a belt, including the nose');

const width=2048,height=Math.ceil(patterns.length/4)*256;
function hullY(x,z,side,fallback){let found=null;for(const b of base.batches){if(Math.max(...b.color)<.28)continue;const v=b.vertices;for(let i=0;i<v.length;i+=18){if(v[i+4]*side<.2)continue;const a=v.slice(i,i+3),p=v.slice(i+6,i+9),q=v.slice(i+12,i+15),d=(p[2]-q[2])*(a[0]-q[0])+(q[0]-p[0])*(a[2]-q[2]);if(Math.abs(d)<1e-9)continue;const u=((p[2]-q[2])*(x-q[0])+(q[0]-p[0])*(z-q[2]))/d,w=((q[2]-a[2])*(x-q[0])+(a[0]-q[0])*(z-q[2]))/d;if(u< -1e-5||w< -1e-5||u+w>1.00001)continue;const y=u*a[1]+w*p[1]+(1-u-w)*q[1];if(Math.abs(y-fallback)<4&&(found===null||Math.abs(y-fallback)<Math.abs(found-fallback)))found=y;}}assert.notEqual(found,null,'belt opening must lie on real armor');return found;}
for(const b of belts){b.corners=[[b.x0,b.z0],[b.x1,b.z0],[b.x1,b.z1],[b.x0,b.z1]].map(([x,z])=>[x,hullY(x,z,b.side,b.y),z]);b.depth=Math.min(.75,Math.abs(b.corners[0][1])*.04);const xs=[b.x0,b.x1];for(const mesh of authored.batches){if(Math.max(...mesh.color)<.28)continue;for(let i=0;i<mesh.vertices.length;i+=6){const p=mesh.vertices.slice(i,i+6);if(p[4]*b.side>.2&&Math.abs(p[1]-b.y)<4&&p[0]>b.x0+1e-4&&p[0]<b.x1-1e-4)xs.push(p[0]);}}b.xs=[...new Set(xs.map(x=>Number(x.toFixed(6))))].sort((a,b)=>a-b);}
function clip(poly,axis,value,sign){const inside=[],outside=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-value)*sign,db=(b[axis]-value)*sign;(da>=-1e-8?inside:outside).push(a);if((da>1e-8&&db< -1e-8)||(da< -1e-8&&db>1e-8)){const t=da/(da-db),p=a.map((v,k)=>v+(b[k]-v)*t);inside.push(p);outside.push(p);}}return [inside,outside];}
function triangulate(poly,out){for(let i=1;i<poly.length-1;i++)out.push(...poly[0],...poly[i],...poly[i+1]);}
function cut(v,slots,patches){let pieces=[v];for(const b of slots){const next=[];for(const poly of pieces){if(poly[0][4]*b.side<.2||Math.abs(poly.reduce((n,p)=>n+p[1],0)/poly.length-b.y)>4){next.push(poly);continue;}let inner=poly;for(const [axis,value,sign] of [[0,b.x0,1],[0,b.x1,-1],[2,b.z0,1],[2,b.z1,-1]]){if(!inner.length)break;const [keep,reject]=clip(inner,axis,value,sign);if(reject.length>=3)next.push(reject);inner=keep;}if(inner.length>=3)patches.push({belt:b,poly:inner});}pieces=next;}return pieces;}
function build(inset){const a=JSON.parse(JSON.stringify(base)),omit=new Map(),patches=[],studyUV=[];for(const b of belts){if(!omit.has(b.batch))omit.set(b.batch,new Set());for(let i=b.start/6;i<(b.start+b.length)/6;i++)omit.get(b.batch).add(i);}
 a.batches.forEach((b,index)=>{const uv=a.surface.batches[index]?.uv,skip=omit.get(index),out=[],tu=[],su=[];for(let i=0;i<b.vertices.length;i+=18){if(skip?.has(i/6))continue;const tri=Array.from({length:3},(_,j)=>[...b.vertices.slice(i+j*6,i+j*6+6),...(uv?uv.slice((i+j*6)/3,(i+j*6)/3+2):[.875,.5]),...(rawUV?rawUV[index].slice((i+j*6)/3,(i+j*6)/3+2):[0,0])]);const data=[];if(Math.max(...b.color)>.28)for(const p of cut(tri,belts,patches))triangulate(p,data);else data.push(...tri.flat());for(let k=0;k<data.length;k+=10){out.push(...data.slice(k,k+6));tu.push(...data.slice(k+6,k+8));su.push(...data.slice(k+8,k+10));}}studyUV.push(su);b.vertices=out;if(uv)a.surface.batches[index].uv=tu;});
 const vertices=[],uv=[];
 function quad(points,tex,hint){let order=[0,1,2,0,2,3];const u=points[1].map((n,k)=>n-points[0][k]),v=points[2].map((n,k)=>n-points[0][k]);let normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal);if(length<1e-9)return;normal=normal.map(n=>n/length);if(normal.reduce((n,v,k)=>n+v*hint[k],0)<0){order=[0,2,1,0,3,2];normal=normal.map(n=>-n);}for(const i of order){vertices.push(...points[i],...normal);uv.push(...tex[i]);}}
 const rimKeys=new Set();
 for(const patch of patches){const b=patch.belt,col=b.pattern%4,row=Math.floor(b.pattern/4),outer=patch.poly,inner=outer.map(p=>[p[0],p[1]-(inset?b.side*b.depth:0),p[2],...p.slice(3,6)]),mapped=inner.map(p=>[...p,(col*512+8+(p[0]-b.x0)/(b.x1-b.x0)*496)/width,(row*256+8+(b.z1-p[2])/(b.z1-b.z0)*240)/height]),flat=[];triangulate(mapped,flat);for(let k=0;k<flat.length;k+=8){vertices.push(...flat.slice(k,k+6));uv.push(...flat.slice(k+6,k+8));}
  if(inset)for(let i=0;i<outer.length;i++){const j=(i+1)%outer.length,p=outer[i],q=outer[j],boundary=[[0,b.x0],[0,b.x1],[2,b.z0],[2,b.z1]].some(([axis,value])=>Math.abs(p[axis]-value)<1e-5&&Math.abs(q[axis]-value)<1e-5);if(!boundary)continue;const key=[p.slice(0,3).map(n=>n.toFixed(5)).join(','),q.slice(0,3).map(n=>n.toFixed(5)).join(',')].sort().join('|');if(rimKeys.has(key))continue;rimKeys.add(key);const hint=[(b.x0+b.x1)/2-(p[0]+q[0])/2,0,(b.z0+b.z1)/2-(p[2]+q[2])/2];quad([p.slice(0,3),q.slice(0,3),inner[j].slice(0,3),inner[i].slice(0,3)],Array(4).fill([(col*512+4)/width,(row*256+4)/height]),hint);}
 }
 const target=a.interiors.find(b=>b.kind==='windows');target.vertices=vertices;target.finish={uv,color:[.8,.8,.8],plainUV:[0,0],atlas:'belt-atlas.png',shader:-2};Object.defineProperty(a,'studyUV',{value:studyUV});return a;}

return build(true);
};
