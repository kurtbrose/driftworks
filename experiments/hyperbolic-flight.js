(function () {
  'use strict';
  const DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks),H=DW.hyperbolicFlight,U=DW.sim.METERS_PER_UNIT;
  /** @template {HTMLElement} T @param {string} id @returns {T} */
  function get(id){const e=document.getElementById(id);if(!e)throw new Error(id);return /** @type {T} */(e);}
  const host=get('viewer'),hud=/** @type {HTMLCanvasElement} */(get('overlay')),stars=/** @type {HTMLCanvasElement} */(get('stars'));
  const ctx=/** @type {CanvasRenderingContext2D} */(hud.getContext('2d')),sky=/** @type {CanvasRenderingContext2D} */(stars.getContext('2d'));
  const radius=/** @type {HTMLSelectElement} */(get('radius')),ship=/** @type {HTMLSelectElement} */(get('ship')),guides=/** @type {HTMLInputElement} */(get('guides'));
  let world=DW.sim.createInitialWorld(29);const asteroid=world.asteroids[0],mothership=world.ships[0];world.asteroids=[];world.ships=[];world.platforms=[];
  const scene=DW.scene3d.create(host,()=>world,value=>{world=value;}, {study:true,viewer:false});
  const camera=/** @type {NonNullable<Parameters<typeof scene.setSurfaceCamera>[0]>} */({eye:[0,0,0],right:[1,0,0],up:[0,1,0],back:[0,0,1]});
  scene.setSurfaceCamera(camera);scene.setStudyDiagnostics({mode:'normal',flat:false,scale:1,mothership:false,actors:true});
  DW.shipPackModels.populate(ship,false);
  const preferred=Array.from(ship.options).find(o=>/raptor/i.test(o.text));if(preferred)ship.value=preferred.value;
  let state=H.create(),auto=false,paused=true,target=1,last=0,remainder=0,ready=false,dirty=true;
  let images=/** @type {import('./types').Images} */(new Map());
  const colors=['#63f58d','#ff655d'];
  DW.flightMissions.define('hyperbolic',{emptySpace:true},'furball');
  const flightHud=DW.flightHud.mount(host),combat=DW.training.create('hyperbolic');
  const craft=state.actors.map(a=>{const c=DW.training.createCraft('hyperbolic-'+a.id,DW.arcade.create(0),a.team?'enemy':'ally');c.callsign=(a.team?'Raider ':'Wingman ')+(Math.floor(a.id/2)+1);return c;});
  combat.player=craft[0];combat.enemies=craft.slice(1);
  const weapon=Object.assign({},DW.retailWeapons[0],{name:'Geodesic cannon'});
  let locked=false;
  /** @type {{frames:number;phase:number;cost:number[][];interval:number[][];draws:number[];triangles:number[]}|null} */let measurement=null;
  let statusTime=0;
  function invalidate(){dirty=true;if(measurement){measurement=null;get('metrics').textContent='Measurement canceled: scene or viewport changed.';}}
  let loadSerial=0;
  async function loadModel(){
    const serial=++loadSerial;ready=false;/** @type {HTMLButtonElement} */(get('fly')).disabled=true;get('status').textContent='Loading fighter textures…';invalidate();get('error').textContent='';
    try{const data=await DW.shipPackModels.loadTextures([ship.value]);
      if(serial!==loadSerial)return;
      await scene.prepareStudyTextures(DW.shipPackModels.textureSources(data));
      if(serial!==loadSerial)return;
      images=data;ready=true;/** @type {HTMLButtonElement} */(get('fly')).disabled=false;get('status').textContent='Ready · Start flight to fly';invalidate();
    }catch(error){if(serial===loadSerial){get('error').textContent=String(error);get('status').textContent='Fighter loading failed. Choose another model in Flight lab.';}}
  }
  loadModel();
  function reset(){state=H.create(Number(radius.value));target=1;locked=false;remainder=0;invalidate();scene.resetCombat();}
  function pause(){paused=true;controls.clear();controls.release();document.body.classList.remove('flight-active');get('fly').textContent='Resume flight';invalidate();}
  function resume(){if(!ready)return;paused=false;last=0;controls.resetButtons();get('fly').blur();document.body.classList.add('flight-active');invalidate();}
  function nextTarget(){const live=state.actors.filter(a=>a.team===1&&a.dead<=0);target=(live.find(a=>a.id>target)||live[0])?.id??-1;locked=false;invalidate();}
  function diagnostics(){pause();document.body.classList.add('diagnostics');/** @type {HTMLDetailsElement} */(get('flight-lab')).open=true;}
  const controls=DW.flightControls.mount(host,{pause,resume,captureFailure:()=>{pause();get('status').textContent='Mouse capture unavailable. Choose controller / keyboard or retry Start flight.';},isPaused:()=>paused,isDead:()=>false,nextWeapon:()=>{},nextTarget,toggleTargetLock:()=>{locked=!locked;invalidate();},nextRadarRange:()=>{flightHud.cycleRadarRange();invalidate();},selectProfile:()=>{},toggleDiagnostics:diagnostics,togglePerformance:diagnostics});
  get('fly').onclick=()=>{if(!ready)return;document.body.classList.remove('diagnostics');if(auto||controls.view().inputMode!=='mouse')resume();else if(/** @type {HTMLInputElement} */(get('capture-mouse')).checked)controls.capture();else controls.startUncaptured();};
  get('reset').onclick=reset;
  get('autopilot').onchange=()=>{auto=/** @type {HTMLInputElement} */(get('autopilot')).checked;invalidate();};
  radius.onchange=()=>{reset();radius.blur();};ship.onchange=()=>{loadModel();ship.blur();};guides.onchange=()=>{invalidate();guides.blur();};
  window.addEventListener('resize',invalidate);
  window.addEventListener('blur',pause);
  document.addEventListener('visibilitychange',()=>{last=0;if(document.hidden)pause();invalidate();});
  function renderHud(){
    const me=state.actors[0];
    if(!state.actors.some(a=>a.id===target&&a.dead<=0))nextTarget();
    if(!paused&&!locked){
      let nearest=Infinity;
      for(const a of state.actors){if(!a.id||a.dead>0)continue;const range=H.distance(me.p,a.p);
        if(range<nearest&&H.segmentHit(me.p,me.axes[2].map(v=>-v),a.p,range,Math.cosh(12/state.radius))){target=a.id;nearest=range;}
      }
    }
    for(const a of state.actors){const c=craft[a.id];c.hp=a.dead>0?0:a.hp;c.shield=0;c.maxShield=0;
      // Log coordinates preserve intrinsic radar range and observed center bearing.
      c.pose.eye=H.relative(me,a.p).map(v=>v*state.radius/U);
      // Undo radial Lorentz stretch for the rigid target-monitor silhouette.
      const basis=a.axes.map(axis=>axis.slice(1).map((v,i)=>v-axis[0]*a.p[i+1]/(a.p[0]+1)));
      c.pose.right=basis[0];c.pose.up=basis[1];c.pose.back=basis[2];
      c.pose.velocity=a.flight.velocity.slice();c.pose.throttle=a.flight.throttle;
    }
    Object.assign(craft[0].pose,camera,{velocity:me.flight.velocity.slice(),throttle:me.flight.throttle});
    combat.time=state.time;combat.kills=state.score[0];combat.targetId='hyperbolic-'+target;combat.targetLocked=locked;
    craft[0].guns.fired=state.shots;craft[0].guns.hits=state.hits;
    const selected=state.actors.find(a=>a.id===target),solution=selected?H.lead(state,me,selected):null;
    flightHud.render(Object.assign({world,state:craft[0].pose,combat,guns:craft[0].guns,asteroid,mothership,units:U,paused,speakerId:null,weapon,allyArt:ship.value,enemyArt:ship.value,shipImages:images,paint:{ally:[.22,.9,.8],enemy:[1,.35,.23]},aimingSolution:solution},controls.view()));
  }
  /** @param {number[]} p */function optical(p){return p.slice(1).map(v=>v*state.radius/U);}
  /** @param {number[]} p @returns {number[]|null} */function screen(p){if(p[3]>=-.001)return null;const f=innerHeight/(2*Math.tan(Math.PI/8));return [innerWidth/2+p[1]/-p[3]*f,innerHeight/2-p[2]/-p[3]*f];}
  /** @param {number[][]} points @param {string} color @param {number} alpha */
  function path(points,color,alpha){ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.beginPath();let pen=false;for(const p of points){const q=screen(p);if(!q){pen=false;continue;}if(pen)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1]);pen=true;}ctx.stroke();ctx.globalAlpha=1;}
  /** @param {boolean} fleet */
  function draw(fleet=true){
    const started=performance.now(),dpr=Math.min(devicePixelRatio||1,2),width=innerWidth,height=innerHeight;
    for(const c of [hud,stars])if(c.width!==Math.round(width*dpr)||c.height!==Math.round(height*dpr)){c.width=Math.round(width*dpr);c.height=Math.round(height*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);sky.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);sky.clearRect(0,0,width,height);
    state.stars.forEach((p,i)=>{const q=screen(p);if(q){sky.fillStyle=i%7?'#6f879c':'#c1d2df';sky.fillRect(q[0],q[1],i%7?1:2,i%7?1:2);}});
    const model=DW.shipPackModels.find(ship.value)?.model;
    const actors=/** @type {import('./types').Batch[]} */([]);
    if(model&&ready)for(const a of state.actors){if(a.id===0||a.dead>0)continue;
      const pose={eye:optical(a.p),right:a.axes[0].slice(1),up:a.axes[1].slice(1),back:a.axes[2].slice(1)};
      // Gans optical coordinates: tangent vectors naturally include the radial
      // stretch. Keep the immutable source buffers; only GPU poses change.
      actors.push(DW.shipPackModels.sourceDraw(model,pose,U,images.get(model.id),a.team?[1,.35,.23]:[.22,.9,.8]));
    }
    scene.setStudyActors(actors);scene.setStudyDiagnostics({mode:'normal',flat:false,scale:1,mothership:false,actors:fleet});
    scene.setStudyExplosions(state.bursts.filter(b=>b.large).map(b=>({position:/** @type {[number,number,number]} */(optical(b.p)),age:b.age,size:12/U,seed:12})));
    world.elapsedSeconds=state.time;scene.sync(world);scene.render(world,1,0,0);scene.completeFrame();
    if(guides.checked){for(const p of state.landmarks){const q=screen(p);if(q){ctx.strokeStyle='#254753';ctx.strokeRect(q[0]-2,q[1]-2,4,4);}}state.actors.forEach(a=>{if(a.dead<=0)path(a.trail,colors[a.team],.3);});}
    for(const b of state.bolts)path([H.exp(b.p,b.v,-45/state.radius),b.p],colors[b.team],1);
    for(const b of state.bursts){const q=screen(b.p);if(q){ctx.strokeStyle='#ffd5a2';ctx.globalAlpha=1-b.age;ctx.beginPath();ctx.arc(q[0],q[1],3+b.age*20,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}}
    renderHud();
    const me=state.actors[0],stats=scene.getRenderStats();
    if(dirty||performance.now()-statusTime>150){statusTime=performance.now();get('readout').textContent=(paused?'PAUSED':auto?'AUTOPILOT / 6 vs 6':'MANUAL FLIGHT')+'\n'+Math.round(Math.hypot(...me.flight.velocity))+' m/s / '+Math.round(me.flight.throttle*100)+'% THR\nHULL '+Math.max(0,me.hp)+'% / KILLS '+state.score.join(' : ')+'\n'+state.shots+' shots / '+state.hits+' hits'+(me.dead>0?'\nRespawn '+me.dead.toFixed(1)+' s':'')+'\n'+stats.drawCalls+' draws / '+Math.round(stats.triangles).toLocaleString()+' triangles';}
    return {cpu:performance.now()-started,draws:stats.drawCalls,triangles:stats.triangles};
  }
  get('benchmark').onclick=()=>{if(!ready)return;pause();measurement={frames:0,phase:0,cost:[[],[],[],[]],interval:[[],[],[],[]],draws:[],triangles:[]};get('metrics').textContent='Frozen camera: fleet off / on / on / off. Measuring…';get('benchmark').blur();};
  /** @param {number[]} a */const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length*.5)]||0;
  /** @param {number[]} a */const p95=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length*.95)]||0;
  /** @param {number} now */function tick(now){const interval=last?now-last:0;last=now;if(!document.hidden&&ready){
    if(!paused)remainder+=Math.min(.05,interval/1000);
    const demand=controls.sample();
    while(remainder>=1/120){H.step(state,1/120,Object.assign({auto},demand));remainder-=1/120;}
    if(!paused||measurement||dirty){
    const result=draw(!measurement||measurement.phase===1||measurement.phase===2);dirty=false;
    if(measurement){const m=measurement;m.frames++;if(m.frames>30){m.cost[m.phase].push(result.cpu);m.interval[m.phase].push(interval);m.draws[m.phase]=result.draws;m.triangles[m.phase]=result.triangles;}
      if(m.frames>=150){m.frames=0;m.phase++;if(m.phase===4){get('metrics').textContent=m.cost.map((a,i)=>(i===1||i===2?'ON':'OFF')+' CPU '+median(a).toFixed(2)+' / '+p95(a).toFixed(2)+' ms\nCadence '+median(m.interval[i]).toFixed(1)+' / '+p95(m.interval[i]).toFixed(1)+' ms\n'+m.draws[i]+' draws / '+m.triangles[i]+' triangles').join('\n')+'\nMedian / p95';get('metrics').style.whiteSpace='pre-line';measurement=null;dirty=true;}}
    }
    }
  }else if(!document.hidden&&!ready&&dirty){draw();dirty=false;}requestAnimationFrame(tick);}
  requestAnimationFrame(tick);
})();
