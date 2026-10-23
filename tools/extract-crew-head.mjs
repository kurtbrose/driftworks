import fs from 'node:fs';
import {registerHooks} from 'node:module';
import * as T from '../vendor/three/build/three.module.js';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../vendor/three/build/three.module.js',import.meta.url).href:s,c);}});
globalThis.ProgressEvent=class {constructor(type,values){Object.assign(this,{type},values);}};
const {GLTFLoader}=await import('../vendor/three/examples/jsm/loaders/GLTFLoader.js');
const dir=new URL('../assets/characters/quaternius-universal-base-characters/',import.meta.url);
const kind=process.argv[2]||'female';if(!['female','male'].includes(kind))throw Error('Expected female or male');
const filename='Superhero_'+(kind==='female'?'Female':'Male')+'_FullBody.gltf';
const source=new URL('original/Base Characters/Godot - UE/'+filename,dir);
const doc=JSON.parse(fs.readFileSync(source,'utf8'));
for(const b of doc.buffers)b.uri='data:application/octet-stream;base64,'+fs.readFileSync(new URL(b.uri,source)).toString('base64');
for(const m of doc.materials){delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}}
const gltf=await new GLTFLoader().parseAsync(JSON.stringify(doc),'');gltf.scene.updateMatrixWorld(true);
const head=gltf.scene.getObjectByName('Head').getWorldPosition(new T.Vector3());
const neck=gltf.scene.getObjectByName('neck_01').getWorldPosition(new T.Vector3());
console.log({head:head.toArray(),neck:neck.toArray(),bounds:new T.Box3().setFromObject(gltf.scene)});
const groups=[];const neckBones=new Set();gltf.scene.getObjectByName('neck_01').traverse(n=>neckBones.add(n));
const cutoff=neck.y-.005;
gltf.scene.traverse(mesh=>{
 if(!mesh.isMesh)return;
 const geometry=mesh.geometry,position=geometry.attributes.position,uv=geometry.attributes.uv;
 const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
 const allowed=[];if(mesh.isSkinnedMesh){for(let i=0;i<position.count;i++){let weight=0;for(let j=0;j<4;j++)if(neckBones.has(mesh.skeleton.bones[geometry.attributes.skinIndex.array[i*4+j]]))weight+=geometry.attributes.skinWeight.array[i*4+j];allowed.push(weight>=.5);}}
 const points=[];for(let i=0;i<position.count;i++){const p=new T.Vector3().fromBufferAttribute(position,i);if(mesh.isSkinnedMesh)mesh.applyBoneTransform(i,p);points.push(p.applyMatrix4(mesh.matrixWorld));}
 const parts=geometry.groups.length?geometry.groups:[{start:0,count:geometry.index?.count||position.count,materialIndex:0}];
 for(const part of parts){const positions=[],uvs=[],normals=[];for(let j=part.start;j<part.start+part.count;j+=3){const ids=[0,1,2].map(k=>geometry.index?geometry.index.getX(j+k):j+k);if(ids.some(i=>points[i].y<cutoff||(mesh.isSkinnedMesh&&!allowed[i])))continue;for(const i of ids){positions.push(...points[i].clone().sub(head).toArray());uvs.push(uv.getX(i),uv.getY(i));normals.push(...new T.Vector3().fromBufferAttribute(geometry.attributes.normal,i).applyMatrix3(new T.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize().toArray());}}
 if(positions.length)groups.push({material:materials[part.materialIndex].name,positions:positions.map(n=>+n.toFixed(7)),uvs:uvs.map(n=>+n.toFixed(7)),normals:normals.map(n=>+n.toFixed(7))});}
});
const data={source:filename,units:'metres',pivot:'Source Head bone in bind pose',sourceHeadPivot:head.toArray(),cutoff,groups};
fs.mkdirSync(new URL('runtime/',dir),{recursive:true});fs.writeFileSync(new URL('runtime/'+kind+'-head.json',dir),JSON.stringify(data)+'\n');
console.log('Head triangles',groups.reduce((s,g)=>s+g.positions.length/9,0));
