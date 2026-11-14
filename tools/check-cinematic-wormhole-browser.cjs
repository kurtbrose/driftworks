'use strict';
// Real cinematic scene, frozen production capitals and cameras. Requires localhost:8000.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
const output=path.resolve('output/cinematic-wormhole');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:process.env.DRIFTWORKS_BROWSER_CHANNEL||(process.platform==='win32'?'chrome':undefined),headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/src/scene3d.js*',async route=>{const response=await route.fetch();let body=await response.text();
   if(process.argv.includes('--negative-control'))body=body.replace('if(along<=0.||disc<0.)discard;','');
   body+=`;{const old=Driftworks.scene3d.create;Driftworks.scene3d.create=function(...args){const s=old(...args);if(args[0].id==='viewer'){window.cinematicProbe={scene:s};for(const key of ['setSurfaceCamera','setStudyActors','render']){const f=s[key];s[key]=function(...a){cinematicProbe[key]=a;return f.apply(s,a);};}}return s;};}`;
   await route.fulfill({response,body});
  });
  await page.route('**/experiments/flight-watch.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`;{const old=Driftworks.flightWatch.cinema;Driftworks.flightWatch.cinema=function(r){const d=old(r);d.advance=function(){};window.cinematicDirector=d;return d;};}`});});
  await page.route('**/src/aegis-battle.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`;{const old=Driftworks.aegisBattle.createBattle;Driftworks.aegisBattle.createBattle=function(o){const r=old(o);r.step=function(){};return r;};}`});});
  await page.goto('http://localhost:8000/experiments/flight.html?mission=cinematic&bridgeGrid=0&bridgeOutline=0');
  await page.waitForFunction(()=>window.cinematicDirector&&window.cinematicProbe&&document.body.classList.contains('flight-active'),null,{timeout:120000});
  const rows=[];
  for(let cut=0;cut<7;cut++){
   await page.waitForTimeout(250);
   await page.screenshot({path:path.join(output,`camera-${cut}.png`)});
   const row=await page.evaluate(()=>{
    const p=cinematicProbe,s=p.scene,pose=p.setSurfaceCamera[0],actors=p.setStudyActors[0],args=p.render;
    const canvas=document.querySelector('#viewer canvas[aria-label="3D tactical scene"]'),gl=canvas.getContext('webgl2'),w=canvas.width,h=canvas.height;
    const remote=actors.filter(b=>(b.region||0)!==(pose.region||0));
    function draw(batches){s.setStudyActors(batches);s.setStudyEffects([]);s.render(...args);const pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
    const empty=draw([]),pixels=draw(remote),U=Driftworks.sim.METERS_PER_UNIT;
    const mouth=[(pose.region||0)*12000,-2000,1550].map((v,k)=>v/U-pose.eye[k]),focal=1/Math.tan(Math.PI/8);
    // MSAA can cover the edge sample of an otherwise exterior pixel. Allow one pixel.
    const radius=300/U+2*Math.hypot(...mouth)/(h*focal);
    let visible=0,outside=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
     const offset=(y*w+x)*4;if(![0,1,2,3].some(k=>Math.abs(pixels[offset+k]-empty[offset+k])>3))continue;
     visible++;const sx=(2*(x+.5)/w-1)*w/h/focal,sy=(2*(y+.5)/h-1)/focal;
     const ray=pose.back.map((v,k)=>-v+pose.right[k]*sx+pose.up[k]*sy),length=Math.hypot(...ray),unit=ray.map(v=>v/length);
     const along=mouth.reduce((n,v,k)=>n+v*unit[k],0),disc=along*along-mouth.reduce((n,v)=>n+v*v,0)+radius*radius;
     if(along<=0||disc<-.00001)outside++;
    }
    s.setStudyActors(actors);return {camera:cinematicDirector.label(),side:pose.region||0,remoteBatches:remote.length,visible,outside};
   });
   rows.push(row);await page.evaluate(()=>cinematicDirector.next());
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({rows,errors},null,2)+'\n');console.log(JSON.stringify(rows));
  assert.deepEqual(errors,[]);assert(rows.some(r=>r.side===0&&r.visible>100));assert(rows.some(r=>r.side===1&&r.visible>100));
  // Permit a handful of edge/noise pixels, never a visible piece of remote hull.
  assert(rows.every(r=>r.outside<=12),'Remote capital pixels must stay inside the mouth from either side');
  console.log('PASS cinematic wormhole: seven production cameras, both spaces, remote hull aperture clipping');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
