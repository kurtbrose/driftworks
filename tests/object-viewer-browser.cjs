'use strict';
// Development-only UI integration. Serve the repository on localhost:8000.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
const output=path.resolve(__dirname,'../output/object-viewer');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:process.env.DRIFTWORKS_BROWSER_CHANNEL||(process.platform==='win32'?'chrome':undefined),headless:!process.argv.includes('--visible')});
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1}),errors=[],reports=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(r.status()+' '+r.url());});
 const ready=async()=>{await page.waitForFunction(()=>window.objectViewer&&!objectViewer.state.loading);assert.equal(await page.evaluate(()=>objectViewer.state.error),'');await page.waitForTimeout(200);};
 const capture=name=>page.screenshot({path:path.join(output,name+'.png')});
 const state=()=>page.evaluate(()=>{const s=objectViewer.state;return {id:s.entry.id,kind:s.entry.kind,seed:s.seed,center:s.center,distance:s.distance,radius:s.radius,eye:s.pose.eye,stats:s.stats};});
 async function family(value){await page.selectOption('#category',value);await ready();}
 try{
  for(const [url,kind,id] of [['studies/object-viewer.html?family=freighters&object=fluid&seed=0','freighter','fluid'],['experiments/ship-packs.html?model=quaternius-ultimate-spaceships:Striker','fighter','quaternius-ultimate-spaceships:Striker'],['experiments/concept-ships.html?model=raptor','fighter','concept-trio:raptor'],['experiments/dreadnaught-kit.html','capital','aegis']]){await page.goto('http://localhost:8000/'+url);await page.waitForURL('**/experiments/object-viewer.html?**');await ready();assert.equal((await state()).kind,kind);assert.equal((await state()).id,id);}
  await page.goto('http://localhost:8000/experiments/object-viewer.html');await ready();await capture('fighter');
  const all=await page.locator('#object option').evaluateAll(options=>options.map(o=>o.value));
  for(const id of all){await page.selectOption('#object',id);await ready();assert.equal((await state()).id,id);assert.ok((await state()).stats.triangles>0);}
  await family('freighters');
  await family('liners');for(const id of ['commuter','double-decker']){await page.selectOption('#object',id);await ready();assert.ok((await state()).stats.triangles>100000);for(const view of ['quarter','rear','below']){await page.selectOption('#view',view);await page.waitForTimeout(150);await capture(id+'-'+view);}await page.evaluate(()=>{window.savedLinerVertices=objectViewer.state.batches[0].vertices;});await family('fighters');await family('liners');await page.selectOption('#object',id);await ready();assert.equal(await page.evaluate(()=>objectViewer.state.batches[0].vertices===window.savedLinerVertices),true);}
  await family('freighters');
  for(const id of ['container','mixed','fluid']){await page.selectOption('#object',id);await ready();assert.ok((await state()).stats.triangles>0);await capture(id);}
  await page.selectOption('#object','container');await ready();const before=await state();await page.click('#shuffle');await ready();const after=await state();assert.notEqual(after.seed,before.seed);assert.deepEqual(after.eye,before.eye);
  await page.fill('#cargo-seed','0');await page.locator('#cargo-seed').press('Tab');await ready();assert.equal((await state()).seed,0);
  await page.selectOption('#view','front');await page.selectOption('#environment','style-8');await page.selectOption('#lighting','sky');
  const url=page.url(),saved=await state();await page.reload();await ready();assert.equal((await state()).seed,0);assert.deepEqual((await state()).eye,saved.eye);assert.equal(await page.locator('#environment').inputValue(),'style-8');assert.equal(await page.locator('#lighting').inputValue(),'sky');assert.equal(page.url(),url);
  await page.selectOption('#lighting','inspection');await family('capitals');await page.selectOption('#view','quarter');await capture('capital-wide');
  const rect=await page.locator('#viewer').boundingBox();await page.mouse.move(rect.x+rect.width/2,rect.height/2);await page.mouse.wheel(0,-450);await page.waitForTimeout(200);await capture('capital-close');
  const initial=await state();await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+110,rect.height/2+40,{steps:8});await page.mouse.up();assert.notDeepEqual((await state()).eye,initial.eye);
  await page.click('#fit');await page.selectOption('#view','below');await capture('capital-below');
  for(const [f,id] of [['freighters','container'],['capitals','aegis'],['liners','commuter'],['liners','double-decker']]){await family(f);await page.selectOption('#object',id);await ready();await page.waitForTimeout(500);if(process.argv.includes('--measure')){
   const report=await page.evaluate(async()=>{const v=objectViewer,saved=v.state.batches,rows=[],size=[innerWidth,innerHeight,devicePixelRatio];document.querySelector('#engines').checked=false;v.scene.setStudyEffects([]);v.suspended=true;for(const visible of [false,true,true,false]){v.scene.setStudyActors(visible?saved:[]);let previous=0;for(let i=0;i<60;i++){const now=await new Promise(requestAnimationFrame);if(document.hidden||innerWidth!==size[0]||innerHeight!==size[1])throw Error('Invalid measurement visibility or size');const start=performance.now();v.draw();const cpu=performance.now()-start,stats=v.scene.getRenderStats();if(i>=15)rows.push({visible,cpu,frame:now-previous,draws:stats.drawCalls,triangles:stats.triangles});previous=now;}}v.scene.setStudyActors(saved);v.suspended=false;const pct=(r,k,p)=>{const a=r.map(x=>x[k]).sort((a,b)=>a-b);return a[Math.floor((a.length-1)*p)];};return {object:v.state.entry.id,camera:v.state.pose,viewport:size,backing:v.state.stats,conditions:'Fixed camera; engines off; 15 warmup + 45 samples per ABBA block; CPU submission/cadence only; GPU execution unmeasured',rows:[false,true].map(visible=>{const r=rows.filter(x=>x.visible===visible);return {visible,cpuMedian:pct(r,'cpu',.5),cpuP95:pct(r,'cpu',.95),frameMedian:pct(r,'frame',.5),frameP95:pct(r,'frame',.95),draws:pct(r,'draws',.5),triangles:pct(r,'triangles',.5)};})};});reports.push(report);assert.ok(report.rows[1].draws>0);
  }}
  await family('wormholes');await page.selectOption('#view','quarter');await page.waitForTimeout(1500);await capture('wormhole-local');const wormBefore=await page.screenshot();await page.selectOption('#destination','style-9');await page.waitForTimeout(1800);assert.notDeepEqual(await page.screenshot(),wormBefore);await capture('wormhole-sun');await page.selectOption('#side','1');await page.waitForTimeout(1500);await capture('wormhole-other-side');
  await page.mouse.move(rect.x+rect.width/2,rect.height/2);await page.mouse.wheel(0,-3000);await page.waitForTimeout(300);await capture('wormhole-near-throat');assert.ok((await state()).distance>(await state()).radius);
  await family('fighters');await page.selectOption('#category','capitals');await page.selectOption('#category','freighters');await ready();assert.equal((await state()).kind,'freighter');assert.ok((await state()).stats.triangles>0);
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(400);await capture('mobile');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify(reports,null,2)+'\n');console.log('Object viewer passed: all fighter models, three freighters, capital, wormhole, seed, camera, saved links, sky changes, switching and mobile.');if(reports.length)console.log(JSON.stringify(reports,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
