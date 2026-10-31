'use strict';
const assert=require('node:assert/strict');
const {createFlight}=require('../tools/headless.cjs');
const f=createFlight({mission:'convoy',seed:29});
let {combat:c,state:player,world}=f.snapshot();
const U=f.DW.sim.METERS_PER_UNIT;
assert.equal(f.DW.convoyMission.WING_SIZE,3);
assert.equal(c.enemies.length,2);
assert(c.convoy.speedMps<c.player.profile.maxVelocity[2]/2,'Freighters are substantially slower than fighters');
assert(c.enemies.every(e=>e.team==='ally'));
assert.equal(world.asteroids.length,0);
assert.equal(world.ships.length,0);
assert.equal(c.convoy.ships.length,30);
assert.equal(new Set(c.convoy.ships.map(s=>s.id)).size,30);
const ids=c.convoy.ships.map(s=>s.id).join(','),slots=JSON.stringify(c.convoy.ships.map(s=>s.slot));
require('node:vm').runInNewContext(require('node:fs').readFileSync('experiments/convoy-scenery.js','utf8'),{window:{Driftworks:f.DW},Float32Array});
const fs=require('node:fs'),meta=JSON.parse(fs.readFileSync('assets/ships/industrial-kit/convoy-flight.json','utf8')),bytes=fs.readFileSync('assets/ships/industrial-kit/convoy-flight.bin');
const data=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
for(const variant of Object.values(meta.variants)){
    assert(variant.batches.reduce((n,b)=>n+b.count/24,0)>50000,'Use detailed authored DW-14 ships');
    assert.equal(variant.batches.filter(b=>b.textured).length,1,'Retain the authored paint atlas material');
    for(const b of variant.batches)for(let i=b.offset/4;i<b.offset/4+b.count;i+=24){
        const a=[0,1,2].map(k=>data[i+8+k]-data[i+k]),c=[0,1,2].map(k=>data[i+16+k]-data[i+k]);
        const n=[a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]];
        assert(n.reduce((sum,v,k)=>sum+v*data[i+3+k],0)>=-1e-9,'Axis conversion preserves outward winding');
    }
}
f.DW.convoyScenery.install(meta,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const batches=f.DW.convoyScenery.geometry(c),buffers=batches.map(b=>b.vertices);
assert.equal(batches.length,26,'Instance the 30 authored ships without losing any materials');
assert(batches.every(b=>b.instanceOffsets.length===30),'Ten copies of each authored configuration');
assert.equal(new Set(buffers).size,26,'Repeated ships share the 26 immutable material buffers');
assert.equal(new Set(c.convoy.ships.map(s=>s.slot[2])).size,2,'Two vertical tiers');
assert.equal(new Set(c.convoy.ships.map(s=>s.slot[0])).size,3,'Three lanes');
assert.equal(new Set(c.convoy.ships.map(s=>s.slot[1])).size,5,'Five rows');
const extent=k=>Math.max(...c.convoy.ships.map(s=>s.slot[k]))-Math.min(...c.convoy.ships.map(s=>s.slot[k]));
assert(extent(0)*U<100&&extent(2)*U<40&&extent(1)*U<450,'Compact 3D formation');
const initialVertices=Array.from(buffers[0]);

const separation=e=>Math.hypot(...e.pose.eye.map((v,i)=>(v-player.eye[i])*U));
f.advance(60);
assert(Math.abs(c.convoy.elapsed-60)<1e-6);
const moved=f.DW.convoyScenery.geometry(c);
assert(moved.every((b,i)=>b.vertices===buffers[i]),'Moving fleet reuses immutable GPU geometry');
assert.deepEqual(Array.from(buffers[0]),initialVertices);
assert(Math.abs(moved[0].origin[1]*U-1500)<1e-5,'GPU origin follows the simulation route');
for(const s of c.convoy.ships){
    assert(Math.abs((s.position[1]-s.slot[1])*U-1500)<1e-5);
    assert.equal(s.hull,s.maxHull);
    assert(!s.arrived);
}
assert(c.enemies.every(e=>separation(e)<180),'Both wingmen keep up at convoy speed');
// Turns, boost, and a stopped player exercise actual wing flight, not rigid placement.
f.advance(2,{yaw:.3,boost:true});
f.advance(8,{yaw:0,boost:false});
f.advance(25,{stop:true});
assert(c.enemies.every(e=>separation(e)<500),'Wingmen recover after a boost and turn');
f.advance(204.9,{stop:true});
assert(!c.convoy.complete,'Cannot arrive early');
f.advance(.1,{stop:true});
assert(c.convoy.complete);
assert(c.convoy.ships.every(s=>s.arrived&&s.velocity.every(v=>v===0)));
assert.equal(c.wave,1,'Quiet missions never spawn training waves');
assert.equal(c.enemies.length,2);
assert.equal(JSON.stringify(c.convoy.ships.map(s=>s.slot)),slots);
const positions=JSON.stringify(c.convoy.ships.map(s=>s.position));
f.advance(10,{fire:true,stop:true});
assert.equal(JSON.stringify(c.convoy.ships.map(s=>s.position)),positions,'Arrival preserves formation');
assert.equal(c.player.guns.bolts.length,0,'Quiet escort weapons are disabled');
f.reset();c=f.snapshot().combat;
assert.equal(c.convoy.elapsed,0);
assert(!c.convoy.complete);
assert.equal(c.convoy.ships.map(s=>s.id).join(','),ids);
assert(c.convoy.ships.every(s=>!s.arrived&&s.hull===s.maxHull));
console.log('PASS convoy: 30 stable freighters, three-fighter wing, real follow flight, 7.5 km route, arrival, no waves, reset');
