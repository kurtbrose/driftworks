'use strict';
// Production-scene acceptance/performance probe. Serve the static site on :8000.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
const output=path.resolve(__dirname,'../output/freighter-integration');fs.mkdirSync(output,{recursive:true});
function installProbe(){
 const D=window.Driftworks,p=window.freighterProbe={frozen:false,rows:[],collect:false},create=D.flightSession.create,mount=D.flightPresentation.mount;
 D.flightSession.create=function(options){const s=create({...options,seed:29}),advance=s.advance;p.session=s;p.advance=seconds=>{const c=s.snapshot().combat;advance.call(s,seconds,{stop:true},{profile:c.player.profile,weapon:D.retailWeapons[c.player.weaponIndex||0]});};s.advance=function(...args){if(!p.frozen)return advance.apply(s,args);};return s;};
 D.flightPresentation.mount=function(...args){const r=mount.apply(this,args),render=r.render;p.presentation=r;r.render=function(...a){const started=performance.now(),result=render.apply(r,a);if(p.collect){if(document.hidden)throw Error('Hidden production benchmark');p.rows.push({at:performance.now(),presentationMs:performance.now()-started,...r.renderStats().scene});}return result;};return r;};
 p.camera=(ship,offset=[65,20,30])=>{const U=D.sim.METERS_PER_UNIT,s=p.session.snapshot().state,axes=D.fleetGuidance.frame(ship.forward||[0,1,0]),f=axes.back.map(v=>-v),eye=ship.position.map((v,k)=>v+(axes.right[k]*offset[0]+f[k]*offset[1]+axes.up[k]*offset[2])/U),unit=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],forward=unit(ship.position.map((v,k)=>v-eye[k]));s.eye=eye;s.right=unit(cross(forward,[0,0,1]));s.up=unit(cross(s.right,forward));s.back=forward.map(v=>-v);s.velocity=[0,0,0];s.ramp=[0,0,0];s.throttle=0;};
 p.index=(ship,type,slot=0)=>{const defs=D.freighterSim.catalog(ship.model).defs,choices=defs.map((d,i)=>({d,i})).filter(x=>x.d.type===type&&x.d.center[0]>0&&x.d.center[2]>=0).sort((a,b)=>b.d.center[0]-a.d.center[0]);return choices[slot%choices.length].i;};
 p.shoot=(ship,index,damage)=>{const c=p.session.snapshot().combat,U=D.sim.METERS_PER_UNIT,def=D.freighterSim.catalog(ship.model).defs[index],axes=D.fleetGuidance.frame(ship.forward||[0,1,0]),f=axes.back.map(v=>-v),world=v=>ship.position.map((x,k)=>x+(axes.right[k]*v[0]+f[k]*v[1]+axes.up[k]*v[2])/U),from=world([def.center[0]+30,def.center[1],def.center[2]]),to=world([def.center[0]-30,def.center[1],def.center[2]]),weapon={...D.retailWeapons[0],damage,armorFactor:1};return D.flightCombat.trace(c,from,to,{age:0,position:from.slice(),direction:axes.right.map(v=>-v),weapon},'player',undefined,c.player.pose);};
 p.clearFlashes=()=>{p.session.snapshot().combat.flashes=[];};
 p.snapshot=()=>{const c=p.session.snapshot().combat;return {visual:D.freighterVisual.stats(),camera:p.session.snapshot().state.eye.slice(),ships:c.convoy.ships.map(s=>({id:s.id,model:s.model,hull:s.hull,modules:D.freighterSim.ensure(s).modules.map(m=>({id:m.id,health:m.health,damage:m.damage,marks:m.marks.length,leaks:m.leaks.length,debris:!!m.debris,spin:m.debris?.spin}))})),stats:p.presentation.renderStats().scene};};
}
const percentile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
(async()=>{
 const browser=await chromium.launch({channel:process.env.DRIFTWORKS_BROWSER_CHANNEL||(process.platform==='win32'?'chrome':undefined),headless:!process.argv.includes('--visible'),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const page=await browser.newPage({viewport:{width:1400,height:900},deviceScaleFactor:1}),errors=[],results=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});
 await page.route('**/flight.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:'('+installProbe.toString()+')();\n'+await response.text()});});
 try{
  for(const mission of ['convoy','fleet-evacuation'].filter(m=>!process.argv.some(a=>a.startsWith('--mission='))||process.argv.includes('--mission='+m))){
   await page.goto('http://localhost:8000/experiments/flight.html?mission='+mission);await page.waitForFunction(()=>window.freighterProbe?.session&&!document.querySelector('#fly').disabled,null,{timeout:120000});
   await page.selectOption('#input-mode','controller');await page.selectOption('#fps-cap','0',{force:true});await page.click('#fly');await page.bringToFront();await page.waitForTimeout(500);
   // The existing GPU HUD overlay renders an invalid white foreignObject in
   // headless capture. Mask overlays consistently; retain the actual sky/scene.
   await page.addStyleTag({content:'canvas.gpu-flight-hud,canvas.scene3d-overlay{visibility:hidden!important}'});
   await page.evaluate(()=>{const p=window.freighterProbe,c=p.session.snapshot().combat;p.frozen=true;c.enabled=true;p.hero=c.convoy.ships[24];p.camera(p.hero);c.targetId=p.hero.id;p.clearFlashes();});
   await page.waitForTimeout(300);await page.screenshot({path:path.join(output,mission+'-intact.png')});
   await page.evaluate(()=>{const p=freighterProbe,s=p.hero,i=p.index(s,'container');p.shoot(s,i,35);p.shoot(s,i,35);p.clearFlashes();});await page.waitForTimeout(300);
   let state=await page.evaluate(()=>freighterProbe.snapshot());assert.equal(state.visual.changedShips,1);assert(state.ships.find(s=>s.id==='cargo-25').modules.some(m=>m.damage!==null&&m.health===30));
   await page.screenshot({path:path.join(output,mission+'-damaged.png')});
   await page.evaluate(()=>{const p=freighterProbe;p.shoot(p.hero,p.index(p.hero,'container'),35);p.advance(2.2);p.camera(p.hero);p.clearFlashes();});await page.waitForTimeout(400);
   state=await page.evaluate(()=>freighterProbe.snapshot());assert(state.visual.debris>=1);assert(state.ships.find(s=>s.id==='cargo-25').modules.some(m=>m.debris&&Math.hypot(...m.spin)>0));
   await page.screenshot({path:path.join(output,mission+'-detached.png')});
   await page.evaluate(()=>{const p=freighterProbe,c=p.session.snapshot().combat,s=c.convoy.ships.find(s=>s.model==='fluid');p.tank=s;p.shoot(s,p.index(s,'tank'),100);p.advance(.6);p.camera(s,[70,20,28]);p.clearFlashes();});await page.waitForTimeout(400);
   state=await page.evaluate(()=>freighterProbe.snapshot());assert(state.visual.ventParticles>0&&state.visual.ventParticles<=128);await page.screenshot({path:path.join(output,mission+'-venting.png')});
   await page.evaluate(()=>{const p=freighterProbe,c=p.session.snapshot().combat,s=c.convoy.ships.find(s=>s.model==='mixed');p.engine=s;const i=p.index(s,'engine');p.shoot(s,i,120);p.shoot(s,i,120);p.advance(.7);p.camera(s,[28,-55,18]);p.clearFlashes();});await page.waitForTimeout(300);await page.screenshot({path:path.join(output,mission+'-engine.png')});
   const engine=await page.evaluate(()=>({live:Driftworks.freighterSim.engines(freighterProbe.engine).length,stats:freighterProbe.presentation.renderStats().scene}));assert.equal(engine.live,3,'Destroyed drive stops its production exhaust');assert(engine.stats.drawCalls>20&&engine.stats.triangles>10000);
   await page.evaluate(()=>{const p=freighterProbe,c=p.session.snapshot().combat;p.stress=c.convoy.ships.slice(24);for(const s of p.stress){const type=s.model==='fluid'?'tank':'container',amount=type==='tank'?200:100;for(let slot=0;slot<2;slot++)p.shoot(s,p.index(s,type,slot),amount);}p.advance(1.5);p.camera(p.hero,[105,50,65]);p.clearFlashes();p.saved=c.convoy.ships.map(s=>({ship:s,hull:s.hull,modules:JSON.parse(JSON.stringify(s.modules))}));});
   await page.waitForTimeout(400);await page.screenshot({path:path.join(output,mission+'-stress.png')});
   const blocks=[];
   for(const label of ['intact','damaged','damaged','intact']){
    await page.evaluate(label=>{const p=freighterProbe;for(const saved of p.saved){saved.ship.modules=label==='intact'?undefined:JSON.parse(JSON.stringify(saved.modules));saved.ship.hull=label==='intact'?5000:saved.hull;Driftworks.freighterSim.ensure(saved.ship);}p.rows=[];p.collect=false;},label);
    await page.waitForTimeout(400);await page.evaluate(()=>{freighterProbe.rows=[];freighterProbe.collect=true;});await page.waitForFunction(()=>freighterProbe.rows.length>=60);
    const rows=await page.evaluate(()=>{freighterProbe.collect=false;return freighterProbe.rows.slice(-60);}),snapshot=await page.evaluate(()=>freighterProbe.snapshot());assert(rows.every(r=>r.width===1400&&r.height===900&&r.drawCalls>20&&r.triangles>10000));
    const intervals=rows.slice(1).map((r,i)=>r.at-rows[i].at);blocks.push({label,camera:snapshot.camera,draws:rows.at(-1).drawCalls,triangles:rows.at(-1).triangles,frameMedian:percentile(intervals,.5),frameP95:percentile(intervals,.95),submissionMedian:percentile(rows.map(r=>r.cpuMs),.5),presentationMedian:percentile(rows.map(r=>r.presentationMs),.5),visual:snapshot.visual});
   }
   blocks.forEach(b=>assert.deepEqual(b.camera,blocks[0].camera));results.push({mission,resolution:[1400,900],dpr:1,blocks});
  }
  assert.deepEqual(errors,[]);const files=['src/freighter-sim.js','src/freighter-physics.js','src/freighter-geometry.js','experiments/freighter-flight.js','assets/ships/industrial-kit/convoy-flight.bin'],hashes=Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'..',f))).digest('hex')]));
  fs.writeFileSync(path.join(output,'production-checks.json'),JSON.stringify({scope:'Actual flight scene; HUD overlays hidden in headless captures. Matched frozen scene ABBA; CPU submission/cadence, not GPU execution or a whole-game budget.',hashes,results},null,2)+'\n');console.log('PASS production freighter integration: both missions, damage/detachment, persistent scars, venting, engine exhaust, 30-ship stress and fixed-camera ABBA rendering');
 }catch(error){console.error({url:page.url(),errors,status:await page.locator('#status').textContent().catch(()=>null)});throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
