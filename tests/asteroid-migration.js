(function(){
  'use strict';
  const DW=window.Driftworks,api=DW.scene3d,units=DW.sim.METERS_PER_UNIT;
  let world=DW.sim.createInitialWorld(),asteroid=world.asteroids[0];
  Object.assign(asteroid,{position:{x:0,y:0},previousPosition:{x:0,y:0},rotation:0,angularVelocity:0});
  Object.assign(world,{asteroids:[asteroid],ships:[],platforms:[],wrecks:[],packets:[],selectedShipIds:[]});world.combat.drones=[];
  const hosts=['before','after'].map(id=>document.getElementById(id));
  // Optional full-HD backing buffers, independent of the available browser-window size.
  if(new URLSearchParams(location.search).get('pixels')==='1920x1080'){
    const ratio=Math.min(2,devicePixelRatio||1),width=1920/ratio,height=1080/ratio,main=document.querySelector('main');
    main.style.gridTemplateColumns=`repeat(2,${width}px)`;main.style.width=(width*2+2)+'px';main.style.height=height+'px';
  }
  const views=[DW.webglReference,api].map((backend,i)=>backend.create(hosts[i],()=>world,w=>{world=w;},{study:true}));
  const status=document.getElementById('status'),results=document.getElementById('results');
  let yaw=0,tilt=.9,mode='orbit',light=false,shadows=true,posts=true,drag=null,dirty=true;
  let benchmarking=false,cameraHeight=2;
  let gpuTimers=[];
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
  function draw(only=null,measure=false,measureGpu=false){
    let surface=null;
    if(mode==='surface'){
      const frame=groundFrame(),n=frame.normal,forward=normal([0,1,0].map((v,i)=>v-n[i]*n[1])),side=normal(cross(forward,n));
      const heading=normal(forward.map((v,i)=>v*Math.cos(yaw)+side[i]*Math.sin(yaw))),right=normal(cross(heading,n));
      const direction=normal(heading.map((v,i)=>v*Math.cos(tilt)+n[i]*Math.sin(tilt))),up=normal(cross(right,direction));
      surface={eye:frame.point.map((v,i)=>v*asteroid.radius+n[i]*cameraHeight/units),right,up,back:direction.map(v=>-v)};
    }
    let timing=null;
    views.forEach((v,index)=>{
      if(only!==null&&only!==index)return;
      v.setSurfaceCamera(surface);if(!surface)v.setOrbit({yaw,tilt});
      if(!measure){v.render(world,1,0,0);return;}
      const canvas=hosts[index].querySelector('canvas'),gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
      gl.finish();const timer=measureGpu?gpuTimers[index]:null,query=timer?timer.begin():null;
      const start=performance.now();v.render(world,1,0,0);const cpu=performance.now()-start;
      if(timer)timer.end();
      gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
      timing={cpu,completed:performance.now()-start,gpuQuery:query};
      if(gl.isContextLost()||gl.getError())throw new Error('GPU error during timing');
    });
    status.textContent=`${asteroid.id} · ${mode}${mode==='surface'?' '+cameraHeight+' m':''} · lamp ${light?'on':'off'} · shadows ${shadows?'on':'off'} · Three.js production backend`;
    status.dataset.ready='true';status.dataset.compositions=JSON.stringify([DW.webglReference.visualFor(asteroid).bulk,api.visualFor(asteroid).bulk]);dirty=false;return timing;
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
    host.addEventListener('pointerdown',e=>{if(benchmarking)return;drag={x:e.clientX,y:e.clientY,pan:e.shiftKey};host.setPointerCapture(e.pointerId);});
    host.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
      if(drag.pan){world.camera.x-=dx/world.camera.zoom;world.camera.y-=dy/world.camera.zoom;}else{yaw-=dx*.005;tilt=Math.max(mode==='surface'?-1.3:.06,Math.min(mode==='surface'?1.3:Math.PI-.06,tilt+dy*.005));}dirty=true;});
    host.addEventListener('pointerup',()=>{drag=null;});host.addEventListener('pointercancel',()=>{drag=null;});
    host.addEventListener('wheel',e=>{e.preventDefault();if(benchmarking)return;world.camera.zoom*=Math.exp(-e.deltaY*.0015);dirty=true;},{passive:false});
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
        if(active<100)throw new Error('Empty rendered scene');if(sum/(active*3)>1)throw new Error('Mean channel error exceeds 1 / 255');rows.push({seed:value,pose:target,meanChannelDifference:sum/(active*3),pixels:active});
        results.textContent=JSON.stringify(rows,null,2);
      }
      results.dataset.status='pass';results.dataset.results=JSON.stringify(rows);pose('orbit');
    }catch(e){results.dataset.status='fail';results.textContent='FAIL: '+e.message;}finally{if(asteroid.excavation.level>0)cut();pose('orbit');button.disabled=false;dirty=true;}
  }
  document.getElementById('test').onclick=compare;

  function gpuTimer(host){
    const canvas=host.querySelector('canvas'),gl2=canvas.getContext('webgl2'),gl=gl2||canvas.getContext('webgl');
    const ext=gl.getExtension(gl2?'EXT_disjoint_timer_query_webgl2':'EXT_disjoint_timer_query');if(!ext)return null;
    return {
      begin(){const q=gl2?gl.createQuery():ext.createQueryEXT();if(gl2)gl.beginQuery(ext.TIME_ELAPSED_EXT,q);else ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,q);return q;},
      end(){if(gl2)gl.endQuery(ext.TIME_ELAPSED_EXT);else ext.endQueryEXT(ext.TIME_ELAPSED_EXT);},
      disjoint(){return !!gl.getParameter(ext.GPU_DISJOINT_EXT);},
      resolve(q,disjoint){const available=gl2?gl.getQueryParameter(q,gl.QUERY_RESULT_AVAILABLE):ext.getQueryObjectEXT(q,ext.QUERY_RESULT_AVAILABLE_EXT);
        const value=available&&!disjoint?(gl2?gl.getQueryParameter(q,gl.QUERY_RESULT):ext.getQueryObjectEXT(q,ext.QUERY_RESULT_EXT))/1e6:null;
        if(gl2)gl.deleteQuery(q);else ext.deleteQueryEXT(q);return value;
      }
    };
  }
  async function benchmark(){
    if(benchmarking)return;
    benchmarking=true;drag=null;
    const output=document.getElementById('performance'),controls=[...document.querySelectorAll('nav button,nav input,nav select')];
    controls.forEach(c=>c.disabled=true);output.hidden=false;output.dataset.status='running';output.textContent='Warming both renderers…';
    // Reserve report height before recording dimensions so results cannot resize the view.
    await new Promise(requestAnimationFrame);
    const dimensions=hosts.map(h=>[h.clientWidth,h.clientHeight]),rows=[];
    const samples=48,warmups=12,next=()=>new Promise(requestAnimationFrame);
    const percentile=(values,q)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*q)];
    const saved={mode,yaw,tilt,light,shadows,posts,cameraHeight,camera:{...world.camera}};
    const lightState=(on,shadow)=>{for(const [id,desired,current] of [['light',on,light],['shadows',shadow,shadows]])if(desired!==current)document.getElementById(id).onclick();};
    try{
      if(asteroid.excavation.level>0)throw new Error('Close the cutaway before benchmarking');
      gpuTimers=hosts.map(gpuTimer);
      for(const config of [
        {name:'Orbit, no lamp',pose:'orbit',light:false,shadows:false,height:2,scale:1,posts:true},
        {name:'Surface 2 m, no lamp',pose:'surface',light:false,shadows:false,height:2,scale:1,posts:true},
        {name:'Surface 2 m, lamp, no shadows',pose:'surface',light:true,shadows:false,height:2,scale:1,posts:true},
        {name:'Surface 2 m, lamp + shadows',pose:'surface',light:true,shadows:true,height:2,scale:1,posts:true},
        {name:'Surface 0.5 m, lamp + shadows',pose:'surface',light:true,shadows:true,height:.5,scale:1,posts:true},
        {name:'Surface 2 m, lamp + shadows, no posts',pose:'surface',light:true,shadows:true,height:2,scale:1,posts:false},
        {name:'Surface 2 m, lamp + shadows, half resolution',pose:'surface',light:true,shadows:true,height:2,scale:.5,posts:true}
      ]){
        lightState(config.light,config.shadows);posts=config.posts;cameraHeight=config.height;pose(config.pose);if(mode==='surface')tilt=-.12;
        views.forEach(v=>v.setStudyDiagnostics({mode:'normal',flat:false,scale:config.scale,mothership:false,actors:true}));
        for(let i=0;i<warmups;i++){draw(i%2,true);await next();}
        const data=[[],[]];
        // AB / BA pairs alternate the leading renderer, avoiding one long block per backend.
        for(let i=0;i<samples;i++){
          output.textContent=`${config.name}: matched sample ${i+1} / ${samples}`;
          for(const index of i%2?[1,0]:[0,1]){
            if(hosts.some((h,k)=>h.clientWidth!==dimensions[k][0]||h.clientHeight!==dimensions[k][1]))throw new Error('View resized; run the benchmark again');
            await next();data[index].push(draw(index,true,true));
          }
        }
        await next();
        data.forEach((values,index)=>{const disjoint=gpuTimers[index]?gpuTimers[index].disjoint():true;values.forEach(sample=>{sample.gpuMs=sample.gpuQuery?gpuTimers[index].resolve(sample.gpuQuery,disjoint):null;delete sample.gpuQuery;});});
        const backends=data.map((values,index)=>({backend:index?'Three.js':'Frozen WebGL',gpuMedianMs:values.some(v=>v.gpuMs!==null)?percentile(values.filter(v=>v.gpuMs!==null).map(v=>v.gpuMs),.5):null,gpuSamples:values.filter(v=>v.gpuMs!==null).length,cpuMedianMs:percentile(values.map(v=>v.cpu),.5),completedMedianMs:percentile(values.map(v=>v.completed),.5),completedP95Ms:percentile(values.map(v=>v.completed),.95),stats:views[index].getRenderStats(),samples:values}));
        rows.push({config,backends});
      }
      const canvas=hosts[1].querySelector('canvas'),gl=canvas.getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');
      const report={capturedAt:new Date().toISOString(),method:'48 paired warmed samples per case, alternating AB/BA; median and p95. CPU excludes setup, completed includes one-pixel synchronous readback; GPU uses disjoint timer queries when available. Not FPS. Shadow maps regenerate every draw in both backends. Other comparison renderer is idle.',warmupsPerBackend:warmups/2,samplesPerBackend:samples,seed:asteroid.id,composition:document.getElementById('composition').value,cssViewports:dimensions,devicePixelRatio,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),rows};
      output.replaceChildren();const note=document.createElement('p');note.textContent=report.method;output.append(note);
      const table=document.createElement('table');table.style.cssText='width:100%;text-align:left;border-spacing:10px 4px';
      const heading=table.insertRow();for(const text of ['Case','Old GPU / completed / CPU','Three.js GPU / completed / CPU','Completed ratio']){const th=document.createElement('th');th.textContent=text;heading.append(th);}
      for(const row of rows){const tr=table.insertRow(),[old,current]=row.backends;for(const text of [row.config.name,...row.backends.map(b=>`${b.gpuMedianMs===null?'n/a':b.gpuMedianMs.toFixed(2)} / ${b.completedMedianMs.toFixed(2)} / ${b.cpuMedianMs.toFixed(2)} ms`),(current.completedMedianMs/old.completedMedianMs).toFixed(2)+'×'])tr.insertCell().textContent=text;}
      output.append(table);output.dataset.results=JSON.stringify(report);output.dataset.status='pass';
    }catch(e){output.textContent='Benchmark failed: '+e.message;output.dataset.status='fail';}
    finally{
      lightState(saved.light,saved.shadows);posts=saved.posts;cameraHeight=saved.cameraHeight;pose(saved.mode);yaw=saved.yaw;tilt=saved.tilt;world.camera=saved.camera;
      views.forEach(v=>v.setStudyDiagnostics({mode:'normal',flat:false,scale:1,mothership:false,actors:true}));
      controls.forEach(c=>c.disabled=false);benchmarking=false;dirty=true;
    }
  }
  document.getElementById('benchmark').onclick=benchmark;
  views.forEach(v=>v.sync(world));pose('orbit');function tick(){if(dirty&&!benchmarking)draw();requestAnimationFrame(tick);}requestAnimationFrame(tick);
  if(new URLSearchParams(location.search).has('test'))compare();
  else if(new URLSearchParams(location.search).has('benchmark'))benchmark();
  else {
    const preset=new URLSearchParams(location.search);
    if(preset.has('seed'))document.getElementById('seed').value=preset.get('seed');
    if(['mixed','ice','volatiles','metals','silicates'].includes(preset.get('composition')))document.getElementById('composition').value=preset.get('composition');
    if(preset.has('seed')||preset.has('composition'))seed();
    if(preset.get('light')==='1')document.getElementById('light').onclick();
    if(preset.get('shadows')==='0')document.getElementById('shadows').onclick();
    if(preset.get('posts')==='0')document.getElementById('posts').onclick();
    if(['orbit','underside','surface'].includes(preset.get('pose')))pose(preset.get('pose'));
    if(mode==='surface'){tilt=-.12;cameraHeight=preset.get('height')==='0.5'?.5:2;}
    if(preset.get('cut')==='1')cut();
  }
})();
