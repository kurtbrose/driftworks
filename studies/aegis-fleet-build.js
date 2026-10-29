// Static production ship snapshot with only the selected standard armor replaced.
(function(root){
 'use strict';
 function build(asset,bevel,normal,metadata){
  const dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0),planes=[];
  for(let i=0;i<bevel.original.length;i+=18){const n=bevel.original.slice(i+3,i+6),d=dot(n,bevel.original.slice(i,i+3));if(!planes.some(p=>dot(p.n,n)>.999999&&Math.abs(p.d-d)<.001))planes.push({n,d});}
  const extent=[0,1,2].map(k=>Math.max(...bevel.original.filter((_,i)=>i%6===k).map(Math.abs))),removed=metadata.centers.map(()=>0),rest=[];
  function batch(b,pivot,finish,filter){
   const vertices=[],uv=finish?.uv;
   for(let i=0;i<b.vertices.length;i+=18){
    const points=[0,6,12].map(j=>b.vertices.slice(i+j,i+j+3).map((x,k)=>x+pivot[k]));
    let owner=-1;
    if(filter)owner=metadata.centers.findIndex(c=>{const local=points.map(p=>p.map((x,k)=>x-c[k]));return local.every(p=>p.every((x,k)=>Math.abs(x)<=extent[k]+.002))&&planes.some(f=>local.every(p=>Math.abs(dot(f.n,p)-f.d)<.002));});
    if(owner>=0){removed[owner]++;continue;}
    for(let j=0;j<3;j++){vertices.push(...points[j],...b.vertices.slice(i+j*6+3,i+j*6+6));if(uv)vertices.push(...uv.slice(i/3+j*2,i/3+j*2+2));}
   }
   if(vertices.length)rest.push({vertices,color:finish?.color||b.color,stride:uv?8:6,atlas:uv?(finish.atlas||asset.surface.atlas):null,finish:finish?.shader||0});
  }
  asset.batches.forEach((b,i)=>batch(b,[0,0,0],asset.surface?.batches[i],true));
  (asset.interiors||[]).forEach(b=>batch(b,[0,0,0],b.finish,false));
  asset.turrets.forEach((t,i)=>t.batches.forEach((b,j)=>batch(b,t.position,asset.surface?.turrets?.[i]?.[j],false)));
  asset.engines.forEach(e=>e.batches.forEach(b=>batch(b,e.position,b.finish,false)));
  if(removed.some(n=>n<60))throw new Error('Missing production armor: '+removed);
  const armor={};for(const mode of ['weighted','baked']){const source=mode==='baked'?normal.vertices:bevel.weighted,stride=mode==='baked'?8:6,vertices=[];for(const c of metadata.centers)for(let i=0;i<source.length;i+=stride)vertices.push(...source.slice(i,i+3).map((x,k)=>x+c[k]),...source.slice(i+3,i+stride));armor[mode]={vertices,stride,color:[.52,.52,.52],finish:mode==='baked'?-3:0};}
  // Freeze-compatible material batching, equal in both variants; articulated
  // turret meshes retain their authored pose in this render-only benchmark.
  const groups=new Map();for(const b of rest){const key=JSON.stringify([b.color,b.stride,b.atlas,b.finish]);if(!groups.has(key))groups.set(key,{...b,vertices:[]});const g=groups.get(key);for(const v of b.vertices)g.vertices.push(v);}
  return {rest:[...groups.values()],armor,removed,bands:metadata.centers.length};
 }
 if(typeof module!=='undefined')module.exports={build};else root.AegisFleetBuild={build};
})(typeof window==='undefined'?globalThis:window);
