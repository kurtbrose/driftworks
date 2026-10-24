(function () {
  'use strict';

  var sim = window.Driftworks.sim;
  var game = window.Driftworks.game;
  var hud = window.Driftworks.hud;
  var tests = [];

  function test(name, fn) {
    tests.push({ name: name, fn: fn });
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  function assertClose(actual, expected, epsilon) {
    var limit = epsilon || 0.000001;
    assert(Math.abs(actual - expected) <= limit, 'Expected ' + actual + ' to be within ' + limit + ' of ' + expected);
  }

  test('Selected offscreen bearing has a large filled edge arrow and a fixed central double chevron', function () {
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

  test('Target status trails, collapse flash, switching and rewind', function () {
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

  test('operational tether spin limits tip load to 1-3 g at every span', function () {
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

  test('tether greyboxes preserve all five true metre spans and finite mesh normals', function () {
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

  test('explicit order recipients are independent of selection and preserve legacy commands', function () {
    var base=sim.createInitialWorld();
    base.ships.forEach(function(ship){ship.docked=false;ship.order={kind:'move',target:{x:100,y:100}};});
    base.selectedShipIds=['escort-02'];base.selectedPlatformId='platform-02';
    base.platforms[0].state='deployed';base.platforms[0].asteroidId=base.asteroids[0].id;
    base.wrecks=[{id:'test-wreck',position:{x:500,y:500},velocity:{x:0,y:0},ore:10,towedBy:null}];
    var cases=[
      ['issueMoveOrder',[{x:800,y:800}],['tug-01','missing','tug-01']],
      ['issueContextOrder',[{x:800,y:800}],['tug-01','escort-01']],
      ['issueMineOrder',[base.asteroids[0].id],['msv-hardshell']],
      ['issueBuildOrder',[],['tug-01']],['issueReturnOrder',[],['tug-01']],
      ['issueDefendOrder',[{x:900,y:900},null],['escort-01']],
      ['issueRecoveryOrder',[{kind:'wreck',id:'test-wreck'}],['tug-01']],
      ['issuePlatformRecovery',['platform-01'],['tug-01']]
    ];
    cases.forEach(function(c){
      var before=JSON.stringify(base),ids=c[2],expected=sim[c[0]].apply(null,[sim.selectShips(base,ids)].concat(c[1]));
      expected.selectedShipIds=base.selectedShipIds.slice();expected.selectedPlatformId=base.selectedPlatformId;
      var actual=sim[c[0]].apply(null,[base].concat(c[1],[ids]));
      assert(JSON.stringify(actual)===JSON.stringify(expected),c[0]+' must use explicit recipients');
      assert(JSON.stringify(base)===before,c[0]+' mutated the source');
    });
    base.ships[1].order={kind:'idle'};
    var next=sim.issueSalvageAllOrder(base,['tug-01']);
    assert(next.ships[1].order.kind==='recover'&&next.selectedShipIds[0]==='escort-02');
    next=sim.issueMoveOrder(base,{x:1,y:2},[]);
    assert(next.ships[1].order.kind==='idle'&&next.ships[3].order.kind==='move','Empty recipients must not fall back to selection');
    var visual=game.issueVisualContextOrder(base,{x:800,y:800},['tug-01','escort-01']);
    assert(visual.ships[1].order.kind==='move'&&visual.ships[2].order.kind==='defend');
    assert(JSON.stringify(visual.selectedShipIds)===JSON.stringify(base.selectedShipIds)&&visual.selectedPlatformId===base.selectedPlatformId);
  });

  test('automatic defense leaves both ship and platform selection untouched', function () {
    var world=sim.createInitialWorld();world.selectedShipIds=['tug-01'];world.selectedPlatformId='platform-01';
    world=sim.spawnHostileWave(world);var next=sim.stepWorld(world,1/30);
    assert(next.ships.some(function(ship){return ship.order.kind==='defend'&&ship.order.automatic;}));
    assert(next.selectedShipIds.join(',')==='tug-01'&&next.selectedPlatformId==='platform-01');
  });

  test('controlled craft owns defenses, weapons and legal input just like AI craft', function () {
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

  test('all craft use team-aware nearest-hit damage and local death does not stop combat', function () {
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

  test('simulation collision models survive cosmetic changes and JSON round trips', function () {
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

  test('normal flight hull selections match rendered models across changes, waves and reloads', function () {
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
  test('evaluation pilots reject illegal control records without silently repairing them', function () {
    var api=window.Driftworks.flightAI, valid={pitch:0,yaw:0,roll:0,side:0,vertical:0,throttle:1,fire:false,boost:false};
    [Object.assign({},valid,{pitch:1.01}),Object.assign({},valid,{yaw:NaN}),Object.assign({},valid,{throttle:-.1}),Object.assign({},valid,{boost:1}),Object.assign({},valid,{teleport:true})].forEach(function(input){
      var rejected=false;try{api.validate(input);}catch(e){rejected=true;}assert(rejected);
    });
    assert(api.validate(valid)!==valid);
  });

  test('watch playback uses the benchmark clock and cameras never alter duel state', function () {
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

  test('evaluation pilots only read poses and replay through ordinary shared physics', function () {
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

  test('human simulator reacts to delayed observations and cannot use current hidden truth', function () {
    var DW=window.Driftworks,api=DW.flightAI,p=DW.arcade.profiles[0],w=DW.retailWeapons[0],own=DW.arcade.create(0);
    var a=api.create('human','novice',17),b=api.create('human','novice',17),target={eye:[0,10,0],velocity:[0,0,0]};
    assert(!a.step(0,own,target,p,w).fire);b.step(0,own,target,p,w);
    a.step(.22,own,target,p,w);b.step(.22,own,{eye:[10,0,0],velocity:[50,0,0]},p,w);
    assert(JSON.stringify(a.step(.35,own,target,p,w))===JSON.stringify(b.step(.35,own,{eye:[-10,0,0],velocity:[-50,0,0]},p,w)),'Only the identical first sample has arrived');
    assert(JSON.stringify(a.step(.57,own,target,p,w))!==JSON.stringify(b.step(.57,own,target,p,w)),'The changed observation must eventually affect controls');
  });

  test('perfect pilot takes a valid shot immediately without opponent burst concessions', function () {
    var DW=window.Driftworks,p=DW.arcade.profiles[0],own=DW.arcade.create(0),target={eye:[0,300/sim.METERS_PER_UNIT,0],velocity:[0,0,0]};
    assert(DW.flightAI.create('perfect').step(0,own,target,p,DW.retailWeapons[0]).fire);
    var invalid=DW.flightAI.solution(own,[0,2000/sim.METERS_PER_UNIT,0],[0,0,0],DW.retailWeapons[0]);
    assert(!invalid.valid && invalid.time>DW.retailWeapons[0].lifetime);
  });

  test('duel input replays reproduce combat and frame batching preserves the fixed clock', function () {
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

  test('duels stop at destruction without respawning and equip retail defenses on both pilots', function () {
    var api=window.Driftworks.flightDuel,duel=api.create({start:'headOn',category:'perfect',duration:10});
    duel.advance(.2);assert(duel.summary().playerShots>0);
    window.Driftworks.training.damageCraft(duel.combat,duel.enemy,{damage:10000,armorFactor:1,shieldFactor:1},duel.combat.player);
    duel.advance(api.dt);assert(duel.summary().outcome==='player-win');
    var before=JSON.stringify(duel.summary());duel.advance(30);assert(JSON.stringify(duel.summary())===before);
    assert(duel.combat.enemies.length===1 && duel.combat.wave===1);assert(duel.combat.maxHull===180 && duel.enemy.maxHp===180);
    assert(duel.combat.maxShield===380 && duel.enemy.maxShield===380);
  });

  test('retail catalogs include old Hercules, Vasudan and Shivan capabilities without conflating artwork',function(){
    var DW=window.Driftworks,profiles=DW.arcade.profiles,find=function(name){return profiles.find(function(p){return p.name===name;});};
    assert(profiles.length===35 && DW.retailWeapons.length===10);
    assert(find('GTF Hercules').hull===250 && find('GTF Hercules').shield===600);
    assert(find('GTF Hercules Mark II').hull===275 && find('GTF Hercules Mark II').shield===610);
    assert(find('GVF Horus').shield===230 && find('SF Dragon').shield===700 && find('SF Dragon').hull===100);
    profiles.forEach(function(p){assert(p.hull>0 && p.shield>=0 && p.rotationTime.every(function(v){return v>0;}));assert(DW.training.defaultWeapon(p)>=0);});
  });

  test('shield absorption, hull spillover and recharge are symmetric and unshielded is explicit',function(){
    var DW=window.Driftworks,ai=DW.training,player=DW.arcade.create(0),t=ai.create('training'),p=Object.assign({},DW.arcade.profiles[0],{hull:100,shield:10});
    ai.configure(t,p);ai.spawn(t,player,0);t.enemies=t.enemies.slice(0,1);var e=t.enemies[0];ai.equip(e,p,0);
    var weapon={damage:30,shieldFactor:1,armorFactor:1};ai.damagePlayer(t,weapon);ai.damageEnemy(t,e,weapon);
    assert(t.shield===0 && e.shield===0 && t.hull===80 && e.hp===80);
    t.time=7;ai.step(t,player,1/120,0);assertClose(t.shield,e.shield);assertClose(t.shield,.1);
    ai.configure(t,p,true);ai.equip(e,p,0,true);t.time=20;ai.step(t,player,1/120,0);assert(t.shield===0 && e.shield===0);
    var session=DW.flightSession.create({});session.reset({mode:'training',enabled:true,profile:DW.arcade.profiles[1]});
    assert(session.snapshot().combat.maxShield===600 && session.snapshot().combat.enemies.every(function(c){return c.maxShield===c.profile.shield;}));
  });

  test('duel loadouts match or differ by ship and weapon and reject legacy replay schemas',function(){
    var DW=window.Driftworks,api=DW.flightDuel,dragon=DW.arcade.profiles.findIndex(function(p){return p.name==='SF Dragon';});
    var duel=api.create({profile:1,opponentProfile:dragon,weapon:2}),s=duel.summary();
    assert(s.playerMaxShield===600 && s.opponentMaxShield===700 && s.weapon==='Prometheus S' && s.opponentWeapon===s.weapon);
    assert(duel.enemy.weaponIndex===2 && duel.enemy.profile.name==='SF Dragon');
    var defaults=api.create({profile:1,opponentProfile:dragon}).summary();assert(defaults.opponentWeapon==='Shivan Heavy Laser');
    var bare=api.create({profile:1,unshielded:true}).summary();assert(bare.playerMaxShield===0 && bare.opponentMaxShield===0 && bare.playerMaxHull===250 && bare.opponentMaxHull===250);
    var record=JSON.parse(JSON.stringify(duel.replay));record.version=1;var rejected=false;try{api.replay(record);}catch(e){rejected=true;}assert(rejected);
  });

  test('watch and headless duels retain exact triangle hulls in links and replay', function () {
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
  test('all duel geometries and human flavors stay finite, deterministic and input bounded', function () {
    var DW=window.Driftworks,api=DW.flightDuel;
    api.starts.forEach(function(start){['novice','practiced','expert'].forEach(function(flavor){
      var options={start:start,category:'human',flavor:flavor,seed:8,duration:.6},a=api.run(options),b=api.run(options);
      assert(JSON.stringify(a.summary())===JSON.stringify(b.summary()));
      a.replay.inputs.forEach(function(input){DW.flightAI.validate(input);});
      [a.player,a.enemy.pose].forEach(function(p){p.eye.concat(p.velocity,p.rates).forEach(function(v){assert(Number.isFinite(v));});assertClose(Math.hypot.apply(null,p.back),1);});
    });});
  });

  test('surface work light retains metre scale across asteroid sizes', function () {
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

  test('work-light shadow frame preserves its beam under rotation and camera translation', function () {
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

  test('experiment controls report missing markup at the lookup boundary', function () {
    var get = window.Driftworks.experimentDom({getElementById: function () { return null; }});
    var message = '';
    try { get('profile'); } catch (error) { message = error.message; }
    assert(message === 'Missing experiment element #profile');
  });

  test('flight sessions expose complete state before the first reset', function () {
    var session = window.Driftworks.flightSession.create({}), view = session.snapshot();
    assert(view.state.eye.every(Number.isFinite));
    assert(view.state.throttle === 0 && view.guns.fired === 0);
    assert(view.combat.enemies.length === 0 && !view.contact);
    assert(session.snapshot().state === view.state);
  });

  test('mixed ship artwork falls back to the collision blockout without a pack', function () {
    var DW = window.Driftworks, packs = DW.shipPacks;
    try {
      DW.shipPacks = [];
      var model = DW.shipPackModels.craftModel({index: 0}, 'mixed', 1);
      assert(model.id === 'blockout' && model.vertices.length === 108);
      assert(DW.shipPackModels.hullHit(model, DW.arcade.create(0), [0,-2,0], [0,2,0], 10));
    } finally { DW.shipPacks = packs; }
  });

  test('training destruction accepts an explicitly unknown shooter', function () {
    var DW = window.Driftworks, combat = DW.training.create('training'), pose = DW.arcade.create(20);
    DW.training.spawn(combat, pose, 20);
    var victim = combat.enemies[0];
    victim.hp = 1;
    DW.training.damageEnemy(combat, victim, DW.retailWeapons[0], null);
    assert(victim.hp === 0 && combat.wrecks.length === 1);
    assert(combat.radioEvents[0].killer === null);
  });

  function flightDisplayDocument(){
    var elements={},classes={};
    function element(){return {value:'',checked:false,hidden:false,textContent:'',children:[],listeners:{},addEventListener:function(name,fn){this.listeners[name]=fn;},appendChild:function(child){this.children.push(child);},insertBefore:function(child){this.children.unshift(child);}};}
    return {getElementById:function(id){return elements[id]||(elements[id]=element());},createElement:element,body:{classList:{toggle:function(name){classes[name]=!classes[name];return classes[name];}}}};
  }

  test('flight diagnostics preserve frame pacing, elapsed clamps and measurement resets',function(){
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

  test('flight presentation shares appearance and preserves fleet, wreck and effect submission order',function(){
    var DW=window.Driftworks,doc=flightDisplayDocument(),saved={packs:DW.shipPackModels,scene:DW.scene3d.create,sky:DW.flightSkybox.create,gunGeometry:DW.flightGuns.geometry,blockout:DW.training.geometry};
    var events=[],fleets=[],scorches=[],engines=[],actors,effects,hullQuery,textureImages=new Map(),sourceWorld={},world=sourceWorld,sceneStats={},skyStats={};
    var scene={setStudyExplosions:function(){},setSurfaceCamera:function(pose){events.push('pose');assert(pose.eye===player.eye);},setStudyActors:function(value){events.push('actors');actors=value;},setStudyEffects:function(value){events.push('effects');effects=value;},setStudyDiagnostics:function(value){events.push('diagnostics');assert(value===comparison);},sync:function(value){events.push('sync');assert(value===world);},render:function(value,a,b,dt){events.push('scene');assert(value===world&&a===1&&b===0&&dt===.05);},getRenderStats:function(){return sceneStats;}};
    var player=DW.arcade.create(20),comparison={mode:'empty',scale:.5};
    function craft(id,team,hp){return {id:id,team:team,hp:hp,pose:DW.arcade.create(20),guns:DW.flightGuns.create()};}
    var ally=craft('ally','ally',90),enemy=craft('enemy','enemy',90),dead=craft('dead','enemy',0),wreck=craft('wreck','ally',0),combat=DW.training.create();
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
      var blockouts=[];DW.training.geometry=function(value){blockouts.push(value.enemies);return [{kind:'blockout'}];};
      presentation.render({state:player,combat:combat,guns:DW.flightGuns.create(),world:world},plain,comparison,.05);
      assert(blockouts.length===2&&blockouts[0].length===2&&blockouts[0].every(function(craft){return craft.hp===1;}));
      assert(wreck.hp===0&&ally.hp===90,'Blockout batching must not mutate combatants or wrecks');
    }finally{DW.shipPackModels=saved.packs;DW.scene3d.create=saved.scene;DW.flightSkybox.create=saved.sky;DW.flightGuns.geometry=saved.gunGeometry;DW.training.geometry=saved.blockout;}
  });

  // A small event/DOM fixture exercises the browser adapter without real devices.
  function flightControlsFixture(storage,withTouch,deviceOptions){
    function target(){return {listeners:{},addEventListener:function(name,fn){this.listeners[name]=fn;},emit:function(name,event){if(this.listeners[name])this.listeners[name](event||{});},appendChild:function(child){this.children.push(child);if(this.value===''&&child.value!==undefined)this.value=child.value;},children:[],value:'',textContent:'',setAttribute:function(){}};}
    var elements={},doc=target(),win=target(),host=target(),pads=[],counts={pause:0,weapon:0,target:0,lock:0,radar:0,diagnostics:0,performance:0,resume:0,failure:0},paused=false,dead=false,controls;
    doc.getElementById=function(id){return elements[id]||(elements[id]=target());};
    doc.createElement=target;doc.createTextNode=function(text){return {textContent:text};};
    doc.body={classList:{add:function(){},toggle:function(){}}};doc.exitPointerLock=function(){doc.pointerLockElement=null;};
    host.clientWidth=1000;host.clientHeight=800;
    host.contains=function(node){return node===host;};host.getBoundingClientRect=function(){return {left:0,top:0,right:host.clientWidth,bottom:host.clientHeight,width:host.clientWidth,height:host.clientHeight};};
    doc.getElementById('input-mode').value='mouse';doc.getElementById('sensitivity').value='1';
    if(storage)win.localStorage=storage;
    if(withTouch){
      win.location={search:deviceOptions ? deviceOptions.search || '' : '?mobile=1'};win.matchMedia=function(query){return {matches:!!(deviceOptions && (query==='(pointer: coarse)' ? deviceOptions.coarse : deviceOptions.fine))};};
      var root=doc.getElementById('touch-controls'),stick=doc.getElementById('touch-stick');
      doc.getElementById('touch-knob').style={};
      stick.setPointerCapture=function(){};stick.getBoundingClientRect=function(){return {left:0,top:0,width:144,height:144};};
      root.buttons=['fire','boost','up','down','pause','target','weapon'].map(function(name){var b=target();b.getAttribute=function(){return name;};b.setPointerCapture=function(){};b.classList={add:function(){},remove:function(){}};return b;});
      root.querySelectorAll=function(){return root.buttons;};
    }
    controls=window.Driftworks.flightControls.mount(host,{
      isPaused:function(){return paused;},isDead:function(){return dead;},
      pause:function(){counts.pause++;paused=true;controls.clear();controls.release();},
      resume:function(){counts.resume++;paused=false;controls.clear();controls.resetButtons();},
      captureFailure:function(){counts.failure++;paused=true;controls.clear();},
      toggleTargetLock:function(){counts.lock++;},nextWeapon:function(){counts.weapon++;},nextTarget:function(){counts.target++;},nextRadarRange:function(){counts.radar++;},
      toggleDiagnostics:function(){counts.diagnostics++;},togglePerformance:function(){counts.performance++;},selectProfile:function(index){counts.profile=index;}
    },{document:doc,window:win,navigator:{maxTouchPoints:deviceOptions && deviceOptions.touchPoints || 0,getGamepads:function(){return pads;}}});
    function key(code,tag,repeat){var event={code:code,target:{tagName:tag||'BODY'},repeat:!!repeat,preventDefault:function(){this.prevented=true;}};win.emit('keydown',event);return event;}
    return {controls:controls,doc:doc,win:win,host:host,counts:counts,key:key,elements:elements,setPads:function(value){pads=value;},setPaused:function(value){paused=value;},setDead:function(value){dead=value;}};
  }

  test('phone input detection ignores legacy desktop preference and retains explicit phone overrides',function(){
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

  test('touch start requests document fullscreen while desktop start does not',function(){
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

  test('touch flight keeps two pointers independent and releases on cancellation and pause',function(){
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

  test('flight settings follow the player between lab and mission mounts',function(){
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

  test('flight controls leave modified browser and OS shortcuts alone',function(){
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

  test('flight controls retain keyboard focus guards, shortcuts and pause clearing',function(){
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

  test('flight controls preserve pointer capture and fall back to cursor steering',function(){
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

  test('cursor fallback pauses on exit and ignores a late canceled capture failure',function(){
    var f=flightControlsFixture(),reject;
    f.controls.capture();f.doc.emit('mousemove',{clientX:600,clientY:350});assert(f.controls.sample().yaw!==0);
    f.host.emit('mouseleave');assert(f.counts.pause===1&&!f.controls.view().uncapturedMouse&&f.controls.sample().yaw===0);
    f.host.requestPointerLock=function(){return {catch:function(fn){reject=fn;}};};f.controls.capture();
    f.key('Escape');var resumes=f.counts.resume;reject(new Error('late rejection'));
    assert(f.counts.resume===resumes&&!f.controls.view().uncapturedMouse);
  });

  test('paused steering presets preserve all three travel and response combinations',function(){
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

  test('mouse guide follows recent stick movement without noise or held input stealing it back',function(){
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

  test('fresh controller buttons take over from mouse and another idle device',function(){
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

  test('nonstandard joystick throttle axis and increase/decrease buttons can be remapped',function(){
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

  test('flight controls retain controller edges, editable bindings and disconnect pause',function(){
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

  test('flight mixer preserves urgent impacts and ducks only audible comms', function () {
    var api=window.Driftworks.audio._test, mix=api.normalizeMix({});
    assert(mix.engine<mix.impacts && mix.weapons<mix.comms);
    var idle=api.mixLevels(mix,false,false),speech=api.mixLevels(mix,true,false),hit=api.mixLevels(mix,true,true);
    assertClose(speech.engine/idle.engine,.84);
    assert(speech.weapons<idle.weapons);
    assert(hit.engine<speech.engine && hit.impacts===idle.impacts && hit.comms===idle.comms);
    var muted=api.mixLevels(Object.assign({},mix,{comms:0}),true,false);
    assert(muted.engine===idle.engine && muted.weapons===idle.weapons);
    var silentHit=api.mixLevels(Object.assign({},mix,{impacts:0}),false,true);
    assert(silentHit.engine===idle.engine);
    var off=api.mixLevels(Object.assign({},mix,{ducking:false}),true,true);
    assert(off.engine===idle.engine && off.weapons===idle.weapons);
    var repaired=api.normalizeMix({engine:NaN,weapons:4,impacts:-1,comms:Infinity});
    assert(repaired.engine===.55 && repaired.weapons===1 && repaired.impacts===0 && repaired.comms===.85);
  });

  test('engine presets repair invalid values and spool independently of frame rate', function () {
    var engine = window.Driftworks.audio.engine;
    assert(engine.presets.length === 8);
    var repaired = engine.normalize({bass: NaN, pitch: 99, spool: -4, flutter: Infinity});
    assert(repaired.bass === .7 && repaired.pitch === 2 && repaired.spool === .08 && repaired.flutter === 23);
    engine.presets.forEach(function(preset) {
      var tune = engine.normalize(preset.tuning);
      var a = {spool:0, boost:0, ignition:false, active:false};
      var b = {spool:0, boost:0, ignition:false, active:false};
      for(var i=0;i<60;i++) a=engine.step(a,1/60,{throttle:.7},tune);
      for(var j=0;j<30;j++) b=engine.step(b,1/30,{throttle:.7},tune);
      assertClose(a.spool,b.spool);
      assert(a.spool>0 && a.spool<1 && a.boost===0);
      a=engine.step(a,.016,{throttle:1,afterburner:true},tune);assert(a.ignition);
      a=engine.step(a,.016,{throttle:1,afterburner:true},tune);assert(!a.ignition,'Held boost must not retrigger ignition');
      a=engine.step(a,.016,{throttle:0,afterburner:false},tune);
      a=engine.step(a,.016,{throttle:0,afterburner:true},tune);assert(a.ignition);
      a=engine.step(a,0,{throttle:1,active:false},tune);assert(a.spool===0 && a.boost===0 && !a.active);
      var bad=engine.step(a,NaN,{throttle:Infinity},tune);assert(Number.isFinite(bad.spool));
    });
  });

  test('layered engine graph starts once, accepts tuning, and stops every source on disposal', function () {
    var params=[], sources=[], gains=[], filters=[];
    function param() {var p={value:0,setTargetAtTime:function(value){assert(Number.isFinite(value));p.value=value;},setValueAtTime:function(value){assert(Number.isFinite(value));p.value=value;},cancelScheduledValues:function(){},exponentialRampToValueAtTime:function(value){assert(value>0);p.value=value;}};params.push(p);return p;}
    function node() {return {connect:function(next){return next;},disconnect:function(){}};}
    function gain() {var n=node();n.gain=param();gains.push(n);return n;}
    function source() {var n=node();n.frequency=param();n.start=function(){n.started=(n.started||0)+1;};n.stop=function(){n.stopped=(n.stopped||0)+1;};sources.push(n);return n;}
    var ctx={currentTime:0,sampleRate:8000,createGain:gain,createOscillator:source,createBufferSource:source,
      createBiquadFilter:function(){var n=node();n.frequency=param();n.Q=param();n.gain=param();filters.push(n);return n;},
      createDynamicsCompressor:function(){var n=node();['threshold','knee','ratio','attack','release'].forEach(function(k){n[k]=param();});return n;},
      createBuffer:function(ch,length){return {getChannelData:function(){return new Float32Array(length);}};}};
    var voice=window.Driftworks.audio.engine.create(ctx,node());
    assert(sources.length===12 && sources.every(function(s){return s.started===1;}));
    voice.update(.1,{throttle:1,afterburner:true,damage:.8,maneuver:1});
    assert(gains[0].gain.value>0);
    assert(filters[1].frequency.value<800 && filters[2].frequency.value<=1600,'Roar should stay dark even during boost');
    assert(filters[3].type==='peaking' && filters[3].frequency.value===1700 && filters[3].gain.value===-9,'Exhaust must leave space for speech');
    assert(gains[14].gain.value>0 && gains[15].gain.value>0,'Roar should have irregular amplitude and filter motion');
    voice.tune({roar:0});
    voice.update(.1,{throttle:1});
    assert(gains[8].gain.value===0 && gains[14].gain.value===0 && gains[15].gain.value===0,'Roar mute must also mute its modulation');
    voice.tune({roar:.55});
    for(var cruise=0;cruise<100;cruise++)voice.update(.1,{throttle:1,acceleration:0});
    var cruiseNoise=gains[8].gain.value, cruiseAir=gains[10].gain.value;
    assert(gains[16].gain.value>cruiseNoise,'Cruise should emphasize growl over broad noise');
    assert(gains[18].gain.value>gains[1].gain.value*10 && gains[19].gain.value>gains[16].gain.value*8,'Low colored rumble should lead the pitched remnants');
    assert(gains[20].gain.value>0 && gains[21].gain.value>0 && gains[22].gain.value>0 && gains[23].gain.value>0,'Low layers should drift and pulse irregularly');
    voice.tune({bass:0,roar:0});voice.update(.1,{throttle:1,acceleration:0});
    [18,19,20,21,22,23].forEach(function(i){assert(gains[i].gain.value===0,'Low layer mutes must include roughness and modulation');});
    voice.tune({bass:.7,roar:.55});
    for(var accelerating=0;accelerating<5;accelerating++)voice.update(.1,{throttle:1,acceleration:1});
    assert(gains[8].gain.value>cruiseNoise*8 && gains[10].gain.value>cruiseAir*2,'Acceleration should swell roar and air');
    for(var settle=0;settle<100;settle++)voice.update(.1,{throttle:1,acceleration:0});
    assertClose(gains[8].gain.value,cruiseNoise);
    for(var burning=0;burning<5;burning++)voice.update(.1,{throttle:1,acceleration:0,afterburner:true});
    assert(gains[8].gain.value>cruiseNoise*8,'Afterburner should roar even at constant speed');
    assert(sources[2].frequency.value > 330 && sources[3].frequency.value > sources[2].frequency.value*2);
    assert(sources[4].frequency.value > sources[3].frequency.value, 'Turbine partials should be slightly detuned');
    assert(gains[3].gain.value < .01 && gains[10].gain.value > gains[3].gain.value, 'Air should carry the turbine; the pure tone stays subtle');
    voice.tune({whine:0});
    voice.update(.1,{throttle:1});
    [3,4,5,10,11].forEach(function(index){assert(gains[index].gain.value===0,'Whine mute must silence tones, air and drift');});
    voice.tune({bass:0,whine:0,roar:0,texture:0,burner:0,volume:0,perspective:'exterior'});
    voice.update(.1,{throttle:1,afterburner:true});assert(gains[0].gain.value===0 && gains[16].gain.value===0 && gains[17].gain.value===0);
    voice.stop();assert(gains[0].gain.value===0);
    voice.dispose();voice.dispose();
    assert(sources.every(function(s){return s.stopped===1;}),'Disposal must be idempotent');
    voice.update(.1,{throttle:1});assert(gains[0].gain.value===0);
  });

  test('flight engine bass spools up, releases and cuts on pause', function () {
    var audio = Driftworks.audio;
    audio.flightFeedback(0, 0, false, false);
    var cruise = audio.flightFeedback(.016, 1, false, true);
    assert(cruise.load > 0 && cruise.load < 1 && cruise.boost === 0);
    var boost = audio.flightFeedback(.1, 1, true, true);
    assert(boost.load > cruise.load && boost.boost > 0);
    var release = audio.flightFeedback(.016, 0, false, true);
    assert(release.boost < boost.boost && release.boost > 0);
    var stopped = audio.flightFeedback(0, 1, true, false);
    assert(stopped.load === 0 && stopped.boost === 0);
  });

  test('gamepad rumble mixes boost and priority jolts, stops and tolerates unsupported hardware', function () {
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

  test('wormhole haptics are gentle nearby, pulse at crossing, and yield to damage', function(){
    var f=flightControlsFixture(),calls=[];f.elements['input-mode'].value='controller';
    f.setPads([{index:0,id:'Throat pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:[],vibrationActuator:{playEffect:function(type,effect){calls.push(effect);return Promise.resolve('complete');},reset:function(){return Promise.resolve('complete');}}}]);
    f.controls.sample();f.controls.haptics(.1,{throat:1});assert(calls[0].strongMagnitude===.08&&calls[0].weakMagnitude===.14);
    f.controls.haptics(.1,{throat:1,transit:true});assert(calls[1].strongMagnitude===.3);
    f.controls.haptics(.01,{transit:true,hit:true});assert(calls[2].strongMagnitude===.55,'Damage retains priority');
    f.controls.clear();f.elements.rumble.checked=false;f.controls.haptics(.1,{throat:1,transit:true});assert(calls.length===3,'Existing rumble opt-out applies');
  });

  test('mouse takeover stops rumble until fresh controller activity resumes it', function () {
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

  test('asteroid patrol has two hostiles, seeded terrain and no reinforcements', function () {
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

  test('flight session reset replaces sortie state and preserves the environment', function () {
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

  test('flight session operations own size, study starts and the current scenery clock', function () {
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

  test('session target and opponent operations use the current combat after transitions', function () {
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

  test('session combat configuration survives reset and immediate or delayed combat spawning', function () {
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

  test('fresh flight views follow replacements without caller synchronization', function () {
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

  test('flight asteroid spins in simulation time and contact queries use its body frame', function () {
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

  test('manual flight fixed ticks reproduce combat, guns and spin across frame batching', function () {
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

  test('manual flight retains fractional ticks, samples current demand and clears reset time', function () {
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

  test('flight session substeps preserve movement, training, guns, audio and contact order', function () {
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

  test('shared duel ticks preserve damage sampling, no-terrain stepping and terminal gun work', function () {
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

  test('furball pilots keep a varied adult cast across lines and rounds', function () {
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

  test('pilot emotions survive maneuver changes and decay on active flight time', function () {
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

  test('sustained pressure prompts an emotional reply without a tactical order', function () {
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

  test('emotional replies expire and require a living composed teammate', function () {
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

  test('stress accumulates from small hits and blocks cheerful modifiers after damage', function () {
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

  test('stress thresholds have hysteresis and recovery is independent of frame size', function () {
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

  test('combat outcomes set frustration, confidence, confusion and relief', function () {
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

  test('emotions shape synthetic delivery while retaining the pilot voice', function () {
    var api=window.Driftworks.flightComms,mumble=window.Driftworks.mumble,base=mumble.presets.Scout;
    var afraid=api.voiceOptions(base,{current:'afraid',intensity:1});
    var panic=api.voiceOptions(base,{current:'panicked',intensity:1});
    var steady=api.voiceOptions(base,{current:'reassuring',intensity:1});
    assert(afraid.pitch>base.pitch&&afraid.speed>base.speed&&afraid.tremor>0);
    assert(panic.variation>afraid.variation&&steady.speed<base.speed);
    assert(afraid.resonance===base.resonance&&base.pitch===210);
    [afraid,panic,steady].forEach(function(v){
      var plan=mumble.analyze('Stay with me.',v),pcm=mumble.render(plan,8000);
      assert(plan.duration>0&&pcm.length>0&&pcm.every(Number.isFinite));
    });
  });

  test('comms observes frozen gameplay through contacts, damage, losses and lifecycle changes', function () {
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

  test('enabling comms leaves live simulation state and subsequent ticks identical', function () {
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

  test('flight comms spaces lines and uses living combatants', function () {
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

  test('flight comms reacts to transitions after two quiet seconds without stale calls', function () {
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

  test('flight comms prioritizes distress and checks tail geometry', function () {
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

  test('flight comms varies gaps and describes firing and target changes', function () {
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

  test('player-directed rival taunts beat routine chatter without waiting for ambient silence', function () {
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

  test('enemy comms only broadcasts taunts despite maneuvers, damage and emotions', function () {
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

  test('flight comms balances activities instead of counting pilots', function () {
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

  test('flight comms answers cover requests only when a wingmate is helping', function () {
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

  test('replies outrank urgent calls, bypass cooldowns and expire on a busy channel', function () {
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

  test('flight comms cancels cover exchanges when the fight changes', function () {
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

  test('radio templates speak dynamic numbers and keep singular remaining calls accurate', function () {
    var api=window.Driftworks.flightComms;
    assert(api.numberWords(70)==='seventy' && api.numberWords(125)==='one hundred twenty five');
    assert(api.numberWords(Infinity)==='zero');
    assert(api.compose('loss',{pilot:'Four',count:4})[0]==='We lost Four!');
    assert(api.compose('closing',{pilot:'Nine',speed:70})[0]==='Nine closing at seventy meters per second.');
    assert(api.compose('remaining',{count:5}).every(function(t){return t.indexOf('One left')<0 && t.indexOf('five')>=0;}));
    assert(api.compose('remaining',{count:1})[0].indexOf('One left')===0);
  });

  test('training records attributed deaths once and real shield depletion', function () {
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

  test('training near misses use clipped projectile segments and throttle repeat reports', function () {
    var ai=window.Driftworks.training,t=ai.create(),U=sim.METERS_PER_UNIT,player={eye:[0,20/U,0]},bolt={weapon:{damage:1,armorFactor:1,shieldFactor:1}};
    ai.trace(t,[-50/U,0,0],[50/U,0,0],bolt,'enemy',null,player);
    assert(t.radioEvents.length===1 && t.radioEvents[0].kind==='near');
    ai.trace(t,[-50/U,0,0],[50/U,0,0],bolt,'enemy',null,player);assert(t.radioEvents.length===1);
    t.time=7;
    ai.trace(t,[-50/U,0,0],[50/U,0,0],bolt,'enemy',function(){return [-45/U,0,0];},player);
    assert(t.radioEvents.length===1); // Rock intercepts the bolt before its close pass.
  });

  test('radio announces losses from surviving witnesses and expires facts across waves', function () {
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

  test('radio tracks kill praise, player streaks and changing force counts', function () {
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

  test('radio observes hull vulnerability, shaken pursuit and actual closing speed', function () {
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

  test('radio only calls a firing pass missed when the target took no damage', function () {
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

  test('radio discards obsolete shield and remaining-count facts', function () {
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

  test('contact reports use player-relative clock directions and rounded SI ranges', function () {
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

  test('contact acquisition refreshes bearing before speech and prevents duplicate reports', function () {
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

  test('comms speaker highlight follows transmission lifetime, mute, pause and reset', function () {
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

  test('radio routes into the shared mixer and clears ducking on end, mute and pause', function () {
    var DW=window.Driftworks, oldChannel=DW.audio.commsChannel, oldActive=DW.audio.setCommsActive;
    var oldRender=DW.mumble.render, oldTransmit=DW.mumble.transmit, sources=[], activity=[], output={};
    var context={state:'running',createBuffer:function(){return {copyToChannel:function(){}};},
      createBufferSource:function(){var source={connect:function(dest){assert(dest===output);},disconnect:function(){},start:function(){},stop:function(){},onended:null};sources.push(source);return source;}};
    DW.audio.commsChannel=function(){return {context:context,output:output};};
    DW.audio.setCommsActive=function(active){activity.push(active);};
    DW.mumble.render=function(){return new Float32Array(16);};
    DW.mumble.transmit=function(){return {samples:new Float32Array(16),duration:.1};};
    try {
      var fields=[{textContent:''},{textContent:''}],toggle={setAttribute:function(){}};
      var panel={querySelector:function(s){return s==='[data-speaker]'?fields[0]:fields[1];},classList:{add:function(){},remove:function(){},toggle:function(){}}};
      var radio=DW.flightComms.mount(panel,toggle),pilot={id:'wing',index:0,team:'ally',mode:'approach',hp:90};
      var combat={enabled:true,dead:false,hull:100,enemies:[pilot]};
      radio.unlock();radio.update(0,combat);pilot.mode='evade';radio.update(0,combat);
      assert(sources.length===1 && activity[activity.length-1]===true);
      sources[0].onended();assert(activity[activity.length-1]===false);
      radio.reset();pilot.mode='approach';radio.update(0,combat);pilot.mode='evade';radio.update(0,combat);
      assert(activity[activity.length-1]===true);
      toggle.onclick();assert(activity[activity.length-1]===false);
      radio.pause();assert(activity[activity.length-1]===false);
    } finally {DW.audio.commsChannel=oldChannel;DW.audio.setCommsActive=oldActive;DW.mumble.render=oldRender;DW.mumble.transmit=oldTransmit;}
  });

  test('radio waits for actual playback and a full silent gap before another transmission', function () {
    var DW=window.Driftworks, oldChannel=DW.audio.commsChannel, oldStep=DW.flightComms.step;
    var oldRender=DW.mumble.render, oldTransmit=DW.mumble.transmit, sources=[], clock, busy;
    var context={state:'running',createBuffer:function(){return {copyToChannel:function(){}};},
      createBufferSource:function(){var source={connect:function(){},disconnect:function(){},start:function(){},stop:function(){},onended:null};sources.push(source);return source;}};
    DW.audio.commsChannel=function(){return {context:context,output:{}};};
    DW.mumble.render=function(){return new Float32Array(16);};
    DW.mumble.transmit=function(){return {samples:new Float32Array(16),duration:.1};};
    DW.flightComms.step=function(state,dt,combat,occupied,random,player){clock=state;busy=occupied;return oldStep(state,dt,combat,occupied,function(){return 0;},player);};
    try {
      var fields=[{textContent:''},{textContent:''}],panel={querySelector:function(s){return s==='[data-speaker]'?fields[0]:fields[1];},classList:{add:function(){},remove:function(){},toggle:function(){}}};
      var radio=DW.flightComms.mount(panel,{setAttribute:function(){}}), pilot={id:'w',team:'ally',hp:90,mode:'approach'};
      var combat={enabled:true,hull:100,enemies:[pilot]};
      radio.unlock();radio.update(0,combat);pilot.mode='evade';radio.update(0,combat);
      assert(sources.length===1);
      var ended=sources[0].onended;
      radio.update(20,combat);assert(busy && sources.length===1 && clock.quiet===0);
      ended();clock.wait=0;
      radio.update(1.99,combat);assert(sources.length===1);
      radio.update(.02,combat);assert(sources.length===2);
      ended();radio.update(20,combat);
      assert(busy && sources.length===2,'Old completion must not release the new source');
      sources[1].onended();radio.pause();
    } finally {DW.audio.commsChannel=oldChannel;DW.flightComms.step=oldStep;DW.mumble.render=oldRender;DW.mumble.transmit=oldTransmit;}
  });

  test('flight comms retains a bounded newest-first subtitle history', function () {
    var items=[],history={children:items,ownerDocument:{createElement:function(){return {textContent:''};}},prepend:function(item){items.unshift(item);}};
    Object.defineProperty(history,'lastElementChild',{get:function(){return {remove:function(){items.pop();}};}});
    var fields=[{textContent:''},{textContent:''}],panel={ownerDocument:{getElementById:function(){return history;}},querySelector:function(s){return s==='[data-speaker]'?fields[0]:fields[1];},classList:{add:function(){},remove:function(){},toggle:function(){}}};
    var radio=window.Driftworks.flightComms.mount(panel,{setAttribute:function(){}}),pilot={id:'wing',index:0,team:'ally',mode:'approach',hp:90},combat={enabled:true,dead:false,hull:100,enemies:[pilot]};
    for(var i=0;i<15;i++){radio.reset();pilot.mode='approach';radio.update(0,combat);pilot.mode='evade';radio.update(0,combat);}
    assert(items.length===12);assert(items[0].textContent.indexOf(fields[1].textContent)>=0);
  });

  test('a new mission overrides shared encounter, spawn, units and chatter without Ohio branches', function () {
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

  test('Ohio forms of address use bud, neighbor and hotshot while preserving real names', function () {
    var api=window.Driftworks.flightDialogue;
    var near=api.compose('nearPlayer',{},true);
    assert(near[0].indexOf('bud')>=0&&near[1].indexOf('neighbor')>=0);
    assert(api.ohioAddress('That all you have, pilot?',0,true)==='That all you have, hotshot?');
    assert(api.ohioAddress('Pilot, watch it.',1)==='Neighbor, watch it.');
    assert(api.ohioAddress('Nice shooting, {pilot}!',0)==='Nice shooting, {pilot}!');
    assert(api.compose('kill',{pilot:'Aunt Barb'},true).some(function(text){return text.indexOf('Aunt Barb')>=0;}));
    assert(api.compose('nearPlayer',{}).some(function(text){return /pilot/.test(text);}));
  });

  test('Ohio radio converts measured ranges and speeds to yards without changing source data', function () {
    var api=window.Driftworks.flightDialogue, data={range:1000,bearing:'three oclock',direction:'right',height:'',speed:100,pilot:'Big Dale'};
    assert(api.compose('contact',data,true).every(function(text){return /one thousand one hundred yards/.test(text)&&!/meters/.test(text);}));
    assert(api.compose('closing',data,true).every(function(text){return /two hundred twenty miles per hour/.test(text);}));
    assert(api.compose('contact',data).every(function(text){return /one thousand meters/.test(text);}));
    assert(data.range===1000&&data.speed===100);
  });

  test('Ohio generic shooting reports do not summon an unrelated neighbor', function () {
    var api=window.Driftworks.flightComms,clock=api.create(),rng=function(){return 0;};
    var barb={id:'barb',callsign:'Aunt Barb',index:3,team:'ally',hp:90,mode:'attack',fire:false};
    var dale={id:'dale',callsign:'Big Dale',index:6,team:'ally',hp:90,mode:'approach'};
    var combat={mode:'ohio',openingStep:3,enabled:true,hull:100,enemies:[barb,dale]};
    api.step(clock,0,combat,true,rng);clock.wait=0;clock.quiet=0;barb.fire=true;
    var line=api.step(clock,4,combat,false,rng);
    assert(line&&line.event==='firing');
    assert(!line.replyTo&&!/Big Dale|Aunt Barb/.test(line.text));
  });

  test('Ohio pilots address real neighbors and complete named cover exchanges', function () {
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

  test('Ohio social chatter never addresses self or a dead neighbor and uses real pilot voices', function () {
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

  test('Ohio chatter uses actual transmitted text for repeat avoidance', function () {
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

  test('Ohio barn launch follows the supported deck and asteroid rotation with cached terrain queries', function () {
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

  test('Ohio reveal gates combat, respects occupied radio, and retains its cast across waves', function () {
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

  test('flight callsigns are unique, stable across waves, and shared by comms', function () {
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

  test('target camera centers a copy, fits hull bounds and caps redraws', function () {
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

  test('speaker halo draws a white outline with contrast underlay', function () {
    var strokes=[],saved=0,ctx={save:function(){saved++;},restore:function(){saved--;},setLineDash:function(){},beginPath:function(){},arc:function(x,y,r){assert(x===5&&y===9&&r===10);},stroke:function(){strokes.push([this.strokeStyle,this.lineWidth]);}};
    window.Driftworks.flightRadar.speakerHalo(ctx,5,9,10);
    assert(saved===0&&strokes.length===2);
    assert(strokes[0][1]===4 && strokes[1][0]==='rgba(255,255,255,.95)' && strokes[1][1]===2);
  });

  test('radio prefers unheard lines, then older and less frequent lines', function () {
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

  test('radio remembers template delivery across changing names and counts', function () {
    var api=window.Driftworks.flightComms,clock=api.create(),rng=function(){return 0;};
    assert(api.pickLine(clock,api.compose('loss',{pilot:'Four',count:1}),rng)==='We lost Four!');
    var second=api.pickLine(clock,api.compose('loss',{pilot:'Five',count:2}),rng);
    assert(second==='Five is gone. Stay together!');
    var third=api.pickLine(clock,api.compose('loss',{pilot:'Six',count:3}),rng);
    assert(third==='We have lost three. Keep your eyes open.');
  });

  test('flight radar uses player basis, meters, spherical range and altitude', function(){
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

  test('mumble produces deterministic syllables, pauses, and finite bounded audio', function () {
    var api = window.Driftworks.mumble, line = 'Stay close, pilot! Ready?', plan = api.analyze(line, {seed: 42});
    assert(JSON.stringify(plan) === JSON.stringify(api.analyze(line, {seed: 42})));
    assert(JSON.stringify(plan) !== JSON.stringify(api.analyze(line, {seed: 43})));
    assert(plan.events.some(function(e) { return e.kind === 'pause' && e.duration >= 0.12; }));
    var end = 0;
    plan.events.forEach(function(e) { assert(e.start >= end - 0.000001); assert(e.duration > 0); assert(e.to > e.from && e.to <= line.length); end = e.start + e.duration; });
    var a = api.render(plan, 8000), b = api.render(plan, 8000), peak = 0;
    assert(a.length === Math.ceil(plan.duration * 8000));
    a.forEach(function(value, i) { assert(Number.isFinite(value) && Math.abs(value) <= 1); assert(value === b[i]); peak = Math.max(peak, Math.abs(value)); }); assert(peak > 0.01);
    assert(api.analyze(line, {speed: 2}).duration < plan.duration);
    assert(api.render(api.analyze('')).length === 0);
    assert(api.analyze('x'.repeat(900)).text.length === 600);
    assert(api.analyze('Hello', {pitch: NaN, speed: -1}).duration > 0);
    var muted = api.render(api.analyze('Quiet!', {volume: 0})); assert(muted.every(function(v) { return v === 0; }));
    assert(api.analyze('你好, pilot 👋').events.length > 0);
  });
  test('retired radio color does not alter synthesized speech', function () {
    var api = window.Driftworks.mumble, clean = api.render(api.analyze('Ready, pilot!', {seed: 42}), 8000);
    var legacy = api.render(api.analyze('Ready, pilot!', {seed: 42, radio: 1}), 8000);
    assert(clean.length === legacy.length);
    assert(clean.every(function (value, i) { return value === legacy[i]; }));
  });
  test('low enunciation compresses syllables and preserves complete text coverage', function () {
    var api = window.Driftworks.mumble, text = 'Navigation communication, ready?', clear = api.analyze(text, {enunciation: 1, compactWords:false}), loose = api.analyze(text, {enunciation: 0, compactWords:false});
    assert(loose.duration < clear.duration * 0.8);
    assert(loose.events.length < clear.events.length);
    var offset = 0;
    loose.events.forEach(function(e) { assert(e.from === offset); offset = e.to; });
    assert(offset === text.length);
    assert(loose.voice.pitch === clear.voice.pitch);
    assert(JSON.stringify(loose) === JSON.stringify(api.analyze(text, {enunciation: 0, compactWords:false})));
    assert(api.analyze(text, {enunciation: NaN}).voice.enunciation === api.defaults.enunciation);
    var pcm = api.render(loose, 8000);
    assert(pcm.some(function(v) { return v !== 0; }));
    assert(pcm.every(function(v) { return Number.isFinite(v) && Math.abs(v) <= 1; }));
  });

  test('sound retention drops actual interior sounds without charging their duration', function () {
    var api = window.Driftworks.mumble, text = 'communication';
    var full = api.analyze(text, {enunciation: 1, compactWords:false}), short = api.analyze(text, {enunciation: 0.35, compactWords:false});
    var a = full.events.filter(function(e) { return e.kind === 'syllable'; });
    var b = short.events.filter(function(e) { return e.kind === 'syllable'; });
    assert(b.length < a.length);
    assert(b[0].sourceFrom === a[0].sourceFrom);
    assert(b[b.length - 1].sourceTo === a[a.length - 1].sourceTo);
    assert(b.some(function(e) { return e.to - e.from > e.sourceTo - e.sourceFrom; }));
    b.forEach(function(e) { assert(a.some(function(original) { return original.sourceFrom === e.sourceFrom && original.sourceTo === e.sourceTo && original.vowel === e.vowel; })); });
    assert(short.duration < full.duration * 0.65);
    assert(api.analyze(text, {enunciation: 0}).events.every(function(e) { return !e.attack; }));
    var line = api.analyze('Navigation communication asteroid approaching the perimeter.', {enunciation: 0.35});
    assert(line.duration < 6 * 60 / 240, 'default reduced speech should fit a 240-word/minute reading budget for this line');
  });

  test('field has a moving vowel and consonant closure rather than a held beep', function () {
    var api = window.Driftworks.mumble, plan = api.analyze('field', api.presets.Scout), event = plan.events[0];
    assert(event.vowel === 'i' && event.vowelEnd === 'e' && event.closed);
    var samples = api.render(plan, 8000, {style:'original'});
    var staticPlan = JSON.parse(JSON.stringify(plan)); staticPlan.events[0].vowelEnd = 'i'; staticPlan.events[0].closed = false;
    var staticSamples = api.render(staticPlan, 8000, {style:'original'});
    assert(samples.some(function(v, i) { return Math.abs(v - staticSamples[i]) > 0.01; }));
    assert(samples.every(function(v) { return Number.isFinite(v) && Math.abs(v) <= 1; }));
  });

  test('mumble pitch travels through phrases and inside syllables without resetting at words', function () {
    var api = window.Driftworks.mumble, plan = api.analyze('Keep your eyes on that asteroid field!', api.presets.Scout);
    var notes = plan.events.filter(function(e) { return e.kind === 'syllable'; });
    assert(notes.every(function(e) { return e.pitchCurve.length === 3 && e.pitchCurve.every(function(p) { return Number.isFinite(p) && p > 0; }); }));
    assert(notes.every(function(e) { return Math.max.apply(null, e.pitchCurve) - Math.min.apply(null, e.pitchCurve) > 0.01; }));
    var rises = false, falls = false;
    notes.forEach(function(e) { if (e.pitchCurve[2] > e.pitchCurve[0]) rises = true; else falls = true; });
    assert(rises && falls);
    for (var n = 1; n < notes.length; n++) assert(Math.abs(Math.log2(notes[n].pitchCurve[0] / notes[n-1].pitchCurve[2])) < 0.04);
    var question = api.analyze('Ready?').events[0], statement = api.analyze('Ready.').events[0];
    assert(question.pitchCurve[2] > statement.pitchCurve[2]);
    assert(api.analyze('Oh!').events[0].pitchCurve[0] !== api.analyze('Oh!').events[0].pitchCurve[2]);
  });

  test('flowing vowel comparison overlaps only nearby syllables without changing the plan', function () {
    var api = window.Driftworks.mumble, plan = api.analyze('Keep your eyes. Field!', api.presets.Scout), original = JSON.stringify(plan);
    var a = api.render(plan, 8000), b = api.render(plan, 8000, {style: 'flowing'}), again = api.render(plan, 8000, {style: 'flowing'});
    assert(JSON.stringify(plan) === original && a.length === b.length);
    assert(b.some(function(v, i) { return Math.abs(v - a[i]) > 0.01; }));
    assert(b.every(function(v, i) { return Number.isFinite(v) && Math.abs(v) <= 1 && v === again[i]; }));
    var changed = JSON.parse(original); changed.events.forEach(function(e) { e.attack = !e.attack; e.closed = !e.closed; });
    var noConsonants = api.render(changed, 8000, {style: 'flowing'});
    assert(b.every(function(v, i) { return v === noConsonants[i]; }));
    var first = plan.events[0], gap = Math.floor((first.start + first.duration + 0.002) * 8000);
    assert(a[gap] === 0 && Math.abs(b[gap]) > 0.000001);
    var stop = plan.events.find(function(e) { return plan.text.slice(e.from,e.to) === '.'; });
    assert(b[Math.floor((stop.start + 0.06) * 8000)] === 0);
  });

  test('popping vowel groups keep word signatures without held vowels', function () {
    var api = window.Driftworks.mumble;
    ['cool', 'meet', 'field', 'wait', 'out', 'cat'].forEach(function(text) {
      var plan = api.analyze(text, {enunciation: 1, speed: 0.5}), original = JSON.stringify(plan);
      var a = api.render(plan, 8000), b = api.render(plan, 8000, {style:'vowel-groups'});
      assert(a.length === b.length && JSON.stringify(plan) === original);
      assert(b.some(function(v) { return Math.abs(v) > 0.01; }));
      plan.events.filter(function(e) { return e.kind === 'syllable'; }).forEach(function(e) {
        var end = Math.floor(e.start * 8000) + Math.floor(Math.min(e.duration * 0.72, 0.075) * 8000);
        var next = Math.floor((e.start + e.duration) * 8000);
        assert(b.slice(end, next).every(function(v) { return v === 0; }), 'every vowel must release early, including at slow rates');
      });
      assert(b.every(function(v) { return Number.isFinite(v) && Math.abs(v) <= 1; }));
      var again = api.render(plan, 8000, {style:'vowel-groups'}); assert(b.every(function(v,i) { return v === again[i]; }));
    });
    var plan = api.analyze('cool', {enunciation:1}), changed = JSON.parse(JSON.stringify(plan));
    changed.text = 'caal';
    var oo = api.render(plan,8000,{style:'vowel-groups'}), aa = api.render(changed,8000,{style:'vowel-groups'});
    assert(oo.some(function(v,i) { return Math.abs(v-aa[i]) > 0.01; }), 'vowel spelling still changes timbre');
  });

  test('tighter mumble pauses shorten phrases without lengthening or compressing vowel bursts', function () {
    var api = window.Driftworks.mumble, text = 'Keep cool. Wait, scout!', a = api.analyze(text, {compactWords:false}), b = api.analyze(text, {pauseScale:0.45, compactWords:false});
    assert(b.duration < a.duration);
    assert(b.events.length === a.events.length);
    b.events.forEach(function(e,i) {
      var old = a.events[i]; assert(e.from === old.from && e.to === old.to);
      if (e.kind === 'syllable') assertClose(e.duration,old.duration);
      else { assert(e.duration > 0); assertClose(e.duration,old.duration*0.45); }
      if (i) assert(e.start >= b.events[i-1].start+b.events[i-1].duration-0.000001);
    });
    var pcm = api.render(b,8000,{style:'vowel-groups'});
    assert(pcm.length === Math.ceil(b.duration*8000));
    assert(pcm.every(function(v) { return Number.isFinite(v) && Math.abs(v)<=1; }));
  });

  test('compact word rhythm varies onsets while preserving sentence pauses', function () {
    var api = window.Driftworks.mumble, text = 'Keep your eyes on that asteroid field! Wait, scout.', a = api.analyze(text,{compactWords:false}), b = api.analyze(text,{compactWords:true});
    assert(b.duration < a.duration);
    b.events.forEach(function(e,i) {
      if (e.kind === 'pause') {
        if (text.slice(e.from,e.to) === ',') assertClose(e.duration,a.events[i].duration*0.4);
        else if (/[.!?;]/.test(text.slice(e.from,e.to))) assertClose(e.duration,a.events[i].duration);
        else assert(e.duration < a.events[i].duration);
      }
    });
    var notes = b.events.filter(function(e) { return e.kind === 'syllable'; });
    assert(new Set(notes.map(function(e) { return e.duration.toFixed(3); })).size > 4);
    assert(JSON.stringify(b) === JSON.stringify(api.analyze(text,{compactWords:true})));
    var pcm = api.render(b,8000,{style:'vowel-groups'}); assert(pcm.every(function(v) { return Number.isFinite(v) && Math.abs(v)<=1; }));
  });

  test('mumble defaults lock in popping vowels and compact word rhythm', function () {
    var api = window.Driftworks.mumble, plan = api.analyze('Keep cool, scout!');
    assert(plan.voice.compactWords === true);
    var defaults = api.render(plan,8000), explicit = api.render(plan,8000,{style:'vowel-groups'});
    assert(defaults.every(function(v,i) { return v === explicit[i]; }));
    assert(JSON.stringify(plan) === JSON.stringify(api.analyze('Keep cool, scout!',{compactWords:true})));
  });

  test('voice character controls independently affect audio and repair old plans', function () {
    var api = window.Driftworks.mumble, text = 'Keep cool, pilot!', base = api.render(api.analyze(text),8000);
    ['formant1','formant2','formant3','brightness','nasality','creak','clipping','contour'].forEach(function(key) {
      var options = {}; options[key] = key.indexOf('formant') === 0 ? 1.3 : 1;
      var plan = api.analyze(text,options), pcm = api.render(plan,8000);
      assert(pcm.every(function(v) { return Number.isFinite(v) && Math.abs(v)<=1; }));
      assert(pcm.some(function(v,i) { return Math.abs(v-base[i])>0.001; }),key);
      var again = api.render(plan,8000); assert(pcm.every(function(v,i) { return v === again[i]; }));
      options[key] = NaN; assert(api.analyze(text,options).voice[key] === api.defaults[key]);
      options[key] = 100; assert(api.analyze(text,options).voice[key] === (key.indexOf('formant') === 0 ? 1.3 : 1));
    });
    var old = api.analyze(text);
    ['formant1','formant2','formant3','brightness','nasality','creak','clipping','contour'].forEach(function(key) { delete old.voice[key]; });
    assert(api.render(old,8000).every(function(v,i) { return v === base[i]; }));
    var flat = api.analyze(text,{variation:0,contour:0});
    assert(flat.events.filter(function(e) { return e.kind === 'syllable'; }).every(function(e) { return e.pitchCurve.every(function(p) { return p === 150; }); }));
  });

  test('all voice presets match output level while volume scales and mute stays silent', function () {
    var api = window.Driftworks.mumble;
    function rms(pcm) { return Math.sqrt(pcm.reduce(function(sum,v) { return sum+v*v; },0)/pcm.length); }
    ['Keep cool, pilot!', "We've got company. Keep your eyes on that asteroid field!"].forEach(function(line) {
      Object.keys(api.presets).forEach(function(name) {
        var options = Object.assign({},api.presets[name],{volume:0.65});
        var pcm = api.render(api.analyze(line,options),22050);
        assert(Math.abs(rms(pcm)-0.12*0.65)<0.00001, name+' matched RMS');
        options.volume = 0.325;
        var quiet = api.render(api.analyze(line,options),22050);
        assert(Math.abs(rms(quiet)/rms(pcm)-0.5)<0.00001, name+' volume scales');
        assert(pcm.every(function(v) { return Number.isFinite(v) && Math.abs(v)<=0.95*0.65+0.00001; }));
      });
    });
  });

  test('study voices keep comparable levels and nasal bursts retain most of their duration', function () {
    var api = window.Driftworks.mumble, line = "We've got company. Keep your eyes on that asteroid field!";
    var levels = ['Study · dark smooth','Study · nasal clipped','Study · raspy creak'].map(function(name) {
      var pcm = api.render(api.analyze(line,api.presets[name]),22050);
      return Math.sqrt(pcm.reduce(function(sum,v) { return sum + v*v; },0)/pcm.length);
    });
    assert(Math.max.apply(null,levels)/Math.min.apply(null,levels) < 2, 'study levels within 6 dB');
    var preset = api.presets['Study · nasal clipped'];
    var plan = api.analyze('Hello',preset), pcm = api.render(plan,22050);
    var event = plan.events[0], last = 0;
    pcm.forEach(function(v,i) { if (Math.abs(v)>0.000001) last=i; });
    assert(last/22050 > Math.min(event.duration*0.72,0.075)*0.85, 'nasal gesture keeps at least 85% of its base burst');
  });

  test('expanded mumble cast renders distinct bounded voices with optional deterministic tremor', function () {
    var api = window.Driftworks.mumble;
    ['Child','Woman · warm','Woman · bright','Old woman','Old man','Man · baritone','Pirate','Ship computer'].forEach(function(name) {
      assert(api.presets[name]);
      var plan = api.analyze('Hello, pilot!',api.presets[name]), pcm = api.render(plan,8000);
      assert(pcm.some(function(v) { return v !== 0; }));
      assert(pcm.every(function(v) { return Number.isFinite(v) && Math.abs(v)<=1; }));
      assert(plan.voice.compactWords);
    });
    var old = api.analyze('Welcome home.',api.presets['Old woman']), dry = JSON.parse(JSON.stringify(old)); dry.voice.tremor = 0;
    var a = api.render(old,8000), b = api.render(dry,8000), again = api.render(old,8000);
    assert(a.some(function(v,i) { return Math.abs(v-b[i])>0.01; }));
    assert(a.every(function(v,i) { return v === again[i]; }));
    assert(api.analyze('Hi',{tremor:NaN}).voice.tremor === 0);
    assert(api.analyze('Hi',{tremor:10}).voice.tremor === 1);
    assert(api.presets.Child.resonance > api.presets['Man · baritone'].resonance);
  });

  test('radio transmission adds deterministic bookends and quiet static without changing local speech', function () {
    var api = window.Driftworks.mumble, pcm = api.render(api.analyze('Hello, pilot!'),8000), original = Array.from(pcm);
    var local = api.transmit(pcm,8000,{mode:'local'}), radio = api.transmit(pcm,8000,{mode:'radio',seed:9,volume:0.6});
    assert(local.samples === pcm && local.speechOffset === 0);
    assertClose(radio.speechOffset,0.16); assert(radio.samples.length === pcm.length+3200);
    assert(radio.samples.slice(0,1280).some(function(v) { return Math.abs(v)>0.001; }));
    assert(radio.samples.slice(1280+pcm.length).some(function(v) { return Math.abs(v)>0.001; }));
    assert(radio.samples[0] === 0 && radio.samples[radio.samples.length-1] === 0);
    var again = api.transmit(pcm,8000,{mode:'radio',seed:9,volume:0.6});
    assert(radio.samples.every(function(v,i) { return v===again.samples[i] && Number.isFinite(v) && Math.abs(v)<=1; }));
    assert(pcm.every(function(v,i) { return v===original[i]; }));
    var silent = api.transmit(new Float32Array(800),8000,{mode:'radio',volume:0}); assert(silent.samples.every(function(v) { return v===0; }));
    assert(api.transmit(new Float32Array(0),8000,{mode:'radio'}).samples.length===0);
  });

  test('radio effects level makes squelch and static adjustable independently of voice', function () {
    var api = window.Driftworks.mumble, pcm = api.render(api.analyze('Hello!'),8000);
    var off = api.transmit(pcm,8000,{mode:'radio',effects:0}), on = api.transmit(pcm,8000,{mode:'radio',effects:1});
    assert(off.samples.slice(0,1280).every(function(v) { return v===0; }));
    assert(on.samples.slice(0,1280).some(function(v) { return Math.abs(v)>0.05; }));
    var bed = api.transmit(new Float32Array(8000),8000,{mode:'radio',effects:1}), energy = 0;
    bed.samples.slice(1000,7000).forEach(function(v) { energy+=v*v; });
    assert(Math.sqrt(energy/6000)>0.01);
    assert(api.transmit(pcm,8000,{mode:'local',effects:1}).samples===pcm);
  });

  test('radio latches vary by take and intermittent static preserves timing and effects controls', function () {
    var api=window.Driftworks.mumble,rate=8000,pcm=new Float32Array(rate*12);
    var a=api.transmit(pcm,rate,{mode:'radio',seed:42}),again=api.transmit(pcm,rate,{mode:'radio',seed:42});
    var b=api.transmit(pcm,rate,{mode:'radio',seed:43}),bed=api.transmit(pcm,rate,{mode:'radio',seed:42,staticBursts:false});
    assert(a.samples.every(function(v,i){return Number.isFinite(v)&&v===again.samples[i];}));
    assert(a.samples.slice(0,1280).some(function(v,i){return Math.abs(v-b.samples[i])>0.01;}));
    var changed=0,unchanged=0;
    for(var i=1280;i<1280+pcm.length;i++) {
      if(Math.abs(a.samples[i]-bed.samples[i])>0.000001)changed++;else unchanged++;
    }
    assert(unchanged>pcm.length*0.7,'static remains intermittent');
    var cleanTakes=0,noisyTakes=0;
    for(var seed=0;seed<12;seed++) {
      var take=api.transmit(pcm,rate,{mode:'radio',seed:seed}),quiet=api.transmit(pcm,rate,{mode:'radio',seed:seed,staticBursts:false});
      if(take.samples.some(function(v,i){return v!==quiet.samples[i];}))noisyTakes++;else cleanTakes++;
    }
    assert(cleanTakes>0&&noisyTakes>0,'some entire takes stay free of static bursts');
    assert(a.speechOffset===bed.speechOffset&&a.duration===bed.duration);
    assert(api.transmit(pcm,rate,{mode:'radio',effects:0,seed:42}).samples.every(function(v){return v===0;}));
  });

  test('radio carrier hangs after speech before the closing latch', function () {
    var api=window.Driftworks.mumble, rate=8000, pcm=new Float32Array(rate/2), result=api.transmit(pcm,rate,{mode:'radio',effects:1});
    var start=Math.round(result.speechOffset*rate)+pcm.length, energy=0;
    result.samples.slice(start+160,start+800).forEach(function(v) { energy+=v*v; });
    assert(Math.sqrt(energy/640)>0.015, 'audible carrier must persist through the post-speech beat');
    assert(result.samples.length-start===1920);
    assert(result.samples[result.samples.length-1]===0);
  });

  test('radio closes after the last voiced burst instead of waiting for final punctuation', function () {
    var api=window.Driftworks.mumble, plan=api.analyze('Wait outside, scout!'), pcm=api.render(plan,8000);
    var last=plan.events.filter(function(e) { return e.kind==='syllable'; }).pop();
    var speechDuration=last.start+Math.min(last.duration*0.72,0.075);
    var radio=api.transmit(pcm,8000,{mode:'radio',speechDuration:speechDuration});
    assert(speechDuration < plan.duration-0.1);
    assert(radio.samples.length === Math.ceil(speechDuration*8000)+3200);
    assert(api.transmit(pcm,8000,{mode:'local',speechDuration:speechDuration}).samples === pcm);
  });

  test('Scout exclamations retain energy without a steep final pitch drop', function () {
    var api = window.Driftworks.mumble;
    [0, 7, 42, 99].forEach(function(seed) {
      var plan = api.analyze("We've got company. Keep your eyes on that asteroid field!", Object.assign({}, api.presets.Scout, {seed: seed}));
      var notes = plan.events.filter(function(e) { return e.kind === 'syllable'; });
      assert(notes[notes.length - 1].pitch >= notes[notes.length - 2].pitch * 0.95);
    });
    var flat = api.analyze('Ready', {variation: 0}), question = api.analyze('Ready?', {variation: 0});
    assert(question.events[0].pitch > flat.events[0].pitch);
  });

  var createFreshWorld = sim.createInitialWorld;
  test('imported ship libraries retain distinct provenance and bounded valid geometry', function(){
    var packs=window.Driftworks.shipPacks.filter(function(pack){return !pack.missionOnly&&pack.id!=='concept-trio';}),ids={};assert(packs.length===1);assert(packs[0].id==='quaternius-ultimate-spaceships');assert(packs[0].models.length===11);
    packs.forEach(function(pack){assert(pack.license==='CC0-1.0');assert(pack.url.indexOf('https://')===0);pack.models.forEach(function(m){assert(!ids[m.id]);ids[m.id]=true;assert(m.id.indexOf(pack.id+':')===0);assert(m.sha256.length===64);assert(m.vertices.length===m.triangles*18);for(var i=0;i<m.vertices.length;i+=6){assert(Math.hypot.apply(null,m.vertices.slice(i,i+3))<=8.50001);assertClose(Math.hypot.apply(null,m.vertices.slice(i+3,i+6)),1,.00001);}});});
    assert(window.Driftworks.shipPackModels.find('missing')===null);
  });
  test('Quaternius glTF previews preserve UVs, source normals and bounded geometry',function(){
    window.Driftworks.shipPacks[0].models.forEach(function(m){
      var v=m.texturedVertices;assert(v.length%24===0);assert(v.length>=m.triangles*24);assert(m.texture==='textures/'+m.name+'.png');assert(m.gltfSource.endsWith('/'+m.name+'.gltf'));
      for(var i=0;i<v.length;i+=8){assert(v.slice(i,i+8).every(Number.isFinite));assert(Math.hypot.apply(null,v.slice(i,i+3))<=8.50001);assertClose(Math.hypot.apply(null,v.slice(i+3,i+6)),1,.0001);assert(v[i+6]>=0&&v[i+6]<=1);assert(v[i+7]>=0&&v[i+7]<=1);}
    });
  });
  test('faction paint is optional and stays separate from shared source textures',function(){
    var api=window.Driftworks.shipPackModels,model=window.Driftworks.shipPacks[0].models[0],texture={},images=new Map([[model.id,texture]]),pose={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]},craft=[{index:0,pose:pose}];
    var green=api.paintColor('#38BFA0');assertClose(green[0],56/255,.000001);assert(api.paintColor('bad')===undefined);
    var direct=api.sourceGeometry(model,[pose],10,texture,green),original=api.sourceGeometry(model,[pose],10,texture);
    assert(direct.paint===green);assert(original.paint===undefined);assert(direct.texture===original.texture);assert(direct.vertices.every(function(v,i){return v===original.vertices[i];}));
    var mixed=api.sourceFleetGeometry(craft,'mixed',1,10,images,green);assert(mixed.length===1&&mixed[0].paint===green);
  });
  test('wreck hulls lose faction paint without mutating shared live geometry',function(){
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
  test('source ship fleets preserve artist UVs and normals across poses without dropping models',function(){
    var api=window.Driftworks.shipPackModels,models=window.Driftworks.shipPacks[0].models,images=new Map(),craft=[];
    models.forEach(function(m,i){images.set(m.id,{name:m.name});craft.push({index:i,modelId:m.id,pose:{eye:[3,4,5],right:[0,1,0],back:[-1,0,0],up:[0,0,1]}});});
    var batches=api.sourceFleetGeometry(craft,'mixed',1,10,images);assert(batches.length===11);
    batches.forEach(function(b,i){var v=models[i].texturedVertices;assert(b.stride===8);assert(b.texture===images.get(models[i].id));assert(b.vertices.length===v.length);assertClose(b.vertices[0],3+v[1]/10,.00001);assertClose(b.vertices[1],4+v[0]/10,.00001);assertClose(b.vertices[3],v[4],.00001);for(var j=0;j<v.length;j+=8){assertClose(b.vertices[j+6],v[j+6],.000001);assertClose(b.vertices[j+7],v[j+7],.000001);}});
    assert(api.sourceFleetGeometry([],'mixed',1,10,images).length===0);
  });
  test('cached flight draw transforms match baked hull positions, normals and UVs',function(){
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
  test('target bounds scan each source vertex array once',function(){
    var reads=0,source=new Proxy([3,4,0,0,0,1],{get:function(target,key){if(key==='0'||key==='1'||key==='2')reads++;return target[key];}});
    var model={vertices:source},api=window.Driftworks.flightTargetCamera;
    assert(api.radius(model)===5&&reads===3);
    assert(api.radius(model)===5&&reads===3);
    model.vertices=[0,0,12,0,0,1];assert(api.radius(model)===12);
  });

  test('imported ship geometry transforms positions and normals without changing the source',function(){
    var api=window.Driftworks.shipPackModels,m=window.Driftworks.shipPacks[0].models[0],original=m.vertices.slice(),pose={eye:[3,4,5],right:[0,1,0],back:[-1,0,0],up:[0,0,1]};
    var batch=api.geometry(m,[pose,pose],10)[0];assert(batch.vertices.length===m.vertices.length*2);assertClose(batch.vertices[0],3+m.vertices[1]/10,.00001);assertClose(batch.vertices[1],4+m.vertices[0]/10,.00001);assertClose(batch.vertices[3],m.vertices[4],.00001);assert(m.vertices.every(function(v,i){return v===original[i];}));assert(api.geometry(m,[],10)[0].vertices.length===0);
  });

  test('default fighter noses face pose forward after pack axis conversion',function(){
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

  test('mixed fighter fleets cover the placeholder and concept libraries, keep assignments and merge finishes',function(){
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

  test('fighter exhaust stays aft, batches finite glow geometry and shuts down on disable',function(){
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

  test('four-nozzle ships emit from both engine pairs at their own heights',function(){
    var api=window.Driftworks.shipPackModels,pose={eye:[3,4,5],right:[0,1,0],back:[-1,0,0],up:[0,0,1],throttle:1};
    ['Executioner','Spitfire','Insurgent'].forEach(function(name){var id='quaternius-ultimate-spaceships:'+name,m=api.find(id).model,anchors=api.engineAnchors(m);assert(anchors.length===4);assert(new Set(anchors.map(function(p){return p.slice(0,3).join(',');})).size===4);
      var b=api.engineGeometry([{index:0,hp:1,pose:pose}],id,1,10,pose,0).vertices;
      anchors.forEach(function(a,i){var center=[0,0,0];for(var j=0;j<6;j++)for(var k=0;k<3;k++)center[k]+=b[i*72+j*6+k]/6;assertClose(center[0],3+a[1]/10,.00001);assertClose(center[1],4+a[0]/10,.00001);assertClose(center[2],5+a[2]/10,.00001);});
    });
    var spit=api.engineAnchors(api.find('quaternius-ultimate-spaceships:Spitfire').model);assert(new Set(spit.map(function(p){return p[2];})).size===2);
  });
  test('fighter finishes retain source geometry and batch all poses with finite normals',function(){
    var api=window.Driftworks.shipPackModels,pose={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]};
    window.Driftworks.shipPacks.forEach(function(pack){pack.models.forEach(function(model){
      var original=model.vertices.slice(),one=api.detailedGeometry(model,[pose],10),two=api.detailedGeometry(model,[pose,pose],10);
      assert(one.length===4);var count=0;
      one.forEach(function(batch,index){assert(batch.vertices.length%18===0);count+=batch.vertices.length;assert(two[index].vertices.length===batch.vertices.length*2);for(var i=0;i<batch.vertices.length;i+=6){for(var a=0;a<6;a++)assert(Number.isFinite(batch.vertices[i+a]));assertClose(Math.hypot.apply(null,batch.vertices.slice(i+3,i+6)),1,.0001);}});
      assert(count>=original.length&&count<=original.length*7);assert(model.vertices.every(function(v,i){return v===original[i];}));
      assert(api.detailedGeometry(model,[],10).every(function(b){return b.vertices.length===0;}));
    });});
  });


  test('flight frame cap follows 60 Hz on high-refresh screens without accumulating stalls', function () {
    var perf=window.Driftworks.flightPerformance,clock=perf.pacer(),frames=0;
    for(var i=0;i<144;i++)if(perf.due(clock,i*1000/144,60))frames++;
    assert(frames===60);assert(perf.due(clock,10000,60));assert(!perf.due(clock,10001,60));
    assert(perf.due(clock,10002,0));assert(perf.due(clock,10003,0));
    clock=perf.pacer();frames=0;for(var j=0;j<144;j++)if(perf.due(clock,j*1000/144,15))frames++;assert(frames===15);
  });
  test('flight diagnostics retain a bounded rolling window and a resettable worst frame', function () {
    var perf=window.Driftworks.flightPerformance,s=perf.create();perf.record(s,100,8);
    for(var i=0;i<150;i++)perf.record(s,20,2);
    var result=perf.summary(s);assert(s.frames.length===120 && s.cpu.length===120);
    assertClose(result.fps,50);assertClose(result.p95,20);assertClose(result.worst,100);assertClose(result.cpu,2);
    assert(perf.summary(perf.create()).worst===0);
  });

  test('furball wings acquire opposing targets, retain flight limits and spare friendlies',function(){
    var ai=window.Driftworks.training,t=ai.create('furball'),player=window.Driftworks.arcade.create(18),U=sim.METERS_PER_UNIT;
    ai.spawn(t,player,18);assert(ai.alive(t).length===16);assert(t.enemies.filter(function(e){return e.team==='ally';}).length===8);
    for(var i=0;i<1200;i++)ai.step(t,player,1/120,18);
    t.enemies.forEach(function(e){var target=t.enemies.find(function(other){return other.id===e.targetId;});if(target)assert(target.team!==e.team);e.pose.eye.forEach(function(v){assert(Number.isFinite(v));});assert(Math.hypot.apply(null,e.pose.velocity)<=e.profile.afterburnerVelocity[2]+.01);});
    var ally=t.enemies[0],enemy=t.enemies[8],weapon=window.Driftworks.retailWeapons[0];
    t.enemies.forEach(function(e){e.pose.eye=[100,100,100];});ally.pose.eye=[0,2,0];enemy.pose.eye=[0,4,0];var hp=ally.hp,redHp=enemy.hp;
    ai.trace(t,[0,0,0],[0,6,0],{weapon:weapon},'player',null,player);assert(ally.hp===hp&&enemy.hp<redHp);
    ai.cycle(t);assert(t.enemies.find(function(e){return e.id===t.targetId;}).team==='enemy');
  });
  test('furball rounds reset after a defeated wing and green fire damages red ships',function(){
    var ai=window.Driftworks.training,t=ai.create('furball'),player=window.Driftworks.arcade.create(18);ai.spawn(t,player,18);
    t.enemies.forEach(function(e){e.pose.eye=[100,100,100];});var ally=t.enemies[0],enemy=t.enemies[8];enemy.pose.eye=[0,2,0];
    ai.trace(t,[0,0,0],[0,3,0],{weapon:window.Driftworks.retailWeapons[0]},ally,null,player);assert(enemy.hp<90);
    t.enemies.filter(function(e){return e.team==='enemy';}).forEach(function(e){ai.damageEnemy(t,e,{damage:1000,armorFactor:1});});
    ai.step(t,player,.01,18);assert(t.roundOver&&t.countdown===5);for(var i=0;i<51;i++)ai.step(t,player,.1,18);assert(t.wave===2&&ai.alive(t).length===16&&!t.roundOver);
    var all=ai.allGuns(t,window.Driftworks.flightGuns.create());assert(all.bolts.every(function(b){return b.team==='ally'||b.team==='enemy';}));
  });

  test('autonomous furball produces shots and casualties without player fire',function(){
    var ai=window.Driftworks.training,t=ai.create('furball'),player=window.Driftworks.arcade.create(18),shots=0;
    // This fixture measures autonomous wing combat, not an idle player's survivability.
    t.player.hp=t.player.maxHp=10000;
    for(var i=0;i<14400;i++){ai.step(t,player,1/120,18);if(i%120===0)shots=Math.max(shots,t.enemies.reduce(function(n,e){return n+e.guns.fired;},0));}
    assert(shots>30);assert(t.kills>0);assert(t.enemies.length===16);assert(!t.dead);
  });

  test('virtual mouse stick holds displacement, returns to center and clamps diagonally',function(){
    var input=window.Driftworks.flightInput,p=input.moveStick([0,0],80,-40,160,1),d=input.stickDemand(p,.08);
    assert(d[0]>0&&d[1]<0);assert(input.moveStick(p,0,0,160,1).every(function(v,i){return v===p[i];}));
    var center=input.moveStick(p,-80,40,160,1);assert(input.stickDemand(center,.08).every(function(v){return v===0;}));
    assert(input.stickDemand([.02,.02],.08).every(function(v){return v===0;}));
    var edge=input.moveStick([0,0],1000,1000,160,1);assertClose(Math.hypot.apply(null,edge),1);assertClose(Math.hypot.apply(null,input.stickDemand(edge,.08)),1);
    assertClose(input.moveStick([0,0],40,0,160,2)[0],.5);
  });

  test('mouse stick response stays linear throughout travel and preserves direction and full turns',function(){
    var input=window.Driftworks.flightInput;
    var half=input.stickDemand([.54,0],.08),diagonal=input.stickDemand([.324,.432],.08);
    assertClose(half[0],0);assertClose(half[1],-.5);
    for(var i=0;i<=100;i++)assertClose(input.stickDemand([.08+.92*i/100,0],.08)[1],-i/100);
    assertClose(Math.hypot.apply(null,diagonal),Math.abs(half[1]));
    assertClose(diagonal[0]/diagonal[1],4/3);
    assertClose(input.stickDemand([0,-1],.08)[0],1);
    assertClose(input.stickDemand([1,0],.08)[1],-1);
  });

  test('training combat can clear a wave using the same player flight and gun models', function () {
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

  test('disabled fighters drift and tumble across waves without remaining combat targets',function(){
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

  test('training waves are bounded, delayed and allocate at most two attackers', function () {
    var ai=window.Driftworks.training,t=ai.create(),player=window.Driftworks.arcade.create(18);
    t.countdown=.01;ai.step(t,player,.02,18);assert(t.wave===1 && ai.alive(t).length===3 && t.slots.length===2);
    t.enemies.forEach(function(e){ai.damageEnemy(t,e,{damage:1000,armorFactor:1});});
    assert(t.kills===3 && t.countdown===5);ai.step(t,player,.1,18);assert(t.wave===1);
    for(var i=0;i<50;i++)ai.step(t,player,.1,18);
    assert(t.wave===2 && ai.alive(t).length===4);
    for(var j=0;j<10;j++)ai.spawn(t,player,18);assert(ai.alive(t).length===6);
    ai.step(t,player,.01,18);assert(t.slots.length===2);
  });
  test('training steering uses local pitch and yaw and preserves physical flight limits', function () {
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
  test('training shots sweep targets and stop at the nearest obstruction', function () {
    var ai=window.Driftworks.training,t=ai.create(),player=window.Driftworks.arcade.create(18),weapon=window.Driftworks.retailWeapons[0];
    ai.spawn(t,player,18);t.enemies[0].pose.eye=[0,2,0];t.enemies[1].pose.eye=[0,4,0];t.enemies[2].pose.eye=[5,5,0];
    var hit=ai.trace(t,[0,0,0],[0,6,0],{weapon:weapon},'player',function(){return [0,1,0];},player);
    assertClose(hit[1],1);assert(t.enemies[0].hp===90);
    hit=ai.trace(t,[0,0,0],[0,6,0],{weapon:weapon},'player',null,player);
    assert(hit[1]<2 && t.enemies[0].hp<90 && t.enemies[1].hp===90);
    ai.damageEnemy(t,t.enemies[0],{damage:1000,armorFactor:1});var kills=t.kills;
    ai.damageEnemy(t,t.enemies[0],weapon);assert(t.kills===kills);
  });
  test('training shield absorption, recovery, death and restart have independent lifecycles', function () {
    var ai=window.Driftworks.training,t=ai.create(),weapon=window.Driftworks.retailWeapons[0],player=window.Driftworks.arcade.create(18);
    ai.damagePlayer(t,weapon);assert(t.shield<120 && t.hull===100);
    t.shield=1;ai.damagePlayer(t,weapon);assert(t.shield===0 && t.hull<100);
    t.time=20;t.lastHit=0;ai.step(t,player,.1,18);assert(t.shield>0);
    t.shield=0;t.hull=1;ai.damagePlayer(t,weapon);assert(t.dead && t.hull===0);
    var before=t.time;ai.step(t,player,1,18);assert(t.time>before && t.dead, 'The observing craft death must not freeze the shared simulation');
    var fresh=ai.create();assert(!fresh.dead && fresh.shield===120 && fresh.kills===0);
  });
  test('training intercept leads moving targets and models are simple bounded triangles', function () {
    var ai=window.Driftworks.training,lead=ai.intercept([0,0,0],[0,20,0],[2,0,0],27);
    assert(lead.time>0 && lead.point[0]>0);
    var t=ai.create();ai.spawn(t,window.Driftworks.arcade.create(18),18);
    var mesh=ai.geometry(t)[0].vertices;assert(mesh.length===3*6*3*6);mesh.forEach(function(x){assert(Number.isFinite(x));});
    var guns=window.Driftworks.flightGuns.create();assert(ai.allGuns(t,guns).bolts.length===0);
  });

  test('crosshair selects the nearest living hull and lock holds until released or destroyed', function () {
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
  test('L and standard X/Square toggle lock once per press and ignore paused input', function(){
    var f=flightControlsFixture();f.key('KeyL');f.key('KeyL','BODY',true);assert(f.counts.lock===1);
    f.setPaused(true);f.key('KeyL');assert(f.counts.lock===1);f.setPaused(false);
    var pad={index:0,id:'Lock pad',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},function(){return {pressed:false,value:0};})};
    f.setPads([pad]);f.controls.sample();pad.buttons[2]={pressed:true,value:1};
    f.controls.sample();f.controls.sample();assert(f.counts.lock===2);
    pad.buttons[2]={pressed:false,value:0};f.controls.sample();pad.buttons[2]={pressed:true,value:1};f.controls.sample();assert(f.counts.lock===3);
  });

  test('controller deadzones rescale travel and reject noisy or missing values', function () {
    var input=window.Driftworks.flightInput;
    assertClose(input.deadzone(.1,.12),0);assertClose(input.deadzone(-.1,.12),0);
    assertClose(input.deadzone(.56,.12),.5);assertClose(input.deadzone(-1,.12),-1);
    assertClose(input.deadzone(NaN,.12),0);
  });
  test('standard gamepad maps aim, roll, throttle and buttons without neutral throttle override', function () {
    var input=window.Driftworks.flightInput,map=input.defaults(true),pad={axes:[1,-1,-1,0],buttons:[]};
    pad.buttons[7]={pressed:true,value:1};pad.buttons[0]={pressed:true,value:1};pad.buttons[12]={pressed:true,value:1};
    var c=input.read(pad,map);assert(c.pitch===1 && c.yaw===-1 && c.roll===1);
    assert(c.throttle===null && c.throttleRate===1 && c.fire && c.boost);
    assert(!c.bank && !c.pause);
  });
  test('standard right stick adjusts throttle proportionally and holds at neutral',function(){
    var input=window.Driftworks.flightInput,map=input.defaults(true),pad={mapping:'standard',axes:[0,0,0,0],buttons:[]};
    assertClose(input.read(pad,map).throttleRate,0);assert(input.read(pad,map).throttle===null);
    pad.axes[3]=-1;assertClose(input.read(pad,map).throttleRate,1);
    pad.axes[3]=1;assertClose(input.read(pad,map).throttleRate,-1);
    pad.axes[3]=-.56;assertClose(input.read(pad,map).throttleRate,.5);
    pad.axes[3]=.05;assertClose(input.read(pad,map).throttleRate,0);
    pad.axes[3]=-1;pad.buttons[12]={pressed:true,value:1};assertClose(input.read(pad,map).throttleRate,1);
    pad.axes=[];assertClose(input.read(pad,map).throttleRate,1);
  });

  test('joystick bindings survive reconnection with per-device storage', function () {
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

  test('flight sticks map twist to yaw and lateral travel to roll', function () {
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

  test('joystick permits inverted axes, absolute throttle and custom buttons', function () {
    var input=window.Driftworks.flightInput,map=input.defaults(false),pad={axes:[.12,1,-1,-1],buttons:[]};
    map.fire=5;map.pause=6;pad.buttons[5]={pressed:true,value:1};pad.buttons[6]={pressed:true,value:1};
    var c=input.read(pad,map);assert(c.pitch===1 && c.yaw===0 && c.roll===1 && c.throttle===1 && c.fire && c.pause);
    map.pitchInvert=true;map.throttleInvert=false;c=input.read(pad,map);assert(c.pitch===-1 && c.throttle===0);
    map.pitch=9;map.throttle=9;c=input.read(pad,map);assert(c.pitch===0 && c.throttle===null);
    c=input.read({axes:[],buttons:[]},map);assert(!c.fire && !c.boost && !c.pause);
  });

  test('retail primary guns retain table ballistics and cadence', function () {
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
  test('legacy count-only gun calls retain imported counts and cadence', function () {
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
  test('manual, duel and NPC gun steps receive their own profile mount counts', function () {
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
  test('visible model muzzles transform with the hull and preserve sustained DPS', function () {
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
  test('twin guns converge on the crosshair at 300 metres in any pose', function () {
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
  test('close tail shots converge on the nearest crosshair hull and both hit', function () {
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
  test('point-blank surfaces before the normal muzzle plane receive both forward shots', function () {
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
  test('gun sweeps hit terrain between endpoints and remove bolts at impact', function () {
    var model=window.Driftworks.flightGuns,field=function(p){return Math.hypot.apply(null,p)-1;};
    var hit=model.intersect([0,-2,0],[0,2,0],1,field);assert(hit);assertClose(hit[1],-1,.001);
    assert(model.intersect([2,-2,0],[2,2,0],1,field)===null);
    var guns=model.create(),pose=window.Driftworks.arcade.create(18),w=window.Driftworks.retailWeapons[0];
    model.step(guns,pose,w,true,1/120);assert(guns.bolts.length===2);
    model.step(guns,pose,w,false,1/120,function(start,end){return end;});
    assert(guns.bolts.length===0 && guns.hits===2 && guns.impacts.length===2);
    for(var i=0;i<30;i++)model.step(guns,pose,w,false,1/120);assert(guns.impacts.length===0);
  });
  test('gun rendering batches are bounded and contain world-space triangles', function () {
    var model=window.Driftworks.flightGuns,guns=model.create(),pose=window.Driftworks.arcade.create(18);
    model.step(guns,pose,window.Driftworks.retailWeapons[0],true,1/120);
    var batches=model.geometry(guns,pose);assert(batches.length===4);assert(batches[2].vertices.length===72);
    assert(batches[1].vertices.length===0);batches[2].vertices.forEach(function(x){assert(Number.isFinite(x));});
  });

  test('bolt artwork maintains angular size to thirty metres then shrinks in perspective', function () {
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

  test('flight sky directions rotate with the cockpit, ignore translation, and cover the sphere', function () {
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


  test('retail maneuver tables preserve original values and axis order', function () {
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
  test('flight sortie starts at full cruise with a clear approach to the furball', function () {
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
  test('arcade handling accelerates, caps cruise, brakes and preserves orthonormal attitude', function () {
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
  test('maneuvering thrusters ease toward five m/s, cap diagonals and brake on release', function () {
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
  test('LB maneuvering preserves steering and D-pad throttle while replacing right-stick controls', function () {
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
  test('manual throttle passes through zero into weak reverse and stop clears it',function(){
    var DW=window.Driftworks,state=DW.arcade.create(0),craft=DW.training.createCraft('manual',state,'ally');
    DW.training.stepInput(craft,{throttle:null,throttleRate:-1,fire:false},.05);
    assert(state.throttle<0 && state.velocity[1]<0);
    DW.training.stepInput(craft,{throttle:null,throttleRate:0,stop:true,fire:false},.05);
    assert(state.throttle===0);
  });
  test('arcade contact scales normalized geology by body radius and retains five meter clearance', function () {
    var model=window.Driftworks.arcade,state=model.create(18);
    state.eye=[0,-17,0];state.velocity=[0,80,0];state.throttle=1;
    assert(model.contact(state,[0,-1,0],18));
    assertClose(Math.hypot.apply(null,state.eye),18+5/sim.METERS_PER_UNIT);
    assertClose(Math.hypot.apply(null,state.velocity),0,.4);assert(state.throttle===0);
    assert(!model.contact(state,[0,-1,0],18));
  });
  test('arcade boost, strafe and physical distance use lab units without simulation time scaling', function () {
    var model=window.Driftworks.arcade,p=model.profiles[0],state=model.create(18);
    state.throttle=1;
    for(var i=0;i<1000;i++)model.step(state,p,{boost:true},.01);
    assertClose(Math.hypot.apply(null,state.velocity),p.afterburnerVelocity[2],.01);
    var before=state.eye.slice();model.step(state,p,{boost:true},.01);
    assertClose((state.eye[1]-before[1])*sim.METERS_PER_UNIT,p.afterburnerVelocity[2]*.01);
    var side=model.create(18);model.step(side,p,{side:1},.05);assert(side.velocity[0]>0 && side.velocity[0]<.13);
    assert(model.profiles[2].maxVelocity[2]>p.maxVelocity[2]);
  });

  test('study focus picks the nearest surface from either side and rejects misses', function () {
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
  test('mothership close inspection refines curved silhouettes within a fixed ceiling', function () {
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
  test('mining rig keeps finite unit normals and folds anchors without idle machinery motion', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry;
    ['current'].forEach(function(variant){
      var deployed=model(1,0,false),folded=model(0,0,false);
      assert(JSON.stringify(deployed)!==JSON.stringify(folded));
      assert(JSON.stringify(deployed)===JSON.stringify(model(1,5,false)));
      assert(JSON.stringify(deployed)===JSON.stringify(model(1,.2,true)));
      Object.keys(deployed).forEach(function(key){var data=deployed[key];assert(data.length%18===0);assert(data.every(Number.isFinite));for(var i=3;i<data.length;i+=6)assertClose(Math.hypot(data[i],data[i+1],data[i+2]),1,.00001);});
    });
  });

  test('original mining rig catalog uses canonical geometry and separate provenance', function () {
    var DW=window.Driftworks,entry=DW.originalShipModels[0];assert(entry.id==='driftworks:mining-rig');assert(entry.author==='Driftworks');
    assert(entry.provenance.indexOf('driftworks-originals')>=0);
    var batches=entry.geometry(1),source=DW.scene3d.miningPlatformGeometry(1,0,false,0,'');
    assert(batches.reduce(function(n,b){return n+b.vertices.length;},0)===Object.keys(source).reduce(function(n,k){return n+source[k].length;},0));
    batches.forEach(function(batch){for(var i=0;i<batch.vertices.length;i+=6)assert(Math.hypot(batch.vertices[i],batch.vertices[i+1],batch.vertices[i+2])<=8.50001);});
    assert(!DW.shipPackModels.find(entry.id),'Originals are kept out of imported fighter packs');
  });

  test('inter-leg bay ramps reach ground while the protective cage stays fixed', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry;
    var closed=model(1,0,false,0),open=model(1,0,false,1);
    assert(JSON.stringify(closed.dark.slice(model(1,0,false,0,'',false,false,undefined,undefined,true).dark.length))===JSON.stringify(open.dark.slice(model(1,0,false,1,'',false,false,undefined,undefined,true).dark.length)),'Load-bearing cage remains in place');
    var lowClosed=Infinity,lowOpen=Infinity;
    for(var i=2;i<closed.ochre.length;i+=6)lowClosed=Math.min(lowClosed,closed.ochre[i]);
    for(var i=2;i<open.ochre.length;i+=6)lowOpen=Math.min(lowOpen,open.ochre[i]);
    assert(lowClosed>4 && lowOpen<.01 && lowOpen>-.3,'Door lips reach the surface');
    [0,.5,1].forEach(function(t){var groups=model(1,0,false,t);Object.keys(groups).forEach(function(key){assert(groups[key].every(Number.isFinite));});});
  });

  test('bay hull closes with vertical walls and a roof before two-stage unfolding', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry,closed=model(1,0,false,0),uncovered=model(1,0,false,.4),open=model(1,0,false,1);
    // The first leaf is a vertical wall; the second is the upper closure.
    assertClose(closed.ochre[5],0);
    assertClose(closed.ochre[30*6+5],1);
    for(var i=0;i<30*6;i++)assertClose(closed.ochre[i],uncovered.ochre[i],.000001);
    assert(JSON.stringify(closed)!==JSON.stringify(uncovered));
    assert(JSON.stringify(closed.dark.slice(model(1,0,false,0,'',false,false,undefined,undefined,true).dark.length))===JSON.stringify(open.dark.slice(model(1,0,false,1,'',false,false,undefined,undefined,true).dark.length)));
    [0,.2,.4,.7,1].forEach(function(t){var groups=model(1,0,false,t);Object.keys(groups).forEach(function(k){assert(groups[k].every(Number.isFinite));for(var i=3;i<groups[k].length;i+=6)assertClose(Math.hypot(groups[k][i],groups[k][i+1],groups[k][i+2]),1,.00001);});});
  });

  test('roof shuttle docking collar and four hardpoints stay above the tower', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry,closed=model(1,0,false,0),open=model(1,0,false,1);
    function roof(groups){var result=[];Object.keys(groups).forEach(function(k){for(var i=0;i<groups[k].length;i+=18){if(groups[k][i+2]>13.5 && groups[k][i+8]>13.5 && groups[k][i+14]>13.5)result.push(k+':'+groups[k].slice(i,i+18).join(','));}});return result.join(';');}
    assert(roof(closed)===roof(open),'Docking hardware stays fixed while cargo doors unfold');
    [-1,1].forEach(function(x){[-1,1].forEach(function(y){var found=false,v=closed.ochre;for(var i=0;i<v.length;i+=6)if(Math.sign(v[i])===x && Math.sign(v[i+1])===y && v[i+2]>14.8)found=true;assert(found,'A raised hardpoint in each roof corner');});});
  });

  test('transit shell stays yellow while door inner faces use work-deck grey', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry,closed=model(1,0,false,0),open=model(1,0,false,1);
    assert(JSON.stringify(closed.steel)!==JSON.stringify(open.steel),'Grey door inner faces move with their yellow outer armor');
    assert(JSON.stringify(closed.dark.slice(model(1,0,false,0,'',false,false,undefined,undefined,true).dark.length))===JSON.stringify(open.dark.slice(model(1,0,false,1,'',false,false,undefined,undefined,true).dark.length)),'Permanent dark chassis stays fixed');
    var yellowPad=false;
    for(var i=0;i<closed.ochre.length;i+=6)if(Math.abs(closed.ochre[i+2]-13.74)<.001 && Math.abs(closed.ochre[i])>4)yellowPad=true;
    assert(yellowPad,'Docking pad retains yellow exposed roof armor');
  });

  test('control tower has outward-downward glazing around all eight sides', function () {
    var data=window.Driftworks.scene3d.miningPlatformGeometry(1,0,false,0).dark,faces={};
    for(var i=0;i<data.length;i+=18){
      if(data[i+2]>10 && data[i+2]<11.15 && data[i+5]<-.25){
        var direction=Math.round(Math.atan2(data[i+4],data[i+3])*100);faces[direction]=true;
      }
    }
    assert(Object.keys(faces).length===8,'Every tower face has a lower downward-looking pane');
  });

  test('suspended tower egress is a downward hatch above the cargo deck', function () {
    var v=window.Driftworks.scene3d.miningPlatformGeometry(1,0,false,0).light,faces=0;
    for(var i=0;i<v.length;i+=18){
      if([0,6,12].every(function(k){return v[i+k]>=1.31 && v[i+k]<=4.19 && Math.abs(v[i+k+1])<=1.39 && Math.abs(v[i+k+2]-7.18)<.001;}) && v[i+5]<-.99)faces++;
    }
    assert(faces===2,'Downward outer airlock leaf occupies the suspended pod floor, not cargo-floor height');
  });

  test('door hinge barrels and actuator assemblies stay valid through both hinge stages', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry;
    var closed=model(1,0,false,0),open=model(1,0,false,1);
    assert(JSON.stringify(closed.dark.slice(model(1,0,false,0,'',false,false,undefined,undefined,true).dark.length))===JSON.stringify(open.dark.slice(model(1,0,false,1,'',false,false,undefined,undefined,true).dark.length)),'Root cradles, stops and receivers remain frame-mounted');
    [0,.2,.4,.65,1].forEach(function(t){var groups=model(1,0,false,t);Object.keys(groups).forEach(function(k){var v=groups[k];assert(v.every(Number.isFinite));for(var i=3;i<v.length;i+=6)assertClose(Math.hypot(v[i],v[i+1],v[i+2]),1,.00001);});});
  });

  test('cargo deck has no coplanar black belly or broad chassis top', function () {
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

  test('tower ceiling has one roof plane without a coplanar docking pad underside', function () {
    var v=window.Driftworks.scene3d.miningPlatformGeometry(1,0,false,1,'').ochre,count=0;
    for(var i=0;i<v.length;i+=18){if([2,8,14].every(function(offset){return Math.abs(v[i+offset]-13.5)<.00001;}))count++;}
    assert(count===6,'Only the six triangles of the octagonal roof occupy z=13.5');
    var panes=window.Driftworks.scene3d.miningPlatformGeometry(1,0,false,1,'').dark,upward=0;
    for(var j=0;j<panes.length;j+=18)if([2,8,14].every(function(offset){return panes[j+offset]>12.5 && panes[j+offset]<13.5;}) && panes[j+5]>.5)upward++;
    assert(upward===16,'Eight upper shoulder windows face upward for overhead visibility');
  });

  test('crew interior has separate entry/control decks and an unobstructed microgravity translation opening', function () {
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

  test('mining platform geometry folds legs without decorative machinery motion', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry;
    var open=model(1,0,false),folded=model(0,0,false);
    function width(groups){var ys=[];Object.keys(groups).forEach(function(k){for(var i=1;i<groups[k].length;i+=6)ys.push(Math.abs(groups[k][i]));});return Math.max.apply(null,ys);}
    assert(width(open)>width(folded));
    assert(JSON.stringify(open)===JSON.stringify(model(1,12,false)));
    assert(JSON.stringify(open)===JSON.stringify(model(1,.2,true)));
    Object.keys(open).forEach(function(k){assert(open[k].length%18===0);assert(open[k].every(Number.isFinite));for(var i=3;i<open[k].length;i+=6)assert(Math.abs(Math.hypot(open[k][i],open[k][i+1],open[k][i+2])-1)<.00001);});
  });

  test('3D station hardware has finite unit normals and a bounded geometry budget', function () {
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
  test('3D mothership habitat preserves the rounded silhouette with real circular depth', function () {
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
  test('3D mothership close inspection stays above the raised fixed machinery', function () {
    var w = createFreshWorld(), home = w.ships.find(function (s) { return s.type === 'mothership'; });
    w.camera = { x: home.position.x, y: home.position.y, zoom: 128 };
    var before = JSON.stringify(w), height = window.Driftworks.scene3d.inspectionHeight(w);
    assert(height > 29 * game.semanticScale('mothership', w.camera.zoom));
    assert(JSON.stringify(w) === before);
    w.camera.zoom = 1;
    assert(window.Driftworks.scene3d.inspectionHeight(w) === 0);
  });
  test('3D asteroid uses the original seeded geology and crater data', function () {
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
  test('3D surface intersects the full relief shell above and below', function () {
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
  test('3D crater relief covers both hemispheres and stays continuous across the equator and longitude seam', function () {
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
  test('3D impacts stay circular in actual surface tangent planes and survive GPU packing', function () {
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
  test('Asteroid study parameters are reproducible and never alter saved world data', function () {
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
  test('Surface walking frames follow the closed terrain with outward unit normals', function () {
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
  test('3D perspective picking round trips the movement plane through orbit and zoom', function () {
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
  test('3D perspective orbit changes interior parallax according to depth', function () {
    var scene = window.Driftworks.scene3d, camera = { x: 0, y: 0, zoom: 1 }, viewport = { width: 1400, height: 900 };
    var front = scene.project([0, 0, 0], camera, viewport, { yaw: 0, tilt: 0.6 });
    var behind = scene.project([0, 0, -100], camera, viewport, { yaw: 0, tilt: 0.6 });
    assert(Math.abs(front.y - behind.y) > 30, 'Interior should project behind the cut surface');
    var turned = scene.project([100, 0, -100], camera, viewport, { yaw: 1, tilt: 0.6 });
    var original = scene.project([100, 0, -100], camera, viewport, { yaw: 0, tilt: 0.6 });
    assert(Math.abs(turned.x - original.x) > 20);
  });
  test('excavation retains its roof independently of cutaway inspection and keeps a connected passage', function () {
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
  test('excavation preserves the exterior field away from its entrance', function () {
    var scene=window.Driftworks.scene3d, world=createFreshWorld();
    var intact=world.asteroids[0], excavated=sim.toggleAsteroidExcavation(world,intact.id).asteroids[0];
    for(var i=0;i<24;i++){
      var angle=i*Math.PI/12;
      // Upper hemisphere remains rock: inspection clipping is disabled here.
      var p=[Math.cos(angle)*.72,Math.sin(angle)*.72,.6];
      assert(scene.rockField(intact,p,false)===scene.rockField(excavated,p,false), 'Excavation must not alter exterior geology');
    }
  });
  test('3D rock solid retains the body scale and excavates real chamber and tunnel voids', function () {
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
  test('3D asteroid picking reaches the chamber floor and respects body rotation', function () {
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
  test('3D inspection keeps close zoom above the visible surface without changing world state', function () {
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
  test('background settings default safely and clamp persisted brightness', function () {
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
  test('asteroid artwork is stable through movement, depletion and save reload', function () {
    var world = createFreshWorld();
    var asteroid = world.asteroids[0];
    var before = JSON.stringify(game.asteroidVisualDescription(asteroid));
    var changed = Object.assign({}, asteroid, { rotation: 2, ore: 0, position: { x: 999, y: -42 } });
    assert(JSON.stringify(game.asteroidVisualDescription(changed)) === before);
    var loaded = sim.deserializeWorld(sim.serializeWorld(world));
    assert(JSON.stringify(game.asteroidVisualDescription(loaded.asteroids[0])) === before);
  });

  test('asteroid excavation persists, repairs old saves and reserves mining clearance', function () {
    var world = createFreshWorld();
    var excavation = world.asteroids[0].excavation;
    assert(excavation && excavation.level === 0 && excavation.pocketRadius > 0 && excavation.depthM === 500);
    var old = JSON.parse(JSON.stringify(world));
    delete old.asteroids[0].excavation;
    var repaired = sim.deserializeWorld(sim.serializeWorld(old));
    assert(JSON.stringify(repaired.asteroids[0].excavation) === JSON.stringify(excavation),
      'Old saves should gain the deterministic starter cavern');
    var shallowLegacy = JSON.parse(JSON.stringify(world));
    delete shallowLegacy.asteroids[0].excavation.depthM;
    assert(sim.deserializeWorld(sim.serializeWorld(shallowLegacy)).asteroids[0].excavation.depthM === 500,
      'Existing excavation saves should gain physical depth');
    repaired = sim.selectShips(repaired, ['msv-hardshell']);
    repaired = sim.issueMineOrder(repaired, repaired.asteroids[0].id);
    var order = repaired.ships.filter(function (ship) { return ship.id === 'tug-01'; })[0].order;
    assert(order.kind === 'deploy');
    var a = repaired.asteroids[0], normalizedRadius = sim.surfaceRadius(a, order.siteAngle) / a.radius * order.siteDepth;
    var siteX = Math.cos(order.siteAngle) * normalizedRadius, siteY = Math.sin(order.siteAngle) * normalizedRadius;
    assert(Math.hypot(siteX - excavation.pocketOffset.x, siteY - excavation.pocketOffset.y) > excavation.pocketRadius + 0.1,
      'Mining sites should not overlap the cavern');
  });

  test('dev excavation toggle preserves its geometry and round-trips through saves', function () {
    var world = createFreshWorld();
    var asteroid = world.asteroids[0], geometry = JSON.stringify(asteroid.excavation);
    world = sim.toggleAsteroidExcavation(world, asteroid.id);
    assert(world.asteroids[0].excavation.level === 1);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assert(world.asteroids[0].excavation.level === 1, 'Excavated state should survive loading');
    world = sim.toggleAsteroidExcavation(world, asteroid.id);
    assert(world.asteroids[0].excavation.level === 0);
    assert(JSON.stringify(world.asteroids[0].excavation) === geometry, 'Toggling should preserve cavern placement');
  });

  test('asteroid surface is a normalized four-material composition field', function () {
    var base = createFreshWorld().asteroids[0];
    var craterCounts = new Set();
    var bulkWinners = new Set();
    var heterogeneities = [];
    var roughnessByDominant = [[], [], [], []];
    /** @type {Record<string, number>} */
    var craterSizes = { small: 0, medium: 0, large: 0, basin: 0 };
    var limbCraters = 0;
    for (var n = 0; n < 80; n += 1) {
      var asteroid = Object.assign({}, base, { id: 'sample-' + n });
      var visual = game.asteroidVisualDescription(asteroid);
      craterCounts.add(visual.craters.length);
      heterogeneities.push(visual.heterogeneity);
      var winner = visual.bulk.indexOf(Math.max.apply(null, visual.bulk));
      bulkWinners.add(winner);
      roughnessByDominant[winner].push(visual.surfaceProfile.roughnessAmp);
      assertClose(visual.bulk.reduce(function (a, b) { return a + b; }, 0), 1);
      assert(visual.bulk.every(function (fraction) { return fraction > 0; }), 'Every bulk material must be present');
      assert(visual.craters.length >= 102 && visual.craters.length <= 144, 'Shader crater population is dense and bounded');
      assert(visual.relief.blobs.length === 5, 'Every asteroid has a coherent large-scale relief field');
      assert(['fresh', 'dusty', 'battered', 'fractured', 'rubble-pile'].indexOf(visual.surfaceProfile.state) >= 0);
      assert(visual.surfaceProfile.roughnessAmp > 0 && visual.surfaceProfile.grazingBoost > 0);
      visual.craters.forEach(function (crater) {
        craterSizes[crater.sizeClass] += 1;
        var craterAngle = Math.atan2(crater.y, crater.x);
        var edge = 0.88 + 0.07 * Math.cos(craterAngle * 3) + 0.05 * Math.sin(craterAngle * 5);
        if (Math.hypot(crater.x, crater.y) / edge > 0.72) limbCraters += 1;
        assert(crater.ry <= crater.rx && crater.ry >= crater.rx * 0.5,
          'Crater ellipses are foreshortened by their local surface orientation');
        assert(crater.depth > 0 && crater.depth < crater.rx, 'Crater relief is normalized for shader evaluation');
      });
      var bareVisual = Object.assign({}, visual, { craters: [] });
      var center = game.asteroidSurfaceSample(bareVisual, 0, 0);
      var edge = game.asteroidSurfaceSample(bareVisual, 0.78, 0);
      assertClose(center.composition.reduce(function (a, b) { return a + b; }, 0), 1);
      assert(center.composition.every(function (fraction) { return fraction >= 0.025 && fraction <= 0.91; }),
        'Every sampled point remains a material mixture');
      assertClose(Math.hypot(center.normal.x, center.normal.y, center.normal.z), 1, 0.00001);
      assert(center.normal.z > edge.normal.z, 'Full-height normals curve away from the viewer near the limb');
      var crater = visual.craters[visual.craters.length - 1];
      var floor = game.asteroidSurfaceSample(visual, crater.x, crater.y);
      assert(floor.occlusion >= 0.35, 'Newest crater center is represented as occluded relief');
    }
    assert(bulkWinners.size === 4, 'All four materials can dominate bulk composition');
    var averageRoughness = roughnessByDominant.map(function (values) {
      return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
    });
    assert(averageRoughness[3] > averageRoughness[0], 'Silicate-dominant surfaces are rougher on average than ice-dominant surfaces');
    assert(craterCounts.size > 5);
    var craterTotal = craterSizes.small + craterSizes.medium + craterSizes.large + craterSizes.basin;
    assert(craterSizes.small / craterTotal > 0.6 && craterSizes.small / craterTotal < 0.8,
      'Most impacts are small craters');
    assert(craterSizes.medium / craterTotal > 0.15 && craterSizes.medium / craterTotal < 0.32,
      'Medium impacts form the supporting crater population');
    assert(craterSizes.large > 80 && craterSizes.basin > 5,
      'Large impacts and occasional basins appear across a broad sample');
    assert(limbCraters / craterTotal > 0.6,
      'Visible-hemisphere sampling represents compressed edge-on surface area');
    assert(Math.min.apply(null, heterogeneities) < 0.1 && Math.max.apply(null, heterogeneities) > 0.9,
      'Field heterogeneity should span nearly homogeneous to chunky');
  });

  test('asteroid renderer retains shader geometry while updating light uniforms', function () {
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
  function createDeployedWorld(seed) {
    var world = createFreshWorld(seed);
    var positions = { 'tug-01': { x: 160, y: 120 }, 'escort-01': { x: 210, y: -125 }, 'escort-02': { x: 250, y: -165 } };
    world.ships.forEach(function (ship) {
      if (!positions[ship.id]) return;
      ship.position = Object.assign({}, positions[ship.id]);
      ship.previousPosition = Object.assign({}, ship.position);
      ship.docked = false;
    });
    return world;
  }

  test('fresh fleet is stored inside the mothership and launches only on assignment', function () {
    var world = createFreshWorld();
    var home = findShip(world, 'msv-hardshell');
    ['tug-01', 'escort-01', 'escort-02'].forEach(function (id) {
      var ship = findShip(world, id);
      assert(ship.docked && ship.order.kind === 'idle', id + ' should start stored and idle');
      assertClose(ship.position.x, home.position.x);
      assertClose(ship.position.y, home.position.y);
    });
    world = sim.issueMoveOrder(sim.selectShips(world, ['tug-01']), { x: 600, y: 0 });
    world = sim.stepWorld(world, 0.5);
    var tug = findShip(world, 'tug-01');
    assert(!tug.docked && tug.launchElapsed === 0.5, 'A job should begin a one-second emergence');
    assertClose(tug.position.x, home.position.x + 36);
    world = sim.issueMoveOrder(world, { x: -500, y: 0 });
    assert(findShip(world, 'tug-01').order.target.x === 600, 'New orders must wait until emergence clears');
    world = sim.stepWorld(world, 0.5);
    tug = findShip(world, 'tug-01');
    assert(tug.launchElapsed === null && tug.position.x > 0, 'Guidance should begin once emergence clears');
  });

  test('hostile appearance scrambles docked fighters and returns only automatic defenders', function () {
    var world = createFreshWorld();
    findShip(world, 'escort-02').disabled = true;
    world = sim.spawnHostileWave(world);
    world = sim.stepWorld(world, 1 / 30);
    ['escort-01', 'escort-02'].forEach(function (id) {
      var fighter = findShip(world, id);
      if (id === 'escort-01') assert(fighter.order.kind === 'defend' && fighter.order.automatic, 'Available docked fighters should scramble automatically');
      else assert(fighter.disabled && fighter.order.kind === 'idle', 'Disabled fighters should not scramble');
    });
    var manual = createFreshWorld();
    manual = sim.issueDefendOrder(sim.selectShips(manual, ['escort-01']), { x: 200, y: 0 });
    manual = sim.spawnHostileWave(manual);
    manual = sim.stepWorld(manual, 1 / 30);
    assert(findShip(manual, 'escort-01').order.kind === 'defend' && !findShip(manual, 'escort-01').order.automatic,
      'A player-assigned fighter must keep its own deployment order');
    world.combat.drones = [];
    world = sim.stepWorld(world, 1 / 30);
    assert(findShip(world, 'escort-01').order.kind === 'return' && findShip(world, 'escort-01').order.automatic,
      'Automatically scrambled fighters should return when the last hostile is gone');
  });

  test('normalization preserves an already deployed craft in older saves', function () {
    var world = createFreshWorld();
    var tug = findShip(world, 'tug-01');
    tug.docked = false;
    tug.position = { x: 700, y: -300 };
    var loaded = sim.deserializeWorld(sim.serializeWorld(world));
    assert(!findShip(loaded, tug.id).docked, 'Loading must not force a deployed craft into internal storage');
    assertClose(findShip(loaded, tug.id).position.x, 700);
    assert(JSON.stringify(sim.deserializeWorld(sim.serializeWorld(loaded))) === JSON.stringify(loaded), 'Repeated loading should stay stable');
  });

  test('seeded initialization and scenario replay are deterministic without rendering', function () {
    var replay = window.Driftworks.scenario;
    var scenario = { version: 1, seed: 12345, ticks: 300, commands: [
      { tick: 0, action: 'select', args: [['tug-01']] },
      { tick: 0, action: 'move', args: [{ x: 200, y: 120 }] },
      { tick: 299, action: 'return', args: [] }
    ] };
    var a = replay.run(scenario), b = replay.run(scenario);
    assert(JSON.stringify(a) === JSON.stringify(b), 'Same seed and commands must yield identical worlds');
    assert(createDeployedWorld(12345).asteroids[0].angularVelocity !== createDeployedWorld(12346).asteroids[0].angularVelocity, 'Seed must control initialization');
    var initial = createDeployedWorld(12345), serialized = JSON.stringify(initial);
    var actual = replay.run({ version: 1, world: initial, ticks: 1, commands: scenario.commands.slice(0, 2) });
    var expected = sim.stepWorld(sim.issueMoveOrder(sim.selectShips(initial, ['tug-01']), { x: 200, y: 120 }), 1 / 30);
    assert(JSON.stringify(actual) === JSON.stringify(expected), 'Tick zero commands precede the first step, in listed order');
    assert(JSON.stringify(initial) === serialized, 'Replay must not mutate a captured world');
    assert(replay.run({ version: 1, world: initial, ticks: 0 }).elapsedSeconds === 0, 'Zero ticks must not advance');
    replay.check(actual, [{ path: 'ships.tug-01.order.kind', op: 'equal', value: 'move' }]);
    [function () { replay.check(actual, []); },
      function () { replay.check(actual, [{ path: 'ships.missing.damage', op: 'equal', value: 0 }]); },
      function () { replay.check(actual, [{ path: 'elapsedSeconds', op: 'near', value: 100, tolerance: 0.1 }]); },
      function () { replay.run({ version: 1, ticks: 1, commands: [{ tick: 1, action: 'return', args: [] }] }); },
      function () { replay.run({ version: 1, ticks: 1, commands: [{ tick: 0, action: 'typo', args: [] }] }); }
    ].forEach(function (reject) {
      var threw = false;
      try { reject(); } catch (error) { threw = true; }
      assert(threw, 'Malformed or failing scenarios must fail loudly');
    });
  });

  test('combat scenario replay produces the same complete world twice', function () {
    var replay = window.Driftworks.scenario;
    var scenario = { version: 1, seed: 12345, ticks: 2400, commands: [
      { tick: 0, action: 'select', args: [['escort-01', 'escort-02']] },
      { tick: 0, action: 'defend', args: [{ x: 360, y: 300 }] },
      { tick: 0, action: 'spawnHostileWave', args: [] }
    ] };
    var first = replay.run(scenario);
    var second = replay.run(scenario);
    assert(first.wrecks.length > 0 || first.ships.some(function (ship) { return ship.type === 'escort' && ship.disabled; }),
      'Determinism replay must exercise combat consequences');
    assert(JSON.stringify(first) === JSON.stringify(second),
      'Running the same combat scenario twice must produce identical complete worlds');
  });

  test('combat scenario matches after saving and reloading midway', function () {
    var replay = window.Driftworks.scenario;
    var commands = [
      { tick: 0, action: 'select', args: [['escort-01', 'escort-02']] },
      { tick: 0, action: 'defend', args: [{ x: 360, y: 300 }] },
      { tick: 0, action: 'spawnHostileWave', args: [] }
    ];
    var uninterrupted = replay.run({ version: 1, seed: 12345, ticks: 2400, commands: commands });
    var midpoint = replay.run({ version: 1, seed: 12345, ticks: 1200, commands: commands });
    var reloaded = sim.deserializeWorld(sim.serializeWorld(midpoint));
    var resumed = replay.run({ version: 1, world: reloaded, ticks: 1200 });
    assert(JSON.stringify(resumed) === JSON.stringify(uninterrupted),
      'A midpoint save/load must preserve the complete final combat world');
  });

  test('old saves gain deterministic combat defaults and repeated loading preserves encounters', function () {
    var old = createDeployedWorld(12345);
    delete old.combat;
    var repaired = sim.deserializeWorld(sim.serializeWorld(old));
    assert(repaired.combat.drones.length === 0 && repaired.combat.director.state === 'idle', 'Old saves should start with no encounters');
    var active = sim.spawnHostileWave(repaired);
    active = sim.stepWorld(active, 1 / 30);
    var loaded = sim.deserializeWorld(sim.serializeWorld(active));
    assert(JSON.stringify(loaded) === JSON.stringify(active), 'Encounter, cooldowns, RNG and IDs must survive loading');
    assert(JSON.stringify(sim.deserializeWorld(sim.serializeWorld(loaded))) === JSON.stringify(loaded), 'Loading must be idempotent');
    var spawned = sim.spawnHostileWave(loaded);
    assert(new Set(spawned.combat.drones.map(function (d) { return d.id; })).size === 6, 'Spawn IDs must remain unique across loading');
  });

  test('director warning and random sequence survive a save during the warning', function () {
    var world = sim.issueMineOrder(sim.selectShips(createDeployedWorld(12345), ['msv-hardshell']), 'ast-ceres-01');
    world = sim.stepWorld(world, 1 / 30);
    assert(world.combat.director.state === 'warning', 'Exposed work starts a warning');
    assert(world.combat.events.some(function (e) { return e.kind === 'contact-warning'; }), 'Warning originates in the simulation');
    var loaded = sim.deserializeWorld(sim.serializeWorld(world));
    for (var tick = 0; tick < 310; tick += 1) {
      world = sim.stepWorld(world, 1 / 30);
      loaded = sim.stepWorld(loaded, 1 / 30);
    }
    assert(world.combat.director.wavesSpawned === 1 && world.combat.drones.length > 0, 'Director spawns without Pixi');
    assert(JSON.stringify(world) === JSON.stringify(loaded), 'Warning continuation must reproduce the same wave');
  });

  test('battle replay matches after save/load and across render-frame groupings for 10000 ticks', function () {
    var initial = sim.spawnHostileWave(createDeployedWorld(12345));
    var a = initial, b = initial, ticks = 0, sawShot = false, sawDamage = false;
    // These are identical fixed ticks grouped as if frames ran at 30 Hz versus 5 Hz.
    while (ticks < 10000) {
      var count = Math.min(6, 10000 - ticks);
      for (var i = 0; i < count; i += 1) {
        a = sim.stepWorld(a, 1 / 30);
        sawShot = sawShot || a.combat.events.some(function (e) { return e.kind === 'weapon-fired'; });
        sawDamage = sawDamage || a.combat.events.some(function (e) { return e.kind === 'ship-damaged'; });
      }
      for (var j = 0; j < count; j += 1) b = sim.stepWorld(b, 1 / 30);
      ticks += count;
      if (ticks === 300) b = sim.deserializeWorld(sim.serializeWorld(b));
    }
    assert(sawShot && sawDamage, 'The replay must exercise weapons and damage');
    assert(JSON.stringify(a) === JSON.stringify(b), 'Frame grouping and mid-battle loading cannot affect outcomes');
    assert(initial.elapsedSeconds === 0 && initial.combat.drones.length === 3, 'Stepping must preserve the input world');
  });

  test('combat resolves simultaneous lethal fire once and leaves a recoverable wreck', function () {
    var world = sim.spawnHostileWave(createDeployedWorld(42));
    world.ships = world.ships.filter(function (ship) { return ship.id !== 'escort-02'; });
    var fighter = findShip(world, 'escort-01');
    fighter.damage = 0.8;
    var drone = world.combat.drones[0];
    world.combat.drones = [drone];
    drone.position = { x: fighter.position.x + 100, y: fighter.position.y };
    drone.underFire = 1.34;
    drone.fireCooldown = 0;
    var next = sim.stepWorld(world, 1 / 30);
    assert(findShip(next, fighter.id).disabled, 'A drone killed this tick still gets its final shot');
    assert(next.combat.drones.length === 0 && next.wrecks.length === 1, 'A fighter disabled this tick still completes its laser dwell');
    assert(next.combat.events.filter(function (e) { return e.kind === 'ship-destroyed'; }).length === 1, 'Destruction emits once');
    var later = sim.stepWorld(next, 1 / 30);
    assert(later.wrecks.length === 1 && later.combat.events.length === 0, 'Events and salvage must not repeat on later ticks');
  });

  test('disabled fighters and destroyed wrecks keep coasting on their last vectors', function () {
    var world = createDeployedWorld();
    var fighter = findShip(world, 'escort-01');
    fighter.position = { x: 100, y: 200 };
    fighter.velocity = { x: 12, y: -4 };
    world = sim.damageFighter(world, fighter.id, 1);
    fighter = findShip(world, fighter.id);
    assertClose(fighter.velocity.x, 12);
    assertClose(fighter.velocity.y, -4);
    world = sim.stepWorld(world, 2);
    fighter = findShip(world, fighter.id);
    assertClose(fighter.position.x, 124);
    assertClose(fighter.position.y, 192);
    assertClose(fighter.velocity.x, 12);
    assertClose(fighter.velocity.y, -4);

    world = sim.addWreck(world, { position: { x: 10, y: 20 }, velocity: { x: -3, y: 5 } });
    world = sim.stepWorld(world, 2);
    assertClose(world.wrecks[0].position.x, 4);
    assertClose(world.wrecks[0].position.y, 30);
    assertClose(world.wrecks[0].velocity.x, -3);
    assertClose(world.wrecks[0].velocity.y, 5);

    world.wrecks.push({ id: 'legacy-stationary-wreck', position: { x: 7, y: 9 } });
    world = sim.stepWorld(world, 2);
    assertClose(world.wrecks[1].position.x, 7);
    assertClose(world.wrecks[1].position.y, 9);
  });

  test('legacy wrecks without rotation render finite recovery geometry', function () {
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

  test('seeded RNG produces deterministic output', function () {
    var a = sim.createRng(1234);
    var b = sim.createRng(1234);
    var valuesA = [a(), a(), a(), a()];
    var valuesB = [b(), b(), b(), b()];
    assert(JSON.stringify(valuesA) === JSON.stringify(valuesB), 'Matching seeds should match exactly');
    assertClose(valuesA[0], 0.07329497812315822);
  });

  test('fixed-step advancement is deterministic', function () {
    var world = sim.issueMoveOrder(sim.selectShips(createDeployedWorld(), ['tug-01']), { x: 100, y: -90 });
    var a = sim.stepWorld(sim.stepWorld(world, 1 / 30), 1 / 30);
    var b = sim.stepWorld(sim.stepWorld(world, 1 / 30), 1 / 30);
    assert(JSON.stringify(a) === JSON.stringify(b), 'Repeated stepping from the same state should match');
    assert(a.elapsedSeconds > world.elapsedSeconds, 'Simulation clock should advance');
  });

  test('move orders transition to arrival', function () {
    var world = sim.issueMoveOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 240, y: -125 });
    var guard = 0;
    var escort = null;
    while (guard < 300) {
      escort = findShip(world, 'escort-01');
      if (escort.order.kind === 'idle') break;
      world = sim.stepWorld(world, 1 / 30);
      guard += 1;
    }
    escort = findShip(world, 'escort-01');
    assert(escort.order.kind === 'idle', 'Escort should arrive and clear its move order');
    assertClose(escort.position.x, 240);
    assertClose(escort.position.y, -125);
  });

  test('acceleration limits sudden direction reversal', function () {
    var world = sim.selectShips(createDeployedWorld(), ['tug-01']);
    var miner = findShip(world, 'tug-01');
    miner.position = { x: 0, y: 0 };
    miner.previousPosition = { x: 0, y: 0 };
    miner.velocity = { x: miner.speed, y: 0 };
    world = sim.issueMoveOrder(world, { x: -300, y: 0 });
    world = sim.stepWorld(world, 1 / 30);
    miner = findShip(world, 'tug-01');
    assert(miner.velocity.x > 0, 'Miner should not instantly reverse horizontal velocity');
  });

  test('industrial loads reduce acceleration through mass while retaining guidance speed', function () {
    ['tug-01'].forEach(function (id) {
      function cruise(load, ticks) {
        var world = sim.selectShips(createDeployedWorld(), [id]);
        var ship = findShip(world, id);
        ship.cargo = 1500 * load;
        ship.carryingSection = ship.type === 'tug' && load > 0;
        world = sim.issueMoveOrder(world, { x: ship.position.x + 10000, y: ship.position.y });
        for (var i = 0; i < ticks; i += 1) world = sim.stepWorld(world, 1 / 30);
        return world;
      }
      var empty = findShip(cruise(0, 1), id);
      var loaded = findShip(cruise(1, 1), id);
      assert(loaded.velocity.x < empty.velocity.x, 'Payload should reduce acceleration');
      var loadedWorld = cruise(1, 180);
      loaded = findShip(loadedWorld, id);
      empty = findShip(cruise(0, 180), id);
      assertClose(loaded.velocity.x, empty.velocity.x);
      assertClose(loaded.speed, empty.speed);
      assert(loaded.acceleration < empty.acceleration, 'Wet payload mass must reduce acceleration');
      if (id === 'tug-01') {
        var half = findShip(cruise(0.5, 1), id);
        assert(half.acceleration > loaded.acceleration && half.acceleration < empty.acceleration, 'Partial ore load should have an intermediate penalty');
      }
      loaded.cargo = 0;
      loaded.carryingSection = false;
      for (var i = 0; i < 180; i += 1) loadedWorld = sim.stepWorld(loadedWorld, 1 / 30);
      assertClose(findShip(loadedWorld, id).velocity.x, empty.velocity.x);
    });
  });

  test('picking up cargo does not instantly clamp existing velocity', function () {
    var world = sim.selectShips(createDeployedWorld(), ['tug-01']);
    var miner = findShip(world, 'tug-01');
    miner.velocity = { x: miner.speed, y: 0 };
    miner.cargo = miner.cargoCapacity;
    world = sim.issueMoveOrder(world, { x: miner.position.x + 10000, y: miner.position.y });
    var next = findShip(sim.stepWorld(world, 1 / 30), 'tug-01');
    assertClose(next.velocity.x, miner.speed);
    assert(miner.speed - next.velocity.x <= miner.acceleration / 30, 'Loaded ship should decelerate gradually');
  });

  test('rotation limits sudden in-place facing changes', function () {
    var world = sim.selectShips(createDeployedWorld(), ['escort-01']);
    var escort = findShip(world, 'escort-01');
    escort.position = { x: 0, y: 0 };
    escort.previousPosition = { x: 0, y: 0 };
    escort.velocity = { x: 0, y: escort.speed };
    escort.rotation = 0;
    escort.turnRate = 1.5;
    world = sim.issueMoveOrder(world, { x: 0, y: 300 });
    world = sim.stepWorld(world, 1 / 30);
    escort = findShip(world, 'escort-01');
    assert(escort.rotation > 0, 'Escort should begin rotating toward its travel direction');
    assert(escort.rotation <= escort.turnRate / 30 + 0.000001, 'Escort should not exceed max turn rate in one tick');
  });

  test('rotateToward uses the shortest wrapped angle', function () {
    var current = Math.PI - 0.02;
    var target = -Math.PI + 0.02;
    var next = sim.rotateToward(current, target, 0.03);
    assert(next > current, 'Wrapped target should rotate through +pi instead of the long way around');
    assertClose(sim.angleDelta(next, target), 0.01);
  });

  test('platform deployment waits through setup before extraction while carrier returns empty', function () {
    var world = sim.issueMineOrder(sim.selectShips(createDeployedWorld(), ['msv-hardshell']), 'ast-ceres-01');
    for (var i = 0; i < 1500; i++) world = sim.stepWorld(world, 1 / 30);
    assert(world.platforms[0].state === 'setting-up');
    assert(world.asteroids[0].ore === world.asteroids[0].oreInitial, 'No ore is mined during setup');
    for (i = 0; i < 6700; i++) world = sim.stepWorld(world, 1 / 30);
    assert(world.platforms[0].state === 'deployed');
    assert(world.asteroids[0].ore < world.asteroids[0].oreInitial);
    assert(findShip(world, 'tug-01').cargo === 0);
    assert(findShip(world, 'tug-01').docked);
  });

  test('hostile waves begin beyond the local map and approach from their entry bearing', function () {
    var world = createFreshWorld();
    var target = findShip(world, 'msv-hardshell').position;
    world = sim.spawnHostileWave(world);
    assert(world.combat.drones.length === 3, 'A debug wave should contain three raiders');
    world.combat.drones.forEach(function (drone) {
      var dx = drone.position.x - target.x, dy = drone.position.y - target.y;
      assert(Math.hypot(dx, dy) > 4700, 'Raiders should begin far enough out for sensor tracks to develop');
      assert(dx * drone.velocity.x + dy * drone.velocity.y < 0, 'Initial velocity should carry raiders inward');
    });
    var before = world.combat.drones.map(function (drone) {
      return Math.hypot(drone.position.x - target.x, drone.position.y - target.y);
    });
    world = sim.stepWorld(world, 1 / 30);
    world.combat.drones.forEach(function (drone, index) {
      assert(Math.hypot(drone.position.x - target.x, drone.position.y - target.y) < before[index],
        'Raiders should approach continuously rather than appearing at the battle line');
    });
  });

  test('platform transfer holds a zero-relative-velocity rendezvous for fifteen physical minutes', function () {
    var world = sim.issueMineOrder(sim.selectShips(createDeployedWorld(), ['msv-hardshell']), 'ast-ceres-01');
    var carrier;
    for (var i = 0; i < 2500; i += 1) {
      world = sim.stepWorld(world, 1 / 30);
      carrier = findShip(world, 'tug-01');
      if (carrier.cargoOperation) break;
    }
    assert(carrier.cargoOperation && carrier.cargoOperation.kind === 'deploy-platform', 'EVA handling should start after rendezvous');
    assert(world.platforms[0].state === 'carried', 'Platform must remain strapped on during handling');
    world = sim.deserializeWorld(sim.serializeWorld(world));
    var before = findShip(world, 'tug-01').cargoOperation.remainingSeconds;
    world = sim.stepWorld(world, 1 / 30);
    carrier = findShip(world, 'tug-01');
    assertClose(carrier.cargoOperation.remainingSeconds, before - 2);
    var asteroid = world.asteroids[0], platform = world.platforms[0];
    var angle = carrier.order.siteAngle + asteroid.rotation;
    var radius = sim.surfaceRadius(asteroid, carrier.order.siteAngle) * carrier.order.siteDepth;
    assertClose(carrier.position.x, asteroid.position.x + Math.cos(angle) * radius);
    assertClose(carrier.position.y, asteroid.position.y + Math.sin(angle) * radius);
    assertClose(carrier.velocity.x, -Math.sin(angle) * radius * asteroid.angularVelocity);
    assertClose(carrier.velocity.y, Math.cos(angle) * radius * asteroid.angularVelocity);
    for (i = 0; i < 500 && world.platforms[0].state === 'carried'; i += 1) world = sim.stepWorld(world, 1 / 30);
    assert(world.platforms[0].state === 'setting-up', 'Platform should release after the handling timer');
  });

  test('ore packets deliver platform production to mothership storage', function () {
    var world = sim.issueMineOrder(sim.selectShips(createDeployedWorld(), ['msv-hardshell']), 'ast-ceres-01');
    var guard = 0;
    while (world.mothership.storage.ore <= 0 && guard < 9000) {
      world = sim.stepWorld(world, 1 / 30);
      guard += 1;
    }
    assert(world.mothership.storage.ore > 0, 'Mothership should receive ore');
    assert(findShip(world, 'tug-01').cargo === 0, 'Miner cargo should empty after deposit');
  });

  test('mothership processes ore into depot construction sections', function () {
    var world = createDeployedWorld();
    world.mothership.storage.ore = 1500;
    world = sim.stepWorld(world, 1 / 30);
    assertClose(world.mothership.storage.ore, 0);
    assertClose(world.mothership.storage.depotSections, 1);
    assertClose(world.mothership.storage.constructionMass, 0);
  });

  test('tug carries a fabricated section to the depot site', function () {
    var world = createDeployedWorld();
    world.mothership.storage.depotSections = 1;
    world = sim.issueBuildOrder(sim.selectShips(world, ['tug-01']));
    var guard = 0;
    while (world.depot.builtStages < 1 && guard < 1200) {
      world = sim.stepWorld(world, 1 / 30);
      guard += 1;
    }
    assert(world.depot.builtStages === 1, 'Tug should deliver one depot section');
    assert(world.mothership.storage.depotSections === 0, 'Delivered section should leave mothership storage');
    assert(findShip(world, 'tug-01').carryingSection === false, 'Tug should no longer carry the section');
  });

  test('escorts can engage the same hostile with independent laser timers', function () {
    var escorts = createDeployedWorld().ships.filter(function (ship) { return ship.type === 'escort'; });
    escorts.forEach(function (ship) { ship.position = { x: 0, y: 0 }; });
    var drone = { id: 'shared-target', position: { x: 100, y: 0 } };
    var timers = {};
    var first = sim.stepDefenderWeapon(escorts[0], [drone], timers, 0.01);
    var second = sim.stepDefenderWeapon(escorts[1], [drone], timers, 0.01);
    assert(first.target === drone && second.target === drone, 'Both escorts should engage the same hostile');
    assert(first.paint && second.paint, 'Both escorts should visibly fire on the same frame');
    assert(!sim.stepDefenderWeapon(escorts[0], [drone], timers, 0.02).paint, 'First escort should respect its own laser cadence');
    assert(sim.stepDefenderWeapon(escorts[1], [drone], timers, 0.08).paint, 'Second escort should fire independently of the first timer');
    assert(sim.stepDefenderWeapon(escorts[0], [], timers, 0.1) === null, 'Destroyed targets should not remain reserved');
    drone.position.x = 1000;
    assert(sim.stepDefenderWeapon(escorts[0], [drone], timers, 0.1) === null, 'Escorts must still respect weapon range');
  });

  test('destroyed drones persist as distinct salvage wrecks across save and camera changes', function () {
    var world = createDeployedWorld();
    var destroyed = { position: { x: 300, y: 100 }, velocity: { x: 10, y: -5 } };
    world = sim.addWreck(sim.addWreck(world, destroyed), destroyed);
    assert(world.wrecks.length === 2 && world.wrecks[0].id !== world.wrecks[1].id, 'Each wreck needs a stable unique identity');
    var restored = sim.deserializeWorld(sim.serializeWorld(world));
    restored = game.withCamera(restored, { x: 100, y: 100, zoom: 2 });
    assert(JSON.stringify(restored.wrecks) === JSON.stringify(world.wrecks), 'Camera and save changes must preserve wrecks');
  });

  test('hauler picks up a wreck beneath its frame and salvages it exactly once', function () {
    var world = sim.addWreck(createDeployedWorld(), { position: { x: 165, y: 120 }, velocity: { x: 0, y: 1 } });
    world = sim.issueContextOrder(sim.selectShips(world, ['tug-01']), world.wrecks[0].position);
    assert(findShip(world, 'tug-01').order.kind === 'recover', 'Right-click should dispatch recovery');
    for (var rendezvousTick = 0; rendezvousTick < 300 && !findShip(world, 'tug-01').cargoOperation; rendezvousTick += 1) {
      world = sim.stepWorld(world, 1 / 30);
    }
    var hauler = findShip(world, 'tug-01');
    assert(hauler.cargoOperation && hauler.cargoOperation.kind === 'recover', 'Matched wreck pickup should begin EVA securing');
    assertClose(hauler.position.x, world.wrecks[0].position.x);
    assertClose(hauler.position.y, world.wrecks[0].position.y);
    assertClose(hauler.velocity.x, world.wrecks[0].velocity.x);
    assertClose(hauler.velocity.y, world.wrecks[0].velocity.y);
    assert(!hauler.towTarget && !world.wrecks[0].towedBy, 'Wreck must remain free until securing finishes');
    world = sim.deserializeWorld(sim.serializeWorld(world));
    for (var handlingTick = 0; handlingTick < 500 && !findShip(world, 'tug-01').towTarget; handlingTick += 1) {
      world = sim.stepWorld(world, 1 / 30);
    }
    hauler = findShip(world, 'tug-01');
    assert(hauler.towTarget && world.wrecks[0].towedBy === hauler.id, 'Pickup should attach the wreck');
    assertClose(world.wrecks[0].position.x, hauler.position.x);
    assertClose(world.wrecks[0].position.y, hauler.position.y);
    world = sim.issueMoveOrder(world, { x: 600, y: -200 });
    for (var i = 0; i < 120; i += 1) {
      world = sim.stepWorld(world, 1 / 30);
      hauler = findShip(world, 'tug-01');
      assertClose(world.wrecks[0].position.x, hauler.position.x);
      assertClose(world.wrecks[0].position.y, hauler.position.y);
      assertClose(world.wrecks[0].rotation, hauler.rotation);
    }
    assertClose(sim.physicalStats(world, hauler).massKg, 3075000 + hauler.propulsion.fuelKg);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    world = sim.issueReturnOrder(world);
    for (var tick = 0; tick < 1500; tick += 1) world = sim.stepWorld(world, 1 / 30);
    assert(!world.wrecks.some(function (wreck) { return wreck.id === 'wreck-1'; }), 'Delivered wreck should disappear even when combat creates new wrecks');
    assertClose(world.recovery.salvagedOre, 24);
    assertClose(world.mothership.storage.ore + world.mothership.storage.constructionMass, 24);
    assert(!findShip(world, 'tug-01').towTarget, 'Hauler should be free after delivery');
  });

  test('salvage-all is opt-in and sends the tug for every recoverable target', function () {
    var world = createDeployedWorld();
    world.combat.director.wavesSpawned = 3;
    world = sim.addWreck(world, { position: { x: 165, y: 120 }, velocity: { x: 0, y: 0 } });
    world = sim.addWreck(world, { position: { x: 175, y: 120 }, velocity: { x: 0, y: 0 } });
    assert(findShip(world, 'tug-01').order.kind === 'idle', 'The tug should not salvage automatically');
    world = sim.issueSalvageAllOrder(sim.selectShips(world, ['tug-01']));
    assert(findShip(world, 'tug-01').order.kind === 'recover' && findShip(world, 'tug-01').order.salvageAll,
      'Explicit salvage-all should begin a recovery trip');
    for (var i = 0; i < 6000 && world.wrecks.length; i += 1) world = sim.stepWorld(world, 1 / 30);
    assert(world.wrecks.length === 0, 'The tug should deliver every untowed wreck in successive trips');
    assertClose(world.recovery.salvagedOre, 48);
    assert(findShip(world, 'tug-01').docked, 'The tug should finish at the mothership');
  });

  test('disabled fighters cannot move or fire and recover after being carried home', function () {
    var world = createDeployedWorld();
    var fighter = findShip(world, 'escort-01');
    fighter.position = { x: 165, y: 120 };
    world = sim.damageFighter(world, fighter.id, 0.4);
    assert(!findShip(world, fighter.id).disabled, 'Partial damage should not disable the fighter');
    world = sim.damageFighter(world, fighter.id, 0.6);
    world = sim.issueMoveOrder(sim.selectShips(world, [fighter.id]), { x: 900, y: 900 });
    world = sim.stepWorld(world, 1 / 30);
    fighter = findShip(world, fighter.id);
    assert(fighter.disabled && fighter.order.kind === 'idle', 'Disabled fighter should reject movement');
    assertClose(fighter.position.x, 165);
    assert(sim.stepDefenderWeapon(fighter, [{ position: fighter.position }], {}, 1) === null, 'Disabled fighter must not shoot');
    world = sim.issueContextOrder(sim.selectShips(world, ['tug-01']), fighter.position);
    for (var i = 0; i < 1000 && !findShip(world, fighter.id).repairRemaining; i += 1) world = sim.stepWorld(world, 1 / 30);
    fighter = findShip(world, fighter.id);
    assert(fighter.disabled && fighter.repairRemaining > 0 && !fighter.towedBy, 'Delivery should start a docked repair');
    var mothership = world.ships.filter(function (ship) { return ship.type === 'mothership'; })[0];
    assertClose(fighter.position.x, mothership.position.x);
    assertClose(fighter.position.y, mothership.position.y);
    assert(!findShip(world, 'tug-01').towTarget, 'Hauler can leave while repairs proceed');
    world = sim.deserializeWorld(sim.serializeWorld(world));
    for (var j = 0; j < 400; j += 1) world = sim.stepWorld(world, 1 / 30);
    fighter = findShip(world, fighter.id);
    assert(!fighter.disabled && fighter.damage === 0, 'Repair should restore fighter');
    assertClose(world.recovery.repairedShips, 1);
    assertClose(world.recovery.salvagedOre, 0);
    world = sim.issueMoveOrder(sim.selectShips(world, [fighter.id]), { x: 900, y: 900 });
    assert(findShip(sim.stepWorld(world, 1 / 30), fighter.id).velocity.x > 0, 'Repaired fighter should accept orders');
  });

  test('recovery approach builds speed and arrives from a distance', function () {
    var world = sim.addWreck(createDeployedWorld(), { position: { x: 400, y: 120 }, velocity: { x: 1, y: 0 } });
    world = sim.issueContextOrder(sim.selectShips(world, ['tug-01']), world.wrecks[0].position);
    for (var i = 0; i < 30; i += 1) world = sim.stepWorld(world, 1 / 30);
    assert(findShip(world, 'tug-01').velocity.x > 35, 'Approach should retain velocity between ticks');
    for (var j = 0; j < 1500 && !findShip(world, 'tug-01').towTarget; j += 1) world = sim.stepWorld(world, 1 / 30);
    assert(findShip(world, 'tug-01').towTarget, 'Hauler should rendezvous and secure a nearby wreck');
  });

  test('repaired fighters launch slowly from inside the mothership before accepting orders', function () {
    var world = sim.damageFighter(createDeployedWorld(), 'escort-01', 1);
    var fighter = findShip(world, 'escort-01');
    var mothership = world.ships.filter(function (ship) { return ship.type === 'mothership'; })[0];
    mothership.rotation = Math.PI / 2;
    fighter.repairRemaining = 1 / 30;
    world = sim.stepWorld(world, 1 / 30);
    fighter = findShip(world, fighter.id);
    assert(fighter.launchElapsed === 0 && fighter.disabled, 'Repair should enter a protected launch phase');
    assertClose(fighter.position.x, mothership.position.x);
    assertClose(fighter.position.y, mothership.position.y);
    for (var i = 0; i < 90; i += 1) {
      var before = findShip(world, fighter.id).position;
      world = sim.stepWorld(world, 1 / 30);
      var after = findShip(world, fighter.id).position;
      assert(Math.hypot(after.x - before.x, after.y - before.y) <= 18 / 30 + 0.000001, 'Launch should ease out below normal flight speed');
    }
    fighter = findShip(world, fighter.id);
    assertClose(fighter.position.x, mothership.position.x);
    assertClose(fighter.position.y, mothership.position.y + 36);
    world = sim.issueMoveOrder(sim.selectShips(world, [fighter.id]), { x: 900, y: 900 });
    assert(findShip(world, fighter.id).order.kind === 'idle', 'Orders should not interrupt clearance from the dock');
    world = sim.deserializeWorld(sim.serializeWorld(world));
    for (var j = 0; j < 100; j += 1) world = sim.stepWorld(world, 1 / 30);
    fighter = findShip(world, fighter.id);
    assert(!fighter.disabled && fighter.launchElapsed === null, 'Cleared fighter should become operational');
    assertClose(fighter.position.y, mothership.position.y + 72);
    assertClose(world.recovery.repairedShips, 1);
  });

  test('recovery cannot double-claim a wreck or stack payloads', function () {
    var world = sim.addWreck(createDeployedWorld(), { position: { x: 165, y: 120 }, velocity: { x: 1, y: 0 } });
    world.ships.push(sim.createShip('tug-02', 'Second Hauler', 'tug', 160, 120, 62));
    world = sim.issueContextOrder(sim.selectShips(world, ['tug-01', 'tug-02']), world.wrecks[0].position);
    for (var rendezvousTick = 0; rendezvousTick < 300 && !world.ships.some(function (ship) { return ship.cargoOperation; }); rendezvousTick += 1) {
      world = sim.stepWorld(world, 1 / 30);
    }
    assert(world.ships.filter(function (ship) { return ship.cargoOperation; }).length === 1, 'Only one hauler can secure each wreck');
    for (var claimTick = 0; claimTick < 500 && !world.ships.some(function (ship) { return ship.towTarget; }); claimTick += 1) {
      world = sim.stepWorld(world, 1 / 30);
    }
    assert(world.ships.filter(function (ship) { return ship.towTarget; }).length === 1, 'Only the securing hauler can attach the wreck');
    var loaded = findShip(world, 'tug-01');
    world = sim.issueBuildOrder(sim.selectShips(world, [loaded.id]));
    assert(findShip(world, loaded.id).order.kind === 'return', 'Carried hull prevents accepting a module');
    var other = findShip(world, 'tug-02');
    other.carryingSection = true;
    world = sim.addWreck(world, { position: { x: 400, y: 100 }, velocity: { x: 1, y: 0 } });
    world = sim.issueContextOrder(sim.selectShips(world, [other.id]), world.wrecks[1].position);
    assert(findShip(world, other.id).order.kind !== 'recover', 'Carried module prevents accepting a hull');
  });

  test('legacy saves receive empty recovery defaults', function () {
    var world = createDeployedWorld();
    delete world.wrecks;
    delete world.nextWreckId;
    delete world.recovery;
    world.ships.forEach(function (ship) {
      delete ship.towTarget;
      delete ship.towedBy;
      delete ship.disabled;
      delete ship.repairRemaining;
    });
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assert(world.wrecks.length === 0 && world.nextWreckId === 1, 'Legacy world should load without wrecks');
    assert(world.ships.every(function (ship) { return !ship.disabled && !ship.towTarget; }), 'Legacy ships should stay operational');
  });

  test('operation exposure starts quiet and rises with industrial work', function () {
    var world = createDeployedWorld();
    assertClose(sim.operationExposure(world), 0);
    world = sim.issueMineOrder(sim.selectShips(world, ['msv-hardshell']), 'ast-ceres-01');
    assert(sim.operationExposure(world) > 0, 'Mining work should expose the operation to contact risk');
    world.mothership.storage.depotSections = 1;
    assert(sim.operationExposure(world) > 1, 'Ready construction sections should add operational exposure');
  });

  test('order line local vector rotates back to world target direction', function () {
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

  test('engine plume mixes fixed maneuvering thrusters', function () {
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

  test('camera math uses logical screen pixels under high-DPI rendering', function () {
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

  test('salvage-all intercepts a wreck moving faster than the tug work-zone speed', function () {
    var world = sim.addWreck(createDeployedWorld(), {
      position: { x: 400, y: 120 }, velocity: { x: 82, y: 0 }
    });
    world = sim.issueSalvageAllOrder(sim.selectShips(world, ['tug-01']));
    for (var i = 0; i < 1800 && !findShip(world, 'tug-01').cargoOperation; i += 1) {
      world = sim.stepWorld(world, 1 / 30);
    }
    var hauler = findShip(world, 'tug-01');
    var wreck = world.wrecks[0];
    assert(hauler.cargoOperation && hauler.cargoOperation.kind === 'recover',
      'Moving-frame guidance should catch a fast outbound wreck');
    assertClose(hauler.position.x, wreck.position.x);
    assertClose(hauler.position.y, wreck.position.y);
    assertClose(hauler.velocity.x, wreck.velocity.x);
    assertClose(hauler.velocity.y, wreck.velocity.y);
  });

  test('offscreen contacts clamp to the viewport edge and hand off once visible', function () {
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

  test('contact ETA uses the world-space operating area rather than the camera viewport', function () {
    var drone = { position: { x: 1900, y: 0 }, velocity: { x: -60, y: 0 } };
    assertClose(game.contactEtaSeconds(drone, { x: 0, y: 0 }, 700), 20);
    drone.position = { x: 700, y: 0 };
    assertClose(game.contactEtaSeconds(drone, { x: 0, y: 0 }, 700), 0);
    drone.position = { x: 1900, y: 0 };
    drone.velocity = { x: 60, y: 0 };
    assert(game.contactEtaSeconds(drone, { x: 0, y: 0 }, 700) === Infinity,
      'A receding contact should not claim an arrival time');
  });

  test('inbound sensor tracks resolve through stable distance-based stages', function () {
    function droneAt(distance) { return [{ position: { x: distance, y: 0 } }]; }
    var center = { x: 0, y: 0 };
    assert(game.contactTrackState(droneAt(4800), center).key === 'possible', 'Distant tracks should be ambiguous');
    assert(game.contactTrackState(droneAt(3000), center).key === 'tracking', 'Continued observation should establish a track');
    assert(game.contactTrackState(droneAt(1600), center).key === 'resolved', 'Approaching groups should resolve');
    assert(game.contactTrackState(droneAt(900), center).key === 'local', 'Near contacts should become local tracks');
  });

  test('focus camera tracks the current selected ship position', function () {
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

  test('mining effect becomes diffuse when miner overlaps asteroid', function () {
    var position = { x: 40, y: -20 };
    var rotation = Math.PI / 2;
    var geometry = game.miningEffectGeometry(position, position, rotation);

    assert(geometry.beamOrigin === null, 'Overlapped mining should not draw a directional beam');
    assertClose(geometry.contact.x, 40);
    assertClose(geometry.contact.y, -2);
    assertClose(geometry.seedAngle, Math.PI / 2);
  });

  test('mothership drum bands roll top to bottom across the side silhouette', function () {
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

  test('mothership rotating details share one cylindrical projection', function () {
    var top = game.drumSurfaceAt(Math.PI / 2);
    var near = game.drumSurfaceAt(0);
    assertClose(top.y, 16.5);
    assertClose(top.depth, 0);
    assertClose(near.y, 0);
    assertClose(near.depth, 1);
  });

  test('craft detail fades continuously across zoom boundaries', function () {
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

  test('platform tangent projection preserves cross-slope length and clamps the limb', function () {
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

  test('raised platform preserves ground contacts while height separates the chassis', function () {
    var normal={x:0.48,y:0.64,z:0.6};
    var foot=game.platformRaisedPoint(normal,4,7,0);
    var body=game.platformRaisedPoint(normal,4,7,8);
    assertClose(body.x-foot.x,8*normal.x); assertClose(body.y-foot.y,8*normal.y);
    var front=game.platformRaisedPoint({x:0,y:0,z:1},4,7,8);
    assertClose(front.x,4); assertClose(front.y,7);
    var limb=game.platformRaisedPoint({x:1,y:0,z:0},4,7,8);
    assertClose(limb.x,8.8); assertClose(limb.y,7);
  });

  test('gameplay landing persists, attaches to the rotating site and gates setup', function () {
    var world=sim.createInitialWorld(),p=world.platforms[0],a=world.asteroids[0];
    p.state='setting-up';p.asteroidId=a.id;p.siteAngle=0;p.siteDepth=.5;
    p.setupRemainingSeconds=10800;p.landingElapsedSeconds=0;p.landingReleaseRotation=a.rotation;p.landingSitePending=true;
    var start=JSON.stringify(world),next=sim.stepWorld(world,1);
    assert(JSON.stringify(world)===start,'Public stepping must replace the world');
    assertClose(next.platforms[0].landingElapsedSeconds,1);
    assertClose(next.platforms[0].setupRemainingSeconds,10800);
    assert(!next.platforms[0].landingSitePending,'The game chooses a free nearby footprint');
    var loaded=sim.deserializeWorld(sim.serializeWorld(next));
    loaded=sim.deserializeWorld(sim.serializeWorld(loaded));
    assertClose(loaded.platforms[0].landingElapsedSeconds,1);
    next=sim.stepWorld(loaded,20);assertClose(next.platforms[0].landingElapsedSeconds,21);
    assertClose(game.platformDeployment(next.platforms[0]),1);
    assertClose(next.platforms[0].setupRemainingSeconds,10800);
    next=sim.stepWorld(next,17);assertClose(next.platforms[0].landingElapsedSeconds,38);
    assertClose(next.platforms[0].setupRemainingSeconds,10800);
    next=sim.stepWorld(next,1);assertClose(next.platforms[0].setupRemainingSeconds,10740);
    var runtime=window.Driftworks.miningLanding;
    assert(runtime.sample(32).contact && runtime.sample(32).ramps===0);
    assert(runtime.sample(38).done && runtime.sample(38).ramps===1);
    delete next.platforms[0].landingElapsedSeconds;
    loaded=sim.deserializeWorld(sim.serializeWorld(next));
    assert(loaded.platforms[0].landingElapsedSeconds===undefined,'Old saves retain setup instead of replaying a landing');
    assertClose(loaded.platforms[0].setupRemainingSeconds,10740);
  });

  test('platform presentation follows lifecycle without mutating state', function () {
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

  test('excavation artwork only runs when extraction can run', function () {
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

  test('mothership lighting remains fixed in world space as the hull turns', function () {
    var initial = game.mothershipLocalLight(0);
    var quarterTurn = game.mothershipLocalLight(Math.PI / 2);
    assertClose(initial.x, -0.813733);
    assertClose(initial.y, -0.581238);
    assertClose(quarterTurn.x, -0.581238);
    assertClose(quarterTurn.y, 0.813733);
    assertClose(quarterTurn.z, initial.z);
  });

  test('mothership habitat shader tracks spin, world light and screen pixel size', function () {
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

  test('mothership habitat hides lamps rotating across the far side', function () {
    var front = game.mothershipHabitatLampVisibility(0);
    var back = game.mothershipHabitatLampVisibility(Math.PI);
    var shoulder = game.mothershipHabitatLampVisibility(Math.PI / 2);
    assertClose(front.left, 1); assertClose(front.right, 0);
    assertClose(back.left, 0); assertClose(back.right, 1);
    assertClose(shoulder.left, 0); assertClose(shoulder.right, 0);
  });

  test('save serialization round-trips world state', function () {
    var world = sim.issueMoveOrder(sim.selectShips(createDeployedWorld(), ['tug-01']), { x: -40, y: 90 });
    var restored = sim.deserializeWorld(sim.serializeWorld(world));
    assert(JSON.stringify(restored) === JSON.stringify(world), 'Restored world should match saved world');
  });

  test('unsupported save versions are rejected', function () {
    var rejected = false;
    try {
      sim.deserializeWorld(JSON.stringify({ version: 99, world: createDeployedWorld() }));
    } catch (error) {
      rejected = /Unsupported Driftworks save version/.test(error.message);
    }
    assert(rejected, 'Unsupported versions should throw a useful error');
  });

  test('semantic zoom preserves baseline and reveals relative scale continuously', function () {
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

  test('extended zoom retains the world point under the pointer and respects limits', function () {
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

  test('detail zoom magnifies all hulls fourfold without changing relative proportions', function () {
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

  test('close zoom recovery targets do not capture empty-space move orders', function () {
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

  test('zooming out preserves default size hierarchy for every object class', function () {
    [0.35, 0.5, 0.8, 1].forEach(function (zoom) {
      ['mothership', 'depot', 'escort', 'miner', 'tug'].forEach(function (type) {
        assertClose(game.semanticScale(type, zoom) * zoom, 1);
      });
    });
  });

  test('UI effects retain pixel size across live zoom changes while selection follows ships', function () {
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

  test('short move orders accelerate instead of teleporting within the old arrival radius', function () {
    var world = createDeployedWorld();
    var fighter = findShip(world, 'escort-01');
    var start = { x: fighter.position.x, y: fighter.position.y };
    var target = { x: start.x + 4, y: start.y };
    world = sim.issueMoveOrder(sim.selectShips(world, [fighter.id]), target);
    var arrived = false;
    for (var i = 0; i < 600; i += 1) {
      var before = findShip(world, fighter.id);
      world = sim.stepWorld(world, 1 / 30);
      var after = findShip(world, fighter.id);
      assertClose(after.previousPosition.x, before.position.x);
      assertClose(after.previousPosition.y, before.position.y);
      var travel = Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y);
      var speed = Math.hypot(before.velocity.x, before.velocity.y);
      assert(travel <= (speed + after.acceleration / 30) / 30 + 0.001,
        'Every step must respect acceleration, including the final arrival');
      if (after.order.kind === 'idle') {
        assertClose(after.position.x, target.x);
        arrived = true;
        break;
      }
    }
    assert(arrived, 'Precision arrival must settle');
  });

  test('deployed platforms retain rotating surface sites across saves', function () {
    [-0.012, 0.012].forEach(function (spin) {
      var world = createDeployedWorld(); world.asteroids[0].angularVelocity = spin;
      world = sim.issueMineOrder(sim.selectShips(world, ['msv-hardshell']), world.asteroids[0].id);
      for (var i = 0; i < 1200; i++) world = sim.stepWorld(world, 1 / 30);
      assert(world.platforms[0].state === 'setting-up');
      world = sim.deserializeWorld(sim.serializeWorld(world));
      world = sim.stepWorld(world, 1);
      var p = world.platforms[0], a = world.asteroids[0], angle = p.siteAngle + a.rotation;
      var landing=window.Driftworks.miningLanding.sample(p.landingElapsedSeconds);
      var dx=landing.offset[0]/sim.METERS_PER_UNIT,dy=landing.offset[1]/sim.METERS_PER_UNIT;
      assertClose(p.position.x, a.position.x + Math.cos(angle) * (sim.surfaceRadius(a, p.siteAngle) * p.siteDepth+dx)-Math.sin(angle)*dy);
      assertClose(p.position.y, a.position.y + Math.sin(angle) * (sim.surfaceRadius(a, p.siteAngle) * p.siteDepth+dx)+Math.cos(angle)*dy);
      assertClose(a.radius, 300);
    });
  });

  test('legacy fields merge ore into one large asteroid', function () {
    var world = createDeployedWorld();
    world.asteroids.push(sim.createAsteroid('old', 'Old rock', 100, 100, 80));
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assert(world.asteroids.length === 1);
    assertClose(world.asteroids[0].ore, 10205);
  });

  test('mothership dispatches the existing cargo ship and rejects duplicate jobs', function () {
    var world = createDeployedWorld();
    assert(world.ships.length === 4 && world.ships.every(function (s) { return s.type !== 'miner' && s.type !== 'cargo'; }));
    assert(world.platforms.every(function (p) { return p.state === 'stored'; }));
    world = sim.issueMineOrder(sim.selectShips(world, ['msv-hardshell']), 'ast-ceres-01');
    var carrier = findShip(world, 'tug-01');
    assert(carrier.order.kind === 'deploy' && !carrier.platformId, 'Cargo ship must collect platform at mothership first');
    assert(carrier.order.siteDepth >= 0.3 && carrier.order.siteDepth <= 0.75);
    var order = JSON.stringify(carrier.order);
    assert(!sim.canDeployPlatform(world));
    world = sim.issueMineOrder(world, 'ast-ceres-01');
    assert(JSON.stringify(findShip(world, 'tug-01').order) === order);
  });

  test('mining plume uses hull-local geometry and only appears while landed', function () {
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

  test('physical scale and payload masses have canonical values', function () {
    var world = createDeployedWorld();
    var miner = findShip(world, 'tug-01');
    assertClose(sim.asteroidPhysicalStats(world.asteroids[0]).diameterM, 10000);
    assertClose(sim.physicalStats(world, miner).accelerationMps2, 588399 / 3450000);
    miner.cargo = 1500;
    assertClose(sim.physicalStats(world, miner).massKg, 4950000);
    assertClose(sim.physicalStats(world, miner).accelerationMps2, 588399 / 4950000);
    miner.cargo = 0;
    var tug = findShip(world, 'tug-01');
    var fighter = findShip(world, 'escort-01');
    fighter.disabled = true;
    tug.towTarget = { kind: 'ship', id: fighter.id };
    assertClose(sim.physicalStats(world, tug).massKg, 3537000);
    fighter.physical.dryMassKg = 3000000;
    assertClose(sim.physicalStats(world, tug).accelerationMps2, 588399 / 6462000);
  });

  test('legacy physical-unit migration preserves load fraction and runs once', function () {
    var world = createDeployedWorld();
    delete world.physicalUnitsVersion;
    world.asteroids[0].ore = 540;
    world.asteroids[0].oreInitial = 540;
    world.contract.quotaOre = 240;
    var miner = findShip(world, 'tug-01');
    delete miner.physical;
    miner.cargo = 40;
    miner.cargoCapacity = 80;
    world.mothership.storage.constructionMass = 40;
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assertClose(findShip(world, 'tug-01').cargo, 750);
    assertClose(world.asteroids[0].ore, 10125);
    assertClose(world.mothership.storage.constructionMass, 750);
    assertClose(world.contract.quotaOre, 4500);
    assert(JSON.stringify(sim.deserializeWorld(sim.serializeWorld(world))) === JSON.stringify(world));
  });

  test('textured thrusters ramp by ship role and stop on coast or disable', function () {
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

  test('fighter groups form up and retain their defense anchor', function () {
    for (var count = 2; count <= 7; count += 1) {
      var world = createDeployedWorld();
      while (world.ships.filter(function (s) { return s.type === 'escort'; }).length < count) world = sim.spawnFighter(world);
      var ids = world.ships.filter(function (s) { return s.type === 'escort'; }).map(function (s) { return s.id; });
      world = game.issueVisualContextOrder(sim.selectShips(world, ids), { x: 900, y: -500 });
      for (var i = 0; i < 600; i += 1) world = sim.stepWorld(world, 1 / 30);
      var slots = {};
      ids.forEach(function (id) {
        var s = findShip(world, id);
        assert(s.order.kind === 'defend');
        assert(Math.hypot(s.position.x - s.order.target.x, s.position.y - s.order.target.y) < 6.1, 'Formation should settle within slot tolerance');
        slots[s.order.offset.x + ':' + s.order.offset.y] = true;
      });
      assert(Object.keys(slots).length === count, 'Each fighter needs a distinct slot');
    }
  });

  test('fighters slide at the leash and return after threats leave', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    deployTestFormation(world);
    var s = findShip(world, 'escort-01');
    s.position = { x: sim.FIGHTER_LEASH - 1, y: 0 };
    var startY = s.position.y;
    for (var i = 0; i < 300; i += 1) {
      s = findShip(world, s.id);
      var threat = { position: { x: s.position.x - 50, y: s.position.y } };
      world = sim.stepWorld(world, 1 / 30, [threat]);
      s = findShip(world, s.id);
      assert(Math.hypot(s.position.x, s.position.y) <= sim.FIGHTER_LEASH + 35, 'Guidance should stay near leash without teleporting');
    }
    assert(Math.abs(s.position.y - startY) > 50, 'Must slide instead of stopping at boundary');
    for (i = 0; i < 600; i += 1) world = sim.stepWorld(world, 1 / 30);
    s = findShip(world, s.id);
    assert(Math.hypot(s.position.x, s.position.y) < 14, 'Must reclaim the anchor neighborhood');
  });

  test('ship defense follows its anchor and survives saves', function () {
    var world = createDeployedWorld();
    var miner = findShip(world, 'tug-01');
    world = game.issueVisualContextOrder(sim.selectShips(world, ['escort-01']), miner.position);
    assert(findShip(world, 'escort-01').order.anchorShipId === miner.id);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    findShip(world, miner.id).position.x += 100;
    world = sim.stepWorld(world, 1 / 30);
    assertClose(findShip(world, 'escort-01').order.anchor.x, miner.position.x + 100);
  });

  test('formation travels together at the slower wingmate pace', function () {
    var world = createDeployedWorld();
    findShip(world, 'escort-02').speed = 55;
    world = sim.issueDefendOrder(sim.selectShips(world, ['escort-01', 'escort-02']), { x: 1800, y: -150 });
    var arrival = {};
    for (var i = 0; i < 1600; i += 1) {
      world = sim.stepWorld(world, 1 / 30);
      var a = findShip(world, 'escort-01'), b = findShip(world, 'escort-02');
      if (i > 120) {
        var ax = a.position.x - a.order.offset.x, ay = a.position.y - a.order.offset.y;
        var bx = b.position.x - b.order.offset.x, by = b.position.y - b.order.offset.y;
        assert(Math.hypot(ax - bx, ay - by) < 20, 'Fast fighter must stay within a loose formation throughout transit');
      }
      [a, b].forEach(function (s) {
        if (!arrival[s.id] && Math.hypot(s.position.x - s.order.anchor.x - s.order.offset.x, s.position.y - s.order.anchor.y - s.order.offset.y) < 15) arrival[s.id] = i;
      });
    }
    assert(arrival['escort-01'] && arrival['escort-02'], 'Both fighters must reach the destination');
    assert(Math.abs(arrival['escort-01'] - arrival['escort-02']) <= 30, 'Wingmates should arrive within one second');
  });

  test('formation waits for stragglers and releases disabled wingmates', function () {
    var world = createDeployedWorld();
    findShip(world, 'escort-02').position.x = -700;
    world = sim.issueDefendOrder(sim.selectShips(world, ['escort-01', 'escort-02']), { x: 1800, y: 0 });
    var start = findShip(world, 'escort-01').order.formation.position.x;
    for (var i = 0; i < 30; i += 1) world = sim.stepWorld(world, 1 / 30);
    assertClose(findShip(world, 'escort-01').order.formation.position.x, start);
    world = sim.damageFighter(world, 'escort-02', 1);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    for (i = 0; i < 900; i += 1) world = sim.stepWorld(world, 1 / 30);
    var s = findShip(world, 'escort-01');
    assert(Math.hypot(s.position.x - s.order.anchor.x - s.order.offset.x, s.position.y - s.order.anchor.y - s.order.offset.y) < 14, 'Survivor must continue without waiting forever');
  });

  test('fighter slot tolerance leaves small deviations alone and corrects large ones', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    for (var i = 0; i < 600; i += 1) world = sim.stepWorld(world, 1 / 30);
    var s = findShip(world, 'escort-01');
    s.position = { x: s.order.target.x + 3, y: s.order.target.y };
    s.velocity = { x: 0, y: 0 };
    var start = { x: s.position.x, y: s.position.y };
    for (i = 0; i < 60; i += 1) world = sim.stepWorld(world, 1 / 30);
    s = findShip(world, s.id);
    assert(Math.hypot(s.position.x - start.x, s.position.y - start.y) < 0.01, 'Harmless slot deviation must not trigger correction');
    s.position.x += 40;
    for (i = 0; i < 180; i += 1) world = sim.stepWorld(world, 1 / 30);
    s = findShip(world, s.id);
    assert(Math.hypot(s.position.x - s.order.target.x, s.position.y - s.order.target.y) < 6.1, 'Large errors must still be corrected');
    var saved = sim.deserializeWorld(sim.serializeWorld(world));
    assert(JSON.stringify(sim.stepWorld(saved, 1 / 30)) === JSON.stringify(sim.stepWorld(world, 1 / 30)), 'Style must remain deterministic across saves');
  });

  test('combat loosens the wing gradually without reassigning slots', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01', 'escort-02']), { x: 0, y: 0 });
    for (var i = 0; i < 600; i += 1) world = sim.stepWorld(world, 1 / 30);
    var slots = world.ships.filter(function (s) { return s.type === 'escort'; }).map(function (s) { return JSON.stringify(s.order.offset); });
    var threats = [{ position: { x: 200, y: 0 } }];
    world = sim.stepWorld(world, 1 / 30, threats);
    assert(findShip(world, 'escort-01').order.formation.looseness < 0.05, 'Combat transition should not jump');
    for (i = 0; i < 180; i += 1) world = sim.stepWorld(world, 1 / 30, threats);
    assert(findShip(world, 'escort-01').order.formation.looseness > 0.9, 'Nearby threats should open the formation');
    for (i = 0; i < 900; i += 1) world = sim.stepWorld(world, 1 / 30);
    world.ships.filter(function (s) { return s.type === 'escort'; }).forEach(function (s, index) {
      assert(JSON.stringify(s.order.offset) === slots[index], 'Nominal slots must remain stable');
      assert(s.order.formation.looseness < 0.01, 'Wing should tighten after combat');
      assert(Math.hypot(s.position.x - s.order.target.x, s.position.y - s.order.target.y) < 6.1, 'Wing should regroup within tolerance');
    });
  });

  test('defender kites a closing raider before entering its firing range', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    deployTestFormation(world);
    var s = findShip(world, 'escort-01');
    s.position = { x: 0, y: 0 };
    s.velocity = { x: 80, y: 0 }; // Already approaching: the AI must brake proactively.
    var threat = { position: { x: 290, y: 0 }, velocity: { x: -60, y: 0 } };
    var firingFrames = 0;
    for (var i = 0; i < 150; i += 1) {
      s = findShip(world, s.id);
      var dx = s.position.x - threat.position.x, dy = s.position.y - threat.position.y, d = Math.hypot(dx, dy);
      threat.velocity = { x: dx / d * 60, y: dy / d * 60 };
      world = sim.stepWorld(world, 1 / 30, [threat]);
      threat.position.x += threat.velocity.x / 30; threat.position.y += threat.velocity.y / 30;
      s = findShip(world, s.id);
      var gap = Math.hypot(s.position.x - threat.position.x, s.position.y - threat.position.y);
      assert(gap > sim.RAIDER_RANGE, 'Defender should avoid raider fire throughout approach');
      if (gap <= sim.FIGHTER_RANGE) firingFrames += 1;
    }
    assert(firingFrames > 100, 'Kiting must retain enough range to return fire');
  });

  test('defender avoids retreating into a second raider', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    deployTestFormation(world);
    var s = findShip(world, 'escort-01');
    s.position = { x: 0, y: 0 };
    var threats = [{ position: { x: 230, y: 0 } }, { position: { x: -240, y: 0 } }];
    for (var i = 0; i < 60; i += 1) {
      world = sim.stepWorld(world, 1 / 30, threats);
      s = findShip(world, s.id);
      threats.forEach(function (t) { assert(Math.hypot(t.position.x - s.position.x, t.position.y - s.position.y) > sim.RAIDER_RANGE, 'Escape route must respect both threats'); });
    }
    assert(Math.abs(s.position.y) > 30, 'Fighter should escape sideways between opposing threats');
  });

  test('defenders favor finishing an enemy already under sustained fire', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    var s = findShip(world, 'escort-01');
    s.position = { x: 0, y: 0 };
    var fresh = { position: { x: 250, y: 0 }, underFire: 0 };
    var damaged = { position: { x: 265, y: 0 }, underFire: 1 };
    assert(sim.stepDefenderWeapon(s, [fresh, damaged], {}, 1 / 30).target === damaged, 'Finish reachable weakened enemies');
  });

  function deployTestFormation(world) {
    var s = findShip(world, 'escort-01');
    var formation = world.formations[s.order.groupId];
    formation.position = { x: s.order.anchor.x, y: s.order.anchor.y };
    formation.relocating = false;
  }

  test('out-of-leash contact cannot crash the entire simulation', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    deployTestFormation(world);
    findShip(world, 'escort-01').position = { x: 650, y: 0 };
    world = sim.issueMoveOrder(sim.selectShips(world, ['tug-01']), { x: -400, y: -90 });
    var start = findShip(world, 'tug-01').position.x;
    var threat = { position: { x: 1100, y: 0 } }; // Nearby fighter scan sees it; anchor scan excludes it.
    for (var i = 0; i < 30; i += 1) world = sim.stepWorld(world, 1 / 30, [threat]);
    assert(world.elapsedSeconds > 0.9 && findShip(world, 'tug-01').position.x < start, 'Clock and unrelated ships must keep moving');
  });

  test('new formation orders disengage from old combat and reach their destination', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    deployTestFormation(world);
    findShip(world, 'escort-01').position = { x: 0, y: 0 };
    var id = findShip(world, 'escort-01').order.groupId;
    var threat = { position: { x: 270, y: 0 } };
    world = sim.issueDefendOrder(world, { x: -450, y: 0 });
    assert(findShip(world, 'escort-01').order.groupId === id, 'Whole-wing orders retain the formation identity');
    var reached = false;
    for (var i = 0; i < 300; i += 1) {
      world = sim.stepWorld(world, 1 / 30, [threat]);
      if (findShip(world, 'escort-01').position.x < -420) reached = true;
    }
    assert(reached, 'Kiting must not pin a retreating formation in its old fight');
  });

  test('persistent formations close gaps after casualties and reassignment', function () {
    var world = sim.spawnFighter(sim.spawnFighter(createDeployedWorld()));
    var ids = world.ships.filter(function (s) { return s.type === 'escort'; }).map(function (s) { return s.id; });
    world = sim.issueDefendOrder(sim.selectShips(world, ids), { x: 500, y: 0 });
    var id = findShip(world, ids[0]).order.groupId;
    world = sim.damageFighter(world, ids[3], 1);
    world = sim.stepWorld(world, 1 / 30);
    assert(world.formations[id].memberIds.length === 3, 'Disabled member leaves the persistent wing');
    var offsets = world.formations[id].memberIds.map(function (member) { return findShip(world, member).order.offset; });
    assert(Math.abs(offsets.reduce(function (sum, p) { return sum + p.x; }, 0)) < 0.001, 'Three survivors form a centered V');
    world = sim.issueDefendOrder(sim.selectShips(world, [ids[2]]), { x: -800, y: 0 });
    world = sim.stepWorld(world, 1 / 30);
    assert(world.formations[id].memberIds.length === 2, 'Reassigned fighter leaves its old wing');
    var a = findShip(world, ids[0]).order.offset, b = findShip(world, ids[1]).order.offset;
    assertClose(a.x + b.x, 0); assertClose(a.y + b.y, 0);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assert(world.formations[id].memberIds.length === 2, 'Membership survives saves');
    world = sim.damageFighter(world, ids[1], 1);
    world = sim.stepWorld(world, 1 / 30);
    assertClose(findShip(world, ids[0]).order.offset.x, 0);
    assertClose(findShip(world, ids[0]).order.offset.y, 0);
    world = sim.damageFighter(world, ids[0], 1);
    world = sim.stepWorld(world, 1 / 30);
    assert(!world.formations[id], 'Empty formations are retired');
  });

  test('moving wings preserve momentum and wheel through direction changes', function () {
    [Math.PI / 9, Math.PI * 2 / 9].forEach(function (turn) {
      var world = sim.spawnFighter(sim.spawnFighter(createDeployedWorld()));
      var ids = world.ships.filter(function (s) { return s.type === 'escort'; }).map(function (s) { return s.id; });
      world = sim.issueDefendOrder(sim.selectShips(world, ids), { x: 3000, y: -100 });
      for (var i = 0; i < 240; i += 1) world = sim.stepWorld(world, 1 / 30);
      var groupId = findShip(world, ids[0]).order.groupId;
      var before = world.formations[groupId];
      var angle = before.angle + turn;
      var destination = { x: before.position.x + Math.cos(angle) * 1000, y: before.position.y + Math.sin(angle) * 1000 };
      var offsets = ids.map(function (id) { return findShip(world, id).order.offset; });
      world = sim.issueDefendOrder(world, destination);
      assertClose(world.formations[groupId].velocity.x, before.velocity.x);
      assertClose(world.formations[groupId].velocity.y, before.velocity.y);
      assertClose(world.formations[groupId].angle, before.angle);
      ids.forEach(function (id, index) {
        assertClose(findShip(world, id).order.offset.x, offsets[index].x);
        assertClose(findShip(world, id).order.offset.y, offsets[index].y);
      });
      var maxTurn = 0;
      for (i = 0; i < 180; i += 1) {
        var prior = world.formations[groupId];
        world = sim.stepWorld(world, 1 / 30);
        var current = world.formations[groupId];
        maxTurn = Math.max(maxTurn, Math.abs(sim.angleDelta(prior.angle, current.angle)));
        assert(Math.hypot(current.velocity.x, current.velocity.y) > 20, 'Center should carry speed through the wheel');
        ids.forEach(function (id, index) {
          var ship = findShip(world, id);
          assert(Math.hypot(ship.velocity.x, ship.velocity.y) > 10, 'Wingmates should not stop midway through a turn');
          ids.slice(index + 1).forEach(function (otherId) {
            var other = findShip(world, otherId);
            assert(Math.hypot(ship.position.x - other.position.x, ship.position.y - other.position.y) > 25, 'Turning wingmates must not cut through each other');
          });
        });
      }
      assert(maxTurn <= 0.65 / 30 + 0.00001, 'Heading changes must remain gradual');
      for (i = 0; i < 900; i += 1) world = sim.stepWorld(world, 1 / 30);
      assert(Math.hypot(world.formations[groupId].position.x - destination.x, world.formations[groupId].position.y - destination.y) < 1, 'Wheeling must still converge on the destination');
    });
  });

  test('stopped wings and sharp turns pivot promptly instead of making huge arcs', function () {
    [4, 10].forEach(function (count) {
      [0, Math.PI / 2, Math.PI].forEach(function (turn) {
        var world = createDeployedWorld();
        while (world.ships.filter(function (s) { return s.type === 'escort'; }).length < count) world = sim.spawnFighter(world);
        var ids = world.ships.filter(function (s) { return s.type === 'escort'; }).map(function (s) { return s.id; });
        world = sim.issueDefendOrder(sim.selectShips(world, ids), { x: 3000, y: -100 });
        for (var i = 0; i < 240; i += 1) world = sim.stepWorld(world, 1 / 30);
        var id = findShip(world, ids[0]).order.groupId, formation = world.formations[id];
        if (turn === 0) {
          formation.velocity = { x: 0, y: 0 };
          ids.forEach(function (member) { findShip(world, member).velocity = { x: 0, y: 0 }; });
        }
        var heading = formation.angle + (turn || Math.PI / 6);
        var start = { x: formation.position.x, y: formation.position.y };
        var goal = { x: start.x + Math.cos(heading) * 900, y: start.y + Math.sin(heading) * 900 };
        world = sim.issueDefendOrder(world, goal);
        assert(world.formations[id].pivoting, 'Stopped or sharply redirected wings should pivot');
        var pivotFinished = false;
        for (i = 0; i < 90; i += 1) {
          world = sim.stepWorld(world, 1 / 30);
          formation = world.formations[id];
          assert(Math.hypot(formation.position.x - start.x, formation.position.y - start.y) < 80, 'Pivot must not send the group on a wide arc');
          if (!formation.pivoting) { pivotFinished = true; break; }
        }
        assert(pivotFinished, 'Pivot should finish within three seconds even for a large wing');
        for (i = 0; i < 900; i += 1) world = sim.stepWorld(world, 1 / 30);
        assert(Math.hypot(world.formations[id].position.x - goal.x, world.formations[id].position.y - goal.y) < 1, 'Rearranged wing must continue to its destination');
      });
    });
  });

  test('reversed diamonds keep occupants in place and turn while accelerating', function () {
    var world = sim.spawnFighter(sim.spawnFighter(createDeployedWorld()));
    var ids = world.ships.filter(function (s) { return s.type === 'escort'; }).map(function (s) { return s.id; });
    world = sim.issueDefendOrder(sim.selectShips(world, ids), { x: 1800, y: 0 });
    var id = findShip(world, ids[0]).order.groupId;
    var formation = world.formations[id];
    var originalAngle = formation.angle;
    var offsets = ids.map(function (member) {
      var ship = findShip(world, member);
      ship.position = { x: formation.position.x + ship.order.offset.x, y: formation.position.y + ship.order.offset.y };
      ship.velocity = { x: 0, y: 0 };
      ship.rotation = originalAngle;
      return { x: ship.order.offset.x, y: ship.order.offset.y };
    });
    world = sim.issueDefendOrder(world, { x: formation.position.x - Math.cos(originalAngle) * 900, y: formation.position.y - Math.sin(originalAngle) * 900 });
    world = sim.stepWorld(world, 1 / 30);
    ids.forEach(function (member, index) {
      var offset = findShip(world, member).order.offset;
      assert(Math.hypot(offset.x - offsets[index].x, offset.y - offsets[index].y) < 0.001, 'Reversal must relabel slots instead of swapping occupants');
    });
    for (var i = 0; i < 10; i += 1) world = sim.stepWorld(world, 1 / 30);
    ids.forEach(function (member) {
      var ship = findShip(world, member);
      assert(Math.hypot(ship.velocity.x, ship.velocity.y) > 5, 'Acceleration must begin before the turn finishes');
      assert(Math.abs(sim.angleDelta(ship.rotation, originalAngle + Math.PI)) > 0.4, 'Test must observe simultaneous rotation and translation');
    });
  });

  test('rocket equation charges velocity changes and payload reduces delta-v', function () {
    var world = createDeployedWorld(), ship = findShip(world, 'escort-01');
    var mass = sim.physicalStats(world, ship).massKg, fuel = ship.propulsion.fuelKg;
    var available = sim.remainingDeltaV(world, ship);
    assertClose(available, 3000 * Math.log(mass / (mass - fuel)));
    ship.cargo = 100;
    assert(sim.remainingDeltaV(world, ship) < available);
    ship.cargo = 0;
    var fraction = window.Driftworks.propulsion.burn(ship, mass, 25);
    assertClose(fraction, 1);
    assertClose(fuel - ship.propulsion.fuelKg, mass * (1 - Math.exp(-25 / 3000)));
  });

  test('empty tanks coast without speed caps, arrival snaps or negative fuel', function () {
    var world = createDeployedWorld(), ship = findShip(world, 'escort-01');
    ship.position = { x: 900, y: 0 }; ship.velocity = { x: 500, y: 20 };
    ship.propulsion.fuelKg = 0;
    world = sim.issueMoveOrder(sim.selectShips(world, [ship.id]), { x: 901, y: 0 });
    world = sim.stepWorld(world, 1);
    ship = findShip(world, ship.id);
    assertClose(ship.position.x, 1400); assertClose(ship.position.y, 20);
    assertClose(ship.velocity.x, 500); assertClose(ship.propulsion.fuelKg, 0);
    assert(ship.order.kind === 'return' && ship.order.automatic);
  });

  test('launch and catch share a finite relative velocity envelope', function () {
    var world = createDeployedWorld(), ship = findShip(world, 'escort-01'), home = world.ships[0];
    ship.position = { x: 30, y: 0 }; ship.velocity = { x: -100, y: 0 };
    assert(sim.canCatch(ship, home));
    ship.velocity.x = -200; assert(!sim.canCatch(ship, home));
    ship.velocity.x = -100;
    world = sim.issueReturnOrder(sim.selectShips(world, [ship.id]));
    world = sim.stepWorld(world, 0);
    ship = findShip(world, ship.id); assert(ship.docked);
    var fuel = ship.propulsion.fuelKg;
    world = sim.issueMoveOrder(world, { x: 2000, y: 0 });
    world = sim.stepWorld(world, 1);
    ship = findShip(world, ship.id);
    assert(!ship.docked && Math.hypot(ship.velocity.x, ship.velocity.y) > 100);
    assertClose(ship.propulsion.fuelKg, fuel);
    assert(Math.hypot(ship.velocity.x, ship.velocity.y) * sim.METERS_PER_UNIT / sim.PHYSICAL_SECONDS_PER_SECOND <= sim.EXCHANGE_MPS);
  });

  test('fuel reserves recall fighters and allow a catch before exhaustion', function () {
    var world = createDeployedWorld(), ship = findShip(world, 'escort-01');
    ship.position = { x: 1000, y: 0 }; ship.velocity = { x: 100, y: 0 };
    ship.propulsion.fuelKg = 2500;
    world = sim.issueDefendOrder(sim.selectShips(world, [ship.id]), { x: 2000, y: 0 });
    world = sim.stepWorld(world, 1 / 30);
    ship = findShip(world, ship.id);
    assert(ship.order.kind === 'return' && ship.order.automatic);
    for (var i = 0; i < 900 && !findShip(world, ship.id).docked; i++) world = sim.stepWorld(world, 1 / 30);
    ship = findShip(world, ship.id); assert(ship.docked);
    assert(ship.propulsion.fuelKg < ship.propulsion.capacityKg && ship.unloadRemainingSeconds > 0,
      'Docking should begin refueling rather than filling the tank instantly');
    world = sim.stepWorld(world, 5);
    ship = findShip(world, ship.id);
    assertClose(ship.propulsion.fuelKg, ship.propulsion.capacityKg);
  });

  test('packets use the catch envelope and conserve ore exactly once', function () {
    var world = createDeployedWorld();
    world.packets = [{ id: 1, position: { x: 100, y: 0 }, velocity: { x: -100, y: 0 }, ore: 50 },
      { id: 2, position: { x: 100, y: 0 }, velocity: { x: -200, y: 0 }, ore: 75 }];
    world = sim.stepWorld(world, 2);
    assert(world.packets.length === 1 && world.packets[0].id === 2);
    assertClose(world.mothership.storage.ore, 50);
    world = sim.stepWorld(world, 2);
    assertClose(world.mothership.storage.ore + world.mothership.storage.constructionMass, 50);
  });

  test('end mining retrieves all platforms, drains packets and conserves material across saves', function () {
    var world = sim.issueMineOrder(sim.selectShips(createFreshWorld(), ['msv-hardshell']), 'ast-ceres-01');
    for (var i = 0; i < 7500 && world.platforms[0].state !== 'deployed'; i++) world = sim.stepWorld(world, 1 / 30);
    assert(world.platforms[0].state === 'deployed');
    for (i = 0; i < 6000 && !findShip(world, 'tug-01').docked; i++) world = sim.stepWorld(world, 1 / 30);
    world = sim.issueMineOrder(world, 'ast-ceres-01');
    for (i = 0; i < 7500 && world.platforms[1].state !== 'deployed'; i++) world = sim.stepWorld(world, 1 / 30);
    assert(world.platforms.every(function (p) { return p.state === 'deployed'; }));
    assert(world.asteroids[0].ore < world.asteroids[0].oreInitial, 'Operational platforms have produced ore');
    world = sim.endMining(sim.deserializeWorld(sim.serializeWorld(world)));
    var ore = world.asteroids[0].ore;
    for (var j = 0; j < 24000 && world.miningMission !== 'complete'; j++) {
      world = sim.stepWorld(world, 1 / 30);
      if (j === 300) world = sim.deserializeWorld(sim.serializeWorld(world));
    }
    assert(world.miningMission === 'complete', 'The single cargo ship must return both platforms to mothership storage');
    assert(world.platforms.every(function (p) { return p.state === 'stored'; }));
    assertClose(world.asteroids[0].ore, ore);
    assert(world.packets.length === 0);
    var storage = world.mothership.storage;
    assertClose(ore + storage.ore + storage.constructionMass + storage.depotSections * 1500, 10125, 0.001);
  });

  test('legacy miners migrate once without losing ore or manufacturing platforms twice', function () {
    var world = createDeployedWorld();
    delete world.logisticsVersion; delete world.platforms; delete world.packets;
    var ship = sim.cloneWorld(findShip(world, 'tug-01')); ship.id = 'old-miner'; ship.type = 'miner'; ship.cargo = 123;
    world.ships.push(ship);
    delete ship.propulsion;
    ship.order = { kind: 'mine' };
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assert(!findShip(world, ship.id));
    assertClose(world.mothership.storage.ore, 123);
    assert(world.platforms.length === 2);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assert(world.platforms.length === 2);
  });

  test('saved mining phases restore control state and pending deployment', function () {
    var slots = {};
    var storage = { setItem: function (key, value) { slots[key] = value; }, getItem: function (key) { return slots[key]; } };
    var world = sim.selectShips(createDeployedWorld(), ['msv-hardshell']);
    assert(hud.miningControlState(world).canDeploy);
    assert(!hud.miningControlState(world).canEnd);
    world = sim.issueMineOrder(world, world.asteroids[0].id);
    var order = JSON.stringify(findShip(world, 'tug-01').order);
    sim.saveWorld(world, storage);
    world = sim.loadWorld(storage);
    assert(JSON.stringify(findShip(world, 'tug-01').order) === order);
    assert(!hud.miningControlState(world).canDeploy && hud.miningControlState(world).canEnd);
    world = sim.endMining(world);
    sim.saveWorld(world, storage);
    world = sim.loadWorld(storage);
    assert(world.miningMission === 'recovering');
    assert(hud.miningControlState(world).endLabel === 'Recovering platforms…');
    assert(!hud.miningControlState(world).canDeploy && !hud.miningControlState(world).canEnd);
    for (var i = 0; i < 300 && world.miningMission !== 'complete'; i++) world = sim.stepWorld(world, 1 / 30);
    sim.saveWorld(world, storage);
    world = sim.loadWorld(storage);
    assert(world.miningMission === 'complete');
    assert(hud.miningControlState(world).endLabel === 'Mining ended · platforms recovered');
  });

  test('reset clears mining progress in memory and in the saved world', function () {
    var slots = {};
    var storage = { setItem: function (key, value) { slots[key] = value; }, getItem: function (key) { return slots[key]; } };
    var world = sim.endMining(createDeployedWorld());
    world.platforms[0].state = 'deployed';
    world.packets.push({ id: 1, ore: 10, position: { x: 100, y: 0 }, velocity: { x: -50, y: 0 } });
    sim.saveWorld(world, storage);
    var reset = sim.resetWorld(storage), reloaded = sim.loadWorld(storage);
    [reset, reloaded].forEach(function (fresh) {
      assert(fresh.miningMission === 'active');
      assert(fresh.platforms.length === 2 && fresh.platforms.every(function (p) { return p.state === 'stored'; }));
      assert(fresh.packets.length === 0 && fresh.elapsedSeconds === 0);
      assert(!hud.miningControlState(fresh).canEnd);
      assert(hud.miningControlState(fresh).endLabel === 'End mining & recover');
      fresh = sim.selectShips(fresh, ['msv-hardshell']);
      assert(hud.miningControlState(fresh).canDeploy);
    });
  });

  test('Flight hull hits use model triangles and scorches stay on the surface', function () {
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

  test('visible bolt width registers shield and hull damage at triangle edges', function () {
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

  test('Flight traces burn only the first unobstructed hull and preserve lethal impacts', function () {
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

  test('Flight scorch batches follow translated and rotated hull poses', function () {
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

  test('Combat study deduplicates deterministic pilots and equivalent weapons', function () {
    var study=window.Driftworks.flightStudy, DW=window.Driftworks;
    var config={ships:[0],weapons:[-1],starts:['headOn'],pilots:['perfect','practiced'],skills:[1],seeds:3,seed:1,duration:10,pairing:'mirror',defenses:'paired'};
    assert(study.plan(config).length===8);
    config.weapons.push(DW.training.defaultWeapon(DW.arcade.profiles[0]));
    assert(study.plan(config).length===8, 'Equivalent native weapons are not independent trials');
    config.seeds=11;var rejected=false;try{study.plan(config);}catch(e){rejected=true;}assert(rejected);
  });

  test('Combat study keeps timeouts censored and pairs shield observations', function () {
    var DW=window.Driftworks,duel=DW.flightDuel.run({duration:1,seed:7}),options=duel.replay.options;
    var shield={id:'shield',options:Object.assign({},options,{unshielded:false}),summary:Object.assign({},duel.summary(),{outcome:'timeout',seconds:10,unshielded:false})};
    var bare={id:'bare',options:Object.assign({},options,{unshielded:true}),summary:Object.assign({},duel.summary(),{outcome:'player-win',seconds:2,unshielded:true})};
    var a=DW.flightStudy.analyze([shield,bare]);assert(a.timeouts===1&&a.medianKill===2);assert(a.shieldPairs===1&&a.pairsCensored===1&&a.observedShieldDelta===8);
    assert(DW.flightStudy.analyze([shield]).medianKill===null);
  });

  test('Combat study watch links reproduce the complete duel configuration', function () {
    var DW=window.Driftworks,options=DW.flightDuel.create({duration:1,seed:17,profile:1,opponentProfile:31,category:'human',flavor:'expert',start:'crossing',unshielded:true}).replay.options;
    var url=DW.flightStudy.watchUrl(options),parsed=DW.flightDuel.readWatchSearch(url.slice(url.indexOf('?')));
    assert(JSON.stringify(parsed)===JSON.stringify(options));
    assert(DW.flightDuel.readWatchSearch('?unrelated=1')===null);
    var rejected=false;try{DW.flightDuel.readWatchSearch('?duel=1&seed=-1');}catch(e){rejected=true;}assert(rejected);
  });

  test('Opponent studies hold setup fixed across styles and preserve watch/replay identity', function () {
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

  test('Pass fighter commits to an exit while aggressor maintains close pressure', function () {
    var DW=window.Driftworks;
    var aggressive=DW.flightDuel.run({opponentStyle:'aggressor',duration:12,category:'perfect',start:'headOn',profile:1}).summary();
    var passer=DW.flightDuel.run({opponentStyle:'passer',duration:12,category:'perfect',start:'headOn',profile:1}).summary();
    assert(passer.metrics.extendSeconds>aggressive.metrics.extendSeconds,'Pass fighter spends longer on committed exits');
    var duel=DW.flightDuel.create({opponentStyle:'passer',duration:10,category:'perfect',start:'turning'});
    duel.advance(.1);assert(duel.enemy.mode==='break');var goal=duel.enemy.extensionGoal.slice();
    duel.advance(.6);assert(JSON.stringify(goal)===JSON.stringify(duel.enemy.extensionGoal),'Exit heading does not track the opponent every decision');
  });

  test('FreeSpace pursuit uses closure control without stopping or altering shared physics', function () {
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

  test('FreeSpace no-progress escape is opt-in, committed, bounded and followed by re-entry', function () {
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

  test('FreeSpace variants are deterministic through replay and study links', function () {
    var DW=window.Driftworks;
    ['fso-pursuit','fso-breaker'].forEach(function(style){var d=DW.flightDuel.run({opponentStyle:style,category:'human',flavor:'practiced',seed:4,duration:4});
      assert(JSON.stringify(DW.flightDuel.replay(d.replay).summary())===JSON.stringify(d.summary()));
      var url=DW.flightStudy.watchUrl(d.replay.options);assert(DW.flightDuel.readWatchSearch(url.split('?')[1]).opponentStyle===style);
    });
  });

  test('Manual training spawns inherit the selected experimental opponent policy', function () {
    var DW=window.Driftworks,t=DW.training.create('training'),pose=DW.arcade.create(0);
    t.opponentStyle='fso-breaker';DW.training.spawn(t,pose,0);
    assert(t.enemies.length>0&&t.enemies.every(function(e){return e.opponentStyle==='fso-breaker';}));
  });

  window.registerPopulationTests(test, assert, assertClose);
  run();

  function findShip(world, id) {
    return world.ships.filter(function (ship) {
      return ship.id === id;
    })[0];
  }

  function findAsteroid(world, id) {
    return world.asteroids.filter(function (asteroid) {
      return asteroid.id === id;
    })[0];
  }

  function findPlume(plumes, id) {
    return plumes.filter(function (plume) {
      return plume.id === id;
    })[0];
  }

  test('viewer picks nearest rendered triangles with texture stride and model transforms', function () {
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

  test('flight destruction retains drift, pauses and expires independently of gun impacts', function () {
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

  function run() {
    var summary = document.querySelector('#summary');
    var results = document.querySelector('#results');
    var passed = 0;

    tests.forEach(function (current) {
      var item = document.createElement('li');
      try {
        current.fn();
        item.className = 'pass';
        item.textContent = 'PASS: ' + current.name;
        passed += 1;
      } catch (error) {
        item.className = 'fail';
        item.textContent = 'FAIL: ' + current.name;
        var detail = document.createElement('pre');
        detail.textContent = error.stack || String(error);
        item.appendChild(detail);
        console.error(current.name, error);
      }
      results.appendChild(item);
    });

    var failed = tests.length - passed;
    summary.className = failed === 0 ? 'pass' : 'fail';
    summary.textContent = failed === 0 ? 'All ' + passed + ' browser-native tests passed.' : failed + ' of ' + tests.length + ' browser-native tests failed.';
  }
})();
