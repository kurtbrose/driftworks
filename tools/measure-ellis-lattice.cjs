'use strict';

// Compare the sky grid's shell-intersection phases with direct quadrature.
// This measures lookup/inversion errors, not final rasterized line continuity.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const DW={sim:{METERS_PER_UNIT:60}},context={window:{Driftworks:DW}};
for(const file of ['ellis-optics','ellis-study'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiments',file+'.js'),'utf8'),context);
const optics=DW.ellisOptics,dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),unit=v=>v.map(x=>x/Math.hypot(...v));
const uAt=(b,r)=>{const root=Math.sqrt(Math.max(.0000001,Math.abs(1-b*b))),l=Math.sqrt(Math.max(0,r*r-1));return b<1?Math.asinh(l/root):Math.acosh(Math.max(1,l/root));};
function frameContinuity(study){return [6.7,18.7].map(time=>{
  const a=study.camera('dogfight-crossing',time-1e-6),b=study.camera('dogfight-crossing',time+1e-6);
  const n=unit(a.eye.map((v,i)=>v*60-[(a.region||0)*12000,-2000,1550][i]));
  return {time,axisErrorDegrees:Object.fromEntries(['right','up','back'].map(axis=>{
    const transported=a[axis].map((v,i)=>2*n[i]*dot(a[axis],n)-v);
    return [axis,Math.acos(Math.max(-1,Math.min(1,dot(transported,b[axis]))))*180/Math.PI];
  }))};
});}
const report={reference:'Direct midpoint quadrature of the compact metric, 2048/4096 steps, compared with the production packed lookup. CPU transcription of the lattice shader, not GPU raster verification.',verticalFovDegrees:45,aspect:16/9,screenRayGrid:[13,13],cameraFrameContinuity:frameContinuity(DW.ellisStudy),cases:[]};
// Explicit critical probes remain useful when a screen grid misses the narrow
// band where |1-b| is smaller than the texture's last supported interval.
report.criticalProbes=[];
for(const exponent of [10,12,13,15])for(const sign of [-1,1]){
  const b=1+sign*Math.exp(-exponent),start=uAt(b,1.0015),end=uAt(b,2);
  const phase=optics.lookup(b,end)-optics.lookup(b,start);
  const reference=optics.integral(b,end,4096)-optics.integral(b,start,4096);
  report.criticalProbes.push({impact:b,insideTableDomain:exponent<=12,phase,referencePhase:reference,phaseErrorRadians:Math.abs(phase-reference),fullyPhaseSuppressed:Math.abs(phase)>=Math.PI});
}
const baselineCamera=process.argv.indexOf('--baseline-camera');
if(baselineCamera>=0){
  if(!process.argv[baselineCamera+1])throw new Error('--baseline-camera requires a git ref');
  const ref=process.argv[baselineCamera+1],oldDW={sim:{METERS_PER_UNIT:60},ellisOptics:DW.ellisOptics};
  const source=require('node:child_process').execFileSync('git',['show',ref+':experiments/ellis-study.js'],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
  vm.runInNewContext(source,{window:{Driftworks:oldDW}});
  report.baselineCamera={ref,frameContinuity:frameContinuity(oldDW.ellisStudy)};
}
for(const [camera,time] of [['front',0],['rim',0],...['dogfight','dogfight-crossing'].flatMap(name=>[0,3,5.9,6,6.35,6.7,9,12,18.35].map(t=>[name,t]))]){
  const view=DW.ellisStudy.camera(camera,time),eye=view.eye.map(x=>x*60),side=view.region||0;
  const offset=eye.map((x,i)=>(x-[side*12000,-2000,1550][i])/300),R=Math.hypot(...offset),errors=[];
  let largestQuadratureChange=0,worst=null,retained=0,suppressed=0;
  for(let y=0;y<13;y++)for(let x=0;x<13;x++){
    const sx=(x/12*2-1)*(16/9)*Math.tan(Math.PI/8),sy=(y/12*2-1)*Math.tan(Math.PI/8);
    const ray=unit(view.back.map((v,i)=>-v+sx*view.right[i]+sy*view.up[i]));
    const along=dot(offset,ray),impact2=Math.max(0,R*R-along*along),inside=R*R<4;
    if(!inside&&!(along<0&&impact2<4))continue;
    const entry=inside?0:Math.max(0,-along-Math.sqrt(Math.max(0,4-impact2))),p=offset.map((v,i)=>v+ray[i]*entry);
    const radial=unit(p),r=Math.max(1.000001,Math.hypot(...p)),cosine=dot(ray,radial),b=Math.min(1.999999,r*Math.sqrt(Math.max(0,1-cosine*cosine))),u0=uAt(b,r);
    const table0=optics.lookup(b,u0),exact0=optics.integral(b,u0,4096),coarse0=optics.integral(b,u0,2048);
    for(let shell=0;shell<3;shell++){
      const radius=1.0001+shell*.49995;if(b>radius)continue;
      const u=uAt(b,radius),table=optics.lookup(b,u),exact=optics.integral(b,u,4096),coarse=optics.integral(b,u,2048);
      for(let leg=0;leg<2;leg++){
        if(cosine<0?leg===0&&u>u0:leg!==0||u<u0)continue;
        const sign=cosine<0&&leg===1?1:-1;
        const phase=cosine<0?table0+sign*table:table-table0;
        const reference=cosine<0?exact0+sign*exact:exact-exact0;
        const low=cosine<0?coarse0+sign*coarse:coarse-coarse0;
        if(Math.abs(phase)>=Math.PI){suppressed++;continue;}
        retained++;
        const error=Math.abs(phase-reference);errors.push(error);
        largestQuadratureChange=Math.max(largestQuadratureChange,Math.abs(reference-low));
        if(!worst||error>worst.phaseErrorRadians)worst={ray:[x,y],shellRadiusMeters:radius*300,leg,impact:b,phase,referencePhase:reference,phaseErrorRadians:error};
      }
    }
  }
  errors.sort((a,b)=>a-b);
  report.cases.push({camera,time,observerChartRadiusMeters:R*300,observerProperRadiusMeters:Math.sqrt(Math.max(0,R*R-1))*300,retainedIntersections:retained,phaseSuppressedIntersections:suppressed,p95PhaseErrorRadians:errors[Math.floor(errors.length*.95)],maxPhaseErrorRadians:errors.at(-1),maxQuadratureRefinementChangeRadians:largestQuadratureChange,worst});
}
const json=JSON.stringify(report,null,2)+'\n',out=process.argv.indexOf('--out');
if(out>=0){if(!process.argv[out+1])throw new Error('--out requires a path');fs.writeFileSync(process.argv[out+1],json);}
process.stdout.write(json);
