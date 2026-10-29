(async function(){
 'use strict';
 const D=window.Driftworks,data=window.AegisBevelData,U=D.sim.METERS_PER_UNIT,$=id=>document.getElementById(id);
 const requestedAtlas=new URLSearchParams(location.search).get('atlas');if(['2048','1024','512','256'].includes(requestedAtlas))$('atlas').value=requestedAtlas;
 if(new URLSearchParams(location.search).get('baseline')==='bakedReference')$('baseline').value='bakedReference';
 let world=D.sim.createInitialWorld();world.asteroids=[];world.ships=[];world.hostiles=[];world.structures=[];
 const scenes=['left','right'].map(id=>D.scene3d.create($(id),()=>world,next=>{world=next;},{study:true}));
 const batches={};for(const mode of ['original','flat','weighted'])batches[mode]=[{vertices:new Float32Array(data[mode].map((v,i)=>i%6<3?v/U:v)),color:[.52,.52,.52],origin:[0,0,1200],staticGeometry:true}];
 const normalData=window.AegisNormalData,normalImage=new Image();normalImage.src=new URL(normalData.image,document.baseURI).href;await normalImage.decode();
 const normalImages={2048:normalImage};for(const width of [1024,512,256]){const img=new Image();img.src=new URL('aegis-normal-atlas-'+width+'.png',document.baseURI).href;await img.decode();normalImages[width]=img;}
 const atlasBytes=()=>Math.ceil(Number($('atlas').value)**2/2*4*4/3);
 batches.baked=[{vertices:new Float32Array(normalData.vertices.map((v,i)=>i%8<3?v/U:v)),stride:8,texture:normalImage,finish:-3,color:[.52,.52,.52],origin:[0,0,1200],staticGeometry:true}];
 batches.bakedReference=[{...batches.baked[0]}];
 const timer=window.AegisNormalRenderer.timer(window.AegisNormalRenderer.renderers[0]);
 const views={quarter:{target:[0,0,0],offset:[105,-160,100]},side:{target:[0,0,0],offset:[35,-180,28]},edge:{target:[8,-38,28],offset:[27,-48,28]},under:{target:[0,0,0],offset:[80,-140,-100]},far:{target:[0,0,0],offset:[300,-650,350]}};
 let yaw=0,pitch=0,zoom=1,orbit=false,drag=null,busy=false,last=0;
 const norm=v=>{const d=Math.hypot(...v);return v.map(x=>x/d);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 function camera(){const v=views[$('view').value],r=Math.hypot(...v.offset)*zoom,t=Math.atan2(v.offset[1],v.offset[0])+yaw,p=Math.max(-1.45,Math.min(1.45,Math.asin(v.offset[2]/Math.hypot(...v.offset))+pitch));const target=v.target.map((x,i)=>x/U+(i===2?1200:0)),eye=target.map((x,i)=>x+[Math.cos(t)*Math.cos(p)*r,Math.sin(t)*Math.cos(p)*r,Math.sin(p)*r][i]/U),forward=norm(target.map((x,i)=>x-eye[i])),right=norm(cross(forward,[0,0,1])),pose={eye,right,up:cross(right,forward),back:forward.map(x=>-x)};scenes.forEach(s=>s.setSurfaceCamera(pose));}
 function render(i){scenes[i].sync(world);scenes[i].render(world,1,0,0);}
 function assign(){scenes[0].setStudyActors(batches[$('baseline').value]);scenes[1].setStudyActors(batches[$('mode').value]);$('candidate-label').textContent='Atlas '+$('atlas').value+' x '+Number($('atlas').value)/2+' / '+(atlasBytes()/1048576).toFixed(2)+' MiB | '+'B / '+$('mode').selectedOptions[0].textContent.toUpperCase()+' · '+(batches[$('mode').value][0].vertices.length/(batches[$('mode').value][0].stride||6)/3)+' triangles';}
 function reset(){yaw=pitch=0;zoom=1;camera();}
 $('atlas').onchange=()=>{batches.baked[0].texture=normalImages[$('atlas').value];assign();};$('mode').onchange=assign;$('baseline').onchange=assign;$('view').onchange=reset;$('reset').onclick=reset;$('orbit').onclick=()=>{orbit=!orbit;$('orbit').textContent=orbit?'Stop orbit':'Slow orbit';};
 for(const id of ['left','right']){const host=$(id);host.addEventListener('pointerdown',e=>{e.stopPropagation();if(busy)return;drag=[e.clientX,e.clientY];host.setPointerCapture(e.pointerId);},true);host.addEventListener('pointermove',e=>{e.stopPropagation();if(!drag||busy)return;yaw+=(e.clientX-drag[0])*.006;pitch+=(e.clientY-drag[1])*.006;drag=[e.clientX,e.clientY];camera();},true);host.addEventListener('pointerup',e=>{e.stopPropagation();drag=null;},true);host.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();if(busy)return;zoom=Math.max(.2,Math.min(5,zoom*Math.exp(e.deltaY*.001)));camera();},{passive:false,capture:true});}
 $('bench').onclick=async()=>{
  busy=true;orbit=false;drag=null;delete window.bevelResults;delete window.bevelError;const controls=[...document.querySelectorAll('button,select')];controls.forEach(e=>e.disabled=true);
  const rows=[],pending=[],size=()=>[innerWidth,innerHeight,devicePixelRatio,...[...$('left').querySelectorAll('canvas')].flatMap(c=>[c.width,c.height])].join(','),initial=size(),order=['weighted','baked','baked','weighted'];
  function poll(){if(timer.disjoint())throw new Error('Disjoint GPU timer: entire measurement discarded; repeat.');for(let i=pending.length-1;i>=0;i--){const value=timer.poll(pending[i].query);if(value===null)continue;if(!(value>0&&Number.isFinite(value)))throw new Error('Invalid GPU timer sample; entire measurement discarded');pending[i].row.gpu=value;pending.splice(i,1);}}
  try{
   for(let block=0;block<order.length;block++){
    const mode=order[block];scenes[0].setStudyActors(batches[mode]);let previous=0;
    $('report').textContent=`Measuring ${mode} (${block+1}/4); keep this tab foreground. GPU timer: ${timer.available?'available':'unavailable'}`;
    for(let i=0;i<150;i++){
     const time=await new Promise(requestAnimationFrame);if(document.hidden||size()!==initial)throw new Error('Viewport changed or hidden; repeat measurement');poll();
     const query=i>=30?timer.begin():null,start=performance.now();render(0);const cpu=performance.now()-start;if(query)timer.end();const stats=scenes[0].getRenderStats();
     if(i>=30){if(stats.drawCalls!==1||stats.triangles!==(mode==='baked'?60:316))throw new Error('Unexpected geometry/draw count');const row={block,mode,cpu,frame:time-previous,draws:stats.drawCalls,triangles:stats.triangles};rows.push(row);if(query)pending.push({query,row});}previous=time;
    }
   }
   for(let i=0;pending.length&&i<300;i++){await new Promise(requestAnimationFrame);if(document.hidden||size()!==initial)throw new Error('Viewport changed during query collection');poll();}
   if(pending.length)throw new Error('GPU query timeout; no GPU result');
   const pct=(a,k,p)=>{const sorted=a.map(r=>r[k]).filter(Number.isFinite).sort((a,b)=>a-b);return sorted.length?sorted[Math.floor((sorted.length-1)*p)]:null;};
   const summarize=a=>({samples:a.length,gpuSamples:a.filter(r=>Number.isFinite(r.gpu)).length,gpuMedian:pct(a,'gpu',.5),gpuP95:pct(a,'gpu',.95),cpuMedian:pct(a,'cpu',.5),cpuP95:pct(a,'cpu',.95),frameMedian:pct(a,'frame',.5),frameP95:pct(a,'frame',.95),draws:pct(a,'draws',.5),triangles:pct(a,'triangles',.5)});
   const results={sourceHash:data.sourceHash,normalBakeHash:normalData.bevelHash,section:data.section,width:data.width,view:$('view').value,yaw,pitch,zoom,viewport:initial,backing:[...$('left').querySelectorAll('canvas')].map(c=>[c.width,c.height]),renderer:'scene3d study, one active viewport, neutral finish, no combat/effects',device:timer.device,gpuTimed:timer.available,gpuScope:'complete scene3d render including clear; asynchronous EXT_disjoint_timer_query_webgl2; no readPixels',warmup:30,samplesPerBlock:120,order,atlas:[Number($('atlas').value),Number($('atlas').value)/2],textureBytesWithMips:atlasBytes(),referenceAtlas:[2048,1024],blocks:order.map((mode,block)=>({mode,block,...summarize(rows.filter(r=>r.block===block))})),rows:['weighted','baked'].map(mode=>({mode,...summarize(rows.filter(r=>r.mode===mode))})),raw:rows};
   window.bevelResults=results;
   $('report').textContent=results.view+' view | '+results.rows.map(r=>`${r.mode}: ${r.triangles} triangles / ${r.draws} draw - GPU median/p95 ${r.gpuMedian===null?'UNAVAILABLE':r.gpuMedian.toFixed(4)+' / '+r.gpuP95.toFixed(4)+' ms'} - CPU ${r.cpuMedian.toFixed(2)} ms`).join('\n')+'\nABBA, 240 samples/mode; repeat runs before inferring a speedup; baked atlas '+(atlasBytes()/1048576).toFixed(2)+' MiB with mips. Complete isolated-section draw, not whole-combat performance.';
  }catch(e){window.bevelError=e.message;$('report').textContent=e.message;}finally{for(const p of pending)timer.discard(p.query);busy=false;controls.forEach(e=>e.disabled=false);assign();}
 };
 $('atlas').onchange();camera();scenes.forEach((_,i)=>render(i));camera();
 $('report').textContent=`GPU timer: ${timer.available?'available':'unavailable'} � baked atlas 10.7 MiB with mipmaps\n${data.section} · original 60 → candidate ${data.flat.length/18} triangles · ${data.bevelFaces} bevel faces\nReview only. Neutral finish isolates geometry; production textures, collision, pivots and ship assets are unchanged.`;
 window.bevelStudy={scenes,data,normalData,timer,timerAvailable:timer.available,ready:true};
 function tick(time){if(!busy&&!document.hidden){if(orbit){yaw+=Math.min(.1,(time-last)/1000)*.18;camera();}render(0);render(1);}last=time;requestAnimationFrame(tick);}requestAnimationFrame(tick);
})().catch(e=>{document.getElementById('report').textContent=e.stack;console.error(e);});
