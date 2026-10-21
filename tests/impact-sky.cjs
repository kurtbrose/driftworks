'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const values={},shaders=[],images=[];
const gl=new Proxy({createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),createTexture:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,
 shaderSource:(_,source)=>shaders.push(source),getUniformLocation:(_,name)=>name,getAttribLocation:()=>0,uniform1f:(name,value)=>{values[name]=value;}
},{get:(target,key)=>key in target?target[key]:()=>{}});
const canvas={dataset:{},setAttribute(){},getContext:()=>gl};
const context={window:{Driftworks:{assetUrl:value=>value},location:{search:'?sky=impact'},devicePixelRatio:1},document:{getElementById:()=>null,createElement:()=>canvas},Image:class{set src(value){images.push(value);this.onload();}},Float32Array,Uint8Array};
for(const name of ['flight-missions','skybox'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiments/'+name+'.js'),'utf8'),context);
const sky=context.window.Driftworks.flightSkybox.create({clientWidth:800,clientHeight:600,prepend(){}});
const pose={right:[1,0,0],up:[0,0,1],back:[0,-1,0],eye:[0,0,0]};
sky.setImpactTime(22);sky.render(pose,1,false,0);assert.equal(values.impactBlend,.5);assert.equal(canvas.dataset.impact,'ready');
assert.equal(images.filter(url=>url.includes('/impact-v1/')).length,8);assert.equal(sky.getRenderStats().drawCalls,1);assert.equal(sky.getRenderStats().points,0);
sky.render({...pose,eye:[1000,-500,200]},1,false,0);assert.equal(values.impactBlend,.5,'translation never advances the event');
sky.render(pose,1,false,10);assert.equal(values.impactBlend,0,'simulation elapsed reaches exact next keyframe');
sky.setImpactTime(22);sky.render(pose,1,true,10);sky.render(pose,1,false,0);assert.equal(values.impactBlend,.5,'empty/paused rendering does not advance');
sky.setImpactTime(120);sky.render(pose,1,false,0);assert.equal(values.impactBlend,0);
sky.setStyle(7);sky.render(pose,1,false,30);sky.setStyle(12);sky.setImpactTime(22);sky.render(pose,1,false,0);assert.equal(values.impactBlend,.5);
const source=shaders.find(source=>source.includes('impactSurround'));assert.ok(source.includes('atan(ray.y,ray.x)'));assert.ok(source.includes('permission'));assert.ok(source.includes('1.-uv.x'));assert.ok(!source.includes('eye'),'direction-only sky has no parallax');
const dims=['master','flash','between-12','between-32','between-60','between-90','plume'].map(name=>{const b=fs.readFileSync(path.join(__dirname,'../assets/backgrounds/impact-v1/'+name+'.png'));return [b.readUInt32BE(16),b.readUInt32BE(20)];});
assert.ok(dims.every(size=>size[0]===dims[0][0]&&size[1]===dims[0][1]));
console.log('PASS impact sky: eight local images, fixed-direction projection, exact timing, pause, no foreground stars and matched native plates');
