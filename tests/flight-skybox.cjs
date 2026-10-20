const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const shaders = [], values = {}, handlers = {};
const gl = new Proxy({
  createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}), createTexture: () => ({}),
  getShaderParameter: () => true, getProgramParameter: () => true,
  shaderSource: (_shader, source) => shaders.push(source),
  getUniformLocation: (_program, name) => name,
  uniform1f: (name, value) => { values[name] = value; }, getAttribLocation: () => 0
}, { get: (target, key) => key in target ? target[key] : () => {} });
const selector = {value: '', children: [], appendChild(option) { this.children.push(option); }, addEventListener(name, fn) { handlers[name] = fn; }};
const brightness = {value: '1', addEventListener(name, fn) { this[name] = fn; }};
const quality = {value: '1.5', addEventListener(name, fn) { this[name] = fn; }};
const canvas = {dataset:{},width: 0, height: 0, setAttribute() {}, getContext: () => gl};
let stored = '3';
const context = {window: {Driftworks: {}, devicePixelRatio: 2, localStorage: {getItem: () => stored, setItem: (_key, value) => { stored = value; }}}, document: {getElementById: id => ({'skybox-style': selector, 'skybox-brightness': brightness, 'skybox-quality': quality}[id] || null), createElement: name => name === 'canvas' ? canvas : {}}, Image: class {}, Float32Array};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../experiments/skybox.js'), 'utf8'), context);
const sky = context.window.Driftworks.flightSkybox.create({clientWidth: 800, clientHeight: 600, prepend() {}});
const pose = {right: [1,0,0], up: [0,0,1], back: [0,-1,0]};
assert.equal(selector.children.length, 10);
assert.equal(selector.value, '3', 'restores the selected flight sky');
sky.render(pose, 1, false);
assert.equal(values.style, 3);
assert.equal(canvas.width, 2400);
selector.value = '6'; handlers.change();
sky.render(pose, .25, false);
assert.equal(values.style, 6, 'selection reaches the sky shader');
assert.equal(stored, '6');
assert.equal(canvas.width, 2400, 'sky stays sharp when scene resolution drops');
assert.equal(values.pixelRatio, 3);
assert.ok(shaders.find(source => source.includes('gl_PointSize=(0.75+star.w*1.05)*pixelRatio')), 'star size does not depend on depth or focal length');
brightness.value='2'; brightness.input();
quality.value='1'; quality.change(); sky.render(pose, .25, false);
assert.equal(values.exposure, 2, 'brightness reaches the sky independently of star brightness');
assert.equal(canvas.width,1600,'native quality uses display resolution');
assert.equal(values.pixelRatio,2,'point footprint tracks backing pixels to preserve CSS size');
quality.value='2'; quality.change(); sky.render(pose, .25, false);
assert.equal(canvas.width,2400,'supersampling respects the sky pixel budget cap');
selector.value = '99'; handlers.change(); sky.render(pose, 1, false);
assert.equal(values.style, 0, 'invalid choices recover to the original sky');
sky.render(pose, 1, true);
assert.equal(sky.getRenderStats().points, 0, 'empty comparison still hides the sky');
console.log('PASS flight skybox: selection, persistence, native resolution and fixed star sizes');

async function testHeroComposition() {
  const layout=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../assets/backgrounds/hero-layout-v1.json'),'utf8'));
  let requests=0;
  context.URL=URL;
  context.window.location={href:'http://localhost:8000/experiments/flight.html'};
  context.window.fetch=async () => {requests++;return {ok:true,json:async()=>layout};};
  context.window.localStorage.getItem=()=>null;
  const imageUrls=[];
  context.Image=class {set src(value){imageUrls.push(value);queueMicrotask(()=>this.onload());}};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../experiments/skybox.js'),'utf8'),context);
  selector.children.length=0;
  const api=context.window.Driftworks.flightSkybox;
  const renderer=api.create({clientWidth:800,clientHeight:600,prepend(){}});
  assert.equal(selector.value,'7','new installations start with the authored hero composition');
  renderer.render(pose,1,false);
  await new Promise(setImmediate);
  renderer.render(pose,1,false);
  assert.equal(renderer.getRenderStats().drawCalls,3,'one focal feature plus black and crisp stars');
  assert.equal(requests,1,'layout is loaded once, not regenerated per frame');
  assert.equal(imageUrls.filter(url=>url.includes('/features/')).length,4,'unique landmarks share four source textures');
  for(const choice of ['8','9']){selector.value=choice;handlers.change();renderer.render(pose,1,false);assert.equal(renderer.getRenderStats().drawCalls,choice==='8'?4:3,'nebula landmarks are separate unique features, other families remain isolated');}
  for(const feature of layout.features){
    const frame=api.featureFrame(feature,layout.library[feature.asset].aspect);
    assert.equal(frame.length,30);
    assert.ok(Array.from(frame).every(Number.isFinite));
    const wrapped=api.featureFrame({...feature,yaw:feature.yaw+360},layout.library[feature.asset].aspect);
    frame.forEach((value,i)=>assert.ok(Math.abs(value-wrapped[i])<1e-6,'spherical seam preserves feature placement'));
  }
  const geometry=api.featureFrame({asset:'test',yaw:90,pitch:0,roll:0,widthDeg:20,gain:1},1);
  assert.ok(Math.abs(geometry[1]-1)<1e-6 && geometry[0]>0 && geometry[2]<0,'tangent corners preserve image orientation');
  selector.value='1';handlers.change();renderer.render(pose,1,false);
  assert.equal(renderer.getRenderStats().drawCalls,2,'procedural choices do not draw hero features');
  console.log('PASS hero sky: local asset reuse, fixed layout, sphere seams, orientation and separate star pass');
}
testHeroComposition().catch(error=>{console.error(error);process.exitCode=1;});
