'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx={window:{}};for(const f of ['assets/ships/aegis-kit/flight-rig.js',...['bevel','normal','fleet'].map(n=>`studies/aegis-${n}-data.js`)])vm.runInNewContext(fs.readFileSync(f,'utf8'),ctx);
const w=ctx.window,asset=w.Driftworks.aegisFlightAsset,before=JSON.stringify(asset),p=require('../studies/aegis-fleet-build.js').build(asset,w.AegisBevelData,w.AegisNormalData,w.AegisFleetData);
assert.equal(JSON.stringify(asset),before);assert.equal(p.bands,20);assert(p.removed.every(n=>n===88));
assert.equal(p.armor.weighted.vertices.length/18,6320);assert.equal(p.armor.baked.vertices.length/24,1200);
assert(!p.rest.some(b=>b.finish===-3),'normal marker reserved');
const sourceTriangles=asset.batches.concat(asset.interiors).reduce((n,b)=>n+b.vertices.length/18,0)+asset.turrets.concat(asset.engines).reduce((n,t)=>n+t.batches.reduce((s,b)=>s+b.vertices.length/18,0),0);
assert.equal(p.rest.reduce((n,b)=>n+b.vertices.length/b.stride/3,0)+p.removed.reduce((a,b)=>a+b,0),sourceTriangles,'rest of production ship retained');
console.log('Fleet preparation: 20 armor bands; all remaining production triangles retained; source immutable.');
if(!process.argv.includes('--browser'))process.exit(0);
(async()=>{
 const {chromium}=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
 const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-backgrounding-occluded-windows',...(process.argv.includes('--uncapped')?['--disable-frame-rate-limit','--disable-gpu-vsync']:[])]});
 try{const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
 await page.goto('http://localhost:8000/studies/aegis-fleet-review.html');await page.waitForFunction(()=>window.bevelStudy?.ready,null,{timeout:60000});await page.bringToFront();
 const results=[];
 for(const count of ['6','12']){await page.selectOption('#fleet',count);
  const shared=await page.evaluate(()=>{const a=bevelStudy.getBatches();return {images:new Set(a.baked.filter(b=>b.finish===-3).map(b=>b.texture)).size,bakedBuffers:new Set(a.baked.filter(b=>b.finish===-3).map(b=>b.vertices)).size,weightedBuffers:new Set(a.weighted.map(b=>b.vertices)).size,restCount:bevelStudy.prepared.rest.length};});assert.equal(shared.images,1);assert.equal(shared.bakedBuffers,1);assert.equal(shared.weightedBuffers,shared.restCount+1);
  for(const view of (process.argv.includes('--uncapped')?['quarter','edge']:['quarter','edge','far','under'])){await page.selectOption('#view',view);
   for(const mode of ['weighted','baked']){await page.selectOption('#mode',mode);await page.waitForTimeout(350);if(mode==='baked'){const gpu=await page.evaluate(()=>{const textures=new Set(),buffers=new Set();let n=0;AegisNormalRenderer.renderers[0].studyScene.traverse(o=>{if(o.material?.uniforms?.uFinish?.value===-3){n++;textures.add(o.material.uniforms.uShipTexture.value);buffers.add(o.geometry);if(!o.material.defines.AEGIS_BAKED_NORMAL)throw new Error('Normal shader missing');}});return {n,textures:textures.size,buffers:buffers.size};});assert(gpu.n>0);assert.equal(gpu.textures,1);assert.equal(gpu.buffers,1);}await page.screenshot({path:`output/aegis-fleet-${count}-${view}-${mode}.png`});}
   if(process.argv.includes('--visual')||view==='under')continue;
   for(let repeat=0;repeat<2;repeat++){await page.click('#bench');await page.waitForFunction(()=>window.bevelResults||window.bevelError,null,{timeout:60000});const out=await page.evaluate(()=>({error:window.bevelError,result:window.bevelResults}));assert(!out.error,out.error);assert(out.result.gpuTimed);assert.equal(out.result.rows[0].draws,out.result.rows[1].draws);assert(out.result.rows[0].triangles>out.result.rows[1].triangles);results.push({...out.result,repeat});fs.writeFileSync(process.argv.includes('--uncapped')?'output/aegis-fleet-uncapped-metrics.json':'output/aegis-fleet-gpu-metrics.json',JSON.stringify({uncapped:process.argv.includes('--uncapped'),errors,results})+'\n');console.log(JSON.stringify({count,view,repeat,rows:out.result.rows}));}
  }
 }
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
