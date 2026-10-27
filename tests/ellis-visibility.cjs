'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{Driftworks:{}}};
vm.runInNewContext(fs.readFileSync('experiments/ellis-optics.js','utf8'),context);
const optics=context.window.Driftworks.ellisOptics;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),norm=v=>Math.hypot(...v),unit=v=>v.map(x=>x/norm(v));
const point=(v,side)=>v.map((x,i)=>x+[side*12000,-2000,1550][i]);
// For an observer outside the throat, a ray transmits iff initially inward
// and B<a. This is independent of sky colors, lookup phases and hull placement.
function crossing(offset,direction){const r=norm(offset),n=unit(offset),d=unit(direction),cos=dot(n,d);return cos<0&&r/300*Math.sqrt(Math.max(0,1-cos*cos))<1;}
let classifications=0,endpoints=0;
for(const side of [0,1])for(const R of [330,450,800])for(const b of [0,.5,.95,1.05,1.2]){
 if(b>=R/300)continue;
 for(const inward of [true,false]){
  const d=[b/(R/300),(inward?1:-1)*Math.sqrt(1-(b/(R/300))**2),0],O=[0,-R,0];
  const expected=inward&&b<1;assert.equal(crossing(O,d),expected);
  const ray=optics.ray(point(O,side),d,side);optics.advanceRay(ray,6000);
  assert.equal(ray.region!==side,expected,'forward integration agrees with analytic transmission cone');classifications++;
 }
 for(const theta of [.2,.7,1.4,2.5]){
  const S=400+200*b,target=[S*Math.sin(theta),-S*Math.cos(theta),0],hit=optics.primary(point([0,-R,0],side),point(target,1-side),side,1-side);
  if(!hit)continue;
  assert(crossing([0,-R,0],hit.direction),'every opposite-chart finite-source image lies inside transmission cone');endpoints++;
 }
}
// Reproduce the renderer's four-path forward-difference affine construction.
// An extended synthetic hull exposes spill even when its center is valid.
// This measures geometry before fragment clipping, not rendered pixel coverage.
const footprints=[];
for(const R of [330,450,800]){
 const O=[0,-R,0],eye=point(O,0),center=[60,500,0],world=point(center,1);
 const project=p=>{const h=optics.primary(eye,p,0,1);return h&&h.direction.map(x=>x*h.length);};
 const base=project(world);assert(base);
 const columns=[0,1,2].map(j=>{const p=world.slice();p[j]+=4;const q=project(p);assert(q);return q.map((x,i)=>(x-base[i])/4);});
 let leaked=0,exactLeaks=0,samples=0;
 for(let x=-1200;x<=1200;x+=20){
  const predicted=base.map((v,i)=>v+columns[0][i]*x),actual=project(world.map((v,i)=>v+(i===0?x:0)));
  if(!crossing(O,predicted))leaked++;
  if(actual&&!crossing(O,actual))exactLeaks++;
  samples++;
 }
 assert.equal(exactLeaks,0,'individually solved hull samples never spill outside transmission cone');
 footprints.push({observerRadiusMeters:R,samples,affineOutsideCone:leaked,exactOutsideCone:exactLeaks});
}
assert(footprints.some(f=>f.affineOutsideCone>0),'stress fixture must expose affine hull spill');
console.log(`PASS Ellis transmission: ${classifications} integrated rays and ${endpoints} opposite-chart endpoints`);
console.log('Ellis affine footprint diagnostic (before fragment clipping): '+JSON.stringify(footprints));
const report={classifications,endpoints,footprints,rasterCoverageVerified:false};
const out=process.argv.indexOf('--out');if(out>=0){assert(process.argv[out+1]);fs.writeFileSync(process.argv[out+1],JSON.stringify(report,null,2)+'\n');}
if(process.argv.includes('--strict')&&footprints.some(f=>f.affineOutsideCone>0))process.exitCode=1;
