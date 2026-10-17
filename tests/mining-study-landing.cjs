const assert=require('node:assert/strict');
require('node:vm').runInThisContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'mining-study-landing.js'),'utf8'));
const L=global.Driftworks.miningStudyLanding,T=require('./mining-study-terrain.js');
const fit=T.fit({at:(x,y)=>({point:[x,y,0],normal:[0,0,1]})},[0,0]);
const p=t=>L.pose(fit,t),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
near(p(0).altitude,50);near(p(0).world([0,0,0])[2]-fit.origin[2],50*32/36);
for(let t=0;t<=38;t+=.1){const state=p(t);assert.ok(state.world([1,2,3]).every(Number.isFinite));assert.ok(state.deployment>=0&&state.deployment<=1);if(state.ramps>0)assert.ok(state.contact&&state.deployment===1);if(!state.contact)assert.equal(state.ramps,0);if(t<21)near(state.altitude,50);}
near(p(16).deployment,0);near(p(21).deployment,1);near(p(32).altitude,0);assert.ok(p(32).contact);near(p(38).ramps,1);
// Contact locations stay attached to the same rotating rock, without a touchdown snap.
for(const time of [32,33,38,60])for(const c of fit.contacts){const actual=p(time).world(c.point),expected=p(time).ground(fit.world(c.point));actual.forEach((v,k)=>near(v,expected[k]));}
const a=p(31.999).world([0,0,0]),b=p(32).world([0,0,0]);assert.ok(Math.hypot(...a.map((v,k)=>v-b[k]))<.001);
const calls=[],choice=L.choose({landing:site=>{calls.push(site);return site===8?fit:{valid:false};}},0);assert.equal(choice.site,8);assert.deepEqual(calls,[0,8]);
assert.equal(L.choose({landing:()=>null},48),null);
console.log('PASS mining landing: 50 m release, safe nearby search, phase order, legs before descent, contact before ramps, rotating anchor attachment and continuous touchdown');

// Batched transforms preserve positions/normals without evaluating a closure per vertex.
let worldCalls=0,rotationCalls=0;
const state=p(24),batch={vertices:new Float32Array([1,2,3,0,0,1,-4,5,6,1,0,0])};
const transformed=T.transform(batch,{world:v=>{worldCalls++;return state.world(v);},rotate:v=>{rotationCalls++;return state.rotate(v);}});
assert.equal(worldCalls,4);assert.equal(rotationCalls,3);
for(let i=0;i<batch.vertices.length;i+=6){const expected=state.world(Array.from(batch.vertices.slice(i,i+3))).concat(state.rotate(Array.from(batch.vertices.slice(i+3,i+6))));expected.forEach((v,k)=>assert.ok(Math.abs(transformed.vertices[i+k]-v)<.00001));}
assert.equal(batch.vertices[0],1,'Source geometry remains reusable');
console.log('PASS landing transforms: affine batching preserves all positions and normals with constant per-batch transform evaluations');
