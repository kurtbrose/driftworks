const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const shaders = [], values = {}, handlers = {}, mipmaps = [];
const gl = new Proxy({
  createShader: () => ({}), createProgram: () => ({}), createBuffer: () => ({}), createTexture: () => ({}),
  getShaderParameter: () => true, getProgramParameter: () => true,
  shaderSource: (_shader, source) => shaders.push(source),
  getUniformLocation: (_program, name) => name,
  uniform1f: (name, value) => { values[name] = value; }, getAttribLocation: () => 0,
  generateMipmap: target => mipmaps.push(target)
}, { get: (target, key) => key in target ? target[key] : () => {} });
const selector = {value: '', children: [], appendChild(option) { this.children.push(option); }, addEventListener(name, fn) { handlers[name] = fn; }};
const brightness = {value: '1', addEventListener(name, fn) { this[name] = fn; }};
const quality = {value: '1.5', addEventListener(name, fn) { this[name] = fn; }};
const canvas = {dataset:{},width: 0, height: 0, setAttribute() {}, getContext: () => gl};
let stored = '3';
const context = {window: {Driftworks: {}, devicePixelRatio: 2, localStorage: {getItem: () => stored, setItem: (_key, value) => { stored = value; }}}, document: {getElementById: id => ({'skybox-style': selector, 'skybox-brightness': brightness, 'skybox-quality': quality}[id] || null), createElement: name => name === 'canvas' ? canvas : {}}, Image: class {}, Float32Array};
context.URL=URL; context.document.baseURI='http://localhost:8000/experiments/flight.html';
context.document.currentScript={getAttribute:()=> '../src/asset-versions.js'};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../src/asset-versions.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname,'../experiments/flight-missions.js'),'utf8'),context);
vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname,'../experiments/mission-ohio.js'),'utf8'),context);
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../experiments/skybox.js'), 'utf8'), context);
const sky = context.window.Driftworks.flightSkybox.create({clientWidth: 800, clientHeight: 600, prepend() {}});
const pose = {right: [1,0,0], up: [0,0,1], back: [0,-1,0]};
assert.equal(selector.children.length, 12);
assert.equal(selector.value, '3', 'restores the selected flight sky');
sky.render(pose, 1, false);
assert.equal(values.style, 3);
assert.equal(canvas.width, 1600);
selector.value = '6'; handlers.change();
sky.render(pose, .25, false);
assert.equal(values.style, 6, 'selection reaches the sky shader');
assert.equal(stored, '6');
assert.equal(canvas.width, 1600, 'sky defaults to native resolution independently of scene quality');
assert.equal(values.pixelRatio, 2);
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
  const lighting=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'../assets/backgrounds/sky-lighting-v1.json'),'utf8'));
  context.window.fetch=async url => {assert.ok(new URL(url).searchParams.has('v'),'sky manifests carry content versions');requests++;if(new URL(url).pathname.endsWith('.bin'))return {ok:true,arrayBuffer:async()=>{const bytes=fs.readFileSync(require('node:path').join(__dirname,'..',new URL(url).pathname));return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);}};return {ok:true,json:async()=>String(url).includes('sky-lighting')?lighting:layout};};
  context.window.localStorage.getItem=()=>null;
  const imageUrls=[];
  context.Image=class {set src(value){imageUrls.push(value);queueMicrotask(()=>this.onload());}};
  vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname,'../experiments/flight-missions.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname,'../experiments/mission-ohio.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../experiments/skybox.js'),'utf8'),context);
  selector.children.length=0;
  const api=context.window.Driftworks.flightSkybox;
  const renderer=api.create({clientWidth:800,clientHeight:600,prepend(){}});
  assert.equal(selector.value,'7','new installations start with the authored hero composition');
  renderer.render(pose,1,false);
  await new Promise(setImmediate);
  renderer.render(pose,1,false);
  assert.equal(renderer.getRenderStats().drawCalls,3,'one focal feature plus black and crisp stars');
  assert.ok(imageUrls.every(url=>new URL(url).searchParams.has('v')), 'every sky image is content-versioned');
  assert.equal(requests,7,'layout, lighting manifest and five HDR probes are each loaded once');
  assert.equal(renderer.getLighting().radiance.length,512*256*4);
  assert.equal(renderer.getLighting().sh.length,9);
  renderer.setLightingEnabled(false);assert.equal(renderer.getLighting(),null);renderer.setLightingEnabled(true);
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
  renderer.setStyle(8);renderer.setExposure(.75);renderer.render(pose,1,false);assert.equal(values.exposure,.75,'art-review API changes sky exposure independently');
  selector.value='1';handlers.change();renderer.render(pose,1,false);
  assert.equal(renderer.getRenderStats().drawCalls,2,'procedural choices do not draw hero features');
  const second=api.create({clientWidth:800,clientHeight:600,prepend(){}},{style:8});second.render(pose,1,false);await new Promise(setImmediate);second.render(pose,1,false);renderer.setStyle(8);assert.equal(second.getLighting(),renderer.getLighting(),'multiple renderer instances share one precomputed environment cache');assert.equal(requests,8,'second scene loads its layout but reuses lighting and HDR probes');
  second.setStyle(10);second.render(pose,1,false);await new Promise(setImmediate);second.render(pose,1,false);assert.equal(second.getRenderStats().drawCalls,2,'river panorama and crisp foreground stars use two draws');assert.equal(JSON.stringify(second.getLighting().sh),JSON.stringify(lighting.families.river.sh),'stellar streams select their derived lighting');assert.equal(canvas.dataset.river,'ready');assert.ok(imageUrls.some(url=>url.includes('star-river-photo-v3-8k.jpg')),'river uses the local generated photographic texture');
  assert.equal(mipmaps.length,1,'River mipmaps are baked once on texture upload');second.render(pose,1,false);assert.equal(mipmaps.length,1,'No per-frame sky mipmap generation');
  second.setStyle(11);second.render(pose,1,false);await new Promise(setImmediate);second.render(pose,1,false);
  assert.equal(canvas.dataset.woven,'ready');assert.equal(second.getRenderStats().drawCalls,2,'Woven sky stays one baked panorama plus one star batch');
  assert.equal(values.style,11,'Selectable woven style reaches panorama shader without entering mission landmark branch');
  assert.equal(JSON.stringify(second.getLighting().sh),JSON.stringify(lighting.families.woven.sh));
  assert.ok(imageUrls.some(url=>url.includes('star-river-woven-v1-8k.jpg')));
  assert.equal(mipmaps.length,2,'Each distinct panorama uploads once');
  second.setStyle(10);second.render(pose,1,false);second.setStyle(11);second.render(pose,1,false);assert.equal(mipmaps.length,2,'Panoramas cached across selection changes');
  console.log('PASS hero sky: local asset reuse, fixed layout, sphere seams, orientation and separate star pass');
}
async function testOhioSky() {
  const buffers=[], images=[],vectors={},units={},draws=[],blends=[],uploads=[];
  const ohioGl=new Proxy({...gl,bufferData:(_target,data)=>buffers.push(Array.from(data)),uniform3fv:(name,value)=>{vectors[name]=Array.from(value);},uniform1i:(name,value)=>{units[name]=value;},drawArrays:(_mode,_first,count)=>draws.push(count),blendFunc:(...args)=>blends.push(args),texImage2D:(...args)=>uploads.push(args)},{get:(target,key)=>key in target?target[key]:()=>{}});
  const ohioCanvas={...canvas,dataset:{},getContext:()=>ohioGl};
  const ohioContext={...context,window:{...context.window,Driftworks:{},location:{search:'?mission=ohio'},fetch:()=>{throw new Error('Ohio must use bundled images directly');}},
    document:{...context.document,createElement:name=>name==='canvas'?ohioCanvas:{}},
    Image:class {set src(value){images.push(value);queueMicrotask(()=>this.onload&&this.onload());}}};
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../src/asset-versions.js'),'utf8'),ohioContext);
  vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname,'../experiments/flight-missions.js'),'utf8'),ohioContext);
  vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname,'../experiments/mission-ohio.js'),'utf8'),ohioContext);
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../experiments/skybox.js'),'utf8'),ohioContext);
  const renderer=ohioContext.window.Driftworks.flightSkybox.create({clientWidth:800,clientHeight:600,prepend(){}});
  renderer.render(pose,1,false);
  assert.equal(renderer.getRenderStats().drawCalls,2,'Pending images still render black placeholders and stars');
  assert.equal(uploads.filter(args=>args.length===9&&args[3]===1&&args[4]===1&&args[8].length===4&&args[8][3]===0).length,2,'Both compact samplers have complete transparent-black placeholders before decoding');
  draws.length=0;blends.length=0;
  await new Promise(setImmediate);renderer.render(pose,1,false);
  assert.equal(ohioCanvas.dataset.ohio,'ready');
  assert.ok(images.some(url=>new URL(url).pathname.endsWith('/assets/backgrounds/ohio-planet-v1.png')));
  assert.ok(images.some(url=>new URL(url).pathname.endsWith('/assets/backgrounds/features/warm-sun-v1.png')));
  assert.equal(images.length,2,'Ohio only loads the two compact source textures, without an unused panorama');
  assert.equal(buffers.filter(data=>data.length===30).length,0,'Ohio no longer allocates or draws landmark quads');
  const api=ohioContext.window.Driftworks.flightSkybox;
  for(const [prefix,feature] of [['ohioPlanet',{asset:'ohio',yaw:90,pitch:4,roll:0,widthDeg:44,gain:1}],['ohioSun',{asset:'sun',yaw:225,pitch:30,roll:0,widthDeg:7,gain:1}]]){
    const frame=api.featureFrame(feature,1),center=vectors[prefix+'Center'],right=vectors[prefix+'Right'],up=vectors[prefix+'Up'];
    for(let vertex=0;vertex<30;vertex+=5){
      const ray=frame.slice(vertex,vertex+3),dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0),depth=dot(ray,center);
      assert.ok(Math.abs((1-dot(ray,right)/depth)/2-(1-frame[vertex+3]))<1e-5,'Single-pass projection preserves unmirrored image longitude');
      assert.ok(Math.abs((1-dot(ray,up)/depth)/2-frame[vertex+4])<1e-5,'Single-pass projection preserves image latitude');
    }
  }
  const sun=vectors.ohioSunCenter;
  assert.ok(sun[0]<0&&sun[1]<0&&sun[2]>0,'sun remains behind the left shoulder above the plane');
  assert.equal(units.ohioPlanet,2);assert.equal(units.ohioSun,3);
  assert.deepEqual(draws,[6,3200],'Only the opaque fullscreen background and crisp point stars are submitted');
  assert.equal(blends.length,1,'Only the star pass blends; Ohio images compose in the opaque background');
  assert.equal(renderer.getRenderStats().drawCalls,2);
  renderer.render({...pose,right:[-1,0,0],back:[0,1,0]},1,false);
  assert.equal(renderer.getRenderStats().drawCalls,2,'Turning away adds no landmark passes');
  renderer.render(pose,1,true);assert.equal(renderer.getRenderStats().drawCalls,0,'Empty comparison still skips the entire sky');
  console.log('PASS Ohio sky: two compact images in one opaque sky draw, identical geographic UVs and sun bearing, separate crisp stars');
}

testHeroComposition().then(testOhioSky).catch(error=>{console.error(error);process.exitCode=1;});

const pathLighting=require('node:path'),cryptoLighting=require('node:crypto');
const layoutPath=pathLighting.join(__dirname,'../assets/backgrounds/hero-layout-v1.json');
const layoutLighting=JSON.parse(fs.readFileSync(layoutPath,'utf8'));
const sourceLighting=Buffer.concat([fs.readFileSync(layoutPath),...Object.values(layoutLighting.library).map(asset=>fs.readFileSync(pathLighting.join(pathLighting.dirname(layoutPath),asset.file))),...Object.values(layoutLighting.extraImages || {}).map(file=>fs.readFileSync(pathLighting.join(pathLighting.dirname(layoutPath),file)))]);
const bakedLighting=JSON.parse(fs.readFileSync(pathLighting.join(__dirname,'../assets/backgrounds/sky-lighting-v1.json'),'utf8'));
assert.equal(cryptoLighting.createHash('sha256').update(sourceLighting).digest('hex'),bakedLighting.sourceHash,'rebake sky lighting after changing the layout or art');
for(const [key,file] of [['processorHash','bake-sky-lighting.py'],['composerHash','compose-skybox.py']])assert.equal(cryptoLighting.createHash('sha256').update(fs.readFileSync(pathLighting.join(__dirname,'../tools',file))).digest('hex'),bakedLighting[key],'rebake lighting after changing its preprocessing');
for(const probe of Object.values(bakedLighting.families)){
  assert.equal(probe.sh.length,9);assert.ok(probe.sh.every(color=>color.length===3&&color.every(Number.isFinite)));
  const image=fs.readFileSync(pathLighting.join(__dirname,'../assets/backgrounds',probe.map));
  assert.equal(image.readUInt32BE(16),512);assert.equal(image.readUInt32BE(20),256);
  const hdr=fs.readFileSync(pathLighting.join(__dirname,'../assets/backgrounds',probe.radiance));
  assert.equal(hdr.length,512*256*4*4);
  let maximum=0;
  for(let i=0;i<hdr.length;i+=16){for(let channel=0;channel<3;channel++){const value=hdr.readFloatLE(i+channel*4);assert.ok(Number.isFinite(value)&&value>=0);maximum=Math.max(maximum,value);}assert.equal(hdr.readFloatLE(i+12),1);}
  assert.ok(maximum>1,'Native PMREM receives unclipped normalized HDR energy');
}
console.log('PASS sky lighting assets: source hash, finite diffuse SH and power-of-two reflection maps');
