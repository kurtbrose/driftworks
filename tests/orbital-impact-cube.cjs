'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'../assets/backgrounds/planet-hero-orbital-v2'),names=['px','nx','py','ny','pz','nz'];
for(let stage=0;stage<9;stage++){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'animation-cube-v1',String(stage),'manifest.json')));assert.equal(manifest.projection,'six-perspective-cameras');assert.equal(manifest.fovDegrees,90);
 for(const source of Object.values(manifest.sources))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,source.file))).digest('hex'),source.sha256,'bakes retain the exact registered source identity');
 for(const face of names){const bytes=fs.readFileSync(path.join(root,'animation-cube-v1',String(stage),face+'.png'));assert.equal(bytes.readUInt32BE(16),1024);assert.equal(bytes.readUInt32BE(20),1024);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),manifest.faces[face].sha256);if(stage===1)assert.ok(bytes.equals(fs.readFileSync(path.join(root,'animation-cube-v1/0',face+'.png'))),'contact has no giant painted flash');}
}
const registration=JSON.parse(fs.readFileSync(path.join(root,'impact-registered-v1/registration.json')));assert.equal(registration.frames.length,5);registration.frames.forEach(frame=>assert.ok(frame.errorPixels<.5));
const pending=[],requests=[],deleted=[],values={},uploads=[];
const gl=new Proxy({createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),createTexture:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getParameter:()=>8192,getUniformLocation:(_,n)=>n,getAttribLocation:()=>0,uniform1f:(n,v)=>values[n]=v,uniform1i:(n,v)=>values[n]=v,deleteTexture:t=>deleted.push(t),texImage2D:(...a)=>uploads.push(a)}, {get:(o,k)=>k in o?o[k]:()=>{}});
const canvas={dataset:{},setAttribute(){},getContext:()=>gl},handlers={};
const context={window:{Driftworks:{assetUrl:s=>s},location:{search:'?mission=planet-orbital-cube'},devicePixelRatio:1},document:{getElementById:()=>null,createElement:()=>canvas},Image:class{set src(s){this.width=this.height=1024;this.file=s;pending.push(this);requests.push(s);}},Float32Array,Uint8Array};
for(const name of ['flight-missions','skybox'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiments/'+name+'.js'),'utf8'),context);
const DW=context.window.Driftworks,sky=DW.flightSkybox.create({clientWidth:800,clientHeight:600,prepend(){},addEventListener:(n,fn)=>handlers[n]=fn},{cueControls:false}),pose={eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
const render=dt=>sky.render(pose,1,false,dt),finish=()=>pending.splice(0).forEach(image=>image.onload());
render(100);assert.equal(values.style,22);assert.equal(requests.length,18,'three six-face stages prefetched');assert.ok(requests.every(s=>s.includes('/planet-hero-orbital-v2/animation-cube-v1/')),'no retired planet sources or bakes load');
pending.splice(0,5).forEach(image=>image.onload());sky.cueImpact('contact',2);render(1);assert.equal(sky.getImpactState().blend,0,'five faces cannot advance a six-face cue');finish();render(0);render(.04);assert.ok(values.impactFlash>.6);assert.equal(values.bakedCube,5);assert.equal(values.bakedCubeTo,6);assert.equal(values.hdrEnvironment,4);
render(1.96);render(100);assert.equal(sky.getImpactState().stage,'contact');
sky.cueImpact('fires',8);render(0);finish();render(4);assert.equal(values.bakedBlend,.5);render(0);assert.equal(values.bakedBlend,.5,'pause freezes both cube textures');render(4);assert.equal(sky.getImpactState().stage,'fires');assert.equal(values.impactDebris,1);assert.ok(deleted.length>0);
handlers['impact-cue']({detail:{stage:'smoke',seconds:0}});render(0);finish();render(0);assert.equal(sky.getImpactState().stage,'smoke');sky.resetImpact();render(0);finish();render(0);assert.equal(sky.getImpactState().stage,'before');assert.equal(values.impactFlash,0);
for(const id of ['planet-impact-baked','planet-impact-watch'])assert.equal(DW.flightMissions.resolve(id).sky.cubeStages,DW.flightMissions.resolve('planet-orbital-cube').sky.cubeStages,'old bookmarks select the replacement');
const {createFlight}=require('../tools/headless.cjs');const empty=createFlight({mission:'planet-orbital-cube',seed:29});empty.advance(2,{stop:true});const s=empty.snapshot();assert.equal(s.world.asteroids.length,0);assert.equal(s.world.ships.length,0);assert.equal(s.combat.enabled,false);
console.log('PASS orbital impact: 54 verified faces, fixed centers, light-only contact, six-face load gating, cue holds/pause/reset, bounded cache and migrated mission bookmarks');
