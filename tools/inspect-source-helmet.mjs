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

const h=root.getObjectByName('Head');const inv=h.matrixWorld.clone().invert();
root.getObjectByName('SpaceSuit_Head').traverse(n=>{if(!n.isMesh)return;const bounds=new THREE.Box3();for(let i=0;i<n.geometry.attributes.position.count;i++){const p=new THREE.Vector3().fromBufferAttribute(n.geometry.attributes.position,i);n.applyBoneTransform(i,p);p.applyMatrix4(n.matrixWorld);bounds.expandByPoint(p);}console.log(n.name,n.material.name,bounds);});
