'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p)),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(read('assets/ships/wreck-textures.json')),loaded=[];
class Image {
 set src(value){this.url=value;loaded.push(value);this.width=this.naturalWidth=2048;this.height=this.naturalHeight=2048;queueMicrotask(()=>this.onload());}
 get src(){return this.url;}
}
const D={assetUrl:value=>value},context={window:{Driftworks:D},Image,console};
for(const folder of ['quaternius-ultimate-spaceships','concept-trio','ohio-vehicles'])vm.runInNewContext(read('assets/ships/'+folder+'/meshes.js').toString(),context);
vm.runInNewContext(read('experiments/ship-packs.js').toString(),context);
(async()=>{
 const sources=new Set();
 for(const pack of D.shipPacks)for(const model of pack.models)sources.add('assets/ships/'+pack.id+'/'+model.texture);
 assert.equal(manifest.textures.length,sources.size);
 for(const t of manifest.textures){assert(sources.has(t.source));assert.equal(hash(read(t.source)),t.sha256,'Source changed: rebake '+t.source);const output=read(t.output);assert.equal(hash(output),t.outputSha256);assert.equal(output.length,t.bytes);assert.equal(output.toString('ascii',0,4),'RIFF');assert.equal(output.toString('ascii',8,12),'WEBP');}
 const P=D.shipPackModels,images=await P.loadTextures(),count=loaded.length;
 assert.equal(images.size,D.shipPacks.reduce((n,p)=>n+p.models.length,0));
 assert.equal(count,images.size*2,'Both variants finish loading before fleet readiness');
 assert.equal(P.textureSources(images).length,count);
 const model=D.shipPacks[0].models[0],pose={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]},live={index:0,modelId:model.id,hp:10,pose},dead={index:0,modelId:model.id,age:0,pose};
 const first=P.sourceFleetGeometry([live,dead],model.id,1,10,images,[.2,.8,.3],true);
 assert.notEqual(first[0].texture,first[1].texture);assert(first[1].texture.src.endsWith('.wreck.webp'));assert.equal(first[0].vertices,first[1].vertices);assert.equal(first[1].paint,undefined);
 for(let i=0;i<20;i++)assert.equal(P.sourceFleetGeometry([dead],model.id,1,10,images,undefined,true)[0].texture,first[1].texture);
 await P.loadTextures();assert.equal(loaded.length,count,'Repeated deaths/loading never request or generate a texture');
 const f=require('../tools/headless.cjs').createFlight(),F=f.DW,noop=()=>{};
 let finishUpload,prepared;
 const ready=new Promise(resolve=>{finishUpload=resolve;}),fleetImages=new Map([['fixture',{}]]),variants=[{},{}];
 F.scene3d={create:()=>({prepareStudyTextures(images){prepared=images;return ready;}})};
 F.flightSkybox={create:()=>({})};F.shipPackModels.populate=noop;
 F.shipPackModels.loadTextures=()=>Promise.resolve(fleetImages);F.shipPackModels.textureSources=images=>{assert.equal(images,fleetImages);return variants;};
 const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,insertBefore:noop});return nodes.get(id);};
 F.experimentDom=()=>get;
 const document={getElementById:get,createElement:()=>({})};
 vm.runInNewContext(read('experiments/flight-presentation.js').toString(),{window:{Driftworks:F},document,location:{search:''},URLSearchParams});
 const presentation=F.flightPresentation.mount({},()=>f.snapshot().world,noop,{document});
 await new Promise(setImmediate);
 assert.equal(prepared,variants,'Flight prepares both image variants');
 assert.notEqual(presentation.appearance().shipImages,fleetImages,'Fleet is not published before GPU preparation');
 finishUpload();await new Promise(setImmediate);
 assert.equal(presentation.appearance().shipImages,fleetImages,'Fleet is published after preparation resolves');
 console.log('PASS wreck textures: complete hashed lossless assets, eager source/wreck loading, shared buffers and no destruction-time texture work');
})().catch(error=>{console.error(error);process.exitCode=1;});
