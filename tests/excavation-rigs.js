// Study placement uses the rendered cavern triangles and the production rig fit.
export function excavationRigs(asteroid,data){
  const DW=window.Driftworks,terrain=DW.miningTerrain,e=asteroid.excavation;
  const metres=asteroid.radius*DW.sim.METERS_PER_UNIT;
  const scale=terrain.metresPerModelUnit/metres,modelRadius=1/scale;
  const depth=Math.min(.42,Math.max(.03,e.depthM/metres));
  const rigs=[];
  for(const side of [-1,1]){
    let selected=null;
    for(const y of [0,25,-25,50,-50]){
      for(const x of [45,65,85,105]){
        const site=[e.pocketOffset.x*modelRadius+side*x/terrain.metresPerModelUnit,e.pocketOffset.y*modelRadius+y/terrain.metresPerModelUnit];
        const mesh=terrain.meshSampler(data,modelRadius,site);
        // Start in the void so the intact roof cannot be mistaken for the floor.
        const sample={...mesh,at:(x,y)=>mesh.ray([x,y,-depth*modelRadius],[0,0,-1])};
        const fit=terrain.fit(sample,site);
        if(fit&&fit.valid){selected={fit,sample};break;}
      }
      if(selected)break;
    }
    if(!selected)continue;
    const {fit,sample}=selected;
    const stops=terrain.rampStops(sample,fit,t=>DW.miningRig.ramps(t));
    const base=DW.scene3d.miningPlatformContactGeometry(1,1,'',terrain.contactPoses(fit,1),stops);
    const fixtures=DW.miningRig.lights(),groups={};
    for(const key of new Set([...Object.keys(base),...Object.keys(fixtures)]))groups[key]=[...(base[key]||[]),...(fixtures[key]||[])];
    const pose={world:p=>fit.world(p).map(v=>v*scale),rotate:fit.rotate};
    rigs.push({groups,pose,fit,scale,footprintM:36});
  }
  return rigs;
}
