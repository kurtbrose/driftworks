(function () {
  'use strict';

  window.DriftworksSharedTests = window.DriftworksSharedTests || {};
  window.DriftworksSharedTests.flight = function (harness, fixtures) {
    var sim = window.Driftworks.sim;
    var game = window.Driftworks.game;
    var hud = window.Driftworks.hud;
    var test = harness.test, assert = harness.assert, assertClose = harness.assertClose;
    var flightDisplayDocument = fixtures.flightDisplayDocument;
    var flightControlsFixture = fixtures.flightControlsFixture;


  test('flight', 'Selected offscreen bearing has a large filled edge arrow and a fixed central double chevron', function () {
    var translations=[],rotations=[],widths=[],points=[],fills=0,depth=0;
    var ctx={save:function(){depth++;},restore:function(){depth--;},translate:function(x,y){translations.push([x,y]);},
      rotate:function(a){rotations.push(a);},beginPath:function(){},closePath:function(){},
      moveTo:function(x,y){points.push([x,y]);},lineTo:function(x,y){points.push([x,y]);},
      stroke:function(){widths.push(this.lineWidth);},fill:function(){fills++;}};
    var paint=window.Driftworks.flightHud.paintTargetBearing;
    paint(ctx,1000,800,0);
    assertClose(translations[0][0],940);assertClose(translations[0][1],400);
    assertClose(translations[1][0],576);assertClose(translations[1][1],400);
    assert(fills===1&&points.some(function(p){return p[0]===20;}),'Selected edge arrow is filled and larger than ordinary eight-pixel arrows');
    assert(widths.join(',')==='4,7,3'&&depth===0,'Dark outlines improve contrast and canvas state is restored');
    translations=[];paint(ctx,1000,800,Math.PI/2);
    assertClose(translations[0][0],500);assertClose(translations[0][1],672);
    assertClose(translations[1][0],500);assertClose(translations[1][1],476);
    translations=[];paint(ctx,1000,800,Math.PI);
    assertClose(translations[0][0],60);assertClose(translations[1][0],424);
    assertClose(rotations[rotations.length-1],Math.PI);
  });

  test('flight', 'Target status trails, collapse flash, switching and rewind', function () {
    var update = window.Driftworks.flightHud.targetStatus;
    var fills = [];
    var context = {save: function () {}, restore: function () {},
      fillRect: function (x, y, width, height) { fills.push({x:x,y:y,width:width,height:height}); }};
    window.Driftworks.flightHud.paintTargetStatus(context, 50, 60, {
      shield: .5, hull: .8, shieldTrail: 1, hullTrail: 1, shieldAge: .1, hullAge: .1, flash: 0
    });
    assert(fills.some(function (r) { return r.x === 25 && r.y === 99 && r.width === 25 && r.height === 4; }), 'Shield fill reflects half health');
    assert(fills.some(function (r) { return r.x === 25 && r.y === 107 && r.width === 40 && r.height === 4; }), 'Hull fill reflects eighty percent health');
    assert(fills.every(function (r) { return r.y >= 97; }), 'Meters stay below the target and range label');

    var target = {id: 'a', shield: 100, maxShield: 100, hp: 100, maxHp: 100};
    var state = update(null, target, 0);
    target.shield = 0; target.hp = 60;
    state = update(state, target, .1);
    assertClose(state.shieldTrail, 1);
    assertClose(state.hullTrail, 1);
    assertClose(state.flash, .22);
    state = update(state, target, .35);
    assertClose(state.flash, 0);
    state = update(state, target, .61);
    assertClose(state.shieldTrail, 0);
    assertClose(state.hullTrail, .6);
    assertClose(state.flash, 0);
    target.id = 'b';
    state = update(state, target, .7);
    assertClose(state.hullTrail, .6);
    assertClose(state.flash, 0);
    assert(update(state, undefined, .8) === null);
    state = update(state, target, 0);
    assertClose(state.time, 0);
  });

  test('flight', 'controlled craft owns defenses, weapons and legal input just like AI craft', function () {
    var DW=window.Driftworks,api=DW.training,t=api.create(),pose=DW.arcade.create(0);
    var own=api.bindPlayer(t,pose),other=api.createCraft('wingman',DW.arcade.create(0),'ally');
    t.enemies=[other];other.pose.eye=[30,30,30];
    assert(api.participants(t)[0]===own&&api.participants(t)[1]===other);
    var weapon={damage:30,shieldFactor:1,armorFactor:1};
    api.damageCraft(t,own,weapon);api.damageCraft(t,other,weapon);
    assert(own.hp===other.hp&&own.shield===other.shield&&t.shield===own.shield);
    var input={throttle:.7,throttleRate:0,fire:true,pitch:.2,yaw:0,roll:0};
    api.stepInput(own,input,1/120);api.stepInput(other,input,1/120);
    assertClose(own.pose.throttle,other.pose.throttle);assert(own.fire&&other.fire);
    var heading=other.pose.back.slice();api.step(t,pose,1/120,0);
    assert(JSON.stringify(other.pose.back)===JSON.stringify(heading),'AI must not take over an input-controlled wingman');
    var checkpoint=JSON.parse(JSON.stringify(t));
    assert(checkpoint.player.hp===own.hp&&checkpoint.player.collision.kind==='sphere'&&!('hull' in checkpoint)&&!('dead' in checkpoint));
  });

  test('flight', 'all craft use team-aware nearest-hit damage and local death does not stop combat', function () {
    var DW=window.Driftworks,api=DW.training,t=api.create('furball'),pose=DW.arcade.create(0),U=sim.METERS_PER_UNIT;
    api.bindPlayer(t,pose);pose.eye=[50,50,50];
    var ally=api.createCraft('wingman',DW.arcade.create(0),'ally'),enemy=api.createCraft('raider',DW.arcade.create(0),'enemy');
    ally.pose.eye=[0,20/U,0];enemy.pose.eye=[0,40/U,0];t.enemies=[ally,enemy];
    var bolt={weapon:{damage:30,shieldFactor:1,armorFactor:1}},before=enemy.shield;
    api.trace(t,[0,0,0],[0,60/U,0],bolt,ally,null,pose);
    assert(ally.shield===120&&enemy.shield<before);
    api.trace(t,[0,60/U,0],[0,0,0],bolt,enemy,null,pose);
    assert(ally.shield<120,'An input-controlled ally is a normal damage target');
    api.damageCraft(t,t.player,{damage:10000,shieldFactor:1,armorFactor:1},enemy);
    assert(t.dead&&t.wrecks.length===1);var time=t.time,hp=t.player.hp;
    api.step(t,pose,1/120,0);assert(t.time>time&&t.player.hp===hp);
    api.damagePlayer(t,bolt.weapon);assert(t.wrecks.length===1,'Death resolves once');
  });

  test('flight', 'simulation collision models survive cosmetic changes and JSON round trips', function () {
    var DW=window.Driftworks,api=DW.training,session=DW.flightSession.create({});
    var view=session.reset({mode:'furball',enabled:true,profile:DW.arcade.profiles[0]}),craft=view.combat.enemies[0];
    assert(craft.collision.kind==='model');
    var clone=JSON.parse(JSON.stringify(craft)),U=sim.METERS_PER_UNIT;
    clone.pose=DW.arcade.create(0);clone.pose.eye=[0,0,0];
    var shape=JSON.stringify(clone.collision),start=[0,0,100/U],end=[0,0,-100/U];
    var first=api.hullHit(clone,start,end);assert(first&&first.model.id===clone.collision.modelId);
    clone.index=100;clone.team='enemy';clone.artWave=30;
    var second=api.hullHit(clone,start,end);
    assert(JSON.stringify(second)===JSON.stringify(first)&&JSON.stringify(clone.collision)===shape);
    var sphere=api.createCraft('sphere',DW.arcade.create(0),'enemy');sphere.pose.eye=[0,0,0];sphere.collision.radiusM=2;
    assert(!api.hullHit(sphere,[3/U,-10/U,0],[3/U,10/U,0]));
    sphere.collision.radiusM=4;assert(api.hullHit(sphere,[3/U,-10/U,0],[3/U,10/U,0]));
  });

  test('flight', 'normal flight hull selections match rendered models across changes, waves and reloads', function () {
    var DW=window.Driftworks,api=DW.training,models=DW.shipPackModels,U=sim.METERS_PER_UNIT;
    var session=DW.flightSession.create({}),view=session.reset({mode:'furball',enabled:true,profile:DW.arcade.profiles[0]});
    var catalog=DW.shipPacks[0].models,choices=[['mixed','mixed'],[catalog[0].id,catalog[1].id],['',''],[catalog[1].id,catalog[0].id]];
    function verify(combat,ally,enemy){
      api.participants(combat).forEach(function(craft){
        var visible=DW.flightPresentation.model(craft,combat.wave,{allyArt:ally,enemyArt:enemy});
        assert(craft.collision.kind==='model'&&craft.collision.modelId===visible.id,'Visible and collision model must be identical');
        var start=craft.pose.eye.map(function(x,i){return x+craft.pose.up[i]*100/U;}),end=craft.pose.eye.map(function(x,i){return x-craft.pose.up[i]*100/U;});
        var expected=models.hullHit(visible,craft.pose,start,end,U),actual=api.hullHit(craft,start,end);
        assert(!!actual===!!expected);
        if(expected){assert(actual.model.id===visible.id);expected.point.forEach(function(x,i){assertClose(actual.point[i],x);});}
      });
    }
    choices.forEach(function(choice){
      var previousId=view.combat.enemies[0].collision.modelId;
      view.combat.enemies[0].scorches=[{modelId:'old-mesh'}];
      session.configureHulls(choice[0],choice[1]);verify(view.combat,choice[0],choice[1]);
      if(previousId!==view.combat.enemies[0].collision.modelId)assert(view.combat.enemies[0].scorches.length===0,'Changing hull clears marks belonging to the old mesh');
      var shape=view.combat.enemies[0].collision,marks=view.combat.enemies[0].scorches;
      session.configureHulls(choice[0],choice[1]);
      assert(view.combat.enemies[0].collision===shape&&view.combat.enemies[0].scorches===marks,'Unchanged selections preserve hull and marks');
      var clone=JSON.parse(JSON.stringify(view.combat));verify(clone,choice[0],choice[1]);
      api.spawn(view.combat,view.state,view.asteroid.radius);
      // Spawning uses the stored selections before any presentation frame runs.
      view.combat.enemies.forEach(function(craft){assert(craft.collision.modelId===models.craftModel(craft,craft.team==='ally'?choice[0]:choice[1],view.combat.wave).id);});
      api.configureHulls(view.combat,choice[0],choice[1]);verify(view.combat,choice[0],choice[1]);
    });
    assert(DW.flightDuel.create({duration:1}).enemy.collision.kind==='model','Watch benchmarks share triangle collision rules');
  });
  test('flight', 'evaluation pilots reject illegal control records without silently repairing them', function () {
    var api=window.Driftworks.flightAI, valid={pitch:0,yaw:0,roll:0,side:0,vertical:0,throttle:1,fire:false,boost:false};
    [Object.assign({},valid,{pitch:1.01}),Object.assign({},valid,{yaw:NaN}),Object.assign({},valid,{throttle:-.1}),Object.assign({},valid,{boost:1}),Object.assign({},valid,{teleport:true})].forEach(function(input){
      var rejected=false;try{api.validate(input);}catch(e){rejected=true;}assert(rejected);
    });
    assert(api.validate(valid)!==valid);
  });

  test('flight', 'watch playback uses the benchmark clock and cameras never alter duel state', function () {
    var DW=window.Driftworks,session=DW.flightSession.create({terrainHit:function(){return null;},surfaceFrame:function(){return {point:[0,0,1]};},onGunshot:function(){},onImpact:function(){}});
    var options={start:'crossing',category:'human',flavor:'novice',seed:29,duration:3},watch=DW.flightWatch.create(session,options),reference=DW.flightDuel.run(options);
    var stateBefore=JSON.stringify(watch.snapshot(false).state);
    var chase=watch.snapshot(true);assert(chase.observerCraft.pose===chase.state && chase.camera!==chase.state);
    assert(JSON.stringify(watch.snapshot(false).state)===stateBefore && !watch.snapshot(false).camera);
    assert(chase.combat.enemies.length===1 && chase.combat.enemies[0].team!=='ally','The observed player must not enter simulation enemy lists');
    for(var i=0;i<360;i++)watch.advance(1/60,.5);
    assert(JSON.stringify(watch.summary())===JSON.stringify(reference.summary()));
    assert(JSON.stringify(watch.replay.inputs)===JSON.stringify(reference.replay.inputs));
    var completed=JSON.stringify(watch.summary()),worldTime=session.snapshot().world.elapsedSeconds;watch.advance(5,1);
    assert(JSON.stringify(watch.summary())===completed && session.snapshot().world.elapsedSeconds===worldTime);
    var replacement=Object.assign({},session.snapshot().world,{camera:{x:99,y:88,zoom:1}});session.setWorld(replacement);
    assert(watch.snapshot(true).world===replacement,'Watch rendering must follow camera-driven world replacements');
    var restarted=DW.flightWatch.create(session,options);assert(restarted.summary().ticks===0 && restarted.snapshot(false).guns.fired===0);
    var rejected=false;try{restarted.advance(.1,2);}catch(e){rejected=true;}assert(rejected);
  });

  test('flight', 'evaluation pilots only read poses and replay through ordinary shared physics', function () {
    var DW=window.Driftworks,api=DW.flightAI,p=DW.arcade.profiles[0],w=DW.retailWeapons[0];
    ['human','perfect'].forEach(function(category){
      var own=DW.arcade.createSortie(0,p),target=DW.arcade.createSortie(0,p);target.eye=[4,10,0];
      [own,target].forEach(function(state){Object.keys(state).forEach(function(k){if(Array.isArray(state[k]))Object.freeze(state[k]);});Object.freeze(state);});
      var pilot=api.create(category,'practiced',31),before=JSON.stringify([own,target]);
      for(var i=0;i<80;i++){
        api.validate(pilot.step(i/120,own,target,p,w));
      }
      assert(JSON.stringify([own,target])===before);
    });
  });

  test('flight', 'human simulator reacts to delayed observations and cannot use current hidden truth', function () {
    var DW=window.Driftworks,api=DW.flightAI,p=DW.arcade.profiles[0],w=DW.retailWeapons[0],own=DW.arcade.create(0);
    var a=api.create('human','novice',17),b=api.create('human','novice',17),target={eye:[0,10,0],velocity:[0,0,0]};
    assert(!a.step(0,own,target,p,w).fire);b.step(0,own,target,p,w);
    a.step(.22,own,target,p,w);b.step(.22,own,{eye:[10,0,0],velocity:[50,0,0]},p,w);
    assert(JSON.stringify(a.step(.35,own,target,p,w))===JSON.stringify(b.step(.35,own,{eye:[-10,0,0],velocity:[-50,0,0]},p,w)),'Only the identical first sample has arrived');
    assert(JSON.stringify(a.step(.57,own,target,p,w))!==JSON.stringify(b.step(.57,own,target,p,w)),'The changed observation must eventually affect controls');
  });

  test('flight', 'perfect pilot takes a valid shot immediately without opponent burst concessions', function () {
    var DW=window.Driftworks,p=DW.arcade.profiles[0],own=DW.arcade.create(0),target={eye:[0,300/sim.METERS_PER_UNIT,0],velocity:[0,0,0]};
    assert(DW.flightAI.create('perfect').step(0,own,target,p,DW.retailWeapons[0]).fire);
    var invalid=DW.flightAI.solution(own,[0,2000/sim.METERS_PER_UNIT,0],[0,0,0],DW.retailWeapons[0]);
    assert(!invalid.valid && invalid.time>DW.retailWeapons[0].lifetime);
  });

  test('flight', 'duel input replays reproduce combat and frame batching preserves the fixed clock', function () {
    var api=window.Driftworks.flightDuel,options={start:'crossing',category:'human',flavor:'expert',seed:29,duration:3};
    var a=api.run(options),b=api.create(options),physical=window.Driftworks.flightAI.copy(b.player);
    for(var i=0;i<180;i++)b.advance(1/60);
    var c=api.replay(JSON.parse(JSON.stringify(a.replay)));
    assert(JSON.stringify(a.summary())===JSON.stringify(b.summary()));
    assert(JSON.stringify(a.summary())===JSON.stringify(c.summary()));
    assert(JSON.stringify(a.player)===JSON.stringify(c.player));assert(JSON.stringify(a.enemy)===JSON.stringify(c.enemy));
    a.replay.inputs.forEach(function(input){physical.throttle=input.throttle;window.Driftworks.arcade.step(physical,b.enemy.profile,input,api.dt);});
    assert(JSON.stringify(physical)===JSON.stringify(a.player),'Real player movement must equal the recorded legal controls integrated once per tick');
    var bad=JSON.parse(JSON.stringify(a.replay));bad.inputs[0].throttle=2;
    var rejected=false;try{api.replay(bad);}catch(e){rejected=true;}assert(rejected);
  });

  test('flight', 'duels stop at destruction without respawning and equip retail defenses on both pilots', function () {
    var api=window.Driftworks.flightDuel,duel=api.create({start:'headOn',category:'perfect',duration:10});
    duel.advance(.2);assert(duel.summary().playerShots>0);
    window.Driftworks.training.damageCraft(duel.combat,duel.enemy,{damage:10000,armorFactor:1,shieldFactor:1},duel.combat.player);
    duel.advance(api.dt);assert(duel.summary().outcome==='player-win');
    var before=JSON.stringify(duel.summary());duel.advance(30);assert(JSON.stringify(duel.summary())===before);
    assert(duel.combat.enemies.length===1 && duel.combat.wave===1);assert(duel.combat.maxHull===180 && duel.enemy.maxHp===180);
    assert(duel.combat.maxShield===380 && duel.enemy.maxShield===380);
  });

  test('flight', 'retail catalogs include old Hercules, Vasudan and Shivan capabilities without conflating artwork',function(){
    var DW=window.Driftworks,profiles=DW.arcade.profiles,find=function(name){return profiles.find(function(p){return p.name===name;});};
    assert(profiles.length===35 && DW.retailWeapons.length===10);
    assert(find('GTF Hercules').hull===250 && find('GTF Hercules').shield===600);
    assert(find('GTF Hercules Mark II').hull===275 && find('GTF Hercules Mark II').shield===610);
    assert(find('GVF Horus').shield===230 && find('SF Dragon').shield===700 && find('SF Dragon').hull===100);
    profiles.forEach(function(p){assert(p.hull>0 && p.shield>=0 && p.rotationTime.every(function(v){return v>0;}));assert(DW.training.defaultWeapon(p)>=0);});
  });

  test('flight', 'shield absorption, hull spillover and recharge are symmetric and unshielded is explicit',function(){
    var DW=window.Driftworks,ai=DW.training,player=DW.arcade.create(0),t=ai.create('training'),p=Object.assign({},DW.arcade.profiles[0],{hull:100,shield:10});
    ai.configure(t,p);ai.spawn(t,player,0);t.enemies=t.enemies.slice(0,1);var e=t.enemies[0];ai.equip(e,p,0);
    var weapon={damage:30,shieldFactor:1,armorFactor:1};ai.damagePlayer(t,weapon);ai.damageEnemy(t,e,weapon);
    assert(t.shield===0 && e.shield===0 && t.hull===80 && e.hp===80);
    t.time=7;ai.step(t,player,1/120,0);assertClose(t.shield,e.shield);assertClose(t.shield,.1);
    ai.configure(t,p,true);ai.equip(e,p,0,true);t.time=20;ai.step(t,player,1/120,0);assert(t.shield===0 && e.shield===0);
    var session=DW.flightSession.create({});session.reset({mode:'training',enabled:true,profile:DW.arcade.profiles[1]});
    assert(session.snapshot().combat.maxShield===600 && session.snapshot().combat.enemies.every(function(c){return c.maxShield===c.profile.shield;}));
  });

  test('flight', 'duel loadouts match or differ by ship and weapon and reject legacy replay schemas',function(){
    var DW=window.Driftworks,api=DW.flightDuel,dragon=DW.arcade.profiles.findIndex(function(p){return p.name==='SF Dragon';});
    var duel=api.create({profile:1,opponentProfile:dragon,weapon:2}),s=duel.summary();
    assert(s.playerMaxShield===600 && s.opponentMaxShield===700 && s.weapon==='Prometheus S' && s.opponentWeapon===s.weapon);
    assert(duel.enemy.weaponIndex===2 && duel.enemy.profile.name==='SF Dragon');
    var defaults=api.create({profile:1,opponentProfile:dragon}).summary();assert(defaults.opponentWeapon==='Shivan Heavy Laser');
    var bare=api.create({profile:1,unshielded:true}).summary();assert(bare.playerMaxShield===0 && bare.opponentMaxShield===0 && bare.playerMaxHull===250 && bare.opponentMaxHull===250);
    var record=JSON.parse(JSON.stringify(duel.replay));record.version=1;var rejected=false;try{api.replay(record);}catch(e){rejected=true;}assert(rejected);
  });

  test('flight', 'watch and headless duels retain exact triangle hulls in links and replay', function () {
    var DW=window.Driftworks,api=DW.flightDuel,models=DW.shipPacks[0].models;
    var options={allyHull:models[1].id,enemyHull:models[4].id,duration:.2,start:'tail'};
    var duel=api.run(options);
    assert(duel.combat.player.collision.modelId===options.allyHull&&duel.enemy.collision.modelId===options.enemyHull);
    assert(duel.summary().allyHull===options.allyHull&&duel.summary().enemyHull===options.enemyHull);
    [duel.combat.player,duel.enemy].forEach(function(craft){
      var U=DW.sim.METERS_PER_UNIT,visible=DW.flightPresentation.model(craft,1,{allyArt:options.allyHull,enemyArt:options.enemyHull});
      var start=craft.pose.eye.map(function(x,i){return x+craft.pose.up[i]*100/U;}),end=craft.pose.eye.map(function(x,i){return x-craft.pose.up[i]*100/U;});
      var hit=DW.training.hullHit(craft,start,end),expected=DW.shipPackModels.hullHit(visible,craft.pose,start,end,U);
      assert(hit&&expected&&hit.model.id===visible.id);assertClose(hit.fraction,expected.fraction);
    });
    var record=JSON.parse(JSON.stringify(duel.replay));assert(record.version===5);
    assert(JSON.stringify(api.replay(record).summary())===JSON.stringify(duel.summary()));
    var imported=api.readWatchSearch(DW.flightStudy.watchUrl(duel.replay.options).split('?')[1]);
    assert(imported.allyHull===options.allyHull&&imported.enemyHull===options.enemyHull);
    var defaults=api.create({duration:.1});assert(defaults.replay.options.allyHull!=='mixed'&&defaults.replay.options.enemyHull!=='mixed');
    record.version=4;var rejected=false;try{api.replay(record);}catch(error){rejected=true;}assert(rejected);
    rejected=false;try{api.create({allyHull:'missing-mesh'});}catch(error){rejected=true;}assert(rejected);
    var session=DW.flightSession.create({}),watch=DW.flightWatch.create(session,options);
    assert(watch.snapshot(true).observerCraft.collision.modelId===options.allyHull);
  });
  test('flight', 'all duel geometries and human flavors stay finite, deterministic and input bounded', function () {
    var DW=window.Driftworks,api=DW.flightDuel;
    api.starts.forEach(function(start){['novice','practiced','expert'].forEach(function(flavor){
      var options={start:start,category:'human',flavor:flavor,seed:8,duration:.6},a=api.run(options),b=api.run(options);
      assert(JSON.stringify(a.summary())===JSON.stringify(b.summary()));
      a.replay.inputs.forEach(function(input){DW.flightAI.validate(input);});
      [a.player,a.enemy.pose].forEach(function(p){p.eye.concat(p.velocity,p.rates).forEach(function(v){assert(Number.isFinite(v));});assertClose(Math.hypot.apply(null,p.back),1);});
    });});
  });

  test('flight', 'flight sessions expose complete state before the first reset', function () {
    var session = window.Driftworks.flightSession.create({}), view = session.snapshot();
    assert(view.state.eye.every(Number.isFinite));
    assert(view.state.throttle === 0 && view.guns.fired === 0);
    assert(view.combat.enemies.length === 0 && !view.contact);
    assert(session.snapshot().state === view.state);
  });

  test('flight', 'training destruction accepts an explicitly unknown shooter', function () {
    var DW = window.Driftworks, combat = DW.training.create('training'), pose = DW.arcade.create(20);
    DW.training.spawn(combat, pose, 20);
    var victim = combat.enemies[0];
    victim.hp = 1;
    DW.training.damageEnemy(combat, victim, DW.retailWeapons[0], null);
    assert(victim.hp === 0 && combat.wrecks.length === 1);
    assert(combat.radioEvents[0].killer === null);
  });

  test('flight', 'flight diagnostics preserve frame pacing, elapsed clamps and measurement resets',function(){
    var doc=flightDisplayDocument(),now=1000,reads=0;
    doc.getElementById('fps-cap').value='60';doc.getElementById('render-mode').value='normal';doc.getElementById('render-scale').value='0.5';
    doc.getElementById('draw-mothership').checked=true;doc.getElementById('draw-enemies').checked=true;
    var diagnostics=window.Driftworks.flightDiagnostics.mount({document:doc,performance:{now:function(){return now;}}});
    function stats(){reads++;return {scene:{cpuMs:1,drawCalls:3,triangles:100,meshes:2,materials:2,width:800,height:600,pixelRatio:1},sky:{drawCalls:1,triangles:20,meshes:1,materials:1,points:3200}};}
    var comparison=diagnostics.settings(),frame=diagnostics.beginFrame(1000,false);
    assert(comparison.scale===.5&&comparison.mothership&&comparison.actors&&!comparison.flat);
    assert(frame.elapsed===0&&frame.actualElapsed===0);now+=2;diagnostics.endFrame(frame,false,comparison,stats);
    var overlay=doc.getElementById('perf-overlay');assert(overlay.hidden&&reads===1);
    assert(overlay.textContent.indexOf('Draw calls 4')>=0&&overlay.textContent.indexOf('triangles 120')>=0);
    assert(diagnostics.beginFrame(1010,false)===null);
    frame=diagnostics.beginFrame(1017,false);assertClose(frame.elapsed,.017);diagnostics.endFrame(frame,false,comparison,stats);assert(reads===1,'Overlay stats are throttled to 250 ms');
    frame=diagnostics.beginFrame(1400,false);assertClose(frame.actualElapsed,.383);assertClose(frame.elapsed,.1);
    diagnostics.endFrame(frame,false,comparison,stats);assert(overlay.textContent.indexOf('worst 383.0 ms')>=0);
    doc.getElementById('render-scale').listeners.change();
    frame=diagnostics.beginFrame(1410,false);assert(frame.actualElapsed===0);diagnostics.endFrame(frame,false,comparison,stats);assert(overlay.textContent.indexOf('worst 0.0 ms')>=0);
    doc.getElementById('perf-reset').onclick();assertClose(diagnostics.beginFrame(1411,false).elapsed,.001);
    diagnostics.reset();assert(diagnostics.beginFrame(2000,true));assert(diagnostics.beginFrame(2030,true)===null);assert(diagnostics.beginFrame(2067,true));
    doc.getElementById('fps-cap').value='0';doc.getElementById('fps-cap').listeners.change();assert(diagnostics.beginFrame(3000,false).elapsed===0);assertClose(diagnostics.beginFrame(3001,false).elapsed,.001);
    diagnostics.toggleDiagnostics();assert(doc.getElementById('perf-enabled').checked);diagnostics.togglePerformance();assert(!doc.getElementById('perf-enabled').checked);
    diagnostics.toggleDiagnostics();assert(!doc.getElementById('perf-enabled').checked);diagnostics.togglePerformance();assert(doc.getElementById('perf-enabled').checked);
    frame=diagnostics.beginFrame(3300,true);diagnostics.endFrame(frame,true,comparison,stats);assert(!overlay.hidden&&overlay.textContent.indexOf('PAUSED / 15 FPS CAP')===0);
  });

  test('flight', 'phone input detection ignores legacy desktop preference and retains explicit phone overrides',function(){
    var stored={'driftworks.flight.input-mode':'mouse'},storage={getItem:function(key){return stored[key]||null;},setItem:function(key,value){stored[key]=value;}};
    var phone=flightControlsFixture(storage,true,{coarse:true});
    assert(phone.controls.view().inputMode==='touch');
    assert(flightControlsFixture(storage,true,{touchPoints:5}).controls.view().inputMode==='touch');
    assert(flightControlsFixture(storage,true,{touchPoints:5,fine:true}).controls.view().inputMode==='mouse');
    phone.elements['input-mode'].value='controller';phone.elements['input-mode'].onchange();
    assert(flightControlsFixture(storage,true,{coarse:true}).controls.view().inputMode==='controller');
    assert(flightControlsFixture(storage,true,{coarse:true,search:'?mobile=1'}).controls.view().inputMode==='touch');
    var blocked={getItem:function(){throw new Error('Storage blocked');}};
    assert(flightControlsFixture(blocked,true,{coarse:true}).controls.view().inputMode==='touch');
    assert(flightControlsFixture(storage,true,{search:'?note=mobile=1'}).controls.view().inputMode==='controller');
  });

  test('flight', 'touch start requests document fullscreen while desktop start does not',function(){
    var f=flightControlsFixture(undefined,true),requests=0,exits=0;
    f.doc.documentElement={requestFullscreen:function(){requests++;return Promise.resolve();}};
    f.doc.exitFullscreen=function(){exits++;return Promise.resolve();};
    f.elements.fly.emit('click');assert(requests===1);
    f.doc.fullscreenElement={};f.elements['flight-fullscreen'].onclick();assert(exits===1);
    f.doc.fullscreenElement=null;f.elements['input-mode'].value='mouse';
    f.elements.fly.emit('click');assert(requests===1);
    delete f.doc.documentElement;f.elements['input-mode'].value='touch';
    f.elements.fly.emit('click');assert(requests===1);
  });

  test('flight', 'touch flight keeps two pointers independent and releases on cancellation and pause',function(){
    var f=flightControlsFixture(undefined,true),root=f.elements['touch-controls'],stick=f.elements['touch-stick'];
    function event(id,x,y){return {pointerId:id,clientX:x,clientY:y,preventDefault:function(){}};}
    assert(f.controls.view().inputMode==='touch');
    stick.emit('pointerdown',event(1,118,72));root.buttons[0].emit('pointerdown',event(2));
    var demand=f.controls.sample();assert(Math.abs(demand.yaw)>.9&&demand.fire);
    stick.emit('pointerup',event(2));assert(Math.abs(f.controls.sample().yaw)>.9);
    root.buttons[0].emit('pointercancel',event(2));assert(!f.controls.sample().fire);
    stick.emit('lostpointercapture',event(1));assert(f.controls.sample().yaw===0);
    root.buttons[1].emit('pointerdown',event(3));root.buttons[2].emit('pointerdown',event(4));
    assert(f.controls.sample().boost&&f.controls.sample().throttleRate===1);
    root.buttons[4].emit('pointerdown',event(5));demand=f.controls.sample();
    assert(!demand.boost&&!demand.fire&&demand.throttleRate===0);
    assert(!f.controls.view().showMouseStick);
  });

  test('flight', 'flight settings follow the player between lab and mission mounts',function(){
    var stored={},storage={getItem:function(key){return stored[key]||null;},setItem:function(key,value){stored[key]=value;}};
    var lab=flightControlsFixture(storage);
    lab.elements['input-mode'].value='controller';lab.elements['input-mode'].onchange();
    lab.elements.sensitivity.value='1.7';lab.elements.sensitivity.oninput();
    var pad={index:2,id:'Preferred pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:[]};
    lab.setPads([pad]);lab.controls.sample();lab.elements.device.value='2';lab.elements.device.onchange();
    var mission=flightControlsFixture(storage);
    assert(mission.controls.view().inputMode==='controller');assert(mission.elements.sensitivity.value==='1.7');
    var other={index:0,id:'Other pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:[]};
    pad.index=1;pad.axes=[.8,0,0,0];mission.setPads([other,pad]);
    assert(mission.controls.sample().yaw!==0);assert(mission.elements.device.value==='1');
    stored['driftworks.flight.input-mode']='invalid';stored['driftworks.flight.sensitivity']='99';
    var defaults=flightControlsFixture(storage);assert(defaults.controls.view().inputMode==='mouse');assert(defaults.elements.sensitivity.value==='1');
  });

  test('flight', 'flight controls leave modified browser and OS shortcuts alone',function(){
    var f=flightControlsFixture();
    ['ctrlKey','altKey','metaKey'].forEach(function(modifier){
      f.key('KeyW');
      ['KeyP','F3','Escape','KeyS','KeyG','KeyV','Tab','Digit2','Space'].forEach(function(code){
        var event={code:code,shiftKey:true,target:{tagName:'BODY'},preventDefault:function(){this.prevented=true;}};
        event[modifier]=true;f.win.emit('keydown',event);
        assert(!event.prevented,'Modified '+code+' must remain available to the browser/OS');
      });
      assert(f.controls.sample().throttleRate===0&&!f.controls.sample().fire);
    });
    assert(f.counts.pause===0&&f.counts.performance===0&&f.counts.diagnostics===0);
    assert(f.counts.weapon===0&&f.counts.radar===0&&f.counts.target===0&&f.counts.profile===undefined);
    f.key('ShiftLeft');assert(f.controls.sample().boost);
    f.win.emit('keyup',{code:'ShiftLeft',metaKey:true});assert(!f.controls.sample().boost);
    f.key('KeyP');assert(f.counts.performance===1);
  });

  test('flight', 'flight controls retain keyboard focus guards, shortcuts and pause clearing',function(){
    var f=flightControlsFixture(),c=f.controls;
    assert(f.key('KeyW').prevented);assert(c.sample().throttleRate===1);
    f.win.emit('keyup',{code:'KeyW'});assert(c.sample().throttleRate===0);
    f.key('ArrowUp','INPUT');assert(c.sample().pitch===0);
    f.key('KeyG');f.key('KeyG',null,true);f.key('KeyG','SELECT');assert(f.counts.weapon===1);
    f.key('KeyV');f.key('Tab');f.key('Digit3');assert(f.counts.radar===1&&f.counts.target===1&&f.counts.profile===2);
    f.key('F3','INPUT');f.key('KeyP');assert(f.counts.diagnostics===1&&f.counts.performance===1);
    f.key('Space');f.key('Escape','INPUT');assert(f.counts.pause===1&&!c.sample().fire);
    f.key('KeyW');f.key('Tab');assert(c.sample().throttleRate===0&&f.counts.target===1);
    f.setPaused(false);f.key('KeyW');f.win.emit('blur');assert(c.sample().throttleRate===0);
    f.setPaused(false);f.doc.hidden=true;f.doc.emit('visibilitychange');assert(f.counts.pause===3);
  });

  test('flight', 'flight controls preserve pointer capture and fall back to cursor steering',function(){
    var f=flightControlsFixture(),c=f.controls;
    f.elements['steering-preset'].value='wide-linear';
    c.capture();assert(f.counts.failure===0&&f.counts.resume===1&&c.view().uncapturedMouse);
    f.doc.emit('mousemove',{clientX:580,clientY:360});assert(c.sample().pitch>0&&c.sample().yaw<0);
    f.doc.emit('mousemove',{clientX:500,clientY:400});assert(c.sample().pitch===0&&c.sample().yaw===0);
    f.doc.emit('mousedown',{button:0,target:{}});assert(!c.sample().fire,'UI clicks do not fire');
    f.doc.emit('mousedown',{button:0,target:f.host});assert(c.sample().fire);f.doc.emit('mouseup',{button:0});
    f.host.requestPointerLock=function(){throw new Error('denied');};c.capture();assert(f.counts.failure===0&&f.counts.resume===2);
    f.host.requestPointerLock=function(){return {catch:function(fn){fn(new Error('rejected'));}};};c.capture();assert(f.counts.failure===0&&f.counts.resume===3);
    f.doc.emit('pointerlockerror');assert(f.counts.resume===3,'duplicate failure events do not restart flight');
    f.doc.pointerLockElement=f.host;f.doc.emit('pointerlockchange');assert(f.counts.resume===4&&!c.view().uncapturedMouse);
    f.doc.emit('mousemove',{movementX:80,movementY:-40});
    var demand=c.sample();assert(demand.pitch>0&&demand.yaw<0);assertClose(c.view().stickRange,360);
    assertClose(c.view().mouse[0],80/360);
    f.host.clientWidth=1920;f.host.clientHeight=1080;assertClose(c.view().stickRange,486);
    f.host.clientWidth=600;f.host.clientHeight=900;assertClose(c.view().stickRange,270);
    f.doc.emit('mousedown',{button:2});assert(c.sample().fire);
    f.doc.emit('mouseup',{button:2});assert(!c.sample().fire);
    f.key('KeyC');assert(c.sample().pitch===0&&c.view().mouse[0]===0);
    f.doc.getElementById('input-mode').value='controller';f.doc.emit('mousemove',{movementX:80,movementY:40});assert(c.sample().yaw===0);
    c.release();assert(f.doc.pointerLockElement===null);f.doc.emit('pointerlockchange');assert(f.counts.pause===1);
    f.setDead(true);f.doc.pointerLockElement=f.host;f.doc.emit('pointerlockchange');assert(f.counts.resume===4&&f.counts.pause===2);
  });

  test('flight', 'cursor fallback pauses on exit and ignores a late canceled capture failure',function(){
    var f=flightControlsFixture(),reject;
    f.controls.capture();f.doc.emit('mousemove',{clientX:600,clientY:350});assert(f.controls.sample().yaw!==0);
    f.host.emit('mouseleave');assert(f.counts.pause===1&&!f.controls.view().uncapturedMouse&&f.controls.sample().yaw===0);
    f.host.requestPointerLock=function(){return {catch:function(fn){reject=fn;}};};f.controls.capture();
    f.key('Escape');var resumes=f.counts.resume;reject(new Error('late rejection'));
    assert(f.counts.resume===resumes&&!f.controls.view().uncapturedMouse);
  });

  test('flight', 'paused steering presets preserve all three travel and response combinations',function(){
    var f=flightControlsFixture(),c=f.controls,preset=f.elements['steering-preset'];
    assert(preset.value==='medium-soft');assertClose(c.view().stickRange,240);
    preset.value='medium-soft';preset.onchange();assert(f.counts.pause===1);assertClose(c.view().stickRange,240);
    f.doc.pointerLockElement=f.host;f.doc.emit('pointerlockchange');
    f.doc.emit('mousemove',{movementX:129.6,movementY:0});assertClose(c.sample().yaw,-Math.pow(.5,1.6));
    preset.value='original';preset.onchange();assertClose(c.view().stickRange,160);assertClose(c.view().mouse[0],0);
    f.doc.pointerLockElement=f.host;f.doc.emit('pointerlockchange');
    f.doc.emit('mousemove',{movementX:86.4,movementY:0});assertClose(c.sample().yaw,-.5);
    preset.value='wide-linear';preset.onchange();
    f.doc.pointerLockElement=f.host;f.doc.emit('pointerlockchange');
    f.doc.emit('mousemove',{movementX:194.4,movementY:0});assertClose(c.sample().yaw,-.5);
  });

  test('flight', 'mouse guide follows recent stick movement without noise or held input stealing it back',function(){
    var f=flightControlsFixture(),c=f.controls,pad={index:0,id:'Guide pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},function(){return {pressed:false,value:0};})};
    f.setPads([pad]);c.sample();assert(c.view().showMouseStick);
    f.doc.pointerLockElement=f.host;f.doc.emit('mousemove',{movementX:60,movementY:0});
    pad.axes[0]=.01;c.sample();assert(c.view().showMouseStick);
    pad.axes[0]=.7;c.sample();assert(!c.view().showMouseStick);assertClose(c.view().mouse[0],0);
    f.doc.emit('mousemove',{movementX:0,movementY:0});assert(!c.view().showMouseStick);
    f.doc.emit('mousemove',{movementX:10,movementY:0});c.sample();assert(c.view().showMouseStick);
    pad.axes[0]=.705;c.sample();assert(c.view().showMouseStick);
    pad.axes[0]=.9;c.sample();assert(!c.view().showMouseStick);
    pad.axes[0]=0;c.sample();assert(!c.view().showMouseStick);
    f.doc.emit('mousemove',{movementX:1,movementY:0});assert(c.view().showMouseStick);
  });

  test('flight', 'fresh controller buttons take over from mouse and another idle device',function(){
    var f=flightControlsFixture(),c=f.controls;
    function pad(index){return {index:index,id:'Takeover '+index,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},function(){return {pressed:false,value:0};})};}
    var idle=pad(0),active=pad(1);f.setPads([idle,active]);c.sample();
    f.doc.pointerLockElement=f.host;f.doc.emit('mousemove',{movementX:100,movementY:0});
    active.buttons[7].pressed=true;var demand=c.sample();
    assert(f.elements.device.value==='1'&&demand.fire);assert(demand.yaw===0&&!c.view().showMouseStick,'Button takeover clears mouse steering');
    f.doc.emit('mousemove',{movementX:50,movementY:0});c.sample();assert(c.view().showMouseStick,'Held button does not steal mouse back');
    f.setPaused(true);c.sample();assert(f.counts.resume===0,'Held buttons do not unpause');
    active.buttons[7].pressed=false;c.sample();active.buttons[0].pressed=true;c.sample();
    assert(f.counts.resume===1&&!c.view().showMouseStick,'Fresh button resumes without pointer lock or mode selection');
    active.buttons[9].pressed=true;c.sample();c.sample();assert(f.counts.pause===1&&f.counts.resume===1,'Pause remains paused while held');
    active.buttons[9].pressed=false;c.sample();f.setDead(true);active.buttons[2].pressed=true;c.sample();assert(f.counts.resume===1,'Cannot resume a dead ship');
  });

  test('flight', 'nonstandard joystick throttle axis and increase/decrease buttons can be remapped',function(){
    var f=flightControlsFixture(),c=f.controls,pad={index:0,id:'Throttle pad',connected:true,mapping:'',axes:[0,0,0,-1],buttons:Array.from({length:16},function(){return {pressed:false,value:0};})};
    f.setPads([pad]);c.sample();var bindings=f.elements.bindings.children;
    bindings[3].children[0].value='3';bindings[3].children[0].onchange();assertClose(c.sample().throttle,1);
    pad.axes[3]=1;assertClose(c.sample().throttle,0);
    bindings[3].children[1].checked=false;bindings[3].children[1].onchange();assertClose(c.sample().throttle,1);
    bindings[3].children[0].value='-1';bindings[3].children[0].onchange();assert(c.sample().throttle===null);
    bindings[8].children[0].value='4';bindings[8].children[0].onchange();
    bindings[9].children[0].value='5';bindings[9].children[0].onchange();
    pad.buttons[4].pressed=true;assertClose(c.sample().throttleRate,1);
    pad.buttons[4].pressed=false;pad.buttons[5].pressed=true;assertClose(c.sample().throttleRate,-1);
  });

  test('flight', 'flight controls retain controller edges, editable bindings and disconnect pause',function(){
    var f=flightControlsFixture(),c=f.controls,pad={index:0,id:'Test controller',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},function(){return {pressed:false,value:0};})};
    f.setPads([null,pad,null]);c.sample();assert(f.elements.bindings.children.length===11);
    pad.buttons[3].pressed=true;c.sample();c.sample();assert(f.counts.weapon===1);
    pad.buttons[3].pressed=false;c.sample();pad.buttons[3].pressed=true;c.sample();assert(f.counts.weapon===2);
    var pitchSelect=f.elements.bindings.children[0].children[0];pitchSelect.value='0';pitchSelect.onchange();pad.axes[0]=1;assertClose(c.sample().pitch,-1);
    f.elements.deadzone.value='.8';f.elements.deadzone.onchange({target:f.elements.deadzone});assert(f.elements.deadzone.value==='0.5');
    pad.buttons[9].pressed=true;c.sample();c.sample();assert(f.counts.pause===1&&f.counts.weapon===2);
    f.setPaused(false);c.resetButtons();c.sample();assert(f.counts.pause===2);
    f.setPaused(false);f.key('KeyW');f.setPads([]);c.sample();assert(f.counts.pause===3&&c.sample().throttleRate===0);
  });

  test('flight', 'gamepad rumble mixes boost and priority jolts, stops and tolerates unsupported hardware', function () {
    var f=flightControlsFixture(),calls=[],resets=0;
    f.elements['input-mode'].value='controller';
    var actuator={playEffect:function(type,effect){calls.push(effect);assert(type==='dual-rumble');return Promise.resolve('complete');},reset:function(){resets++;return Promise.resolve('complete');}};
    var pad={index:0,id:'Rumble pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:[],vibrationActuator:actuator};
    f.setPads([pad]);f.controls.sample();
    f.controls.haptics(.016,{boost:true});assert(calls.length===1 && calls[0].strongMagnitude<.15 && calls[0].weakMagnitude<.15);
    f.controls.haptics(.016,{boost:true});assert(calls.length===1,'Sustained rumble is rate limited');
    f.controls.haptics(.016,{hit:true,boost:true});assert(calls[1].strongMagnitude===.55);
    f.controls.haptics(.016,{shieldBreak:true});assert(calls[2].strongMagnitude===.8);
    f.controls.haptics(.016,{fire:true});assert(calls.length===3,'Recoil cannot replace shield-break feedback');
    f.controls.clear();assert(resets===1);f.controls.haptics(.016,{fire:true});assert(calls[3].weakMagnitude===.2);
    f.controls.haptics(.2,{});assert(resets===2);
    f.controls.haptics(.016,{contact:true});assert(calls[4].strongMagnitude===.65);
    f.elements.rumble.checked=false;f.elements.rumble.onchange();assert(resets===3);
    f.controls.haptics(.1,{boost:true,hit:true});assert(calls.length===5);
    f.elements.rumble.checked=true;f.setPaused(true);f.controls.haptics(.1,{hit:true});assert(calls.length===5);
    f.setPaused(false);f.controls.haptics(.1,{boost:true});f.setPads([]);f.controls.sample();assert(resets===4);
    f.controls.haptics(.1,{hit:true});assert(calls.length===6);
    delete pad.vibrationActuator;f.setPads([pad]);f.controls.sample();f.setPaused(false);f.controls.haptics(.1,{hit:true});
    pad.vibrationActuator={playEffect:function(){throw Error('Not supported');},reset:function(){throw Error('Disconnected');}};
    f.controls.haptics(.1,{hit:true});f.controls.clear();
    pad.vibrationActuator={playEffect:function(){return Promise.reject(Error('Denied'));},reset:function(){return Promise.reject(Error('Gone'));}};
    f.controls.haptics(.1,{hit:true});f.controls.clear();
  });

  test('flight', 'wormhole haptics are gentle nearby, pulse at crossing, and yield to damage', function(){
    var f=flightControlsFixture(),calls=[];f.elements['input-mode'].value='controller';
    f.setPads([{index:0,id:'Throat pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:[],vibrationActuator:{playEffect:function(type,effect){calls.push(effect);return Promise.resolve('complete');},reset:function(){return Promise.resolve('complete');}}}]);
    f.controls.sample();f.controls.haptics(.1,{throat:1});assert(calls[0].strongMagnitude===.08&&calls[0].weakMagnitude===.14);
    f.controls.haptics(.1,{throat:1,transit:true});assert(calls[1].strongMagnitude===.3);
    f.controls.haptics(.01,{transit:true,hit:true});assert(calls[2].strongMagnitude===.55,'Damage retains priority');
    f.controls.clear();f.elements.rumble.checked=false;f.controls.haptics(.1,{throat:1,transit:true});assert(calls.length===3,'Existing rumble opt-out applies');
  });

  test('flight', 'mouse takeover stops rumble until fresh controller activity resumes it', function () {
    var f=flightControlsFixture(),c=f.controls,calls=0,resets=0;
    var pad={index:0,id:'Takeover rumble',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:[],vibrationActuator:{
      playEffect:function(){calls++;return Promise.resolve('complete');},
      reset:function(){resets++;return Promise.resolve('complete');}
    }};
    f.setPads([pad]);c.sample();c.haptics(.1,{boost:true,hit:true});assert(calls===0,'Idle connected pads stay quiet during mouse control');
    pad.axes[0]=.7;c.sample();c.haptics(.1,{boost:true});assert(calls===1);
    f.doc.pointerLockElement=f.host;
    f.doc.emit('mousemove',{movementX:0,movementY:0});assert(resets===0);
    f.doc.emit('mousemove',{movementX:10,movementY:0});assert(resets===1,'Mouse takeover immediately resets the actuator');
    c.sample();c.haptics(.1,{boost:true,shieldBreak:true});assert(calls===1,'Held controller input and gameplay feedback cannot restart rumble');
    pad.axes[0]=.9;c.sample();c.haptics(.1,{fire:true});assert(calls===2,'Fresh controller activity restores rumble');
  });

  test('flight', 'asteroid patrol has two hostiles, seeded terrain and no reinforcements', function () {
    var DW=window.Driftworks,session=DW.flightSession.create({seed:123}),config={mode:'asteroid-patrol',enabled:true,profile:DW.arcade.profiles[0]};
    var view=session.reset(config),rock=JSON.stringify(view.asteroid);
    assert(view.combat.enemies.length===2);
    assert(view.asteroid.id==='patrol-rock-123','Seed controls visible geology');
    view.combat.enemies.forEach(function(e){
      assert(e.team==='enemy');
      assert(Math.hypot.apply(null,e.pose.eye)>view.asteroid.radius);
      assert(Math.hypot.apply(null,e.pose.eye.map(function(v,i){return v-view.state.eye[i];}))*sim.METERS_PER_UNIT<1000);
      e.hp=0;
    });
    DW.training.step(view.combat,view.state,10,view.asteroid.radius,function(){return null;});
    assert(view.combat.wave===1 && DW.training.alive(view.combat).length===0,'Cleared patrol never respawns');
    assert(session.reset(config).combat.enemies.length===2);
    assert(JSON.stringify(session.snapshot().asteroid)===rock,'Restart preserves terrain');
    assert(JSON.stringify(DW.flightSession.create({seed:123}).snapshot().asteroid)===rock);
    assert(JSON.stringify(DW.flightSession.create({seed:124}).snapshot().asteroid)!==rock,'Seed changes asteroid');
  });

  test('flight', 'flight session reset replaces sortie state and preserves the environment', function () {
    var DW=window.Driftworks,session=DW.flightSession.create({}),config={mode:'furball',enabled:true,profile:DW.arcade.profiles[0]};
    var first=session.reset(config),world=first.world;
    assertClose(first.asteroid.radius*sim.METERS_PER_UNIT,1250);
    assertClose(first.mothership.position.x*sim.METERS_PER_UNIT,900);
    first.state.throttle=0;first.guns.fired=12;first.combat.dead=true;first.combat.wrecks.push({});
    first.asteroid.radius=20;world.elapsedSeconds=42;
    var next=session.reset({mode:'training',enabled:false,profile:DW.arcade.profiles[1]});
    assert(next.world===world && next.asteroid===first.asteroid);
    assert(next.state!==first.state && next.guns!==first.guns && next.combat!==first.combat);
    assert(next.state.throttle===1 && next.guns.fired===0 && !next.combat.dead && !next.contact);
    assert(next.combat.enemies.length===0 && next.combat.wrecks.length===0 && !next.combat.enabled);
    assert(next.world.elapsedSeconds===42 && next.asteroid.radius===20);
    var again=session.reset(config);assert(again.combat.enemies.length>0 && again.combat.mode==='furball');
    var player=again.state,guns=again.guns;
    var toggled=session.setCombat('training',false);assert(toggled.state===player && toggled.guns===guns && toggled.combat.countdown===0);
  });

  test('flight', 'flight session operations own size, study starts and the current scenery clock', function () {
    var DW=window.Driftworks,session=DW.flightSession.create({}),config={mode:'training',enabled:false,profile:DW.arcade.profiles[0]};
    var view=session.reset(config),radius=view.asteroid.radius;
    [NaN,Infinity,199,4001].forEach(function(d){assert(!session.setAsteroidDiameter(d) && view.asteroid.radius===radius);});
    assert(session.setAsteroidDiameter(200));assertClose(view.asteroid.radius*sim.METERS_PER_UNIT,100);
    assert(session.setAsteroidDiameter(4000));assertClose(view.asteroid.radius*sim.METERS_PER_UNIT,2000);
    var replacement=Object.assign({},view.world,{elapsedSeconds:17});session.setWorld(replacement);
    session.advanceScenery(.5);assert(replacement.elapsedSeconds===17.5 && view.world.elapsedSeconds===0);
    [-1,NaN,Infinity].forEach(function(dt){var rejected=false;try{session.advanceScenery(dt);}catch(e){rejected=true;}assert(rejected && replacement.elapsedSeconds===17.5);});
    var eye=[1,2,100],state=view.state;
    session.setStartPosition(eye);eye[0]=99;
    assert(view.state===state && state.eye[0]===1 && state.velocity.every(function(v){return v===0;}));
    assert(replacement.elapsedSeconds===0 && !session.snapshot().contact);
    var before=JSON.stringify(state),rejected=false;
    try{session.setStartPosition([1,NaN,3]);}catch(e){rejected=true;}
    assert(rejected && JSON.stringify(state)===before);
    var next=session.reset(config);session.setStartPosition([0,0,101]);
    assert(next.state.eye[2]===101 && state.eye[2]===100,'Operations follow replaced sortie state');
  });

  test('flight', 'session target and opponent operations use the current combat after transitions', function () {
    var DW=window.Driftworks,session=DW.flightSession.create({}),config={mode:'furball',enabled:true,profile:DW.arcade.profiles[0]};
    var old=session.reset(config).combat,view=session.reset(config),combat=view.combat;
    session.setOpponentStyle('passer');
    assert(combat.opponentStyle==='passer' && combat.enemies.every(function(e){return e.opponentStyle==='passer';}));
    assert(old.opponentStyle!=='passer');
    DW.training.spawn(combat,view.state,view.asteroid.radius);
    assert(combat.enemies.every(function(e){return e.opponentStyle==='passer';}),'Future waves inherit style');
    combat.enemies.forEach(function(e,i){e.pose.eye=[100+i*10,100,100];e.collision={kind:'sphere',radiusM:2};});
    view.state.eye=[0,0,100];view.state.back=[0,-1,0];
    combat.enemies[0].pose.eye=[0,100,100];combat.targetId=null;
    session.acquireTarget();assert(combat.targetId===combat.enemies[0].id);
    session.toggleTargetLock();assert(combat.targetLocked);
    session.toggleTargetLock();assert(!combat.targetLocked);
    session.nextTarget();assert(combat.targetId!==combat.enemies[0].id && !combat.targetLocked);
    session.setCombat('training',false);session.nextTarget();session.toggleTargetLock();
    assert(session.snapshot().combat.targetId===null && !session.snapshot().combat.targetLocked);
  });

  test('flight', 'session combat configuration survives reset and immediate or delayed combat spawning', function () {
    var DW=window.Driftworks,session=DW.flightSession.create({});
    var config={mode:'training',enabled:true,profile:DW.arcade.profiles[0]};
    session.reset(config);session.setOpponentStyle('passer');session.configureHulls('','');
    ['training','asteroid-patrol'].forEach(function(mode){
      var player=session.snapshot().state,guns=session.snapshot().guns;
      session.setCombat(mode,false);var view=session.setCombat(mode,true);
      assert(view.state===player && view.guns===guns,'Combat toggle preserves the controlled sortie');
      assert(view.combat.opponentStyle==='passer' && view.combat.hullModels.ally==='');
      if(mode==='training')DW.training.spawn(view.combat,view.state,view.asteroid.radius);
      assert(view.combat.enemies.length>0);
      DW.training.participants(view.combat).forEach(function(craft){
        assert(craft.collision.modelId==='blockout','Stored hull selection applies before spawn');
        if(craft!==view.combat.player)assert(craft.opponentStyle==='passer');
      });
    });
    var reset=session.reset(config);
    assert(reset.combat.opponentStyle==='passer' && reset.combat.enemies.every(function(e){return e.opponentStyle==='passer' && e.collision.modelId==='blockout';}));
  });

  test('flight', 'fresh flight views follow replacements without caller synchronization', function () {
    var DW=window.Driftworks,session=DW.flightSession.create({}),initial=session.snapshot();
    session.reset({mode:'training',enabled:false,profile:DW.arcade.profiles[0]});
    var sortie=session.snapshot();
    assert(sortie.state!==initial.state && sortie.guns!==initial.guns && sortie.combat!==initial.combat);
    session.setCombat('furball',true);
    var toggled=session.snapshot();
    assert(toggled.combat!==sortie.combat && toggled.combat.mode==='furball');
    assert(toggled.state===sortie.state && toggled.guns===sortie.guns);
    var replacement=sim.createInitialWorld();
    session.setWorld(replacement);
    assert(session.snapshot().world===replacement && session.snapshot().world!==initial.world);
    assert(session.snapshot().combat===toggled.combat);
  });

  test('flight', 'flight asteroid spins in simulation time and contact queries use its body frame', function () {
    var DW=window.Driftworks, sampled, session=DW.flightSession.create({
      surfaceFrame:function(a,d){sampled=d;return {point:d};},
      terrainHit:function(){return null;},onGunshot:function(){},onImpact:function(){}
    });
    var view=session.snapshot(), config={profile:DW.arcade.profiles[0],weapon:DW.retailWeapons[0]};
    var controls={throttle:0,throttleRate:0,stop:true,fire:false};
    view.asteroid.rotation=Math.PI/2;
    view.state.eye=[view.asteroid.radius,0,0];
    session.advance(1/120,controls,config);
    var phase=Math.PI/2+2*Math.PI/(6*3600*120);
    assertClose(view.asteroid.rotation,phase);
    assertClose(sampled[0],Math.cos(phase));
    assertClose(sampled[1],-Math.sin(phase));
    assert(session.snapshot().contact);
    var before=view.state.eye.slice(),right=view.state.right.slice();
    session.advance(1/120,controls,config);
    var expected=DW.flightSession.rotateVector(before,2*Math.PI/(6*3600*120));
    assertClose(view.state.eye[0],expected[0]);assertClose(view.state.eye[1],expected[1]);
    expected=DW.flightSession.rotateVector(right,2*Math.PI/(6*3600*120));
    assertClose(view.state.right[0],expected[0]);assertClose(view.state.right[1],expected[1]);
    assert(session.snapshot().contact);
    var phaseBefore=view.asteroid.rotation;
    session.advance(0,controls,config);assertClose(view.asteroid.rotation,phaseBefore);
    session.reset({mode:'training',enabled:false,profile:config.profile});
    assertClose(view.asteroid.rotation,phaseBefore);
    var p=[.3,.8,-.2],local=DW.flightSession.rotateVector(p,-phaseBefore);
    var roundtrip=DW.flightSession.rotateVector(local,phaseBefore);
    p.forEach(function(v,i){assertClose(roundtrip[i],v);});
  });

  test('flight', 'manual flight fixed ticks reproduce combat, guns and spin across frame batching', function () {
    var DW=window.Driftworks,dt=1/120;
    var config={mode:'training',enabled:true,profile:DW.arcade.profiles[0],weapon:DW.retailWeapons[0]};
    var controls={throttle:.8,throttleRate:0,stop:false,fire:true,pitch:.5,yaw:.2,roll:0,boost:false};
    function run(parts) {
      var shots=0,impacts=0,session=DW.flightSession.create({seed:29,onGunshot:function(){shots++;},onImpact:function(){impacts++;}});
      session.reset(config).state.eye=[0,0,100];
      parts.forEach(function(elapsed){session.advance(elapsed,controls,config);});
      var view=session.snapshot();
      assert(view.guns.fired>0 && view.combat.time>0,'Exercise actual weapons and combat');
      return JSON.stringify({state:view.state,combat:view.combat,guns:view.guns,rotation:view.asteroid.rotation,contact:view.contact,shots:shots,impacts:impacts});
    }
    var reference=run(Array(120).fill(dt));
    assert(run(Array(60).fill(1/60))===reference);
    assert(run(Array(144).fill(1/144))===reference);
    var irregular=[];
    for(var i=0;i<60;i++)irregular.push(1/144,1/144,1/360);
    assert(run(irregular)===reference);
  });

  test('flight', 'manual flight retains fractional ticks, samples current demand and clears reset time', function () {
    var DW=window.Driftworks,dt=1/120,session=DW.flightSession.create({onGunshot:function(){},onImpact:function(){}});
    var config={mode:'training',enabled:false,profile:DW.arcade.profiles[0],weapon:DW.retailWeapons[0]};
    var view=session.reset(config),controls={throttle:0,throttleRate:0,stop:false,fire:false};
    view.state.eye=[0,0,100];
    var before=JSON.stringify(view.state),phase=view.asteroid.rotation;
    session.advance(dt/2,controls,config);
    assert(JSON.stringify(view.state)===before && view.asteroid.rotation===phase);
    controls.throttle=.7;
    session.advance(dt/2,controls,config);
    assert(view.state.throttle===.7 && view.asteroid.rotation>phase);
    session.advance(dt/2,controls,config);
    view=session.reset(config);view.state.eye=[0,0,100];before=JSON.stringify(view.state);
    session.advance(dt/2,controls,config);
    assert(JSON.stringify(view.state)===before,'Reset must discard fractional time');
    [-1,NaN,Infinity,-Infinity].forEach(function(elapsed){
      var rejected=false;try{session.advance(elapsed,controls,config);}catch(e){rejected=true;}
      assert(rejected && JSON.stringify(view.state)===before);
    });
    session.advance(dt/2,controls,config);
    assert(view.state.throttle===.7,'Rejected calls must preserve valid accumulated time');
  });

  test('flight', 'flight session substeps preserve movement, training, guns, audio and contact order', function () {
    var DW=window.Driftworks,model=DW.arcade,training=DW.training,guns=DW.flightGuns;
    var saved=[model.step,training.step,guns.step,training.trace,model.contact],events=[],dead=false;
    var terrain=function(){},session=DW.flightSession.create({terrainHit:terrain,surfaceFrame:function(){events.push('surface');return {point:[1,0,0]};},onGunshot:function(){events.push('shot');},onImpact:function(){events.push('impact');}});
    var config={mode:'training',enabled:false,profile:model.profiles[0],weapon:DW.retailWeapons[0]},view=session.reset(config);
    view.state.eye=[0,0,0];
    var controls={throttle:.4,throttleRate:0,stop:false,fire:true};
    try{
      model.step=function(state,profile,input,dt){events.push('move');assertClose(dt,1/120);assertClose(state.throttle,.4);assert(profile===config.profile && input===controls);};
      training.step=function(combat,state,dt,radius,query){events.push('training');assert(!combat.hullHit && combat.player.pose===state && query===terrain);combat.lastHit++;combat.dead=dead;};
      guns.step=function(g,state,weapon,fire,dt,trace){events.push('guns');assert(fire===!dead && weapon===config.weapon);g.fired++;trace([0,0,0],[1,0,0],{});};
      training.trace=function(combat,start,end,bolt,team,query,player){events.push('trace');assert(team==='player' && query===terrain && player===view.state);};
      model.contact=function(){events.push('contact');return true;};
      var result=session.advance(1/60,controls,config);
      var sequence='move,training,guns,trace,shot,impact,surface,contact';
      assert(events.join(',')===sequence+','+sequence);assert(result.contact);
      events=[];session.advance(0,controls,config);session.advance(1/240,controls,config);
      assert(events.length===0 && session.snapshot().contact,'Frames without ticks retain contact');
      session.advance(1/240,controls,config);
      events=[];dead=true;session.advance(1/60,controls,config);
      assert(events.join(',')==='move,training,guns,trace,shot,impact','Death must finish gun/audio work, skip contact, and stop remaining substeps');
      events=[];session.advance(1/240,controls,config);
      assert(events.length===0,'Death must discard unconsumed time');
    }finally{model.step=saved[0];training.step=saved[1];guns.step=saved[2];training.trace=saved[3];model.contact=saved[4];}
  });

  test('flight', 'shared duel ticks preserve damage sampling, no-terrain stepping and terminal gun work', function () {
    var DW=window.Driftworks,training=DW.training,guns=DW.flightGuns;
    var savedStep=training.step,savedGuns=guns.step,savedTrace=training.trace,savedAim=training.convergencePoint;
    try {
      ['timeout','player-win','opponent-win'].forEach(function(outcome){
        var duel=DW.flightDuel.create({duration:1/120,category:'human',seed:29}),events=[];
        training.step=function(combat,pose,dt,radius,terrain){
          events.push('combat');assert(pose===duel.player && radius===0 && terrain===undefined);assertClose(dt,1/120);
          combat.shield--;duel.enemy.hp--; // NPC-stage damage must not count as controlled gun damage.
          if(outcome==='opponent-win')combat.dead=true;
        };
        training.trace=function(combat,start,end,bolt,team,terrain,pose){events.push('trace');assert(combat===duel.combat && team==='player' && terrain===undefined && pose===duel.player);return null;};
        training.convergencePoint=function(combat,craft,weapon,terrain){events.push('aim');assert(craft===duel.combat.player && terrain===undefined);return null;};
        guns.step=function(g,pose,weapon,fire,dt,trace,aim,mounts,anchors){
          events.push('guns');assert(g===duel.guns && pose===duel.player);
          assert(mounts===duel.combat.player.profile.gunMounts && anchors.length>0);
          if(outcome==='opponent-win')assert(!fire,'Death suppresses new fire but finishes gun work');
          trace([0,0,0],[1,0,0],{});aim();
          if(outcome==='player-win')duel.enemy.hp=0;
        };
        duel.advance(1);
        var summary=duel.summary();
        assert(events.join(',')==='combat,guns,trace,aim');
        assert(summary.ticks===1 && summary.done && summary.outcome===outcome);
        assert(summary.metrics.opponentDamageSteps===1);
        assert(summary.metrics.playerDamageSteps===(outcome==='player-win'?1:0),'Sample enemy defenses after NPC combat, before controlled guns');
        duel.advance(1);assert(events.length===4 && duel.replay.inputs.length===1,'Terminal duels never execute another tick');
      });
    } finally {training.step=savedStep;guns.step=savedGuns;training.trace=savedTrace;training.convergencePoint=savedAim;}
  });

  test('flight', 'furball pilots keep a varied adult cast across lines and rounds', function () {
    var api=window.Driftworks.flightComms,seen={};
    for(var i=0;i<16;i++) {
      var craft={id:'wave-1-'+i,index:i,team:i<8?'ally':'enemy'},v=api.pilotVoice(craft);
      assert(v.pitch>=95&&v.pitch<=240&&v.tremor===0);
      assert(v.clipping<=0.2);
      assert(!seen[JSON.stringify(v)]);seen[JSON.stringify(v)]=true;
      craft.id='wave-2-'+i;assert(JSON.stringify(v)===JSON.stringify(api.pilotVoice(craft)));
      var stressed=api.voiceOptions(v,{current:'afraid',intensity:1});
      assert(stressed.formant2===v.formant2&&stressed.seed===v.seed&&stressed.pitch>v.pitch);
    }
    var clock=api.create(),craft={id:'pilot',index:3,team:'ally',hp:90,mode:'approach'};
    var combat={enabled:true,wave:1,hull:100,enemies:[craft]};
    api.step(clock,0,combat,true,function(){return 0;});craft.hp=20;
    var line=api.step(clock,2,combat,false,function(){return 0;});
    assert(line.craftId===craft.id&&line.seed===api.pilotVoice(craft).seed);
    assert(JSON.stringify(line.voiceSettings)===JSON.stringify(api.pilotVoice(craft)));
  });

  test('flight', 'pilot emotions survive maneuver changes and decay on active flight time', function () {
    var api=window.Driftworks.flightComms,clock=api.create(),rng=function(){return 0;};
    var a={id:'a',team:'ally',hp:90,mode:'approach'},r={id:'r',team:'enemy',hp:90,mode:'approach'};
    var t={enabled:true,wave:1,hull:100,enemies:[a,r]};
    api.step(clock,0,t,true,rng);a.hp=20;
    api.step(clock,0,t,true,rng);
    assert(clock.emotions.a.current==='panicked');
    a.mode='attack';api.step(clock,2,t,true,rng);
    assert(clock.emotions.a.current==='panicked'&&clock.emotions.a.intensity===1);
    var line=api.step(clock,2,t,false,rng);
    assert(line.craftId==='a'&&line.emotion.current==='panicked');
    api.step(clock,15,t,true,rng);
    assert(clock.emotions.a.current==='afraid'&&clock.emotions.a.stress>0.25&&clock.emotions.a.intensity<1);
    api.step(clock,11,t,true,rng);assert(clock.emotions.a.current==='calm');
    a.hp=1;api.step(clock,0,t,true,rng);assert(clock.emotions.a.current==='panicked');
    t.wave=2;api.step(clock,0,t,true,rng);assert(clock.emotions.a.current==='calm');
    a.hp=0;api.step(clock,0,t,true,rng);assert(!clock.emotions.a);
    t.enabled=false;api.step(clock,0,t,true,rng);assert(Object.keys(clock.emotions).length===0);
    assert(Object.keys(api.create().emotions).length===0);
  });

  test('flight', 'sustained pressure prompts an emotional reply without a tactical order', function () {
    var api=window.Driftworks.flightComms,clock=api.create(),rng=function(){return 0;};
    var a={id:'a',team:'ally',hp:90,mode:'evade'},h={id:'h',team:'ally',hp:90,mode:'recover'};
    var r={id:'r',team:'enemy',hp:90,mode:'attack',targetId:'a'};
    var t={enabled:true,wave:1,hull:100,enemies:[a,h,r]};
    api.step(clock,0,t,true,rng);api.step(clock,12,t,true,rng);
    assert(clock.emotions.a.current==='afraid');
    var call=api.step(clock,2,t,false,rng);
    assert(call.event==='emotion'&&call.craftId==='a'&&call.text==='Help me!');
    var reply=api.step(clock,2,t,false,rng);
    assert(reply.event==='emotionalReply'&&reply.craftId==='h'&&reply.replyTo==='a');
    assert(reply.emotion.current==='reassuring'&&h.mode==='recover'&&!h.targetId);
    assert(clock.emotions.h.current==='calm'&&!clock.emotionalConversation);
    api.step(clock,60,t,true,rng);assert(clock.emotions.a.current==='afraid');
    assert(clock.emotions.a.stress>0.49&&clock.emotions.a.stress<=0.5);
    a.mode='attack';api.step(clock,0,t,true,rng);assert(clock.emotions.a.current==='afraid');
    a.hp=20;api.step(clock,0,t,true,rng);assert(clock.emotions.a.current==='panicked');
  });

  test('flight', 'emotional replies expire and require a living composed teammate', function () {
    var api=window.Driftworks.flightComms,rng=function(){return 0;};
    ['expired','dead','enemy','panicked'].forEach(function(reason){
      var clock=api.create(),a={id:'a',team:'ally',hp:90,mode:'attack'},h={id:'h',team:'ally',hp:90,mode:'attack'};
      var t={enabled:true,wave:1,hull:100,enemies:[a,h]};
      api.step(clock,0,t,true,rng);clock.wait=100;
      clock.emotionalConversation={caller:'a',emotion:'afraid',expires:14};
      if(reason==='dead')a.hp=0;
      if(reason==='enemy')h.team='enemy';
      if(reason==='panicked'){clock.emotions.h.current='panicked';clock.emotions.h.stress=1;clock.emotions.h.recoverAfter=20;clock.emotions.h.announced='panicked';}
      assert(api.step(clock,reason==='expired'?15:2,t,false,rng)===null,reason);
      if(reason==='expired'||reason==='dead')assert(!clock.emotionalConversation);
    });
  });

  test('flight', 'stress accumulates from small hits and blocks cheerful modifiers after damage', function () {
    var api=window.Driftworks.flightComms,clock=api.create(),rng=function(){return 0;};
    var a={id:'a',team:'ally',hp:90,mode:'attack'},h={id:'h',team:'ally',hp:90,mode:'recover'};
    var r={id:'r',team:'enemy',hp:90,mode:'attack',targetId:'a'};
    var t={enabled:true,wave:1,time:0,hull:100,enemies:[a,h,r],radioEvents:[]};
    api.step(clock,0,t,true,rng);
    for(var i=0;i<4;i++){a.hp-=8;api.step(clock,0,t,true,rng);}
    assert(clock.emotions.a.current==='afraid'&&clock.emotions.a.stress>0.35);
    a.hp=20;api.step(clock,0,t,true,rng);a.mode='recover';r.targetId='h';
    api.step(clock,5,t,true,rng);
    assert(clock.emotions.a.current==='panicked'&&clock.emotions.a.modifier.current==='relieved');
    // Kill praise nominates a as witness, while its stress still forbids confidence.
    r.hp=0;t.radioEvents=[{serial:1,wave:1,time:0,kind:'destroyed',victim:'r',team:'enemy',killer:'h'}];
    api.step(clock,0,t,true,rng);
    assert(clock.emotions.a.current==='panicked'&&clock.emotions.a.modifier.current==='confident');
    var line=api.step(clock,2,t,false,rng);
    assert(line.craftId==='a'&&line.emotion.stress>0.9&&line.emotion.current==='panicked');
    var stressed=api.voiceOptions(window.Driftworks.mumble.presets.Scout,line.emotion);
    assert(stressed.tremor>0.19);
    api.step(clock,40,t,true,rng);assert(clock.emotions.a.current==='calm'&&clock.emotions.a.stress===0);
  });

  test('flight', 'stress thresholds have hysteresis and recovery is independent of frame size', function () {
    var api=window.Driftworks.flightComms,rng=function(){return 0;};
    function run(parts){
      var clock=api.create(),a={id:'a',team:'ally',hp:90,mode:'attack'},t={enabled:true,hull:100,enemies:[a]};
      api.step(clock,0,t,true,rng);a.hp=20;api.step(clock,0,t,true,rng);
      parts.forEach(function(dt){api.step(clock,dt,t,true,rng);});return clock.emotions.a;
    }
    assertClose(run([20]).stress,run(Array(40).fill(0.5)).stress);
    assert(run([13]).current==='panicked'); // Below entry threshold, above exit threshold.
    assert(run([17]).current==='afraid');
  });

  test('flight', 'combat outcomes set frustration, confidence, confusion and relief', function () {
    var api=window.Driftworks.flightComms,rng=function(){return 0;};
    var a={id:'a',index:0,team:'ally',hp:90,mode:'attack',targetId:'r',fire:true};
    var h={id:'h',index:1,team:'ally',hp:90,mode:'approach'};
    var r={id:'r',team:'enemy',hp:90,mode:'attack',targetId:'a'};
    var t={enabled:true,wave:1,time:0,hull:100,enemies:[a,h,r],radioEvents:[]},clock=api.create();
    api.step(clock,0,t,true,rng);a.mode='recover';api.step(clock,0,t,true,rng);
    assert(clock.emotions.a.current==='frustrated');
    clock=api.create();api.step(clock,0,t,true,rng);r.targetId='h';api.step(clock,0,t,true,rng);
    assert(clock.emotions.a.current==='relieved');
    t.radioEvents=[{serial:1,wave:1,time:0,kind:'destroyed',victim:'r',team:'enemy',killer:'a'}];
    r.hp=0;api.step(clock,0,t,true,rng);assert(clock.emotions.h.current==='confident');
    a.hp=0;t.radioEvents.push({serial:2,wave:1,time:0,kind:'destroyed',victim:'a',team:'ally'});
    api.step(clock,0,t,true,rng);assert(clock.emotions.h.current==='confused');
  });

  test('flight', 'comms observes frozen gameplay through contacts, damage, losses and lifecycle changes', function () {
    var DW=window.Driftworks,api=DW.flightComms,clock=api.create(),session=DW.flightSession.create({seed:29});
    var view=session.reset({mode:'furball',enabled:true,profile:DW.arcade.profiles[0]});
    var ally=view.combat.enemies.find(function(c){return c.team==='ally';});
    var enemy=view.combat.enemies.find(function(c){return c.team==='enemy';});
    view.combat.enemies=[ally,enemy];
    view.state.eye=[0,0,100];view.state.velocity=[0,0,0];
    enemy.pose.eye=[0,500/sim.METERS_PER_UNIT,100];enemy.pose.velocity=[0,0,0];
    function freeze(value) {
      if(value && typeof value==='object') {Object.keys(value).forEach(function(key){freeze(value[key]);});Object.freeze(value);}
      return value;
    }
    function observe(dt,busy) {
      // Clone before freezing: retail profiles are shared with other tests.
      var live=session.snapshot(),frozen=JSON.parse(JSON.stringify(live));
      // Combat exposes health/death through non-enumerable compatibility getters.
      Object.getOwnPropertyNames(live.combat).forEach(function(key){
        var descriptor=Object.getOwnPropertyDescriptor(live.combat,key);
        if(descriptor.get)frozen.combat[key]=live.combat[key];
      });
      freeze(frozen);var before=JSON.stringify(frozen);
      var line=api.step(clock,dt,frozen.combat,busy,function(){return 0;},frozen.state);
      assert(JSON.stringify(frozen)===before,'Comms must not change any supplied gameplay field');
      return line;
    }
    var contact=observe(0,false);assert(contact && contact.event==='contact','Exercise actual contact speech');
    enemy.mode='attack';enemy.targetId=ally.id;ally.mode='evade';ally.hp=20;
    assert(observe(10,true)===null,'Busy channel still observes damage and threats');
    assert(clock.emotions[ally.id].current==='panicked');
    assert(clock.facts.some(function(f){return f.event==='damaged';}));
    view.combat.radioEvents=[{serial:1,wave:view.combat.wave,time:view.combat.time,kind:'destroyed',victim:ally.id,team:'ally',killer:enemy.id,index:ally.index}];
    view.combat.radioSerial=1;ally.hp=0;
    observe(0,true);
    assert(clock.radioSerial===1 && clock.facts.some(function(f){return f.event==='loss';}),'Consume combat events without altering their log');
    session.reset({mode:'furball',enabled:true,profile:DW.arcade.profiles[0]});
    var fresh=session.snapshot();DW.training.spawn(fresh.combat,fresh.state,fresh.asteroid.radius);
    observe(1,true);assert(clock.emotionWave===session.snapshot().combat.wave);
    session.snapshot().combat.dead=true;assert(observe(20,false)===null);
    session.setCombat('training',false);observe(1,true);
    assert(clock.facts.length===0 && clock.situation===null && Object.keys(clock.emotions).length===0);
  });

  test('flight', 'enabling comms leaves live simulation state and subsequent ticks identical', function () {
    var DW=window.Driftworks,api=DW.flightComms,clock=api.create(),lines=0;
    var environment={seed:29,onGunshot:function(){},onImpact:function(){}};
    var observed=DW.flightSession.create(environment),silent=DW.flightSession.create(environment);
    var config={mode:'furball',enabled:true,profile:DW.arcade.profiles[0],weapon:DW.retailWeapons[0]};
    observed.reset(config);silent.reset(config);
    var controls={throttle:.8,throttleRate:0,stop:false,fire:true,pitch:.2,yaw:.1,roll:0,boost:false};
    for(var tick=0;tick<240;tick++) {
      if(tick===120) {observed.reset(config);silent.reset(config);}
      observed.advance(1/120,controls,config);silent.advance(1/120,controls,config);
      var view=observed.snapshot(),before=JSON.stringify(view);
      if(api.step(clock,1/120,view.combat,tick>=180,function(){return .25;},view.state))lines++;
      assert(JSON.stringify(view)===before,'Comms changed live gameplay on tick '+tick);
      assert(JSON.stringify(observed.snapshot())===JSON.stringify(silent.snapshot()),'Comms affected later simulation on tick '+tick);
    }
    assert(lines>0 && clock.serial>0 && clock.time>1,'The observer must actually advance and speak');
    assert(observed.snapshot().guns.fired>0 && observed.snapshot().combat.time>0,'Exercise real weapons and combat');
  });

  test('flight', 'flight comms spaces lines and uses living combatants', function () {
    var api=window.Driftworks.flightComms, clock=api.create(), combat={enabled:true,dead:false,hull:100,enemies:[{hp:10,team:'enemy'}]}, rng=function(){return 0;};
    assert(api.step(clock,3,combat,false,rng)===null);
    assert(api.step(clock,1,combat,true,rng)===null);
    var first=api.step(clock,2,combat,false,rng);assert(first.hostile && first.voice==='Pirate');
    assert(api.step(clock,17,combat,false,rng)===null);
    assert(api.step(clock,1,combat,false,rng).text!==first.text);
    combat.enemies[0].hp=0;assert(!api.step(clock,18,combat,false,rng).hostile);
    combat.enemies=[{hp:10,team:'ally'}];assert(api.step(clock,18,combat,false,rng).voice==='Scout');
    combat.hull=20;assert(api.step(clock,18,combat,false,rng).text.indexOf('Shields')>=0);
    combat.enabled=false;assert(api.step(clock,18,combat,false,rng).voice==='Navigator');
    combat.dead=true;assert(api.step(clock,30,combat,false,rng)===null);
    assert(api.create().wait===4);
  });

  test('flight', 'flight comms reacts to transitions after two quiet seconds without stale calls', function () {
    var api=window.Driftworks.flightComms, clock=api.create(), rng=function(){return 0;};
    var wing={id:'wing',index:0,team:'ally',hp:90,mode:'approach'};
    var combat={enabled:true,dead:false,hull:100,enemies:[wing]};
    assert(api.step(clock,0,combat,false,rng)===null); // Establish a baseline, not a spawn call.
    wing.mode='attack';var call=api.step(clock,0,combat,false,rng);
    assert(call.craftId==='wing' && call.mode==='attack' && call.text==="I've got him!");
    wing.mode='break';assert(api.step(clock,1,combat,true,rng)===null);
    assert(api.step(clock,2,combat,false,rng)===null); // Dropped transition never queues.
    wing.mode='recover';assert(api.step(clock,0,combat,false,rng)===null); // Per-pilot cooldown.
    api.step(clock,7,combat,false,rng);wing.mode='reposition';
    assert(api.step(clock,0,combat,false,rng).mode==='reposition');
    wing.mode='attack';api.step(clock,1,combat,true,rng);
    clock.quietGap=2;
    var bandit={id:'red',team:'enemy',hp:90,mode:'attack'};combat.enemies.push(bandit);
    api.step(clock,1,combat,false,rng);bandit.mode='break';
    assert(api.step(clock,0.9,combat,false,rng)===null);
    bandit.mode='recover';assert(api.step(clock,0.1,combat,false,rng)===null);
    combat.enemies=[];api.step(clock,0,combat,false,rng);
    assert(Object.keys(clock.modes).length===0 && Object.keys(clock.spoken).length===0);
  });

  test('flight', 'flight comms prioritizes distress and checks tail geometry', function () {
    var api=window.Driftworks.flightComms, clock=api.create(), rng=function(){return 0;};
    var wing={id:'wing',team:'ally',hp:90,mode:'attack',pose:{eye:[0,0,0],back:[0,0,1]}};
    var red={id:'red',team:'enemy',hp:90,mode:'approach',targetId:'wing',pose:{eye:[0,0,5]}};
    var combat={enabled:true,dead:false,hull:100,enemies:[red,wing]};
    api.step(clock,0,combat,false,rng);red.mode='attack';wing.mode='evade';
    var call=api.step(clock,0,combat,false,rng);
    assert(call.craftId==='wing' && call.text.indexOf('tail')>=0);
    clock=api.create();wing.mode='attack';api.step(clock,0,combat,false,rng);
    red.pose.eye=[0,0,-5];wing.mode='evade';
    assert(api.step(clock,0,combat,false,rng).text.indexOf('tail')<0);
    clock=api.create();wing.mode='attack';api.step(clock,0,combat,false,rng);
    wing.mode='evade';wing.hp=0;assert(api.step(clock,0,combat,false,rng)===null);
  });

  test('flight', 'flight comms varies gaps and describes firing and target changes', function () {
    var api=window.Driftworks.flightComms, clock=api.create(), rng=function(){return 0.8;};
    var red={id:'red',hp:90,team:'ally',mode:'attack',targetId:'one',fire:false};
    var combat={enabled:true,dead:false,hull:100,enemies:[red]};
    api.step(clock,0,combat,false,rng);red.fire=true;
    assert(api.step(clock,0,combat,false,rng).event==='firing');
    assertClose(clock.quietGap,3.36);
    api.step(clock,1,combat,true,rng);red.fire=false;
    assert(api.step(clock,2,combat,false,rng)===null);
    api.step(clock,8,combat,false,rng);red.targetId='two';
    assert(api.step(clock,0,combat,false,function(){return 0;}).event==='target');
    assertClose(clock.quietGap,2);
    assert(api.step(clock,5,combat,false,rng)===null); // No replay when the action stays unchanged.
  });

  test('flight', 'player-directed rival taunts beat routine chatter without waiting for ambient silence', function () {
    var api=window.Driftworks.flightComms,clock=api.create(),rng=function(){return .4;};
    var ally={id:'ally',team:'ally',index:0,hp:90,mode:'approach'},red={id:'red',team:'enemy',index:1,hp:90,mode:'attack',targetId:'player'};
    var combat={enabled:true,wave:1,time:0,hull:100,enemies:[ally,red]};
    api.step(clock,0,combat,true,rng);ally.mode='attack';clock.wait=100;clock.quiet=10;
    var line=api.step(clock,10,combat,false,rng);
    assert(line&&line.event==='taunt'&&line.hostile&&line.craftId==='red');
    clock.wait=100;clock.quiet=10;
    assert(api.step(clock,4,combat,false,rng)===null,'Independent taunt cooldown prevents spam');
    clock=api.create();ally.mode='approach';api.step(clock,0,combat,true,rng);
    ally.mode='evade';clock.wait=100;clock.quiet=10;
    line=api.step(clock,10,combat,false,rng);
    assert(line&&line.event==='evade'&&!line.hostile,'Urgent flight calls still outrank teasing');
  });

  test('flight', 'enemy comms only broadcasts taunts despite maneuvers, damage and emotions', function () {
    var api=window.Driftworks.flightComms, clock=api.create(), rng=function(){return 0;};
    var red={id:'red',hp:90,team:'enemy',mode:'approach',targetId:'player',fire:false};
    var combat={enabled:true,wave:1,time:0,hull:100,enemies:[red],radioEvents:[]};
    api.step(clock,0,combat,false,rng);
    ['attack','evade','break','recover','reposition'].forEach(function(mode){
      red.mode=mode;red.fire=true;red.targetId='other';red.hp=20;
      clock.wait=100;clock.quiet=10;
      assert(api.step(clock,0,combat,false,rng)===null,mode);
    });
    assert(!clock.conversation && !clock.emotionalConversation);
    var taunts=window.Driftworks.flightDialogue.lines.enemy;
    for(var i=0;i<6;i++){
      clock.wait=0;clock.quiet=10;
      var line=api.step(clock,0,combat,false,rng);
      assert(line.hostile && taunts.indexOf(line.text)>=0 && !line.replyTo);
    }
  });

  test('flight', 'flight comms balances activities instead of counting pilots', function () {
    var api=window.Driftworks.flightComms, clock=api.create();
    var craft=Array.from({length:9},function(_,i){return {id:'c'+i,hp:90,team:'ally',mode:'approach',fire:false};});
    var combat={enabled:true,dead:false,hull:100,enemies:craft};
    api.step(clock,0,combat,false,function(){return 0;});
    craft.forEach(function(c,i){c.mode=i===8?'recover':'attack';});
    var call=api.step(clock,0,combat,false,function(){return 0.6;});
    assert(call.event==='recover'); // One recovery has half the activity vote against eight attacks.
    clock=api.create();craft.forEach(function(c){c.mode='attack';c.fire=false;});
    api.step(clock,0,combat,false,function(){return 0;});craft[0].fire=true;
    assert(api.step(clock,0,combat,false,function(){return 0;}).event==='firing');
    craft[1].fire=true;assert(api.step(clock,3,combat,false,function(){return 0;})===null);
    craft[2].mode='recover';assert(api.step(clock,0,combat,false,function(){return 0;}).event==='recover');
    api.step(clock,4,combat,false,function(){return 0;});craft[3].fire=true;
    assert(api.step(clock,0,combat,false,function(){return 0;}).event==='firing');
    craft[4].mode='approach';api.step(clock,8,combat,false,function(){return 0;});
    craft[4].mode='attack';assert(api.step(clock,0,combat,false,function(){return 0;})===null); // Attack shares the shooting budget.
    assert(clock.recentActivities.join(',')==='offense,recover,offense');
  });

  test('flight', 'flight comms answers cover requests only when a wingmate is helping', function () {
    var api=window.Driftworks.flightComms, rng=function(){return 0;}, clock=api.create();
    var caller={id:'caller',team:'ally',hp:90,mode:'attack'};
    var threat={id:'threat',team:'enemy',hp:90,mode:'attack',targetId:'caller',pose:{eye:[10,0,0]}};
    var helper={id:'helper',team:'ally',hp:90,mode:'attack',targetId:'other',pose:{eye:[0,0,0],velocity:[1,0,0]}};
    var combat={enabled:true,dead:false,hull:100,enemies:[caller,threat,helper]};
    api.step(clock,0,combat,false,rng);caller.mode='evade';
    assert(api.step(clock,0,combat,false,rng).text.indexOf('Cover me')>=0);
    assert(clock.conversation.threat==='threat');
    api.step(clock,1,combat,true,rng);assert(api.step(clock,2,combat,false,rng)===null);
    helper.targetId='threat';helper.pose.velocity=[-1,0,0];
    api.step(clock,0,combat,true,rng); // Drop the separate target-switch announcement.
    assert(api.step(clock,2,combat,false,rng)===null); // Heading away cannot claim to help.
    helper.pose.velocity=[1,0,0];var reply=api.step(clock,0,combat,false,rng);
    assert(reply.event==='support' && reply.craftId==='helper' && reply.replyTo==='caller');
    assert(reply.text.indexOf("I've got him")>=0 && clock.conversation===null);
    var third=api.step(clock,3,combat,false,rng);
    assert(third.event==='acknowledgment' && third.craftId==='caller' && third.replyTo==='helper');
    assert(api.step(clock,3,combat,false,rng)===null); // Exchange ends after A/B/A.
  });

  test('flight', 'replies outrank urgent calls, bypass cooldowns and expire on a busy channel', function () {
    var api=window.Driftworks.flightComms, rng=function(){return 0;};
    [5,5.01].forEach(function(delay){
      var clock=api.create(), caller={id:'c',team:'ally',hp:90,mode:'evade'};
      var helper={id:'h',team:'ally',hp:90,mode:'attack',targetId:'t',fire:true};
      var threat={id:'t',team:'enemy',hp:90,mode:'attack',targetId:'c'};
      var urgent={id:'u',team:'ally',hp:90,mode:'attack'};
      var combat={enabled:true,wave:1,hull:100,enemies:[caller,helper,threat,urgent]};
      api.step(clock,0,combat,true,rng);
      clock.conversation={caller:'c',threat:'t',expires:5};
      clock.spoken.h=0;clock.activitySpoken.support=0;
      api.step(clock,delay,combat,true,rng);
      urgent.mode='evade';clock.quiet=10;clock.wait=100;
      var line=api.step(clock,0,combat,false,rng);
      assert(line.event===(delay===5?'support':'evade'));
      if(delay>5)assert(clock.conversation===null);
      if(delay===5){
        api.step(clock,5.01,combat,true,rng);clock.quiet=10;
        var next=api.step(clock,0,combat,false,rng);
        assert(!next || next.event!=='acknowledgment');
        assert(clock.acknowledgment===null);
      }
    });
  });

  test('flight', 'flight comms cancels cover exchanges when the fight changes', function () {
    var api=window.Driftworks.flightComms, rng=function(){return 0;};
    ['dead caller','dead threat','retarget','expired','disabled','wrong team','wrong target','not attacking'].forEach(function (reason) {
      var clock=api.create(), caller={id:'c',team:'ally',hp:90,mode:'evade'};
      var threat={id:'t',team:'enemy',hp:90,mode:'attack',targetId:'c'};
      var helper={id:'h',team:'ally',hp:90,mode:'attack',targetId:'t',fire:true};
      var combat={enabled:true,dead:false,hull:100,enemies:[caller,threat,helper]};
      clock.conversation={caller:'c',threat:'t',expires:14};clock.wait=30;
      if(reason==='dead caller')caller.hp=0;
      if(reason==='dead threat')threat.hp=0;
      if(reason==='retarget')threat.targetId='other';
      if(reason==='disabled')combat.enabled=false;
      if(reason==='wrong team')helper.team='enemy';
      if(reason==='wrong target')helper.targetId='other';
      if(reason==='not attacking')helper.mode='recover';
      assert(api.step(clock,reason==='expired'?15:0,combat,false,rng)===null,reason);
    });
  });

  test('flight', 'radio templates speak dynamic numbers and keep singular remaining calls accurate', function () {
    var api=window.Driftworks.flightComms;
    assert(api.numberWords(70)==='seventy' && api.numberWords(125)==='one hundred twenty five');
    assert(api.numberWords(Infinity)==='zero');
    assert(api.compose('loss',{pilot:'Four',count:4})[0]==='We lost Four!');
    assert(api.compose('closing',{pilot:'Nine',speed:70})[0]==='Nine closing at seventy meters per second.');
    assert(api.compose('remaining',{count:5}).every(function(t){return t.indexOf('One left')<0 && t.indexOf('five')>=0;}));
    assert(api.compose('remaining',{count:1})[0].indexOf('One left')===0);
  });

  test('flight', 'training records attributed deaths once and real shield depletion', function () {
    var ai=window.Driftworks.training,t=ai.create('furball'),player=window.Driftworks.arcade.create(18);
    ai.spawn(t,player,18);var victim=t.enemies[8],killer=t.enemies[2],weapon={damage:1000,armorFactor:1,shieldFactor:1};
    ai.damageEnemy(t,victim,weapon,killer);ai.damageEnemy(t,victim,weapon,killer);
    assert(t.radioEvents.length===1 && t.radioEvents[0].killer===killer.id && t.radioEvents[0].index===8);
    ai.damageEnemy(t,t.enemies[9],weapon,'player');assert(t.playerKills===1);
    t.shield=1;ai.damagePlayer(t,{damage:2,armorFactor:1,shieldFactor:1});
    assert(t.radioEvents.filter(function(e){return e.kind==='shield';}).length===1);
    ai.damagePlayer(t,{damage:2,armorFactor:1,shieldFactor:1});
    assert(t.radioEvents.filter(function(e){return e.kind==='shield';}).length===1);
  });

  test('flight', 'training near misses use clipped projectile segments and throttle repeat reports', function () {
    var ai=window.Driftworks.training,t=ai.create(),U=sim.METERS_PER_UNIT,player={eye:[0,20/U,0]},bolt={weapon:{damage:1,armorFactor:1,shieldFactor:1}};
    ai.trace(t,[-50/U,0,0],[50/U,0,0],bolt,'enemy',null,player);
    assert(t.radioEvents.length===1 && t.radioEvents[0].kind==='near');
    ai.trace(t,[-50/U,0,0],[50/U,0,0],bolt,'enemy',null,player);assert(t.radioEvents.length===1);
    t.time=7;
    ai.trace(t,[-50/U,0,0],[50/U,0,0],bolt,'enemy',function(){return [-45/U,0,0];},player);
    assert(t.radioEvents.length===1); // Rock intercepts the bolt before its close pass.
  });

  test('flight', 'radio announces losses from surviving witnesses and expires facts across waves', function () {
    var api=window.Driftworks.flightComms,clock=api.create(),rng=function(){return 0;};
    var wing={id:'w',index:0,team:'ally',mode:'attack',hp:90},lost={id:'four',index:3,team:'ally',mode:'attack',hp:0};
    var combat={enabled:true,dead:false,wave:1,time:1,hull:100,enemies:[wing,lost],radioEvents:[{serial:1,wave:1,time:1,kind:'destroyed',victim:'four',index:3,team:'ally'}]};
    api.step(clock,0,combat,true,rng);assert(clock.facts.length===1);
    var line=api.step(clock,2,combat,false,rng);assert(line.event==='loss'&&line.text==='We lost Echo!'&&line.craftId==='w');
    assert(api.step(clock,0,combat,false,rng)===null);
    clock=api.create();api.step(clock,0,combat,true,rng);combat.wave=2;
    api.step(clock,0,combat,true,rng);assert(clock.facts.length===0);
    clock=api.create();combat.wave=1;api.step(clock,0,combat,true,rng);
    api.step(clock,8,combat,true,rng);assert(clock.facts.length===0);
  });

  test('flight', 'radio tracks kill praise, player streaks and changing force counts', function () {
    var api=window.Driftworks.flightComms,clock=api.create(),rng=function(){return 0;};
    var craft=[{id:'one',index:0,team:'ally',hp:90,mode:'attack'},{id:'three',index:2,team:'ally',hp:90,mode:'attack'},
      {id:'red1',team:'enemy',hp:90,mode:'attack'},{id:'red2',team:'enemy',hp:90,mode:'attack'}];
    var t={enabled:true,dead:false,wave:1,time:1,hull:100,enemies:craft,radioEvents:[],playerKills:0};
    api.step(clock,0,t,true,rng);craft[2].hp=0;t.radioEvents=[{serial:1,wave:1,time:1,kind:'destroyed',victim:'red1',team:'enemy',killer:'three'}];
    api.step(clock,0,t,true,rng);
    assert(clock.facts.some(function(e){return e.event==='kill'&&e.texts[0]==='Nice shooting, Flint!';}));
    assert(clock.facts.some(function(e){return e.event==='remaining'&&e.data.count===1;}));
    craft[0].hp=0;api.step(clock,0,t,true,rng);
    craft[1].hp=0;api.step(clock,0,t,true,rng);
    assert(!clock.facts.some(function(e){return e.craft.id==='one'||e.craft.id==='three';}));
    clock=api.create();craft[0].hp=90;craft[1].hp=90;craft[2].hp=90;
    t.radioEvents=[];api.step(clock,0,t,true,rng);craft[0].hp=0;api.step(clock,0,t,true,rng);
    assert(clock.facts.some(function(e){return e.event==='outnumbered';}));
    t.playerKills=2;t.radioEvents=[1,2].map(function(n){return {serial:n,wave:1,time:1,kind:'destroyed',victim:'x'+n,team:'enemy',killer:'player'};});
    api.step(clock,0,t,true,rng);assert(clock.facts.some(function(e){return e.event==='streak'&&e.data.count===2;}));
  });

  test('flight', 'radio observes hull vulnerability, shaken pursuit and actual closing speed', function () {
    var api=window.Driftworks.flightComms,clock=api.create(),rng=function(){return 0;};
    var ally={id:'a',team:'ally',hp:90,mode:'evade',targetId:'r'};
    var red={id:'r',index:8,team:'enemy',hp:90,mode:'attack',targetId:'a',pose:{eye:[10,0,0],velocity:[0,0,0]}};
    var t={enabled:true,dead:false,wave:1,hull:100,time:1,enemies:[ally,red]},player={eye:[0,0,0],velocity:[0,0,0]};
    api.step(clock,0,t,true,rng,player);red.hp=20;api.step(clock,0,t,true,rng,player);
    assert(clock.facts.some(function(e){return e.event==='damaged';}));
    assert(clock.facts.some(function(e){return e.event==='vulnerable'&&e.data.pilot==='Viper';}));
    clock=api.create();red.hp=90;api.step(clock,0,t,false,rng,player);red.targetId='other';
    assert(api.step(clock,0,t,false,rng,player).event==='escaped');
    clock=api.create();red.pose.velocity=[0,0,0];api.step(clock,0,t,false,rng,player);red.pose.velocity=[-70,0,0];
    var call=api.step(clock,0,t,false,rng,player);assert(call.event==='closing'&&call.text.indexOf('seventy')>=0);
  });

  test('flight', 'radio only calls a firing pass missed when the target took no damage', function () {
    var api=window.Driftworks.flightComms,rng=function(){return 0;};
    [false,true].forEach(function(hit){
      var clock=api.create(),a={id:'a',team:'ally',mode:'attack',hp:90,fire:true,targetId:'r'},r={id:'r',team:'enemy',mode:'approach',hp:90};
      var t={enabled:true,dead:false,wave:1,hull:100,enemies:[a,r]};
      api.step(clock,0,t,false,rng);a.fire=false;if(hit)r.hp=80;
      api.step(clock,0,t,false,rng);a.mode='recover';
      var call=api.step(clock,0,t,false,rng);
      assert(call && (hit?call.event==='recover':call.event==='missed'));
    });
  });

  test('flight', 'radio discards obsolete shield and remaining-count facts', function () {
    var api=window.Driftworks.flightComms,clock=api.create(),rng=function(){return 0;};
    var a={id:'a',team:'ally',hp:90,mode:'attack'},r={id:'r',team:'enemy',hp:90,mode:'attack'},s={id:'s',team:'enemy',hp:90,mode:'attack'};
    var t={enabled:true,dead:false,wave:1,time:1,hull:100,shield:0,enemies:[a,r,s],radioEvents:[]};
    api.step(clock,0,t,true,rng);s.hp=0;
    t.radioEvents=[{serial:1,wave:1,time:1,kind:'shield',victim:'player',team:'ally'}];
    api.step(clock,0,t,true,rng);assert(clock.facts.some(function(e){return e.event==='shield';}));
    assert(clock.facts.some(function(e){return e.event==='remaining';}));
    t.shield=12;r.hp=0;api.step(clock,0,t,true,rng);
    assert(!clock.facts.some(function(e){return e.event==='shield'||e.event==='remaining';}));
  });

  test('flight', 'contact reports use player-relative clock directions and rounded SI ranges', function () {
    var api=window.Driftworks.flightComms,U=sim.METERS_PER_UNIT;
    var player={eye:[10,20,30],right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
    var front=api.contactData(player,[10,20+644/U,30]);
    assert(front.bearing==="twelve o'clock"&&front.range===600&&front.direction==='ahead of you');
    assert(api.contactData(player,[10+500/U,20,30]).bearing==="three o'clock");
    assert(api.contactData(player,[10-500/U,20,30]).bearing==="nine o'clock");
    assert(api.contactData(player,[10,20-500/U,30]).bearing==="six o'clock");
    var high=api.contactData(player,[10,20+500/U,30+300/U]);assert(high.height===' high');
    var overhead=api.contactData(player,[10,20,30+500/U]);
    assert(overhead.vertical && api.compose('contact',overhead).every(function(t){return t.indexOf('above you')>=0&&t.indexOf("o'clock")<0;}));
    player.right=[0,1,0];player.back=[1,0,0];
    assert(api.contactData(player,[10,20+500/U,30]).bearing==="three o'clock");
    assert(api.contactData({},[0,0,0])===null);
  });

  test('flight', 'contact acquisition refreshes bearing before speech and prevents duplicate reports', function () {
    var api=window.Driftworks.flightComms,U=sim.METERS_PER_UNIT,clock=api.create(),rng=function(){return 0;};
    var player={eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0],velocity:[0,0,0]};
    var red={id:'r',team:'enemy',hp:90,mode:'approach',pose:{eye:[0,500/U,0],velocity:[0,0,0]}};
    var t={enabled:true,dead:false,wave:1,hull:100,enemies:[red]};
    api.step(clock,0,t,true,rng,player);assert(clock.facts.filter(function(e){return e.event==='contact';}).length===1);
    red.pose.eye=[600/U,0,0];api.step(clock,0,t,true,rng,player);
    var line=api.step(clock,2,t,false,rng,player);
    assert(line.event==='contact'&&line.text.indexOf("three o'clock")>=0&&line.text.indexOf('six hundred')>=0);
    assert(api.step(clock,1,t,false,rng,player)===null);
    red.pose.eye=[4000/U,0,0];api.step(clock,1,t,true,rng,player);
    red.pose.eye=[2900/U,0,0];api.step(clock,1,t,true,rng,player);assert(clock.facts.length===0);
    red.pose.eye=[2400/U,0,0];api.step(clock,1,t,true,rng,player);assert(clock.facts.length===1);
    red.hp=0;api.step(clock,1,t,true,rng,player);assert(clock.facts.length===0);
  });

  test('flight', 'comms speaker highlight follows transmission lifetime, mute, pause and reset', function () {
    var api=window.Driftworks.flightComms,fields=[{textContent:''},{textContent:''}];
    var panel={querySelector:function(selector){return selector==='[data-speaker]'?fields[0]:fields[1];},classList:{add:function(){},remove:function(){},toggle:function(){}}};
    var toggle={setAttribute:function(){},textContent:''},radio=api.mount(panel,toggle);
    var pilot={id:'wing',index:0,team:'ally',mode:'approach',hp:90},combat={enabled:true,dead:false,hull:100,enemies:[pilot]};
    radio.update(0,combat);assert(radio.speakerId()===null);
    pilot.mode='evade';radio.update(0,combat);assert(radio.speakerId()==='wing');
    radio.pause();assert(radio.speakerId()===null);
    radio.reset();pilot.mode='approach';radio.update(0,combat);pilot.mode='evade';radio.update(0,combat);
    toggle.onclick();assert(radio.speakerId()===null);
    radio.reset();pilot.mode='approach';radio.update(0,combat);pilot.mode='evade';radio.update(0,combat);
    assert(radio.speakerId()==='wing'); // Muted subtitles still identify the transmitting pilot.
    radio.update(15,combat);assert(radio.speakerId()===null);
    radio.reset();assert(radio.speakerId()===null);
  });

  test('flight', 'flight comms retains a bounded newest-first subtitle history', function () {
    var items=[],history={children:items,ownerDocument:{createElement:function(){return {textContent:''};}},prepend:function(item){items.unshift(item);}};
    Object.defineProperty(history,'lastElementChild',{get:function(){return {remove:function(){items.pop();}};}});
    var fields=[{textContent:''},{textContent:''}],panel={ownerDocument:{getElementById:function(){return history;}},querySelector:function(s){return s==='[data-speaker]'?fields[0]:fields[1];},classList:{add:function(){},remove:function(){},toggle:function(){}}};
    var radio=window.Driftworks.flightComms.mount(panel,{setAttribute:function(){}}),pilot={id:'wing',index:0,team:'ally',mode:'approach',hp:90},combat={enabled:true,dead:false,hull:100,enemies:[pilot]};
    for(var i=0;i<15;i++){radio.reset();pilot.mode='approach';radio.update(0,combat);pilot.mode='evade';radio.update(0,combat);}
    assert(items.length===12);assert(items[0].textContent.indexOf(fields[1].textContent)>=0);
  });

  test('flight', 'a new mission overrides shared encounter, spawn, units and chatter without Ohio branches', function () {
    var DW=window.Driftworks;
    if(DW.flightMissions.resolve('regression-mission').id==='default')DW.flightMissions.define('regression-mission',{
      encounter:{kind:'furball',count:4,spawn:{backRadii:3,altitudeMeters:500},callsigns:['One','Two','Three','Four']},
      comms:{calls:{firing:['Custom firing report.']}},
      units:{distanceScale:2,distanceLabel:'test',distanceWord:'test units'},opening:[]
    });
    var profile=DW.arcade.profiles[0], radius=125, pose=DW.arcade.createSortie(radius,profile,'regression-mission');
    assertClose(pose.eye[1],-radius*3);assertClose(pose.eye[2],radius+500/sim.METERS_PER_UNIT);
    var combat=DW.training.create('regression-mission');DW.training.spawn(combat,pose,radius);
    assert(combat.enemies.length===4&&combat.enemies.filter(function(c){return c.team==='ally';}).length===2);
    assert(combat.enemies[3].callsign==='Four');
    var text=DW.flightDialogue.compose('contact',{range:1000,direction:'right',height:'',bearing:'three oclock'},'regression-mission');
    assert(text.every(function(line){return line.indexOf('two thousand test units')>=0;}));
    assert(DW.flightDialogue.compose('closing',{pilot:'Test',speed:45},'regression-mission').every(function(line){return line.indexOf('forty five meters per second')>=0;}),'A distance-only override leaves speed defaults unchanged');
    var clock=DW.flightComms.create(),ally=combat.enemies[0];
    combat.enemies=[ally];ally.mode='attack';ally.fire=false;
    DW.flightComms.step(clock,0,combat,true,function(){return 0;});ally.fire=true;clock.quiet=10;clock.wait=0;
    var line=DW.flightComms.step(clock,4,combat,false,function(){return 0;});
    assert(line&&line.text==='Custom firing report.');
  });

  test('flight', 'Ohio forms of address use bud, neighbor and hotshot while preserving real names', function () {
    var api=window.Driftworks.flightDialogue;
    var near=api.compose('nearPlayer',{},true);
    assert(near[0].indexOf('bud')>=0&&near[1].indexOf('neighbor')>=0);
    assert(api.ohioAddress('That all you have, pilot?',0,true)==='That all you have, hotshot?');
    assert(api.ohioAddress('Pilot, watch it.',1)==='Neighbor, watch it.');
    assert(api.ohioAddress('Nice shooting, {pilot}!',0)==='Nice shooting, {pilot}!');
    assert(api.compose('kill',{pilot:'Aunt Barb'},true).some(function(text){return text.indexOf('Aunt Barb')>=0;}));
    assert(api.compose('nearPlayer',{}).some(function(text){return /pilot/.test(text);}));
  });

  test('flight', 'Ohio radio converts measured ranges and speeds to yards without changing source data', function () {
    var api=window.Driftworks.flightDialogue, data={range:1000,bearing:'three oclock',direction:'right',height:'',speed:100,pilot:'Big Dale'};
    assert(api.compose('contact',data,true).every(function(text){return /one thousand one hundred yards/.test(text)&&!/meters/.test(text);}));
    assert(api.compose('closing',data,true).every(function(text){return /two hundred twenty miles per hour/.test(text);}));
    assert(api.compose('contact',data).every(function(text){return /one thousand meters/.test(text);}));
    assert(data.range===1000&&data.speed===100);
  });

  test('flight', 'Ohio generic shooting reports do not summon an unrelated neighbor', function () {
    var api=window.Driftworks.flightComms,clock=api.create(),rng=function(){return 0;};
    var barb={id:'barb',callsign:'Aunt Barb',index:3,team:'ally',hp:90,mode:'attack',fire:false};
    var dale={id:'dale',callsign:'Big Dale',index:6,team:'ally',hp:90,mode:'approach'};
    var combat={mode:'ohio',openingStep:3,enabled:true,hull:100,enemies:[barb,dale]};
    api.step(clock,0,combat,true,rng);clock.wait=0;clock.quiet=0;barb.fire=true;
    var line=api.step(clock,4,combat,false,rng);
    assert(line&&line.event==='firing');
    assert(!line.replyTo&&!/Big Dale|Aunt Barb/.test(line.text));
  });

  test('flight', 'Ohio pilots address real neighbors and complete named cover exchanges', function () {
    var api=window.Driftworks.flightComms, rng=function(){return 0;}, clock=api.create();
    var caller={id:'barb',callsign:'Aunt Barb',index:3,team:'ally',hp:90,mode:'attack'};
    var helper={id:'dale',callsign:'Big Dale',index:6,team:'ally',hp:90,mode:'attack',targetId:'other',pose:{eye:[0,0,0],velocity:[1,0,0]}};
    var threat={id:'rick',callsign:'Uncle Rick',index:14,team:'enemy',hp:90,mode:'attack',targetId:'barb',pose:{eye:[10,0,0]}};
    var combat={mode:'ohio',openingStep:3,enabled:true,dead:false,hull:100,enemies:[caller,threat,helper]};
    api.step(clock,0,combat,false,rng);caller.mode='evade';
    var request=api.step(clock,0,combat,false,rng);
    assert(request.text==='Big Dale, get this guy off me!' && request.craftId==='barb' && request.replyTo==='dale');
    assert(clock.conversation.threat==='rick');
    api.step(clock,1,combat,true,rng);assert(api.step(clock,2,combat,false,rng)===null,'Names do not manufacture an offer of cover');
    helper.targetId='rick';api.step(clock,0,combat,true,rng);
    var reply=api.step(clock,2,combat,false,rng);
    assert(reply.event==='support' && reply.craftId==='dale' && reply.replyTo==='barb');
    assert(reply.text.indexOf('Aunt Barb')>=0 && reply.portraitIndex===6);
    var thanks=api.step(clock,3,combat,false,rng);
    assert(thanks.event==='acknowledgment' && thanks.craftId==='barb' && thanks.text.indexOf('Big Dale')>=0 && thanks.replyTo==='dale');
    assert(clock.last===thanks.text && clock.recentLines[clock.recentLines.length-1].text===thanks.text);
    assert(clock.recentLines.some(function(entry){return entry.key.indexOf('{pilot}')>=0;}),'Changing names retains shared template cooldowns');
  });

  test('flight', 'Ohio social chatter never addresses self or a dead neighbor and uses real pilot voices', function () {
    var DW=window.Driftworks, api=DW.flightComms, rng=function(){return 0;};
    var barb={id:'barb',callsign:'Aunt Barb',index:3,team:'ally',hp:90,mode:'approach'};
    var dale={id:'dale',callsign:'Big Dale',index:6,team:'ally',hp:90,mode:'approach'};
    var dead={id:'dead',callsign:'Dead Doug',index:4,team:'ally',hp:0,mode:'approach'};
    var combat={mode:'ohio',openingStep:3,enabled:true,hull:100,enemies:[barb,dale,dead]},clock=api.create();
    api.step(clock,0,combat,true,rng);clock.wait=0;clock.quiet=10;
    var line=api.step(clock,0,combat,false,rng);
    assert(line.text==='Ope, sorry, Big Dale. Just gonna squeeze past ya.' && line.craftId==='barb' && line.replyTo==='dale');
    assert(line.voiceSettings.seed===DW.flightDialogue.pilotVoice(barb).seed && line.portraitIndex===3);
    dale.hp=0;clock=api.create();api.step(clock,0,combat,true,rng);clock.wait=0;clock.quiet=10;
    line=api.step(clock,0,combat,false,rng);
    assert(line.craftId==='barb' && !line.replyTo && !/Big Dale|Dead Doug|Aunt Barb|\{pilot\}/.test(line.text));
    combat.enemies=[];clock=api.create();clock.wait=0;clock.quiet=10;
    line=api.step(clock,0,combat,false,rng);assert(line&&!line.replyTo&&!/\{pilot\}/.test(line.text));
  });

  test('flight', 'Ohio chatter uses actual transmitted text for repeat avoidance', function () {
    var radio=window.Driftworks.flightComms, clock=radio.create();
    var combat={mode:'ohio',enabled:false,hull:100,enemies:[]}, heard=[];
    for(var i=0;i<10;i++) {
      clock.wait=0;clock.quiet=10;
      var line=radio.step(clock,0,combat,false,function(){return 0;});
      assert(line && line.text);
      heard.push(line.text);
      assert(clock.last===line.text && clock.recentLines[clock.recentLines.length-1].text===line.text);
    }
    assert(new Set(heard).size===10,'Use all ten range variants before repeating, even with fixed random');
    assert(heard.some(function(text){return /deer|Ohio|orange barrels/.test(text);}));
  });

  test('flight', 'Ohio barn launch follows the supported deck and asteroid rotation with cached terrain queries', function () {
    var DW=window.Driftworks,queries=0,U=sim.METERS_PER_UNIT;
    var session=DW.flightSession.create({surfaceFrame:function(){queries++;return {point:[0,0,.8],normal:[0,0,1]};},terrainHit:function(){return null;},onGunshot:function(){},onImpact:function(){}});
    var profile=DW.arcade.profiles[0],snapshot=session.reset({mode:'ohio',enabled:true,profile:profile});
    var demand={pitch:0,yaw:0,roll:0,throttle:0,throttleRate:0,fire:false,boost:false};
    session.advance(1/120,demand,{profile:profile,weapon:DW.retailWeapons[0]});
    var origin=snapshot.combat.reinforcementOrigin,angle=snapshot.asteroid.rotation;
    var localX=origin[0]*Math.cos(angle)+origin[1]*Math.sin(angle),localY=-origin[0]*Math.sin(angle)+origin[1]*Math.cos(angle);
    var front=340/3*.3;
    assert(Math.abs(localX-(-150+Math.sin(.12)*front)/U)<1e-8);
    assert(Math.abs(localY-(-690-Math.cos(.12)*front)/U)<1e-8);
    assert(Math.abs(origin[2]-(snapshot.asteroid.radius*.8+9/U))<1e-8);assert(queries===9);
    var before=origin.slice();session.advance(.1,demand,{profile:profile,weapon:DW.retailWeapons[0]});
    assert(queries===9&&snapshot.combat.reinforcementOrigin[0]!==before[0]);
    var clock=snapshot.combat.time;session.advance(0,demand,{profile:profile,weapon:DW.retailWeapons[0]});assert(snapshot.combat.time===clock);
  });

  test('flight', 'Ohio reveal gates combat, respects occupied radio, and retains its cast across waves', function () {
    var DW=window.Driftworks, api=DW.training, U=sim.METERS_PER_UNIT;
    var player=DW.arcade.create(300/U), combat=api.create('ohio'), clock=DW.flightComms.create();
    api.spawn(combat,player,300/U);
    assert(combat.enemies.length===8 && combat.enemies.filter(function(e){return e.team==='ally';}).length===4);
    var names=combat.enemies.map(function(e){return e.callsign;}), start=JSON.stringify(combat.enemies.map(function(e){return e.pose.eye;}));
    assert(new Set(names).size===8 && names[0]==='Cuyahoga Cryptid');
    api.step(combat,player,1,300/U);
    assert(JSON.stringify(combat.enemies.map(function(e){return e.pose.eye;}))===start);
    assert(DW.flightComms.step(clock,1,combat,true)===null && combat.openingStep===0);
    var first=DW.flightComms.step(clock,0,combat,false);
    assert(first.text==="It's all Ohio?" && first.craftId===combat.enemies[0].id);
    assert(DW.flightComms.step(clock,4,combat,true)===null && combat.openingStep===1);
    var second=DW.flightComms.step(clock,0,combat,false);
    assert(second.text==='Always has been.' && second.hostile);
    assert(DW.flightComms.step(clock,4,combat,true)===null && combat.openingStep===2);
    DW.flightComms.step(clock,0,combat,false); assert(combat.openingStep===3);
    api.step(combat,player,.1,300/U);
    assert(JSON.stringify(combat.enemies.map(function(e){return e.pose.eye;}))!==start);
    api.spawn(combat,player,300/U);
    assert(combat.openingStep===3 && combat.enemies.every(function(e,i){return e.callsign===names[i];}));
    assert(api.create('ohio').openingStep===0);
  });

  test('flight', 'flight callsigns are unique, stable across waves, and shared by comms', function () {
    var api=window.Driftworks.training,U=sim.METERS_PER_UNIT,player=window.Driftworks.arcade.create(300/U),combat=api.create('furball');
    api.spawn(combat,player,300/U);
    var names=combat.enemies.map(function(e){return api.callsign(e);});
    assert(new Set(names).size===16);assert(names[0]==='Rook'&&names[8]==='Viper');
    api.spawn(combat,player,300/U);assert(combat.enemies.every(function(e,i){return e.callsign===names[i];}));
    var clock=window.Driftworks.flightComms.create(),pilot={id:'wing',index:0,team:'ally',hp:90,mode:'approach'},fight={enabled:true,dead:false,hull:100,enemies:[pilot]};
    window.Driftworks.flightComms.step(clock,0,fight,false,function(){return 0;});pilot.mode='evade';
    var line=window.Driftworks.flightComms.step(clock,0,fight,false,function(){return 0;});assert(line.speaker.indexOf('WING Rook / ')===0);
    assert(api.callsign({index:0})==='Rook'&&api.callsign({id:'control'})==='Control');
    assert(line.portraitIndex===0);
  });

  test('flight', 'target camera centers a copy, fits hull bounds and caps redraws', function () {
    var api=window.Driftworks.flightTargetCamera,DW=window.Driftworks,original=DW.scene3d.create,draws=0,batches;
    DW.scene3d.create=function(host,getWorld,setWorld,options){assert(options.study&&options.viewer===false,'Embedded combat camera must not mount model viewer controls');return {setStudyDiagnostics:function(){},setOrbit:function(){},setStudyActors:function(value){batches=value;},setStudyEffects:function(){},sync:function(){},render:function(){draws++;}};};
    try{
      var radio=api.mount({clientWidth:210,clientHeight:125}),pose={eye:[50,60,70],right:[1,0,0],back:[0,-1,0],up:[0,0,1]},target={id:'test',index:0,hp:90,pose:pose};
      radio.update(null,'',1,1,new Map(),undefined,pose,0);assert(draws===0);
      radio.update(target,'',1,1,new Map(),undefined,pose,0);assert(draws===1&&batches.length===1);assert(pose.eye[0]===50);
      radio.update(target,'',1,1,new Map(),undefined,pose,.01);assert(draws===1);
      radio.update(target,'',1,1,new Map(),undefined,pose,.1);assert(draws===2);
      assert(api.radius({vertices:[3,4,0,0,0,1]})===5);
    }finally{DW.scene3d.create=original;}
  });

  test('flight', 'speaker halo draws a white outline with contrast underlay', function () {
    var strokes=[],saved=0,ctx={save:function(){saved++;},restore:function(){saved--;},setLineDash:function(){},beginPath:function(){},arc:function(x,y,r){assert(x===5&&y===9&&r===10);},stroke:function(){strokes.push([this.strokeStyle,this.lineWidth]);}};
    window.Driftworks.flightRadar.speakerHalo(ctx,5,9,10);
    assert(saved===0&&strokes.length===2);
    assert(strokes[0][1]===4 && strokes[1][0]==='rgba(255,255,255,.95)' && strokes[1][1]===2);
  });

  test('flight', 'radio prefers unheard lines, then older and less frequent lines', function () {
    var api=window.Driftworks.flightComms,clock=api.create(),rng=function(){return 0;},choices=['Alpha','Bravo','Charlie'];
    assert(api.pickLine(clock,choices,rng)==='Alpha');
    assert(api.pickLine(clock,choices,rng)==='Bravo');
    assert(api.pickLine(clock,choices,rng)==='Charlie');
    assert(api.pickLine(clock,choices,rng)==='Alpha');
    clock.recentLines=[{text:'Alpha',key:'Alpha'},{text:'Bravo',key:'Bravo'},{text:'Alpha',key:'Alpha'}];clock.last='Charlie';
    assert(api.pickLine(clock,['Alpha','Bravo'],rng)==='Bravo');
    for(var i=0;i<50;i++)api.pickLine(clock,choices,rng);
    assert(clock.recentLines.length===24);
    assert(api.create().recentLines.length===0);
    assert(api.pickLine(clock,['Only line'],rng)==='Only line');
    assert(api.pickLine(clock,['Only line'],rng)==='Only line'); // A single truthful option remains usable.
  });

  test('flight', 'radio remembers template delivery across changing names and counts', function () {
    var api=window.Driftworks.flightComms,clock=api.create(),rng=function(){return 0;};
    assert(api.pickLine(clock,api.compose('loss',{pilot:'Four',count:1}),rng)==='We lost Four!');
    var second=api.pickLine(clock,api.compose('loss',{pilot:'Five',count:2}),rng);
    assert(second==='Five is gone. Stay together!');
    var third=api.pickLine(clock,api.compose('loss',{pilot:'Six',count:3}),rng);
    assert(third==='We have lost three. Keep your eyes open.');
  });

  test('flight', 'flight radar uses player basis, meters, spherical range and altitude', function(){
    var radar=window.Driftworks.flightRadar,state={eye:[10,20,30],right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
    var front=radar.project(state,[10,25,30],100,1000);
    assertClose(front.y,-.5);assertClose(front.x,0);assertClose(front.distance,500);
    assertClose(radar.project(state,[10,15,30],100,1000).y,.5);
    var elevated=radar.project(state,[13,20,34],100,1000);
    assertClose(elevated.x,.3);assertClose(elevated.altitude,.4);assertClose(elevated.distance,500);
    assert(radar.project(state,[18,28,30],100,1000)===null);
    assertClose(radar.project(state,state.eye,100,1000).distance,0);
    state.right=[0,1,0];state.back=[1,0,0];
    assertClose(radar.project(state,[10,25,30],100,1000).x,.5);
    assertClose(radar.project(state,[20,20,30],100,1000).y,1);
  });


  test('flight', 'flight frame cap follows 60 Hz on high-refresh screens without accumulating stalls', function () {
    var perf=window.Driftworks.flightPerformance,clock=perf.pacer(),frames=0;
    for(var i=0;i<144;i++)if(perf.due(clock,i*1000/144,60))frames++;
    assert(frames===60);assert(perf.due(clock,10000,60));assert(!perf.due(clock,10001,60));
    assert(perf.due(clock,10002,0));assert(perf.due(clock,10003,0));
    clock=perf.pacer();frames=0;for(var j=0;j<144;j++)if(perf.due(clock,j*1000/144,15))frames++;assert(frames===15);
  });
  test('flight', 'flight diagnostics retain a bounded rolling window and a resettable worst frame', function () {
    var perf=window.Driftworks.flightPerformance,s=perf.create();perf.record(s,100,8);
    for(var i=0;i<150;i++)perf.record(s,20,2);
    var result=perf.summary(s);assert(s.frames.length===120 && s.cpu.length===120);
    assertClose(result.fps,50);assertClose(result.p95,20);assertClose(result.worst,100);assertClose(result.cpu,2);
    assert(perf.summary(perf.create()).worst===0);
  });

  test('flight', 'furball wings acquire opposing targets, retain flight limits and spare friendlies',function(){
    var ai=window.Driftworks.training,t=ai.create('furball'),player=window.Driftworks.arcade.create(18),U=sim.METERS_PER_UNIT;
    ai.spawn(t,player,18);assert(ai.alive(t).length===16);assert(t.enemies.filter(function(e){return e.team==='ally';}).length===8);
    for(var i=0;i<1200;i++)ai.step(t,player,1/120,18);
    t.enemies.forEach(function(e){var target=t.enemies.find(function(other){return other.id===e.targetId;});if(target)assert(target.team!==e.team);e.pose.eye.forEach(function(v){assert(Number.isFinite(v));});assert(Math.hypot.apply(null,e.pose.velocity)<=e.profile.afterburnerVelocity[2]+.01);});
    var ally=t.enemies[0],enemy=t.enemies[8],weapon=window.Driftworks.retailWeapons[0];
    t.enemies.forEach(function(e){e.pose.eye=[100,100,100];});ally.pose.eye=[0,2,0];enemy.pose.eye=[0,4,0];var hp=ally.hp,redHp=enemy.hp;
    ai.trace(t,[0,0,0],[0,6,0],{weapon:weapon},'player',null,player);assert(ally.hp===hp&&enemy.hp<redHp);
    ai.cycle(t);assert(t.enemies.find(function(e){return e.id===t.targetId;}).team==='enemy');
  });
  test('flight', 'furball rounds reset after a defeated wing and green fire damages red ships',function(){
    var ai=window.Driftworks.training,t=ai.create('furball'),player=window.Driftworks.arcade.create(18);ai.spawn(t,player,18);
    t.enemies.forEach(function(e){e.pose.eye=[100,100,100];});var ally=t.enemies[0],enemy=t.enemies[8];enemy.pose.eye=[0,2,0];
    ai.trace(t,[0,0,0],[0,3,0],{weapon:window.Driftworks.retailWeapons[0]},ally,null,player);assert(enemy.hp<90);
    t.enemies.filter(function(e){return e.team==='enemy';}).forEach(function(e){ai.damageEnemy(t,e,{damage:1000,armorFactor:1});});
    ai.step(t,player,.01,18);assert(t.roundOver&&t.countdown===5);for(var i=0;i<51;i++)ai.step(t,player,.1,18);assert(t.wave===2&&ai.alive(t).length===16&&!t.roundOver);
    var all=ai.allGuns(t,window.Driftworks.flightGuns.create());assert(all.bolts.every(function(b){return b.team==='ally'||b.team==='enemy';}));
  });

  test('flight', 'autonomous furball produces shots and casualties without player fire',function(){
    var ai=window.Driftworks.training,t=ai.create('furball'),player=window.Driftworks.arcade.create(18),shots=0;
    // This fixture measures autonomous wing combat, not an idle player's survivability.
    t.player.hp=t.player.maxHp=10000;
    for(var i=0;i<14400;i++){ai.step(t,player,1/120,18);if(i%120===0)shots=Math.max(shots,t.enemies.reduce(function(n,e){return n+e.guns.fired;},0));}
    assert(shots>30);assert(t.kills>0);assert(t.enemies.length===16);assert(!t.dead);
  });

  test('flight', 'virtual mouse stick holds displacement, returns to center and clamps diagonally',function(){
    var input=window.Driftworks.flightInput,p=input.moveStick([0,0],80,-40,160,1),d=input.stickDemand(p,.08);
    assert(d[0]>0&&d[1]<0);assert(input.moveStick(p,0,0,160,1).every(function(v,i){return v===p[i];}));
    var center=input.moveStick(p,-80,40,160,1);assert(input.stickDemand(center,.08).every(function(v){return v===0;}));
    assert(input.stickDemand([.02,.02],.08).every(function(v){return v===0;}));
    var edge=input.moveStick([0,0],1000,1000,160,1);assertClose(Math.hypot.apply(null,edge),1);assertClose(Math.hypot.apply(null,input.stickDemand(edge,.08)),1);
    assertClose(input.moveStick([0,0],40,0,160,2)[0],.5);
  });

  test('flight', 'mouse stick response stays linear throughout travel and preserves direction and full turns',function(){
    var input=window.Driftworks.flightInput;
    var half=input.stickDemand([.54,0],.08),diagonal=input.stickDemand([.324,.432],.08);
    assertClose(half[0],0);assertClose(half[1],-.5);
    for(var i=0;i<=100;i++)assertClose(input.stickDemand([.08+.92*i/100,0],.08)[1],-i/100);
    assertClose(Math.hypot.apply(null,diagonal),Math.abs(half[1]));
    assertClose(diagonal[0]/diagonal[1],4/3);
    assertClose(input.stickDemand([0,-1],.08)[0],1);
    assertClose(input.stickDemand([1,0],.08)[1],-1);
  });

  test('flight', 'training combat can clear a wave using the same player flight and gun models', function () {
    var ai=window.Driftworks.training,flight=window.Driftworks.arcade,gun=window.Driftworks.flightGuns;
    var player=flight.create(18),t=ai.create(),guns=gun.create(),weapon=window.Driftworks.retailWeapons[0];t.countdown=.01;
    // This checks wave progression, not pilot balance against native multi-gun NPCs.
    t.player.hp=t.player.maxHp=10000;
    for(var i=0;i<120*45&&!t.dead&&t.wave<2;i++){
      var target=ai.alive(t).find(function(e){return e.id===t.targetId;}),control={},fire=false;
      if(target){var lead=ai.intercept(player.eye,target.pose.eye,target.pose.velocity.map(function(v){return v/sim.METERS_PER_UNIT;}),weapon.speed/sim.METERS_PER_UNIT);control=ai.steer(player,lead.point);player.throttle=.5;fire=Math.abs(control.pitch)<.15&&Math.abs(control.yaw)<.15;}
      flight.step(player,flight.profiles[0],control,1/120);ai.step(t,player,1/120,18);
      gun.step(guns,player,weapon,fire,1/120,function(a,b,bolt){return ai.trace(t,a,b,bolt,'player',null,player);},undefined,flight.profiles[0].gunMounts);
    }
    assert(t.kills>=3 && t.wave===2 && !t.dead);
  });

  test('flight', 'disabled fighters drift and tumble across waves without remaining combat targets',function(){
    var ai=window.Driftworks.training,t=ai.create('furball'),player=window.Driftworks.arcade.create(18),U=sim.METERS_PER_UNIT;
    ai.spawn(t,player,18);var e=t.enemies[8];e.pose.velocity=[20,-30,10];var position=e.pose.eye.slice(),back=e.pose.back.slice(),index=e.index;
    ai.damageEnemy(t,e,{damage:1000,armorFactor:1});assert(t.wrecks.length===1&&t.kills===1);assert(!ai.alive(t).some(function(s){return s.id===e.id;}));
    ai.damageEnemy(t,e,{damage:1000,armorFactor:1});assert(t.wrecks.length===1&&t.kills===1);
    var wreck=t.wrecks[0];assert(wreck.pose!==e.pose&&wreck.pose.velocity!==e.pose.velocity);assert(!e.fire&&wreck.pose.throttle===0);
    ai.stepWrecks(t,2,null);wreck.pose.eye.forEach(function(v,i){assertClose(v,position[i]+[20,-30,10][i]*2/U,.000001);});assert(wreck.pose.back.some(function(v,i){return Math.abs(v-back[i])>.01;}));
    [wreck.pose.right,wreck.pose.up,wreck.pose.back].forEach(function(v){assertClose(Math.hypot.apply(null,v),1,.000001);});
    var art=window.Driftworks.shipPackModels.mixedModel(index,wreck.artWave);ai.spawn(t,player,18);assert(t.wrecks[0]===wreck);assert(window.Driftworks.shipPackModels.mixedModel(index,wreck.artWave)===art);
    ai.stepWrecks(t,1,function(){return [0,0,0];});assert(wreck.pose.velocity.every(function(v){return v===0;})&&wreck.spin===0);
    ai.stepWrecks(t,120,null);assert(t.wrecks.length===0);
    for(var wave=0;wave<4;wave++){ai.spawn(t,player,18);t.enemies.forEach(function(s){ai.damageEnemy(t,s,{damage:1000,armorFactor:1});});}assert(t.wrecks.length===48);assert(ai.create().wrecks.length===0);
  });

  test('flight', 'training waves are bounded, delayed and allocate at most two attackers', function () {
    var ai=window.Driftworks.training,t=ai.create(),player=window.Driftworks.arcade.create(18);
    t.countdown=.01;ai.step(t,player,.02,18);assert(t.wave===1 && ai.alive(t).length===3 && t.slots.length===2);
    t.enemies.forEach(function(e){ai.damageEnemy(t,e,{damage:1000,armorFactor:1});});
    assert(t.kills===3 && t.countdown===5);ai.step(t,player,.1,18);assert(t.wave===1);
    for(var i=0;i<50;i++)ai.step(t,player,.1,18);
    assert(t.wave===2 && ai.alive(t).length===4);
    for(var j=0;j<10;j++)ai.spawn(t,player,18);assert(ai.alive(t).length===6);
    ai.step(t,player,.01,18);assert(t.slots.length===2);
  });
  test('flight', 'training steering uses local pitch and yaw and preserves physical flight limits', function () {
    var ai=window.Driftworks.training,t=ai.create(),player=window.Driftworks.arcade.create(18);
    assert(ai.steer(player,[1,0,0]).yaw<0);assert(ai.steer(player,[0,0,100]).pitch>0);
    ai.spawn(t,player,18);
    for(var i=0;i<600;i++)ai.step(t,player,1/120,18);
    t.enemies.forEach(function(e){
      e.pose.eye.forEach(function(x){assert(Number.isFinite(x));});
      assert(Math.hypot.apply(null,e.pose.velocity)<=e.profile.afterburnerVelocity[2]+.01);
      assertClose(Math.hypot.apply(null,e.pose.back),1);
      if(t.slots.indexOf(e.id)<0)assert(!e.fire);
    });
  });
  test('flight', 'training shots sweep targets and stop at the nearest obstruction', function () {
    var ai=window.Driftworks.training,t=ai.create(),player=window.Driftworks.arcade.create(18),weapon=window.Driftworks.retailWeapons[0];
    ai.spawn(t,player,18);t.enemies[0].pose.eye=[0,2,0];t.enemies[1].pose.eye=[0,4,0];t.enemies[2].pose.eye=[5,5,0];
    var hit=ai.trace(t,[0,0,0],[0,6,0],{weapon:weapon},'player',function(){return [0,1,0];},player);
    assertClose(hit[1],1);assert(t.enemies[0].hp===90);
    hit=ai.trace(t,[0,0,0],[0,6,0],{weapon:weapon},'player',null,player);
    assert(hit[1]<2 && t.enemies[0].hp<90 && t.enemies[1].hp===90);
    ai.damageEnemy(t,t.enemies[0],{damage:1000,armorFactor:1});var kills=t.kills;
    ai.damageEnemy(t,t.enemies[0],weapon);assert(t.kills===kills);
  });
  test('flight', 'training shield absorption, recovery, death and restart have independent lifecycles', function () {
    var ai=window.Driftworks.training,t=ai.create(),weapon=window.Driftworks.retailWeapons[0],player=window.Driftworks.arcade.create(18);
    ai.damagePlayer(t,weapon);assert(t.shield<120 && t.hull===100);
    t.shield=1;ai.damagePlayer(t,weapon);assert(t.shield===0 && t.hull<100);
    t.time=20;t.lastHit=0;ai.step(t,player,.1,18);assert(t.shield>0);
    t.shield=0;t.hull=1;ai.damagePlayer(t,weapon);assert(t.dead && t.hull===0);
    var before=t.time;ai.step(t,player,1,18);assert(t.time>before && t.dead, 'The observing craft death must not freeze the shared simulation');
    var fresh=ai.create();assert(!fresh.dead && fresh.shield===120 && fresh.kills===0);
  });
  test('flight', 'training intercept leads moving targets and models are simple bounded triangles', function () {
    var ai=window.Driftworks.training,lead=ai.intercept([0,0,0],[0,20,0],[2,0,0],27);
    assert(lead.time>0 && lead.point[0]>0);
    var t=ai.create();ai.spawn(t,window.Driftworks.arcade.create(18),18);
    var mesh=ai.geometry(t)[0].vertices;assert(mesh.length===3*6*3*6);mesh.forEach(function(x){assert(Number.isFinite(x));});
    var guns=window.Driftworks.flightGuns.create();assert(ai.allGuns(t,guns).bolts.length===0);
  });

  test('flight', 'crosshair selects the nearest living hull and lock holds until released or destroyed', function () {
    var DW=window.Driftworks,ai=DW.training,t=ai.create(),state=DW.arcade.create(0);
    function craft(id,distance,side){
      var pose=DW.arcade.create(0);pose.eye=state.eye.map(function(v,i){return v-state.back[i]*distance+state.right[i]*(side||0);});
      var c=ai.createCraft(id,pose,'enemy');c.collision={kind:'sphere',radiusM:10};return c;
    }
    var far=craft('far',100),near=craft('near',50),off=craft('off',50,100);
    t.enemies=[far,near,off];ai.acquireTarget(t,state);assert(t.targetId==='near');
    ai.toggleTargetLock(t);near.pose.eye=off.pose.eye.slice();ai.acquireTarget(t,state);
    assert(t.targetLocked&&t.targetId==='near');
    ai.toggleTargetLock(t);ai.acquireTarget(t,state);assert(!t.targetLocked&&t.targetId==='far');
    far.pose.eye=off.pose.eye.slice();ai.acquireTarget(t,state);assert(t.targetId==='far','Empty space retains selection');
    ai.toggleTargetLock(t);far.hp=0;ai.acquireTarget(t,state);assert(!t.targetLocked&&t.targetId===null);
    ai.toggleTargetLock(t);assert(!t.targetLocked,'Cannot lock without a target');
    ai.cycle(t);assert(t.targetId==='near'&&!t.targetLocked);
  });
  test('flight', 'L and standard X/Square toggle lock once per press and ignore paused input', function(){
    var f=flightControlsFixture();f.key('KeyL');f.key('KeyL','BODY',true);assert(f.counts.lock===1);
    f.setPaused(true);f.key('KeyL');assert(f.counts.lock===1);f.setPaused(false);
    var pad={index:0,id:'Lock pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},function(){return {pressed:false,value:0};})};
    f.setPads([pad]);f.controls.sample();pad.buttons[2]={pressed:true,value:1};
    f.controls.sample();f.controls.sample();assert(f.counts.lock===2);
    pad.buttons[2]={pressed:false,value:0};f.controls.sample();pad.buttons[2]={pressed:true,value:1};f.controls.sample();assert(f.counts.lock===3);
  });

  test('flight', 'controller deadzones rescale travel and reject noisy or missing values', function () {
    var input=window.Driftworks.flightInput;
    assertClose(input.deadzone(.1,.12),0);assertClose(input.deadzone(-.1,.12),0);
    assertClose(input.deadzone(.56,.12),.5);assertClose(input.deadzone(-1,.12),-1);
    assertClose(input.deadzone(NaN,.12),0);
  });
  test('flight', 'standard gamepad maps aim, roll, throttle and buttons without neutral throttle override', function () {
    var input=window.Driftworks.flightInput,map=input.defaults(true),pad={axes:[1,-1,-1,0],buttons:[]};
    pad.buttons[7]={pressed:true,value:1};pad.buttons[0]={pressed:true,value:1};pad.buttons[12]={pressed:true,value:1};
    var c=input.read(pad,map);assert(c.pitch===1 && c.yaw===-1 && c.roll===1);
    assert(c.throttle===null && c.throttleRate===1 && c.fire && c.boost);
    assert(!c.bank && !c.pause);
  });
  test('flight', 'standard right stick adjusts throttle proportionally and holds at neutral',function(){
    var input=window.Driftworks.flightInput,map=input.defaults(true),pad={mapping:'standard',axes:[0,0,0,0],buttons:[]};
    assertClose(input.read(pad,map).throttleRate,0);assert(input.read(pad,map).throttle===null);
    pad.axes[3]=-1;assertClose(input.read(pad,map).throttleRate,1);
    pad.axes[3]=1;assertClose(input.read(pad,map).throttleRate,-1);
    pad.axes[3]=-.56;assertClose(input.read(pad,map).throttleRate,.5);
    pad.axes[3]=.05;assertClose(input.read(pad,map).throttleRate,0);
    pad.axes[3]=-1;pad.buttons[12]={pressed:true,value:1};assertClose(input.read(pad,map).throttleRate,1);
    pad.axes=[];assertClose(input.read(pad,map).throttleRate,1);
  });

  test('flight', 'joystick bindings survive reconnection with per-device storage', function () {
    var f=flightControlsFixture(),stored={};
    f.win.localStorage={getItem:function(key){return stored[key]||null;},setItem:function(key,value){stored[key]=value;}};
    var pad={index:0,id:'Thrustmaster T.16000M',connected:true,mapping:'',axes:[0,0,0,1,0,1],buttons:[]};
    f.setPads([pad]);f.controls.sample();
    var yaw=f.elements.bindings.children[1].children[0];yaw.value='5';yaw.onchange();
    assert(f.controls.sample().yaw===-1);
    f.setPads([]);f.controls.sample();f.setPads([pad]);f.controls.sample();
    pad.axes[2]=-1;assert(f.controls.sample().yaw===-1,'Saved twist axis replaces default');
    assert(Object.keys(stored).length===1);
  });

  test('flight', 'flight sticks map twist to yaw and lateral travel to roll', function () {
    var input=window.Driftworks.flightInput;
    ['Thrustmaster T.16000M (Vendor: 044f Product: b10a)', 'Generic USB joystick'].forEach(function(id){
      var map=input.defaults(false,id),pad={axes:[1,-1,0,1],buttons:[]};
      var demand=input.read(pad,map);
      assert(demand.pitch===1 && demand.roll===-1 && demand.yaw===0 && demand.throttle===0);
      pad.axes=[0,0,1,-1];demand=input.read(pad,map);
      assert(demand.yaw===-1 && demand.roll===0 && demand.throttle===1);
      pad.axes=[0,0,.04,0];assert(input.read(pad,map).yaw===0);
      map.yaw=5;map.yawInvert=true;pad.axes=[0,0,0,0,0,-1];
      assert(input.read(pad,map).yaw===-1);
      pad.axes=[];assert(input.read(pad,map).yaw===0 && input.read(pad,map).throttle===null);
      assert(map.up===-1 && map.down===-1);
    });
  });

  test('flight', 'joystick permits inverted axes, absolute throttle and custom buttons', function () {
    var input=window.Driftworks.flightInput,map=input.defaults(false),pad={axes:[.12,1,-1,-1],buttons:[]};
    map.fire=5;map.pause=6;pad.buttons[5]={pressed:true,value:1};pad.buttons[6]={pressed:true,value:1};
    var c=input.read(pad,map);assert(c.pitch===1 && c.yaw===0 && c.roll===1 && c.throttle===1 && c.fire && c.pause);
    map.pitchInvert=true;map.throttleInvert=false;c=input.read(pad,map);assert(c.pitch===-1 && c.throttle===0);
    map.pitch=9;map.throttle=9;c=input.read(pad,map);assert(c.pitch===0 && c.throttle===null);
    c=input.read({axes:[],buttons:[]},map);assert(!c.fire && !c.boost && !c.pause);
  });

  test('flight', 'retail primary guns retain table ballistics and cadence', function () {
    var weapons=window.Driftworks.retailWeapons,model=window.Driftworks.flightGuns;
    assert(weapons[0].speed===450 && weapons[0].fireWait===.2 && weapons[0].lifetime===2 && weapons[0].length===10);
    assert(weapons[1].speed===450 && weapons[1].fireWait===.45 && weapons[1].lifetime===2 && weapons[1].length===15);
    weapons.forEach(function(w,index){
      var guns=model.create(),pose=window.Driftworks.arcade.create(18);pose.velocity=[0,150,0];
      for(var i=0;i<120;i++)model.step(guns,pose,w,true,1/120);
      assert(guns.fired===2*Math.ceil((1-1e-8)/w.fireWait));
      var bolt=guns.bolts[0],before=bolt.position.slice();model.step(guns,pose,w,false,1/120);
      assertClose(Math.hypot.apply(null,bolt.position.map(function(x,i){return x-before[i];}))*sim.METERS_PER_UNIT,w.speed/120);
      for(var j=0;j<Math.ceil((w.lifetime+.1)*120);j++)model.step(guns,pose,w,false,1/120);
      assert(guns.bolts.length===0);
    });
  });
  test('flight', 'legacy count-only gun calls retain imported counts and cadence', function () {
    var DW=window.Driftworks,gun=DW.flightGuns,weapon=DW.retailWeapons[0],pose=DW.arcade.create(0),U=sim.METERS_PER_UNIT;
    var find=function(name){return DW.arcade.profiles.find(function(p){return p.name===name;});};
    assert(find('GTF Ulysses').gunMounts===4 && find('GTF Hercules').gunMounts===6);
    assert(find('SF Dragon').gunMounts===5 && find('SB Seraphim').gunMounts===11);
    assert(find('GTF Perseus').gunMounts===4 && find('GTB Boanerges').gunMounts===2);
    DW.arcade.profiles.forEach(function(profile){
      var count=profile.gunMounts,guns=gun.create(),source=profile.gunMountSource;
      assert(Number.isInteger(count)&&count>0&&profile.primaryBankMounts.reduce(function(n,b){return n+b;},0)===count);
      assert(source.model.endsWith('.pof')&&/^[0-9a-f]{64}$/.test(source.sha256));
      gun.step(guns,pose,weapon,true,1/120,undefined,undefined,count);
      assert(guns.fired===count&&guns.bolts.length===count);
      var positions={};
      guns.bolts.forEach(function(bolt){
        positions[JSON.stringify(bolt.position)]=true;
        var target=pose.eye.map(function(x,i){return x-pose.back[i]*300/U;}),distance=Math.hypot.apply(null,target.map(function(x,i){return x-bolt.position[i];}));
        target.forEach(function(x,i){assertClose(bolt.position[i]+bolt.direction[i]*distance,x);});
      });
      assert(Object.keys(positions).length===count);
      for(var i=1;i<120;i++)gun.step(guns,pose,weapon,true,1/120,undefined,undefined,count);
      assert(guns.fired===count*Math.ceil((1-1e-8)/weapon.fireWait));
    });
  });
  test('flight', 'manual, duel and NPC gun steps receive their own profile mount counts', function () {
    var DW=window.Driftworks,original=DW.flightGuns.step,seen=[];
    try{
      DW.flightGuns.step=function(guns,pose,weapon,fire,dt,trace,aim,count){seen.push({pose:pose,count:count});return original(guns,pose,weapon,fire,dt,trace,aim,count);};
      var config={mode:'training',enabled:false,profile:DW.arcade.profiles[1],weapon:DW.retailWeapons[0]},session=DW.flightSession.create({onGunshot:function(){},onImpact:function(){}});
      var view=session.reset(config);view.state.eye=[0,0,100];
      session.advance(1/120,{throttle:.8,throttleRate:0,stop:false,fire:true},config);
      assert(seen.some(function(call){return call.pose===view.state&&call.count===6;}));assert(view.guns.fired===6);
      seen=[];
      var dragon=DW.arcade.profiles.findIndex(function(p){return p.name==='SF Dragon';});
      var duel=DW.flightDuel.run({profile:0,opponentProfile:dragon,duration:.01,category:'perfect'});
      assert(seen.some(function(call){return call.pose===duel.player&&call.count===4;}));
      assert(seen.some(function(call){return call.pose===duel.enemy.pose&&call.count===5;}));
    }finally{DW.flightGuns.step=original;}
  });
  test('flight', 'visible model muzzles transform with the hull and preserve sustained DPS', function () {
    var DW=window.Driftworks,gun=DW.flightGuns,U=sim.METERS_PER_UNIT;
    DW.shipPacks[0].models.forEach(function(model){
      var anchors=DW.shipPackModels.gunAnchors(model),pose=DW.arcade.create(0);
      pose.eye=[4,8,12];pose.right=[0,0,1];pose.up=[1,0,0];pose.back=[0,1,0];
      var guns=gun.create(),weapon=DW.retailWeapons[0],count=6;
      gun.step(guns,pose,weapon,true,1/120,undefined,undefined,count,anchors);
      assert(guns.fired===anchors.length);
      anchors.forEach(function(a,i){
        a.forEach(function(_,axis){assertClose(guns.bolts[i].position[axis],pose.eye[axis]+(pose.right[axis]*a[0]-pose.back[axis]*a[1]+pose.up[axis]*a[2])/U);});
      });
      for(var tick=1;tick<1200;tick++)gun.step(guns,pose,weapon,true,1/120,undefined,undefined,count,anchors);
      assert(guns.fired===300,'Six retail mounts at five volleys/s retain 30 bolts/s for '+model.name);
      var combat=DW.training.create('training');DW.training.configureHulls(combat,model.id,model.id);
      assert(DW.training.gunAnchors(combat.player)===anchors,'Same mesh owns collision and muzzles');
    });
    var striker=DW.shipPacks[0].models.find(function(m){return m.name==='Striker';});
    var pair=DW.shipPackModels.gunAnchors(striker);
    assert(pair.length===2&&pair[0][1]!==pair[1][1]&&pair[0][2]!==pair[1][2],'Preserve asymmetric source barrels');
  });
  test('flight', 'twin guns converge on the crosshair at 300 metres in any pose', function () {
    var DW=window.Driftworks,U=sim.METERS_PER_UNIT;
    [
      {eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]},
      {eye:[12,-8,3],right:[0,.6,.8],up:[1,0,0],back:[0,.8,-.6]}
    ].forEach(function(pose){
      var guns=DW.flightGuns.create();DW.flightGuns.step(guns,pose,DW.retailWeapons[0],true,1/120);
      assert(guns.bolts.length===2);
      var separation=Math.hypot.apply(null,guns.bolts[0].position.map(function(x,i){return x-guns.bolts[1].position[i];}));
      assertClose(separation*U,6);
      guns.bolts.forEach(function(bolt){
        assertClose(Math.hypot.apply(null,bolt.direction),1);
        var target=pose.eye.map(function(x,i){return x-pose.back[i]*300/U;});
        var distance=Math.hypot.apply(null,target.map(function(x,i){return x-bolt.position[i];}));
        target.forEach(function(x,i){assertClose(bolt.position[i]+bolt.direction[i]*distance,x);});
      });
    });
  });
  test('flight', 'close tail shots converge on the nearest crosshair hull and both hit', function () {
    var DW=window.Driftworks,U=sim.METERS_PER_UNIT,ai=DW.training,weapon=DW.retailWeapons[0];
    var pose=DW.arcade.create(18),combat=ai.create('training'),player=ai.bindPlayer(combat,pose);
    var enemyPose=DW.arcade.create(18);enemyPose.eye=pose.eye.map(function(x,i){return x-pose.back[i]*30/U;});
    var enemy=ai.createCraft('close-target',enemyPose,'enemy');enemy.collision={kind:'sphere',radiusM:1};enemy.shield=0;
    combat.enemies=[enemy];
    var aim=ai.convergencePoint(combat,player,weapon);assert(aim);assertClose((aim[1]-pose.eye[1])*U,29);
    // A narrow hull at 30 m fits between the fixed 300 m trajectories.
    function volley(adaptive){
      var guns=DW.flightGuns.create(),queries=0;
      DW.flightGuns.step(guns,pose,weapon,true,1/120,undefined,adaptive?function(){queries++;return ai.convergencePoint(combat,player,weapon);}:undefined);
      for(var i=0;i<12;i++)DW.flightGuns.step(guns,pose,weapon,false,1/120,function(a,b,bolt){return ai.trace(combat,a,b,bolt,'player',undefined,pose);});
      if(adaptive)assert(queries===1,'Resolve aim once per volley, not per projectile/substep');
      return guns.hits;
    }
    assert(volley(false)===0);assert(volley(true)===2);
    enemy.hp=100;
    var farPose=DW.arcade.create(18);farPose.eye=pose.eye.map(function(x,i){return x-pose.back[i]*60/U;});
    var far=ai.createCraft('far-target',farPose,'enemy');far.collision={kind:'sphere',radiusM:1};
    combat.enemies=[far,enemy];assertClose((ai.convergencePoint(combat,player,weapon)[1]-pose.eye[1])*U,29);
    assert(ai.convergencePoint(combat,player,weapon,function(){return pose.eye.map(function(x,i){return x-pose.back[i]*10/U;});})===null,'Terrain occludes the hull');
    enemy.hp=0;assertClose((ai.convergencePoint(combat,player,weapon)[1]-pose.eye[1])*U,59);
    far.pose.eye[0]+=10/U;assert(ai.convergencePoint(combat,player,weapon)===null,'Do not snap to off-crosshair hulls');
    far.pose.eye[0]-=10/U;far.team='ally';assert(ai.convergencePoint(combat,player,weapon)===null);
    far.team='enemy';far.pose.eye[1]=pose.eye[1]+(weapon.speed*weapon.lifetime+20)/U;
    assert(ai.convergencePoint(combat,player,weapon)===null,'Ignore hulls beyond weapon range');
  });
  test('flight', 'point-blank surfaces before the normal muzzle plane receive both forward shots', function () {
    var DW=window.Driftworks,U=sim.METERS_PER_UNIT,ai=DW.training,w=DW.retailWeapons[0];
    [.5,2,3.9,4,6,10].forEach(function(distance){
      var pose=DW.arcade.create(18),combat=ai.create('training'),player=ai.bindPlayer(combat,pose);
      var targetPose=DW.arcade.create(18);targetPose.eye=pose.eye.map(function(x,i){return x-pose.back[i]*(distance+.25)/U;});
      var target=ai.createCraft('point-blank',targetPose,'enemy');target.collision={kind:'sphere',radiusM:.25};target.shield=0;combat.enemies=[target];
      var point=ai.convergencePoint(combat,player,w);assert(point,'A close hull must not fall back to distant convergence');
      var guns=DW.flightGuns.create();
      DW.flightGuns.step(guns,pose,w,true,1/120,undefined,function(){return point;});
      guns.bolts.forEach(function(bolt){
        var forward=bolt.position.reduce(function(sum,x,i){return sum-(x-pose.eye[i])*pose.back[i]*U;},0);
        assertClose(forward,Math.min(4,distance*.5));
        assert(bolt.direction.reduce(function(sum,x,i){return sum-x*pose.back[i];},0)>0,'Never shoot backward');
      });
      for(var i=0;i<12;i++)DW.flightGuns.step(guns,pose,w,false,1/120,function(a,b,bolt){return ai.trace(combat,a,b,bolt,'player',undefined,pose);});
      assert(guns.hits===2,'Both shots must hit at surface distance '+distance+' m');
      assert(target.hp<100,'Hidden bolt visuals must not suppress damage');
    });
  });
  test('flight', 'gun sweeps hit terrain between endpoints and remove bolts at impact', function () {
    var model=window.Driftworks.flightGuns,field=function(p){return Math.hypot.apply(null,p)-1;};
    var hit=model.intersect([0,-2,0],[0,2,0],1,field);assert(hit);assertClose(hit[1],-1,.001);
    assert(model.intersect([2,-2,0],[2,2,0],1,field)===null);
    var guns=model.create(),pose=window.Driftworks.arcade.create(18),w=window.Driftworks.retailWeapons[0];
    model.step(guns,pose,w,true,1/120);assert(guns.bolts.length===2);
    model.step(guns,pose,w,false,1/120,function(start,end){return end;});
    assert(guns.bolts.length===0 && guns.hits===2 && guns.impacts.length===2);
    for(var i=0;i<30;i++)model.step(guns,pose,w,false,1/120);assert(guns.impacts.length===0);
  });
  test('flight', 'flight sortie starts at full cruise with a clear approach to the furball', function () {
    var model=window.Driftworks.arcade,U=sim.METERS_PER_UNIT;
    model.profiles.forEach(function(p){
      var state=model.createSortie(300/U,p),t=window.Driftworks.training.create('furball');
      assert(state.throttle===1);assertClose(state.velocity[1],p.maxVelocity[2]);
      model.step(state,p,{},.05);assertClose(state.velocity[1],p.maxVelocity[2]);
      window.Driftworks.training.spawn(t,state,300/U);
      assert(t.enemies.length===16);
      t.enemies.forEach(function(e){assert(e.pose.eye[1]>state.eye[1]);assert(e.pose.eye[2]>300/U);});
    });
  });
  test('flight', 'arcade handling accelerates, caps cruise, brakes and preserves orthonormal attitude', function () {
    var model=window.Driftworks.arcade;
    model.profiles.forEach(function(p){
      var state=model.create(18);state.throttle=1;
      model.step(state,p,{},.05);
      assertClose(Math.hypot.apply(null,state.velocity),p.maxVelocity[2]*(1-Math.exp(-.05/p.forwardAccel)));
      for(var i=0;i<4000;i++)model.step(state,p,{},.01);
      assertClose(Math.hypot.apply(null,state.velocity),p.maxVelocity[2],.01);
      state.throttle=0;
      for(var j=0;j<1000;j++)model.step(state,p,{},.01);
      assertClose(Math.hypot.apply(null,state.velocity),0,.4);
      for(var k=0;k<1000;k++)model.step(state,p,{pitch:1,yaw:-1,roll:.5},.01);
      [state.right,state.up,state.back].forEach(function(v){assertClose(Math.hypot.apply(null,v),1);});
      assertClose(state.right.reduce(function(sum,x,i){return sum+x*state.back[i];},0),0);
      assertClose(state.up.reduce(function(sum,x,i){return sum+x*state.back[i];},0),0);
    });
  });
  test('flight', 'maneuvering thrusters ease toward five m/s, cap diagonals and brake on release', function () {
    var model=window.Driftworks.arcade;
    model.profiles.forEach(function(p){
      var state=model.create(0);
      model.step(state,p,{side:1,vertical:1,boost:true},.05);
      assert(Math.hypot(state.velocity[0],state.velocity[2])<.13);
      for(var i=0;i<2000;i++)model.step(state,p,{side:1,vertical:1},.01);
      assertClose(Math.hypot(state.velocity[0],state.velocity[2]),5,.01);
      for(var j=0;j<2000;j++)model.step(state,p,{},.01);
      assertClose(Math.hypot.apply(null,state.velocity),0,.01);
      state.throttle=-1;
      model.step(state,p,{},.05);assert(state.velocity[1]<0 && state.velocity[1]>-.13);
      for(var k=0;k<2000;k++)model.step(state,p,{},.01);
      assertClose(state.velocity[1],-5,.01);
      state.throttle=-.5;
      for(var n=0;n<2000;n++)model.step(state,p,{},.01);
      assertClose(state.velocity[1],-2.5,.01);
    });
  });
  test('flight', 'LB maneuvering preserves steering and D-pad throttle while replacing right-stick controls', function () {
    var api=window.Driftworks.flightInput,pad={mapping:'standard',axes:[.5,-.5,1,-1],buttons:Array.from({length:16},function(){return {pressed:false,value:0};})},map=api.defaults(true);
    var normal=api.read(pad,map);assert(normal.roll!==0 && normal.throttleRate===1);
    pad.buttons[4].pressed=true;
    var maneuver=api.read(pad,map);
    assertClose(maneuver.pitch,normal.pitch);assertClose(maneuver.yaw,normal.yaw);
    assert(maneuver.roll===0 && maneuver.throttleRate===0);
    assertClose(Math.hypot(maneuver.side,maneuver.vertical),1);
    pad.buttons[13].pressed=true;assert(api.read(pad,map).throttleRate===-1);
    pad.buttons[4].pressed=false;assert(api.read(pad,map).side===0);
  });
  test('flight', 'manual throttle passes through zero into weak reverse and stop clears it',function(){
    var DW=window.Driftworks,state=DW.arcade.create(0),craft=DW.training.createCraft('manual',state,'ally');
    DW.training.stepInput(craft,{throttle:null,throttleRate:-1,fire:false},.05);
    assert(state.throttle<0 && state.velocity[1]<0);
    DW.training.stepInput(craft,{throttle:null,throttleRate:0,stop:true,fire:false},.05);
    assert(state.throttle===0);
  });
  test('flight', 'arcade contact scales normalized geology by body radius and retains five meter clearance', function () {
    var model=window.Driftworks.arcade,state=model.create(18);
    state.eye=[0,-17,0];state.velocity=[0,80,0];state.throttle=1;
    assert(model.contact(state,[0,-1,0],18));
    assertClose(Math.hypot.apply(null,state.eye),18+5/sim.METERS_PER_UNIT);
    assertClose(Math.hypot.apply(null,state.velocity),0,.4);assert(state.throttle===0);
    assert(!model.contact(state,[0,-1,0],18));
  });
  test('flight', 'arcade boost, strafe and physical distance use lab units without simulation time scaling', function () {
    var model=window.Driftworks.arcade,p=model.profiles[0],state=model.create(18);
    state.throttle=1;
    for(var i=0;i<1000;i++)model.step(state,p,{boost:true},.01);
    assertClose(Math.hypot.apply(null,state.velocity),p.afterburnerVelocity[2],.01);
    var before=state.eye.slice();model.step(state,p,{boost:true},.01);
    assertClose((state.eye[1]-before[1])*sim.METERS_PER_UNIT,p.afterburnerVelocity[2]*.01);
    var side=model.create(18);model.step(side,p,{side:1},.05);assert(side.velocity[0]>0 && side.velocity[0]<.13);
    assert(model.profiles[2].maxVelocity[2]>p.maxVelocity[2]);
  });

  test('flight', 'Flight hull hits use model triangles and scorches stay on the surface', function () {
    var models=window.Driftworks.shipPackModels,U=sim.METERS_PER_UNIT;
    var model={id:'plate',vertices:[-2,-2,0,0,0,1, 2,-2,0,0,0,1, 0,2,0,0,0,1]};
    var pose={eye:[10,20,30],right:[1,0,0],back:[0,-1,0],up:[0,0,1]};
    var hit=models.hullHit(model,pose,[10,20,30+2/U],[10,20,30-2/U],U);
    assert(hit);assertClose(hit.fraction,.5);assertClose(hit.point[2],30);
    assert(!models.hullHit(model,pose,[10+1.9/U,20+1.9/U,30+2/U],[10+1.9/U,20+1.9/U,30-2/U],U), 'Sphere-only near misses pass through');
    assert(!models.hullHit(model,pose,[10,20,30+2/U],[10,20,30+1/U],U), 'No collision beyond the swept segment');
    var e={pose:pose};models.addScorch(e,hit);
    e.scorches[0].layers.forEach(function(layer){assert(layer.length>0);for(var i=0;i<layer.length;i+=6){assert(layer[i]>=-2&&layer[i]<=2);assert(layer[i+1]>=-2&&layer[i+1]<=2);assert(layer[i+2]>0&&layer[i+2]<.03);}});
    for(var j=0;j<30;j++)models.addScorch(e,hit);assert(e.scorches.length===24);
    var ai=window.Driftworks.training,t=ai.create();
    Object.assign(e,{hp:1,index:0,id:'test',pose:Object.assign(pose,{velocity:[0,0,0]}),team:'enemy'});
    t.enemies=[e];ai.damageEnemy(t,e,{damage:2,armorFactor:1},'player');
    assert(t.wrecks[0].scorches===e.scorches, 'The wreck retains its hull burns');
  });

  test('flight', 'visible bolt width registers shield and hull damage at triangle edges', function () {
    var DW=window.Driftworks,models=DW.shipPackModels,ai=DW.training,U=sim.METERS_PER_UNIT;
    var model={id:'test-bolt-plate',name:'Bolt test plate',triangles:1,vertices:[-2,-2,0,0,0,1, 2,-2,0,0,0,1, 0,2,0,0,0,1]};
    var packs=DW.shipPacks;
    try {
      DW.shipPacks=packs.concat([{id:'bolt-tests',models:[model]}]);
      var combat=ai.create('training'),pose=DW.arcade.create(0),target=ai.createCraft('bolt-target',pose,'enemy');
      pose.eye=[0,0,0];pose.right=[1,0,0];pose.back=[0,-1,0];pose.up=[0,0,1];
      target.collision={kind:'model',modelId:model.id};target.hp=target.maxHp=100;target.shield=target.maxShield=21;combat.enemies=[target];
      var weapon=DW.retailWeapons[0],start=[2.5/U,-2/U,2/U],end=[2.5/U,-2/U,-2/U];
      assert(!models.hullHit(model,pose,start,end,U),'Bolt centre line misses the plate');
      var contact=models.hullHit(model,pose,start,end,U,weapon.headRadius);
      assert(contact&&contact.fraction<.5,'The visible head radius reaches the triangle vertex first');
      assertClose(contact.local[0],2);assertClose(contact.local[1],-2);assertClose(contact.local[2],0);
      for(var shot=0;shot<3;shot++) {
        var guns=DW.flightGuns.create();
        guns.bolts=[{position:start.slice(),direction:[0,0,-1],weapon:weapon,age:0}];
        DW.flightGuns.step(guns,combat.player.pose,weapon,false,4/weapon.speed,function(a,b,bolt){return ai.trace(combat,a,b,bolt,'player',undefined,combat.player.pose);});
        assert(guns.hits===1&&guns.bolts.length===0,'A visible edge contact registers one impact and removes its bolt');
        if(shot===0) { assertClose(target.shield,10.5);assertClose(target.hp,100); }
        if(shot===1) { assertClose(target.shield,0);assertClose(target.hp,100); }
      }
      assertClose(target.hp,86.5);assert(target.hitFlash>0&&target.scorches.length===3);
      assert(!models.hullHit(model,pose,[3/U,-2/U,2/U],[3/U,-2/U,-2/U],U,weapon.headRadius),'A near miss outside the visible radius stays a miss');
      var face=models.hullHit(model,pose,[0,0,2/U],[0,0,-2/U],U,weapon.headRadius);
      assertClose(face.fraction,(2-weapon.headRadius)/4);
      var edge=models.hullHit(model,pose,[0,-2.5/U,2/U],[0,-2.5/U,-2/U],U,weapon.headRadius);
      assert(edge&&edge.fraction<.5,'The interior of a triangle edge is swept too');
      packs[0].models.forEach(function(ship){
        var vertex=ship.vertices.slice(0,3);
        for(var i=6;i<ship.vertices.length;i+=6) if(ship.vertices[i]>vertex[0]) vertex=ship.vertices.slice(i,i+3);
        var a=[(vertex[0]+.45)/U,vertex[1]/U,(vertex[2]+2)/U],b=[a[0],a[1],(vertex[2]-2)/U];
        assert(!models.hullHit(ship,pose,a,b,U),'Centre line is outside '+ship.name);
        assert(models.hullHit(ship,pose,a,b,U,weapon.headRadius),'Visible bolt edge contacts actual '+ship.name+' mesh');
      });
    } finally { DW.shipPacks=packs; }
  });

  test('flight', 'Flight traces burn only the first unobstructed hull and preserve lethal impacts', function () {
    var models=window.Driftworks.shipPackModels,ai=window.Driftworks.training,U=sim.METERS_PER_UNIT;
    var t=ai.create(),pose={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1],velocity:[0,0,0]},e={id:'target',index:0,hp:10,pose:pose};
    e.collision={kind:'model',modelId:models.craftModel(e,'',1).id};t.enemies=[e];
    var bolt={weapon:{damage:20,armorFactor:1}},start=[0,0,10/U],end=[0,0,-10/U];
    var terrainMarks=[];t.onTerrainImpact=function(point){terrainMarks.push(point);};
    var obstruction=[0,0,8/U],player={eye:[20,20,20]};
    assert(ai.trace(t,start,end,bolt,'player',function(){return obstruction;},player)===obstruction);
    assert(e.hp===10&&!e.scorches, 'Terrain shields the hull from damage and marks');
    assert(terrainMarks.length===1&&terrainMarks[0]===obstruction, 'Only a confirmed terrain impact leaves a rock burn');
    var impact=ai.trace(t,start,end,bolt,'player',null,player);
    assert(impact&&e.hp===0&&e.scorches.length===1);
    assert(terrainMarks.length===1, 'Hull impacts do not burn the terrain behind them');
    assert(t.wrecks[0].scorches.length===1, 'The killing shot marks the wreck');
  });

  test('flight', 'Flight scorch batches follow translated and rotated hull poses', function () {
    var models=window.Driftworks.shipPackModels,U=sim.METERS_PER_UNIT;
    var pose={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]},e={index:0,pose:pose};
    var model=models.craftModel(e,'',1),hit=models.hullHit(model,pose,[0,0,10/U],[0,0,-10/U],U);
    assert(hit);models.addScorch(e,hit);
    var before=models.scorchGeometry([e],'',1,U)[0].vertices;
    e.pose={eye:[10,20,30],right:[0,1,0],back:[1,0,0],up:[0,0,1]};
    var after=models.scorchGeometry([e],'',1,U)[0].vertices;
    assert(before.length>0&&before.length===after.length);
    for(var i=0;i<before.length;i+=6){assertClose(after[i],10-before[i+1],.00001);assertClose(after[i+1],20+before[i],.00001);assertClose(after[i+2],30+before[i+2],.00001);}
  });

  test('flight', 'Combat study deduplicates deterministic pilots and equivalent weapons', function () {
    var study=window.Driftworks.flightStudy, DW=window.Driftworks;
    var config={ships:[0],weapons:[-1],starts:['headOn'],pilots:['perfect','practiced'],skills:[1],seeds:3,seed:1,duration:10,pairing:'mirror',defenses:'paired'};
    assert(study.plan(config).length===8);
    config.weapons.push(DW.training.defaultWeapon(DW.arcade.profiles[0]));
    assert(study.plan(config).length===8, 'Equivalent native weapons are not independent trials');
    config.seeds=11;var rejected=false;try{study.plan(config);}catch(e){rejected=true;}assert(rejected);
  });

  test('flight', 'Combat study keeps timeouts censored and pairs shield observations', function () {
    var DW=window.Driftworks,duel=DW.flightDuel.run({duration:1,seed:7}),options=duel.replay.options;
    var shield={id:'shield',options:Object.assign({},options,{unshielded:false}),summary:Object.assign({},duel.summary(),{outcome:'timeout',seconds:10,unshielded:false})};
    var bare={id:'bare',options:Object.assign({},options,{unshielded:true}),summary:Object.assign({},duel.summary(),{outcome:'player-win',seconds:2,unshielded:true})};
    var a=DW.flightStudy.analyze([shield,bare]);assert(a.timeouts===1&&a.medianKill===2);assert(a.shieldPairs===1&&a.pairsCensored===1&&a.observedShieldDelta===8);
    assert(DW.flightStudy.analyze([shield]).medianKill===null);
  });

  test('flight', 'Combat study watch links reproduce the complete duel configuration', function () {
    var DW=window.Driftworks,options=DW.flightDuel.create({duration:1,seed:17,profile:1,opponentProfile:31,category:'human',flavor:'expert',start:'crossing',unshielded:true}).replay.options;
    var url=DW.flightStudy.watchUrl(options),parsed=DW.flightDuel.readWatchSearch(url.slice(url.indexOf('?')));
    assert(JSON.stringify(parsed)===JSON.stringify(options));
    assert(DW.flightDuel.readWatchSearch('?unrelated=1')===null);
    var rejected=false;try{DW.flightDuel.readWatchSearch('?duel=1&seed=-1');}catch(e){rejected=true;}assert(rejected);
  });

  test('flight', 'Opponent studies hold setup fixed across styles and preserve watch/replay identity', function () {
    var DW=window.Driftworks,config={styles:['baseline','aggressor','interceptor','passer'],ships:[1],weapons:[-1],starts:['headOn'],pilots:['perfect'],skills:[1],seeds:2,seed:7,duration:6,pairing:'mirror',defenses:'retail'};
    var cases=DW.flightStudy.plan(config);assert(cases.length===4);
    cases.forEach(function(c){var duel=DW.flightDuel.run(c.options),summary=duel.summary();
      assert(summary.opponentStyle===c.options.opponentStyle);
      var query=DW.flightStudy.watchUrl(duel.replay.options).split('?')[1];
      assert(DW.flightDuel.readWatchSearch(query).opponentStyle===summary.opponentStyle);
      assert(JSON.stringify(DW.flightDuel.replay(duel.replay).summary())===JSON.stringify(summary));
      assert(summary.metrics.attackSeconds+summary.metrics.extendSeconds<=summary.seconds+.00001);
      assert(Number.isFinite(summary.metrics.rangeIntegral));
    });
    var invalid=false;try{DW.flightDuel.create({opponentStyle:'unknown'});}catch(e){invalid=true;}assert(invalid);
  });

  test('flight', 'Pass fighter commits to an exit while aggressor maintains close pressure', function () {
    var DW=window.Driftworks;
    var aggressive=DW.flightDuel.run({opponentStyle:'aggressor',duration:12,category:'perfect',start:'headOn',profile:1}).summary();
    var passer=DW.flightDuel.run({opponentStyle:'passer',duration:12,category:'perfect',start:'headOn',profile:1}).summary();
    assert(passer.metrics.extendSeconds>aggressive.metrics.extendSeconds,'Pass fighter spends longer on committed exits');
    var duel=DW.flightDuel.create({opponentStyle:'passer',duration:10,category:'perfect',start:'turning'});
    duel.advance(.1);assert(duel.enemy.mode==='break');var goal=duel.enemy.extensionGoal.slice();
    duel.advance(.6);assert(JSON.stringify(goal)===JSON.stringify(duel.enemy.extensionGoal),'Exit heading does not track the opponent every decision');
  });

  test('flight', 'FreeSpace pursuit uses closure control without stopping or altering shared physics', function () {
    var DW=window.Driftworks,U=sim.METERS_PER_UNIT;
    function fixture(speed){var d=DW.flightDuel.create({opponentStyle:'fso-pursuit',duration:2,profile:1,start:'tail'});
      d.enemy.pose.eye=d.player.eye.map(function(v,i){return v-(i===1?330/U:0);});
      d.enemy.pose.back=[0,-1,0];d.enemy.pose.right=[1,0,0];d.enemy.pose.up=[0,0,1];
      d.enemy.pose.velocity=[0,speed,0];d.player.velocity=[0,40,0];d.advance(1/120);return d;}
    var closing=fixture(75),receding=fixture(10);
    assert(closing.enemy.pose.throttle<receding.enemy.pose.throttle,'Closing fighter reduces throttle');
    assert(closing.enemy.pose.throttle>=.45&&receding.enemy.pose.throttle<=1);
    assert(closing.enemy.mode==='attack','Productive aligned pursuit is preserved');
    assert(closing.enemy.gunGoal&&closing.enemy.goal,'Navigation and gun target are separately represented');
    assert(closing.enemy.profile===DW.arcade.profiles[1]);
  });

  test('flight', 'FreeSpace no-progress escape is opt-in, committed, bounded and followed by re-entry', function () {
    var DW=window.Driftworks;
    function fixture(style){var d=DW.flightDuel.create({opponentStyle:style,duration:15,start:'crossing',profile:1});d.enemy.noProgress=8;d.advance(1/120);return d;}
    var pursuit=fixture('fso-pursuit'),breaker=fixture('fso-breaker');
    assert(pursuit.enemy.mode==='attack'&&breaker.enemy.mode==='break');
    assert(breaker.enemy.progressEscapes===1&&breaker.enemy.breakReason==='no-progress');
    var exit=breaker.enemy.extensionGoal.slice();breaker.advance(.8);
    assert(JSON.stringify(exit)===JSON.stringify(breaker.enemy.extensionGoal),'Exit point stays fixed');
    breaker.advance(4.4);assert(breaker.enemy.mode!=='break','Escape ends by deadline');
    assert(breaker.enemy.reentryGoal&&breaker.enemy.breakCooldown>breaker.combat.time,'Re-entry and cooldown follow escape');
    assert(breaker.enemy.progressEscapes===1,'Cooldown prevents repeated escape chatter');
  });

  test('flight', 'FreeSpace variants are deterministic through replay and study links', function () {
    var DW=window.Driftworks;
    ['fso-pursuit','fso-breaker'].forEach(function(style){var d=DW.flightDuel.run({opponentStyle:style,category:'human',flavor:'practiced',seed:4,duration:4});
      assert(JSON.stringify(DW.flightDuel.replay(d.replay).summary())===JSON.stringify(d.summary()));
      var url=DW.flightStudy.watchUrl(d.replay.options);assert(DW.flightDuel.readWatchSearch(url.split('?')[1]).opponentStyle===style);
    });
  });

  test('flight', 'Manual training spawns inherit the selected experimental opponent policy', function () {
    var DW=window.Driftworks,t=DW.training.create('training'),pose=DW.arcade.create(0);
    t.opponentStyle='fso-breaker';DW.training.spawn(t,pose,0);
    assert(t.enemies.length>0&&t.enemies.every(function(e){return e.opponentStyle==='fso-breaker';}));
  });

  test('flight', 'flight destruction retains drift, pauses and expires independently of gun impacts', function () {
    var DW=window.Driftworks, api=DW.training, pose=DW.arcade.create(0), combat=api.create('training');
    api.configure(combat,DW.arcade.profiles[0]);api.spawn(combat,pose,0);
    var victim=combat.enemies[0];victim.pose.velocity=[30,-20,10];
    api.damageCraft(combat,victim,{damage:10000,armorFactor:1,shieldFactor:1},combat.player);
    var flash=combat.flashes[0],units=DW.sim.METERS_PER_UNIT;
    assert(flash.destruction && flash.age===0);
    assertClose(flash.velocity[0],30/units);assertClose(flash.velocity[1],-20/units);
    assert(api.allGuns(combat,DW.flightGuns.create()).impacts.indexOf(flash)<0,'Destruction does not also draw the old impact blob');
    combat.enabled=false;api.step(combat,pose,.4,0);assert(flash.age===0,'Paused simulation freezes explosion');
    combat.enabled=true;api.step(combat,pose,.4,0);assert(combat.flashes.indexOf(flash)>=0,'Destruction survives ordinary hit-flash expiry');
    api.step(combat,pose,5.2,0);assert(combat.flashes.indexOf(flash)<0,'Destruction expires after 5.5 simulation seconds');
  });
  };
})();
