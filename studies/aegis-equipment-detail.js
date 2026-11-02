import * as T from 'three';
import {bridge as originalBridge,attach as originalAttach,box,loft,armor,pale,dark,trim,amber} from 'aegis-parts';

// The same nine-metres-per-unit construction convention as the capital kit.
const arraySurface=new T.MeshStandardMaterial({color:0x456575,roughness:.75,metalness:.25});
const windowGlass=new T.MeshStandardMaterial({color:0x87a7b5,emissive:0x54778b,emissiveIntensity:.6,roughness:.35,metalness:.25});
function group(parent,name,position=[0,0,0]){const g=new T.Group();g.name=name;g.position.set(...position);parent.add(g);return g;}
// Broad enclosed tiers carry the arrays; no exposed antenna scaffolding.
function armoredTier(parent,name,y,length,width,height,material=armor){
 const tier=loft(parent,[[-length/2,width*.82,height],[-length/2+.25,width,height],[length/2-.25,width,height],[length/2,width*.82,height]],material);tier.name=name;tier.position.y=y;return tier;
}
function integratedArrays(parent,y,length,width,height){
 const root=group(parent,'four-face sensor array',[0,y,0]);
 for(const side of [-1,1]){
  box(root,0,0,side*(width/2+.025),length*.66,height,.06,dark);
  box(root,0,0,side*(width/2+.065),length*.58,height*.77,.035,arraySurface);
  box(root,side*(length/2+.025),0,0,.06,height,width*.55,dark);
  box(root,side*(length/2+.065),0,0,.035,height*.77,width*.47,arraySurface);
 }
 return root;
}
export function detailedSensor(parent,x=0,y=0,z=0){
 const root=group(parent,'sensor mast / detailed',[x,y,z]);root.userData.equipment='sensor';
 box(root,0,.22,0,4.4,.44,4.2,trim);
 armoredTier(root,'armored sensor base',1,4.2,4,1.25);
 armoredTier(root,'enclosed sensor deckhouse',2.05,3.4,3.2,1.15);
 integratedArrays(root,2.12,3.4,3.2,.68);
 armoredTier(root,'sensor roof cap',2.76,3.65,3.4,.22,pale);
 armoredTier(root,'enclosed sensor mast',3.12,1.65,1.5,.55,trim);
 integratedArrays(root,3.13,1.65,1.5,.28);
 box(root,.15,3.48,0,1.05,.16,.9,pale);
 for(const side of [-1,1]){
  box(root,.5,1,side*2.03,1.1,.54,.08,dark);
  for(let i=0;i<4;i++)box(root,.12+i*.24,1,side*2.09,.08,.42,.05,trim);
 }
 return root;
}
function commandWindows(root){
 let count=0;
 for(const [yy,w,l,h] of [[.6,6,5,1.2],[1.6,4.8,4,1],[2.55,3.6,3,1],[3.35,2.7,2.2,.65]]){
  for(const offset of h>=1?[-.2,.12]:[.1]){
   const y=yy+offset;
   for(const side of [-1,1]){
    box(root,0,y,side*(w/2+.045),l*.76,.14,.045,dark);
    const n=Math.floor(l*.76/.25);
    for(let i=0;i<n;i++){const x=(i-(n-1)/2)*.25;const pane=box(root,x,y,side*(w/2+.085),.135,.075,.025,(i+Math.round(yy*10))%7===0?dark:windowGlass);pane.name='command window';count++;}
    box(root,side*(l/2+.025),y,0,.04,.14,w*.55,dark);
    const front=Math.floor(w*.55/.25);
    for(let i=0;i<front;i++){const z=(i-(front-1)/2)*.25;const pane=box(root,side*(l/2+.06),y,z,.025,.075,.135,i%9===0?amber:windowGlass);pane.name='command window';count++;}
   }
  }
 }
 root.userData.windowCount=count;
}
export function detailedBridge(parent){
 originalBridge(parent);const root=parent.getObjectByName('command_citadel');
 for(const child of root.children.slice())if(child.isMesh&&child.geometry.type==='CylinderGeometry')root.remove(child);
 root.userData.equipment='command';commandWindows(root);
 const mast=group(root,'command communications mast');
 armoredTier(mast,'enclosed command mast',4.12,2.2,2,.9);
 integratedArrays(mast,4.15,2.2,2,.48);
 armoredTier(mast,'command mast roof',4.65,2.4,2.2,.18,pale);
 armoredTier(mast,'compact upper sensor',4.94,1.15,1,.42,trim);
 box(mast,0,5.2,0,1.25,.13,1.1,pale);
 for(const side of [-1,1]){
  // Solid bridge wings grow directly out of the upper occupied deck.
  box(root,-.35,2.85,side*1.75,1.65,.24,.65,trim);
  box(root,-.35,3.03,side*2.04,1.35,.18,.07,dark);
  for(let i=0;i<5;i++)box(root,-.85+i*.25,3.03,side*2.09,.135,.075,.025,windowGlass);
  box(root,1.15,3.35,side*1.1,.7,.65,.55,trim);
 }
 return root;
}
export function detailedAttachment(parent,kind,side,gap,last){
 if(kind!=='sensor')return originalAttach(parent,kind,side,gap,last);
 const mount=group(parent,side===1?'dorsal_socket':'ventral_socket',[side===1&&last?-3.5:0,side*gap*.65,0]);if(side===-1)mount.rotation.x=Math.PI;
 box(mount,0,4.03,0,2,.16,2,trim);detailedSensor(mount,0,4.1,0);
}
