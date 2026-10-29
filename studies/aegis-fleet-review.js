(async function(){
 'use strict';
 const D=window.Driftworks,data=window.AegisBevelData,U=D.sim.METERS_PER_UNIT,$=id=>document.getElementById(id);
 const requestedAtlas=new URLSearchParams(location.search).get('atlas')||'512';if(['2048','1024','512','256'].includes(requestedAtlas))$('atlas').value=requestedAtlas;
 let world=D.sim.createInitialWorld();world.asteroids=[];world.ships=[];world.hostiles=[];world.structures=[];
 const scenes=['left'].map(id=>D.scene3d.create($(id),()=>world,next=>{world=next;},{study:true}));
 const normalData=window.AegisNormalData,normalImage=new Image();normalImage.src=new URL(normalData.image,document.baseURI).href;await normalImage.decode();
 const normalImages={2048:normalImage};for(const width of [1024,512,256]){const img=new Image();img.src=new URL('aegis-normal-atlas-'+width+'.png',document.baseURI).href;await img.decode();normalImages[width]=img;}
 const atlasBytes=()=>Math.ceil(Number($('atlas').value)**2/2*4*4/3);
 const prepared=window.AegisFleetBuild.build(D.aegisFlightAsset,data,normalData,window.AegisFleetData),images=new Map();
 async function batch(b){let texture;if(b.atlas){if(!images.has(b.atlas)){const image=new Image();image.src=new URL('../assets/ships/aegis-kit/'+b.atlas,document.baseURI).href;await image.decode();images.set(b.atlas,image);}texture=images.get(b.atlas);}return {...b,texture,vertices:new Float32Array(b.vertices.map((v,i)=>i%b.stride<3?v/U:v)),staticGeometry:true};}
 const rest=[];for(const b of prepared.rest)rest.push(await batch(b));
 const armor={};for(const mode of ['weighted','baked']){armor[mode]=await batch(prepared.armor[mode]);if(mode==='baked')armor[mode].texture=normalImage;}
 armor.bakedReference={...armor.baked};
 let batches={},poses=[];
 function rebuild(){const count=Number($('fleet').value),columns=count===6?3:4,rows=count/columns;poses=Array.from({length:count},(_,i)=>({origin:[((i%columns)-(columns-1)/2)*1600/U,(Math.floor(i/columns)-(rows-1)/2)*700/U,1200+((i%2)*100)/U],rotation:(i%2?1:-1)*.08}));for(const mode of ['weighted','baked','bakedReference'])batches[mode]=poses.flatMap(p=>[...rest,armor[mode]].map(b=>({...b,...p})));}
 rebuild();
 const timer=window.AegisNormalRenderer.timer(window.AegisNormalRenderer.renderers[0]);
 const views={quarter:{target:[0,0,0],offset:[-2200,-5200,3200]},edge:{target:[-1600,-350,0],offset:[-650,-1100,650]},under:{target:[0,0,0],offset:[-2200,-5200,-3200]},far:{target:[0,0,0],offset:[-4400,-10400,6400]}};
 let yaw=0,pitch=0,zoom=1,orbit=false,drag=null,busy=false,last=0;
 const norm=v=>{const d=Math.hypot(...v);return v.map(x=>x/d);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 function camera(){const v=views[$('view').value],r=Math.hypot(...v.offset)*zoom,t=Math.atan2(v.offset[1],v.offset[0])+yaw,p=Math.max(-1.45,Math.min(1.45,Math.asin(v.offset[2]/Math.hypot(...v.offset))+pitch));const target=v.target.map((x,i)=>x/U+(i===2?1200:0)),eye=target.map((x,i)=>x+[Math.cos(t)*Math.cos(p)*r,Math.sin(t)*Math.cos(p)*r,Math.sin(p)*r][i]/U),forward=norm(target.map((x,i)=>x-eye[i])),right=norm(cross(forward,[0,0,1])),pose={eye,right,up:cross(right,forward),back:forward.map(x=>-x)};scenes.forEach(s=>s.setSurfaceCamera(pose));}
 function render(i){scenes[i].sync(world);scenes[i].render(world,1,0,0);}
 function assign(){scenes[0].setStudyActors(batches[$('mode').value]);$('candidate-label').textContent='Atlas '+$('atlas').value+' x '+Number($('atlas').value)/2+' / '+(atlasBytes()/1048576).toFixed(2)+' MiB | '+$('mode').selectedOptions[0].textContent+' / '+poses.length+' ships';}
 function reset(){yaw=pitch=0;zoom=1;camera();}
 $('atlas').onchange=()=>{armor.baked.texture=normalImages[$('atlas').value];rebuild();assign();};$('mode').onchange=assign;$('fleet').onchange=()=>{rebuild();assign();reset();};$('view').onchange=reset;$('reset').onclick=reset;$('orbit').onclick=()=>{orbit=!orbit;$('orbit').textContent=orbit?'Stop orbit':'Slow orbit';};
 for(const id of ['left']){const host=$(id);host.addEventListener('pointerdown',e=>{e.stopPropagation();if(busy)return;drag=[e.clientX,e.clientY];host.setPointerCapture(e.pointerId);},true);host.addEventListener('pointermove',e=>{e.stopPropagation();if(!drag||busy)return;yaw+=(e.clientX-drag[0])*.006;pitch+=(e.clientY-drag[1])*.006;drag=[e.clientX,e.clientY];camera();},true);host.addEventListener('pointerup',e=>{e.stopPropagation();drag=null;},true);host.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();if(busy)return;zoom=Math.max(.2,Math.min(5,zoom*Math.exp(e.deltaY*.001)));camera();},{passive:false,capture:true});}
 $('bench').onclick=async()=>{
  busy=true;orbit=false;drag=null;delete window.bevelResults;delete window.bevelError;const controls=[...document.querySelectorAll('button,select')];controls.forEach(e=>e.disabled=true);
  const rows=[],pending=[],size=()=>[innerWidth,innerHeight,devicePixelRatio,...[...$('left').querySelectorAll('canvas')].flatMap(c=>[c.width,c.height])].join(','),initial=size(),order=[$('compare').value,'baked','baked',$('compare').value];
  function poll(){if(timer.disjoint())throw new Error('Disjoint GPU timer: entire measurement discarded; repeat.');for(let i=pending.length-1;i>=0;i--){const value=timer.poll(pending[i].query);if(value===null)continue;if(!(value>0&&Number.isFinite(value)))throw new Error('Invalid GPU timer sample; entire measurement discarded');pending[i].row.gpu=value;pending.splice(i,1);}}
  try{
   for(let block=0;block<order.length;block++){
    const mode=order[block];scenes[0].setStudyActors(batches[mode]);let previous=0;
    $('report').textContent=`Measuring ${mode} (${block+1}/4); keep this tab foreground. GPU timer: ${timer.available?'available':'unavailable'}`;
    for(let i=0;i<240;i++){
     const time=await new Promise(requestAnimationFrame);if(document.hidden||size()!==initial)throw new Error('Viewport changed or hidden; repeat measurement');poll();
     const query=i>=60?timer.begin():null,start=performance.now();render(0);const cpu=performance.now()-start;if(query)timer.end();const stats=scenes[0].getRenderStats();
     if(i>=60){if(!stats.drawCalls||!stats.triangles)throw new Error('No visible fleet');const row={block,mode,cpu,frame:time-previous,draws:stats.drawCalls,triangles:stats.triangles};rows.push(row);if(query)pending.push({query,row});}previous=time;
    }
   }
   for(let i=0;pending.length&&i<300;i++){await new Promise(requestAnimationFrame);if(document.hidden||size()!==initial)throw new Error('Viewport changed during query collection');poll();}
   if(pending.length)throw new Error('GPU query timeout; no GPU result');
   const pct=(a,k,p)=>{const sorted=a.map(r=>r[k]).filter(Number.isFinite).sort((a,b)=>a-b);return sorted.length?sorted[Math.floor((sorted.length-1)*p)]:null;};
   const summarize=a=>({samples:a.length,gpuSamples:a.filter(r=>Number.isFinite(r.gpu)).length,gpuMedian:pct(a,'gpu',.5),gpuP95:pct(a,'gpu',.95),cpuMedian:pct(a,'cpu',.5),cpuP95:pct(a,'cpu',.95),frameMedian:pct(a,'frame',.5),frameP95:pct(a,'frame',.95),draws:pct(a,'draws',.5),triangles:pct(a,'triangles',.5)});
   const results={sourceHash:data.sourceHash,normalBakeHash:normalData.bevelHash,section:'Complete frozen Aegis fleet',fleetSize:poses.length,bandsPerShip:prepared.bands,poses,rigHash:window.AegisFleetData.rigHash,sharedNormalImages:new Set(batches.baked.filter(b=>b.finish===-3).map(b=>b.texture)).size,sharedNormalBuffers:new Set(batches.baked.filter(b=>b.finish===-3).map(b=>b.vertices)).size,restTriangles:rest.reduce((n,b)=>n+b.vertices.length/b.stride/3,0),armorTriangles:{weighted:6320,baked:1200},width:data.width,view:$('view').value,yaw,pitch,zoom,viewport:initial,backing:[...$('left').querySelectorAll('canvas')].map(c=>[c.width,c.height]),renderer:'scene3d complete fleet, frozen poses, production rest textures, neutral replacement armor, no combat/effects',device:timer.device,gpuTimed:timer.available,gpuScope:'complete scene3d render including clear; asynchronous EXT_disjoint_timer_query_webgl2; no readPixels',warmup:60,samplesPerBlock:180,order,atlas:[Number($('atlas').value),Number($('atlas').value)/2],textureBytesWithMips:atlasBytes(),referenceAtlas:[2048,1024],blocks:order.map((mode,block)=>({mode,block,...summarize(rows.filter(r=>r.block===block))})),rows:[...new Set(order)].map(mode=>({mode,...summarize(rows.filter(r=>r.mode===mode))})),raw:rows};
   window.bevelResults=results;
   $('report').textContent=results.view+' view | '+results.rows.map(r=>`${r.mode}: ${r.triangles} triangles / ${r.draws} draws - GPU median/p95 ${r.gpuMedian===null?'UNAVAILABLE':r.gpuMedian.toFixed(4)+' / '+r.gpuP95.toFixed(4)+' ms'} - CPU ${r.cpuMedian.toFixed(2)} ms`).join('\n')+'\nABBA, 360 samples/mode; repeat runs before inferring a speedup; baked atlas '+(atlasBytes()/1048576).toFixed(2)+' MiB with mips. Complete frozen fleet rendering; no combat simulation.';
  }catch(e){window.bevelError=e.message;$('report').textContent=e.message;}finally{for(const p of pending)timer.discard(p.query);busy=false;controls.forEach(e=>e.disabled=false);assign();}
 };
 $('atlas').onchange();camera();scenes.forEach((_,i)=>render(i));camera();
 $('report').textContent='Atlas sizes are shown above; the selected atlas is shared across all ships. GPU timer: '+(timer.available?'available':'unavailable')+'\n20 armor bands per ship: real bevels 6,320 triangles; baked normals 1,200. Rest of each ship is identical.';
 window.bevelStudy={scenes,data,normalData,timer,timerAvailable:timer.available,ready:true,prepared,getBatches:()=>batches};
 function tick(time){if(!busy&&!document.hidden){if(orbit){yaw+=Math.min(.1,(time-last)/1000)*.18;camera();}render(0);}last=time;requestAnimationFrame(tick);}requestAnimationFrame(tick);
})().catch(e=>{document.getElementById('report').textContent=e.stack;console.error(e);});
