const fs=require('node:fs');
let html=fs.readFileSync('studies/ellis-aim-study.html','utf8').replace('function run(){','function run(){\n let measuring=false;');
html=html.replace('if(!document.hidden)draw();requestAnimationFrame(frame);','if(!document.hidden&&!measuring)draw();requestAnimationFrame(frame);');
html=html.replace(' reset();requestAnimationFrame(frame);',String.raw`
 const bench=document.createElement('button');bench.textContent='Measure 160 curved bolts';panel.appendChild(bench);
 bench.onclick=async()=>{running=false;measuring=true;bench.disabled=true;const rows=[];
 try{reset();snapshot.guns.bolts=Array.from({length:160},(_,i)=>{
 const d=normalize([Math.sin(i*1.7)*.25,1,Math.cos(i*2.3)*.18]),ray=D.ellisOptics.ray(snapshot.state.eye.map(v=>v*U),d,0);D.ellisOptics.advanceRay(ray,100+(i%20)*15);
 return {position:ray.eye.map(v=>v/U),direction:ray.direction,region:ray.region,opticalRay:ray,age:0,weapon:config.weapon,team:['ally','enemy','player'][i%3]};});
 let previous=0;
 for(let i=0;i<100;i++){const stamp=await new Promise(requestAnimationFrame);if(document.hidden)throw Error('Hidden tab');let start=performance.now();D.flightGuns.step(snapshot.guns,snapshot.state,config.weapon,false,1/120,()=>null,undefined,undefined,undefined,true);const physics=performance.now()-start;start=performance.now();draw();const cpu=performance.now()-start;if(i>=20)rows.push({physics,cpu,frame:stamp-previous,draws:presentation.renderStats().scene.drawCalls});previous=stamp;}
 const q=(k,p)=>{const a=rows.map(r=>r[k]).sort((a,b)=>a-b);return a[Math.floor((a.length-1)*p)];};
 document.getElementById('aim-result').textContent=JSON.stringify({bolts:snapshot.guns.bolts.length,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,physicsMs:{median:q('physics',.5),p95:q('physics',.95)},renderAndHudMs:{median:q('cpu',.5),p95:q('cpu',.95)},frameMs:{median:q('frame',.5),p95:q('frame',.95)},draws:q('draws',.5)},null,2);
 }catch(error){document.getElementById('aim-result').textContent=String(error);}finally{bench.disabled=false;}}
 reset();requestAnimationFrame(frame);`);
fs.writeFileSync('studies/ellis-curved-performance.html',html);
