'use strict';

const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),DW={sim:{METERS_PER_UNIT:60}},context={window:{Driftworks:DW}};
for(const file of ['ellis-optics','ellis-study'])vm.runInNewContext(fs.readFileSync(path.join(root,'experiments',file+'.js'),'utf8'),context);
const focal=1/Math.tan(Math.PI/8),scale=1080*focal/2;
function measure(){
  const cases=[];
  for(const observerL of [120,10,1,.1,0]){
    const samples=[];
    for(const distance of [120,30,10,3,1,.3,.1]){
      // Fixed angular footprint avoids confusing a vanishing target with convergence.
      const frame=DW.ellisStudy.yoYoAt(distance,observerL,distance*.05);
      let missing=0,maxError=0,maxLengthError=0;
      frame.points.slice(0,4).forEach((p,i)=>{
        const hit=DW.ellisOptics.primary(frame.view.eye.map(x=>x*60),p.point,0,p.region);
        if(!hit||hit.direction[1]<=0){missing++;return;}
        maxError=Math.max(maxError,Math.hypot(hit.direction[0]/hit.direction[1]-frame.expected[i][0],hit.direction[2]/hit.direction[1]-frame.expected[i][1])*scale);
      });
      const center=frame.points[4],hit=DW.ellisOptics.primary(frame.view.eye.map(x=>x*60),center.point,0,center.region);
      if(!hit)missing++;else maxLengthError=Math.abs(hit.length-distance);
      samples.push({distance,halfSize:frame.halfSize,missing,maxErrorPixels:maxError,centerLengthErrorMeters:maxLengthError});
    }
    // An engineering acceptance threshold at a specified finite scale, not a
    // mathematical proof of the limit. Far samples need not look Euclidean.
    const close=samples.filter(s=>s.distance<=1);
    cases.push({observerProperRadiusMeters:observerL,samples,localFlatnessPass:close.every(s=>!s.missing&&s.maxErrorPixels<.05&&s.centerLengthErrorMeters<.005)});
  }
  return {viewport:[1920,1080],reference:'Independent intrinsic source-plane RK4 placement, with radial parallel-transported tangent axes. Ordinary perspective is the limiting reference; finite-distance curvature is allowed.',criteria:'At distances <=1 m: zero missing solutions, corner error <0.05 px, radial center distance error <0.005 m.',cases};
}
if(require.main===module){
  const result=measure(),json=JSON.stringify(result,null,2)+'\n',out=process.argv.indexOf('--out');
  if(out>=0){if(!process.argv[out+1])throw new Error('--out requires a path');fs.writeFileSync(process.argv[out+1],json);}
  process.stdout.write(json);
  if(process.argv.includes('--assert-local-flatness')&&result.cases.some(c=>!c.localFlatnessPass))process.exitCode=1;
}
module.exports={measure};
