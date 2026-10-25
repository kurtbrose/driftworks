'use strict';
const {createFlight}=require('./headless.cjs'),{performance}=require('node:perf_hooks'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const option=(name,fallback)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
const seconds=Number(option('--seconds','12')),counts=option('--counts','16,50,100').split(',').map(Number);
if(!(seconds>=1&&seconds<=120)||counts.some(n=>!Number.isInteger(n)||n<2||n>2048))throw new Error('Use 1–120 seconds and 2–256 fighters');
const percentile=(values,q)=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))];};
const unit=v=>{const length=Math.hypot(...v)||1;return v.map(x=>x/length);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function fixture(count,seed,layout){
 const flight=createFlight({mission:'furball',seed}),DW=flight.DW,resolve=DW.flightMissions.resolve,base=resolve('furball');
 const mission={...base,encounter:{...base.encounter,count}};DW.flightMissions.resolve=id=>id==='furball'?mission:resolve(id);flight.reset();
 const {combat,state}=flight.snapshot(),U=DW.sim.METERS_PER_UNIT;
 assert.equal(combat.enemies.length,count);
 if(layout==='dense'){
  const center=state.eye.map((v,k)=>v+(-state.back[k]*450+state.up[k]*40)/U),half=Math.ceil(count/2);
  combat.enemies.forEach((e,i)=>{
   const j=i%half,side=i<half?-1:1,x=side*(300+(j%2)*60),y=(Math.floor(j/2)%5-2)*60,z=(Math.floor(j/10)-(Math.ceil(half/10)-1)/2)*60;
   e.pose.eye=center.map((v,k)=>v+(state.right[k]*x-state.back[k]*y+state.up[k]*z)/U);
   const forward=unit(center.map((v,k)=>v-e.pose.eye[k])),reference=Math.abs(forward[2])>.95?[0,1,0]:[0,0,1];
   e.pose.right=unit(cross(forward,reference));e.pose.up=unit(cross(e.pose.right,forward));e.pose.back=forward.map(v=>-v);e.pose.velocity=forward.map(v=>v*45);e.goal=center.slice();e.decision=(i%16)*.13;
  });
 }
 return flight;
}
function run(count,seed,layout){
 const f=fixture(count,seed,layout),DW=f.DW,stages=new Map();let collecting=false;
 const wrap=(object,key,name=key)=>{const original=object[key];object[key]=function(...args){if(!collecting)return original.apply(this,args);const start=performance.now();try{return original.apply(this,args);}finally{const row=stages.get(name)||{ms:0,calls:0};row.ms+=performance.now()-start;row.calls++;stages.set(name,row);}};};
 wrap(DW.training,'step','combatInclusive');wrap(DW.flightGuns,'step','gunsInclusive');wrap(DW.shipPackModels,'hullHit','mesh');wrap(DW.shipPackModels,'addScorch','scorch');wrap(DW.training,'acquireTarget','acquire');wrap(DW.flightGuns,'intersect','terrain');wrap(DW.flightComms,'step','comms');
 f.advance(.5,{stop:true,fire:true});collecting=true;
 const samples=[],alive=[],seen=new Map(),stateErrors=[];let shots=0,hits=0,maxBolts=0,minimumSeparation=Infinity;
 const observe=()=>{
  const combat=f.snapshot().combat,crafts=[combat.player,...combat.enemies],ids=new Set();let bolts=0,living=0;
  for(const e of crafts){
   assert.ok(!ids.has(e.id),'duplicate craft ID');ids.add(e.id);
   if(e!==combat.player&&e.hp>0)living++;bolts+=e.guns.bolts.length;
   if(![e.hp,e.shield||0,...e.pose.eye,...e.pose.velocity,...e.pose.right,...e.pose.up,...e.pose.back].every(Number.isFinite))stateErrors.push({tick:f.ticks,id:e.id});
   const previous=seen.get(e.id)||{fired:0,hits:0};shots+=Math.max(0,e.guns.fired-previous.fired);hits+=Math.max(0,e.guns.hits-previous.hits);seen.set(e.id,{fired:e.guns.fired,hits:e.guns.hits});
  }
  maxBolts=Math.max(maxBolts,bolts);alive.push(living);
 };
 observe();
 const frames=Math.round(seconds*60);
 for(let frame=0;frame<frames;frame++){
  const previous=f.ticks,start=performance.now();f.advance(1/60,{stop:true,fire:true});samples.push(performance.now()-start);observe();
  if(f.ticks===previous)break;
 }
 const combat=f.snapshot().combat,crafts=combat.enemies.filter(e=>e.hp>0),U=DW.sim.METERS_PER_UNIT;
 for(let i=0;i<crafts.length;i++)for(let j=i+1;j<crafts.length;j++)minimumSeparation=Math.min(minimumSeparation,Math.hypot(...crafts[i].pose.eye.map((v,k)=>v-crafts[j].pose.eye[k]))*U);
 assert.equal(stateErrors.length,0,'non-finite simulation state');
 const elapsed=f.seconds-.5;
 return {count,seed,layout,frames:samples.length,simulatedSeconds:elapsed,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p50Ms:percentile(samples,.5),p95Ms:percentile(samples,.95),p99Ms:percentile(samples,.99),worstMs:Math.max(...samples),over16ms:samples.filter(v=>v>1000/60).length,over33ms:samples.filter(v=>v>1000/30).length,alive:{minimum:Math.min(...alive),final:alive.at(-1),mean:alive.reduce((a,b)=>a+b,0)/alive.length},shots,hits,maxBolts,wave:combat.wave,playerDead:combat.dead,minimumFinalSeparationM:minimumSeparation,duplicateCallsigns:combat.enemies.length-new Set(combat.enemies.map(e=>e.callsign)).size,collision:DW.training.collisionStats(combat),stages:[...stages].map(([name,r])=>({name,msPerFrame:r.ms/samples.length,callsPerFrame:r.calls/samples.length})).sort((a,b)=>b.msPerFrame-a.msPerFrame),digest:crypto.createHash('sha256').update(JSON.stringify({view:f.snapshot(),events:f.events,transcript:f.transcript})).digest('hex')};
}
async function profile(count=100,layout='dense'){
 const inspector=require('node:inspector'),flight=fixture(count,29,layout);flight.advance(4,{stop:true,fire:true});
 const session=new inspector.Session();session.connect();
 const post=method=>new Promise((resolve,reject)=>session.post(method,(error,result)=>error?reject(error):resolve(result)));
 await post('Profiler.enable');await post('Profiler.start');flight.advance(4,{stop:true,fire:true});const {profile:p}=await post('Profiler.stop');session.disconnect();
 const nodes=new Map(p.nodes.map(n=>[n.id,n])),totals=new Map();
 for(let i=0;i<p.samples.length;i++){const c=nodes.get(p.samples[i]).callFrame,key=c.functionName+' '+c.url.split('/').at(-1)+':'+(c.lineNumber+1);totals.set(key,(totals.get(key)||0)+p.timeDeltas[i]/1000);}
 return {count,layout,seed:29,warmupSeconds:4,measuredSimulationSeconds:4,method:'V8 sampling profiler, actual headless session; self sample times are diagnostic and include profiler overhead. Anonymous function names use source file and one-based line.',sampledMs:p.timeDeltas.reduce((a,b)=>a+b,0)/1000,topSelfMs:[...totals].sort((a,b)=>b[1]-a[1]).slice(0,25)};
}
if(require.main===module&&process.argv.includes('--profile')){
 profile(Number(option('--profile','100')),option('--layout','dense')).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1;});
}else if(require.main===module){
 const rows=[];for(let trial=0;trial<3;trial++)for(const layout of ['stock','dense']){
  const order=trial%2?counts.slice().reverse():counts;
  for(const count of order){const row=run(count,[29,73,149][trial],layout);rows.push(row);process.stderr.write(layout+' '+count+' seed '+row.seed+': '+row.meanMs.toFixed(2)+' ms mean / '+row.p95Ms.toFixed(2)+' p95; '+row.alive.final+' alive, '+row.shots+' shots\n');}
 }
 console.log(JSON.stringify({method:'Production headless session, half-second warmup, then '+seconds+' simulated seconds sampled in 60 Hz batches (two 120 Hz substeps). Three seeds, ascending/reversed count order, ordinary health/damage/AI; no timing assertions. Stock spawn stretches with fleet size; dense fixture keeps teams in a compact encounter volume. Mean/tails exclude the external invariant scan but include headless session observation/transcript work. Parent/child stage timings overlap; do not sum. CPU only: no renderer, GPU, DOM or real audio. All source meshes and baked hull data retained.',sources:Object.fromEntries(['experiments/training.js','experiments/ship-packs.js','experiments/flight-session.js'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),rows},null,2));
}
module.exports={fixture,run,profile};
