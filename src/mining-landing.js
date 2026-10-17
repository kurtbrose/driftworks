(function(root){
  /** @typedef {import('./types').LandingFit} LandingFit */
  /** @typedef {import('./types').LandingOptions} LandingOptions */
  'use strict';
  /** @param {number} t */
  const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
  // Durations are simulation seconds; distances are metres until the renderer converts them.
  const duration=38;
  /** @param {number} time */
  function sample(time){
    const t=Math.max(0,Math.min(duration,time)),match=smooth((t-3)/6),travel=smooth((t-9)/7);
    return {time:Math.max(0,time),altitude:50*(1-smooth((t-21)/11)),deployment:smooth((t-16)/5),ramps:smooth((t-33)/5),match,travel,
      offset:[18*(1-travel),-12*(1-travel)],headingOffset:.55*(1-match),contact:t>=32,done:t>=duration,
      phase:t<3?'Finding landing site':t<9?'Matching asteroid rotation':t<16?'Translating to landing point':t<21?'Deploying legs':t<32?'Descending':t<33?'Ground contact':t<38?'Deploying ramps':'Landed'};
  }
  /** @param {LandingFit} fit @param {number} time @param {LandingOptions} [options] */
  function pose(fit,time,options={}){
    const state=sample(time),unitsPerMetre=options.unitsPerMetre===undefined?1:options.unitsPerMetre;
    const angle=(options.spin || 0)*state.time,yaw=state.headingOffset,c=Math.cos(yaw),s=Math.sin(yaw);
    /** @param {number[]} p */
    const rotate=p=>{const v=[p[0]*c-p[1]*s,p[0]*s+p[1]*c,p[2]];return v.map((_,k)=>fit.basis.reduce((sum,axis,i)=>sum+axis[k]*v[i],0));};
    const origin=fit.origin.map((v,k)=>v+(k===0?state.offset[0]*unitsPerMetre:k===1?state.offset[1]*unitsPerMetre:state.altitude*unitsPerMetre));
    const cs=Math.cos(angle),sn=Math.sin(angle);
    /** @param {number[]} p */
    const spinPoint=p=>[p[0]*cs-p[1]*sn,p[0]*sn+p[1]*cs,p[2]];
    // Blend from inertial release heading to full asteroid-relative attitude.
    const inertial=-angle*(1-state.match),ci=Math.cos(inertial),si=Math.sin(inertial);
    /** @param {number[]} p */
    const rotation=p=>{const v=rotate(p);return spinPoint([ci*v[0]-si*v[1],si*v[0]+ci*v[1],v[2]]);};
    return {...state,angle,
      /** @param {number[]} p */
      world:p=>{const v=rotation(p),o=spinPoint(origin);return v.map((x,k)=>x+o[k]);},rotate:rotation,
      /** @param {number[]} p */ ground:p=>spinPoint(p)};
  }
  const api={sample,pose,duration};
  /** @type {import('./types').DriftworksNamespace} */
  var DW=(root.Driftworks=root.Driftworks || {});DW.miningLanding=api;
})(window);
