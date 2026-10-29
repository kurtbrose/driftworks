const fs=require('node:fs');
// Browser comparison uses the previous exhaustive search as a local control.
const current=fs.readFileSync('experiments/guns.js','utf8');
const optics=fs.readFileSync('experiments/ellis-optics.js','utf8');
const original=current.replace(/        \/\/ Most combat targets[\s\S]*?(?=        var times=Array.from)/,'');
// The control keeps the shared physical validation helper, but skips fast iteration.
const helper=current.slice(current.indexOf('        /** @param {ReturnType<typeof sample>}'),current.indexOf('        if(Math.hypot.apply(null,target.velocity)/units<speed*.45)'));
const control=original.replace('        var times=Array.from',helper+'        var times=Array.from');
const html='<!doctype html><meta charset="utf-8"><title>Ellis aiming performance</title><style>body{background:#09141c;color:#cee5ed;font:16px monospace;padding:24px}pre{white-space:pre-wrap}</style><h1>Ellis aiming / matched comparison</h1><button id="measure">Measure aiming</button><pre id="result">Identical inputs and physical endpoint validation. No temporal cache.</pre><script>window.Driftworks={sim:{METERS_PER_UNIT:10000/600}};</script><script>'+optics+'</script><script>'+control+'</script><script>const exhaustive=Driftworks.flightGuns.lead;</script><script>'+current+'</script><script>'+String.raw`
const fast=Driftworks.flightGuns.lead,U=Driftworks.sim.METERS_PER_UNIT;
const shooter={eye:[0,-2350/U,1550/U],region:0},target={eye:[12020/U,-1660/U,1550/U],region:1,velocity:[25,40,0]},weapon={speed:450,lifetime:4};
document.querySelector('#measure').onclick=()=>{
 const n=2000,rows=[];let worstAngle=0,worstTime=0;
 for(let i=0;i<300;i++){target.eye[0]=(12000+20*Math.sin(i*.17))/U;target.velocity=[25*Math.cos(i*.11),40*Math.sin(i*.13),0];const a=exhaustive(shooter,target,weapon,true),b=fast(shooter,target,weapon,true);if(!a||!b)throw Error('Missing solution');worstTime=Math.max(worstTime,Math.abs(a.time-b.time));worstAngle=Math.max(worstAngle,Math.hypot(...a.direction.map((v,k)=>v-b.direction[k])));}
 target.eye=[12020/U,-1660/U,1550/U];target.velocity=[25,40,0];
 for(const solve of [exhaustive,fast,fast,exhaustive]){for(let j=0;j<100;j++)solve(shooter,target,weapon,true);const start=performance.now();for(let j=0;j<n;j++)solve(shooter,target,weapon,true);rows.push((performance.now()-start)/n);}
 const before=(rows[0]+rows[3])/2,after=(rows[1]+rows[2])/2;
 document.querySelector('#result').textContent=JSON.stringify({callsPerBlock:n,order:'exhaustive / fast / fast / exhaustive',beforeMs:before,afterMs:after,speedup:before/after,matchedMovingCases:300,maximumDirectionDifference:worstAngle,maximumFlightTimeDifferenceSeconds:worstTime},null,2);
};`+'</script>';
fs.writeFileSync('studies/ellis-aim-performance.html',html);
