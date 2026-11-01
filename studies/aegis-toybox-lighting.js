import * as T from 'three';
export const lightingPresets=[
 {id:'studio',name:'Studio',ambient:1.8,colors:[0xffe2b1,0xabcfe7,0xb3c5cb],powers:[3.4,1.7,.8],directions:[[0,2,1],[-1,.5,-1],[0,-1,.3]]},
 {id:'grazing',name:'White grazing',ambient:.14,colors:[0xffffff,0xcbdfff,0xffffff],powers:[7,.7,.12],directions:[[1,.65,-1],[-1,.15,1],[0,-1,.3]]},
 {id:'warm-cool',name:'Amber / blue',ambient:.18,colors:[0xffb55c,0x529dff,0xffffff],powers:[5.5,4,.2],directions:[[1,.6,-1],[-1,.3,1],[0,-1,.3]]},
 {id:'neon',name:'Magenta / cyan',ambient:.12,colors:[0xff4ba5,0x32e7ff,0xffffff],powers:[5,4.5,.15],directions:[[1,.6,-1],[-1,.2,1],[0,-1,.3]]},
 {id:'rim',name:'Hard rim',ambient:.08,colors:[0xffffff,0xffc48a,0x95bfff],powers:[8,1.2,.3],directions:[[.2,.2,-1],[-1,.3,1],[1,-.4,.4]]}
];
export function createReviewLighting(scene){
 const ambient=new T.HemisphereLight(0xc3d2df,0x39322a,1.8);scene.add(ambient);
 const lights=Array.from({length:3},()=>{const l=new T.DirectionalLight();scene.add(l,l.target);return l;});
 const center=new T.Vector3(),size=new T.Vector3(),direction=new T.Vector3();
 function update(id,angle,bounds){
  const preset=lightingPresets.find(p=>p.id===id)||lightingPresets[0];ambient.intensity=preset.ambient;
  bounds.getCenter(center);bounds.getSize(size);const radius=Math.max(10,size.length()),rotation=angle*Math.PI/180;
  lights.forEach((light,i)=>{light.color.setHex(preset.colors[i]);light.intensity=preset.powers[i];direction.set(...preset.directions[i]).applyAxisAngle(new T.Vector3(0,1,0),rotation);light.position.copy(center).addScaledVector(direction,radius);light.target.position.copy(center);light.target.updateMatrixWorld();});
 }
 return {update};
}
