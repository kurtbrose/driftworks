(function(){
  'use strict';
  const DW=window.Driftworks,api=DW.scene3d,units=DW.sim.METERS_PER_UNIT;
  let world=DW.sim.createInitialWorld(),asteroid=world.asteroids[0];
  Object.assign(asteroid,{position:{x:0,y:0},previousPosition:{x:0,y:0},rotation:0,angularVelocity:0});
  Object.assign(world,{asteroids:[asteroid],ships:[],platforms:[],wrecks:[],packets:[],selectedShipIds:[]});world.combat.drones=[];
  const hosts=['before','after'].map(id=>document.getElementById(id));
  const views=[DW.webglReference,api].map((backend,i)=>backend.create(hosts[i],()=>world,w=>{world=w;},{study:true}));
  const status=document.getElementById('status'),results=document.getElementById('results');
  let yaw=0,tilt=.9,mode='orbit',light=false,shadows=true,posts=true,drag=null,dirty=true;
  const normal=v=>{const d=Math.hypot(...v);return v.map(x=>x/d);};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  function box(){const out=[];for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const u=(axis+1)%3,v=(axis+2)%3;for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]){const p=[0,0,0],n=[0,0,0];p[axis]=sign;p[u]=a;p[v]=b;n[axis]=sign;out.push(...p,...n);}}return out;}
  let cachedFrame=null;
  function groundFrame(){
    if(cachedFrame)return cachedFrame;
    const frame=api.surfaceFrame(asteroid,[.4,.5,.75]),base=frame.point.map(v=>v*asteroid.radius),radial=normal(base);
    const sample=DW.miningStudyTerrain.meshSampler(api.asteroidMesh(asteroid),asteroid.radius,base);
    const hit=sample.ray(base.map((v,i)=>v+radial[i]*asteroid.radius*.5),radial.map(v=>-v));
    cachedFrame=hit?{point:hit.point.map(v=>v/asteroid.radius),normal:hit.normal}:frame;return cachedFrame;
  }
  function fixtures(){
    if(mode!=='surface'||!posts){views.forEach(v=>v.setStudyActors([]));return;}
    const frame=groundFrame(),up=frame.normal;
    const forward=normal([0,1,0].map((v,i)=>v-up[i]*up[1])),right=normal(cross(forward,up));
    const base=frame.point.map(v=>v*asteroid.radius),mesh=api.asteroidMesh(asteroid);
    const sample=DW.miningStudyTerrain.meshSampler(mesh,asteroid.radius,base),batches=[];
    for(const [along,side,height] of [[4,-.8,1.2],[6,1,1.6]]){
      const p=base.map((v,i)=>v+(forward[i]*along+right[i]*side+up[i]*10)/units);
      const hit=sample.ray(p,up.map(v=>-v));if(!hit)continue;
      const vertices=new Float32Array(box().length),source=box();
      for(let i=0;i<source.length;i+=6)for(let k=0;k<3;k++){
        vertices[i+k]=hit.point[k]+(right[k]*source[i]*.36+forward[k]*source[i+1]*.36+up[k]*(source[i+2]+1)*height/2)/units;
        vertices[i+k+3]=right[k]*source[i+3]+forward[k]*source[i+4]+up[k]*source[i+5];
      }
      batches.push({vertices,color:[.85,.55,.12]});
    }
    views.forEach(v=>v.setStudyActors(batches));
  }
  function pose(value){
    mode=value;yaw=0;tilt=value==='underside'?Math.PI-.75:.9;
    world.camera={x:0,y:0,zoom:Math.min(hosts[0].clientWidth,hosts[0].clientHeight)*.32/asteroid.radius};
    if(value==='surface'&&asteroid.excavation.level>0)cut();
    fixtures();dirty=true;
  }
  function cut(){cachedFrame=null;world=DW.sim.toggleAsteroidExcavation(world,asteroid.id);asteroid=world.asteroids[0];document.getElementById('cut').setAttribute('aria-pressed',String(asteroid.excavation.level>0));views.forEach(v=>v.sync(world));fixtures();dirty=true;}
  function seed(){cachedFrame=null;asteroid.id=document.getElementById('seed').value.trim()||'ast-ceres-01';
    const kind=document.getElementById('composition').value,bulk={ice:[1,0,0,0],volatiles:[0,1,0,0],metals:[0,0,1,0],silicates:[0,0,0,1]}[kind];
    api.setStudyParameters(asteroid,bulk?{bulk}:{});DW.webglReference.setStudyParameters(asteroid,bulk?{bulk}:{});
    views.forEach(v=>v.sync(world));fixtures();dirty=true;
  }
  function draw(){
    let surface=null;
    if(mode==='surface'){
      const frame=groundFrame(),n=frame.normal,forward=normal([0,1,0].map((v,i)=>v-n[i]*n[1])),side=normal(cross(forward,n));
      const heading=normal(forward.map((v,i)=>v*Math.cos(yaw)+side[i]*Math.sin(yaw))),right=normal(cross(heading,n));
      const direction=normal(heading.map((v,i)=>v*Math.cos(tilt)+n[i]*Math.sin(tilt))),up=normal(cross(right,direction));
      surface={eye:frame.point.map((v,i)=>v*asteroid.radius+n[i]*2/units),right,up,back:direction.map(v=>-v)};
    }
    views.forEach(v=>{v.setSurfaceCamera(surface);if(!surface)v.setOrbit({yaw,tilt});v.render(world,1,0,0);});
    status.textContent=`${asteroid.id} · ${mode} · lamp ${light?'on':'off'} · shadows ${shadows?'on':'off'} · Three.js production backend`;
    status.dataset.ready='true';dirty=false;
  }
  for(const id of ['light','shadows'])document.getElementById(id).onclick=function(){
    if(id==='light')light=!light;else shadows=!shadows;
    this.setAttribute('aria-pressed',String(id==='light'?light:shadows));
    hosts.forEach(h=>h.querySelector(id==='light'?'[data-spotlight]':'[data-work-shadows]').click());
    if(light&&mode!=='surface'){pose('surface');tilt=-.12;}dirty=true;
  };
  document.getElementById('posts').onclick=function(){posts=!posts;this.setAttribute('aria-pressed',String(posts));fixtures();dirty=true;};
  document.getElementById('cut').onclick=cut;document.getElementById('apply').onclick=seed;document.getElementById('composition').onchange=seed;
  for(const b of document.querySelectorAll('[data-pose]'))b.onclick=()=>{pose(b.dataset.pose);if(mode==='surface')tilt=-.12;};
  for(const host of hosts){
    host.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,pan:e.shiftKey};host.setPointerCapture(e.pointerId);});
    host.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
      if(drag.pan){world.camera.x-=dx/world.camera.zoom;world.camera.y-=dy/world.camera.zoom;}else{yaw-=dx*.005;tilt=Math.max(mode==='surface'?-1.3:.06,Math.min(mode==='surface'?1.3:Math.PI-.06,tilt+dy*.005));}dirty=true;});
    host.addEventListener('pointerup',()=>{drag=null;});host.addEventListener('pointercancel',()=>{drag=null;});
    host.addEventListener('wheel',e=>{e.preventDefault();world.camera.zoom*=Math.exp(-e.deltaY*.0015);dirty=true;},{passive:false});
  }
  new ResizeObserver(()=>{dirty=true;}).observe(document.querySelector('main'));
  function capture(host){const canvas=host.querySelector('canvas'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl'),pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);if(gl.getError())throw new Error('GPU readback error');return pixels;}
  async function compare(){
    const button=document.getElementById('test');button.disabled=true;const rows=[];results.textContent='Comparing…';results.dataset.status='running';
    try{
      for(const value of ['ast-ceres-01','migration-review-2'])for(const target of ['orbit','underside','surface','cutaway']){
        if(asteroid.excavation.level>0)cut();document.getElementById('seed').value=value;seed();pose(target==='cutaway'?'orbit':target);if(target==='surface')tilt=-.12;if(target==='cutaway')cut();
        await new Promise(requestAnimationFrame);draw();const [a,b]=hosts.map(capture);if(a.length!==b.length)throw new Error('Pane dimensions differ');
        let sum=0,active=0;for(let i=0;i<a.length;i+=4)if(a[i+3]||b[i+3]){active++;for(let c=0;c<3;c++)sum+=Math.abs(a[i+c]-b[i+c]);}
        if(active<100)throw new Error('Empty rendered scene');rows.push({seed:value,pose:target,meanChannelDifference:sum/(active*3),pixels:active});
        results.textContent=JSON.stringify(rows,null,2);
      }
      results.dataset.status='pass';results.dataset.results=JSON.stringify(rows);pose('orbit');
    }catch(e){results.dataset.status='fail';results.textContent='FAIL: '+e.message;}finally{if(asteroid.excavation.level>0)cut();pose('orbit');button.disabled=false;dirty=true;}
  }
  document.getElementById('test').onclick=compare;
  pose('orbit');function tick(){if(dirty)draw();requestAnimationFrame(tick);}requestAnimationFrame(tick);
  if(new URLSearchParams(location.search).has('test'))compare();
})();
