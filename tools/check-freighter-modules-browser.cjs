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
  // Inject force controls only into the test response, never the deployed range.
  await page.route('**/studies/freighter-modules.js*',route=>route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.resolve(__dirname,'../studies/freighter-modules.js'),'utf8')+`
window.rangeContactTest={
 screen:id=>{const m=modules[id],p=m.center.clone().add(new T.Vector3(m.half[0]*.35,0,m.half[2])).project(camera),r=renderer.domElement.getBoundingClientRect();return [r.left+(p.x+1)*r.width/2,r.top+(1-p.y)*r.height/2];},
 markCentres:id=>modules[id].scorches.map(mark=>{const v=mark.layers[4],sum=[0,0,0];for(let i=0;i<v.length;i+=6)for(let k=0;k<3;k++)sum[k]+=v[i+k];return sum.map(x=>x/(v.length/6));}),
 push:(id,velocity,position)=>{const m=modules[id];if(position)m.group.position.set(...position);m.velocity.set(...velocity);m.spin.set(0,0,0);},
 state:()=>({contacts,bodies:modules.filter(m=>m.group.parent===debris).map(m=>({id:m.id,box:componentBox(m),spring:m.release})),overlaps:modules.filter(m=>m.group.parent===debris).flatMap(m=>modules.filter(n=>n!==m&&(n.hp>0||n.group.parent===debris)).flatMap(n=>{const c=contact(componentBox(m),componentBox(n));return c?[c.depth]:[];}))})
};` }));
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
   for(let shot=1;shot<=3;shot++){
    if(shot===2){const point=await page.evaluate(id=>window.rangeContactTest.screen(id),target.id);await page.mouse.click(...point);}
    await shoot();state=await snapshot();assert.equal(state.modules[target.id].hp,Math.max(0,100-shot*35));assert.deepEqual(state.camera,camera,'Firing never moves the camera');
    assert.equal(state.modules[target.id].marks,shot,'Each surface hit leaves a persistent local mark');assert(state.modules[target.id].markTriangles>0,'Marks project onto real module triangles');
    if(shot===1){await page.waitForTimeout(600);await page.screenshot({path:path.join(output,model+'-hit.png')});assert.equal((await snapshot()).modules[target.id].marks,1,'Mark survives the transient flash');}
   }
   const centres=await page.evaluate(id=>window.rangeContactTest.markCentres(id),target.id);assert(Math.hypot(...centres[0].map((v,k)=>v-centres[1][k]))>.2,'Clicking another surface point places a separate hole');
   assert.equal(state.debris,1);assert.equal(state.modules.filter(m=>m.hp===0).length,1,'One component dies independently');
   assert.equal(state.modules[target.id].marksFollowDebris,true,'Damage stays in the detached module frame');
   assert.equal(await page.locator('#fire').isDisabled(),true);
   await page.waitForTimeout(3000);await page.screenshot({path:path.join(output,model+'-detached.png')});
   const damaged=await snapshot();assert.equal(damaged.revision,state.revision,'Moving debris does not rebuild hull geometry');
   const beforeContact=await page.evaluate(()=>window.rangeContactTest.state());
   const released=beforeContact.bodies.find(body=>body.id===target.id);assert(Math.hypot(...released.box.center.map((v,k)=>v-target.center[k]))>.2,'Destroyed payload can clear its original mounting locks');
   assert(released.spring.strength>=2.2&&released.spring.strength<=4);assert(Math.hypot(...released.spring.spin)>.001,'Off-centre spring produces tumble');
   await page.evaluate(({id,center})=>window.rangeContactTest.push(id,[0,0,-8],[center[0],center[1],center[2]+12]),target);
   await page.waitForTimeout(2500);const shipContact=await page.evaluate(()=>window.rangeContactTest.state());
   assert(shipContact.contacts>beforeContact.contacts,'A detached '+payload+' is blocked when pushed back into the freighter');
   assert.equal(shipContact.overlaps.length,0,'Debris does not enter attached modules: '+model+' '+JSON.stringify(shipContact));
   if(model==='container'){
    const other=state.modules.filter(m=>m.type===payload&&m.id!==target.id&&m.center[1]>0&&m.center[2]>0).sort((a,b)=>b.center[2]-a.center[2]||a.center[0]-b.center[0])[0];
    await page.selectOption('#module',String(other.id));for(let i=0;i<3;i++)await shoot();assert.equal((await snapshot()).modules[other.id].hp,0);
    const otherRelease=(await page.evaluate(()=>window.rangeContactTest.state())).bodies.find(body=>body.id===other.id);assert.notEqual(otherRelease.spring.strength,released.spring.strength,'Separate parts have different stored spring strengths');
    await page.evaluate(([a,b])=>{window.rangeContactTest.push(a,[0,0,6],[0,30,30]);window.rangeContactTest.push(b,[0,0,-6],[0,30,44]);},[target.id,other.id]);
    const start=await page.evaluate(()=>window.rangeContactTest.state());await page.waitForTimeout(2000);const pair=await page.evaluate(()=>window.rangeContactTest.state());
    assert(pair.contacts>start.contacts,'Two loose containers deflect on contact');assert.equal(pair.overlaps.length,0,'Loose components cannot pass through each other');
   }
   await page.click('#reset');state=await snapshot();assert(state.modules.every(m=>m.hp===100&&m.marks===0));assert.equal(state.debris,0);assert.equal(state.bolts,0);
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
  console.log('PASS freighter module range: three variants, distinct persistent surface marks, marked debris, payload/engine/command detachment, ship/debris and debris/debris contacts, mount release, fixed firing camera, reset and geometry lifetime.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
