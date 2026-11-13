import * as T from 'three';
import {OrbitControls} from '../vendor/three/examples/jsm/controls/OrbitControls.js';
import {mergeGeometries} from '../vendor/three/examples/jsm/utils/BufferGeometryUtils.js';
import {buildFreighter,batchStatic,disposeBatch,setSurfaceTexture} from '../assets/ships/industrial-kit/kit.js';
import {contact} from './freighter-contact.js';

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
// Use the fighter surface projector; keep normal paint instead of a wreck texture.
const scorchMaterials=[.10,.13,.16,.18,.72].map((opacity,i)=>new T.MeshBasicMaterial({color:i===4?0x171512:0x38332b,transparent:true,opacity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
let aimPoint=null;
let structureBoxes=[],contacts=0;
const identityAxes=[[1,0,0],[0,1,0],[0,0,1]];
function boundsBox(bounds){return {center:bounds.getCenter(new T.Vector3()).toArray(),half:bounds.getSize(new T.Vector3()).multiplyScalar(.5).toArray(),axes:identityAxes};}
function componentBox(component){return {center:component.group.position.toArray(),half:component.half,axes:identityAxes.map(axis=>new T.Vector3(...axis).applyQuaternion(component.group.quaternion).toArray())};}
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
 const surfaceMeshes=group.children.slice(),vertices=[];
 for(const mesh of surfaceMeshes){const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal;for(let i=0;i<p.count;i++)vertices.push(p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i));}
 const markGroup=new T.Group();markGroup.position.copy(center);scene.add(markGroup);
 return {id,label,type,hp:100,maxHp:100,group,surfaceMeshes,center,half:bounds.getSize(new T.Vector3()).multiplyScalar(.5).toArray(),markGroup,scorches:[],model:{id:'range-'+id,vertices},velocity:new T.Vector3(),spin:new T.Vector3(),age:0};
}
function releaseMerged(){while(hull.children.length){const mesh=hull.children[0];hull.remove(mesh);mesh.geometry.dispose();}}
function rebuildHull(){
 releaseMerged();const buckets=new Map();
 for(const component of [structure,...modules.filter(m=>m.hp>0)])for(const mesh of component.surfaceMeshes){
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
 clearEffects();releaseMerged();for(const m of [structure,...modules])if(m){disposeBatch(m.markGroup);m.markGroup.removeFromParent();disposeBatch(m.group);}
 const source=buildFreighter($('model').value,{cargoSeed:241});source.updateMatrixWorld(true);
 const nodes=[];source.traverse(node=>{if(kind(node))nodes.push(node);});
 const counts={};modules=nodes.map((node,i)=>{const type=kind(node);return piece(node,i,type+' '+(counts[type]=(counts[type]||0)+1),type);});
 // Remove independent components before batching the continuous spine and fittings.
 nodes.forEach(node=>node.removeFromParent());structureBoxes=[];
 // Individual fitting bounds avoid treating the entire open spine as a solid block.
 source.traverse(node=>{if(!node.isMesh)return;const bounds=boundsBox(new T.Box3().setFromObject(node)),geometry=node.geometry,p=geometry.attributes.position,index=geometry.index,vertices=[];
  for(let i=0;i<(index?index.count:p.count);i++)vertices.push(new T.Vector3().fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(node.matrixWorld));
  structureBoxes.push(Object.assign(bounds,{vertices}));
 });
 structure=piece(source,-1,'Load spine & fittings','Structure');contacts=0;
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
function select(component,point){selected=component;aimPoint=point?point.clone():null;if(component&&component.id>=0)$('module').value=component.id;updateUI();}
function view(preset){
 const bounds=new T.Box3().setFromObject(hull),center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3());
 controls.target.copy(center);
 if(preset==='side')camera.position.copy(center).add(new T.Vector3(-size.x*.45,size.x*.55,size.x*1.15));
 else if(preset==='stern'){controls.target.set(bounds.max.x-5,0,0);camera.position.set(bounds.max.x+36,13,22);}
 else {controls.target.set(bounds.min.x+5,0,0);camera.position.set(bounds.min.x-30,10,22);}
 camera.lookAt(controls.target);controls.update();
}
function addMark(component,point,normal){
 const local=point.clone().sub(component.center);
 window.Driftworks.shipHulls.addScorch(component,{local:local.toArray(),normal:normal.toArray(),model:component.model});
 // The shared projector bounds history at 24 marks. Rebuild only on impact.
 while(component.markGroup.children.length){const mesh=component.markGroup.children[0];component.markGroup.remove(mesh);mesh.geometry.dispose();}
 for(let layer=0;layer<5;layer++){
  const positions=[];for(const mark of component.scorches){const source=mark.layers[layer];for(let i=0;i<source.length;i+=6)positions.push(source[i],source[i+1],source[i+2]);}
  if(!positions.length)continue;
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  const mesh=new T.Mesh(geometry,scorchMaterials[layer]);mesh.renderOrder=10+layer;component.markGroup.add(mesh);
 }
}
function impact(point,component,direction,normal){
 const flash=new T.Mesh(flashGeometry,flashMaterial.clone());flash.position.copy(point);scene.add(flash);flashes.push({mesh:flash,age:0});
 if(!component||component.hp<=0)return;
 addMark(component,point,normal);
 component.hp=Math.max(0,component.hp-35);
 if(component.hp===0&&component!==structure){
  component.group.position.copy(component.center);debris.add(component.group);
  component.group.add(component.markGroup);component.markGroup.position.set(0,0,0);
  // Corner locks are authored through the attached container skin. Release only
  // those original contacts, without rotation, until the component slides clear.
  component.mountContacts=new Set(structureBoxes.filter(obstacle=>fittingContact(componentBox(component),obstacle)));
  const outward=new T.Vector3(0,component.center.y,component.center.z).normalize();if(outward.lengthSq()<.1)outward.set(-1,0,0);
  // Break free of the mount radially; the shot adds a small secondary kick.
  component.velocity.copy(outward.multiplyScalar(2)).addScaledVector(direction,.35);
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
 if(hit){const id=hit.object.userData.owners[hit.faceIndex];select(id===-1?structure:modules[id],hit.point);}
}
function fire(){
 if(!selected||selected.hp<=0||bolts.length>=6)return;
 // Find a real visible surface of the selected component, preserving occlusion.
 const target=aimPoint?aimPoint.clone():new T.Box3().setFromObject(selected.group).getCenter(new T.Vector3());
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
function drift(component,dt){
 if(component.velocity.lengthSq()<1e-8&&component.spin.lengthSq()<1e-8)return;
 const steps=Math.max(1,Math.ceil(dt*120)),step=dt/steps;
 for(let i=0;i<steps;i++){
  const position=component.group.position.clone(),rotation=component.group.quaternion.clone(),before=componentBox(component);
  const obstacles=modules.filter(m=>m!==component&&(m.hp>0||m.group.parent===debris)).map(componentBox);
  const mounting=obstacles.some(obstacle=>contact(before,obstacle))||structureBoxes.some(obstacle=>fittingContact(before,obstacle));
  component.group.position.addScaledVector(component.velocity,step);
  // Slide clear of the authored mounting fittings before beginning the tumble.
  if(!mounting){component.group.rotateX(component.spin.x*step);component.group.rotateY(component.spin.y*step);component.group.rotateZ(component.spin.z*step);}
  const after=componentBox(component);
  let blocked=null;
  for(const obstacle of obstacles){const next=contact(after,obstacle);if(!next)continue;const previous=contact(before,obstacle);
   // Authored mounting fittings may initially overlap conservative bounds.
   // Permit motion that reduces that existing overlap; never deepen it.
   const distance=body=>body.center.reduce((n,v,k)=>n+(v-obstacle.center[k])**2,0);
   if(previous&&next.depth<=previous.depth+.0001&&distance(after)>=distance(before))continue;
   blocked=next.normal;break;
  }
  if(!blocked)for(const obstacle of structureBoxes){
   const next=fittingContact(after,obstacle);if(!next)continue;
   if(component.mountContacts.has(obstacle))continue;
   blocked=next;break;
  }
  // Also sweep through the actual shared hull index, guarding thin spine contacts.
  const pose={eye:structure.center.toArray(),right:[1,0,0],back:[0,-1,0],up:[0,0,1]};
  if(!blocked){const hit=window.Driftworks.shipHulls.hullHit(structure.model,pose,position.toArray(),after.center,1,.04);if(hit&&component.velocity.dot(new T.Vector3(...hit.normal))<0)blocked=hit.normal;}
  if(blocked){
   component.group.position.copy(position);component.group.quaternion.copy(rotation);component.spin.set(0,0,0);
   const normal=new T.Vector3(...blocked),inward=component.velocity.dot(normal);if(inward<0)component.velocity.addScaledVector(normal,-1.15*inward);
   component.velocity.multiplyScalar(.65);contacts++;break;
  }
  for(const obstacle of component.mountContacts)if(!fittingContact(after,obstacle))component.mountContacts.delete(obstacle);
 }
}
const fittingTriangle=new T.Triangle(),fittingBounds=new T.Box3();
function fittingContact(body,obstacle){
 if(!contact(body,obstacle))return null;
 fittingBounds.min.set(...body.half.map(v=>-v));fittingBounds.max.set(...body.half);
 const local=(point,target)=>{const x=point.x-body.center[0],y=point.y-body.center[1],z=point.z-body.center[2],a=body.axes;target.set(x*a[0][0]+y*a[0][1]+z*a[0][2],x*a[1][0]+y*a[1][1]+z*a[1][2],x*a[2][0]+y*a[2][1]+z*a[2][2]);};
 for(let i=0;i<obstacle.vertices.length;i+=3){
  local(obstacle.vertices[i],fittingTriangle.a);local(obstacle.vertices[i+1],fittingTriangle.b);local(obstacle.vertices[i+2],fittingTriangle.c);
  if(!fittingBounds.intersectsTriangle(fittingTriangle))continue;
  const normal=new T.Vector3().crossVectors(obstacle.vertices[i+1].clone().sub(obstacle.vertices[i]),obstacle.vertices[i+2].clone().sub(obstacle.vertices[i])).normalize();
  if(normal.dot(new T.Vector3(...body.center).sub(obstacle.vertices[i]))<0)normal.negate();return normal.toArray();
 }
 return null;
}
function frame(now){
 const raw=(now-last)/1000,dt=Math.min(raw,.05);last=now;elapsed+=dt;controls.update();scene.updateMatrixWorld(true);
 bolts=bolts.filter(b=>{
  const span=dt*450;ray.set(b.mesh.position,b.direction);ray.far=span;
  const hit=ray.intersectObjects(hull.children,false)[0];
  if(hit){const id=hit.object.userData.owners[hit.faceIndex];impact(hit.point,id===-1?structure:modules[id],b.direction,hit.face.normal);scene.remove(b.mesh);return false;}
  b.mesh.position.addScaledVector(b.direction,span);b.distance+=span;if(b.distance>1200){scene.remove(b.mesh);return false;}return true;
 });
 for(const m of modules)if(m.group.parent===debris){m.age+=dt;drift(m,dt);if(m.age>18)debris.remove(m.group);}
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
 window.freighterRange={snapshot:()=>({model:$('model').value,modules:modules.map(m=>({id:m.id,label:m.label,type:m.type,hp:m.hp,center:m.center.toArray(),marks:m.scorches.length,markTriangles:m.markGroup.children.reduce((n,mesh)=>n+mesh.geometry.attributes.position.count/3,0),marksFollowDebris:m.markGroup.parent===m.group})),revision,shots,contacts,debris:debris.children.length,bolts:bolts.length,draws:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,camera:camera.position.toArray(),target:controls.target.toArray(),samples:samples.slice(),submission:submission.slice(),resolution:renderer.getDrawingBufferSize(new T.Vector2()).toArray(),dpr:renderer.getPixelRatio()})};
}catch(error){$('log').textContent='Range could not load: '+error.message;console.error(error);}
