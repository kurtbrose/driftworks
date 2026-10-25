'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{Driftworks:{}}};vm.createContext(context);
vm.runInContext(fs.readFileSync('experiments/ellis-optics.js','utf8'),context);
const optics=context.window.Driftworks.ellisOptics,table=optics.table(),N=optics.size;
assert.equal(table.length,N*N*4);assert.equal(optics.table(),table,'one shared dimensionless table');
function sample(b,u){
 const x=Math.min(N-1,-Math.log(Math.abs(1-b))/12*(N-1)),y=u/12*(N-1);
 const ix=Math.floor(x),iy=Math.floor(y),dx=x-ix,dy=y-iy,channel=b<1?0:2;
 function read(a,c){const i=(Math.min(N-1,c)*N+Math.min(N-1,a))*4+channel;return (table[i]*256+table[i+1])*32/65535;}
 return (read(ix,iy)*(1-dx)+read(ix+1,iy)*dx)*(1-dy)+(read(ix,iy+1)*(1-dx)+read(ix+1,iy+1)*dx)*dy;
}
// The CPU sampler must match the packed texture's bilinear decoding exactly,
// including both channels and clamped impact-parameter edges.
for(const b of [0,.05,.6,.99,1-1e-8,1,1+1e-8,1.4,1.95,2]){
 const root=Math.sqrt(Math.max(.0000001,Math.abs(1-b*b)));
 const edge=b<1?Math.asinh(Math.sqrt(3)/root):Math.acosh(Math.max(1,Math.sqrt(3)/root));
 for(const u of [0,edge*.01,edge*.25,edge*.99,edge]){
  assert.equal(optics.lookup(b,u),sample(b,u),`packed bilinear sample b=${b}, u=${u}`);
 }
}
// Independent quadrature in proper radial l for transmitted rays, rather than
// the table builder's u coordinate. Endpoints span nearby and far sources.
function radialIntegral(b,l){
 let sum=0,n=20000,h=l/n;
 for(let i=0;i<n;i++){
  const r2=1+((i+.5)*h)**2,r=Math.sqrt(r2),t=Math.max(0,Math.min(1,2*r-3));
  const q=r<=1.5?1:r>=2?0:1-10*t**3+15*t**4-6*t**5;
  const scale=r<=1.5?1:Math.sqrt((r2-1)/(r2-q));
  sum+=b/(r2*Math.sqrt(1-b*b/r2))*scale*h;
 }
 return sum;
}
let worst=0;
for(const b of [.05,.2,.6,.9,.99,.999])for(const l of [.1,.5,2,12]){
 const u=Math.asinh(l/Math.sqrt(1-b*b)),expected=radialIntegral(b,l),actual=sample(b,u);
 worst=Math.max(worst,Math.abs(expected-actual));assert(Math.abs(expected-actual)<.006,`finite distance angle b=${b}, l=${l}`);
}
for(const b of [1.001,1.05,1.4,1.95])for(const u of [.1,1,4,9])assert(Math.abs(sample(b,u)-optics.integral(b,u,20000))<.006,'turning branch');
assert.equal(optics.integral(0,5),0,'radial rays stay radial');
assert(optics.shader.includes('ellisPoint'),'finite-distance path, not only a sky exit direction');
console.log(`PASS Ellis optics: shared cache, independent finite-source quadrature and turning branch; worst ${worst.toFixed(6)} rad`);

// Compare both exit constructions against high-precision geodesic phase. The old
// finite difference takes a derivative of the quantized table, amplifying error.
let analyticWorst=0,differenceWorst=0;
for(let n=1;n<250;n++){
 const b=.01+n/250*1.98;if(Math.abs(1-b)<1e-5)continue;
 const root=Math.sqrt(Math.abs(1-b*b));
 const u0=b<1?Math.asinh(1.8/root):Math.acosh(Math.max(1,1.8/root));
 const end=b<1?Math.asinh(24/root):Math.acosh(24/root);
 const phase=(integrate,u)=>integrate(b,u0)+integrate(b,u);
 function point(t){const u=-u0+(end+u0)*t,angle=phase(sample,u),l=root*(b<1?Math.sinh(u):Math.cosh(u)),r=Math.sqrt(1+l*l);return [r*Math.cos(angle),r*Math.sin(angle)];}
 const phi=phase(sample,end),exactPhi=phase((b,u)=>optics.integral(b,u,20000),end),r=Math.sqrt(577),sine=b/r;
 const correction=Math.asin(sine);
 const exact=exactPhi+correction,analytic=phi+correction;
 const a=point(.999),z=point(1),old=Math.atan2(z[1]-a[1],z[0]-a[0]);
 const error=x=>Math.abs(Math.atan2(Math.sin(x-exact),Math.cos(x-exact)));
 analyticWorst=Math.max(analyticWorst,error(analytic));differenceWorst=Math.max(differenceWorst,error(old));
}
assert(analyticWorst<.001,'analytic exit stays within lookup phase accuracy');
assert(differenceWorst>analyticWorst*5,'negative control exposes derivative amplification');
console.log(`PASS Ellis exit quantization: analytic ${analyticWorst.toFixed(6)} rad vs finite-difference ${differenceWorst.toFixed(6)} rad`);
// Finite-source inverse paths must agree with independent proper-radial quadrature.
let inverseWorst=0;
for(const R of [1.1,1.6,4,8])for(const S of [1.05,2,8])for(const angle of [.02,.3,1,2.5]){
 const eye=[0,-2000-300*R,1550],target=[12000+300*S*Math.sin(angle),-2000+300*S*Math.cos(angle),1550];
 const h=optics.primary(eye,target,0,1);assert(h&&!h.direct&&!h.turning&&h.impact<1);
 assert(Math.abs(Math.hypot(...h.direction)-1)<1e-7,'normalized primary ray');
 const b=h.impact,E=Math.min(R,2),phase=radialIntegral(b,Math.sqrt(E*E-1))+radialIntegral(b,Math.sqrt(S*S-1))+(R>2?Math.asin(b/2)-Math.asin(b/R):0);
 inverseWorst=Math.max(inverseWorst,Math.abs(phase-angle));assert(Math.abs(phase-angle)<.004,'inverse finite-source phase agrees with quadrature');
 assert(Number.isFinite(h.length)&&h.length>0);
}
for(const angle of [.1,.4,.8]){
 const e=1e-7,n=[Math.sin(angle),Math.cos(angle),0],eye=[0,-2400,1550];
 const remote=[12000+n[0]*(300+e),-2000+n[1]*(300+e),1550],local=[-n[0]*(300+e),-2000-n[1]*(300+e),1550];
 const a=optics.primary(eye,remote,0,1),b=optics.primary(eye,local,0,0);assert(a&&b);
 assert(Math.hypot(...a.direction.map((v,i)=>v-b.direction[i]))<.001,'primary direction is continuous at antipodal crossing');
 assert(Math.abs(a.length-b.length)<.1,'path distance is continuous at throat');
}
const direct=optics.primary([0,-3250,1550],[1000,-3250,1550],0,0);assert(direct&&direct.direct&&direct.direction[0]===1,'ordinary path outside lens influence');
console.log(`PASS Ellis primary inversion: finite-source quadrature (${inverseWorst.toFixed(6)} rad), ordinary rays and throat continuity`);

// Outward sky must converge to the untouched direction at the entry boundary.
// Compare against that independent flat-space direction, not another LUT path.
let boundaryWorst=0;
for(const R of [1.99,1.999,1.99999,2])for(const theta of [.01,.3,.8,1.3,1.55]){
 const b=R*Math.sin(theta),root=Math.sqrt(Math.abs(1-b*b));
 const u0=b<1?Math.asinh(Math.sqrt(R*R-1)/root):Math.acosh(Math.sqrt(R*R-1)/root);
 const end=b<1?Math.asinh(24/root):Math.acosh(24/root);
 const exit=optics.lookup(b,end)-optics.lookup(b,u0)+Math.asin(b/Math.sqrt(577));
 const delta=Math.abs(exit-theta);if(R>1.999)boundaryWorst=Math.max(boundaryWorst,delta);
 if(R>1.999)assert(delta<.0005,'Outward sky approaches straight direction without an edge snap');
}
for(const b of [.1,.8,1.2,1.8,1.99]){
 const root=Math.sqrt(Math.abs(1-b*b)),u=r=>b<1?Math.asinh(Math.sqrt(r*r-1)/root):Math.acosh(Math.sqrt(r*r-1)/root);
 const tail=optics.lookup(b,u(8))-optics.lookup(b,u(2));
 assert(Math.abs(tail-(Math.asin(b/2)-Math.asin(b/8)))<1e-10,'Flat exterior tail is analytic, avoiding LUT residual at cutoff');
}
console.log(`PASS Ellis compact boundary: outward flat limit ${boundaryWorst.toFixed(6)} rad and exact exterior tail`);

for(const region of [0,1]){
 const eye=[region*12000,-2380,1550],target=[region*12000+12,-2340,1550];
 const p=optics.primary(eye,target,region,region);assert(p&&!p.direct);
 const delta=target.map((v,i)=>v-eye[i]),distance=Math.hypot(...delta);
 const ray=optics.ray(eye,p.direction,region);optics.advanceRay(ray,p.length);
 assert(Math.hypot(...ray.eye.map((v,i)=>v-target[i]))<.1,'Nearby image agrees with the same forward ray used by guns');
 assert(p.direction.reduce((sum,v,i)=>sum+v*delta[i]/distance,0)>.99,'Nearby finite-source direction remains locally close to straight');
 const remote=optics.primary(eye,[12000-region*12000,-1660,1550],region,1-region);
 assert(!remote||!remote.direct,'Remote chart never receives local straight bypass');
}
console.log('PASS Ellis near-field optics: 42 m local contacts in both charts and remote isolation');

for(const distance of [100,200]){
 const eye=[0,-2380,1550],at=d=>optics.primary(eye,[Math.sqrt(d*d-1600),-2340,1550],0,0);
 const a=at(distance-.001),b=at(distance+.001);assert(a&&b);
 assert(Math.hypot(...a.direction.map((v,i)=>v-b.direction[i]))<.001,'Near-field transition has no hard direction switch');
 assert(Math.abs(a.length-b.length)<.1,'Near-field transition has no path-length switch');
}
console.log('PASS Ellis finite-source continuity: continuous direction and distance at 100/200 m');

// Off-axis pursuit previously flipped the ray when source/eye radii exchanged
// order, and quantized integral subtraction caused holes around critical impact.
for(const x of [100,250,400]){
 let previous=null;
 for(let z=301;z<=900;z+=.5){
  const eye=[x,-2000-z,1550],target=[0,-2500,1550],p=optics.primary(eye,target,0,0);assert(p,'off-axis pursuit has a primary path');
  if(previous)assert(Math.hypot(...p.direction.map((v,i)=>v-previous.direction[i]))<.01,'no pursuit branch reversal or critical-impact jump');
  const reverse=optics.primary(target,eye,0,0);assert(reverse);
  assert(Math.hypot(...p.sourceDirection.map((v,i)=>v+reverse.direction[i]))<.004,'endpoint direction agrees with independently reversed path');
  previous=p;
 }
}
for(const z of [Math.sqrt(500*500-250*250),600]){
 const a=optics.primary([250,-2000-z+.00001,1550],[0,-2500,1550],0,0),b=optics.primary([250,-2000-z-.00001,1550],[0,-2500,1550],0,0);assert(a&&b);
 assert(Math.hypot(...a.direction.map((v,i)=>v-b.direction[i]))<.0001);
 assert(Math.abs(a.length-b.length)<.01);
}
console.log('PASS Ellis off-axis pursuit: continuous rays, no missing branches, reciprocal source headings and finite-segment distance');

// Radial travel within the constant Ellis core has an independent analytic
// proper distance. Probe short same-chart segments very close to the throat.
for(const side of [0,1])for(const pair of [[300.0001,300.01],[301,305],[340,350],[440,449]])for(const reverse of [false,true]){
 const [R,S]=reverse?pair.slice().reverse():pair;
 const eye=[side*12000,-2000-R,1550],target=[side*12000,-2000-S,1550];
 const path=optics.primary(eye,target,side,side);
 assert(path,'near-throat radial path exists');
 assert(Math.abs(path.direction[0])+Math.abs(path.direction[2])<1e-6,'radial path has no lateral deflection');
 assert.equal(Math.sign(path.direction[1]),Math.sign(R-S),'radial path points toward its endpoint');
 const distance=Math.abs(Math.sqrt(S*S-90000)-Math.sqrt(R*R-90000));
 assert(Math.abs(path.length-distance)<.005,'near-throat arc distance agrees with analytic Ellis radial travel');
}
console.log('PASS near-throat finite segments: analytic radial distance, both charts and both directions');
