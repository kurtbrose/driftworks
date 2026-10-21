(function(root){
  'use strict';
  function normalize(v){var l=Math.hypot.apply(null,v);return v.map(function(x){return x/l;});}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function sample(c,t,radiusM){
    var phase=((t/c.period)%1+1)%1, wave=(1-Math.cos(phase*Math.PI*2))/2;
    var height=c.path==='approach'?Math.exp(Math.log(2)+(Math.log(radiusM*3)-Math.log(2))*wave):c.path==='bounce'?Math.max(.5,c.height-c.amplitude*Math.cos(phase*Math.PI*2)):c.height;
    var angle=c.path==='fly'?Math.sin(phase*Math.PI*2)*.16:0;
    var base=normalize([-.65,-.45,.6]),side=normalize(cross([0,1,0],base));
    return {phase:phase,height:height,direction:normalize(base.map(function(x,i){return x*Math.cos(angle)+side[i]*Math.sin(angle);})),pitch:(c.path==='approach'?90:c.pitch)*Math.PI/180};
  }
  function summary(values){if(!values.length)return null;var a=values.slice().sort(function(x,y){return x-y;});return {count:a.length,median:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],p99:a[Math.ceil(a.length*.99)-1],max:a[a.length-1]};}
  var api={sample:sample,summary:summary,normalize:normalize,cross:cross};
  if(typeof module!=='undefined')module.exports=api;else root.AsteroidDetailModel=api;
})(typeof window!=='undefined'?window:globalThis);
