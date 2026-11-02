'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createFlight}=require('../tools/headless.cjs');
const flight=createFlight({mission:'convoy',seed:29,convoyBattlefield:false}),DW=flight.DW,U=DW.sim.METERS_PER_UNIT;
vm.runInNewContext(fs.readFileSync('studies/convoy-guidance-model.js','utf8'),{window:{Driftworks:DW}});
const seed=flight.snapshot().combat.convoy.ships.map(s=>({id:s.id,position:s.position.map((v,k)=>v*U-(k===2?1200*U:0)),velocity:s.velocity.slice(),radius:61,crossRadius:11,halfSize:[9,61,7],packet:s.packet}));
const factory=DW.convoyGuidanceReview.create;
for(const scenario of ['cruise','turn','attack','traffic','combined']){
    const sim=factory(seed,scenario);sim.advance(60);const state=sim.snapshot();
    assert.equal(state.bodies.length,30);assert(state.bodies.every(b=>b.position.every(Number.isFinite)));
    assert(state.metrics.maxError>=0);assert(Number.isInteger(state.metrics.overlaps)&&state.metrics.overlaps>=0);assert.equal(state.escorts.length,6);
    if(scenario==='turn'||scenario==='combined')assert(state.events.some(e=>e.text.includes('90°')));
    if(scenario==='attack'||scenario==='combined')assert.equal(state.threats.length,3);
    if(scenario==='attack')assert(Math.hypot(...state.group.offset)>50,'Flank pressure produces a diversion');
    if(scenario==='traffic'||scenario==='combined'){assert.equal(state.departing.length,3);assert(state.bodies.some(b=>b.id.startsWith('join-')));assert.equal(new Set(state.bodies.map(b=>b.id)).size,30);}
    const replay=factory(seed,scenario);for(let i=0;i<60;i++)replay.advance(1);
    assert.deepEqual(JSON.parse(JSON.stringify(replay.snapshot().bodies)),JSON.parse(JSON.stringify(state.bodies)),'Seeking and normal playback reach identical physical positions');
    assert.deepEqual(JSON.parse(JSON.stringify(replay.snapshot().history)),JSON.parse(JSON.stringify(state.history)),'Trail sampling is independent of playback chunking');
}
const manual=factory(seed,'cruise');manual.leave(3);manual.join(3);manual.advance(1);assert.equal(manual.snapshot().departing.length,3);assert.equal(manual.snapshot().bodies.length,30);
for(let i=0;i<20;i++)manual.leave(3);manual.advance(1);assert.equal(manual.snapshot().bodies.length,1,'Manual release cannot accidentally empty the fleet with slice(-0)');assert(manual.snapshot().metrics.spans.every(Number.isFinite));
const quiet=factory(seed,'attack');quiet.advance(90);assert.equal(quiet.snapshot().threats.length,0);assert(quiet.snapshot().events.some(e=>e.text.includes('recovery')));
assert.equal(seed.length,30);assert(seed.every(b=>!b.role),'Review does not mutate the production seed');
console.log('PASS convoy review: five production-guidance scenarios, timed/manual membership changes, threat relief, finite state and deterministic replay/trails');
