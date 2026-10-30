(async function(){
 'use strict';
 const DW=window.Driftworks,U=DW.sim.METERS_PER_UNIT,el=id=>document.getElementById(id),host=el('viewer');
 DW.aegisFlightAsset=window.AegisBeltOriginal;await DW.aegisFlight.load();
 let world=DW.sim.createInitialWorld();world.asteroids=[];world.ships=[];world.hostiles=[];world.structures=[];
 const scene=DW.scene3d.create(host,()=>world,next=>{world=next},{study:true});
 const rig=DW.aegisFlight.create(),combat=DW.flightSim.create('training');
 const image=rig.geometry().find(b=>b.texture)?.texture;if(!image)throw new Error('Capital surface atlas did not load');
 const original=rig.geometry();
 const doorImage=new Image();doorImage.src='aegis-hangar-door-scale-v3.png';await doorImage.decode();const doorCache=new WeakMap();function scaledDoors(batches){let result=doorCache.get(batches);if(!result){result=batches.map(b=>b.texture&&b.texture.src.includes('/hangar-v1/bulkhead.png')?Object.assign({},b,{texture:doorImage}):b);doorCache.set(batches,result);}return result;}el('doors').onchange=()=>draw();
 DW.aegisFlightAsset=window.AegisBeltFlat;await DW.aegisFlight.load();const flatRig=DW.aegisFlight.create();
 DW.aegisFlightAsset=window.AegisBeltInset;await DW.aegisFlight.load();const insetRig=DW.aegisFlight.create();
 let candidate=insetRig.geometry();
 for(let i=0;i<600&&!DW.miningStudyCrew?.poses&&!DW.miningStudyCrew?.error;i++)await new Promise(requestAnimationFrame);
 const scaleStudy=window.AegisScaleStudy(U,original[0].origin);el('scale').onchange=()=>draw();el('cutaway').onchange=()=>draw();el('treatment').onchange=()=>{candidate=el('treatment').value==='flat'?flatRig.geometry():insetRig.geometry();labels();draw();};
 document.querySelector('h1').textContent='AEGIS / baked window belts — taste test';
 el('old').textContent='A · Window boxes';el('new').textContent='B · Baked windows';
 document.querySelector('footer').textContent='480 windows baked into shared opaque belt textures. Compare flat paint with real shallow openings; individual window boxes are removed.';
 el('damage').hidden=true;
 const views={wide:{target:[0,0,0],offset:[-650,-1950,1100]},armor:{target:[-245,0,0],offset:[-80,-155,125]},side:{target:[-245,0,0],offset:[-20,-180,18]},underside:{target:[-245,0,0],offset:[-85,-180,-140]},hangar:{target:DW.aegisFlightAsset.hangars[0].position,offset:[-25,-150,16]},stern:{target:[640,0,0],offset:[195,-80,60]},far:{target:[0,0,0],offset:[-1600,-3800,1900]}};
 let mode='new',viewName='scale',orbit=false,busy=false,damaged=false,yaw=0,pitch=0,zoom=1,last=performance.now(),drag=null,results=null,pose=null,environment=null,lighting='studio';
 const bay=DW.aegisFlightAsset.hangars[0].position;
 views.prow={target:[-520,0,0],offset:[-150,-160,100]};const prowOption=document.createElement('option');prowOption.value='prow';prowOption.textContent='Nose armor';el('view').append(prowOption);
 views.beltOblique={target:[-245,-47,-1],offset:[32,-30,8]};views.beltGrazing={target:[-245,-47,-1],offset:[44,-12,4]};for(const [value,name] of [['beltOblique','Belt oblique'],['beltGrazing','Belt grazing']]){const o=document.createElement('option');o.value=value;o.textContent=name;el('view').append(o);}
 views.doorScale={target:[bay[0]-53.1,-34,-10.3],offset:[12,-10,4]};const ds=document.createElement('option');ds.value='doorScale';ds.textContent='Personnel door scale';el('view').append(ds);
 views.hangarClose={target:[bay[0]-24,-6,-9.7],offset:[-9,-32,11]};const hc=document.createElement('option');hc.value='hangarClose';hc.textContent='Hangar scale close-up';el('view').append(hc);
 views.hangarScale={target:[bay[0],0,-8],offset:[-15,-90,15]};const hs=document.createElement('option');hs.value='hangarScale';hs.textContent='Hangar scale';el('view').append(hs);
 views.scale={target:[-244,-48,-1],offset:[-10,-65,12]};views.cutDecks={target:[-248,-10,0],offset:[-18,-135,10]};for(const [value,name] of [['scale','Crew and fighter scale'],['cutDecks','Deck cutaway']]){const o=document.createElement('option');o.value=value;o.textContent=name;el('view').append(o);}
 views.utility={target:[184.5,0,0],offset:[-30,-220,40]};views.pods={target:[-375,0,-30],offset:[130,-20,-75]};for(const [value,name] of [['utility','Utility structure'],['pods','Ventral pods']]){const o=document.createElement('option');o.value=value;o.textContent=name;el('view').append(o);}
 views.mid={target:[-180,-45,0],offset:[-25,-330,60]};views.distant={target:[-100,-45,0],offset:[-20,-900,130]};for(const [value,name] of [['mid','Windows · medium'],['distant','Windows · distant']]){const o=document.createElement('option');o.value=value;o.textContent=name;el('view').append(o);}
 views.oblique={target:[673,0,0],offset:[100,-150,45]};const ob=document.createElement('option');ob.value='oblique';ob.textContent='Nozzles oblique';el('view').append(ob);
 views.interior={target:[bay[0]+12,0,-5],offset:[-24,-72,16]};
 views.deck={target:[bay[0],0,-8],offset:[0,-35,16]};
 views.workshop={target:[bay[0]+53,0,-1],offset:[-70,-20,5]};
 views.opposite={target:[bay[0],0,-5],offset:[24,72,16]};
 for(const [value,name] of [['interior','Inside approach'],['deck','Lift and deck'],['workshop','Workshop wall'],['opposite','Opposite mouth']]){const option=document.createElement('option');option.value=value;option.textContent=name;el('view').append(option);}const option=document.createElement('option');option.value='windows';option.textContent='Windows close-up';el('view').append(option);el('view').value='scale';views.nose={target:[-435,-22,0],offset:[-10,-65,12]};const nose=document.createElement('option');nose.value='nose';nose.textContent='Nose windows';el('view').append(nose);views.windows={target:[-245,-48,-1],offset:[-6,-38,3]};
 document.getElementById('hint').firstChild.textContent='Same camera and lighting. Press A / B to compare. Drag to orbit · wheel to zoom. ';
 const lightingURL=DW.assetUrl('../assets/backgrounds/sky-lighting-v1.json');
 const lightingReady=fetch(lightingURL).then(r=>r.json()).then(async data=>{
  const f=data.families.galaxy,img=new Image();img.src=DW.assetUrl(f.map,lightingURL);await img.decode();
  const radiance=f.radiance?new Float32Array(await (await fetch(DW.assetUrl(f.radiance,lightingURL))).arrayBuffer()):undefined;
  environment={sh:f.sh,map:f.map,image:img,radiance};
 });
 el('lighting').onchange=async()=>{try{await lightingReady;lighting=el('lighting').value;draw();}catch(e){el('report').textContent='Flight environment unavailable: '+e.message;}};
 const norm=v=>{let l=Math.hypot(...v);return v.map(x=>x/l);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 function camera(){const v=views[viewName],r=Math.hypot(...v.offset)*zoom,theta=Math.atan2(v.offset[1],v.offset[0])+yaw,phi=Math.max(-1.45,Math.min(1.45,Math.asin(v.offset[2]/Math.hypot(...v.offset))+pitch));const offset=[Math.cos(theta)*Math.cos(phi)*r,Math.sin(theta)*Math.cos(phi)*r,Math.sin(phi)*r],target=v.target.map((n,i)=>n/U+(i===2?1200:0)),eye=target.map((n,i)=>n+offset[i]/U),forward=norm(target.map((n,i)=>n-eye[i])),right=norm(cross(forward,[0,0,1]));pose={eye,right,up:cross(right,forward),back:forward.map(n=>-n)};scene.setSurfaceCamera(pose);}
 function draw(which=mode){rig.geometry();host.dispatchEvent(new CustomEvent('sky-environment',{detail:{lighting:lighting==='flight'?environment:null,pose:pose||{right:[1,0,0],up:[0,0,1],back:[0,-1,0]},exposure:1}}));let actors=which==='new'?candidate:original;if(el('doors').checked)actors=scaledDoors(actors);if(el('cutaway').checked)actors=scaleStudy.cutaway(actors,DW.aegisFlightAsset.batches.length+DW.aegisFlightAsset.interiors.length).concat(scaleStudy.decks);if(el('scale').checked)actors=actors.concat(scaleStudy.references);scene.setStudyActors(actors);scene.sync(world);scene.render(world,1,0,0);}
 function labels(){el('old').setAttribute('aria-pressed',mode==='old');el('new').setAttribute('aria-pressed',mode==='new');el('label').textContent=(mode==='old'?'A / WINDOW BOXES':'B / BAKED WINDOWS')+' — '+el('view').selectedOptions[0].textContent;}
 function choose(which){if(busy)return;mode=which;labels();draw();}
 el('old').onclick=()=>choose('old');el('new').onclick=()=>choose('new');document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='a')choose('old');if(e.key.toLowerCase()==='b')choose('new');});
 el('view').onchange=()=>{viewName=el('view').value;if(viewName==='cutDecks')el('cutaway').checked=true;if(viewName==='hangarScale'||viewName==='hangarClose'||viewName==='doorScale'){el('cutaway').checked=false;el('scale').checked=true;}yaw=0;pitch=0;zoom=1;camera();labels();draw();camera();};
 el('motion').onclick=()=>{orbit=!orbit;el('motion').setAttribute('aria-pressed',orbit);};
 el('damage').onclick=()=>{damaged=!damaged;if(damaged)for(const p of rig.components())rig.damage(p.position,1000,combat);else rig.reset();el('damage').setAttribute('aria-pressed',damaged);};
 host.addEventListener('pointerdown',e=>{if(!busy){drag=[e.clientX,e.clientY];host.setPointerCapture(e.pointerId);}});
 host.addEventListener('pointermove',e=>{if(!drag||busy)return;yaw+=(e.clientX-drag[0])*.006;pitch+=(e.clientY-drag[1])*.006;drag=[e.clientX,e.clientY];camera();});host.addEventListener('pointerup',()=>drag=null);
 host.addEventListener('wheel',e=>{e.preventDefault();if(!busy){zoom=Math.max(.3,Math.min(5,zoom*Math.exp(e.deltaY*.001)));camera();}},{passive:false});
 const controls=[...document.querySelectorAll('button,select')];
 el('bench').onclick=async()=>{
  busy=true;orbit=false;el('motion').setAttribute('aria-pressed','false');controls.forEach(x=>x.disabled=true);const rows=[],startCamera=[yaw,pitch,zoom].join(','),size=()=>[host.clientWidth,host.clientHeight,devicePixelRatio].join(','),startSize=size();let previous=0;
  try{
   for(const which of ['old','new','new','old']){
    el('report').textContent='Measuring '+(which==='old'?'A':'B')+' · keep this tab visible';
    for(let i=0;i<110;i++){
     const time=await new Promise(requestAnimationFrame);if(document.hidden||size()!==startSize||[yaw,pitch,zoom].join(',')!==startCamera)throw new Error('Comparison interrupted by hidden tab or resized viewport; run again.');
     const start=performance.now();draw(which);const cpu=performance.now()-start,stats=scene.getRenderStats();
     if(i>=20){if(!stats.drawCalls)throw new Error('No visible ship draws');rows.push({mode:which,cpu,frame:time-previous,draws:stats.drawCalls,triangles:stats.triangles});}previous=time;
    }
   }
   const pct=(r,key,p)=>{const a=r.map(x=>x[key]).sort((a,b)=>a-b);return Number(a[Math.floor((a.length-1)*p)].toFixed(3));};
   results={pass:'baked-belts',treatment:el('treatment').value,correctedPersonnelDoors:el('doors').checked,scaleReferences:el('scale').checked,cutaway:el('cutaway').checked,view:viewName,lighting,camera:views[viewName],yaw,pitch,zoom,damaged,sourceHash:window.AegisSurfaceData.sourceHash,viewport:startSize,backing:[...host.querySelectorAll('canvas')].map(c=>[c.width,c.height]),atlas:[2048,1280],gpuTimed:false,rows:['old','new'].map(which=>{const r=rows.filter(x=>x.mode===which);return {mode:which,cpuMedian:pct(r,'cpu',.5),cpuP95:pct(r,'cpu',.95),frameMedian:pct(r,'frame',.5),frameP95:pct(r,'frame',.95),draws:pct(r,'draws',.5),triangles:pct(r,'triangles',.5)};})};
   el('report').textContent='Last measurement: '+viewName+' / '+lighting+'\nABBA · 20 warmup + 90 samples / block\n'+results.rows.map(r=>(r.mode==='old'?'A':'B')+' CPU '+r.cpuMedian+' / '+r.cpuP95+' ms · frame '+r.frameMedian+' / '+r.frameP95+' ms\n  '+r.draws+' draws · '+r.triangles+' triangles').join('\n')+'\n'+results.backing.map(x=>x.join('×')).join(', ')+' · GPU execution not measured';
   el('report').dataset.results=JSON.stringify(results);
  }catch(e){el('report').textContent=e.message;}finally{busy=false;controls.forEach(x=>x.disabled=false);draw();}
 };
 el('report').textContent='Baked belts / individual window boxes removed\nFlat: 4608 fewer triangles; inset: 2964 fewer triangles / ship';
 camera();labels();draw();camera();
 function tick(time){const dt=Math.min(.1,(time-last)/1000);last=time;if(!busy&&!document.hidden){if(orbit){yaw+=dt*.12;camera();}draw();}requestAnimationFrame(tick);}requestAnimationFrame(tick);
})().catch(e=>{document.getElementById('report').textContent=e.stack;console.error(e);});
