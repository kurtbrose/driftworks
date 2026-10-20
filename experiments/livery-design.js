/** Geometry-only design preferences extracted from authored/procedural comparisons.
 * @typedef {{contours:number,coherence:number,accents:number}} DesignPreferences */
/** @param {number[]} a @param {number[]} b */
const cueDot=(a,b)=>a.slice(0,3).reduce((sum,x,k)=>sum+x*b[k],0);
/** @param {number[]} p */
const cueKey=p=>p.slice(0,3).map(x=>Math.round(x*100000)).join(',');
/** @param {import('./hull-panels').Region[]} regions @param {import('./livery-symmetry').MirrorPlane|null} [symmetry] */
export function designPlan(regions,symmetry=null){
 /** @typedef {{a:number[],b:number[],face:import('./hull-panels').Face,region:number}} EdgeUse */
 const edges=new Map(/** @type {[string,EdgeUse[]][]} */([])),centers=regions.map(r=>[0,1,2].map(k=>r.faces.reduce((sum,f)=>sum+f.area*f.v.reduce((v,p)=>v+p[k],0)/3,0)/(r.area||1)));
 const parent=regions.map((r,i)=>i),convex=regions.map(()=>/** @type {EdgeUse[]} */([])),concave=regions.map(()=>/** @type {EdgeUse[]} */([]));
 /** @param {number} i @returns {number} */function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
 regions.forEach((r,i)=>r.faces.forEach(face=>face.v.forEach((a,j)=>{const b=face.v[(j+1)%3],ka=cueKey(a),kb=cueKey(b),key=ka<kb?ka+'|'+kb:kb+'|'+ka;const list=edges.get(key)||[];list.push({a,b,face,region:i});edges.set(key,list);}))); 
 edges.forEach(uses=>{if(uses.length!==2)return;const [a,b]=uses,angle=cueDot(a.face.normal,b.face.normal);
  if(angle>.96&&a.region!==b.region)parent[root(b.region)]=root(a.region);
  if(angle>.96)return;
  const mid=a.a.slice(0,3).map((x,k)=>(x+a.b[k])/2),ca=[0,1,2].map(k=>a.face.v.reduce((sum,p)=>sum+p[k],0)/3),cb=[0,1,2].map(k=>b.face.v.reduce((sum,p)=>sum+p[k],0)/3);
  const sign=cueDot(a.face.normal,cb.map((x,k)=>x-mid[k]))+cueDot(b.face.normal,ca.map((x,k)=>x-mid[k]));
  if(Math.abs(sign)<1e-7)return;const target=sign>0?concave:convex;target[a.region].push(a);if(b.region!==a.region)target[b.region].push(b);
 });
 const groups=new Map(/** @type {[number,{id:number,area:number,members:number[],crease:number,slot:number}][]} */([]));
 regions.forEach((r,i)=>{const id=root(i),group=groups.get(id)||{id,area:0,members:[],crease:0,slot:0};group.area+=r.area;group.members.push(i);group.crease+=[...convex[i],...concave[i]].reduce((sum,e)=>sum+Math.hypot(...e.a.slice(0,3).map((x,k)=>x-e.b[k])),0);groups.set(id,group);});
 const total=regions.reduce((sum,r)=>sum+r.area,0)||1,ordered=Array.from(groups.values()).sort((a,b)=>b.area-a.area||a.id-b.id);
 let secondaryArea=0;ordered.forEach((g,i)=>{if(i&&g.area<total*.18&&secondaryArea+g.area<=total*.24){g.slot=1;secondaryArea+=g.area;}});
 // Accent is a scarce resource; score small/medium crease-rich pieces, not triangles.
 const candidates=ordered.filter(g=>g.area>total*.0035&&g.area<total*.035&&g.crease>0&&(!symmetry||g.members.some(i=>cueDot(centers[i],symmetry.normal)>=symmetry.offset-1e-6))).sort((a,b)=>(b.crease*Math.sqrt(b.area))-(a.crease*Math.sqrt(a.area))||a.id-b.id);
 let accentArea=0;const budget=total*.03;for(const g of candidates){if(accentArea+g.area<=budget){g.slot=2;accentArea+=g.area;}}
 ordered.forEach(g=>{const valleys=g.members.reduce((sum,i)=>sum+concave[i].reduce((v,e)=>v+Math.hypot(...e.a.slice(0,3).map((x,k)=>x-e.b[k])),0),0),ridges=g.members.reduce((sum,i)=>sum+convex[i].reduce((v,e)=>v+Math.hypot(...e.a.slice(0,3).map((x,k)=>x-e.b[k])),0),0);if(g.slot!==2&&g.area<total*.015&&valleys>ridges*1.4)g.slot=3;});
 const slots=regions.map((r,i)=>groups.get(root(i))?.slot||0);
 /** @param {number[]} p @param {EdgeUse[]} list */function distance(p,list){let best=Infinity;for(const e of list){const ab=e.b.slice(0,3).map((x,k)=>x-e.a[k]),ap=p.map((x,k)=>x-e.a[k]),t=Math.max(0,Math.min(1,cueDot(ap,ab)/(cueDot(ab,ab)||1)));best=Math.min(best,Math.hypot(...ap.map((x,k)=>x-ab[k]*t)));}return best;}
 /** @param {number[]} p @param {number[]} n @param {number[]} base @param {number} index @param {DesignPreferences} preferences */
 function apply(p,n,base,index,preferences){const r=regions[index];if(!r)return base;
  const w=[...base,Math.max(0,1-base.reduce((sum,x)=>sum+x,0))],target=[0,0,0,0];target[slots[index]]=1;
  const blend=Math.max(0,Math.min(1,preferences.coherence));for(let k=0;k<4;k++)w[k]=w[k]*(1-blend)+target[k]*blend;
  // Suppress random accent islands outside the geometric accent budget.
  if(slots[index]!==2){const removed=w[2]*preferences.accents;w[2]-=removed;w[0]+=removed;}
  const width=Math.max(.002,Math.min(.014,Math.sqrt(r.area)*.035));
  const ridge=Math.max(0,1-distance(p,convex[index])/width)*preferences.contours;
  const valley=Math.max(0,1-distance(p,concave[index])/(width*1.7))*preferences.contours;
  // Convex trim contrasts with the body's assigned material; concave joins use Detail.
  const trim=slots[index]===0?1:0,amount=ridge*.48;for(let k=0;k<4;k++)w[k]*=1-amount;w[trim]+=amount;
  const recess=valley*.72;for(let k=0;k<3;k++)w[k]*=1-recess;
  // A narrow bevel isn't an invitation to add another material island.
  if(r.area<total*.0003){const quiet=preferences.coherence*.65;for(let k=0;k<3;k++)w[k]=w[k]*(1-quiet)+(k===0?quiet:0);}
  return w.slice(0,3);
 }
 return {apply,slots,centers,stats:{groups:ordered.length,regions:regions.length,accentFraction:accentArea/total,convex:convex.reduce((sum,x)=>sum+x.length,0),concave:concave.reduce((sum,x)=>sum+x.length,0)}};
}
