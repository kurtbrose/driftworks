import {createRockMaterial} from './asteroid-rock-material.js';
import * as THREE from '../vendor/three/build/three.module.js';
import {geometryFromInterleaved as geometry,applyCameraFrame} from './asteroid-three-bridge.js';

// Isolated migration test. Simulation, mesh generation and geology stay shared.
const DW=window.Driftworks, api=DW.scene3d, units=DW.sim.METERS_PER_UNIT;
const rawHost=document.getElementById('raw'), threeHost=document.getElementById('three');
const status=document.getElementById('status');
window.addEventListener('error',event=>{status.textContent='Renderer error: '+event.message;});
let world=DW.sim.createInitialWorld(), asteroid=world.asteroids[0];
asteroid.position={x:0,y:0};asteroid.previousPosition={x:0,y:0};asteroid.rotation=0;
world.asteroids=[asteroid];world.ships=[];world.platforms=[];world.wrecks=[];world.packets=[];world.selectedShipIds=[];world.combat.drones=[];
const raw=api.create(rawHost,()=>world,value=>{world=value;},{study:true});
rawHost.querySelector('.night-sky-background').style.background='none';
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x080d11);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
renderer.toneMapping=THREE.NoToneMapping;
threeHost.append(renderer.domElement);
const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(45,1,.1,30000);
camera.up.set(0,0,1);
const ambient=new THREE.AmbientLight(0xffffff,.17);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xffffff,Math.PI*.98);
sun.position.set(-.813733,-.581238,.68).normalize();sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);scene.add(sun,sun.target);
const lamp=new THREE.SpotLight(0xe0f0ff,.35,30/units,Math.acos(.8),.44,2);
lamp.shadow.mapSize.set(1024,1024);lamp.shadow.camera.near=.05/units;
lamp.shadow.camera.far=30/units;lamp.shadow.bias=-.0001;lamp.shadow.normalBias=.015/units;
lamp.castShadow=true;scene.add(lamp,lamp.target);
const fixtureGroup=new THREE.Group();scene.add(fixtureGroup);
let rock=null, craterTexture=null, uniforms=null, meshData=null, fixtureBatches=[];
let mode='orbit', yaw=0,tilt=.9,lightOn=false,shadows=true,dirty=true;
let walkX=0,walkY=0,lookYaw=0,lookPitch=-.12,frame=null,forward=null,right=null,base=null;
const keys=new Set();
let benchmarking=false;
const detail=()=>document.getElementById('detail').value;
const vec=v=>new THREE.Vector3(...v), arr=v=>v.toArray();
const normalize=v=>arr(vec(v).normalize()), cross=(a,b)=>arr(vec(a).cross(vec(b)));
function tangent(v,n){return arr(vec(v).addScaledVector(vec(n),-vec(v).dot(vec(n))).normalize());}
function makeRockMaterial(){
  const result=createRockMaterial(asteroid,craterTexture,{detailMode:detail(),originalResponse:document.getElementById('response').value==='original',specular:document.getElementById('specular').value!=='off'});
  uniforms=result.uniforms;
  return result.material;
}
function disposeFixtures(){for(const mesh of [...fixtureGroup.children]){fixtureGroup.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}}
function updateFixtures(){
  renderer.shadowMap.needsUpdate=true;
  disposeFixtures();fixtureBatches=[];
  const kind=document.getElementById('fixture').value;
  if(mode!=='surface'||kind==='none'){raw.setStudyActors([]);return;}
  const sample=DW.miningStudyTerrain.meshSampler(meshData,asteroid.radius,base);
  const ground=(along,side)=>{
    const p=base.map((v,i)=>v+(forward[i]*along+right[i]*side)/units);
    return sample.ray(p.map((v,i)=>v+frame.normal[i]*10/units),frame.normal.map(v=>-v))?.point;
  };
  if(kind==='posts'){
    const shape=new THREE.BoxGeometry(.36/units,.36/units,1);
    const source=shape.toNonIndexed(),positions=source.attributes.position,normals=source.attributes.normal;
    for(const [along,side,height] of [[4,-.8,1.2],[6,1,1.6]]){
      const foot=ground(along,side);if(!foot)continue;
      const vertices=[];
      for(let i=0;i<positions.count;i++){
        const p=[positions.getX(i),positions.getY(i),positions.getZ(i)*height/units+height/units/2];
        const n=[normals.getX(i),normals.getY(i),normals.getZ(i)];
        for(let k=0;k<3;k++)vertices.push(foot[k]+right[k]*p[0]+forward[k]*p[1]+frame.normal[k]*p[2]);
        for(let k=0;k<3;k++)vertices.push(right[k]*n[0]+forward[k]*n[1]+frame.normal[k]*n[2]);
      }
      fixtureBatches.push({vertices:new Float32Array(vertices),color:[.85,.55,.12]});
    }
    shape.dispose();source.dispose();
  }else{
    const foot=ground(24,30);
    if(foot){const groups=api.miningPlatformGeometry(1,0,false,1),scale=36/(32*units);
      const colors={ochre:[.83,.64,.29],steel:[.46,.53,.52],dark:[.10,.15,.17],light:[.89,.79,.49],lamp:[1,.94,.78],marker:[.35,.95,.85]};
      for(const [key,data] of Object.entries(groups)){
        const vertices=new Float32Array(data.length);
        for(let i=0;i<data.length;i+=6)for(let k=0;k<3;k++){
          vertices[i+k]=foot[k]+(right[k]*data[i]+forward[k]*data[i+1]+frame.normal[k]*data[i+2])*scale;
          vertices[i+k+3]=right[k]*data[i+3]+forward[k]*data[i+4]+frame.normal[k]*data[i+5];
        }
        fixtureBatches.push({vertices,color:colors[key]});
      }
    }
  }
  raw.setStudyActors(fixtureBatches);
  for(const batch of fixtureBatches){const mesh=new THREE.Mesh(geometry(batch.vertices),new THREE.MeshStandardMaterial({color:new THREE.Color(...batch.color),roughness:.85,side:THREE.DoubleSide}));mesh.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(vNormal);nonPerturbedNormal=normal;');};mesh.castShadow=true;mesh.receiveShadow=true;fixtureGroup.add(mesh);}
}
function rebuild(){
  if(rock){scene.remove(rock);rock.geometry.dispose();rock.material.dispose();craterTexture.dispose();}
  meshData=api.asteroidMesh(asteroid);
  craterTexture=new THREE.DataTexture(api.impactBytes(asteroid),1440,1,THREE.RGBAFormat,THREE.UnsignedByteType);craterTexture.needsUpdate=true;craterTexture.generateMipmaps=false;
  rock=new THREE.Mesh(geometry(meshData),makeRockMaterial());if(document.getElementById('surface').value==='clay'){rock.material.dispose();rock.material=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.45,.43,.4,THREE.SRGBColorSpace),side:THREE.DoubleSide});}rock.scale.setScalar(asteroid.radius);rock.castShadow=true;rock.receiveShadow=true;scene.add(rock);
  frame=api.surfaceFrame(asteroid,[.4,.5,.75]);forward=tangent([0,1,0],frame.normal);right=normalize(cross(forward,frame.normal));base=frame.point.map(v=>v*asteroid.radius);
  sun.position.set(-.813733,-.581238,.68).normalize().multiplyScalar(asteroid.radius*3);
  Object.assign(sun.shadow.camera,{left:-asteroid.radius*1.2,right:asteroid.radius*1.2,bottom:-asteroid.radius*1.2,top:asteroid.radius*1.2,near:asteroid.radius*.5,far:asteroid.radius*5});sun.shadow.camera.updateProjectionMatrix();sun.shadow.normalBias=asteroid.radius*.0004;
  const light=api.surfaceSpotlight(asteroid);lamp.position.fromArray(light.position);lamp.target.position.copy(lamp.position).add(vec(light.direction));lamp.visible=lightOn;
  raw.sync(world);updateFixtures();updateLightSources();dirty=true;
}
function resetWorksiteCamera(){
  const rig=document.getElementById('fixture').value==='rig';
  walkX=rig?-22:0;walkY=rig?-14:0;lookYaw=rig?.7:0;lookPitch=rig?-.08:-.12;
}
function setPose(value){
  if(value==='surface'&&asteroid.excavation.level>0){world=DW.sim.toggleAsteroidExcavation(world,asteroid.id);asteroid=world.asteroids[0];document.getElementById('cut').setAttribute('aria-pressed','false');rebuild();}
  mode=value;resetWorksiteCamera();
  raw.setSurfaceCamera(null);yaw=0;tilt=value==='underside'?Math.PI-.75:.9;
  world.camera={x:0,y:0,zoom:Math.min(rawHost.clientWidth,rawHost.clientHeight)*.32/asteroid.radius};
  for(const b of document.querySelectorAll('[data-pose]'))b.setAttribute('aria-pressed',String(b.dataset.pose===value));
  updateFixtures();dirty=true;
}
function toggleRaw(selector){rawHost.querySelector(selector).click();}
document.getElementById('apply').onclick=()=>{const seed=document.getElementById('seed').value.trim();if(!seed)return;asteroid.id=seed;api.setStudyParameters(asteroid,{});rebuild();};
document.getElementById('seed').onkeydown=e=>{if(e.key==='Enter')document.getElementById('apply').click();};
for(const button of document.querySelectorAll('[data-pose]'))button.onclick=()=>setPose(button.dataset.pose);
document.getElementById('cut').onclick=function(){world=DW.sim.toggleAsteroidExcavation(world,asteroid.id);asteroid=world.asteroids[0];this.setAttribute('aria-pressed',String(asteroid.excavation.level>0));if(mode==='surface')setPose('orbit');rebuild();};
document.getElementById('light').onclick=function(){lightOn=!lightOn;this.setAttribute('aria-pressed',String(lightOn));toggleRaw('[data-spotlight]');if(lightOn&&document.getElementById('light-source').value==='all')document.getElementById('light-source').value='work';else if(!lightOn&&document.getElementById('light-source').value==='work')document.getElementById('light-source').value='all';updateLightSources();renderer.shadowMap.needsUpdate=true;if(lightOn&&mode!=='surface')setPose('surface');dirty=true;};
document.getElementById('shadows').onclick=function(){shadows=!shadows;this.setAttribute('aria-pressed',String(shadows));toggleRaw('[data-work-shadows]');lamp.castShadow=shadows;sun.castShadow=shadows;renderer.shadowMap.needsUpdate=true;dirty=true;};
document.getElementById('fixture').onchange=()=>{resetWorksiteCamera();updateFixtures();dirty=true;};
document.getElementById('surface').onchange=()=>{
  rock.material.dispose();rock.material=document.getElementById('surface').value==='clay'?new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.45,.43,.4,THREE.SRGBColorSpace),side:THREE.DoubleSide}):makeRockMaterial();
  raw.setStudyDiagnostics({mode:'normal',flat:document.getElementById('surface').value==='clay',scale:1,mothership:false,actors:true});dirty=true;
};
document.getElementById('response').onchange=()=>{uniforms.uOriginalResponse.value=document.getElementById('response').value==='original'?1:0;dirty=true;};
document.getElementById('detail').onchange=()=>{if(document.getElementById('surface').value!=='clay'){rock.material.dispose();rock.material=makeRockMaterial();}dirty=true;};
function updateLightSources(){const source=document.getElementById('light-source').value;sun.visible=source==='all'||source==='sun';ambient.visible=source==='all'||source==='ambient';ambient.visible=source==='all'||source==='ambient'||source==='work';ambient.intensity=source==='work'?.08:.17;lamp.visible=lightOn&&(source==='all'||source==='lamp'||source==='work');renderer.shadowMap.needsUpdate=true;dirty=true;}
document.getElementById('light-source').onchange=updateLightSources;
document.getElementById('specular').onchange=()=>{if(document.getElementById('surface').value!=='clay'){rock.material.dispose();rock.material=makeRockMaterial();}dirty=true;};
let drag=null;
for(const host of [rawHost,threeHost]){
  host.addEventListener('pointerdown',e=>{if(benchmarking)return;drag={x:e.clientX,y:e.clientY,pan:e.shiftKey};host.setPointerCapture(e.pointerId);e.preventDefault();},true);
  host.addEventListener('pointermove',e=>{if(benchmarking||!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
    if(mode==='surface'){lookYaw-=dx*.005;lookPitch=Math.max(-1.3,Math.min(1.3,lookPitch-dy*.005));}
    else if(drag.pan){world.camera.x-=dx/world.camera.zoom;world.camera.y-=dy/world.camera.zoom;}
    else{yaw-=dx*.005;tilt=Math.max(.06,Math.min(Math.PI-.06,tilt+dy*.005));}dirty=true;
  },true);
  host.addEventListener('pointerup',()=>{drag=null;},true);host.addEventListener('pointercancel',()=>{drag=null;},true);
  host.addEventListener('wheel',e=>{e.preventDefault();if(benchmarking)return;if(mode==='surface')lookPitch=Math.max(-1.3,Math.min(1.3,lookPitch+e.deltaY*.001));else world.camera.zoom=Math.max(.02,Math.min(512,world.camera.zoom*Math.exp(-e.deltaY*.0015)));dirty=true;},{passive:false,capture:true});
}
window.addEventListener('keydown',e=>{if(benchmarking)return;if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;keys.add(e.code);if(['KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();drag=null;});
new ResizeObserver(()=>{dirty=true;}).observe(document.querySelector('main'));
function draw(only='both',complete=false){
  const width=threeHost.clientWidth,height=threeHost.clientHeight;
  const pixelRatio=renderer.getPixelRatio();
  renderer.setSize(Math.round(width*pixelRatio)/pixelRatio,Math.round(height*pixelRatio)/pixelRatio,false);
  let eye,basis;
  if(mode==='surface'){
    const heading=normalize(forward.map((v,i)=>v*Math.cos(lookYaw)+right[i]*Math.sin(lookYaw)));
    const side=normalize(cross(heading,frame.normal));
    const direction=normalize(heading.map((v,i)=>v*Math.cos(lookPitch)+frame.normal[i]*Math.sin(lookPitch)));
    const up=normalize(cross(side,direction)),back=direction.map(v=>-v);
    eye=base.map((v,i)=>v+(frame.normal[i]*2+right[i]*walkX+forward[i]*walkY)/units);
    raw.setSurfaceCamera({eye,right:side,up,back});basis={right:side,up,back,distance:1,focal:1/Math.tan(Math.PI/8)};
  }else{
    raw.setOrbit({yaw,tilt});basis=api.view(world.camera,{width:rawHost.clientWidth,height:rawHost.clientHeight},{yaw,tilt});
    eye=[world.camera.x+basis.back[0]*basis.distance,world.camera.y+basis.back[1]*basis.distance,basis.back[2]*basis.distance];
  }
  applyCameraFrame(camera,eye,basis,width/height);
  uniforms.uPixelFootprint.value=2/(height*basis.focal*asteroid.radius*renderer.getPixelRatio());
  uniforms.uRockNormalMatrix.value.setFromMatrix4(camera.matrixWorldInverse);
  let timing=null;
  const submit=(render,gl)=>{const start=performance.now();render();const cpu=performance.now()-start;if(complete){gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));if(gl.isContextLost()||gl.getError()!==gl.NO_ERROR)throw new Error('WebGL error during measurement');}return {cpu,completed:performance.now()-start};};
  if(only!=='three')timing=submit(()=>raw.render(world,1,0,0),rawHost.querySelector('canvas').getContext('webgl'));
  if(only!=='raw')timing=submit(()=>renderer.render(scene,camera),renderer.getContext());
  const info=renderer.info.render;
  status.textContent=`Seed ${asteroid.id} · Shared mesh: ${(meshData.length/18).toLocaleString()} triangles · ${mode==='surface'?'Camera 2 m above surface':'Linked orbit camera'} · Same geometry / different lighting models`;
  status.dataset.ready='true';status.dataset.seed=asteroid.id;status.dataset.triangles=String(meshData.length/18);
  // DOM diagnostics let the browser regression inspect camera agreement without private app-state access.
  let projectionError=0;
  const orbit=mode==='surface'?{height:eye[2]-basis.back[2],surface:basis}:{yaw,tilt};
  const probes=mode==='surface'?[base.map((v,i)=>v+forward[i]*10/units),base.map((v,i)=>v+(forward[i]*6+right[i]*2)/units)]:[[0,0,0],[asteroid.radius*.4,0,0],[0,asteroid.radius*.4,0],[0,0,asteroid.radius*.4]];
  for(const point of probes){
    const p=api.project(point,world.camera,{width:rawHost.clientWidth,height:rawHost.clientHeight},orbit);
    if(p.depth<=0)continue;const q=vec(point).project(camera);
    projectionError=Math.max(projectionError,Math.abs((q.x*.5+.5)-p.x/rawHost.clientWidth),Math.abs((-.5*q.y+.5)-p.y/rawHost.clientHeight));
  }
  status.dataset.cameraError=String(projectionError);status.dataset.threeCalls=String(info.calls);
  return timing;
}
let previous=0;
function tick(now){const dt=previous?Math.min(.05,(now-previous)/1000):0;previous=now;
  if(!benchmarking&&mode==='surface'&&keys.size){const f=Number(keys.has('KeyW'))-Number(keys.has('KeyS')),s=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));if(f||s){const speed=1.5*dt/Math.max(1,Math.hypot(f,s));walkX+=(f*Math.sin(lookYaw)+s*Math.cos(lookYaw))*speed;walkY+=(f*Math.cos(lookYaw)-s*Math.sin(lookYaw))*speed;dirty=true;}}
  if(dirty&&!benchmarking){dirty=false;draw();}requestAnimationFrame(tick);
}
rebuild();setPose('orbit');requestAnimationFrame(tick);
document.getElementById('benchmark').onclick=async()=>{
  if(benchmarking)return;
  if(document.getElementById('surface').value==='clay'){document.getElementById('surface').value='rock';document.getElementById('surface').onchange();}
  benchmarking=true;drag=null;keys.clear();
  const output=document.getElementById('performance'),saved=detail(),controls=[...document.querySelectorAll('nav button,nav input,nav select')];
  output.hidden=false;delete output.dataset.results;delete output.dataset.configuration;output.dataset.status='running';output.textContent='Warming shaders and measuring completed draws…';controls.forEach(c=>c.disabled=true);
  const next=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const rows=[];
  try{
    await next();
    const measuredSize=[rawHost.clientWidth,rawHost.clientHeight];
    const checkSize=()=>{if(rawHost.clientWidth!==measuredSize[0]||rawHost.clientHeight!==measuredSize[1])throw new Error('View resized during measurement; please run again.');};
    for(const [name,which,setting] of [['WebGL legacy','raw',saved],['Three: geometry','three','geometry'],['Three: + fine texture','three','micro'],['Three: legacy normals','three','normals'],['Three: + darkening','three','legacy']]){
      document.getElementById('detail').value=setting;document.getElementById('detail').onchange();
      for(let i=0;i<8;i++){draw(which,true);await next();}
      const cpu=[],completed=[];
      for(let i=0;i<24;i++){checkSize();const t=draw(which,true);cpu.push(t.cpu);completed.push(t.completed);await next();}
      rows.push({name,cpu:median(cpu),completed:median(completed)});
    }
    output.replaceChildren();const caption=document.createElement('div');caption.textContent=`Measured ${mode}, seed ${asteroid.id}, lamp ${lightOn?'on':'off'}, shadows ${shadows?'on':'off'} · ${measuredSize.join(' × ')} CSS px @ ${renderer.getPixelRatio()}×`;output.append(caption);const table=document.createElement('table');table.style.cssText='font:inherit;text-align:left;width:100%;max-width:650px';
    const heading=table.insertRow();for(const label of ['24 warmed samples, median','CPU submit','Draw + sync readback']){const cell=document.createElement('th');cell.textContent=label;heading.append(cell);}
    for(const row of rows){const tr=table.insertRow();for(const value of [row.name,row.cpu.toFixed(2)+' ms',row.completed.toFixed(2)+' ms'])tr.insertCell().textContent=value;}
    output.append(table,document.createTextNode('Draw-only timings; Completion synchronized by reading one pixel. Includes readback overhead; not FPS or pure GPU time. Same seed, pose and pixel size; lighting/shadow implementations differ.'));
    output.dataset.results=JSON.stringify(rows);output.dataset.configuration=JSON.stringify({seed:asteroid.id,pose:mode,light:lightOn,shadows,viewport:measuredSize,pixelRatio:renderer.getPixelRatio(),surface:document.getElementById('surface').value,threeLightSource:document.getElementById('light-source').value,specular:document.getElementById('specular').value,rockResponse:document.getElementById('response').value});output.dataset.status='pass';
  }catch(error){output.textContent='Measurement failed: '+error.message;output.dataset.status='fail';}
  finally{document.getElementById('detail').value=saved;document.getElementById('detail').onchange();controls.forEach(c=>c.disabled=false);benchmarking=false;dirty=true;}
};
window.addEventListener('pagehide',()=>{renderer.dispose();rock.geometry.dispose();rock.material.dispose();craterTexture.dispose();disposeFixtures();});

// Optional browser regression uses real rendered pixels; normal browsing stays interactive.
if(new URLSearchParams(location.search).has('test'))requestAnimationFrame(()=>{
  const result=document.createElement('output');result.id='comparison-test-result';document.querySelector('footer').append(result);
  let cases=0,maxDifference=0;
  const choose=(id,value)=>{const element=document.getElementById(id);element.value=value;element.dispatchEvent(new Event('change'));};
  const eyeForRegression=()=>camera.position.toArray();
  const capture=()=>{draw();const canvas=rawHost.querySelector('canvas'),gl=canvas.getContext('webgl'),a=new Uint8Array(canvas.width*canvas.height*4),b=new Uint8Array(renderer.domElement.width*renderer.domElement.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,a);renderer.getContext().readPixels(0,0,renderer.domElement.width,renderer.domElement.height,renderer.getContext().RGBA,renderer.getContext().UNSIGNED_BYTE,b);if(gl.getError()||renderer.getContext().getError())throw new Error('WebGL error');return [a,b];};
  try{
    choose('fixture','none');choose('surface','clay');
    for(const seed of ['ast-ceres-01','comparison-regression-2']){
      document.getElementById('seed').value=seed;document.getElementById('apply').click();
      for(const pose of ['orbit','underside']){
        setPose(pose);const [a,b]=capture();if(a.length!==b.length)throw new Error('Canvas sizes differ');
        let union=0,different=0;for(let i=0;i<a.length;i+=4){const x=a[i+3]>127,y=b[i]>61;if(x||y)union++;if(x!==y)different++;}
        const difference=different/Math.max(1,union);maxDifference=Math.max(maxDifference,difference);
        if(difference>.01)throw new Error('Silhouette mismatch: '+difference);
        if(Number(status.dataset.cameraError)>1e-7)throw new Error('Camera projection mismatch');cases++;
      }
    }
    setPose('orbit');choose('surface','rock');choose('detail','geometry');const [rawGeometry,threeGeometry]=capture();
    choose('detail','micro');const [,threeMicro]=capture();choose('detail','normals');const [rawNormals,threeNormals]=capture();choose('detail','legacy');const [,threeLegacy]=capture();
    let normalChanges=0,microChanges=0,darkenedDetail=0,brightenedDetail=0;
    for(let i=0;i<threeGeometry.length;i+=4){
      if(rawGeometry[i]!==rawNormals[i]||rawGeometry[i+1]!==rawNormals[i+1]||rawGeometry[i+2]!==rawNormals[i+2])throw new Error('Three-only controls changed legacy image');
      if(Math.abs(threeGeometry[i]-threeMicro[i])+Math.abs(threeGeometry[i+1]-threeMicro[i+1])+Math.abs(threeGeometry[i+2]-threeMicro[i+2])>8)microChanges++;
      if(Math.abs(threeGeometry[i]-threeNormals[i])+Math.abs(threeGeometry[i+1]-threeNormals[i+1])+Math.abs(threeGeometry[i+2]-threeNormals[i+2])>8)normalChanges++;
      const diff=threeNormals[i]+threeNormals[i+1]+threeNormals[i+2]-threeLegacy[i]-threeLegacy[i+1]-threeLegacy[i+2];if(diff>3)darkenedDetail++;if(diff < -3)brightenedDetail++;
    }
    if(microChanges<100||normalChanges<100||darkenedDetail<50||brightenedDetail>10)throw new Error('Surface-detail layers did not behave independently: '+JSON.stringify({microChanges,normalChanges,darkenedDetail,brightenedDetail}));
    document.getElementById('shadows').click(); // Legacy has no solar shadow map: isolate material response.
    choose('response','standard');const [referenceRock,physicalRock]=capture();choose('response','original');const [,originalRock]=capture();
    let physicalError=0,originalError=0;for(let i=0;i<referenceRock.length;i+=4)if(referenceRock[i+3]>127){for(let c=0;c<3;c++){physicalError+=Math.abs(referenceRock[i+c]-physicalRock[i+c]);originalError+=Math.abs(referenceRock[i+c]-originalRock[i+c]);}}
    if(originalError>=physicalError*.9)throw new Error('Original rock response did not improve reference match: '+JSON.stringify({originalError,physicalError}));cases++;document.getElementById('shadows').click();
    choose('light-source','sun');uniforms.uSolarGate.value=0;const [,ungatedSun]=capture();uniforms.uSolarGate.value=1;const [,gatedSun]=capture();
    let solarDarkened=0;for(let i=0;i<gatedSun.length;i+=4){const delta=ungatedSun[i]+ungatedSun[i+1]+ungatedSun[i+2]-gatedSun[i]-gatedSun[i+1]-gatedSun[i+2];if(delta>3)solarDarkened++;if(delta < -3)throw new Error('Solar horizon gate brightened sunlight');}
    if(solarDarkened<50)throw new Error('Solar horizon gate did not affect terminator');cases++;
    choose('light-source','ambient');uniforms.uSolarGate.value=0;const [,ungatedFill]=capture();uniforms.uSolarGate.value=1;const [,gatedFill]=capture();
    if(ungatedFill.some((value,i)=>value!==gatedFill[i]))throw new Error('Solar gate changed ambient lighting');cases++;choose('light-source','all');
    choose('detail','micro');cases+=4;
    document.getElementById('cut').click();setPose('orbit');capture();cases++;
    document.getElementById('cut').click();choose('surface','rock');choose('fixture','posts');document.getElementById('light').click();
    const [,withShadows]=capture();document.getElementById('shadows').click();const [,withoutShadows]=capture();
    let darkened=0;for(let i=0;i<withShadows.length;i+=4)if(withoutShadows[i]+withoutShadows[i+1]+withoutShadows[i+2]-withShadows[i]-withShadows[i+1]-withShadows[i+2]>8)darkened++;
    if(darkened<50)throw new Error('No Three.js cast shadows detected');document.getElementById('shadows').click();cases++;
    choose('fixture','rig');choose('detail','legacy');const [,rigShadowed]=capture();if(!fixtureBatches.length)throw new Error('No rig fixture');
    const rigRay=new THREE.Raycaster();rigRay.setFromCamera(new THREE.Vector2(0,0),camera);
    const rigHits=rigRay.intersectObjects(fixtureGroup.children);if(rigHits.length&&rigHits[0].distance*units<2)throw new Error('Rig inspection camera is obstructed');
    const savedRigEye=eyeForRegression();setPose('orbit');setPose('surface');capture();if(savedRigEye.some((v,i)=>Math.abs(v-eyeForRegression()[i])>1e-8))throw new Error('Rig camera preset did not survive re-entry');cases++;
    document.getElementById('shadows').click();const [,rigUnshadowed]=capture();document.getElementById('shadows').click();
    let rigShadowPixels=0;for(let i=0;i<rigShadowed.length;i+=4)if(rigUnshadowed[i]+rigUnshadowed[i+1]+rigUnshadowed[i+2]-rigShadowed[i]-rigShadowed[i+1]-rigShadowed[i+2]>8)rigShadowPixels++;
    if(rigShadowPixels<20)throw new Error('No rig floodlight shadows visible: '+rigShadowPixels);cases++;

    document.getElementById('light').click();document.getElementById('seed').value='ast-ceres-01';document.getElementById('apply').click();choose('fixture','posts');setPose('orbit');choose('surface','clay');
    const [returnedRaw,returnedThree]=capture();let returnedUnion=0,returnedDifference=0;
    for(let i=0;i<returnedRaw.length;i+=4){const a=returnedRaw[i+3]>127,b=returnedThree[i]>61;if(a||b)returnedUnion++;if(a!==b)returnedDifference++;}
    if(returnedDifference/Math.max(1,returnedUnion)>.01)throw new Error('Surface-to-orbit camera reset mismatch');cases++;choose('surface','rock');draw();
    result.textContent=` PASS: ${cases} browser cases; maximum silhouette mismatch ${(maxDifference*100).toFixed(3)}%; ${darkened} Three.js shadow pixels.`;result.dataset.status='pass';
  }catch(error){result.textContent=' FAIL: '+error.message;result.dataset.status='fail';}
});

if(new URLSearchParams(location.search).has('lighting-test'))requestAnimationFrame(()=>{
  document.getElementById('light').click();
  const result=document.createElement('output');result.id='lighting-test-result';document.querySelector('footer').append(result);
  const rows=[];
  for(const specular of ['on','off']){
    document.getElementById('specular').value=specular;document.getElementById('specular').onchange();
    for(const source of ['ambient','sun','lamp','all']){
      document.getElementById('light-source').value=source;updateLightSources();draw();
      const canvas=renderer.domElement,gl=renderer.getContext(),pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let sum=0,count=0;for(let y=Math.floor(canvas.height*.3);y<Math.floor(canvas.height*.65);y++)for(let x=0;x<canvas.width;x++){const i=(y*canvas.width+x)*4;sum+=(pixels[i]+pixels[i+1]+pixels[i+2])/3;count++;}
      rows.push({specular,source,mean:sum/count});
    }
  }
  result.textContent='Lighting isolation complete: source brightness and reflection contribution recorded.';result.dataset.results=JSON.stringify(rows);document.getElementById('light-source').value='work';document.getElementById('specular').value='on';document.getElementById('specular').onchange();updateLightSources();
});
