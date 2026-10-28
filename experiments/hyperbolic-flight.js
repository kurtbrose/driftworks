(function () {
  'use strict';
  const DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks),H=DW.hyperbolicFlight,U=DW.sim.METERS_PER_UNIT;
  /** @template {HTMLElement} T @param {string} id @returns {T} */
  function get(id){const e=document.getElementById(id);if(!e)throw new Error(id);return /** @type {T} */(e);}
  const host=get('viewer'),hud=/** @type {HTMLCanvasElement} */(get('overlay')),stars=/** @type {HTMLCanvasElement} */(get('stars'));
  const ctx=/** @type {CanvasRenderingContext2D} */(hud.getContext('2d')),sky=/** @type {CanvasRenderingContext2D} */(stars.getContext('2d'));
  const radius=/** @type {HTMLSelectElement} */(get('radius')),ship=/** @type {HTMLSelectElement} */(get('ship')),guides=/** @type {HTMLInputElement} */(get('guides'));
  let world=DW.sim.createInitialWorld(29);world.asteroids=[];world.ships=[];world.platforms=[];
  const scene=DW.scene3d.create(host,()=>world,value=>{world=value;}, {study:true,viewer:false});
  const camera=/** @type {NonNullable<Parameters<typeof scene.setSurfaceCamera>[0]>} */({eye:[0,0,0],right:[1,0,0],up:[0,1,0],back:[0,0,1]});
  scene.setSurfaceCamera(camera);scene.setStudyDiagnostics({mode:'normal',flat:false,scale:1,mothership:false,actors:true});
  DW.shipPackModels.populate(ship,false);
  const preferred=Array.from(ship.options).find(o=>/raptor/i.test(o.text));if(preferred)ship.value=preferred.value;
  let state=H.create(),auto=true,paused=false,target=1,last=0,remainder=0,ready=false,drag=false,stick=[0,0];
  let images=/** @type {import('./types').Images} */(new Map());
  const keys=new Set(/** @type {string[]} */([])),colors=['#6ce6d5','#ff8b7f'];
  /** @type {{frames:number;phase:number;cost:number[][];interval:number[][];draws:number[];triangles:number[]}|null} */let measurement=null;
  let statusTime=0;
  DW.shipPackModels.loadTextures().then(async data=>{images=data;await scene.prepareStudyTextures(DW.shipPackModels.textureSources(data));ready=true;}).catch(/** @param {unknown} error */error=>{get('error').textContent=String(error);});
  function reset(){state=H.create(Number(radius.value));target=1;remainder=0;scene.resetCombat();}
  function pause(){paused=!paused;get('pause').textContent=paused?'Resume':'Pause';}
  get('pilot').onclick=()=>{auto=!auto;get('pilot').textContent=auto?'Take control':'Autopilot';get('pilot').blur();};get('pause').onclick=()=>{pause();get('pause').blur();};radius.onchange=()=>{reset();radius.blur();};ship.onchange=()=>ship.blur();guides.onchange=()=>guides.blur();
  window.addEventListener('keydown',e=>{if(e.target instanceof HTMLSelectElement||e.target instanceof HTMLInputElement||e.target instanceof HTMLButtonElement)return;
    if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);
    if(!e.repeat){if(e.code==='KeyP'||e.code==='Escape')pause();if(e.code==='KeyR')reset();if(e.code==='Tab')target=(target+2)%12;}});
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();drag=false;stick=[0,0];});
  host.addEventListener('pointerdown',e=>{drag=true;host.setPointerCapture(e.pointerId);});
  host.addEventListener('pointermove',e=>{if(drag)stick=DW.flightInput.moveStick(stick,e.movementX,e.movementY,200,.7);});
  host.addEventListener('pointerup',()=>{drag=false;stick=[0,0];});
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
    for(const a of state.actors){if(!a.id||a.dead>0)continue;const q=screen(a.p),r=H.distance(state.actors[0].p,a.p)*state.radius;
      if(q&&q[0]>0&&q[0]<width&&q[1]>0&&q[1]<height){ctx.strokeStyle=a.id===target?'#ffe2a1':colors[a.team];ctx.globalAlpha=a.id===target?1:.4;const size=a.id===target?17:9;ctx.strokeRect(q[0]-size,q[1]-size,size*2,size*2);ctx.globalAlpha=1;if(a.id===target){ctx.fillStyle='#ffe2a1';ctx.font='12px monospace';ctx.fillText('BANDIT '+a.id+' / '+Math.round(r)+' m / '+a.hp+'%',q[0]+23,q[1]);}}
      else if(a.id===target){const angle=Math.atan2(-a.p[2],a.p[1]||1e-8),x=width/2+Math.cos(angle)*Math.min(width*.38,height*.36),y=height/2+Math.sin(angle)*Math.min(width*.38,height*.36);ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle='#ffe2a1';ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-5,-5);ctx.lineTo(-5,5);ctx.fill();ctx.restore();ctx.fillStyle='#ffe2a1';ctx.fillText('TARGET '+Math.round(r)+' m'+(a.p[3]>0?' / AFT':''),x+14,y);}
    }
    const selected=state.actors.find(a=>a.id===target),solution=selected?H.lead(state,state.actors[0],selected):null;
    if(solution){const pip=screen([0,...solution.direction]);
      if(pip&&pip[0]>12&&pip[0]<width-12&&pip[1]>12&&pip[1]<height-12){
        const targetPoint=selected?screen(selected.p):null;
        ctx.strokeStyle='#8bdbed';ctx.lineWidth=1;ctx.setLineDash([3,5]);
        if(targetPoint){ctx.beginPath();ctx.moveTo(targetPoint[0],targetPoint[1]);ctx.lineTo(pip[0],pip[1]);ctx.stroke();}
        ctx.setLineDash([]);const aligned=Math.hypot(pip[0]-width/2,pip[1]-height/2)<10;
        ctx.strokeStyle=aligned?'#aaffd8':'#8bdbed';ctx.beginPath();ctx.arc(pip[0],pip[1],7,0,Math.PI*2);ctx.stroke();
        ctx.fillStyle=ctx.strokeStyle;ctx.fillRect(pip[0]-1,pip[1]-1,2,2);ctx.font='11px monospace';ctx.fillText('LEAD '+solution.time.toFixed(2)+' s',pip[0]+12,pip[1]-10);
      }
    }
    ctx.strokeStyle='#b2dcd8';ctx.beginPath();ctx.moveTo(width/2-12,height/2);ctx.lineTo(width/2-4,height/2);ctx.moveTo(width/2+4,height/2);ctx.lineTo(width/2+12,height/2);ctx.moveTo(width/2,height/2-12);ctx.lineTo(width/2,height/2-4);ctx.stroke();
    const contacts=state.actors.filter(a=>a.id&&a.dead<=0).map(a=>({point:H.relative(state.actors[0],a.p).map(v=>v*state.radius/U),color:colors[a.team],selected:a.id===target}));
    DW.flightRadar.draw(ctx,camera,contacts,U,2500,width,height,paused,'default');
    const me=state.actors[0],stats=scene.getRenderStats();
    if(performance.now()-statusTime>150){statusTime=performance.now();get('readout').textContent=(paused?'PAUSED':auto?'AUTOPILOT / 6 vs 6':'MANUAL FLIGHT')+'\n'+Math.round(Math.hypot(...me.flight.velocity))+' m/s / '+Math.round(me.flight.throttle*100)+'% THR\nHULL '+Math.max(0,me.hp)+'% / KILLS '+state.score.join(' : ')+'\n'+state.shots+' shots / '+state.hits+' hits'+(me.dead>0?'\nRespawn '+me.dead.toFixed(1)+' s':'')+'\n'+stats.drawCalls+' draws / '+Math.round(stats.triangles).toLocaleString()+' triangles';}
    return {cpu:performance.now()-started,draws:stats.drawCalls,triangles:stats.triangles};
  }
  get('benchmark').onclick=()=>{if(!ready)return;paused=true;get('pause').textContent='Resume';measurement={frames:0,phase:0,cost:[[],[],[],[]],interval:[[],[],[],[]],draws:[],triangles:[]};get('metrics').textContent='Frozen camera: fleet off / on / on / off. Measuring…';get('benchmark').blur();};
  /** @param {number[]} a */const median=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length*.5)]||0;
  /** @param {number[]} a */const p95=a=>a.slice().sort((x,y)=>x-y)[Math.floor(a.length*.95)]||0;
  /** @param {number} now */function tick(now){const interval=last?now-last:0;last=now;if(!document.hidden&&ready){
    if(!paused)remainder+=Math.min(.05,interval/1000);
    const mouse=DW.flightInput.stickDemand(stick,.03);
    while(remainder>=1/120){H.step(state,1/120,{auto,pitch:Number(keys.has('ArrowUp'))-Number(keys.has('ArrowDown'))+mouse[0],yaw:Number(keys.has('ArrowLeft'))-Number(keys.has('ArrowRight'))+mouse[1],roll:Number(keys.has('KeyQ'))-Number(keys.has('KeyE')),boost:keys.has('ShiftLeft')||keys.has('ShiftRight'),throttleRate:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),stop:keys.has('KeyX'),fire:keys.has('Space')});remainder-=1/120;}
    const result=draw(!measurement||measurement.phase===1||measurement.phase===2);
    if(measurement){const m=measurement;m.frames++;if(m.frames>30){m.cost[m.phase].push(result.cpu);m.interval[m.phase].push(interval);m.draws[m.phase]=result.draws;m.triangles[m.phase]=result.triangles;}
      if(m.frames>=150){m.frames=0;m.phase++;if(m.phase===4){get('metrics').textContent=m.cost.map((a,i)=>(i===1||i===2?'ON':'OFF')+' CPU '+median(a).toFixed(2)+' / '+p95(a).toFixed(2)+' ms\nCadence '+median(m.interval[i]).toFixed(1)+' / '+p95(m.interval[i]).toFixed(1)+' ms\n'+m.draws[i]+' draws / '+m.triangles[i]+' triangles').join('\n')+'\nMedian / p95';get('metrics').style.whiteSpace='pre-line';measurement=null;}}
    }
  }else if(!ready)draw();requestAnimationFrame(tick);}
  requestAnimationFrame(tick);
})();
