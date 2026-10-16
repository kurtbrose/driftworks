(function(){
  'use strict';
  function pacer(){return {next:null};}
  function due(clock,now,fps){
    if(!fps){clock.next=null;return true;}
    var interval=1000/fps;if(clock.next===null)clock.next=now;
    if(now+.35<clock.next)return false;
    if(now-clock.next>interval)clock.next=now;
    clock.next+=interval;return true;
  }
  function create(){return {frames:[],cpu:[],worst:0};}
  function record(stats,interval,cpu){if(interval>0){stats.frames.push(interval);if(stats.frames.length>120)stats.frames.shift();stats.worst=Math.max(stats.worst,interval);}stats.cpu.push(cpu);if(stats.cpu.length>120)stats.cpu.shift();}
  function summary(stats){
    function average(a){return a.length?a.reduce(function(sum,x){return sum+x;},0)/a.length:0;}
    var sorted=stats.frames.slice().sort(function(a,b){return a-b;}),frame=average(sorted);
    return {fps:frame?1000/frame:0,frame:frame,p95:sorted.length?sorted[Math.floor((sorted.length-1)*.95)]:0,worst:stats.worst,cpu:average(stats.cpu)};
  }
  window.Driftworks.flightPerformance={pacer:pacer,due:due,create:create,record:record,summary:summary};
}());
