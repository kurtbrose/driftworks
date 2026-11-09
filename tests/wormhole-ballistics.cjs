'use strict';
const assert=require('node:assert/strict');
const flight=require('../tools/headless.cjs').createFlight({mission:'training',seed:29}),D=flight.DW,W=D.wormholes,U=D.sim.METERS_PER_UNIT;
const link=W.define({id:'guns',mouths:[{space:0,position:[0,0,0],radius:100,sky:'local'},{space:1,position:[10000,0,0],radius:100,sky:'hostile'}]});
const links=[link],metric={links,time:10},start=[0,-300/U,0],target=[10000/U,300/U,0];
assert.equal(W.ballisticPath(links,[0,0,0],[0,-300/U,0],0,0,10,U),null,'A gun stored inside the excised mouth cannot fire as ordinary local space');
let route=W.ballisticPath(links,start,target,0,1,10,U);assert(route);assert(Math.abs(route.distance*U-400)<1e-5);
assert.equal(W.ballisticPath(links,start,[0,300/U,0],0,0,10,U),null,'A mouth interrupts the same-space straight shot');
assert.equal(W.ballisticPath(links,start,[10000/U,-300/U,0],0,1,10,U),null,'A target with no connecting ray cannot be engaged');
const ray=W.advanceRay(links,start,route.direction,route.distance,0,10,U);assert.equal(ray.region,1);assert.equal(ray.segments.length,2);assert(Math.hypot(...ray.point.map((v,k)=>v-target[k]))<1e-7);
let verified=0;for(let x=-120;x<=120;x+=12){const goal=[(10000+x)/U,300/U,40/U],path=W.ballisticPath(links,start,goal,0,1,10,U);if(!path)continue;const end=W.advanceRay(links,start,path.direction,path.distance,0,10,U);assert.equal(end.region,1);assert(Math.hypot(...end.point.map((v,k)=>v-goal[k]))*U<.02);verified++;}assert(verified>10,'Oblique firing routes must also agree with projectile transport');
link.lifecycle={opensAt:20,closesAt:30};assert.equal(W.ballisticPath(links,start,target,0,1,10,U),null);assert(W.ballisticPath(links,start,[0,300/U,0],0,0,10,U),'Closed mouths leave ordinary space unobstructed');delete link.lifecycle;
const c=flight.snapshot().combat,shooter=c.player;Object.assign(shooter.pose,{eye:start.slice(),right:[1,0,0],up:[0,0,1],back:[0,-1,0],velocity:[0,0,0],region:0});
const victim=D.flightSim.createCraft('routed-victim',D.arcade.create(0),'enemy');Object.assign(victim.pose,{eye:target.slice(),velocity:[0,0,0],region:1});victim.hp=victim.maxHp=100;victim.shield=0;victim.collision={kind:'sphere',radiusM:7};
const ghost=D.flightSim.createCraft('local-ghost',D.arcade.create(0),'enemy');Object.assign(ghost.pose,{eye:target.slice(),velocity:[0,0,0],region:0});ghost.hp=ghost.maxHp=100;ghost.shield=0;ghost.collision={kind:'sphere',radiusM:7};c.enemies=[victim,ghost];c.wormholes=links;c.time=10;D.flightSim.collisionChanged(c);
const weapon={...D.retailWeapons[0],speed:1000,lifetime:2,damage:20};
const lead=D.flightSim.firingSolution(c,shooter,victim,weapon);assert(lead&&lead.region===1);assert(Math.abs(lead.direction[0])<1e-5,'Aim at the mouth, not the remote stored X coordinate');
D.flightOpponent.trackAim(c,shooter,victim.pose);assert.equal(shooter.gunValid,true);assert(Math.abs(shooter.gunGoal[0])<1e-5);
const occluded={...victim.pose,eye:[0,300/U,0],region:0};D.flightOpponent.forget(shooter);D.flightOpponent.trackAim(c,shooter,occluded);assert.equal(shooter.gunValid,false,'AI refuses same-space aiming through a mouth');
const guns=D.flightGuns.create(),trace=(a,b,bolt)=>D.flightSim.trace(c,a,b,bolt,'player',undefined,shooter.pose);
D.flightGuns.step(guns,shooter.pose,weapon,true,.01,trace,undefined,1,[[0,0,0]],metric);
for(let i=0;i<70;i++)D.flightGuns.step(guns,shooter.pose,weapon,false,.01,trace,undefined,1,[[0,0,0]],metric);
assert(victim.hp<100,'A real emitted round crosses and damages the remote target');assert.equal(ghost.hp,100,'The same-coordinate local ghost must not take damage');
// Impacts must retain the segment where they happened, even if the remaining
// ray would have crossed a mouth later in the same tick.
const stopped=D.flightGuns.create();D.flightGuns.step(stopped,shooter.pose,weapon,true,.01,()=>null,undefined,1,[[0,0,0]],metric);D.flightGuns.step(stopped,shooter.pose,weapon,false,.5,(a,b,bolt)=>bolt.region===0?[0,-150/U,0]:null,undefined,1,[[0,0,0]],metric);assert.equal(stopped.impacts[0].region,0);
console.log('PASS registered wormhole ballistics: direct/blocked/routed/closed paths, '+verified+' oblique routes, AI aim, actual remote damage, chart isolation and first-leg impacts');

// Exercise the final NPC fire-control gate in the real simulator.
c.mode='battle';c.enabled=true;c.roundOver=false;c.countdown=999;c.player.shield=0;c.player.hp=100;c.player.collision={kind:'sphere',radiusM:7};
const npc=D.flightSim.createCraft('gun-control',D.arcade.create(0),'enemy');Object.assign(npc.pose,{eye:start.slice(),right:[1,0,0],up:[0,0,1],back:[0,-1,0],velocity:[0,0,0],region:0});npc.controller='input';npc.fire=true;npc.targetId='player';c.enemies=[npc];
Object.assign(c.player.pose,{eye:[0,300/U,0],region:0,velocity:[0,0,0]});D.flightSim.collisionChanged(c);D.flightSim.step(c,c.player.pose,.02,0);assert.equal(npc.guns.fired,0,'Final fire control refuses a straight shot that enters the wrong space');
Object.assign(c.player.pose,{eye:target.slice(),region:1});D.flightSim.collisionChanged(c);npc.fire=true;D.flightSim.step(c,c.player.pose,.02,0);assert(npc.guns.fired>0,'Final fire control permits an aligned, verified cross-mouth shot');
console.log('PASS actual NPC trigger: blocked local-coordinate shot withheld; aligned routed shot fired');

const narrow={...link,mouths:link.mouths.map(m=>({...m,radius:10}))};c.wormholes=[narrow];npc.guns=D.flightGuns.create();npc.pose.back=[Math.sin(.1),-Math.cos(.1),0];npc.fire=true;D.flightSim.step(c,c.player.pose,.02,0);assert.equal(npc.guns.fired,0,'Barrels must actually intersect the mouth; a loose alignment threshold is insufficient');
console.log('PASS narrow aperture: AI withholds fire when its actual barrels miss the mouth');

// Browser-owned capitals opt into foreign-space hit queries; terrain keeps its
// historical source-only behavior.
c.enemies=[];D.flightSim.collisionChanged(c);let environmentHits=0;const remoteSurface=Object.assign((a,b)=>b,{allRegions:true,onImpact:()=>environmentHits++});const probe={region:1,position:[600,0,0],direction:[0,1,0],age:0,weapon};
assert(D.flightSim.trace(c,[600,0,0],[600,1,0],probe,'player',remoteSurface,c.player.pose));assert.equal(environmentHits,1);
let terrainQueries=0;D.flightSim.trace(c,[600,0,0],[600,1,0],probe,'player',()=>{terrainQueries++;return null;},c.player.pose);assert.equal(terrainQueries,0,'Source terrain must not appear in a foreign space');
console.log('PASS foreign capital surfaces: explicit region-aware collision without leaking source terrain');

// A pursuer in an adjacent space must use the real return mouth rather than
// steering at the source-space storage coordinates or remaining stranded.
const pursuit=require('../tools/headless.cjs').createFlight({mission:'battle',seed:29}),P=pursuit.DW,pv=pursuit.snapshot(),pc=pv.combat,pu=P.sim.METERS_PER_UNIT;
const pursuitLink=P.wormholes.define({id:'pursuit',mouths:[{space:0,position:[0,0,24000],radius:100,sky:'local'},{space:1,position:[10000,0,24000],radius:100,sky:'hostile'}]});pc.wormholes=[pursuitLink];pc.countdown=999;pc.time=10;pc.enabled=true;pc.roundOver=false;
Object.assign(pv.state,{eye:[0,-1000/pu,24000/pu],region:0,velocity:[0,0,0],ramp:[0,0,0],throttle:0});
const pursuer=P.flightSim.createCraft('pursuer',P.arcade.create(0),'enemy');Object.assign(pursuer.pose,{eye:[10000/pu,500/pu,24000/pu],region:1,right:[-1,0,0],up:[0,0,1],back:[0,1,0],velocity:[0,0,0],ramp:[0,0,0],throttle:1});pursuer.controller='ai';pursuer.opponentStyle='baseline';pursuer.profile=pc.player.profile;pc.enemies=[pursuer];P.flightSim.collisionChanged(pc);
for(let i=0;i<1200&&pursuer.pose.region===1;i++)P.flightSim.stepControlled(pc,{throttle:0,throttleRate:0,fire:false},P.retailWeapons[0],1/120,0);
assert.equal(pursuer.pose.region,0,'Pursuer returns through the declared mouth instead of becoming stranded');
Object.assign(pv.state,{eye:[0,300/pu,24000/pu],region:0,velocity:[0,0,0]});Object.assign(pursuer.pose,{eye:[0,-300/pu,24000/pu],region:0,right:[1,0,0],up:[0,0,1],back:[0,-1,0],velocity:[0,0,0],ramp:[0,0,0]});pursuer.mode='attack';pursuer.decision=0;pursuer.until=0;P.flightOpponent.forget(pursuer);P.flightSim.collisionChanged(pc);P.flightSim.stepControlled(pc,{throttle:0,throttleRate:0,fire:false},P.retailWeapons[0],1/120,0);
assert(Math.abs(pursuer.goal[0])>1,'Same-space blocked pursuit chooses a lateral detour');assert.equal(pursuer.gunValid,false);
console.log('PASS portal-aware pursuit: return navigation across spaces and a local detour around an obstructing mouth');
