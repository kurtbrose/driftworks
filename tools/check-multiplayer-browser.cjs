'use strict';
// Optional development-only Playwright probe. Serve the repository on port 8000.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
function probe(){
 const DW=window.Driftworks,create=DW.flightSession.create;
 DW.flightSession.create=function(...args){const session=create.apply(this,args);window.multiplayerProbe={session};return session;};
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const errors=[],requests=[];
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.route('**/flight.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:'('+probe.toString()+')();\n'+await response.text()});});
 const host=await context.newPage(),guest=await context.newPage();
 async function open(page){
   page.on('pageerror',e=>errors.push(String(e)));
   page.on('request',r=>{if(!r.url().startsWith('http://localhost:8000/')&&!r.url().startsWith('data:'))requests.push(r.url());});
   await page.goto('http://localhost:8000/experiments/multiplayer.html');
   await page.waitForFunction(()=>document.querySelector('#net-host')&&!document.querySelector('#fly').disabled,null,{timeout:120000});
   assert.match(page.url(),/flight.html\?multiplayer=1/);
   await page.selectOption('#input-mode','controller');
 }
 await open(host);await open(guest);
 await host.click('#net-host');await host.waitForFunction(()=>document.querySelector('#net-out').value.length>0);
 const offer=await host.inputValue('#net-out');await guest.click('#net-guest');await guest.fill('#net-in',offer);await guest.click('#net-apply');
 await guest.waitForFunction(()=>document.querySelector('#net-out').value.length>0);
 const answer=await guest.inputValue('#net-out');await host.fill('#net-in',answer);await host.click('#net-apply');
 for(const page of [host,guest])try{await page.waitForFunction(()=>window.multiplayerProbe.session.snapshot().combat.enemies.some(c=>c.id==='remote-pilot'));}catch(e){console.log(await page.evaluate(()=>({status:document.querySelector('#net-status').textContent,stats:document.querySelector('#net-stats').textContent,summary:document.querySelector('#net-summary').textContent,state:multiplayerProbe.session.snapshot().state})));throw e;}
 const initial=await host.evaluate(()=>{const s=multiplayerProbe.session.snapshot();return {eye:s.state.eye.slice(),remote:s.combat.enemies[0].pose.eye.slice(),model:s.combat.enemies[0].modelId};});
 assert(initial.model&&initial.model!=='blockout','remote uses production ship model');
 // Both cameras initially face the other fighter. Capture before moving away.
 fs.mkdirSync('output/multiplayer-flight',{recursive:true});
 for(const [name,page] of [['host',host],['guest',guest]]){
   await page.click('#fly');await page.waitForTimeout(500);await page.screenshot({path:`output/multiplayer-flight/${name}.png`});
 }
 // Production keyboard movement and guns, followed by remote-pose convergence.
 await host.bringToFront();if(await host.locator('#fly').isVisible())await host.click('#fly');await host.keyboard.down('w');await host.keyboard.down('Space');await host.waitForTimeout(600);await host.keyboard.up('w');await host.keyboard.up('Space');
 await guest.waitForFunction(start=>Math.hypot(...multiplayerProbe.session.snapshot().combat.enemies[0].pose.eye.map((v,i)=>v-start[i]))>.01,initial.eye);
 const fired=await host.evaluate(()=>multiplayerProbe.session.snapshot().guns.fired);assert(fired>0);
 await guest.bringToFront();if(await guest.locator('#fly').isVisible())await guest.click('#fly');await guest.keyboard.down('d');await guest.waitForTimeout(600);await guest.keyboard.up('d');
 await host.waitForFunction(start=>Math.hypot(...multiplayerProbe.session.snapshot().combat.enemies[0].pose.eye.map((v,i)=>v-start[i]))>.01,initial.remote);
 // Use the same reset control while flying; it must not reload or halt local flight.
 await guest.locator('#multiplayer-panel').evaluate(e=>{e.open=true;});await guest.click('#net-reset');
 await host.waitForFunction(()=>!multiplayerProbe.session.snapshot().combat.enemies.length);
 assert(await guest.evaluate(()=>document.body.classList.contains('flight-active')));
 // A host that never receives a usable route must leave the pending state.
 const blocked=await context.newPage();await open(blocked);
 await blocked.evaluate(()=>{RTCPeerConnection.prototype.setRemoteDescription=async function(){};});
 await blocked.click('#net-host');await blocked.waitForFunction(()=>document.querySelector('#net-out').value.length>0);
 await blocked.fill('#net-in',answer);await blocked.click('#net-apply');
 await blocked.waitForFunction(()=>document.querySelector('#net-status').textContent.includes('20 second limit'));
 await blocked.clock.install();await blocked.clock.fastForward(21000);
 await blocked.waitForFunction(()=>document.querySelector('#net-status').textContent.includes('timed out'));
 assert.equal(await blocked.locator('#net-host').isEnabled(),true);
 await blocked.click('#fly');await blocked.keyboard.down('w');await blocked.waitForTimeout(500);await blocked.keyboard.up('w');
 assert(await blocked.evaluate(()=>multiplayerProbe.session.snapshot().state.throttle>0),'flight works after connection timeout');
 await blocked.screenshot({path:'output/multiplayer-flight/timeout.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[],'no external runtime resource requests');
 const result={initial,fired,timeoutRecovered:true,disconnectRecovered:true,errors,externalRequests:requests};
 fs.writeFileSync('output/multiplayer-flight/browser.json',JSON.stringify(result,null,2)+'\n');console.log(result);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
