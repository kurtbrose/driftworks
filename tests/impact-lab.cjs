'use strict';
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
// Resource-free timeline regression; actual plate pixels are checked in browser.
async function run(){
 let frame;
 const calls=[];
 const ctx=new Proxy({globalAlpha:1,globalCompositeOperation:'source-over',drawImage(...args){calls.push({args,alpha:this.globalAlpha,operation:this.globalCompositeOperation});},createRadialGradient:()=>({addColorStop(){}})},{get:(target,key)=>key in target?target[key]:()=>{}});
 const make=()=>({value:'',textContent:'',getContext:()=>ctx,addEventListener(){}});
 const elements=Object.fromEntries(['sky','error','time','speed','sequence','stage','play','reset','view','clock','phase'].map(id=>[id,make()]));
 elements.speed.value='1';
 const document={getElementById:id=>elements[id],createElement:make,hidden:false};
 class Image{constructor(){this.naturalWidth=1672;this.naturalHeight=941;}set src(value){this.url=value;this.onload();}}
 const window={Driftworks:{assetUrl:value=>value},devicePixelRatio:1,addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiments/impact-lab.js'),'utf8'),{document,window,Image,innerWidth:1280,innerHeight:720,requestAnimationFrame:fn=>{frame=fn;},Error,Math,String,Number,Promise});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(elements.error.textContent,'');frame(1000);
 assert.equal(elements.phase.textContent,'Pristine master');
 elements.play.onclick();
 function scrub(time){calls.length=0;elements.time.value=String(time);elements.time.oninput();frame(2000);return calls.filter(call=>call.args[0].url).slice(0,-1);}
 // Every painted timestamp selects its exact image, not a three-way blend.
 for(const [time,name] of [[.25,'flash'],[12,'between-12'],[32,'between-32'],[60,'between-60'],[90,'between-90'],[120,'plume']]){
  const painted=scrub(time);assert.equal(painted.length,1);assert.ok(painted[0].args[0].url.endsWith('/'+name+'.png'));assert.equal(painted[0].alpha,1);
  assert.ok(calls.some(call=>call.operation==='destination-in'));
 }
 const halfway=scrub(22);assert.equal(halfway.length,2);assert.ok(halfway[0].args[0].url.endsWith('/between-12.png'));assert.ok(halfway[1].args[0].url.endsWith('/between-32.png'));assert.equal(halfway[1].alpha,.5);
 elements.sequence.value='original';const original=scrub(22);assert.equal(original.length,3);assert.ok(original[2].args[0].url.endsWith('/plume.png'));elements.sequence.value='inbetweens';scrub(120);
 assert.equal(elements.clock.textContent,'+02:00');assert.equal(elements.phase.textContent,'Developed plume');
 assert.equal(elements.sky.width,1280);
 elements.reset.onclick();frame(3000);assert.equal(elements.clock.textContent,'−00:05');
 elements.time.value='179.9';elements.time.oninput();elements.speed.value='60';elements.play.onclick();frame(3100);assert.equal(elements.time.value,'180');
 elements.time.value='0';elements.time.oninput();document.hidden=true;frame(3300);assert.equal(elements.time.value,'0');
 elements.stage.value='32';elements.stage.onchange();frame(3400);assert.equal(elements.phase.textContent,'Low ejecta');assert.equal(elements.play.textContent,'Play');
 console.log('Impact image lab: exact keyframes, adjacent-pair blending, fixed mask, original comparison and timeline controls pass.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
