(function(){
  'use strict';
  function deadzone(value,zone){value=Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;zone=Math.max(0,Math.min(.5,zone));return Math.abs(value)<=zone?0:Math.sign(value)*(Math.abs(value)-zone)/(1-zone);}
  function defaults(standard){return {pitch:1,yaw:0,roll:2,throttle:standard?-1:3,pitchInvert:standard,yawInvert:false,rollInvert:false,throttleInvert:true,fire:standard?7:0,boost:standard?0:1,bank:standard?3:2,pause:standard?9:7,up:12,down:13,deadzone:.12};}
  function read(pad,map){
    function axis(name){var index=map[name];if(index<0||!Number.isFinite(pad.axes[index]))return 0;return deadzone(pad.axes[index],map.deadzone)*(map[name+'Invert']?-1:1);}
    function button(name){var b=pad.buttons[map[name]];return !!(b&&(b.pressed||b.value>.5));}
    var raw=pad.axes[map.throttle],throttle=map.throttle>=0&&Number.isFinite(raw)?Math.max(0,Math.min(1,(1+(map.throttleInvert?-raw:raw))/2)):null;
    return {pitch:axis('pitch'),yaw:-axis('yaw'),roll:-axis('roll'),throttle:throttle,throttleRate:(button('up')?1:0)-(button('down')?1:0),fire:button('fire'),boost:button('boost'),bank:button('bank'),pause:button('pause')};
  }
  window.Driftworks.flightInput={deadzone:deadzone,defaults:defaults,read:read};
}());
