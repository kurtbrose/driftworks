'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const root=path.join(__dirname,'..');
const refIndex=process.argv.indexOf('--reference'),ref=refIndex<0?'HEAD':process.argv[refIndex+1];
if(!ref)throw new Error('--reference requires a commit');
const reference=cp.execFileSync('git',['rev-parse','--verify',ref+'^{commit}'],{cwd:root,encoding:'utf8'}).trim();
const modeIndex=process.argv.indexOf('--mode'),selectedMode=modeIndex<0?'all':process.argv[modeIndex+1];
const modes=selectedMode==='all'?['grid','tree','grid-events','tree-events']:[selectedMode];
function load(old){
 const legacy=old&&!cp.spawnSync('git',['cat-file','-e',reference+':experiments/training.js'],{cwd:root}).status;
 const DW={sim:{METERS_PER_UNIT:1}},context=vm.createContext({window:{Driftworks:DW}});
 if(legacy&&!cp.spawnSync('git',['cat-file','-e',reference+':experiments/flight-collision.js'],{cwd:root}).status)vm.runInContext(cp.execFileSync('git',['show',reference+':experiments/flight-collision.js'],{cwd:root,encoding:'utf8'}),context);
 for(const file of (legacy?['experiments/retail-profiles.js','experiments/flight-model.js','experiments/retail-weapons.js','experiments/guns.js','experiments/flight-missions.js','experiments/mission-ohio.js','experiments/training.js','assets/ships/quaternius-ultimate-spaceships/meshes.js','experiments/ship-packs.js']:['experiments/retail-profiles.js','experiments/flight-model.js','experiments/retail-weapons.js','experiments/guns.js','experiments/flight-missions.js','experiments/mission-ohio.js','src/flight-collision.js','src/flight-combat.js','src/flight-sim.js','assets/ships/quaternius-ultimate-spaceships/meshes.js','experiments/ship-packs.js'])){
  const source=old&&['experiments/flight-collision.js','experiments/training.js','src/flight-collision.js','src/flight-combat.js','src/flight-sim.js','experiments/ship-packs.js'].includes(file)?cp.execFileSync('git',['show',reference+':'+file],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,file),'utf8');
  vm.runInContext(source,context,{filename:file});
 }if(legacy)DW.flightSim=DW.training;return DW;
}
const before=load(true),after=load(false);
function run(DW,count,mode){
 const player=DW.arcade.create(0);player.eye=[0,-5000,0];const combat=DW.flightSim.create('training');DW.flightSim.bindPlayer(combat,player);
 if(mode&&DW.flightSim.setCollisionMode)DW.flightSim.setCollisionMode(combat,mode);
 combat.enemies=Array.from({length:count},(_,i)=>{
  const pose=DW.arcade.create(0);pose.eye=i===0?[350,0,0]:[300+(i%8)*200,300+Math.floor(i/8)*300,0];
  const e=DW.flightSim.createCraft('target-'+i,pose,'enemy');e.hp=e.maxHp=1e9;e.shield=0;e.collision={kind:'model',modelId:'quaternius-ultimate-spaceships:Spitfire'};return e;
 });
 const bolts=Array.from({length:24},()=>({position:[0,0,0],direction:[1,0,0],age:0,weapon:{...DW.retailWeapons[0],headRadius:.9}}));
 let hits=0,checksum=0;const begin=performance.now();
 for(let frame=0;frame<120;frame++){
  combat.time=frame/120;
  combat.enemies.forEach((e,i)=>{if(i)e.pose.eye[2]=Math.sin(frame*.01+i)*3;});
  const trace=()=>bolts.forEach((bolt,i)=>{
   const y=i<4?0:(i-4)*150+100,start=[frame*6,y,0],end=[frame*6+6,y,0];
   const hit=DW.flightSim.trace(combat,start,end,bolt,'player',undefined,player,.25);
   if(hit){hits++;checksum+=hit[0]+hit[1]+hit[2];}
  });
  if(DW.flightSim.collisionBatch)DW.flightSim.collisionBatch(combat,trace);else trace();
 }
 return {ms:performance.now()-begin,hits,checksum,hp:combat.enemies.map(e=>e.hp),near:combat.enemies.map(e=>e.nearMissAt??null)};
}
const rows=[];
for(const count of [8,64,128])for(const mode of modes){
 run(before,count);run(after,count,mode);const pairs=[];
 for(let sample=0;sample<6;sample++){
  let a,b;if(sample%2){b=run(after,count,mode);a=run(before,count);}else{a=run(before,count);b=run(after,count,mode);}
  const {ms:am,...av}=a,{ms:bm,...bv}=b;assert.deepEqual(bv,av,'identical hits, health and near misses');pairs.push({beforeMs:am,afterMs:bm});
 }
 const median=values=>{values.sort((a,b)=>a-b);return (values[2]+values[3])/2;};
 const beforeMs=median(pairs.map(p=>p.beforeMs)),afterMs=median(pairs.map(p=>p.afterMs));
 rows.push({ships:count,mode,beforeMs,afterMs,reductionPercent:100*(1-afterMs/beforeMs),pairs,combatMatches:true});
}
console.log(JSON.stringify({reference,method:'CPU only. 24 persistent projectile probes x 120 steps; mixed near/distant paths, moving source-mesh fighters, damage and near misses. One warm-up each, six alternating AB/BA pairs per fleet size. This isolates trace cost; excludes rendering, AI, gun lifecycle and terrain.',rows},null,2));
