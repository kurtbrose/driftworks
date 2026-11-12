'use strict';
// Optional development browser dependency; serve the repository on port 8000.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
const output=path.resolve(__dirname,'../output/freighter-modules');fs.mkdirSync(output,{recursive:true});
const percentile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
(async()=>{
 const browser=await chromium.launch({channel:process.env.DRIFTWORKS_BROWSER_CHANNEL||(process.platform==='win32'?'chrome':undefined),headless:!process.argv.includes('--visible')});
 const page=await browser.newPage({viewport:{width:1400,height:900},deviceScaleFactor:1}),errors=[],results=[];
 page.on('pageerror',error=>errors.push(String(error)));
 try{
  await page.goto('http://localhost:8000/studies/freighter-modules.html');await page.waitForFunction(()=>window.freighterRange);
  const snapshot=()=>page.evaluate(()=>window.freighterRange.snapshot());
  async function shoot(){await page.click('#fire');await page.waitForFunction(()=>window.freighterRange.snapshot().bolts===0);}
  for(const [model,payload,count] of [['container','Container',24],['mixed','Container',8],['fluid','Tank',4]]){
   await page.selectOption('#model',model);await page.waitForTimeout(300);
   let state=await snapshot();assert.equal(state.modules.filter(m=>m.type===payload).length,count);assert.equal(state.modules.filter(m=>m.type==='Drive').length,4);
   assert(state.triangles>10000);assert(state.draws<=12,'Intact components remain batched by material');
   // The upper, near-side front payload is exposed in the fixed broadside pose.
   const target=state.modules.filter(m=>m.type===payload).sort((a,b)=>a.center[0]-b.center[0]||b.center[1]-a.center[1]||b.center[2]-a.center[2])[0];
   await page.selectOption('#module',String(target.id));const camera=state.camera;
   for(let shot=1;shot<=3;shot++){await shoot();state=await snapshot();assert.equal(state.modules[target.id].hp,Math.max(0,100-shot*35));assert.deepEqual(state.camera,camera,'Firing never moves the camera');}
   assert.equal(state.debris,1);assert.equal(state.modules.filter(m=>m.hp===0).length,1,'One component dies independently');
   assert.equal(await page.locator('#fire').isDisabled(),true);
   await page.waitForTimeout(3000);await page.screenshot({path:path.join(output,model+'-detached.png')});
   const damaged=await snapshot();assert.equal(damaged.revision,state.revision,'Moving debris does not rebuild hull geometry');
   await page.click('#reset');state=await snapshot();assert(state.modules.every(m=>m.hp===100));assert.equal(state.debris,0);assert.equal(state.bolts,0);
   // Check engine and command damage through real sweeps from their inspection poses.
   for(const [type,preset] of [['Drive','stern'],['Command','bow']]){
    await page.click('#'+preset);state=await snapshot();const m=state.modules.filter(m=>m.type===type).at(-1);
    await page.selectOption('#module',String(m.id));for(let i=0;i<3;i++)await shoot();
    assert.equal((await snapshot()).modules[m.id].hp,0,type+' detaches');
   }
   await page.click('#reset');await page.waitForTimeout(1600);const before=await snapshot();
   // Same-pose intact / one detached / detached / reset sampling (ABBA).
   await page.selectOption('#module',String(target.id));for(let i=0;i<3;i++)await shoot();
   await page.waitForTimeout(1800);const after=await snapshot();await page.waitForTimeout(1800);const after2=await snapshot();
   await page.click('#reset');await page.waitForTimeout(1800);const before2=await snapshot();
   const stats=s=>({draws:s.draws,triangles:s.triangles,geometries:s.geometries,frameMedian:percentile(s.samples.slice(-60),.5),frameP95:percentile(s.samples.slice(-60),.95),submissionMedian:percentile(s.submission.slice(-60),.5)});
   assert.deepEqual(before.camera,after.camera);assert.deepEqual(before.resolution,after.resolution);
   assert.equal(before.geometries,before2.geometries,'Reset releases merged and detached buffers');
   results.push({model,resolution:before.resolution,dpr:before.dpr,camera:before.camera,intact:stats(before),detached:stats(after),detached2:stats(after2),restored:stats(before2)});
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify({scope:'Authored 3D damage range, not production convoy performance; CPU submission and browser cadence, not GPU time.',results},null,2)+'\n');
  console.log('PASS freighter module range: three variants, exact surface hits, payload/engine/command detachment, independent health, fixed firing camera, shared batches, reset and geometry lifetime.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
