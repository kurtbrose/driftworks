(function () {
  'use strict';

  window.DriftworksSharedTests = window.DriftworksSharedTests || {};
  window.DriftworksSharedTests.rendering = function (harness, fixtures) {
    var sim = window.Driftworks.sim;
    var game = window.Driftworks.game;
    var hud = window.Driftworks.hud;
    var test = harness.test, assert = harness.assert, assertClose = harness.assertClose;
    var flightDisplayDocument = fixtures.flightDisplayDocument;
    var createFreshWorld = fixtures.createFreshWorld;
    var createDeployedWorld = fixtures.createDeployedWorld;
    var findShip = fixtures.findShip;
    var findPlume = fixtures.findPlume;


  test('rendering', 'operational tether spin limits tip load to 1-3 g at every span', function () {
    [100,50,20,10,2].forEach(function(km) {
      ['1g','2g','3g'].forEach(function(mode,index) {
        var spin=window.Driftworks.flightPresentation.tetherSpin(km,mode);
        assertClose(spin.tipG,index+1);
        assertClose(spin.angularSpeed*km*500,spin.tipSpeed);
        assertClose(spin.periodSeconds*spin.angularSpeed,2*Math.PI);
        assertClose(spin.tipSpeed*spin.tipSpeed,(index+1)*9.80665*km*500);
      });
      ['cargo','gentle','', 'invalid'].forEach(function(legacy) {
        assertClose(window.Driftworks.flightPresentation.tetherSpin(km,legacy).tipG,1);
      });
    });
  });

  test('rendering', 'tether greyboxes preserve all five true metre spans and finite mesh normals', function () {
    [100,50,20,10,2].forEach(function(km) {
      var batches=window.Driftworks.flightPresentation.tetherGeometry(km), xs=[];
      assert(batches.length===3);
      batches.forEach(function(batch) {
        assert(batch.vertices.length%18===0);
        for(var i=0;i<batch.vertices.length;i+=6) {
          xs.push(batch.vertices[i]*sim.METERS_PER_UNIT);
          for(var k=0;k<6;k++) assert(Number.isFinite(batch.vertices[i+k]));
          assertClose(Math.hypot(batch.vertices[i+3],batch.vertices[i+4],batch.vertices[i+5]),1);
        }
      });
      assertClose(Math.max.apply(null,xs)-Math.min.apply(null,xs),km*1000,.01);
    });
  });

  test('rendering', 'surface work light retains metre scale across asteroid sizes', function () {
    var scene=window.Driftworks.scene3d;
    [1,2].forEach(function(scale){
      var a=createFreshWorld().asteroids[0];a.radius*=scale;
      var frame=scene.surfaceFrame(a,[.4,.5,.75]),lamp=scene.surfaceSpotlight(a);
      var offset=lamp.position.map(function(p,i){return (p-frame.point[i]*a.radius)*sim.METERS_PER_UNIT;});
      assertClose(Math.hypot.apply(null,offset),Math.hypot(2,2));
      assertClose(offset.reduce(function(sum,p,i){return sum+p*frame.normal[i];},0),2);
      assertClose(lamp.range*sim.METERS_PER_UNIT,30);
      assertClose(Math.hypot.apply(null,lamp.direction),1);
      assertClose(lamp.direction.reduce(function(sum,p,i){return sum+p*frame.normal[i];},0),-2/Math.hypot(12,2,2));
    });
  });

  test('rendering', 'work-light shadow frame preserves its beam under rotation and camera translation', function () {
    var scene=window.Driftworks.scene3d,a=createFreshWorld().asteroids[0],lamp=scene.surfaceSpotlight(a),camera={x:17,y:-23,zoom:1};
    a.rotation=1.2;
    var f=scene.workLightFrame(a,lamp,camera,4);
    function dot(a,b){return a.reduce(function(sum,p,i){return sum+p*b[i];},0);}
    [f.right,f.up,f.direction].forEach(function(axis){assertClose(Math.hypot.apply(null,axis),1);});
    assertClose(dot(f.right,f.up),0);assertClose(dot(f.right,f.direction),0);assertClose(dot(f.up,f.direction),0);
    assertClose(f.near*sim.METERS_PER_UNIT,.05);assertClose(f.focal,1/Math.tan(Math.acos(.8)));
    a.position={x:a.position.x+123,y:a.position.y-456};camera={x:camera.x+123,y:camera.y-456,zoom:64};
    var moved=scene.workLightFrame(a,lamp,camera,4);
    f.position.forEach(function(p,i){assertClose(p,moved.position[i]);});
    // A target on the beam remains at the center of the shadow image after body rotation.
    var local=lamp.position.map(function(p,i){return p+lamp.direction[i]*lamp.range*.4;}),c=Math.cos(a.rotation),s=Math.sin(a.rotation);
    var target=[a.position.x+c*local[0]-s*local[1]-camera.x,a.position.y+s*local[0]+c*local[1]-camera.y,local[2]-4];
    var delta=target.map(function(p,i){return p-moved.position[i];});
    assertClose(dot(delta,moved.right),0);assertClose(dot(delta,moved.up),0);assertClose(dot(delta,moved.direction),lamp.range*.4);
  });

  test('rendering', 'mixed ship artwork falls back to the collision blockout without a pack', function () {
    var DW = window.Driftworks, packs = DW.shipPacks;
    try {
      DW.shipPacks = [];
      var model = DW.shipPackModels.craftModel({index: 0}, 'mixed', 1);
      assert(model.id === 'blockout' && model.vertices.length === 108);
      assert(DW.shipPackModels.hullHit(model, DW.arcade.create(0), [0,-2,0], [0,2,0], 10));
    } finally { DW.shipPacks = packs; }
  });

  test('rendering', 'flight presentation shares appearance and preserves fleet, wreck and effect submission order',function(){
    var DW=window.Driftworks,doc=flightDisplayDocument(),saved={packs:DW.shipPackModels,scene:DW.scene3d.create,sky:DW.flightSkybox.create,gunGeometry:DW.flightGuns.geometry,blockout:DW.flightSim.geometry};
    var events=[],fleets=[],scorches=[],engines=[],actors,effects,hullQuery,textureImages=new Map(),sourceWorld={},world=sourceWorld,sceneStats={},skyStats={};
    var scene={setStudyExplosions:function(){},setSurfaceCamera:function(pose){events.push('pose');assert(pose.eye===player.eye);},setStudyActors:function(value){events.push('actors');actors=value;},setStudyEffects:function(value){events.push('effects');effects=value;},setStudyDiagnostics:function(value){events.push('diagnostics');assert(value===comparison);},sync:function(value){events.push('sync');assert(value===world);},render:function(value,a,b,dt){events.push('scene');assert(value===world&&a===1&&b===0&&dt===.05);},getRenderStats:function(){return sceneStats;}};
    var player=DW.arcade.create(20),comparison={mode:'empty',scale:.5};
    function craft(id,team,hp){return {id:id,team:team,hp:hp,pose:DW.arcade.create(20),guns:DW.flightGuns.create()};}
    var ally=craft('ally','ally',90),enemy=craft('enemy','enemy',90),dead=craft('dead','enemy',0),wreck=craft('wreck','ally',0),combat=DW.flightSim.create();
    combat.enemies=[ally,enemy,dead];combat.wrecks=[wreck];combat.wave=3;world.elapsedSeconds=7;
    try{
      DW.scene3d.create=function(host,getWorld,setWorld,options){assert(options.study&&options.viewer===false&&getWorld()===sourceWorld);setWorld({elapsedSeconds:7,asteroids:[]});assert(getWorld()===world);return scene;};
      DW.flightSkybox.create=function(){return {render:function(state,scale,empty){events.push('sky');assert(state===player&&scale===.5&&empty);},getRenderStats:function(){return skyStats;}};};
      DW.shipPackModels=Object.assign({},saved.packs,{
        populate:function(){},loadTextures:function(){return {then:function(fn){fn(textureImages);return {catch:function(){}};}};},
        craftModel:function(craft,selection,wave){return {id:selection+':'+wave+':'+craft.id};},
        hullHit:function(model,pose,start,end,units){hullQuery={model:model,pose:pose,start:start,end:end,units:units};return hullQuery;},
        sourceFleetGeometry:function(craft,selection,wave,units,images,paint){var batch={kind:'hull',craft:craft,selection:selection,wave:wave,units:units,images:images,paint:paint};fleets.push(batch);return [batch];},
        sourceScorchGeometry:function(craft,selection){var batch={kind:'scorch',craft:craft,selection:selection};scorches.push(batch);return [batch];},
        engineGeometry:function(craft,selection,wave,units,state,time){engines.push(craft);assert(time===7&&state===player);return {vertices:new Float32Array([craft[0].team==='ally'?1:2])};}
      });
      DW.flightGuns.geometry=function(){return [{kind:'guns'}];};
      var presentation=DW.flightPresentation.mount({},function(){return world;},function(value){world=value;},{document:doc});
      assert(doc.getElementById('enemy-art').value==='mixed'&&doc.getElementById('ally-art').value==='mixed');
      assert(doc.getElementById('art-credit').textContent.indexOf('Mixed fleet')===0);
      doc.getElementById('ally-art').value='friendly';doc.getElementById('enemy-art').value='hostile';
      doc.getElementById('faction-paint').checked=true;doc.getElementById('ally-color').value='#607451';doc.getElementById('enemy-color').value='#bd713f';
      var appearance=presentation.appearance();assert(appearance.shipImages===textureImages);
      assert(DW.flightPresentation.model(ally,3,appearance).id==='friendly:3:ally');
      assert(!presentation.hullHit, 'Presentation does not supply authoritative collision');
      presentation.pose(player);presentation.render({state:player,combat:combat,guns:DW.flightGuns.create(),world:world},appearance,comparison,.05);
      assert(events.join(',')==='pose,actors,effects,diagnostics,sky,sync,scene');
      assert(actors.map(function(batch){return batch.kind;}).join(',')==='hull,hull,scorch,scorch');
      assert(fleets[0].craft[0]===ally&&fleets[0].craft[1]===wreck&&fleets[1].craft.length===1&&fleets[1].craft[0]===enemy);
      assert(fleets[0].paint===appearance.paint.ally&&fleets[1].paint===appearance.paint.enemy&&fleets[1].selection==='hostile');
      assert(scorches[0].craft[1]===wreck&&engines[0].length===1&&engines[1].length===1);
      assert(effects[0].kind==='guns'&&Array.from(effects[1].vertices).join(',')==='1,2');
      assert(presentation.renderStats().scene===sceneStats&&presentation.renderStats().sky===skyStats);
      world.asteroids=[sim.createInitialWorld().asteroids[0]];
      var beforeCrews=JSON.stringify(world);
      var rigGeometry=DW.scene3d.miningPlatformGeometry, rampStates=[];
      try {
        DW.scene3d.miningPlatformGeometry=function(deployment,time,working,open,cut){rampStates.push(open);return rigGeometry(deployment,time,working,open,cut);};
        presentation.render({state:player,combat:combat,guns:DW.flightGuns.create(),world:world},appearance,comparison,.05);
      } finally { DW.scene3d.miningPlatformGeometry=rigGeometry; }
      assert(rampStates.join(',')==='0,1','Flight scenery includes both closed and fully open source rigs');
      var materialCount=Object.keys(DW.scene3d.miningPlatformGeometry(1,0,false,0,'')).length;
      var crewBatches=actors.slice(-materialCount);
      assert(crewBatches.length===materialCount&&crewBatches.every(function(b){return b.vertices.length>0&&b.vertices.length%18===0&&Array.from(b.vertices).every(Number.isFinite);}));
      var sourceRig=DW.scene3d.miningPlatformGeometry(1,0,false,0,'');
      var openSourceRig=DW.scene3d.miningPlatformGeometry(1,0,false,1,'');
      Object.keys(sourceRig).forEach(function(material,index){assert(crewBatches[index].vertices.length===sourceRig[material].length+openSourceRig[material].length*2,'Three complete current rigs: two open, one closed');});
      assert(crewBatches.some(function(b){return b.finish===7;}),'Flight fixtures retain emissive materials');
      assert(crewBatches.some(function(b){return b.bakedDocking&&Array.from(b.bakedDocking).some(function(v){return v>0;});}),'Flight retains baked docking wash');
      assert(DW.miningLights.placedLights(crewBatches).length===3,'All three flight rigs carry their own lighting frames');
      crewBatches.forEach(function(b){if(b.bakedDocking)assert(b.bakedDocking.length===b.vertices.length/2,'Merged lighting matches every vertex');});
      assert(JSON.stringify(world)===beforeCrews,'Surface scenery must not change persistent world state');
      presentation.render({state:player,combat:combat,guns:DW.flightGuns.create(),world:world},appearance,comparison,.05);
      assert(actors[actors.length-1].vertices===crewBatches[materialCount-1].vertices,'Static crew geometry is reused across frames');
      var surfaceQuery=DW.scene3d.surfaceFrame, queries=0;
      try {
        DW.scene3d.surfaceFrame=function(a,d){queries++;return surfaceQuery(a,d);};
        for(var spinFrame=0;spinFrame<20;spinFrame++) {
          world.asteroids[0].rotation+=.001;
          world.asteroids[0].position.x+=1;
          presentation.render({state:player,combat:combat,guns:DW.flightGuns.create(),world:world},appearance,comparison,.05);
          var attached=actors.slice(-materialCount);
          attached.forEach(function(batch,index){
            assert(batch.vertices===crewBatches[index].vertices&&batch.staticGeometry);
            assertClose(batch.rotation,world.asteroids[0].rotation);
            assertClose(batch.origin[0],world.asteroids[0].position.x);
          });
        }
        assert(queries===0,'Spin and translation must not repeat attachment terrain sampling');
        world.asteroids[0].radius+=1;
        presentation.render({state:player,combat:combat,guns:DW.flightGuns.create(),world:world},appearance,comparison,.05);
        assert(queries>0&&actors[actors.length-1].vertices!==crewBatches[materialCount-1].vertices,'Resizing rebuilds attachment geometry');
      } finally { DW.scene3d.surfaceFrame=surfaceQuery; }
      var savedCrew=DW.miningStudyCrew;
      try {
        var pose=[{vertices:[0,0,0,0,0,1,1,0,0,0,0,1,0,0,1,0,0,1],color:[.8,.8,.8]}];
        DW.miningStudyCrew={poses:{standing:pose,servicing:pose},error:null};
        presentation.render({state:player,combat:combat,guns:DW.flightGuns.create(),world:world},appearance,comparison,.05);
        assert(actors.length===4+materialCount+1&&actors[actors.length-1].vertices.length===18*5*3,'Loaded source poses add five astronauts per rig');
        assert(actors[4]!==crewBatches[0],'Asynchronous pose loading invalidates the scenery cache');
      } finally { DW.miningStudyCrew=savedCrew; }
      world.asteroids=[];
      doc.getElementById('faction-paint').checked=false;doc.getElementById('ally-art').value='';doc.getElementById('enemy-art').value='';
      var plain=presentation.appearance();assert(plain.paint.ally===undefined&&plain.paint.enemy===undefined);
      var blockouts=[];DW.flightSim.geometry=function(value){blockouts.push(value.enemies);return [{kind:'blockout'}];};
      presentation.render({state:player,combat:combat,guns:DW.flightGuns.create(),world:world},plain,comparison,.05);
      assert(blockouts.length===2&&blockouts[0].length===2&&blockouts[0].every(function(craft){return craft.hp===1;}));
      assert(wreck.hp===0&&ally.hp===90,'Blockout batching must not mutate combatants or wrecks');
    }finally{DW.shipPackModels=saved.packs;DW.scene3d.create=saved.scene;DW.flightSkybox.create=saved.sky;DW.flightGuns.geometry=saved.gunGeometry;DW.flightSim.geometry=saved.blockout;}
  });
  test('rendering', 'faction paint is optional and stays separate from shared source textures',function(){
    var api=window.Driftworks.shipPackModels,model=window.Driftworks.shipPacks[0].models[0],texture={},images=new Map([[model.id,texture]]),pose={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]},craft=[{index:0,pose:pose}];
    var green=api.paintColor('#38BFA0');assertClose(green[0],56/255,.000001);assert(api.paintColor('bad')===undefined);
    var direct=api.sourceGeometry(model,[pose],10,texture,green),original=api.sourceGeometry(model,[pose],10,texture);
    assert(direct.paint===green);assert(original.paint===undefined);assert(direct.texture===original.texture);assert(direct.vertices.every(function(v,i){return v===original.vertices[i];}));
    var mixed=api.sourceFleetGeometry(craft,'mixed',1,10,images,green);assert(mixed.length===1&&mixed[0].paint===green);
  });
  test('rendering', 'wreck hulls lose faction paint without mutating shared live geometry',function(){
    var api=window.Driftworks.shipPackModels,model=window.Driftworks.shipPacks[0].models[0],images=new Map(),paint=[.2,.8,.3];
    var pose={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]};
    var live={index:0,modelId:model.id,pose:pose,hp:10},wreck={index:1,modelId:model.id,pose:pose,age:0};
    [true,false].forEach(function(transforms){
      var batches=api.sourceFleetGeometry([live,wreck],model.id,1,10,images,paint,transforms);
      assert(batches.length===2);assert(batches[0].paint===paint);assert(batches[1].paint===undefined);
      assert(batches[0].vertices.every(function(v,i){return v===batches[1].vertices[i];}));
      if(transforms)assert(batches[0].vertices===batches[1].vertices);
    });
  });
  test('rendering', 'source ship fleets preserve artist UVs and normals across poses without dropping models',function(){
    var api=window.Driftworks.shipPackModels,models=window.Driftworks.shipPacks[0].models,images=new Map(),craft=[];
    models.forEach(function(m,i){images.set(m.id,{name:m.name});craft.push({index:i,modelId:m.id,pose:{eye:[3,4,5],right:[0,1,0],back:[-1,0,0],up:[0,0,1]}});});
    var batches=api.sourceFleetGeometry(craft,'mixed',1,10,images);assert(batches.length===11);
    batches.forEach(function(b,i){var v=models[i].texturedVertices;assert(b.stride===8);assert(b.texture===images.get(models[i].id));assert(b.vertices.length===v.length);assertClose(b.vertices[0],3+v[1]/10,.00001);assertClose(b.vertices[1],4+v[0]/10,.00001);assertClose(b.vertices[3],v[4],.00001);for(var j=0;j<v.length;j+=8){assertClose(b.vertices[j+6],v[j+6],.000001);assertClose(b.vertices[j+7],v[j+7],.000001);}});
    assert(api.sourceFleetGeometry([],'mixed',1,10,images).length===0);
  });
  test('rendering', 'cached flight draw transforms match baked hull positions, normals and UVs',function(){
    var DW=window.Driftworks,api=DW.shipPackModels,models=DW.shipPacks[0].models;
    var half=Math.SQRT1_2,pose={eye:[3,4,5],right:[half,half,0],back:[.5,-.5,half],up:[-.5,.5,half]},images=new Map();
    var craft=models.map(function(model,index){return {index:index,modelId:model.id,pose:pose};});
    var draws=api.sourceFleetGeometry(craft,'mixed',1,10,images,undefined,true);
    assert(draws.length===models.length);
    draws.forEach(function(batch,index){
      var baked=api.sourceGeometry(models[index],[pose],10),v=batch.vertices,m=batch.basis;
      assert(batch.staticGeometry&&batch.stride===8&&batch.origin===pose.eye&&batch.scale===.1);
      for(var i=0;i<v.length;i+=8){
        for(var k=0;k<3;k++){
          assertClose(batch.origin[k]+batch.scale*(m[k]*v[i]+m[k+3]*v[i+1]+m[k+6]*v[i+2]),baked.vertices[i+k],.00001);
          assertClose(m[k]*v[i+3]+m[k+3]*v[i+4]+m[k+6]*v[i+5],baked.vertices[i+3+k],.00001);
        }
        assertClose(v[i+6],baked.vertices[i+6],.000001);assertClose(v[i+7],baked.vertices[i+7],.000001);
      }
      var moved=Object.assign({},pose,{eye:[6,7,8]});
      var next=api.sourceDraw(models[index],moved,20,undefined,[.2,.3,.4]);
      assert(next.vertices===v&&next.origin===moved.eye&&next.scale===.05&&next.paint[0]===.2);
    });
    var model={id:'replaceable',texturedVertices:[0,0,0,0,0,1,0,0]};
    var first=api.sourceDraw(model,pose,10);
    model.texturedVertices=[1,0,0,0,0,1,0,0];
    assert(api.sourceDraw(model,pose,10).vertices!==first.vertices,'Replacing source data invalidates the mesh cache');
  });
  test('rendering', 'target bounds scan each source vertex array once',function(){
    var reads=0,source=new Proxy([3,4,0,0,0,1],{get:function(target,key){if(key==='0'||key==='1'||key==='2')reads++;return target[key];}});
    var model={vertices:source},api=window.Driftworks.flightTargetCamera;
    assert(api.radius(model)===5&&reads===3);
    assert(api.radius(model)===5&&reads===3);
    model.vertices=[0,0,12,0,0,1];assert(api.radius(model)===12);
  });

  test('rendering', 'imported ship geometry transforms positions and normals without changing the source',function(){
    var api=window.Driftworks.shipPackModels,m=window.Driftworks.shipPacks[0].models[0],original=m.vertices.slice(),pose={eye:[3,4,5],right:[0,1,0],back:[-1,0,0],up:[0,0,1]};
    var batch=api.geometry(m,[pose,pose],10)[0];assert(batch.vertices.length===m.vertices.length*2);assertClose(batch.vertices[0],3+m.vertices[1]/10,.00001);assertClose(batch.vertices[1],4+m.vertices[0]/10,.00001);assertClose(batch.vertices[3],m.vertices[4],.00001);assert(m.vertices.every(function(v,i){return v===original[i];}));assert(api.geometry(m,[],10)[0].vertices.length===0);
  });

  test('rendering', 'default fighter noses face pose forward after pack axis conversion',function(){
    var api=window.Driftworks.shipPackModels;
    ['quaternius-ultimate-spaceships:Challenger'].forEach(function(id){
      var model=api.find(id).model,v=model.vertices,lo=Infinity,hi=-Infinity;
      for(var i=0;i<v.length;i+=6){lo=Math.min(lo,v[i+1]);hi=Math.max(hi,v[i+1]);}
      var noseWidth=0,tailWidth=0;
      for(var j=0;j<v.length;j+=6){if(v[j+1]>hi-(hi-lo)*.1)noseWidth=Math.max(noseWidth,Math.abs(v[j]));if(v[j+1]<lo+(hi-lo)*.1)tailWidth=Math.max(tailWidth,Math.abs(v[j]));}
      assert(noseWidth<tailWidth*.6,'nose must lead narrow end for '+id);
      var pose={eye:[3,4,5],right:[1,0,0],back:[0,1,0],up:[0,0,1]},batch=api.geometry(model,[pose],10)[0];
      var nose=0;for(var k=0;k<v.length;k+=6)if(v[k+1]>v[nose+1])nose=k;
      assert(batch.vertices[nose+1]<pose.eye[1],'nose must project along -back');
    });
  });

  test('rendering', 'mixed fighter fleets cover the placeholder and concept libraries, keep assignments and merge finishes',function(){
    var api=window.Driftworks.shipPackModels,seen={},pose={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]},craft=[];
    for(var wave=1;wave<=3;wave++)for(var i=0;i<16;i++){var model=api.mixedModel(i,wave);seen[model.id]=true;assert(api.mixedModel(i,wave)===model);}
    assert(Object.keys(seen).length===14);['raptor','bulldog','halo'].forEach(function(name){assert(seen['concept-trio:'+name]);});
    for(var j=0;j<8;j++)craft.push({index:j,pose:pose});
    var batches=api.fleetGeometry(craft,'mixed',1,10),expected=0;
    craft.forEach(function(e){api.detailedGeometry(api.mixedModel(e.index,1),[pose],10).forEach(function(b){expected+=b.vertices.length;});});
    assert(batches.length===4);assert(batches.reduce(function(n,b){return n+b.vertices.length;},0)===expected);
    assert(api.mixedModel(2,1)===api.mixedModel(craft.filter(function(e){return e.index===2;})[0].index,1));
    assert(api.fleetGeometry([],'mixed',1,10).length===0);
  });

  test('rendering', 'fighter exhaust stays aft, batches finite glow geometry and shuts down on disable',function(){
    var api=window.Driftworks.shipPackModels,pose={eye:[3,4,5],right:[1,0,0],back:[0,-1,0],up:[0,0,1],throttle:.8};
    window.Driftworks.shipPacks.forEach(function(pack){pack.models.forEach(function(model){
      var anchors=api.engineAnchors(model),v=model.vertices,lo=Infinity,hi=-Infinity;
      for(var i=0;i<v.length;i+=6){lo=Math.min(lo,v[i+1]);hi=Math.max(hi,v[i+1]);}
      assert(anchors.length>=1&&anchors.length<=4);anchors.forEach(function(p){assert(p.every(Number.isFinite));assert(p[1]<0);assert(p[3]>0&&p[3]<1);});
      var craft={index:0,hp:90,pose:pose},batch=api.engineGeometry([craft],model.id,1,10,pose,1);
      assert(batch.vertices.length===anchors.length*72);assert(batch.vertices.every(Number.isFinite));
      craft.hp=0;assert(api.engineGeometry([craft],model.id,1,10,pose,1).vertices.length===0);
      craft.hp=90;craft.age=0;assert(api.engineGeometry([craft],model.id,1,10,pose,1).vertices.length===0);
    });});
    pose.throttle=0;assert(api.engineGeometry([{hp:90,index:0,pose:pose}],'mixed',1,10,pose,1).vertices.length===0);
  });

  test('rendering', 'four-nozzle ships emit from both engine pairs at their own heights',function(){
    var api=window.Driftworks.shipPackModels,pose={eye:[3,4,5],right:[0,1,0],back:[-1,0,0],up:[0,0,1],throttle:1};
    ['Executioner','Spitfire','Insurgent'].forEach(function(name){var id='quaternius-ultimate-spaceships:'+name,m=api.find(id).model,anchors=api.engineAnchors(m);assert(anchors.length===4);assert(new Set(anchors.map(function(p){return p.slice(0,3).join(',');})).size===4);
      var b=api.engineGeometry([{index:0,hp:1,pose:pose}],id,1,10,pose,0).vertices;
      anchors.forEach(function(a,i){var center=[0,0,0];for(var j=0;j<6;j++)for(var k=0;k<3;k++)center[k]+=b[i*72+j*6+k]/6;assertClose(center[0],3+a[1]/10,.00001);assertClose(center[1],4+a[0]/10,.00001);assertClose(center[2],5+a[2]/10,.00001);});
    });
    var spit=api.engineAnchors(api.find('quaternius-ultimate-spaceships:Spitfire').model);assert(new Set(spit.map(function(p){return p[2];})).size===2);
  });
  test('rendering', 'fighter finishes retain source geometry and batch all poses with finite normals',function(){
    var api=window.Driftworks.shipPackModels,pose={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]};
    window.Driftworks.shipPacks.forEach(function(pack){pack.models.forEach(function(model){
      var original=model.vertices.slice(),one=api.detailedGeometry(model,[pose],10),two=api.detailedGeometry(model,[pose,pose],10);
      assert(one.length===4);var count=0;
      one.forEach(function(batch,index){assert(batch.vertices.length%18===0);count+=batch.vertices.length;assert(two[index].vertices.length===batch.vertices.length*2);for(var i=0;i<batch.vertices.length;i+=6){for(var a=0;a<6;a++)assert(Number.isFinite(batch.vertices[i+a]));assertClose(Math.hypot.apply(null,batch.vertices.slice(i+3,i+6)),1,.0001);}});
      assert(count>=original.length&&count<=original.length*7);assert(model.vertices.every(function(v,i){return v===original[i];}));
      assert(api.detailedGeometry(model,[],10).every(function(b){return b.vertices.length===0;}));
    });});
  });
  test('rendering', 'gun rendering batches are bounded and contain world-space triangles', function () {
    var model=window.Driftworks.flightGuns,guns=model.create(),pose=window.Driftworks.arcade.create(18);
    model.step(guns,pose,window.Driftworks.retailWeapons[0],true,1/120);
    var batches=model.geometry(guns,pose);assert(batches.length===4);assert(batches[2].vertices.length===72);
    assert(batches[1].vertices.length===0);batches[2].vertices.forEach(function(x){assert(Number.isFinite(x));});
  });

  test('rendering', 'bolt artwork maintains angular size to thirty metres then shrinks in perspective', function () {
    var DW=window.Driftworks,U=DW.sim.METERS_PER_UNIT,weapon=DW.retailWeapons[0];
    var pose={eye:[10,20,30],right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
    function widthAt(m) {
      var bolt={position:[10,20+m/U,30],direction:[1,0,0],weapon:weapon,age:0};
      var before=JSON.stringify(bolt);
      var vertices=DW.flightGuns.geometry({bolts:[bolt],impacts:[]},pose)[2].vertices;
      assert(JSON.stringify(bolt)===before,'Rendering leaves ballistic state intact');
      var xs=[],zs=[];
      for(var i=0;i<vertices.length;i+=6){xs.push(vertices[i]);zs.push(vertices[i+2]);}
      return [Math.max.apply(null,xs)-Math.min.apply(null,xs),Math.max.apply(null,zs)-Math.min.apply(null,zs)];
    }
    var full=widthAt(30),far=widthAt(60),half=widthAt(15),near=widthAt(3),zero=widthAt(0);
    full.forEach(function(size,i){
      assert(size>0);assertClose(far[i],size,.00001);assertClose(half[i],size*.5,.00001);
      assertClose(near[i],size*.1,.00001);assertClose(zero[i],0,.00001);
      assertClose(near[i]/3,size/30,.00001);
      assertClose(half[i]/15,size/30,.00001);
      assertClose(far[i]/60,size/30*.5,.00001);
    });
  });

  test('rendering', 'flight sky directions rotate with the cockpit, ignore translation, and cover the sphere', function () {
    var sky=window.Driftworks.flightSkybox,pose={right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
    assert(sky.options.length===13 && sky.options[1].includes('Open void') && sky.options[6].includes('Island universes') && sky.options[11].includes('Woven starlight') && sky.options[12].includes('Orbital impact'));
    var center=sky.project([0,1,0],pose,2);assert(center);assertClose(center.x,0);assertClose(center.y,0);
    assert(sky.project([0,-1,0],pose,2)===null);
    var star=[.2,1,.3],before=sky.project(star,pose,2);pose.eye=[10000,20000,-5000];
    assert(JSON.stringify(before)===JSON.stringify(sky.project(star,pose,2)));
    var rolled={right:[0,0,1],up:[-1,0,0],back:[0,-1,0]},after=sky.project(star,rolled,2);
    assertClose(after.x,before.y/2);assertClose(after.y,-before.x*2);
    var data=sky.stars();assert(data.length===12800);assert(JSON.stringify(Array.from(data))===JSON.stringify(Array.from(sky.stars())));
    var hemispheres=[0,0];for(var i=0;i<data.length;i+=4){assertClose(Math.hypot(data[i],data[i+1],data[i+2]),1,.000001);hemispheres[data[i+2]>0?0:1]++;}
    assert(hemispheres[0]>1000 && hemispheres[1]>1000);
  });

  test('rendering', 'study focus picks the nearest surface from either side and rejects misses', function () {
    var pick=window.Driftworks.scene3d.pickStudySurface;
    var front=[-1,-1,2,0,0,1, 1,-1,2,0,0,1, 0,1,2,0,0,1];
    var back=front.map(function(x,i){return i%6===2?x-2:x;});
    var hit=pick([0,0,5],[0,0,-1],[back,front]);
    assert(hit);assertClose(hit[2],2);
    hit=pick([0,0,-5],[0,0,1],[front,back]);assert(hit);assertClose(hit[2],0);
    assert(pick([3,0,5],[0,0,-1],[front])===null);
    assert(pick([0,0,5],[1,0,0],[front])===null);
    assert(pick([0,0,5],[0,0,1],[front])===null);
  });
  test('rendering', 'mothership close inspection refines curved silhouettes within a fixed ceiling', function () {
    var scene=window.Driftworks.scene3d;
    assert(scene.habitatLod(100) === 96);
    assert(scene.habitatLod(800) === 192);
    assert(scene.habitatLod(5000) === 384);
    assert(scene.habitatLod(1000000) === 384, 'Refinement remains bounded');
    var previous=0;
    [1,2,4].forEach(function(detail){
      var mesh=scene.habitatMesh(96*detail),groups=scene.mothershipHardware(detail);
      var hardware=Object.keys(groups).reduce(function(total,key){return total+groups[key].length/18;},0);
      assert(mesh.length>previous, 'Caps and circular shell refine together');
      previous=mesh.length;
      assert(mesh.length/18+hardware<240000, 'Whole ship has a fixed close-up triangle budget');
      for(var i=0;i<mesh.length;i+=6){
        assertClose(Math.hypot(mesh[i+3],mesh[i+4],mesh[i+5]),1,.000002);
        if(Math.abs(mesh[i])<=31)assertClose(Math.hypot(mesh[i+1],mesh[i+2]),17,.000002);
      }
    });
  });
  test('rendering', 'mining rig keeps finite unit normals and folds anchors without idle machinery motion', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry;
    ['current'].forEach(function(variant){
      var deployed=model(1,0,false),folded=model(0,0,false);
      assert(JSON.stringify(deployed)!==JSON.stringify(folded));
      assert(JSON.stringify(deployed)===JSON.stringify(model(1,5,false)));
      assert(JSON.stringify(deployed)===JSON.stringify(model(1,.2,true)));
      Object.keys(deployed).forEach(function(key){var data=deployed[key];assert(data.length%18===0);assert(data.every(Number.isFinite));for(var i=3;i<data.length;i+=6)assertClose(Math.hypot(data[i],data[i+1],data[i+2]),1,.00001);});
    });
  });

  test('rendering', 'inter-leg bay ramps reach ground while the protective cage stays fixed', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry;
    var closed=model(1,0,false,0),open=model(1,0,false,1);
    assert(JSON.stringify(closed.dark.slice(model(1,0,false,0,'',false,false,undefined,undefined,true).dark.length))===JSON.stringify(open.dark.slice(model(1,0,false,1,'',false,false,undefined,undefined,true).dark.length)),'Load-bearing cage remains in place');
    var lowClosed=Infinity,lowOpen=Infinity;
    for(var i=2;i<closed.ochre.length;i+=6)lowClosed=Math.min(lowClosed,closed.ochre[i]);
    for(var i=2;i<open.ochre.length;i+=6)lowOpen=Math.min(lowOpen,open.ochre[i]);
    assert(lowClosed>4 && lowOpen<.01 && lowOpen>-.3,'Door lips reach the surface');
    [0,.5,1].forEach(function(t){var groups=model(1,0,false,t);Object.keys(groups).forEach(function(key){assert(groups[key].every(Number.isFinite));});});
  });

  test('rendering', 'bay hull closes with vertical walls and a roof before two-stage unfolding', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry,closed=model(1,0,false,0),uncovered=model(1,0,false,.4),open=model(1,0,false,1);
    // The first leaf is a vertical wall; the second is the upper closure.
    assertClose(closed.ochre[5],0);
    assertClose(closed.ochre[30*6+5],1);
    for(var i=0;i<30*6;i++)assertClose(closed.ochre[i],uncovered.ochre[i],.000001);
    assert(JSON.stringify(closed)!==JSON.stringify(uncovered));
    assert(JSON.stringify(closed.dark.slice(model(1,0,false,0,'',false,false,undefined,undefined,true).dark.length))===JSON.stringify(open.dark.slice(model(1,0,false,1,'',false,false,undefined,undefined,true).dark.length)));
    [0,.2,.4,.7,1].forEach(function(t){var groups=model(1,0,false,t);Object.keys(groups).forEach(function(k){assert(groups[k].every(Number.isFinite));for(var i=3;i<groups[k].length;i+=6)assertClose(Math.hypot(groups[k][i],groups[k][i+1],groups[k][i+2]),1,.00001);});});
  });

  test('rendering', 'roof shuttle docking collar and four hardpoints stay above the tower', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry,closed=model(1,0,false,0),open=model(1,0,false,1);
    function roof(groups){var result=[];Object.keys(groups).forEach(function(k){for(var i=0;i<groups[k].length;i+=18){if(groups[k][i+2]>13.5 && groups[k][i+8]>13.5 && groups[k][i+14]>13.5)result.push(k+':'+groups[k].slice(i,i+18).join(','));}});return result.join(';');}
    assert(roof(closed)===roof(open),'Docking hardware stays fixed while cargo doors unfold');
    [-1,1].forEach(function(x){[-1,1].forEach(function(y){var found=false,v=closed.ochre;for(var i=0;i<v.length;i+=6)if(Math.sign(v[i])===x && Math.sign(v[i+1])===y && v[i+2]>14.8)found=true;assert(found,'A raised hardpoint in each roof corner');});});
  });

  test('rendering', 'transit shell stays yellow while door inner faces use work-deck grey', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry,closed=model(1,0,false,0),open=model(1,0,false,1);
    assert(JSON.stringify(closed.steel)!==JSON.stringify(open.steel),'Grey door inner faces move with their yellow outer armor');
    assert(JSON.stringify(closed.dark.slice(model(1,0,false,0,'',false,false,undefined,undefined,true).dark.length))===JSON.stringify(open.dark.slice(model(1,0,false,1,'',false,false,undefined,undefined,true).dark.length)),'Permanent dark chassis stays fixed');
    var yellowPad=false;
    for(var i=0;i<closed.ochre.length;i+=6)if(Math.abs(closed.ochre[i+2]-13.74)<.001 && Math.abs(closed.ochre[i])>4)yellowPad=true;
    assert(yellowPad,'Docking pad retains yellow exposed roof armor');
  });

  test('rendering', 'control tower has outward-downward glazing around all eight sides', function () {
    var data=window.Driftworks.scene3d.miningPlatformGeometry(1,0,false,0).dark,faces={};
    for(var i=0;i<data.length;i+=18){
      if(data[i+2]>10 && data[i+2]<11.15 && data[i+5]<-.25){
        var direction=Math.round(Math.atan2(data[i+4],data[i+3])*100);faces[direction]=true;
      }
    }
    assert(Object.keys(faces).length===8,'Every tower face has a lower downward-looking pane');
  });

  test('rendering', 'suspended tower egress is a downward hatch above the cargo deck', function () {
    var v=window.Driftworks.scene3d.miningPlatformGeometry(1,0,false,0).light,faces=0;
    for(var i=0;i<v.length;i+=18){
      if([0,6,12].every(function(k){return v[i+k]>=1.31 && v[i+k]<=4.19 && Math.abs(v[i+k+1])<=1.39 && Math.abs(v[i+k+2]-7.18)<.001;}) && v[i+5]<-.99)faces++;
    }
    assert(faces===2,'Downward outer airlock leaf occupies the suspended pod floor, not cargo-floor height');
  });

  test('rendering', 'door hinge barrels and actuator assemblies stay valid through both hinge stages', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry;
    var closed=model(1,0,false,0),open=model(1,0,false,1);
    assert(JSON.stringify(closed.dark.slice(model(1,0,false,0,'',false,false,undefined,undefined,true).dark.length))===JSON.stringify(open.dark.slice(model(1,0,false,1,'',false,false,undefined,undefined,true).dark.length)),'Root cradles, stops and receivers remain frame-mounted');
    [0,.2,.4,.65,1].forEach(function(t){var groups=model(1,0,false,t);Object.keys(groups).forEach(function(k){var v=groups[k];assert(v.every(Number.isFinite));for(var i=3;i<v.length;i+=6)assertClose(Math.hypot(v[i],v[i+1],v[i+2]),1,.00001);});});
  });

  test('rendering', 'cargo deck has no coplanar black belly or broad chassis top', function () {
    ['current'].forEach(function(variant){
      var groups=window.Driftworks.scene3d.miningPlatformGeometry(1,0,false,1),data=groups.dark,belly=false;
      for(var i=0;i<data.length;i+=18){
        var flat=Math.abs(data[i+2]-data[i+8])<.000001 && Math.abs(data[i+2]-data[i+14])<.000001;
        var broad=Math.max(data[i],data[i+6],data[i+12])-Math.min(data[i],data[i+6],data[i+12])>2 && Math.max(data[i+1],data[i+7],data[i+13])-Math.min(data[i+1],data[i+7],data[i+13])>2;
        if(flat && broad){
          assert(Math.abs(data[i+2]-4.5)>.01,'Grey deck cannot share its plane with broad dark faces');
          if(data[i+5]<-.99 && Math.abs(data[i+2]-4.15)<.001)belly=true;
        }
      }
      assert(belly,'Deck underside has physical separation from the walk surface');
    });
  });

  test('rendering', 'tower ceiling has one roof plane without a coplanar docking pad underside', function () {
    var v=window.Driftworks.scene3d.miningPlatformGeometry(1,0,false,1,'').ochre,count=0;
    for(var i=0;i<v.length;i+=18){if([2,8,14].every(function(offset){return Math.abs(v[i+offset]-13.5)<.00001;}))count++;}
    assert(count===6,'Only the six triangles of the octagonal roof occupy z=13.5');
    var panes=window.Driftworks.scene3d.miningPlatformGeometry(1,0,false,1,'').dark,upward=0;
    for(var j=0;j<panes.length;j+=18)if([2,8,14].every(function(offset){return panes[j+offset]>12.5 && panes[j+offset]<13.5;}) && panes[j+5]>.5)upward++;
    assert(upward===16,'Eight upper shoulder windows face upward for overhead visibility');
  });

  test('rendering', 'crew interior has separate entry/control decks and an unobstructed microgravity translation opening', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry;
    function floorAt(groups,x,y,z){var v=groups.steel;for(var i=0;i<v.length;i+=18){if(Math.abs(v[i+2]-z)>.001 || Math.abs(v[i+8]-z)>.001 || Math.abs(v[i+14]-z)>.001 || v[i+5]<.99)continue;var ax=v[i],ay=v[i+1],bx=v[i+6],by=v[i+7],cx=v[i+12],cy=v[i+13],d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(d)<1e-8)continue;var u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/d,w=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/d;if(u>=-.00001 && w>=-.00001 && u+w<=1.00001)return true;}return false;}
    var lower=model(1,0,false,1,'lower'),upper=model(1,0,false,1,'upper');
    assert(floorAt(lower,0,2,7.35),'Suspended pod entry floor is above the cargo deck');
    assert(floorAt(lower,0,0,4.5) && floorAt(lower,3,0,4.5),'Cargo floor continues unbroken beneath the pod');
    assert(!floorAt(lower,0,2,4.7),'Old bottom interior floor is removed');
    var dark=upper.dark;
    for(var n=0;n<dark.length;n+=18){var centroid=[0,1,2].map(function(k){return (dark[n+k]+dark[n+6+k]+dark[n+12+k])/3;});assert(!(Math.abs(centroid[0])<4.2 && Math.abs(centroid[1])<3.2 && centroid[2]>4.8 && centroid[2]<7),'No pedestal walls obstruct the central cargo space');}
    assert(!floorAt(lower,0,2,10),'Lower inspection removes the upper floor');
    assert(floorAt(upper,-2,2,10),'Control room has an upper floor');
    assert(floorAt(upper,5.6,0,10) && floorAt(upper,0,4.2,10),'Bridge floor reaches the hull sill at the correct elevation');
    assert(!floorAt(upper,5.6,4.2,10),'Faceted corner stays inside the hull');
    assert(!floorAt(upper,2.8,0,10) && !floorAt(upper,2.8,0,7.35),'Both upper floors leave the translation well clear');
    assert(floorAt(upper,-2,0,7.35),'Tower body has a usable middle deck');
    assert(!floorAt(upper,-2,0,9),'Redundant shelf below the bridge is removed');
    ['','lower','upper'].forEach(function(cut){var g=model(1,0,false,1,cut);Object.keys(g).forEach(function(k){assert(g[k].every(Number.isFinite));});});
  });

  test('rendering', 'mining platform geometry folds legs without decorative machinery motion', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry;
    var open=model(1,0,false),folded=model(0,0,false);
    function width(groups){var ys=[];Object.keys(groups).forEach(function(k){for(var i=1;i<groups[k].length;i+=6)ys.push(Math.abs(groups[k][i]));});return Math.max.apply(null,ys);}
    assert(width(open)>width(folded));
    assert(JSON.stringify(open)===JSON.stringify(model(1,12,false)));
    assert(JSON.stringify(open)===JSON.stringify(model(1,.2,true)));
    Object.keys(open).forEach(function(k){assert(open[k].length%18===0);assert(open[k].every(Number.isFinite));for(var i=3;i<open[k].length;i+=6)assert(Math.abs(Math.hypot(open[k][i],open[k][i+1],open[k][i+2])-1)<.00001);});
  });

  test('rendering', '3D station hardware has finite unit normals and a bounded geometry budget', function () {
    var groups = window.Driftworks.scene3d.mothershipHardware(), triangles = 0;
    assert(Object.keys(groups).length <= 8, 'Hardware stays within eight material batches');
    Object.keys(groups).forEach(function (key) {
      var mesh = groups[key];
      assert(mesh.length > 0 && mesh.length % 18 === 0, 'Complete triangle vertices');
      triangles += mesh.length / 18;
      for (var i = 0; i < mesh.length; i += 6) {
        for (var j = 0; j < 6; j++) assert(Number.isFinite(mesh[i+j]), 'Finite hardware geometry');
        assertClose(Math.hypot(mesh[i+3],mesh[i+4],mesh[i+5]),1);
        assert(Math.abs(mesh[i]) < 73 && Math.abs(mesh[i+1]) < 33 && Math.abs(mesh[i+2]) < 40, 'Artwork stays within its authored envelope');
        if (key === 'rotor') assert(Math.hypot(mesh[i+1],mesh[i+2]) > 16.9, 'Rotating hardware clears the habitat shell');
        else assert(Math.abs(mesh[i]) > 35, 'Fixed hardware extends from the axial hubs, leaving the drum exterior clear');
      }
    });
    assert(triangles < 30000, 'Station hardware has a fixed triangle ceiling');
  });
  test('rendering', '3D mothership habitat preserves the rounded silhouette with real circular depth', function () {
    var mesh = window.Driftworks.scene3d.habitatMesh();
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (var i = 0; i < mesh.length; i += 6) {
      for (var axis = 0; axis < 3; axis++) { min[axis] = Math.min(min[axis], mesh[i + axis]); max[axis] = Math.max(max[axis], mesh[i + axis]); }
      assertClose(Math.hypot(mesh[i + 3], mesh[i + 4], mesh[i + 5]), 1, 0.000001);
      if (Math.abs(mesh[i]) <= 31) assertClose(Math.hypot(mesh[i + 1], mesh[i + 2]), 17, 0.000002);
    }
    assertClose(min[0], -36); assertClose(max[0], 36);
    assertClose(min[1], -17); assertClose(max[1], 17);
    assertClose(min[2], -17); assertClose(max[2], 17);
    assert(mesh.length % 18 === 0);
  });
  test('rendering', '3D mothership close inspection stays above the raised fixed machinery', function () {
    var w = createFreshWorld(), home = w.ships.find(function (s) { return s.type === 'mothership'; });
    w.camera = { x: home.position.x, y: home.position.y, zoom: 128 };
    var before = JSON.stringify(w), height = window.Driftworks.scene3d.inspectionHeight(w);
    assert(height > 29 * game.semanticScale('mothership', w.camera.zoom));
    assert(JSON.stringify(w) === before);
    w.camera.zoom = 1;
    assert(window.Driftworks.scene3d.inspectionHeight(w) === 0);
  });
  test('rendering', '3D asteroid uses the original seeded geology and crater data', function () {
    var scene = window.Driftworks.scene3d, art = window.Driftworks.asteroidArt;
    var a = createFreshWorld().asteroids[0], before = JSON.stringify(a);
    var visual = scene.visualFor(a);
    assert(JSON.stringify(visual) === JSON.stringify(game.asteroidVisualDescription(a)), 'Reuse original visual description');
    assert(scene.visualFor(a) === visual, 'Cache geology across camera movement');
    var bytes = art.craterBytes(visual);
    assert(bytes.length === 576 * 4);
    function unpack(texel, offset) { return (bytes[texel * 4 + offset] * 256 + bytes[texel * 4 + offset + 1]) / 65535; }
    visual.craters.forEach(function (crater, i) {
      assertClose(unpack(i * 4, 0) * 2.5 - 1.25, crater.x, 0.00004);
      assertClose(unpack(i * 4 + 3, 0) * 0.12, crater.depth, 0.000003);
    });
    assert(art.shaderSource.indexOf('vec4 craterSurface') >= 0 && art.shaderSource.indexOf('vec4 composition') >= 0);
    assert(art.shaderSource.indexOf('void main') === -1, 'Backends share geology while supplying their own main');
    assert(JSON.stringify(a) === before, 'Artwork remains outside serialized world state');
  });
  test('rendering', '3D surface intersects the full relief shell above and below', function () {
    var scene = window.Driftworks.scene3d, art = window.Driftworks.asteroidArt;
    var a = createFreshWorld().asteroids[0], visual = scene.visualFor(a);
    var crater = visual.craters.filter(function (c) { return Math.hypot(c.x, c.y) < 0.55; }).sort(function (a, b) { return b.depth - a.depth; })[0];
    assert(crater && crater.depth > 0.002);
    var x = crater.x, y = crater.y;
    assert(scene.surfaceHeight(a, x, y) > .4, 'Preserve the rounded body');
    var point = [x, y, scene.surfaceHeight(a, x, y)];
    assertClose(scene.rockField(a, point), 0);
    assert(scene.rockField(a, [x, y, point[2] - 0.005]) < 0);
    assert(scene.rockField(a, [x, y, point[2] + 0.005]) > 0);
    var lower = -scene.surfaceHeight(a, x, y, true);
    assertClose(scene.rockField(a, [x, y, lower]), 0);
    assert(scene.rockField(a, [x, y, lower + .005]) < 0);
    assert(scene.rockField(a, [x, y, lower - .005]) > 0);
  });
  test('rendering', '3D crater relief covers both hemispheres and stays continuous across the equator and longitude seam', function () {
    var scene = window.Driftworks.scene3d, a = createFreshWorld().asteroids[0];
    var craters = scene.visualFor(a).craters, upper = 0, lower = 0;
    craters.forEach(function (c) {
      var r = sim.surfaceRadius(a, Math.atan2(c.y, c.x)) / a.radius;
      var x = c.x / (r * .96), y = c.y / (r * .96), z = Math.sqrt(Math.max(.001, 1 - x*x - y*y));
      var length = Math.hypot(x,y,z); x/=length; y/=length; z/=length;
      if (scene.globeRelief(a,[x,y,z]) < -.001) upper++;
      if (scene.globeRelief(a,[-y,x,-z]) < -.001) lower++;
    });
    assert(upper > craters.length * .7 && lower > craters.length * .7, 'Impact bowls continue around the back');
    for (var angle = 0; angle < Math.PI * 2; angle += .1) {
      var x = Math.cos(angle)*.9, y = Math.sin(angle)*.9;
      assertClose(scene.rockField(a,[x,y,.000001]), scene.rockField(a,[x,y,-.000001]), .0001);
    }
    assertClose(scene.rockField(a,[.8,.000001,.3]), scene.rockField(a,[.8,-.000001,.3]), .0001);
    assert(Number.isFinite(scene.rockField(a,[0,0,.78])) && Number.isFinite(scene.rockField(a,[0,0,-.78])), 'Both poles remain finite');
    var picked = scene.pickAsteroid({x:700,y:450}, a,
      {x:a.position.x,y:a.position.y,zoom:.5}, {width:1400,height:900}, {yaw:.6,tilt:2.4});
    assert(picked && picked.position[2] < 0, 'Picking from below reaches the lower shell');
  });
  test('rendering', '3D impacts stay circular in actual surface tangent planes and survive GPU packing', function () {
    var scene = window.Driftworks.scene3d, a = createFreshWorld().asteroids[0];
    var impacts = scene.impactsFor(a), bytes = scene.impactBytes(a);
    assert(impacts.length === scene.visualFor(a).craters.length * 2);
    impacts.forEach(function(impact,index) {
      var n=impact.normal, c=impact.center;
      assertClose(Math.hypot(n[0],n[1],n[2]),1);
      assert(n[0]*c[0]+n[1]*c[1]+n[2]*c[2]>0, 'Impact axis faces out of the body');
      var axis=Math.abs(n[2])<.9?[0,0,1]:[1,0,0];
      var t=[n[1]*axis[2]-n[2]*axis[1],n[2]*axis[0]-n[0]*axis[2],n[0]*axis[1]-n[1]*axis[0]];
      var length=Math.hypot(t[0],t[1],t[2]);t=t.map(function(v){return v/length;});
      var b=[n[1]*t[2]-n[2]*t[1],n[2]*t[0]-n[0]*t[2],n[0]*t[1]-n[1]*t[0]];
      for(var angle=0;angle<Math.PI*2;angle+=.4){
        var point=c.map(function(v,i){return v+impact.radius*(t[i]*Math.cos(angle)+b[i]*Math.sin(angle));});
        assertClose(scene.craterDistance(impact,point),1);
        var raised=point.map(function(v,i){return v+n[i]*.03;});
        assertClose(scene.craterDistance(impact,raised),1, .000001);
      }
      function unpack(i){return (bytes[index*20+i*2]*256+bytes[index*20+i*2+1])/65535;}
      c.forEach(function(v,i){assertClose(unpack(i)*2.4-1.2,v,.00004);});
      n.forEach(function(v,i){assertClose(unpack(i+3)*2-1,v,.00004);});
      assertClose(unpack(6)*.4,impact.radius,.00001);
      assertClose(unpack(7)*.12,impact.depth,.000003);
    });
    var varied=impacts.some(function(impact){var c=impact.center,n=impact.normal,l=Math.hypot(c[0],c[1],c[2]);return Math.abs(n[2]-c[2]/l)>.1;});
    assert(varied,'Axes follow the irregular spheroid rather than an unstretched sphere');
  });
  test('rendering', 'Asteroid study parameters are reproducible and never alter saved world data', function () {
    var scene=window.Driftworks.scene3d, art=window.Driftworks.asteroidArt;
    var a=Object.assign({},createFreshWorld().asteroids[0],{id:'parameter-study-test'}), before=JSON.stringify(a);
    var original=art.describe(a), custom=scene.setStudyParameters(a,{bulk:[0,0,10,0],roughness:.5,craterDepth:1.5,heterogeneity:.2});
    assertClose(custom.bulk[2],1);
    assert(custom.surfaceProfile.roughnessAmp!==original.surfaceProfile.roughnessAmp,'Materials affect the surface profile');
    assertClose(custom.heterogeneity,.2);
    assert(scene.visualFor(a)===custom,'Renderer sees the replacement artwork');
    var first=JSON.stringify(custom);
    scene.impactsFor(a);scene.asteroidMesh(a,12);
    assert(JSON.stringify(scene.setStudyParameters(a,{bulk:[0,0,10,0],roughness:.5,craterDepth:1.5,heterogeneity:.2}))===first,'Applying twice does not compound multipliers');
    var reset=scene.setStudyParameters(a,{});
    assert(JSON.stringify(reset)===JSON.stringify(original),'Defaults restore the seeded specimen');
    assert(JSON.stringify(a)===before,'Study controls do not write persistent artwork state');
    assert(JSON.stringify(art.describe(a,[0,0,0,0]))===JSON.stringify(original),'Empty composition falls back safely');
    var reseeded=art.describe(Object.assign({},a,{id:'another-parameter-seed'}));
    assert(JSON.stringify(reseeded.craters)!==JSON.stringify(original.craters),'Changing the seed changes the impact population');
  });
  test('rendering', 'Surface walking frames follow the closed terrain with outward unit normals', function () {
    var scene=window.Driftworks.scene3d,a=createFreshWorld().asteroids[0],before=JSON.stringify(a);
    [[0,0,1],[0,0,-1],[1,0,0],[-1,1,.4],[.4,-.7,.6]].forEach(function(direction){
      var frame=scene.surfaceFrame(a,direction),p=frame.point,n=frame.normal;
      assertClose(scene.rockField(a,p),0,.000001);
      assertClose(Math.hypot(n[0],n[1],n[2]),1);
      assert(n[0]*p[0]+n[1]*p[1]+n[2]*p[2]>0,'Walking up faces away from the body');
      assert(scene.rockField(a,p.map(function(v,i){return v+n[i]*.012;}))>0,'Eye clearance stays above the terrain');
      assert(frame.point.every(Number.isFinite)&&frame.normal.every(Number.isFinite));
    });
    assert(JSON.stringify(a)===before,'Walking has no durable world state');
  });
  test('rendering', '3D perspective picking round trips the movement plane through orbit and zoom', function () {
    var scene = window.Driftworks.scene3d, viewport = { width: 1400, height: 900 };
    [0.25, 1, 8, 128].forEach(function (zoom) {
      [0, 0.8, 2.7].forEach(function (yaw) {
        [0.06, 0.48, 1.12, 2.4, 3.08].forEach(function (tilt) {
          var camera = { x: 640, y: -280, zoom: zoom }, orbit = { yaw: yaw, tilt: tilt };
          var point = [camera.x + 60 / zoom, camera.y - 35 / zoom, 0];
          var screen = scene.project(point, camera, viewport, orbit);
          var picked = scene.unproject(screen, camera, viewport, orbit);
          assert(picked !== null);
          assertClose(picked.x, point[0]); assertClose(picked.y, point[1]);
        });
      });
    });
  });
  test('rendering', '3D perspective orbit changes interior parallax according to depth', function () {
    var scene = window.Driftworks.scene3d, camera = { x: 0, y: 0, zoom: 1 }, viewport = { width: 1400, height: 900 };
    var front = scene.project([0, 0, 0], camera, viewport, { yaw: 0, tilt: 0.6 });
    var behind = scene.project([0, 0, -100], camera, viewport, { yaw: 0, tilt: 0.6 });
    assert(Math.abs(front.y - behind.y) > 30, 'Interior should project behind the cut surface');
    var turned = scene.project([100, 0, -100], camera, viewport, { yaw: 1, tilt: 0.6 });
    var original = scene.project([100, 0, -100], camera, viewport, { yaw: 0, tilt: 0.6 });
    assert(Math.abs(turned.x - original.x) > 20);
  });
  test('rendering', 'excavation retains its roof independently of cutaway inspection and keeps a connected passage', function () {
    var scene = window.Driftworks.scene3d, world = createFreshWorld();
    var a = sim.toggleAsteroidExcavation(world, world.asteroids[0].id).asteroids[0], e = a.excavation;
    var before = JSON.stringify(a), depth = e.depthM / sim.METERS_PER_UNIT / a.radius;
    var center = [e.pocketOffset.x, e.pocketOffset.y, -depth];
    var entrance = [Math.cos(e.tunnelAngle)*1.08, Math.sin(e.tunnelAngle)*1.08, -depth];
    var bend = [Math.cos(e.tunnelAngle+e.tunnelTurn)*.43, Math.sin(e.tunnelAngle+e.tunnelTurn)*.43, -depth-.035];
    assert(scene.rockField(a, [0, 0, .3], false) < 0, 'Roof remains solid');
    assert(scene.rockField(a, [0, 0, .3], true) > 0, 'Inspection removes roof');
    [entrance, center].forEach(function (end) {
      for (var i = 0; i <= 40; i++) {
        var t = i/40, p = bend.map(function (v, k) { return v*(1-t)+end[k]*t; });
        assert(scene.rockField(a, p, false) > .04, 'Passage has continuous center clearance');
      }
    });
    var roofMesh = scene.asteroidMesh(a, 20, false), cutMesh = scene.asteroidMesh(a, 20, true);
    assert(Array.from(roofMesh).every(Number.isFinite), 'Intact mesh is finite');
    assert(roofMesh.some(function (v, i) { return i%6 === 2 && v > .3; }), 'Intact mesh contains upper shell');
    assert(!cutMesh.some(function (v, i) { return i%6 === 2 && v > .001; }), 'Cut mesh omits upper shell');
    assert(JSON.stringify(a) === before, 'Inspection and meshing never change saved excavation');
  });
  test('rendering', 'excavation preserves the exterior field away from its entrance', function () {
    var scene=window.Driftworks.scene3d, world=createFreshWorld();
    var intact=world.asteroids[0], excavated=sim.toggleAsteroidExcavation(world,intact.id).asteroids[0];
    for(var i=0;i<24;i++){
      var angle=i*Math.PI/12;
      // Upper hemisphere remains rock: inspection clipping is disabled here.
      var p=[Math.cos(angle)*.72,Math.sin(angle)*.72,.6];
      assert(scene.rockField(intact,p,false)===scene.rockField(excavated,p,false), 'Excavation must not alter exterior geology');
    }
  });
  test('rendering', '3D rock solid retains the body scale and excavates real chamber and tunnel voids', function () {
    var scene = window.Driftworks.scene3d, a = createFreshWorld().asteroids[0];
    for (var angle = 0; angle < Math.PI * 2; angle += 0.3) {
      var r = sim.surfaceRadius(a, angle) / a.radius;
      assert(Math.abs(scene.rockField(a, [Math.cos(angle) * r, Math.sin(angle) * r, 0])) < .12, 'Geology remains a small displacement of the simulation body');
    }
    var before = JSON.stringify(a), e = a.excavation;
    scene.asteroidMesh(a, 12);
    assert(JSON.stringify(a) === before, 'Rendering must not mutate saves');
    a = sim.toggleAsteroidExcavation(createFreshWorld(), a.id).asteroids[0]; e = a.excavation;
    var depth = e.depthM / sim.METERS_PER_UNIT / a.radius;
    assert(scene.rockField(a, [e.pocketOffset.x, e.pocketOffset.y, -depth]) > 0, 'Chamber is empty');
    assert(scene.rockField(a, [e.pocketOffset.x, e.pocketOffset.y, -depth - e.pocketRadius - 0.04]) < 0, 'Rock remains beneath chamber');
    assert(scene.rockField(a, [0, 0, 0.3]) > 0, 'Cut removes upper shell');
    var mesh = scene.asteroidMesh(a, 20);
    assert(mesh.length > 100 && mesh.length % 18 === 0);
    assert(Array.from(mesh).every(Number.isFinite), 'Mesh has finite positions and normals');
    var deepest = 0;
    for (var i = 0; i < mesh.length; i += 6) {
      if (Math.hypot(mesh[i] - e.pocketOffset.x, mesh[i + 1] - e.pocketOffset.y) < 0.1 && mesh[i + 5] > 0.4) deepest = Math.min(deepest, mesh[i + 2]);
    }
    assert(deepest < -depth - 0.1, 'Mesh contains an upward-facing chamber floor below the cut');
  });
  test('rendering', '3D asteroid picking reaches the chamber floor and respects body rotation', function () {
    var scene = window.Driftworks.scene3d, w = createFreshWorld();
    var a = sim.toggleAsteroidExcavation(w, w.asteroids[0].id).asteroids[0];
    a.rotation = 1.2;
    var e = a.excavation, c = Math.cos(a.rotation), s = Math.sin(a.rotation);
    var x = a.position.x + (e.pocketOffset.x * c - e.pocketOffset.y * s) * a.radius;
    var y = a.position.y + (e.pocketOffset.x * s + e.pocketOffset.y * c) * a.radius;
    var camera = { x: a.position.x, y: a.position.y, zoom: 1 }, viewport = { width: 1200, height: 800 }, orbit = { yaw: 0.4, tilt: 0 };
    var screen = scene.project([x, y, 0], camera, viewport, orbit);
    var hit = scene.pickAsteroid(screen, a, camera, viewport, orbit);
    assert(hit !== null);
    var projected = scene.project(hit.position, camera, viewport, orbit);
    assertClose(projected.x, screen.x); assertClose(projected.y, screen.y);
    assert(hit.position[2] < -e.depthM / sim.METERS_PER_UNIT - a.radius * 0.1, 'Picking sees actual floor depth through the opening');
    var miss = scene.pickAsteroid(scene.project([a.position.x + 2 * a.radius, a.position.y, 0], camera, viewport, orbit), a, camera, viewport, orbit);
    assert(miss === null);
  });
  test('rendering', '3D inspection keeps close zoom above the visible surface without changing world state', function () {
    var scene = window.Driftworks.scene3d, w = createFreshWorld(), a = w.asteroids[0];
    w.camera = { x: a.position.x, y: a.position.y, zoom: 128 };
    var snapshot = JSON.stringify(w);
    assert(scene.inspectionHeight(w) >= a.radius * 0.72, 'Camera target rises onto the outer shell');
    assert(JSON.stringify(w) === snapshot);
    w = sim.toggleAsteroidExcavation(w, a.id);
    var height = scene.inspectionHeight(w), viewport = { width: 1200, height: 800 };
    assertClose(height, -a.excavation.depthM / sim.METERS_PER_UNIT);
    var orbit = { yaw: 0.8, tilt: 0.7, height: height };
    var point = [a.position.x + 1, a.position.y - 1, height];
    var screen = scene.project(point, w.camera, viewport, orbit);
    var picked = scene.unproject(screen, w.camera, viewport, orbit, height);
    assert(picked !== null); assertClose(picked.x, point[0]); assertClose(picked.y, point[1]);
    w.camera.x += a.radius * 2;
    assert(scene.inspectionHeight(w) === 0, 'Away from asteroids the camera targets the movement plane');
  });
  test('rendering', 'background settings default safely and clamp persisted brightness', function () {
    var defaults = game.normalizeBackgroundSettings(null);
    assert(defaults.image === 'all-sky-milky-way' && defaults.brightness === 0.28);
    var repaired = game.normalizeBackgroundSettings({ image: 'missing', brightness: 8 });
    assert(repaired.image === 'all-sky-milky-way' && repaired.brightness === 1);
    var black = game.normalizeBackgroundSettings({ image: 'black', brightness: -1 });
    assert(black.image === 'black' && black.brightness === 0);
    var options = game.backgroundOptions();
    assert(options.length === 6);
    assert(options.filter(function (option) { return option.id === 'all-sky-low-exposure'; })[0].contrast > 1);
    assert(options.filter(function (option) { return option.id === 'all-sky-stars-only'; })[0].contrast >
      options.filter(function (option) { return option.id === 'all-sky-low-exposure'; })[0].contrast);
  });

  test('rendering', 'asteroid renderer retains shader geometry while updating light uniforms', function () {
    var graphic = { container: { position: { set: function (x, y) { this.x = x; this.y = y; } }, rotation: 0 },
      mesh: { scale: { value: 0, set: function (value) { this.value = value; } } },
      shader: { uniforms: {} }, visual: null, artworkKey: '' };
    var asteroid = createFreshWorld().asteroids[0];
    game.paintAsteroid(graphic, asteroid);
    var visual = graphic.visual;
    var uniforms = graphic.shader.uniforms;
    var firstLight = [uniforms.uLight[0], uniforms.uLight[1]];
    game.paintAsteroid(graphic, Object.assign({}, asteroid, { rotation: 0.01 }), 8);
    assert(graphic.visual === visual && graphic.shader.uniforms === uniforms && graphic.container.rotation === 0.01);
    assert(uniforms.uLight[0] !== firstLight[0] || uniforms.uLight[1] !== firstLight[1],
      'Rotation updates continuous local-light uniforms');
    assertClose(uniforms.uPixelFootprint, 1 / (asteroid.radius * 8), 0.0000001);
    game.paintAsteroid(graphic, Object.assign({}, asteroid, { rotation: 0.1 }));
    assert(graphic.visual === visual, 'Rotation does not rebuild procedural geology');
    assertClose(graphic.shader.uniforms.uCavityParallax[0], 0);
    assertClose(graphic.shader.uniforms.uCavityParallax[1], 0);
    game.paintAsteroid(graphic, asteroid, 1, { x: asteroid.position.x + asteroid.radius / 2,
      y: asteroid.position.y - asteroid.radius / 2, zoom: 1 });
    assert(graphic.shader.uniforms.uCavityParallax[0] < 0, 'Moving the camera right should reveal floor to the left');
    assert(graphic.shader.uniforms.uCavityParallax[1] > 0, 'Moving the camera up should reveal floor below');
    game.paintAsteroid(graphic, Object.assign({}, asteroid, { radius: asteroid.radius * 2 }));
    assert(graphic.visual !== visual && graphic.mesh.scale.value === asteroid.radius * 2);
  });

  test('rendering', 'legacy wrecks without rotation render finite recovery geometry', function () {
    var world = createDeployedWorld();
    world.wrecks = [{ id: 'legacy-wreck', position: { x: 10, y: 20 } }];
    var points;
    game.paintRecovery({
      clear: function () {}, lineStyle: function () {}, beginFill: function () {},
      endFill: function () {}, moveTo: function () {}, lineTo: function () {},
      drawPolygon: function (vertices) { points = vertices; }
    }, world);
    assert(points && points.length === 10, 'Wreck silhouette should be drawn');
    assert(points.every(Number.isFinite), 'Missing rotation should use zero, not NaN');
  });

  test('rendering', 'order line local vector rotates back to world target direction', function () {
    var position = { x: -180, y: -90 };
    var target = { x: 220, y: -240 };
    var rotation = Math.PI * 0.63;
    var local = game.worldVectorToShipLocalLine(position, target, rotation);
    var cos = Math.cos(rotation);
    var sin = Math.sin(rotation);
    var worldX = local.x * cos - local.y * sin;
    var worldY = local.x * sin + local.y * cos;
    assertClose(worldX, target.x - position.x);
    assertClose(worldY, target.y - position.y);
  });

  test('rendering', 'engine plume mixes fixed maneuvering thrusters', function () {
    var radius = 14;
    var forward = game.enginePlumeGeometry(20, 0, 0, 100, radius, false);
    var braking = game.enginePlumeGeometry(-20, 0, 0, 100, radius, false);
    var lateral = game.enginePlumeGeometry(0, 20, 0, 100, radius, false);
    var main = findPlume(forward, 'main-aft');
    var brakePort = findPlume(braking, 'brake-port');
    var brakeStarboard = findPlume(braking, 'brake-starboard');
    var portTranslate = findPlume(lateral, 'port-translate');

    assert(main, 'Forward acceleration should use aft main thruster');
    assert(brakePort && brakeStarboard, 'Braking should use paired forward brake ports');
    assert(portTranslate, 'Lateral acceleration should use a side maneuvering thruster');
    assertClose(main.origin.x, -radius * 0.82);
    assertClose(main.origin.y, 0);
    assertClose(brakePort.origin.x, radius * 0.72);
    assertClose(brakePort.origin.y, -radius * 0.42);
    assertClose(brakeStarboard.origin.y, radius * 0.42);
    assertClose(portTranslate.origin.y, -radius * 0.82);
  });

  test('rendering', 'camera math uses logical screen pixels under high-DPI rendering', function () {
    var viewport = game.viewportFromApp({
      screen: { width: 1280, height: 720 },
      renderer: { width: 1920, height: 1080 }
    });
    var camera = { x: 210, y: -125, zoom: 1.75 };
    var screen = game.worldToScreen({ x: 210, y: -125 }, camera, viewport);
    var world = game.screenToWorld({ x: 640, y: 360 }, camera, viewport);

    assertClose(viewport.width, 1280);
    assertClose(viewport.height, 720);
    assertClose(screen.x, 640);
    assertClose(screen.y, 360);
    assertClose(world.x, 210);
    assertClose(world.y, -125);
  });

  test('rendering', 'offscreen contacts clamp to the viewport edge and hand off once visible', function () {
    var view = { width: 1280, height: 720 };
    var right = game.contactEdgeMarker({ x: 1800, y: 460 }, view, 26);
    assert(right.visible, 'A distant contact should use an edge marker');
    assertClose(right.position.x, 1254);
    assert(right.position.y > 360 && right.position.y < 694, 'Bearing should determine marker position along the edge');
    var corner = game.contactEdgeMarker({ x: -200, y: -100 }, view, 26);
    assert(corner.visible && (corner.position.x === 26 || corner.position.y === 26), 'Corner bearings should intersect an inset edge');
    assert(!game.contactEdgeMarker({ x: 900, y: 500 }, view, 26).visible,
      'The marker should disappear when the contact becomes visible');
  });

  test('rendering', 'contact ETA uses the world-space operating area rather than the camera viewport', function () {
    var drone = { position: { x: 1900, y: 0 }, velocity: { x: -60, y: 0 } };
    assertClose(game.contactEtaSeconds(drone, { x: 0, y: 0 }, 700), 20);
    drone.position = { x: 700, y: 0 };
    assertClose(game.contactEtaSeconds(drone, { x: 0, y: 0 }, 700), 0);
    drone.position = { x: 1900, y: 0 };
    drone.velocity = { x: 60, y: 0 };
    assert(game.contactEtaSeconds(drone, { x: 0, y: 0 }, 700) === Infinity,
      'A receding contact should not claim an arrival time');
  });

  test('rendering', 'inbound sensor tracks resolve through stable distance-based stages', function () {
    function droneAt(distance) { return [{ position: { x: distance, y: 0 } }]; }
    var center = { x: 0, y: 0 };
    assert(game.contactTrackState(droneAt(4800), center).key === 'possible', 'Distant tracks should be ambiguous');
    assert(game.contactTrackState(droneAt(3000), center).key === 'tracking', 'Continued observation should establish a track');
    assert(game.contactTrackState(droneAt(1600), center).key === 'resolved', 'Approaching groups should resolve');
    assert(game.contactTrackState(droneAt(900), center).key === 'local', 'Near contacts should become local tracks');
  });

  test('rendering', 'focus camera tracks the current selected ship position', function () {
    var world = sim.selectShips(createDeployedWorld(), ['escort-01']);
    world.camera = { x: 0, y: 0, zoom: 1 };
    var ids = ['escort-01'];
    var initialFocus = game.computeSelectionFocus(world, ids);
    var escort = findShip(world, 'escort-01');

    escort.position = { x: 520, y: -280 };
    var movedFocus = game.computeSelectionFocus(world, ids);
    var focusedWorld = game.focusCameraToward(world, movedFocus, 1);

    assertClose(initialFocus.x, 210);
    assertClose(movedFocus.x, 520);
    assertClose(movedFocus.y, -280);
    assertClose(focusedWorld.camera.x, 520);
    assertClose(focusedWorld.camera.y, -280);
  });

  test('rendering', 'mining effect becomes diffuse when miner overlaps asteroid', function () {
    var position = { x: 40, y: -20 };
    var rotation = Math.PI / 2;
    var geometry = game.miningEffectGeometry(position, position, rotation);

    assert(geometry.beamOrigin === null, 'Overlapped mining should not draw a directional beam');
    assertClose(geometry.contact.x, 40);
    assertClose(geometry.contact.y, -2);
    assertClose(geometry.seedAngle, Math.PI / 2);
  });

  test('rendering', 'mothership drum bands roll top to bottom across the side silhouette', function () {
    var start = game.mothershipDrumMarkers(0);
    var later = game.mothershipDrumMarkers(4);
    var visibleCount = start.filter(function (marker) {
      return marker.visible;
    }).length;

    assert(start.length === 6, 'Drum should expose a few schematic surface bands');
    assert(visibleCount === 3, 'Only the exposed hemisphere should be visible');
    assert(start.some(function (marker) { return marker.visible && marker.y < -1; }), 'Exposed surface should reach above the center');
    assert(start.some(function (marker) { return marker.visible && marker.y > 1; }), 'Exposed surface should reach below the center');
    start.forEach(function (marker) {
      assert(marker.halfWidth > 31 && marker.halfWidth <= 36, 'Band should extend to the rounded hull edge');
      assert(marker.y >= -16.5 && marker.y <= 16.5, 'Band should stay on the visible cylindrical side');
    });
    assert(later[0].y > start[0].y, 'Surface bands should roll from top to bottom over time');
    assert(!game.mothershipDrumMarkers(19)[0].visible, 'A band should disappear underneath for the other half of its rotation');
    assert(game.mothershipDrumMarkers(38)[0].visible, 'A band should reappear after one full rotation');
  });

  test('rendering', 'mothership rotating details share one cylindrical projection', function () {
    var top = game.drumSurfaceAt(Math.PI / 2);
    var near = game.drumSurfaceAt(0);
    assertClose(top.y, 16.5);
    assertClose(top.depth, 0);
    assertClose(near.y, 0);
    assertClose(near.depth, 1);
  });

  test('rendering', 'craft detail fades continuously across zoom boundaries', function () {
    [8, 32, 96].forEach(function (zoom) {
      var before = game.craftDetail(zoom - 0.0001);
      var after = game.craftDetail(zoom + 0.0001);
      assertClose(before.machinery, after.machinery, 0.0001);
      assertClose(before.fine, after.fine, 0.0001);
    });
    assertClose(game.craftDetail(1).machinery, 0);
    assertClose(game.craftDetail(32).machinery, 1);
    assertClose(game.craftDetail(128).fine, 1);
  });

  test('rendering', 'platform tangent projection preserves cross-slope length and clamps the limb', function () {
    var normal = { x: 0.48, y: 0.64, z: 0.6 };
    var p = game.platformProjection(normal, 0, 1);
    assertClose(Math.hypot(p.a * 0.6 + p.c * 0.8, p.b * 0.6 + p.d * 0.8), 0.6);
    assertClose(Math.hypot(p.a * -0.8 + p.c * 0.6, p.b * -0.8 + p.d * 0.6), 1);
    var front = game.platformProjection({ x: 0, y: 0, z: 1 }, Math.PI / 2, 2);
    assertClose(front.a, 0); assertClose(front.b, 2); assertClose(front.c, -2); assertClose(front.d, 0);
    var limb = game.platformProjection({ x: 1, y: 0, z: 0 }, 0, 1);
    assertClose(limb.a, 0.2); assertClose(limb.d, 1);
    var turned = game.platformProjection(normal, Math.PI / 2, 1);
    assertClose(turned.a, p.c); assertClose(turned.b, p.d);
    assertClose(turned.c, -p.a); assertClose(turned.d, -p.b);
    assertClose(normal.x, 0.48);
  });

  test('rendering', 'raised platform preserves ground contacts while height separates the chassis', function () {
    var normal={x:0.48,y:0.64,z:0.6};
    var foot=game.platformRaisedPoint(normal,4,7,0);
    var body=game.platformRaisedPoint(normal,4,7,8);
    assertClose(body.x-foot.x,8*normal.x); assertClose(body.y-foot.y,8*normal.y);
    var front=game.platformRaisedPoint({x:0,y:0,z:1},4,7,8);
    assertClose(front.x,4); assertClose(front.y,7);
    var limb=game.platformRaisedPoint({x:1,y:0,z:0},4,7,8);
    assertClose(limb.x,8.8); assertClose(limb.y,7);
  });

  test('rendering', 'platform presentation follows lifecycle without mutating state', function () {
    var world = sim.createInitialWorld();
    var platform = world.platforms[0];
    [['carried', 0, 0], ['setting-up', 10800, 0], ['setting-up', 5400, 0.5],
      ['deployed', 0, 1], ['packing-up', 5400, 0.5], ['packing-up', 0, 0]].forEach(function (row) {
      platform.state = row[0]; platform.setupRemainingSeconds = row[1]; platform.packRemainingSeconds = row[1];
      var before = JSON.stringify(world);
      assertClose(game.platformDeployment(platform), row[2]);
      assert(JSON.stringify(world) === before, 'Presentation must not change the world');
    });
  });

  test('rendering', 'excavation artwork only runs when extraction can run', function () {
    var world = sim.createInitialWorld(), platform = world.platforms[0], asteroid = world.asteroids[0];
    world.miningMission = 'active'; platform.state = 'deployed'; world.staffingEnabled = true;
    platform.workerIds = []; asteroid.ore = 100;
    assert(!game.platformIsWorking(platform, world, asteroid), 'Unstaffed rig stays idle');
    platform.workerIds = ['a', 'b', 'c', 'd', 'e'];
    assert(game.platformIsWorking(platform, world, asteroid), 'Staffed rig with ore works');
    asteroid.ore = 0;
    assert(!game.platformIsWorking(platform, world, asteroid), 'Exhausted rig stays idle');
    asteroid.ore = 100; platform.state = 'packing-up';
    assert(!game.platformIsWorking(platform, world, asteroid), 'Packing rig stays idle');
  });

  test('rendering', 'mothership lighting remains fixed in world space as the hull turns', function () {
    var initial = game.mothershipLocalLight(0);
    var quarterTurn = game.mothershipLocalLight(Math.PI / 2);
    assertClose(initial.x, -0.813733);
    assertClose(initial.y, -0.581238);
    assertClose(quarterTurn.x, -0.581238);
    assertClose(quarterTurn.y, 0.813733);
    assertClose(quarterTurn.z, initial.z);
  });

  test('rendering', 'mothership habitat shader tracks spin, world light and screen pixel size', function () {
    var initial = game.mothershipHabitatUniforms(0, 0, 2);
    var later = game.mothershipHabitatUniforms(19, Math.PI / 2, 8);
    assertClose(initial.uSpin, 0);
    assertClose(later.uSpin, Math.PI);
    assertClose(initial.uPixelFootprint, 0.5);
    assertClose(later.uPixelFootprint, 0.125);
    assertClose(initial.uLight[0], -0.813733);
    assertClose(later.uLight[0], -0.581238);
    assertClose(later.uLight[1], 0.813733);
  });

  test('rendering', 'mothership habitat hides lamps rotating across the far side', function () {
    var front = game.mothershipHabitatLampVisibility(0);
    var back = game.mothershipHabitatLampVisibility(Math.PI);
    var shoulder = game.mothershipHabitatLampVisibility(Math.PI / 2);
    assertClose(front.left, 1); assertClose(front.right, 0);
    assertClose(back.left, 0); assertClose(back.right, 1);
    assertClose(shoulder.left, 0); assertClose(shoulder.right, 0);
  });

  test('rendering', 'semantic zoom preserves baseline and reveals relative scale continuously', function () {
    ['escort', 'miner', 'tug', 'mothership', 'asteroid', 'depot'].forEach(function (type) {
      assertClose(game.semanticScale(type, 1), 1);
      assertClose(game.semanticScale(type, 1.000001), 1, 0.00001);
    });
    assertClose(game.semanticScale('escort', 0.35) * 0.35, 1);
    var fighter = game.semanticScale('escort', 32) * 32;
    var home = game.semanticScale('mothership', 32) * 32;
    assert(fighter >= 1 && fighter < 1.5, 'Fighters remain readable with modest growth');
    assert(home / fighter > 20, 'Close zoom reveals substantially smaller relative craft');
    assert(game.semanticScale('mothership', 32) > 0.8, 'Large bodies retain most world size');
  });

  test('rendering', 'extended zoom retains the world point under the pointer and respects limits', function () {
    var view = { width: 1200, height: 800 };
    var pointer = { x: 230, y: 570 };
    var camera = { x: 71, y: -83, zoom: 120 };
    var before = game.screenToWorld(pointer, camera, view);
    var next = game.zoomCameraAt(camera, pointer, view, -1);
    var after = game.screenToWorld(pointer, next, view);
    assertClose(next.zoom, 128);
    assertClose(after.x, before.x);
    assertClose(after.y, before.y);
    assertClose(game.zoomCameraAt({ x: 0, y: 0, zoom: 0.35 }, pointer, view, 1).zoom, 0.35);
  });

  test('rendering', 'detail zoom magnifies all hulls fourfold without changing relative proportions', function () {
    ['escort', 'miner', 'tug', 'mothership', 'asteroid', 'depot'].forEach(function (type) {
      var base = game.semanticScale(type, 32);
      assertClose(game.semanticScale(type, 32.000001), base, 0.000001);
      assertClose(game.semanticScale(type, 31.999999), base, 0.000001);
      [48, 64, 128].forEach(function (zoom) {
        assertClose(game.semanticScale(type, zoom), base);
      });
      assertClose(game.semanticScale(type, 128) * 128 / (base * 32), 4);
    });
    var view = { width: 1200, height: 800 };
    var pointer = { x: 230, y: 570 };
    [30, 32, 64, 128].forEach(function (zoom) {
      [-1, 1].forEach(function (wheel) {
        var camera = { x: 71, y: -83, zoom: zoom };
        var before = game.screenToWorld(pointer, camera, view);
        var next = game.zoomCameraAt(camera, pointer, view, wheel);
        var after = game.screenToWorld(pointer, next, view);
        assertClose(after.x, before.x);
        assertClose(after.y, before.y);
      });
    });
  });

  test('rendering', 'close zoom recovery targets do not capture empty-space move orders', function () {
    var world = createDeployedWorld();
    var escort = findShip(world, 'escort-01');
    escort.disabled = true;
    escort.position = { x: 900, y: 900 };
    world.camera.zoom = 32;
    var tug = world.ships.filter(function (ship) { return ship.type === 'tug'; })[0];
    world = sim.selectShips(world, [tug.id]);
    var move = game.issueVisualContextOrder(world, { x: 915, y: 900 });
    assert(findShip(move, tug.id).order.kind === 'move');
    var recover = game.issueVisualContextOrder(world, escort.position);
    assert(findShip(recover, tug.id).order.kind === 'recover');
  });

  test('rendering', 'zooming out preserves default size hierarchy for every object class', function () {
    [0.35, 0.5, 0.8, 1].forEach(function (zoom) {
      ['mothership', 'depot', 'escort', 'miner', 'tug'].forEach(function (type) {
        assertClose(game.semanticScale(type, zoom) * zoom, 1);
      });
    });
  });

  test('rendering', 'UI effects retain pixel size across live zoom changes while selection follows ships', function () {
    function graphic() {
      return { parent: true, x: 12, y: 34, scale: { set: function (value) { this.x = value; } } };
    }
    var marker = { graphic: graphic(), age: 0, life: 10, vx: 0, vy: 0, scale: 1, grow: 0, alpha: 1, screenSpace: true };
    var selection = { graphic: graphic(), age: 0, life: 10, vx: 0, vy: 0, scale: 1, grow: 0, alpha: 1, semanticType: 'escort' };
    var worldEffect = { graphic: graphic(), age: 0, life: 10, vx: 0, vy: 0, scale: 1, grow: 0, alpha: 1 };
    [1, 32, 0.35, 8].forEach(function (zoom) {
      game.updateEffects({}, [marker, selection, worldEffect], 0.01, zoom);
      assertClose(marker.graphic.scale.x * zoom, 1);
      assertClose(selection.graphic.scale.x, game.semanticScale('escort', zoom));
      assertClose(worldEffect.graphic.scale.x, 1);
      assertClose(marker.graphic.x, 12);
      assertClose(marker.graphic.y, 34);
    });
  });

  test('rendering', 'mining plume uses hull-local geometry and only appears while landed', function () {
    var ship = findShip(createDeployedWorld(), 'tug-01');
    var circles = [];
    var graphics = { lineStyle: function () {}, beginFill: function () {}, endFill: function () {}, drawCircle: function (x, y, r) { circles.push([x, y, r]); } };
    ship.order = { kind: 'mine', phase: 'approach' };
    game.drawMiningPlume(graphics, false, 14, 1);
    assert(circles.length === 0);
    ship.order.phase = 'landed';
    game.drawMiningPlume(graphics, true, 14, 1);
    assert(circles.length === 13);
    var initial = JSON.stringify(circles);
    circles = [];
    ship.position = { x: 900, y: -1200 };
    ship.rotation = 2;
    game.drawMiningPlume(graphics, true, 14, 1);
    assert(JSON.stringify(circles) === initial, 'Hull transform must handle anchoring, not world-space particle offsets');
  });

  test('rendering', 'textured thrusters ramp by ship role and stop on coast or disable', function () {
    function graphics() {
      var g = { scale: { x: 1 }, fills: 0 };
      ['lineStyle', 'moveTo', 'lineTo', 'closePath', 'endFill'].forEach(function (name) { g[name] = function () {}; });
      g.beginFill = function () { g.fills += 1; };
      return g;
    }
    var ship = { id: 'engine-test', type: 'escort', speed: 100, acceleration: 100,
      rotation: 0, velocity: { x: 20, y: 0 }, previousVelocity: { x: 0, y: 0 }, order: { kind: 'move' } };
    var fighter = graphics();
    var industrial = graphics();
    game.drawEnginePlume(fighter, ship, 10, 1);
    game.drawEnginePlume(fighter, ship, 10, 1.1);
    ship.type = 'tug';
    game.drawEnginePlume(industrial, ship, 10, 1);
    game.drawEnginePlume(industrial, ship, 10, 1.1);
    assert(fighter.engineResponse.levels['main-aft'] > industrial.engineResponse.levels['main-aft'], 'Fighters should ignite faster');
    assert(fighter.fills === 12, 'Each plume should have three layers and three nodes');
    ship.velocity.x = 0;
    game.drawEnginePlume(industrial, ship, 10, 1.2);
    assert(industrial.engineResponse === null && industrial.fills === 12, 'Coasting should clear exhaust');
    ship.velocity.x = 20;
    ship.disabled = true;
    game.drawEnginePlume(fighter, ship, 10, 1.2);
    assert(fighter.engineResponse === null && fighter.fills === 12, 'Disabled engines must stop immediately');
  });

  test('rendering', 'viewer picks nearest rendered triangles with texture stride and model transforms', function () {
    var picker=window.Driftworks.scene3d.pickStudyBatches;
    // Local XY triangle, UV-interleaved. Basis swaps Y/Z, scale doubles it,
    // then a quarter turn around Z and a translation produce a vertical wall.
    var data=new Float32Array([-1,-1,0,0,0,1,0,0, 1,-1,0,0,0,1,1,0, 0,1,0,0,0,1,.5,1]);
    var batch={data:data,stride:8,origin:[3,4,5],scale:[2,2,2],rotation:Math.PI/2,basis:new Float32Array([1,0,0,0,0,1,0,-1,0]),spin:0};
    var hit=picker([10,4,5],[-1,0,0],[batch]);
    assert(hit,'Transformed textured triangle should be pickable'); assertClose(hit[0],3);assertClose(hit[1],4);assertClose(hit[2],5);
    var nearer=Object.assign({},batch,{origin:[6,4,5]});hit=picker([10,4,5],[-1,0,0],[batch,nearer]);assertClose(hit[0],6);
    assert(picker([10,20,5],[-1,0,0],[batch])===null,'Miss must not invent a focus');
    var spun=Object.assign({},batch,{basis:undefined,rotation:0,spin:Math.PI/2,origin:[0,0,0]});
    hit=picker([0,10,0],[0,-1,0],[spun]);assert(hit,'Axial rotor spin uses the rendered triangle');assertClose(hit[1],0);
  });
  };
})();
