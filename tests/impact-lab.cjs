'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
// Resource-free timeline regression; actual plate pixels are checked in browser.
async function run(){
 let frame;
 const calls=[];
 const ctx=new Proxy({drawImage:(...args)=>calls.push(args),createRadialGradient:()=>({addColorStop(){}})},{get:(target,key)=>key in target?target[key]:()=>{}});
 const make=()=>({value:'',textContent:'',getContext:()=>ctx,addEventListener(){}});
 const elements=Object.fromEntries(['sky','error','time','speed','play','reset','view','clock','phase'].map(id=>[id,make()]));
 elements.speed.value='1';
 const document={getElementById:id=>elements[id],createElement:make,hidden:false};
 class Image{constructor(){this.naturalWidth=1672;this.naturalHeight=941;}set src(value){this.url=value;this.onload();}}
 const window={Driftworks:{assetUrl:value=>value},devicePixelRatio:1,addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiments/impact-lab.js'),'utf8'),{document,window,Image,innerWidth:1280,innerHeight:720,requestAnimationFrame:fn=>{frame=fn;},Error,Math,String,Number,Promise});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(elements.error.textContent,'');frame(1000);
 assert.equal(elements.phase.textContent,'Pristine master');
 elements.play.onclick();elements.time.value='120';elements.time.oninput();frame(2000);
 assert.equal(elements.clock.textContent,'+02:00');assert.equal(elements.phase.textContent,'Developed plume');
 assert.equal(elements.sky.width,1280);
 elements.reset.onclick();frame(3000);assert.equal(elements.clock.textContent,'−00:05');
 elements.time.value='179.9';elements.time.oninput();elements.speed.value='60';elements.play.onclick();frame(3100);assert.equal(elements.time.value,'180');
 elements.time.value='0';elements.time.oninput();document.hidden=true;frame(3300);assert.equal(elements.time.value,'0');
 assert.ok(calls.some(call=>call[0].url?.endsWith('/master.png')));
 assert.ok(calls.some(call=>call[0].url?.endsWith('/plume.png')));
 console.log('Impact image lab: loading, scrub, pause, restart, endpoint and hidden-tab timing pass.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
