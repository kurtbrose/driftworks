'use strict';
// Authoring-space Y-up. One continuous cross-section strip; its lower half mirrors the upper artwork.
module.exports=function wrap(points){
 const lo=[0,1,2].map(k=>Math.min(...points.map(p=>p[k]))),hi=[0,1,2].map(k=>Math.max(...points.map(p=>p[k]))),cy=(lo[1]+hi[1])/2,cz=(lo[2]+hi[2])/2;
 const rings=new Map();for(const p of points){const key=p[0].toFixed(5);if(!rings.has(key))rings.set(key,[]);rings.get(key).push(p);}
 const frames=new Map();for(const [x,ps] of rings){const ymin=Math.min(...ps.map(p=>p[1])),ymax=Math.max(...ps.map(p=>p[1])),zmin=Math.min(...ps.map(p=>p[2])),zmax=Math.max(...ps.map(p=>p[2]));frames.set(x,{y:(ymin+ymax)/2,z:(zmin+zmax)/2,h:Math.max(.001,(ymax-ymin)/2),w:Math.max(.001,(zmax-zmin)/2)});}
 const out=[];let added=0;
 function uv(p,branch){const f=frames.get(p[0].toFixed(5))||{y:cy,z:cz,h:Math.max(.001,(hi[1]-lo[1])/2),w:Math.max(.001,(hi[2]-lo[2])/2)};
  if(Math.abs(p[3])>.8)return [(512+110+(p[2]-lo[2])/Math.max(.001,hi[2]-lo[2])*110)/2048,(50+(p[1]-lo[1])/Math.max(.001,hi[1]-lo[1])*50)/1024];
  let angle=Math.atan2((p[1]-f.y)/f.h,(p[2]-f.z)/f.w);if(Math.abs(Math.abs(angle)-Math.PI)<1e-5)angle=branch*Math.PI;
  const v=(Math.PI-angle)/(2*Math.PI),u=(p[0]-lo[0])/Math.max(.001,hi[0]-lo[0]);return [(12+u*488)/2048,(12+v*1000)/1024];}
 function emit(tri,branch){for(const p of tri)out.push(p[0]*9,-p[2]*9,p[1]*9,p[3],-p[5],p[4],...uv(p,branch));}
 function clip(tri,side){const poly=[];for(let i=0;i<3;i++){const a=tri[i],b=tri[(i+1)%3],da=(a[1]-cy)*side,db=(b[1]-cy)*side;if(da>=-1e-8)poly.push(a);if((da>1e-8&&db< -1e-8)||(da< -1e-8&&db>1e-8)){const t=(cy-a[1])/(b[1]-a[1]);poly.push(a.map((v,k)=>v+(b[k]-v)*t));}}return poly;}
 for(let i=0;i<points.length;i+=3){const tri=points.slice(i,i+3),ys=tri.map(p=>p[1]-cy),split=Math.abs(tri[0][3])<.8&&tri.every(p=>p[2]<cz)&&Math.min(...ys)<-1e-6&&Math.max(...ys)>1e-6;
  if(split){let n=0;for(const side of [1,-1]){const poly=clip(tri,side);for(let j=1;j<poly.length-1;j++){emit([poly[0],poly[j],poly[j+1]],side);n++;}}added+=n-1;}else emit(tri,ys.reduce((a,b)=>a+b,0)>=0?1:-1);
 }
 return {vertices:out,added};
};
