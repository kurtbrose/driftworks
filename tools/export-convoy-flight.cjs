'use strict';
// Bake the current authored DW-14 route presets for the static flight renderer.
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
process.chdir(path.resolve(__dirname,'..'));

const context={console,AbortController};context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync('vendor/three/build/three.global.js','utf8'),context);
const source=fs.readFileSync('assets/ships/industrial-kit/kit.js','utf8');
vm.runInContext(source.replace(/^import .*?;\s*/m,'const T=THREE;\n').replace(/^export (?=(?:const|function) )/gm,'')+'\nglobalThis.kit={buildConsist,routePresets,batchStatic};',context);
const variants={};let offset=0;const chunks=[];
for(const name of ['container','mixed','fluid']){
 const root=context.kit.buildConsist(context.kit.routePresets[name]),baked=context.kit.batchStatic(root),batches=[];
 for(const mesh of baked.children){
  const geo=mesh.geometry,p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv,vertices=new Float32Array(p.count*8);
  for(let i=0;i<p.count;i++)vertices.set([p.getZ(i),-p.getX(i),p.getY(i),n.getZ(i),-n.getX(i),n.getY(i),uv.getX(i),1-uv.getY(i)],i*8);
  // Axis conversion changes handedness; keep outward triangles and their UVs.
  for(let i=0;i<vertices.length;i+=24)for(let k=0;k<8;k++){const v=vertices[i+8+k];vertices[i+8+k]=vertices[i+16+k];vertices[i+16+k]=v;}
  const material=mesh.material,buffer=Buffer.from(vertices.buffer);
  const srgb=material.color.clone().convertLinearToSRGB().toArray();
  batches.push({offset,count:vertices.length,color:srgb,textured:material.color.getHex()===0xffffff,roughness:material.roughness,metallic:material.metalness,emissive:material.emissive.toArray(),emissiveIntensity:material.emissiveIntensity});
  chunks.push(buffer);offset+=buffer.length;
 }
 variants[name]={manifest:Array.from(context.kit.routePresets[name]),batches};
 console.log(name,batches.length,batches.reduce((n,b)=>n+b.count/24,0),'triangles');
}
const manifest={version:1,source:'kit.js',sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),units:'metres',forward:'+Y',up:'+Z',binary:'convoy-flight.bin',variants};
fs.writeFileSync('assets/ships/industrial-kit/convoy-flight.json',JSON.stringify(manifest)+'\n');fs.writeFileSync('assets/ships/industrial-kit/convoy-flight.bin',Buffer.concat(chunks));console.log(offset,'bytes');
