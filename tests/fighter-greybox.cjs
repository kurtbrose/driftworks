const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const controls = new Map();
for(const id of ['sky','asteroid','view-side','view-front','view-top','reference','reset-views','viewer','rear','cockpit','breadth','depth','spread','markings','readout','quarter','top','side','reset']) controls.set(id,{value:'100',checked:true,clientWidth:900,clientHeight:700,querySelector(){return null;},addEventListener(){},removeEventListener(){}});
let batches,frame;
const scenes=[],skies=[];
function createScene(host,getWorld,setWorld,options){const scene={options,renders:0,pose:{},setStudyActors(value){batches=value;},setStudyEffects(){},setOrbit(pose){this.pose=pose;},getOrbit(){return this.pose;},sync(world){this.world=world;},render(){this.renders++;}};scenes.push(scene);return scene;}
const context={URLSearchParams,window:{addEventListener(){},location:{search:'',origin:'http://localhost:8000'},Driftworks:{sim:{createInitialWorld:()=>({combat:{},asteroids:[{position:{x:0,y:0},radius:1}]}),METERS_PER_UNIT:10},flightSkybox:{create:()=>{const sky={render(pose,scale,empty){this.empty=empty;this.pose=pose;}};skies.push(sky);return sky;}},scene3d:{create:createScene,asteroidMesh:()=>new Float32Array([0,0,1,0,0,1]),view:()=>({right:[1,0,0],up:[0,0,1],back:[0,1,0]})},shipPackModels:{find:()=>({model:{vertices:[0,-1,0,0,0,1,0,1,0,0,0,1]}}),detailedGeometry:()=>[]}}},document:{getElementById:id=>controls.get(id)},requestAnimationFrame(fn){frame=fn;},Float32Array};
vm.createContext(context);
for(const file of ['src/study-viewer.js','src/mesh-builder.js','assets/characters/fighter-cockpit.js','experiments/fighter-greybox.js']) vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..',file),'utf8'),context);
assert.ok(batches.every(b=>Array.from(b.vertices).every(Number.isFinite)));
const armor=Array.from(batches[0].vertices);
const aLengthScale=(15.62*.75-2.9)/12.47;
function widthAt(y){if(y<3.35)y=3.35+(y-3.35)*aLengthScale;const xs=[];for(let i=0;i<armor.length;i+=6) if(Math.abs(armor[i+1]*10-y)<.01) xs.push(Math.abs(armor[i]*10));return Math.max(...xs);}
assert.ok(widthAt(-5)>widthAt(2)*.9 && widthAt(-5)<widthAt(2),'aft body keeps nearly the crew pod breadth');
assert.ok(widthAt(-8.98)>1,'full aft shoulders reach just behind the upper nozzle lips');
const dark=Array.from(batches[1].vertices);let lowGun=false;
for(let i=0;i<dark.length;i+=6) if(dark[i+1]>.61 && dark[i+2]<-.065 && dark[i+2]>-.09 && Math.abs(dark[i])<.03) lowGun=true;
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
assert.ok(maxX-minX<2.05 && maxY-minY<2.25,'canopy is fitted to a snug two-seat crew envelope');

function xBounds(batch){let low=Infinity,high=-Infinity;for(let i=0;i<batch.vertices.length;i+=6){low=Math.min(low,batch.vertices[i]*10);high=Math.max(high,batch.vertices[i]*10);}return {center:(low+high)/2,width:high-low};}
const cockpit=context.window.Driftworks.fighterCockpit, rightChair=4+cockpit.chair.length+cockpit.crew.length;
let chairBack=Infinity;for(let i=1;i<batches[4].vertices.length;i+=6)chairBack=Math.min(chairBack,batches[4].vertices[i]*10);
assert.ok(chairBack>3.6 && chairBack<3.64,'seat backs sit just clear of the rear bulkhead');
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
assert.ok(wide<=3.2,'triangle spacing stays inside the original hatch width');
controls.get('reset').onclick();

const wrap=batches[batches.length-1].vertices;
let lowSide=false,lowNose=false,rearQuarter=false;
for(let i=0;i<wrap.length;i+=6){const x=wrap[i]*10,y=wrap[i+1]*10,z=wrap[i+2]*10;if(Math.abs(x)>.9 && z<0)lowSide=true;if(y>5.5 && z<-.35)lowNose=true;if(y<3.65 && z>.65)rearQuarter=true;}
assert.ok(lowSide && lowNose && rearQuarter,'glazing reaches low side, nose and rear-quarter sightlines');

// Hull sightline regressions: the armored hood must not return in front of the eyes.
function hullBlocks(origin,direction){
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((sum,v,k)=>sum+v*b[k],0),sub=(a,b)=>a.map((v,k)=>v-b[k]);
 const data=batches[0].vertices;
 for(let i=0;i<data.length;i+=18){
  const a=Array.from(data.slice(i,i+3),v=>v*10),b=Array.from(data.slice(i+6,i+9),v=>v*10),c=Array.from(data.slice(i+12,i+15),v=>v*10);
  const e1=sub(b,a),e2=sub(c,a),p=cross(direction,e2),det=dot(e1,p);if(Math.abs(det)<1e-8)continue;
  const t=sub(origin,a),u=dot(t,p)/det,q=cross(t,e1),v=dot(direction,q)/det,d=dot(e2,q)/det;
  if(u>=0 && v>=0 && u+v<=1 && d>.01)return true;
 }return false;
}
for(const sign of [-1,1])for(const direction of [[0,1,0],[sign,0,0],[0,1,-.5],[sign,-1,.1]])assert.equal(hullBlocks([sign*.55,4.2,.6],direction),false,'clear forward, lateral, downward and rear-quarter hull sightlines');

for(const y of [3.3,4.2,5.3,5.45])assert.ok(hullBlocks([0,y,0],[0,0,-1]),'continuous armored cockpit floor supports the canopy');
assert.ok(hullBlocks([0,3.3,-1.05],[0,-1,0]),'cockpit tub overlaps the aft spine');

let minCabin=Infinity,maxCabin=-Infinity;
for(let i=2;i<wrap.length;i+=6){minCabin=Math.min(minCabin,wrap[i]*10);maxCabin=Math.max(maxCabin,wrap[i]*10);}
assert.ok(Math.abs((minCabin+maxCabin)/2)<.1,'cockpit envelope sits on the fuselage axis');
let edgeLow=Infinity;for(let i=2;i<batches[2].vertices.length;i+=6)edgeLow=Math.min(edgeLow,batches[2].vertices[i]*10);
assert.ok(edgeLow>-1.25,'no deep hanging gun box or external tail fin');

assert.ok(controls.get('readout').textContent.includes('2.2 m high'),'readout reports the complete hatch clearance envelope');

assert.ok(hullBlocks([0,3.34,.6],[0,-1,0]),'full-height fuselage reaches the rear of the seated cabin');

let gunTip=-Infinity;for(let i=0;i<dark.length;i+=6)if(Math.abs(dark[i])<.03 && dark[i+2]<-.065 && dark[i+2]>-.09)gunTip=Math.max(gunTip,dark[i+1]*10);
assert.ok(Math.abs(gunTip-6.25)<1e-5,'only a short barrel projects beyond the 5.55 m nose');

assert.ok(scenes.every(scene=>scene.world.asteroids.length===1),'asteroid environment shared across all four views');
assert.ok(batches.every(batch=>batch.origin[2]===12.5),'hulls stay above the highest terrain');
controls.get('asteroid').checked=false;controls.get('asteroid').onchange();frame(1300);
assert.ok(scenes.every(scene=>scene.world.asteroids.length===0),'asteroid toggle clears every panel');
assert.ok(batches.every(batch=>batch.origin[2]===0),'plain study restores original hull coordinates');

assert.equal(skies.length,4,'each viewport has a camera-aligned skybox');
controls.get('sky').checked=false;controls.get('sky').onchange();frame(1400);
assert.ok(skies.every(sky=>sky.empty),'sky toggle clears every skybox');
controls.get('sky').checked=true;controls.get('sky').onchange();frame(1500);
assert.ok(skies.every(sky=>!sky.empty),'sky can be restored independently of asteroid');

assert.ok(scenes.every(scene=>scene.options.zoomToTerrain===false),'fighter panels disable automatic asteroid targeting on wheel zoom');

let shinBottom=Infinity,highBackY=0,highBackCount=0;
for(const batch of cockpit.crew)for(let i=2;i<batch.vertices.length;i+=6)shinBottom=Math.min(shinBottom,batch.vertices[i]);
assert.ok(shinBottom>-.6,'seated feet follow the ankles instead of stretching shins toward the standing foot controls');
for(const batch of cockpit.chair)for(let i=0;i<batch.vertices.length;i+=6)if(batch.vertices[i+2]>.5){highBackY+=batch.vertices[i+1];highBackCount++;}
assert.ok(highBackCount>0 && highBackY/highBackCount<-.05,'chair back and headrest sit behind the forward-facing crew');

let helmetTop=-Infinity;
for(const batch of cockpit.crew)for(let i=2;i<batch.vertices.length;i+=6)helmetTop=Math.max(helmetTop,batch.vertices[i]-.28);
assert.ok(maxCabin-helmetTop>.12 && maxCabin-helmetTop<.22,'snug roof retains useful helmet clearance');

// Disk centers come from the rendered recessed nozzle geometry, not configuration.
const nozzlePoints=[[],[],[]];
for(let i=0;i<dark.length;i+=6){const y=dark[i+1]*10,x=dark[i]*10,z=dark[i+2]*10;if(Math.abs(y-(3.35+(-7.04-3.35)*aLengthScale))<1e-4 && z<-.2)nozzlePoints[2].push([x,z]);else if(Math.abs(y-(3.35+(-9.04-3.35)*aLengthScale))<1e-4)nozzlePoints[x<0?0:1].push([x,z]);}
const centers=nozzlePoints.map(points=>{assert.ok(points.length>0);return [0,1].map(axis=>(Math.min(...points.map(p=>p[axis]))+Math.max(...points.map(p=>p[axis])))/2);});
const distances=[[0,1],[0,2],[1,2]].map(([a,b])=>Math.hypot(centers[a][0]-centers[b][0],centers[a][1]-centers[b][1]));
assert.ok(Math.max(...distances)-Math.min(...distances)<1e-5,'three nozzle centers form an equilateral triangle');
assert.ok(centers[0][1]>centers[2][1] && centers[1][1]>centers[2][1],'two nozzles above, one below');

const nozzleRadius=(Math.max(...nozzlePoints[0].map(p=>p[0]))-Math.min(...nozzlePoints[0].map(p=>p[0])))/2/.7;
assert.ok(Math.abs(distances[0]-2*nozzleRadius-.04)<1e-5,'enlarged housings retain just a 4 cm gap');

assert.ok(scenes.every(scene=>scene.world.camera.x===0 && scene.world.camera.y===.04),'default framing stays centered on Barracuda with reference enabled');

controls.get('reset-views').onclick();
const subjectZooms=scenes.map(scene=>scene.world.camera.zoom);
controls.get('reference').checked=!controls.get('reference').checked;controls.get('reference').onchange();
assert.deepEqual(scenes.map(scene=>scene.world.camera.zoom),subjectZooms,'scale reference visibility does not zoom the subject away');
assert.ok(subjectZooms[1]>subjectZooms[0],'front view frames the narrow cross section more closely than side view');

let muzzleLow=Infinity,muzzleHigh=-Infinity;
for(let i=0;i<dark.length;i+=6)if(dark[i+1]>.61){muzzleLow=Math.min(muzzleLow,dark[i+2]*10);muzzleHigh=Math.max(muzzleHigh,dark[i+2]*10);}
assert.ok(Math.abs((muzzleLow+muzzleHigh)/2+.76)<1e-5,'cannon raised 27 cm toward lower engine axis');
assert.ok(armor.some((v,i)=>i%6===2 && Math.abs(v*10+.34)<1e-5),'cannon housing rises into a low center console');

// Every alternative shares the untouched cockpit geometry and supports the one-panel comparison mode.
const variantBounds={};
for(const variant of ['A','B','C','D','E']){
 context.window.location.search='?variant='+variant+'&compare=1&angle=top';scenes.length=0;
 vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','experiments/fighter-greybox.js'),'utf8'),context);
 assert.equal(scenes.length,1,'comparison uses one renderer per variant');
 assert.ok(batches.every(batch=>Array.from(batch.vertices).every(Number.isFinite)));
 const bounds=[0,1,2].map(axis=>{const values=batches.flatMap(batch=>Array.from(batch.vertices).filter((_,i)=>i%6===axis));return Math.max(...values)-Math.min(...values);});
 variantBounds[variant]=bounds;
 if(variant==='A')assert.deepEqual(Array.from(batches[batches.length-1].vertices),Array.from(glass),'A retains its revised cockpit');
}
assert.ok(variantBounds.B[1]/1.562>.45 && variantBounds.B[1]/1.562<.55,'B is roughly half the overall length');
assert.ok(variantBounds.B[0]/variantBounds.A[0]>1.85,'B doubles body breadth');
assert.ok(variantBounds.C[2]>variantBounds.A[2]*1.2,'C has a substantially deeper engine block');
assert.ok(variantBounds.D[1]<1.562*.7,'D is short and chunky');
console.log('PASS Barracuda variants: distinct finite hulls, shared cockpit and lightweight comparison panels');

context.window.location.search='?compare=1&lineup=1&angle=top';scenes.length=0;
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','experiments/fighter-greybox.js'),'utf8'),context);
assert.equal(scenes.length,1,'all five ships share exactly one renderer');
const lineupX=batches.flatMap(batch=>Array.from(batch.vertices).filter((_,i)=>i%6===0));
assert.ok(lineupX.reduce((a,b)=>Math.max(a,b),-Infinity)-lineupX.reduce((a,b)=>Math.min(a,b),Infinity)>2.6,'five ships are physically separated across one scene');
let glassStarted=false;
for(const batch of batches){if(batch.opacity!==undefined)glassStarted=true;else assert.equal(glassStarted,false,'all opaque ships precede all glazing');}
assert.equal((fs.readFileSync(require('node:path').join(__dirname,'..','experiments/fighter-variants.html'),'utf8').match(/<iframe /g)||[]).length,1,'comparison loads one scene document');

assert.ok(Math.abs(variantBounds.A[1]*10-15.62*.75)<.02,'A is 25 percent shorter without scaling the crew');


