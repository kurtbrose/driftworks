const assert=require('node:assert/strict');
const M=require('./asteroid-detail-model.js');
const config={path:'bounce',height:20,amplitude:18,period:12,pitch:90};
assert.equal(M.sample(config,0,1250).height,2);
assert.equal(M.sample(config,6,1250).height,38);
assert.deepEqual(M.sample(config,0,1250),M.sample(config,12,1250));
for(const path of ['bounce','fly','approach'])for(let t=0;t<24;t+=.1){
  const p=M.sample({...config,path},t,1250);
  assert.ok(p.height>=.5&&Number.isFinite(p.height));
  assert.ok(Math.abs(Math.hypot(...p.direction)-1)<1e-10);
}
assert.equal(M.sample({...config,path:'approach'},6,1250).height.toFixed(2),'3750.00');
assert.equal(M.sample({...config,amplitude:100},0,1250).height,.5);
assert.equal(M.summary([]),null);
assert.deepEqual(M.summary([4,1,3,2]),{count:4,median:2,p95:4,p99:4,max:4});
console.log('PASS asteroid detail lab: repeatable paths, safe altitude, normalized directions and frame percentiles');
