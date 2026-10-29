'use strict';
const fs=require('node:fs'),zlib=require('node:zlib'),assert=require('node:assert/strict');
for(const width of [2048,1024,512,256]){
 const png=fs.readFileSync(`studies/aegis-normal-atlas${width===2048?'':'-'+width}.png`),parts=[];let actualWidth,height;
 for(let i=8;i<png.length;){const length=png.readUInt32BE(i),type=png.toString('ascii',i+4,i+8),data=png.subarray(i+8,i+8+length);if(type==='IHDR'){actualWidth=data.readUInt32BE(0);height=data.readUInt32BE(4);}if(type==='IDAT')parts.push(data);i+=length+12;}
 assert.equal(actualWidth,width);assert.equal(height,width/2);const raw=zlib.inflateSync(Buffer.concat(parts));let count=0;
 for(let y=0;y<height;y++){assert.equal(raw[y*(width*4+1)],0);for(let x=0;x<width;x++){const i=y*(width*4+1)+1+x*4;if(!raw[i+3])continue;count++;const n=[0,1,2].map(k=>raw[i+k]/255*2-1);assert(Math.abs(Math.hypot(...n)-1)<.015,'normalized filtered vector');}}
 assert(count>width*height*.7);console.log(`${width}x${height}: valid linear normal data; ${Math.ceil(width*height*4*4/3)} bytes with mipmaps`);
}
if(!process.argv.includes('--browser'))process.exit(0);
(async()=>{
 const {chromium}=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]})),browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-backgrounding-occluded-windows','--disable-frame-rate-limit','--disable-gpu-vsync']});
 try{const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
 if(process.argv.includes('--smoke')){
  await page.goto('http://localhost:8000/studies/aegis-bevel-review.html?atlas=512&baseline=bakedReference');await page.waitForFunction(()=>window.bevelStudy?.ready);
  assert.deepEqual(await page.evaluate(()=>AegisNormalRenderer.renderers.map(r=>r.studyMaterial.uniforms.uShipTexture.value.image.width)),[2048,512]);
  await page.goto('http://localhost:8000/studies/aegis-fleet-review.html?atlas=512');await page.waitForFunction(()=>window.bevelStudy?.ready);
  assert.equal(await page.evaluate(()=>bevelStudy.getBatches().baked.find(b=>b.finish===-3).texture.width),512);assert.deepEqual(errors,[]);console.log('Deep links select the actual 512 texture, with the original reference retained.');return;
 }
 await page.goto('http://localhost:8000/studies/aegis-bevel-review.html');await page.waitForFunction(()=>window.bevelStudy?.ready);await page.selectOption('#baseline','bakedReference');await page.selectOption('#mode','baked');
 for(const size of ['1024','512','256'])for(const view of ['quarter','edge','under','far']){await page.selectOption('#atlas',size);await page.selectOption('#view',view);await page.waitForTimeout(250);await page.screenshot({path:`output/aegis-atlas-${size}-${view}.png`});}
 if(process.argv.includes('--visual')){assert.deepEqual(errors,[]);return;}
 await page.goto('http://localhost:8000/studies/aegis-fleet-review.html');await page.waitForFunction(()=>window.bevelStudy?.ready);await page.selectOption('#compare','bakedReference');await page.selectOption('#mode','baked');const results=[];
 for(const size of ['1024','512','256'])for(const count of ['6','12'])for(const view of ['quarter','edge']){
  await page.selectOption('#atlas',size);await page.selectOption('#fleet',count);await page.selectOption('#view',view);await page.waitForTimeout(250);await page.screenshot({path:`output/aegis-atlas-fleet-${size}-${count}-${view}.png`});
  const shared=await page.evaluate(()=>{const a=bevelStudy.getBatches().baked.filter(b=>b.finish===-3);return {images:new Set(a.map(b=>b.texture)).size,buffers:new Set(a.map(b=>b.vertices)).size,width:a[0].texture.naturalWidth};});assert.equal(shared.images,1);assert.equal(shared.buffers,1);assert.equal(shared.width,Number(size));
  for(let repeat=0;repeat<2;repeat++){await page.click('#bench');await page.waitForFunction(()=>window.bevelResults||window.bevelError,null,{timeout:60000});const out=await page.evaluate(()=>({error:window.bevelError,result:window.bevelResults}));assert(!out.error,out.error);assert(out.result.gpuTimed);assert.equal(out.result.rows[0].draws,out.result.rows[1].draws);assert.equal(out.result.rows[0].triangles,out.result.rows[1].triangles);results.push({...out.result,repeat});fs.writeFileSync('output/aegis-atlas-metrics.json',JSON.stringify({uncapped:true,errors,results})+'\n');console.log(JSON.stringify({size,count,view,repeat,rows:out.result.rows}));}
 }
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
