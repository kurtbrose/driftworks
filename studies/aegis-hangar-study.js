/* Review adapter: leave production gameplay and articulated ownership intact. */
(function(){
 'use strict';
 window.AegisHangarStudy=async function(original,data,atlas,U){
  const textures={};
  await Promise.all(['deck','bulkhead'].map(async kind=>{const image=new Image();image.src=window.Driftworks.assetUrl('../assets/ships/aegis-kit/hangar-v1/'+kind+'.png');await image.decode();textures[kind]=image;}));
  const pose=original[0],common={origin:pose.origin,basis:pose.basis,staticGeometry:true};
  function vertices(values,uv){
   const result=new Float32Array(values.length/6*(uv?8:6));
   for(let i=0,j=0;i<values.length;i+=6,j+=uv?8:6){for(let k=0;k<6;k++)result[j+k]=k<3?values[i+k]/U:values[i+k];if(uv){result[j+6]=uv[i/3];result[j+7]=uv[i/3+1];}}
   return result;
  }
  const hull=data.batches.map((b,i)=>{const f=data.surface.batches[i];return Object.assign({},common,{vertices:vertices(b.vertices,f&&f.uv),color:f?f.color:b.color},f?{stride:8,texture:atlas}:{});});
  const interior=data.interiors.map(b=>Object.assign({},common,{vertices:vertices(b.vertices,b.kind==='ceiling'?null:b.uv),color:b.kind==='ceiling'?[.23,.25,.26]:[.85,.85,.85]},b.kind==='ceiling'?{}:{stride:8,texture:textures[b.kind]}));
  return hull.concat(interior,original.slice(window.Driftworks.aegisFlightAsset.batches.length));
 };
})();
