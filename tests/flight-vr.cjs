'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),context=vm.createContext({console,AbortController,window:{}});
vm.runInContext(fs.readFileSync(path.join(root,'vendor/three/build/three.global.js'),'utf8'),context);
const T=context.window.THREE;
function element(){return {style:{},children:[],append(...items){this.children.push(...items);},appendChild(item){this.children.push(item);},insertBefore(item){this.children.push(item);},setAttribute(){},getContext(){return null;}};}
const launch=element(),body=element(),document={body,createElement:element,getElementById:()=>launch};
let supported=true,reject=false,active=false,session=null,reference,offsets=[],pauses=0;
const base={getOffsetReferenceSpace(transform){offsets.push(transform);return {...base,offset:true};}};
function makeSession(){const listeners={};return {inputSources:[],visibilityState:'visible',addEventListener(name,fn){(listeners[name]||=[]).push(fn);},emit(name){for(const fn of listeners[name]||[])fn();},async end(){active=false;session=null;this.emit('end');}};}
const candidate=makeSession();
const navigator={xr:{async isSessionSupported(){return supported;},async requestSession(){if(reject)throw Error('declined');return candidate;}}};
const renderer={xr:{get isPresenting(){return active;},enabled:false,setFoveation(value){assert.equal(value,0);},getSession:()=>session,getReferenceSpace:()=>reference,setReferenceSpace(value){reference=value;},setReferenceSpaceType(value){assert.equal(value,'local');},async setSession(value){session=value;active=true;reference=base;}},render(){}};
const DW={sim:{METERS_PER_UNIT:20},audio:{unlock(){}}};
const window={THREE:T,Driftworks:DW,XRRigidTransform:class{constructor(position,orientation){this.position=position;this.orientation=orientation;}}};
Object.assign(context,{window,document,navigator});
vm.runInContext(fs.readFileSync(path.join(root,'experiments/flight-vr.js'),'utf8'),context);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(),host=element(),bridge=DW.flightVr.create(host,renderer,scene,camera);
let paused=true;
const actions={pause(){pauses++;paused=true;},isPaused:()=>paused,isDead:()=>false};
const pose={eye:[10,20,30],right:[1,0,0],up:[0,1,0],back:[0,0,1],velocity:[0,0,0]};
(async()=>{
  assert.equal(DW.flightVr.forHost(host),bridge);bridge.mount(actions);
  await Promise.resolve();const options=launch.children[0],row=options.children[1],button=row.children[0],status=row.children[1];assert.equal(button.disabled,false);
  assert.equal(body.children.length,0,'VR controls must not cover phone fullscreen controls');assert.equal(options.children[0].textContent,'VR headset');assert(!options.open,'VR choices start collapsed');
  await button.onclick();assert(bridge.active());assert(paused);assert.equal(button.textContent,'Exit VR');
  const matrix=new T.Matrix4().makeRotationY(Math.PI/2);matrix.setPosition(.2,1.7,-.1);
  const transform={matrix:new Float32Array(matrix.elements),position:{x:.2,y:1.7,z:-.1}};
  bridge.frame({getViewerPose:()=>({transform})});assert(bridge.tracking());assert.equal(offsets.length,1);
  assert(Math.abs(offsets[0].orientation.y-Math.SQRT1_2)<1e-6);assert.equal(offsets[0].position.y,1.7);
  const looked=bridge.skyPose(pose);assert(Math.abs(looked.back[0]-1)<1e-6);assert.deepEqual(pose.back,[0,0,1]);assert.equal(looked.eye,pose.eye);
  bridge.prepare(pose.right,pose.up,pose.back,1);assert(camera.parent);assert(Math.abs(camera.parent.matrixWorld.elements[0]-.05)<1e-8);
  const centered=new T.Vector3().setFromMatrixPosition(new T.Matrix4().multiplyMatrices(camera.parent.matrixWorld,matrix));
  assert(centered.distanceTo(new T.Vector3(0,0,1))<1e-7,'Physical head translation must not move the flight eye centre');
  // Real Three matrices confirm physical eye separation survives the metre conversion.
  const left=new T.PerspectiveCamera(),right=new T.PerspectiveCamera();
  left.matrixWorld.copy(camera.parent.matrixWorld).multiply(matrix).multiply(new T.Matrix4().makeTranslation(-.032,0,0));right.matrixWorld.copy(camera.parent.matrixWorld).multiply(matrix).multiply(new T.Matrix4().makeTranslation(.032,0,0));
  left.matrixWorldInverse.copy(left.matrixWorld).invert();right.matrixWorldInverse.copy(right.matrixWorld).invert();
  const uniforms={uXRActive:{value:0},uXRView:{value:null},uXRProjection:{value:null}},material={uniforms},mesh=new T.Object3D();bridge.bind(mesh,material);
  mesh.onBeforeRender(renderer,scene,left);const l=Array.from(uniforms.uXRView.value);mesh.onBeforeRender(renderer,scene,right);const r=Array.from(uniforms.uXRView.value);
  assert(Math.abs(l[12]-r[12]-.064)<1e-6);assert.equal(uniforms.uXRActive.value,1);assert(material.uniformsNeedUpdate);
  for(const position of [[0,0,0],[1,.5,-2],[-.4,1.8,3]]){
    const walking=new T.Matrix4().makeRotationFromEuler(new T.Euler(.2,.8,-.1));walking.setPosition(...position);
    bridge.frame({getViewerPose:()=>({transform:{matrix:new Float32Array(walking.elements),position:{x:position[0],y:position[1],z:position[2]}}})});
    bridge.prepare(pose.right,pose.up,pose.back,1);
    const eyeCentre=new T.Vector3().setFromMatrixPosition(new T.Matrix4().multiplyMatrices(camera.parent.matrixWorld,walking));
    assert(eyeCentre.distanceTo(new T.Vector3(0,0,1))<1e-7,'Walking/leaning must cancel on all three axes');
  }
  assert.equal(camera.near,2,'XR retains desktop physical near distance for depth precision');
  function depth(z){return camera.far/(camera.far-camera.near)*(1-camera.near/z);}
  assert(Math.abs(depth(1000)-depth(1000.1))>1/16777216,'10 cm surface separation at 1 km survives a 24-bit depth buffer');
  let overlayScene;renderer.render=scene=>{overlayScene=scene;};bridge.overlay(element());
  const glyphShader=fs.readFileSync(path.join(root,'experiments/gpu-ui.js'),'utf8').match(/var fragment = `([\s\S]*?)`;/)[1];
  const nativeFrame={geometry:new T.BufferGeometry(),fragmentShader:glyphShader,width:1000,height:600,uniforms:{viewport:{value:[1000,600]},atlas:{value:{}},pixelRatio:{value:1}}};
  DW.gpuUi={frame:()=>nativeFrame};paused=false;bridge.overlay(element());
  const textHud=overlayScene.children.find(item=>item.geometry===nativeFrame.geometry);
  assert(textHud);assert.equal(textHud.geometry,nativeFrame.geometry);assert.equal(textHud.material.uniforms.atlas,nativeFrame.uniforms.atlas);
  assert.match(textHud.material.vertexShader,/float r2=dot\(q,q\)/);assert.match(textHud.material.vertexShader,/\(1\.\+r2\)/);assert(!textHud.material.vertexShader.includes('anchor'),'All glyph vertices must use the same continuous conformal spherical field');
  assert.match(textHud.material.fragmentShader,/coverage = max\(fwidth\(distance\), 1\. \/ 255\.\)/);
  assert.equal(textHud.material.uniforms.image,undefined,'Native text must not sample a rasterized HUD screenshot');
  bridge.overlay(element(),1);
  const damage=overlayScene.children.find(item=>item.material.uniforms.alpha);
  assert(damage.visible);assert.equal(damage.material.uniforms.alpha.value,.28);
  assert.equal(damage.renderOrder,-1);assert.equal(damage.material.depthTest,false);
  assert.match(damage.material.vertexShader,/gl_Position=vec4\(position.xy,0.,1.\)/,'Damage is clip-space, independent of head direction and HUD bounds');
  assert.deepEqual(Array.from(damage.geometry.attributes.position.array),[-1,-1,0,3,-1,0,-1,3,0]);
  bridge.overlay(element(),0);assert.equal(damage.visible,false);
  DW.gpuUi=undefined;
  bridge.frame({getViewerPose:()=>({transform})});
  const xrTarget={},gl={},eyeDraws=[],renderEvents=[];
  left.viewport={x:0,y:0,z:720,w:900};right.viewport={x:720,y:0,z:720,w:900};
  renderer.xr.updateCamera=()=>renderEvents.push('camera');renderer.xr.getCamera=()=>({cameras:[left,right]});
  renderer.getRenderTarget=()=>xrTarget;renderer.getContext=()=>gl;renderer.resetState=()=>renderEvents.push('reset');
  renderer.setRenderTarget=target=>assert.equal(target,xrTarget);renderer.setViewport=(...viewport)=>renderEvents.push(viewport);
  bridge.setSkyRenderer((context,eye)=>{assert.equal(context,gl);eyeDraws.push(eye);});bridge.prepare(pose.right,pose.up,pose.back,1);bridge.renderSky();
  assert.equal(eyeDraws.length,2);assert.equal(eyeDraws[1].viewport.x,720);assert.equal(scene.children.length,0,'Native VR must not allocate a copied canvas sky or HUD surface');
  for(const eye of eyeDraws)assert(Math.abs(Math.hypot(...eye.right)-1)<1e-8);
  assert.equal(renderEvents.at(-1),'reset','Raw sky state must be invalidated before Three resumes');
  bridge.setSkyRenderer(()=>{throw Error('sky draw failed');});assert.throws(()=>bridge.renderSky(),/sky draw failed/);assert.equal(renderEvents.at(-1),'reset');
  bridge.setSkyRenderer(()=>{});
  // Compare the actual bridge's planes with projection * view clipping using
  // vendored Three, including asymmetric eye projections and metre-scaled rigs.
  let checks=0,onlyLeft=0,onlyRight=0,seed=407;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  const originals=[left.projectionMatrix.clone(),right.projectionMatrix.clone()];
  left.projectionMatrix.makePerspective(-1.4,1,1.1,-.9,2,600000);
  right.projectionMatrix.makePerspective(-1,1.4,1.1,-.9,2,600000);
  let tracked=new T.Matrix4();
  const updateCamera=renderer.xr.updateCamera;
  renderer.xr.updateCamera=()=>{
    for(const [eye,offset] of [[left,-.032],[right,.032]]){
      eye.matrixWorld.copy(camera.parent.matrixWorld).multiply(tracked).multiply(new T.Matrix4().makeTranslation(offset,0,0));
      eye.matrixWorldInverse.copy(eye.matrixWorld).invert();
    }
  };
  for(const shipYaw of [0,.8])for(const yaw of [0,Math.PI/2,Math.PI,-.7]){
    tracked.makeRotationFromEuler(new T.Euler(.2,yaw,-.15));tracked.setPosition(.4,1.8,-.2);
    bridge.frame({getViewerPose:()=>({transform:{matrix:new Float32Array(tracked.elements),position:{x:.4,y:1.8,z:-.2}}})});
    const r=[Math.cos(shipYaw),0,-Math.sin(shipYaw)],b=[Math.sin(shipYaw),0,Math.cos(shipYaw)];
    bridge.prepare(r,[0,1,0],b,1);
    const frusta=bridge.frusta();assert.equal(frusta.length,2);
    for(let sample=0;sample<1000;sample++){
      const point=[random()*12-6,random()*12-6,random()*12-6];
      const inside=[left,right].map(eye=>{
        const clip=new T.Vector4(...point,1).applyMatrix4(eye.matrixWorldInverse).applyMatrix4(eye.projectionMatrix);
        return clip.x>=-clip.w&&clip.x<=clip.w&&clip.y>=-clip.w&&clip.y<=clip.w&&clip.z>=-clip.w&&clip.z<=clip.w;
      });
      const culled=frusta.map(planes=>!planes.some(p=>p[0]*point[0]+p[1]*point[1]+p[2]*point[2]+p[3]<0));
      assert.deepEqual(Array.from(culled),inside,'planes agree with actual per-eye shader projection after head/ship rotation');
      if(inside[0]&&!inside[1])onlyLeft++;if(inside[1]&&!inside[0])onlyRight++;checks++;
    }
  }
  assert(onlyLeft>0&&onlyRight>0,'both eyes have independently visible regions that the union must retain');
  assert.equal(checks,8000);
  const saved=left.projectionMatrix.elements[0];left.projectionMatrix.elements[0]=NaN;
  assert.equal(bridge.frusta().length,0,'invalid eye data conservatively disables rejection');left.projectionMatrix.elements[0]=saved;
  const getCamera=renderer.xr.getCamera;renderer.xr.getCamera=()=>({cameras:[]});assert.equal(bridge.frusta().length,0,'no stale frusta when eyes are unavailable');renderer.xr.getCamera=getCamera;
  originals.forEach((m,i)=>[left,right][i].projectionMatrix.copy(m));renderer.xr.updateCamera=updateCamera;
  console.log('PASS XR culling planes: 8,000 independent stereo clip comparisons, head/ship rotations, asymmetric eyes and invalid-data fallback');
  bridge.recenter();bridge.frame({getViewerPose:()=>({transform})});assert.equal(offsets.length,2);
  paused=false;const prior=pauses;bridge.frame({getViewerPose:()=>null});assert.equal(pauses,prior+1);assert.equal(bridge.tracking(),false);assert.equal(bridge.sources().length,0);
  assert.equal(bridge.frusta().length,0,'tracking loss never reuses old culling planes');
  candidate.visibilityState='visible-blurred';bridge.frame({getViewerPose:()=>({transform})});assert.equal(bridge.tracking(),false);
  await candidate.end();bridge.prepare(pose.right,pose.up,pose.back,1);assert.equal(camera.parent,null);assert.equal(button.textContent,'Enter VR');assert(paused);
  reject=true;await button.onclick();assert.match(status.textContent,/declined/);assert.equal(button.disabled,false);assert.equal(active,false);
  supported=false;const unsupported=DW.flightVr.create(element(),renderer,new T.Scene(),new T.PerspectiveCamera());unsupported.mount(actions);await Promise.resolve();
  const unavailable=launch.children[1].children[1];assert.equal(unavailable.children[0].textContent,'VR unavailable');assert.notEqual(unavailable.children[0].hidden,true);assert.match(unavailable.children[1].textContent,/immersive VR unavailable/);
  navigator.xr=undefined;window.isSecureContext=false;DW.flightVr.create(element(),renderer,new T.Scene(),new T.PerspectiveCamera()).mount(actions);
  assert.match(launch.children[2].children[1].children[1].textContent,/HTTPS/);
  console.log('PASS VR session lifecycle, denied entry, recentering, head/ship separation, physical stereo, tracking loss and desktop restoration');
})().catch(error=>{console.error(error);process.exitCode=1;});
