(function(){
  'use strict';
  var DW=window.Driftworks;
  // Environment injection keeps browser wiring testable without changing input math.
  function mount(host,actions,environment){
    environment=environment||{document:globalThis.document,window:globalThis.window,navigator:globalThis.navigator};
    var document=environment.document,window=environment.window,navigator=environment.navigator;
    var inputMode=document.getElementById('input-mode'),device=document.getElementById('device'),bindingHost=document.getElementById('bindings'),input=DW.flightInput;
    var keys={},mouse=[0,0],mapping=input.defaults(true),padSignature='',lastPad=null,previousButtons={bank:false,pause:false};
    function clear(){keys={};mouse=[0,0];}
    function resetButtons(){previousButtons={bank:false,pause:false};}
    function release(){if(document.pointerLockElement===host)document.exitPointerLock();}
    function capture(){
      if(!host.requestPointerLock){actions.captureFailure();return;}
      try{var result=host.requestPointerLock();if(result&&result.catch)result.catch(actions.captureFailure);}catch(error){actions.captureFailure(error);}
    }
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
    device.onchange=function(){actions.pause();lastPad=null;var pad=pads().find(function(p){return String(p.index)===device.value;});if(pad){lastPad=pad.index;configure(pad);}};
    document.getElementById('deadzone').onchange=function(e){mapping.deadzone=Math.max(0,Math.min(.5,Number(e.target.value)||0));e.target.value=String(mapping.deadzone);};
    inputMode.onchange=actions.pause;
    document.addEventListener('pointerlockchange',function(){if(document.pointerLockElement===host){if(actions.isDead()){actions.pause();return;}actions.resume();document.body.classList.add('mouse-captured');}else actions.pause();});
    document.addEventListener('pointerlockerror',actions.captureFailure);
    window.addEventListener('blur',actions.pause);document.addEventListener('visibilitychange',function(){if(document.hidden)actions.pause();});
    window.addEventListener('keydown',function(e){
      if(e.code==='F3'&&!e.repeat){e.preventDefault();actions.toggleDiagnostics();return;}
      if(e.code==='Escape'){actions.pause();return;}
      if(/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName))return;
      if(e.code==='KeyC'&&!actions.isPaused()){mouse=[0,0];e.preventDefault();return;}
      if(e.code==='KeyP'&&!e.repeat){actions.togglePerformance();return;}
      if(e.code==='Tab'&&!actions.isPaused()){e.preventDefault();actions.nextTarget();return;}
      if(e.code==='KeyV'&&!e.repeat){actions.nextRadarRange();e.preventDefault();return;}
      if(e.code==='KeyG'&&!e.repeat){actions.nextWeapon();return;}
      if(/^Digit[1-4]$/.test(e.code)){actions.selectProfile(Number(e.code.slice(-1))-1);return;}
      if(['Space','KeyW','KeyS','KeyX','KeyQ','KeyE','KeyA','KeyD','KeyR','KeyF','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(e.code)>=0){e.preventDefault();if(!actions.isPaused())keys[e.code]=true;}
    });
    window.addEventListener('keyup',function(e){delete keys[e.code];});
    host.addEventListener('contextmenu',function(e){e.preventDefault();});
    document.addEventListener('mousedown',function(e){if(!actions.isPaused()&&document.pointerLockElement===host&&(e.button===0||e.button===2))keys['mouse'+e.button]=true;});
    document.addEventListener('mouseup',function(e){delete keys['mouse'+e.button];});
    document.addEventListener('mousemove',function(e){if(!actions.isPaused()&&document.pointerLockElement===host){mouse=DW.flightInput.moveStick(mouse,e.movementX,e.movementY,stickRange(),Number(document.getElementById('sensitivity').value));}});
    function stickRange(){return Math.min(160,Math.min(host.clientWidth,host.clientHeight)*.2);}
    function axis(a,b){return (keys[a]?1:0)-(keys[b]?1:0);}
    function sample(){
      var connected=pads(),signature=connected.map(function(p){return p.index+':'+p.id;}).join('|');
      if(signature!==padSignature){
        var selected=device.value;padSignature=signature;device.textContent='';connected.forEach(function(p){var option=document.createElement('option');option.value=String(p.index);option.textContent=p.id;device.appendChild(option);});
        if(connected.some(function(p){return String(p.index)===selected;}))device.value=selected;
        if(!connected.length){var empty=document.createElement('option');empty.value='';empty.textContent='No device detected';device.appendChild(empty);}
      }
      if(lastPad!==null&&!connected.some(function(p){return p.index===lastPad;})){actions.pause();lastPad=null;}
      var pad=connected.find(function(p){return String(p.index)===device.value;});
      if(lastPad!==null&&!pad){actions.pause();lastPad=null;}
      if(pad&&pad.index!==lastPad){lastPad=pad.index;configure(pad);}
      document.getElementById('device-status').textContent=pad?pad.id:'Connect a controller and press a button to detect it.';
      document.getElementById('device-live').textContent=pad?'Axes: '+pad.axes.map(function(v,i){return i+':'+v.toFixed(2);}).join(' ')+' | Buttons: '+pad.buttons.map(function(b,i){return b.pressed?i:null;}).filter(function(v){return v!==null;}).join(', '):'';
      var controls=pad?input.read(pad,mapping):{pitch:0,yaw:0,roll:0,throttle:null,throttleRate:0,fire:false,boost:false,bank:false,pause:false};
      if(controls.pause&&!previousButtons.pause)actions.pause();
      if(!actions.isPaused()&&controls.bank&&!previousButtons.bank){actions.nextWeapon();}
      previousButtons={bank:controls.bank,pause:controls.pause};
      var look=inputMode.value==='mouse'?input.stickDemand(mouse,.08):[0,0];
      return {throttle:controls.throttle,throttleRate:axis('KeyW','KeyS')+controls.throttleRate,stop:keys.KeyX,pitch:axis('ArrowUp','ArrowDown')+look[0]+controls.pitch,yaw:axis('ArrowLeft','ArrowRight')+look[1]+controls.yaw,roll:axis('KeyQ','KeyE')+controls.roll,side:axis('KeyD','KeyA'),vertical:axis('KeyR','KeyF'),boost:keys.ShiftLeft||keys.ShiftRight||controls.boost,fire:keys.Space||keys.mouse0||keys.mouse2||controls.fire};
    }
    function view(){return {mouse:mouse,inputMode:inputMode.value,stickRange:stickRange()};}
    return {sample:sample,view:view,clear:clear,resetButtons:resetButtons,capture:capture,release:release};
  }
  DW.flightControls={mount:mount};
}());
