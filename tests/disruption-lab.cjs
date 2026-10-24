'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../experiments/disruption-lab.html'),'utf8');
const source=html.slice(html.indexOf('// Sequence timing.'),html.indexOf('// Preview harness.'));
const context=vm.createContext({});vm.runInContext(source,context);
const sample=(age,severity=.7,reduced=false)=>vm.runInContext('sampleDisruption('+age+','+severity+','+reduced+')',context);
assert.equal(sample(25).alpha,1);
assert.equal(sample(50).alpha,0,'contact chatter switches off sharply');
assert.equal(sample(850).alpha,0,'hard outage before reboot');
assert.equal(sample(1800).label,'BOOT / SELF TEST');
assert.equal(sample(1800).reveal,0,'self test precedes telemetry');
assert.ok(sample(3500).reveal>0&&sample(3500).reveal<1,'gradual recovery');
assert.equal(sample(6000).done,true);
assert.equal(sample(25,.7,true).alpha,.55,'reduced flicker avoids rapid on/off');
assert.equal(sample(4500,.15).done,true);
assert.equal(sample(4500,1).done,false,'severity changes recovery duration');
assert.match(html,/<iframe[^>]*src="flight.html"/,'preview uses actual flight renderer');
console.log('Disruption timing: chatter, outage, reboot, recovery, severity and reduced flicker passed.');

const glitch=(age,kind='tear',reduced=false)=>vm.runInContext('sampleGlitch('+age+',.7,'+reduced+','+JSON.stringify(kind)+')',context);
assert.ok(glitch(50).shift>0);
assert.equal(glitch(190).shift,0,'clean gap within tear burst');
assert.ok(glitch(300).shift<0,'strip changes direction on next contact');
assert.equal(glitch(2400).done,true);
assert.ok(glitch(400,'echo').alpha>glitch(1700,'echo').alpha,'echo settles instead of flickering');
assert.equal(glitch(400,'tear',true).shift,0,'reduced motion avoids displacement');
console.log('Horizontal tear burst windows, quiet gaps, echo recovery and reduced motion passed.');

for(let age=0;age<=2700;age+=5){
  const slip=vm.runInContext('sampleRegistration('+age+',false)',context);
  assert.ok(Number.isInteger(slip.x)&&Number.isInteger(slip.y));
  assert.ok(Math.abs(slip.x)<=2&&Math.abs(slip.y)<=2,'registration stays within two pixels');
}
assert.equal(vm.runInContext('sampleRegistration(560,false).x',context),2);
assert.equal(vm.runInContext('sampleRegistration(900,false).x',context),0,'quiet gaps between slips');
assert.equal(vm.runInContext('sampleRegistration(560,true).x',context),0,'reduced motion suppresses slips');
console.log('Pixel slips: integer offsets, two-pixel bound, held contacts, quiet gaps and reduced motion passed.');

assert.ok(glitch(100,'static').alpha>0,'static is present inside burst');
assert.equal(glitch(240,'static').alpha,0,'no static between bursts');
assert.notEqual(glitch(100,'static').seed,glitch(150,'static').seed,'snow changes within a burst');
assert.notEqual(glitch(100,'static').brightness,glitch(150,'static').brightness,'contact brightness switches sharply');
assert.equal(glitch(400,'static',true).seed,glitch(500,'static',true).seed,'reduced flicker freezes noise');
assert.equal(glitch(400,'static',true).brightness,.9);
console.log('Flicker/static: bounded bursts, quiet gaps, changing snow and reduced flicker passed.');
