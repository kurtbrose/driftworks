'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const neutral=new Uint8ClampedArray(512*512*4).fill(128);
for(let i=3;i<neutral.length;i+=4)neutral[i]=255;
neutral.set([255,255,255,255,30,30,30,255]);
const tiles=[],context={quadraticCurveTo(){},strokeRect(){},fillRect(){},bezierCurveTo(){},stroke(){},arc(){},save(){},restore(){},translate(){},beginPath(){},moveTo(){},lineTo(){},rect(){},closePath(){},fill(){},fillText(){},drawImage(){},getImageData(){return {data:neutral};},createImageData(){return {data:new Uint8ClampedArray(neutral.length)};},putImageData(tile,x,y){if(x>=2048&&y>=2048)tiles.push({data:tile.data,x,y});}};
let canvases=0;
const sandbox={console:{info(){}},performance:{now(){return 0;}},document:{createElement(){canvases++;return {getContext(){return context;}};}}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('assets/ships/industrial-kit/cargo-paint.js','utf8').replace(/^export /gm,'')+'\nglobalThis.paint={prepareCargoAtlas,cargoPalette,cargoSeed,cargoVariant,tankerOperator,tankerPaintPixel,tankerBands};',sandbox);
const image={};sandbox.paint.prepareCargoAtlas(image);sandbox.paint.prepareCargoAtlas(image);
assert.equal(canvases,1,'prepare once per downloaded source image');assert.equal(tiles.length,8);
assert.equal(new Set(tiles.map(t=>t.x+','+t.y)).size,8,'separate recipe regions');
const colors=new Set();
for(const tile of tiles){
 assert.deepEqual(Array.from(tile.data.slice(0,4)),[255,255,255,255],'white stencils stay white');
 assert.deepEqual(Array.from(tile.data.slice(4,8)),[30,30,30,255],'dark hardware stays neutral');
 colors.add(Array.from(tile.data.slice(8,11)).join(','));
 assert(tile.x>=2048&&tile.x+512<=4096&&tile.y>=2048&&tile.y+512<=3072,'use existing blank atlas area');
}
assert.equal(colors.size,8,'eight distinct painted finishes from one neutral source');
console.log('Cargo paint: eight distinct recipes, neutral stencils/hardware, bounded atlas regions and one-time preparation pass.');

const {cargoSeed,cargoVariant}=sandbox.paint,loads=[];let bold=0,total=0;
for(let ship=0;ship<30;ship++){
 const seed=cargoSeed('cargo-'+String(ship+1).padStart(2,'0')),load=Array.from({length:24},(_,slot)=>cargoVariant(seed,slot));
 assert.deepEqual(load,Array.from({length:24},(_,slot)=>cargoVariant(seed,slot)),'stable per ship and box');
 assert(load.every(v=>Number.isInteger(v)&&v>=0&&v<8));
 bold+=load.filter(v=>v===2||v===3).length;total+=load.length;loads.push(load.join(','));
}
assert.equal(new Set(loads).size,30,'thirty ships get thirty distinct box combinations');
assert(bold/total>.18&&bold/total<.32,'bold paint averages one quarter without quotas per ship');
console.log('Cargo recipes: thirty stable distinct loads and approximately one-quarter bold boxes pass.');

for(let seed=0;seed<100;seed++){
 const pods=Array.from({length:4},(_,pod)=>sandbox.paint.tankerOperator(seed,pod));
 assert(pods[0]===pods[1]&&pods[1]===pods[2],'three pods always share fleet livery');
 assert(pods.every(v=>v>=0&&v<4));
}
console.log('Tanker operators: coherent fleet colors with occasional replacement pod pass.');

for(const pixel of [[24,28,30],[177,128,51],[250,250,249],[100,105,104]])assert.deepEqual(Array.from(sandbox.paint.tankerPaintPixel(...pixel,[160,190,210])),pixel,'non-beige markings retain exact RGB');
assert.notDeepEqual(Array.from(sandbox.paint.tankerPaintPixel(198,200,188,[160,190,210])),[198,200,188],'beige paint changes');

const fringe=Array.from(sandbox.paint.tankerPaintPixel(190,178,145,[160,190,210]));
assert(fringe[2]>fringe[0],'warm blended seam fringes follow the new cool paint instead of staying beige');

const bands=sandbox.paint.tankerBands;
assert.equal(bands[0].heads.length+bands[0].barrel.length,0,'one fleet has no colored bands');
assert.equal(new Set(bands.map(b=>JSON.stringify(b))).size,4,'each fleet has a different band treatment');
for(const profile of bands)for(const [x,width] of profile.barrel)assert(x+width<206||x>920,'bands stay outside the registry and operator text');
