/** Local tubular structure inferred from curved surface geometry, never asset IDs.
 * @typedef {{axis:number[],center:number[],radius:number,lo:number,hi:number,area:number}} TubePatch */
/** @param {number[]} a @param {number[]} b */
const sectionDot=(a,b)=>a.slice(0,3).reduce((s,x,k)=>s+x*b[k],0);
/** @param {number[]} a @param {number[]} b */
const sectionCross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
/** @param {number[]} a */
const sectionUnit=a=>{const l=Math.hypot(...a)||1;return a.map(x=>x/l);};
/** @param {number[][]} matrix */
function sectionEigen(matrix){const m=matrix.map(row=>row.slice()),v=[[1,0,0],[0,1,0],[0,0,1]];for(let i=0;i<24;i++){let a=0,b=1;for(const [j,k] of [[0,2],[1,2]])if(Math.abs(m[j][k])>Math.abs(m[a][b])){a=j;b=k;}if(Math.abs(m[a][b])<1e-10)break;const t=.5*Math.atan2(2*m[a][b],m[b][b]-m[a][a]),c=Math.cos(t),s=Math.sin(t);for(let k=0;k<3;k++){const x=m[k][a],y=m[k][b];m[k][a]=c*x-s*y;m[k][b]=s*x+c*y;}for(let k=0;k<3;k++){const x=m[a][k],y=m[b][k];m[a][k]=c*x-s*y;m[b][k]=s*x+c*y;const x2=v[k][a],y2=v[k][b];v[k][a]=c*x2-s*y2;v[k][b]=s*x2+c*y2;}}return [0,1,2].map(k=>({value:m[k][k],axis:v.map(row=>row[k])})).sort((a,b)=>a.value-b.value);}
/** @param {import('./hull-panels').Region[]} regions */
export function tubularSections(regions){
 // Rejoin neighboring facets for fitting. The paint chart detector deliberately
 // splits low-poly cylinders at their creases; those are not separate components.
 const faces=regions.flatMap(r=>r.faces),parents=faces.map((f,i)=>i),shared=new Map(/** @type {[string,number[]][]} */([]));
 /** @param {number} i */function root(i){while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;}
 faces.forEach((f,i)=>f.v.forEach((p,j)=>{const a=p.slice(0,3).map(x=>Math.round(x*100000)).join(','),b=f.v[(j+1)%3].slice(0,3).map(x=>Math.round(x*100000)).join(','),key=a<b?a+'|'+b:b+'|'+a,list=shared.get(key)||[];list.push(i);shared.set(key,list);}));
 /** @type {{axis:number[],weight:number}[]} */const seeds=[];
 shared.forEach(list=>{if(list.length!==2)return;const [a,b]=list,n1=faces[a].normal,n2=faces[b].normal,angle=sectionDot(n1,n2);if(angle>.995||angle<.35)return;let axis=sectionUnit(sectionCross(n1,n2));const k=axis.reduce((best,x,j)=>Math.abs(x)>Math.abs(axis[best])?j:best,0);if(axis[k]<0)axis=axis.map(x=>-x);const seed=seeds.find(x=>sectionDot(x.axis,axis)>.985);if(seed)seed.weight++;else seeds.push({axis,weight:1});});
 const surfaces=/** @type {{faces:import('./hull-panels').Face[],area:number}[]} */([]);
 for(const seed of seeds.sort((a,b)=>b.weight-a.weight).slice(0,12)){
  for(let i=0;i<parents.length;i++)parents[i]=i;
  const eligible=faces.map(f=>Math.abs(sectionDot(f.normal,seed.axis))<.12);
  shared.forEach(list=>{if(list.length!==2)return;const [a,b]=list;if(eligible[a]&&eligible[b])parents[root(b)]=root(a);});
  const components=new Map(/** @type {[number,{faces:import('./hull-panels').Face[],area:number}][]} */([]));faces.forEach((f,i)=>{if(!eligible[i])return;const key=root(i),r=components.get(key)||{faces:[],area:0};r.faces.push(f);r.area+=f.area;components.set(key,r);});surfaces.push(...components.values());
 }
 /** @type {TubePatch[]} */const patches=[];
 for(const r of [...regions,...surfaces]){const normalBias=Math.hypot(...[0,1,2].map(k=>r.faces.reduce((sum,f)=>sum+f.normal[k]*f.area,0)/(r.area||1)));
  if(normalBias>.7||r.faces.length<6||new Set(r.faces.map(f=>f.normal.map(x=>Math.round(x*1000)).join(','))).size<6)continue;
  const eig=sectionEigen([0,1,2].map(i=>[0,1,2].map(j=>r.faces.reduce((s,f)=>s+f.normal[i]*f.normal[j]*f.area,0)/(r.area||1))));
  if(eig[0].value>.018||eig[1].value<.035)continue;
  let axis=sectionUnit(eig[0].axis);const dominant=axis.reduce((best,x,k)=>Math.abs(x)>Math.abs(axis[best])?k:best,0);if(axis[dominant]<0)axis=axis.map(x=>-x);
  const u=sectionUnit(sectionCross(axis,Math.abs(axis[2])<.8?[0,0,1]:[0,1,0])),v=sectionCross(axis,u);
  let xx=0,xy=0,yy=0,bx=0,by=0;
  r.faces.forEach(f=>{const p=[0,1,2].map(k=>f.v.reduce((s,q)=>s+q[k],0)/3),t=sectionCross(axis,f.normal),x=sectionDot(t,u),y=sectionDot(t,v),b=sectionDot(t,p),w=f.area;xx+=x*x*w;xy+=x*y*w;yy+=y*y*w;bx+=x*b*w;by+=y*b*w;});
  const det=xx*yy-xy*xy;if(det<1e-12)continue;const x=(bx*yy-by*xy)/det,y=(by*xx-bx*xy)/det,center=u.map((q,k)=>q*x+v[k]*y);
  const points=r.faces.flatMap(f=>f.v),ts=points.map(p=>sectionDot(p,axis)),radii=points.map(p=>{const d=p.slice(0,3).map((q,k)=>q-center[k]),t=sectionDot(d,axis);return Math.hypot(...d.map((q,k)=>q-axis[k]*t));}),radius=radii.reduce((a,b)=>a+b,0)/radii.length,lo=Math.min(...ts),hi=Math.max(...ts);
  if(radius<.012||hi-lo<radius*.12||Math.sqrt(radii.reduce((s,q)=>s+(q-radius)**2,0)/radii.length)>radius*.06)continue;
  patches.push({axis,center,radius,lo,hi,area:r.area});
 }
 /** @type {{axis:number[],center:number[],patches:TubePatch[]}[]} */const groups=[];
 for(const patch of patches){let group=groups.find(g=>{if(sectionDot(g.axis,patch.axis)<.985)return false;const d=patch.center.map((x,k)=>x-g.center[k]),t=sectionDot(d,g.axis),radial=Math.hypot(...d.map((x,k)=>x-t*g.axis[k]));return radial<Math.max(.008,patch.radius*.12)&&g.patches.some(p=>patch.lo<=p.hi+patch.radius*.8&&patch.hi>=p.lo-patch.radius*.8);});if(!group){group={axis:patch.axis,center:patch.center,patches:[]};groups.push(group);}group.patches.push(patch);}
 // A late shoulder patch may bridge two previously disjoint coaxial runs.
 for(let changed=true;changed;){changed=false;for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){const a=groups[i],b=groups[j],d=b.center.map((x,k)=>x-a.center[k]),along=sectionDot(d,a.axis),radial=Math.hypot(...d.map((x,k)=>x-along*a.axis[k]));if(sectionDot(a.axis,b.axis)>.985&&radial<Math.max(.008,a.patches[0].radius*.12)&&a.patches.some(p=>b.patches.some(q=>p.lo<=q.hi+Math.max(p.radius,q.radius)*.8&&p.hi>=q.lo-Math.max(p.radius,q.radius)*.8))){a.patches.push(...b.patches);groups.splice(j--,1);changed=true;}}}
 const tubes=groups.map(g=>{
  const sorted=g.patches.slice().sort((a,b)=>(b.hi-b.lo)-(a.hi-a.lo)||b.area-a.area),body=sorted[0],lo=Math.min(...g.patches.map(p=>p.lo)),hi=Math.max(...g.patches.map(p=>p.hi));
  const stations=Array.from(new Set(g.patches.flatMap(p=>[Math.round(p.lo*10000)/10000,Math.round(p.hi*10000)/10000]))).sort((a,b)=>a-b);
  const intervals=stations.slice(0,-1).map((a,i)=>{const b=stations[i+1],active=g.patches.filter(p=>(a+b)/2>=p.lo-1e-4&&(a+b)/2<=p.hi+1e-4),radius=Math.max(0,...active.map(p=>p.radius));return {lo:a,hi:b,radius};}).filter(p=>p.radius>0&&p.hi-p.lo>.001);
  const transitions=intervals.filter((p,i)=>i&&Math.abs(p.radius-intervals[i-1].radius)>body.radius*.06).length;
  return {...g,body,lo,hi,intervals,transitions};
 }).filter(t=>t.hi-t.lo>t.body.radius*.6);
 /** @param {number[]} p @param {number[]} n @returns {{slot:number,role:string}|null} */
 function sample(p,n){
  let best=Infinity;let result={slot:-1,role:''};
  for(const tube of tubes){const t=sectionDot(p,tube.axis);if(t<tube.lo-.025||t>tube.hi+.025)continue;const d=p.map((x,k)=>x-tube.center[k]),along=sectionDot(d,tube.axis),radius=Math.hypot(...d.map((x,k)=>x-along*tube.axis[k])),section=tube.intervals.find(s=>t>=s.lo-.006&&t<=s.hi+.006);if(!section)continue;
   const envelope=section.radius,axial=Math.abs(sectionDot(n,tube.axis));if(radius>envelope+.025||(radius<envelope*.25&&axial<.6))continue;
   const radialNormal=sectionDot(n,d.map((x,k)=>x-along*tube.axis[k]))/Math.max(.0001,radius),surfaceError=Math.abs(radius-envelope);if(surfaceError>Math.max(.025,envelope*.18)&&axial<.6&&radius>envelope*.72&&radialNormal>-.35)continue;
   let slot=0,role='barrel';
   if((radius<envelope*.85&&radialNormal<-.35)||(axial>.6&&radius<envelope*.76&&t>tube.lo+envelope*.04&&t<tube.hi-envelope*.04)){slot=3;role='inset';}
   else if(axial>.6){slot=1;role='end / shoulder';}
   else if(tube.transitions&&Math.abs(envelope-tube.body.radius)>tube.body.radius*.06){slot=envelope<tube.body.radius*.82?3:1;role='profile section';}
   // A straight uninterrupted cylinder stays one barrel: no invented thirds.
   if(!tube.transitions&&axial<.6&&radius>=envelope*.76)continue;
   const score=surfaceError+Math.abs(t-(tube.lo+tube.hi)/2)*.001;if(score<best){best=score;result={slot,role};}
  }
  return result.slot>=0?result:null;
 }
 return {sample,tubes,stats:{tubes:tubes.length,transitions:tubes.reduce((s,t)=>s+t.transitions,0)}};
}
