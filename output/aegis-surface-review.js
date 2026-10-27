(async function(){
 'use strict';
 const DW=window.Driftworks,U=DW.sim.METERS_PER_UNIT,el=id=>document.getElementById(id),host=el('viewer');
 await DW.aegisFlight.load();
 let world=DW.sim.createInitialWorld();world.asteroids=[];world.ships=[];world.hostiles=[];world.structures=[];
 const scene=DW.scene3d.create(host,()=>world,next=>{world=next},{study:true});
 const rig=DW.aegisFlight.create(),combat=DW.training.create('training');
 const image=new Image();image.src=window.AegisSurfaceStudy.atlas().toDataURL();await image.decode();
 rig.setSurfaceDetail(false);
 const copyHull=()=>rig.geometry().map((b,i)=>i<DW.aegisFlightAsset.batches.length?Object.assign({},b):b);
 const original=copyHull();rig.setSurfaceDetail(true);const candidate=copyHull();
 const views={wide:{target:[0,0,0],offset:[-650,-1950,1100]},armor:{target:[-245,0,0],offset:[-80,-155,125]},side:{target:[-245,0,0],offset:[-20,-180,18]},underside:{target:[-245,0,0],offset:[-85,-180,-140]},hangar:{target:DW.aegisFlightAsset.hangars[0].position,offset:[-25,-150,16]},stern:{target:[640,0,0],offset:[240,-220,150]},far:{target:[0,0,0],offset:[-1600,-3800,1900]}};
 let mode='new',viewName='armor',orbit=false,busy=false,damaged=false,yaw=0,pitch=0,zoom=1,last=performance.now(),drag=null,results=null,pose=null,environment=null,lighting='studio';
 const lightingURL=DW.assetUrl('../assets/backgrounds/sky-lighting-v1.json');
 const lightingReady=fetch(lightingURL).then(r=>r.json()).then(async data=>{
  const f=data.families.galaxy,img=new Image();img.src=DW.assetUrl(f.map,lightingURL);await img.decode();
  const radiance=f.radiance?new Float32Array(await (await fetch(DW.assetUrl(f.radiance,lightingURL))).arrayBuffer()):undefined;
  environment={sh:f.sh,map:f.map,image:img,radiance};
 });
 el('lighting').onchange=async()=>{try{await lightingReady;lighting=el('lighting').value;draw();}catch(e){el('report').textContent='Flight environment unavailable: '+e.message;}};
 const norm=v=>{let l=Math.hypot(...v);return v.map(x=>x/l);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 function camera(){const v=views[viewName],r=Math.hypot(...v.offset)*zoom,theta=Math.atan2(v.offset[1],v.offset[0])+yaw,phi=Math.max(-1.45,Math.min(1.45,Math.asin(v.offset[2]/Math.hypot(...v.offset))+pitch));const offset=[Math.cos(theta)*Math.cos(phi)*r,Math.sin(theta)*Math.cos(phi)*r,Math.sin(phi)*r],target=v.target.map((n,i)=>n/U+(i===2?1200:0)),eye=target.map((n,i)=>n+offset[i]/U),forward=norm(target.map((n,i)=>n-eye[i])),right=norm(cross(forward,[0,0,1]));pose={eye,right,up:cross(right,forward),back:forward.map(n=>-n)};scene.setSurfaceCamera(pose);}
 function draw(which=mode){rig.geometry();host.dispatchEvent(new CustomEvent('sky-environment',{detail:{lighting:lighting==='flight'?environment:null,pose:pose||{right:[1,0,0],up:[0,0,1],back:[0,-1,0]},exposure:1}}));scene.setStudyActors(which==='new'?candidate:original);scene.sync(world);scene.render(world,1,0,0);}
 function labels(){el('old').setAttribute('aria-pressed',mode==='old');el('new').setAttribute('aria-pressed',mode==='new');el('label').textContent=(mode==='old'?'A / ORIGINAL':'B / CANDIDATE 01')+' — '+el('view').selectedOptions[0].textContent;}
 function choose(which){if(busy)return;mode=which;labels();draw();}
 el('old').onclick=()=>choose('old');el('new').onclick=()=>choose('new');document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='a')choose('old');if(e.key.toLowerCase()==='b')choose('new');});
 el('view').onchange=()=>{viewName=el('view').value;yaw=0;pitch=0;zoom=1;camera();labels();draw();};
 el('motion').onclick=()=>{orbit=!orbit;el('motion').setAttribute('aria-pressed',orbit);};
 el('damage').onclick=()=>{damaged=!damaged;if(damaged)for(const p of rig.components())rig.damage(p.position,1000,combat);else rig.reset();el('damage').setAttribute('aria-pressed',damaged);};
 host.addEventListener('pointerdown',e=>{if(!busy){drag=[e.clientX,e.clientY];host.setPointerCapture(e.pointerId);}});
 host.addEventListener('pointermove',e=>{if(!drag||busy)return;yaw+=(e.clientX-drag[0])*.006;pitch+=(e.clientY-drag[1])*.006;drag=[e.clientX,e.clientY];camera();});host.addEventListener('pointerup',()=>drag=null);
 host.addEventListener('wheel',e=>{e.preventDefault();if(!busy){zoom=Math.max(.3,Math.min(5,zoom*Math.exp(e.deltaY*.001)));camera();}},{passive:false});
 const controls=[...document.querySelectorAll('button,select')];
 el('bench').onclick=async()=>{
  busy=true;orbit=false;el('motion').setAttribute('aria-pressed','false');controls.forEach(x=>x.disabled=true);const rows=[],size=()=>[host.clientWidth,host.clientHeight,devicePixelRatio].join(','),startSize=size();let previous=0;
  try{
   for(const which of ['old','new','new','old']){
    el('report').textContent='Measuring '+(which==='old'?'A':'B')+' · keep this tab visible';
    for(let i=0;i<110;i++){
     const time=await new Promise(requestAnimationFrame);if(document.hidden||size()!==startSize)throw new Error('Comparison interrupted by hidden tab or resized viewport; run again.');
     const start=performance.now();draw(which);const cpu=performance.now()-start,stats=scene.getRenderStats();
     if(i>=20){if(!stats.drawCalls)throw new Error('No visible ship draws');rows.push({mode:which,cpu,frame:time-previous,draws:stats.drawCalls,triangles:stats.triangles});}previous=time;
    }
   }
   const pct=(r,key,p)=>{const a=r.map(x=>x[key]).sort((a,b)=>a-b);return Number(a[Math.floor((a.length-1)*p)].toFixed(3));};
   results={view:viewName,lighting,camera:views[viewName],yaw,pitch,zoom,damaged,sourceHash:window.AegisSurfaceData.sourceHash,viewport:startSize,backing:[...host.querySelectorAll('canvas')].map(c=>[c.width,c.height]),atlas:[2048,1024],gpuTimed:false,rows:['old','new'].map(which=>{const r=rows.filter(x=>x.mode===which);return {mode:which,cpuMedian:pct(r,'cpu',.5),cpuP95:pct(r,'cpu',.95),frameMedian:pct(r,'frame',.5),frameP95:pct(r,'frame',.95),draws:pct(r,'draws',.5),triangles:pct(r,'triangles',.5)};})};
   el('report').textContent='Last measurement: '+viewName+' / '+lighting+'\nABBA · 20 warmup + 90 samples / block\n'+results.rows.map(r=>(r.mode==='old'?'A':'B')+' CPU '+r.cpuMedian+' / '+r.cpuP95+' ms · frame '+r.frameMedian+' / '+r.frameP95+' ms\n  '+r.draws+' draws · '+r.triangles+' triangles').join('\n')+'\n'+results.backing.map(x=>x.join('×')).join(', ')+' · GPU execution not measured';
   el('report').dataset.results=JSON.stringify(results);
  }catch(e){el('report').textContent=e.message;}finally{busy=false;controls.forEach(x=>x.disabled=false);draw();}
 };
 el('report').textContent='One shared 2048×1024 atlas · unchanged geometry\nCompare close detail, then whole-ship readability.';
 camera();labels();draw();
 function tick(time){const dt=Math.min(.1,(time-last)/1000);last=time;if(!busy){if(orbit){yaw+=dt*.12;camera();}draw();}requestAnimationFrame(tick);}requestAnimationFrame(tick);
})().catch(e=>{document.getElementById('report').textContent=e.stack;console.error(e);});
