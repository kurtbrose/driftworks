'use strict';
const assert=require('node:assert/strict');
const {loadRuntime}=require('../tools/headless.cjs');
const {matrix,run,audit}=require('../tools/evaluate-flight-evasion.cjs');
const DW=loadRuntime(), rows=matrix(DW);
for(const start of ['headOn','crossing','tail']) {
    const get=policy=>rows.find(row=>row.start===start&&row.policy===policy);
    for(const policy of ['stationary','straight']) {
        const predictable=get(policy), evasive=get('jink');
        assert(predictable.damage>100,`${start}/${policy}: predictable flight must take substantial actual damage`);
        assert(predictable.outcome==='opponent-win',`${start}/${policy}: unarmed predictable pilot must be defeated`);
        assert(evasive.seconds>predictable.seconds+3,`${start}: evasive inputs should buy meaningful survival time`);
        assert(evasive.damage<predictable.damage*.5,`${start}: evasion reduces actual projectile damage`);
        assert(evasive.maxRange<800,`${start}: survival must not come from leaving weapon range`);
        assert(predictable.shots>0&&predictable.hits>0,'Real emitted projectiles must connect');
    }
}
assert.deepEqual(run(DW,{policy:'jink',start:'crossing'}),rows.find(row=>row.policy==='jink'&&row.start==='crossing'),'Same legal controls reproduce combat outcomes');
// Reproduce the stationary-target breakaway failure for both styles at every skill.
for(const style of ['fso-pursuit','fso-breaker'])for(const skill of [0,1,2]) {
    const result=run(DW,{style,skill,policy:'stationary',start:'tail'});
    assert(result.outcome==='opponent-win',`${style}/${skill}: open separation, reacquire and defeat the stationary pilot`);
    assert(result.shots>0&&result.hits>0&&result.damage>=180,'Use real projectile damage');
}
assert.deepEqual(audit([{policy:'circle',damage:0,style:'baseline'}]),[],
    'Continuous acceleration is valid evasion, not an audit failure');
// Audit defects are reported separately; do not make current loopholes required behavior.
const findings=audit(rows);
console.log('PASS flight incentives: predictable pilots take damage and die; legal jinks survive longer within range; deterministic real-physics outcomes');
if(findings.length)console.log('Flight design audit (unresolved, run evaluator --full --audit): '+JSON.stringify(findings));
