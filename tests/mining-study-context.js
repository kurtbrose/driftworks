(function(){
  'use strict';
  var DW=window.Driftworks,source=DW.shipPackModels.find('quaternius-ultimate-spaceships:Spitfire').model;
  var asteroid=DW.sim.createInitialWorld().asteroids[0];
  asteroid.position={x:0,y:0};asteroid.previousPosition={x:0,y:0};asteroid.rotation=0;asteroid.radius=400;
  var cache={};
  function height(x,y){return DW.scene3d.surfaceHeight(asteroid,x/asteroid.radius,y/asteroid.radius)*asteroid.radius;}
  var base=height(0,0);
  var min=Infinity,max=-Infinity;
  for(var i=1;i<source.vertices.length;i+=6){min=Math.min(min,source.vertices[i]);max=Math.max(max,source.vertices[i]);}
  DW.miningStudyContext={asteroid:asteroid,base:base,height:height,geometry:function(rigLength,surface,fighter){
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
