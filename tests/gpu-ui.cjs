'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const resources = [], frames = [], listeners = {};
class Resource {
  constructor() { this.disposals=0; resources.push(this); }
  dispose() { this.disposals++; }
}
class Texture extends Resource { constructor(image) { super(); this.image=image; this.needsUpdate=false; } }
class Geometry extends Resource {
  constructor() { super(); this.attributes={}; }
  setAttribute(key, value) { this.attributes[key]=value; }
  setDrawRange(start, count) { this.count=count; }
}
class Renderer extends Resource {
  constructor(options) { super(); this.canvas=options.canvas; assert.equal(options.antialias,true); }
  setClearColor() {}
  setSize(w,h) { this.canvas.width=w;this.canvas.height=h; }
  render(scene) {
    const mesh=scene.mesh;
    frames.push({count:mesh.geometry.count,data:mesh.geometry.attributes.position.buffer.array.slice(0,mesh.geometry.count*16),material:mesh.material,buffer:mesh.geometry.attributes.position.buffer});
  }
}
const THREE = {
  WebGLRenderer:Renderer,BufferGeometry:Geometry,Texture,DataTexture:Texture,
  Scene:class {add(mesh){this.mesh=mesh;}}, Camera:class {},
  RawShaderMaterial:class extends Resource {constructor(options){super();Object.assign(this,options);}},
  InterleavedBuffer:class {constructor(array,stride){this.array=array;this.stride=stride;}},
  InterleavedBufferAttribute:class {constructor(buffer,size,offset){Object.assign(this,{buffer,size,offset});}},
  Mesh:class {constructor(geometry,material){Object.assign(this,{geometry,material});}},
  GLSL3:'300 es',DoubleSide:2,NormalBlending:1,LinearFilter:1006
};
const context = {fillText(){},getImageData(){return {data:new Uint8ClampedArray(1024*512*4)};}};
const document = {createElement(){return {setAttribute(){},getContext(){return context;},remove(){this.removed=true;}};}};
const window = {THREE,Driftworks:{},devicePixelRatio:1.5,addEventListener(name,cb){listeners[name]=cb;}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiments/gpu-ui.js'),'utf8'),{window,document});
const ui=window.Driftworks.gpuUi.create({appendChild(){}}),p=ui.painter;
ui.begin(800,600);
assert.equal(ui.canvas.width,1200);assert.equal(ui.canvas.height,900);
p.fillStyle='#80c0ff80';p.globalAlpha=.5;p.save();p.translate(100,40);p.rotate(Math.PI/2);p.fillRect(0,0,20,10);p.restore();
p.beginPath();p.arc(200,200,30,0,Math.PI*2);p.stroke();
p.setLineDash([2,3]);p.beginPath();p.arc(300,200,7,0,Math.PI*2);p.stroke();p.setLineDash([]);
p.font='14px monospace';p.fillText('LOCK',20,40);
p.panel(10,400,180,90,8);
const source={width:256,height:128};p.image(source,600,400,100,50,0,true);
ui.end();
const first=frames.at(-1),data=first.data;
assert.ok(Array.from(data).every(Number.isFinite));
assert.ok(Math.abs(data[0]-101)<.001&&Math.abs(data[1]-39)<.001,'local rotation/translation reaches screen coordinates');
assert.ok(Math.abs(data[13]-(128/255)*.5)<.001,'style and global alpha multiply');
const kinds=new Set(Array.from({length:first.count},(_,i)=>data[i*16+6]));
for(const kind of [0,1,2,3])assert.ok(kinds.has(kind),'shape/glyph/image modes share one submission');
assert.equal(first.material.glslVersion,'300 es','derivatives use WebGL2 GLSL');
assert.ok(first.material.fragmentShader.includes('fwidth'));
assert.ok(first.material.fragmentShader.includes('out vec4 outColor'));
assert.ok(first.material.fragmentShader.includes('textureLod(atlas'),'glyph sampling uses deterministic atlas level');
assert.equal(first.material.depthTest,false,'HUD does not depend on scene depth');
assert.equal(first.material.forceSinglePass,true,'transparent UI preserves one painter-ordered pass');
for(let i=0;i<first.count;i++)if(data[i*16+6]===2)assert.ok(data[i*16+7]>0,'glyph coverage carries its scale instead of differentiating neighboring samples');
const image=first.material.uniforms.monitor.value;image.needsUpdate=false;
for(let i=0;i<60;i++){ui.begin(800,600);p.image(source,0,0,100,50,0,false);ui.end();}
assert.equal(image.needsUpdate,false,'throttled WebGL previews retain their last uploaded frame');
assert.equal(frames.at(-1).buffer,first.buffer,'ordinary frames reuse geometry');
assert.equal(ui.stats().textures,3,'one cached texture per source');
ui.begin(800,600);ui.end();assert.equal(frames.at(-1).count,0,'empty frames clear stale HUD geometry');
window.devicePixelRatio=2;ui.begin(640,360);assert.equal(ui.canvas.width,1280);assert.equal(ui.canvas.height,720);
listeners.pagehide({persisted:true});assert.ok(!ui.canvas.removed,'BFCache retains live resources');
ui.dispose();ui.dispose();assert.ok(ui.canvas.removed);
assert.ok(resources.every(resource=>resource.disposals===1),'GPU resources disposed exactly once');
console.log('PASS GPU UI: analytic shapes, GLSL3 SDF text, transforms, alpha, reusable buffers, DPR, throttled image uploads, empty frames and lifecycle');

// Compare the entire submitted buffer with the previous allocating quad oracle,
// including transformed glyphs/images and growth past the initial capacity.
const currentSource=fs.readFileSync(path.join(__dirname,'../experiments/gpu-ui.js'),'utf8');
const quadStart=currentSource.indexOf('        function quad('),quadEnd=currentSource.indexOf('        /** @param {string | CanvasGradient',quadStart);
assert.ok(quadStart>0&&quadEnd>quadStart);
const oracleSource=currentSource.slice(0,quadStart)+`
        function quad(x,y,hw,hh,params,tint,uv,angle) {
            uv=uv||[0,0,1,1];var pad=params[0]<2?1+params[2]*.5:0,co=Math.cos(angle||0),si=Math.sin(angle||0);
            [[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]].forEach(function(c){var lx=c[0]*(hw+pad),ly=c[1]*(hh+pad);vertexAt(point(x+co*lx-si*ly,y+si*lx+co*ly),[lx,ly],[hw,hh],params,tint,[uv[0]+(c[0]+1)*.5*(uv[2]-uv[0]),uv[1]+(c[1]+1)*.5*(uv[3]-uv[1])]);});
        }
`+currentSource.slice(quadEnd);
function submitted(code){
 const w={...window,Driftworks:{}};vm.runInNewContext(code,{window:w,document});
 const u=w.Driftworks.gpuUi.create({appendChild(){}}),p=u.painter;
 u.begin(1280,720);p.translate(13.7,29.3);p.rotate(.731);p.globalAlpha=.47;
 p.fillStyle='#8cf9';p.strokeStyle='rgba(20,40,60,.7)';p.lineWidth=2.3;
 p.font='17px monospace';p.textAlign='center';p.fillText('Alpha / TARGET 123',100,70);
 p.panel(50,90,180,70,8);p.image(source,10,10,30,40,1);
 p.beginPath();p.moveTo(0,0);p.lineTo(12,3);p.lineTo(-7,20);p.closePath();p.fill();p.stroke();
 for(let i=0;i<6000;i++)p.fillRect(i%120,i/120,3.1,2.7);
 u.end();const data=frames.at(-1).data;assert.ok(u.stats().capacity>32768);u.dispose();return data;
}
const optimizedData=submitted(currentSource),oracleData=submitted(oracleSource);
assert.deepEqual(Buffer.from(optimizedData.buffer),Buffer.from(oracleData.buffer),'Direct writes preserve every submitted float, UV, transform and painter order through buffer growth');
console.log('PASS GPU UI direct-buffer oracle, including capacity growth');

// Joined strokes share one cross-section at each vertex instead of stacking capsules.
const joined=window.Driftworks.gpuUi.create({appendChild(){}}),jp=joined.painter;joined.begin(800,600);jp.lineWidth=2.5;jp.globalAlpha=.4;
jp.beginPath();jp.moveTo(0,0);jp.lineTo(30,0);jp.lineTo(60,10);jp.lineTo(90,15);jp.smoothStroke();joined.end();
const ribbon=frames.at(-1);assert.equal(ribbon.count,18,'Three ribbon spans, one pair of triangles each');
const rv=i=>Array.from(ribbon.data.slice(i*16,i*16+16));
for(let i=0;i<ribbon.count;i++){assert.equal(rv(i)[6],5);assert.ok(Math.abs(rv(i)[13]-.4)<1e-6);assert.ok(rv(i).every(Number.isFinite));}
assert.deepEqual(rv(1),rv(6),'First shared lower join is exactly coincident');assert.deepEqual(rv(5),rv(8),'First shared upper join is exactly coincident');
assert.ok(ribbon.material.fragmentShader.includes('abs(p.y) - s.z * .5'),'Continuous edge coverage replaces per-segment rounded-cap coverage');joined.dispose();
console.log('PASS joined HUD strokes: shared ribbon edges, no capsule overlap, uniform alpha and analytic edge/cap antialiasing');
