// One inspection scene, with adapters over the production flight draw buffers.
const DW=window.Driftworks,U=DW.sim.METERS_PER_UNIT;
const el=id=>document.getElementById(id),host=el('viewer');
const query=new URLSearchParams(location.search);
const identity={eye:[0,0,0],right:[1,0,0],back:[0,-1,0],up:[0,0,1],velocity:[0,0,0],throttle:1};
let world=DW.sim.createInitialWorld();
world.asteroids=[];world.ships=[];world.hostiles=[];world.structures=[];world.platforms=[];world.wrecks=[];world.packets=[];world.combat.drones=[];
const scene=DW.scene3d.create(host,()=>world,next=>world=next,{study:true});
const sky=DW.flightSkybox.create(host,{style:7,styleControls:false,fov:45,optics:false});
let batches=[],rig=null,entry=null,revision=0,loading=true,error='',center=[0,0,0],homeCenter=[0,0,0],halfSize=[1,1,1],radius=1,distance=3,yaw=-.8,pitch=.35,turntable=false,drag=null,last=0,pose=identity;
let cargoReady=null,cargoAsset=null,capitalReady=null,preparationMs=0,seed=Math.max(0,Math.min(4092,Math.floor(Number(query.has('seed')?query.get('seed'):17)||0)));
const fighters=(DW.shipPacks||[]).filter(p=>p.id!=='ohio-vehicles').flatMap(p=>p.models.map(m=>({id:m.id,name:m.name,kind:'fighter',description:`${p.author} · ${p.license} · Flight-ready fighter artwork.`})));
const families={fighters,capitals:[{id:'aegis',name:'Aegis dreadnaught',kind:'capital',description:'Production capital hull, armor, hangars, engines and articulated batteries. Authored metre scale.'}],freighters:[
 {id:'container',name:'Container carrier',kind:'freighter',description:'Compact carrier with individually varied cargo boxes. Uses the baked flight mesh and per-vessel cargo seed.'},
 {id:'mixed',name:'Container feeder',kind:'freighter',description:'Mixed freight configuration. Shuffle the seed to change its cargo and operator.'},
 {id:'fluid',name:'Bulk tanker',kind:'freighter',description:'Dedicated fluid carrier with production operator liveries.'}
],wormholes:[{id:'ellis',name:'Ellis wormhole',kind:'wormhole',description:'A spherical throat, inspected as an object from either side. Background lensing uses the shared production Ellis calculation.'}]};
const norm=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function camera(){const back=[Math.cos(yaw)*Math.cos(pitch),Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch)],right=norm(cross([0,0,1],back));pose={eye:center.map((x,i)=>x+back[i]*distance),right,up:cross(back,right),back};scene.setSurfaceCamera(pose);}
function bounds(){
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const b of batches){const v=b.vertices,stride=b.stride||6;for(let i=0;i<v.length;i+=stride){const p=[v[i],v[i+1],v[i+2]];for(let k=0;k<3;k++){const n=(b.origin?.[k]||0)+(b.basis?p[0]*b.basis[k]+p[1]*b.basis[k+3]+p[2]*b.basis[k+6]:p[k]);lo[k]=Math.min(lo[k],n);hi[k]=Math.max(hi[k],n);}}}
 if(!Number.isFinite(lo[0]))throw Error('Object has no visible mesh');
 center=lo.map((n,i)=>(n+hi[i])/2);homeCenter=center.slice();const size=hi.map((n,i)=>n-lo[i]);halfSize=size.map(n=>n/2);radius=Math.hypot(...size)/2;
 el('dimensions').textContent=size.map(n=>(n*U).toLocaleString(undefined,{maximumFractionDigits:1})).join(' × ')+' m';
}
function fit(){center=homeCenter.slice();camera();const aspect=host.clientWidth/Math.max(1,host.clientHeight),tanY=Math.tan(Math.PI/8),tanX=tanY*aspect;if(entry?.kind==='wormhole')distance=radius/Math.sin(Math.atan(Math.min(tanX,tanY)))*1.12;else{distance=0;for(let mask=0;mask<8;mask++){const p=halfSize.map((n,i)=>n*(mask&(1<<i)?1:-1)),dot=axis=>p.reduce((n,x,i)=>n+x*axis[i],0);distance=Math.max(distance,dot(pose.back)+Math.max(Math.abs(dot(pose.right))/tanX,Math.abs(dot(pose.up))/tanY));}distance*=1.12;}camera();}
function preset(){const angles={quarter:[-.8,.35],front:[-Math.PI/2,0],rear:[Math.PI/2,0],side:[0,0],top:[-Math.PI/2,1.56],below:[-Math.PI/2,-1.56]};[yaw,pitch]=angles[el('view').value];if(entry?.kind==='capital')yaw-=Math.PI/2;camera();}
function updateURL(){const q=new URLSearchParams({family:el('category').value,object:el('object').value,sky:el('environment').value,destination:el('destination').value,side:el('side').value,seed:String(seed),view:el('view').value,lighting:el('lighting').value,engines:String(el('engines').checked)});q.set('camera',[...center,distance,yaw,pitch].join(','));history.replaceState(null,'','?'+q);}
async function freight(){if(!cargoReady)cargoReady=(async()=>{const base='../assets/ships/industrial-kit/',url=p=>DW.assetUrl(base+p);const [meta,bytes,paint]=await Promise.all([fetch(url('convoy-flight.json')).then(r=>{if(!r.ok)throw Error('Freighter manifest unavailable');return r.json();}),fetch(url('convoy-flight.bin')).then(r=>{if(!r.ok)throw Error('Freighter mesh unavailable');return r.arrayBuffer();}),import(url('cargo-paint.js'))]);const image=new Image();image.src=url('panels.png');await image.decode();const texture=await paint.prepareCargoImage(image);DW.convoyScenery.install(meta,bytes,texture);return {meta,paint};})().catch(e=>{cargoReady=null;throw e;});return cargoReady;}
async function selectObject(restore=false,preserve=false){
 const preparationStart=performance.now();
 const savedCamera={center:center.slice(),distance,yaw,pitch};
 const ticket=++revision;loading=true;error='';batches=[];rig=null;scene.setStudyActors([]);scene.setStudyEffects([]);
 entry=families[el('category').value].find(e=>e.id===el('object').value);
 el('title').textContent=entry.name;el('description').textContent=entry.description;el('family-label').textContent=el('category').selectedOptions[0].textContent.toUpperCase();
 el('cargo-controls').hidden=entry.kind!=='freighter';el('destination-controls').hidden=entry.kind!=='wormhole';el('engines').disabled=entry.kind==='wormhole';el('dimensions').textContent='';
 try{
  let result=[],nextRig=null;
  if(entry.kind==='fighter'){const model=DW.shipPackModels.find(entry.id).model,textures=await DW.shipPackModels.loadTextures([entry.id]);result=[DW.shipPackModels.sourceGeometry(model,[identity],U,textures.get(model.id))];result.forEach(b=>b.staticGeometry=true);}
  else if(entry.kind==='capital'){if(!capitalReady)capitalReady=DW.aegisFlight.load().catch(e=>{capitalReady=null;throw e;});await capitalReady;if(ticket!==revision)return;nextRig=DW.aegisFlight.create();result=nextRig.geometry();}
  else if(entry.kind==='freighter'){const {meta}=await freight();if(ticket!==revision)return;cargoAsset=meta;if(!meta.variants[entry.id])throw Error('Unknown flight freighter variant: '+entry.id);result=DW.convoyScenery.preview(entry.id).map(b=>({...b,cargoSeed:seed}));}
  if(ticket!==revision)return;batches=result;rig=nextRig;
  if(entry.kind==='wormhole'){center=[0,0,0];homeCenter=center.slice();radius=300/U;el('dimensions').textContent='600 m throat diameter';}else bounds();
  preset();fit();
  if(preserve){({center,distance,yaw,pitch}=savedCamera);camera();}
  if(restore&&query.has('camera')){const values=query.get('camera').split(',').map(Number);if(values.length===6&&values.every(Number.isFinite)&&values[3]>0&&Math.abs(values[5])<Math.PI/2){center=values.slice(0,3);[distance,yaw,pitch]=values.slice(3);camera();}}
  el('fly').href='../experiments/flight.html'+(entry.kind==='capital'?'?aegis=1':entry.kind==='freighter'?'?mission=convoy':entry.kind==='wormhole'?'?mission=ellis':'');
  scene.setStudyActors(batches);preparationMs=performance.now()-preparationStart;loading=false;updateURL();
 }catch(e){if(ticket!==revision)return;loading=false;error=String(e);el('status').textContent=error;console.error(e);}
}
function populate(restore=false){const family=families[el('category').value];el('object').replaceChildren(...family.map(e=>new Option(e.name,e.id)));const requested=restore?query.get('object'):null;if(family.some(e=>e.id===requested))el('object').value=requested;else if(el('category').value==='fighters'&&family.some(e=>e.id.endsWith(':Striker')))el('object').value=family.find(e=>e.id.endsWith(':Striker')).id;return selectObject(restore);}
el('category').onchange=()=>populate();el('object').onchange=()=>selectObject();
el('view').onchange=()=>{preset();fit();updateURL();};el('fit').onclick=()=>{fit();updateURL();};
el('spin').onclick=()=>{turntable=!turntable;el('spin').setAttribute('aria-pressed',String(turntable));};
function shuffle(){seed=(seed+1+Math.floor(Math.random()*4092))%4093;el('cargo-seed').value=String(seed);selectObject(false,true);}
el('shuffle').onclick=shuffle;el('cargo-seed').value=String(seed);el('cargo-seed').onchange=()=>{seed=Math.max(0,Math.min(4092,Math.floor(Number(el('cargo-seed').value)||0)));el('cargo-seed').value=String(seed);selectObject(false,true);};
el('share').onclick=async()=>{updateURL();try{await navigator.clipboard.writeText(location.href);el('share').textContent='Link copied';}catch{el('share').textContent='Copy the address bar link';}};
for(const id of ['environment','destination','side','lighting','engines'])el(id).onchange=updateURL;
// Surface-camera mode keeps navigation in the inspection controller. Capture
// gestures before the tactical orbit handler sees them.
host.addEventListener('contextmenu',e=>e.preventDefault());
host.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;e.stopImmediatePropagation();drag={x:e.clientX,y:e.clientY,pan:e.button===2,id:e.pointerId};host.setPointerCapture(e.pointerId);},true);
host.addEventListener('pointermove',e=>{if(!drag)return;e.stopImmediatePropagation();const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;if(drag.pan){const scale=distance*2*Math.tan(Math.PI/8)/host.clientHeight;center=center.map((n,i)=>n+(-pose.right[i]*dx+pose.up[i]*dy)*scale);}else{yaw-=dx*.006;pitch=Math.max(-1.56,Math.min(1.56,pitch+dy*.006));}camera();},true);
function stopDrag(){if(drag){drag=null;updateURL();}}host.addEventListener('pointerup',stopDrag,true);host.addEventListener('pointercancel',stopDrag,true);host.addEventListener('lostpointercapture',stopDrag,true);
host.addEventListener('wheel',e=>{e.preventDefault();e.stopImmediatePropagation();distance=Math.max(radius*(entry?.kind==='wormhole'?1.001:.025),Math.min(radius*200,distance*Math.exp(e.deltaY*.001)));camera();updateURL();},{passive:false,capture:true});
host.addEventListener('dblclick',e=>{e.stopImmediatePropagation();if(entry?.kind==='wormhole'){center=[0,0,0];camera();updateURL();return;}const rect=host.getBoundingClientRect(),sx=(e.clientX-rect.left-rect.width/2)*2*Math.tan(Math.PI/8)/rect.height,sy=-(e.clientY-rect.top-rect.height/2)*2*Math.tan(Math.PI/8)/rect.height;const ray=norm(pose.back.map((n,i)=>-n+pose.right[i]*sx+pose.up[i]*sy));const hit=DW.scene3d.pickStudyBatches(pose.eye,ray,batches.map(b=>({data:b.vertices,stride:b.stride||6,origin:b.origin||[0,0,0],basis:b.basis,rotation:0,spin:0,scale:[b.scale||1,b.scale||1,b.scale||1]})));if(hit){center=hit;camera();updateURL();}},true);
let samples=[];
function frame(now){requestAnimationFrame(frame);if(document.hidden||window.objectViewer.suspended||now-last<1000/30)return;const dt=Math.min(.1,(now-last)/1000);last=now;if(turntable&&!drag){yaw+=dt*.16;camera();}
 const start=performance.now(),worm=entry?.kind==='wormhole',side=el('side').value==='1';
 const local=el(side&&worm?'destination':'environment').value||'style-7',destination=el(side&&worm?'environment':'destination').value||'rime';
 if(local.startsWith('style-')&&sky.getStyle()!==Number(local.slice(6)))sky.setStyle(Number(local.slice(6)));
 sky.setLightingEnabled(el('lighting').value==='sky');
 sky.render(pose,1,false,dt,0,{position:[0,0,0],radius:worm?300:0,sky:destination,localSky:local});
 let effects=[];
 if(!loading&&el('engines').checked){if(rig)effects=rig.effects(pose,false);else if(entry?.kind==='fighter')effects=[DW.shipPackModels.engineGeometry([{index:0,hp:1,pose:identity}],entry.id,1,U,pose,now/1000)];else if(entry?.kind==='freighter'&&cargoAsset)effects=[DW.shipRender.engineGeometry([{index:0,hp:1,pose:identity}],'',1,U,pose,now/1000,cargoAsset.variants[entry.id].engineMouths)];}
 scene.setStudyEffects(effects);
 scene.sync(world);scene.render(world,1,0,dt);samples.push(performance.now()-start);if(samples.length>120)samples.shift();
 if(!error){const stats=scene.getRenderStats();el('status').textContent=loading?'Loading object…':`${stats.drawCalls} draws · ${stats.triangles.toLocaleString()} triangles · ${host.clientWidth} × ${host.clientHeight} CSS px\n${worm?'Production Ellis sky optics · orbit / zoom around throat':'Production flight renderer · authored scale'}`;}
}
// Read-only diagnostics for focused browser regression and performance captures.
window.objectViewer={scene,sky,suspended:false,draw:()=>scene.render(world,1,0,0),get state(){return {entry,loading,error,batches,pose,center,radius,distance,seed,preparationMs,samples:samples.slice(),stats:scene.getRenderStats()};}};
let viewportSize=[host.clientWidth,host.clientHeight].join(',');
new ResizeObserver(()=>{const size=[host.clientWidth,host.clientHeight].join(',');if(size!==viewportSize){viewportSize=size;if(entry&&!loading){fit();updateURL();}}}).observe(host);
try{
 const catalog=await fetch(DW.assetUrl('../assets/backgrounds/flight-environments-v1/catalog.json')).then(r=>{if(!r.ok)throw Error('Sky catalog unavailable');return r.json();});
 const labels=['Milky Way','Open void','Galactic horizon','Dark dust','Distant sun','Cold veil','Island universes','Hero galaxy','Hero nebula','Hero sun','River of stars','Woven starlight','Orbital impact'];
 const keys=[...catalog.styles,...new Set(Object.values(catalog.spaces)),...new Set(Object.values(catalog.missions))].filter((v,i,a)=>a.indexOf(v)===i);
 for(const id of ['environment','destination']){el(id).replaceChildren(...keys.map(key=>new Option(key.startsWith('style-')?labels[Number(key.slice(6))]:key.replaceAll('-',' '),key)));el(id).value=keys.includes(query.get(id==='environment'?'sky':id))?query.get(id==='environment'?'sky':id):id==='environment'?'style-7':'rime';}
 if(Object.hasOwn(families,query.get('family')))el('category').value=query.get('family');if(['quarter','front','rear','side','top','below'].includes(query.get('view')))el('view').value=query.get('view');el('side').value=query.get('side')==='1'?'1':'0';el('lighting').value=query.get('lighting')==='sky'?'sky':'inspection';el('engines').checked=query.get('engines')!=='false';
 await sky.ready;await populate(true);camera();requestAnimationFrame(frame);
}catch(e){error=String(e);el('status').textContent=error;console.error(e);}
