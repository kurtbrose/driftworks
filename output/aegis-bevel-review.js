(function(){
 'use strict';
 const D=window.Driftworks,data=window.AegisBevelData,U=D.sim.METERS_PER_UNIT,$=id=>document.getElementById(id);
 let world=D.sim.createInitialWorld();world.asteroids=[];world.ships=[];world.hostiles=[];world.structures=[];
 const scenes=['left','right'].map(id=>D.scene3d.create($(id),()=>world,next=>{world=next;},{study:true}));
 const batches={};for(const mode of ['original','flat','weighted'])batches[mode]=[{vertices:new Float32Array(data[mode].map((v,i)=>i%6<3?v/U:v)),color:[.52,.52,.52],origin:[0,0,1200],staticGeometry:true}];
 const views={quarter:{target:[0,0,0],offset:[105,-160,100]},side:{target:[0,0,0],offset:[35,-180,28]},edge:{target:[8,-38,28],offset:[27,-48,28]},under:{target:[0,0,0],offset:[80,-140,-100]},far:{target:[0,0,0],offset:[300,-650,350]}};
 let yaw=0,pitch=0,zoom=1,orbit=false,drag=null,busy=false,last=0;
 const norm=v=>{const d=Math.hypot(...v);return v.map(x=>x/d);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 function camera(){const v=views[$('view').value],r=Math.hypot(...v.offset)*zoom,t=Math.atan2(v.offset[1],v.offset[0])+yaw,p=Math.max(-1.45,Math.min(1.45,Math.asin(v.offset[2]/Math.hypot(...v.offset))+pitch));const target=v.target.map((x,i)=>x/U+(i===2?1200:0)),eye=target.map((x,i)=>x+[Math.cos(t)*Math.cos(p)*r,Math.sin(t)*Math.cos(p)*r,Math.sin(p)*r][i]/U),forward=norm(target.map((x,i)=>x-eye[i])),right=norm(cross(forward,[0,0,1])),pose={eye,right,up:cross(right,forward),back:forward.map(x=>-x)};scenes.forEach(s=>s.setSurfaceCamera(pose));}
 function render(i){scenes[i].sync(world);scenes[i].render(world,1,0,0);}
 function assign(){scenes[0].setStudyActors(batches.original);scenes[1].setStudyActors(batches[$('mode').value]);$('candidate-label').textContent='B / '+$('mode').selectedOptions[0].textContent.toUpperCase()+' · '+data[$('mode').value].length/18+' triangles';}
 function reset(){yaw=pitch=0;zoom=1;camera();}
 $('mode').onchange=assign;$('view').onchange=reset;$('reset').onclick=reset;$('orbit').onclick=()=>{orbit=!orbit;$('orbit').textContent=orbit?'Stop orbit':'Slow orbit';};
 for(const id of ['left','right']){const host=$(id);host.addEventListener('pointerdown',e=>{e.stopPropagation();if(busy)return;drag=[e.clientX,e.clientY];host.setPointerCapture(e.pointerId);},true);host.addEventListener('pointermove',e=>{e.stopPropagation();if(!drag||busy)return;yaw+=(e.clientX-drag[0])*.006;pitch+=(e.clientY-drag[1])*.006;drag=[e.clientX,e.clientY];camera();},true);host.addEventListener('pointerup',e=>{e.stopPropagation();drag=null;},true);host.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();if(busy)return;zoom=Math.max(.2,Math.min(5,zoom*Math.exp(e.deltaY*.001)));camera();},{passive:false,capture:true});}
 $('bench').onclick=async()=>{
  busy=true;orbit=false;drag=null;const controls=[...document.querySelectorAll('button,select')];controls.forEach(e=>e.disabled=true);const rows=[],size=()=>[innerWidth,innerHeight,devicePixelRatio].join(','),initial=size(),candidate=$('mode').value;
  try{for(const mode of ['original',candidate,candidate,'original']){
   scenes[0].setStudyActors(batches[mode]);let previous=0;
   for(let i=0;i<110;i++){const time=await new Promise(requestAnimationFrame);if(document.hidden||size()!==initial)throw new Error('Viewport changed or hidden; repeat measurement');const start=performance.now();render(0);const cpu=performance.now()-start,s=scenes[0].getRenderStats();if(i>=20){if(!s.drawCalls)throw new Error('No visible geometry');rows.push({mode,cpu,frame:time-previous,draws:s.drawCalls,triangles:s.triangles});}previous=time;}
  }
  const pct=(a,k,p)=>a.map(r=>r[k]).sort((a,b)=>a-b)[Math.floor((a.length-1)*p)];
  const results={sourceHash:data.sourceHash,section:data.section,width:data.width,view:$('view').value,yaw,pitch,zoom,viewport:initial,backing:[...$('left').querySelectorAll('canvas')].map(c=>[c.width,c.height]),renderer:'scene3d study / neutral finish / no combat or effects',gpuTimed:false,warmup:20,samplesPerBlock:90,order:['original',candidate,candidate,'original'],rows:[...new Set(['original',candidate])].map(mode=>{const a=rows.filter(r=>r.mode===mode);return {mode,cpuMedian:pct(a,'cpu',.5),cpuP95:pct(a,'cpu',.95),frameMedian:pct(a,'frame',.5),frameP95:pct(a,'frame',.95),draws:pct(a,'draws',.5),triangles:pct(a,'triangles',.5)};})};
  window.bevelResults=results;$('report').textContent=results.rows.map(r=>`${r.mode}: ${r.triangles} triangles / ${r.draws} draws · CPU median/p95 ${r.cpuMedian.toFixed(2)}/${r.cpuP95.toFixed(2)} ms · frame ${r.frameMedian.toFixed(2)}/${r.frameP95.toFixed(2)} ms`).join('\n')+'\nABBA · isolated section in scene3d · GPU execution and combat integration not measured.';
  }catch(e){$('report').textContent=e.message;}finally{busy=false;controls.forEach(e=>e.disabled=false);assign();}
 };
 assign();camera();scenes.forEach((_,i)=>render(i));camera();
 $('report').textContent=`${data.section} · original 60 → candidate ${data.flat.length/18} triangles · ${data.bevelFaces} bevel faces\nReview only. Neutral finish isolates geometry; production textures, collision, pivots and ship assets are unchanged.`;
 window.bevelStudy={scenes,data,ready:true};
 function tick(time){if(!busy&&!document.hidden){if(orbit){yaw+=Math.min(.1,(time-last)/1000)*.18;camera();}render(0);render(1);}last=time;requestAnimationFrame(tick);}requestAnimationFrame(tick);
})();
