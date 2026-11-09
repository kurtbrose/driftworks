'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createFlight}=require('../tools/headless.cjs'),f=createFlight({mission:'fleet-evacuation',seed:29}),DW=f.DW,c=f.snapshot().combat,s=c.convoy,e=s.evacuation,U=DW.sim.METERS_PER_UNIT;
e.warningAt=0;e.incidentAt=0;e.rescueAt=0;e.bastionClearAt=20;DW.convoyBattle.updateEvacuation(c,0);s.elapsed=30;
const cargoCenter=()=>[0,1,2].map(k=>s.ships.reduce((n,ship)=>n+ship.position[k]*U,0)/s.ships.length);
const initialCenter=cargoCenter(),threat=e.entry.map((v,k)=>k===2?0:v*U-initialCenter[k]),threatLength=Math.hypot(...threat);
assert(Math.abs(e.exit.normal.reduce((n,v,k)=>n+v*threat[k]/threatLength,0))<1e-6,'Relief arrives along the defensive flank, not through the convoy');
for(let i=1;i<=600;i++){s.elapsed=i*.1;DW.convoyBattle.updateEvacuation(c,.1);for(const ship of s.ships)assert(Math.hypot(...ship.position.map((v,k)=>(v-e.capitals[0].position[k])*U))>=850,'The actual emergence/cover trajectory clears the cargo formation');}
assert(e.capitals[0].position.reduce((n,v,k)=>n+(v*U-initialCenter[k])*threat[k]/threatLength,0)>0,'Bastion actually moves onto the threat-facing side');
for(const direction of [[1,0],[-1,0],[0,1],[0,-1]]){
 const center=cargoCenter();e.entry=center.map((v,k)=>(v+(k<2?direction[k]*5000:0))/U);
 DW.convoyBattle.updateEvacuation(c,.1);const delta=e.coverGoal.map((v,k)=>v-center[k]);
 assert(delta[0]*direction[0]+delta[1]*direction[1]>=1400,'Bastion stations toward the threat, not a fixed side of the exit');
 for(const ship of s.ships)assert(Math.hypot(...ship.position.map((v,k)=>v*U-e.coverGoal[k]))>=850,'Whole capital hull clears the formation');
}
for(const mouth of [s.arrivalPortal,e.exit])if(mouth&&DW.wormholes.phase(s.elapsed,mouth).visible)assert(Math.hypot(...e.coverGoal.map((v,k)=>v-mouth.position[k]*U))>=(mouth.radiusM||210)+800-1e-6,'Cover station keeps the whole hull outside wormhole volumes');
const old=e.coverGoal.slice();s.ships.forEach(ship=>{ship.position[0]+=500/U;});DW.convoyBattle.updateEvacuation(c,.1);assert.notDeepEqual(e.coverGoal,old,'Cover follows moving cargo');
// Native point defense must hold fire against real cargo geometry, then resume
// when the same firing lane clears. No fake ray-test result or weapon stub.
const context=vm.createContext({window:{Driftworks:DW},console});
for(const file of ['assets/ships/aegis-kit/flight-rig.js','src/aegis-sim.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
const sim=DW.aegisSim.create(),pose=DW.arcade.create(0);pose.eye=[-1000/U,0,1200+250/U];const target=DW.flightSim.createCraft('cover-target',pose,'enemy');target.hp=target.maxHp=1000000;target.shield=0;c.enemies=[target];DW.flightSim.collisionChanged(c);
s.complete=false;const view=f.snapshot();
function clear(){s.ships.forEach((ship,i)=>{ship.position=[100000/U,i*200/U,1200];});}
function step(seconds){for(let i=0;i<seconds*30;i++)sim.step(1/30,view);}
clear();step(12);assert(sim.telemetry().shots>0,'Unobstructed native guns engage the real target');
s.ships.forEach((ship,i)=>{ship.position=[-800/U,0,1200+(-100+i*20)/U];ship.forward=[0,1,0];});
const before=sim.telemetry().shots;step(12);assert.equal(sim.telemetry().shots,before,'Cargo wall blocks the actual firing lanes');
clear();step(12);assert(sim.telemetry().shots>before,'Clearing the cargo lane releases point defense');
console.log('PASS capital cover: live threat-side station, full hull clearance, moving convoy, masked remote battery and actual cargo hull firing-lane inhibition/resumption');
