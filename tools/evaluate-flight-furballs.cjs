// Headless team combat using the live furball controller, weapons and defenses.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2);
function value(flag,fallback){const i=args.indexOf(flag);return i<0?fallback:args[i+1];}
const seconds=Number(value('--seconds','120')),seeds=Number(value('--seeds','5')),style=value('--style','baseline');
if(!Number.isFinite(seconds)||seconds<=0||!Number.isSafeInteger(seeds)||seeds<1||!['baseline','aggressor','interceptor','passer','fso-pursuit','fso-breaker'].includes(style))throw Error('Invalid seconds, seeds or style');
global.window=global;global.DRIFTWORKS_TEST_MODE=true;
const sources={};
for(const file of ['src/propulsion.js','src/combat.js','src/logistics.js','src/formations.js','src/sim.js','experiments/retail-profiles.js','experiments/retail-weapons.js','experiments/guns.js','experiments/flight-missions.js','experiments/mission-ohio.js','experiments/training.js','experiments/flight-model.js','assets/ships/quaternius-ultimate-spaceships/meshes.js','assets/ships/concept-trio/meshes.js','experiments/ship-packs.js']){
    const source=fs.readFileSync(path.join(root,file),'utf8');sources[file]=crypto.createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex');vm.runInThisContext(source,{filename:file});
}
const DW=global.Driftworks,U=DW.sim.METERS_PER_UNIT,dt=1/120;
const createTelemetry=require('./flight-furball-telemetry.cjs');
const holdTargets=require('./flight-furball-target-lock.cjs'),pairedLock=args.includes('--target-lock');
let telemetry=null;
const gunStep=DW.flightGuns.step;
DW.flightGuns.step=function(guns,pose,weapon,trigger,...rest){
    const snapshot=telemetry&&telemetry.before(guns,pose,weapon,trigger);
    const result=gunStep(guns,pose,weapon,trigger,...rest);
    if(telemetry)telemetry.after(guns,snapshot);
    return result;
};
function run(size,seed,unshielded,locked=false){
    const t=DW.training.create('furball'),observer=DW.arcade.create(0);
    observer.eye=[0,0,10000/U];
    DW.training.configure(t,DW.arcade.profiles[0],unshielded);
    DW.training.spawn(t,observer,0);
    t.enemies=t.enemies.filter((e,i)=>i<size||(i>=8&&i<8+size));
    // The camera/player is an inert observer, never an extra ally or target.
    t.player.hp=0;
    const rng=DW.sim.createRng(seed);
    t.enemies.forEach((e,i)=>{
        const j=i%size,side=i<size?-1:1;
        e.index=i;e.skill=1;e.pilot='Veteran';e.opponentStyle=style;
        DW.training.equip(e,DW.arcade.profiles[j%3===1?1:0],DW.training.defaultWeapon(DW.arcade.profiles[j%3===1?1:0]),unshielded);
        e.pose.eye=[side*(300+(j%2)*80)/U,((j-(size-1)/2)*100+(rng()-.5)*60)/U,(10000+((j%3)-1)*85+(rng()-.5)*40)/U];
        e.pose.back=[side,0,0];e.pose.right=[0,-side,0];e.pose.up=[0,0,1];e.pose.velocity=[-side*45,0,0];
        e.goal=[0,0,10000/U];e.decision=rng()*.42;
    });
    DW.training.configureHulls(t,'mixed','mixed');
    assert.equal(t.enemies.filter(e=>e.team==='ally').length,size);
    assert.equal(t.enemies.filter(e=>e.team==='enemy').length,size);
    assert(t.enemies.every(e=>e.collision.kind==='model'&&(unshielded?e.maxShield===0:e.maxShield>0)));
    let firstKill=null,lastKill=0,kills=0,longestQuiet=0;
    const initialStateHash=crypto.createHash('sha256').update(JSON.stringify(t)).digest('hex');
    telemetry=createTelemetry(DW,t,dt);
    for(let tick=0;tick<Math.ceil(seconds/dt)&&!t.roundOver;tick++){
        if(locked)holdTargets(t,seconds+1);
        DW.training.step(t,observer,dt,0);
        const dead=t.enemies.filter(e=>e.hp<=0).length;
        if(dead>kills){if(firstKill===null)firstKill=t.time;longestQuiet=Math.max(longestQuiet,t.time-lastKill);lastKill=t.time;kills=dead;}
    }
    longestQuiet=Math.max(longestQuiet,t.time-lastKill);
    const survivors=team=>t.enemies.filter(e=>e.team===team&&e.hp>0).length;
    const diagnostics=telemetry.summary();telemetry=null;
    assert.equal(diagnostics.shots,t.enemies.reduce((n,e)=>n+e.guns.fired,0),'All emitted bolts counted');
    assert.equal(diagnostics.hits,t.enemies.reduce((n,e)=>n+e.guns.hits,0),'All hits counted, including after shooter death');
    return {size,seed,unshielded,targetPolicy:locked?'until-death':'timer',initialStateHash,seconds:t.time,kills,firstKill,longestQuiet,finished:t.roundOver,allyAlive:survivors('ally'),enemyAlive:survivors('enemy'),shots:t.enemies.reduce((n,e)=>n+e.guns.fired,0),hullRemaining:t.enemies.reduce((n,e)=>n+Math.max(0,e.hp),0),diagnostics};
}
const rows=[];
for(const size of [2,3,4])for(let seed=1;seed<=seeds;seed++)for(const unshielded of [false,true])for(const locked of pairedLock?[false,true]:[false])rows.push(run(size,seed,unshielded,locked));
assert.deepEqual(run(2,1,false),rows[0],'Deterministic replay');
if(pairedLock)assert.deepEqual(run(2,1,false,true),rows[1],'Locked deterministic replay');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'tests/benchmarks/flight-furballs.json'),'utf8'));
if(style===baseline.style&&Object.keys(sources).every(file=>sources[file]===baseline.sources[file])){
    for(const row of rows.filter(r=>r.targetPolicy==='timer')){const previous=baseline.rows.find(r=>r.size===row.size&&r.seed===row.seed&&r.unshielded===row.unshielded&&Math.abs(r.seconds-row.seconds)<dt/2);if(previous)for(const key of Object.keys(previous))assert.deepEqual(row[key],previous[key],'Telemetry preserves '+key);}
}
const groups=[];
for(const size of [2,3,4])for(const unshielded of [false,true])for(const targetPolicy of pairedLock?['timer','until-death']:['timer']){
    const cases=rows.filter(r=>r.size===size&&r.unshielded===unshielded&&r.targetPolicy===targetPolicy),times=cases.map(r=>r.firstKill).filter(t=>t!==null).sort((a,b)=>a-b),sum=key=>cases.reduce((n,r)=>n+r.diagnostics[key],0);
    groups.push({size,unshielded,targetPolicy,runs:cases.length,zeroKills:cases.filter(r=>!r.kills).length,unfinished:cases.filter(r=>!r.finished).length,totalKills:cases.reduce((n,r)=>n+r.kills,0),meanKills:cases.reduce((n,r)=>n+r.kills,0)/cases.length,shots:sum('shots'),hits:sum('hits'),hitRate:sum('shots')?sum('hits')/sum('shots'):null,triggerFraction:sum('triggerSeconds')/sum('aliveSeconds'),meanOpportunityWindow:sum('opportunitySeconds')/sum('opportunityWindows'),switches:sum('switches'),medianFirstKillAmongKills:times.length?(times[Math.floor((times.length-1)/2)]+times[Math.floor(times.length/2)])/2:null});
}
const pairs=rows.filter(r=>r.targetPolicy==='until-death').map(locked=>{
    const normal=rows.find(r=>r.targetPolicy==='timer'&&r.size===locked.size&&r.seed===locked.seed&&r.unshielded===locked.unshielded);
    assert.equal(locked.initialStateHash,normal.initialStateHash,'Matched initial state');
    return {size:locked.size,seed:locked.seed,unshielded:locked.unshielded,killsDelta:locked.kills-normal.kills,hitsDelta:locked.diagnostics.hits-normal.diagnostics.hits,hitRateDelta:locked.diagnostics.hitRate-normal.diagnostics.hitRate,hullRemainingDelta:locked.hullRemaining-normal.hullRemaining};
});
const output=JSON.stringify({schema:3,seconds,seeds,style,dt,pairedLock,sources,diagnosticSources:Object.fromEntries(['tools/evaluate-flight-furballs.cjs','tools/flight-furball-telemetry.cjs','tools/flight-furball-target-lock.cjs'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n')).digest('hex')])),note:'Live furball AI on both teams; veteran, mirrored Hercules/Ulysses mix with native guns, mixed triangle hulls, open space. Seeds jitter starting positions and decision phase. No player, respawns or balance changes. First-kill median excludes censored zero-kill runs; unfinished means neither wing eliminated. Diagnostic times sum living craft-seconds. Gates are ordered first failures. Opportunity uses the actual controller goal before trigger duty; leadAligned uses an independent shared intercept within firing range. Hits count collided bolts; shots count emitted bolts, including bolts still in flight at the cutoff.',groups,pairs,rows},null,2)+'\n';
const outputPath=value('--output','');if(outputPath)fs.writeFileSync(outputPath,output);else process.stdout.write(output);
