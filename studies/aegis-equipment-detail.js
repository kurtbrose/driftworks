import * as T from 'three';
import {bridge as originalBridge,attach as originalAttach,box,loft,armor,pale,dark,trim,gold,amber} from 'aegis-parts';

// The same nine-metres-per-unit construction convention as the capital kit.
const arraySurface=new T.MeshStandardMaterial({color:0x456575,roughness:.75,metalness:.25});
const windowGlass=new T.MeshStandardMaterial({color:0x87a7b5,emissive:0x54778b,emissiveIntensity:.6,roughness:.35,metalness:.25});
function group(parent,name,position=[0,0,0]){const g=new T.Group();g.name=name;g.position.set(...position);parent.add(g);return g;}
function beam(parent,a,b,width=.18,material=trim){const from=new T.Vector3(...a),to=new T.Vector3(...b),d=to.clone().sub(from);const mesh=new T.Mesh(new T.CylinderGeometry(width*.5,width*.5,d.length(),8),material);mesh.position.copy(from.add(to).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());parent.add(mesh);return mesh;}
function dish(parent,position,radius=1.1,tilt=.5){
 const root=group(parent,'communications dish',position),vertices=[];
 const point=(ring,angle)=>{const r=radius*ring/4;return new T.Vector3(Math.cos(angle)*r,.28*(ring/4)**2,Math.sin(angle)*r);};
 const triangle=(a,b,c)=>{for(const p of [a,b,c,c,b,a])vertices.push(...p.toArray());};
 for(let ring=0;ring<4;ring++)for(let i=0;i<16;i++){const a=i*Math.PI/8,b=(i+1)*Math.PI/8,p=point(ring,a),q=point(ring+1,a),r=point(ring+1,b),s=point(ring,b);triangle(p,r,q);if(ring)triangle(p,s,r);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();root.add(new T.Mesh(geometry,pale));root.rotation.x=tilt;root.rotation.z=.35;
 beam(root,[0,-.55,0],[0,0,0],.22);beam(root,[-radius*.7,.14,0],[0,.65,0],.08);beam(root,[radius*.7,.14,0],[0,.65,0],.08);box(root,0,.65,0,.22,.2,.22,gold);return root;
}
function arrayHead(parent,y,width=3.4,height=2.2){
 const root=group(parent,'four-face sensor array',[0,y,0]);
 loft(root,[[-width/2,width*.88,height*.9],[-width*.4,width,height],[width*.4,width,height],[width/2,width*.88,height*.9]],trim);
 for(const side of [-1,1]){
  box(root,0,0,side*(width/2+.03),width*.72,height*.72,.08,arraySurface);
  box(root,side*(width/2+.03),0,0,.08,height*.72,width*.64,arraySurface);
  for(const division of [-1,0,1]){
   box(root,division*width*.18,0,side*(width/2+.085),.035,height*.68,.025,trim);
   box(root,side*(width/2+.085),0,division*width*.16,.025,height*.68,.035,trim);
  }
 }
 return root;
}
export function detailedSensor(parent,x=0,y=0,z=0){
 const root=group(parent,'sensor mast / detailed',[x,y,z]);root.userData.equipment='sensor';
 box(root,0,.3,0,4,.6,4,trim);const body=loft(root,[[-1.5,2.8,1.4],[-1.1,3.2,1.6],[1.1,3.2,1.6],[1.5,2.8,1.4]],armor);body.position.y=1.1;
 box(root,0,3.55,0,.65,4.1,.65,dark);
 for(const side of [-1,1])for(const flank of [-1,1])beam(root,[side*1.4,.65,flank*1.4],[side*.3,4.65,flank*.3],.2);
 arrayHead(root,5.2);
 beam(root,[0,6.3,0],[0,8.45,0],.28);
 const dome=new T.Mesh(new T.SphereGeometry(.68,16,10),pale);dome.name='sensor radome';dome.position.y=8.55;root.add(dome);
 beam(root,[0,6.8,-3.5],[0,6.8,3.5],.18);for(const side of [-1,1]){beam(root,[0,5.6,side*.3],[0,6.8,side*2.8],.12);beam(root,[0,6.8,side*3.4],[0,7.85,side*3.4],.1);box(root,0,7.85,side*3.4,.18,.22,.18,gold);}
 beam(root,[1.1,1.8,1],[1.45,3.6,2.8],.22);dish(root,[1.45,3.6,2.8],1.05,.6);
 for(const side of [-1,1]){box(root,side*1.15,1.25,0,.6,.65,1.7,dark);for(const zz of [-.45,0,.45])box(root,side*1.47,1.25,zz,.06,.45,.06,trim);}
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
 box(mast,0,5.5,0,.6,3.6,.65,dark);
 for(const side of [-1,1])for(const flank of [-1,1])beam(mast,[side*.75,3.65,flank*.65],[side*.18,6.6,flank*.18],.16);
 beam(mast,[0,7,-2.9],[0,7,2.9],.2);for(const side of [-1,1]){beam(mast,[0,5.8,side*.2],[0,7,side*2.4],.13);beam(mast,[0,7,side*2.8],[0,8.4,side*2.8],.1);box(mast,0,8.4,side*2.8,.18,.25,.18,gold);}
 arrayHead(mast,7.25,1.75,1.3);beam(mast,[0,7.9,0],[0,9,0],.18);
 const dome=new T.Mesh(new T.SphereGeometry(.38,12,8),pale);dome.name='command radome';dome.position.y=9;mast.add(dome);
 for(const side of [-1,1]){beam(mast,[-.7,4.1,side*.5],[-1.3,5.1,side*1.8],.2);dish(mast,[-1.3,5.1,side*1.8],.8,side*.65);box(root,1.15,3.35,side*1.1,.7,.65,.55,trim);}
 return root;
}
export function detailedAttachment(parent,kind,side,gap,last){
 if(kind!=='sensor')return originalAttach(parent,kind,side,gap,last);
 const mount=group(parent,side===1?'dorsal_socket':'ventral_socket',[side===1&&last?-3.5:0,side*gap*.65,0]);if(side===-1)mount.rotation.x=Math.PI;
 box(mount,0,4.03,0,2,.16,2,trim);detailedSensor(mount,0,4.1,0);
}
