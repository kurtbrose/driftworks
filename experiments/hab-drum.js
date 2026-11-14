import * as THREE from 'three';
import {GLTFLoader} from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
const physics = window.Driftworks.habPhysics, $ = id => document.getElementById(id);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x08131e);
const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); document.body.prepend(renderer.domElement);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
const camera = new THREE.PerspectiveCamera(75,1,.04,300);
scene.add(new THREE.HemisphereLight(0xc9e8ff,0x4c626c,2));
const light = new THREE.PointLight(0xe4f4ff,80,90,1); scene.add(light);
const drum = new THREE.Group(); scene.add(drum);
function material(color){return new THREE.MeshStandardMaterial({color,roughness:.8,side:THREE.DoubleSide});}
const deckMat = material(0x52626b), stripeMat = material(0xc29650), darkMat = material(0x1e3443);
// Interior pressure deck follows the existing habitat's X axis and 17 m outer radius.
const shell = new THREE.Mesh(new THREE.CylinderGeometry(16,16,62,128,1,true),deckMat); shell.rotation.z=Math.PI/2; drum.add(shell);
for(const x of [-31,31]){const cap=new THREE.Mesh(new THREE.CircleGeometry(16,96),darkMat);cap.rotation.y=Math.PI/2;cap.position.x=x;drum.add(cap);}
for(let i=0;i<32;i++){
  const angle=i*Math.PI/16, strip=new THREE.Mesh(new THREE.BoxGeometry(62,.045,.12),i%4===0?stripeMat:darkMat);
  strip.position.set(0,15.97*Math.cos(angle),15.97*Math.sin(angle));strip.rotation.x=angle;drum.add(strip);
}
for(const x of [-28,-14,0,14,28]){const ring=new THREE.Mesh(new THREE.TorusGeometry(15.97,.035,4,128),stripeMat);ring.rotation.y=Math.PI/2;ring.position.x=x;drum.add(ring);}
// A stationary axial reference makes rotation visible even while riding the deck.
const spine=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,72,12),material(0xadc5ce));spine.rotation.z=Math.PI/2;scene.add(spine);
const crew=[]; let player, omega=Number($('rpm').value)*Math.PI/30, phase=0, yaw=0, pitch=0, active=false, accumulator=0;
function reset(){player=physics.create(-20);crew.forEach((c,i)=>c.body=physics.create(-12+i*4,-Math.PI/2+i*.23,omega));player=physics.create(-20,-Math.PI/2,omega);yaw=0;pitch=0;}
const keys=new Set(); let jump=false;
let audio, source, ticket=0;
const radioWorker=new Worker('mumble-worker.js');radioWorker.postMessage({kind:'init',url:new URL('mumble.js',location.href).href});
radioWorker.onmessage=({data})=>{if(!audio||!active||data.id!==ticket)return;if(source){source.stop();source.disconnect();}const buffer=audio.createBuffer(1,data.samples.length,22050);buffer.copyToChannel(data.samples,0);source=audio.createBufferSource();source.buffer=buffer;source.connect(audio.destination);source.start();};
function say(name,text){$('speaker').textContent=name+' / SUIT RADIO';$('subtitle').textContent=text;if(audio&&active){const plan=window.Driftworks.mumble.analyze(text,{seed:12,volume:.42});radioWorker.postMessage({kind:'render',id:++ticket,plan,radioSeed:32});}}
try{
  const gltf=await new GLTFLoader().loadAsync('../assets/characters/quaternius-astronaut/original/Astronaut%20by%20Quaternius%20-%203hC2i0CTuO.glb');
  // Reload per crew member to retain independent skeletons and animation mixers.
  for(let i=0;i<8;i++){
    const asset=i===0?gltf:await new GLTFLoader().loadAsync('../assets/characters/quaternius-astronaut/original/Astronaut%20by%20Quaternius%20-%203hC2i0CTuO.glb');
    const model=asset.scene, bounds=new THREE.Box3().setFromObject(model), height=bounds.max.y-bounds.min.y;
    const visual=new THREE.Group();model.scale.setScalar(1.8/height);model.position.y=-bounds.min.y*1.8/height;visual.add(model);scene.add(visual);
    const mixer=new THREE.AnimationMixer(model), clip=asset.animations.find(c=>/Walk/.test(c.name)&&!/_RM/.test(c.name))||asset.animations.find(c=>/Idle_Neutral/.test(c.name));if(clip)mixer.clipAction(clip).play();
    crew.push({visual,mixer,body:physics.create(-12+i*4,-Math.PI/2+i*.23,omega),direction:i%2?1:-1});
  }
}catch(error){say('HAB CONTROL','Suit asset load failed: '+error.message);}
reset();
$('rpm').oninput=()=>{omega=Number($('rpm').value)*Math.PI/30;};
$('reverse').onclick=()=>{omega=-omega;};$('reset').onclick=reset;
$('enter').onclick=()=>renderer.domElement.requestPointerLock();renderer.domElement.onclick=()=>{if(!active)renderer.domElement.requestPointerLock();};
document.addEventListener('pointerlockchange',()=>{active=document.pointerLockElement===renderer.domElement;keys.clear();jump=false;accumulator=0;if(active){audio=audio||new AudioContext();audio.resume();}else{ticket++;if(source){source.stop();source.disconnect();source=null;}}});
window.addEventListener('pagehide',()=>{radioWorker.terminate();audio?.close();});
window.addEventListener('blur',()=>{keys.clear();jump=false;});
window.addEventListener('keydown',e=>{if(!active)return;if(['Space','KeyW','KeyA','KeyS','KeyD'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat)jump=true;if(e.code==='KeyR')reset();if(e.code==='KeyE'&&!e.repeat){const nearest=crew.map((c,i)=>({i,d:new THREE.Vector3(...c.body.p).distanceTo(new THREE.Vector3(...player.p))})).sort((a,b)=>a.d-b.d)[0];if(nearest&&nearest.d<5)say('CREW '+(nearest.i+1),'Copy. Walking the pressure deck. Jump clear and your momentum carries you until the next impact.');else say('HAB CONTROL','All suits on channel. Approach a crew member within five metres.');}});
window.addEventListener('keyup',e=>keys.delete(e.code));
document.addEventListener('mousemove',e=>{if(active){yaw-=e.movementX*.002;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.002,-1.45,1.45);}});
const up=new THREE.Vector3(), tangent=new THREE.Vector3(), forward=new THREE.Vector3(), right=new THREE.Vector3();
function basis(body){const a=Math.atan2(body.p[2],body.p[1]);up.set(0,-Math.cos(a),-Math.sin(a));tangent.set(0,-Math.sin(a),Math.cos(a));}
let last=performance.now(), frames=0, frameMs=0;
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;
  if(active){accumulator+=dt;while(accumulator>=1/240){const h=1/240;phase+=omega*h;const speed=keys.has('ShiftLeft')?5:2.4, f=Number(keys.has('KeyW'))-Number(keys.has('KeyS')), s=Number(keys.has('KeyD'))-Number(keys.has('KeyA')), norm=Math.max(1,Math.hypot(f,s));physics.step(player,h,omega,(f*Math.cos(yaw)+s*Math.sin(yaw))*speed/norm,(f*Math.sin(yaw)-s*Math.cos(yaw))*speed/norm,jump);jump=false;
    crew.forEach(c=>{if(Math.abs(c.body.p[0])>26)c.direction=-Math.sign(c.body.p[0]);physics.step(c.body,h,omega,c.direction*1.2,0);});accumulator-=h;}
    crew.forEach(c=>c.mixer.update(dt));}
  drum.rotation.x=phase;
  crew.forEach(c=>{basis(c.body);const f=new THREE.Vector3(c.direction,0,0), r=new THREE.Vector3().crossVectors(f,up), matrix=new THREE.Matrix4().makeBasis(r,up,f.clone().negate());c.visual.quaternion.setFromRotationMatrix(matrix);c.visual.position.fromArray(c.body.p);});
  basis(player);forward.set(Math.cos(yaw),0,0).addScaledVector(tangent,Math.sin(yaw));right.crossVectors(forward,up);camera.position.fromArray(player.p).addScaledVector(up,1.65);camera.up.copy(up);camera.lookAt(camera.position.clone().addScaledVector(forward,Math.cos(pitch)).addScaledVector(up,Math.sin(pitch)));
  renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.render(scene,camera);
  frames++;frameMs+=dt*1000;if(frames%30===0){$('spin').textContent=(omega*30/Math.PI).toFixed(2);$('readout').textContent=`${active?'LIVE':'PAUSED'} · ${player.grounded?'DECK CONTACT':'BALLISTIC FLIGHT'}\nDeck acceleration ${(omega*omega*16/9.81).toFixed(3)} g\nInertial speed ${Math.hypot(...player.v).toFixed(2)} m/s\n${crew.length} crew · ${renderer.info.render.calls} draws · ${(frameMs/frames).toFixed(1)} ms/frame`;}
}
requestAnimationFrame(frame);
window.habDrum={scene,renderer,crew,get player(){return player;},get omega(){return omega;}};
