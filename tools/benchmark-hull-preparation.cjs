'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{performance}=require('node:perf_hooks');
const root=path.resolve(__dirname,'..'),refAt=process.argv.indexOf('--reference'),reference=cp.execFileSync('git',['rev-parse','--verify',(refAt<0?'HEAD':process.argv[refAt+1])+'^{commit}'],{cwd:root,encoding:'utf8'}).trim();
const runtime='experiments/ship-packs.js',runtimeFiles=['src/ship-catalog.js','src/ship-hulls.js','src/ship-assets.js','src/ship-render.js',runtime];
const splitReference=!cp.spawnSync('git',['cat-file','-e',reference+':src/ship-catalog.js'],{cwd:root}).status;
const oldRuntime=(splitReference?runtimeFiles:[runtime]).map(file=>cp.execFileSync('git',['show',reference+':'+file],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024})).join('\n');
const newRuntime=runtimeFiles.map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
const files=fs.readdirSync(path.join(root,'assets/ships')).map(name=>'assets/ships/'+name+'/meshes.js').filter(file=>fs.existsSync(path.join(root,file)));
const current=new Map(files.map(file=>[path.resolve(root,file),fs.readFileSync(path.join(root,file),'utf8')])),prior=new Map([...current].map(([file,source])=>[file,source.split('// BEGIN GENERATED HULL INDICES')[0]]));
function load(old){const DW={shipPacks:[]},context=vm.createContext({window:{Driftworks:DW}});for(const source of (old?prior:current).values())vm.runInContext(source,context);vm.runInContext(old?oldRuntime:newRuntime,context);return DW;}
const pose={eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
const hitData=h=>h&&{fraction:h.fraction,point:h.point,local:h.local,normal:h.normal};
function cold(old){
 const DW=load(old),hits=[],timings=[];
 for(const pack of DW.shipPacks)for(const model of pack.models){
  const baked=model.hullIndex||loadRadius(model),r=baked.radius,start=[0,0,r+2],end=[0,0,-r-2],begin=performance.now();
  const hit=DW.shipPackModels.hullHit(model,pose,start,end,1,.12);timings.push({id:model.id,ms:performance.now()-begin});hits.push(hitData(hit));
 }return {ms:timings.reduce((s,r)=>s+r.ms,0),timings,hits:JSON.stringify(hits)};
}
function loadRadius(model){let radius=0;for(let i=0;i<model.vertices.length;i+=6)radius=Math.max(radius,Math.hypot(model.vertices[i],model.vertices[i+1],model.vertices[i+2]));return {radius};}
function parse(old){const begin=performance.now();load(old);return performance.now()-begin;}
function scorch(old){
 const DW=load(old),jobs=[];
 for(const pack of DW.shipPacks)for(const model of pack.models){
  const r=(model.hullIndex||loadRadius(model)).radius,hit=DW.shipPackModels.hullHit(model,pose,[0,0,r+2],[0,0,-r-2],1,.12);
  if(hit)jobs.push({craft:{},hit});
 }
 for(const job of jobs)DW.shipPackModels.addScorch(job.craft,job.hit);
 const begin=performance.now();for(let n=0;n<8;n++)for(const job of jobs)DW.shipPackModels.addScorch(job.craft,job.hit);
 return {ms:performance.now()-begin,marks:jobs.length*8,digest:crypto.createHash('sha256').update(JSON.stringify(jobs.map(j=>j.craft))).digest('hex')};
}
const {createFlight}=require('./headless.cjs'),read=fs.readFileSync;
function session(old){
 fs.readFileSync=function(file,...args){const key=path.resolve(String(file));if(key===path.resolve(root,runtime))return old?oldRuntime:newRuntime;const source=(old?prior:current).get(key);return source===undefined?read.call(this,file,...args):source;};
 let f;try{f=createFlight({mission:'furball',seed:29});}finally{fs.readFileSync=read;}
 f.advance(.5,{stop:true,fire:true});const begin=performance.now();f.advance(4,{stop:true,fire:true});const ms=performance.now()-begin;
 return {ms,digest:crypto.createHash('sha256').update(JSON.stringify({view:f.snapshot(),events:f.events,transcript:f.transcript})).digest('hex')};
}
const methods={load:parse,coldHull:cold,warmScorch:scorch,session},rows={};
for(const [name,run] of Object.entries(methods)){
 run(true);run(false);const pairs=[];
 for(let i=0;i<6;i++){
  let a,b;if(i%2){b=run(false);a=run(true);}else{a=run(true);b=run(false);}
  if(name==='coldHull')assert.equal(a.hits,b.hits,'exact cold swept contacts');
  if(name==='warmScorch'||name==='session')assert.equal(a.digest,b.digest,'exact '+name+' output');
  pairs.push({beforeMs:typeof a==='number'?a:a.ms,afterMs:typeof b==='number'?b:b.ms,...name==='coldHull'?{beforeModels:a.timings,afterModels:b.timings}:{},...name==='warmScorch'?{marks:a.marks}:{}});
 }
 const median=values=>{values.sort((a,b)=>a-b);return (values[2]+values[3])/2;},beforeMs=median(pairs.map(p=>p.beforeMs)),afterMs=median(pairs.map(p=>p.afterMs));rows[name]={beforeMs,afterMs,reductionPercent:100*(1-afterMs/beforeMs),pairs};
}
console.log(JSON.stringify({reference,method:'Six alternating AB/BA pairs after one warm-up each. Load: repeated warmed-code-cache script evaluation plus runtime registration of all three packs; no network/disk timing. Cold hull: first origin-through sweep of each model, evaluation excluded. Warm scorch: eight marks per intersected model, tree warm, exact mark-output SHA-256. Session: actual headless 16-fighter furball seed 29, .5 simulated seconds warmup then four measured seconds, exact full state/events/dialogue SHA-256; asset evaluation excluded. CPU only, no GPU/audio/DOM.',sourceHash:crypto.createHash('sha256').update(newRuntime).digest('hex'),assetBytes:{before:[...prior.values()].reduce((n,s)=>n+Buffer.byteLength(s),0),after:[...current.values()].reduce((n,s)=>n+Buffer.byteLength(s),0)},rows},null,2));
