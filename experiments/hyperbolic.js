(function(){
  'use strict';
  const H=/** @type {NonNullable<import('../src/types').DriftworksNamespace['hyperbolic']>} */(window.Driftworks.hyperbolic);
  const canvas=/** @type {HTMLCanvasElement} */(document.getElementById('space'));
  const radar=/** @type {HTMLCanvasElement} */(document.getElementById('radar'));
  const ctx=/** @type {CanvasRenderingContext2D} */(canvas.getContext('2d'));
  const rc=/** @type {CanvasRenderingContext2D} */(radar.getContext('2d'));
  const curvature=/** @type {HTMLSelectElement} */(document.getElementById('curvature'));
  const paths=/** @type {HTMLInputElement} */(document.getElementById('paths'));
  const pilot=/** @type {HTMLButtonElement} */(document.getElementById('pilot'));
  const pause=/** @type {HTMLButtonElement} */(document.getElementById('pause'));
  const status=/** @type {HTMLElement} */(document.getElementById('status'));
  let world=H.create(),auto=true,paused=false,target=1,last=0,acc=0,width=0,height=0,cx=0,cy=0,scale=0;
  const keys=new Set(/** @type {string[]} */([]));const colors=['#66e5d1','#ff837c'];
  function reset(){world=H.create(Number(curvature.value));acc=0;target=1;}
  function togglePause(){paused=!paused;pause.textContent=paused?'Resume':'Pause';}
  pilot.onclick=()=>{auto=!auto;pilot.textContent=auto?'Take control':'Autopilot';pilot.blur();};pause.onclick=()=>{togglePause();pause.blur();};curvature.onchange=()=>{reset();curvature.blur();};paths.onchange=()=>paths.blur();
  window.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement||e.target instanceof HTMLButtonElement)return;
    if(['Space','Tab','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);
    if(!e.repeat){if(e.code==='KeyP')togglePause();if(e.code==='KeyR')reset();if(e.code==='Tab')target=(target+2)%12;}});
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
  document.addEventListener('visibilitychange',()=>{keys.clear();last=0;});
  /** @param {number[]} p */
  function project(p){return [cx+scale*p[1]/(p[0]+1),cy-scale*p[2]/(p[0]+1)];}
  /** @param {number[][]} points @param {string} color @param {number} alpha */
  function line(points,color,alpha=1){ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.beginPath();points.forEach((p,i)=>{const q=project(p);if(i)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1]);});ctx.stroke();ctx.globalAlpha=1;}
  /** @param {CanvasRenderingContext2D} c @param {number} x @param {number} y @param {number} r @param {string} color */
  function circle(c,x,y,r,color){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.strokeStyle=color;c.stroke();}
  function draw(){
    width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,2);
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#060d17';ctx.fillRect(0,0,width,height);
    cx=width<800?width*.33:(width-230)*.5;cy=height*.52;
    const disk=Math.min((width-260)*.47,height*.43);const view=Math.max(140,disk);
    // Same 2 km visible range across curvature settings, until the infinity rim fits.
    scale=view/Math.tanh(2000/(2*world.radius));
    const rim=Math.min(scale,view*1.09);circle(ctx,cx,cy,rim,'#254454');
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,rim,0,Math.PI*2);ctx.clip();
    for(let m=250;m<=3000;m+=250){const r=scale*Math.tanh(m/(2*world.radius));circle(ctx,cx,cy,r,m%1000===0?'#234050':'#122938');if(m%1000===0&&r<rim){ctx.fillStyle='#638194';ctx.font='11px monospace';ctx.fillText(m+' m',cx+5,cy-r+14);}}
    if(paths.checked){
      for(const side of [-1,1]){const p=[Math.cosh(200/world.radius),side*Math.sinh(200/world.radius),0],f=[0,0,1];const guide=/** @type {number[][]} */([]);for(let i=0;i<100;i++)guide.push(H.exp(p,f,(i-50)*60/world.radius));line(guide,'#65879c',.35);}
      ctx.setLineDash([4,7]);line([[Math.cosh(2500/world.radius),0,-Math.sinh(2500/world.radius)],[1,0,0],[Math.cosh(2500/world.radius),0,Math.sinh(2500/world.radius)]],'#65879c',.35);ctx.setLineDash([]);
    }
    for(const a of world.fighters){if(a.dead>0)continue;const color=a.id===0?'#ffffff':colors[a.team];if(paths.checked)line(a.trail,color,.24);
      const p=project(a.p),tip=project(H.exp(a.p,a.f,25/world.radius)),angle=Math.atan2(tip[1]-p[1],tip[0]-p[0]);
      ctx.save();ctx.translate(p[0],p[1]);ctx.rotate(angle);ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=9;ctx.beginPath();ctx.moveTo(11,0);ctx.lineTo(-8,-6);ctx.lineTo(-4,0);ctx.lineTo(-8,6);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#ffbd70';ctx.fillRect(-13,-2,5+Math.sin(world.time*40+a.id)*2,4);ctx.restore();
      if(a.id===target){circle(ctx,p[0],p[1],19,'#f2ce84');ctx.fillStyle='#f2ce84';ctx.fillText('T'+a.id+' / '+Math.round(H.distance(world.fighters[0].p,a.p)*world.radius)+' m',p[0]+24,p[1]);}
      if(a.hp<100){ctx.fillStyle=color;ctx.fillRect(p[0]-10,p[1]+12,a.hp*.2,2);}
    }
    for(const s of world.shots)line([H.exp(s.p,s.f,-65/world.radius),s.p],colors[s.team]);
    for(const b of world.bursts){const p=project(b.p);circle(ctx,p[0],p[1],(1-b.life/.5)*30+3,'#ffda9b');}
    ctx.restore();
    rc.clearRect(0,0,408,408);rc.lineWidth=2;for(const r of [50,100,150,198])circle(rc,204,204,r,'#284553');rc.strokeStyle='#284553';rc.beginPath();rc.moveTo(204,6);rc.lineTo(204,402);rc.moveTo(6,204);rc.lineTo(402,204);rc.stroke();
    for(const a of world.fighters){if(a.dead>0)continue;const d=H.distance(world.fighters[0].p,a.p)*world.radius;if(d>2000)continue;const angle=H.bearing(world.fighters[0],a.p),x=204+Math.sin(angle)*d/2000*198,y=204-Math.cos(angle)*d/2000*198;rc.fillStyle=a.id===0?'white':colors[a.team];rc.fillRect(x-4,y-4,8,8);if(a.id===target)circle(rc,x,y,10,'#f2ce84');}
    const me=world.fighters[0];status.textContent=(paused?'PAUSED':auto?'AUTOPILOT / 6 vs 6':'MANUAL FLIGHT')+'\nHull '+Math.max(0,me.hp)+'%  /  '+Math.round(me.speed)+' m/s\nKills '+world.score[0]+' : '+world.score[1]+(me.dead>0?'\nRespawn in '+me.dead.toFixed(1)+' s':'');
  }
  /** @param {number} now */
  function frame(now){if(last&&!paused&&!document.hidden)acc+=Math.min(.1,(now-last)/1000);last=now;while(acc>=1/120){H.step(world,1/120,{auto,turn:Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),throttle:Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown')),fire:keys.has('Space')});acc-=1/120;}draw();requestAnimationFrame(frame);}
  requestAnimationFrame(frame);
})();
