const assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);
// Shared frozen source poses for the mining study and flight scenery.
import * as THREE from 'three';
import { GLTFLoader } from '../../../vendor/three/examples/jsm/loaders/GLTFLoader.js';
const state = window.Driftworks.miningStudyCrew = { poses: null, error: null };
try {
  const gltf = await new GLTFLoader().loadAsync(assetUrl('./original/Astronaut%20by%20Quaternius%20-%203hC2i0CTuO.glb', import.meta.url));
  const root = gltf.scene, mixer = new THREE.AnimationMixer(root);
  function sample(clipName, time) {
    mixer.stopAllAction();
    const clip = gltf.animations.find(clip => clip.name.endsWith('|' + clipName));
    if (!clip) throw new Error('Missing astronaut pose: ' + clipName);
    mixer.clipAction(clip).reset().play();mixer.update(time);root.updateMatrixWorld(true);
    const meshes = [], bounds = new THREE.Box3();
    root.traverse(mesh => {
      if (!mesh.isMesh) return;
      if (mesh.isSkinnedMesh) mesh.skeleton.update();
      const points = [];
      for (let i=0;i<mesh.geometry.attributes.position.count;i++) {
        const v = mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        bounds.expandByPoint(v);points.push(v);
      }
      meshes.push({mesh,points});
    });
    const height=bounds.max.y-bounds.min.y, center=bounds.getCenter(new THREE.Vector3()), groups={};
    for (const {mesh,points} of meshes) {
      const geometry=mesh.geometry,index=geometry.index,materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      const ranges=geometry.groups.length?geometry.groups:[{start:0,count:index?index.count:points.length,materialIndex:0}];
      for (const range of ranges) {
        const material=materials[range.materialIndex || 0],name=material.name;
        const color=/Accent/.test(name)?[.95,.35,.08]:/MainDark|Grey/.test(name)?[.13,.19,.23]:/Main/.test(name)?[.32,.4,.47]:[.88,.92,.95];
        const batch=groups[name] || (groups[name]={vertices:[],color});
        for (let i=range.start;i<range.start+range.count;i+=3) {
          const tri=[0,1,2].map(k=>{
            const p=points[index?index.getX(i+k):i+k];
            return new THREE.Vector3((p.x-center.x)/height,-(p.z-center.z)/height,(p.y-bounds.min.y)/height);
          });
          const normal=new THREE.Vector3().subVectors(tri[1],tri[0]).cross(new THREE.Vector3().subVectors(tri[2],tri[0])).normalize();
          for(const v of tri)batch.vertices.push(v.x,v.y,v.z,normal.x,normal.y,normal.z);
        }
      }
    }
    return Object.values(groups);
  }
  state.poses={standing:sample('Idle_Neutral',.2),servicing:sample('Interact',.65)};
} catch(error) { state.error=error.message; }
