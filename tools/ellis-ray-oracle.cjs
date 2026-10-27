'use strict';

// Development-only oracle, independent of packed tables, production ray stepping
// and hyperbolic integral transforms. SI angular momentum B = 300*b.
function outwardShell(startRadius,impact,shellRadius,step=.001){
  if(!(shellRadius>startRadius&&startRadius>=1&&impact<startRadius))throw new Error('Expected a reachable outward shell');
  function derivative(q){
    const r2=1+q[0]*q[0],r=Math.sqrt(r2),t=Math.max(0,Math.min(1,2*r-3));
    const compact=r<=1.5?1:r>=2?0:1-10*t**3+15*t**4-6*t**5;
    const A=r<=1.5?1:Math.sqrt((r2-1)/(r2-compact));
    return [q[1]/A,impact*impact*q[0]/(A*r2*r2),impact/r2];
  }
  function advance(q,h){
    const a=derivative(q),b=derivative(q.map((v,i)=>v+a[i]*h/2)),c=derivative(q.map((v,i)=>v+b[i]*h/2)),d=derivative(q.map((v,i)=>v+c[i]*h));
    return q.map((v,i)=>v+h*(a[i]+2*b[i]+2*c[i]+d[i])/6);
  }
  let q=[Math.sqrt(startRadius*startRadius-1),Math.sqrt(1-impact*impact/(startRadius*startRadius)),0],s=0;
  for(let count=0;count<200000;count++){
    const next=advance(q,step);
    if(Math.hypot(1,next[0])>=shellRadius){
      let lo=0,hi=step;
      for(let j=0;j<36;j++){const mid=(lo+hi)/2;if(Math.hypot(1,advance(q,mid)[0])<shellRadius)lo=mid;else hi=mid;}
      const h=(lo+hi)/2,end=advance(q,h),r=Math.hypot(1,end[0]);
      return {phase:end[2],lengthMeters:(s+h)*300,radiusMeters:r*300,energy:end[1]*end[1]+impact*impact/(1+end[0]*end[0]),point:[r*300*Math.sin(end[2]),-r*300*Math.cos(end[2]),0]};
    }
    q=next;s+=step;
  }
  throw new Error('Oracle did not reach shell within budget');
}
module.exports={outwardShell};
