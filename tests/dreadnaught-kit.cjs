'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
(async () => {
  const root=path.join(__dirname,'..');
  require('node:child_process').execFileSync(process.execPath,[path.join(root,'tools/bake-aegis-reference.cjs'),'--check'],{stdio:'pipe'});
  const real=await import(pathToFileURL(path.join(root,'vendor/three/build/three.module.js')).href);
  const elements={};
  const initial={prow:'lance',count:'4',mission:'standard',drive:'standard',attachment:'turret',ventral:'turret',explode:'0',preset:'cruiser'};
  const element=id=>elements[id] ||= {value:initial[id]||'',checked:false,clientWidth:1000,clientHeight:700,addEventListener(type,fn){this[type]=fn;},prepend(){}};
  let exported;
  class Renderer {setPixelRatio(){}setClearColor(){}setSize(){}setAnimationLoop(){}}
  class Controls {constructor(){this.target=new real.Vector3();}update(){}}
  const context=vm.createContext({THREE:{...real,WebGLRenderer:Renderer},OrbitControls:Controls,devicePixelRatio:1,window:{},
    document:{getElementById:element,createElement:()=>({click(){}})},
    ResizeObserver:class{observe(){}},Blob,URL:{createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){}},setTimeout:fn=>fn()});
  const html=fs.readFileSync(path.join(root,'studies/legacy-dreadnaught-kit.html'),'utf8');
  vm.runInContext(fs.readFileSync(path.join(root,'assets/ships/aegis-kit/reference-fighter.js'),'utf8'),context);
  const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;$/gm,'');
  vm.runInContext(source,context);
  const escorts=vm.runInContext('escorts',context);
  assert.equal(escorts.children.length,4);
  for(const fighter of escorts.children){const bounds=new real.Box3().setFromObject(fighter);assert.ok(Math.abs((bounds.max.x-bounds.min.x)*9-12)<.1,'shared fighter remains twelve meters long');}
  element('fighters').checked=false;element('fighters').change();assert.equal(escorts.visible,false);
  element('escort-view').onclick();assert.equal(escorts.visible,true);assert.equal(element('fighters').checked,true);
  assert.deepEqual(Array.from(vm.runInContext('controls.target.toArray()',context)),[-13,0,14]);
  // New hull primitives must face outward and keep the coupling aperture open.
  const shell=new real.Group();context.shell=shell;
  vm.runInContext('loft(shell,[[-2,10,8],[2,10,8]])',context);
  const normals=shell.children[0].geometry.attributes.normal;
  const positions=shell.children[0].geometry.attributes.position;
  for(let i=0;i<positions.count;i++) {
    const p=new real.Vector3().fromBufferAttribute(positions,i);
    const n=new real.Vector3().fromBufferAttribute(normals,i);
    assert.ok(p.dot(n)>0,'convex armor normals face outward');
  }
  const ring=new real.Group();context.ring=ring;vm.runInContext('collar(ring,0)',context);ring.updateMatrixWorld(true);
  const ray=new real.Raycaster(new real.Vector3(-20,0,0),new real.Vector3(1,0,0));
  assert.equal(ray.intersectObject(ring,true).length,0,'coupling center remains open');
  ray.ray.origin.z=4.8;assert.ok(ray.intersectObject(ring,true).length>0,'coupling has solid perimeter');
  const hangar=new real.Group();context.hangar=hangar;vm.runInContext("mid(hangar,'hangar')",context);hangar.updateMatrixWorld(true);
  const through=new real.Raycaster(new real.Vector3(0,0,-20),new real.Vector3(0,0,1));
  assert.equal(through.intersectObject(hangar,true).length,0,'hangar is open from one side through the other');
  through.ray.origin.y=1.6;assert.ok(through.intersectObject(hangar,true).length>0,'thick roof fills the former upper opening');
  through.ray.origin.y=-1.6;assert.ok(through.intersectObject(hangar,true).length>0,'thick deck fills the former lower opening');through.ray.origin.y=0;
  through.ray.origin.x=6.7;assert.ok(through.intersectObject(hangar,true).length>0,'hangar has solid end walls');
  const floorRay=new real.Raycaster(new real.Vector3(0,0,0),new real.Vector3(0,-1,0));assert.ok(floorRay.intersectObject(hangar,true).length>0,'hangar has a solid deck');
  const runwayRay=new real.Raycaster(new real.Vector3(3.5,0,0),new real.Vector3(0,-1,0));
  const runwayHits=runwayRay.intersectObject(hangar,true),runway=runwayHits.find(h=>h.object.material.emissiveIntensity===3),deck=runwayHits.find(h=>Math.abs(h.distance-1.3)<1e-5);
  assert.ok(runway&&deck&&deck.distance-runway.distance>.1,'runway lights stand clear of the deck instead of nearly coplanar surfaces');
  element('preset').value='battleship';element('preset').change();
  element('segments').change({target:{dataset:{segment:'0',slot:'mission'},value:'utility'}});
  element('segments').change({target:{dataset:{segment:'0',slot:'attachment'},value:'sensor'}});
  element('segments').change({target:{dataset:{segment:'0',slot:'ventral'},value:'cargo'}});
  const mixed=vm.runInContext('ship',context);assert.equal(mixed.children[1].name,'M_1_utility');assert.equal(mixed.children[2].name,'M_2_hangar');assert.equal(mixed.children[3].name,'M_3_standard');
  assert.equal(vm.runInContext("segmentChoice(0).attachment",context),'sensor');assert.equal(vm.runInContext("segmentChoice(1).attachment",context),'turret');
  element('reset-segments').onclick();assert.equal(vm.runInContext("segmentChoice(0).mission",context),'standard');
  element('viewport').clientWidth=500;element('viewport').clientHeight=900;vm.runInContext('view()',context);
  const tallDistance=vm.runInContext('camera.position.length()',context);
  element('viewport').clientWidth=1200;element('viewport').clientHeight=700;vm.runInContext('view()',context);
  assert.ok(tallDistance>vm.runInContext('camera.position.length()',context),'tall viewports pull back to fit the ship');
  for(const mission of ['standard','hangar','utility'])for(const attachment of ['turret','cargo','sensor','none']) {
    element('mission').value=mission;element('attachment').value=attachment;element('ventral').value=attachment;
    vm.runInContext('rebuild()',context);
    vm.runInContext('ship',context).traverse(o=>{if(o.isMesh)for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));});
  }
  for(const preset of ['cruiser','carrier','battleship']) {
    element('preset').value=preset;element('preset').change();
    const ship=vm.runInContext('ship',context),count=Number(element('count').value);
    assert.equal(ship.children.length,count+2);
    for(const section of ship.children.filter(o=>o.name.startsWith('M_'))) {
      const top=section.getObjectByName('dorsal_socket'),bottom=section.getObjectByName('ventral_socket');
      assert.ok(new real.Box3().setFromObject(top).min.y>3.9);
      assert.ok(new real.Box3().setFromObject(bottom).max.y< -3.9,'ventral geometry points outward below hull');
      assert.ok(Math.abs(bottom.rotation.x-Math.PI)<1e-9,'rotation keeps forward direction and outward normals');
    }
    let meshes=0;
    ship.traverse(o=>{if(o.isMesh){meshes++;for(const value of o.geometry.attributes.position.array)assert.ok(Number.isFinite(value));}});
    assert.ok(meshes>100);
    // Every section touches its successor in assembled coordinates.
    for(let i=1;i<ship.children.length;i++)assert.ok(ship.children[i].position.x>ship.children[i-1].position.x);
    element('explode').value='70';vm.runInContext('rebuild()',context);
    for(const section of vm.runInContext('ship',context).children.filter(o=>o.name.startsWith('M_'))) {
      assert.ok(section.getObjectByName('dorsal_socket').position.y>0);
      assert.ok(section.getObjectByName('ventral_socket').position.y<0,'explosion moves ventral sockets down');
    }
    element('export').onclick();
    assert.equal(element('explode').value,'70','export restores inspection state');
    const obj=await exported.text();
    const vertices=obj.split('\n').filter(l=>l.startsWith('v '));
    const faces=obj.split('\n').filter(l=>l.startsWith('f '));
    assert.ok(vertices.length>1000);assert.ok(faces.length>1000);
    assert.equal(obj.split('\n').filter(l=>l.startsWith('o ')&&l.endsWith('_attachment')).length,count*2);
    assert.equal(obj.split('\n').filter(l=>l.startsWith('o ')&&l.endsWith('_ventral_attachment')).length,count);
    assert.equal(obj.split('\n').filter(l=>l.startsWith('o ')).length,count*3+2);
    assert.ok(!obj.includes('Spitfire'),'scale references stay out of ship exports');
    for(const face of faces)for(const index of face.slice(2).split(' ').map(Number))assert.ok(index>=1&&index<=vertices.length);
    // Exported assembly is independent of explosion state.
    element('explode').value='0';element('export').onclick();assert.equal(await exported.text(),obj);
    if(process.argv.includes('--export')) {
      const dir=path.join(root,'assets/ships/aegis-kit');fs.mkdirSync(dir,{recursive:true});
      fs.writeFileSync(path.join(dir,`aegis-${preset}.obj`),obj);
    }
  }
  // The fleet exploration shares original primitives, at the same 9 m/unit scale.
  require('node:child_process').execFileSync(process.execPath,[path.join(root,'tools/extract-aegis-kit.cjs'),'--check']);
  const fleetScope=vm.createContext({THREE:real,T:real});
  const primitiveSource=fs.readFileSync(path.join(root,'studies/aegis-module-primitives.js'),'utf8').replace(/^import .*;$/gm,'').replace(/^export .*;$/gm,'');
  vm.runInContext(primitiveSource,fleetScope);
  const equipmentSource=fs.readFileSync(path.join(root,'studies/aegis-equipment-detail.js'),'utf8').replace(/^import \{bridge as.*;$/gm,'const originalBridge=bridge,originalAttach=attach;').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  vm.runInContext(equipmentSource+'\nsensor=detailedSensor;bridge=detailedBridge;attach=detailedAttachment;',fleetScope);
  const fleetSource=fs.readFileSync(path.join(root,'studies/aegis-modular-kit.js'),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  vm.runInContext(fleetSource+'\nglobalThis.kit={hullTypes,recipes,section,vessel,fleet,batchStatic,disposeBatch};',fleetScope);
  const kit=fleetScope.kit;
  const triangleCount=obj=>{let count=0;obj.traverse(o=>{if(o.isMesh)count+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;});return count;};
  for(let i=0;i<kit.recipes.length;i++){
    const obj=kit.vessel(i),recipe=kit.recipes[i],bounds=new real.Box3().setFromObject(obj,true);
    assert.equal(obj.scale.x,9);assert.equal(obj.children.length,recipe.modules.length+2);
    assert(obj.children.at(-1).getObjectByName('command_citadel'),'command bridge belongs to the common stern terminal');
    assert(obj.children.slice(1,-1).every(o=>!o.getObjectByName('command_citadel')),'mission hardware keeps its full section roof');
    assert.deepEqual(Array.from(obj.userData.manifest),Array.from(recipe.modules));
    for(let j=2;j<obj.children.length-1;j++)assert.equal((obj.children[j].position.x-obj.children[j-1].position.x)*9,144,'hull coupling pitch remains 144 metres');
    obj.traverse(o=>{if(o.isMesh)assert([...o.geometry.attributes.position.array].every(Number.isFinite));});
    const batch=kit.batchStatic(obj),actual=new real.Box3().setFromObject(batch,true);
    assert(bounds.min.distanceTo(actual.min)<.001&&bounds.max.distanceTo(actual.max)<.001,'batch keeps metre scale and bounds');
    assert.equal(triangleCount(batch),triangleCount(obj));assert(batch.children.length<=9);kit.disposeBatch(batch);
  }
  const operations=kit.section('operations');operations.updateMatrixWorld(true);
  assert.equal(new real.Raycaster(new real.Vector3(0,0,-20),new real.Vector3(0,0,1)).intersectObject(operations,true).length,0,'control galleries preserve the through hangar');
  const custom=kit.vessel(0,{modules:['operations','missile'],upper:['none','none'],lower:['none','none'],separation:6});
  assert.deepEqual(Array.from(custom.userData.manifest),['operations','missile']);
  assert(custom.children[2].position.x-custom.children[1].position.x>16,'exploded view separates modules');
  assert.equal(kit.recipes[0].modules[0],'sensor','custom assemblies do not mutate presets');
  assert.throws(()=>kit.vessel(0,{modules:['hangar']}));assert.throws(()=>kit.vessel(0,{upper:['wrong','none']}));assert.throws(()=>kit.section('unknown'));assert.throws(()=>kit.vessel(0,{modules:['missile','standard'],upper:['turret','turret']}));
  assert.equal(kit.fleet().children.length,8);
  const ventSource=fs.readFileSync(path.join(root,'studies/aegis-prow-vents.js'),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  vm.runInContext(ventSource,fleetScope);
  const toysSource=fs.readFileSync(path.join(root,'studies/aegis-toybox-kit.js'),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  vm.runInContext(toysSource+'\nglobalThis.toys={toyParts,toyPart,toybox};',fleetScope);
  const toys=fleetScope.toys;assert.equal(toys.toyParts.length,19);assert.equal(new Set(toys.toyParts.map(p=>p.id)).size,19);
  for(const type of kit.hullTypes)assert(toys.toyParts.some(p=>p.type===type),'every mission hull is in the inventory');
  for(const entry of toys.toyParts){
    const obj=toys.toyPart(entry.id),bounds=new real.Box3().setFromObject(obj,true);
    assert.equal(obj.scale.x,9);assert.equal(obj.userData.partId,entry.id);assert(triangleCount(obj)>0);
    obj.traverse(o=>{if(o.isMesh)assert([...o.geometry.attributes.position.array].every(Number.isFinite));});
    const batch=kit.batchStatic(obj),actual=new real.Box3().setFromObject(batch,true);
    assert.equal(triangleCount(batch),triangleCount(obj));assert(bounds.min.distanceTo(actual.min)+bounds.max.distanceTo(actual.max)<.001);kit.disposeBatch(batch);
  }
  const bench=toys.toybox();assert.equal(bench.children.length,19);
  const boxes=bench.children.map(o=>new real.Box3().setFromObject(o,true));
  boxes.forEach((b,i)=>boxes.slice(i+1).forEach(other=>assert(!b.intersectsBox(other),'unpacked inventory parts do not overlap')));
  assert.throws(()=>toys.toyPart('missing'));
  const finishSource=fs.readFileSync(path.join(root,'studies/aegis-toybox-finish.js'),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  vm.runInContext(finishSource+'\nglobalThis.finish={applyReviewFinish,finishNotes,finishCost};',fleetScope);
  const sharedColorMaps=new Set(),sharedRoughnessMaps=new Set(),ventMaps=new Set();
  const finish=fleetScope.finish;assert.equal(finish.finishCost.extraDraws,0);assert.equal(finish.finishCost.extraTriangles,0);
  for(const entry of toys.toyParts){
    assert.equal(finish.finishNotes[entry.id].length,2,'every part has its own review notes');
    const batch=kit.batchStatic(toys.toyPart(entry.id)),before=[];
    batch.traverse(o=>{if(o.isMesh)before.push({o,material:o.material,positions:o.geometry.attributes.position,normals:o.geometry.attributes.normal});});
    finish.applyReviewFinish(batch,true);assert.equal(batch.children.length,before.length);
    for(const {o,material} of before){if(o.material.userData.finishRole==='prow-vent')ventMaps.add(o.material.map);else if(o.material.map)sharedColorMaps.add(o.material.map);if(o.material.roughnessMap)sharedRoughnessMaps.add(o.material.roughnessMap);if(material.emissiveIntensity>1)assert.equal(o.material,material,'lights stay unchanged');}
    for(const {o,positions,normals} of before){assert.equal(o.geometry.attributes.position,positions);assert.equal(o.geometry.attributes.normal,normals);assert.equal(o.geometry.attributes.uv.count,positions.count);assert([...o.geometry.attributes.uv.array].every(Number.isFinite));}
    finish.applyReviewFinish(batch,false);for(const {o,material} of before)assert.equal(o.material,material,'A/B restores exact original materials');kit.disposeBatch(batch);
  }
  const ventProw=toys.toyPart('prow-lance'),ventMeshes=[];ventProw.traverse(o=>{if(o.userData.prowVent)ventMeshes.push(o);});
  assert.equal(ventProw.userData.prowVentCount,16);assert.equal(ventMeshes.length,16);assert.equal(new Set(ventMeshes.map(o=>o.material)).size,1);
  const ventBatch=kit.batchStatic(ventProw),ventBucket=ventBatch.children.find(o=>o.material.userData.preserveAuthorUV),panelUV=ventBucket.geometry.attributes.uv;
  assert([...panelUV.array].every(v=>v>=0&&v<=1),'vent tile stays inside each original panel UV rectangle');
  finish.applyReviewFinish(ventBatch,true);assert.equal(ventBucket.geometry.attributes.uv,panelUV,'generic surface projection does not overwrite panel UVs');
  assert.equal(ventMaps.size,1,'all roof panels share one vent texture');
  const plainProw=toys.toyPart('prow-lance'),plainTrim=vm.runInContext('trim',fleetScope);plainProw.traverse(o=>{if(o.userData.prowVent)o.material=plainTrim;});
  const plainBatch=kit.batchStatic(plainProw);assert.equal(ventBatch.children.length,plainBatch.children.length+1,'isolating the vents costs exactly one material batch');assert.equal(triangleCount(ventBatch),triangleCount(plainBatch));
  kit.disposeBatch(ventBatch);kit.disposeBatch(plainBatch);
  assert.equal(sharedColorMaps.size,1,'one shared paint map across the inventory');assert.equal(sharedRoughnessMaps.size,1,'one shared roughness map across the inventory');
  for(const map of sharedColorMaps)for(let i=0;i<map.image.data.length;i+=4)assert(map.image.data[i]>=240,'surface grain contains no artificial dark seam rows or columns');
  const lightingScope=vm.createContext({T:real});
  const lightingSource=fs.readFileSync(path.join(root,'studies/aegis-toybox-lighting.js'),'utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,'');
  vm.runInContext(lightingSource+'\nglobalThis.lighting={lightingPresets,createReviewLighting};',lightingScope);
  const lightingScene=new real.Scene(),rig=lightingScope.lighting.createReviewLighting(lightingScene),count=lightingScene.children.length;
  const lightingBounds=new real.Box3(new real.Vector3(10,-2,30),new real.Vector3(50,12,80)),lightCenter=lightingBounds.getCenter(new real.Vector3());
  for(const preset of lightingScope.lighting.lightingPresets)for(const angle of [-180,0,90,180]){
    rig.update(preset.id,angle,lightingBounds);assert.equal(lightingScene.children.length,count,'light sweeps reuse the same rig');
    lightingScene.traverse(o=>{if(o.isDirectionalLight){assert(o.target.position.distanceTo(lightCenter)<.00001);assert(o.position.toArray().every(Number.isFinite));}});
  }
  rig.update('studio',0,lightingBounds);const studioAmbient=lightingScene.children[0].intensity;rig.update('grazing',0,lightingBounds);assert(lightingScene.children[0].intensity<studioAmbient/5,'grazing inspection reduces ambient wash');
  console.log('PASS toybox lighting: preset/sweep reuse, centered light targets, finite positions and reduced grazing fill');
  console.log('PASS toybox material review: per-part notes, finite UVs, unchanged geometry/draws and exact original restoration');
  console.log('PASS Aegis toybox: complete unique inventory, real scale, separate nonoverlapping parts and batched geometry');
  const sensorPart=toys.toyPart('attachment-sensor'),commandPart=toys.toyPart('structure-bridge');
  assert(sensorPart.getObjectByName('sensor mast / detailed'));assert(sensorPart.getObjectByName('four-face sensor array'));assert(sensorPart.getObjectByName('enclosed sensor mast'));
  assert(!sensorPart.getObjectByName('communications dish'));
  const sensorBounds=new real.Box3().setFromObject(sensorPart),sensorSize=sensorBounds.getSize(new real.Vector3());assert(sensorSize.y<sensorSize.z,'sensor assembly stays broader than tall');
  const citadel=commandPart.getObjectByName('command_citadel'),windows=[];citadel.traverse(o=>{if(o.name==='command window')windows.push(o);});
  assert.equal(windows.length,citadel.userData.windowCount);assert(windows.length>=200,'window banks read as multiple occupied decks');
  assert(citadel.getObjectByName('command communications mast'));assert(citadel.getObjectByName('enclosed command mast'));
  for(const pane of windows){const sizes=pane.geometry.parameters;assert(Math.abs(sizes.height*9-.675)<.001,'window height stays at human scale');}
  const sensorHull=kit.section('sensor');assert(sensorHull.getObjectByName('sensor mast / detailed'),'sensor hull reuses detailed hardware');
  const installed=kit.vessel(0);assert(installed.getObjectByName('command communications mast'),'fleet terminals reuse the detailed command mast');
  for(const object of [sensorPart,commandPart]){
    object.traverse(o=>{if(!o.isMesh)return;const normals=o.geometry.attributes.normal;for(let i=0;i<normals.count;i++)assert(Math.abs(Math.hypot(normals.getX(i),normals.getY(i),normals.getZ(i))-1)<.001,'new equipment has finite unit normals');});
    const batch=kit.batchStatic(object);assert.equal(triangleCount(batch),triangleCount(object));assert(batch.children.length<=9,'equipment detail remains palette-batched');kit.disposeBatch(batch);
  }
  console.log('PASS detailed equipment: connected sensor assemblies, command windows at metre scale, shared fleet hardware and palette batching');
  console.log('PASS Aegis fleet study: shared source freshness, physical pitch, swappable manifests, through passage and batching');
  console.log('PASS Aegis kit: outward armor, open couplings, viewport framing, two attachment banks, shared true-scale fighters and stable ship-only OBJ exports');
})().catch(error=>{console.error(error);process.exitCode=1;});

