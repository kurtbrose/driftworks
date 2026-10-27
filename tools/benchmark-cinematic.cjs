'use strict';
const fs=require('node:fs'),vm=require('node:vm'),{performance}=require('node:perf_hooks');
const {createFlight}=require('./headless.cjs');
function sample(cached){
 const flight=createFlight({mission:'cinematic'}),DW=flight.DW,context=vm.createContext({window:{Driftworks:DW},Float32Array,Map,Math});
 for(const file of ['assets/ships/aegis-kit/flight-rig.js','experiments/aegis-flight.js']){
  let source=fs.readFileSync(file,'utf8');if(!cached)source=source.replace('m.routeWait+=.12','m.routeWait=0');vm.runInContext(source,context,{filename:file});
 }
 const rig=DW.aegisFlight.createBattle({bridge:true}),view=flight.snapshot();rig.reset();view.state.eye=[0,-600,300];view.combat.hangarSupport=false;
 const samples=[];for(let i=0;i<240;i++){const start=performance.now();rig.step(1/60,view);rig.geometry();if(i>=60)samples.push(performance.now()-start);}
 samples.sort((a,b)=>a-b);return {cached,medianMs:samples[89],p95Ms:samples[170],shots:rig.telemetry().shots};
}
console.log(JSON.stringify({note:'Capital simulation + geometry preparation only, 2 armed rigs, no fighters; 60 warm-up and 180 samples per ABBA block. No rendering or GPU timing.',blocks:[sample(false),sample(true),sample(true),sample(false)]},null,2));
