'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createFlight}=require('../tools/headless.cjs');
const flight=createFlight({mission:'gas-giant',enabled:true});
let s=flight.snapshot();assert.equal(s.combat.enabled,false);assert.equal(s.combat.enemies.length,0);assert.equal(s.world.asteroids.length,0);assert.equal(s.world.ships.length,0);assert.equal(Math.hypot(...s.state.velocity),0);
const initial=s.state.eye.slice();flight.advance(30,{throttle:1,yaw:.15,fire:true,boost:true});s=flight.snapshot();
assert(Math.hypot(...s.state.eye.map((v,i)=>v-initial[i]))>1,'Real free-flight movement');assert.equal(s.guns.fired,0);assert.equal(s.combat.enemies.length,0);assert.equal(s.combat.dead,false);
flight.reset();assert.equal(flight.snapshot().guns.fired,0);assert.equal(flight.snapshot().combat.enabled,false);
const values={},requests=[],uploads=[],buffers=[],pending=[];
const gl=new Proxy({createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),createTexture:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:(_,name)=>name,getAttribLocation:()=>0,
 uniform1f:(name,v)=>values[name]=v,uniform1i:(name,v)=>values[name]=v,uniform1fv:(name,v)=>values[name]=Array.from(v),uniform2fv:(name,v)=>values[name]=Array.from(v),
 texImage2D:(...args)=>uploads.push(args),bufferData:(_,data)=>buffers.push(Array.from(data))},{get:(target,key)=>key in target?target[key]:()=>{}});
const canvas={dataset:{},setAttribute(){},getContext:()=>gl};
const context={window:{Driftworks:{assetUrl:s=>s},location:{search:'?mission=gas-giant'},devicePixelRatio:1},document:{getElementById:()=>null,createElement:()=>canvas},
 Image:class{set src(value){requests.push(value);this.width=this.height=1024;pending.push(this);}},Float32Array,Uint8Array};
vm.createContext(context);
vm.runInContext(fs.readFileSync('experiments/gas-giant-weather.js','utf8').replaceAll('export ','')+'\nwindow.Driftworks.gasGiantWeather={gasGiantCells,gasGiantFlash,gasGiantDrift};',context);
for(const file of ['flight-missions','skybox'])vm.runInContext(fs.readFileSync('experiments/'+file+'.js','utf8'),context);
const DW=context.window.Driftworks,sky=DW.flightSkybox.create({clientWidth:1200,clientHeight:800,prepend(){}},{fov:45});
assert.equal(requests.length,13,'Twelve baked faces and one existing sun sprite');assert(!requests.some(url=>url.endsWith('/dark.png')),'Source card stays offline');assert.equal(requests.filter(url=>url.includes('warm-sun')).length,1);
pending.forEach(image=>image.onload());assert.equal(canvas.dataset.gas,'ready');assert.equal(canvas.dataset.cube,'ready');
const pose={eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
const count=uploads.length;sky.render(pose,1,false,.5);assert.equal(values.style,23);assert.equal(values.bakedCube,5);assert.equal(values.bakedCubeTo,6);assert.equal(values.ohioSun,3);
const flashes=values['gasFlashes[0]'];sky.render({...pose,eye:[1000,2000,-500]},1,false,0);assert.deepEqual(values['gasFlashes[0]'],flashes,'Pause freezes lightning; translation creates no parallax');
sky.render(pose,1,false,2);assert.notDeepEqual(values['gasFlashes[0]'],flashes);assert.equal(uploads.length,count,'No per-frame texture uploads');
const stars=buffers.find(data=>data.length>1000&&data.length%4===0);
assert(stars&&stars.length<DW.flightSkybox.stars().length,'Planet removes background star directions');
for(let i=0;i<stars.length;i+=4){const [x,y,z]=stars.slice(i,i+3);assert(y<=0||(x*x+z*z)/(y*y*2.040401)>.91*.91,'No stars inside planet silhouette');}
console.log('PASS jade flight: real movement, zero weapons/actors, thirteen initial assets, fixed sky orientation, pause/drift and star occlusion');
