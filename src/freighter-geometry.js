(function(){
 'use strict';
 const DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks);
 /** @typedef {import('./freighter-types').PartBatch} Batch */
 /** @param {number[]} a @param {number[]} b */ const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
 /** @param {number[]} a @param {number[]} b */ const sub=(a,b)=>a.map((v,k)=>v-b[k]);
 /** @param {number[]} a @param {number[]} b */ const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 /** @param {number[]} v */ const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
 /** @param {number} v */const clamp=v=>Math.max(0,Math.min(1,v));
 /** @param {Batch[]} batches @param {string} id */
 function model(batches,id){const vertices=/** @type {number[]} */([]);for(const batch of batches)for(let i=0;i<batch.vertices.length;i+=8)for(let k=0;k<6;k++)vertices.push(batch.vertices[i+k]);return {id,name:id,vertices,triangles:vertices.length/18};}
 /** Numeric counterpart of the reviewed panel-only deformation. No DOM, Three,
  * textures or mutable authored buffers enter the simulation.
  * @param {Batch[]} source @param {number[]} point @param {number[]} normal @param {number} variant */
 function deform(source,point,normal,variant){
  const dominant=[0,1,2].sort((a,b)=>Math.abs(normal[b])-Math.abs(normal[a]))[0],n=[0,0,0];n[dominant]=Math.sign(normal[dominant]);
  const axis=Math.abs(n[1])<.8?[0,1,0]:[1,0,0],t=unit(axis.map((v,k)=>v-n[k]*dot(axis,n))),side=cross(n,t);
  /** @type {Map<number,{plane:number;area:number;items:{batch:number;offset:number}[]}>} */const planes=new Map();
  const half=[0,0,0];let before=0;
  source.forEach((batch,index)=>{const v=batch.vertices;before+=v.length/24;for(let i=0;i<v.length;i+=8)for(let k=0;k<3;k++)half[k]=Math.max(half[k],Math.abs(v[i+k]));if(!batch.textured)return;
   for(let i=0;i<v.length;i+=24){if(dot(Array.from(v.slice(i+3,i+6)),n)<.999)continue;const a=Array.from(v.slice(i,i+3)),b=Array.from(v.slice(i+8,i+11)),c=Array.from(v.slice(i+16,i+19)),plane=Math.round(dot(a,n)*1000)/1000;
    let bucket=planes.get(plane);if(!bucket){bucket={plane,area:0,items:[]};planes.set(plane,bucket);}bucket.area+=Math.hypot(...cross(sub(b,a),sub(c,a)))*.5;bucket.items.push({batch:index,offset:i});
   }
  });
  const panel=[...planes.values()].sort((a,b)=>b.area/(1+100*(b.plane-dot(point,n))**2)-a.area/(1+100*(a.plane-dot(point,n))**2))[0];
  if(!panel)return {batches:source,model:model(source,'freighter-part'),added:0};
  const level=Math.min(3,Math.max(0,Math.floor(Math.log(384/panel.items.length)/Math.log(4)))),extents=[Infinity,-Infinity,Infinity,-Infinity],selected=new Set(panel.items.map(item=>item.batch+':'+item.offset));
  for(const item of panel.items){const v=source[item.batch].vertices;for(let i=item.offset;i<item.offset+24;i+=8){const p=Array.from(v.slice(i,i+3)),u=dot(p,t),w=dot(p,side);extents[0]=Math.min(extents[0],u);extents[1]=Math.max(extents[1],u);extents[2]=Math.min(extents[2],w);extents[3]=Math.max(extents[3],w);}}
  const anchor=variant===1?half.map((h,k)=>Math.sign(point[k]||1)*h*.88):point;
  /** @param {number[]} p */const cut=p=>{const d=sub(p,anchor);return variant===2&&Math.abs(dot(p,n)-panel.plane)<.08&&Math.abs(dot(d,n))<.4&&Math.abs(dot(d,t))<.38&&Math.abs(dot(d,side))<1.35;};
  /** @param {number[]} row */function warp(row){const p=row.slice(0,3),d=sub(p,anchor),u=dot(d,t),v=dot(d,side),depth=dot(d,n),s=dot(p,t),w=dot(p,side),rim=clamp((s-extents[0])/.35)*clamp((extents[1]-s)/.35)*clamp((w-extents[2])/.35)*clamp((extents[3]-w)/.35),weight=Math.max(0,1-(u/3.8)**2-(v/2.6)**2)*Math.exp(-Math.abs(depth)/.6)*rim,dent=variant===0?.48*(.6+.4*Math.cos(u*2.5)):variant===1?.7:.28;
   return p.map((x,k)=>x-n[k]*dent*weight+(variant===2?(t[k]*Math.sign(u)*.16+side[k]*Math.sin(u*2.6)*.16)*weight:0)).concat(row.slice(3));
  }
  /** @param {number[]} a @param {number[]} b */const mid=(a,b)=>a.map((v,k)=>(v+b[k])*.5);
  const output=/** @type {Batch[]} */([]),skinRows=/** @type {number[]} */([]);
  source.forEach((batch,index)=>{const rest=/** @type {number[]} */([]),skin=/** @type {number[]} */([]),v=batch.vertices;
   /** @param {number[]} a @param {number[]} b @param {number[]} c @param {number} depth */function tri(a,b,c,depth){
    if(depth<level){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);tri(a,ab,ca,depth+1);tri(ab,b,bc,depth+1);tri(ca,bc,c,depth+1);tri(ab,bc,ca,depth+1);return;}
    if(cut(a.slice(0,3).map((x,k)=>(x+b[k]+c[k])/3)))return;
    const rows=[warp(a),warp(b),warp(c)],face=unit(cross(sub(rows[1].slice(0,3),rows[0].slice(0,3)),sub(rows[2].slice(0,3),rows[0].slice(0,3))));
    for(const row of rows){row.splice(3,3,...face);skin.push(...row);skinRows.push(...row);}
   }
   for(let i=0;i<v.length;i+=24){if(selected.has(index+':'+i))tri(Array.from(v.slice(i,i+8)),Array.from(v.slice(i+8,i+16)),Array.from(v.slice(i+16,i+24)),0);else for(let k=0;k<24;k++)rest.push(v[i+k]);}
   if(rest.length)output.push({...batch,vertices:new Float32Array(rest)});if(skin.length)output.push({...batch,vertices:new Float32Array(skin)});
  });
  if(variant===2){const h=half.map((x,k)=>Math.max(.2,x-(k===1?.6:.9))),rows=/** @type {number[]} */([]);for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
   const a=(axis+1)%3,b=(axis+2)%3,normal=[0,0,0];normal[axis]=sign;const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(pair=>{const p=[0,0,0];p[axis]=sign*h[axis];p[a]=pair[0]*h[a];p[b]=pair[1]*h[b];return p;});
   for(const i of sign>0?[0,1,2,0,2,3]:[0,2,1,0,3,2])rows.push(...corners[i],...normal,0,0);
  }output.push({vertices:new Float32Array(rows),color:[.10,.13,.15],textured:false,finish:0});}
  const added=output.reduce((s,b)=>s+b.vertices.length/24,0)-before,budget=Math.max(0,Math.min(96,400-added)),wear=/** @type {number[]} */([]),stride=Math.max(1,Math.ceil(skinRows.length/24/Math.max(1,budget)));
  for(let tri=0;tri<skinRows.length/24&&wear.length/24<budget;tri+=stride)for(let j=0;j<3;j++){const i=tri*24+j*8,p=skinRows.slice(i,i+3),face=skinRows.slice(i+3,i+6),u=clamp((dot(p,t)-extents[0])/(extents[1]-extents[0]||1)),v=clamp((dot(p,side)-extents[2])/(extents[3]-extents[2]||1));wear.push(...p.map((x,k)=>x+face[k]*.012),...face,(variant+u)/3,1-v);}
  if(wear.length)output.push({vertices:new Float32Array(wear),color:[1,1,1],textured:false,finish:0,wear:true});
  return {batches:output,model:model(output.filter(b=>!b.wear),'freighter-part'),added:added+wear.length/24};
 }
 DW.freighterGeometry={deform,model};
}());
