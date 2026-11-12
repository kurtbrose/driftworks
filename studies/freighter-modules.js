import * as T from 'three';
import {OrbitControls} from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import {mergeGeometries} from '../vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import {buildFreighter,batchStatic,disposeBatch,setSurfaceTexture} from '../assets/ships/industrial-kit/kit.js';

const $=id=>document.getElementById(id),host=$('stage');
const renderer=new T.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0x090f16);
renderer.outputColorSpace=T.SRGBColorSpace;host.append(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(43,1,.1,3000);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=5;controls.maxDistance=400;
scene.add(new T.HemisphereLight(0xc5dded,0x444342,2.1));
const key=new T.DirectionalLight(0xffedce,3.3);key.position.set(-30,70,40);scene.add(key);
const fill=new T.DirectionalLight(0x8badc9,1.5);fill.position.set(30,-15,-50);scene.add(fill);
const hull=new T.Group(),debris=new T.Group();scene.add(hull,debris);
const ray=new T.Raycaster(),pointer=new T.Vector2(),box=new T.Box3();
const outline=new T.Box3Helper(box,0xe6b166);scene.add(outline);outline.visible=false;
const boltGeometry=new T.CylinderGeometry(.055,.055,2.8,6),boltMaterial=new T.MeshBasicMaterial({color:0x95eaff});
const flashGeometry=new T.IcosahedronGeometry(1,1),flashMaterial=new T.MeshBasicMaterial({color:0xffb95e,transparent:true,opacity:.8});
let modules=[],structure=null,selected=null,bolts=[],flashes=[],shots=0,revision=0,elapsed=0;
let last=performance.now(),samples=[],submission=[],lastStats=0;

function kind(node){
 if(node.userData.part==='cargo')return 'Container';
 if(node.userData.capacityShell)return 'Tank';
 if(node.userData.part==='engine')return 'Drive';
 if(node.userData.part==='rcs')return 'Maneuvering';
 if(node.name==='freight command module')return 'Command';
 return null;
}
function piece(source,id,label,type){
 const group=batchStatic(source);group.position.copy(source.getWorldPosition(new T.Vector3()));
 group.quaternion.copy(source.getWorldQuaternion(new T.Quaternion()));
 group.scale.copy(source.getWorldScale(new T.Vector3()));group.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(group),center=bounds.getCenter(new T.Vector3());
 // Bake the authored pose around the actual component centre; no visual rescaling.
 group.children.forEach(mesh=>{mesh.geometry.applyMatrix4(group.matrixWorld);mesh.geometry.translate(-center.x,-center.y,-center.z);});
 group.position.copy(center);group.quaternion.identity();group.scale.setScalar(1);group.updateMatrixWorld(true);
 return {id,label,type,hp:100,maxHp:100,group,center,velocity:new T.Vector3(),spin:new T.Vector3(),age:0};
}
function releaseMerged(){while(hull.children.length){const mesh=hull.children[0];hull.remove(mesh);mesh.geometry.dispose();}}
function rebuildHull(){
 releaseMerged();const buckets=new Map();
 for(const component of [structure,...modules.filter(m=>m.hp>0)])for(const mesh of component.group.children){
  let bucket=buckets.get(mesh.material);if(!bucket){bucket={geometries:[],owners:[]};buckets.set(mesh.material,bucket);}
  const geo=mesh.geometry.clone();geo.translate(...component.center.toArray());
  bucket.geometries.push(geo);for(let i=0;i<geo.attributes.position.count/3;i++)bucket.owners.push(component.id);
 }
 for(const [material,bucket] of buckets){
  const geometry=mergeGeometries(bucket.geometries),mesh=new T.Mesh(geometry,material);
  mesh.userData.owners=bucket.owners;hull.add(mesh);bucket.geometries.forEach(g=>g.dispose());
 }
 revision++;
}
function clearEffects(){
 bolts.forEach(b=>scene.remove(b.mesh));bolts=[];
 flashes.forEach(f=>{scene.remove(f.mesh);f.mesh.material.dispose();});flashes=[];
 while(debris.children.length)debris.remove(debris.children[0]);
}
function load(){
 clearEffects();releaseMerged();for(const m of [structure,...modules])if(m)disposeBatch(m.group);
 const source=buildFreighter($('model').value,{cargoSeed:241});source.updateMatrixWorld(true);
 const nodes=[];source.traverse(node=>{if(kind(node))nodes.push(node);});
 const counts={};modules=nodes.map((node,i)=>{const type=kind(node);return piece(node,i,type+' '+(counts[type]=(counts[type]||0)+1),type);});
 // Remove independent components before batching the continuous spine and fittings.
 nodes.forEach(node=>node.removeFromParent());structure=piece(source,-1,'Load spine & fittings','Structure');
 structure.hp=structure.maxHp=1200;shots=0;elapsed=0;samples=[];submission=[];
 $('module').replaceChildren(...modules.map(m=>{const o=document.createElement('option');o.value=m.id;o.textContent=m.label;return o;}));
 rebuildHull();select(modules.filter(m=>m.type==='Container'||m.type==='Tank').sort((a,b)=>a.center.x-b.center.x||b.center.y-a.center.y||b.center.z-a.center.z)[0]);view('side');$('log').textContent='Range ready. Three hits detach a component.';
}
function updateUI(){
 const live=modules.filter(m=>m.hp>0),drives=modules.filter(m=>m.type==='Drive'),command=modules.find(m=>m.type==='Command');
 $('selection').textContent=selected?selected.label+' · '+selected.hp+' / '+selected.maxHp+(selected.hp<=0?' · detached':''):'';
 $('health').max=selected?.maxHp||100;$('health').value=selected?.hp||0;
 $('fire').disabled=!selected||selected.hp<=0||bolts.length>=6;
 $('systems').textContent=live.length+' / '+modules.length+' attached · Drives '+drives.filter(m=>m.hp>0).length+'/'+drives.length+' · Command '+(command?.hp>0?'online':'offline');
 for(const option of $('module').options){const m=modules[Number(option.value)];option.textContent=m.label+(m.hp<=0?' · detached':' · '+m.hp+'%');}
 if(selected&&selected.hp>0){box.setFromObject(selected.group);outline.visible=true;}else outline.visible=false;
}
function select(component){selected=component;if(component&&component.id>=0)$('module').value=component.id;updateUI();}
function view(preset){
 const bounds=new T.Box3().setFromObject(hull),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());
 controls.target.copy(center);
 if(preset==='side')camera.position.copy(center).add(new T.Vector3(-size.x*.45,size.x*.55,size.x*1.15));
 else if(preset==='stern'){controls.target.set(bounds.max.x-5,0,0);camera.position.set(bounds.max.x+36,13,22);}
 else {controls.target.set(bounds.min.x+5,0,0);camera.position.set(bounds.min.x-30,10,22);}
 camera.lookAt(controls.target);controls.update();
}
function impact(point,component,direction){
 const flash=new T.Mesh(flashGeometry,flashMaterial.clone());flash.position.copy(point);scene.add(flash);flashes.push({mesh:flash,age:0});
 if(!component||component.hp<=0)return;
 component.hp=Math.max(0,component.hp-35);
 if(component.hp===0&&component!==structure){
  component.group.position.copy(component.center);debris.add(component.group);
  const outward=new T.Vector3(0,component.center.y,component.center.z).normalize();if(outward.lengthSq()<.1)outward.set(-1,0,0);
  component.velocity.copy(outward.multiplyScalar(2)).addScaledVector(direction,1.4);
  component.spin.set(.08*(component.id%3-1),.07,.05*(component.id%2?1:-1));component.age=0;
  // Bound debris lifetime and visible count, retaining the reusable component buffers.
  if(debris.children.length>12)debris.remove(debris.children[0]);
  rebuildHull();$('log').textContent=component.label+' destroyed. Structure remains intact.';
 }else $('log').textContent=component.label+' hit · '+component.hp+' integrity';
 updateUI();
}
function pick(clientX,clientY){
 const rect=renderer.domElement.getBoundingClientRect();pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
 ray.setFromCamera(pointer,camera);ray.far=Infinity;const hit=ray.intersectObjects(hull.children,false)[0];
 if(hit){const id=hit.object.userData.owners[hit.faceIndex];select(id===-1?structure:modules[id]);}
}
function fire(){
 if(!selected||selected.hp<=0||bolts.length>=6)return;
 // Find a real visible surface of the selected component, preserving occlusion.
 const target=new T.Box3().setFromObject(selected.group).getCenter(new T.Vector3());
 const origin=camera.position.clone(),direction=target.sub(origin).normalize();
 const mesh=new T.Mesh(boltGeometry,boltMaterial);mesh.position.copy(origin);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction);scene.add(mesh);
 bolts.push({mesh,direction,distance:0});shots++;updateUI();
}
let down=null;
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button===0)down=[e.clientX,e.clientY];});
renderer.domElement.addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])<4)pick(e.clientX,e.clientY);down=null;});
renderer.domElement.addEventListener('pointercancel',()=>{down=null;});
$('fire').onclick=fire;$('module').onchange=()=>select(modules[Number($('module').value)]);
$('model').onchange=load;$('reset').onclick=load;
for(const preset of ['side','stern','bow'])$(preset).onclick=()=>view(preset);
new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe(host);
function frame(now){
 const raw=(now-last)/1000,dt=Math.min(raw,.05);last=now;elapsed+=dt;controls.update();scene.updateMatrixWorld(true);
 bolts=bolts.filter(b=>{
  const span=dt*450;ray.set(b.mesh.position,b.direction);ray.far=span;
  const hit=ray.intersectObjects(hull.children,false)[0];
  if(hit){const id=hit.object.userData.owners[hit.faceIndex];impact(hit.point,id===-1?structure:modules[id],b.direction);scene.remove(b.mesh);return false;}
  b.mesh.position.addScaledVector(b.direction,span);b.distance+=span;if(b.distance>1200){scene.remove(b.mesh);return false;}return true;
 });
 for(const m of modules)if(m.group.parent===debris){m.age+=dt;m.group.position.addScaledVector(m.velocity,dt);m.group.rotateX(m.spin.x*dt);m.group.rotateY(m.spin.y*dt);m.group.rotateZ(m.spin.z*dt);if(m.age>18)debris.remove(m.group);}
 flashes=flashes.filter(f=>{f.age+=dt;f.mesh.scale.setScalar(.2+f.age*7);f.mesh.material.opacity=Math.max(0,.85-f.age*2);if(f.age>.45){scene.remove(f.mesh);f.mesh.material.dispose();return false;}return true;});
 const start=performance.now();renderer.render(scene,camera);submission.push(performance.now()-start);samples.push(raw*1000);
 if(samples.length>240){samples.shift();submission.shift();}
 if(now-lastStats>500){lastStats=now;updateUI();const sorted=samples.slice().sort((a,b)=>a-b),cpu=submission.slice().sort((a,b)=>a-b);$('perf').textContent=renderer.info.render.calls+' draws · '+renderer.info.render.triangles.toLocaleString()+' triangles\nFrame '+(sorted[Math.floor(sorted.length*.5)]||0).toFixed(1)+' ms median / '+(sorted[Math.floor(sorted.length*.95)]||0).toFixed(1)+' p95\nSubmission '+(cpu[Math.floor(cpu.length*.5)]||0).toFixed(1)+' ms · '+shots+' shots';}
 requestAnimationFrame(frame);
}
try{
 const texture=await new T.TextureLoader().loadAsync('../assets/ships/industrial-kit/panels.png');setSurfaceTexture(texture);
 load();requestAnimationFrame(frame);
 // Read-only inspection for the range's focused browser regression and profiling.
 window.freighterRange={snapshot:()=>({model:$('model').value,modules:modules.map(m=>({id:m.id,label:m.label,type:m.type,hp:m.hp,center:m.center.toArray()})),revision,shots,debris:debris.children.length,bolts:bolts.length,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,camera:camera.position.toArray(),target:controls.target.toArray(),samples:samples.slice(),submission:submission.slice(),resolution:renderer.getDrawingBufferSize(new T.Vector2()).toArray(),dpr:renderer.getPixelRatio()})};
}catch(error){$('log').textContent='Range could not load: '+error.message;console.error(error);}
