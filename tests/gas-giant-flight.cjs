'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createFlight}=require('../tools/headless.cjs');
const mission=process.argv[2]||'gas-giant';
const flight=createFlight({mission,enabled:true});
let s=flight.snapshot();assert.equal(s.combat.enabled,false);assert.equal(s.combat.enemies.length,0);assert.equal(s.world.asteroids.length,0);assert.equal(s.world.ships.length,0);assert.equal(Math.hypot(...s.state.velocity),0);
const initial=s.state.eye.slice();flight.advance(30,{throttle:1,yaw:.15,fire:true,boost:true});s=flight.snapshot();
assert(Math.hypot(...s.state.eye.map((v,i)=>v-initial[i]))>1,'Real free-flight movement');assert.equal(s.guns.fired,0);assert.equal(s.combat.enemies.length,0);assert.equal(s.combat.dead,false);
flight.reset();assert.equal(flight.snapshot().guns.fired,0);assert.equal(flight.snapshot().combat.enabled,false);
const values={},requests=[],uploads=[],buffers=[],pending=[];let mipmaps=0;
const gl=new Proxy({createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),createTexture:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:(_,name)=>name,getAttribLocation:()=>0,
 uniform3fv:(name,v)=>values[name]=Array.from(v),uniform4fv:(name,v)=>values[name]=Array.from(v),uniform1f:(name,v)=>values[name]=v,uniform1i:(name,v)=>values[name]=v,uniform1fv:(name,v)=>values[name]=Array.from(v),uniform2fv:(name,v)=>values[name]=Array.from(v),
 texImage2D:(...args)=>uploads.push(args),generateMipmap:()=>mipmaps++,bufferData:(_,data)=>buffers.push(Array.from(data))},{get:(target,key)=>key in target?target[key]:()=>{}});
const canvas={dataset:{},setAttribute(){},getContext:()=>gl};
const context={window:{Driftworks:{assetUrl:s=>s},location:{search:'?mission='+mission},devicePixelRatio:1},document:{getElementById:()=>null,createElement:()=>canvas},
 Image:class{set src(value){requests.push(value);this.width=this.height=1024;pending.push(this);}},Float32Array,Uint8Array};
vm.createContext(context);
vm.runInContext(fs.readFileSync('experiments/gas-giant-weather.js','utf8').replaceAll('export ','')+'\nwindow.Driftworks.gasGiantWeather={gasGiantCells,gasGiantFlash,gasGiantDrift};',context);
for(const file of ['experiments/flight-missions.js','src/sky-lighting.js','src/sky-system.js','src/impact-cues.js','experiments/skybox.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),context);
const DW=context.window.Driftworks,sky=DW.flightSkybox.create({clientWidth:1200,clientHeight:800,prepend(){}},{fov:45});
assert.equal(requests.length,mission==='jade-rime'?14:13,'Twelve baked faces, sun and close-view-only moon texture');assert(!requests.some(url=>url.endsWith('/dark.png')),'Source card stays offline');assert.equal(requests.filter(url=>url.includes('warm-sun')).length,1);
pending.forEach(image=>image.onload());assert.equal(canvas.dataset.gas,'ready');assert.equal(canvas.dataset.cube,'ready');
assert.equal(mipmaps,2,'Generate one mip chain per complete cube, after all faces load');
const pose={eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
const count=uploads.length;sky.render(pose,1,false,.5);assert.equal(values.style,23);assert.equal(values.bakedCube,5);assert.equal(values.bakedCubeTo,6);assert.equal(values.ohioSun,3);
const moons=values['jadeMoons[0]'];assert.equal(moons.length,16);
const diameters=[];
for(let i=0;i<16;i+=4){
 const d=moons.slice(i,i+3),radius=moons[i+3];
 assert(Math.abs(Math.hypot(...d)-1)<1e-6,'Unit moon direction');
 diameters.push(2*Math.asin(radius)*180/Math.PI);

}
const system=DW.flightMissions.current().sky.jadeSystem;
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
for(const [i,m] of system.moons.entries()){
 assert(Math.abs(dot(m.position,system.planeNormal))<1e-8,'Exactly coplanar planet-centered moon positions');
 assert(Math.abs(Math.hypot(...m.position)-m.orbitKm)<1e-8,'Actual orbital radii');
 const range=Math.hypot(...m.position.map((v,j)=>v-system.observer[j]));
 assert(Math.abs(diameters[i]-2*Math.asin(m.diameterKm/2/range)*180/Math.PI)<1e-4,'Physical apparent diameters');
 const delta=m.position.map((v,j)=>(v-system.observer[j])/range);
 const direction=system.frame[0].map((_,j)=>delta.reduce((sum,v,k)=>sum+v*system.frame[k][j],0));
 direction.forEach((v,j)=>assert(Math.abs(v-moons[i*4+j])<1e-7,'Physical sightline projected through shared frame'));

}
for(const [i,a] of system.frame.entries())for(const [j,b] of system.frame.entries())assert(Math.abs(dot(a,b)-(i===j?1:0))<1e-12,'Rigid sky rotation');
const [a,b,c]=system.frame;assert(Math.abs(dot(a,[b[1]*c[2]-b[2]*c[1],b[2]*c[0]-b[0]*c[2],b[0]*c[1]-b[1]*c[0]])-1)<1e-12,'No reflected sky');
if(mission==='jade-rime'){
 assert(Math.abs(Math.hypot(...system.moons[1].position.map((v,i)=>v-system.observer[i]))-2450)<1e-8,'900 km above Rime');
 assert(diameters[1]>78&&diameters[1]<79,'Large nearby moon');
 assert(values.gasScale<.1,'Planet shrinks at the true moon range');
 assert.equal(canvas.dataset.rime,'ready');assert.equal(values.rimeDetailed,1);assert.equal(values.rimeSurface,7);
 assert.equal(requests.filter(s=>s.includes('rime-disk-v2')).length,1,'One close-view surface upload');
 const sun=[Math.cos(20*Math.PI/180)**2,Math.sin(20*Math.PI/180)*Math.cos(20*Math.PI/180),Math.sin(20*Math.PI/180)];
 const rotated=system.frame[0].map((_,j)=>sun.reduce((sum,v,k)=>sum+v*system.frame[k][j],0));
 rotated.forEach((v,j)=>assert(Math.abs(v-values.ohioSunCenter[j])<1e-6,'Sun rotates with the whole system'));
 assert(dot(moons.slice(4,7).map(v=>-v),rotated)>.3,'Nearby moon presents sunlit terrain');

}
const flashes=values['gasFlashes[0]'];sky.render({...pose,eye:[1000,2000,-500]},1,false,0);assert.deepEqual(values['jadeMoons[0]'],moons,'Moons stay fixed under translation and pause');assert.deepEqual(values['gasFlashes[0]'],flashes,'Pause freezes lightning; translation creates no parallax');
sky.render(pose,1,false,2);assert.notDeepEqual(values['gasFlashes[0]'],flashes);assert.equal(uploads.length,count,'No per-frame texture uploads');
assert.equal(mipmaps,2,'Animation does not regenerate mipmaps');
const stars=buffers.find(data=>data.length>1000&&data.length%4===0);
assert(stars&&stars.length<DW.flightSkybox.stars().length,'Planet removes background star directions');
for(let i=0;i<stars.length;i+=4){const [x,y,z]=stars.slice(i,i+3);if(mission==='gas-giant')assert(y<=0||(x*x+z*z)/(y*y*2.040401)>.91*.91,'No stars inside planet silhouette');else assert(dot([x,y,z],values.jadePlanet.slice(0,3))<=values.jadePlanet[3]+1e-6,'Distant planet hides stars');}
for(let j=0;j<stars.length;j+=4)for(let i=0;i<16;i+=4)assert(stars[j]*moons[i]+stars[j+1]*moons[i+1]+stars[j+2]*moons[i+2]<Math.cos(Math.asin(moons[i+3]))+1e-7,'Opaque moons hide stars');
console.log('PASS jade flight: real movement, zero weapons/actors, thirteen initial assets, fixed sky orientation, pause/drift and star occlusion');
