'use strict';
// Development-only browser validation; no runtime dependencies are added.
// Run with --crossings for live damage/transit; otherwise includes A/B/B/A carrier timings.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
function install(){
 for(const P of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]){const old=P.getProgramParameter;P.getProgramParameter=function(program,name){const value=old.call(this,program,name);if(name===this.LINK_STATUS&&!value){window.shaderFailures=window.shaderFailures||[];window.shaderFailures.push({program:this.getProgramInfoLog(program),shaders:this.getAttachedShaders(program).map(s=>({log:this.getShaderInfoLog(s),source:this.getShaderSource(s)}))});}return value;};}
 const D=window.Driftworks,p=window.thinProbe={rows:[],collect:false,freeze:false,capital:null};
 const create=D.flightSession.create;D.flightSession.create=function(...args){const s=create.apply(this,args),advance=s.advance;p.session=s;s.advance=function(...a){if(!p.freeze)return advance.apply(this,a);};return s;};
 const mount=D.flightPresentation.mount;D.flightPresentation.mount=function(...args){const s=mount.apply(this,args),render=s.render,set=s.setCapital;p.presentation=s;s.setCapital=function(c){p.capital=c;if(c&&!p.originalCapital){p.originalCapital=c;const step=c.step;c.step=function(...a){if(!p.freeze)return step.apply(this,a);};}return set.call(this,c);};s.render=function(...a){p.args=a;const t=performance.now(),result=render.apply(this,a);if(p.collect)p.rows.push({cpu:performance.now()-t,time:performance.now(),...s.renderStats().scene});return result;};return s;};
 const radar=D.flightRadar.draw;D.flightRadar.draw=function(ctx,state,contacts,...a){p.contacts=contacts;return radar.call(this,ctx,state,contacts,...a);};
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:process.argv.includes('--headless'),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});
 await page.route('**/flight.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:'('+install.toString()+')();\n'+await response.text()});});
 try{
 await page.goto('http://localhost:8000/experiments/flight.html?mission=thin-shell');
 await page.waitForFunction(()=>window.thinProbe?.presentation&&!document.querySelector('#fly').disabled,null,{timeout:120000});
 await page.selectOption('#input-mode','controller');await page.selectOption('#fps-cap','0',{force:true});
 await page.click('#fly');await page.waitForTimeout(2500);
 const initial=await page.evaluate(()=>({mode:thinProbe.session.snapshot().combat.mode,actors:thinProbe.session.snapshot().combat.enemies.length,stats:thinProbe.presentation.renderStats(),title:document.title,resources:performance.getEntriesByType('resource').map(r=>r.name).filter(n=>n.includes('/aegis-kit/')||n.includes('thin-shell-optics')),viewport:[innerWidth,innerHeight,devicePixelRatio],visible:!document.hidden}));
 assert.equal(initial.mode,'thin-shell');assert.equal(initial.actors,8);
 fs.writeFileSync('output/thin-shell-shader-errors.json',JSON.stringify(await page.evaluate(()=>window.shaderFailures||[]),null,2));await page.screenshot({path:'output/thin-shell-dogfight-start.png'});
 await page.keyboard.press('Tab');await page.keyboard.press('KeyL');await page.keyboard.press('KeyV');await page.keyboard.press('KeyX');await page.keyboard.down('Space');await page.waitForTimeout(1500);await page.keyboard.up('Space');
 const fired=await page.evaluate(()=>thinProbe.session.snapshot().guns.fired);assert(fired>0);
 await page.screenshot({path:'output/thin-shell-dogfight-firing.png'});
 // Hold a front-facing near-mouth fixture so both charts can be inspected.
 const fixtures=[];
 for(const region of [0,1]){
  await page.evaluate(region=>{for(const P of [WebGLRenderingContext.prototype,WebGL2RenderingContext.prototype]){const old=P.getProgramParameter;P.getProgramParameter=function(program,name){const value=old.call(this,program,name);if(name===this.LINK_STATUS&&!value){window.shaderFailures=window.shaderFailures||[];window.shaderFailures.push({program:this.getProgramInfoLog(program),shaders:this.getAttachedShaders(program).map(s=>({log:this.getShaderInfoLog(s),source:this.getShaderSource(s)}))});}return value;};}
 const D=window.Driftworks,p=thinProbe,s=p.session.snapshot(),u=D.sim.METERS_PER_UNIT;p.freeze=true;Object.assign(s.state,{region,eye:[region*12000/u,-2380/u,1550/u],right:[1,0,0],up:[0,0,1],back:[0,-1,0],velocity:[0,0,0]});const e=s.combat.enemies.find(e=>e.team==='enemy');e.hp=100;Object.assign(e.pose,{region:1-region,eye:[((1-region)*12000+45)/u,-1640/u,1550/u],velocity:[0,0,0]});s.combat.targetId=e.id;s.combat.targetLocked=true;},region);
  await page.waitForTimeout(800);await page.screenshot({path:`output/thin-shell-dogfight-chart-${region}.png`});
  fixtures.push(await page.evaluate(()=>({region:thinProbe.session.snapshot().state.region,contacts:thinProbe.contacts,target:document.querySelector('#target-info').textContent,lead:document.querySelector('#target-info').dataset.leadState,stats:thinProbe.presentation.renderStats()})));
 }
 assert(fixtures.every(f=>f.lead==='valid'&&f.contacts.some(c=>c.selected)));
 if(process.argv.includes('--crossings')){
  const before=await page.evaluate(()=>{const p=thinProbe,D=window.Driftworks,s=p.session.snapshot(),u=D.sim.METERS_PER_UNIT;const e=s.combat.enemies.find(e=>e.team==='enemy');s.combat.enemies=[e];e.controller='input';e.hp=e.maxHp=1000;e.shield=e.maxShield=0;e.pose.velocity=[0,0,0];e.pose.throttle=0;e.pose.ramp=[0,0,0];Object.assign(s.state,{region:0,eye:[0,-2380/u,1550/u],velocity:[0,0,0],throttle:0,ramp:[0,0,0],rates:[0,0,0]});Object.assign(e.pose,{region:1,eye:[12040/u,-1640/u,1550/u]});const d=D.thinShellOptics.primary(s.state.eye.map(v=>v*u),e.pose.eye.map(v=>v*u),0,1).direction;s.state.back=d.map(v=>-v);s.state.right=[d[1],-d[0],0];s.state.up=[0,0,1];s.combat.targetId=e.id;s.combat.targetLocked=true;p.freeze=false;return e.hp;});
  await page.keyboard.down('Space');await page.waitForTimeout(1000);await page.keyboard.up('Space');
  const after=await page.evaluate(()=>thinProbe.session.snapshot().combat.enemies[0].hp);assert(after<before,'real browser fire damages the visible remote hull');await page.screenshot({path:'output/thin-shell-live-hit.png'});
  const crossings=[];
  for(const side of [0,1]){
   await page.evaluate(side=>{const s=thinProbe.session.snapshot(),u=window.Driftworks.sim.METERS_PER_UNIT,sign=side?-1:1;Object.assign(s.state,{region:side,eye:[side*12000/u,(side?-1690:-2310)/u,1550/u],velocity:[0,sign*70,0],right:[sign,0,0],up:[0,0,1],back:[0,-sign,0],throttle:1,ramp:[0,0,70],rates:[0,0,0]});},side);
   await page.waitForTimeout(600);const region=await page.evaluate(()=>thinProbe.session.snapshot().state.region);assert.equal(region,1-side);crossings.push(region);await page.screenshot({path:`output/thin-shell-live-cross-${side}.png`});
  }
  const lost=await page.evaluate(()=>[...document.querySelectorAll('canvas')].some(c=>{const g=c.getContext('webgl2')||c.getContext('webgl');return g&&g.isContextLost();}));assert(!lost);assert.deepEqual(errors,[]);
  fs.writeFileSync('output/thin-shell-live-combat.json',JSON.stringify({before,after,crossings,errors},null,2)+'\n');console.log({before,after,crossings,errors});return;
 }
 // Match carrier on/off samples at one frozen pose; A/B/B/A, fixed resolution.
 await page.evaluate(()=>{const s=thinProbe.session.snapshot(),u=window.Driftworks.sim.METERS_PER_UNIT;Object.assign(s.state,{region:0,eye:[0,-9000/u,1550/u],right:[1,0,0],up:[0,0,1],back:[0,-1,0]});});
 const blocks=[];for(const enabled of [false,true,true,false]){
  await page.evaluate(()=>thinProbe.presentation.setCapital(null));
  // original rig retained separately because setCapital also updates the probe.
  if(enabled)await page.evaluate(()=>{thinProbe.presentation.setCapital(thinProbe.originalCapital);});
  await page.waitForTimeout(500);await page.evaluate(()=>{thinProbe.rows=[];thinProbe.collect=true;});await page.waitForTimeout(1800);blocks.push({enabled,rows:await page.evaluate(()=>{thinProbe.collect=false;return thinProbe.rows;})});
 }
 await page.screenshot({path:'output/thin-shell-carrier-off.png'});await page.evaluate(()=>thinProbe.presentation.setCapital(thinProbe.originalCapital));await page.waitForTimeout(300);await page.screenshot({path:'output/thin-shell-carrier-on.png'});
 fs.writeFileSync('output/thin-shell-browser.json',JSON.stringify({initial,fired,fixtures,errors,blocks},null,2)+'\n');
 const lost=await page.evaluate(()=>[...document.querySelectorAll('canvas')].some(c=>{const g=c.getContext('webgl2')||c.getContext('webgl');return g&&g.isContextLost();}));assert(!lost,'graphics contexts remain alive');assert.deepEqual(errors,[]);console.log(JSON.stringify({initial,fired,fixtures:fixtures.map(f=>({region:f.region,lead:f.lead,contacts:f.contacts.length})),errors}));
 }finally{await browser.close();}
})();
