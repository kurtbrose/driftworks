'use strict';
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),cp=require('node:child_process');
const DW=require('./headless.cjs').loadRuntime();
const args=process.argv.slice(2),current='experiments/hyperbolic-flight-model.js';
const sources=args[0]==='--compare'?[{source:args[1]+':'+current,code:cp.execFileSync('git',['show',args[1]+':'+current],{encoding:'utf8'})},{source:current,code:fs.readFileSync(current,'utf8')}]:
 (args.length?args:[current]).map(source=>({source,code:fs.readFileSync(source,'utf8')}));
const apis=sources.map(({source,code})=>{vm.runInNewContext(code,{window:{Driftworks:DW}});return {source,api:DW.hyperbolicFlight};});
const percentile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length*p)];
const results=[];
for(const radius of [350,650])for(const mode of ['combat','escape'])for(const entry of apis.length===2?[apis[0],apis[1],apis[1],apis[0]]:apis){
 const w=entry.api.create(radius),input=mode==='combat'?{auto:true}:{auto:false,fire:true,boost:true};
 for(let i=0;i<360;i++)entry.api.step(w,1/120,input);
 const times=[];let maxBolts=0;
 for(let frame=0;frame<900;frame++){
  const start=performance.now();entry.api.step(w,1/120,input);entry.api.step(w,1/120,input);times.push(performance.now()-start);maxBolts=Math.max(maxBolts,w.bolts.length);
 }
 results.push({source:entry.source,radius,mode,medianMs:percentile(times,.5),p95Ms:percentile(times,.95),maxMs:Math.max(...times),maxBolts,shots:w.shots,hits:w.hits,score:w.score,hash:crypto.createHash('sha256').update(JSON.stringify(w)).digest('hex').slice(0,16)});
}
console.log(JSON.stringify({node:process.version,warmupSeconds:3,sampleSeconds:15,frameTicks:2,results},null,2));
