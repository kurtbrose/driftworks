const assert = require('node:assert/strict');
const DW = require('../tools/headless.cjs').loadRuntime(), U = DW.sim.METERS_PER_UNIT;
function probe(skill, motion, style='baseline') {
    const t=DW.flightSim.create(), player=DW.arcade.create(18);
    DW.flightSim.spawn(t,player,0);
    const e=t.enemies[0];t.enemies=[e];e.skill=skill;e.opponentStyle=style;
    // Freeze only flight integration and projectiles to isolate perception geometry.
    const move=DW.arcade.step, guns=DW.flightGuns.step;
    DW.arcade.step=()=>{};DW.flightGuns.step=()=>{};
    const errors=[];
    try {
        for(let i=0;i<960;i++) {
            const time=(i+1)/120, sample=motion(time);
            player.eye=[sample.x/U,18,0];player.velocity=[sample.v,0,0];
            e.pose.eye=[0,18,-400/U];e.hp=e.maxHp;e.mode='attack';e.until=100;
            DW.flightSim.step(t,player,1/120,0);
            const ideal=DW.flightSim.intercept(e.pose.eye,player.eye,[sample.v/U,0,0],DW.retailWeapons[0].speed/U);
            errors.push(Math.hypot(...e.gunGoal.map((x,j)=>(x-ideal.point[j])*U)));
        }
    } finally {DW.arcade.step=move;DW.flightGuns.step=guns;}
    return errors;
}
for(const style of ['baseline','fso-pursuit','fso-breaker']) {
    const still=probe(1,()=>({x:0,v:0}),style);
    assert(Math.max(...still)<1e-8,'Stationary aim converges without arbitrary wobble');
    const straight=probe(1,t=>({x:30*t,v:30}),style);
    assert(straight[0]>5);assert(straight.at(-1)<.01,'Constant velocity establishes accurate lead');
    const turning=probe(1,t=>({x:80*Math.sin(t*2),v:160*Math.cos(t*2)}),style);
    assert(turning.slice(480).reduce((a,b)=>a+b,0)/480>5,'Turning causes persistent prediction error');
}
const reversal=t=>({x:t<4?30*t:120-30*(t-4),v:t<4?30:-30});
const veteran=probe(1,reversal),ace=probe(2,reversal);
assert(veteran[490]>10,'Direction change invalidates acquired lead');
assert(ace[540]<veteran[540],'Ace reacquires sooner');
assert.deepEqual(probe(1,reversal),veteran,'Tracking is deterministic');
console.log('PASS observation-based opponent aiming: convergence, turning, reversal, skill and determinism');
