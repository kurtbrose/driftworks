(function(){
  'use strict';
  var DW=window.Driftworks;
  function radius(model){var v=model.vertices,r=1;for(var i=0;i<v.length;i+=6)r=Math.max(r,Math.hypot(v[i],v[i+1],v[i+2]));return r;}
  function mount(host){
    var world=DW.sim.createInitialWorld();world.asteroids=[];world.ships=[];world.platforms=[];world.wrecks=[];world.packets=[];world.combat.drones=[];world.selectedShipIds=[];
    var scene=null,last=-Infinity;
    return {update:function(target,selection,wave,units,images,paint,view,time){
      if(!target||!host.clientWidth||document.hidden)return;
      if(time-last<1/15&&time>=last)return;last=time;
      if(!scene){scene=DW.scene3d.create(host,function(){return world;},function(w){world=w;},{study:true});scene.setStudyDiagnostics({mode:'normal',scale:1,rubble:false,mothership:false,actors:true});}
      var model=DW.shipPackModels.craftModel(target,selection,wave),pose=Object.assign({},target.pose,{eye:[0,0,0]});
      var centered=Object.assign({},target,{pose:pose});
      world.camera={x:0,y:0,zoom:Math.min(host.clientWidth,host.clientHeight)*.46/(radius(model)/units)};
      // Track aspect relative to the player's view, with a small elevated sensor angle.
      var yaw=Math.atan2(view.back[0],-view.back[1]);scene.setOrbit({yaw:yaw,tilt:1.12,height:0});
      scene.setStudyActors(model.texturedVertices?[DW.shipPackModels.sourceGeometry(model,[pose],units,images.get(model.id),paint)]:DW.shipPackModels.geometry(model,[pose],units));
      scene.setStudyEffects(DW.shipPackModels.scorchGeometry([centered],selection,wave,units));scene.sync(world);scene.render(world,1,0,1/15);
    }};
  }
  DW.flightTargetCamera={radius:radius,mount:mount};
}());
