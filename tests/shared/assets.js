(function () {
  'use strict';

  window.DriftworksSharedTests = window.DriftworksSharedTests || {};
  window.DriftworksSharedTests.assets = function (harness, fixtures) {
    var sim = window.Driftworks.sim;
    var game = window.Driftworks.game;
    var hud = window.Driftworks.hud;
    var test = harness.test, assert = harness.assert, assertClose = harness.assertClose;


  test('assets', 'imported ship libraries retain distinct provenance and bounded valid geometry', function(){
    var packs=window.Driftworks.shipPacks.filter(function(pack){return !pack.missionOnly&&pack.id!=='concept-trio';}),ids={};assert(packs.length===1);assert(packs[0].id==='quaternius-ultimate-spaceships');assert(packs[0].models.length===11);
    packs.forEach(function(pack){assert(pack.license==='CC0-1.0');assert(pack.url.indexOf('https://')===0);pack.models.forEach(function(m){assert(!ids[m.id]);ids[m.id]=true;assert(m.id.indexOf(pack.id+':')===0);assert(m.sha256.length===64);assert(m.vertices.length===m.triangles*18);for(var i=0;i<m.vertices.length;i+=6){assert(Math.hypot.apply(null,m.vertices.slice(i,i+3))<=8.50001);assertClose(Math.hypot.apply(null,m.vertices.slice(i+3,i+6)),1,.00001);}});});
    assert(window.Driftworks.shipPackModels.find('missing')===null);
  });
  test('assets', 'Quaternius glTF previews preserve UVs, source normals and bounded geometry',function(){
    window.Driftworks.shipPacks[0].models.forEach(function(m){
      var v=m.texturedVertices;assert(v.length%24===0);assert(v.length>=m.triangles*24);assert(m.texture==='textures/'+m.name+'.png');assert(m.gltfSource.endsWith('/'+m.name+'.gltf'));
      for(var i=0;i<v.length;i+=8){assert(v.slice(i,i+8).every(Number.isFinite));assert(Math.hypot.apply(null,v.slice(i,i+3))<=8.50001);assertClose(Math.hypot.apply(null,v.slice(i+3,i+6)),1,.0001);assert(v[i+6]>=0&&v[i+6]<=1);assert(v[i+7]>=0&&v[i+7]<=1);}
    });
  });


  test('assets', 'retail maneuver tables preserve original values and axis order', function () {
    var profiles=window.Driftworks.arcade.profiles;
    var expected=[
      [70,150,2,1.5,.1,.35,3,2.6,5,.7,94],
      [50,120,3,1.5,.2,.35,4,4.5,4,.7,64],
      [75,135,2.4,2,.2,.35,4,3.7,5,.8,95],
      [50,100,4,2,.35,.55,5,4.5,5,.7,65]
    ];
    profiles.forEach(function(p,i){
      var values=[p.maxVelocity[2],p.afterburnerVelocity[2],p.forwardAccel,p.forwardDecel,p.damp,p.rotdamp].concat(p.rotationTime,[p.afterburnerAccel,p.overclockSpeed]);
      if(i<4){assert(JSON.stringify(values)===JSON.stringify(expected[i]));assert(p.maxVelocity[0]===0 && p.maxVelocity[1]===0 && p.rearVelocity===0);}
      else values.forEach(function(v){assert(Number.isFinite(v));});
      var state=window.Driftworks.arcade.create(18);
      window.Driftworks.arcade.step(state,p,{pitch:1},.05);
      assertClose(state.rates[0],2*Math.PI/p.rotationTime[0]*(1-Math.exp(-.05/p.rotdamp)));
    });
  });

  test('assets', 'original mining rig catalog uses canonical geometry and separate provenance', function () {
    var DW=window.Driftworks,entry=DW.originalShipModels[0];assert(entry.id==='driftworks:mining-rig');assert(entry.author==='Driftworks');
    assert(entry.provenance.indexOf('driftworks-originals')>=0);
    var batches=entry.geometry(1),source=DW.scene3d.miningPlatformGeometry(1,0,false,0,'');
    assert(batches.reduce(function(n,b){return n+b.vertices.length;},0)===Object.keys(source).reduce(function(n,k){return n+source[k].length;},0));
    batches.forEach(function(batch){for(var i=0;i<batch.vertices.length;i+=6)assert(Math.hypot(batch.vertices[i],batch.vertices[i+1],batch.vertices[i+2])<=8.50001);});
    assert(!DW.shipPackModels.find(entry.id),'Originals are kept out of imported fighter packs');
  });
  };
})();
