(function(){
 'use strict';
 const DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks),U=DW.sim.METERS_PER_UNIT;
 /** @typedef {import('./freighter-types').Entity} Entity */
 /** @typedef {import('./freighter-types').ComponentState} Component */
 /** @typedef {import('./freighter-types').Catalog} Catalog */
 /** @typedef {import('./freighter-types').Part} Part */
 /** @typedef {import('./freighter-types').Debris} Debris */
 /** @typedef {import('./freighter-types').Box} Box */
 /** @typedef {{ship:Entity;index:number;module:Component;body:Debris}} Active */
 /** @typedef {{normal:number[];point:number[];velocity:number[]}} Contact */
 /** @type {Record<string,Catalog>} */let catalogs={};
 /** @type {WeakMap<import('../experiments/types').Craft,Entity>} */const entities=new WeakMap();
 /** @type {WeakMap<Entity,{index:number;local:number[];normal:number[];point:number[]}>} */const contacts=new WeakMap();
 /** @type {WeakMap<Component,{key:string;part:Part}>} */let parts=new WeakMap();
 /** @type {WeakMap<Catalog,Map<string,{kind:number;index:number}[]>>} */let grids=new WeakMap();
 /** @type {WeakMap<import('./freighter-types').Systems,Catalog>} */let normalized=new WeakMap();
 const axesIdentity=[[1,0,0],[0,1,0],[0,0,1]],CELL=12,MAX_DEBRIS=12;
 /** @param {number[]} a @param {number[]} b */const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
 /** @param {number[]} a @param {number[]} b */const sub=(a,b)=>a.map((v,k)=>v-b[k]);
 /** @param {number[]} a @param {number[]} b */const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 /** @param {number[]} v */const unit=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
 /** @param {Entity} ship */function frame(ship){const f=DW.fleetGuidance.frame(ship.forward||[0,1,0]);return [f.right,f.back.map(v=>-v),f.up];}
 /** @param {number[]} v @param {number[][]} axes */const vector=(v,axes)=>[0,1,2].map(k=>axes.reduce((s,a,i)=>s+a[k]*v[i],0));
 /** @param {number[]} v @param {number[][]} axes */const inverse=(v,axes)=>axes.map(a=>dot(v,a));
 /** @param {import('./freighter-types').ModuleAsset} meta @param {ArrayBuffer} bytes @param {Record<string,{model:import('../experiments/types').Model}>} bases */
 function install(meta,bytes,bases){
  catalogs={};parts=new WeakMap();grids=new WeakMap();normalized=new WeakMap();
  for(const name of Object.keys(meta.variants)){const variant=meta.variants[name];catalogs[name]={defs:variant.components||[],owners:variant.moduleMap?new Int16Array(bytes,variant.moduleMap.offset,variant.moduleMap.count):new Int16Array(),obstacles:variant.obstacles||[],mouths:variant.engineMouths||[],base:bases[name].model,batches:variant.batches.map(b=>({vertices:new Float32Array(bytes,b.offset,b.count),color:b.color,textured:b.textured,finish:b.emissiveIntensity>=1&&b.emissive.some(v=>v>0)?7:0}))};}
 }
 /** Compatibility repair is idempotent; persistent state contains only numbers,
  * arrays and component IDs. Geometry, images and observer views remain external.
  * @param {Entity} ship */
 function ensure(ship){
  const defs=catalogs[ship.model]?.defs||[];
  if(!ship.modules||ship.modules.version!==1)ship.modules={version:1,revision:0,serial:0,modules:[]};
  if(normalized.get(ship.modules)===catalogs[ship.model]&&ship.modules.modules.length===defs.length)return ship.modules;
  const state=ship.modules;state.revision=Number.isFinite(state.revision)?state.revision:0;state.serial=Number.isFinite(state.serial)?state.serial:0;
  state.modules=defs.map(def=>{const old=state.modules.find(m=>m.id===def.id);if(!old)return {id:def.id,health:def.maxHealth,maxHealth:def.maxHealth,damage:null,marks:[],leaks:[],debris:null};old.maxHealth=def.maxHealth;old.health=Number.isFinite(old.health)?Math.max(0,Math.min(def.maxHealth,old.health)):def.maxHealth;old.marks=old.marks||[];old.leaks=old.leaks||[];old.debris=old.debris||null;old.damage=Number.isInteger(old.damage)?old.damage:null;return old;});
  if(catalogs[ship.model])normalized.set(state,catalogs[ship.model]);return state;
 }
 /** @param {Entity} ship @param {number} index */
 function part(ship,index){
  const catalog=catalogs[ship.model],state=ensure(ship).modules[index],def=catalog.defs[index],key=[state.damage,state.damagePoint,state.damageNormal].join('|'),cached=parts.get(state);if(cached&&cached.key===key)return cached.part;
  const batches=def.ranges.map(range=>{const source=catalog.batches[range.batch],v=new Float32Array(source.vertices.slice(range.first*24,(range.first+range.count)*24));for(let i=0;i<v.length;i+=8)for(let k=0;k<3;k++)v[i+k]-=def.center[k];return {...source,vertices:v};});
  const result=state.damage!==null&&state.damagePoint&&state.damageNormal?DW.freighterGeometry.deform(batches,state.damagePoint,state.damageNormal,state.damage):{batches,model:DW.freighterGeometry.model(batches,'freighter-'+ship.model+'-'+def.id),added:0};
  parts.set(state,{key,part:result});return result;
 }
 /** @param {Entity} ship */const dirty=ship=>ensure(ship).modules.some(m=>m.health<=0||m.damage!==null);
 /** @param {import('../experiments/types').Craft} craft @param {Entity} ship */function bind(craft,ship){entities.set(craft,ship);ensure(ship);}
 /** @param {Entity} ship @param {import('../experiments/types').Pose} pose @param {number[]} start @param {number[]} end @param {number} units @param {number} [radius] */
 function trace(ship,pose,start,end,units,radius){
  const catalog=catalogs[ship.model];if(!catalog)return null;const state=ensure(ship),changed=dirty(ship),query=/** @type {import('./freighter-types').FilteredHullHit} */(DW.shipHulls.hullHit);
  let best=query(catalog.base,pose,start,end,units,radius,changed?offset=>{const index=catalog.owners[offset/18];return index<0||!state.modules[index]||state.modules[index].health>0&&state.modules[index].damage===null;}:undefined);
  let owner=best&&best.triangleOffset!==undefined?catalog.owners[best.triangleOffset/18]:-1;
  let local=best?.local,normal=best?.normal;
  const axes=[pose.right,pose.back.map(v=>-v),pose.up];
  for(let i=0;i<state.modules.length;i++){const module=state.modules[i];if(module.health<=0||module.damage===null)continue;const def=catalog.defs[i],offset=vector(def.center,axes),posed={...pose,eye:pose.eye.map((v,k)=>v+offset[k]/units)},hit=query(part(ship,i).model,posed,start,end,units,radius);if(hit&&(!best||hit.fraction<best.fraction)){best=hit;owner=i;local=hit.local.map((v,k)=>v+def.center[k]);normal=hit.normal;}}
  if(best&&owner>=0&&local&&normal){const def=catalog.defs[owner];contacts.set(ship,{index:owner,local:local.map((v,k)=>v-def.center[k]),normal:normal.slice(),point:best.point.slice()});}else contacts.delete(ship);
  return best?{...best,rootLocal:local||best.local}:null;
 }
 /** @param {import('../experiments/types').Craft} craft @param {number[]} start @param {number[]} end @param {number} units @param {number} [radius] */function hitCraft(craft,start,end,units,radius){const ship=entities.get(craft);return ship?trace(ship,craft.pose,start,end,units,radius):null;}
 /** @param {Entity} ship @param {number[]} point */function fallback(ship,point){const axes=frame(ship),local=inverse(sub(point,ship.position).map(v=>v*U),axes),defs=catalogs[ship.model].defs;for(let i=0;i<defs.length;i++){const def=defs[i],p=sub(local,def.center);if(p.every((v,k)=>Math.abs(v)<=def.half[k]+.15)){const axis=[0,1,2].sort((a,b)=>Math.abs(p[b]/def.half[b])-Math.abs(p[a]/def.half[a]))[0],normal=[0,0,0];normal[axis]=Math.sign(p[axis]||1);return {index:i,local:p,normal,point};}}return null;}
 /** @param {Entity} ship @param {import('../experiments/types').Weapon} weapon @param {number[]} point @param {number} time */
 function damage(ship,weapon,point,time){
  const catalog=catalogs[ship.model];if(!catalog||!catalog.defs.length)return;const state=ensure(ship),old=contacts.get(ship),hit=old&&Math.hypot(...sub(old.point,point))*U<.15?old:fallback(ship,point);if(!hit)return;
  const module=state.modules[hit.index],def=catalog.defs[hit.index];if(module.health<=0)return;
  const amount=Math.max(0,weapon.damage*weapon.armorFactor);if(!(amount>0))return;module.health=Math.max(0,module.health-amount);state.serial++;
  module.marks.push({local:hit.local.slice(),normal:hit.normal.slice(),serial:state.serial});if(module.marks.length>4)module.marks.shift();
  while(state.modules.reduce((s,m)=>s+m.marks.length,0)>24){const first=state.modules.filter(m=>m.marks.length).sort((a,b)=>a.marks[0].serial-b.marks[0].serial)[0];first.marks.shift();}
  if(def.type==='tank'&&!module.leaks.some(leak=>Math.hypot(...sub(leak.local,hit.local))<.35)){module.leaks.push({local:hit.local.slice(),normal:hit.normal.slice(),age:0});if(module.leaks.length>2)module.leaks.shift();}
  if(def.type==='container'&&module.health<=def.maxHealth*.3&&module.damage===null){module.damage=hit.index%3;module.damagePoint=hit.local.slice();module.damageNormal=hit.normal.slice();state.revision++;}
  if(module.health<=0){
   const axes=frame(ship),position=vector(def.center,axes).map((v,k)=>ship.position[k]+v/U),half=[def.half[1],def.half[2],def.half[0]],center=[-def.center[1],def.center[2],def.center[0]],spring=DW.freighterPhysics.releaseKick(ship.id+'-'+def.id,center,half,true),convert=/** @param {number[]} v */(v)=>[v[2],-v[0],v[1]];
   const velocity=vector(convert(spring.velocity),axes),spin=convert(spring.spin).map(v=>-v),attachment=convert(spring.attachment);spring.velocity=velocity;spring.spin=spin;spring.attachment=attachment;
   module.debris={pose:{eye:position,right:axes[0].slice(),back:axes[1].map(v=>-v),up:axes[2].slice(),velocity:ship.velocity.map((v,k)=>v*.94+velocity[k]*.25),region:0},spin:spin.map(v=>v*.25),spring,age:0,mounts:[],serial:time};
   module.debris.mounts=nearby(catalog,{center:def.center,half:def.half,axes:axesIdentity}).filter(ref=>ref.kind===1&&fitting({center:def.center,half:def.half,axes:axesIdentity},catalog,ref.index)).map(ref=>ref.index);state.revision++;
  }
 }
 /** @param {Catalog} catalog @param {Box} box @returns {{kind:number;index:number}[]} */function nearby(catalog,box){
  let grid=grids.get(catalog);if(!grid){grid=new Map();grids.set(catalog,grid);const refs=catalog.defs.map((_,index)=>({kind:0,index})).concat(catalog.obstacles.map((_,index)=>({kind:1,index})));
   for(const ref of refs){const item=ref.kind===0?catalog.defs[ref.index]:catalog.obstacles[ref.index];cells(item.center,item.half,key=>{let list=grid?.get(key);if(!list){list=[];grid?.set(key,list);}list.push(ref);});}
  }
  const extents=[0,1,2].map(k=>box.axes.reduce((s,a,i)=>s+Math.abs(a[k])*box.half[i],0));
  /** @type {Set<{kind:number;index:number}>} */
  const found=new Set();cells(box.center,extents,key=>{for(const ref of grid?.get(key)||[])found.add(ref);});return [...found];
 }
 /** @param {number[]} center @param {number[]} half @param {(key:string)=>void} visit */function cells(center,half,visit){for(let x=Math.floor((center[0]-half[0])/CELL);x<=Math.floor((center[0]+half[0])/CELL);x++)for(let y=Math.floor((center[1]-half[1])/CELL);y<=Math.floor((center[1]+half[1])/CELL);y++)for(let z=Math.floor((center[2]-half[2])/CELL);z<=Math.floor((center[2]+half[2])/CELL);z++)visit(x+','+y+','+z);}
 /** Exact box/triangle SAT after the authored fitting's broadphase bounds.
  * @param {Box} box @param {Catalog} catalog @param {number} index */function fitting(box,catalog,index){
  const obstacle=catalog.obstacles[index];if(!DW.freighterPhysics.contact(box,{...obstacle,axes:axesIdentity}))return null;
  const range=obstacle.range,v=catalog.batches[range.batch].vertices;
  for(let offset=range.first*24;offset<(range.first+range.count)*24;offset+=24){const original=[0,8,16].map(i=>Array.from(v.slice(offset+i,offset+i+3))),tri=original.map(p=>inverse(sub(p,box.center),box.axes)),edges=[sub(tri[1],tri[0]),sub(tri[2],tri[1]),sub(tri[0],tri[2])],axes=axesIdentity.concat([cross(edges[0],edges[1])],edges.flatMap(e=>axesIdentity.map(a=>cross(e,a))));
   if(axes.some(axis=>{if(dot(axis,axis)<1e-12)return false;const projections=tri.map(p=>dot(p,axis)),radius=axis.reduce((s,x,k)=>s+Math.abs(x)*box.half[k],0);return Math.min(...projections)>=radius-1e-6||Math.max(...projections)<=-radius+1e-6;}))continue;
   let normal=unit(cross(sub(original[1],original[0]),sub(original[2],original[0])));if(dot(normal,sub(box.center,original[0]))<0)normal=normal.map(x=>-x);return {normal,center:original[0]};
  }return null;
 }
 /** @param {Debris} body */const bodyAxes=body=>[body.pose.right,body.pose.back.map(v=>-v),body.pose.up];
 /** @param {Debris} body @param {number[]} half @param {Entity} ship */function localBox(body,half,ship){const axes=frame(ship);return {center:inverse(sub(body.pose.eye,ship.position).map(v=>v*U),axes),half,axes:bodyAxes(body).map(a=>inverse(a,axes))};}
 /** @param {Debris} body @param {number} dt */function rotate(body,dt){const axes=bodyAxes(body);for(let i=0;i<3;i++){const angle=body.spin[i]*dt,c=Math.cos(angle),s=Math.sin(angle),axis=axes[i].slice();for(let j=0;j<3;j++){const v=axes[j],curl=cross(axis,v),along=dot(axis,v);axes[j]=v.map((x,k)=>x*c+curl[k]*s+axis[k]*along*(1-c));}}body.pose.right=axes[0];body.pose.back=axes[1].map(v=>-v);body.pose.up=axes[2];}
 /** @param {Active} item @param {Debris} previous @param {Entity[]} targets @param {Active[]} active @returns {Contact|null} */
 function contactAt(item,previous,targets,active){
  const {ship,index,body}=item,def=catalogs[ship.model].defs[index];
  for(const target of targets){const cat=catalogs[target.model],box=localBox(body,def.half,target),before=localBox(previous,def.half,target),targetState=ensure(target),axes=frame(target);
   for(const ref of nearby(cat,box)){
    if(ref.kind===0){if(target===ship&&ref.index===index||targetState.modules[ref.index].health<=0)continue;
     const other=cat.defs[ref.index],hit=DW.freighterPhysics.contact(box,{...other,axes:axesIdentity});if(!hit)continue;
     const prior=DW.freighterPhysics.contact(before,{...other,axes:axesIdentity});if(prior&&hit.depth<=prior.depth+.0001&&Math.hypot(...sub(box.center,other.center))>=Math.hypot(...sub(before.center,other.center)))continue;
     return {normal:vector(hit.normal,axes),point:vector(other.center,axes).map((v,k)=>target.position[k]+v/U),velocity:target.velocity};
    }
    if(target===ship&&body.mounts.includes(ref.index))continue;const hit=fitting(box,cat,ref.index);if(hit)return {normal:vector(hit.normal,axes),point:vector(hit.center,axes).map((v,k)=>target.position[k]+v/U),velocity:target.velocity};
   }
  }
  for(const other of active){if(other.body===body||!other.module.debris||(other.body.pose.region||0)!==(body.pose.region||0))continue;
   const otherDef=catalogs[other.ship.model].defs[other.index],a={center:body.pose.eye.map(v=>v*U),half:def.half,axes:bodyAxes(body)},b={center:other.body.pose.eye.map(v=>v*U),half:otherDef.half,axes:bodyAxes(other.body)};
   if(Math.hypot(...sub(a.center,b.center))>Math.hypot(...def.half)+Math.hypot(...otherDef.half))continue;const hit=DW.freighterPhysics.contact(a,b);if(hit)return {normal:hit.normal,point:other.body.pose.eye,velocity:other.body.pose.velocity};
  }return null;
 }
 /** @param {import('../experiments/types').Combat} combat @param {number} dt */
 function step(combat,dt){
  const ships=/** @type {Entity[]} */(combat.convoy?.ships||[]),active=/** @type {Active[]} */([]);
  for(const ship of ships){const state=ensure(ship);state.modules.forEach((module,index)=>{for(const leak of module.leaks)leak.age+=dt;module.leaks=module.leaks.filter(l=>l.age<14);if(module.debris)active.push({ship,index,module,body:module.debris});});}
  active.sort((a,b)=>b.body.serial-a.body.serial||a.ship.id.localeCompare(b.ship.id)||a.index-b.index);for(const item of active.slice(MAX_DEBRIS))item.module.debris=null;active.length=Math.min(active.length,MAX_DEBRIS);
  for(const item of active){const {ship,index,module,body}=item,def=catalogs[ship.model].defs[index];body.age+=dt;if(body.age>18){module.debris=null;continue;}
   const fraction=.75*DW.freighterPhysics.springFraction(body.age-dt,dt,body.spring.duration);body.pose.velocity=body.pose.velocity.map((v,k)=>v+body.spring.velocity[k]*fraction);body.spin=body.spin.map((v,k)=>v+body.spring.spin[k]*fraction);
   const old=body.pose.eye.slice(),saved=bodyAxes(body).map(a=>a.slice()),previous={...body,pose:{...body.pose,eye:old,right:saved[0],back:saved[1].map(v=>-v),up:saved[2]}};body.pose.eye=old.map((v,k)=>v+body.pose.velocity[k]*dt/U);
   if((body.pose.region||0)===0){
    const candidateShips=DW.flightCollision.sweep(combat,old,body.pose.eye,Math.hypot(...def.half)).flatMap(entry=>{const entity=entities.get(entry.craft);return entity?[entity]:[];});
    const own=localBox(body,def.half,ship),mounting=body.mounts.some(i=>fitting(own,catalogs[ship.model],i));if(!mounting)rotate(body,dt);
    const collision=contactAt(item,previous,candidateShips,active);
    if(collision){body.pose.right=saved[0];body.pose.back=saved[1].map(v=>-v);body.pose.up=saved[2];if(contactAt(item,previous,candidateShips,active))body.pose.eye=old;
     const axes=bodyAxes(body),normal=inverse(collision.normal,axes),lever=inverse(sub(collision.point,body.pose.eye).map(v=>v*U),axes).map((v,k)=>Math.max(-def.half[k],Math.min(def.half[k],v))),response=DW.freighterPhysics.respondContact(inverse(sub(body.pose.velocity,collision.velocity),axes),body.spin,normal,lever,def.half);body.pose.velocity=vector(response.velocity,axes).map((v,k)=>v+collision.velocity[k]);body.spin=response.spin;
    }
    body.mounts=body.mounts.filter(i=>fitting(localBox(body,def.half,ship),catalogs[ship.model],i));
   }else rotate(body,dt);
   if(combat.wormholes?.length)DW.wormholes.travel(combat.wormholes,old,body.pose,combat.time,U);
  }
 }
 /** @param {Entity} ship */function engines(ship){const state=ensure(ship);return (catalogs[ship.model]?.defs||[]).flatMap((def,i)=>def.type==='engine'&&state.modules[i].health>0?[def.engineIndex??0]:[]);}
 DW.freighterSim={install,catalog:model=>catalogs[model],ensure,bind,trace,hitCraft,damage,step,dirty,part,engines};
}());
