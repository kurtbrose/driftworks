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
 const statics=new Map(),turrets=[],engines=[];
 const surfaceStudy=process.argv.includes('--surface-study'),surface=require('./lib/aegis-surface-uv.cjs');
 const surfaceUV=new Map();
 const convert=v=>[v.x*9,-v.z*9,v.y*9];
 function add(map,o,pivot){
   const key=o.material.uuid;let b=map.get(key);if(!b){b={color:o.material.color.toArray(),vertices:[]};map.set(key,b);}
   const geo=o.geometry,positions=geo.attributes.position,normals=geo.attributes.normal,nm=new T.Matrix3().getNormalMatrix(o.matrixWorld),flip=o.matrixWorld.determinant()<0;
   const surfacePoints=[];
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
   return {uv,color:Math.max(...b.color)<.05?[.026,.034,.04]:b.color.map(v=>Math.min(1,v*1.06)),plainUV:[(1568+index*60)/2048,556/1024]};
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
 const output='// Generated by tools/bake-aegis-flight.cjs. Coordinates and pivots are meters, Z-up.\nwindow.Driftworks=window.Driftworks||{};\nwindow.Driftworks.aegisFlightAsset='+JSON.stringify(data,(_,v)=>typeof v==='number'?Number(v.toFixed(6)):v)+';\n';
 const target=path.join(root,'assets/ships/aegis-kit/flight-rig.js');
 if(surfaceStudy){
   const crypto=require('node:crypto');
   const baseline=fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n');
   if(baseline!==output)throw new Error('Bake the production rig before preparing a surface study');
   const study={turrets:turrets.map(t=>t.batches.map(b=>surfaceUV.get(b).map(v=>Number(v.toFixed(6))))),sourceHash:crypto.createHash('sha256').update(baseline).digest('hex'),uv:Array.from(statics.values()).map(b=>surfaceUV.get(b).map(v=>Number(v.toFixed(6))))};
   const text='// Generated by node tools/bake-aegis-flight.cjs --surface-study. Review-only UVs; original geometry is unchanged.\nwindow.AegisSurfaceData='+JSON.stringify(study)+';\n';
   const studyTarget=path.join(root,'output/aegis-surface-data.js');
   if(process.argv.includes('--check')){if(fs.readFileSync(studyTarget,'utf8')!==text)throw new Error('Aegis surface study is stale');}else fs.writeFileSync(studyTarget,text);
   console.log('Aegis surface study: '+text.length+' bytes');return;
 }
 if(process.argv.includes('--check')){if(fs.readFileSync(target,'utf8').replace(/\r\n/g,'\n')!==output)throw new Error('Aegis flight rig is stale');}else fs.writeFileSync(target,output);
 console.log('Aegis flight rig: '+turrets.length+' articulated batteries, '+output.length+' bytes');
})().catch(e=>{console.error(e);process.exitCode=1;});
