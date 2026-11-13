'use strict';
const assert=require('node:assert/strict');
const {loadRuntime,createFlight}=require('../tools/headless.cjs');
const D=loadRuntime(),M=D.flightMissiles,U=D.sim.METERS_PER_UNIT,dt=1/120;
function fixture(name='Harpoon',distance=400){
 const t=D.flightSim.create('training');
 function craft(id,team,y){const c=D.flightSim.createCraft(id,D.arcade.create(0),team);c.profile=D.arcade.profiles.find(p=>p.name==='GTF Hercules');c.pose.eye=[0,y/U,0];c.pose.back=[0,-1,0];c.pose.right=[1,0,0];c.pose.up=[0,0,1];c.pose.velocity=[0,0,0];c.hp=c.maxHp=10000;c.shield=0;return c;}
 t.player=craft('player','ally',0);t.enemies=[craft('target','enemy',distance)];t.targetId='target';t.configured=true;
 const r=M.rack(t.player);r.banks=[{name,ammo:20,capacity:200}];return t;
}
function advance(t,seconds){for(let i=0;i<Math.round(seconds/dt);i++){t.time+=dt;M.step(t,dt);}}
function shoot(t){M.rack(t.player).secondary=true;M.step(t,dt);M.rack(t.player).secondary=false;}
function angle(a,b){return Math.acos(Math.max(-1,Math.min(1,a.reduce((s,v,i)=>s+v*b[i],0))));}
assert.equal(D.retailMissiles.missiles.length,21);
const harpoon=D.retailMissiles.missiles.find(w=>w.name==='Harpoon');
assert.deepEqual([harpoon.damage,harpoon.speed,harpoon.minLockTime,harpoon.turnTime],[100,250,2,1]);
{
 const t=fixture(),r=M.rack(t.player);advance(t,2-dt);assert.equal(r.locked,false);advance(t,dt);assert.equal(r.locked,true);assert.ok(Math.abs(r.lock-2)<1e-8);
 shoot(t);assert.equal(r.banks[0].ammo,19);assert.equal(M.state(t).missiles[0].targetId,'target');
 advance(t,1.95);shoot(t);assert.equal(r.banks[0].ammo,19,'fire wait forbids early second launch');
 advance(t,.1);shoot(t);assert.equal(r.banks[0].ammo,18);r.banks[0].ammo=0;advance(t,2);shoot(t);assert.equal(r.banks[0].ammo,0);
}
{
 const t=fixture(),r=M.rack(t.player);advance(t,1);t.enemies[0].pose.eye=[400/U,0,0];advance(t,.5);assert.equal(r.locked,false);assert.ok(r.lock<1);
 t.enemies[0].pose.eye=[0,400/U,0];advance(t,2);assert.equal(r.locked,true);
 const second=D.flightSim.createCraft('other',D.arcade.create(0),'enemy');second.pose.eye=[0,400/U,0];t.enemies.push(second);t.targetId='other';M.step(t,dt);assert.equal(r.locked,false);assert.ok(r.lock<=dt+.001,'target change resets acquisition');
 r.cycle=true;r.banks.push({name:'Hornet',ammo:4,capacity:4});M.step(t,dt);assert.equal(r.bank,1);M.step(t,dt);assert.equal(r.bank,1,'held cycle is edge triggered');assert.equal(r.locked,false);
}
{
 const t=fixture();shoot(t);const m=M.state(t).missiles[0];assert.equal(m.targetId,null,'unlocked aspect missile dumbfires');advance(t,.5);assert.equal(m.targetId,null);assert.equal(m.speed,62.5);
}
{
 const t=fixture('Cyclops');shoot(t);assert.equal(M.state(t).missiles.length,0,'no dumbfire flag enforced');assert.equal(M.rack(t.player).banks[0].ammo,20);
 advance(t,5);shoot(t);assert.equal(M.state(t).missiles.length,1);
}
{
 const t=fixture('Hornet'),r=M.rack(t.player);advance(t,3);shoot(t);advance(t,.5);assert.equal(M.state(t).missiles.length,4,'four missile swarm emits at 150ms spacing');assert.equal(r.banks[0].ammo,16);
}
{
 const t=fixture('Tempest');shoot(t);const m=M.state(t).missiles[0];assert.equal(m.speed,360);advance(t,1.2);assert.equal(t.enemies[0].hp,9959.5,'real swept impact applies retail damage');assert.equal(M.state(t).missiles.length,0);
}
{
 const t=fixture('Rockeye');t.targetId=null;shoot(t);advance(t,.6);assert.equal(M.state(t).missiles[0].targetId,'target','heat seeker acquires after launch');
 t.enemies[0].hp=0;const other=D.flightSim.createCraft('replacement',D.arcade.create(0),'enemy');other.pose.eye=[0,500/U,0];t.enemies.push(other);M.step(t,dt);assert.equal(M.state(t).missiles[0].targetId,'replacement');
}
{
 const t=fixture();advance(t,2);shoot(t);advance(t,.6);const m=M.state(t).missiles[0],before=m.direction.slice();t.enemies[0].pose.eye=[200/U,400/U,0];M.step(t,dt);assert.ok(angle(before,m.direction)<=2*Math.PI*dt/harpoon.turnTime+1e-8,'turn rate bounded');
 t.enemies[0].hp=0;const other=D.flightSim.createCraft('replacement',D.arcade.create(0),'enemy');other.pose.eye=[0,400/U,0];t.enemies.push(other);M.step(t,dt);assert.equal(m.targetId,'target','aspect does not switch ships');
}
{
 const t=fixture(),r=M.rack(t.player),initial=r.countermeasures;r.decoy=true;advance(t,.2);assert.equal(r.countermeasures,initial-1);assert.equal(M.state(t).decoys.length,1);advance(t,.4);assert.equal(r.countermeasures,initial-2);r.decoy=false;advance(t,2);assert.equal(M.state(t).decoys.length,0);
}
{
 const t=fixture('Rockeye'),r=M.rack(t.player);shoot(t);const m=M.state(t).missiles[0];m.age=1;m.position=[0,200/U,0];
 const enemy=t.enemies[0];M.rack(enemy).decoy=true;M.step(t,dt);M.rack(enemy).decoy=false;M.step(t,dt);
 assert.equal(m.seen.length,1,'one decoy roll per missile/decoy pair');const rng=M.state(t).rng;advance(t,.1);assert.equal(M.state(t).rng,rng,'no per-frame rerolls');
}
{
 const t=fixture('Tempest',1000);shoot(t);const m=M.state(t).missiles[0];m.life=.001;m.position=[0,100/U,0];
 const target=t.enemies[0];target.pose.eye=[0,115/U,0];target.shield=100;target.hp=1000;M.step(t,dt);assert.ok(target.shield<100);assert.equal(target.hp,1000,'pooled shields absorb blast before hull');
}
{
 const t=fixture('Tempest',1000);shoot(t);const m=M.state(t).missiles[0];m.life=.001;m.position=[0,100/U,0];t.enemies[0].pose.eye=[0,115/U,0];t.enemies[0].pose.region=1;M.step(t,dt);assert.equal(t.enemies[0].hp,10000,'blast never leaks between regions');
}
{
 const t=fixture('Tempest',1000);shoot(t);let calls=0;M.step(t,.1,(a,b)=>{calls++;return b;});assert.ok(calls);assert.equal(M.state(t).missiles.length,0,'terrain impact terminates missile');
}
{
 const f=createFlight({mission:'training',seed:29});f.advance(.1,{secondary:true,stop:true});assert.ok(f.snapshot().combat.missileState,'production session steps missiles');
 const text=JSON.stringify(f.snapshot().combat.missileState);assert.ok(!text.includes('null,null'),'state remains finite and JSON safe');
}

{
 const t=fixture(),r=M.rack(t.player);r.banks=[{name:'Harpoon',ammo:23,capacity:60}];
 assert.equal(M.equipBank(t.player,0,'Rockeye'),true);assert.equal(r.banks[0].ammo,14);
 assert.equal(M.equipBank(t.player,0,'Harpoon'),true);assert.ok(r.banks[0].ammo<=23,'switching types cannot replenish cargo');
 assert.equal(M.equipBank(t.player,0,'Helios'),false,'ship allowed list enforced');
}
{
 const t=fixture('Tempest'),target=t.enemies[0];shoot(t);const m=M.state(t).missiles[0];m.position=[0,100/U,0];m.speed=0;m.life=0;target.pose.eye=[0,122/U,0];M.step(t,dt);
 assert.ok(Math.abs(target.hp-(10000-45*.25*.9))<1e-6,'blast damage has FSO quadratic falloff');
}
{
 const t=fixture('Cyclops'),target=t.enemies[0];advance(t,5);shoot(t);const m=M.state(t).missiles[0];m.position=[0,200/U,0];m.life=0;target.pose.eye=[0,250/U,0];M.step(t,dt);
 assert.equal(target.hp,10000);assert.equal(M.state(t).shockwaves.length,1);
 advance(t,.25);assert.equal(target.hp,10000,'shockwave has finite propagation speed');advance(t,.4);assert.ok(target.hp<10000);
 const hp=target.hp;advance(t,1);assert.equal(target.hp,hp,'wave hits each craft once');
}
{
 const t=fixture('Rockeye'),s=M.state(t);shoot(t);const m=s.missiles[0];m.age=1;m.position=[0,200/U,0];m.direction=[0,1,0];
 s.rng=0;s.decoys.push({id:'forced-decoy',owner:'target',team:'enemy',position:[0,230/U,0],velocity:[0,0,0],region:0,age:0,life:2,pulses:2});
 M.step(t,dt);assert.equal(s.missiles.length,0,'successful decoy detonates its seeker inside 40 metres');
}
{
 const t=fixture(),enemy=t.enemies[0];enemy.controller='ai';enemy.pose.back=[0,1,0];enemy.pose.right=[-1,0,0];enemy.targetId='player';advance(t,2.2);
 assert.ok(M.state(t).missiles.some(m=>m.owner===enemy.id&&m.targetId==='player'),'AI waits for and launches a real aspect lock');
 assert.ok(M.incoming(t,t.player).length>0);
}
{
 const t=fixture('Tempest');t.mode='gas-giant';M.rack(t.player).secondary=true;M.rack(t.player).decoy=true;M.step(t,dt);
 assert.equal(M.state(t).missiles.length,0,'weapons-disabled missions prevent launch');assert.equal(M.state(t).decoys.length,0);
}
{
 const t=fixture('Tempest',2000);shoot(t);advance(t,.7);
 const missile=M.state(t).missiles[0];assert.ok(missile.trail.length>10,'missile records actual trajectory');
 assert.ok(missile.trail.length<=48);assert.ok(missile.trail.every(p=>p.age<.85));
 const pose={eye:[15/U,80/U,5/U],right:[0,1,0],up:[0,0,1],back:[1,0,0]};
 const bolt={...missile,missile:true};const batches=D.flightGuns.geometry({bolts:[bolt],impacts:[]},pose);
 assert.ok(batches.some(b=>b.finish===0&&b.vertices.length>0),'nearby missile has opaque body geometry');
 assert.ok(batches.every(b=>Array.from(b.vertices).every(Number.isFinite)),'missile buffers stay finite');
 const broken={...bolt,trail:[{position:[0,0,0],region:0,age:.1},{position:[100,100,100],region:1,age:0}]};
 const split=D.flightGuns.geometry({bolts:[broken],impacts:[]},pose);
 assert.equal(split.find(b=>b.color[0]===.42)?.vertices.length||0,0,'trail never bridges chart boundaries');
 const impact=D.flightGuns.geometry({bolts:[],impacts:[{position:[0,0,0],age:.7,warhead:true,scale:5}]},pose);
 assert.ok(impact.at(-1).vertices.some(v=>v>0),'warhead aftermath outlives gun flash');
 const far=D.flightGuns.geometry({bolts:[bolt],impacts:[]},{...pose,eye:[5000/U,0,0]});
 assert.equal(far.find(b=>b.finish===0)?.vertices.length||0,0,'distant missiles omit subpixel body');
 assert.ok(far.some(b=>b.color[0]===1&&b.vertices.length>0),'distant missile retains engine glow');
}
console.log('PASS missiles: retail tuning, timed locks, bank changes, ammo, dumbfire, bombs, swarms, heat/aspect guidance, bounded turns, CM cooldown/lifetime/rolls, damage, regions, terrain and production session');
