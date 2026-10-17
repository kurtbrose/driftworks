(function(){
  'use strict';
  var DW=window.Driftworks;
  function mount(environment){
    environment=environment||globalThis;
    var document=environment.document,clock=environment.performance;
    var performanceTools=DW.flightPerformance,pace=performanceTools.pacer(),measurements=performanceTools.create(),lastStatsUpdate=0,previous=0;
    function settings(){return {mode:document.getElementById('render-mode').value,flat:document.getElementById('flat-materials').checked,scale:Number(document.getElementById('render-scale').value),mothership:document.getElementById('draw-mothership').checked,actors:document.getElementById('draw-enemies').checked};}
    function resetMeasurements(){measurements=performanceTools.create();pace.next=null;previous=0;lastStatsUpdate=0;}
    ['render-mode','flat-materials','render-scale','fps-cap','draw-mothership','draw-enemies'].forEach(function(id){document.getElementById(id).addEventListener('change',resetMeasurements);});
    document.getElementById('perf-reset').onclick=resetMeasurements;
    function beginFrame(t,paused){
      var cap=Number(document.getElementById('fps-cap').value),limit=paused?Math.min(cap||60,15):cap;
      if(!performanceTools.due(pace,t,limit))return null;
      var started=clock.now();
      var actualElapsed=previous?(t-previous)/1000:0,elapsed=Math.min(.1,actualElapsed);previous=t;
      return {t:t,cap:cap,started:started,actualElapsed:actualElapsed,elapsed:elapsed};
    }
    function endFrame(frame,paused,comparison,readStats){
      performanceTools.record(measurements,frame.actualElapsed*1000,clock.now()-frame.started);
      var perfElement=document.getElementById('perf-overlay');perfElement.hidden=!document.getElementById('perf-enabled').checked;
      if(frame.t-lastStatsUpdate>250){
        lastStatsUpdate=frame.t;var summary=performanceTools.summary(measurements),stats=readStats(),render=stats.scene,skyStats=stats.sky;
        perfElement.textContent=(paused?'PAUSED / 15 FPS CAP':'FLIGHT / '+(frame.cap?frame.cap+' FPS CAP':'UNCAPPED'))+' · '+comparison.mode+(comparison.flat?' / flat':'')+
          '\n'+summary.fps.toFixed(1)+' FPS · '+summary.frame.toFixed(1)+' ms/frame'+
          '\np95 '+summary.p95.toFixed(1)+' ms · worst '+summary.worst.toFixed(1)+' ms'+
          '\nCPU '+summary.cpu.toFixed(2)+' ms · scene submit '+render.cpuMs.toFixed(2)+' ms'+
          '\nDraw calls '+(render.drawCalls+skyStats.drawCalls)+' · triangles '+Math.round(render.triangles+skyStats.triangles).toLocaleString()+
          '\nMeshes '+(render.meshes+skyStats.meshes)+' · material variants '+(render.materials+skyStats.materials)+
          '\n'+render.width+' × '+render.height+' · pixel ratio '+render.pixelRatio.toFixed(2)+
          '\nSky points '+skyStats.points+' · shadow passes 0'+
          '\nCPU timing only; GPU time not measured';
      }
    }
    function toggleDiagnostics(){var show=document.body.classList.toggle('diagnostics');document.getElementById('perf-enabled').checked=show;}
    function togglePerformance(){var toggle=document.getElementById('perf-enabled');toggle.checked=!toggle.checked;}
    return {beginFrame:beginFrame,endFrame:endFrame,settings:settings,reset:resetMeasurements,toggleDiagnostics:toggleDiagnostics,togglePerformance:togglePerformance};
  }
  DW.flightDiagnostics={mount:mount};
}());
