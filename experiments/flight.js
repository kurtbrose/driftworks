(function(){
  'use strict';
  var DW=window.Driftworks,model=DW.arcade,world=DW.sim.createInitialWorld(),host=document.getElementById('viewer');
  var asteroid=world.asteroids[0],units=DW.sim.METERS_PER_UNIT;
  asteroid.position={x:0,y:0};asteroid.rotation=0;asteroid.radius=300/units;
  var mothership=world.ships.find(function(ship){return ship.type==='mothership';});
  // Fixed production artwork scale, roughly 2 km between the body and ship centers.
  mothership.position={x:900/units,y:1800/units};mothership.previousPosition={x:900/units,y:1800/units};mothership.rotation=0;
  mothership.velocity={x:0,y:0};mothership.previousVelocity={x:0,y:0};
  world.asteroids=[asteroid];world.ships=[mothership];world.platforms=[];world.wrecks=[];world.packets=[];world.selectedShipIds=[];world.combat.drones=[];
  var scene=DW.scene3d.create(host,function(){return world;},function(w){world=w;},{study:true,rubbleMaxDetail:2,rubbleTriangleBudget:40000});
  var skybox=DW.flightSkybox.create(host);
  var select=document.getElementById('profile'),stats=document.getElementById('stats'),status=document.getElementById('status'),telemetry=document.getElementById('telemetry');
  var state=model.create(asteroid.radius),keys={},paused=true,mouse=[0,0],look=[0,0],previous=0,contact=false;
  model.profiles.forEach(function(p,i){var option=document.createElement('option');option.value=String(i);option.textContent=p.name;select.appendChild(option);});
  var guns=DW.flightGuns.create(),gunSelect=document.getElementById('gun');
  var performanceTools=DW.flightPerformance,pace=performanceTools.pacer(),measurements=performanceTools.create(),lastStatsUpdate=0;
  function diagnostics(){return {mode:document.getElementById('render-mode').value,flat:document.getElementById('flat-materials').checked,scale:Number(document.getElementById('render-scale').value),rubble:document.getElementById('draw-rubble').checked,mothership:document.getElementById('draw-mothership').checked,actors:document.getElementById('draw-enemies').checked};}
  function resetMeasurements(){measurements=performanceTools.create();pace.next=null;previous=0;lastStatsUpdate=0;}
  ['render-mode','flat-materials','render-scale','fps-cap','draw-rubble','draw-mothership','draw-enemies'].forEach(function(id){document.getElementById(id).addEventListener('change',resetMeasurements);});
  document.getElementById('perf-reset').onclick=resetMeasurements;
  var radarRanges=[1000,2500,5000,10000],radarRangeIndex=2;
  var comms=DW.flightComms.mount(document.getElementById('comms'),document.getElementById('comms-voice'));
  var combat=DW.training.create(document.getElementById('combat-mode').value);
  var artSelect=document.getElementById('enemy-art'),allyArt=document.getElementById('ally-art');DW.shipPackModels.populate(artSelect,true);DW.shipPackModels.populate(allyArt,true);[artSelect,allyArt].forEach(function(select){var option=document.createElement('option');option.value='mixed';option.textContent='Mixed fleet � all ship models';select.insertBefore(option,select.firstChild);select.value='mixed';});
  function artCredit(){var entry=DW.shipPackModels.find(artSelect.value);document.getElementById('art-credit').textContent=artSelect.value==='mixed'?'Mixed fleet � both CC0 libraries � changes each wave':entry?entry.pack.author+' / '+entry.model.name+' · '+entry.pack.license+' · '+entry.model.triangles.toLocaleString()+' triangles per ship':'Original six-triangle training hull';}
  function allyCredit(){var entry=DW.shipPackModels.find(allyArt.value);document.getElementById('ally-credit').textContent=allyArt.value==='mixed'?'Mixed fleet � both CC0 libraries � changes each wave':entry?entry.pack.author+' / '+entry.model.name+' · '+entry.pack.license:'Original training blockout';}
  allyArt.onchange=allyCredit;allyCredit();artSelect.onchange=artCredit;artCredit();

  function weapon(){return DW.retailWeapons[Number(gunSelect.value)];}
  function gunLabels(){var w=weapon();document.getElementById('gun-stats').textContent=w.speed+' m/s · '+w.fireWait+' s / volley · '+(w.speed*w.lifetime)+' m range';}
  function banks(){
    gunSelect.textContent='';var indexes=Number(select.value)===3?[1]:Number(select.value)===2?[1,0]:[0,1];
    indexes.forEach(function(index){var option=document.createElement('option');option.value=String(index);option.textContent=DW.retailWeapons[index].name;gunSelect.appendChild(option);});gunLabels();
  }
  gunSelect.onchange=gunLabels;
  document.getElementById('restart-training').onclick=function(){pause();reset();document.activeElement.blur();};
  document.getElementById('combat-toggle').onchange=function(e){comms.reset();combat=DW.training.create(document.getElementById('combat-mode').value);combat.enabled=e.target.checked;if(!combat.enabled){combat.enemies=[];combat.countdown=0;}};
  function profile(){return model.profiles[Number(select.value)];}
  function labels(){var p=profile();stats.textContent=p.role+'\nCruise / boost '+p.maxVelocity[2]+' / '+p.afterburnerVelocity[2]+' m/s\nAccel / decel '+p.forwardAccel+' / '+p.forwardDecel+' s\nPitch / yaw / roll (s/360°)\n'+p.rotationTime.join(' / ')+'\nDamp / rotdamp '+p.damp+' / '+p.rotdamp;}
  function clear(){keys={};mouse=[0,0];look=[0,0];}
  function pause(){paused=true;comms.pause();document.body.classList.remove('flight-active');clear();if(document.pointerLockElement===host)document.exitPointerLock();document.body.classList.remove('mouse-captured');status.textContent='Paused · Click Fly to resume';}
  function pose(){scene.setSurfaceCamera({eye:state.eye,right:state.right,up:state.up,back:state.back});}
  function reset(){clear();comms.reset();combat=DW.training.create(document.getElementById('combat-mode').value);combat.enabled=document.getElementById('combat-toggle').checked;guns=DW.flightGuns.create();state=model.create(asteroid.radius);contact=false;pose();}
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
    if(combat.dead){status.textContent='Training over · Restart training to fly again';return;}
    if(inputMode.value!=='mouse'){resume();return;}
    if(!host.requestPointerLock){captureFailure();return;}
    try{var result=host.requestPointerLock();if(result&&result.catch)result.catch(captureFailure);}catch(error){captureFailure();}
  };
  document.addEventListener('pointerlockchange',function(){if(document.pointerLockElement===host){if(combat.dead){pause();return;}resume();document.body.classList.add('mouse-captured');}else pause();});
  document.addEventListener('pointerlockerror',captureFailure);
  window.addEventListener('blur',pause);document.addEventListener('visibilitychange',function(){if(document.hidden)pause();});
  window.addEventListener('keydown',function(e){
    if(e.code==='Escape'){pause();return;}
    if(/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName))return;
    if(e.code==='KeyC'&&!paused){mouse=[0,0];e.preventDefault();return;}
    if(e.code==='KeyP'&&!e.repeat){var overlayToggle=document.getElementById('perf-enabled');overlayToggle.checked=!overlayToggle.checked;return;}
    if(e.code==='Tab'&&!paused){e.preventDefault();DW.training.cycle(combat);return;}
    if(e.code==='KeyV'&&!e.repeat){radarRangeIndex=(radarRangeIndex+1)%radarRanges.length;e.preventDefault();return;}
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
      // Fixed small substeps keep response independent of display refresh rate.
      var remaining=elapsed;contact=false;
      while(remaining>0){var dt=Math.min(1/120,remaining);remaining-=dt;
        if(controls.throttle!==null)state.throttle=controls.throttle;
        state.throttle=Math.max(0,Math.min(1,state.throttle+(axis('KeyW','KeyS')+controls.throttleRate)*dt*.5));if(keys.KeyX)state.throttle=0;
        model.step(state,profile(),{pitch:axis('ArrowUp','ArrowDown')+look[0]+controls.pitch,yaw:axis('ArrowLeft','ArrowRight')+look[1]+controls.yaw,roll:axis('KeyQ','KeyE')+controls.roll,side:axis('KeyD','KeyA'),vertical:axis('KeyR','KeyF'),boost:keys.ShiftLeft||keys.ShiftRight||controls.boost},dt);
        function terrainHit(start,end){return DW.flightGuns.intersect(start,end,asteroid.radius,function(point){return DW.scene3d.rockField(asteroid,point);});}
        var playerHitBefore=combat.lastHit;
        DW.training.step(combat,state,dt,asteroid.radius,terrainHit);
        var firedBefore=guns.fired,hitsBefore=guns.hits;
        DW.flightGuns.step(guns,state,weapon(),!combat.dead&&(keys.Space||keys.mouse0||keys.mouse2||controls.fire),dt,function(start,end,bolt){
          return DW.training.trace(combat,start,end,bolt,'player',terrainHit,state);
        });
        if(guns.fired>firedBefore)DW.audio.playGunshot();if(guns.hits>hitsBefore||combat.lastHit>playerHitBefore)DW.audio.playImpact(1);
        if(combat.dead){pause();status.textContent='Training over · Restart training to try again';break;}
        var length=Math.hypot.apply(null,state.eye),direction=state.eye.map(function(x){return x/(length||1);});
        if(length<asteroid.radius*1.12+5/units){
          var surface=DW.scene3d.surfaceFrame(asteroid,direction);
          if(model.contact(state,surface.point,asteroid.radius))contact=true;
        }
      }
      pose();status.textContent=contact?'Surface contact · throttle cut':document.pointerLockElement===host?'Mouse captured · Esc pauses & releases':'Flight controls active';
    }
    var shipDistance=Math.hypot(state.eye[0]-mothership.position.x,state.eye[1]-mothership.position.y,state.eye[2])*units;
    var distance=Math.hypot.apply(null,state.eye),speed=Math.hypot.apply(null,state.velocity);
    telemetry.textContent=speed.toFixed(0)+' m/s   /   '+Math.round(state.throttle*100)+'% THR\n'+Math.round(distance*units)+' m TO CENTER\n'+Math.round(asteroid.radius*2*units)+' m BODY DIAMETER\n'+Math.round(shipDistance)+' m TO MOTHERSHIP\n'+guns.fired+' SHOTS / '+guns.hits+' HITS';
    if(!paused){world.elapsedSeconds+=elapsed;comms.update(elapsed,combat,state);}
    var livingArt=DW.training.alive(combat).concat(combat.wrecks),actorBatches=[];
    ['ally','enemy'].forEach(function(team){var craft=livingArt.filter(function(e){return (e.team||'enemy')===team;}),selection=team==='ally'?allyArt.value:artSelect.value;if(!craft.length)return;var batches=selection?DW.shipPackModels.fleetGeometry(craft,selection,combat.wave,units):DW.training.geometry({enemies:craft.map(function(e){return Object.assign({},e,{hp:1});})});batches.forEach(function(batch){actorBatches.push(batch);});});
    scene.setStudyActors(actorBatches);var effectBatches=DW.flightGuns.geometry(DW.training.allGuns(combat,guns),state),engineParts=[];
    ['ally','enemy'].forEach(function(team){var craft=DW.training.alive(combat).filter(function(e){return (e.team||'enemy')===team;});engineParts.push(DW.shipPackModels.engineGeometry(craft,team==='ally'?allyArt.value:artSelect.value,combat.wave,units,state,world.elapsedSeconds).vertices);});
    var engines=new Float32Array(engineParts.reduce(function(n,p){return n+p.length;},0)),engineOffset=0;engineParts.forEach(function(p){engines.set(p,engineOffset);engineOffset+=p.length;});
    effectBatches.push({vertices:engines,color:[.25,.65,1]});scene.setStudyEffects(effectBatches);var comparison=diagnostics();scene.setStudyDiagnostics(comparison);skybox.render(state,comparison.scale,comparison.mode==='empty');scene.sync(world);scene.render(world,1,0,elapsed);drawCombat();
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
  var combatCanvas=document.createElement('canvas');combatCanvas.className='combat-overlay';combatCanvas.setAttribute('aria-hidden','true');document.body.appendChild(combatCanvas);var combatHud=combatCanvas.getContext('2d');
  function drawCombat(){
    var w=host.clientWidth,h=host.clientHeight;if(combatCanvas.width!==w||combatCanvas.height!==h){combatCanvas.width=w;combatCanvas.height=h;}combatHud.clearRect(0,0,w,h);
    if(!paused&&inputMode.value==='mouse'){
      var range=stickRange(),cx=w/2,cy=h/2,sx=cx+mouse[0]*range,sy=cy+mouse[1]*range;
      combatHud.strokeStyle='rgba(166,239,222,.3)';combatHud.beginPath();combatHud.arc(cx,cy,range,0,Math.PI*2);combatHud.stroke();combatHud.beginPath();combatHud.arc(cx,cy,range*.08,0,Math.PI*2);combatHud.stroke();
      combatHud.strokeStyle='#a6efde';combatHud.beginPath();combatHud.moveTo(cx,cy);combatHud.lineTo(sx,sy);combatHud.stroke();combatHud.beginPath();combatHud.arc(sx,sy,5,0,Math.PI*2);combatHud.stroke();
    }
    var speakerId=comms.speakerId(),living=DW.training.alive(combat),selected=living.find(function(e){return e.id===combat.targetId;});
    document.getElementById('combat-status').textContent=!combat.enabled?'Free flight':combat.dead?'TRAINING OVER · '+combat.kills+' kills · Restart training':
      (combat.mode==='furball'?'FURBALL '+(combat.wave||1)+' · '+living.filter(function(e){return e.team==='ally';}).length+' allies / '+living.filter(function(e){return e.team==='enemy';}).length+' enemies':'WAVE '+(combat.wave||1)+' · '+living.length+' hostiles')+' · '+combat.kills+' reds down\nSHIELD '+Math.ceil(combat.shield)+' / 120   HULL '+Math.ceil(combat.hull)+' / 100'+(!living.length||combat.roundOver?'\nNext wave in '+Math.max(0,Math.ceil(combat.countdown))+' s':'');
    if(combat.hitFlash>0){combatHud.fillStyle='rgba(255,55,25,'+(combat.hitFlash*.28)+')';combatHud.fillRect(0,0,w,h);}
    var radarContacts=living.map(function(e){return {point:e.pose.eye,color:e.team==='ally'?'#63f58d':'#ff655d',selected:e.id===combat.targetId,speaking:e.id===speakerId};});
    radarContacts.push({point:[0,0,0],color:'#a6aeb7',landmark:true});
    radarContacts.push({point:[mothership.position.x,mothership.position.y,0],color:'#69cfff',landmark:true});
    DW.flightRadar.draw(combatHud,state,radarContacts,units,radarRanges[radarRangeIndex],w,h,paused);
    combatHud.font='12px ui-monospace,monospace';combatHud.textAlign='center';
    function projection(point){return DW.flightSkybox.project(point.map(function(x,i){return x-state.eye[i];}),state,w/h);}
    living.forEach(function(e){
      var q=projection(e.pose.eye),target=e.id===combat.targetId;combatHud.strokeStyle=e.team==='ally'?'#63f58d':target?'#ffe7a3':'#ff655d';combatHud.fillStyle=combatHud.strokeStyle;
      if(q&&Math.abs(q.x)<.9&&Math.abs(q.y)<.78){
        var x=w*(q.x+1)/2,y=h*(1-q.y)/2,r=target?18:12;
        if(e.team==='ally'){combatHud.strokeRect(x-r,y-r,r*2,r*2);}else{combatHud.beginPath();combatHud.moveTo(x,y-r);combatHud.lineTo(x+r,y);combatHud.lineTo(x,y+r);combatHud.lineTo(x-r,y);combatHud.closePath();combatHud.stroke();}
        if(e.id===speakerId)DW.flightRadar.speakerHalo(combatHud,x,y,r+6);
        combatHud.fillText(Math.round(Math.hypot.apply(null,e.pose.eye.map(function(v,i){return v-state.eye[i];}))*units)+' m',x,y+r+15);
        if(target){combatHud.fillText('ENEMY · '+e.pilot+' · '+e.mode+' · '+Math.ceil(e.hp)+' HP',x,y-r-9);}
      }else{
        var delta=e.pose.eye.map(function(v,i){return v-state.eye[i];}),dx=delta.reduce(function(sum,v,i){return sum+v*state.right[i];},0),dy=-delta.reduce(function(sum,v,i){return sum+v*state.up[i];},0);
        if(Math.abs(dx)+Math.abs(dy)<.0001)dx=1;
        var angle=Math.atan2(dy,dx),edge=Math.min(w*.44/Math.max(.001,Math.abs(Math.cos(angle))),h*.34/Math.max(.001,Math.abs(Math.sin(angle))));
        var x=w/2+Math.cos(angle)*edge,y=h/2+Math.sin(angle)*edge;combatHud.save();combatHud.translate(x,y);combatHud.rotate(angle);combatHud.beginPath();combatHud.moveTo(8,0);combatHud.lineTo(-5,-5);combatHud.lineTo(-5,5);combatHud.closePath();combatHud.stroke();combatHud.restore();
        if(e.id===speakerId)DW.flightRadar.speakerHalo(combatHud,x,y,13);
      }
    });
    if(selected){var lead=DW.training.intercept(state.eye,selected.pose.eye,selected.pose.velocity.map(function(v){return v/units;}),weapon().speed/units),q=projection(lead.point);if(q&&Math.abs(q.x)<1&&Math.abs(q.y)<1){combatHud.strokeStyle='#a9e5dc';combatHud.setLineDash([2,3]);combatHud.beginPath();combatHud.arc(w*(q.x+1)/2,h*(1-q.y)/2,7,0,Math.PI*2);combatHud.stroke();combatHud.setLineDash([]);}}
  }
  labels();banks();pose();requestAnimationFrame(frame);
}());
