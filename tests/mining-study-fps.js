import * as THREE from '../vendor/three/build/three.module.js';
import {isStaticAirlock,sweepAxes,viewDirections,flightModeForKey} from './mining-study-navigation.js';

// Study-only first-person viewer. Coordinates remain the model's Z-up units.
const button=document.getElementById('explore');
const panel=document.createElement('section');
panel.style.cssText='position:fixed;inset:0;z-index:20;background:#101820;display:none';
panel.innerHTML='<div style="position:absolute;z-index:2;top:12px;left:16px;background:#101c24dd;padding:12px;max-width:720px"><button id="fps-back">Back to orbit</button> <button id="fps-entry">Cargo deck</button> <button id="fps-middle">Pod entry</button> <button id="fps-bridge">Bridge</button> <button id="fps-roof">Roof</button> <label style="display:inline-flex">Cargo <input id="fps-cargo" type="range" min="0" max="1" step=".01" value="0"></label><p>Click view for mouse look · WASD move · Shift faster · F deck / free flight · Space / C up / down (enters free flight) · E operate nearby door · R reset · Esc release mouse</p><p id="fps-status" role="status"></p></div><div style="position:absolute;left:50%;top:50%;pointer-events:none;color:white">+</div>';
document.body.append(panel);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x101820);
panel.prepend(renderer.domElement);
const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xdbefff,0x63706c,.65));
const sun=new THREE.DirectionalLight(0xffecd2,2);sun.position.set(12,-15,30);scene.add(sun);
const camera=new THREE.PerspectiveCamera(75,1,.04,250);camera.up.set(0,0,1);
const rig=new THREE.Group();scene.add(rig);
const cargo=new THREE.Group();scene.add(cargo);
// Numerous visible fixtures share three broad, unshadowed lighting proxies.
const floodlights=new THREE.Group();scene.add(floodlights);
for(const field of window.Driftworks.miningLights.fields){
  const color=new THREE.Color(...field.color);
  const lamp=new THREE.PointLight(color,field.power*70,Math.max(...field.radii)*1.8,2);
  lamp.position.set(...field.center);floodlights.add(lamp);
}
let cargoKey=-1;
function updateCargo(){
  const fill=Number(document.getElementById('cargo').value);if(fill===cargoKey)return;cargoKey=fill;
  panel.querySelector('#fps-cargo').value=String(fill);
  while(cargo.children.length){const m=cargo.children[0];cargo.remove(m);m.geometry.dispose();m.material.dispose();}
  for(const batch of window.Driftworks.miningStudyCargo.geometry(fill)){
    const positions=[],normals=[];for(let i=0;i<batch.vertices.length;i+=6){positions.push(...batch.vertices.slice(i,i+3));normals.push(...batch.vertices.slice(i+3,i+6));}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    cargo.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:new THREE.Color(...batch.color),side:THREE.DoubleSide})));
  }cargo.updateMatrixWorld(true);
}
panel.querySelector('#fps-cargo').oninput=function(){document.getElementById('cargo').value=this.value;};
const people=new THREE.Group();scene.add(people);
let crewReady=false;
function addCrew(){
  const poses=window.Driftworks.miningStudyCrew?.poses;if(!poses||crewReady)return;
  crewReady=true;
  const placements=[[-2,0,7.35],[1.9,-2.2,7.35],[-2,-1.8,10],[.2,2.5,10],[-4,0,4.5],[4,0,4.5],[-2,1,13.74],[2,-1,13.74]];
  for(const [x,y,z] of placements)for(const batch of poses.standing){
    const positions=[],normals=[];
    for(let i=0;i<batch.vertices.length;i+=6){positions.push(x+batch.vertices[i]*1.6,y+batch.vertices[i+1]*1.6,z+batch.vertices[i+2]*1.6);normals.push(...batch.vertices.slice(i+3,i+6));}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    people.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:new THREE.Color(...batch.color),side:THREE.DoubleSide})));
  }
}
const ray=new THREE.Raycaster();const keys=new Set();
const colors={ochre:0xd4a34a,steel:0x758784,dark:0x243438,light:0xe3ca7d,lamp:0xfff0c7,marker:0x59f2d9};
const doors=[{name:'Downward cargo hatch',position:[2.75,0,7.24],size:[2.86,2.76,.12],travel:3,open:false},{name:'Inner pressure door',position:[1.2,0,8.43],size:[.12,1.36,2.10],travel:1.65,open:false}];
let yaw=0,pitch=0,flight=false,last=0,active=false;
const status=panel.querySelector('#fps-status');
function box(x,y,z,w,d,h,color){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,d,h),new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide}));mesh.position.set(x,y,z);rig.add(mesh);return mesh;}
function build(){
  while(rig.children.length){const m=rig.children[0];rig.remove(m);m.geometry.dispose();m.material.dispose();}
  const batches=window.Driftworks.scene3d.miningPlatformGeometry(1,0,false,1,'');
  for(const [key,data] of Object.entries(batches)){
    const positions=[],normals=[],glass=[];
    for(let i=0;i<data.length;i+=18){
      // Replace the static outer door and center seam with an operable panel.
      const points=[0,6,12].map(j=>[data[i+j],data[i+j+1],data[i+j+2]]);
      if(key==='light'&&isStaticAirlock(points))continue;
      const windowBand=points.some(p=>p[2]<13.49)&&points.every(p=>p[2]>=10-.001&&p[2]<=13.5+.001)&&points.every(p=>Math.abs(p[0])>4.5||Math.abs(p[1])>3.2);
      if(windowBand&&key==='dark')continue;
      if(windowBand&&key==='ochre'){
        for(let j=0;j<18;j+=6)glass.push(...data.slice(i+j,i+j+3));
        continue;
      }
      for(let j=0;j<18;j+=6){positions.push(...data.slice(i+j,i+j+3));normals.push(...data.slice(i+j+3,i+j+6));}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    if(glass.length){const panes=new THREE.BufferGeometry();panes.setAttribute('position',new THREE.Float32BufferAttribute(glass,3));panes.computeVertexNormals();rig.add(new THREE.Mesh(panes,new THREE.MeshStandardMaterial({color:0x7baeb7,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide})));}
    rig.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:colors[key],side:THREE.DoubleSide,roughness:.85,emissive:key==='lamp'||key==='marker'?colors[key]:0,emissiveIntensity:1})));
  }
  // Thin mullions retain the faceted window silhouette around transparent study glazing.
  const outline=[[-6,-3],[-4,-4.5],[4,-4.5],[6,-3],[6,3],[4,4.5],[-4,4.5],[-6,3]];
  function beam(a,b){const delta=new THREE.Vector3().subVectors(b,a);const mesh=box(0,0,0,.12,.12,delta.length(),0xd4a34a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),delta.normalize());}
  outline.forEach((p,i)=>{const q=outline[(i+1)%8];beam(new THREE.Vector3(p[0]*.96,p[1]*.96,10),new THREE.Vector3(p[0]*1.14,p[1]*1.14,11.15));beam(new THREE.Vector3(p[0]*1.14,p[1]*1.14,11.15),new THREE.Vector3(p[0]*1.10,p[1]*1.10,12.5));beam(new THREE.Vector3(p[0]*1.14,p[1]*1.14,11.15),new THREE.Vector3(q[0]*1.14,q[1]*1.14,11.15));beam(new THREE.Vector3(p[0]*1.10,p[1]*1.10,12.5),new THREE.Vector3(p[0]*.86,p[1]*.86,13.5));beam(new THREE.Vector3(p[0]*1.10,p[1]*1.10,12.5),new THREE.Vector3(q[0]*1.10,q[1]*1.10,12.5));beam(new THREE.Vector3(p[0]*.86,p[1]*.86,13.5),new THREE.Vector3(q[0]*.86,q[1]*.86,13.5));});
  for(const door of doors){door.offset=door.open?door.travel:0;door.mesh=box(...door.position,...door.size,0x8faaa8);door.mesh.position.y+=door.offset;}
  rig.updateMatrixWorld(true);
}
function spawn(where='entry'){
  flight=where!=='entry';pitch=0;
  if(where==='middle'){camera.position.set(0,.5,8.8);yaw=0;}
  else if(where==='bridge'){camera.position.set(-2,1.8,11.45);yaw=1.5;}
  else if(where==='roof'){camera.position.set(2,0,15.2);yaw=0;}
  else{camera.position.set(2.75,0,5.95);yaw=0;}
}
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
function nearby(){return doors.map(d=>({door:d,distance:camera.position.distanceTo(new THREE.Vector3(...d.position))})).sort((a,b)=>a.distance-b.distance)[0];}
function locked(){return document.pointerLockElement===renderer.domElement;}
renderer.domElement.onclick=()=>{renderer.domElement.requestPointerLock()?.catch(()=>{status.textContent='Mouse capture unavailable. Drag the view to look around.';});};
let dragging=false;
renderer.domElement.onpointerdown=()=>{dragging=true;};window.addEventListener('pointerup',()=>dragging=false);
window.addEventListener('mousemove',e=>{if(active&&(locked()||dragging)){yaw-=e.movementX*.0025;pitch=Math.max(-1.5,Math.min(1.5,pitch+e.movementY*.0025));}});
window.addEventListener('blur',()=>keys.clear());
window.addEventListener('keydown',e=>{
  if(!active)return;
  if(['Space','KeyC','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.repeat)return;
  flight=flightModeForKey(flight,e.code);
  if(e.code==='KeyR')spawn();
  if(e.code==='KeyE'){const n=nearby();if(n.distance<2.7){const d=n.door;
    const occupied=Math.abs(camera.position.x-d.position[0])<d.size[0]/2+.25&&Math.abs(camera.position.y-d.position[1])<d.size[1]/2+.25&&camera.position.z>d.position[2]-d.size[2]/2-.15&&camera.position.z-1.45<d.position[2]+d.size[2]/2+.15;
    if(!d.open||!occupied)d.open=!d.open;
  }}
});window.addEventListener('keyup',e=>keys.delete(e.code));
button.onclick=()=>{
  document.getElementById('surface').checked=false;document.getElementById('surface').dispatchEvent(new Event('change'));
  active=true;window.miningFPSActive=true;panel.style.display='block';build();spawn();resize();
};
panel.querySelector('#fps-back').onclick=()=>{active=false;window.miningFPSActive=false;panel.style.display='none';keys.clear();document.exitPointerLock();};
for(const where of ['entry','middle','bridge','roof'])panel.querySelector('#fps-'+where).onclick=()=>spawn(where);
window.addEventListener('resize',resize);
function hit(origin,direction,distance){ray.set(origin,direction);ray.far=distance;return ray.intersectObjects(rig.children.concat(cargo.children),false)[0];}
function move(delta){
  // Axis-separated sweep at feet, torso and head: slide along walls, never tunnel.
  sweepAxes(camera.position,delta,(axis,sign,distance)=>{
    const direction=new THREE.Vector3();direction[axis]=sign;
    for(const height of [-1.25,-.65,0]){
      const origin=camera.position.clone();origin.z+=height;
      if(hit(origin,direction,distance))return true;
    }
    return false;
  });
}
function tick(now){
  requestAnimationFrame(tick);const dt=Math.min(.035,(now-last)/1000||0);last=now;if(!active)return;
  for(const d of doors){const target=d.open?d.travel:0;d.offset+=(target-d.offset)*Math.min(1,dt*7);d.mesh.position.y=d.position[1]+d.offset;}
  rig.updateMatrixWorld(true);
  floodlights.visible=document.getElementById('floodlights').checked;
  addCrew();updateCargo();
  const directions=viewDirections(yaw,pitch);
  const forward=new THREE.Vector3(...directions.forward);
  const right=new THREE.Vector3(...directions.right);
  const delta=new THREE.Vector3();const f=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));const r=Number(keys.has('KeyD'))-Number(keys.has('KeyA'));
  const look=forward.clone();
  if(!flight){forward.z=0;forward.normalize();}
  delta.addScaledVector(forward,f).addScaledVector(right,r);
  if(flight)delta.z+=Number(keys.has('Space'))-Number(keys.has('KeyC'));
  if(delta.lengthSq()>0)delta.normalize().multiplyScalar(dt*(keys.has('ShiftLeft')?5:2));
  move(delta);
  if(!flight){const origin=camera.position.clone();origin.z+=.2;const floor=hit(origin,new THREE.Vector3(0,0,-1),1.95);if(floor&&floor.face.normal.z>.35)camera.position.z=floor.point.z+1.45;}
  camera.lookAt(camera.position.clone().add(look));
  const n=nearby();status.textContent=(flight?'Free flight':'Deck movement')+' / '+(n.distance<2.7?'E: '+(n.door.open?'close ':'open ')+n.door.name:'Approach an airlock door to operate it')+' / eye height '+camera.position.z.toFixed(2)+' / 1.8 m astronauts / 2 occupied pod levels / open cargo deck below / asteroid hidden';
  renderer.render(scene,camera);
}
requestAnimationFrame(tick);
