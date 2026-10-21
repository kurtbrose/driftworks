(function(){
  'use strict';
  var M=window.AsteroidDetailModel,DW=window.Driftworks,$=function(id){return document.getElementById(id);};
  var host=$('viewer'),world=DW.sim.createInitialWorld(),asteroid=world.asteroids[0];
  asteroid.id=$('seed').value;asteroid.position={x:0,y:0};asteroid.rotation=0;
  world.asteroids=[asteroid];world.ships=[];world.platforms=[];world.wrecks=[];world.packets=[];world.selectedShipIds=[];world.combat.drones=[];
  world.camera={x:0,y:0,zoom:1};
  var scene=DW.scene3d.create(host,function(){return world;},function(w){world=w;},{study:true});
  var canvas=host.querySelector('canvas'),gl=canvas.getContext('webgl2'),ext=gl&&gl.getExtension('EXT_disjoint_timer_query_webgl2'),pending=[];
  var config,time=0,previous=null,paused=false,recording=false,rows=[],live=[],run=null,lastPose=null,lastUI=0;
  function number(id,min,max){var n=Number($(id).value);n=Number.isFinite(n)?Math.max(min,Math.min(max,n)):min;$(id).value=n;return n;}
  function read(){return {path:$('path').value,height:number('height',1,10000),amplitude:number('amplitude',0,9999),period:number('period',2,120),pitch:Number($('pitch').value)};}
  function cancel(reason){if(recording){recording=false;$('status').textContent=reason;}previous=null;}
  function reset(){cancel('Settings changed; recording cancelled.');config=read();time=0;previous=null;live=[];$('status').textContent='Live preview'+(run?' · previous recording retained for export.':'');}
  config=read();
  ['path','height','amplitude','period','pitch'].forEach(function(id){$(id).onchange=reset;});
  $('apply').onclick=function(){var seed=$('seed').value.trim();if(!seed)return;asteroid.id=seed;reset();scene.sync(world);};
  $('pause').onclick=function(){cancel('Recording cancelled.');paused=!paused;this.textContent=paused?'Resume motion':'Pause motion';};
  $('restart').onclick=function(){reset();$('status').textContent='Path restarted; renderer resources retained.';};
  $('phase').oninput=function(){cancel('Inspecting a fixed camera pose.');paused=true;$('pause').textContent='Resume motion';time=Number(this.value)*config.period;};
  $('record').onclick=function(){reset();paused=false;$('pause').textContent='Pause motion';rows=[];recording=true;run={version:1,renderer:'production procedural baseline',seed:asteroid.id,config:Object.assign({},config),started:new Date().toISOString(),viewport:{width:host.clientWidth,height:host.clientHeight,dpr:devicePixelRatio},gpuTimer:!!ext,warmupCycles:1,measuredCycles:2,lighting:'fixed directional sun',userAgent:navigator.userAgent};$('status').textContent='Warming up · one cycle';};
  function clean(on){cancel('Viewport changed; recording cancelled.');document.body.classList.toggle('clean',on);}
  $('clean').onclick=function(){clean(true);};$('return').onclick=function(){clean(false);};
  document.addEventListener('visibilitychange',function(){cancel('Visibility changed; recording cancelled.');});
  window.addEventListener('resize',function(){cancel('Viewport changed; recording cancelled.');});
  function stats(data,key){return M.summary(data.map(function(r){return r[key];}).filter(function(v){return Number.isFinite(v);}));}
  $('export').onclick=function(){if(!run||!rows.length){$('status').textContent='Record a run before exporting.';return;}var data={metadata:run,complete:run.complete===true,summaries:{frameMs:stats(rows,'frameMs'),cpuMs:stats(rows,'cpuMs'),gpuMs:stats(rows,'gpuMs')},samples:rows};var url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='asteroid-detail-'+run.config.path+'.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);};
  function pose(t){var p=M.sample(config,t,asteroid.radius*DW.sim.METERS_PER_UNIT),f=DW.scene3d.surfaceFrame(asteroid,p.direction),n=f.normal;
    var right=M.normalize(M.cross([0,1,0],n)),forward=M.cross(n,right),look=forward.map(function(v,i){return v*Math.cos(p.pitch)-n[i]*Math.sin(p.pitch);});
    scene.setSurfaceCamera({eye:f.point.map(function(v,i){return v*asteroid.radius+n[i]*p.height/DW.sim.METERS_PER_UNIT;}),right:right,up:M.normalize(M.cross(right,look)),back:look.map(function(v){return -v;})});return p;
  }
  function poll(){if(!ext)return;var disjoint=gl.getParameter(ext.GPU_DISJOINT_EXT);pending=pending.filter(function(p){if(disjoint||gl.getQueryParameter(p.query,gl.QUERY_RESULT_AVAILABLE)){if(!disjoint)p.row.gpuMs=gl.getQueryParameter(p.query,gl.QUERY_RESULT)/1e6;gl.deleteQuery(p.query);return false;}return true;});}
  function paint(){var data=run&&rows.length?rows:live,ctx=$('trace').getContext('2d'),w=$('trace').width=$('trace').clientWidth,h=$('trace').height=100,tail=data.slice(-400),ceiling=Math.max(40,...tail.map(function(r){return r.frameMs||0;}));ctx.clearRect(0,0,w,h);ctx.strokeStyle='#b95656';ctx.beginPath();ctx.moveTo(0,h-16.667/ceiling*h);ctx.lineTo(w,h-16.667/ceiling*h);ctx.stroke();['frameMs','cpuMs','gpuMs'].forEach(function(key,k){ctx.strokeStyle=['#80ddd6','#efb866','#bd9af5'][k];ctx.beginPath();tail.forEach(function(r,i){if(!Number.isFinite(r[key]))return;var x=i/Math.max(1,tail.length-1)*w,y=h-r[key]/ceiling*h;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();});tail.forEach(function(r,i){if(r.crossings.length){ctx.fillStyle='#fff';ctx.fillRect(i/Math.max(1,tail.length-1)*w,0,3,5);}});
    function line(key){var s=stats(data,key);return key+': '+(s?'median '+s.median.toFixed(1)+' · p95 '+s.p95.toFixed(1)+' · p99 '+s.p99.toFixed(1)+' · max '+s.max.toFixed(1)+' ms':'unavailable');}
    $('stats').textContent=[(run&&rows.length?'Recorded '+run.config.path:'Live preview')+' | '+line('frameMs'),line('cpuMs'),line('gpuMs')+' | '+(lastPose?lastPose.height.toFixed(1)+' m':'')+' | '+canvas.width+'×'+canvas.height+' px | '+(ext?'async GPU timer':'GPU timing unsupported')].join('\n');$('phase').value=(time/config.period)%1;$('phase-label').textContent=Math.round(Number($('phase').value)*100)+'%';
  }
  function frame(now){requestAnimationFrame(frame);if(document.hidden){previous=null;return;}poll();var dt=previous===null?0:(now-previous)/1000;previous=now;if(!paused)time+=dt;
    if(recording&&time>=config.period*3){recording=false;run.complete=true;paused=true;$('pause').textContent='Resume motion';$('status').textContent='Complete · two measured cycles. Export available.';}
    var start=performance.now(),p=pose(time),crossings=[4,16,64,256].filter(function(h){return lastPose&&(lastPose.height-h)*(p.height-h)<0;});lastPose=p;scene.sync(world);
    var row={time:time,phase:p.phase,altitudeM:p.height,frameMs:dt*1000,cpuMs:0,gpuMs:null,crossings:crossings};
    var q=null;if(ext&&pending.length<8){q=gl.createQuery();gl.beginQuery(ext.TIME_ELAPSED_EXT,q);}scene.render(world,1,0,0);if(q){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push({query:q,row:row});}row.cpuMs=performance.now()-start;var s=scene.getRenderStats();row.triangles=s.triangles;row.drawCalls=s.drawCalls;
    if(dt>0){live.push(row);if(live.length>600)live.shift();if(recording&&time>=config.period){rows.push(row);$('status').textContent='Recording · cycle '+Math.min(2,Math.floor(time/config.period))+' / 2';}}
    if(now-lastUI>250){paint();lastUI=now;}
  }
  requestAnimationFrame(frame);
})();
