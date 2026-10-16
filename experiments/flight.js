(function(){
  'use strict';
  var DW=window.Driftworks,model=DW.arcade,world=DW.sim.createInitialWorld(),host=document.getElementById('viewer');
  var asteroid=world.asteroids[0],units=DW.sim.METERS_PER_UNIT;
  asteroid.position={x:0,y:0};asteroid.rotation=0;asteroid.radius=300/units;
  world.asteroids=[asteroid];world.ships=[];world.platforms=[];world.wrecks=[];world.packets=[];world.selectedShipIds=[];world.combat.drones=[];
  var scene=DW.scene3d.create(host,function(){return world;},function(w){world=w;},{study:true,rubbleMaxDetail:2,rubbleTriangleBudget:40000});
  var skybox=DW.flightSkybox.create(host);
  var select=document.getElementById('profile'),stats=document.getElementById('stats'),status=document.getElementById('status'),telemetry=document.getElementById('telemetry');
  var state=model.create(asteroid.radius),keys={},paused=true,drag=null,look=[0,0],previous=0,contact=false;
  model.profiles.forEach(function(p,i){var option=document.createElement('option');option.value=String(i);option.textContent=p.name;select.appendChild(option);});
  var guns=DW.flightGuns.create(),gunSelect=document.getElementById('gun');
  function weapon(){return DW.retailWeapons[Number(gunSelect.value)];}
  function gunLabels(){var w=weapon();document.getElementById('gun-stats').textContent=w.speed+' m/s · '+w.fireWait+' s / volley · '+(w.speed*w.lifetime)+' m range';}
  function banks(){
    gunSelect.textContent='';var indexes=Number(select.value)===3?[1]:Number(select.value)===2?[1,0]:[0,1];
    indexes.forEach(function(index){var option=document.createElement('option');option.value=String(index);option.textContent=DW.retailWeapons[index].name;gunSelect.appendChild(option);});gunLabels();
  }
  gunSelect.onchange=gunLabels;
  function profile(){return model.profiles[Number(select.value)];}
  function labels(){var p=profile();stats.textContent=p.role+'\nCruise / boost '+p.maxVelocity[2]+' / '+p.afterburnerVelocity[2]+' m/s\nAccel / decel '+p.forwardAccel+' / '+p.forwardDecel+' s\nPitch / yaw / roll (s/360°)\n'+p.rotationTime.join(' / ')+'\nDamp / rotdamp '+p.damp+' / '+p.rotdamp;}
  function clear(){keys={};drag=null;look=[0,0];}
  function pause(){paused=true;clear();status.textContent='Paused · Click Fly to resume';}
  function pose(){scene.setSurfaceCamera({eye:state.eye,right:state.right,up:state.up,back:state.back});}
  function reset(){clear();guns=DW.flightGuns.create();state=model.create(asteroid.radius);contact=false;pose();}
  select.onchange=function(){reset();labels();banks();};
  document.getElementById('diameter').onchange=function(e){var d=Number(e.target.value);if(!Number.isFinite(d)||d<200||d>4000){e.target.value=String(asteroid.radius*units*2);return;}asteroid.radius=d/2/units;reset();};
  document.getElementById('reset').onclick=function(){reset();document.activeElement.blur();};
  document.getElementById('fly').onclick=function(){DW.audio.unlock();clear();paused=false;document.activeElement.blur();status.textContent='Flight controls active';};
  window.addEventListener('blur',pause);document.addEventListener('visibilitychange',function(){if(document.hidden)pause();});
  window.addEventListener('keydown',function(e){
    if(/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName))return;
    if(e.code==='Escape'){pause();return;}
    if(e.code==='KeyG'&&!e.repeat){gunSelect.selectedIndex=(gunSelect.selectedIndex+1)%gunSelect.options.length;gunLabels();return;}
    if(/^Digit[1-4]$/.test(e.code)){select.value=String(Number(e.code.slice(-1))-1);select.onchange();return;}
    if(['Space','KeyW','KeyS','KeyX','KeyQ','KeyE','KeyA','KeyD','KeyR','KeyF','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.code)>=0){e.preventDefault();if(!paused)keys[e.code]=true;}
  });
  window.addEventListener('keyup',function(e){delete keys[e.code];});
  host.addEventListener('contextmenu',function(e){e.preventDefault();});
  host.addEventListener('pointerdown',function(e){if(paused)return;if(e.button===2){keys.fire=true;host.setPointerCapture(e.pointerId);return;}if(e.button!==0)return;drag=e.pointerId;host.setPointerCapture(e.pointerId);});
  host.addEventListener('pointermove',function(e){if(drag===e.pointerId)look=[Math.max(-1,Math.min(1,-e.movementY/12)),Math.max(-1,Math.min(1,-e.movementX/12))];});
  function stopDrag(){keys.fire=false;drag=null;look=[0,0];}host.addEventListener('pointerup',stopDrag);host.addEventListener('pointercancel',stopDrag);host.addEventListener('lostpointercapture',stopDrag);
  function axis(a,b){return (keys[a]?1:0)-(keys[b]?1:0);}
  function frame(t){
    var elapsed=previous?Math.min(.1,(t-previous)/1000):0;previous=t;
    if(!paused){
      // Fixed small substeps keep response independent of display refresh rate.
      var remaining=elapsed;contact=false;
      while(remaining>0){var dt=Math.min(1/120,remaining);remaining-=dt;
        state.throttle=Math.max(0,Math.min(1,state.throttle+axis('KeyW','KeyS')*dt*.5));if(keys.KeyX)state.throttle=0;
        model.step(state,profile(),{pitch:axis('ArrowUp','ArrowDown')+look[0],yaw:axis('ArrowLeft','ArrowRight')+look[1],roll:axis('KeyQ','KeyE'),side:axis('KeyD','KeyA'),vertical:axis('KeyR','KeyF'),boost:keys.ShiftLeft||keys.ShiftRight},dt);
        var firedBefore=guns.fired,hitsBefore=guns.hits;
        DW.flightGuns.step(guns,state,weapon(),keys.Space||keys.fire,dt,function(start,end){
          return DW.flightGuns.intersect(start,end,asteroid.radius,function(point){return DW.scene3d.rockField(asteroid,point);});
        });
        if(guns.fired>firedBefore)DW.audio.playGunshot();if(guns.hits>hitsBefore)DW.audio.playImpact(1);
        var length=Math.hypot.apply(null,state.eye),direction=state.eye.map(function(x){return x/(length||1);});
        if(length<asteroid.radius*1.12+5/units){
          var surface=DW.scene3d.surfaceFrame(asteroid,direction);
          if(model.contact(state,surface.point,asteroid.radius))contact=true;
        }
      }
      pose();status.textContent=contact?'Surface contact · throttle cut':'Flight controls active';
    }
    var distance=Math.hypot.apply(null,state.eye),speed=Math.hypot.apply(null,state.velocity);
    telemetry.textContent=speed.toFixed(0)+' m/s   /   '+Math.round(state.throttle*100)+'% THR\n'+Math.round(distance*units)+' m TO CENTER\n'+Math.round(asteroid.radius*2*units)+' m BODY DIAMETER\n'+guns.fired+' SHOTS / '+guns.hits+' HITS';
    scene.setStudyEffects(DW.flightGuns.geometry(guns,state));skybox.render(state);scene.sync(world);scene.render(world,1,0,elapsed);requestAnimationFrame(frame);
  }
  labels();banks();pose();requestAnimationFrame(frame);
}());
