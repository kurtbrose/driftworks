'use strict';

// Offline CPU approximation measurement. This does not benchmark GPU rendering
// or independently validate the shared primary optical solver.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadRuntime}=require('./headless.cjs');
const root=path.resolve(__dirname,'..'),DW=loadRuntime(),units=DW.sim.METERS_PER_UNIT;
vm.runInNewContext(fs.readFileSync(path.join(root,'experiments/ellis-study.js'),'utf8'),{window:{Driftworks:DW}});
const found=DW.shipPackModels.find('quaternius-ultimate-spaceships:Bob');
if(!found)throw new Error('Missing benchmark fighter');
const model=found.model;
const points=[],mesh=model.vertices,stride=Math.ceil(mesh.length/18/64);
for(let tri=0;tri<mesh.length/18;tri+=stride){
  const vertices=[0,1,2].map(j=>mesh.slice(tri*18+j*6,tri*18+j*6+3));
  points.push(...vertices,vertices[0].map((_,i)=>(vertices[0][i]+vertices[1][i]+vertices[2][i])/3));
}
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0),focal=1/Math.tan(Math.PI/8),height=1080,width=1920;
const report={model:model.id,viewport:[width,height],sampleIntervalSeconds:.25,samplesPerFrame:points.length,
  sampling:'Vertices and centroids of up to 64 evenly spaced source triangles; unweighted samples, not a surface-wide bound.',
  reference:'Same primary solver, evaluated at each posed mesh sample; CPU projection only, no rasterization or clipping validation.',cases:[]};
for(const name of ['dogfight','dogfight-crossing']){
  const errors=[];let missing=0,offscreen=0,solves=0,maxTemporal=0,previous=null,worst=null;
  const start=performance.now();
  for(let frame=0;frame<96;frame++){
    const time=frame*.25,view=DW.ellisStudy.camera(name,time),source=DW.ellisStudy.sample(time,name)[0].pose;
    const eye=view.eye.map(x=>x*units),center=source.eye.map(x=>x*units);
    function project(point){
      solves++;const h=DW.ellisOptics.primary(eye,point,view.region,source.region);
      if(!h)return null;
      return [dot(h.direction,view.right)*h.length,dot(h.direction,view.up)*h.length,-dot(h.direction,view.back)*h.length];
    }
    const base=project(center),columns=[0,1,2].map(axis=>{
      const offset=center.slice();offset[axis]+=4;const q=project(offset);
      return q&&base?q.map((x,i)=>(x-base[i])/4):null;
    });
    const residuals=[];
    for(let index=0;index<points.length;index++){
      const local=points[index],delta=[0,1,2].map(i=>source.right[i]*local[0]-source.back[i]*local[1]+source.up[i]*local[2]);
      const actual=project(center.map((x,i)=>x+delta[i]));
      const predicted=base&&columns.every(Boolean)&&!columns.some(c=>c.some(v=>!Number.isFinite(v)||Math.abs(v)>30))?
        base.map((x,i)=>x+columns.reduce((sum,c,j)=>sum+c[i]*delta[j],0)):null;
      if(!actual||actual[2]<=0||!predicted||predicted[2]<=0){missing++;residuals.push(null);continue;}
      const scale=focal*height/2,a=[actual[0]/actual[2]*scale,actual[1]/actual[2]*scale];
      if(Math.abs(a[0])>width/2||Math.abs(a[1])>height/2)offscreen++;
      const residual=[predicted[0]/predicted[2]*scale-a[0],predicted[1]/predicted[2]*scale-a[1]],error=Math.hypot(...residual);
      errors.push(error);residuals.push(residual);
      if(!worst||error>worst.errorPixels)worst={time,sample:index,errorPixels:error};
      if(previous&&previous[index])maxTemporal=Math.max(maxTemporal,Math.hypot(...residual.map((v,j)=>v-previous[index][j])));
    }
    previous=residuals;
  }
  errors.sort((a,b)=>a-b);
  report.cases.push({name,frames:96,validSamples:errors.length,missingOrInvalidSamples:missing,offscreenReferenceSamples:offscreen,
    medianPixels:errors[Math.floor(errors.length*.5)],p95Pixels:errors[Math.floor(errors.length*.95)],maxPixels:errors.at(-1),
    maxResidualChangePerSampleIntervalPixels:maxTemporal,worst,measurementPathSolves:solves,measurementCpuMs:performance.now()-start});
}
const baselineArg=process.argv.indexOf('--baseline');
if(baselineArg>=0){
  if(!process.argv[baselineArg+1])throw new Error('--baseline requires a path');
  const baseline=JSON.parse(fs.readFileSync(process.argv[baselineArg+1],'utf8'));
  for(const key of ['model','viewport','sampleIntervalSeconds','samplesPerFrame','sampling','reference']){
    if(JSON.stringify(report[key])!==JSON.stringify(baseline[key]))throw new Error('Incompatible baseline: '+key);
  }
  const regressions=[];
  for(const result of report.cases){
    const before=baseline.cases.find(c=>c.name===result.name);
    if(!before||before.frames!==result.frames)throw new Error('Incompatible baseline case: '+result.name);
    for(const key of ['medianPixels','p95Pixels','maxPixels','maxResidualChangePerSampleIntervalPixels']){
      if(!Number.isFinite(result[key])||result[key]>before[key]+Math.max(.05,before[key]*.01))regressions.push({case:result.name,metric:key,before:before[key],after:result[key]});
    }
    for(const key of ['missingOrInvalidSamples','offscreenReferenceSamples']){
      if(result[key]>before[key])regressions.push({case:result.name,metric:key,before:before[key],after:result[key]});
    }
  }
  report.comparison={policy:'No increase in missing/offscreen samples; error tolerance max(0.05 px, 1% of baseline). CPU timing excluded. Baseline is a regression reference, not visual acceptance.',regressions};
  if(regressions.length)process.exitCode=1;
}
const json=JSON.stringify(report,null,2)+'\n',out=process.argv.indexOf('--out');
if(out>=0){if(!process.argv[out+1])throw new Error('--out requires a path');fs.writeFileSync(process.argv[out+1],json);}
process.stdout.write(json);
