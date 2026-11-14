(function(){
 'use strict';
 const DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks),U=DW.sim.METERS_PER_UNIT;
 const assetUrl=/** @type {(value:string)=>string} */(window.Driftworks.assetUrl);
 /** @typedef {import('../src/freighter-types').Entity} Entity */
 /** @typedef {import('../src/freighter-types').ComponentState} Component */
 /** @typedef {import('../src/freighter-types').Part} Part */
 /** @typedef {import('./types').Batch & {textured?:boolean;wear?:boolean}} Draw */
 /** @typedef {import('./types').Pose} Pose */
 /** @type {WeakMap<Entity,{catalog:object;state:import('../src/freighter-types').Systems;revision:number;batches:Draw[]}>} */const hulls=new WeakMap();
 /** @type {WeakMap<Part,Draw[]>} */const partDraws=new WeakMap();
 /** @type {WeakMap<Component,{part:Part;serials:string;layers:Float32Array[]}>} */const marks=new WeakMap();
 /** @type {WeakMap<Entity,{state:import('../src/freighter-types').Systems;key:string;layers:Float32Array[]}>} */const attachedMarks=new WeakMap();
 /** @type {WeakMap<import('./types').Combat,{last:number;particles:{pose:Pose&{velocity:number[]};age:number;life:number;pressure:number}[];emit:Map<string,{age:number;budget:number;serial:number}>}>} */const ventStates=new WeakMap();
 const stats={changedShips:0,debris:0,ventParticles:0,preparedMs:0},colors=[[.22,.20,.17],[.22,.20,.17],[.22,.20,.17],[.22,.20,.17],[.09,.08,.07]],opacity=[.1,.13,.16,.18,.72];
 const identity={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1],velocity:[0,0,0],throttle:0};
 const wearImage=new Image(),canvas=document.createElement('canvas');canvas.width=768;canvas.height=256;
 const context=canvas.getContext('2d');if(context){for(let variant=0;variant<3;variant++){let seed=91+variant*71;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<110;i++){context.fillStyle=i%3?'rgba(86,89,85,.45)':'rgba(29,33,34,.6)';context.fillRect(variant*256+random()*256,random()*256,1+random()*2,2+random()*13);}for(let i=0;i<5;i++){const x=variant*256+22+i*48+variant*7;context.strokeStyle='rgba(18,23,25,.65)';context.lineWidth=variant===2?2.1:1.1;context.beginPath();context.moveTo(x,110);for(let j=0;j<7;j++)context.lineTo(x+(random()-.5)*14,110+j*15);context.stroke();}}wearImage.src=assetUrl(canvas.toDataURL('image/png'));}
 /** @param {number[]} v @param {number[][]} axes */const vector=(v,axes)=>[0,1,2].map(k=>axes.reduce((s,a,i)=>s+a[k]*v[i],0));
 /** @param {Entity} ship */function pose(ship){const axes=DW.fleetGuidance.frame(ship.forward||[0,1,0]);return {...axes,eye:ship.position,velocity:ship.velocity,throttle:1,region:0};}
 /** @param {Pose} p */const basis=p=>new Float32Array(p.right.concat(p.back.map(v=>-v),p.up));
 /** @param {string} id */function seed(id){let value=17;for(let i=0;i<id.length;i++)value=(value*31+id.charCodeAt(i))%4093;return value;}
 /** @param {import('./types').Combat} combat @param {number[]} center @param {number} region @param {number} radius */function placement(combat,center,region,radius){
  const owner=/** @type {import('./types').RenderPlacement} */({region,lensCenter:center,lensRadius:radius}),state=combat.convoy,exit=state?.evacuation&&state.elapsed>=state.evacuation.rescueAt?state.evacuation.exit:null;
  if(exit&&region===0)DW.wormholes.mouth(owner,exit.position,exit.normal,exit.radiusM/U*DW.wormholes.phase(state?.elapsed||0,exit).amount,'back');return owner;
 }
 /** @param {import('../src/freighter-types').PartBatch} source @returns {Draw} */function gpu(source){const vertices=new Float32Array(source.vertices);for(let i=0;i<vertices.length;i+=8)for(let k=0;k<3;k++)vertices[i+k]/=U;return {...source,vertices,staticGeometry:true,stride:8,opacity:source.wear?1:undefined};}
 /** @param {Draw[]} source @param {Pose} p @param {string} id @param {import('./types').RenderPlacement} owner */function placed(source,p,id,owner){return source.filter(b=>!b.wear||wearImage.complete&&wearImage.naturalWidth>0).map(b=>({...b,texture:b.wear?wearImage:b.textured?DW.convoyScenery.texture:undefined,origin:/** @type {[number,number,number]} */(p.eye),basis:basis(p),cargoSeed:b.wear?undefined:seed(id),placement:owner}));}
 /** @param {Entity} ship */function hull(ship){
  const state=DW.freighterSim.ensure(ship),catalog=DW.freighterSim.catalog(ship.model);if(!catalog)return [];
  const cached=hulls.get(ship);if(cached&&cached.catalog===catalog&&cached.state===state&&cached.revision===state.revision)return cached.batches;
  const start=performance.now();
  /** @type {Map<string,{source:import('../src/freighter-types').PartBatch;size:number;segments:{vertices:Float32Array;offset:number[];from:number;count:number}[]}>} */const buckets=new Map();
  /** @param {import('../src/freighter-types').PartBatch} source @param {number[]} offset @param {number} [from] @param {number} [count] */function append(source,offset,from=0,count=source.vertices.length){
   const key=[source.color,source.textured,source.finish,source.wear].join('|');let bucket=buckets.get(key);if(!bucket){bucket={source,size:0,segments:[]};buckets.set(key,bucket);}bucket.segments.push({vertices:source.vertices,offset,from,count});bucket.size+=count;
  }
  let triangle=0;
  for(const batch of catalog.batches){let start=-1;for(let i=0;i<batch.vertices.length;i+=24){const index=catalog.owners[triangle++],module=state.modules[index],include=index<0||!module||module.health>0&&module.damage===null;if(include&&start<0)start=i;if(!include&&start>=0){append(batch,[0,0,0],start,i-start);start=-1;}}if(start>=0)append(batch,[0,0,0],start,batch.vertices.length-start);}
  state.modules.forEach((module,index)=>{if(module.health>0&&module.damage!==null)for(const batch of DW.freighterSim.part(ship,index).batches)append(batch,catalog.defs[index].center);});
  const batches=[...buckets.values()].map(bucket=>{const vertices=new Float32Array(bucket.size);let cursor=0;for(const segment of bucket.segments){vertices.set(segment.vertices.subarray(segment.from,segment.from+segment.count),cursor);for(let i=0;i<segment.count;i+=8)for(let k=0;k<3;k++)vertices[cursor+i+k]=(vertices[cursor+i+k]+segment.offset[k])/U;cursor+=segment.count;}return {...bucket.source,vertices,staticGeometry:true,stride:8,opacity:bucket.source.wear?1:undefined};});hulls.set(ship,{catalog,state,revision:state.revision,batches});stats.preparedMs+=performance.now()-start;return batches;
 }
 /** @param {Entity} ship @param {number} index */function markLayers(ship,index){
  const module=DW.freighterSim.ensure(ship).modules[index],part=DW.freighterSim.part(ship,index),serials=module.marks.map(m=>m.serial).join(','),cached=marks.get(module);if(cached&&cached.part===part&&cached.serials===serials)return cached.layers;
  const craft=/** @type {import('./types').ArtCraft} */({index:0,hp:1,pose:identity,scorches:[]}),query=/** @type {import('../src/freighter-types').FilteredHullHit} */(DW.shipHulls.hullHit);
  for(const mark of module.marks){const from=mark.local.map((v,k)=>v+mark.normal[k]*1.2),to=mark.local.map((v,k)=>v-mark.normal[k]*2),hit=query(part.model,identity,from,to,1,0);DW.shipHulls.addScorch(craft,hit||{fraction:0,point:mark.local,local:mark.local,normal:mark.normal,model:part.model});}
  const arrays=/** @type {number[][]} */([[],[],[],[],[]]);for(const mark of craft.scorches||[])mark.layers.forEach((source,i)=>arrays[i].push(...source));
  const layers=arrays.map(data=>new Float32Array(data));marks.set(module,{part,serials,layers});return layers;
 }
 /** @param {Entity} ship */function attached(ship){
  const state=DW.freighterSim.ensure(ship),key=state.serial+':'+state.revision,cached=attachedMarks.get(ship);if(cached&&cached.state===state&&cached.key===key)return cached.layers;
  const arrays=/** @type {number[][]} */([[],[],[],[],[]]),catalog=DW.freighterSim.catalog(ship.model);if(!catalog)return [];
  state.modules.forEach((module,index)=>{if(module.health<=0||!module.marks.length)return;const center=catalog.defs[index].center;markLayers(ship,index).forEach((source,layer)=>{for(let i=0;i<source.length;i+=6)for(let k=0;k<6;k++)arrays[layer].push(source[i+k]+(k<3?center[k]:0));});});
  const layers=arrays.map(data=>{const v=new Float32Array(data);for(let i=0;i<v.length;i+=6)for(let k=0;k<3;k++)v[i+k]/=U;return v;});attachedMarks.set(ship,{state,key,layers});return layers;
 }
 /** @param {Float32Array[]} layers @param {Pose} p @param {import('./types').RenderPlacement} owner @param {boolean} [metres] */function scorchDraw(layers,p,owner,metres=false){return layers.flatMap((vertices,i)=>vertices.length?[{vertices,color:/** @type {[number,number,number]} */(colors[i]),opacity:opacity[i],staticGeometry:true,origin:/** @type {[number,number,number]} */(p.eye),basis:basis(p),scale:metres?1/U:1,placement:owner}]:[]);}
 /** @param {import('./types').Combat} combat */function geometry(combat){
  const result=/** @type {import('./types').Batch[]} */([]);stats.changedShips=0;stats.debris=0;
  for(const ship of combat.convoy?.ships||[]){const state=DW.freighterSim.ensure(ship),catalog=DW.freighterSim.catalog(ship.model);if(!catalog)continue;
   if(ship.hull>0&&(!combat.convoy?.evacuation||!ship.arrived)){const p=pose(ship),owner=placement(combat,ship.position,0,100);if(DW.freighterSim.dirty(ship)){result.push(...placed(hull(ship),p,ship.id,owner));stats.changedShips++;}result.push(...scorchDraw(attached(ship),p,owner));}
   state.modules.forEach((module,index)=>{if(!module.debris)return;const body=module.debris,p=body.pose,part=DW.freighterSim.part(ship,index);let batches=partDraws.get(part);if(!batches){batches=part.batches.map(gpu);partDraws.set(part,batches);}const owner=placement(combat,p.eye,p.region||0,Math.hypot(...catalog.defs[index].half));result.push(...placed(batches,p,ship.id,owner));if(module.marks.length)result.push(...scorchDraw(markLayers(ship,index),p,owner,true));stats.debris++;});
  }return result;
 }
 /** @param {import('./types').Combat} combat @param {Pose} view */function effects(combat,view){
  const result=/** @type {import('./types').Batch[]} */([]),sources=/** @type {{id:string;origin:number[];normal:number[];velocity:number[];region:number;age:number;serial:number}[]} */([]);
  for(const ship of combat.convoy?.ships||[]){const state=DW.freighterSim.ensure(ship),catalog=DW.freighterSim.catalog(ship.model);if(!catalog)continue;
   if(ship.hull>0&&(!combat.convoy?.evacuation||!ship.arrived)&&DW.freighterSim.dirty(ship)){const p=pose(ship),indices=DW.freighterSim.engines(ship),mounts=catalog.mouths.filter((_,i)=>indices.includes(i));if(mounts.length){const batch=DW.shipRender.engineGeometry([{index:0,hp:1,pose:p}],'',1,U,view,combat.time,mounts);batch.placement=placement(combat,ship.position,0,100);result.push(batch);}}
   state.modules.forEach((module,index)=>{if(!module.leaks.length||module.health<=0&&!module.debris||module.health>0&&(ship.hull<=0||combat.convoy?.evacuation&&ship.arrived))return;const p=module.debris?.pose||pose(ship),axes=[p.right,p.back.map(v=>-v),p.up],center=module.debris?[0,0,0]:catalog.defs[index].center;
    for(const leak of module.leaks){sources.push({id:ship.id+':'+index+':'+leak.local.join(','),origin:vector(leak.local.map((v,k)=>v+center[k]),axes).map((v,k)=>p.eye[k]+v/U),normal:vector(leak.normal,axes),velocity:p.velocity||ship.velocity,region:p.region||0,age:leak.age,serial:index*31+sources.length});}
   });
  }
  sources.sort((a,b)=>Math.hypot(...a.origin.map((v,k)=>v-view.eye[k]))-Math.hypot(...b.origin.map((v,k)=>v-view.eye[k])));
  let vent=ventStates.get(combat);if(!vent||combat.time<vent.last||combat.time-vent.last>.25){vent={last:combat.time,particles:[],emit:new Map(/** @type {[string,{age:number;budget:number;serial:number}][]} */([]))};ventStates.set(combat,vent);}const dt=Math.max(0,combat.time-vent.last);vent.last=combat.time;
  for(const particle of vent.particles){const old=particle.pose.eye.slice();particle.age+=dt;particle.pose.eye=old.map((v,k)=>v+particle.pose.velocity[k]*dt/U);if(combat.wormholes?.length&&dt)DW.wormholes.travel(combat.wormholes,old,particle.pose,combat.time,U);}vent.particles=vent.particles.filter(p=>p.age<p.life);
  const visible=sources.slice(0,8),ids=new Set(visible.map(s=>s.id));for(const id of vent.emit.keys())if(!ids.has(id))vent.emit.delete(id);
  for(const source of visible){let emitter=vent.emit.get(source.id),fresh=false;if(!emitter||source.age<emitter.age){emitter={age:source.age,budget:0,serial:source.serial};vent.emit.set(source.id,emitter);fresh=true;}
   emitter.budget+=(source.age-emitter.age)*14*Math.exp(-source.age/9);emitter.age=source.age;
   const count=fresh?Math.min(Math.floor(source.age*14),Math.floor(128/Math.max(1,visible.length)),24):Math.min(6,Math.floor(emitter.budget));if(!fresh)emitter.budget-=count;
   for(let k=0;k<count;k++){const serial=emitter.serial++,age=fresh?(k+.5)/14:0,flow=source.normal.map((v,i)=>v*3.6+Math.sin(serial*(i+2)*3.7)*.3),eye=source.origin.map((v,i)=>v+flow[i]*age/U),particle={pose:{eye,right:[1,0,0],up:[0,0,1],back:[0,-1,0],velocity:flow.map((v,i)=>v+source.velocity[i]),region:source.region},age,life:1.85,pressure:Math.exp(-source.age/9)};if(combat.wormholes?.length)DW.wormholes.travel(combat.wormholes,source.origin,particle.pose,combat.time,U);vent.particles.push(particle);if(vent.particles.length>128)vent.particles.shift();}
  }
  /** @type {Map<number,number[]>} */const clouds=new Map();
  for(const {pose,age,pressure} of vent.particles){const region=pose.region||0;let data=clouds.get(region);if(!data){data=[];clouds.set(region,data);}const radius=(.16+age*.56)/U,alpha=Math.sin(age/1.85*Math.PI)*.24*pressure;
   for(const [x,y] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]])data.push(...pose.eye.map((v,i)=>v+(view.right[i]*x+view.up[i]*y)*radius),x,y,alpha);
  }
  for(const [region,data] of clouds)result.push({vertices:new Float32Array(data),color:[.65,.82,.9],region,placement:{region}});stats.ventParticles=vent.particles.length;return result;
 }
 DW.freighterVisual={geometry,effects,stats:()=>({...stats})};
 // Keep the original intact-fleet instancing, livery, portal and arrival paths.
 // This stable derived view contains no ownership writes to the mission state.
 const originalGeometry=DW.convoyScenery.geometry,originalEffects=DW.convoyScenery.effects;
 /** @type {WeakMap<import('./types').ConvoyState,import('./types').ConvoyState>} */const intactViews=new WeakMap();
 /** @param {import('./types').Combat} combat */function intactCombat(combat){const state=combat.convoy;if(!state)return combat;let view=intactViews.get(state);if(!view){view={...state,ships:[]};intactViews.set(state,view);}Object.assign(view,state);view.ships=state.ships.filter(ship=>!DW.freighterSim.dirty(ship));return {...combat,convoy:view};}
 DW.convoyScenery.geometry=function(combat){if(!this.visible)return [];return originalGeometry.call(this,intactCombat(combat)).concat(geometry(combat));};
 DW.convoyScenery.effects=function(combat,view){if(!this.visible)return [];return originalEffects.call(this,intactCombat(combat),view).concat(effects(combat,view));};
}());
