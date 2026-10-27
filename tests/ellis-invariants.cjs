'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{Driftworks:{}}};
vm.runInNewContext(fs.readFileSync('experiments/ellis-optics.js','utf8'),context);
const optics=context.window.Driftworks.ellisOptics;
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=v=>Math.hypot(...v),unit=v=>v.map(x=>x/norm(v));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const center=side=>[side*12000,-2000,1550],local=(p,side)=>p.map((v,i)=>v-center(side)[i]);
const point=(v,side)=>v.map((x,i)=>x+center(side)[i]),distance=(a,b)=>norm(a.map((v,i)=>v-b[i]));
const axis=unit([1,2,3]),angle=.73;
function rotate(v){const c=Math.cos(angle),s=Math.sin(angle),k=cross(axis,v);return v.map((x,i)=>c*x+s*k[i]+(1-c)*axis[i]*dot(axis,v));}

let rotations=0,reversed=0,rotationError=0,lengthSymmetry=0;
const reciprocityFailures=[];
for(const side of [0,1])for(const other of [false,true])for(const R of [310,430,800])for(const S of [320,500,1000])for(const theta of [.2,.8,1.7]){
 const targetSide=other?1-side:side,O=[0,-R,0],T=[S*Math.sin(theta),(other?1:-1)*S*Math.cos(theta),0];
 const a=optics.primary(point(O,side),point(T,targetSide),side,targetSide);
 const b=optics.primary(point(rotate(O),side),point(rotate(T),targetSide),side,targetSide);
 assert.equal(!!a,!!b,'rotation must not create or destroy a primary branch');
 if(!a)continue;
 rotations++;assert.equal(a.turning,b.turning);assert.equal(a.direct,b.direct);
 rotationError=Math.max(rotationError,distance(rotate(a.direction),b.direction),distance(rotate(a.sourceDirection),b.sourceDirection));
 assert(distance(rotate(a.direction),b.direction)<1e-8,'observer direction rotates with the whole configuration');
 assert(distance(rotate(a.sourceDirection),b.sourceDirection)<1e-8,'source direction rotates with the whole configuration');
 assert(Math.abs(a.length-b.length)<1e-5,'rotation preserves optical distance');
 const back=optics.primary(point(T,targetSide),point(O,side),targetSide,side);assert(back,'a connecting path must be reversible');
 assert.equal(a.turning,back.turning,'path reversal preserves turning branch identity');
 assert.equal(a.direct,back.direct,'path reversal preserves the flat-exterior branch');
 reversed++;lengthSymmetry=Math.max(lengthSymmetry,Math.abs(a.length-back.length));
 if(Math.abs(a.length-back.length)>=.005)reciprocityFailures.push({side,other,R,S,theta,errorMeters:Math.abs(a.length-back.length)});
 // Reversal must preserve length through both metric joins and flat tails.
 assert(Math.abs(a.length-back.length)<.005,'reverse solve preserves path length within 5 mm, including exterior endpoints');
 assert(distance(a.sourceDirection,back.direction.map(x=>-x))<.004,'source tangent matches reverse launch direction');
 assert(distance(a.direction,back.sourceDirection.map(x=>-x))<.004,'observer tangent matches reverse arrival direction');
}
assert(rotations>100&&reversed>100,'exercise both charts, turning paths and the exterior');
console.log(`PASS Ellis optical invariants: ${rotations} rotated configurations, ${reversed} reciprocal tangent pairs; worst direction rotation ${rotationError.toExponential(2)}`);

let maxEnergy=0,maxMomentum=0,maxPlane=0,maxReturn=0,crossings=0,turns=0;
for(const side of [0,1])for(const R of [310,450,590,800])for(const impact of [.2,.8,.999,1.001,1.3]){
 if(impact>R/300)continue;
 const radial=unit([.2,-.9,.38]),tangent=unit(cross(radial,[0,0,1])),plane=unit(cross(radial,tangent));
 const sine=impact/(R/300),direction=radial.map((v,i)=>-Math.sqrt(1-sine*sine)*v+sine*tangent[i]);
 const start=point(radial.map(v=>v*R),side),ray=optics.ray(start,direction,side);
 let previousP=null,hasCrossed=false,hasTurned=false;
 for(let step=0;step<200;step++){
  optics.advanceRay(ray,3);
  const offset=local(ray.eye,ray.region),r=norm(offset)/300,n=unit(offset);
  const momentum=norm(cross(n,ray.direction))*r,planeError=Math.abs(dot(n,plane));
  maxMomentum=Math.max(maxMomentum,Math.abs(momentum-impact));maxPlane=Math.max(maxPlane,planeError);
  assert(Math.abs(norm(ray.direction)-1)<1e-10,'public ray direction stays normalized');
  assert(Math.abs(momentum-impact)<2e-6,'angular momentum reconstructed from public position/direction is conserved');
  assert(planeError<1e-10,'ray stays in its initial central plane, including chart changes');
  if(ray.active){
   const energy=ray.p*ray.p+ray.b*ray.b/(1+ray.l*ray.l);
   maxEnergy=Math.max(maxEnergy,Math.abs(energy-1));assert(Math.abs(energy-1)<2e-6,'intrinsic unit-speed energy is conserved');
   if(previousP!==null&&previousP<0&&ray.p>0)hasTurned=true;previousP=ray.p;
  }
  if(ray.region!==side)hasCrossed=true;
 }
 if(hasCrossed)crossings++;if(hasTurned)turns++;
 const back=optics.ray(ray.eye,ray.direction.map(x=>-x),ray.region);optics.advanceRay(back,600);
 assert.equal(back.region,side,'forward/reverse ray returns to its starting chart');
 maxReturn=Math.max(maxReturn,distance(back.eye,start));
 assert(distance(back.eye,start)<.02,'600 m forward/reverse integration returns within 2 cm');
 assert(distance(back.direction,direction.map(x=>-x))<.0001,'reverse integration recovers the launch tangent');
}
assert(crossings>0&&turns>0,'invariants must cover both transmitted and turning rays');
console.log(`PASS Ellis ray invariants: ${crossings} transmitted and ${turns} turning fixtures; worst energy ${maxEnergy.toExponential(2)}, momentum ${maxMomentum.toExponential(2)}, plane ${maxPlane.toExponential(2)}, return ${maxReturn.toExponential(2)} m`);
console.log('Ellis exterior primary reciprocity diagnostic: '+reciprocityFailures.length+' paths exceed 5 mm; worst '+lengthSymmetry.toExponential(2)+' m');
const {outwardShell}=require('../tools/ellis-ray-oracle.cjs');
function u(b,r){const root=Math.sqrt(Math.max(1e-7,Math.abs(1-b*b))),l=Math.sqrt(r*r-1);return b<1?Math.asinh(l/root):Math.acosh(Math.max(1,l/root));}
let shellTests=0,maxShellDistance=0,maxShellPhase=0;
for(const side of [0,1])for(const R of [1.00002,1.3,1.7])for(const b of [.2,.8,.99,1.01,1.2])for(const shell of [1.0001,1.5,2]){
 if(b>=R||shell<=R)continue;
 const reference=outwardShell(R,b,shell),ray=optics.ray(point([0,-R*300,0],side),[b/R,-Math.sqrt(1-b*b/(R*R)),0],side);
 optics.advanceRay(ray,reference.lengthMeters);
 const end=local(ray.eye,ray.region),error=distance(end,reference.point);
 const phase=optics.lookup(b,u(b,shell))-optics.lookup(b,u(b,R));
 maxShellDistance=Math.max(maxShellDistance,error);maxShellPhase=Math.max(maxShellPhase,Math.abs(phase-reference.phase));
 assert.equal(ray.region,side);assert(Math.abs(norm(end)-shell*300)<.005,'shell intersection lies on its specified sphere');
 assert(error<.005,'forward ray agrees with independent proper-coordinate RK4 shell point within 5 mm');
 assert(Math.abs(phase-reference.phase)<.001,'resolved grid-shell phases agree with independent ODE within 0.001 rad');
 assert(Math.abs(reference.energy-1)<1e-9,'oracle maintains its independently integrated unit energy');shellTests++;
}
const critical={startRadius:1.0015059244150723,impact:1.0000036612418444,shellRadius:2};
const a=outwardShell(critical.startRadius,critical.impact,critical.shellRadius),b=outwardShell(critical.startRadius,critical.impact,critical.shellRadius,.0005);
assert(Math.abs(a.phase-b.phase)<1e-8,'critical oracle converges under halved step size');
const phase=optics.lookup(critical.impact,u(critical.impact,2))-optics.lookup(critical.impact,u(critical.impact,critical.startRadius));
const criticalPhaseError=Math.abs(phase-b.phase);
assert(criticalPhaseError<.001,'near-critical packed shell phase agrees with independent ODE within 0.001 rad');
for(const exponent of [12,13,15])for(const sign of [-1,1]){
 const impact=1+sign*Math.exp(-exponent),R=1.0015,ref=outwardShell(R,impact,2);
 const measured=optics.lookup(impact,u(impact,2))-optics.lookup(impact,u(impact,R));
 assert(Math.abs(measured-ref.phase)<.001,'both critical branches remain accurate through exp(-15)');
}

console.log(`PASS Ellis independent shell invariants: ${shellTests} paths; worst intersection ${maxShellDistance.toExponential(2)} m, resolved lookup phase ${maxShellPhase.toExponential(2)} rad`);
console.log('Ellis critical lookup diagnostic: '+criticalPhaseError.toFixed(6)+' rad; pass='+(criticalPhaseError<.001)+'');
// Analytic limits do not use the inverse solver as their own oracle.
let radialCases=0,flatCases=0,chartCases=0,maxRadialDistanceError=0;
const radialFailures=[];
for(const side of [0,1]){
 for(const R of [301,330,420])for(const S of [305,360,440]){
  if(R===S)continue;
  const hit=optics.primary(point([0,-R,0],side),point([0,-S,0],side),side,side);
  const expected=Math.abs(Math.sqrt(R*R-90000)-Math.sqrt(S*S-90000));
  assert(hit);maxRadialDistanceError=Math.max(maxRadialDistanceError,Math.abs(hit.length-expected));
  assert(Math.abs(hit.length-expected)<.002,'radial core distance agrees with exact proper distance within 2 mm');
  if(Math.abs(hit.length-expected)>=.002)radialFailures.push({side,R,S,errorMeters:Math.abs(hit.length-expected)});
  assert(distance(hit.direction,[0,S>R?-1:1,0])<1e-7,'radial core path has no angular bending');radialCases++;
 }
 for(const delta of [[40,80,10],[-120,-60,40],[0,-200,0]]){
  const O=[100,-900,20],T=O.map((v,i)=>v+delta[i]),hit=optics.primary(point(O,side),point(T,side),side,side);
  assert(hit&&hit.direct);assert(Math.abs(hit.length-norm(delta))<1e-9);
  assert(distance(hit.direction,unit(delta))<1e-12,'flat exterior recovers Euclidean perspective');flatCases++;
 }
 for(const other of [false,true])for(const theta of [.3,1,2]){
  const O=[0,-430,0],T=[500*Math.sin(theta),-500*Math.cos(theta),0],dest=other?1-side:side;
  const a=optics.primary(point(O,side),point(T,dest),side,dest);
  const b=optics.primary(point(O,1-side),point(T,1-dest),1-side,1-dest);
  assert.equal(!!a,!!b);if(!a)continue;
  assert(distance(a.direction,b.direction)<1e-10&&Math.abs(a.length-b.length)<1e-7,'exchanging chart labels changes no optical measurement');chartCases++;
 }
}
console.log(`PASS Ellis analytic limits: ${radialCases} radial fixtures (${radialFailures.length} exceed 2 mm), ${flatCases} Euclidean exterior paths, ${chartCases} chart exchanges`);
const out=process.argv.indexOf('--out');
if(out>=0){if(!process.argv[out+1])throw new Error('--out requires a path');fs.writeFileSync(process.argv[out+1],JSON.stringify({maxRadialDistanceError,radialCases,flatCases,chartCases,radialFailures,rotations,reversed,rotationError,lengthSymmetry,maxEnergy,maxMomentum,maxPlane,maxReturn,crossings,turns,shellTests,maxShellDistance,maxShellPhase,critical,criticalPhaseError,criticalOracleStepDifference:Math.abs(a.phase-b.phase),reciprocityFailures},null,2)+'\n');}
if(process.argv.includes('--strict')&&(radialFailures.length||reciprocityFailures.length||criticalPhaseError>=.001))process.exitCode=1;
