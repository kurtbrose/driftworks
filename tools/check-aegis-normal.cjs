'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ctx={window:{}};for(const f of ['bevel','normal'])vm.runInNewContext(fs.readFileSync(`output/aegis-${f}-data.js`,'utf8'),ctx);
const d=ctx.window.AegisBevelData,n=ctx.window.AegisNormalData;
assert.equal(n.vertices.length/24,60);assert.equal(n.sourceHash,d.sourceHash);assert.equal(n.bevelHash,crypto.createHash('sha256').update(JSON.stringify(d.weighted)).digest('hex'));
for(let i=0;i<180;i++){assert.deepEqual(n.vertices.slice(i*8,i*8+6),d.original.slice(i*6,i*6+6),'bake keeps original positions and normals');assert(n.vertices.slice(i*8+6,i*8+8).every(v=>v>0&&v<1));}
const shader=fs.readFileSync('output/aegis-normal-renderer.js','utf8');assert(shader.includes('#ifdef AEGIS_BAKED_NORMAL'));assert(!shader.includes('dFdx'),'baked shader performs no runtime edge detection');
console.log('Normal bake: original 60 triangles preserved, UV bounds and source/bevel hashes verified.');
if(!process.argv.includes('--browser'))process.exit(0);
(async()=>{
 const {chromium}=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
 const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-backgrounding-occluded-windows']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:950},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
  await page.goto('http://localhost:8000/output/aegis-bevel-review.html');await page.waitForFunction(()=>window.bevelStudy?.ready,null,{timeout:30000});await page.bringToFront();
  console.log('GPU timer available:',await page.evaluate(()=>bevelStudy.timerAvailable));
  const variant=await page.evaluate(()=>AegisNormalRenderer.renderers.map(r=>({baked:!!r.studyMaterial.defines.AEGIS_BAKED_NORMAL,finish:r.studyMaterial.uniforms.uFinish.value,colorSpace:r.studyMaterial.uniforms.uShipTexture.value?.colorSpace})));assert.equal(variant[0].baked,false);assert.equal(variant[1].baked,true);assert.equal(variant[1].colorSpace,'');console.log('Shader variants verified:',variant);
  if(process.argv.includes('--guards')){
   await page.evaluate(()=>{bevelStudy.timer.disjoint=()=>true;});await page.click('#bench');await page.waitForFunction(()=>window.bevelError);assert.match(await page.evaluate(()=>bevelError),/Disjoint/);assert.equal(await page.evaluate(()=>!!window.bevelResults),false);
   await page.evaluate(()=>{bevelStudy.timer.disjoint=()=>false;bevelStudy.timer.available=false;bevelStudy.timer.begin=()=>null;});await page.click('#bench');await page.waitForFunction(()=>window.bevelResults||window.bevelError,null,{timeout:30000});const result=await page.evaluate(()=>bevelResults);assert.equal(result.gpuTimed,false);assert(result.rows.every(r=>r.gpuSamples===0&&r.gpuMedian===null));console.log('Disjoint rejection and unavailable-GPU fallback verified.');return;
  }
  if(process.argv.includes('--visual')){for(const view of ['quarter','edge','under','far']){await page.selectOption('#view',view);await page.waitForTimeout(400);await page.screenshot({path:`output/aegis-normal-${view}.png`});}assert.deepEqual(errors,[]);return;}
  const results=[];
  for(const view of ['quarter','edge','under','far']){
   await page.selectOption('#view',view);await page.waitForTimeout(400);await page.screenshot({path:`output/aegis-normal-${view}.png`});
   if(view==='under')continue;
   for(let repeat=0;repeat<2;repeat++){
    await page.click('#bench');await page.waitForFunction(()=>window.bevelResults||window.bevelError,null,{timeout:30000});
    const result=await page.evaluate(()=>({error:window.bevelError,result:window.bevelResults}));assert(!result.error,result.error);results.push({...result.result,repeat});
    console.log(JSON.stringify({view,repeat,gpuTimed:result.result.gpuTimed,device:result.result.device,rows:result.result.rows}));
   }
  }
  await page.selectOption('#view','quarter');await page.selectOption('#baseline','original');await page.screenshot({path:'output/aegis-normal-original.png'});
  await page.mouse.move(340,450);await page.mouse.down();await page.mouse.move(410,480,{steps:6});await page.mouse.up();await page.waitForTimeout(300);await page.screenshot({path:'output/aegis-normal-drag.png'});
  assert.deepEqual(errors,[]);fs.writeFileSync('output/aegis-normal-gpu-metrics.json',JSON.stringify({errors,results},null,2)+'\n');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
