(function(){
  'use strict';
  var DW=window.Driftworks,source=DW.shipPackModels.find('quaternius-ultimate-spaceships:Spitfire').model;
  var asteroid=DW.sim.createInitialWorld().asteroids[0];
  asteroid.position={x:0,y:0};asteroid.previousPosition={x:0,y:0};asteroid.rotation=0;asteroid.radius=400;
  var cache={},terrainMesh=null,landingCache={},samples={},rampCache={},stats={meshBuilds:0,siteFits:0,cacheHits:0,rampSolves:0};
  function height(x,y){return DW.scene3d.surfaceHeight(asteroid,x/asteroid.radius,y/asteroid.radius)*asteroid.radius;}
  var base=height(0,0);
  var min=Infinity,max=-Infinity;
  for(var i=1;i<source.vertices.length;i+=6){min=Math.min(min,source.vertices[i]);max=Math.max(max,source.vertices[i]);}
  DW.miningStudyContext={asteroid:asteroid,base:base,height:height,landing:function(offset){
    if(!terrainMesh){stats.meshBuilds++;terrainMesh=DW.scene3d.asteroidMesh(asteroid);}
    if(!Object.prototype.hasOwnProperty.call(landingCache,offset)){stats.siteFits++;var site=[offset,offset*.38],sample=DW.miningStudyTerrain.meshSampler(terrainMesh,asteroid.radius,site);samples[offset]=sample;landingCache[offset]=DW.miningStudyTerrain.fit(sample,site);if(landingCache[offset])landingCache[offset].sample=sample;}
    else stats.cacheHits++;
    return landingCache[offset];
  },ramps:function(offset){
    var landing=this.landing(offset);if(!landing)return null;
    if(!Object.prototype.hasOwnProperty.call(rampCache,offset)){stats.rampSolves++;rampCache[offset]=DW.miningStudyTerrain.rampStops(landing.sample,landing,function(t){return DW.scene3d.miningPlatformGeometry(1,0,false,t);});}
    return rampCache[offset];
  },performance:function(){return {meshBuilds:stats.meshBuilds,siteFits:stats.siteFits,cacheHits:stats.cacheHits,rampSolves:stats.rampSolves,rampQueries:Object.keys(samples).reduce(function(sum,key){return sum+samples[key].stats.rampQueries;},0),raycasts:Object.keys(samples).reduce(function(sum,key){return sum+samples[key].stats.raycasts;},0)};},geometry:function(rigLength,surface,fighter){
    var batches=[];
    if(fighter){
      if(!cache[rigLength]){
        var units=(max-min)/(12*32/rigLength),pose={eye:[-22,-21,27],right:[0,-1,0],back:[-1,0,0],up:[0,0,1]};
        cache[rigLength]=DW.shipPackModels.detailedGeometry(source,[pose],units);
      }
      batches=batches.concat(cache[rigLength]);
    }
    return batches;
  }};
})();
