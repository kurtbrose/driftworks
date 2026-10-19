// Original, dependency-free region/plate experiment. Source meshes remain immutable.
/** @typedef {number[]} V */
/** @typedef {{vertices:Float32Array,stride?:number,color?:number[],opacity?:number,texture?:HTMLImageElement,role?:string,eligible?:(uv:number[])=>boolean}} HullBatch */
/** @typedef {{v:V[],normal:V,area:number,neighbors:number[]}} Face */
/** @typedef {{faces:Face[],normal:V,u:V,v:V,area:number,id:number}} Region */
/** @typedef {{vertices:Float32Array,paint:V,diagnostic?:boolean,graphic?:boolean,decalLayer?:number}} PanelBatch */
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
 * @param {HullBatch[]} batches @param {boolean} [assisted] @returns {Region[]} */
export function analyzeHull(batches,assisted=false){
 /** @type {Region[]} */const regions=[];
 batches.forEach(batch=>{
  if(assisted&&protectedBatch(batch))return;
  /** @type {Face[]} */const faces=[];
  /** @type {Map<string,number[]>} */const edges=new Map();
  const stride=batch.stride||6;
  for(let i=0;i<batch.vertices.length;i+=stride*3){
   const vertices=[0,1,2].map(j=>{const v=Array.from(batch.vertices.slice(i+j*stride,i+j*stride+stride));if(stride===6)v.push(0,0);return v;});
   const raw=cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0])),area=Math.hypot(...raw)*.5;
   if(area<1e-10)continue;
   if(assisted&&batch.eligible&&!batch.eligible([0,1].map(k=>vertices.reduce((sum,v)=>sum+v[6+k],0)/3)))continue;
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
     for(const other of directions){if(other===direction)continue;poly=clipNormal(poly,sub(direction,other),directions.indexOf(direction)<directions.indexOf(other));if(poly.length<3)break;}
     for(let j=1;j<poly.length-1;j++){const v=[poly[0],poly[j],poly[j+1]],area=Math.hypot(...cross(sub(v[1],v[0]),sub(v[2],v[0])))*.5;if(area>1e-10)chart.push({v,normal:face.normal,area,neighbors:[]});}
    });
    connected(chart).forEach(region);
   });
  });
 });
 return regions;
}

/** @param {V[]} poly @param {V} axis @param {boolean} [keepTies] */
function clipNormal(poly,axis,keepTies=true){
 // A whole flat face on an atlas boundary belongs to one chart, not both.
 if(!keepTies&&poly.every(p=>Math.abs(dot(p.slice(3,6),axis))<1e-8))return [];
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

/** @param {V[][]} polygons */
function boundaryEdges(polygons){
 /** @type {Map<string,{a:V,b:V,count:number}>} */const edges=new Map();
 polygons.forEach(poly=>poly.forEach((a,i)=>{const b=poly[(i+1)%poly.length],k=edgeKey(a,b),edge=edges.get(k);if(edge)edge.count++;else edges.set(k,{a,b,count:1});}));
 return Array.from(edges.values()).filter(edge=>edge.count===1);
}
/** @param {V[][]} polygons @param {V} axis @param {number} low @param {number} high */
function band(polygons,axis,low,high){return polygons.map(poly=>clip(clip(poly,axis,low,1),axis,high,-1)).filter(poly=>poly.length>=3);}
/** @param {V[][]} polygons */
function polygonArea(polygons){return polygons.reduce((sum,p)=>{for(let i=1;i<p.length-1;i++)sum+=Math.hypot(...cross(sub(p[i],p[0]),sub(p[i+1],p[0])))*.5;return sum;},0);}
/** @param {V[][]} polygons @param {V} axis */
function limits(polygons,axis){let low=Infinity,high=-Infinity;polygons.forEach(poly=>poly.forEach(p=>{const x=dot(p,axis);low=Math.min(low,x);high=Math.max(high,x);}));return [low,high];}
/** @param {V[][]} polygons @param {number} height */
function flush(polygons,height){const data=/** @type {number[]} */([]);polygons.forEach(poly=>{const cap=poly.map(p=>raised(p,unit(p.slice(3,6)),height));for(let i=1;i<cap.length-1;i++)triangle(data,cap[0],cap[i],cap[i+1]);});return new Float32Array(data);}

/** Fit the hull's major axis from all surface areas, without a ship-direction hint.
 * @param {Region[]} regions */
function hullAxis(regions){
 const total=regions.reduce((sum,r)=>sum+r.area,0)||1,center=[0,1,2].map(k=>regions.reduce((sum,r)=>sum+r.faces.reduce((s,f)=>s+f.v.reduce((a,p)=>a+p[k],0)*f.area/3,0),0)/total),matrix=Array.from({length:3},()=>[0,0,0]);
 regions.forEach(r=>r.faces.forEach(f=>{const p=f.v.map(v=>sub(v,center));for(let i=0;i<3;i++)for(let j=0;j<3;j++){const a=p.reduce((s,v)=>s+v[i],0),b=p.reduce((s,v)=>s+v[j],0);matrix[i][j]+=f.area*(a*b+p.reduce((s,v)=>s+v[i]*v[j],0))/12;}}));
 let best=[1,0,0],value=-Infinity;
 for(const start of [[1,.13,.07],[.09,1,.11],[.07,.13,1]]){let v=start;for(let i=0;i<24;i++)v=unit(matrix.map(row=>dot(row,v)));const eigen=dot(v,matrix.map(row=>dot(row,v)));if(eigen>value){best=v;value=eigen;}}
 const component=best.find(x=>Math.abs(x)>.001)||1;return component<0?best.map(x=>-x):best;
}

/** Six construction rules share clipping and mesh primitives, not a strip layout.
 * @typedef {{polygons:V[][],region:Region,divisions:number,relief:number,seed:number,axis:V,extent:V}} GrammarContext
 * @typedef {{batches:PanelBatch[],pieces:number,operation:string}} GrammarOutput */
/** @param {GrammarContext} ctx @returns {GrammarOutput} */
function cleanGrammar(ctx){
 const {polygons,region}=ctx,[a,b]=limits(polygons,region.u),count=Math.max(1,Math.min(2,Math.round((b-a)*ctx.divisions/2)));
 /** @type {PanelBatch[]} */const batches=[];
 const cuts=count===1?[a,b]:[a,a+(b-a)*(.45+random(region.id,ctx.seed)*.1),b];
 for(let i=0;i<count;i++){const cell=band(polygons,region.u,cuts[i]-1e-6,cuts[i+1]+1e-6);if(polygonArea(cell)<.009)continue;batches.push({vertices:plate(cell,region,.004,.003,.003+ctx.relief*.006).vertices,paint:[1,0,0]});}
 return {batches,pieces:0,operation:'broad-shell'};
}
/** @param {GrammarContext} ctx @returns {GrammarOutput} */
function layeredGrammar(ctx){
 const {polygons,region}=ctx,[a,b]=limits(polygons,region.u),count=Math.max(2,Math.min(5,ctx.divisions+1)),span=(b-a)/count;
 /** @type {PanelBatch[]} */const batches=[{vertices:plate(polygons,region,.004,.003,.006).vertices,paint:[.18,.82,0]}];
 // Lower courses remain visible. Upper courses overlap their neighbors by 22%.
 for(let i=0;i<count;i++){const cell=band(polygons,region.u,a+span*i-span*.13,a+span*(i+1)+span*.13);if(polygonArea(cell)<.009)continue;const height=.012+ctx.relief*.018+i*.004;batches.push({vertices:plate(cell,region,.009,.006,height).vertices,paint:i%3===0?[.88,0,.12]:[1,0,0]});}
 return {batches,pieces:count,operation:'overlapping-courses'};
}
/** @param {GrammarContext} ctx @returns {GrammarOutput} */
function industrialGrammar(ctx){
 const {polygons,region,axis}=ctx,[a,b]=ctx.extent,count=ctx.divisions+3,width=.014+ctx.relief*.016,height=.022+ctx.relief*.028;
 /** @type {PanelBatch[]} */const batches=[];
 /** @param {V[][]} cell @param {V} paint */
 function beam(cell,paint){if(polygonArea(cell)>.001)batches.push({vertices:plate(cell,region,.001,.002,height).vertices,paint});}
 // All hull regions use the same major-axis station schedule. These are frames,
 // stringers and braces over the original shell, not raised bay-sized plates.
 for(let i=1;i<count;i++){const station=a+(b-a)*i/count;beam(band(polygons,axis,station-width,station+width),[.7,.3,0]);}
 let tangent=region.u;if(Math.abs(dot(tangent,axis))>.8)tangent=region.v;
 const [left,right]=limits(polygons,tangent);for(const sign of [-1,1]){const line=(left+right)/2+sign*(right-left)*.37;beam(band(polygons,tangent,line-width*.6,line+width*.6),[.85,.15,0]);}
 const diagonal=unit(axis.map((x,k)=>x+tangent[k]*.65));
 for(let i=0;i<count;i++){const cell=band(polygons,axis,a+(b-a)*i/count,a+(b-a)*(i+1)/count),range=limits(cell,diagonal),middle=(range[0]+range[1])/2;beam(band(cell,diagonal,middle-width*.45,middle+width*.45),[.4,.6,0]);}
 return {batches,pieces:batches.length,operation:'station-frames-and-braces'};
}
/** @param {GrammarContext} ctx @returns {GrammarOutput} */
function thermalGrammar(ctx){
 const {region,polygons}=ctx,edges=boundaryEdges(polygons),refine=polygons.length<30?3:polygons.length<250?1:0;
 /** @type {V[][]} */let triangles=[];polygons.forEach(p=>{for(let i=1;i<p.length-1;i++)triangles.push([p[0],p[i],p[i+1]]);});
 for(let pass=0;pass<refine;pass++){const next=/** @type {V[][]} */([]);triangles.forEach(([a,b,c])=>{const ab=a.map((x,k)=>(x+b[k])/2),bc=b.map((x,k)=>(x+c[k])/2),ca=c.map((x,k)=>(x+a[k])/2);next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);});triangles=next;}
 /** @param {V} p */
 function puff(p){const x=dot(p,region.u),y=dot(p,region.v);let distance=Infinity;edges.forEach(e=>{const ax=dot(e.a,region.u),ay=dot(e.a,region.v),dx=dot(e.b,region.u)-ax,dy=dot(e.b,region.v)-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));distance=Math.min(distance,Math.hypot(x-ax-dx*t,y-ay-dy*t));});const blend=Math.min(1,distance/.14),h=.0015+ctx.relief*.022*blend*blend*(3-2*blend);return raised(p,unit(p.slice(3,6)),h);}
 const data=/** @type {number[]} */([]);triangles.forEach(tri=>triangle(data,puff(tri[0]),puff(tri[1]),puff(tri[2]),true));
 /** @type {Map<string,V>} */const normals=new Map();
 for(let i=0;i<data.length;i+=24){const a=data.slice(i,i+3),b=data.slice(i+8,i+11),c=data.slice(i+16,i+19),n=cross(sub(b,a),sub(c,a));for(let j=0;j<3;j++){const k=key(data.slice(i+j*8,i+j*8+3)),sum=normals.get(k)||[0,0,0];normals.set(k,sum.map((x,k)=>x+n[k]));}}
 for(let i=0;i<data.length;i+=8){const n=unit(normals.get(key(data.slice(i,i+3)))||[0,0,1]);for(let k=0;k<3;k++)data[i+3+k]=n[k];}
 return {batches:[{vertices:new Float32Array(data),paint:[.96,.04,0]}],pieces:0,operation:'edge-bound-padded-blanket'};
}
/** @param {GrammarContext} ctx @returns {GrammarOutput} */
function paintedGrammar(ctx){
 const {polygons,region}=ctx,[a,b]=limits(polygons,region.u),offset=.18+random(region.id,ctx.seed)*.35;
 // Paint is a decal, not a second shell displaced along smoothing normals.
 // The renderer assigns independent depth biases to base paint and markings.
 return {batches:[{vertices:flush(polygons,0),paint:[1,0,0],decalLayer:1},{vertices:flush(band(polygons,region.u,a+(b-a)*offset,a+(b-a)*(offset+.16)),0),paint:[0,0,1],decalLayer:2}],pieces:0,operation:'flush-paint-zones'};
}
/** @param {GrammarContext} ctx @returns {GrammarOutput} */
function facetedGrammar(ctx){
 const {polygons,region}=ctx,cutAxis=unit(region.u.map((x,k)=>x*.85+region.v[k]*.5)),[a,b]=limits(polygons,cutAxis),count=ctx.divisions>1?2:1;
 /** @type {PanelBatch[]} */const batches=[];
 for(let i=0;i<count;i++){
  const cell=band(polygons,cutAxis,a+(b-a)*i/count-1e-6,a+(b-a)*(i+1)/count+1e-6);if(polygonArea(cell)<.009)continue;
  const normal=unit(region.normal.map((x,k)=>x+region.v[k]*(i===0?-.12:.12))),level=limits(cell,normal)[1]+.004+ctx.relief*.012;
  /** @param {V} p */const project=p=>p.map((x,k)=>k<3?x+normal[k]*(level-dot(p,normal)):k<6?normal[k-3]:x);
  const planar=cell.map(poly=>poly.map(project)),frame={...region,normal};const top=plate(planar,frame,.006,.004,.003);
  const walls=/** @type {number[]} */([]);boundaryEdges(cell).forEach(e=>{const c=project(e.b),d=project(e.a);triangle(walls,e.a,e.b,c,true);triangle(walls,e.a,c,d,true);});
  batches.push({vertices:top.vertices,paint:[.8,.2,0]},{vertices:new Float32Array(walls),paint:[.3,.7,0]});
 }
 return {batches,pieces:0,operation:'planar-chine-reconstruction'};
}

/** @param {HullBatch[]} batches @param {{style:number,divisions:number,relief:number,seed:number,assisted?:boolean,regions?:Region[]}} settings */
export function buildHullPanels(batches,settings){
 const regions=settings.regions||analyzeHull(batches,!!settings.assisted),style=Math.max(1,Math.min(6,settings.style||1));
 /** @type {PanelBatch[]} */const panels=[],diagnostics=/** @type {PanelBatch[]} */([]);
 let plateCount=0,detailCount=0;
 const totalArea=regions.reduce((sum,r)=>sum+r.area,0),areaFloor=Math.max(.018,totalArea*.0075),candidates=regions.filter(region=>region.area>=areaFloor).sort((a,b)=>b.area-a.area).slice(0,24),eligible=new Set(candidates.map(r=>r.id));
 const axis=hullAxis(regions),all=regions.flatMap(r=>r.faces.map(f=>f.v)),extent=limits(all,axis);
 const grammars=[cleanGrammar,layeredGrammar,industrialGrammar,thermalGrammar,paintedGrammar,facetedGrammar];
 let operation='none';
 regions.forEach(region=>{
  const diagnostic=/** @type {number[]} */([]);region.faces.forEach(f=>triangle(diagnostic,.../** @type {[V,V,V]} */(f.v)));
  diagnostics.push({vertices:new Float32Array(diagnostic),paint:[.3+random(region.id,3)*.65,.3+random(region.id,5)*.65,.3+random(region.id,7)*.65],diagnostic:true,decalLayer:1});
  if(!eligible.has(region.id))return;
  const polygons=region.faces.map(f=>f.v),out=grammars[style-1]({polygons,region,divisions:Math.max(1,Math.min(4,settings.divisions)),relief:Math.max(0,Math.min(1,settings.relief)),seed:settings.seed,axis,extent});
  panels.push(...out.batches.filter(b=>b.vertices.length));plateCount+=out.batches.filter(b=>b.vertices.length).length;detailCount+=out.pieces;operation=out.operation;
 });
 return {panels,diagnostics,regions:regions.length,eligible:eligible.size,skipped:regions.length-eligible.size,plates:plateCount,details:detailCount,operation,axis};
}

/** Sparse surface-supported graphic marks, separate from construction layout.
 * No semantic equipment detection; unsuitable or curved sites simply get no mark.
 * @param {Region[]} regions @param {number} kind @param {number} height @returns {PanelBatch[]} */
export function buildGraphicMarks(regions,kind,height){
 if(!kind)return [];
 /** @type {PanelBatch[]} */const marks=[];
 const candidates=regions.filter(r=>r.area>.035&&r.normal[2]>.25&&r.faces.every(f=>dot(f.normal,r.normal)>.985)).sort((a,b)=>b.area-a.area).slice(0,2);
 candidates.forEach(region=>{
  const polygons=region.faces.map(f=>f.v),edges=boundaryEdges(polygons);
  /** @type {{x:number,y:number,r:number}|null} */let best=null;
  for(let i=0;i<polygons.length;i+=Math.max(1,Math.floor(polygons.length/24))){const p=[0,1,2].map(k=>polygons[i].reduce((sum,v)=>sum+v[k],0)/polygons[i].length),x=dot(p,region.u),y=dot(p,region.v);let r=Infinity;
   edges.forEach(e=>{const ax=dot(e.a,region.u),ay=dot(e.a,region.v),dx=dot(e.b,region.u)-ax,dy=dot(e.b,region.v)-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));r=Math.min(r,Math.hypot(x-ax-dx*t,y-ay-dy*t));});if(!best||r>best.r)best={x,y,r};
  }
  if(!best||best.r<.045)return;
  const chosen=/** @type {{x:number,y:number,r:number}} */(best),radius=Math.min(.18,chosen.r*.6),cx=chosen.x,cy=chosen.y;
  /** @param {number} x @param {number} y @param {number} w @param {number} h @param {number} angle @param {V} paint */
  function rectangle(x,y,w,h,angle,paint){const c=Math.cos(angle),s=Math.sin(angle),corners=[[-w,-h],[w,-h],[w,h],[-w,h]],points=corners.map(p=>surfacePoint(polygons,region,x+p[0]*c-p[1]*s,y+p[0]*s+p[1]*c));if(points.some(p=>!p))return;
   const vertices=/** @type {V[]} */(points).map(p=>raised(p,unit(p.slice(3,6)),height)),data=/** @type {number[]} */([]);triangle(data,vertices[0],vertices[1],vertices[2]);triangle(data,vertices[0],vertices[2],vertices[3]);marks.push({vertices:new Float32Array(data),paint,graphic:true,decalLayer:3});
  }
  if(kind===1){rectangle(cx,cy,radius*.8,radius*.09,0,[0,0,1]);rectangle(cx,cy+radius*.35,radius*.4,radius*.055,0,[0,1,0]);}
  else if(kind===2){rectangle(cx,cy,radius,radius*.45,0,[0,0,1]);for(let i=-2;i<=2;i++)rectangle(cx+i*radius*.34,cy,radius*.055,radius*.35,-.4,[0,1,0]);}
  else{
   // A small 07 stencil, assembled from bars rather than a remote/font texture.
   const segments=[[-.0,.45,.23,.04],[.23,.23,.04,.20],[.23,-.23,.04,.20],[0,-.45,.23,.04],[-.23,-.23,.04,.20],[-.23,.23,.04,.20],[0,0,.23,.04]];
   [[0,1,2,3,4,5],[0,1,2]].forEach((digit,index)=>digit.forEach(part=>{const [x,y,w,h]=segments[part];rectangle(cx+(index-.5)*radius*.65+x*radius,cy+y*radius,w*radius,h*radius,0,[0,0,1]);}));
  }
 });
 return marks;
}
