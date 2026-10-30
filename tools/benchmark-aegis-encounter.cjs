'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{performance}=require('node:perf_hooks');
const root=path.join(__dirname,'..'),frames=360,cp=require('node:child_process');
const refIndex=process.argv.indexOf('--reference');
const contactsIndex=process.argv.indexOf('--contacts'),contactCount=contactsIndex<0?8:Number(process.argv[contactsIndex+1]),weaponsEnabled=!process.argv.includes('--no-fire');
if(!Number.isInteger(contactCount)||contactCount<1||contactCount>256)throw new Error('--contacts must be an integer from 1 to 256');
const reference=refIndex<0?null:cp.execFileSync('git',['rev-parse','--verify',process.argv[refIndex+1]+'^{commit}'],{cwd:root,encoding:'utf8'}).trim();
function load(ref){
 const legacy=ref&&!cp.spawnSync('git',['cat-file','-e',ref+':experiments/training.js'],{cwd:root}).status;
 const DW={sim:{METERS_PER_UNIT:10000/600}},ctx=vm.createContext({window:{Driftworks:DW},Float32Array,Map,Math});
 for(const f of (legacy?['experiments/retail-profiles.js','experiments/flight-model.js','experiments/retail-weapons.js','experiments/guns.js','experiments/flight-missions.js','experiments/mission-ohio.js','experiments/flight-collision.js','experiments/training.js','assets/ships/aegis-kit/flight-rig.js','src/aegis-sim.js', 'src/aegis-visual.js', 'src/aegis-battle.js', 'experiments/aegis-flight.js','assets/ships/quaternius-ultimate-spaceships/meshes.js','assets/ships/concept-trio/meshes.js','src/ship-catalog.js', 'src/ship-hulls.js', 'src/ship-assets.js', 'src/ship-render.js', 'experiments/ship-packs.js']:['experiments/retail-profiles.js','experiments/flight-model.js','experiments/retail-weapons.js','experiments/guns.js','experiments/flight-missions.js','experiments/mission-ohio.js','src/flight-collision.js', 'src/flight-combat.js', 'src/flight-mission-runtime.js', 'src/flight-opponent.js', 'src/flight-blockout.js', 'src/flight-sim.js', 'assets/ships/aegis-kit/flight-rig.js','src/aegis-sim.js', 'src/aegis-visual.js', 'src/aegis-battle.js', 'experiments/aegis-flight.js','assets/ships/quaternius-ultimate-spaceships/meshes.js','assets/ships/concept-trio/meshes.js','src/ship-catalog.js', 'src/ship-hulls.js', 'src/ship-assets.js', 'src/ship-render.js', 'experiments/ship-packs.js'])){
  const fromReference=ref&&(['experiments/flight-collision.js','experiments/training.js','src/flight-collision.js', 'src/flight-combat.js', 'src/flight-sim.js', 'experiments/aegis-flight.js','experiments/ship-packs.js'].includes(f)||/^src\/(ship-|aegis-|flight-)/.test(f))&&!cp.spawnSync('git',['cat-file','-e',ref+':'+f],{cwd:root}).status;
  const source=fromReference?cp.execFileSync('git',['show',ref+':'+f],{cwd:root,encoding:'utf8'}):fs.readFileSync(path.join(root,f),'utf8');
  vm.runInContext(source,ctx,{filename:f});
 }
 if(legacy)DW.flightSim=DW.training;
 return DW;
}
const current=load(),prior=reference?load(reference):null;
function run(ship,DW=current){
 const U=DW.sim.METERS_PER_UNIT;
 const state=DW.arcade.create(0);state.eye=[0,-72,1212];
 const combat=DW.flightSim.create('training');combat.enabled=weaponsEnabled;DW.flightSim.bindPlayer(combat,state);
 combat.enemies=Array.from({length:contactCount},(_,i)=>{const p=DW.arcade.create(0);p.velocity=[0,i%2?170:-170,0];const e=DW.flightSim.createCraft('bench-'+i,p,'enemy');e.hp=e.maxHp=1e9;e.shield=0;e.collision={kind:'model',modelId:'quaternius-ultimate-spaceships:Spitfire'};return e;});
 const rig=DW.aegisFlight.create(),view={state,combat,guns:DW.flightGuns.create(),world:{}},samples=[];
 for(let f=0;f<frames;f++){
  const begin=performance.now();combat.time=(f+1)/60;
  combat.enemies.forEach((e,i)=>{e.pose.eye=[(-850+(i%8)*90)/U,(-300+(i%2?1:-1)*170*combat.time)/U,1200+(i%8<4?220:-220)/U];});
  if(ship){rig.step(1/60,view);rig.geometry();}
  samples.push(performance.now()-begin);
 }
 return {ms:samples.reduce((a,b)=>a+b,0)/frames,p95:samples.slice().sort((a,b)=>a-b)[Math.floor(frames*.95)],shots:rig.telemetry().shots,hits:rig.telemetry().hits,hp:combat.enemies.map(e=>e.hp)};
}
run(false);run(true);if(prior)run(true,prior);
const off=[],on=[],referenceRuns=[];
for(let i=0;i<6;i++){off.push(run(false));if(prior&&i%2===0)referenceRuns.push(run(true,prior));on.push(run(true));if(prior&&i%2===1)referenceRuns.push(run(true,prior));}
function median(rows){const values=rows.map(r=>r.ms).sort((a,b)=>a-b),middle=Math.floor(values.length/2);return values.length%2?values[middle]:(values[middle-1]+values[middle])/2;}
const result={description:'Fixed 6-second scripted fighter replay, identical poses; real mesh collision and damage. CPU only; excludes renderer and ordinary fighter AI.',contactCount,weaponsEnabled,frames,baselineMs:median(off),withShipMs:median(on),addedMs:median(on)-median(off),off,on};
if(prior){
 const assert=require('node:assert/strict');
 for(let i=0;i<on.length;i++)assert.deepEqual({shots:on[i].shots,hits:on[i].hits,hp:on[i].hp},{shots:referenceRuns[i].shots,hits:referenceRuns[i].hits,hp:referenceRuns[i].hp},'reference and optimized combat must match exactly');
 result.reference=reference;result.referenceMs=median(referenceRuns);result.referenceRuns=referenceRuns;result.combatMatches=true;
}
const compare=process.argv.indexOf('--compare');
if(compare>=0){const previous=JSON.parse(fs.readFileSync(process.argv[compare+1],'utf8').replace(/^\uFEFF/,''));const assert=require('node:assert/strict');for(let i=0;i<on.length;i++){const prior=previous.on[i%previous.on.length];assert.deepEqual({shots:on[i].shots,hits:on[i].hits,hp:on[i].hp},{shots:prior.shots,hits:prior.hits,hp:prior.hp},'replay damage and firing must be identical');}result.combatMatches=true;}
console.log(JSON.stringify(result,null,2));
