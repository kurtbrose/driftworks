const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
(async()=>{
 const threeURL=pathToFileURL(path.resolve('vendor/three/build/three.module.js')).href;
 const THREE=await import(threeURL);
 const utils=fs.readFileSync('vendor/three/examples/jsm/utils/BufferGeometryUtils.js','utf8').replace("from 'three'",`from '${threeURL}'`);
 const utilsURL='data:text/javascript;base64,'+Buffer.from(utils).toString('base64');
 const {mergeGeometries}=await import(utilsURL);
 const html=fs.readFileSync('experiments/refueling-depot.html','utf8');
 const code=html.slice(html.indexOf('function batchStaticLiner('),html.indexOf('function showLinerVariants('));
 const batch=vm.runInNewContext(code+';batchStaticLiner',{THREE,mergeGeometries});
 const source=new THREE.Group(),material=new THREE.MeshStandardMaterial(),glass=new THREE.MeshStandardMaterial({transparent:true,opacity:.4});
 for(let i=0;i<3;i++){const pivot=new THREE.Group();pivot.rotation.z=i*.4;pivot.position.set(i*4,i,2);source.add(pivot);const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,3).toNonIndexed(),material);mesh.geometry.clearGroups();pivot.add(mesh);}
 const pane=new THREE.Mesh(new THREE.PlaneGeometry(),glass);pane.position.set(0,8,0);source.add(pane);
 source.position.set(2,3,-1);source.rotation.y=.3;source.updateMatrixWorld(true);const before=new THREE.Box3().setFromObject(source),out=batch(source);
 assert.equal(out.children.length,2,'Opaque parts merge, glass remains independently sortable');
 assert.equal(out.children.find(m=>m.material===material).geometry.getAttribute('position').count,108,'All opaque triangles retained');
 const after=new THREE.Box3().setFromObject(out);assert.ok(before.min.distanceTo(after.min)<1e-5&&before.max.distanceTo(after.max)<1e-5,'Nested transforms preserve bounds');
 assert.equal(out.children.find(m=>m.material===glass).geometry,pane.geometry,'Glass retains geometry and material');
 assert.equal(source.children.length,4,'Source hierarchy retained');
 assert.equal(batch(source,[{}]).children.length,4,'Animated models are not merged');
 const buffer=out.children[1].geometry;out.rotation.x=1;out.updateMatrixWorld(true);assert.equal(out.children[1].geometry,buffer,'Pose changes reuse geometry');
 const loaderCode=fs.readFileSync('vendor/three/examples/jsm/loaders/GLTFLoader.js','utf8').replace("from 'three'",`from '${threeURL}'`).replace("from '../utils/BufferGeometryUtils.js'",`from '${utilsURL}'`);
 const {GLTFLoader}=await import('data:text/javascript;base64,'+Buffer.from(loaderCode).toString('base64'));
 for(const id of ['commuter','double-decker']){
  const bytes=fs.readFileSync(`assets/ships/civilian-airliners/${id}.glb`);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const baked=batch(gltf.scene,gltf.animations);let inputTriangles=0,outputTriangles=0,inputMeshes=0;
  gltf.scene.traverse(o=>{if(o.isMesh){inputMeshes++;inputTriangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
  baked.traverse(o=>{if(o.isMesh)outputTriangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});
  assert.equal(inputTriangles,outputTriangles,'Real liner retains every triangle');
  const a=new THREE.Box3().setFromObject(gltf.scene),b=new THREE.Box3().setFromObject(baked);
  assert.ok(a.min.distanceTo(b.min)<1e-4&&a.max.distanceTo(b.max)<1e-4,'Real liner dimensions preserved');
  assert.ok(baked.children.length<=20,'Real liner draw budget');
  console.log(`${id}: ${inputMeshes} meshes -> ${baked.children.length} batches; ${outputTriangles} triangles retained`);
 }
 console.log('PASS liner batching: transforms, bounds, triangle count, materials, glass, animation fallback and buffer reuse');
})().catch(e=>{console.error(e);process.exitCode=1;});
