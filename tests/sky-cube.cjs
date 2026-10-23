'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'../assets/backgrounds/planet-hero-orbital-v2'),manifest=JSON.parse(fs.readFileSync(path.join(root,'cube-v1/manifest.json'))),names=['px','nx','py','ny','pz','nz'];
assert.equal(manifest.projection,'six-perspective-cameras');assert.equal(manifest.fovDegrees,90);assert.deepEqual(manifest.origin,[0,0,0]);assert.equal(manifest.flipY,false);
assert.equal(manifest.recipeSha256,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'cube-recipe.json'))).digest('hex'));
const expected=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const edges=[];
for(const [index,name] of names.entries()){
 const face=manifest.faces[name],bytes=fs.readFileSync(path.join(root,'cube-v1',face.file));assert.equal(bytes.readUInt32BE(16),1024);assert.equal(bytes.readUInt32BE(20),1024);assert.deepEqual(face.forward,expected[index]);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),face.sha256);
 const ray=(x,y)=>face.forward.map((v,i)=>v+x*face.right[i]+y*face.imageTop[i]);
 for(const axis of [0,1])for(const sign of [-1,1])edges.push([-1,0,1].map(t=>ray(axis? t:sign,axis?sign:t)));
}
let pairs=0;const key=e=>JSON.stringify(e.map(v=>v.map(n=>n||0)));
for(let i=0;i<edges.length;i++){const matches=edges.filter((e,j)=>i!==j&&(key(e)===key(edges[i])||key([...e].reverse())===key(edges[i])));assert.equal(matches.length,1,'each camera edge has one identical adjacent ray sequence');pairs++;}assert.equal(pairs/2,12);
const values={},requests=[],uploads=[],gl=new Proxy({createShader:()=>({}),createProgram:()=>({}),createBuffer:()=>({}),createTexture:()=>({}),getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:(_,n)=>n,getAttribLocation:()=>0,uniform1f:(n,v)=>values[n]=v,uniform1i:(n,v)=>values[n]=v,texImage2D:(...a)=>uploads.push(a)}, {get:(o,k)=>k in o?o[k]:()=>{}});
const canvas={dataset:{},setAttribute(){},getContext:()=>gl},pending=[];
const context={window:{Driftworks:{assetUrl:s=>s},location:{search:'?mission=planet-orbital-static'},devicePixelRatio:1},document:{getElementById:()=>null,createElement:()=>canvas},Image:class{set src(s){requests.push(s);this.width=this.height=1024;pending.push(this);}},Float32Array,Uint8Array};
for(const file of ['flight-missions','skybox'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiments/'+file+'.js'),'utf8'),context);
const DW=context.window.Driftworks,mission=DW.flightMissions.current();assert.equal(mission.sky.cubeFaces.length,6);assert.equal(mission.emptySpace,true);
const sky=DW.flightSkybox.create({clientWidth:800,clientHeight:600,prepend(){}},{fov:140,cueControls:false});assert.equal(requests.length,6,'cube mission loads six bakes, never source sprites');for(const face of names)assert.ok(requests.some(s=>s.endsWith('/'+face+'.png')));pending.forEach(image=>image.onload());assert.equal(canvas.dataset.cube,'ready');
sky.render({eye:[1000,2000,3000],right:[1,0,0],up:[0,0,1],back:[0,-1,0]},1,false);assert.equal(values.style,22);assert.equal(values.bakedCube,5);assert.notEqual(values.bakedCube,values.hdrEnvironment,'cube and HDR samplers must never alias texture units');assert.equal(uploads.filter(a=>pending.includes(a.at(-1))).length,6);
console.log('PASS six-camera skybox: manifest, source hash, six square faces, axis bearings, 12 shared edge ray sequences and cube-only runtime loading');
