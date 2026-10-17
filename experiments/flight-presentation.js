(function(){
  'use strict';
  var DW=window.Driftworks;
  function model(craft,wave,appearance){
    return DW.shipPackModels.craftModel(craft,craft.team==='ally'?appearance.allyArt:appearance.enemyArt,wave);
  }
  function mount(host,getWorld,setWorld,environment){
    var document=(environment||globalThis).document,units=DW.sim.METERS_PER_UNIT;
    var scene=DW.scene3d.create(host,getWorld,setWorld,{study:true});
    var shipImages=new Map();
    DW.shipPackModels.loadTextures().then(function(images){shipImages=images;}).catch(function(error){document.getElementById('art-credit').textContent=String(error);});
    var skybox=DW.flightSkybox.create(host);
    var artSelect=document.getElementById('enemy-art'),allyArt=document.getElementById('ally-art');DW.shipPackModels.populate(artSelect,true);DW.shipPackModels.populate(allyArt,true);[artSelect,allyArt].forEach(function(select){var option=document.createElement('option');option.value='mixed';option.textContent='Mixed fleet · all ship models';select.insertBefore(option,select.firstChild);select.value='mixed';});
    function artCredit(){var entry=DW.shipPackModels.find(artSelect.value);document.getElementById('art-credit').textContent=artSelect.value==='mixed'?'Mixed fleet · Quaternius CC0 library · changes each wave':entry?entry.pack.author+' / '+entry.model.name+' · '+entry.pack.license+' · '+entry.model.triangles.toLocaleString()+' triangles per ship':'Original six-triangle training hull';}
    function allyCredit(){var entry=DW.shipPackModels.find(allyArt.value);document.getElementById('ally-credit').textContent=allyArt.value==='mixed'?'Mixed fleet · Quaternius CC0 library · changes each wave':entry?entry.pack.author+' / '+entry.model.name+' · '+entry.pack.license:'Original training blockout';}
    allyArt.onchange=allyCredit;allyCredit();artSelect.onchange=artCredit;artCredit();
    // A fresh appearance snapshot is shared with the HUD for this rendered frame.
    function appearance(){return {
      shipImages:shipImages,allyArt:allyArt.value,enemyArt:artSelect.value,
      paint:{ally:paint('ally'),enemy:paint('enemy')}
    };}
    function paint(team){return document.getElementById('faction-paint').checked?DW.shipPackModels.paintColor(document.getElementById(team+'-color').value):undefined;}
    function hullHit(craft,start,end,wave){return DW.shipPackModels.hullHit(model(craft,wave,{allyArt:allyArt.value,enemyArt:artSelect.value}),craft.pose,start,end,units);}
    function pose(state){scene.setSurfaceCamera({eye:state.eye,right:state.right,up:state.up,back:state.back});}
    function render(view,appearance,comparison,elapsed){
      var state=view.state,combat=view.combat,guns=view.guns,world=view.world;
      var livingArt=DW.training.alive(combat).concat(combat.wrecks),actorBatches=[];
      ['ally','enemy'].forEach(function(team){var craft=livingArt.filter(function(e){return (e.team||'enemy')===team;}),selection=team==='ally'?appearance.allyArt:appearance.enemyArt;if(!craft.length)return;var batches=selection?DW.shipPackModels.sourceFleetGeometry(craft,selection,combat.wave,units,appearance.shipImages,appearance.paint[team]):DW.training.geometry({enemies:craft.map(function(e){return Object.assign({},e,{hp:1});})});batches.forEach(function(batch){actorBatches.push(batch);});});
      ['ally','enemy'].forEach(function(team){var craft=livingArt.filter(function(e){return (e.team||'enemy')===team;});DW.shipPackModels.scorchGeometry(craft,team==='ally'?appearance.allyArt:appearance.enemyArt,combat.wave,units).forEach(function(batch){actorBatches.push(batch);});});
      scene.setStudyActors(actorBatches);var effectBatches=DW.flightGuns.geometry(DW.training.allGuns(combat,guns),state),engineParts=[];
      ['ally','enemy'].forEach(function(team){var craft=DW.training.alive(combat).filter(function(e){return (e.team||'enemy')===team;});engineParts.push(DW.shipPackModels.engineGeometry(craft,team==='ally'?appearance.allyArt:appearance.enemyArt,combat.wave,units,state,world.elapsedSeconds).vertices);});
      var engines=new Float32Array(engineParts.reduce(function(n,p){return n+p.length;},0)),engineOffset=0;engineParts.forEach(function(p){engines.set(p,engineOffset);engineOffset+=p.length;});
      effectBatches.push({vertices:engines,color:[.25,.65,1]});scene.setStudyEffects(effectBatches);
      scene.setStudyDiagnostics(comparison);
      skybox.render(state,comparison.scale,comparison.mode==='empty');
      scene.sync(world);scene.render(world,1,0,elapsed);
    }
    function renderStats(){return {scene:scene.getRenderStats(),sky:skybox.getRenderStats()};}
    return {appearance:appearance,hullHit:hullHit,pose:pose,render:render,renderStats:renderStats};
  }
  DW.flightPresentation={mount:mount,model:model};
}());
