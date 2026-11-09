'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{Driftworks:{}}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../src/wormholes.js'),'utf8'),context);
const W=context.window.Driftworks.wormholes;
assert.throws(()=>W.define({id:'bad',mouths:[{space:0,position:[0,0,0],radius:1,sky:'a'},{space:1,position:[0,0,0],radius:2,sky:'b'}]}),/radii/);
assert.throws(()=>W.define({id:'bad',mouths:[{space:0,position:[0,0,0],radius:1,sky:'a'},{space:0,position:[1,0,0],radius:1,sky:'b'}]}),/distinct/);
let seed=29;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
for(let i=0;i<1000;i++){
 const radius=1+random()*1000,point=()=>[random()*1e5,random()*1e5,random()*1e5],a=point(),b=point();
 const link={id:'generated-'+i,mouths:[{space:7,position:a,radius,sky:'jade'},{space:42,position:b,radius,sky:'rime'}]};
 const n=point().map(v=>v-50000),length=Math.hypot(...n);n.forEach((v,k)=>n[k]=v/length);
 const gap=1+random()*100,overshoot=1+random()*3000;
 const before=a.map((v,k)=>v+n[k]*(radius+gap)),after=a.map((v,k)=>v+n[k]*(radius-overshoot));
 const hit=W.cross(link,before,after,7);assert(hit);assert.equal(hit.region,42);assert.equal(hit.sky,'rime');
 hit.eye.forEach((v,k)=>assert(Math.abs(v-(b[k]-n[k]*(radius+overshoot)))<1e-5,'swept entry retains overshoot in destination space'));
 const velocity=point(),mapped=W.transport(velocity,hit.normal),roundtrip=W.transport(mapped,hit.normal);
 assert(Math.abs(Math.hypot(...velocity)-Math.hypot(...mapped))<1e-5);
 roundtrip.forEach((v,k)=>assert(Math.abs(v-velocity[k])<1e-5));
 assert.equal(W.cross(link,before,after,99),null);
 assert.equal(W.cross(link,before,before.map((v,k)=>v+n[k]*30),7),null,'outward motion cannot trigger a second entry');
}
const owner={visible:true},hull=[{vertices:new Float32Array(18)}],plumes=[{vertices:new Float32Array(18)}];
const rig={geometry:()=>hull,effects:()=>plumes,reset(){}};
const bound=W.bindRig(rig,owner);assert.equal(bound.geometry()[0].placement,bound.effects({})[0].placement);
const positions=new Float32Array(hull[0].vertices);
for(const mode of ['front','back','aperture']){
 W.mouth(owner,[12,34,56],[0,1,0],20,mode);
 assert.equal(W.resolve(hull[0]),owner);assert.equal(W.resolve(plumes[0]),owner);
 assert.deepEqual(hull[0].vertices,positions,'placement never rebuilds source geometry');
 assert(owner.portalClip,'every mask is bounded by its mouth');assert.equal(!!owner.clipPlane,mode!=='aperture');
}
owner.visible=false;assert.equal(W.resolve(plumes[0]).visible,false);
const root=require('node:path').resolve(__dirname,'..');
function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
 const file=require('node:path').join(dir,entry.name);
 if(entry.isDirectory())scan(file);
 else if(file.endsWith('.js')&&!file.endsWith(require('node:path').join('src','wormholes.js'))){
  assert(!/\.(?:clipPlane|portalClip)\s*=|\b(?:clipPlane|portalClip)\s*:/.test(fs.readFileSync(file,'utf8')),'Portal masks must be authored through shared ownership, not mission batches: '+file);
 }
}}
scan(require('node:path').join(root,'src'));scan(require('node:path').join(root,'experiments'));
for(const file of require('node:child_process').execFileSync('git',['ls-files','*.html'],{cwd:root,encoding:'utf8'}).trim().split('\n')){
 const html=fs.readFileSync(require('node:path').join(root,file),'utf8'),scene=html.indexOf('scene3d.js');
 if(scene>=0)assert(html.indexOf('wormholes.js')>=0&&html.indexOf('wormholes.js')<scene,'Shared placement dependency must precede every renderer: '+file);
}
console.log('PASS wormhole links: 1000 generated crossings, destination sky/space, overshoot, reciprocal vector transport and shared hull/effect ownership');

// One lifecycle drives aperture size, remote visibility and rules gating.
const life={opensAt:10,closesAt:20};
for(const t of [0,9,10,20,21])assert.equal(W.phase(t,life).visible,false);
assert.equal(W.phase(13,life).traversable,true);
for(let i=1;i<30;i++)assert(W.phase(10+i/10,life).amount>=W.phase(10+(i-1)/10,life).amount);
assert(W.phase(19,life).amount>0&&W.phase(19,life).amount<1);
const reversible={initialOpen:false};assert.equal(W.phase(0,reversible).amount,0);W.request(reversible,true,0);
const midway=W.phase(1,reversible).amount;W.request(reversible,false,1);assert.equal(W.phase(1,reversible).amount,midway);assert.equal(W.phase(4,reversible).amount,0);
W.mouth(owner,[0,0,0],[0,1,0],0,'aperture');assert.equal(owner.portalClip,undefined);assert.equal(owner.visible,false,'A closed remote aperture must hide its owner, not clear its mask and reveal the whole ship');
console.log('PASS wormhole lifecycle: scheduled endpoints, monotonic opening, closure and continuous reversal');
