'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for(const mission of ['planet-hero-80','planet-hero','planet-hero-140','planet-orbital-watch']){
 const values={},buffers=[],requests=[],pending=[],uploads=[];
 const gl=new Proxy({createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),createTexture:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:(_,name)=>name,getAttribLocation:()=>0,uniform1f:(name,value)=>{values[name]=value;},bufferData:(_,data)=>buffers.push(data),texImage2D:(...args)=>uploads.push(args.at(-1))}, {get:(o,k)=>k in o?o[k]:()=>{}});
 const canvas={dataset:{},setAttribute(){},getContext:()=>gl};
 const context={window:{Driftworks:{assetUrl:s=>s},location:{search:'?mission='+mission},devicePixelRatio:1},document:{getElementById:()=>null,createElement:()=>canvas},Image:class{set src(value){this.file=value;requests.push(value);pending.push(this);}},Float32Array,Uint8Array};
 for(const name of ['flight-missions','skybox'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiments/'+name+'.js'),'utf8'),context);
 const DW=context.window.Driftworks,definition=DW.flightMissions.current(),width=mission.endsWith('80')?80:mission.endsWith('140')?140:110;
 assert.equal(definition.sky.features[0].widthDeg,width);assert.equal(definition.sky.kind,'landmarks');assert.equal(definition.encounter.count,16);
 const sky=DW.flightSkybox.create({clientWidth:800,clientHeight:600,prepend(){}},{fov:140});
 sky.render({eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]},1,false);
 assert.equal(values.style,20);assert.ok(Math.abs(values.focal-1/Math.tan(70*Math.PI/180))<1e-12);
 const orbital=mission==='planet-orbital-watch',asset=orbital?'planet-hero-orbital-v2/master.png':'planet-hero-v1/master.png';
 assert.ok(requests.some(s=>s.endsWith('/'+asset)));
 const firstFrame={width:1254,height:1254};sky.setPlanetImage(firstFrame);
 pending.find(image=>image.file.endsWith('/'+asset)).onload();assert.equal(uploads.at(-1),orbital?pending[0]:firstFrame,'orbital baseline stays static; animated master retains override');
 const nextFrame={width:1254,height:1254};sky.setPlanetImage(nextFrame);assert.equal(uploads.at(-1),orbital?pending[0]:nextFrame,'only the original animation accepts frame overrides');
 const stars=buffers.find(a=>a.length>1000);assert.ok(stars&&stars.length<12800,'stars behind the disk are excluded');
 const center=[0,Math.cos(Math.PI/6),-.5],east=[-1,0,0],up=[0,.5,Math.cos(Math.PI/6)],extent=Math.tan(width*Math.PI/360);
 for(let i=0;i<stars.length;i+=4){const dot=v=>v.reduce((n,x,j)=>n+x*stars[i+j],0),d=dot(center);if(d>0)assert.ok((dot(east)**2+dot(up)**2)/(d*d*extent*extent)>=.91**2-1e-6);}
}
const {createFlight}=require('../tools/headless.cjs');const flight=createFlight({mission:'planet-hero',seed:29});flight.advance(2,{stop:true});assert.equal(flight.snapshot().combat.enemies.length,16);
const orbitalFlight=createFlight({mission:'planet-orbital-watch',seed:29});orbitalFlight.advance(2,{stop:true});const orbitalState=orbitalFlight.snapshot();assert.equal(orbitalState.world.asteroids.length,0);assert.equal(orbitalState.world.ships.length,0);assert.equal(orbitalState.combat.enabled,false);assert.equal(orbitalState.combat.enemies.length,0);
console.log('PASS planet hero: angular sizes, static orbital study, projection, star occlusion and real flight sessions');
