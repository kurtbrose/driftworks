(function(global){
  'use strict';
  var DW=/** @type {Required<import('./types').DriftworksNamespace>} */ (global.Driftworks);
  /** @type {import('../experiments/types').Batch[] | null} */
  var cached=null;
  DW.originalShipModels=[{
    id:'driftworks:mining-rig',name:'Asteroid mining rig',author:'Driftworks',
    provenance:'../assets/ships/driftworks-originals/README.md',study:'../tests/mining-platform-orbit.html',
    /** Catalog comparison geometry, normalized to the same 17 m sphere as imported ships.
     * @param {number} units @returns {import('../experiments/types').Batch[]} */
    geometry:function(units){
      if(!cached){
        var groups=DW.scene3d.miningPlatformGeometry(1,0,false,0,''),radius=0;
        /** @type {Record<string,[number,number,number]>} */
        var colors={ochre:[.83,.64,.29],steel:[.46,.53,.52],dark:[.10,.15,.17],light:[.89,.79,.49],lamp:[1,.94,.78],marker:[.35,.95,.85]};
        Object.keys(groups).forEach(function(key){var v=groups[key];for(var i=0;i<v.length;i+=6)radius=Math.max(radius,Math.hypot(v[i]+1,v[i+1],v[i+2]-7));});
        cached=Object.keys(groups).map(function(key){var vertices=new Float32Array(groups[key]);for(var i=0;i<vertices.length;i+=6){vertices[i]=(vertices[i]+1)*8.5/radius;vertices[i+1]*=8.5/radius;vertices[i+2]=(vertices[i+2]-7)*8.5/radius;}return {vertices:vertices,bakedDocking:DW.miningLights.bakeDocking(groups[key]),color:colors[key],finish:key==='lamp'||key==='marker'?7:8};});
      }
      return cached.map(function(batch){var vertices=new Float32Array(batch.vertices);for(var i=0;i<vertices.length;i+=6)for(var k=0;k<3;k++)vertices[i+k]/=units;return {vertices:vertices,bakedDocking:batch.bakedDocking,color:batch.color,finish:batch.finish};});
    }
  }];
})(window);
