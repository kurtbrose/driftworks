'use strict';
const assert=require('node:assert/strict'),{createFlight}=require('../tools/headless.cjs');
const f=createFlight({mission:'battle',seed:29}),{combat:c,state:player}=f.snapshot(),U=f.DW.sim.METERS_PER_UNIT;
const wing=c.enemies.filter(craft=>craft.team==='enemy').slice(0,3);assert.equal(wing.length,3);
c.enemies=wing;c.wave=0;f.DW.flightSim.collisionChanged(c);
player.eye=[0,0,1200];player.velocity=[0,0,0];c.player.hp=c.player.maxHp=100000;
wing.forEach((craft,i)=>{craft.battleZone={id:0,center:[0,0,1200],radiusM:10000};craft.pose.eye=[(i-1)*110/U,-4000/U,1200+(i%2)*60/U];craft.pose.right=[1,0,0];craft.pose.up=[0,0,1];craft.pose.back=[0,-1,0];craft.pose.velocity=[0,50,0];craft.pose.ramp=[0,0,50];craft.damagedAt=-100;});
const initial=wing.map(craft=>craft.pose.eye.slice());
f.advance(.1,{stop:true});
assert(wing.every(craft=>craft.mode==='wing-travel'&&!craft.fire&&craft.targetId===null));
assert(wing.every((craft,i)=>Math.hypot(...craft.pose.eye.map((v,k)=>v-initial[i][k]))*U<20),'Travel uses flight integration, not pose placement');
f.advance(12,{stop:true});
const span=()=>Math.max(...wing.flatMap(a=>wing.map(b=>Math.hypot(...a.pose.eye.map((v,k)=>v-b.pose.eye[k]))*U)));
assert(span()<500,'Loose wing approaches together');
assert(wing.every(craft=>craft.pose.eye[1]>initial[0][1]+300/U));
// Move the opposing pilot into range: the real target/pursuit loop takes over.
f.snapshot().state.eye=wing[0].pose.eye.map((v,k)=>v+(k===1?650/U:0));f.snapshot().state.velocity=[0,0,0];
f.advance(.1,{stop:true});
assert(wing.every(craft=>craft.mode!=='wing-travel'));
assert(wing.some(craft=>craft.targetId==='player'&&craft.gunGoal),'Existing dogfight AI owns target tracking after release');
assert(wing.every(craft=>craft.wingEngagedUntil>c.time));
// Range hysteresis and commitment prevent rapid travel/combat toggling.
f.snapshot().state.eye=wing[0].pose.eye.map((v,k)=>v+(k===1?2200/U:0));f.advance(.1,{stop:true});
assert(wing.every(craft=>craft.mode!=='wing-travel'));
c.time+=9;f.advance(.1,{stop:true});assert(wing.every(craft=>craft.mode==='wing-travel'),'Survivors reform after disengagement');
wing[0].hp=0;f.advance(.1,{stop:true});assert(wing.slice(1).every(craft=>craft.mode==='wing-travel'),'Travel survives loss of the first roster member');
// Damage releases the whole wing even when the opponent is still far away.
wing[1].damagedAt=c.time;f.advance(.1,{stop:true});assert(wing.slice(1).every(craft=>craft.mode!=='wing-travel'));
// Local spacing responds to geometry, with no prescribed side or follower station.
const travel=f.DW.flightOpponent.wingTravel;
const before=travel(wing[0],wing,player.eye);wing[1].pose.eye=wing[0].pose.eye.map((v,k)=>v+(k===0?10/U:0));
const after=travel(wing[0],wing,player.eye);assert.notDeepEqual(after.goal,before.goal);
console.log('PASS wing travel: loose physical approach, combat handoff, tracking, hysteresis, regroup and damage release');
