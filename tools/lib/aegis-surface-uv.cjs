'use strict';
// One atlas, with padded 512px tiles. UVs are authored per source mesh before
// material batching, so panels do not stretch across unrelated ship sections.
function meshUV(points,color){
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const p of points)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[k]);hi[k]=Math.max(hi[k],p[k]);}
 const span=hi.map((v,k)=>v-lo[k]),brightness=Math.max(...color),out=[];
 // Blue/amber lamps and small hardware retain their original flat finish.
 const neutral=Math.max(...color)-Math.min(...color)<.22;
 for(const p of points){
   const axis=Math.abs(p[4])>=Math.abs(p[5])?1:2,vertical=axis===1?2:1;
   const broad=span[0]>2&&span[vertical]>1.3&&Math.abs(p[3])<.75;
   let tile=7;
   if(neutral&&broad)tile=brightness>.28?(axis===1?0:1):brightness<.05?2:3;
   // Broad armor receives two restrained layout variants along the hull.
   if(tile<2&&Math.floor((lo[0]+80)/16)%3===1)tile+=4;
   const u=tile===7?.5:(p[0]-lo[0])/Math.max(.001,span[0]);
   const v=tile===7?.5:(p[vertical]-lo[vertical])/Math.max(.001,span[vertical]);
   out.push(((tile%4)*512+12+u*488)/2048,(Math.floor(tile/4)*512+12+v*488)/1024);
 }
 return out;
}
// Painted identification uses existing triangles on both hangar roof bevels.
function hangarMarkings(vertices,uv,hangars){
 const out=uv.slice();
 for(const h of hangars)for(let i=0;i<vertices.length;i+=18){
  const eligible=[0,1,2].every(j=>{const k=i+j*6;return vertices[k]-h.position[0]>-63&&vertices[k]-h.position[0]<-31&&vertices[k+2]>32&&vertices[k+5]>.4&&Math.abs(vertices[k+4])>.4;});
  if(!eligible)continue;
  for(let j=0;j<3;j++){const k=i+j*6,u=(vertices[k]-h.position[0]+63)/32;out[k/3]=(1024+16+(vertices[k+4]>0?1-u:u)*480)/2048;out[k/3+1]=(512+16+(38-vertices[k+2])/6*480)/1024;}
 }
 return out;
}
module.exports={meshUV,hangarMarkings};
