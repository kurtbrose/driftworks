// Conservative oriented-box contacts for the freighter review range, in metres.
// This is rejection/deflection, not a rigid-body solver.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function releaseKick(id,center,half){
 let seed=2166136261;for(const ch of String(id))seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 const unit=v=>{const length=Math.hypot(...v);return v.map(x=>x/(length||1));};
 const outward=unit(Math.hypot(center[1],center[2])>.01?[0,center[1],center[2]]:[-1,0,0]);
 // Lift along the mount, without reversing the outward clearance direction.
 const lift=[0,1,0].map((v,k)=>v-outward[k]*outward[1]);
 const direction=unit(outward.map((v,k)=>v*.85+lift[k]*.9));
 const strength=2.2+random()*1.8;
 const attachment=half.map((h,k)=>Math.max(-.85*h,Math.min(.85*h,(-outward[k]*.65+(random()-.5)*.65)*h)));
 const velocity=direction.map(v=>v*strength),torque=cross(attachment,velocity);
 // Box inertia per unit mass: enough scale dependence to avoid spinning tanks
 // like tiny fittings. A single spring impulse supplies both drift and tumble.
 let spin=torque.map((v,k)=>v*1.4/Math.max(.25,(half[(k+1)%3]**2+half[(k+2)%3]**2)/3));
 const speed=Math.hypot(...spin);if(speed>.65)spin=spin.map(v=>v*.65/speed);
 return {attachment,strength,velocity,spin};
}
export function contact(a,b){
 const delta=a.center.map((v,k)=>v-b.center[k]);
 const extent=(box,k)=>box.axes.reduce((n,axis,j)=>n+Math.abs(axis[k])*box.half[j],0);
 if(delta.some((v,k)=>Math.abs(v)>=extent(a,k)+extent(b,k)-.001))return null;
 let depth=Infinity,normal=null;
 for(const raw of [...a.axes,...b.axes,...a.axes.flatMap(x=>b.axes.map(y=>cross(x,y)))]){
  const length=Math.hypot(...raw);if(length<1e-8)continue;
  const axis=raw.map(v=>v/length),radius=box=>box.axes.reduce((n,x,k)=>n+Math.abs(dot(x,axis))*box.half[k],0);
  const distance=dot(delta,axis),penetration=radius(a)+radius(b)-Math.abs(distance);
  if(penetration<=.001)return null;
  if(penetration<depth){depth=penetration;normal=axis.map(v=>v*(distance<0?-1:1));}
 }
 return {normal,depth};
}
