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

const helmetContext=vm.createContext({T});
for(const name of ['roundedHelmetShape','createHelmetTunnel','createHelmetArmor'])vm.runInContext(html.match(new RegExp('function '+name+'\\([^\\n]+'))[0],helmetContext);
const tunnel=new T.Mesh(vm.runInContext('createHelmetTunnel()',helmetContext),new T.MeshBasicMaterial({side:T.DoubleSide}));
const panel=new T.Mesh(new T.PlaneGeometry(.21,.26),new T.MeshBasicMaterial());panel.position.set(0,.125,.074);panel.updateMatrixWorld(true);tunnel.updateMatrixWorld(true);
const center=new T.Vector3(0,.125,.074);
function helmetRay(origin){return new T.Raycaster(origin,center.clone().sub(origin).normalize()).intersectObjects([panel,tunnel]);}
assert.equal(helmetRay(new T.Vector3(0,.125,1))[0].object,panel,'Portrait visible through the front opening');
assert.equal(helmetRay(new T.Vector3(1,.125,.14))[0].object,tunnel,'Opaque tunnel physically occludes the portrait from the side');
actor.face.portraitMap={offset:{x:0}};actor.person={voiceIndex:0};actor.talk=0;poseFace(actor,0);const faceNeutral=actor.face.portraitMap.offset.x;
poseFace(actor,4500);assert(actor.face.portraitMap.offset.x>faceNeutral,'Helmet uses original blink frame');actor.talk=1;poseFace(actor,200);assert(actor.face.portraitMap.offset.x>faceNeutral&&actor.face.portraitMap.offset.x<1,'Helmet uses original talking frames');
console.log('PASS helmet portraits: front aperture, real side-wall occlusion, original blink/talking poses and animated head attachment');

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
