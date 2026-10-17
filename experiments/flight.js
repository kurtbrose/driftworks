(function(){
  'use strict';
  var DW=window.Driftworks,model=DW.arcade,host=document.getElementById('viewer');
  var session=DW.flightSession.create({hullHit:function(craft,start,end){return presentation.hullHit(craft,start,end,combat.wave);},terrainHit:function(start,end){return DW.flightGuns.intersect(start,end,asteroid.radius,function(point){return DW.scene3d.rockField(asteroid,point);});},surfaceFrame:DW.scene3d.surfaceFrame,onGunshot:function(){DW.audio.playGunshot();},onImpact:function(){DW.audio.playImpact(1);}});
  var initial=session.snapshot(),world=initial.world,asteroid=initial.asteroid,mothership=initial.mothership,units=DW.sim.METERS_PER_UNIT;
  var presentation=DW.flightPresentation.mount(host,function(){return world;},function(w){world=w;session.setWorld(w);});
  var select=document.getElementById('profile'),stats=document.getElementById('stats'),status=document.getElementById('status');
  var state=model.createSortie(asteroid.radius,model.profiles[Number(select.value)||0]),paused=true,contact=false;
  model.profiles.forEach(function(p,i){var option=document.createElement('option');option.value=String(i);option.textContent=p.name;select.appendChild(option);});
  var guns=DW.flightGuns.create(),gunSelect=document.getElementById('gun');
  var diagnostics=DW.flightDiagnostics.mount();
  document.getElementById('dialogue-size').oninput=function(e){document.documentElement.style.setProperty('--dialogue-size',e.target.value+'px');};
  var flightHud=DW.flightHud.mount(host);
  var comms=DW.flightComms.mount(document.getElementById('comms'),document.getElementById('comms-voice'));
  var combat=DW.training.create(document.getElementById('combat-mode').value);
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
  function clear(){controls.clear();}
  function pause(){paused=true;comms.pause();document.body.classList.remove('flight-active');clear();controls.release();document.body.classList.remove('mouse-captured');document.getElementById('fly').textContent=combat.dead?'Restart flight':'Resume flight';status.textContent='Paused - Resume flight when ready';}
  function pose(){presentation.pose(state);}
  function reset(){clear();comms.reset();var fresh=session.reset({mode:document.getElementById('combat-mode').value,enabled:document.getElementById('combat-toggle').checked,profile:model.profiles[Number(select.value)||0]});state=fresh.state;combat=fresh.combat;guns=fresh.guns;contact=fresh.contact;document.getElementById('fly').textContent='Start flight';pose();}
  document.getElementById('combat-mode').onchange=function(){pause();reset();};
  select.onchange=function(){reset();labels();banks();};
  document.getElementById('diameter').onchange=function(e){var d=Number(e.target.value);if(!Number.isFinite(d)||d<200||d>4000){e.target.value=String(asteroid.radius*units*2);return;}asteroid.radius=d/2/units;reset();};
  document.getElementById('reset').onclick=function(){reset();document.activeElement.blur();};
  function resume(){if(combat.dead){status.textContent='Training over · Restart training to fly again';return;}DW.audio.unlock();comms.unlock();clear();controls.resetButtons();paused=false;document.body.classList.add('flight-active');document.activeElement.blur();status.textContent='Flight controls active · Esc pauses';}
  function captureFailure(error){pause();if(error&&error.message)status.dataset.captureError=error.message;else if(!status.dataset.captureError)status.dataset.captureError='Pointer lock rejected by browser';status.textContent='Mouse capture unavailable. Retry Fly or select Controller / keyboard.';}
  document.getElementById('fly').onclick=function(){
    if(combat.dead)reset();
    if(controls.view().inputMode!=='mouse'){resume();return;}
    controls.capture();
  };
  function nextWeapon(){gunSelect.selectedIndex=(gunSelect.selectedIndex+1)%gunSelect.options.length;gunLabels();}
  var controls=DW.flightControls.mount(host,{
    pause:pause,resume:resume,captureFailure:captureFailure,
    isPaused:function(){return paused;},isDead:function(){return combat.dead;},
    nextWeapon:nextWeapon,nextTarget:function(){DW.training.cycle(combat);},
    nextRadarRange:function(){flightHud.cycleRadarRange();},
    selectProfile:function(index){select.value=String(index);select.onchange();},
    toggleDiagnostics:diagnostics.toggleDiagnostics,togglePerformance:diagnostics.togglePerformance
  });
  function frame(t){
    var timing=diagnostics.beginFrame(t,paused);
    if(!timing){requestAnimationFrame(frame);return;}
    var elapsed=timing.elapsed;
    var demand=controls.sample();
    if(!paused){
      var result=session.advance(elapsed,demand,{profile:profile(),weapon:weapon()});
      contact=result.contact;
      if(combat.dead){pause();status.textContent='Training over � Restart training to try again';}
      pose();status.textContent=contact?'Surface contact · throttle cut':document.pointerLockElement===host?'Mouse captured · Esc pauses & releases':'Flight controls active';
    }
    if(!paused){world.elapsedSeconds+=elapsed;comms.update(elapsed,combat,state);}
    var appearance=presentation.appearance(),comparison=diagnostics.settings();
    presentation.render({world:world,state:state,combat:combat,guns:guns},appearance,comparison,elapsed);
    var inputView=controls.view();
    flightHud.render(Object.assign({state:state,combat:combat,guns:guns,asteroid:asteroid,mothership:mothership,units:units,paused:paused,speakerId:comms.speakerId(),weapon:weapon()},inputView,appearance));
    diagnostics.endFrame(timing,paused,comparison,presentation.renderStats);
    requestAnimationFrame(frame);
  }
  labels();banks();reset();requestAnimationFrame(frame);
}());
