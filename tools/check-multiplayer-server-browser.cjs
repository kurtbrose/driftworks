'use strict';
// Optional Playwright integration test; serve the static site on port 8000.
const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
function probe(){const DW=window.Driftworks,create=DW.flightSession.create;DW.flightSession.create=function(...args){const session=create.apply(this,args);window.multiplayerProbe={session};return session;};}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
 const errors=[],external=[];fs.mkdirSync('output/multiplayer-server',{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.route('**/flight.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:'('+probe.toString()+')();\n'+await response.text()});});
  context.on('page',page=>{page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith('http://localhost:8000/')&&!r.url().startsWith('data:'))external.push(r.url());});});
  const server=await context.newPage();await server.goto('http://localhost:8000/experiments/multiplayer.html');await server.waitForURL('**/multiplayer-server.html');await server.click('#create');
  const joinURL=await server.inputValue('#join-link');
  async function client(url=joinURL,ctx=context){const page=await ctx.newPage();await page.goto(url);await page.waitForFunction(()=>window.multiplayerProbe&&!document.querySelector('#fly').disabled,null,{timeout:120000});await page.selectOption('#input-mode','controller');return page;}
  async function connected(page){await page.waitForFunction(()=>document.querySelector('#net-summary').textContent==='connected');}
  async function panel(page){await page.locator('#multiplayer-panel').evaluate(e=>{e.open=true;});}
  const one=await client();await connected(one);
  const two=await client();await connected(two);
  await server.waitForFunction(()=>document.querySelector('#count').textContent==='2 / 2');
  for(const page of [one,two])await page.waitForFunction(()=>multiplayerProbe.session.snapshot().combat.enemies.some(c=>c.id==='remote-pilot'));
  await server.screenshot({path:'output/multiplayer-server/roster.png',fullPage:true});
  const start=await one.evaluate(()=>multiplayerProbe.session.snapshot().state.eye.slice());
  await one.bringToFront();await one.click('#fly');await one.keyboard.down('w');await one.keyboard.down('Space');await one.waitForTimeout(1200);await one.keyboard.up('w');await one.keyboard.up('Space');
  await two.waitForFunction(start=>Math.hypot(...multiplayerProbe.session.snapshot().combat.enemies[0].pose.eye.map((v,i)=>v-start[i]))>.01,start);
  assert(await one.evaluate(()=>multiplayerProbe.session.snapshot().guns.fired>0));
  await two.bringToFront();await two.click('#fly');await two.screenshot({path:'output/multiplayer-server/client.png'});
  const third=await client();await third.waitForFunction(()=>document.querySelector('#net-status').textContent.includes('full'));await third.close();
  await server.locator('#roster button').first().click();
  await one.waitForFunction(()=>document.querySelector('#net-status').textContent.includes('Kicked'));
  await two.waitForFunction(()=>multiplayerProbe.session.snapshot().combat.enemies.length===0);
  await panel(one);await one.click('#net-join');await one.waitForFunction(()=>document.querySelector('#net-status').textContent.includes('Kicked'));
  // Restore the free seat through a remote invitation in a separate browser context:
  // BroadcastChannel cannot connect these contexts, so this proves WebRTC transport.
  await server.locator('#remote').evaluate(e=>{e.open=true;});await server.click('#invite');
  await server.waitForFunction(()=>document.querySelector('#invite-link').value.length>0);
  const remoteURL=await server.inputValue('#invite-link');
  const remoteContext=await browser.newContext({viewport:{width:1440,height:1000}});
  await remoteContext.route('**/flight.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:'('+probe.toString()+')();\n'+await response.text()});});
  const remote=await client(remoteURL,remoteContext);remote.on('pageerror',e=>errors.push(String(e)));
  await remote.waitForFunction(()=>document.querySelector('#net-out').value.length>0);
  const answer=await remote.inputValue('#net-out');await server.fill('#answer',answer);await server.click('#apply');await connected(remote);
  await server.waitForFunction(()=>document.querySelector('#roster').textContent.includes('WebRTC'));
  await remote.waitForFunction(()=>multiplayerProbe.session.snapshot().combat.enemies.length===1);
  const remoteStart=await remote.evaluate(()=>multiplayerProbe.session.snapshot().state.eye.slice());
  await remote.bringToFront();await remote.click('#fly');await remote.keyboard.down('d');await remote.waitForTimeout(1200);await remote.keyboard.up('d');
  await two.waitForFunction(start=>Math.hypot(...multiplayerProbe.session.snapshot().combat.enemies[0].pose.eye.map((v,i)=>v-start[i]))>.01,remoteStart);
  await server.screenshot({path:'output/multiplayer-server/mixed-transports.png',fullPage:true});
  await server.click('#stop');
  for(const page of [two,remote])await page.waitForFunction(()=>document.querySelector('#net-summary').textContent==='offline');
  assert(await two.evaluate(()=>document.body.classList.contains('flight-active')),'server stop leaves local flight active');
  // Stale link produces a useful diagnosis and does not block flight loading.
  const stale=await client();await stale.waitForFunction(()=>document.querySelector('#net-status').textContent.includes('No server answered'));
  await stale.screenshot({path:'output/multiplayer-server/stale-link.png'});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const result={localJoin:true,twoPilots:true,movement:true,firing:true,capacity:true,kick:true,kickRetryRejected:true,webRTCSeparateContext:true,remoteMovement:true,serverStop:true,staleLink:true,errors,externalRequests:external};
  fs.writeFileSync('output/multiplayer-server/browser.json',JSON.stringify(result,null,2)+'\n');console.log(result);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
