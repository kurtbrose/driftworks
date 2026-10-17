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
    doc.getElementById('perf-reset').onclick();assert(diagnostics.beginFrame(1411,false).elapsed===0);
    diagnostics.reset();assert(diagnostics.beginFrame(2000,true));assert(diagnostics.beginFrame(2030,true)===null);assert(diagnostics.beginFrame(2067,true));
    doc.getElementById('fps-cap').value='0';doc.getElementById('fps-cap').listeners.change();assert(diagnostics.beginFrame(3000,false));assert(diagnostics.beginFrame(3001,false));
    diagnostics.toggleDiagnostics();assert(doc.getElementById('perf-enabled').checked);diagnostics.togglePerformance();assert(!doc.getElementById('perf-enabled').checked);
    diagnostics.toggleDiagnostics();assert(!doc.getElementById('perf-enabled').checked);diagnostics.togglePerformance();assert(doc.getElementById('perf-enabled').checked);
    frame=diagnostics.beginFrame(3300,true);diagnostics.endFrame(frame,true,comparison,stats);assert(!overlay.hidden&&overlay.textContent.indexOf('PAUSED / 15 FPS CAP')===0);
  });

  test('flight presentation shares appearance and preserves fleet, wreck and effect submission order',function(){
    var DW=window.Driftworks,doc=flightDisplayDocument(),saved={packs:DW.shipPackModels,scene:DW.scene3d.create,sky:DW.flightSkybox.create,gunGeometry:DW.flightGuns.geometry,blockout:DW.training.geometry};
    var events=[],fleets=[],scorches=[],engines=[],actors,effects,hullQuery,textureImages=new Map(),sourceWorld={},world=sourceWorld,sceneStats={},skyStats={};
    var scene={setSurfaceCamera:function(pose){events.push('pose');assert(pose.eye===player.eye);},setStudyActors:function(value){events.push('actors');actors=value;},setStudyEffects:function(value){events.push('effects');effects=value;},setStudyDiagnostics:function(value){events.push('diagnostics');assert(value===comparison);},sync:function(value){events.push('sync');assert(value===world);},render:function(value,a,b,dt){events.push('scene');assert(value===world&&a===1&&b===0&&dt===.05);},getRenderStats:function(){return sceneStats;}};
    var player=DW.arcade.create(20),comparison={mode:'empty',scale:.5};
    function craft(id,team,hp){return {id:id,team:team,hp:hp,pose:DW.arcade.create(20),guns:DW.flightGuns.create()};}
    var ally=craft('ally','ally',90),enemy=craft('enemy','enemy',90),dead=craft('dead','enemy',0),wreck=craft('wreck','ally',0),combat=DW.training.create();
    combat.enemies=[ally,enemy,dead];combat.wrecks=[wreck];combat.wave=3;world.elapsedSeconds=7;
    try{
      DW.scene3d.create=function(host,getWorld,setWorld,options){assert(options.study&&getWorld()===sourceWorld);setWorld({elapsedSeconds:7});assert(getWorld()===world);return scene;};
      DW.flightSkybox.create=function(){return {render:function(state,scale,empty){events.push('sky');assert(state===player&&scale===.5&&empty);},getRenderStats:function(){return skyStats;}};};
      DW.shipPackModels=Object.assign({},saved.packs,{
        populate:function(){},loadTextures:function(){return {then:function(fn){fn(textureImages);return {catch:function(){}};}};},
        craftModel:function(craft,selection,wave){return {id:selection+':'+wave+':'+craft.id};},
        hullHit:function(model,pose,start,end,units){hullQuery={model:model,pose:pose,start:start,end:end,units:units};return hullQuery;},
        sourceFleetGeometry:function(craft,selection,wave,units,images,paint){var batch={kind:'hull',craft:craft,selection:selection,wave:wave,units:units,images:images,paint:paint};fleets.push(batch);return [batch];},
        scorchGeometry:function(craft,selection){var batch={kind:'scorch',craft:craft,selection:selection};scorches.push(batch);return [batch];},
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
      var start=[0,0,0],end=[1,0,0];presentation.hullHit(ally,start,end,3);
      assert(hullQuery.model.id===DW.flightPresentation.model(ally,3,appearance).id&&hullQuery.pose===ally.pose&&hullQuery.units===sim.METERS_PER_UNIT&&hullQuery.start===start&&hullQuery.end===end);
      doc.getElementById('enemy-art').value='changed';presentation.hullHit(enemy,start,end,4);assert(hullQuery.model.id==='changed:4:enemy');
      presentation.pose(player);presentation.render({state:player,combat:combat,guns:DW.flightGuns.create(),world:world},appearance,comparison,.05);
      assert(events.join(',')==='pose,actors,effects,diagnostics,sky,sync,scene');
      assert(actors.map(function(batch){return batch.kind;}).join(',')==='hull,hull,scorch,scorch');
      assert(fleets[0].craft[0]===ally&&fleets[0].craft[1]===wreck&&fleets[1].craft.length===1&&fleets[1].craft[0]===enemy);
      assert(fleets[0].paint===appearance.paint.ally&&fleets[1].paint===appearance.paint.enemy&&fleets[1].selection==='hostile');
      assert(scorches[0].craft[1]===wreck&&engines[0].length===1&&engines[1].length===1);
      assert(effects[0].kind==='guns'&&Array.from(effects[1].vertices).join(',')==='1,2');
      assert(presentation.renderStats().scene===sceneStats&&presentation.renderStats().sky===skyStats);
      doc.getElementById('faction-paint').checked=false;doc.getElementById('ally-art').value='';doc.getElementById('enemy-art').value='';
      var plain=presentation.appearance();assert(plain.paint.ally===undefined&&plain.paint.enemy===undefined);
      var blockouts=[];DW.training.geometry=function(value){blockouts.push(value.enemies);return [{kind:'blockout'}];};
      presentation.render({state:player,combat:combat,guns:DW.flightGuns.create(),world:world},plain,comparison,.05);
      assert(blockouts.length===2&&blockouts[0].length===2&&blockouts[0].every(function(craft){return craft.hp===1;}));
      assert(wreck.hp===0&&ally.hp===90,'Blockout batching must not mutate combatants or wrecks');
    }finally{DW.shipPackModels=saved.packs;DW.scene3d.create=saved.scene;DW.flightSkybox.create=saved.sky;DW.flightGuns.geometry=saved.gunGeometry;DW.training.geometry=saved.blockout;}
  });

  // A small event/DOM fixture exercises the browser adapter without real devices.
  function flightControlsFixture(){
    function target(){return {listeners:{},addEventListener:function(name,fn){this.listeners[name]=fn;},emit:function(name,event){if(this.listeners[name])this.listeners[name](event||{});},appendChild:function(child){this.children.push(child);if(this.value===''&&child.value!==undefined)this.value=child.value;},children:[],value:'',textContent:'',setAttribute:function(){}};}
    var elements={},doc=target(),win=target(),host=target(),pads=[],counts={pause:0,weapon:0,target:0,radar:0,diagnostics:0,performance:0,resume:0,failure:0},paused=false,dead=false,controls;
    doc.getElementById=function(id){return elements[id]||(elements[id]=target());};
    doc.createElement=target;doc.createTextNode=function(text){return {textContent:text};};
    doc.body={classList:{add:function(){}}};doc.exitPointerLock=function(){doc.pointerLockElement=null;};
    host.clientWidth=1000;host.clientHeight=800;
    doc.getElementById('input-mode').value='mouse';doc.getElementById('sensitivity').value='1';
    controls=window.Driftworks.flightControls.mount(host,{
      isPaused:function(){return paused;},isDead:function(){return dead;},
      pause:function(){counts.pause++;paused=true;controls.clear();controls.release();},
      resume:function(){counts.resume++;paused=false;controls.clear();controls.resetButtons();},
      captureFailure:function(){counts.failure++;paused=true;controls.clear();},
      nextWeapon:function(){counts.weapon++;},nextTarget:function(){counts.target++;},nextRadarRange:function(){counts.radar++;},
      toggleDiagnostics:function(){counts.diagnostics++;},togglePerformance:function(){counts.performance++;},selectProfile:function(index){counts.profile=index;}
    },{document:doc,window:win,navigator:{getGamepads:function(){return pads;}}});
    function key(code,tag,repeat){var event={code:code,target:{tagName:tag||'BODY'},repeat:!!repeat,preventDefault:function(){this.prevented=true;}};win.emit('keydown',event);return event;}
    return {controls:controls,doc:doc,win:win,host:host,counts:counts,key:key,elements:elements,setPads:function(value){pads=value;},setPaused:function(value){paused=value;},setDead:function(value){dead=value;}};
  }

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

  test('flight controls preserve pointer capture, virtual stick and capture failures',function(){
    var f=flightControlsFixture(),c=f.controls;
    c.capture();assert(f.counts.failure===1);
    f.host.requestPointerLock=function(){throw new Error('denied');};c.capture();assert(f.counts.failure===2);
    f.host.requestPointerLock=function(){return {catch:function(fn){fn(new Error('rejected'));}};};c.capture();assert(f.counts.failure===3);
    f.doc.pointerLockElement=f.host;f.doc.emit('pointerlockchange');assert(f.counts.resume===1);
    f.doc.emit('mousemove',{movementX:80,movementY:-40});
    var demand=c.sample();assert(demand.pitch>0&&demand.yaw<0);assertClose(c.view().stickRange,160);
    f.doc.emit('mousedown',{button:2});assert(c.sample().fire);
    f.doc.emit('mouseup',{button:2});assert(!c.sample().fire);
    f.key('KeyC');assert(c.sample().pitch===0&&c.view().mouse[0]===0);
    f.doc.getElementById('input-mode').value='controller';f.doc.emit('mousemove',{movementX:80,movementY:40});assert(c.sample().yaw===0);
    c.release();assert(f.doc.pointerLockElement===null);f.doc.emit('pointerlockchange');assert(f.counts.pause===1);
    f.setDead(true);f.doc.pointerLockElement=f.host;f.doc.emit('pointerlockchange');assert(f.counts.resume===1&&f.counts.pause===2);
  });

  test('flight controls retain controller edges, editable bindings and disconnect pause',function(){
    var f=flightControlsFixture(),c=f.controls,pad={index:0,id:'Test controller',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:16},function(){return {pressed:false,value:0};})};
    f.setPads([null,pad,null]);c.sample();assert(f.elements.bindings.children.length===10);
    pad.buttons[3].pressed=true;c.sample();c.sample();assert(f.counts.weapon===1);
    pad.buttons[3].pressed=false;c.sample();pad.buttons[3].pressed=true;c.sample();assert(f.counts.weapon===2);
    var pitchSelect=f.elements.bindings.children[0].children[0];pitchSelect.value='0';pitchSelect.onchange();pad.axes[0]=1;assertClose(c.sample().pitch,-1);
    f.elements.deadzone.value='.8';f.elements.deadzone.onchange({target:f.elements.deadzone});assert(f.elements.deadzone.value==='0.5');
    pad.buttons[9].pressed=true;c.sample();c.sample();assert(f.counts.pause===1&&f.counts.weapon===2);
    f.setPaused(false);c.resetButtons();c.sample();assert(f.counts.pause===2);
    f.setPaused(false);f.key('KeyW');f.setPads([]);c.sample();assert(f.counts.pause===3&&c.sample().throttleRate===0);
  });

  test('flight session reset replaces sortie state and preserves the environment', function () {
    var DW=window.Driftworks,session=DW.flightSession.create({}),config={mode:'furball',enabled:true,profile:DW.arcade.profiles[0]};
    var first=session.reset(config),world=first.world;
    assertClose(first.asteroid.radius*sim.METERS_PER_UNIT,300);
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

  test('flight session substeps preserve movement, training, guns, audio and contact order', function () {
    var DW=window.Driftworks,model=DW.arcade,training=DW.training,guns=DW.flightGuns;
    var saved=[model.step,training.step,guns.step,training.trace,model.contact],events=[],dead=false;
    var terrain=function(){},hull=function(){},session=DW.flightSession.create({terrainHit:terrain,hullHit:hull,surfaceFrame:function(){events.push('surface');return {point:[1,0,0]};},onGunshot:function(){events.push('shot');},onImpact:function(){events.push('impact');}});
    var config={mode:'training',enabled:false,profile:model.profiles[0],weapon:DW.retailWeapons[0]},view=session.reset(config);
    view.state.eye=[0,0,0];
    var controls={throttle:.4,throttleRate:0,stop:false,fire:true};
    try{
      model.step=function(state,profile,input,dt){events.push('move');assertClose(dt,1/120);assertClose(state.throttle,.4);assert(profile===config.profile && input===controls);};
      training.step=function(combat,state,dt,radius,query){events.push('training');assert(combat.hullHit===hull && query===terrain);combat.lastHit++;combat.dead=dead;};
      guns.step=function(g,state,weapon,fire,dt,trace){events.push('guns');assert(fire===!dead && weapon===config.weapon);g.fired++;trace([0,0,0],[1,0,0],{});};
      training.trace=function(combat,start,end,bolt,team,query,player){events.push('trace');assert(team==='player' && query===terrain && player===view.state);};
      model.contact=function(){events.push('contact');return true;};
      var result=session.advance(1/60,controls,config);
      var sequence='move,training,guns,trace,shot,impact,surface,contact';
      assert(events.join(',')===sequence+','+sequence);assert(result.contact);
      events=[];dead=true;session.advance(1/60,controls,config);
      assert(events.join(',')==='move,training,guns,trace,shot,impact','Death must finish gun/audio work, skip contact, and stop remaining substeps');
    }finally{model.step=saved[0];training.step=saved[1];guns.step=saved[2];training.trace=saved[3];model.contact=saved[4];}
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
    api.step(clock,0,t,true,rng);api.step(clock,6,t,true,rng);
    assert(clock.emotions.a.current==='afraid');
    var call=api.step(clock,2,t,false,rng);
    assert(call.event==='emotion'&&call.craftId==='a'&&call.text==='Help me!');
    var reply=api.step(clock,2,t,false,rng);
    assert(reply.event==='emotionalReply'&&reply.craftId==='h'&&reply.replyTo==='a');
    assert(reply.emotion.current==='reassuring'&&h.mode==='recover'&&!h.targetId);
    assert(clock.emotions.h.current==='calm'&&!clock.emotionalConversation);
    api.step(clock,6,t,true,rng);assert(clock.emotions.a.current==='panicked');
    a.mode='attack';api.step(clock,0,t,true,rng);assert(clock.emotions.a.current==='panicked');
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
    assertClose(clock.quietGap,3.14);
    api.step(clock,1,combat,true,rng);red.fire=false;
    assert(api.step(clock,2,combat,false,rng)===null);
    api.step(clock,8,combat,false,rng);red.targetId='two';
    assert(api.step(clock,0,combat,false,function(){return 0;}).event==='target');
    assertClose(clock.quietGap,0.9);
    assert(api.step(clock,5,combat,false,rng)===null); // No replay when the action stays unchanged.
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
    assert(api.step(clock,3,combat,false,rng)===null); // One answer per request.
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

  test('flight comms retains a bounded newest-first subtitle history', function () {
    var items=[],history={children:items,ownerDocument:{createElement:function(){return {textContent:''};}},prepend:function(item){items.unshift(item);}};
    Object.defineProperty(history,'lastElementChild',{get:function(){return {remove:function(){items.pop();}};}});
    var fields=[{textContent:''},{textContent:''}],panel={ownerDocument:{getElementById:function(){return history;}},querySelector:function(s){return s==='[data-speaker]'?fields[0]:fields[1];},classList:{add:function(){},remove:function(){},toggle:function(){}}};
    var radio=window.Driftworks.flightComms.mount(panel,{setAttribute:function(){}}),pilot={id:'wing',index:0,team:'ally',mode:'approach',hp:90},combat={enabled:true,dead:false,hull:100,enemies:[pilot]};
    for(var i=0;i<15;i++){radio.reset();pilot.mode='approach';radio.update(0,combat);pilot.mode='evade';radio.update(0,combat);}
    assert(items.length===12);assert(items[0].textContent.indexOf(fields[1].textContent)>=0);
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
  });

  test('target camera centers a copy, fits hull bounds and caps redraws', function () {
    var api=window.Driftworks.flightTargetCamera,DW=window.Driftworks,original=DW.scene3d.create,draws=0,batches;
    DW.scene3d.create=function(){return {setStudyDiagnostics:function(){},setOrbit:function(){},setStudyActors:function(value){batches=value;},setStudyEffects:function(){},sync:function(){},render:function(){draws++;}};};
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
    var packs=window.Driftworks.shipPacks,ids={};assert(packs.length===1);assert(packs[0].id==='quaternius-ultimate-spaceships');assert(packs[0].models.length===11);
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
  test('source ship fleets preserve artist UVs and normals across poses without dropping models',function(){
    var api=window.Driftworks.shipPackModels,models=window.Driftworks.shipPacks[0].models,images=new Map(),craft=[];
    models.forEach(function(m,i){images.set(m.id,{name:m.name});craft.push({index:i,pose:{eye:[3,4,5],right:[0,1,0],back:[-1,0,0],up:[0,0,1]}});});
    var batches=api.sourceFleetGeometry(craft,'mixed',1,10,images);assert(batches.length===11);
    batches.forEach(function(b,i){var v=models[i].texturedVertices;assert(b.stride===8);assert(b.texture===images.get(models[i].id));assert(b.vertices.length===v.length);assertClose(b.vertices[0],3+v[1]/10,.00001);assertClose(b.vertices[1],4+v[0]/10,.00001);assertClose(b.vertices[3],v[4],.00001);for(var j=0;j<v.length;j+=8){assertClose(b.vertices[j+6],v[j+6],.000001);assertClose(b.vertices[j+7],v[j+7],.000001);}});
    assert(api.sourceFleetGeometry([],'mixed',1,10,images).length===0);
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

  test('mixed fighter fleets cover the Quaternius library, keep assignments and merge finishes',function(){
    var api=window.Driftworks.shipPackModels,seen={},pose={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1]},craft=[];
    for(var wave=1;wave<=3;wave++)for(var i=0;i<16;i++){var model=api.mixedModel(i,wave);seen[model.id]=true;assert(api.mixedModel(i,wave)===model);}
    assert(Object.keys(seen).length===11);
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

  test('training combat can clear a wave using the same player flight and gun models', function () {
    var ai=window.Driftworks.training,flight=window.Driftworks.arcade,gun=window.Driftworks.flightGuns;
    var player=flight.create(18),t=ai.create(),guns=gun.create(),weapon=window.Driftworks.retailWeapons[0];t.countdown=.01;
    for(var i=0;i<120*45&&!t.dead&&t.wave<2;i++){
      var target=ai.alive(t).find(function(e){return e.id===t.targetId;}),control={},fire=false;
      if(target){var lead=ai.intercept(player.eye,target.pose.eye,target.pose.velocity.map(function(v){return v/sim.METERS_PER_UNIT;}),weapon.speed/sim.METERS_PER_UNIT);control=ai.steer(player,lead.point);player.throttle=.5;fire=Math.abs(control.pitch)<.15&&Math.abs(control.yaw)<.15;}
      flight.step(player,flight.profiles[0],control,1/120);ai.step(t,player,1/120,18);
      gun.step(guns,player,weapon,fire,1/120,function(a,b,bolt){return ai.trace(t,a,b,bolt,'player',null,player);});
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
    var before=t.time;ai.step(t,player,1,18);assert(t.time===before);
    var fresh=ai.create();assert(!fresh.dead && fresh.shield===120 && fresh.kills===0);
  });
  test('training intercept leads moving targets and models are simple bounded triangles', function () {
    var ai=window.Driftworks.training,lead=ai.intercept([0,0,0],[0,20,0],[2,0,0],27);
    assert(lead.time>0 && lead.point[0]>0);
    var t=ai.create();ai.spawn(t,window.Driftworks.arcade.create(18),18);
    var mesh=ai.geometry(t)[0].vertices;assert(mesh.length===3*6*3*6);mesh.forEach(function(x){assert(Number.isFinite(x));});
    var guns=window.Driftworks.flightGuns.create();assert(ai.allGuns(t,guns).bolts.length===0);
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
      assert(guns.fired===(index===0?10:6));
      var bolt=guns.bolts[0],before=bolt.position.slice();model.step(guns,pose,w,false,1/120);
      assertClose((bolt.position[1]-before[1])*sim.METERS_PER_UNIT,w.speed/120);
      assertClose(bolt.position[0],before[0]);
      for(var j=0;j<250;j++)model.step(guns,pose,w,false,1/120);
      assert(guns.bolts.length===0);
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

  test('flight sky directions rotate with the cockpit, ignore translation, and cover the sphere', function () {
    var sky=window.Driftworks.flightSkybox,pose={right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
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
      assert(JSON.stringify(values)===JSON.stringify(expected[i]));
      assert(p.maxVelocity[0]===0 && p.maxVelocity[1]===0 && p.rearVelocity===0);
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
    var side=model.create(18);model.step(side,p,{side:1},.05);assertClose(side.velocity[0],0);
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
  test('mining pod studies keep finite unit normals, fold anchors and gate cutter motion', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry;
    ['pod','anchors','recessed','fabricated'].forEach(function(variant){
      var deployed=model(1,0,false,variant),folded=model(0,0,false,variant);
      assert(JSON.stringify(deployed)!==JSON.stringify(folded));
      assert(JSON.stringify(deployed)===JSON.stringify(model(1,5,false,variant)));
      assert(JSON.stringify(deployed)!==JSON.stringify(model(1,.2,true,variant)));
      Object.keys(deployed).forEach(function(key){var data=deployed[key];assert(data.length%18===0);assert(data.every(Number.isFinite));for(var i=3;i<data.length;i+=6)assertClose(Math.hypot(data[i],data[i+1],data[i+2]),1,.00001);});
    });
  });

  test('fabricated mining hull has twelve planar walls, chamfers and a flat deck', function () {
    var data=window.Driftworks.scene3d.miningPlatformGeometry(1,0,false,'fabricated').ochre;
    // First 24 quads are structural wall/shoulder plates, each with a single normal.
    for(var face=0;face<24;face++){
      var start=face*36;
      for(var i=start;i<start+36;i+=6)for(var k=3;k<6;k++)assertClose(data[i+k],data[start+k],.000001);
      if(face%2===0)assertClose(data[start+5],0,.000001);
      var nx=data[start+3],ny=data[start+4],nz=data[start+5];
      for(var i=start;i<start+36;i+=6)assertClose((data[i]-data[start])*nx+(data[i+1]-data[start+1])*ny+(data[i+2]-data[start+2])*nz,0,.000001);
      if(face%2===1)assert(data[start+5]>.4 && data[start+5]<.9,'Broad angled shoulder plates');
    }
    // Ten triangles close the twelve-vertex roof, all at the same height.
    for(var i=24*36;i<24*36+10*18;i+=6){assertClose(data[i+2],12.5);assertClose(data[i+5],1);}
  });

  test('mining platform geometry folds legs and animates only active machinery', function () {
    var model=window.Driftworks.scene3d.miningPlatformGeometry;
    var open=model(1,0,false),folded=model(0,0,false);
    function width(groups){var ys=[];Object.keys(groups).forEach(function(k){for(var i=1;i<groups[k].length;i+=6)ys.push(Math.abs(groups[k][i]));});return Math.max.apply(null,ys);}
    assert(width(open)>width(folded));
    assert(JSON.stringify(open)===JSON.stringify(model(1,12,false)));
    assert(JSON.stringify(open)!==JSON.stringify(model(1,.2,true)));
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
    for (i = 0; i < 5500; i++) world = sim.stepWorld(world, 1 / 30);
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
      assertClose(p.position.x, a.position.x + Math.cos(angle) * sim.surfaceRadius(a, p.siteAngle) * p.siteDepth);
      assertClose(p.position.y, a.position.y + Math.sin(angle) * sim.surfaceRadius(a, p.siteAngle) * p.siteDepth);
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

  test('Flight traces burn only the first unobstructed hull and preserve lethal impacts', function () {
    var models=window.Driftworks.shipPackModels,ai=window.Driftworks.training,U=sim.METERS_PER_UNIT;
    var t=ai.create(),pose={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1],velocity:[0,0,0]},e={id:'target',index:0,hp:10,pose:pose};
    t.enemies=[e];t.hullHit=function(craft,start,end){return models.hullHit(models.craftModel(craft,'',1),craft.pose,start,end,U);};
    var bolt={weapon:{damage:20,armorFactor:1}},start=[0,0,10/U],end=[0,0,-10/U];
    var obstruction=[0,0,8/U],player={eye:[20,20,20]};
    assert(ai.trace(t,start,end,bolt,'player',function(){return obstruction;},player)===obstruction);
    assert(e.hp===10&&!e.scorches, 'Terrain shields the hull from damage and marks');
    var impact=ai.trace(t,start,end,bolt,'player',null,player);
    assert(impact&&e.hp===0&&e.scorches.length===1);
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

