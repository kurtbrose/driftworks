(function () {
  'use strict';

  var sim = window.Driftworks.sim;


  function flightDisplayDocument(){
    var elements={},classes={};
    function element(){return {value:'',checked:false,hidden:false,textContent:'',children:[],listeners:{},addEventListener:function(name,fn){this.listeners[name]=fn;},appendChild:function(child){this.children.push(child);},insertBefore:function(child){this.children.unshift(child);}};}
    return {getElementById:function(id){return elements[id]||(elements[id]=element());},createElement:element,body:{classList:{toggle:function(name){classes[name]=!classes[name];return classes[name];}}}};
  }

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

  var createFreshWorld = sim.createInitialWorld;
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

  function deployTestFormation(world) {
    var s = findShip(world, 'escort-01');
    var formation = world.formations[s.order.groupId];
    formation.position = { x: s.order.anchor.x, y: s.order.anchor.y };
    formation.relocating = false;
  }

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

  window.DriftworksSharedFixtures = {
    flightDisplayDocument: flightDisplayDocument,
    flightControlsFixture: flightControlsFixture,
    createFreshWorld: createFreshWorld,
    createDeployedWorld: createDeployedWorld,
    deployTestFormation: deployTestFormation,
    findShip: findShip,
    findAsteroid: findAsteroid,
    findPlume: findPlume
  };
})();
