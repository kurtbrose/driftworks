const fs=require('node:fs');
// Exact same frozen real scene and projectile geometry, alternating batch policy.
let html=fs.readFileSync('output/ellis-aim-study.html','utf8');
let presentation=fs.readFileSync('experiments/flight-presentation.js','utf8').replace("if(regions.length>1&&typeof location!=='undefined'&&new URLSearchParams(location.search).get('bridgeGeometry')==='objects'){", "if(effectComparisonIndividual||(regions.length>1&&typeof location!=='undefined'&&new URLSearchParams(location.search).get('bridgeGeometry')==='objects')){");
html=html.replace(/<script src="\.\.\/experiments\/flight-presentation.js[^>]*><\/script>/,'<script>let effectComparisonIndividual=false,effectComparisonMeasuring=false;</script><script>'+presentation+'</script>');
html=html.replace('snapshot.combat.hangarSupport=true;',`snapshot.combat.hangarSupport=true;
 snapshot.guns.bolts=Array.from({length:160},(_,i)=>({position:[(Math.sin(i*1.7)*85)/U,(-2310-i*.35)/U,(1550+Math.cos(i*2.3)*65)/U],direction:[0,1,0],region:0,age:0,weapon:config.weapon,team:['ally','enemy','player'][i%3]}));`);
html=html.replace('if(!document.hidden)draw();requestAnimationFrame(frame);','if(!document.hidden&&!effectComparisonMeasuring)draw();requestAnimationFrame(frame);');
html=html.replace(' reset();requestAnimationFrame(frame);',String.raw`
 const measure=document.createElement('button');measure.textContent='Compare effect batching';panel.appendChild(measure);
 measure.onclick=async()=>{running=false;effectComparisonMeasuring=true;measure.disabled=true;const rows=[];
 try{for(const individual of [true,false,false,true]){effectComparisonIndividual=individual;let previous=0;for(let i=0;i<80;i++){const stamp=await new Promise(requestAnimationFrame);if(document.hidden)throw Error('Hidden tab');const start=performance.now();draw();const cpu=performance.now()-start;if(i>=20)rows.push({individual,cpu,frame:stamp-previous,draws:presentation.renderStats().scene.drawCalls});previous=stamp;}}
 const result={bolts:snapshot.guns.bolts.length,order:'individual / batched / batched / individual',viewport:[innerWidth,innerHeight],dpr:devicePixelRatio};
 for(const individual of [true,false]){const list=rows.filter(r=>r.individual===individual),q=(key,p)=>{const a=list.map(r=>r[key]).sort((a,b)=>a-b);return a[Math.floor((a.length-1)*p)];};result[individual?'before':'after']={cpuMedian:q('cpu',.5),cpuP95:q('cpu',.95),frameMedian:q('frame',.5),frameP95:q('frame',.95),draws:q('draws',.5)};}
 document.getElementById('aim-result').textContent=JSON.stringify(result,null,2);
 }catch(error){document.getElementById('aim-result').textContent=String(error);}finally{effectComparisonIndividual=false;measure.disabled=false;}}
 reset();requestAnimationFrame(frame);`);
fs.writeFileSync('output/ellis-effects-performance.html',html);
