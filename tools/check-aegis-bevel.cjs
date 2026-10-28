'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{}};vm.runInNewContext(fs.readFileSync('output/aegis-bevel-data.js','utf8'),context);
const d=context.window.AegisBevelData,{bevel}=require('./lib/convex-bevel.cjs'),before=JSON.stringify(d.original),result=bevel(d.original,d.width);
assert.equal(JSON.stringify(d.original),before,'source immutable');
assert.equal(d.original.length/18,60);assert.equal(result.flat.length,d.flat.length);
const edges=new Map(),key=p=>p.map(x=>Math.round(x*1e4)).join(',');
for(let i=0;i<d.flat.length;i+=18){
 const p=[0,6,12].map(j=>d.flat.slice(i+j,i+j+3));
 for(let j=0;j<3;j++){const id=[key(p[j]),key(p[(j+1)%3])].sort().join('|');edges.set(id,(edges.get(id)||0)+1);}
}
assert([...edges.values()].every(n=>n===2),'closed watertight bevel');
for(let i=0;i<d.weighted.length;i+=6){
 assert(d.weighted.slice(i,i+6).every(Number.isFinite));
 assert(Math.abs(Math.hypot(...d.weighted.slice(i+3,i+6))-1)<1e-6);
 assert.deepEqual(d.weighted.slice(i,i+3),d.flat.slice(i,i+3),'normal mode changes only normals');
}
for(let axis=0;axis<3;axis++){
 const values=a=>a.filter((_,i)=>i%6===axis),a=values(d.original),b=values(d.flat);
 assert(Math.abs(Math.min(...a)-Math.min(...b))<1e-4);assert(Math.abs(Math.max(...a)-Math.max(...b))<1e-4);
}
console.log('Bevel checks passed: immutable source, closed mesh, preserved bounds, normalized shading normals.');
if(!process.argv.includes('--browser'))process.exit(0);
(async()=>{
 const {chromium}=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
 const browser=await chromium.launch({channel:'chrome',headless:false,args:['--disable-backgrounding-occluded-windows']});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:950},deviceScaleFactor:1}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://localhost:8000/output/aegis-bevel-review.html');await page.waitForFunction(()=>window.bevelStudy?.ready);await page.bringToFront();
  for(const view of ['quarter','edge','under','far']){await page.selectOption('#view',view);await page.waitForTimeout(300);await page.screenshot({path:`output/aegis-bevel-${view}.png`});}
  await page.selectOption('#view','quarter');await page.click('#bench');await page.waitForFunction(()=>window.bevelResults,null,{timeout:30000});
  fs.writeFileSync('output/aegis-bevel-metrics.json',JSON.stringify(await page.evaluate(()=>window.bevelResults),null,2)+'\n');
  await page.selectOption('#mode','flat');await page.waitForTimeout(300);await page.screenshot({path:'output/aegis-bevel-flat.png'});
  await page.selectOption('#mode','original');await page.waitForTimeout(300);await page.screenshot({path:'output/aegis-bevel-matching.png'});
  await page.selectOption('#mode','weighted');
  await page.mouse.move(340,450);await page.mouse.down();await page.mouse.move(430,480,{steps:8});await page.mouse.up();await page.mouse.wheel(0,-100);await page.waitForTimeout(300);
  await page.screenshot({path:'output/aegis-bevel-drag.png'});
  await page.click('#reset');await page.click('#orbit');await page.waitForTimeout(600);await page.click('#orbit');await page.click('#reset');
  assert.deepEqual(errors,[]);console.log('Browser controls, near/far/underside captures and ABBA measurements completed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
