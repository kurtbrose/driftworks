'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const scope=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'../experiments/star-glare.js'),'utf8'),scope);
const run=s=>vm.runInContext(s,scope);
assert.equal(run('glareVisibility([0,0,4.5],[0,0,-1],.035)'),0,'opaque rock hides entire star');
assert.equal(run('glareVisibility([3,0,4.5],[0,0,-1],.035)'),1,'unobstructed star');
const partial=run('glareVisibility([Math.sin(.245)*4.5,0,Math.cos(.245)*4.5],[0,0,-1],.035)');
assert.ok(partial>0&&partial<1,'limb preset exposes part of disk: '+partial);
assert.equal(run('glareExposure(1,.2,0)'),1,'zero time holds exposure');
assert.ok(run('glareExposure(1,.2,.1)>.2 && glareExposure(1,.2,.1)<1'),'bounded adaptation');
assert.ok(run('1-glareExposure(1,.2,.1)>glareExposure(1,1.8,.1)-1'),'bright adaptation faster than dark recovery');
assert.equal(run('glareHit([0,0,4.5],[0,0,1])'),-1,'behind camera cannot occlude star');
console.log('PASS star glare: total/partial/no occlusion, forward-ray geometry and bounded asymmetric adaptation');

const compact=run('novaBake(0)'),expanded=run('novaBake(1)');
assert.ok(Math.max(...compact.sh)<Infinity,'finite compact irradiance');
assert.ok(compact.pixels.some(v=>v>1),'HDR keeps values above display white');
assert.ok(run('novaProfile(1).radius>novaProfile(0).radius'),'source broadens');
assert.ok(expanded.pixels.filter(v=>v>0.1).length>compact.pixels.filter(v=>v>0.1).length,'bright region spreads across environment');
assert.ok([...expanded.sh].every(Number.isFinite),'finite broad irradiance');
const sharp=run('novaShadow([.38,.22,-Math.sqrt(1-.38*.38-.22*.22)],.035)');
const soft=run('novaShadow([.38,.22,-Math.sqrt(1-.38*.38-.22*.22)],1.085)');
assert.ok(sharp===0||sharp===1,'compact source gives hard shadow away from boundary');
assert.ok(soft>0&&soft<1,'expanded source gives partial shadow: '+soft);
assert.deepEqual(run('Array.from(novaBake(.5,32,16).sh)'),run('Array.from(novaBake(.5,32,16).sh)'),'repeatable baked coefficients');
console.log('PASS nova: unclipped HDR maps, finite reproducible SH, expanding radiance and penumbra');

for (const phase of [0,.5,1]) {
 scope.phase=phase;
 assert.equal(run('novaIrradiance(phase,-1,512)'),0,'back-facing receiver stays dark');
 assert.ok(run('novaIrradiance(phase,1,512)>0'),'front-facing receiver receives light');
}
assert.ok(compact.sh.every(v=>v===0),'dominant source excluded from low-order ambient SH');
assert.ok(compact.pixels.some(v=>v===0),'empty sky has zero radiance');
console.log('PASS nova light separation: zero rear illumination, no synthetic sky fill, emitter excluded from ambient SH');
