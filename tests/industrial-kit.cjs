'use strict';
const assert=require('node:assert/strict');
const {THREE:T,kit}=require('../tools/export-industrial-kit.cjs').loadKit();
function triangles(obj){let n=0;obj.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;});return n;}
function checkExport(obj){
  const doc=JSON.parse(kit.exportGLTF(obj)),bin=Buffer.from(doc.buffers[0].uri.split(',')[1],'base64');
  assert.equal(bin.length,doc.buffers[0].byteLength);
  for(const a of doc.accessors){const view=doc.bufferViews[a.bufferView],stride=a.type==='VEC3'?3:a.type==='VEC2'?2:1,size=a.componentType===5123?2:4;assert.equal(view.byteOffset%4,0,'buffer views are aligned');assert(view.byteOffset+view.byteLength<=bin.length);assert.equal(a.count*stride*size,view.byteLength);if(a.componentType===5126)for(let i=view.byteOffset;i<view.byteOffset+view.byteLength;i+=4)assert(Number.isFinite(bin.readFloatLE(i)),'finite glTF floats');}
  for(const m of doc.meshes)for(const p of m.primitives){const count=doc.accessors[p.attributes.POSITION].count;assert.equal(count,doc.accessors[p.attributes.NORMAL].count);assert.equal(count,doc.accessors[p.attributes.TEXCOORD_0].count);if(p.indices!==undefined){const a=doc.accessors[p.indices],view=doc.bufferViews[a.bufferView],size=a.componentType===5123?2:4;for(let i=view.byteOffset;i<view.byteOffset+view.byteLength;i+=size)assert((size===2?bin.readUInt16LE(i):bin.readUInt32LE(i))<count,'indices address real vertices');}}
  let painted=false;const sourceMeshes=[];obj.traverse(o=>{if(o.isMesh){sourceMeshes.push(o);if(o.material.map)painted=true;}});
  const nodes=doc.nodes.filter(n=>n.mesh!==undefined);
  sourceMeshes.forEach((o,i)=>{const a=doc.accessors[doc.meshes[nodes[i].mesh].primitives[0].attributes.TEXCOORD_0],view=doc.bufferViews[a.bufferView],uv=o.geometry.attributes.uv;for(let j=0;j<uv.count;j++){assert(Math.abs(bin.readFloatLE(view.byteOffset+j*8)-uv.getX(j))<.000001);assert(Math.abs(bin.readFloatLE(view.byteOffset+j*8+4)-(1-uv.getY(j)))<.000001,'glTF texture origin is top-left; source Three texture origin is bottom-left');}});
  assert.equal(doc.images?.length||0,painted?1:0,'surface atlas is embedded once when used');assert.equal(doc.materials.some(m=>Boolean(m.pbrMetallicRoughness.baseColorTexture)),painted);return doc;
}
for(const name of [...Object.keys(kit.dimensions),...kit.shipNames,'kit','fleet']){
  const obj=[...kit.shipNames,'kit','fleet'].includes(name)?kit.assembly(name):kit.part(name);
  obj.traverse(o=>{if(!o.isMesh)return;for(const attr of Object.values(o.geometry.attributes))assert([...attr.array].every(Number.isFinite));const n=o.geometry.attributes.normal;for(let i=0;i<n.count;i++){const length=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));assert(Math.abs(length-1)<.001,'unit authored normals: '+name+' / '+o.name+' / '+i+' / '+length);}});
  const before=new T.Box3().setFromObject(obj,true),batch=kit.batchStatic(obj),after=new T.Box3().setFromObject(batch,true);
  assert(before.min.distanceTo(after.min)+before.max.distanceTo(after.max)<.0001,name+' preserves bounds under batching');assert.equal(triangles(batch),triangles(obj),name+' preserves every triangle');assert(batch.children.length<=9,'one draw per shared material');
  const doc=checkExport(obj);if(name==='hauler')assert(doc.meshes.length<doc.nodes.filter(n=>n.mesh!==undefined).length*.6,'repeated modules reuse glTF meshes');
  kit.disposeBatch(batch);
}
const crane=kit.part('crane'),before=new T.Box3().setFromObject(crane);kit.setCranePose(crane,1);const after=new T.Box3().setFromObject(crane);assert(before.max.distanceTo(after.max)>.5,'crane deployment moves real geometry');
const doc=checkExport(crane);assert(doc.nodes.some(n=>n.name==='handling shoulder'));assert(doc.nodes.some(n=>n.name==='handling elbow'));
const truss=kit.part('truss');assert.deepEqual(Array.from(truss.userData.sockets.forward),[-6,0,0]);assert.deepEqual(Array.from(truss.userData.sockets.aft),[6,0,0]);
const engine=kit.part('engine');engine.updateMatrixWorld(true);const ray=new T.Raycaster(new T.Vector3(10,0,0),new T.Vector3(-1,0,0));const first=ray.intersectObject(engine,true)[0];assert(first,'engine throat is backed by geometry');assert(first.object.material.emissive.getHex()>0,'engine throat remains visible through the hollow bell without a solid collar obstructing it');
const cabin=kit.part('cabin');assert(cabin.getObjectByName('rounded crew pressure shell'),'rounded pressure cabin replaces the cab');assert.equal(cabin.userData.environment,'zero-g pressure module');
assert.throws(()=>kit.part('unknown'));assert.throws(()=>kit.assembly('unknown'));
console.log('Industrial kit: geometry, transformed batching, crane pivots and embedded glTF pass.');

// Reference actors preserve physical size and remain outside ship/export ownership.
{
  const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
  const root=path.resolve(__dirname,'..'),scope={THREE:T};vm.createContext(scope);
  const source=fs.readFileSync(path.join(root,'assets/ships/industrial-kit/scale.js'),'utf8').replace(/^import .*?;\s*/m,'const T=THREE;\n').replace(/^export /gm,'');
  vm.runInContext(source+'\nglobalThis.references={makeReferenceTemplates,createScaleReferences};',scope);
  const data={window:{Driftworks:{}}};vm.runInNewContext(fs.readFileSync(path.join(root,'assets/ships/aegis-kit/reference-fighter.js'),'utf8'),data);
  const unitCrew=[{color:[1,1,1],vertices:[-.2,0,0,0,-1,0,.2,0,0,0,-1,0,0,0,1,0,-1,0]}];
  const templates=scope.references.makeReferenceTemplates(unitCrew,data.window.Driftworks.aegisReferenceFighter);
  const crewBounds=new T.Box3().setFromObject(templates.crew,true);
  assert(Math.abs(crewBounds.max.y-crewBounds.min.y-1.8)<.000001);assert.equal(crewBounds.min.y,0,'reference feet stay at their attachment origin');
  assert(Math.abs(new T.Box3().setFromObject(templates.fighter,true).getSize(new T.Vector3()).x-12)<.0001,'reuse the real calibrated fighter without comparison resizing');
  for(const name of kit.shipNames){
    const ship=kit.assembly(name),before=kit.exportGLTF(ship),refs=scope.references.createScaleReferences(ship,name,templates);
    assert.equal(refs.children.length,4,'three suited crew and one fighter');assert.equal(kit.exportGLTF(ship),before,'reference setup never changes the ship export');
    const fighterBounds=new T.Box3().setFromObject(refs.children[3],true),shipBounds=new T.Box3().setFromObject(ship,true);
    assert(fighterBounds.min.z>shipBounds.max.z,'fighter stands clear of the ship');
    for(const person of refs.children.slice(0,3)){assert.equal(person.userData.heightMeters,1.8);assert.equal(person.scale.y,1);assert(Math.abs(person.rotation.z)>.3,'EVA crew float in different orientations');person.updateMatrixWorld(true);const feet=person.localToWorld(new T.Vector3(0,-.9,0)),head=person.localToWorld(new T.Vector3(0,.9,0));assert(Math.abs(feet.distanceTo(head)-1.8)<.000001,'EVA rotation preserves physical stature');}
  }
  assert.equal(scope.references.createScaleReferences(kit.assembly('fleet'),'fleet',templates).children.length,3*kit.shipNames.length+1);
  assert.equal(scope.references.createScaleReferences(kit.part('coupler'),'coupler',templates).children.length,0,'fighter does not dominate isolated component inspection');
  console.log('Industrial scale references: 1.80 m crew, calibrated fighter, clearance and export isolation pass.');
}

// Rigid manipulation must be covariant under arbitrary whole-rig orientation.
{
  const crane=kit.part('latticeCrane'),wrist=crane.getObjectByName('capture wrist');
  for(const deployment of [0,.5,1]){
    kit.setCranePose(crane,deployment);kit.setArmExtension(crane,0);crane.updateMatrixWorld(true);const start=wrist.getWorldPosition(new T.Vector3());
    kit.setArmExtension(crane,1);crane.updateMatrixWorld(true);const end=wrist.getWorldPosition(new T.Vector3()),delta=end.clone().sub(start);
    assert(Math.abs(delta.length()-2.2)<.000001,'rigid carriage extends 2.2 metres');
    const rotation=new T.Quaternion().setFromEuler(new T.Euler(.7,-.5,1.1));crane.quaternion.copy(rotation);crane.updateMatrixWorld(true);
    assert(wrist.getWorldPosition(new T.Vector3()).distanceTo(end.clone().applyQuaternion(rotation))<.000001,'capture frame has no hidden world-up compensation');
    kit.setArmExtension(crane,0);crane.updateMatrixWorld(true);assert(wrist.getWorldPosition(new T.Vector3()).distanceTo(start.clone().applyQuaternion(rotation))<.000001);
    crane.quaternion.identity();
  }
  crane.traverse(o=>{assert.notEqual(o.userData.joint,'vertical-hoist');assert.equal(o.userData.hoistRole,undefined);});
  const tank=kit.part('bulkTank'),vessel=tank.getObjectByName('domed bulk-fluid vessel'),bounds=new T.Box3().setFromObject(vessel,true);
  assert(Math.abs(bounds.getSize(new T.Vector3()).x-24)<.0001);assert(Math.abs(bounds.getSize(new T.Vector3()).y-11)<.0001,'large tank diameter is authored, not display-scaled');
  assert.equal(kit.assembly('bulkCarrier').children.filter(o=>o.userData.part==='bulkTank').length,2);
  const positions=vessel.geometry.attributes.position,normals=vessel.geometry.attributes.normal,index=vessel.geometry.index;
  for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)],points=ids.map(j=>new T.Vector3().fromBufferAttribute(positions,j));const geometric=new T.Vector3().subVectors(points[1],points[0]).cross(new T.Vector3().subVectors(points[2],points[0])).normalize();const authored=new T.Vector3();ids.forEach(j=>authored.add(new T.Vector3().fromBufferAttribute(normals,j)));assert(geometric.dot(authored)>0,'bulk tank triangles and authored normals face outward');}
  console.log('Bulk industrial modules: tank dimensions, rigid capture articulation and orientation-independent extension pass.');
}

// Route consists use one structural interface across interchangeable payloads.
{
  for(const [route,types] of Object.entries(kit.routePresets)){
    const ship=kit.buildConsist(types),bays=ship.children.filter(o=>o.userData.standardBay);
    assert.equal(bays.length,types.length);assert.equal(ship.userData.separation,0);
    bays.forEach((bay,i)=>{
      const length=14*(types[i]==='bulkFluid'?2:1);assert.equal(bay.userData.interface,kit.moduleStandard.interface);
      assert.equal(bay.userData.sockets.aft[0]-bay.userData.sockets.forward[0],length);
      if(i){const previous=bays[i-1];assert.equal(previous.position.x+previous.userData.sockets.aft[0],bay.position.x+bay.userData.sockets.forward[0],'adjacent structural interfaces coincide exactly');}
    });
    const span=types.reduce((n,type)=>n+(type==='bulkFluid'?2:1),0);assert.equal(ship.userData.structuralLength,span*14);
    const exploded=kit.buildConsist(types,{separation:4}),separated=exploded.children.filter(o=>o.userData.standardBay);
    assert.equal(exploded.userData.structuralLength,span*14+4*(types.length-1));
    separated.forEach((bay,i)=>assert.equal(bay.position.x-bays[i].position.x,i*4,'explosion is a translation, not a rescale'));
    const batch=kit.batchStatic(ship);assert.equal(triangles(batch),triangles(ship));assert(batch.children.length<=9);kit.disposeBatch(batch);checkExport(ship);
  }
  for(const type of kit.moduleStandard.payloads){const bay=kit.standardBay(type);assert.equal(bay.scale.x,1);assert.equal(bay.userData.span,type==='bulkFluid'?2:1);assert(bay.getObjectByName('Interchangeable payload / '+type));}
  const cargo=kit.standardBay('cargo').getObjectByName('Interchangeable payload / cargo');
  assert.equal(cargo.children.filter(o=>o.userData.part==='cargo').length,4,'standard box containers fit four to a scaffold bay');
  const cargoBounds=new T.Box3().setFromObject(cargo,true);assert(cargoBounds.max.y<=6.3&&cargoBounds.min.y>=-6.3&&cargoBounds.max.z<=6.3&&cargoBounds.min.z>=-6.3,'cargo and restraints fit the standard frame');
  assert.throws(()=>kit.buildConsist([]));assert.throws(()=>kit.buildConsist(['unknown']));assert.throws(()=>kit.buildConsist(Array(7).fill('empty')));
  assert.throws(()=>kit.standardBay('unknown'));
  console.log('Standard route modules: shared interfaces, double bays, rigid locks, cargo fit, exploded spacing and export pass.');
}

{
  const fs=require('fs'),vm=require('vm');const page=fs.readFileSync(require('path').join(__dirname,'../studies/industrial-kit.html'),'utf8');
  const inline=page.split('<script type="module">')[1].split('</script>')[0].replace(/^import .*;$/gm,'');
  assert.doesNotThrow(()=>new vm.Script(inline),'route viewer module remains syntactically valid');
}
