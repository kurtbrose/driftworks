// Frozen real-scene capital A/B, using the observation lab presentation.
const fs=require('node:fs');
let html=fs.readFileSync('experiments/ellis-study.html','utf8').replace(/src="(?![./])([^"]+)"/g,'src="../experiments/$1"');
let source=fs.readFileSync('experiments/ellis-study.js','utf8');
source=source.replace('    var presentation=',`    var submitted={draws:0,triangles:0},Renderer=THREE.WebGLRenderer;
    THREE.WebGLRenderer=function(options){var r=new Renderer(options),render=r.render;r.render=function(){var result=render.apply(r,arguments);submitted.draws+=r.info.render.calls;submitted.triangles+=r.info.render.triangles;return result;};return r;};THREE.WebGLRenderer.prototype=Renderer.prototype;
    var presentation=`);
const probe=String.raw`
    var bench=document.createElement('button'),report=document.createElement('pre');bench.textContent='Benchmark capital';report.id='capital-benchmark';report.style.cssText='position:fixed;z-index:10;right:18px;top:145px;background:#07151d;white-space:pre-wrap;max-width:520px';document.querySelector('.panel').appendChild(bench);document.body.appendChild(report);
    var measuring=false;
    bench.onclick=async function(){
        if(!capital||document.hidden)return;playing=false;measuring=true;bench.disabled=true;var rows=[];
        try{
            for(var enabled of [false,true,true,false]){
                var previous=0;
                for(var i=0;i<80;i++){
                    var stamp=await new Promise(function(resolve){requestAnimationFrame(resolve);});
                    if(document.hidden)throw Error('Hidden tab invalidates measurement');
                    var begin=performance.now();capital.geometry();var prep=performance.now()-begin;
                    presentation.setCapital(enabled?capital:null);submitted.draws=0;submitted.triangles=0;begin=performance.now();
                    var view=camera(cameraName,time);presentation.pose(view);presentation.render(Object.assign({},snapshot,{camera:view}),presentation.appearance(),{mode:'normal',scale:1,flat:false,mothership:false,actors:true},0);
                    var cpu=performance.now()-begin,stats=presentation.renderStats();
                    if(i>=20)rows.push({on:enabled,cpu:cpu,frame:stamp-previous,prep:prep,draws:submitted.draws+stats.sky.drawCalls,triangles:submitted.triangles+stats.sky.triangles});previous=stamp;
                    report.textContent='Measuring '+rows.length+' / 240';
                }
            }
            var lines=['Frozen '+cameraName+' camera / t='+time+' / capital crossing','ABBA: 20 warmup + 60 samples per block','bridgeShips='+(params.get('bridgeShips')||'readable')];
            [false,true].forEach(function(on){var r=rows.filter(function(x){return x.on===on;});function p(k,f){var a=r.map(function(x){return x[k];}).sort(function(a,b){return a-b;});return a[Math.floor((a.length-1)*f)].toFixed(2);}function mean(k){return (r.reduce(function(n,x){return n+x[k];},0)/r.length).toFixed(0);}lines.push((on?'ON':'OFF')+' CPU '+p('cpu',.5)+' / '+p('cpu',.95)+' ms; frame '+p('frame',.5)+' / '+p('frame',.95)+' ms; prep '+p('prep',.5)+' / '+p('prep',.95)+' ms; '+mean('draws')+' draws / '+mean('triangles')+' tris');});
            lines.push('median / p95; CPU submission and rAF cadence, no GPU timer.');
            lines.push(Array.from(document.querySelectorAll('canvas')).map(function(c){return c.width+'x'+c.height;}).join(', ')+'; DPR '+devicePixelRatio);report.textContent=lines.join('\n');
        }catch(e){report.textContent=String(e);}finally{measuring=false;bench.disabled=false;presentation.setCapital(capital);}
    };
`;
source=source.replace('    cameraUI();playback();draw();requestAnimationFrame(tick);',probe+'    cameraUI();playback();draw();requestAnimationFrame(tick);').replace('if(!document.hidden&&now-lastDraw', 'if(!measuring&&!document.hidden&&now-lastDraw');
html=html.replace(/<script src="\.\.\/experiments\/ellis-study.js[^>]*><\/script>/,'<script>'+source+'</script>');
fs.writeFileSync('output/ellis-capital-benchmark.html',html);
