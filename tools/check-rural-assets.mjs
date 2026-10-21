// Offline integrity + Three.js geometry loading. No browser or npm dependencies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {registerHooks} from 'node:module';
import * as THREE from '../vendor/three/build/three.module.js';
registerHooks({resolve(id,ctx,next){return next(id==='three'?new URL('../vendor/three/build/three.module.js',import.meta.url).href:id,ctx);}});
const {GLTFLoader}=await import('../vendor/three/examples/jsm/loaders/GLTFLoader.js');
globalThis.ProgressEvent=class ProgressEvent extends Event{constructor(type,options){super(type);Object.assign(this,options);}};
let models=0,triangles=0;
for(const name of ['quaternius-farm-buildings','quaternius-downtown-city']){
  const base=new URL('../assets/environments/'+name+'/',import.meta.url);
  const manifest=JSON.parse(fs.readFileSync(new URL('provenance.json',base)));
  assert.equal(manifest.license,'CC0-1.0');
  for(const file of manifest.files){
    const raw=fs.readFileSync(new URL(file.url,base));
    assert.equal(raw.length,file.bytes,file.url);
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),file.sha256,file.url);
    if(file.url.endsWith('.png')){assert.equal(raw.subarray(1,4).toString(),'PNG');assert(raw.readUInt32BE(16)>0&&raw.readUInt32BE(20)>0);}
  }
  for(const model of manifest.models){
    const url=new URL(model.url,base),raw=fs.readFileSync(url);
    let input=raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
    if(model.url.endsWith('.gltf')){
      const doc=JSON.parse(raw);
      for(const mesh of doc.meshes)for(const primitive of mesh.primitives)assert(!('COLOR_0' in primitive.attributes),'Wear masks must not tint ordinary glTF materials');
      for(const entry of [...doc.buffers,...(doc.images||[])]){
        assert(entry.uri&&!entry.uri.includes('..')&&!entry.uri.includes(':'),'Local dependencies only');
        assert(fs.existsSync(new URL(entry.uri,url)),entry.uri);
      }
      for(const buffer of doc.buffers){
        const bytes=fs.readFileSync(new URL(buffer.uri,url));assert(bytes.length>=buffer.byteLength);
        buffer.uri='data:application/octet-stream;base64,'+bytes.toString('base64');
      }
      // Node has no image decoder. Verify original image dependencies above,
      // then load geometry/material factors without texture slots in this check.
      for(const material of doc.materials||[]){
        for(const key of Object.keys(material))if(key.endsWith('Texture'))delete material[key];
        for(const key of Object.keys(material.pbrMetallicRoughness||{}))if(key.endsWith('Texture'))delete material.pbrMetallicRoughness[key];
        delete material.extensions;
      }
      delete doc.images;delete doc.textures;
      input=JSON.stringify(doc);
    }
    else {
      const doc=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)));
      assert(doc.materials.every(m=>m.pbrMetallicRoughness?.baseColorFactor),'Legacy farm material colors must survive export');
    }
    const gltf=await new GLTFLoader().parseAsync(input,'');
    const box=new THREE.Box3().setFromObject(gltf.scene);
    assert(!box.isEmpty()&&[...box.min,...box.max].every(Number.isFinite),model.id);
    let count=0;
    gltf.scene.traverse(node=>{
      if(!node.isMesh)return;
      const g=node.geometry;assert(g.attributes.position.count>0);
      for(const attr of Object.values(g.attributes))assert(Array.from(attr.array).every(Number.isFinite),model.id);
      if(g.index)for(const index of g.index.array)assert(index<g.attributes.position.count);
      count+=(g.index?g.index.count:g.attributes.position.count)/3;g.dispose();
    });
    assert.equal(count,model.triangles,model.id);models++;triangles+=count;
  }
}
console.log(`PASS rural assets: ${models} models, ${triangles} triangles, finite Three.js geometry, source/output hashes and local texture dependencies.`);
