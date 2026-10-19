const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const scenes=[],observers=[];
function host(){const listeners={};return {clientWidth:800,clientHeight:600,addEventListener:(key,fn)=>listeners[key]=fn,removeEventListener:key=>delete listeners[key],interact:()=>listeners['viewer-interaction']()};}
const model={vertices:[0,-2,0,0,0,1,0,2,0,0,0,1]};
let referenceArgs;
const DW={scene3d:{create(h,get,set){const scene={setOrbit(pose){scene.pose=pose;},get,set};scenes.push(scene);return scene;}},shipPackModels:{find:()=>({model}),detailedGeometry:(m,poses,units)=>{referenceArgs={m,poses,units};return [];}}};
const context={window:{Driftworks:DW},ResizeObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/study-viewer.js'),'utf8'),context);
const api=DW.studyViewer,ha=host(),hb=host();
function create(h,id){return api.createView({id,host:h,world:{camera:{x:0,y:0,zoom:1}},pose:{yaw:id==='side'?Math.PI/2:0,tilt:1},fit:view=>view.world().camera.zoom=h.clientWidth/100});}
const a=create(ha,'side'),b=create(hb,'top');
assert.equal(a.world().camera.zoom,8);assert.notEqual(a.world(),b.world());
ha.interact();ha.clientWidth=400;a.fit();assert.equal(a.world().camera.zoom,8,'manual camera survives auto-fit');
hb.clientWidth=300;observers[1].fn();assert.equal(b.world().camera.zoom,3,'other panel resizes independently');
a.reset();assert.equal(a.manual,false);assert.equal(a.world().camera.zoom,4);assert.equal(scenes[0].pose.yaw,Math.PI/2);
const replacement={camera:{x:5,y:0,zoom:1}};scenes[0].set(replacement);assert.equal(a.world(),replacement,'world replacements remain owned by their panel');
a.dispose();assert.ok(observers[0].disconnected);
api.referenceFighter(12,10,[1,2,3],-Math.PI/2);
assert.equal(referenceArgs.units,4*10/12);assert.deepEqual(Array.from(referenceArgs.poses[0].eye),[1,2,3]);
assert.ok(Math.abs(referenceArgs.poses[0].right[1]+1)<1e-10,'mining reference orientation is preserved');
console.log('PASS study viewer: independent worlds, manual framing, resize/reset, cleanup and physical reference scale');
