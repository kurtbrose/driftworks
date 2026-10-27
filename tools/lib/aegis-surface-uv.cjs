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
module.exports={meshUV};
