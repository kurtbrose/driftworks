// Pure helpers shared by the study viewer and its dependency-free regression test.
export function isStaticAirlock(points){
  const within=(limits)=>points.every(p=>p.every((value,axis)=>value>=limits[axis][0]-1e-5&&value<=limits[axis][1]+1e-5));
  return within([[1.32,4.18],[-1.38,1.38],[7.18,7.30]])||within([[1.14,1.26],[-.68,.68],[7.38,9.48]]);
}
export function sweepAxes(position,delta,blocked){
  for(const axis of ['x','y','z']){
    const distance=Math.abs(delta[axis]);
    if(distance&&!blocked(axis,Math.sign(delta[axis]),distance+.22))position[axis]+=delta[axis];
  }
}

export function viewDirections(yaw,pitch){
  return {forward:[Math.sin(yaw)*Math.cos(pitch),-Math.cos(yaw)*Math.cos(pitch),-Math.sin(pitch)],right:[-Math.cos(yaw),-Math.sin(yaw),0]};
}
