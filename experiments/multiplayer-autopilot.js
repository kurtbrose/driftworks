/** Patrol inputs for the production flight controller; never writes a ship pose. */
/** @param {Required<import('../src/types').DriftworksNamespace>} DW */
export function createAutopilot(DW){
  /** @type {ReturnType<typeof DW.flightAI.create>|null} */let pilot=null;
  /** @type {number[]|null} */let center=null;
  let right=[1,0,0],up=[0,0,1],phase=0,time=0;
  return {
    /** @param {boolean} guest */
    reset(guest){pilot=DW.flightAI.create('human','expert',guest?72:31);center=null;phase=guest?Math.PI:0;time=0;},
    /** @param {import('./types').Snapshot} snapshot @param {number} elapsed
     * @param {import('./types').Profile} profile @param {import('./types').Weapon} weapon
     * @returns {import('./types').Demand} */
    demand(snapshot,elapsed,profile,weapon){
      const own=snapshot.state,U=DW.sim.METERS_PER_UNIT;
      if(!pilot)this.reset(false);
      if(!center){
        center=own.eye.slice();right=own.right.slice();up=own.up.slice();
        const length=Math.hypot(...center),safe=snapshot.world.asteroids.length?Math.max(length,snapshot.asteroid.radius*2.2):length;
        if(length>0)center=center.map(v=>v*safe/length);
      }
      time+=Math.max(0,Math.min(1,elapsed));
      const target=()=>/** @type {number[]} */(center).map((v,i)=>v+(right[i]*Math.cos(phase)+up[i]*Math.sin(phase))*500/U);
      let point=target();
      if(Math.hypot(...point.map((v,i)=>v-own.eye[i]))*U<180){phase+=Math.PI/3;point=target();}
      const input=/** @type {ReturnType<typeof DW.flightAI.create>} */(pilot).step(time,own,{eye:point,velocity:[0,0,0]},profile,weapon);
      return {...input,throttle:.32,throttleRate:0,boost:false,fire:false,secondary:false,countermeasure:false,nextMissileBank:false};
    }
  };
}
