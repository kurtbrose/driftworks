'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for(const mission of ['planet-hero-80','planet-hero','planet-hero-140']){
 const values={},buffers=[],requests=[];
 const gl=new Proxy({createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),createTexture:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:(_,name)=>name,getAttribLocation:()=>0,uniform1f:(name,value)=>{values[name]=value;},bufferData:(_,data)=>buffers.push(data)}, {get:(o,k)=>k in o?o[k]:()=>{}});
 const canvas={dataset:{},setAttribute(){},getContext:()=>gl};
 const context={window:{Driftworks:{assetUrl:s=>s},location:{search:'?mission='+mission},devicePixelRatio:1},document:{getElementById:()=>null,createElement:()=>canvas},Image:class{set src(value){requests.push(value);}},Float32Array,Uint8Array};
 for(const name of ['flight-missions','skybox'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiments/'+name+'.js'),'utf8'),context);
 const DW=context.window.Driftworks,definition=DW.flightMissions.current(),width=mission.endsWith('80')?80:mission.endsWith('140')?140:110;
 assert.equal(definition.sky.features[0].widthDeg,width);assert.equal(definition.sky.kind,'landmarks');assert.equal(definition.encounter.count,16);
 const sky=DW.flightSkybox.create({clientWidth:800,clientHeight:600,prepend(){}},{fov:140});
 sky.render({eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]},1,false);
 assert.equal(values.style,20);assert.ok(Math.abs(values.focal-1/Math.tan(70*Math.PI/180))<1e-12);
 assert.ok(requests.some(s=>s.endsWith('/planet-hero-v1/master.png')));
 const stars=buffers.find(a=>a.length>1000);assert.ok(stars&&stars.length<12800,'stars behind the disk are excluded');
 const center=[0,Math.cos(Math.PI/6),-.5],east=[-1,0,0],up=[0,.5,Math.cos(Math.PI/6)],extent=Math.tan(width*Math.PI/360);
 for(let i=0;i<stars.length;i+=4){const dot=v=>v.reduce((n,x,j)=>n+x*stars[i+j],0),d=dot(center);if(d>0)assert.ok((dot(east)**2+dot(up)**2)/(d*d*extent*extent)>=.91**2-1e-6);}
}
const {createFlight}=require('../tools/headless.cjs');const flight=createFlight({mission:'planet-hero',seed:29});flight.advance(2,{stop:true});assert.equal(flight.snapshot().combat.enemies.length,16);
console.log('PASS planet hero: three angular sizes, reused landmark projection, configurable review lens, disk star occlusion and real furball session');
