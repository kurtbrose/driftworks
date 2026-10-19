// Original, dependency-free region/plate experiment. Source meshes remain immutable.
/** @typedef {number[]} V */
/** @typedef {{vertices:Float32Array,stride?:number,color?:number[],opacity?:number,texture?:HTMLImageElement,role?:string,eligible?:(uv:number[])=>boolean}} HullBatch */
/** @typedef {{v:V[],normal:V,area:number,neighbors:number[]}} Face */
/** @typedef {{faces:Face[],normal:V,u:V,v:V,area:number,id:number}} Region */
/** @typedef {{vertices:Float32Array,paint:V,diagnostic?:boolean}} PanelBatch */
/** @param {V} a @param {V} b */
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
/** @param {V} a @param {V} b */
function sub(a,b){return a.map((x,k)=>x-b[k]);}
/** @param {V} a @param {V} b */
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
/** @param {V} a */
function unit(a){const l=Math.hypot(...a)||1;return a.map(x=>x/l);}
/** @param {V} a */
function key(a){return a.slice(0,3).map(x=>Math.round(x*100000)).join(',');}
/** @param {V} a @param {V} b */
function edgeKey(a,b){const x=key(a),y=key(b);return x<y?x+'|'+y:y+'|'+x;}
/** @param {number} value @param {number} seed */
function random(value,seed){const x=Math.sin(value*127.1+seed*311.7)*43758.5453;return x-Math.floor(x);}
/** @param {HullBatch} batch */
function protectedBatch(batch){return batch.role==='cockpit'||batch.role==='mechanical'||batch.role==='structural'||batch.role==='marking'||batch.opacity!==undefined||!!(batch.color&&Math.max(...batch.color)<.31);}

/** Split at actual mesh discontinuities. Smoothing normals are not adjacency.
 * Smooth curved components are cut by a shared normal-space atlas; no shape IDs.
 * @param {HullBatch[]} batches @returns {Region[]} */
export function analyzeHull(batches){
 /** @type {Region[]} */const regions=[];
 batches.forEach(batch=>{
  if(protectedBatch(batch))return;
  /** @type {Face[]} */const faces=[];
  /** @type {Map<string,number[]>} */const edges=new Map();
  const stride=batch.stride||6;
  for(let i=0;i<batch.vertices.length;i+=stride*3){
   const vertices=[0,1,2].map(j=>{const v=Array.from(batch.vertices.slice(i+j*stride,i+j*stride+stride));if(stride===6)v.push(0,0);return v;});
   const raw=cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0])),area=Math.hypot(...raw)*.5;
   if(area<1e-10)continue;
   if(batch.eligible&&!batch.eligible([0,1].map(k=>vertices.reduce((sum,v)=>sum+v[6+k],0)/3)))continue;
   let normal=unit(raw);if(dot(normal,vertices[0].slice(3,6))<0){vertices.reverse();normal=normal.map(x=>-x);}
   const index=faces.length;faces.push({v:vertices,normal,area,neighbors:[]});
   for(let e=0;e<3;e++){const k=edgeKey(vertices[e],vertices[(e+1)%3]),list=edges.get(k)||[];list.push(index);edges.set(k,list);}
  }
  edges.forEach(list=>{if(list.length!==2)return;const a=faces[list[0]],b=faces[list[1]];if(dot(a.normal,b.normal)>.94){a.neighbors.push(list[1]);b.neighbors.push(list[0]);}});
  /** @param {Face[]} input */
  function connected(input){
   /** @type {Map<string,number[]>} */const shared=new Map();input.forEach((f,i)=>{f.neighbors=[];f.v.forEach((p,j)=>{const k=edgeKey(p,f.v[(j+1)%3]),list=shared.get(k)||[];list.push(i);shared.set(k,list);});});
   shared.forEach(list=>{if(list.length!==2)return;const a=input[list[0]],b=input[list[1]];if(dot(a.normal,b.normal)>.94){a.neighbors.push(list[1]);b.neighbors.push(list[0]);}});
   const visited=new Set(/** @type {number[]} */([]));
   /** @type {Face[][]} */const components=[];
   input.forEach((face,index)=>{if(visited.has(index))return;const selected=/** @type {Face[]} */([]),queue=[index];visited.add(index);for(let q=0;q<queue.length;q++){const f=input[queue[q]];selected.push(f);f.neighbors.forEach(next=>{if(!visited.has(next)){visited.add(next);queue.push(next);}});}components.push(selected);});
   return components;
  }
  /** Infer the dominant tangent direction from this region's geometric covariance.
   * @param {Face[]} selected */
  function region(selected){
   const area=selected.reduce((sum,f)=>sum+f.area,0),normal=unit([0,1,2].map(k=>selected.reduce((sum,f)=>sum+f.normal[k]*f.area,0)));
   const axis=Math.abs(normal[2])<.8?[0,0,1]:[1,0,0],basisU=unit(cross(normal,axis)),basisV=unit(cross(normal,basisU));
   const center=[0,1,2].map(k=>selected.reduce((sum,f)=>sum+f.v.reduce((x,p)=>x+p[k],0)*f.area/3,0)/area);
   let xx=0,xy=0,yy=0;selected.forEach(f=>{const xs=f.v.map(p=>dot(sub(p,center),basisU)),ys=f.v.map(p=>dot(sub(p,center),basisV)),sx=xs.reduce((a,b)=>a+b,0),sy=ys.reduce((a,b)=>a+b,0);xx+=f.area*(sx*sx+xs.reduce((a,b)=>a+b*b,0))/12;yy+=f.area*(sy*sy+ys.reduce((a,b)=>a+b*b,0))/12;xy+=f.area*(sx*sy+xs.reduce((a,x,k)=>a+x*ys[k],0))/12;});
   const angle=Math.hypot(xx-yy,2*xy)<(xx+yy)*1e-5?0:Math.atan2(2*xy,xx-yy)/2,u=basisU.map((x,k)=>x*Math.cos(angle)+basisV[k]*Math.sin(angle)),v=unit(cross(normal,u));
   regions.push({faces:selected,normal,u,v,area,id:regions.length});
  }
  connected(faces).forEach(component=>{
   const average=unit([0,1,2].map(k=>component.reduce((sum,f)=>sum+f.normal[k]*f.area,0)));
   if(component.every(f=>dot(f.normal,average)>.93)||component.length<5){region(component);return;}
   // One generic normal-space atlas for every mesh. Cutting interpolated normal
   // fields makes curved chart boundaries independent of triangle density.
   const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
   directions.forEach(direction=>{
    /** @type {Face[]} */const chart=[];
    component.forEach(face=>{
     let poly=face.v;
     for(const other of directions){if(other===direction)continue;poly=clipNormal(poly,sub(direction,other));if(poly.length<3)break;}
     for(let j=1;j<poly.length-1;j++){const v=[poly[0],poly[j],poly[j+1]],area=Math.hypot(...cross(sub(v[1],v[0]),sub(v[2],v[0])))*.5;if(area>1e-10)chart.push({v,normal:face.normal,area,neighbors:[]});}
    });
    connected(chart).forEach(region);
   });
  });
 });
 return regions;
}

/** @param {V[]} poly @param {V} axis */
function clipNormal(poly,axis){
 /** @type {V[]} */const out=[];
 for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=dot(a.slice(3,6),axis),db=dot(b.slice(3,6),axis);if(da>=-1e-8)out.push(a);if((da>1e-8&&db< -1e-8)||(da< -1e-8&&db>1e-8)){const t=da/(da-db);out.push(a.map((v,k)=>v+(b[k]-v)*t));}}
 return out;
}

/** Sutherland-Hodgman clips source triangles, never a bounding-box replacement.
 * Source normals and UVs are interpolated at each cut.
 * @param {V[]} polygon @param {V} axis @param {number} cut @param {number} sign */
function clip(polygon,axis,cut,sign){
 /** @type {V[]} */const out=[];
 for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=(dot(a,axis)-cut)*sign,db=(dot(b,axis)-cut)*sign;
  if(da>=-1e-8)out.push(a);
  if((da>1e-8&&db< -1e-8)||(da< -1e-8&&db>1e-8)){const t=da/(da-db);out.push(a.map((x,k)=>x+(b[k]-x)*t));}
 }
 return out;
}
/** @param {number[]} out @param {V} a @param {V} b @param {V} c @param {boolean} [flat] */
function triangle(out,a,b,c,flat){
 const n=unit(cross(sub(b,a),sub(c,a)));if(Math.hypot(...cross(sub(b,a),sub(c,a)))<1e-10)return;
 [a,b,c].forEach(p=>out.push(...p.slice(0,3),...(flat?n:unit(p.slice(3,6))),p[6]||0,p[7]||0));
}
/** @param {V} point @param {V} normal @param {number} height */
function raised(point,normal,height){return point.map((x,k)=>k<3?x+normal[k]*height:x);}

/** Inset only the exterior boundary of a welded cell. Tessellation edges disappear.
 * Supports disconnected loops and holes without filling either with a convex hull.
 * @param {V[][]} polygons @param {Region} region @param {number} gap @param {number} bevel @param {number} height */
function plate(polygons,region,gap,bevel,height){
 /** @type {Map<string,{p:V,inward:V[],normal:V}>} */const points=new Map();
 /** @type {Map<string,{a:V,b:V,count:number}>} */const edges=new Map();
 polygons.forEach(poly=>poly.forEach((p,i)=>{
  const k=key(p);if(!points.has(k))points.set(k,{p,inward:[],normal:unit(p.slice(3,6))});
  const b=poly[(i+1)%poly.length],e=edgeKey(p,b),previous=edges.get(e);if(previous)previous.count++;else edges.set(e,{a:p,b,count:1});
 }));
 const boundary=Array.from(edges.values()).filter(e=>e.count===1);
 boundary.forEach(e=>{const inward=unit(cross(region.normal,sub(e.b,e.a)));points.get(key(e.a))?.inward.push(inward);points.get(key(e.b))?.inward.push(inward);});
 /** @param {V} p @param {number} amount @param {number} level */
 function inset(p,amount,level){const item=points.get(key(p));if(!item)return p;const normals=item.inward;let shift=[0,0,0];
  if(normals.length){const average=unit([0,1,2].map(k=>normals.reduce((sum,n)=>sum+n[k],0)));const denominator=Math.max(.5,Math.min(...normals.map(n=>Math.abs(dot(n,average)))));shift=average.map(x=>x*amount/denominator);}
  return p.map((x,k)=>k<3?x+shift[k]+item.normal[k]*level:x);
 }
 /** @type {number[]} */const data=[];
 polygons.forEach(poly=>{const cap=poly.map(p=>inset(p,gap+bevel,height));for(let i=1;i<cap.length-1;i++)triangle(data,cap[0],cap[i],cap[i+1]);});
 boundary.forEach(e=>{const a=inset(e.a,gap,Math.max(.001,height-bevel)),b=inset(e.b,gap,Math.max(.001,height-bevel)),c=inset(e.b,gap+bevel,height),d=inset(e.a,gap+bevel,height),baseA=inset(e.a,gap,.0008),baseB=inset(e.b,gap,.0008);
  triangle(data,a,b,c,true);triangle(data,a,c,d,true);triangle(data,baseA,baseB,b,true);triangle(data,baseA,b,a,true);
 });
 return {vertices:new Float32Array(data),boundary};
}

/** Find a supported point on the actual tessellated surface in region coordinates.
 * @param {V[][]} polygons @param {Region} region @param {number} x @param {number} y */
function surfacePoint(polygons,region,x,y){
 for(const poly of polygons)for(let i=1;i<poly.length-1;i++){
  const a=poly[0],b=poly[i],c=poly[i+1],ax=dot(a,region.u),ay=dot(a,region.v),bx=dot(b,region.u),by=dot(b,region.v),cx=dot(c,region.u),cy=dot(c,region.v),den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
  if(Math.abs(den)<1e-10)continue;const u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/den,v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/den,w=1-u-v;
  if(Math.min(u,v,w)>=-1e-7)return a.map((value,k)=>value*u+b[k]*v+c[k]*w);
 }
 return null;
}

/** Only place small functional housings where all corners have mesh support.
 * @param {V[][]} polygons @param {Region} region @param {{a:V,b:V}[]} boundary @param {number} height @param {number} style @param {number} seed */
function detail(polygons,region,boundary,height,style,seed){
 /** @type {{p:V,r:number}|null} */let best=null;
 // Bound the search cost for densely tessellated curved patches.
 const step=Math.max(1,Math.floor(polygons.length/36));
 for(let i=0;i<polygons.length;i+=step){const poly=polygons[i],p=[0,1,2,3,4,5,6,7].map(k=>poly.reduce((sum,v)=>sum+v[k],0)/poly.length),x=dot(p,region.u),y=dot(p,region.v);let r=Infinity;
  boundary.forEach(e=>{const ax=dot(e.a,region.u),ay=dot(e.a,region.v),dx=dot(e.b,region.u)-ax,dy=dot(e.b,region.v)-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));r=Math.min(r,Math.hypot(x-ax-dx*t,y-ay-dy*t));});
  if(!best||r>best.r)best={p,r};
 }
 if(!best||best.r<.055)return [];
 const chosen=/** @type {{p:V,r:number}} */(best),r=Math.min(.18,chosen.r*.6),cx=dot(chosen.p,region.u),cy=dot(chosen.p,region.v);
 /** @param {number} x @param {number} y @param {number} w @param {number} h @param {number} z @param {number} thickness */
 function box(x,y,w,h,z,thickness){const corners=[[-w,-h],[w,-h],[w,h],[-w,h]].map(c=>surfacePoint(polygons,region,x+c[0],y+c[1]));if(corners.some(p=>!p))return new Float32Array();const points=/** @type {V[]} */(corners);
  if(points.some(p=>dot(unit(p.slice(3,6)),unit(chosen.p.slice(3,6)))<.97))return new Float32Array();
  /** @type {number[]} */const out=[];const top=points.map(p=>raised(p,unit(p.slice(3,6)),z+thickness));triangle(out,top[0],top[1],top[2]);triangle(out,top[0],top[2],top[3]);
  for(let i=0;i<4;i++){const j=(i+1)%4,a=raised(points[i],unit(points[i].slice(3,6)),z),b=raised(points[j],unit(points[j].slice(3,6)),z);triangle(out,a,b,top[j],true);triangle(out,a,top[j],top[i],true);}
  return new Float32Array(out);
 }
 /** @type {PanelBatch[]} */const out=[];
 if(style===3||style===5){
  const frame=box(cx,cy,r,r*.55,height+.003,.004);if(!frame.length)return out;out.push({vertices:frame,paint:[0,1,0]});
  for(let i=0;i<5;i++){const v=box(cx+(i-2)*r*.32,cy,r*.055,r*.41,height+.008,.005);if(v.length)out.push({vertices:v,paint:[.55,.45,0]});}
 }else{
  const housing=box(cx,cy,r,r*.55,height+.002,.007);if(housing.length)out.push({vertices:housing,paint:style===4?[.8,0,.2]:[.18,.82,0]});
 }
 // Four deliberately placed flush fasteners, only on supported corners.
 if(style===5||style===2)for(const sign of [-1,1])for(const side of [-1,1]){const v=box(cx+sign*r*.8,cy+side*r*.38,.008,.008,height+.012,.002);if(v.length)out.push({vertices:v,paint:[.6,.4,0]});}
 return out;
}

/** @param {HullBatch[]} batches @param {{style:number,divisions:number,relief:number,seed:number,regions?:Region[]}} settings */
export function buildHullPanels(batches,settings){
 const regions=settings.regions||analyzeHull(batches),style=settings.style||1;
 /** @type {PanelBatch[]} */const panels=[];
 /** @type {PanelBatch[]} */const diagnostics=[];
 let plateCount=0,detailCount=0;
 const totalArea=regions.reduce((sum,r)=>sum+r.area,0),areaFloor=Math.max(.018,totalArea*.0075);
 const candidates=regions.filter(region=>region.area>=areaFloor).sort((a,b)=>b.area-a.area).slice(0,24),eligible=new Set(candidates.map(r=>r.id));
 regions.forEach(region=>{
  const diagnostic=/** @type {number[]} */([]);region.faces.forEach(f=>triangle(diagnostic,.../** @type {[V,V,V]} */(f.v.map(p=>raised(p,unit(p.slice(3,6)),.001)))));
  diagnostics.push({vertices:new Float32Array(diagnostic),paint:[.3+random(region.id,3)*.65,.3+random(region.id,5)*.65,.3+random(region.id,7)*.65],diagnostic:true});
  if(!eligible.has(region.id))return;
  const coords=region.faces.flatMap(f=>f.v.map(p=>dot(p,region.u))),min=Math.min(...coords),max=Math.max(...coords),span=max-min;
  if(span<.065)return;
  const count=Math.max(1,Math.min(4,Math.round(span/(2/Math.max(1,settings.divisions)))*(style===3?2:1)));
  const cuts=[min-1e-6];for(let i=1;i<count;i++)cuts.push(min+span*(i/count+(random(region.id*17+i,settings.seed)-.5)*.16/count));cuts.push(max+1e-6);
  for(let cell=0;cell<count;cell++){
   const polygons=region.faces.map(f=>clip(clip(f.v,region.u,cuts[cell],1),region.u,cuts[cell+1],-1)).filter(p=>p.length>=3);
   let area=0;polygons.forEach(p=>{for(let i=1;i<p.length-1;i++)area+=Math.hypot(...cross(sub(p[i],p[0]),sub(p[i+1],p[0])))*.5;});
   if(area<.009||area/(cuts[cell+1]-cuts[cell])<.035)continue;
   const variation=random(region.id*23+cell,settings.seed),gap=Math.min(.007,(cuts[cell+1]-cuts[cell])*.025),height=style===2?.009+settings.relief*(.015+variation*.014):style===4?.009+settings.relief*.009:.003+settings.relief*.009;
   const bevel=style===4?.009:style===6?.006:.0035;
   const result=plate(polygons,region,gap,bevel,height);if(!result.vertices.length)continue;
   const accent=style===5&&variation>.88?.65:style===3&&cell%3===0?.18:0,secondary=style===6?.25+variation*.2:variation>.85?.15:0;
   panels.push({vertices:result.vertices,paint:[1-accent-secondary,secondary,accent]});plateCount++;
   if(cell===0&&region.area>.04&&style!==1&&style!==6&&region.id%3===0){const pieces=detail(polygons,region,result.boundary,height,style,settings.seed);panels.push(...pieces);if(pieces.length)detailCount++;}
  }
 });
 return {panels,diagnostics,regions:regions.length,eligible:eligible.size,skipped:regions.length-eligible.size,plates:plateCount,details:detailCount};
}
