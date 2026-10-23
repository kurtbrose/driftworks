'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const scope={};vm.createContext(scope);
vm.runInContext(fs.readFileSync('experiments/gas-giant-weather.js','utf8').replaceAll('export ','')+'\nthis.cells=gasGiantCells;this.flash=gasGiantFlash;this.drift=gasGiantDrift;',scope);
assert.equal(scope.cells.length,8);
for(let i=0;i<8;i++)for(let j=i+1;j<8;j++){
 const a=scope.cells[i],b=scope.cells[j];
 assert(Math.abs(a[0]-b[0])>a[2]+b[2]||Math.abs(a[1]-b[1])>a[3]+b[3],'Permission regions must not overlap');
}
let concurrent=false;const peaks=Array(8).fill(0),quiet=Array(8).fill(0);
for(let t=0;t<120;t+=.025){let count=0;for(let i=0;i<8;i++){
 const v=scope.flash(t,i);assert(v>=0&&v<=1);assert.equal(v,scope.flash(t,i));
 if(v>.2){count++;peaks[i]++;}if(v<.01)quiet[i]++;
}if(count>=2)concurrent=true;}
assert(concurrent,'Independent cells can flash simultaneously');assert(peaks.every(Boolean));assert(quiet.every(Boolean));
for(let i=0;i<8;i++){
 const first=scope.drift(0,i),later=scope.drift(100,i);assert.notDeepEqual(first,later,'New bursts relocate');
 const seen=new Set();for(let t=0;t<120;t+=.025){
  const d=scope.drift(t,i);assert(Math.abs(d[0])<=.036&&Math.abs(d[1])<=.021);assert.deepEqual(d,scope.drift(t,i));
  seen.add(d.join(','));
  if(scope.flash(t,i)>.01&&scope.flash(t+.025,i)>.01)assert.deepEqual(d,scope.drift(t+.025,i),'No position jump during visible burst');
 }assert(seen.size>10,'Locations vary across the sequence');
}
for(const stage of ['dark','lit']){
 const manifest=JSON.parse(fs.readFileSync(`assets/backgrounds/gas-giant-lightning-v1/${stage}-cube/manifest.json`));
 assert.equal(manifest.size,1024);assert.equal(manifest.fovDegrees,90);assert.equal(Object.keys(manifest.faces).length,6);
 for(const face of Object.values(manifest.faces))assert(fs.existsSync(`assets/backgrounds/gas-giant-lightning-v1/${stage}-cube/${face.file}`));
}
console.log('Gas giant: isolated masks, independent reproducible bursts and twelve baked faces pass');
// Exercise the real preview's resource/frame lifecycle without a renderer.
(async()=>{
 let uploads=0,draws=0,nextFrame,contextOptions;
 const gl=new Proxy({}, {get:(_,key)=>{
  if(key==='texImage2D')return ()=>uploads++;
  if(key==='drawArrays')return ()=>draws++;
  if(key==='getShaderParameter'||key==='getProgramParameter')return ()=>true;
  if(String(key).startsWith('create')||key==='getUniformLocation')return ()=>({});
  if(key==='getAttribLocation')return ()=>0;
  return /^[A-Z_0-9]+$/.test(String(key))?1:()=>{};
 }});
 const elements={};for(const id of ['sky','play','home','burst','status','mode','fov','activity'])elements[id]={textContent:'',value:'',addEventListener(){}};
 elements.mode.value='live';elements.fov.value='60';elements.activity.value='1';
 Object.assign(elements.sky,{width:0,height:0,dataset:{},getContext:(_,options)=>{contextOptions=options;return gl;}});
 const document={hidden:false,getElementById:id=>elements[id]};
 const runtime={document,window:{Driftworks:{assetUrl:value=>value},addEventListener(){}},
  Image:class{width=1024;height=1024;set src(value){queueMicrotask(()=>this.onload());}},
  matchMedia:()=>({matches:false}),devicePixelRatio:1,innerWidth:1200,innerHeight:800,
  requestAnimationFrame:callback=>{nextFrame=callback;}};
 vm.createContext(runtime);
 vm.runInContext(fs.readFileSync('experiments/gas-giant-weather.js','utf8').replaceAll('export ','')+'\n'+fs.readFileSync('experiments/gas-giant-lab.js','utf8').replace(/^import .*;\r?\n/,''),runtime);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(uploads,12,'Only twelve cube faces upload on load');assert.equal(contextOptions.depth,false);
 nextFrame(100);assert.equal(draws,1);nextFrame(116);assert.equal(draws,2);
 elements.play.onclick();nextFrame(132);nextFrame(148);assert.equal(draws,2,'Pause skips unchanged GPU frames');
 elements.burst.onclick();nextFrame(164);assert.equal(draws,3,'Manual burst still draws while paused');
 elements.mode.value='dark';nextFrame(180);const staticDraws=draws;
 elements.play.onclick();nextFrame(196);nextFrame(212);assert.equal(draws,staticDraws,'Static comparison does not redraw as time advances');
 elements.mode.value='live';nextFrame(228);assert.equal(draws,staticDraws+1);
 document.hidden=true;nextFrame(244);nextFrame(260);assert.equal(draws,staticDraws+1,'Hidden preview stops drawing');
 document.hidden=false;nextFrame(276);assert.equal(draws,staticDraws+2,'Visible preview resumes');
 assert.equal(uploads,12,'Animation never reuploads textures');
 console.log('Gas giant resource lifecycle: twelve initial uploads, no animation uploads, pause/static/hidden draw suppression pass');
})().catch(error=>{console.error(error);process.exitCode=1;});
