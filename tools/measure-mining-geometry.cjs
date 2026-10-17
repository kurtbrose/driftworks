'use strict';
// Development-only measurement; counts are deterministic, timings are indicative.
// Usage: node tools/measure-mining-geometry.cjs [output.json] [baseline-ref]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const {performance}=require('node:perf_hooks');
const root=path.join(__dirname,'..'),baselineRef=process.argv[3]||'HEAD';
const cases={full:[1,0,false,0,''],legs:[1,0,false,0,'',true],infill:[1,0,false,0,'',false,true],ramps:[1,0,false,.5,'',false,false,undefined,undefined,true]};
function load(source){
  // Each script captures its own namespace, sharing the native JS realm as in the app.
  const scope={Driftworks:{}};global.window=scope;
  for(const name of ['mining-lights','mesh-builder'])vm.runInThisContext(fs.readFileSync(path.join(root,'src',name+'.js'),'utf8'));
  vm.runInThisContext(source);
  scope.Driftworks.miningRig.geometry(1,0,false,0,''); // warm cabin and fixtures
  return scope.Driftworks;
}
function counts(DW,args){
  const create=DW.meshBuilder.create;let emittedNumbers=0,primitiveCalls=0;
  DW.meshBuilder.create=groups=>Object.fromEntries(Object.entries(create(groups)).map(([key,fn])=>[key,(...values)=>{
    const before=Object.values(groups).reduce((sum,v)=>sum+v.length,0);
    fn(...values);primitiveCalls++;
    emittedNumbers+=Object.values(groups).reduce((sum,v)=>sum+v.length,0)-before;
  }]));
  let groups;
  try{groups=DW.miningRig.geometry(...args);}finally{DW.meshBuilder.create=create;}
  return {primitiveCalls,emittedNumbers,returnedNumbers:Object.values(groups).reduce((sum,v)=>sum+v.length,0)};
}
const baseline=cp.execFileSync('git',['show',baselineRef+':src/mining-rig.js'],{cwd:root,encoding:'utf8'});
const versions={before:load(baseline),after:load(fs.readFileSync(path.join(root,'src/mining-rig.js'),'utf8'))};
const results={before:{},after:{}};
for(const [name,args] of Object.entries(cases)){
  const samples={before:[],after:[]};
  for(const [key,DW] of Object.entries(versions)){
    results[key][name]=counts(DW,args);
    for(let i=0;i<100;i++)DW.miningRig.geometry(...args);
  }
  for(let repeat=0;repeat<6;repeat++)for(const key of repeat%2?['after','before']:['before','after']){
    const start=performance.now();for(let i=0;i<20;i++)versions[key].miningRig.geometry(...args);
    samples[key].push((performance.now()-start)/20);
  }
  for(const key of ['before','after']){
    samples[key].sort((a,b)=>a-b);
    results[key][name].medianMsPerBuild=Number(((samples[key][2]+samples[key][3])/2).toFixed(3));
  }
}
const report={baselineCommit:cp.execFileSync('git',['rev-parse',baselineRef],{cwd:root,encoding:'utf8'}).trim(),node:process.version,notes:'Native JS realm; 100 warm-up builds per case/version, then 6 alternating samples of 20 builds. Timings are machine-specific. Emission counts exclude cached component copies.',...results};
const json=JSON.stringify(report,null,2)+'\n';
if(process.argv[2])fs.writeFileSync(path.resolve(root,process.argv[2]),json);
process.stdout.write(json);
