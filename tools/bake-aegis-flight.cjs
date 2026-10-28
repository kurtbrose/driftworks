'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');
(async()=>{
 const root=path.join(__dirname,'..'),T=await import(pathToFileURL(path.join(root,'vendor/three/build/three.module.js')).href);
 const initial={prow:'lance',count:'6',mission:'standard',drive:'heavy',attachment:'turret',ventral:'turret',explode:'0',preset:'battleship'};
 const elements={};const el=id=>elements[id]||=( {value:initial[id]||'',checked:false,clientWidth:1200,clientHeight:800,addEventListener(t,f){this[t]=f;},prepend(){}});
 class Renderer{setPixelRatio(){}setClearColor(){}setSize(){}setAnimationLoop(){}}
 class Controls{constructor(){this.target=new T.Vector3();}update(){}}
 const ctx=vm.createContext({THREE:{...T,WebGLRenderer:Renderer},OrbitControls:Controls,window:{},devicePixelRatio:1,document:{getElementById:el},ResizeObserver:class{observe(){}}});
 vm.runInContext(fs.readFileSync(path.join(root,'assets/ships/aegis-kit/reference-fighter.js'),'utf8'),ctx);
 const html=fs.readFileSync(path.join(root,'experiments/dreadnaught-kit.html'),'utf8');
 vm.runInContext(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;$/gm,''),ctx);
 vm.runInContext("el('preset').value='battleship';el('preset').change()",ctx);
 const ship=vm.runInContext('ship',ctx);ship.updateMatrixWorld(true);
 const hangarStudy=!process.argv.includes('--legacy-hangar'),interiors=new Map();let removedMeshes=0,removedTriangles=0;
 if(hangarStudy)for(const group of ship.children.filter(o=>o.name.endsWith('_hangar'))){
   const center=group.getWorldPosition(new T.Vector3());
   for(const o of group.children.slice()){
     if(!o.isMesh||o.geometry.type!=='BoxGeometry')continue;
     const p=o.position;
     // Retain real structure; remove the raised paint bars and intrusive light blocks.
     if(Math.abs(p.x)<6.2&&Math.abs(p.y)<=1.3){removedMeshes++;removedTriangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;group.remove(o);continue;}
     if(p.x===0&&Math.abs(p.y)===2.65)o.userData.hangarSurface={kind:p.y<0?'deck':'ceiling',center:center.x*9};
     if(Math.abs(p.x)===6.7&&p.y===0)o.userData.hangarSurface={kind:'bulkhead',side:Math.sign(p.x),center:center.x*9};
   }
 }
 const statics=new Map(),turrets=[],engines=[],windows=[];
 const surfaceStudy=process.argv.includes('--surface-study'),surface=require('./lib/aegis-surface-uv.cjs');
 const surfaceUV=new Map(),structureRecords=[];
 const armorStudy=process.argv.includes('--armor-study'),armorRecords=[];
 const beltStudy=process.argv.includes('--belt-study'),beltRecords=[];
 const structureStudy=process.argv.includes('--structure-study');
 const convert=v=>[v.x*9,-v.z*9,v.y*9];
 function add(map,o,pivot){
   const key=o.material.uuid;let b=map.get(key);if(!b){b={color:o.material.color.toArray(),vertices:[]};map.set(key,b);}
   const geo=o.geometry,positions=geo.attributes.position,normals=geo.attributes.normal,nm=new T.Matrix3().getNormalMatrix(o.matrixWorld),flip=o.matrixWorld.determinant()<0;
   const start=b.vertices.length,surfacePoints=[];
   for(let i=0;i<(geo.index?geo.index.count:positions.count);i++){
    const order=flip?Math.floor(i/3)*3+[0,2,1][i%3]:i;
    const n=geo.index?geo.index.getX(order):order,p=new T.Vector3().fromBufferAttribute(positions,n).applyMatrix4(o.matrixWorld).sub(pivot),normal=new T.Vector3().fromBufferAttribute(normals,n).applyMatrix3(nm).normalize();
    const interior=o.userData.hangarSurface;
    if(interior&&((interior.kind==='deck'&&normal.y>.99)||(interior.kind==='ceiling'&&normal.y<-.99)||(interior.kind==='bulkhead'&&normal.x*interior.side<-.99))){
      const kind=interior.kind,point=convert(p);let record=interiors.get(kind);
      if(!record){record={kind,vertices:[],uv:[]};interiors.set(kind,record);}
      if(kind!=='bulkhead')point[0]=Math.max(interior.center-53.1,Math.min(interior.center+53.1,point[0]));
      record.vertices.push(...point,normal.x,-normal.z,normal.y);
      record.uv.push(kind==='bulkhead'?(42.75-interior.side*point[1])/85.5:(point[0]-interior.center+53.1)/106.2,kind==='bulkhead'?(11.7-point[2])/23.4:(42.75-point[1])/85.5);
      continue;
    }
    b.vertices.push(...convert(p),normal.x,-normal.z,normal.y);
    if(surface)surfacePoints.push([p.x,p.y,p.z,normal.x,normal.y,normal.z]);
   }
   if(o.geometry.type==='BoxGeometry'&&((Math.abs(o.geometry.parameters.width-.23)<1e-6&&Math.abs(o.geometry.parameters.height-.12)<1e-6)||(Math.abs(o.geometry.parameters.width-.22)<1e-6&&Math.abs(o.geometry.parameters.height-.13)<1e-6)))windows.push({color:b.color,start,length:b.vertices.length-start});
   if(map===statics&&geo.type==='BoxGeometry'&&Math.max(...b.color)<.05&&geo.parameters.depth<=.101&&geo.parameters.depth>=.059&&geo.parameters.height>.2&&geo.parameters.width>.8){beltRecords.push({batch:b,start,length:b.vertices.length-start,vertices:b.vertices.slice(start)});}
   if(map===statics){
     const span=[0,1,2].map(k=>Math.max(...surfacePoints.map(p=>p[k]))-Math.min(...surfacePoints.map(p=>p[k]))),color=o.material.color.toArray(),bright=Math.max(...color);
     geo.computeBoundingBox();const localSize=geo.boundingBox.getSize(new T.Vector3()).multiply(o.getWorldScale(new T.Vector3()));
     if(bright<.2&&Math.max(...span)>2&&Math.min(localSize.x,localSize.y,localSize.z)>.15){
       const lo=[0,1,2].map(k=>Math.min(...surfacePoints.map(p=>p[k]))),uv=[];
       for(const p of surfacePoints){let axis=0;for(let k=1;k<3;k++)if(Math.abs(p[k+3])>Math.abs(p[axis+3]))axis=k;const plane=[0,1,2].filter(k=>k!==axis);plane.sort((a,b)=>span[b]-span[a]);uv.push(.005+.99*(p[plane[0]]-lo[plane[0]])/Math.max(.001,span[plane[0]]),.005+.99*(p[plane[1]]-lo[plane[1]])/Math.max(.001,span[plane[1]]));}
       structureRecords.push({batch:b,start,length:b.vertices.length-start,uv});
     }
   }
   if(armorStudy&&Math.max(...b.color)>.28&&Math.max(...b.color)-Math.min(...b.color)<.22&&surfacePoints.length){const wrapped=require('../output/aegis-armor-wrap.cjs')(surfacePoints);armorRecords.push({batch:b,start,length:b.vertices.length-start,...wrapped});}
   if(surface){if(!surfaceUV.has(b))surfaceUV.set(b,[]);surfaceUV.get(b).push(...surface.meshUV(surfacePoints,o.material.color.toArray()));}
 }
 ship.traverse(o=>{if(o.name==='turret_pitch'){
   const pivot=o.getWorldPosition(new T.Vector3()),batches=new Map();o.traverse(m=>{if(m.isMesh)add(batches,m,pivot);});
   const kind=o.parent.parent.name==='point_defense'?'point-defense':'heavy';
   turrets.push({id:'aegis-turret-'+turrets.length,kind,position:convert(pivot),side:pivot.y>0?1:-1,batches:Array.from(batches.values())});
 }});
 ship.traverse(o=>{if(o.name.startsWith('engine_')){
   const pivot=o.localToWorld(new T.Vector3(...o.userData.pivot)),batches=new Map();
   o.traverse(m=>{if(m.isMesh)add(batches,m,pivot);});
   engines.push({id:'aegis-engine-'+engines.length,position:convert(pivot),batches:Array.from(batches.values())});
 }});
 ship.traverse(o=>{if(!o.isMesh)return;let p=o.parent;while(p){if(p.name==='turret_pitch'||p.name.startsWith('engine_'))return;p=p.parent;}add(statics,o,new T.Vector3());});
 const modules=ship.children.filter(o=>o.name.startsWith('M_')).map(o=>({id:o.name,type:o.name.split('_').slice(2).join('_'),position:convert(o.getWorldPosition(new T.Vector3()))}));
 const hangars=modules.filter(m=>m.type==='hangar').map(m=>({id:m.id,position:m.position,halfWidth:45,halfHeight:10}));
 const data={modules,hangars,engines,name:'Aegis dreadnaught',lengthMeters:1305,source:'experiments/dreadnaught-kit.html',batches:Array.from(statics.values()),turrets};
 function finish(b,index){
   const uv=surfaceUV.get(b),textured=uv.some((v,i)=>i%2===0&&Math.abs(v-.875)>1e-5);
   if(!textured)return null;
   return {uv,color:Math.max(...b.color)<.05?[.065,.075,.08]:b.color.map(v=>Math.min(1,v*1.06)),plainUV:[(1568+index*60)/2048,556/1024]};
 }
 data.surface={atlas:'surface-atlas.png',batches:data.batches.map(finish),turrets:turrets.map(t=>t.batches.map(b=>finish(b,data.batches.findIndex(h=>h.color.join(',')===b.color.join(',')))))};
 data.surface.batches.forEach((f,i)=>{if(f)f.uv=surface.hangarMarkings(data.batches[i].vertices,f.uv,hangars);});
 if(process.argv.includes('--hangar-study')){
   const source=fs.readFileSync(path.join(root,'output/aegis-hangar-before-rig.js'),'utf8').replace(/\r\n/g,'\n');
   const study={sourceHash:require('node:crypto').createHash('sha256').update(source).digest('hex'),removedMeshes,removedTriangles,batches:data.batches,surface:data.surface,interiors:Array.from(interiors.values())};
   const text='// Generated by node tools/bake-aegis-flight.cjs --hangar-study. Review-only geometry.\nwindow.AegisHangarData='+JSON.stringify(study,(_,v)=>typeof v==='number'?Number(v.toFixed(6)):v)+';\n',target=path.join(root,'output/aegis-hangar-data.js');
   if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8')!==text)throw new Error('Hangar study is stale');}else fs.writeFileSync(target,text);
   console.log('Hangar study: removed '+removedMeshes+' paint/light blocks ('+removedTriangles+' triangles), '+interiors.size+' interior finishes');return;
 }
 data.interiors=Array.from(interiors.values()).map(b=>({kind:b.kind,vertices:b.vertices,color:b.kind==='ceiling'?[.23,.25,.26]:[.85,.85,.85],finish:b.kind==='ceiling'?null:{uv:b.uv,color:[.85,.85,.85],plainUV:[0,0],atlas:'hangar-v1/'+b.kind+'.png'}}));
 if(process.argv.includes('--windows-study')){const study={windows:windows.map(w=>({...w,batch:data.batches.findIndex(b=>b.color.join(',')===w.color.join(','))}))};const text='window.AegisWindowsData='+JSON.stringify(study)+';\n';const file=path.join(root,'output/aegis-windows-data.js');if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==text)throw new Error('Windows study is stale');}else fs.writeFileSync(file,text);console.log('Window study: '+windows.length+' existing apertures');return;}
 // Extract every authored viewport, including the narrower prow apertures.
 const glass={kind:'windows',vertices:[],color:[.8,.8,.8],finish:{uv:[],color:[.8,.8,.8],plainUV:[0,0],atlas:'window-atlas.png',shader:-2}},removed=new Map();
 windows.forEach((w,index)=>{
   const b=data.batches.find(b=>b.color.join(',')===w.color.join(','));if(!removed.has(b))removed.set(b,new Set());const omit=removed.get(b),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
   for(let i=w.start;i<w.start+w.length;i+=6){omit.add(i/6);for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],b.vertices[i+a]);hi[a]=Math.max(hi[a],b.vertices[i+a]);}}
   const tile=index%8;
   for(let i=w.start;i<w.start+w.length;i+=6){const p=b.vertices.slice(i,i+6);let u=.005,v=.005;if(Math.abs(p[4])>.99){u=(p[0]-lo[0])/(hi[0]-lo[0]);if(p[4]>0)u=1-u;v=(hi[2]-p[2])/(hi[2]-lo[2]);u=(4+u*248)/256;v=(4+v*120)/128;}glass.vertices.push(...p);glass.finish.uv.push(((tile%4)+u)/4,(Math.floor(tile/4)+v)/2);}
 });
 for(const [b,omit] of removed){const index=data.batches.indexOf(b);b.vertices=b.vertices.filter((v,i)=>!omit.has(Math.floor(i/6)));surfaceUV.set(b,surfaceUV.get(b).filter((v,i)=>!omit.has(Math.floor(i/2))));if(data.surface.batches[index])data.surface.batches[index].uv=data.surface.batches[index].uv.filter((v,i)=>!omit.has(Math.floor(i/2)));}
 data.interiors.push(glass);
 // Bake the approved open bells into each engine's existing independently damaged batches.
 const noop=()=>{},paint=new Proxy({createRadialGradient:()=>({addColorStop:noop})},{get:(o,k)=>o[k]||noop,set:(o,k,v)=>(o[k]=v,true)});
 const nozzle=require('./lib/aegis-nozzle.cjs');
 const engineInputs=data.engines.flatMap(e=>e.batches.map(b=>({vertices:new Float32Array(b.vertices),color:b.color,origin:e.position.map((v,i)=>v+(i===2?1200:0))})));
 const prepared=nozzle(engineInputs,data,1,{getContext:()=>paint});let engineIndex=0;
 data.engines.forEach(e=>e.batches.forEach(b=>{const out=prepared[engineIndex++].vertices;b.vertices=[];const uv=[];for(let i=0;i<out.length;i+=8){b.vertices.push(...out.slice(i,i+6));uv.push(out[i+6],out[i+7]);}b.finish={uv,color:[1,1,1],plainUV:[0,0],atlas:'engine-atlas.png',shader:0};}));

 // Window extraction compacts source batches; remap structural ranges before extraction.
 const structureRanges=structureRecords.map(r=>{const batch=data.batches.indexOf(r.batch),omit=removed.get(r.batch);let before=0;if(omit)for(const i of omit)if(i<r.start/6)before++;return {batch,start:r.start-before*6,length:r.length,uv:r.uv};});
 if(structureStudy){
   const records=structureRanges;
   const text='window.AegisStructureData='+JSON.stringify({records},(_,v)=>typeof v==='number'?Number(v.toFixed(6)):v)+';\n';
   fs.writeFileSync(path.join(root,'output/aegis-structure-data.js'),text);console.log('Structure study: '+records.length+' existing meshes, '+records.reduce((n,r)=>n+r.length/18,0)+' triangles');return;
 }
 // Preserve every structural triangle while giving all exposed faces a shared finish.
 const structure={kind:'structure',vertices:[],color:[.32,.35,.37],finish:{uv:[],color:[.32,.35,.37],plainUV:[0,0],atlas:'structure-v1/graphite.png',shader:0}},structureOmit=new Map();
 for(const r of structureRanges){const b=data.batches[r.batch];if(!structureOmit.has(r.batch))structureOmit.set(r.batch,new Set());const omit=structureOmit.get(r.batch);for(let k=r.start;k<r.start+r.length;k+=6){structure.vertices.push(...b.vertices.slice(k,k+6));omit.add(k/6);}structure.finish.uv.push(...r.uv);}
 for(const [index,omit] of structureOmit){const b=data.batches[index];b.vertices=b.vertices.filter((v,i)=>!omit.has(Math.floor(i/6)));surfaceUV.set(b,surfaceUV.get(b).filter((v,i)=>!omit.has(Math.floor(i/2))));if(data.surface.batches[index])data.surface.batches[index].uv=data.surface.batches[index].uv.filter((v,i)=>!omit.has(Math.floor(i/2)));}
 data.interiors.push(structure);
 const beltRanges=beltRecords.map(r=>{const batch=data.batches.indexOf(r.batch),w=removed.get(r.batch),s=structureOmit.get(batch);let start=r.start;if(w)start-=Array.from(w).filter(i=>i<r.start/6).length*6;const compact=start;if(s)start-=Array.from(s).filter(i=>i<compact/6).length*6;return {batch,start,length:r.length,vertices:r.vertices};});
 if(beltStudy){
   const records=beltRanges;
   fs.writeFileSync(path.join(root,'output/aegis-belt-source.js'),'window.AegisBeltSource='+JSON.stringify({records})+';\n');console.log('Belt source: '+records.length+' panels; production unchanged');return;
 }
 if(armorStudy){
   const records=armorRecords.map(r=>{let batch=data.batches.indexOf(r.batch),turret=-1,part=-1;if(batch<0){turret=data.turrets.findIndex(t=>t.batches.includes(r.batch));if(turret>=0)part=data.turrets[turret].batches.indexOf(r.batch);}
     if(batch<0&&turret<0)return null;
     const vertices=[],uv=[];for(let i=0;i<r.vertices.length;i+=8){vertices.push(...r.vertices.slice(i,i+6));uv.push(...r.vertices.slice(i+6,i+8));}
     const marked=batch>=0?surface.hangarMarkings(vertices,uv,hangars):uv;for(let i=0;i<r.vertices.length/8;i++){r.vertices[i*8+6]=marked[i*2];r.vertices[i*8+7]=marked[i*2+1];}
     return {batch,turret,part,start:r.start,length:r.length,vertices:r.vertices,added:r.added};}).filter(Boolean);
   fs.writeFileSync(path.join(root,'output/aegis-armor-wrap-data.js'),'window.AegisArmorWrapData='+JSON.stringify({records},(_,v)=>typeof v==='number'?Number(v.toFixed(6)):v)+';\n');
   console.log('Armor wrap: '+records.length+' meshes; '+records.reduce((n,r)=>n+r.added,0)+' seam triangles added; production unchanged');return;
 }
 const baked=require('./lib/aegis-window-belts.cjs')(data,beltRanges,surfaceStudy?Array.from(statics.values()).map(b=>surfaceUV.get(b)):null);
 Object.assign(data,baked);
 const output='// Generated by tools/bake-aegis-flight.cjs. Coordinates and pivots are meters, Z-up.\nwindow.Driftworks=window.Driftworks||{};\nwindow.Driftworks.aegisFlightAsset='+JSON.stringify(data,(_,v)=>typeof v==='number'?Number(v.toFixed(6)):v)+';\n';
 const target=path.join(root,'assets/ships/aegis-kit/flight-rig.js');
 if(surfaceStudy){
   const crypto=require('node:crypto');
   const baseline=fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n');
   if(baseline!==output)throw new Error('Bake the production rig before preparing a surface study');
   const studyUV=baked.studyUV;
   const study={turrets:turrets.map(t=>t.batches.map(b=>surfaceUV.get(b).map(v=>Number(v.toFixed(6))))),sourceHash:crypto.createHash('sha256').update(baseline).digest('hex'),uv:studyUV};
   const text='// Generated by node tools/bake-aegis-flight.cjs --surface-study. Review-only UVs; original geometry is unchanged.\nwindow.AegisSurfaceData='+JSON.stringify(study)+';\n';
   const studyTarget=path.join(root,'output/aegis-surface-data.js');
   if(process.argv.includes('--check')){if(fs.readFileSync(studyTarget,'utf8')!==text)throw new Error('Aegis surface study is stale');}else fs.writeFileSync(studyTarget,text);
   console.log('Aegis surface study: '+text.length+' bytes');return;
 }
 if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n')!==output)throw new Error('Aegis flight rig is stale');}else fs.writeFileSync(target,output);
 console.log('Aegis flight rig: '+turrets.length+' articulated batteries, '+output.length+' bytes');
})().catch(e=>{console.error(e);process.exitCode=1;});
