'use strict';
// Development-only browser probe. Requires Playwright outside the static site.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const playwright=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'..');
const confirmation=process.argv.includes('--confirm');
function installProbe(count){
 const DW=window.Driftworks,probe=window.flightProbe={rows:[],collect:false,stages:{},frozen:false};
 const resolve=DW.flightMissions.resolve;
 DW.flightMissions.resolve=function(id){const m=resolve(id);return id==='furball'?{...m,encounter:{...m.encounter,count}}:m;};
 function timed(object,key,label){const original=object[key];object[key]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{probe.stages[label]=(probe.stages[label]||0)+performance.now()-start;}};}
 const create=DW.flightSession.create;
 DW.flightSession.create=function(options){const s=create({...options,seed:29}),reset=s.reset,advance=s.advance;s.reset=function(...args){const result=reset.apply(this,args),{combat,state}=s.snapshot(),U=DW.sim.METERS_PER_UNIT;
  const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const center=state.eye.map((v,k)=>v+(-state.back[k]*450+state.up[k]*40)/U),half=Math.ceil(count/2);
  combat.enemies.forEach((e,i)=>{const j=i%half,side=i<half?-1:1,x=side*(300+(j%2)*60),y=(Math.floor(j/2)%5-2)*60,z=(Math.floor(j/10)-(Math.ceil(half/10)-1)/2)*60;
   e.pose.eye=center.map((v,k)=>v+(state.right[k]*x-state.back[k]*y+state.up[k]*z)/U);
   const forward=unit(center.map((v,k)=>v-e.pose.eye[k])),reference=Math.abs(forward[2])>.95?[0,1,0]:[0,0,1];e.pose.right=unit(cross(forward,reference));e.pose.up=unit(cross(e.pose.right,forward));e.pose.back=forward.map(v=>-v);e.pose.velocity=forward.map(v=>v*45);e.goal=center.slice();});return result;};
  s.advance=function(...args){if(!probe.frozen)return advance.apply(this,args);};timed(s,'advance','simulation');probe.session=s;return s;};
 const mount=DW.flightPresentation.mount;DW.flightPresentation.mount=function(...args){const p=mount.apply(this,args);timed(p,'render','presentation');probe.presentation=p;return p;};
 const controls=DW.flightControls.mount;DW.flightControls.mount=function(...args){const c=controls.apply(this,args);c.sample=()=>({stop:true,fire:true});return c;};
 const hud=DW.flightHud.mount; if(hud)DW.flightHud.mount=function(...args){const h=hud.apply(this,args);timed(h,'render','hud');return h;};
 const diagnostics=DW.flightDiagnostics.mount;DW.flightDiagnostics.mount=function(...args){const d=diagnostics.apply(this,args),begin=d.beginFrame,end=d.endFrame;d.beginFrame=function(...a){probe.stages={};return begin.apply(this,a);};d.endFrame=function(frame,paused,...a){const cpu=performance.now()-frame.started;if(probe.collect&&!paused){const stats=probe.presentation.renderStats(),v=probe.session.snapshot();probe.rows.push({interval:frame.actualElapsed*1000,cpu,...probe.stages,draws:stats.scene.drawCalls+stats.sky.drawCalls,triangles:stats.scene.triangles+stats.sky.triangles,alive:v.combat.enemies.filter(e=>e.hp>0).length});}return end.call(this,frame,paused,...a);};return d;};
}
const summary=rows=>{const result={frames:rows.length};for(const key of ['interval','cpu','simulation','presentation','hud','draws','triangles','alive']){const a=rows.map(r=>r[key]||0).sort((a,b)=>a-b);result[key]={mean:a.reduce((s,v)=>s+v,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],worst:a.at(-1)};}return result;};
(async()=>{
 const browser=await playwright.chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const rows=[];let graphics;
 try{for(const count of confirmation?[100]:[16,50,100])for(const scale of [1,.5]){
  await page.route('**/flight.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:'('+installProbe.toString()+')('+count+');\n'+await response.text()});});
  await page.goto('http://localhost:8000/experiments/flight.html?mission=furball');await page.waitForFunction(()=>window.flightProbe?.session&&document.querySelector('#ally-art').options.length>1);
  await page.selectOption('#input-mode','controller');await page.selectOption('#fps-cap','0',{force:true});await page.selectOption('#render-scale',String(scale),{force:true});await page.click('#fly');
  await page.waitForTimeout(2000);
  graphics=await page.evaluate(()=>{const c=document.querySelector('canvas'),g=c.getContext('webgl2')||c.getContext('webgl'),e=g&&g.getExtension('WEBGL_debug_renderer_info');return {renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'unavailable',vendor:e?g.getParameter(e.UNMASKED_VENDOR_WEBGL):'unavailable',gpuTimerAvailable:!!g?.getExtension('EXT_disjoint_timer_query_webgl2'),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,art:window.flightProbe.presentation.appearance(),stats:window.flightProbe.presentation.renderStats()};});
  await page.evaluate(()=>{flightProbe.rows=[];flightProbe.collect=true;});await page.waitForTimeout(12000);const samples=await page.evaluate(()=>{flightProbe.collect=false;return flightProbe.rows;});
  assert.ok(samples.length>100,'Expected active browser frames');assert.ok(samples.every(s=>Object.values(s).every(Number.isFinite)),'Non-finite browser measurement');
  const row={count,scale,mode:'live',...summary(samples)};rows.push(row);console.log(JSON.stringify(row));
  await page.screenshot({path:path.join(root,'docs/benchmarks/flight-browser-'+count+'-'+scale+'.png')});
  await page.evaluate(()=>{flightProbe.frozen=true;flightProbe.rows=[];});await page.waitForTimeout(1000);await page.evaluate(()=>flightProbe.collect=true);await page.waitForTimeout(4000);const frozen=await page.evaluate(()=>{flightProbe.collect=false;return flightProbe.rows;});rows.push({count,scale,mode:'frozen-simulation',...summary(frozen)});
  await page.unroute('**/flight.js?*');
 }}finally{fs.writeFileSync(path.join(root,'docs/benchmarks/flight-browser'+(confirmation?'-confirm':'')+'-2026-10-23.json'),JSON.stringify({cpu:require('node:os').cpus()[0].model,graphics,errors,method:'Visible Chrome, 1280x720 DPR1, uncapped, dense seed29, 2s wall warmup then 12s live; 1s warmup and 4s with session.advance disabled. Real frame loop/HUD/audio. Timers overlap; GPU timer availability only, no GPU duration measurement. Frozen mode retains other per-frame maintenance; final live snapshot. Rendering is camera-dependent.',rows},null,2)+'\n');await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
