(function(){
  'use strict';
  var DW=window.Driftworks,model=DW.arcade,host=document.getElementById('viewer');
  var session=DW.flightSession.create({hullHit:hullContact,terrainHit:function(start,end){return DW.flightGuns.intersect(start,end,asteroid.radius,function(point){return DW.scene3d.rockField(asteroid,point);});},surfaceFrame:DW.scene3d.surfaceFrame,onGunshot:function(){DW.audio.playGunshot();},onImpact:function(){DW.audio.playImpact(1);}});
  var initial=session.snapshot(),world=initial.world,asteroid=initial.asteroid,mothership=initial.mothership,units=DW.sim.METERS_PER_UNIT;
  var scene=DW.scene3d.create(host,function(){return world;},function(w){world=w;session.setWorld(w);},{study:true});
  var shipImages=new Map();
  DW.shipPackModels.loadTextures().then(function(images){shipImages=images;}).catch(function(error){document.getElementById('art-credit').textContent=String(error);});
  var skybox=DW.flightSkybox.create(host);
  var select=document.getElementById('profile'),stats=document.getElementById('stats'),status=document.getElementById('status');
  var state=model.createSortie(asteroid.radius,model.profiles[Number(select.value)||0]),keys={},paused=true,mouse=[0,0],look=[0,0],previous=0,contact=false;
  model.profiles.forEach(function(p,i){var option=document.createElement('option');option.value=String(i);option.textContent=p.name;select.appendChild(option);});
  var guns=DW.flightGuns.create(),gunSelect=document.getElementById('gun');
  var performanceTools=DW.flightPerformance,pace=performanceTools.pacer(),measurements=performanceTools.create(),lastStatsUpdate=0;
  function diagnostics(){return {mode:document.getElementById('render-mode').value,flat:document.getElementById('flat-materials').checked,scale:Number(document.getElementById('render-scale').value),mothership:document.getElementById('draw-mothership').checked,actors:document.getElementById('draw-enemies').checked};}
  function resetMeasurements(){measurements=performanceTools.create();pace.next=null;previous=0;lastStatsUpdate=0;}
  ['render-mode','flat-materials','render-scale','fps-cap','draw-mothership','draw-enemies'].forEach(function(id){document.getElementById(id).addEventListener('change',resetMeasurements);});
  document.getElementById('perf-reset').onclick=resetMeasurements;
  document.getElementById('dialogue-size').oninput=function(e){document.documentElement.style.setProperty('--dialogue-size',e.target.value+'px');};
  var flightHud=DW.flightHud.mount(host);
  var comms=DW.flightComms.mount(document.getElementById('comms'),document.getElementById('comms-voice'));
  var combat=DW.training.create(document.getElementById('combat-mode').value);
  var artSelect=document.getElementById('enemy-art'),allyArt=document.getElementById('ally-art');DW.shipPackModels.populate(artSelect,true);DW.shipPackModels.populate(allyArt,true);[artSelect,allyArt].forEach(function(select){var option=document.createElement('option');option.value='mixed';option.textContent='Mixed fleet · all ship models';select.insertBefore(option,select.firstChild);select.value='mixed';});
  function artCredit(){var entry=DW.shipPackModels.find(artSelect.value);document.getElementById('art-credit').textContent=artSelect.value==='mixed'?'Mixed fleet · Quaternius CC0 library · changes each wave':entry?entry.pack.author+' / '+entry.model.name+' · '+entry.pack.license+' · '+entry.model.triangles.toLocaleString()+' triangles per ship':'Original six-triangle training hull';}
  function allyCredit(){var entry=DW.shipPackModels.find(allyArt.value);document.getElementById('ally-credit').textContent=allyArt.value==='mixed'?'Mixed fleet · Quaternius CC0 library · changes each wave':entry?entry.pack.author+' / '+entry.model.name+' · '+entry.pack.license:'Original training blockout';}
  allyArt.onchange=allyCredit;allyCredit();artSelect.onchange=artCredit;artCredit();

  function hullContact(e,start,end){var selection=e.team==='ally'?allyArt.value:artSelect.value;return DW.shipPackModels.hullHit(DW.shipPackModels.craftModel(e,selection,combat.wave),e.pose,start,end,units);}
  function weapon(){return DW.retailWeapons[Number(gunSelect.value)];}
  function gunLabels(){var w=weapon();document.getElementById('gun-stats').textContent=w.speed+' m/s · '+w.fireWait+' s / volley · '+(w.speed*w.lifetime)+' m range';}
  function banks(){
    gunSelect.textContent='';var indexes=Number(select.value)===3?[1]:Number(select.value)===2?[1,0]:[0,1];
    indexes.forEach(function(index){var option=document.createElement('option');option.value=String(index);option.textContent=DW.retailWeapons[index].name;gunSelect.appendChild(option);});gunLabels();
  }
  gunSelect.onchange=gunLabels;
  document.getElementById('restart-training').onclick=function(){pause();reset();document.activeElement.blur();};
  document.getElementById('combat-toggle').onchange=function(e){comms.reset();combat=session.setCombat(document.getElementById('combat-mode').value,e.target.checked).combat;};
  function profile(){return model.profiles[Number(select.value)];}
  function labels(){var p=profile();stats.textContent=p.role+'\nCruise / boost '+p.maxVelocity[2]+' / '+p.afterburnerVelocity[2]+' m/s\nAccel / decel '+p.forwardAccel+' / '+p.forwardDecel+' s\nPitch / yaw / roll (s/360°)\n'+p.rotationTime.join(' / ')+'\nDamp / rotdamp '+p.damp+' / '+p.rotdamp;}
  function clear(){keys={};mouse=[0,0];look=[0,0];}
  function pause(){paused=true;comms.pause();document.body.classList.remove('flight-active');clear();if(document.pointerLockElement===host)document.exitPointerLock();document.body.classList.remove('mouse-captured');document.getElementById('fly').textContent=combat.dead?'Restart flight':'Resume flight';status.textContent='Paused - Resume flight when ready';}
  function pose(){scene.setSurfaceCamera({eye:state.eye,right:state.right,up:state.up,back:state.back});}
  function reset(){clear();comms.reset();var fresh=session.reset({mode:document.getElementById('combat-mode').value,enabled:document.getElementById('combat-toggle').checked,profile:model.profiles[Number(select.value)||0]});state=fresh.state;combat=fresh.combat;guns=fresh.guns;contact=fresh.contact;document.getElementById('fly').textContent='Start flight';pose();}
  document.getElementById('combat-mode').onchange=function(){pause();reset();};
  select.onchange=function(){reset();labels();banks();};
  document.getElementById('diameter').onchange=function(e){var d=Number(e.target.value);if(!Number.isFinite(d)||d<200||d>4000){e.target.value=String(asteroid.radius*units*2);return;}asteroid.radius=d/2/units;reset();};
  document.getElementById('reset').onclick=function(){reset();document.activeElement.blur();};
  var inputMode=document.getElementById('input-mode'),device=document.getElementById('device'),bindingHost=document.getElementById('bindings'),input=DW.flightInput;
  var mapping=input.defaults(true),padSignature='',lastPad=null,previousButtons={bank:false,pause:false};
  function pads(){try{return navigator.getGamepads?Array.from(navigator.getGamepads()).filter(function(p){return p&&p.connected;}):[];}catch(error){return [];}}
  function configure(pad){
    mapping=input.defaults(pad.mapping==='standard');bindingHost.textContent='';document.getElementById('deadzone').value=String(mapping.deadzone);
    ['pitch','yaw','roll','throttle','fire','boost','bank','pause','up','down'].forEach(function(name){
      var label=document.createElement('label');label.textContent=name+' ';var selectBinding=document.createElement('select');selectBinding.setAttribute('aria-label',name+' binding');
      var isAxis=['pitch','yaw','roll','throttle'].indexOf(name)>=0,count=isAxis?pad.axes.length:pad.buttons.length;
      for(var n=-1;n<count;n++){var option=document.createElement('option');option.value=String(n);option.textContent=n<0?'None':(isAxis?'Axis ':'Button ')+n;selectBinding.appendChild(option);}
      selectBinding.value=String(mapping[name]<count?mapping[name]:-1);mapping[name]=Number(selectBinding.value);
      selectBinding.onchange=function(){mapping[name]=Number(selectBinding.value);};label.appendChild(selectBinding);
      if(isAxis){var invert=document.createElement('input');invert.type='checkbox';invert.checked=mapping[name+'Invert'];invert.setAttribute('aria-label','Invert '+name);invert.onchange=function(){mapping[name+'Invert']=invert.checked;};label.appendChild(invert);label.appendChild(document.createTextNode(' invert'));}
      bindingHost.appendChild(label);
    });previousButtons={bank:false,pause:false};
  }
  device.onchange=function(){pause();lastPad=null;var pad=pads().find(function(p){return String(p.index)===device.value;});if(pad){lastPad=pad.index;configure(pad);}};
  document.getElementById('deadzone').onchange=function(e){mapping.deadzone=Math.max(0,Math.min(.5,Number(e.target.value)||0));e.target.value=String(mapping.deadzone);};
  inputMode.onchange=pause;
  function resume(){if(combat.dead){status.textContent='Training over · Restart training to fly again';return;}DW.audio.unlock();comms.unlock();clear();previousButtons={bank:false,pause:false};paused=false;document.body.classList.add('flight-active');document.activeElement.blur();status.textContent='Flight controls active · Esc pauses';}
  function captureFailure(error){pause();if(error&&error.message)status.dataset.captureError=error.message;else if(!status.dataset.captureError)status.dataset.captureError='Pointer lock rejected by browser';status.textContent='Mouse capture unavailable. Retry Fly or select Controller / keyboard.';}
  document.getElementById('fly').onclick=function(){
    if(combat.dead)reset();
    if(inputMode.value!=='mouse'){resume();return;}
    if(!host.requestPointerLock){captureFailure();return;}
    try{var result=host.requestPointerLock();if(result&&result.catch)result.catch(captureFailure);}catch(error){captureFailure();}
  };
  document.addEventListener('pointerlockchange',function(){if(document.pointerLockElement===host){if(combat.dead){pause();return;}resume();document.body.classList.add('mouse-captured');}else pause();});
  document.addEventListener('pointerlockerror',captureFailure);
  window.addEventListener('blur',pause);document.addEventListener('visibilitychange',function(){if(document.hidden)pause();});
  window.addEventListener('keydown',function(e){
    if(e.code==='F3'&&!e.repeat){e.preventDefault();var show=document.body.classList.toggle('diagnostics');document.getElementById('perf-enabled').checked=show;return;}
    if(e.code==='Escape'){pause();return;}
    if(/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName))return;
    if(e.code==='KeyC'&&!paused){mouse=[0,0];e.preventDefault();return;}
    if(e.code==='KeyP'&&!e.repeat){var overlayToggle=document.getElementById('perf-enabled');overlayToggle.checked=!overlayToggle.checked;return;}
    if(e.code==='Tab'&&!paused){e.preventDefault();DW.training.cycle(combat);return;}
    if(e.code==='KeyV'&&!e.repeat){flightHud.cycleRadarRange();e.preventDefault();return;}
    if(e.code==='KeyG'&&!e.repeat){gunSelect.selectedIndex=(gunSelect.selectedIndex+1)%gunSelect.options.length;gunLabels();return;}
    if(/^Digit[1-4]$/.test(e.code)){select.value=String(Number(e.code.slice(-1))-1);select.onchange();return;}
    if(['Space','KeyW','KeyS','KeyX','KeyQ','KeyE','KeyA','KeyD','KeyR','KeyF','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.code)>=0){e.preventDefault();if(!paused)keys[e.code]=true;}
  });
  window.addEventListener('keyup',function(e){delete keys[e.code];});
  host.addEventListener('contextmenu',function(e){e.preventDefault();});
  document.addEventListener('mousedown',function(e){if(!paused&&document.pointerLockElement===host&&(e.button===0||e.button===2))keys['mouse'+e.button]=true;});
  document.addEventListener('mouseup',function(e){delete keys['mouse'+e.button];});
  document.addEventListener('mousemove',function(e){if(!paused&&document.pointerLockElement===host){mouse=DW.flightInput.moveStick(mouse,e.movementX,e.movementY,stickRange(),Number(document.getElementById('sensitivity').value));}});
  function stickRange(){return Math.min(160,Math.min(host.clientWidth,host.clientHeight)*.2);}
  function axis(a,b){return (keys[a]?1:0)-(keys[b]?1:0);}
  function frame(t){
    var cap=Number(document.getElementById('fps-cap').value),limit=paused?Math.min(cap||60,15):cap;
    if(!performanceTools.due(pace,t,limit)){requestAnimationFrame(frame);return;}
    var frameStart=performance.now();
    var actualElapsed=previous?(t-previous)/1000:0,elapsed=Math.min(.1,actualElapsed);previous=t;
    var connected=pads(),signature=connected.map(function(p){return p.index+':'+p.id;}).join('|');
    if(signature!==padSignature){
      var selected=device.value;padSignature=signature;device.textContent='';connected.forEach(function(p){var option=document.createElement('option');option.value=String(p.index);option.textContent=p.id;device.appendChild(option);});
      if(connected.some(function(p){return String(p.index)===selected;}))device.value=selected;
      if(!connected.length){var empty=document.createElement('option');empty.value='';empty.textContent='No device detected';device.appendChild(empty);}
    }
    if(lastPad!==null&&!connected.some(function(p){return p.index===lastPad;})){pause();lastPad=null;}
    var pad=connected.find(function(p){return String(p.index)===device.value;});
    if(lastPad!==null&&!pad){pause();lastPad=null;}
    if(pad&&pad.index!==lastPad){lastPad=pad.index;configure(pad);}
    document.getElementById('device-status').textContent=pad?pad.id:'Connect a controller and press a button to detect it.';
    document.getElementById('device-live').textContent=pad?'Axes: '+pad.axes.map(function(v,i){return i+':'+v.toFixed(2);}).join(' ')+' | Buttons: '+pad.buttons.map(function(b,i){return b.pressed?i:null;}).filter(function(v){return v!==null;}).join(', '):'';
    var controls=pad?input.read(pad,mapping):{pitch:0,yaw:0,roll:0,throttle:null,throttleRate:0,fire:false,boost:false,bank:false,pause:false};
    if(controls.pause&&!previousButtons.pause)pause();
    if(!paused&&controls.bank&&!previousButtons.bank){gunSelect.selectedIndex=(gunSelect.selectedIndex+1)%gunSelect.options.length;gunLabels();}
    previousButtons={bank:controls.bank,pause:controls.pause};
    look=inputMode.value==='mouse'?input.stickDemand(mouse,.08):[0,0];
    if(!paused){
      var result=session.advance(elapsed,{throttle:controls.throttle,throttleRate:axis('KeyW','KeyS')+controls.throttleRate,stop:keys.KeyX,pitch:axis('ArrowUp','ArrowDown')+look[0]+controls.pitch,yaw:axis('ArrowLeft','ArrowRight')+look[1]+controls.yaw,roll:axis('KeyQ','KeyE')+controls.roll,side:axis('KeyD','KeyA'),vertical:axis('KeyR','KeyF'),boost:keys.ShiftLeft||keys.ShiftRight||controls.boost,fire:keys.Space||keys.mouse0||keys.mouse2||controls.fire},{profile:profile(),weapon:weapon()});
      contact=result.contact;
      if(combat.dead){pause();status.textContent='Training over � Restart training to try again';}
      pose();status.textContent=contact?'Surface contact · throttle cut':document.pointerLockElement===host?'Mouse captured · Esc pauses & releases':'Flight controls active';
    }
    if(!paused){world.elapsedSeconds+=elapsed;comms.update(elapsed,combat,state);}
    var livingArt=DW.training.alive(combat).concat(combat.wrecks),actorBatches=[];
    ['ally','enemy'].forEach(function(team){var craft=livingArt.filter(function(e){return (e.team||'enemy')===team;}),selection=team==='ally'?allyArt.value:artSelect.value;if(!craft.length)return;var batches=selection?DW.shipPackModels.sourceFleetGeometry(craft,selection,combat.wave,units,shipImages,document.getElementById('faction-paint').checked?DW.shipPackModels.paintColor(document.getElementById(team+'-color').value):undefined):DW.training.geometry({enemies:craft.map(function(e){return Object.assign({},e,{hp:1});})});batches.forEach(function(batch){actorBatches.push(batch);});});
    ['ally','enemy'].forEach(function(team){var craft=livingArt.filter(function(e){return (e.team||'enemy')===team;});DW.shipPackModels.scorchGeometry(craft,team==='ally'?allyArt.value:artSelect.value,combat.wave,units).forEach(function(batch){actorBatches.push(batch);});});
    scene.setStudyActors(actorBatches);var effectBatches=DW.flightGuns.geometry(DW.training.allGuns(combat,guns),state),engineParts=[];
    ['ally','enemy'].forEach(function(team){var craft=DW.training.alive(combat).filter(function(e){return (e.team||'enemy')===team;});engineParts.push(DW.shipPackModels.engineGeometry(craft,team==='ally'?allyArt.value:artSelect.value,combat.wave,units,state,world.elapsedSeconds).vertices);});
    var engines=new Float32Array(engineParts.reduce(function(n,p){return n+p.length;},0)),engineOffset=0;engineParts.forEach(function(p){engines.set(p,engineOffset);engineOffset+=p.length;});
    effectBatches.push({vertices:engines,color:[.25,.65,1]});scene.setStudyEffects(effectBatches);var comparison=diagnostics();scene.setStudyDiagnostics(comparison);skybox.render(state,comparison.scale,comparison.mode==='empty');scene.sync(world);scene.render(world,1,0,elapsed);flightHud.render({state:state,combat:combat,guns:guns,asteroid:asteroid,mothership:mothership,units:units,paused:paused,mouse:mouse,inputMode:inputMode.value,stickRange:stickRange(),speakerId:comms.speakerId(),weapon:weapon(),shipImages:shipImages,allyArt:allyArt.value,enemyArt:artSelect.value,paint:{ally:document.getElementById('faction-paint').checked?DW.shipPackModels.paintColor(document.getElementById('ally-color').value):undefined,enemy:document.getElementById('faction-paint').checked?DW.shipPackModels.paintColor(document.getElementById('enemy-color').value):undefined}});
    performanceTools.record(measurements,actualElapsed*1000,performance.now()-frameStart);
    var perfElement=document.getElementById('perf-overlay');perfElement.hidden=!document.getElementById('perf-enabled').checked;
    if(t-lastStatsUpdate>250){
      lastStatsUpdate=t;var summary=performanceTools.summary(measurements),render=scene.getRenderStats(),skyStats=skybox.getRenderStats();
      perfElement.textContent=(paused?'PAUSED / 15 FPS CAP':'FLIGHT / '+(cap?cap+' FPS CAP':'UNCAPPED'))+' · '+comparison.mode+(comparison.flat?' / flat':'')+
        '\n'+summary.fps.toFixed(1)+' FPS · '+summary.frame.toFixed(1)+' ms/frame'+
        '\np95 '+summary.p95.toFixed(1)+' ms · worst '+summary.worst.toFixed(1)+' ms'+
        '\nCPU '+summary.cpu.toFixed(2)+' ms · scene submit '+render.cpuMs.toFixed(2)+' ms'+
        '\nDraw calls '+(render.drawCalls+skyStats.drawCalls)+' · triangles '+Math.round(render.triangles+skyStats.triangles).toLocaleString()+
        '\nMeshes '+(render.meshes+skyStats.meshes)+' · material variants '+(render.materials+skyStats.materials)+
        '\n'+render.width+' × '+render.height+' · pixel ratio '+render.pixelRatio.toFixed(2)+
        '\nSky points '+skyStats.points+' · shadow passes 0'+
        '\nCPU timing only; GPU time not measured';
    }
    requestAnimationFrame(frame);
  }
  labels();banks();reset();requestAnimationFrame(frame);
}());
