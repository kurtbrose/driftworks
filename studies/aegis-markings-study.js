/* Candidate 03: painted identification on existing hangar roof faces. */
(function(){
 'use strict';
 window.AegisMarkingsStudy=async function(batches,source,image,U){
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;
  const c=canvas.getContext('2d');c.drawImage(image,0,0);
  window.AegisSurfaceStudy.paintMarkings(c);
  const texture=new Image();texture.src=canvas.toDataURL();await texture.decode();
  const center=source.hangars[0].position[0];let faces=0;
  const result=batches.map((b,index)=>{
   if(!b.texture)return b;
   const vertices=new Float32Array(b.vertices),stride=b.stride||6;
   if(index<source.batches.length)for(let i=0;i<vertices.length;i+=stride*3){
    const eligible=[0,1,2].every(j=>{const k=i+j*stride;return vertices[k]*U-center>-63&&vertices[k]*U-center< -31&&vertices[k+2]*U>32&&vertices[k+5]>.4&&Math.abs(vertices[k+4])>.4;});
    if(!eligible)continue;faces++;
    for(let j=0;j<3;j++){const k=i+j*stride;const u=(vertices[k]*U-center+63)/32;vertices[k+6]=(1024+16+(vertices[k+4]>0?1-u:u)*480)/2048;vertices[k+7]=(512+16+(38-vertices[k+2]*U)/6*480)/1024;}
   }
   return Object.assign({},b,{vertices,texture});
  });
  if(!faces)throw new Error('No hangar roof faces received markings');
  return result;
 };
})();
