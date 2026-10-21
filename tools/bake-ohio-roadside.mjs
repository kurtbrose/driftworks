// Author-time geometry bake. Runtime loads one binary and merges palette batches.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {registerHooks} from 'node:module';
import * as T from '../vendor/three/build/three.module.js';
registerHooks({resolve(id,ctx,next){return next(id==='three'?new URL('../vendor/three/build/three.module.js',import.meta.url).href:id,ctx);}});
const {GLTFLoader}=await import('../vendor/three/examples/jsm/loaders/GLTFLoader.js');
const root=new URL('../',import.meta.url),out=new URL('assets/environments/ohio-roadside-v1/',root);
fs.mkdirSync(out,{recursive:true});
const models={},sources=[],chunks=[];let offset=0;
function store(name,group){
  group.updateMatrixWorld(true);const box=new T.Box3().setFromObject(group),size=box.getSize(new T.Vector3());
  const scale=1/Math.max(size.x,size.y,size.z),center=box.getCenter(new T.Vector3()),parts=[];
  group.traverse(mesh=>{if(!mesh.isMesh)return;const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry;
    const pos=geometry.attributes.position,norm=geometry.attributes.normal,normalMatrix=new T.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const groups=geometry.groups.length?geometry.groups:[{start:0,count:pos.count,materialIndex:0}];
    for(const g of groups){const mat=Array.isArray(mesh.material)?mesh.material[g.materialIndex]:mesh.material,values=[];
      for(let i=g.start;i<g.start+g.count;i++){const p=new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld),n=new T.Vector3().fromBufferAttribute(norm,i).applyNormalMatrix(normalMatrix);
        values.push((p.x-center.x)*scale,-(p.z-center.z)*scale,(p.y-box.min.y)*scale,n.x,-n.z,n.y);}
      const data=new Float32Array(values);parts.push({offset,count:data.length,color:mat.color.toArray()});chunks.push(Buffer.from(data.buffer));offset+=data.length;
    }
  });models[name]={parts};
}
for(const name of ['Barn','SmallBarn','Silo','WaterTower','Fence','Windmill','ChickenCoop']){
  const path=new URL('assets/environments/quaternius-farm-buildings/models/'+name+'.glb',root),raw=fs.readFileSync(path);
  sources.push({path:path.pathname.split('/assets/')[1],sha256:crypto.createHash('sha256').update(raw).digest('hex'),author:'Quaternius',license:'CC0-1.0'});
  const gltf=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');store(name,gltf.scene);
}
for(const [name,file] of [['Tractor','tractor'],['Truck','truck'],['Flatbed','truck-flat']]){
 const path=new URL('assets/environments/kenney-car-kit/'+file+'.glb',root),raw=fs.readFileSync(path);
 sources.push({path:path.pathname.split('/assets/')[1],sha256:crypto.createHash('sha256').update(raw).digest('hex'),author:'Kenney',license:'CC0-1.0'});
 const gltf=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
 const palette=['#252a2c','#ebe5d3','#b13a32','#4284aa','#77934b','#8f9699'].map(c=>new T.Color(c));
 gltf.scene.traverse(mesh=>{if(!mesh.isMesh)return;for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])mat.color.copy(palette.reduce((a,b)=>((a.r-mat.color.r)**2+(a.g-mat.color.g)**2+(a.b-mat.color.b)**2)<((b.r-mat.color.r)**2+(b.g-mat.color.g)**2+(b.b-mat.color.b)**2)?a:b));});
 store(name,gltf.scene);
}
const group=new T.Group(),materials={};
function block(color,x,y,z,w,h,d){const material=materials[color]||=new T.MeshStandardMaterial({color});const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);group.add(mesh);}
// Original low-poly canopy/pumps, authored in Y-up, normalized like the pack models.
block('#f1ebd5',0,100,0,400,12,160);block('#b13a32',0,108,0,408,9,168);
block('#f1ebd5',0,114,0,402,2,162);
for(const x of [-165,165])for(const z of [-50,50])block('#d4d2bd',x,47,z,8,94,8);
for(const x of [-105,0,105]){block('#d5d4c4',x,3,0,47,6,43);block('#af3530',x,17,0,22,28,17);block('#f0e5c8',x,36,0,24,12,18);block('#1c2d30',x,37,9.5,15,6,2);}
store('FuelStop',group);
const binary=Buffer.concat(chunks);fs.writeFileSync(new URL('geometry.bin',out),binary);
fs.writeFileSync(new URL('catalog.json',out),JSON.stringify({version:1,binary:'geometry.bin',bytes:binary.length,sha256:crypto.createHash('sha256').update(binary).digest('hex'),sources,models},null,2)+'\n');
console.log(`Baked ${Object.keys(models).length} roadside models, ${offset/18} triangles, ${binary.length} bytes.`);
