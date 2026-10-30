'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),cp=require('node:child_process'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
cp.execFileSync(process.execPath,[path.join(root,'tools/bake-aegis-flight.cjs'),'--surface-study','--check'],{stdio:'pipe'});
const ctx=vm.createContext({window:{},Float32Array});
for(const f of ['assets/ships/aegis-kit/flight-rig.js','studies/aegis-surface-data.js','studies/aegis-surface-study.js'])vm.runInContext(read(f),ctx);
const asset=ctx.window.Driftworks.aegisFlightAsset,data=ctx.window.AegisSurfaceData,study=ctx.window.AegisSurfaceStudy;
assert.equal(data.sourceHash,crypto.createHash('sha256').update(read('assets/ships/aegis-kit/flight-rig.js').replace(/\r\n/g,'\n')).digest('hex'));
const U=10000/600,pose=[1,2,3],basis=new Float32Array([1,0,0,0,1,0,0,0,1]);
const batches=asset.batches.map(b=>({vertices:new Float32Array(b.vertices.map((n,i)=>i%6<3?n/U:n)),color:b.color,origin:pose,basis,staticGeometry:true}));
const articulated={vertices:new Float32Array([1,2,3,0,0,1]),color:[1,0,0]};batches.push(articulated);
const image={},prepared=study.prepare(batches,data,image,asset.batches.length);
assert.equal(prepared.length,batches.length);assert.equal(prepared.at(-1),articulated,'articulated/damaged assemblies remain owned by the rig');
let textured=0;
prepared.slice(0,-1).forEach((b,i)=>{
 const original=batches[i];assert.equal(b.origin,pose);assert.equal(b.basis,basis);assert.equal(b.staticGeometry,true);
 if(b.stride===8){textured++;assert.equal(b.texture,image);assert.equal(b.vertices.length/8,original.vertices.length/6);
  for(let v=0;v<original.vertices.length/6;v++){
   for(let k=0;k<6;k++)assert.equal(b.vertices[v*8+k],original.vertices[v*6+k],'positions and normals remain exact');
   for(let k=6;k<8;k++)assert.ok(Number.isFinite(b.vertices[v*8+k])&&b.vertices[v*8+k]>=0&&b.vertices[v*8+k]<=1,'UV is inside padded atlas');
  }
 }else assert.equal(b,original);
});
assert.ok(textured>=2&&textured<=4,'only neutral structural batches receive surface treatment');
articulated.vertices=new Float32Array([9,9,9]);assert.equal(prepared.at(-1).vertices,articulated.vertices,'damage/reset buffer replacements propagate');
pose[0]=42;basis[0]=0;assert.equal(prepared[0].origin[0],42);assert.equal(prepared[0].basis[0],0);
assert.throws(()=>study.prepare(batches,{uv:[]},image,asset.batches.length),/batch count/);
const full=asset.batches.concat(asset.turrets.flatMap(t=>t.batches),asset.engines.flatMap(e=>e.batches)).map(b=>({vertices:new Float32Array(b.vertices),color:b.color,origin:pose,basis,staticGeometry:true}));
const turretCandidate=study.prepareTurrets(full,data,image,asset);
assert.equal(turretCandidate.length,full.length);let changed=0;
turretCandidate.forEach((b,i)=>{
 if(b===full[i])return;changed++;assert(i>=asset.batches.length,'turret pass preserves approved hull');
 assert.equal(b.origin,full[i].origin);assert.equal(b.basis,full[i].basis);
 assert.equal(b.vertices.length/8,full[i].vertices.length/6);
 for(let v=0;v<full[i].vertices.length/6;v++)for(let k=0;k<6;k++)assert.equal(b.vertices[v*8+k],full[i].vertices[v*6+k]);
});
assert.equal(changed,12,'only the twelve heavy turret armor batches change');
// Belt clipping splits roof facets; markings retain readable orientation on both sides.
let marked=0,sides=new Set();
asset.surface.batches.forEach((f,i)=>{if(!f)return;const before=data.uv[i];assert.equal(f.uv.length,before.length);for(let k=0;k<f.uv.length;k+=2){if(Math.abs(f.uv[k]-before[k])<1e-6&&Math.abs(f.uv[k+1]-before[k+1])<1e-6)continue;marked++;const v=asset.batches[i].vertices,j=k*3;sides.add(Math.sign(v[j+4]));assert(v[j+2]>32&&v[j+5]>.4);assert(f.uv[k]>=.5&&f.uv[k]<=.75&&f.uv[k+1]>=.5&&f.uv[k+1]<=1);}});
assert.equal(marked,48);assert.equal(sides.size,2);
console.log('PASS Aegis surface study: fresh source, finite UVs, exact geometry/normals, unchanged batch count, shared poses and live damage ownership');

(async()=>{
 const DW={sim:{METERS_PER_UNIT:U},assetUrl:v=>v};
 class Image{set src(value){this.url=value;this.width=2048;this.height=1024;Promise.resolve().then(()=>this.onload&&this.onload());}}
 const runtime=vm.createContext({window:{Driftworks:DW},Float32Array,Image,console,fetch:async url=>{assert.equal(url,'../assets/ships/aegis-kit/armor-normal.json');return {ok:true,json:async()=>JSON.parse(read('assets/ships/aegis-kit/armor-normal.json'))};}});
 for(const f of ['experiments/retail-profiles.js','experiments/flight-model.js','experiments/retail-weapons.js','experiments/guns.js','experiments/flight-missions.js','experiments/mission-ohio.js','src/flight-collision.js', 'src/flight-combat.js', 'src/flight-mission-runtime.js', 'src/flight-opponent.js', 'src/flight-blockout.js', 'src/flight-sim.js', 'assets/ships/aegis-kit/flight-rig.js','assets/ships/aegis-kit/shield-envelope.js','src/aegis-sim.js', 'src/aegis-visual.js', 'src/aegis-battle.js', 'experiments/aegis-flight.js'])vm.runInContext(read(f),runtime,{filename:f});
 await DW.aegisFlight.load();
 const nozzleAsset=DW.aegisFlightAsset.engines;
 assert.equal(nozzleAsset.reduce((n,e)=>n+e.batches.reduce((m,b)=>m+b.vertices.length/18,0),0),3660,'approved open bells add only 480 triangles across five engines');
 for(const e of nozzleAsset){assert.equal(e.batches.length,5);const throat=e.batches[4];assert.equal(throat.vertices.length/18,32);for(let i=0;i<throat.vertices.length;i+=6)assert(Math.abs(throat.vertices[i]-18.2)<2e-6,'throat is recessed 13.8 m behind the 32 m lip');for(const b of e.batches){assert.equal(b.finish.uv.length,b.vertices.length/3);assert(b.finish.uv.every(v=>Number.isFinite(v)&&v>=0&&v<=1));assert.equal(b.finish.atlas,'engine-atlas.png');}}
 const glass=DW.aegisFlightAsset.interiors.find(b=>b.kind==='windows');assert.equal(glass.finish.atlas,'belt-atlas.png');assert(glass.vertices.length/18<480*12,'baked facets replace individual window boxes');assert(glass.vertices.some((v,i)=>i%6===0&&v<-320),'prow belts remain present');assert.equal(glass.finish.uv.length,glass.vertices.length/3);assert(glass.finish.uv.every(v=>Number.isFinite(v)&&v>=0&&v<=1));assert.equal(glass.finish.shader,-2);

 assert.equal(DW.aegisFlightAsset.interiors.length,5);
 const approved={window:{}};vm.createContext(approved);vm.runInContext(read('studies/aegis-hangar-data.js'),approved);
 for(const b of DW.aegisFlightAsset.interiors.filter(b=>b.kind!=='windows'&&b.kind!=='structure')){const expected=approved.window.AegisHangarData.interiors.find(x=>x.kind===b.kind);assert.equal(JSON.stringify(b.vertices),JSON.stringify(expected.vertices),'production keeps approved interior geometry');if(b.finish)assert.equal(JSON.stringify(b.finish.uv),JSON.stringify(expected.uv),'production keeps approved UV orientation');}
 const structure=DW.aegisFlightAsset.interiors.find(b=>b.kind==='structure');assert.equal(structure.vertices.length/18,6000);assert.equal(structure.finish.atlas,'structure-v1/graphite.png');assert.equal(structure.finish.uv.length,structure.vertices.length/3);assert(structure.finish.uv.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 const structuralBaseline={window:{}};vm.createContext(structuralBaseline);vm.runInContext(read('studies/aegis-structure-before-rig.js'),structuralBaseline);
 const triangles=batches=>batches.flatMap(b=>Array.from({length:b.vertices.length/18},(_,i)=>b.vertices.slice(i*18,i*18+18).join(','))).sort();
 const originalStructure=new Set(triangles(structuralBaseline.window.Driftworks.aegisFlightAsset.batches));assert.equal(structure.vertices.length/18,6000);assert(triangles([structure]).every(t=>originalStructure.has(t)),'structural finish retains its original triangles, positions, normals and winding while window belts reshape armor');
 const one=DW.aegisFlight.create(),two=DW.aegisFlight.create(),styled=one.geometry(),buffers=styled.map(b=>b.vertices);
 for(const e of nozzleAsset){const p=e.position,ray=y=>one.hit([750/U,(p[1]+y)/U,1200+p[2]/U],[600/U,(p[1]+y)/U,1200+p[2]/U]);const throat=ray(0),rim=ray(21.5);assert(throat&&rim);assert(Math.abs(throat[0]*U-p[0]-18.2)<.001,'center ray reaches recessed throat instead of a phantom flat cap');assert(Math.abs(rim[0]*U-p[0]-32)<.001,'rim ray hits the physical lip');}
 assert.equal(styled.filter(b=>b.texture).length,45,'loaded armed rig enables approved hull and heavy turret finish by default');
 assert(styled.every((b,i)=>b.vertices===two.geometry()[i].vertices),'textured GPU data shared across ships');
 one.setSurfaceDetail(false);const plain=styled.map(b=>b.vertices);assert(styled.every(b=>!b.stride&&!b.texture));
 one.setSurfaceDetail(true);assert(styled.every((b,i)=>b.vertices===buffers[i]));assert.equal(one.geometry(),styled,'toggle never replaces actor array');
 styled.forEach((b,i)=>{for(let k=0;k<plain[i].length/6;k++)for(let j=0;j<6;j++)assert.equal(b.vertices[k*(b.stride||6)+j],plain[i][k*6+j]);});
 const normalBatches=styled.filter(b=>b.normalTexture);
 assert.equal(normalBatches.length,2);
 assert.equal(normalBatches.reduce((n,b)=>n+Array.from(b.normalUV).filter((v,i)=>i%2===0&&v>0).length/3,0),1760,'all twenty original armor bands receive normals');
 assert(styled.every((b,i)=>b.normalUV===two.geometry()[i].normalUV&&b.normalTexture===two.geometry()[i].normalTexture),'normal resources shared between ships');
 assert(normalBatches.every(b=>b.normalUV.length===b.vertices.length/8*2));
 assert.equal(new Set(normalBatches.map(b=>b.normalTexture)).size,1);
 const state={team:'ally',position:[0,0,1200],heading:0,velocity:[0,0,0],integrity:20000};
 const idle=DW.aegisFlight.create({state,opponent:state,unarmed:true}),idleB=idle.geometry();
 assert.equal(idleB.length,13,'unarmed ships retain hull, interior, structural and combined nozzle batches');assert.equal(idleB.filter(b=>b.texture).length,9);
 const total=b=>b.reduce((n,p)=>n+p.vertices.length/(p.stride||6),0);
 assert.equal(total(idleB),total(styled),'idle batching retains every vertex');
 assert(idleB.every(b=>b.vertices.every(Number.isFinite)));
 const idleBefore=idleB.map(b=>b.vertices);idle.setSurfaceDetail(false);const idlePlain=idleB.map(b=>b.vertices);idle.setSurfaceDetail(true);
 idleB.forEach((b,i)=>{assert.equal(b.vertices,idleBefore[i]);for(let k=0;k<idlePlain[i].length/6;k++)for(let j=0;j<6;j++)assert.equal(b.vertices[k*(b.stride||6)+j],idlePlain[i][k*6+j]);});
 one.setSurfaceDetail(false,'turrets');assert.equal(styled.filter(b=>b.texture).length,33);one.setSurfaceDetail(true,'turrets');
 const heavy=one.components().find(p=>p.kind==='heavy'),heavyCombat=DW.flightSim.create('training');one.damage(heavy.position,1000,heavyCombat);const destroyed=styled.map(b=>b.vertices);one.setSurfaceDetail(false);one.setSurfaceDetail(true);assert(styled.every((b,i)=>b.vertices===destroyed[i]),'surface toggles preserve scorched turret buffers');one.reset();assert(styled.every((b,i)=>b.vertices===buffers[i]),'reset restores textured turret buffers');
 const nozzleBatches=styled.slice(-25);assert(nozzleBatches.every(b=>b.texture===nozzleBatches[0].texture),'all five engines share one atlas');
 const combat=DW.flightSim.create('training'),part=one.components().find(p=>p.kind==='engine');one.damage(part.position,1000,combat);one.setSurfaceDetail(false);one.setSurfaceDetail(true);assert.equal(one.components().find(p=>p.id===part.id).hp,0,'surface toggles preserve damage');
 one.reset();assert(one.geometry().every((b,i)=>b.vertices===buffers[i]),'reset restores original articulated buffers and keeps textured hull');
 const patrol=DW.aegisFlight.createEllisPatrol();assert(patrol.geometry().every(b=>b.lensRadius>650&&b.lensRadius<1000),'stride-aware bounds preserve optical image radius');
 console.log('PASS production capital surface: default load, shared buffers, thirteen-batch idle rig, exact geometry, stable toggle/reset/damage and optical bounds');
})().catch(e=>{console.error(e);process.exitCode=1;});
