import fs from 'node:fs';
import {registerHooks} from 'node:module';
import * as THREE from '../vendor/three/build/three.module.js';
registerHooks({resolve(specifier,context,next){return next(specifier==='three'?new URL('../vendor/three/build/three.module.js',import.meta.url).href:specifier,context);}});
globalThis.ProgressEvent=class ProgressEvent {constructor(type,values){Object.assign(this,{type},values);}};
const {GLTFLoader}=await import('../vendor/three/examples/jsm/loaders/GLTFLoader.js');
async function load(path){
 const b=fs.readFileSync(new URL('../'+path,import.meta.url)),len=b.readUInt32LE(12),g=JSON.parse(b.subarray(20,20+len));
 const bin=b.subarray(28+len);g.buffers[0].uri='data:application/octet-stream;base64,'+bin.toString('base64');
 for(const m of g.materials||[]) {if(m.pbrMetallicRoughness)delete m.pbrMetallicRoughness.baseColorTexture;delete m.normalTexture;}
 return new GLTFLoader().parseAsync(JSON.stringify(g),'');
}
const astronaut=await load('assets/characters/quaternius-astronaut/original/Astronaut by Quaternius - 3hC2i0CTuO.glb');
const root=astronaut.scene,mixer=new THREE.AnimationMixer(root);
mixer.clipAction(astronaut.animations.find(c=>c.name.endsWith('|Idle_Neutral'))).play();mixer.update(.2);root.updateMatrixWorld(true);
const standing=new THREE.Box3().setFromObject(root),height=standing.max.y-standing.min.y;
function bone(name){return root.getObjectByName(name);}
function aim(name,childName,direction){
 root.updateMatrixWorld(true);const b=bone(name),child=bone(childName),q=b.getWorldQuaternion(new THREE.Quaternion());
 const current=child.getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize();
 const delta=new THREE.Quaternion().setFromUnitVectors(current,new THREE.Vector3(...direction).normalize());
 const parent=b.parent.getWorldQuaternion(new THREE.Quaternion()).invert();b.quaternion.copy(parent.multiply(delta.multiply(q)));root.updateMatrixWorld(true);
}
// This rig has root-parented foot controls, not feet parented to the shins.
// Aim each shin along its own end bone, then move its independent foot with it.
const legRest={};
for(const side of ['L','R']){
 const shin=bone('LowerLeg'+side),end=bone('LowerLeg'+side+'_end'),foot=bone('Foot'+side);
 legRest[side]={
  thigh:bone('UpperLeg'+side).getWorldPosition(new THREE.Vector3()).distanceTo(shin.getWorldPosition(new THREE.Vector3())),
  shin:shin.getWorldPosition(new THREE.Vector3()).distanceTo(end.getWorldPosition(new THREE.Vector3())),
  ankleOffset:foot.getWorldPosition(new THREE.Vector3()).sub(end.getWorldPosition(new THREE.Vector3())).applyQuaternion(shin.getWorldQuaternion(new THREE.Quaternion()).invert())
 };
}
for(const side of ['L','R']){
 aim('UpperLeg'+side,'LowerLeg'+side,[0,0,-1]);
 aim('LowerLeg'+side,'LowerLeg'+side+'_end',[0,-1,0]);
 const shin=bone('LowerLeg'+side),foot=bone('Foot'+side);
 const ankle=bone('LowerLeg'+side+'_end').getWorldPosition(new THREE.Vector3());
 ankle.add(legRest[side].ankleOffset.clone().applyQuaternion(shin.getWorldQuaternion(new THREE.Quaternion())));
 foot.position.copy(foot.parent.worldToLocal(ankle));root.updateMatrixWorld(true);
 aim('Foot'+side,'Foot'+side+'_end',[0,0,-1]);
 aim('UpperArm'+side,'LowerArm'+side,[side==='L'?.1:-.1,-.8,-.3]);aim('LowerArm'+side,'Wrist'+side,[0,-.1,-1]);
}
// Fail the bake rather than silently stretching a limb if the source rig changes.
for(const side of ['L','R']){
 const hip=bone('UpperLeg'+side).getWorldPosition(new THREE.Vector3()),knee=bone('LowerLeg'+side).getWorldPosition(new THREE.Vector3()),ankle=bone('LowerLeg'+side+'_end').getWorldPosition(new THREE.Vector3());
 if(Math.abs(hip.distanceTo(knee)-legRest[side].thigh)>1e-5 || Math.abs(knee.distanceTo(ankle)-legRest[side].shin)>1e-5)throw new Error('Seated pose changed leg length: '+side);
 if(Math.abs(ankle.y-knee.y+legRest[side].shin)>1e-5)throw new Error('Shin is not vertical: '+side);
 const foot=bone('Foot'+side).getWorldPosition(new THREE.Vector3());
 if(foot.distanceTo(ankle)>.15)throw new Error('Detached seated foot: '+side);
}
root.updateMatrixWorld(true);const hip=bone('Hips').getWorldPosition(new THREE.Vector3());
function bake(root,transform){
 const groups=[];root.updateMatrixWorld(true);
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;if(mesh.isSkinnedMesh)mesh.skeleton.update();
  const geo=mesh.geometry,idx=geo.index,mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  for(const range of geo.groups.length?geo.groups:[{start:0,count:idx?idx.count:geo.attributes.position.count,materialIndex:0}]){
   const mat=mats[range.materialIndex||0],vertices=[];
   for(let i=range.start;i<range.start+range.count;i+=3){
    const tri=[0,1,2].map(k=>transform(mesh.getVertexPosition(idx?idx.getX(i+k):i+k,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)));
    const n=new THREE.Vector3().subVectors(tri[1],tri[0]).cross(new THREE.Vector3().subVectors(tri[2],tri[0])).normalize();
    for(const p of tri)vertices.push(...p.toArray(),...n.toArray());
   }
   const color=mat.color.toArray();groups.push({vertices:vertices.map(v=>Math.round(v*1e5)/1e5),color,name:mat.name});
  }
 });return groups;
}
const crew=bake(root,p=>new THREE.Vector3((p.x-hip.x)*1.8/height,-(p.z-hip.z)*1.8/height,(p.y-hip.y)*1.8/height));
const chair=await load('assets/environments/kenney-space-station-kit/models/chair-armrest-headrest.glb');
const bounds=new THREE.Box3().setFromObject(chair.scene);console.log('Chair bounds',bounds.min.toArray(),bounds.max.toArray());
const chairs=bake(chair.scene,p=>new THREE.Vector3(-p.x,p.z,p.y));
fs.writeFileSync(new URL('../assets/characters/fighter-cockpit.js',import.meta.url),'// Generated by tools/bake-fighter-cockpit.mjs. Local CC0 Quaternius astronaut and Kenney chair.\nwindow.Driftworks.fighterCockpit='+JSON.stringify({crew,chair:chairs})+';\n');
