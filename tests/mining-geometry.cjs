'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const hash=g=>Object.fromEntries(Object.entries(g).map(([k,v])=>[k,{length:v.length,sha256:crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}]));
for(const fixture of require('./fixtures/mining-geometry.json')) {
  assert.deepEqual(hash(global.Driftworks.miningRig.geometry(...fixture.args)),fixture.groups,JSON.stringify(fixture.args));
}
console.log('PASS mining rig: reference geometry across 49 poses and component modes');
// Caller edits cannot poison the private static cabin cache or later poses.
const model=global.Driftworks.miningRig.geometry;
const baseline=hash(model(1,0,false,0,''));
const edited=model(1,0,false,0,'');
for(const values of Object.values(edited))values.fill(123);
assert.deepEqual(hash(model(1,123,true,0,'')),baseline);
assert.deepEqual(hash(model(1,0,false,0,'')),baseline);

// Static construction is reused, while each request owns its output arrays.
const fs=require('node:fs'),vm=require('node:vm');
const scope={Driftworks:{miningLights:global.Driftworks.miningLights}};scope.window=scope;
vm.createContext(scope);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/mesh-builder.js'),'utf8'),scope);
let builds=0;const create=scope.Driftworks.meshBuilder.create;
scope.Driftworks.meshBuilder.create=groups=>{builds++;return create(groups);};
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../src/mining-rig.js'),'utf8'),scope);
const first=scope.Driftworks.miningRig.geometry(1,0,false,0,'');const coldBuilds=builds;builds=0;
const second=scope.Driftworks.miningRig.geometry(1,0,false,0,'');
assert.equal(coldBuilds,3,'Cold request constructs main assembly, cabin and fixtures');
assert.equal(builds,1,'Warm request reuses cabin and fixture construction');
assert.deepEqual(hash(first),hash(second));assert.notEqual(first.steel,second.steel);
const groups={paint:[]},builder=global.Driftworks.meshBuilder.create(groups);
builder.block('paint',[0,0,0],[1,2,3]);
assert.equal(groups.paint.length,36*6);
for(let i=0;i<groups.paint.length;i+=6){assert.ok(Math.abs(groups.paint[i])<=1&&Math.abs(groups.paint[i+1])<=2&&Math.abs(groups.paint[i+2])<=3);assert.equal(Math.hypot(...groups.paint.slice(i+3,i+6)),1);}
console.log('PASS procedural assets: reusable block, private static cache, and caller-owned geometry');
// Structural assertions explain failures without depending solely on fingerprints.
const api=global.Driftworks.miningRig,materials=['ochre','steel','dark','light','marker','lamp'];
function structure(groups,label,unitNormals=true){
  assert.deepEqual(Object.keys(groups),materials,label+': material order');
  for(const [material,data] of Object.entries(groups)){
    assert.equal(data.length%18,0,label+': complete triangles in '+material);
    for(let i=0;i<data.length;i+=6){
      for(let k=0;k<6;k++)assert.ok(Number.isFinite(data[i+k]),`${label}: finite ${material} vertex ${i/6}, component ${k}`);
      const length=Math.hypot(data[i+3],data[i+4],data[i+5]);
      assert.ok(length>1e-12,`${label}: nonzero ${material} normal ${i/6}`);
      if(unitNormals)assert.ok(Math.abs(length-1)<1e-10,`${label}: unit ${material} normal ${i/6}`);
    }
  }
}
for(const [index,fixture] of require('./fixtures/mining-geometry.json').entries()){
  structure(api.geometry(...fixture.args),'reference pose '+index,!fixture.args[7]);
}
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-9,`${label}: ${a} != ${b}`);
const nearPoint=(a,b,label)=>a.forEach((v,k)=>near(v,b[k],label+' axis '+k));
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
const vertex=(data,offset)=>data.slice(offset,offset+3);
function hasVertex(data,point){for(let i=0;i<data.length;i+=6)if(distance(vertex(data,i),point)<1e-9)return true;return false;}
const outline=[[15,-6],[15,6],[5,10.5],[-5,10.5],[-17,4.5],[-17,-4.5],[-5,-10.5],[5,-10.5]];
// The fitted belly stays inside every door hinge plane, including diagonal bays.
const base=api.geometry(1,0,false,0).dark;
let baseVertices=0;
for(let i=0;i<base.length;i+=6){
  if(Math.abs(base[i+2]-3.35)>1e-9 && Math.abs(base[i+2]-4.10)>1e-9)continue;
  baseVertices++;
  outline.forEach((a,k)=>{const b=outline[(k+1)%8],dx=b[0]-a[0],dy=b[1]-a[1];
    assert.ok((dy*(base[i]-a[0])-dx*(base[i+1]-a[1]))/Math.hypot(dx,dy)<=-.449999,'Belly clears each bay by at least 45 cm');
  });
}
assert.ok(baseVertices>=48,'Fitted upper and lower belly rings are present');
const steel=api.geometry(1,0,false,0).steel;
for(let i=0;i<steel.length;i+=6)if(Math.abs(steel[i+1])<3 && steel[i+2]>4.3 && steel[i+2]<5.1)
  assert.ok(steel[i]<18,'No placeholder equipment poles project out through the end door');
function hinge(i){
  const p=outline[i],a=outline[(i+7)%8],b=outline[(i+1)%8];
  const edgeNormal=(p,q)=>{const dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy);return [dy/length,-dx/length];};
  const n=edgeNormal(a,p),m=edgeNormal(p,b),scale=.72/(1+n[0]*m[0]+n[1]*m[1]);
  return [p[0]+(n[0]+m[0])*scale,p[1]+(n[1]+m[1])*scale,4.5];
}
const shut=api.ramps(0);
// First bay wall faces +X; caution paint stays exclusively on the inner face.
const wallX=shut.ochre[0];
near(shut.dark[0],wallX-.238,'Inner caution backing depth');
near(shut.light[0],wallX-.256,'Inner caution stripe clears backing');
assert.equal(shut.dark.length,16*36,'Only one caution backing per leaf');
assert.ok(shut.light.length>0,'Caution stripe count follows physical panel width');
const diagonalEdges=[];
for(let i=0;i<shut.light.length;i+=18){const tri=shut.light.slice(i,i+18);if(![0,6,12].every(k=>Math.abs(tri[k]-(wallX-.256))<1e-9))continue;
  for(let j=0;j<3;j++){const a=j*6,b=((j+1)%3)*6,dy=tri[b+1]-tri[a+1],dz=tri[b+2]-tri[a+2];if(Math.abs(dy)>1e-8 && Math.abs(Math.abs(dy)-Math.abs(dz))<1e-8)diagonalEdges.push(tri[a+1]-tri[a+2]);}
}
const lines=[...new Set(diagonalEdges.map(v=>v.toFixed(7)))].map(Number).sort((a,b)=>a-b);
assert.ok(lines.length>8,'Multiple diagonal stripe boundaries');
for(let i=1;i<lines.length;i++)assert.ok(Math.abs(lines[i]-lines[i-1]-.14*Math.SQRT2)<1e-6,'Constant 14 cm stripe and gap widths at 45 degrees');
assert.equal(shut.marker.length,0,'No service identification decals');
for(const opening of [0,.2,.4,.40001,.7,1]){
  const ramp=api.ramps(opening),full=api.geometry(1,0,false,opening);
  structure(ramp,'ramps '+opening);
  assert.equal(ramp.ochre.length,8*20*18,'Eight bays, two thick leaves per bay');
  assert.equal(ramp.steel.length,8*4*18,'Plain steel inner faces without access panels or traction artwork');
  assert.deepEqual(ramp.ochre,full.ochre.slice(0,ramp.ochre.length),'Ramp-only and full composition use the same leaves');
  for(let bay=0;bay<8;bay++){
    const start=bay*20*18,roof=start+10*18;
    nearPoint(vertex(ramp.ochre,start),vertex(shut.ochre,start),'Fixed left root pivot');
    nearPoint(vertex(ramp.ochre,start+6),vertex(shut.ochre,start+6),'Fixed right root pivot');
    nearPoint(vertex(ramp.ochre,start+30),vertex(ramp.ochre,roof),'Wall/roof joint stays connected');
    near(distance(vertex(ramp.ochre,start),vertex(ramp.ochre,start+30)),distance(vertex(shut.ochre,start),vertex(shut.ochre,start+30)),'Rigid lower leaf');
    near(distance(vertex(ramp.ochre,roof),vertex(ramp.ochre,roof+30)),distance(vertex(shut.ochre,roof),vertex(shut.ochre,roof+30)),'Rigid upper leaf');
    if(opening<=.4)nearPoint(vertex(ramp.ochre,start+30),vertex(shut.ochre,start+30),'Roof uncovers before the wall lowers');
  }
  // The first bay hinge is parallel to Y. The powered jack follows the wall,
  // while its fixed base and 64% sleeve junction retain their physical meaning.
  const root=hinge(0),angle=Math.PI*115/180*Math.max(0,(opening-.4)/.6);
  const end=[root[0]+.45*Math.cos(angle)+2.6*Math.sin(angle),root[1]+12*.32,4.5+2.6*Math.cos(angle)-.45*Math.sin(angle)];
  const base=[root[0]+1,root[1]+12*.32,4.75],sleeve=base.map((v,k)=>v+(end[k]-v)*.64);
  assert.ok(hasVertex(full.steel,base),'Jack sleeve has its fixed base cap');
  assert.ok(hasVertex(full.steel,sleeve)&&hasVertex(full.light,sleeve),'Sleeve and rod meet');
  assert.ok(hasVertex(full.light,end),'Rod reaches the moving wall pin');
}
const limits=[0,.1,.2,.3,.4,.5,.6,.7],limited=api.ramps(1,limits);
for(let bay=0;bay<8;bay++)assert.deepEqual(limited.ochre.slice(bay*360,(bay+1)*360),api.ramps(limits[bay]).ochre.slice(bay*360,(bay+1)*360),'Each bay obeys its own opening limit');

function checkLegs(deployment,poses){
  const legs=api.legs(deployment,poses);
  structure(legs,'legs '+deployment,!poses);
  assert.equal(legs.lamp.length,8*36*6,'One knee lamp on each of eight legs');
  for(let i=0;i<8;i++){
    const root=outline[i],h=hinge(i),out=[h[0]-root[0],h[1]-root[1],0],length=Math.hypot(...out);out.forEach((v,k)=>out[k]=v/length);
    const knee=poses?poses[i].knee:[root[0]+out[0]*(1.5+3.3*deployment),root[1]+out[1]*(1.5+3.3*deployment),4];
    const tip=poses?poses[i].tip:[root[0]+out[0]*(2+6*deployment),root[1]+out[1]*(2+6*deployment),1.4+(1-deployment)*2];
    const lamp=legs.lamp.slice(i*216,(i+1)*216),center=[0,1,2].map(k=>{const values=[];for(let n=k;n<lamp.length;n+=6)values.push(lamp[n]);return (Math.min(...values)+Math.max(...values))/2;});
    nearPoint(center,[knee[0],knee[1],knee[2]+.37],'Knee lamp follows its joint');
    const normal=poses?poses[i].normal.slice():[0,0,1],nl=Math.hypot(...normal);normal.forEach((v,k)=>normal[k]=v/nl);
    const vx=knee[0]-root[0],vy=knee[1]-root[1],vl=Math.hypot(vx,vy),tx=-vy/vl,ty=vx/vl;
    const projection=out[0]*normal[0]+out[1]*normal[1],forward=out.map((v,k)=>v-normal[k]*projection),fl=Math.hypot(...forward);forward.forEach((v,k)=>forward[k]=v/fl);
    const tangent=[normal[1]*forward[2]-normal[2]*forward[1],normal[2]*forward[0]-normal[0]*forward[2],normal[0]*forward[1]-normal[1]*forward[0]];
    const placed=offset=>poses?tip.map((v,k)=>v+forward[k]*(offset[0]*out[0]+offset[1]*out[1])+tangent[k]*(offset[0]*tx+offset[1]*ty)+normal[k]*offset[2]):tip.map((v,k)=>v+offset[k]);
    for(const side of [-1,1]){
      assert.ok(hasVertex(legs.steel,placed([tx*side*.62,ty*side*.62,0])),'Ankle pin cap follows the specified leg tip');
      assert.ok(hasVertex(legs.steel,placed([tx*side*.45+out[0]*1.8+.28,ty*side*.45+out[1]*1.8+.30,-1.56])),'Jaw pad corner follows the gripper and contact normal');
    }
  }
}
for(const d of [0,.25,.5,.75,1])checkLegs(d);
checkLegs(1,require('./fixtures/mining-geometry.json').at(-1).args[7]);
for(const cut of ['', 'lower','upper']){
  const full=api.geometry(1,0,false,1,cut),legs=api.legs(1);
  for(const [material,data] of Object.entries(legs)){
    const fixtures=api.lights()[material]?.length||0,end=full[material].length-fixtures;
    assert.deepEqual(full[material].slice(end-data.length,end),data,'Cutaway preserves '+material+' leg assembly');
  }
  const maxZ=Math.max(...full.ochre.filter((v,i)=>i%6===2));
  near(maxZ,cut?4.92:14.9,'Cutaway removes exterior cabin and roof');
}
// Legacy flag precedence remains supported, even for combined mode flags.
for(let mask=0;mask<8;mask++){
  const old=api.geometry(.3,99,true,.6,'lower',!!(mask&1),!!(mask&2),undefined,limits,!!(mask&4));
  const expected=mask&4?api.ramps(.6,limits):mask&2?api.infill():mask&1?api.legs(.3):api.geometry(.3,0,false,.6,'lower',false,false,undefined,limits);
  assert.deepEqual(old,expected,'Legacy mode precedence '+mask);
}
console.log('PASS mining structure: finite meshes, normals, material groups, rigid leaves, staged hinges/jacks, independent stops, leg pivots, knee lamps and cutaways');
// Component requests emit only the requested mesh; no mesh is built then discarded.
for(const [name,make] of [['ramps',()=>scope.Driftworks.miningRig.ramps(.6)],['infill',()=>scope.Driftworks.miningRig.infill()],['legs',()=>scope.Driftworks.miningRig.legs(.4)]]){
  let emitted=0;
  scope.Driftworks.meshBuilder.create=groups=>Object.fromEntries(Object.entries(create(groups)).map(([key,fn])=>[key,(...args)=>{
    const before=Object.values(groups).reduce((sum,v)=>sum+v.length,0);fn(...args);
    emitted+=Object.values(groups).reduce((sum,v)=>sum+v.length,0)-before;
  }]));
  const result=make();
  assert.equal(emitted,Object.values(result).reduce((sum,v)=>sum+v.length,0),name+' emits no discarded geometry');
}
scope.Driftworks.meshBuilder.create=create;
assert.deepEqual(api.infill(),api.geometry(0,0,false,1,'lower',false,true),'Infill is independent of deployment, ramp pose and cutaway');
console.log('PASS mining composition: component requests emit no discarded mesh');
