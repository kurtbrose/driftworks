const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const {bodyPresets,bodyControls,randomBody,shapePoint,guardBody,crewLimits,controlsForMode}=await import('data:text/javascript;base64,'+fs.readFileSync('experiments/character-bodies.js').toString('base64'));
 for(const p of bodyPresets){
  for(const z of [0,.004,.0087,.011,.0135,.016,.019]){
   const v=shapePoint(.001,-.001,z,p),mirror=shapePoint(-.001,-.001,z,p);
   assert(v.every(Number.isFinite));assert.equal(v[2],z);assert.equal(v[0],-mirror[0]);
   assert(v[0]>.0003 && v[0]<.0035);
   if(z===0||z===.019)assert.deepEqual(v,[.001,-.001,z]);
   assert.deepEqual(shapePoint(.007,-.001,z,p),[.007,-.001,z],'Hands remain unchanged');
  }
 }
 const original=bodyPresets[0],feminine=bodyPresets[1];
 assert.deepEqual(shapePoint(.001,-.001,.011,original),[.001,-.001,.011]);
 assert(shapePoint(.001,0,.0087,feminine)[0]>.001);
 assert(shapePoint(.001,0,.0135,feminine)[0]<.001);
 assert(shapePoint(.001,0,.011,feminine)[0]<.001);
 // Exercise every corner of the continuous domain, including combined extremes.
 for(let mask=0;mask<64;mask++){
  const p={...original};bodyControls.forEach((c,i)=>p[c.key]=(mask&(1<<i))?c.max:c.min);
  const guarded=guardBody(p);
  assert.deepEqual(guardBody(guarded),guarded,'Guarding twice must not drift');
  for(const c of bodyControls){const [min,max]=crewLimits[c.key];assert(guarded[c.key]>=min-1e-9&&guarded[c.key]<=max+1e-9);}
  assert((1+guarded.hips)/(1+guarded.waist)<=1.5+1e-9);
  assert((1+guarded.waist)/(1+guarded.hips)<=1.25+1e-9);
  assert((1+guarded.shoulders)/(1+guarded.hips)>=.68-1e-9);
  assert((1+guarded.shoulders)/(1+guarded.hips)<=1.35+1e-9);
  assert(guarded.chest+guarded.depth<=.65+1e-9);
  for(let z=0;z<=.019;z+=.00025){const v=shapePoint(.001,-.001,z,p);assert(v.every(Number.isFinite));assert(v[0]>0);assert(v[1]<0);}
 }
 for(const stress of [false,true])for(const value of [0,.123456,.5,1]){
  const p=randomBody(()=>value,stress);
  for(const c of bodyControls)assert(p[c.key]>=c.min-1e-9&&p[c.key]<=c.max+1e-9,c.key);
 }
 assert.deepEqual(guardBody(original),original);
 assert.equal(controlsForMode(false)[0].min,.7);assert.equal(controlsForMode(true)[0].min,.6);
 for(const p of bodyPresets.filter(p=>!p.name.startsWith('Stress')))assert.deepEqual(guardBody(p),p,p.id+' is already inside crew limits');
 const a={...original,hips:.1},b={...original,hips:.2},mid={...original,hips:.15};
 assert(Math.abs(shapePoint(.001,0,.0087,mid)[0]-(shapePoint(.001,0,.0087,a)[0]+shapePoint(.001,0,.0087,b)[0])/2)<1e-12,'Continuous interpolation');
 assert(Math.abs(randomBody(()=>.123456).height-(.88+.24*.123456))<1e-12);
 console.log('PASS body variants: continuous edits, crew guardrails and ratios, idempotent clamping, original restoration');
})().catch(error=>{console.error(error);process.exitCode=1;});
