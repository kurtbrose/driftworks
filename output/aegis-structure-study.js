/* Review only: recover structural face UVs and consolidate one graphite finish. */
(function(){'use strict';window.AegisStructureStudy=async function(original,data,U){
 const image=new Image();image.src='aegis-structure-v1.png';await image.decode();const keep=new Map(),out=[];
 for(const r of data.records){const b=original[r.batch],stride=b.stride||6;if(!keep.has(r.batch))keep.set(r.batch,new Set());const omit=keep.get(r.batch);
 for(let j=0;j<r.length/6;j++){const k=r.start/6+j;omit.add(k);for(let a=0;a<6;a++)out.push(b.vertices[k*stride+a]);out.push(r.uv[j*2],r.uv[j*2+1]);}}
 const candidate=original.map((b,i)=>{if(!keep.has(i))return b;const omit=keep.get(i),stride=b.stride||6,values=[];for(let j=0;j<b.vertices.length/stride;j++)if(!omit.has(j))values.push(...b.vertices.subarray(j*stride,j*stride+stride));return Object.assign({},b,{vertices:new Float32Array(values)});});
 candidate.push(Object.assign({},original[0],{vertices:new Float32Array(out),stride:8,texture:image,color:[.32,.35,.37],finish:0,staticGeometry:true}));return candidate;
};})();
