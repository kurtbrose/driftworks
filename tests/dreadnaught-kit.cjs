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
  const html=fs.readFileSync(path.join(root,'experiments/dreadnaught-kit.html'),'utf8');
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
  console.log('PASS Aegis kit: outward armor, open couplings, viewport framing, two attachment banks, shared true-scale fighters and stable ship-only OBJ exports');
})().catch(error=>{console.error(error);process.exitCode=1;});

