'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
(async () => {
  const root=path.join(__dirname,'..');
  const real=await import(pathToFileURL(path.join(root,'vendor/three/build/three.module.js')).href);
  const elements={};
  const initial={prow:'lance',count:'4',mission:'standard',drive:'standard',attachment:'turret',explode:'0',preset:'cruiser'};
  const element=id=>elements[id] ||= {value:initial[id]||'',checked:false,clientWidth:1000,clientHeight:700,addEventListener(type,fn){this[type]=fn;},prepend(){}};
  let exported;
  class Renderer {setPixelRatio(){}setClearColor(){}setSize(){}setAnimationLoop(){}}
  class Controls {constructor(){this.target=new real.Vector3();}update(){}}
  const context=vm.createContext({THREE:{...real,WebGLRenderer:Renderer},OrbitControls:Controls,devicePixelRatio:1,
    document:{getElementById:element,createElement:()=>({click(){}})},
    ResizeObserver:class{observe(){}},Blob,URL:{createObjectURL(blob){exported=blob;return 'blob:test';},revokeObjectURL(){}},setTimeout:fn=>fn()});
  const html=fs.readFileSync(path.join(root,'experiments/dreadnaught-kit.html'),'utf8');
  const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;$/gm,'');
  vm.runInContext(source,context);
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
  element('viewport').clientWidth=500;element('viewport').clientHeight=900;vm.runInContext('view()',context);
  const tallDistance=vm.runInContext('camera.position.length()',context);
  element('viewport').clientWidth=1200;element('viewport').clientHeight=700;vm.runInContext('view()',context);
  assert.ok(tallDistance>vm.runInContext('camera.position.length()',context),'tall viewports pull back to fit the ship');
  for(const mission of ['standard','hangar','utility'])for(const attachment of ['turret','cargo','sensor','none']) {
    element('mission').value=mission;element('attachment').value=attachment;
    vm.runInContext('rebuild()',context);
    vm.runInContext('ship',context).traverse(o=>{if(o.isMesh)for(const v of o.geometry.attributes.position.array)assert.ok(Number.isFinite(v));});
  }
  for(const preset of ['cruiser','carrier','battleship']) {
    element('preset').value=preset;element('preset').change();
    const ship=vm.runInContext('ship',context),count=Number(element('count').value);
    assert.equal(ship.children.length,count+2);
    let meshes=0;
    ship.traverse(o=>{if(o.isMesh){meshes++;for(const value of o.geometry.attributes.position.array)assert.ok(Number.isFinite(value));}});
    assert.ok(meshes>100);
    // Every section touches its successor in assembled coordinates.
    for(let i=1;i<ship.children.length;i++)assert.ok(ship.children[i].position.x>ship.children[i-1].position.x);
    element('explode').value='70';vm.runInContext('rebuild()',context);
    element('export').onclick();
    assert.equal(element('explode').value,'70','export restores inspection state');
    const obj=await exported.text();
    const vertices=obj.split('\n').filter(l=>l.startsWith('v '));
    const faces=obj.split('\n').filter(l=>l.startsWith('f '));
    assert.ok(vertices.length>1000);assert.ok(faces.length>1000);
    assert.equal(obj.split('\n').filter(l=>l.startsWith('o ')&&l.endsWith('_attachment')).length,count);
    assert.equal(obj.split('\n').filter(l=>l.startsWith('o ')).length,count*2+2);
    for(const face of faces)for(const index of face.slice(2).split(' ').map(Number))assert.ok(index>=1&&index<=vertices.length);
    // Exported assembly is independent of explosion state.
    element('explode').value='0';element('export').onclick();assert.equal(await exported.text(),obj);
    if(process.argv.includes('--export')) {
      const dir=path.join(root,'assets/ships/aegis-kit');fs.mkdirSync(dir,{recursive:true});
      fs.writeFileSync(path.join(dir,`aegis-${preset}.obj`),obj);
    }
  }
  console.log('PASS Aegis kit: outward armor normals, open coupling rings, viewport framing, mission/attachment combinations, presets and stable assembled OBJ exports');
})().catch(error=>{console.error(error);process.exitCode=1;});

