'use strict';
// Development-only browser probe. Requires Playwright outside the static site.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const playwright=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'..');
const sources=Object.fromEntries(['experiments/training.js','experiments/flight-session.js','experiments/flight-collision.js','experiments/ship-packs.js','experiments/gpu-ui.js','experiments/flight-presentation.js','experiments/guns.js','src/explosions.js','src/scene3d.js'].map(file=>[file,require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
const confirmation=process.argv.includes('--confirm');
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const counts=option('--counts',confirmation?'100':'16,32,64,128,256,512').split(',').map(Number);
const scales=option('--scales',confirmation?'1,0.5':'1').split(',').map(Number);
const output=option('--output','docs/benchmarks/flight-browser'+(confirmation?'-confirm':'')+'-'+new Date().toISOString().slice(0,10)+'.json');
if(!counts.length||counts.some(n=>!Number.isInteger(n)||n<2||n>2048)||!scales.length||scales.some(n=>![.25,.5,.75,1].includes(n)))throw Error('Use 2-2048 fighters and supported render scales: 0.25, 0.5, 0.75, 1');
const effectBurst=Number(option('--effect-burst','0'));
if(!Number.isInteger(effectBurst)||effectBurst<0||counts.some(n=>effectBurst>n))throw Error('Effect burst must be between zero and the fighter count');
const reference=option('--reference',null);
const referenceTraining=reference?require('node:child_process').execFileSync('git',['show',reference+':experiments/training.js'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}):null;
const referenceUi=reference?require('node:child_process').execFileSync('git',['show',reference+':experiments/gpu-ui.js'],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024}):null;
if(referenceTraining)sources['experiments/training.js']=require('node:crypto').createHash('sha256').update(referenceTraining).digest('hex');
if(referenceUi)sources['experiments/gpu-ui.js']=require('node:crypto').createHash('sha256').update(referenceUi).digest('hex');
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
   const forward=unit(center.map((v,k)=>v-e.pose.eye[k])),reference=Math.abs(forward[2])>.95?[0,1,0]:[0,0,1];e.pose.right=unit(cross(forward,reference));e.pose.up=unit(cross(e.pose.right,forward));e.pose.back=forward.map(v=>-v);e.pose.velocity=forward.map(v=>v*45);e.goal=center.slice();e.decision=(i%16)*.13;});return result;};
  s.advance=function(...args){if(!probe.frozen)return advance.apply(this,args);};timed(s,'advance','simulation');probe.session=s;return s;};
 const mount=DW.flightPresentation.mount;DW.flightPresentation.mount=function(...args){const p=mount.apply(this,args);timed(p,'render','presentation');probe.presentation=p;return p;};
 const controls=DW.flightControls.mount;DW.flightControls.mount=function(...args){const c=controls.apply(this,args);c.sample=()=>({stop:true,fire:true});return c;};
 const hud=DW.flightHud.mount; if(hud)DW.flightHud.mount=function(...args){const h=hud.apply(this,args);timed(h,'render','hud');return h;};
 const geometry=DW.flightGuns.geometry;
 DW.flightGuns.geometry=function(...args){const batches=geometry.apply(this,args);probe.effectAudit.bolts+=args[0].bolts.length;probe.effectAudit.boltQuads+=batches.slice(0,3).reduce((n,b)=>n+b.vertices.length/36,0);probe.effectAudit.impacts+=args[0].impacts.length;probe.effectAudit.impactQuads+=(batches[3]?.vertices.length||0)/36;return batches;};
 probe.burst=n=>{const {combat}=probe.session.snapshot();
  for(const e of [combat.player,...combat.enemies]){if(e.hp<=0)continue;e.guns.cooldown=0;DW.flightGuns.step(e.guns,e.pose,DW.retailWeapons[e.weaponIndex||0],true,0,undefined,undefined,e.profile.gunMounts,DW.training.gunAnchors(e));}
  const weapon={...DW.retailWeapons[0],damage:1e6,shieldFactor:1,armorFactor:1};
  for(let i=0;i<n;i++)DW.training.damageCraft(combat,combat.enemies[Math.floor(i*combat.enemies.length/n)],weapon,null);
  combat.flashes.forEach(f=>{if(f.destruction)f.age=.2;});probe.frozen=true;};
 probe.metrics=()=>{const c=probe.session.snapshot().combat,craft=[c.player,...c.enemies];return {allyShots:craft.filter(e=>e.team==='ally').reduce((n,e)=>n+e.guns.fired,0),enemyShots:craft.filter(e=>e.team==='enemy').reduce((n,e)=>n+e.guns.fired,0),shots:craft.reduce((n,e)=>n+e.guns.fired,0),hits:craft.reduce((n,e)=>n+e.guns.hits,0),alive:c.enemies.filter(e=>e.hp>0).length,kills:c.kills,modes:Object.fromEntries([...new Set(c.enemies.map(e=>e.mode))].map(m=>[m,c.enemies.filter(e=>e.mode===m).length]))};};
 const diagnostics=DW.flightDiagnostics.mount;DW.flightDiagnostics.mount=function(...args){const d=diagnostics.apply(this,args),begin=d.beginFrame,end=d.endFrame;d.beginFrame=function(...a){probe.stages={};probe.effectAudit={bolts:0,boltQuads:0,impacts:0,impactQuads:0};return begin.apply(this,a);};d.endFrame=function(frame,paused,...a){const cpu=performance.now()-frame.started;if(probe.collect&&!paused){if(document.hidden)throw Error('Benchmark tab hidden');const stats=probe.presentation.renderStats(),v=probe.session.snapshot();probe.rows.push({interval:frame.actualElapsed*1000,simElapsed:probe.frozen?0:frame.elapsed*1000,cpu,...probe.stages,...probe.effectAudit,destructions:v.combat.flashes.filter(f=>f.destruction).length,explosions:stats.scene.explosions||0,explosionBatches:stats.scene.explosionBatches||0,firing:v.combat.enemies.filter(e=>e.fire).length,draws:stats.scene.drawCalls+stats.sky.drawCalls,triangles:stats.scene.triangles+stats.sky.triangles,alive:v.combat.enemies.filter(e=>e.hp>0).length});}return end.call(this,frame,paused,...a);};return d;};
}
const summary=rows=>{const result={frames:rows.length,wallSeconds:rows.reduce((s,r)=>s+r.interval,0)/1000,simulatedSeconds:rows.reduce((s,r)=>s+r.simElapsed,0)/1000};for(const key of ['interval','cpu','simulation','presentation','hud','draws','triangles','alive','bolts','boltQuads','impacts','impactQuads','destructions','explosions','explosionBatches','firing']){const a=rows.map(r=>r[key]||0).sort((a,b)=>a-b);result[key]={mean:a.reduce((s,v)=>s+v,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],worst:a.at(-1)};}return result;};
(async()=>{
 const browser=await playwright.chromium.launch({channel:'chrome',headless:false,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const rows=[];let graphics;
 if(referenceTraining)await page.route('**/training.js?*',route=>route.fulfill({status:200,contentType:'application/javascript',body:referenceTraining}));
 if(referenceUi)await page.route('**/gpu-ui.js?*',route=>route.fulfill({status:200,contentType:'application/javascript',body:referenceUi}));
 const cdp=process.argv.includes('--profile')?await page.context().newCDPSession(page):null;
 if(cdp)await cdp.send('Profiler.enable');
 try{for(const count of counts)for(const scale of scales){
  await page.route('**/flight.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:'('+installProbe.toString()+')('+count+');\n'+await response.text()});});
  await page.goto('http://localhost:8000/experiments/flight.html?mission=furball');await page.waitForFunction(()=>window.flightProbe?.session&&document.querySelector('#ally-art').options.length>1);
  await page.selectOption('#input-mode','controller');await page.selectOption('#fps-cap','0',{force:true});await page.selectOption('#render-scale',String(scale),{force:true});await page.click('#fly');
  await page.bringToFront();await page.waitForTimeout(2000);
  if(effectBurst){await page.evaluate(n=>flightProbe.burst(n),effectBurst);await page.waitForTimeout(2000);}
  graphics=await page.evaluate(()=>{const c=document.querySelector('canvas'),g=c.getContext('webgl2')||c.getContext('webgl'),e=g&&g.getExtension('WEBGL_debug_renderer_info');return {renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'unavailable',vendor:e?g.getParameter(e.UNMASKED_VENDOR_WEBGL):'unavailable',gpuTimerAvailable:!!g?.getExtension('EXT_disjoint_timer_query_webgl2'),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,art:window.flightProbe.presentation.appearance(),stats:window.flightProbe.presentation.renderStats()};});
  if(process.argv.includes('--diagnostics-only')){
   await page.keyboard.press('F3');await page.waitForTimeout(1000);
   assert.match(await page.locator('#perf-overlay').innerText(),/Effects \d+ explosions/);
   await page.locator('#perf-overlay').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.resolve(root,output.replace(/\.json$/,'')+'-'+count+'-'+scale+'-diagnostics.png')});
   await page.unroute('**/flight.js?*');continue;
  }
  if(cdp)await cdp.send('Profiler.start');
  const combatStart=await page.evaluate(()=>{flightProbe.rows=[];flightProbe.collect=true;return flightProbe.metrics();});await page.waitForTimeout(12000);const samples=await page.evaluate(()=>{flightProbe.collect=false;return flightProbe.rows;});
  assert.ok(samples.length>=5,'Expected active browser frames');assert.ok(samples.every(s=>s.draws>0),'Expected submitted geometry');assert.ok(samples.every(s=>Object.values(s).every(Number.isFinite)),'Non-finite browser measurement');
  if(cdp){const {profile}=await cdp.send('Profiler.stop'),nodes=new Map(profile.nodes.map(n=>[n.id,n])),totals=new Map();
   for(let i=0;i<profile.samples.length;i++){const f=nodes.get(profile.samples[i]).callFrame,key=f.functionName+' '+f.url.split('/').at(-1)+':'+(f.lineNumber+1);totals.set(key,(totals.get(key)||0)+profile.timeDeltas[i]/1000);}
   fs.writeFileSync(path.resolve(root,output.replace(/\.json$/,'')+'-'+count+'-'+scale+'-profile.json'),JSON.stringify([...totals].sort((a,b)=>b[1]-a[1]).slice(0,50),null,2)+'\n');}
  const combatEnd=await page.evaluate(()=>flightProbe.metrics());
  assert.ok(samples.every(s=>s.bolts===s.boltQuads&&s.impacts===s.impactQuads),'Projectile geometry dropped effects');
  assert.ok(samples.every(s=>s.destructions===s.explosions),'Explosion rendering dropped effects');
  const row={count,scale,mode:effectBurst?'frozen-effects-burst':'live',combatStart,combatEnd,...summary(samples)};rows.push(row);console.log(JSON.stringify(row));
  await page.screenshot({path:path.resolve(root,output.replace(/\.json$/, '')+'-'+count+'-'+scale+'.png')});
  await page.evaluate(()=>{flightProbe.frozen=true;flightProbe.rows=[];});await page.waitForTimeout(1000);await page.evaluate(()=>flightProbe.collect=true);await page.waitForTimeout(4000);const frozen=await page.evaluate(()=>{flightProbe.collect=false;return flightProbe.rows;});rows.push({count,scale,mode:'frozen-simulation',...summary(frozen)});
  await page.unroute('**/flight.js?*');
 }}finally{fs.writeFileSync(path.resolve(root,output),JSON.stringify({cpu:require('node:os').cpus()[0].model,reference,profiled:!!cdp,sources,effectBurst,counts,scales,graphics,errors,method:'Visible Chrome, 1280x720 DPR1, uncapped, dense seed29 with both teams staggered within 2s, 2s wall warmup then 12s live; 1s warmup and 4s with session.advance disabled. Real frame loop/HUD/audio. Timers overlap; GPU timer availability only, no GPU duration measurement. Frozen mode retains other per-frame maintenance; final live snapshot. Rendering is camera-dependent.',rows},null,2)+'\n');await browser.close();}
 if(errors.length)throw Error('Browser errors: '+errors.join(' / '));
})().catch(e=>{console.error(e);process.exitCode=1;});
