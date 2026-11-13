// Conservative oriented-box contacts for the freighter review range, in metres.
// This is rejection/deflection, not a rigid-body solver.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
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
