// Study adapter: gameplay owns the behavior; this page supplies mesh fits and controls.
(function(){
  const runtime=window.Driftworks.miningLanding;
  window.Driftworks.miningStudyLanding={duration:runtime.duration,
    pose:(fit,time)=>runtime.pose(fit,time,{unitsPerMetre:32/36,spin:.006}),
    choose:(context,preferred)=>{
      for(const delta of [0,8,-8,16,-16,24,-24,32,-32,40,-40,48,-48]){
        const site=preferred+delta;if(site < -48 || site > 48)continue;
        const fit=context.landing(site);if(fit&&fit.valid)return {site,fit};
      }return null;
    }
  };
})();
