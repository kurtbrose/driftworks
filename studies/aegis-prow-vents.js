import * as T from 'three';
import {trim} from 'aegis-parts';

// A review-only replacement for P01's existing sixteen roof inserts.
export const ventBaseMaterial=trim.clone();
ventBaseMaterial.name='P01 roof inserts / original';
ventBaseMaterial.userData.preserveAuthorUV=true;
let ventFinish;
export function ventCandidateMaterial(){
 if(ventFinish)return ventFinish;
 const size=256,data=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  let color=[66,79,85];
  const edge=Math.min(x,y,255-x,255-y);
  if(edge<5)color=[30,39,44];else if(edge<10)color=[118,132,138];else if(edge<15)color=[52,66,73];
  else{
   const slot=Math.floor((x-16)/32),local=(x-16)%32;
   if(slot>=0&&slot<7){
    color=local<6?[112,129,136]:local<11?[75,94,104]:local<23?[16,24,30]:[40,55,64];
    if(y<24||y>231)color=[49,65,73];
   }
  }
  // Four fastener heads and small ochre alignment tabs live inside this insert.
  for(const cx of [20,235])for(const cy of [20,235]){const d=(x-cx)**2+(y-cy)**2;if(d<20)color=d<5?[27,36,40]:[151,162,164];}
  if((y>=12&&y<17||y>238&&y<243)&&x>111&&x<145)color=[174,134,67];
  const i=(y*size+x)*4;data[i]=color[0];data[i+1]=color[1];data[i+2]=color[2];data[i+3]=255;
 }
 const map=new T.DataTexture(data,size,size,T.RGBAFormat);map.colorSpace=T.SRGBColorSpace;map.magFilter=T.LinearFilter;map.minFilter=T.LinearMipmapLinearFilter;map.generateMipmaps=true;map.needsUpdate=true;
 ventFinish=trim.clone();ventFinish.name='P01 louvered vent';ventFinish.color.setHex(0xffffff);ventFinish.map=map;ventFinish.roughness=.72;ventFinish.metalness=.45;ventFinish.userData.finishRole='prow-vent';return ventFinish;
}
export function prepareProwVents(root){
 let count=0;
 root.traverse(o=>{const p=o.geometry?.parameters;if(o.isMesh&&o.geometry.type==='BoxGeometry'&&Math.abs(p.width-37*.065)<1e-6&&Math.abs(p.height-.12)<1e-6&&o.position.y>0){o.material=ventBaseMaterial;o.userData.prowVent=true;count++;}});
 root.userData.prowVentCount=count;return root;
}
