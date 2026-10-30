'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createFlight}=require('../tools/headless.cjs');
const flight=createFlight({mission:'furball',seed:29}),DW=flight.DW,view=flight.snapshot();
class Element {
  constructor(id){this.id=id;this.dataset={};this.textContent='';this.value='22';this.classList={add(){},contains:name=>id==='comms'&&name==='idle'};}
  appendChild(){}
  querySelector(){return null;}
}
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,new Element(id));return nodes.get(id);};
const document={body:get('body'),getElementById:get,querySelector:()=>get('lab')};
const calls=[],stack=[];let points=[];
const painter={globalAlpha:1,lineWidth:1,strokeStyle:'#fff',fillStyle:'#fff',
  save(){stack.push({globalAlpha:this.globalAlpha,lineWidth:this.lineWidth,strokeStyle:this.strokeStyle,fillStyle:this.fillStyle});},
  restore(){Object.assign(this,stack.pop());},
  beginPath(){points=[];},moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);},closePath(){},
  translate(){},rotate(){},arc(x,y,r){calls.push({kind:'arc',x,y,r});},setLineDash(){},fillRect(){},fillText(text,x,y){calls.push({kind:'text',text,x,y});},panel(){},image(){},
  stroke(){calls.push({kind:'stroke',points:points.slice(),color:this.strokeStyle,alpha:this.globalAlpha,width:this.lineWidth});},
  fill(){calls.push({kind:'fill',points:points.slice(),color:this.fillStyle,alpha:this.globalAlpha});},
  strokeRect(x,y,w,h){calls.push({kind:'rect',x,y,w,h,color:this.strokeStyle,alpha:this.globalAlpha,width:this.lineWidth});}
};
DW.experimentDom=()=>get;
DW.gpuUi={create:()=>({painter,begin(){calls.length=0;},end(){}})};
DW.flightTargetCamera={mount:()=>({update:()=>false})};
const context=vm.createContext({window:{Driftworks:DW},document,HTMLCanvasElement:class {},performance:{now:()=>0}});
for(const file of ['experiments/skybox.js','experiments/radar.js','experiments/flight-hud.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
const enemies=view.combat.enemies.filter(c=>c.team==='enemy').slice(0,4),ally=view.combat.enemies.find(c=>c.team==='ally');
view.combat.enemies=[...enemies,ally];view.combat.targetId=null;
Object.assign(view.state,{eye:[0,0,0],right:[1,0,0],up:[0,1,0],back:[0,0,1]});
[[-10,0,-100],[20,10,-100],[200,0,-100],[0,0,100]].forEach((point,i)=>{enemies[i].pose.eye=point;});
ally.pose.eye=[0,-10,-100];
const hud=DW.flightHud.mount({clientWidth:1000,clientHeight:700});
hud.render({...view,units:10,paused:false,speakerId:null,mouse:[0,0],showMouseStick:false,weapon:DW.retailWeapons[0],shipImages:new Map()});
const hostile=calls.filter(c=>c.color==='#ff655d');
const diamonds=hostile.filter(c=>c.kind==='stroke'&&c.points.length===4);
const arrows=hostile.filter(c=>c.kind==='stroke'&&c.points.length===3);
assert.equal(diamonds.length,2,'Both unselected on-screen enemies have markers');
assert.equal(arrows.length,2,'Offscreen and rear enemies retain edge arrows without target/speaker status');
for(const marker of [...diamonds,...arrows]){assert.equal(marker.alpha,1);assert.ok(marker.width>=1.5);}
for(const marker of diamonds)assert.equal(Math.max(...marker.points.map(p=>p[0]))-Math.min(...marker.points.map(p=>p[0])),24,'Restore readable contact size');
assert.equal(hostile.filter(c=>c.kind==='fill'&&c.points.length===3).length,2,'Enemy edge arrows are filled for contrast');
assert.ok(calls.some(c=>c.kind==='rect'&&c.color==='#63f58d'&&c.w===24),'Allied contact remains distinct');
assert.ok(calls.filter(c=>c.color==='#05090f'&&c.width===3.5).length>=5,'Contact outlines have dark contrast backing');
console.log('PASS flight HUD markers: real session contacts, unselected enemies, rear/offscreen arrows, readable size/opacity and contrast');

// Keep the pre-GPU steering guide and reticle dimensions, including after resize.
const host={clientWidth:1000,clientHeight:700},guidanceHud=DW.flightHud.mount(host);
for(const [w,h,range] of [[1000,700,240],[2048,1532,240],[390,844,120],[844,390,160]]){
  Object.assign(host,{clientWidth:w,clientHeight:h});
  guidanceHud.render({...view,units:10,paused:false,speakerId:null,mouse:[.5,-.25],stickRange:range,showMouseStick:true,weapon:DW.retailWeapons[0],shipImages:new Map()});
  const centerArcs=calls.filter(c=>c.kind==='arc'&&c.x===w/2&&c.y===h/2);
  assert.ok(centerArcs.some(c=>c.r===range),'Outer joystick ring shows the full steering range');
  assert.ok(centerArcs.some(c=>c.r===range*.08),'Inner ring preserves the steering deadzone guide');
  assert.ok(centerArcs.some(c=>c.r===21),'Crosshair keeps its original 42 CSS-pixel diameter');
  assert.ok(calls.some(c=>c.kind==='arc'&&c.x===w/2+range*.5&&c.y===h/2-range*.25&&c.r===5),'Stick cursor follows the same range as the guide');
}
console.log('PASS flight guidance: full steering travel, deadzone, cursor alignment and original crosshair size across desktop/mobile resize');

const throatPose={eye:[0,-2340/DW.sim.METERS_PER_UNIT,1550/DW.sim.METERS_PER_UNIT],right:[1,0,0],up:[0,0,1],back:[0,-1,0],region:0};
calls.length=0;DW.flightHud.paintThroatGuide(painter,1280,720,throatPose,{region:0,distance:340,gap:40,proximity:.87,flash:0});
assert.equal(calls.length,0,'No persistent throat box or camera-relative grid');
DW.flightHud.paintThroatGuide(painter,1280,720,throatPose,{region:1,distance:350,gap:50,proximity:.83,flash:1});
assert(calls.some(c=>c.kind==='text'&&c.text==='THROAT CROSSED / RIME'));assert.equal(painter.globalAlpha,1);
console.log('PASS throat HUD: quiet during ordinary transit, brief chart-crossing confirmation and painter restoration');

// Contact diamonds follow the same primary optical direction as object patches;
// the weapon lead cue retains its ordinary firing-direction projection.
const ellisView=flight.reset(),nearEnemy=ellisView.combat.enemies.find(e=>e.team==='enemy');
ellisView.combat.mode='ellis';
Object.assign(ellisView.state,{eye:[0,-2380/DW.sim.METERS_PER_UNIT,1550/DW.sim.METERS_PER_UNIT],right:[1,0,0],up:[0,0,1],back:[0,-1,0],region:0});
nearEnemy.pose.eye=[12/DW.sim.METERS_PER_UNIT,-2340/DW.sim.METERS_PER_UNIT,1550/DW.sim.METERS_PER_UNIT];nearEnemy.pose.region=0;
ellisView.combat.enemies=[nearEnemy];ellisView.combat.targetId=nearEnemy.id;
let opticalCalls=0;const savedOptics=DW.ellisOptics,savedPresentation=DW.flightPresentation;
DW.flightPresentation={model:()=>({name:"Fixture fighter"})};
DW.ellisOptics={primary:(eye,target,region,destination)=>{opticalCalls++;assert.equal(region,0);assert.equal(destination,0);return {direction:[.2,1,0],length:42,direct:false,turning:false,impact:1};}};
hud.render({...ellisView,paint:{ally:[1,1,1],enemy:[1,1,1]},units:DW.sim.METERS_PER_UNIT,paused:false,speakerId:null,mouse:[0,0],showMouseStick:false,weapon:DW.retailWeapons[0],shipImages:new Map()});
const projected=DW.flightSkybox.project([.2,1,0],ellisView.state,1000/700),targetX=1000*(projected.x+1)/2;
assert(calls.some(c=>c.kind==='stroke'&&c.color==='#ffe7a3'&&c.points.length===4&&Math.abs(c.points.reduce((sum,p)=>sum+p[0],0)/4-targetX)<1e-6),'Selected contact diamond uses the optical image direction');
assert(opticalCalls>1,'Contact and firing route share optical paths, but the pip direction is projected only once');
DW.ellisOptics=savedOptics;DW.flightPresentation=savedPresentation;
console.log('PASS Ellis HUD projection: optical contact image, shared image/firing metric and no double warping of the pip');

// Crosshairs on the displayed lead mean a physical firing direction, even when
// the target's optical image is elsewhere or the target is in the other chart.
vm.runInContext(fs.readFileSync(path.join(__dirname,'../experiments/ellis-optics.js'),'utf8'),context);
const u=DW.sim.METERS_PER_UNIT;
Object.assign(ellisView.state,{eye:[0,-2350/u,1550/u],region:0,velocity:[20,70,0]});
Object.assign(nearEnemy.pose,{eye:[12020/u,-1660/u,1550/u],region:1,velocity:[20,40,0]});nearEnemy.hp=100;nearEnemy.shield=0;
const solution=DW.flightSim.firingSolution(ellisView.combat,ellisView.combat.player,nearEnemy,DW.retailWeapons[0]);assert(solution);
const forward=Array.from(solution.direction),norm=Math.hypot(forward[0],forward[1]);ellisView.state.back=forward.map(x=>-x);ellisView.state.right=[forward[1]/norm,-forward[0]/norm,0];ellisView.state.up=[-forward[0]*forward[2]/norm,-forward[1]*forward[2]/norm,norm];
DW.flightPresentation={model:()=>({name:'Fixture fighter'})};
function renderAim(){hud.render({...ellisView,paint:{ally:[1,1,1],enemy:[1,1,1]},units:u,paused:false,speakerId:null,mouse:[0,0],showMouseStick:false,weapon:DW.retailWeapons[0],shipImages:new Map()});}
renderAim();assert.equal(get('target-info').dataset.leadState,'valid');const expectedRange=Math.round(DW.flightGuns.ballisticPath(ellisView.state.eye,nearEnemy.pose.eye,0,1,true).distance*u)+' m';assert(calls.filter(c=>c.kind==='text'&&c.text===expectedRange).length>=2,'contact and target-panel ranges exclude chart storage translation');assert(calls.some(c=>c.kind==='arc'&&c.r===7&&Math.abs(c.x-500)<1e-6&&Math.abs(c.y-350)<1e-6),'cross-chart firing solution projects exactly onto the crosshair');
// Presentation normalization changes metre readouts, not optical contact projection.
const originalRadar=DW.flightRadar.draw;let radarUnits;
DW.flightRadar.draw=function(ctx,state,contacts,units,...rest){radarUnits=units;return originalRadar(ctx,state,contacts,units,...rest);};
hud.render({...ellisView,paint:{ally:[1,1,1],enemy:[1,1,1]},units:u,distanceScale:.25,paused:false,speakerId:null,mouse:[0,0],showMouseStick:false,weapon:DW.retailWeapons[0],shipImages:new Map()});
const scaledRange=Math.round(DW.flightGuns.ballisticPath(ellisView.state.eye,nearEnemy.pose.eye,0,1,true).distance*u*.25)+' m';
assert.ok(calls.filter(c=>c.kind==='text'&&c.text===scaledRange).length>=2,'contact and target monitor both display physical normalized range');
assert.equal(radarUnits,u*.25,'real radar uses the same physical scale');
assert.equal(get('target-info').dataset.leadState,'valid','normalizing displayed metres preserves the actual solver');
DW.flightRadar.draw=originalRadar;
console.log('PASS real flight HUD normalization: contact/panel physical ranges, radar scale and unchanged lead solver');
nearEnemy.pose.eye=[16000/u,-1600/u,1550/u];renderAim();assert.equal(get('target-info').dataset.leadState,'unavailable');assert(!calls.some(c=>c.kind==='arc'&&c.r===7),'unreachable shot never displays a guessed lead pip');assert(calls.some(c=>c.kind==='text'&&c.text==='NO FIRING SOLUTION'));
DW.flightPresentation=savedPresentation;DW.ellisOptics=savedOptics;
console.log('PASS truthful Ellis HUD lead: actual firing direction, cross-chart contact, no optical warp and no invalid/out-of-lifetime pip');

// Thin-shell HUD, radar, range and pip all consume the same finite-source route.
ellisView.combat.mode='thin-shell';
DW.flightPresentation={model:()=>({name:'Fixture fighter'})};
let thinContacts=[];
DW.flightRadar.draw=function(ctx,state,contacts,...args){thinContacts=contacts;return originalRadar(ctx,state,contacts,...args);};
for(const side of [0,1]){
 Object.assign(ellisView.state,{eye:[side*12000/u,-2350/u,1550/u],region:side,velocity:[0,0,0]});
 Object.assign(nearEnemy.pose,{eye:[((1-side)*12000+40)/u,-1660/u,1550/u],region:1-side,velocity:[20,40,0]});
 const lead=DW.flightSim.firingSolution(ellisView.combat,ellisView.combat.player,nearEnemy,DW.retailWeapons[0]);assert(lead);
 const d=Array.from(lead.direction),n=Math.hypot(d[0],d[1]);ellisView.state.back=d.map(x=>-x);ellisView.state.right=[d[1]/n,-d[0]/n,0];ellisView.state.up=[0,0,1];
 renderAim();
 assert.equal(get('target-info').dataset.leadState,'valid');
 assert(calls.some(c=>c.kind==='arc'&&c.r===7&&Math.abs(c.x-500)<1e-6&&Math.abs(c.y-350)<1e-6),'thin-shell lead is the physical firing bearing');
 const route=DW.thinShellOptics.primary(ellisView.state.eye.map(v=>v*u),nearEnemy.pose.eye.map(v=>v*u),side,1-side);
 const contact=thinContacts.find(c=>c.selected);assert(contact,'radar includes reachable remote target');
 assert(Math.hypot(...contact.point.map((v,i)=>v-ellisView.state.eye[i]-route.direction[i]*route.length/u))<1e-9,'radar direction and distance match optical HUD image');
 const projection=DW.flightSkybox.project(Array.from(route.direction),ellisView.state,1000/700),x=500*(1+projection.x);
 assert(calls.some(c=>c.kind==='stroke'&&c.color==='#ffe7a3'&&c.points.length===4&&Math.abs(c.points.reduce((sum,p)=>sum+p[0],0)/4-x)<1e-6),'thin-shell contact diamond follows the rendered image');
 nearEnemy.pose.eye=[(1-side)*12000/u,-2400/u,1550/u];renderAim();
 assert.equal(get('target-info').dataset.leadState,'unavailable');assert(!thinContacts.some(c=>c.selected),'occluded remote target has no invented radar image');
}
DW.flightRadar.draw=originalRadar;DW.flightPresentation=savedPresentation;
console.log('PASS thin-shell HUD/radar: both charts, optical markers and ranges, firing bearing, remote contact and occlusion');

// Fine road samples must match the production controller, without editing live state.
const held={throttle:null,throttleRate:0,fire:false};
function samePose(actual,expected){for(const field of ['eye','right','up','back'])for(let k=0;k<3;k++)assert.ok(Math.abs(actual[field][k]-expected[field][k])<1e-8,field+' matches production movement');}
let straightPath,straightPose;
const trajectoryCases=[];
for(const controls of [{},{yaw:.55},{pitch:.5,roll:.6},{pitch:.4,yaw:.5,roll:.7,boost:true},{side:1,vertical:-.4},{stop:true},{throttleRate:-.5}]){
 const reference=createFlight({mission:'training',seed:29,enabled:false});
 const start=reference.snapshot(),demand={...held,...controls};start.state.eye=[0,-10000,5000];
 const before=JSON.stringify(start.combat.player),forecast=DW.flightHud.predictFlightPath(start.combat.player,demand,6);
 assert.equal(JSON.stringify(start.combat.player),before,'Forecast cannot mutate live craft, arrays, guns or profile');
 assert.equal(forecast.length,721,'Retain every physics tick so each painted dash can curve');
 assert.equal(forecast[0].distance,0);
 for(let i=1;i<forecast.length;i++){assert.ok(forecast[i].distance>=forecast[i-1].distance);assert.ok(forecast[i].seconds-forecast[i-1].seconds<=1/120+1e-10);}
 trajectoryCases.push({pose:JSON.parse(before).pose,path:forecast});
 let elapsed=0;
 for(let i=0;i<forecast.length;i+=60){const sample=forecast[i];reference.advance(sample.seconds-elapsed,demand);samePose(sample.pose,reference.snapshot().state);elapsed=sample.seconds;}
 if(!Object.keys(controls).length){straightPath=forecast;straightPose=JSON.parse(before).pose;}
 if(controls.yaw)assert.ok(Math.abs(forecast[240].pose.eye[0]-JSON.parse(before).pose.eye[0])>1,'Held steering bends the road');
 if(controls.roll)assert.ok(Math.abs(forecast[120].pose.right[2])>.01,'Roll twists the road floor');
}
function paintLanes(pose=straightPose,path=straightPath,opacity=.85,phase=0){calls.length=0;DW.flightHud.paintFlightLanes(painter,1000,700,pose,DW.sim.METERS_PER_UNIT,path,16,opacity,phase);return calls.filter(c=>c.kind==='stroke');}
const road=paintLanes(),ink=road.filter(c=>c.color==='#9aeeff');
assert.ok(ink.length>=6,'Several separate dashes pass below each side');
assert.ok(ink.some(c=>c.points.every(p=>p[0]<500))&&ink.some(c=>c.points.every(p=>p[0]>500)),'Both sides of the road are visible');
assert.ok(ink.every(c=>c.points.every(p=>p[1]>350)),'Straight flight paints only below the eye line');
assert.ok(ink.some(c=>c.alpha>.5),'Peripheral paint stays clearly readable');
assert.ok(road.some(c=>c.color==='#020a12'&&c.width===5.5),'Road paint has a dark contrast outline');
const focal=1/Math.tan(Math.PI/8);
function checkPaintSpacing(strokes,phase){
 for(const c of strokes.filter(c=>c.color==='#9aeeff'))for(const [x,y] of c.points){
  const depth=4*focal*700/(2*(y-350)),position=((depth+phase)%20+20)%20;
  assert.ok(position<8+1e-6||position>20-1e-6,'Each dash occupies 8 m of a constant 20 m road interval: '+JSON.stringify({depth,phase,position,x,y}));
  assert.ok(Math.abs(Math.abs((x-500)*2*depth/(700*focal))-8)<1e-6,'Lane separation remains 16 physical metres');
 }
}
checkPaintSpacing(road,0);checkPaintSpacing(paintLanes(straightPose,straightPath,.85,7),7);
function checkClip(strokes){
 const radius=Math.max(40,Math.min(72,700*.075))+3;
 for(const c of strokes)for(let i=1;i<c.points.length;i++){
  const a=c.points[i-1],b=c.points[i];
  for(const [x,y] of [a,b])assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&x>=-1e-6&&x<=1000+1e-6&&y>=-1e-6&&y<=700+1e-6,'Road clips before projection');
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((500-a[0])*dx+(350-a[1])*dy)/(dx*dx+dy*dy||1)));
  assert.ok(Math.hypot(a[0]+t*dx-500,a[1]+t*dy-350)>=radius-1e-6,'No road stroke crosses the protected aiming area');
 }
}
checkClip(road);
let curved=false;
for(const c of trajectoryCases){const strokes=paintLanes(c.pose,c.path);checkClip(strokes);
 for(const stroke of strokes.filter(s=>s.color==='#9aeeff'&&s.points.length>=4)){
  const a=stroke.points[0],b=stroke.points.at(-1),dx=b[0]-a[0],dy=b[1]-a[1];
  if(stroke.points.some(p=>Math.abs(dx*(p[1]-a[1])-dy*(p[0]-a[0]))/(Math.hypot(dx,dy)||1)>.1))curved=true;
 }
}
assert.ok(curved,'Individual dashes visibly curve through multiple points instead of straight endpoint chords');
assert.equal(paintLanes(straightPose,straightPath,0).length,0);
assert.equal(paintLanes({...straightPose,back:straightPose.back.map(v=>-v)},straightPath).length,0);
assert.equal(painter.globalAlpha,1);
get('flight-guide-style').value='lanes';get('flight-lanes').checked=true;get('flight-lanes-ahead').value='4';get('flight-lanes-width').value='24';get('flight-lanes-opacity').value='85';
const guideView={...view,units:10,paused:false,speakerId:null,mouse:[0,0],showMouseStick:false,weapon:DW.retailWeapons[0],shipImages:new Map(),flightDemand:held};
hud.render(guideView);assert.ok(calls.some(c=>c.color==='#9aeeff'),'Real HUD receives held manual inputs');
hud.render({...guideView,flightDemand:undefined});assert.ok(!calls.some(c=>c.color==='#9aeeff'),'No manual path is invented for an observer');
get('flight-lanes').checked=false;hud.render(guideView);assert.ok(!calls.some(c=>c.color==='#9aeeff'),'Checkbox removes the road');
console.log('PASS trajectory lanes: real-session predictions, fine curved dashes, 8/12 m road paint, physical lane spacing, readable lower/peripheral placement, protected aim, clipping and manual HUD toggle');

function bracketFixture(offset=0){const U=DW.sim.METERS_PER_UNIT;
 return [40,100].map((depth,i)=>({seconds:i+1,distance:i*60,pose:{eye:straightPose.eye.map((v,k)=>v+straightPose.right[k]*offset/U-straightPose.back[k]*depth/U),right:straightPose.right,up:straightPose.up,back:straightPose.back}}));}
function paintBrackets(path){calls.length=0;DW.flightHud.paintFlightBrackets(painter,1000,700,straightPose,DW.sim.METERS_PER_UNIT,path,24,.85,0);return calls.filter(c=>c.kind==='stroke');}
const centred=paintBrackets(bracketFixture()),inner=centred.filter(c=>c.color==='#9aeeff'),outer=centred.filter(c=>c.color==='#8bd4e8');
assert.ok(inner.length&&outer.length,'Both inner and outer bracket pairs are present');
function spread(lines,axis){const values=lines.flatMap(c=>c.points.map(p=>p[axis]));return Math.max(...values)-Math.min(...values);}
assert.ok(Math.abs(spread(outer,0)/spread(inner,0)-2)<1e-8,'Outer brackets are twice as wide');
assert.ok(Math.abs(spread(outer,1)/spread(inner,1)-2)<1e-8,'Outer brackets are twice as tall');
const steep=paintBrackets(bracketFixture(75));assert.ok(!steep.some(c=>c.color==='#9aeeff'),'Fixture pushes the inner frame wholly off screen');assert.ok(steep.some(c=>c.color==='#8bd4e8'),'Outer brackets remain visible independently when the inner frame leaves the screen');
checkClip(centred);checkClip(steep);for(const c of trajectoryCases)checkClip(paintBrackets(c.path));
get('flight-guide-style').value='brackets';get('flight-lanes').checked=true;hud.render(guideView);assert.ok(calls.some(c=>c.color==='#8bd4e8'),'HUD default restores the double-bracket treatment');
console.log('PASS double brackets: exact 2x outer frame, independent steep-angle visibility, centre clearance, clipping and HUD style selection');

assert.equal(inner.length,4,'Only the four angled strokes remain in the inner frame');assert.equal(outer.length,4,'Only the four angled strokes remain in the outer frame');
assert.ok([...inner,...outer].every(c=>Math.abs(c.points[1][0]-c.points[0][0])>1&&Math.abs(c.points[1][1]-c.points[0][1])>1),'No horizontal or vertical hooks remain');
const shortPath=bracketFixture().map((s,i)=>({...s,distance:i*59}));assert.equal(paintBrackets(shortPath).length,0,'No frame before the new 60 metre station');
console.log('PASS sparse angled brackets: diagonal-only bars, no bent hooks, 60 m stations and unchanged physical outer size');

// Four lines only, at twice the original inner cross-section offsets.
calls.length=0;DW.flightHud.paintFlightLanes(painter,1000,700,straightPose,DW.sim.METERS_PER_UNIT,straightPath,24,.85,0,true);
const outerRoad=calls.filter(c=>c.kind==='stroke'),offsets=new Set();
for(const c of outerRoad.filter(c=>c.color==='#9aeeff'))for(const [x,y] of c.points){
 const depth=12*focal*700/(2*Math.abs(y-350)),lateral=(x-500)*2*depth/(700*focal);
 assert.ok(Math.abs(Math.abs(lateral)-24)<1e-6,'Lateral offset is twice the old 12 m inner offset');
 offsets.add((y<350?'above:':'below:')+Math.round(lateral));
}
assert.equal(offsets.size,4,'Exactly four lines: +/-24 m right, +/-12 m up');checkClip(outerRoad);
for(const c of trajectoryCases){calls.length=0;DW.flightHud.paintFlightLanes(painter,1000,700,c.pose,DW.sim.METERS_PER_UNIT,c.path,24,.85,0,true);checkClip(calls.filter(c=>c.kind==='stroke'));}
get('flight-guide-style').value='roads';hud.render(guideView);assert.ok(calls.some(c=>c.color==='#9aeeff')&&!calls.some(c=>c.color==='#8bd4e8'),'Four far markers render in the real HUD');
const updateGuide=DW.flightHud.updateFlightGuide,strength=DW.flightHud.guideStrength;
let batches=updateGuide([],straightPath,0,24,7,'roads',200);
assert.equal(batches.length,1);const old=batches[0],frozen=JSON.stringify(old);
assert.equal(strength(old,0),1,'New distant paint pops in; no nearby opacity growth');
assert.ok(Math.abs(old.path[0].distance)<1e-8&&Math.abs(old.path.at(-1).distance-8)<1e-8,'One 8 m dash per emission');
for(const sample of old.path){const forward=sample.pose.eye.reduce((sum,v,k)=>sum+(v-straightPose.eye[k])*(-straightPose.back[k])*DW.sim.METERS_PER_UNIT,0);assert.ok(forward>=192-1e-6&&forward<=200+1e-6,'Every new vertex lies in the last 8 m at maximum distance');}
const turnPath=trajectoryCases.find(c=>c.path!==straightPath).path;
batches=updateGuide(batches,turnPath,.25,24,11,'roads',200);
assert.equal(JSON.stringify(old),frozen,'Steering preserves old geometry, phase and lifetime');
assert.ok(batches.length<=2,'New heading emits at most one distant dash; tight loops stay quiet');
for(const batch of batches.slice(1))for(const sample of batch.path){const distance=Math.hypot(...sample.pose.eye.map((v,k)=>(v-turnPath[0].pose.eye[k])*DW.sim.METERS_PER_UNIT));assert.ok(distance>=192-1e-6&&distance<=200+1e-6,'Turning forecasts cannot spawn paint inside the distant shell');}
const paused=JSON.stringify(batches);batches=updateGuide(batches,null,.25,0,0,'roads');assert.equal(JSON.stringify(batches),paused);
assert.ok(strength(old,old.lifetime-.5)<1&&strength(old,old.lifetime-.5)>0,'Old paint fades late in its lifetime as the ship reaches/passes it');
batches=updateGuide(batches,null,21,0,0,'roads');assert.equal(batches.length,0,'All old paint expires');
assert.equal(updateGuide([],straightPath,0,24,0,'roads',1e6).length,0,'Short forecasts never substitute nearby paint');
// Stationary HUD frames and steering cannot spawn a whole road or another dash.
const initialInk=calls.filter(c=>c.color==='#9aeeff').map(c=>c.points);
hud.render({...guideView,flightDemand:{...guideView.flightDemand,yaw:1}});
assert.deepEqual(calls.filter(c=>c.color==='#9aeeff').map(c=>c.points),initialInk,'Changing controls at zero travel cannot introduce new nearby geometry');
function projectBatch(camera){calls.length=0;DW.flightHud.paintFlightLanes(painter,1000,700,camera,DW.sim.METERS_PER_UNIT,old.path,24,.85,0,true);return calls.filter(c=>c.color==='#9aeeff');}
const beforeTravel=projectBatch(straightPose),afterTravel=projectBatch({...straightPose,eye:straightPose.eye.map((v,k)=>v-straightPose.back[k]*40/DW.sim.METERS_PER_UNIT)});
assert.notDeepEqual(afterTravel.map(c=>c.points),beforeTravel.map(c=>c.points),'Camera motion alone enlarges the approaching fixed dash');checkClip(afterTravel);
console.log('PASS four distant lane markers: exact 2x offsets, far-only 8 m births, no nearby refill or input-driven pop-in, frozen geometry, late fade, expiry and physical approach');

const grid=DW.flightHud.flightGridPoints(straightPose,DW.sim.METERS_PER_UNIT,1000,700);
assert.ok(grid.length>=10&&grid.length<=100,'Distant grid has a bounded regular population without nearest-marker swaps');
assert.ok(grid.every(p=>p.every(v=>Math.abs(v/160-Math.round(v/160))<1e-9)),'All points belong to the fixed 160 m Cartesian lattice');
const movedCamera={...straightPose,eye:straightPose.eye.map((v,k)=>v+[5,3,-7][k]/DW.sim.METERS_PER_UNIT)};
const movedGrid=DW.flightHud.flightGridPoints(movedCamera,DW.sim.METERS_PER_UNIT,1000,700);
assert.ok(movedGrid.some(p=>grid.some(q=>JSON.stringify(p)===JSON.stringify(q))),'Moving the eye preserves shared world coordinates');
for(const [w,h] of [[1641,969],[700,1000],[800,600]])assert.ok(DW.flightHud.flightGridPoints(movedCamera,DW.sim.METERS_PER_UNIT,w,h).length<=100);
calls.length=0;DW.flightHud.paintFlightGrid(painter,1000,700,straightPose,DW.sim.METERS_PER_UNIT,.85);
assert.equal(calls.filter(c=>c.color==='#9aeeff').length,grid.length,'One dot per grid site');
assert.ok(calls.filter(c=>c.color==='#9aeeff').every(c=>c.kind==='fill'),'Grid sites use filled dots instead of strokes');
assert.ok(calls.filter(c=>c.kind==='arc').every(c=>c.r>=.8&&c.r<=3.5),'Dots and their backing remain small');
get('flight-guide-style').value='grid';hud.render(guideView);assert.ok(calls.some(c=>c.color==='#9aeeff'),'Static grid is available in the production HUD');
console.log('PASS static XYZ grid: world-fixed 160 m lattice, small filled dots, distant continuous population, bounded population and camera-only parallax');

// Close rank crossings must not replace arbitrary bright crosses.
const shifted=DW.flightHud.flightGridPoints({...straightPose,eye:straightPose.eye.map((v,k)=>v+(k===0?.001:0))},DW.sim.METERS_PER_UNIT,1000,700);
const overlap=grid.filter(p=>shifted.some(q=>JSON.stringify(p)===JSON.stringify(q)));assert.ok(overlap.length>=grid.length-4,'Tiny camera motion retains the visible lattice instead of swapping a nearest-20 selection');
calls.length=0;DW.flightHud.paintFlightGrid(painter,1000,700,straightPose,DW.sim.METERS_PER_UNIT,.85);assert.ok(calls.filter(c=>c.color==='#9aeeff').some(c=>c.alpha<.1),'Distant/edge crosses blend in below full brightness');

const centerCamera={eye:[0,0,0],right:[1,0,0],up:[0,1,0],back:[0,0,1]};
assert.ok(DW.flightHud.flightGridPoints(centerCamera,DW.sim.METERS_PER_UNIT,1000,700).some(p=>p[0]===0&&p[1]===0&&p[2]===-160),'A cross directly behind the crosshair is retained');
calls.length=0;DW.flightHud.paintFlightGrid(painter,1000,700,centerCamera,DW.sim.METERS_PER_UNIT,.85);
const centerCross=calls.find((c,i)=>c.color==='#9aeeff'&&c.alpha>.5&&calls[i-1]?.kind==='arc'&&Math.abs(calls[i-1].x-500)<1e-6&&Math.abs(calls[i-1].y-350)<1e-6);
assert.ok(centerCross,'Central dots render at full grid brightness with no aim fade');
console.log('PASS grid through crosshairs: no center culling or opacity hole');

// Missing experimental controls must not disable the shared cockpit default.
const lookup=document.getElementById;
document.getElementById=id=>id.startsWith('flight-lanes')||id==='flight-guide-style'?null:lookup(id);
for(const mode of ['default','asteroid-patrol','gas-giant','jade-rime']){
 const sharedView={...guideView,combat:{...guideView.combat,mode},flightDemand:undefined};
 hud.render(sharedView);assert.ok(calls.some(c=>c.color==='#9aeeff'&&c.kind==='fill'),'Default motion dots render without lab controls or held inputs in '+mode);
}
hud.render({...guideView,combat:{...guideView.combat,mode:'ellis'}});
assert.ok(!calls.some(c=>c.color==='#9aeeff'&&c.kind==='fill'),'Wormhole motion dots belong to the optical sky pass, with no flat HUD duplicate');
hud.render({...guideView,combat:{...guideView.combat,dead:true}});assert.ok(!calls.some(c=>c.color==='#9aeeff'&&c.kind==='fill'),'No motion dots after death');
document.getElementById=lookup;get('flight-guide-style').value='grid';get('flight-lanes').checked=false;hud.render(guideView);assert.ok(!calls.some(c=>c.color==='#9aeeff'&&c.kind==='fill'),'Shared toggle disables motion dots');get('flight-lanes').checked=true;
console.log('PASS default cockpit motion dots: missing lab controls, no input demand, sorties, free flight, wormhole, death and off switch');

const bodyContains=document.body.classList.contains;document.body.classList.contains=name=>name==='watch-chase';hud.render(guideView);assert.ok(!calls.some(c=>c.color==='#9aeeff'&&c.kind==='fill'),'Chase camera suppresses cockpit motion dots');document.body.classList.contains=bodyContains;
