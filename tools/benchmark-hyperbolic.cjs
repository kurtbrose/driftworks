'use strict';
const {createFlight}=require('./headless.cjs'),crypto=require('node:crypto'),cp=require('node:child_process'),fs=require('node:fs');
// Exact local-chart hull query without the conservative broad phase. Used as a
// differential reference, never as a second combat implementation.
function referenceHull(DW,craft,start,end,boltRadius,flat){
 const H=DW.flightHyperbolic,R=craft.pose.curvature,U=DW.sim.METERS_PER_UNIT,center=craft.pose.eye;
 const local=p=>{const path=H.path(center,p,R),length=R/U*Math.tanh(path.distance*U/R);return path.direction.map(v=>v*length);};
 const hit=flat({...craft,pose:{...craft.pose,eye:[0,0,0],curvature:undefined}},local(start),local(end),boltRadius);if(!hit)return null;
 const n=Math.hypot(...hit.point),length=R/U*Math.atanh(Math.min(1-1e-12,n*U/R)),point=H.offset(center,hit.point.map(v=>v*length/(n||1)),R),total=H.path(start,end,R).distance;
 return {...hit,point,fraction:total?Math.min(1,H.path(start,point,R).distance/total):0};
}
function benchmark(){
 const results=[];
 for(const optimized of [false,true,true,false]){
  const f=createFlight({mission:'hyperbolic',seed:29}),DW=f.DW;f.snapshot().combat.player.plotArmor=true;
  if(!optimized)DW.flightHyperbolic.hullHit=(...args)=>referenceHull(DW,...args);
  f.advance(2,{fire:true});const cpu=[];
  for(let i=0;i<300;i++){const t=performance.now();f.advance(1/60,{fire:true});cpu.push(performance.now()-t);}
  cpu.sort((a,b)=>a-b);const v=f.snapshot(),state=JSON.stringify(v),guns=DW.flightSim.allGuns(v.combat,v.guns);
  const participants=DW.flightSim.participants(v.combat);
  results.push({optimized,medianMs:cpu[Math.floor(cpu.length*.5)],p95Ms:cpu[Math.floor(cpu.length*.95)],elapsed:v.combat.time,shots:v.guns.fired,hits:v.guns.hits,totalShots:participants.reduce((n,c)=>n+c.guns.fired,0),totalHits:participants.reduce((n,c)=>n+c.guns.hits,0),kills:v.combat.kills,bolts:guns.bolts.length,sha256:crypto.createHash('sha256').update(state).digest('hex')});
 }
 if(new Set(results.map(r=>r.sha256)).size!==1)throw new Error('Broad-phase optimization changed the final native session state');
 const sources=Object.fromEntries(['flight-hyperbolic.js','guns.js','flight-model.js','flight-session.js','flight-comms.js','flight-dialogue.js'].map(n=>'experiments/'+n).concat(['src/flight-collision.js','src/flight-combat.js','src/flight-sim.js']).map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(n)).digest('hex')]));
 return {revision:cp.execFileSync('git',['rev-parse','HEAD']).toString().trim(),sources,configuration:{mission:'hyperbolic',radius:650,seed:29,profile:'GTF Ulysses',weapon:'Subach HL-7',actors:17,warmupSeconds:2,sampleSeconds:5,ticksPerSample:2,playerPlotArmor:true,note:'CPU headless native session timing, not renderer or GPU timing'},results};
}
module.exports={referenceHull,benchmark};
if(require.main===module)console.log(JSON.stringify(benchmark(),null,2));
