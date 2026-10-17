import * as THREE from '../vendor/three/build/three.module.js';

// Preserve the exact positions/normals authored by the existing mesh generator.
export function geometryFromInterleaved(data){
  const buffer=new THREE.InterleavedBuffer(data,6),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(buffer,3,0));
  geometry.setAttribute('normal',new THREE.InterleavedBufferAttribute(buffer,3,3));
  geometry.computeBoundingSphere();return geometry;
}

// The RTS camera basis may contain a reflection. A quaternion cannot represent it.
// Copy the full basis and force its world/inverse matrices to update together.
export function applyCameraFrame(camera,eye,basis,aspect){
  const v=a=>new THREE.Vector3(...a);
  camera.position.fromArray(eye);camera.matrixAutoUpdate=false;
  camera.matrix.makeBasis(v(basis.right),v(basis.up),v(basis.back));
  camera.matrix.setPosition(camera.position);
  camera.fov=THREE.MathUtils.radToDeg(2*Math.atan(1/basis.focal));
  camera.aspect=aspect;camera.far=basis.distance+30000;
  camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}
