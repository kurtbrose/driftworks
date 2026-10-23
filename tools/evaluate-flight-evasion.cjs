'use strict';
// Legal pilot inputs against the real opponent, flight integrator and swept hulls.
const {loadRuntime}=require('./headless.cjs');
const DT=1/120;
function controls(policy,time,seed=1) {
    const input={pitch:0,yaw:0,roll:0,side:0,vertical:0,throttle:.8,boost:false,fire:false};
    if(policy==='stationary')input.throttle=0;
    else if(policy==='circle')input.yaw=.45;
    else if(policy==='jink') {
        // Open-loop evasive inputs, with no opponent intentions or shot telemetry.
        const segment=Math.floor(time/.85), phase=(segment+seed)*2.399963229728653;
        input.pitch=Math.sin(phase)*.85;input.yaw=Math.cos(phase*1.37)*.85;
    } else if(policy!=='straight')throw new Error('Unknown flight policy');
    return input;
}
function run(DW,{policy,start='headOn',skill=1,style='baseline',seed=1,duration=20,unshielded=true}={}) {
    const duel=DW.flightDuel.create({start,skill,seed,duration,opponentStyle:style,unshielded,allyHull:'blockout',enemyHull:'blockout'});
    const stream=Array.from({length:Math.ceil(duration/DT)},(_,tick)=>controls(policy,tick*DT,seed));
    let firstDamage=null,damage=0;
    while(!duel.summary().done) {
        const before=duel.combat.hull+duel.combat.shield;
        duel.advance(DT,stream);
        const lost=Math.max(0,before-duel.combat.hull-duel.combat.shield);
        damage+=lost;if(lost>0&&firstDamage===null)firstDamage=duel.summary().seconds;
    }
    const result=duel.summary();
    return {policy,start,skill,style,seed,unshielded,seconds:result.seconds,outcome:result.outcome,
        damage,firstDamage,hits:result.metrics.opponentDamageSteps,shots:result.opponentShots,
        meanRange:result.metrics.rangeIntegral/result.seconds,minRange:result.metrics.minRange,maxRange:result.metrics.maxRange};
}
function matrix(DW,{starts=['headOn','crossing','tail'],skills=[1],styles=['baseline'],seeds=[1],duration=20}={}) {
    const rows=[];
    for(const style of styles)for(const skill of skills)for(const start of starts)for(const seed of seeds)
        for(const policy of ['stationary','straight','circle','jink'])rows.push(run(DW,{policy,start,skill,style,seed,duration}));
    return rows;
}
function audit(rows) {
    const findings=[];
    for(const row of rows)if(row.policy==='stationary'&&row.damage===0)
        findings.push({issue:'stationary-unpunished',style:row.style,skill:row.skill,start:row.start,seed:row.seed});
    return findings;
}
function report(rows) {
    const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),sources={};
    for(const file of ['tools/evaluate-flight-evasion.cjs','tools/headless.cjs','experiments/training.js','experiments/flight-model.js','experiments/guns.js','experiments/flight-duel.js','experiments/ship-packs.js','assets/ships/quaternius-ultimate-spaceships/meshes.js','experiments/retail-profiles.js','experiments/retail-weapons.js'])
        sources[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/\r\n/g,'\n')).digest('hex');
    return {schema:1,duration:20,sources,note:'Unarmed legal inputs; identical initial state per matched case; unshielded Ulysses/Subach, blockout triangle hulls; seeds vary jink phase only; death censors duration/damage; not human calibration. Findings are unmet design goals, not expected passes.',findings:audit(rows),rows};
}
if(require.main===module) {
    const full=process.argv.includes('--full');
    const result=report(matrix(loadRuntime(),full?{skills:[0,1,2],styles:['baseline','fso-pursuit','fso-breaker'],seeds:[1,7]}:{}));
    console.log(JSON.stringify(result,null,2));
    if(process.argv.includes('--audit')&&result.findings.length)process.exitCode=1;
}
module.exports={controls,run,matrix,audit,report};
