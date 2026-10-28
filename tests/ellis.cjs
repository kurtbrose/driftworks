'use strict';
const assert=require('node:assert/strict');
const mission=process.argv.includes('--thin-shell')?'thin-shell':'ellis';
const {createFlight,dt}=require('../tools/headless.cjs');
function probe(x,y,offset=0,speed=200){
    const flight=createFlight({mission:mission,enabled:false});
    const {state}=flight.snapshot(),u=flight.DW.sim.METERS_PER_UNIT;
    state.region=x===12000?1:0;state.eye=[x/u,y/u,(1550+offset)/u];
    state.velocity=[0,speed,0];state.back=[0,-Math.sign(speed),0];
    state.ramp[2]=Math.abs(speed);flight.config.profile.maxVelocity[2]=Math.abs(speed);
    return {flight,state,u};
}
let p=probe(0,-2310);p.flight.advance(.2,{throttle:1});
assert.equal(p.state.eye[0]*p.u,12000,'outbound crossing');
assert(p.state.eye[1]*p.u>-1700,'emerges outward');
assert.equal(p.state.region,1,'crossing changes region');
assert(p.state.velocity[1]>0,'radial velocity preserved');
assert.deepEqual(Array.from(p.state.right,v=>v||0),[-1,0,0],'antipodal chart reverses tangent right');
assert.deepEqual(Array.from(p.state.up,v=>v||0),[0,0,-1],'antipodal chart reverses tangent up');
assert.deepEqual(Array.from(p.state.back,v=>v||0),[0,-1,0],'radial forward direction stays forward');
p.flight.advance(.2,{throttle:1});assert.equal(p.state.eye[0]*p.u,12000,'no immediate bounce');
p=probe(12000,-1690,0,-200);p.flight.advance(.2,{throttle:1});
assert.equal(p.state.eye[0],0,'return crossing');
assert.equal(p.state.region,0,'return restores region');
assert(p.state.eye[1]*p.u<-2300);
p=probe(0,-2400,350);p.flight.advance(4,{throttle:1});assert.equal(p.state.eye[0],0,'near miss');
p=probe(0,-2400,0,120000);p.flight.advance(dt,{throttle:1});
assert.equal(p.state.eye[0]*p.u,12000,'swept crossing catches a full-diameter tick');
p=probe(0,-2400);const snap=p.flight.snapshot();
snap.guns.bolts.push({position:[0,-2301/p.u,1550/p.u],direction:[0,1,0],age:0,weapon:p.flight.config.weapon});
p.flight.advance(.1,{stop:true});
assert.equal(snap.guns.bolts[0].position[0]*p.u,12000,'gunfire crosses');
assert.equal(snap.guns.bolts[0].region,1,'projectile changes region');
p=probe(0,-2400);const angled=p.flight.snapshot();
angled.guns.bolts.push({position:[100/p.u,-2283/p.u,1550/p.u],direction:[0,1,0],age:0,weapon:p.flight.config.weapon});
p.flight.advance(dt,{stop:true});const direction=angled.guns.bolts[0].direction;
assert(direction[0]<0,'off-axis projectile tangent is transported');
assert(Math.abs(Math.hypot(...direction)-1)<1e-10,'transport preserves projectile direction length');
const live=createFlight({mission:mission});live.advance(2,{stop:true});
assert.equal(live.snapshot().combat.enemies.length,8);
assert(live.snapshot().combat.enemies.every(c=>c.pose.eye.every(Number.isFinite)));
console.log('PASS Ellis bridge: return, overshoot, near miss, no bounce, gunfire and live combat');

const firing=createFlight({mission:mission,enabled:false}),fsnap=firing.snapshot(),fu=firing.DW.sim.METERS_PER_UNIT;
Object.assign(fsnap.state,{eye:[0,-2400/fu,1550/fu],right:[1,0,0],up:[0,0,1],back:[0,-1,0],velocity:[0,0,0]});
firing.advance(.05,{stop:true,fire:true});
assert(fsnap.guns.fired>0&&fsnap.guns.bolts.length>0,'forward fire emits live bolts inside lens volume');
assert(fsnap.guns.bolts.every(b=>b.direction[1]>.99&&b.position[1]>fsnap.state.eye[1]),'bolts travel locally forward');
console.log('PASS Ellis local firing: live gun emission and forward projectile travel');

// Region identity, not x position, controls contact, lock and collision eligibility.

const regions=createFlight({mission:mission}),rs=regions.snapshot(),ru=regions.DW.sim.METERS_PER_UNIT;
assert.equal(rs.combat.enemies.filter(c=>c.pose.region===1).length,4,'two teams populate both regions');
const remote=rs.combat.enemies.find(c=>c.team==='enemy'&&c.pose.region===1);
remote.pose.eye=rs.state.eye.map((v,i)=>v-rs.state.back[i]*100/ru);
rs.combat.targetId=remote.id;rs.combat.targetLocked=true;
regions.session.acquireTarget();assert.equal(rs.combat.targetId,remote.id,'Ellis lock survives a change of region');
regions.session.nextTarget();assert(rs.combat.targetId,'target cycling includes both regions');
const hp=remote.hp,shield=remote.shield;
const start=remote.pose.eye.map((v,i)=>v+rs.state.back[i]*30/ru),end=remote.pose.eye.map((v,i)=>v-rs.state.back[i]*30/ru);
const bolt={region:0,position:start,direction:rs.state.back.map(v=>-v),weapon:regions.config.weapon,age:0};
regions.DW.training.trace(rs.combat,start,end,bolt,'player',undefined,rs.state);
assert.equal(remote.hp,hp);assert.equal(remote.shield,shield,'bolts cannot hit colocated hull in another region');
assert.equal(regions.DW.training.convergencePoint(rs.combat,rs.combat.player,regions.config.weapon,undefined),null,'remote hull cannot retract local muzzles');
console.log('PASS Ellis regions: explicit membership, persistent cross-mouth targeting and cross-region collision isolation');

regions.DW.training.damageCraft(rs.combat,remote,{...regions.config.weapon,damage:1e9});
assert.equal(rs.combat.wrecks.at(-1).pose.region,1,'wreck retains region');
assert.equal(rs.combat.flashes.at(-1).region,1,'explosion retains region');

if(mission==='thin-shell'){
 const flight=createFlight({mission}),D=flight.DW,s=flight.snapshot(),u=D.sim.METERS_PER_UNIT;
 const ally=s.combat.enemies.find(e=>e.team==='ally'),enemy=s.combat.enemies.find(e=>e.team==='enemy');
 s.combat.enemies=[ally,enemy];
 Object.assign(ally.pose,{region:0,eye:[0,-2310/u,1550/u],right:[1,0,0],up:[0,0,1],back:[0,-1,0],velocity:[0,70,0],ramp:[0,0,70],throttle:1});
 Object.assign(enemy.pose,{region:1,eye:[12000/u,-1000/u,1550/u],velocity:[0,0,0]});enemy.controller='input';
 ally.targetId=enemy.id;ally.retarget=3;
 flight.advance(dt,{stop:true});assert.equal(ally.mode,'transit','NPC pursues remote opposition through the shell');
 flight.advance(.8,{stop:true});assert.equal(ally.pose.region,1,'NPC actually crosses to continue the dogfight');
 assert(ally.pose.eye.every(Number.isFinite)&&(!ally.gunGoal||ally.gunGoal.every(Number.isFinite)));
 console.log('PASS thin-shell AI: remote pursuit, physical crossing and finite post-crossing aim');
}
