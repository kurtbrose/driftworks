const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context=vm.createContext({console,AbortController,window:{}});
vm.runInContext(fs.readFileSync('vendor/three/build/three.global.js','utf8'),context);
const T=context.window.THREE;
const html=fs.readFileSync('experiments/crew-deck.html','utf8');
const clone=vm.runInNewContext('('+html.match(/function cloneRig\(source\)\{[^\n]+/)[0]+')');
const source=new T.Group(),bone=new T.Bone();source.add(bone);
const mesh=new T.SkinnedMesh(new T.BoxGeometry(),new T.MeshStandardMaterial());source.add(mesh);mesh.bind(new T.Skeleton([bone]));
const a=clone(source),b=clone(source),am=a.children[1],bm=b.children[1];
assert.equal(am.geometry,mesh.geometry,'Geometry shared');
assert.notEqual(am.material,bm.material,'Palette isolated');
assert.notEqual(am.skeleton,bm.skeleton,'Skeleton isolated');
assert.equal(am.skeleton.bones[0],a.children[0],'Skeleton points to cloned bone');
a.children[0].position.x=3;
assert.equal(b.children[0].position.x,0,'Independent poses');
assert.equal(bone.position.x,0,'Source preserved');
console.log('PASS crew deck: shared geometry, independent skeletons, isolated palettes and source preservation');

const poseFace=vm.runInNewContext('('+html.match(/function poseFace\(a,now\)\{[\s\S]*?\n\}/)[0]+')',{T});
const actorRoot=new T.Group(),rig=new T.Group(),head=new T.Bone(),anchor=new T.Group();
actorRoot.position.set(4,0,-2);actorRoot.rotation.y=.8;actorRoot.add(rig,anchor);rig.scale.setScalar(.96);rig.add(head);head.position.set(0,1.6,0);
const texture={offset:{x:0}},actor={root:actorRoot,face:{anchor,bone:head,texture,index:0},talk:0};
poseFace(actor,0);actorRoot.updateMatrixWorld(true);
assert(anchor.getWorldPosition(new T.Vector3()).distanceTo(head.getWorldPosition(new T.Vector3()))<1e-9,'Face follows transformed head bone');
console.log('PASS authored head attachment follows the transformed astronaut bone');

const headData=JSON.parse(fs.readFileSync('assets/characters/quaternius-universal-base-characters/runtime/female-head.json','utf8'));
assert.equal(headData.units,'metres');assert.equal(headData.groups.length,3);
for(const group of headData.groups){
 assert(group.positions.length>0&&group.positions.length%9===0);
 assert.equal(group.positions.length,group.normals.length);assert.equal(group.positions.length/3,group.uvs.length/2);
 assert(group.positions.every(Number.isFinite)&&group.normals.every(Number.isFinite)&&group.uvs.every(Number.isFinite));
 for(let i=0;i<group.positions.length;i+=3){assert(Math.abs(group.positions[i])<.16);assert(group.positions[i+1]>-.08&&group.positions[i+1]<.24);assert(Math.abs(group.positions[i+2])<.2);}
}
console.log('PASS authored head asset: complete triangles, source-metre head bounds, UV/normal coverage and three material groups');

const skinState={value:'guided'},originalSkin=new T.Texture(),guidedSkin=new T.Texture();
const skinMesh=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial({map:originalSkin}));skinMesh.name='MI_Superhero_Female';
const skinAnchor=new T.Group();skinAnchor.add(skinMesh);const brow=new T.MeshStandardMaterial(),geometryBefore=skinMesh.geometry;
const applySkin=vm.runInNewContext('('+html.match(/function applyJoSkin\(\)\{[^\n]+/)[0]+')',{actors:[{face:{jo:true,anchor:skinAnchor,skin:guidedSkin,original:originalSkin,brows:brow}}],$:()=>skinState});
applySkin();assert.equal(skinMesh.material.map,guidedSkin);assert.notEqual(brow.color.getHex(),0xffffff);
skinState.value='original';applySkin();assert.equal(skinMesh.material.map,originalSkin);assert.equal(brow.color.getHex(),0xffffff);assert.equal(skinMesh.geometry,geometryBefore,'Texture switching never deforms the head');
console.log('PASS Jo skin: reversible texture/brow comparison without geometry changes');

const cutHelmet=vm.runInNewContext('('+html.match(/function openHelmetGeometry\(input,matrix,head\)\{[\s\S]*?\n\}/)[0]+')',{T});
const originalShell=new T.BoxGeometry(.3,.4,.25);originalShell.translate(0,.1,-.025);const jointIds=new Uint16Array(originalShell.attributes.position.count*4),jointWeights=new Float32Array(jointIds.length);for(let i=0;i<jointIds.length;i+=4){jointIds[i]=3;jointWeights[i]=1;}originalShell.setAttribute('skinIndex',new T.BufferAttribute(jointIds,4));originalShell.setAttribute('skinWeight',new T.BufferAttribute(jointWeights,4));const originalPositions=Array.from(originalShell.attributes.position.array);
const openedShell=cutHelmet(originalShell,new T.Matrix4(),new T.Vector3());
assert.deepEqual(Array.from(originalShell.attributes.position.array),originalPositions,'Source helmet geometry remains untouched');
const shell=new T.Mesh(openedShell,new T.MeshBasicMaterial({side:T.DoubleSide}));
const panel=new T.Mesh(new T.PlaneGeometry(.17,.205),new T.MeshBasicMaterial());panel.position.set(0,.115,.025);panel.updateMatrixWorld(true);shell.updateMatrixWorld(true);
const center=new T.Vector3(0,.115,.025);
function helmetRay(origin){return new T.Raycaster(origin,center.clone().sub(origin).normalize()).intersectObjects([panel,shell]);}
assert.equal(helmetRay(new T.Vector3(0,.115,1))[0].object,panel,'Original faceplate removed through the full opening');
assert.equal(helmetRay(new T.Vector3(1,.115,0))[0].object,shell,'Retained source side wall occludes the recessed face');
for(let i=0;i<openedShell.attributes.skinIndex.count;i++){assert.equal(openedShell.attributes.skinIndex.array[i*4],3);assert.equal(openedShell.attributes.skinWeight.array[i*4],1);}
for(const name of ['position','normal','uv'])assert(Array.from(openedShell.attributes[name].array).every(Number.isFinite));
const prepare=vm.runInNewContext('('+html.match(/function prepareSourceHelmet\(root\)\{[\s\S]*?\n\}/)[0]+')',{T,openHelmetGeometry:cutHelmet});
const sourceRoot=new T.Group(),sourceHead=new T.Object3D(),sourceShell=new T.Group(),sourceMesh=new T.Mesh(originalShell,new T.MeshBasicMaterial());sourceHead.name='Head';sourceShell.name='SpaceSuit_Head';sourceShell.add(sourceMesh);sourceRoot.add(sourceHead,sourceShell);prepare(sourceRoot);sourceMesh.geometry.computeBoundingBox();
assert(Math.abs(sourceMesh.geometry.boundingBox.getSize(new T.Vector3()).x-.3*.82)<1e-6,'Helmet reduced uniformly to 82% around its Head pivot');
actor.face.portraitMap={offset:{x:0}};actor.person={voiceIndex:0};actor.talk=0;poseFace(actor,0);const faceNeutral=actor.face.portraitMap.offset.x;
poseFace(actor,4500);assert(actor.face.portraitMap.offset.x>faceNeutral,'Helmet uses original blink frame');actor.talk=1;poseFace(actor,200);assert(actor.face.portraitMap.offset.x>faceNeutral&&actor.face.portraitMap.offset.x<1,'Helmet uses original talking frames');
console.log('PASS helmet portraits: front aperture, retained source-shell occlusion, original blink/talking poses and animated head attachment');

(async()=>{
 const pending=[],released=[],target={headRevision:0,root:{children:[{}]},face:{id:'initial'},paint:{apply(){}}};
 const replace=vm.runInNewContext('('+html.match(/async function replaceHead\(a,person\)\{[^\n]+/)[0]+')',{
  createCrewHead:()=>new Promise(resolve=>pending.push(resolve)),releaseFace:face=>released.push(face.id),setSourceHelmet(){},presets:[{id:'navy',primary:'#000000',accent:'#ffffff'}],applyJoSkin(){}
 });
 const old=replace(target,{id:'old',suit:'navy'}),next=replace(target,{id:'next',suit:'navy'});
 pending[1]({id:'new-head',mode:'helmet'});assert(await next);pending[0]({id:'stale-head',mode:'3d'});assert.equal(await old,false);
 assert.equal(target.face.id,'new-head');assert(released.includes('initial')&&released.includes('stale-head'));assert(!released.includes('new-head'));
 console.log('PASS head experiments: stale asynchronous mode/identity loads cannot replace the current head');
})().catch(error=>{console.error(error);process.exitCode=1;});

const spriteFrame=vm.runInNewContext('('+html.match(/function headSpriteFrame\(angle[^)]*\)\{[^\n]+/)[0]+')');
for(let i=-16;i<=16;i++)assert.equal(spriteFrame(i*Math.PI/4),((i%8)+8)%8);
assert.equal(spriteFrame(Math.PI/8-.001),0);assert.equal(spriteFrame(Math.PI/8+.001),1);
const spriteCamera=new T.PerspectiveCamera();spriteCamera.position.set(4,1.6,2);
const spritePose=vm.runInNewContext('('+html.match(/function poseFace\(a,now\)\{[\s\S]*?\n\}/)[0]+')',{T,camera:spriteCamera,headSpriteFrame:spriteFrame});
actor.face.mode='sprites';actor.face.portraitMap=new T.Texture();spritePose(actor,0);actorRoot.updateMatrixWorld(true);
assert(anchor.getWorldPosition(new T.Vector3()).distanceTo(head.getWorldPosition(new T.Vector3()))<1e-9);
const spriteDirection=spriteCamera.position.clone().sub(anchor.getWorldPosition(new T.Vector3()));spriteDirection.y=0;spriteDirection.normalize();
assert(anchor.getWorldDirection(new T.Vector3()).distanceTo(spriteDirection)<1e-9,'Sprite faces camera horizontally under rotated parent');
assert([0,.25,.5,.75].includes(actor.face.portraitMap.offset.x));assert([0,.5].includes(actor.face.portraitMap.offset.y));
console.log('PASS directional heads: eight angle sectors, wraparound, camera facing and animated neck pivot');

for(let i=-32;i<=32;i++)assert.equal(spriteFrame(i*Math.PI/8,16),((i%16)+16)%16);
assert.equal(spriteFrame(Math.PI/16+.02,16,0),0,'Small boundary movement retains prior angle');
assert.equal(spriteFrame(Math.PI/16+.04,16,0),1,'Deliberate motion crosses hysteresis');
assert.equal(spriteFrame(-.01,16,0),0,'Hysteresis wraps at full turn');
actor.face.directionCount=16;actor.face.halfMap=new T.Texture();actor.face.spriteFrame=null;
spritePose(actor,0);assert(actor.face.spriteFrame>=0&&actor.face.spriteFrame<16);
console.log('PASS 16 head directions: halfway sectors, stable boundaries and 16-angle pose path');

const spritePanel=new T.Mesh(new T.PlaneGeometry(),new T.MeshBasicMaterial({map:actor.face.portraitMap}));anchor.add(spritePanel);
for(const sector of [0,1,2,7,8,15]){
 actor.face.spriteFrame=null;
 spriteCamera.position.copy(new T.Vector3(Math.sin(sector*Math.PI/8),0,Math.cos(sector*Math.PI/8)).applyQuaternion(head.getWorldQuaternion(new T.Quaternion())).multiplyScalar(3).add(head.getWorldPosition(new T.Vector3())));
 spritePose(actor,0);assert.equal(actor.face.spriteFrame,sector);
 const expected=sector%2?actor.face.halfMap:actor.face.portraitMap,cell=Math.floor(sector/2);
 assert.equal(spritePanel.material.map,expected,'Interleaved sector selects original or halfway atlas');
 assert.equal(expected.offset.x,(cell%4)/4);assert.equal(expected.offset.y,1-(Math.floor(cell/4)+1)/2);
}
console.log('PASS interleaved atlas selection: original/halfway maps and both UV rows across wraparound');

const walkCamera=new T.PerspectiveCamera();walkCamera.position.set(1,1.68,8);
const walkKeys=new Set();let focused=true;
const walkingContext=vm.createContext({walking:true,document:{hasFocus:()=>focused,pointerLockElement:null},camera:walkCamera,keys:walkKeys,yaw:0,blocked:()=>false});
vm.runInContext(html.match(/function stepWalking\(dt\)\{[^\n]+/)[0],walkingContext);
const startPosition=walkCamera.position.clone();walkingContext.stepWalking(.5);assert(walkCamera.position.equals(startPosition),'No camera orbit or recentering while idle');
walkKeys.add('KeyW');walkingContext.stepWalking(.4);assert(Math.abs(walkCamera.position.z-7)<1e-9,'W walks forward from current camera');assert.equal(walkCamera.position.y,1.68);
walkKeys.add('KeyD');const beforeDiagonal=walkCamera.position.clone();walkingContext.stepWalking(.4);assert(Math.abs(walkCamera.position.distanceTo(beforeDiagonal)-1)<1e-9,'Diagonal speed normalized');
focused=false;const unfocused=walkCamera.position.clone();walkingContext.stepWalking(1);assert(walkCamera.position.equals(unfocused),'Focus loss prevents travel');focused=true;
walkingContext.walking=false;walkingContext.stepWalking(1);assert(walkCamera.position.equals(unfocused),'Paused camera stays where player left it');
const mouseMoves=[];walkingContext.renderer={domElement:{}};walkingContext.mousePosition=null;walkingContext.look=(x,y)=>mouseMoves.push([x,y]);vm.runInContext(html.match(/function mouseLook\(e\)\{[\s\S]*?\n\}/)[0],walkingContext);
const cursor=(x,y,extra={})=>({target:walkingContext.renderer.domElement,clientX:x,clientY:y,movementX:9999,movementY:9999,...extra});
walkingContext.mouseLook(cursor(200,200));assert.equal(mouseMoves.length,0);
walkingContext.walking=true;walkingContext.mouseLook(cursor(200,200));assert.equal(mouseMoves.length,0,'First unlocked sample only seeds baseline');
walkingContext.mouseLook(cursor(204,202));assert.deepEqual(mouseMoves[0],[4,2],'Unlocked look ignores bogus movement fields');
walkingContext.document.pointerLockElement={};walkingContext.mouseLook(cursor(300,300));assert.equal(mouseMoves.length,1,'Other pointer lock owner cannot steer camera');
walkingContext.document.pointerLockElement=null;walkingContext.mouseLook(cursor(800,800));assert.equal(mouseMoves.length,1,'Pointer lock transition clears old position');
walkingContext.mouseLook(cursor(801,801,{target:{}}));walkingContext.mouseLook(cursor(200,200));assert.equal(mouseMoves.length,1,'Leaving canvas resets baseline');
walkingContext.document.pointerLockElement=walkingContext.renderer.domElement;walkingContext.mouseLook(cursor(200,200,{movementX:3,movementY:5}));assert.deepEqual(mouseMoves[1],[3,5],'Captured look uses relative motion');
const lookCamera=new T.PerspectiveCamera(),lookContext=vm.createContext({T,camera:lookCamera,yaw:.7,pitch:Math.PI/4});
vm.runInContext(html.match(/function look\(dx,dy\)\{[^\n]+/)[0],lookContext);
for(const startPitch of [Math.PI/4,-Math.PI/4]){
 lookContext.pitch=startPitch;lookContext.look(0,2);assert(Math.abs(lookContext.pitch-(startPitch-.005))<1e-12,'Pitch stays continuous across 45 degrees');
 const before=lookContext.pitch;lookContext.look(0,900);assert.equal(lookContext.pitch,before,'Coordinate warp rejected instead of slamming pitch limit');lookContext.look(0,NaN);assert.equal(lookContext.pitch,before);
 assert.equal(lookCamera.rotation.order,'YXZ');assert.equal(lookCamera.rotation.z,0);
}
console.log('PASS free walking: idle camera stability, WASD, normalized diagonals, focus/pause and unlocked mouse look');
const comparisonSpecs=vm.runInNewContext(html.match(/const specs=([^;]+);/)[0]+'specs');
assert.equal(comparisonSpecs.length,5);
assert.equal(comparisonSpecs.filter(s=>s[4]==='sprites'&&s[5]===16).length,1);
assert.equal(comparisonSpecs.filter(s=>s[4]==='sprites'&&s[5]===8).length,1);
for(const mode of ['helmet','3d','paper'])assert.equal(comparisonSpecs.filter(s=>s[4]===mode).length,1);
assert(comparisonSpecs.every(s=>s[3]===false),'Comparison actors use the shared motion clock rather than individual patrols');
const enterElements={enter:{disabled:false,textContent:''},options:{open:true},cross:{hidden:true}};
let canvasFocused=false,requestedLock=false;
const canvas={focus:()=>canvasFocused=true,requestPointerLock:()=>{requestedLock=true;return Promise.resolve();}};
const enterContext=vm.createContext({$:id=>enterElements[id],renderer:{domElement:canvas},walking:false,inspecting:true,mousePosition:null});
vm.runInContext(html.match(/function enterWalking\(\)\{[^\n]+/)[0],enterContext);enterContext.enterWalking();
assert(canvasFocused&&requestedLock,'Walking focuses canvas and requests mouse capture');assert(enterContext.walking);assert.equal(enterElements.options.open,false);assert.equal(enterContext.inspecting,false);
console.log('PASS comparison lineup: all five head variants, shared motion control, focused click-to-walk entry');

const motionContext=vm.createContext({});
for(const name of ['comparisonMotion','comparisonPath','bodyMotionFrame'])vm.runInContext(html.match(new RegExp('function '+name+'\\([^\\n]+'))[0],motionContext);
assert.equal(motionContext.comparisonMotion(0,'cycle').name,'walk');assert.equal(motionContext.comparisonMotion(8,'cycle').name,'reach');assert.equal(motionContext.comparisonMotion(12,'cycle').name,'wave');assert.equal(motionContext.comparisonMotion(16,'cycle').name,'crouch');assert.equal(motionContext.comparisonMotion(20,'cycle').name,'idle');assert.equal(motionContext.comparisonMotion(23,'cycle').name,'walk');
assert.equal(motionContext.comparisonMotion(3,'walk').time,3,'Manual selection keeps its own phase');
const first=motionContext.comparisonPath(0),lastPath=motionContext.comparisonPath(8);assert(Math.hypot(first.x-lastPath.x,first.z-lastPath.z)<1e-9,'Walk returns to its starting mark before an action');
assert.deepEqual([0,1,2,3].map(i=>motionContext.bodyMotionFrame('walk',i/6)),['contactA','passingA','contactB','passingB']);
assert.equal(motionContext.bodyMotionFrame('walk',4/6),'contactA');assert.equal(motionContext.bodyMotionFrame('crouch',1),'deep');assert.equal(motionContext.bodyMotionFrame('crouch',3.5),'standing');assert.equal(motionContext.bodyMotionFrame('reach',1),'reach');assert.equal(motionContext.bodyMotionFrame('idle',99),'standing');
const bodyFiles=vm.runInNewContext(html.match(/const bodyFrameFiles=([^;]+);/)[0]+'bodyFrameFiles');
assert.equal(Object.keys(bodyFiles).length,8);
for(const filename of Object.values(bodyFiles)){const png=fs.readFileSync('assets/characters/crew-cast/body-sprites/'+filename);assert(png.readUInt32BE(16)>1000);assert.equal(png.readUInt32BE(16),png.readUInt32BE(20),'Each pose uses a square 4 by 2 source sheet');}
console.log('PASS character motion: phase boundaries, manual modes, closed walk path, four-step sprite playback, reach/crouch and per-cell foot registration');


const registrationPixels=new Uint8ClampedArray(10*10*4);for(const x of [0,2,5,7])for(const y of [4,9])registrationPixels[(y*10+x)*4+3]=255;
let registeredPixels=null;
motionContext.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({data:registrationPixels}),createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:image=>registeredPixels=image.data})})};
motionContext.T={SRGBColorSpace:'srgb',CanvasTexture:class{constructor(image){this.image=image;this.repeat={set:(x,y)=>{this.repeat.x=x;this.repeat.y=y;}};}}};
vm.runInContext(html.match(/function registerBodySheet\(bitmap,split\)\{[\s\S]*?\n\}/)[0],motionContext);
const registered=motionContext.registerBodySheet({width:10,height:10},.56);
assert.equal(registered.image.width,20);assert.equal(registered.image.height,12);
assert.equal(registeredPixels.filter((v,i)=>i%4===3&&v===255).length,8,'Eight distinct components retained without contamination');
for(let row=0;row<2;row++)for(let col=0;col<4;col++)assert.equal(registeredPixels[((row*6+5)*20+col*5+1)*4+3],255,'Shared baseline and original horizontal anchor retained');
// A connected reaching limb crosses its original cell boundary; it must stay
// with its owner, while the adjacent character gets no detached hand fragment.
const reachPixels=registrationPixels.slice();reachPixels[(4*10+1)*4+3]=255;reachPixels[(4*10+2)*4+3]=255;reachPixels[(2*10+3)*4+3]=255;
registrationPixels.set(reachPixels);motionContext.registerBodySheet({width:10,height:10},.56);
assert.equal(registeredPixels[(5*20+3)*4+3],255,'Cross-cell limb kept with connected figure');
assert.equal(registeredPixels[(5*20+6)*4+3],0,'Neighbor does not inherit detached limb');
console.log('PASS body registration: odd dimensions, unequal row bands, foot baseline, preserved pixel scale and cross-cell limb isolation');
