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
const solution=DW.training.firingSolution(ellisView.combat,ellisView.combat.player,nearEnemy,DW.retailWeapons[0]);assert(solution);
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

// Tunnel forecasts must agree with independently advanced production sessions.
const held={throttle:null,throttleRate:0,fire:false};
function samePose(actual,expected){for(const field of ['eye','right','up','back'])for(let k=0;k<3;k++)assert.ok(Math.abs(actual[field][k]-expected[field][k])<1e-8,field+' matches production movement');}
let straightPath,straightPose;
const trajectoryCases=[];
for(const controls of [{},{yaw:.55},{pitch:.5,roll:.6},{pitch:.4,yaw:.5,roll:.7,boost:true},{side:1,vertical:-.4},{stop:true},{throttleRate:-.5}]){
 const reference=createFlight({mission:'training',seed:29,enabled:false});
 const start=reference.snapshot(),demand={...held,...controls};
 start.state.eye=[0,-10000,5000];
 const before=JSON.stringify(start.combat.player),forecast=DW.flightHud.predictFlightPath(start.combat.player,demand,0,6);
 assert.equal(JSON.stringify(start.combat.player),before,'Forecast cannot mutate live craft, arrays, guns or profile');
 assert.equal(forecast.length,12,'Twelve separate hoops ahead, including in straight flight');
 trajectoryCases.push({pose:JSON.parse(before).pose,path:forecast});
 let elapsed=0;
 for(const sample of forecast){reference.advance(sample.seconds-elapsed,demand);samePose(sample.pose,reference.snapshot().state);elapsed=sample.seconds;}
 if(!Object.keys(controls).length){straightPath=forecast;straightPose=JSON.parse(before).pose;}
 if(controls.yaw)assert.ok(Math.abs(forecast[3].pose.eye[0]-JSON.parse(before).pose.eye[0])>1,'Held steering bends the forecast');
 if(controls.roll)assert.ok(Math.abs(forecast[1].pose.right[2])>.01,'Roll transports and twists the hoop frames');
}
// Global half-second hoop timestamps remain fixed as the ship advances.
const phased=createFlight({mission:'training',seed:29,enabled:false});phased.snapshot().state.eye=[0,-10000,5000];
const first=DW.flightHud.predictFlightPath(phased.snapshot().combat.player,held,0,6);
phased.advance(1/120,held);
const next=DW.flightHud.predictFlightPath(phased.snapshot().combat.player,held,1/120,6);
samePose(first[0].pose,next[0].pose);assert.ok(next[0].seconds<first[0].seconds,'Hoops approach rather than remaining attached to the camera');
function paintTunnel(pose=straightPose,path=straightPath,opacity=.3){calls.length=0;DW.flightHud.paintFlightTunnel(painter,1000,700,pose,10,path,16,opacity);return calls.filter(c=>c.kind==='stroke');}
const tunnel=paintTunnel();
assert.ok(tunnel.length>=100,'Straight-ahead view contains a sequence of hoops and connecting rails');
const widths=new Set(tunnel.filter(c=>Math.abs(c.points[0][1]-c.points[1][1])<1e-6).map(c=>Math.round(Math.abs(c.points[1][0]-c.points[0][0])*1000)));
assert.ok(widths.size>=8,'Looking straight ahead shows many distinct nested rungs');
for(const c of tunnel){assert.ok(c.alpha>0&&c.alpha<=.3);for(const [x,y] of c.points)assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&x>=-1e-6&&x<=1000+1e-6&&y>=-1e-6&&y<=700+1e-6,'Hoops and rails are near/frustum clipped');}
assert.equal(paintTunnel(straightPose,straightPath,0).length,0);
assert.equal(paintTunnel({...straightPose,back:straightPose.back.map(v=>-v)},straightPath).length,0,'Do not invent forward hoops for a path behind the camera');
assert.equal(painter.globalAlpha,1,'Tunnel restores painter state');
console.log('PASS trajectory tunnel: independent real-session forecasts, held steering/roll/boost/throttle/strafe/stop, no live mutation, approaching rungs, nested straight-ahead hoops and clipped rails');

for(const c of trajectoryCases)for(const stroke of paintTunnel(c.pose,c.path))for(const [x,y] of stroke.points)assert.ok(Number.isFinite(x)&&Number.isFinite(y)&&x>=-1e-6&&x<=1000+1e-6&&y>=-1e-6&&y<=700+1e-6,'Curved and spiraling paths clip safely');
get('flight-tunnel').checked=true;get('flight-tunnel-ahead').value='6';get('flight-tunnel-width').value='24';get('flight-tunnel-opacity').value='85';
const guideView={...view,units:10,paused:false,speakerId:null,mouse:[0,0],showMouseStick:false,weapon:DW.retailWeapons[0],shipImages:new Map(),flightDemand:held};
hud.render(guideView);assert.ok(calls.some(c=>c.color==='#9aeeff'),'Real HUD mounts the guide using the supplied manual controls');
hud.render({...guideView,flightDemand:undefined});assert.ok(!calls.some(c=>c.color==='#9aeeff'),'No manual prediction is invented for an AI observer');
get('flight-tunnel').checked=false;hud.render(guideView);assert.ok(!calls.some(c=>c.color==='#9aeeff'),'Toggle removes tunnel geometry');
console.log('PASS tunnel integration: real HUD demand plumbing, manual-only scope, checkbox and curved-path viewport clipping');

hud.render({...guideView,flightDemand:held});
get('flight-tunnel').checked=true;hud.render(guideView);
const visibleHoops=calls.filter(c=>c.color==='#9aeeff'&&c.width===2.5);
assert.ok(visibleHoops.length>=40,'Clearly visible hoop strokes');
assert.ok(visibleHoops.filter(c=>c.points.every(p=>p[0]>400&&p[0]<600&&p[1]>250&&p[1]<450)).every(c=>c.alpha>=.5),'Central distant brackets retain readable brightness');
assert.ok(calls.some(c=>c.color==='#020a12'&&c.width===5.5),'Dark outline keeps hoops visible over lit terrain');
assert.ok(calls.some(c=>c.color==='#9aeeff'&&c.width===1.75),'Rails have deliberate visible weight');
console.log('PASS tunnel visibility: bright cyan hoops, minimum distant opacity, 2.5 px rungs, 1.75 px rails and dark terrain contrast');

// Broken top/bottom edges leave the middle of each rung open.
const guideInk=paintTunnel(straightPose,straightPath,.85).filter(c=>c.color==='#9aeeff'&&c.width===2.5);
assert.ok(!guideInk.some(c=>Math.abs(c.points[0][1]-c.points[1][1])<1e-6&&Math.min(...c.points.map(p=>p[0]))<500&&Math.max(...c.points.map(p=>p[0]))>500),'Horizontal rungs leave the centre open');
function offsetPath(angle){return straightPath.map(s=>({...s,pose:{...s.pose,eye:s.pose.eye.map((v,k)=>v+straightPose.right[k]*Math.tan(angle)*Math.hypot(...s.pose.eye.map((x,j)=>x-straightPose.eye[j])))}}));}
const aheadInk=paintTunnel(straightPose,straightPath,.85).filter(c=>c.color==='#9aeeff');
const sideInk=paintTunnel(straightPose,offsetPath(Math.PI/6),.85).filter(c=>c.color==='#9aeeff');
assert.ok(sideInk.length>0,'Moderately off-axis guidance is still visible');
assert.ok(sideInk.reduce((n,c)=>n+c.alpha,0)/sideInk.length<aheadInk.reduce((n,c)=>n+c.alpha,0)/aheadInk.length,'Peripheral segments fade instead of dominating the view');
console.log('PASS segmented tunnel: open rung centres, short rail dashes, readable forward brackets and off-axis fading');
