'use strict';
const {createFlight}=require('./headless.cjs'),{performance}=require('node:perf_hooks'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const modes=['grid','tree','grid-events','tree-events'];
function run(mode){
 const flight=createFlight({mission:'furball',seed:29});flight.DW.training.setCollisionMode(flight.snapshot().combat,mode);
 flight.advance(.5,{stop:true,fire:true});const begin=performance.now();flight.advance(4,{stop:true,fire:true});const ms=performance.now()-begin;
 const state={view:flight.snapshot(),events:flight.events,transcript:flight.transcript};
 const digest=crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
 const combat=flight.snapshot().combat;
 return {ms,digest,stats:flight.DW.training.collisionStats(combat),shots:combat.player.guns.fired+combat.enemies.reduce((n,e)=>n+e.guns.fired,0)};
}
const median=rows=>{const v=rows.slice().sort((a,b)=>a-b);return (v[2]+v[3])/2;},rows=[];
run('legacy');for(const mode of modes)run(mode);
for(const mode of modes){
 const pairs=[];let stats,shots;
 for(let sample=0;sample<6;sample++){
  let a,b;if(sample%2){b=run(mode);a=run('legacy');}else{a=run('legacy');b=run(mode);}
  assert.equal(b.digest,a.digest,'exact session state, damage, events and dialogue');pairs.push({beforeMs:a.ms,afterMs:b.ms});stats=b.stats;shots=b.shots;
 }
 const beforeMs=median(pairs.map(p=>p.beforeMs)),afterMs=median(pairs.map(p=>p.afterMs));rows.push({mode,beforeMs,afterMs,reductionPercent:100*(1-afterMs/beforeMs),stats,shots,pairs,sessionMatches:true});
}
console.log(JSON.stringify({method:'Real headless 16-fighter furball, seed 29, .5 simulated seconds warmup then four measured seconds (480 substeps), fire and stop held. Six alternating AB/BA pairs against legacy collision path in the same runtime; exact full-session JSON SHA-256 comparison. Includes simulation, acquisition, scenery, comms and transcript generation; excludes graphics/audio. Counters include warmup.',sources:Object.fromEntries(['experiments/training.js','experiments/aegis-flight.js'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),rows},null,2));
