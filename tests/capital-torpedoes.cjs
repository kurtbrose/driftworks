'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../tools/headless.cjs').loadRuntime();
const context=vm.createContext({window:{Driftworks:D},Float32Array,Map,WeakMap,Math});
for(const file of ['assets/ships/aegis-kit/flight-rig.js','src/aegis-sim.js','src/aegis-visual.js','src/aegis-battle.js','experiments/aegis-flight.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),context,{filename:file});
const U=D.sim.METERS_PER_UNIT,M=D.flightMissiles,dt=1/120;
function fixture(){const combat=D.flightSim.create('battle');combat.enabled=true;combat.enemies=[];combat.player.pose.eye=[0,-200,1200];return {combat,state:combat.player.pose,guns:D.flightGuns.create(),world:{}};}
{
 const v=fixture(),battle=D.aegisBattle.createBattle();
 let launchHeading;for(let i=0;i<960;i++){battle.step(dt,v);if(launchHeading===undefined&&M.state(v.combat).missiles.length)launchHeading=battle.telemetry().capitals[0].heading;}
 const missiles=M.state(v.combat).missiles;
 assert.equal(missiles.length,12,'each capital launches six staggered torpedoes');
 assert.equal(missiles.filter(m=>m.team==='ally').length,6);
 assert.ok(missiles.every(m=>Math.abs(m.direction[2])<1e-8&&m.position.every(Number.isFinite)));
 const first=missiles[0],heading=launchHeading;
 assert.ok(Math.abs(first.direction[0]*Math.cos(heading)+first.direction[1]*Math.sin(heading))<.02,'launch points sideways');
 v.combat.enabled=false;for(let i=0;i<3600;i++)battle.step(dt,v);assert.equal(M.state(v.combat).serial,12,'disabled combat cannot launch');battle.reset(v.combat);assert.equal(M.state(v.combat).missiles.length,0,'reset clears capital ordnance');
}
{
 const v=fixture(),t=v.combat;t.enemies=[];t.player.pose.eye=[100,100,100];
 M.launchTorpedo(t,'capital-enemy','enemy',[0,0,1200],[1,0,0],[0,100,1200],0);
 const m=M.state(t).missiles[0];for(let i=0;i<120;i++)M.step(t,dt);
 assert.ok(m.direction[1]>.1,'torpedo turns after clearing its launch tube');assert.ok(m.speed>65&&m.speed<=180);
 const bolt={weapon:{...D.retailWeapons[0],damage:6,headRadius:1},direction:[1,0,0],position:[0,0,0],age:0,region:0};
 const a=m.position.map((x,i)=>x-(i===0?10/U:0)),b=m.position.map((x,i)=>x+(i===0?10/U:0));
 assert.equal(M.interceptTorpedo(t,a,b,bolt,'enemy'),null,'friendly fire does not intercept own torpedoes');
 bolt.region=1;assert.equal(M.interceptTorpedo(t,a,b,bolt,'ally'),null,'shots do not cross regions');bolt.region=0;
 assert.ok(M.interceptTorpedo(t,a,b,bolt,'ally'));assert.equal(m.hp,6);assert.ok(M.interceptTorpedo(t,a,b,bolt,'ally'));assert.equal(m.hp,0);
 assert.equal(M.torpedoTargets(t,'ally',0).length,0);M.step(t,dt);assert.equal(M.state(t).missiles.length,0,'destroyed torpedo cannot impact later');
}
{
 const v=fixture(),t=v.combat;M.launchTorpedo(t,'capital-enemy','enemy',[0,0,1200],[1,0,0],[100,0,1200],0);
 const m=M.state(t).missiles[0],bolt={weapon:{...D.retailWeapons[0],damage:20,headRadius:1},direction:[1,0,0],position:[0,0,0],age:0,region:0};
 const a=[-20/U,0,1200],b=[20/U,0,1200];
 D.flightSim.trace(t,a,b,bolt,'player',()=>[-10/U,0,1200],t.player.pose);assert.equal(m.hp,12,'nearer hull blocks interception');
 D.flightSim.trace(t,a,b,bolt,'player',undefined,t.player.pose);assert.equal(m.hp,-8,'fighter guns use shared swept torpedo collision');
}
console.log('PASS capital torpedoes: reciprocal sideways six-round salvos, launch gate, guided flight, durable swept interception, friendly/region/occlusion guards');

{
 const v=fixture(),battle=D.aegisBattle.createBattle(),t=v.combat;let intercepted=0,impacts=0;
 const terrain=(a,b,bolt)=>battle.hit(a,b,bolt);terrain.allRegions=true;terrain.onImpact=(p,b)=>{if(b.weapon.name==='Capital torpedo')impacts++;battle.damage(p,b.weapon.damage,t);};
 const seen=new Set();for(let i=0;i<4200;i++){t.time+=dt;battle.step(dt,v);for(const m of M.state(t).missiles){if(m.torpedo&&m.team==='enemy'&&m.hp>0)m.hp=100000;}for(const m of M.state(t).missiles)if(m.torpedo&&m.hp<=0&&!seen.has(m.id)){seen.add(m.id);intercepted++;}M.step(t,dt,terrain);}
 assert.ok(intercepted>0,'capital point defense destroys real inbound torpedoes with gunfire');
 assert.ok(impacts>0,'surviving torpedoes impact the opposing capital');
 console.log('PASS live capital interception:',intercepted,'torpedoes shot down,',impacts,'warheads impacted');
}

{
 const v=fixture(),t=v.combat;t.configured=true;
 const p=D.arcade.create(0);p.eye=[0,0,1200];p.back=[0,-1,0];p.right=[1,0,0];p.up=[0,0,1];
 const defender=D.flightSim.createCraft('defender',p,'ally');defender.controller='ai';t.enemies=[defender];
 M.launchTorpedo(t,'capital-enemy','enemy',[0,400/U,1200],[0,-1,0],[0,0,1200],0);
 let targeted=false,fired=false;for(let i=0;i<240;i++){D.flightSim.step(t,t.player.pose,dt,0);targeted ||= !!defender.targetId&&defender.targetId.startsWith('torpedo-');fired ||= defender.guns.fired>0;}
 assert.ok(targeted,'nearby fighter chooses hostile torpedo');assert.ok(fired,'fighter fires actual gun rounds at its torpedo target');
 console.log('PASS fighter torpedo defense: acquisition, pursuit and real primary fire');
}
