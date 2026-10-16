(function(){
  'use strict';
  var DW=window.Driftworks,host=document.getElementById('viewer'),world=DW.sim.createInitialWorld();
  world.asteroids=[];world.ships=[];world.platforms=[];world.wrecks=[];world.packets=[];world.combat.drones=[];world.selectedShipIds=[];
  var scene=DW.scene3d.create(host,function(){return world;},function(value){world=value;},{study:true});
  var select=document.getElementById('ship-model'),units=DW.sim.METERS_PER_UNIT;
  DW.shipPackModels.populate(select,false);
  var pose={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]},rotating=true,last=0;
  function reset(){world.camera={x:0,y:0,zoom:Math.min(host.clientWidth,host.clientHeight)*.27/(8.5/units)};scene.setOrbit({yaw:.4,tilt:.9,height:0});}
  var revision=0,images=DW.shipPackModels.loadTextures();
  async function update(){
    var ticket=++revision,entry=DW.shipPackModels.find(select.value),model=entry.model;
    var metadata=document.getElementById('metadata');metadata.textContent='Loading '+model.name+'...';scene.setStudyActors([]);
    document.getElementById('source').href=entry.pack.url;document.getElementById('provenance').href='../assets/ships/'+entry.pack.id+'/README.md';reset();
    try{
      var textures=await images;if(ticket!==revision)return;
      scene.setStudyActors([DW.shipPackModels.sourceGeometry(model,[pose],units,textures.get(model.id))]);
      metadata.textContent=entry.pack.author+' / '+model.name+'\n'+entry.pack.license+'\nOriginal glTF texture, UVs and normals\n'+(model.texturedVertices.length/24).toLocaleString()+' triangles';
    }catch(error){if(ticket===revision)metadata.textContent=String(error);}
  }
  select.value='quaternius-ultimate-spaceships:Striker';
  select.onchange=update;document.getElementById('reset-view').onclick=reset;
  document.getElementById('spin').onclick=function(){rotating=!rotating;this.textContent=rotating?'Pause rotation':'Resume rotation';};
  host.addEventListener('pointerdown',function(){rotating=false;document.getElementById('spin').textContent='Resume rotation';});
  reset();update();
  function frame(now){requestAnimationFrame(frame);if(now-last<1000/30)return;var dt=Math.min(.1,(now-last)/1000);last=now;if(document.hidden)return;if(rotating){var orbit=scene.getOrbit();scene.setOrbit({yaw:orbit.yaw+dt*.3,tilt:orbit.tilt});}scene.sync(world);scene.render(world,1,0,dt);}
  requestAnimationFrame(frame);
}());
