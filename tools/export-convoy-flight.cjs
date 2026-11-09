'use strict';
// Bake the current authored DW-14 route presets for the static flight renderer.
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
process.chdir(path.resolve(__dirname,'..'));

const context={console,AbortController};context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync('vendor/three/build/three.global.js','utf8'),context);
vm.runInContext(fs.readFileSync('assets/ships/industrial-kit/cargo-paint.js','utf8').replace(/^export /gm,''),context);
const source=fs.readFileSync('assets/ships/industrial-kit/kit.js','utf8');
vm.runInContext('const T=THREE;\n'+source.replace(/^import .*?;\s*/gm,'').replace(/^export (?=(?:const|function) )/gm,'')+'\nglobalThis.kit={buildFreighter,routePresets,batchStatic};',context);
const {build}=require('./bake-hull-indices.cjs');
const variants={};let offset=0;const chunks=[];
for(const name of ['container','mixed','fluid']){
 const root=context.kit.buildFreighter(name);let cargoSlots=0;
 // Carry each box's identity in integer U; the vertex stage selects its atlas tile.
 root.traverse(o=>{if(o.userData.part!=='cargo')return;const slot=cargoSlots++;o.traverse(m=>{if(!m.isMesh||m.geometry.userData.cargoVariant===undefined)return;m.geometry=m.geometry.clone();const uv=m.geometry.attributes.uv;for(let i=0;i<uv.count;i++)uv.setX(i,uv.getX(i)+4+slot*2);});});
 let tankerPods=0;
 root.traverse(o=>{if(!o.userData.capacityShell)return;const pod=tankerPods++;o.traverse(m=>{if(!m.isMesh||m.name!=='domed bulk-fluid vessel')return;m.geometry=m.geometry.clone();const uv=m.geometry.attributes.uv;for(let i=0;i<uv.count;i++){const u=uv.getX(i),v=uv.getY(i);if(u>1)uv.setXY(i,(64+pod*2+(u-1))*2,1-(1-v));else uv.setXY(i,(65+pod*2+u)*2,1-(-v*2));}});});
 const baked=context.kit.batchStatic(root),batches=[],collisionVertices=[];
 for(const mesh of baked.children){
  const geo=mesh.geometry,p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv,vertices=new Float32Array(p.count*8);
  for(let i=0;i<p.count;i++)vertices.set([p.getZ(i),-p.getX(i),p.getY(i),n.getZ(i),-n.getX(i),n.getY(i),uv.getX(i)*.5,(1-uv.getY(i))*2/3],i*8);
  // Axis conversion changes handedness; keep outward triangles and their UVs.
  for(let i=0;i<vertices.length;i+=24)for(let k=0;k<8;k++){const v=vertices[i+8+k];vertices[i+8+k]=vertices[i+16+k];vertices[i+16+k]=v;}
  for(let i=0;i<vertices.length;i+=8)for(let k=0;k<6;k++)collisionVertices.push(vertices[i+k]);
  const material=mesh.material,buffer=Buffer.from(vertices.buffer);
  const srgb=material.color.clone().convertLinearToSRGB().toArray();
  batches.push({offset,count:vertices.length,color:srgb,textured:material.color.getHex()===0xffffff,roughness:material.roughness,metallic:material.metalness,emissive:material.emissive.toArray(),emissiveIntensity:material.emissiveIntensity});
  chunks.push(buffer);offset+=buffer.length;
 }
 let radius=0;for(let i=0;i<collisionVertices.length;i+=6)radius=Math.max(radius,Math.hypot(collisionVertices[i],collisionVertices[i+1],collisionVertices[i+2]));
 const collision={version:1,vertexCount:collisionVertices.length,sourceHash:crypto.createHash('sha256').update(Buffer.from(new Float32Array(collisionVertices).buffer)).digest('hex'),radius,tree:build(collisionVertices,Array.from({length:collisionVertices.length/18},(_,i)=>i*18))};
 variants[name]={tankerPods,cargoSlots,manifest:Array.from(root.userData.manifest),engineMouths:root.userData.engineMouths,batches,collision};
 console.log(name,batches.length,batches.reduce((n,b)=>n+b.count/24,0),'triangles');
}
const manifest={version:1,source:'kit.js',sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),units:'metres',forward:'+Y',up:'+Z',binary:'convoy-flight.bin',variants};
fs.writeFileSync('assets/ships/industrial-kit/convoy-flight.json',JSON.stringify(manifest)+'\n');fs.writeFileSync('assets/ships/industrial-kit/convoy-flight.bin',Buffer.concat(chunks));console.log(offset,'bytes');
