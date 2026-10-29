(function(){'use strict';
 const texture=new Image();texture.src='aegis-armor-atlas-v2.png';
 window.AegisArmorStudy={ready:texture.decode(),apply:function(batches){
  const asset=window.Driftworks.aegisFlightAsset,U=window.Driftworks.sim.METERS_PER_UNIT,groups=new Map();
  for(const r of window.AegisArmorWrapData.records){let index=r.batch;if(index<0){index=asset.batches.length+(asset.interiors||[]).length;for(let i=0;i<r.turret;i++)index+=asset.turrets[i].batches.length;index+=r.part;}if(!groups.has(index))groups.set(index,[]);groups.get(index).push(r);}
  return batches.map(function(b,index){const records=groups.get(index);if(!records)return b;const stride=b.stride||6,out=[];let cursor=0;
   for(const r of records.sort((a,b)=>a.start-b.start)){const first=r.start/6,last=first+r.length/6;for(let i=cursor;i<first;i++){out.push(...b.vertices.subarray(i*stride,i*stride+6),stride===8?b.vertices[i*stride+6]:.875,stride===8?b.vertices[i*stride+7]:.5);}for(let i=0;i<r.vertices.length;i+=8)for(let k=0;k<8;k++)out.push(r.vertices[i+k]/(k<3?U:1));cursor=last;}
   for(let i=cursor;i<b.vertices.length/stride;i++)out.push(...b.vertices.subarray(i*stride,i*stride+6),stride===8?b.vertices[i*stride+6]:.875,stride===8?b.vertices[i*stride+7]:.5);
   return Object.assign({},b,{vertices:new Float32Array(out),stride:8,texture});
  });
 }};
})();
