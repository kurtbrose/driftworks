'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),cp=require('node:child_process'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
cp.execFileSync(process.execPath,[path.join(root,'tools/bake-aegis-flight.cjs'),'--surface-study','--check'],{stdio:'pipe'});
const ctx=vm.createContext({window:{},Float32Array});
for(const f of ['assets/ships/aegis-kit/flight-rig.js','output/aegis-surface-data.js','output/aegis-surface-study.js'])vm.runInContext(read(f),ctx);
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
// Markings change only twelve existing triangles, with readable orientation on both sides.
let marked=0,sides=new Set();
asset.surface.batches.forEach((f,i)=>{if(!f)return;const before=data.uv[i];assert.equal(f.uv.length,before.length);for(let k=0;k<f.uv.length;k+=2){if(Math.abs(f.uv[k]-before[k])<1e-6&&Math.abs(f.uv[k+1]-before[k+1])<1e-6)continue;marked++;const v=asset.batches[i].vertices,j=k*3;sides.add(Math.sign(v[j+4]));assert(v[j+2]>32&&v[j+5]>.4);assert(f.uv[k]>=.5&&f.uv[k]<=.75&&f.uv[k+1]>=.5&&f.uv[k+1]<=1);}});
assert.equal(marked,36);assert.equal(sides.size,2);
console.log('PASS Aegis surface study: fresh source, finite UVs, exact geometry/normals, unchanged batch count, shared poses and live damage ownership');

(async()=>{
 const DW={sim:{METERS_PER_UNIT:U},assetUrl:v=>v};
 class Image{set src(value){this.url=value;this.width=2048;this.height=1024;Promise.resolve().then(()=>this.onload&&this.onload());}}
 const runtime=vm.createContext({window:{Driftworks:DW},Float32Array,Image,console});
 for(const f of ['experiments/retail-profiles.js','experiments/flight-model.js','experiments/retail-weapons.js','experiments/guns.js','experiments/flight-missions.js','experiments/mission-ohio.js','experiments/flight-collision.js','experiments/training.js','assets/ships/aegis-kit/flight-rig.js','assets/ships/aegis-kit/shield-envelope.js','experiments/aegis-flight.js'])vm.runInContext(read(f),runtime,{filename:f});
 await DW.aegisFlight.load();
 assert.equal(DW.aegisFlightAsset.interiors.length,3);
 const approved={window:{}};vm.createContext(approved);vm.runInContext(read('output/aegis-hangar-data.js'),approved);
 for(const b of DW.aegisFlightAsset.interiors){const expected=approved.window.AegisHangarData.interiors.find(x=>x.kind===b.kind);assert.equal(JSON.stringify(b.vertices),JSON.stringify(expected.vertices),'production keeps approved interior geometry');if(b.finish)assert.equal(JSON.stringify(b.finish.uv),JSON.stringify(expected.uv),'production keeps approved UV orientation');}
 const one=DW.aegisFlight.create(),two=DW.aegisFlight.create(),styled=one.geometry(),buffers=styled.map(b=>b.vertices);
 assert.equal(styled.filter(b=>b.texture).length,18,'loaded armed rig enables approved hull and heavy turret finish by default');
 assert(styled.every((b,i)=>b.vertices===two.geometry()[i].vertices),'textured GPU data shared across ships');
 one.setSurfaceDetail(false);const plain=styled.map(b=>b.vertices);assert(styled.every(b=>!b.stride&&!b.texture));
 one.setSurfaceDetail(true);assert(styled.every((b,i)=>b.vertices===buffers[i]));assert.equal(one.geometry(),styled,'toggle never replaces actor array');
 styled.forEach((b,i)=>{for(let k=0;k<plain[i].length/6;k++)for(let j=0;j<6;j++)assert.equal(b.vertices[k*(b.stride||6)+j],plain[i][k*6+j]);});
 const state={team:'ally',position:[0,0,1200],heading:0,velocity:[0,0,0],integrity:20000};
 const idle=DW.aegisFlight.create({state,opponent:state,unarmed:true}),idleB=idle.geometry();
 assert.equal(idleB.length,10,'unarmed ships retain seven hull draws plus three interior finishes');assert.equal(idleB.filter(b=>b.texture).length,6);
 const total=b=>b.reduce((n,p)=>n+p.vertices.length/(p.stride||6),0);
 assert.equal(total(idleB),total(styled),'idle batching retains every vertex');
 assert(idleB.every(b=>b.vertices.every(Number.isFinite)));
 const idleBefore=idleB.map(b=>b.vertices);idle.setSurfaceDetail(false);const idlePlain=idleB.map(b=>b.vertices);idle.setSurfaceDetail(true);
 idleB.forEach((b,i)=>{assert.equal(b.vertices,idleBefore[i]);for(let k=0;k<idlePlain[i].length/6;k++)for(let j=0;j<6;j++)assert.equal(b.vertices[k*(b.stride||6)+j],idlePlain[i][k*6+j]);});
 one.setSurfaceDetail(false,'turrets');assert.equal(styled.filter(b=>b.texture).length,6);one.setSurfaceDetail(true,'turrets');
 const heavy=one.components().find(p=>p.kind==='heavy'),heavyCombat=DW.training.create('training');one.damage(heavy.position,1000,heavyCombat);const destroyed=styled.map(b=>b.vertices);one.setSurfaceDetail(false);one.setSurfaceDetail(true);assert(styled.every((b,i)=>b.vertices===destroyed[i]),'surface toggles preserve scorched turret buffers');one.reset();assert(styled.every((b,i)=>b.vertices===buffers[i]),'reset restores textured turret buffers');
 const combat=DW.training.create('training'),part=one.components().find(p=>p.kind==='engine');one.damage(part.position,1000,combat);one.setSurfaceDetail(false);one.setSurfaceDetail(true);assert.equal(one.components().find(p=>p.id===part.id).hp,0,'surface toggles preserve damage');
 one.reset();assert(one.geometry().every((b,i)=>b.vertices===buffers[i]),'reset restores original articulated buffers and keeps textured hull');
 const patrol=DW.aegisFlight.createEllisPatrol();assert(patrol.geometry().every(b=>b.lensRadius>650&&b.lensRadius<1000),'stride-aware bounds preserve optical image radius');
 console.log('PASS production capital surface: default load, shared buffers, ten-draw idle rig, exact geometry, stable toggle/reset/damage and optical bounds');
})().catch(e=>{console.error(e);process.exitCode=1;});
