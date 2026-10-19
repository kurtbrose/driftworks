const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const controls = new Map();
for(const id of ['view-side','view-front','view-top','reference','reset-views','viewer','cockpit','breadth','depth','spread','markings','readout','quarter','top','side','reset']) controls.set(id,{value:'100',checked:true,clientWidth:900,clientHeight:700,addEventListener(){},removeEventListener(){}});
let batches,frame;
const scenes=[];
function createScene(){const scene={renders:0,pose:{},setStudyActors(value){batches=value;},setStudyEffects(){},setOrbit(pose){this.pose=pose;},getOrbit(){return this.pose;},sync(){},render(){this.renders++;}};scenes.push(scene);return scene;}
const context={window:{Driftworks:{sim:{createInitialWorld:()=>({combat:{}}),METERS_PER_UNIT:10},scene3d:{create:createScene},shipPackModels:{find:()=>({model:{vertices:[0,-1,0,0,0,1,0,1,0,0,0,1]}}),detailedGeometry:()=>[]}}},document:{getElementById:id=>controls.get(id)},requestAnimationFrame(fn){frame=fn;},Float32Array};
vm.createContext(context);
for(const file of ['src/study-viewer.js','src/mesh-builder.js','assets/characters/fighter-cockpit.js','experiments/fighter-greybox.js']) vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),context);
assert.ok(batches.every(b=>Array.from(b.vertices).every(Number.isFinite)));
const armor=Array.from(batches[0].vertices);
function widthAt(y){const xs=[];for(let i=0;i<armor.length;i+=6) if(Math.abs(armor[i+1]*10-y)<.01) xs.push(Math.abs(armor[i]*10));return Math.max(...xs);}
assert.ok(widthAt(5.5)>widthAt(-5)*1.5,'crew pod is broad and tail tapers');
const dark=Array.from(batches[1].vertices);let lowGun=false;
for(let i=0;i<dark.length;i+=6) if(dark[i+1]>.85 && dark[i+2]<-.17 && Math.abs(dark[i])<.03) lowGun=true;
assert.ok(lowGun,'single centerline barrel projects forward below crew');
controls.get('breadth').value='140';controls.get('breadth').oninput();
assert.notDeepEqual(Array.from(batches[0].vertices),armor);
controls.get('reset').onclick();assert.deepEqual(Array.from(batches[0].vertices),armor);
console.log('PASS fighter greybox: finite loft, broad crew pod, tapering tail, low centerline gun and reset');

assert.equal(batches[batches.length-1].opacity,.12,'transparent glazing is drawn after opaque crew');
assert.ok(batches.length>10,'both imported crews and chairs are present');

const glass=batches[batches.length-1].vertices;
let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
for(let i=0;i<glass.length;i+=6){minX=Math.min(minX,glass[i]*10);maxX=Math.max(maxX,glass[i]*10);minY=Math.min(minY,glass[i+1]*10);maxY=Math.max(maxY,glass[i+1]*10);}
assert.ok(maxX-minX<2.2 && maxY-minY<2.1,'canopy is fitted to a snug two-seat crew envelope');

function xBounds(batch){let low=Infinity,high=-Infinity;for(let i=0;i<batch.vertices.length;i+=6){low=Math.min(low,batch.vertices[i]*10);high=Math.max(high,batch.vertices[i]*10);}return {center:(low+high)/2,width:high-low};}
const cockpit=context.window.Driftworks.fighterCockpit, rightChair=4+cockpit.chair.length+cockpit.crew.length;
const left=xBounds(batches[4]),right=xBounds(batches[rightChair]);
assert.ok(Math.abs(right.center-left.center-1.1)<1e-5,'chairs use helicopter-like spacing');
controls.get('breadth').value='70';controls.get('breadth').oninput();
const narrowLeft=xBounds(batches[4]),narrowRight=xBounds(batches[rightChair]);
assert.ok(Math.abs(narrowLeft.width-left.width)<1e-5,'chairs retain human scale');
assert.ok(narrowRight.center-narrowLeft.center>left.width,'minimum breadth preserves chair clearance');
controls.get('reset').onclick();

assert.equal(scenes.length,4,'four independent panel scenes');
frame(1000);assert.ok(scenes.every(scene=>scene.renders===1));
frame(1100);assert.ok(scenes.every(scene=>scene.renders===1),'idle panels do not redraw');
scenes[3].setOrbit({yaw:.8,tilt:1});frame(1200);
assert.deepEqual(scenes.map(scene=>scene.renders),[1,1,1,2],'orbit interaction redraws only its panel');

controls.get('reference').checked=false;controls.get('reference').onchange();
let hullWidth=0;
for(const batch of batches.slice(0,4))for(let i=0;i<batch.vertices.length;i+=6)hullWidth=Math.max(hullWidth,Math.abs(batch.vertices[i]*10)*2);
assert.ok(hullWidth<3.3,'integrated engine shoulders replace the broad outriggers');
controls.get('spread').value='140';controls.get('spread').oninput();
let wide=0;for(const batch of batches.slice(0,4))for(let i=0;i<batch.vertices.length;i+=6)wide=Math.max(wide,Math.abs(batch.vertices[i]*10)*2);
assert.ok(wide<3.7 && wide>hullWidth,'engine width control keeps shoulders close to the spine');
controls.get('reset').onclick();
