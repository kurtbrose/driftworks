import fs from 'node:fs';
import {registerHooks} from 'node:module';
import * as T from '../vendor/three/build/three.module.js';
registerHooks({resolve(s,c,next){return next(s==='three'?new URL('../vendor/three/build/three.module.js',import.meta.url).href:s,c);}});
globalThis.ProgressEvent=class {constructor(type,values){Object.assign(this,{type},values);}};
const {GLTFLoader}=await import('../vendor/three/examples/jsm/loaders/GLTFLoader.js');
const dir=new URL('../assets/characters/quaternius-universal-base-characters/',import.meta.url);
const source=new URL('original/Base Characters/Godot - UE/Superhero_Female_FullBody.gltf',dir);
const doc=JSON.parse(fs.readFileSync(source,'utf8'));
for(const b of doc.buffers)b.uri='data:application/octet-stream;base64,'+fs.readFileSync(new URL(b.uri,source)).toString('base64');
for(const m of doc.materials){delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;if(m.pbrMetallicRoughness){delete m.pbrMetallicRoughness.baseColorTexture;delete m.pbrMetallicRoughness.metallicRoughnessTexture;}}
const gltf=await new GLTFLoader().parseAsync(JSON.stringify(doc),'');gltf.scene.updateMatrixWorld(true);
const head=gltf.scene.getObjectByName('Head').getWorldPosition(new T.Vector3());
const neck=gltf.scene.getObjectByName('neck_01').getWorldPosition(new T.Vector3());
console.log({head:head.toArray(),neck:neck.toArray(),bounds:new T.Box3().setFromObject(gltf.scene)});
