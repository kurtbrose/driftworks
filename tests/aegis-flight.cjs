'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),cp=require('node:child_process');
const root=path.join(__dirname,'..'),DW={sim:{METERS_PER_UNIT:10000/600}},ctx=vm.createContext({window:{Driftworks:DW},Float32Array,Map,Math,console});
cp.execFileSync(process.execPath,[path.join(root,'tools/bake-aegis-flight.cjs'),'--check'],{stdio:'pipe'});
for(const file of ['experiments/retail-profiles.js','experiments/flight-model.js','experiments/retail-weapons.js','experiments/guns.js','experiments/flight-missions.js','experiments/mission-ohio.js','src/flight-collision.js', 'src/flight-combat.js', 'src/flight-mission-runtime.js', 'src/flight-opponent.js', 'src/flight-blockout.js', 'src/flight-sim.js', 'src/ship-catalog.js','src/ship-assets.js','src/ship-render.js','assets/ships/aegis-kit/flight-rig.js','src/aegis-sim.js', 'src/aegis-visual.js', 'src/aegis-battle.js', 'experiments/aegis-flight.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
const U=DW.sim.METERS_PER_UNIT;
function position(x,y,z){return [x/U,y/U,1200+z/U];}
function fixture(targetZ=250){
 const state=DW.arcade.create(0);state.eye=position(0,-1200,200);
 const combat=DW.flightSim.create('training');combat.enabled=true;DW.flightSim.bindPlayer(combat,state);
 const pose=DW.arcade.create(0);pose.eye=position(-1000,0,targetZ);
 const enemy=DW.flightSim.createCraft('target',pose,'enemy');enemy.controller='ai';enemy.hp=enemy.maxHp=10000;enemy.shield=0;enemy.collision.radiusM=15;
 combat.enemies=[enemy];return {state,combat,guns:DW.flightGuns.create(),world:{},enemy};
}
const rig=DW.aegisFlight.create(),view=fixture();
assert.equal(rig.telemetry().mounts.length,24);
assert.equal(rig.telemetry().mounts.filter(m=>m.kind==='heavy').length,12);
const initial=rig.geometry();assert.ok(initial.slice(0,7).every(b=>b.staticGeometry));
assert.ok(initial.every(b=>b.staticGeometry),'all ship geometry is uploaded once');
assert.ok(new Set(initial.map(b=>b.vertices)).size<initial.length,'identical turret meshes share vertex buffers');
const buffers=initial.map(b=>b.vertices),bases=initial.map(b=>b.basis),beforeMatrices=bases.map(b=>b&&Array.from(b));
rig.step(0,view);assert.equal(rig.telemetry().seconds,0);
rig.step(.05,view);assert.ok(rig.telemetry().mounts.every(m=>Math.abs(m.yaw)<=2.8*.05+1e-8&&Math.abs(m.elevation)<=2.2*.05+1e-8));
for(let i=0;i<240;i++){view.combat.time+=1/60;rig.step(1/60,view);}
assert.ok(rig.telemetry().shots>0,'upper batteries fire after acquiring a target');
assert.ok(rig.telemetry().hits>0&&view.enemy.hp<10000,'shared projectile/damage resolver hits the target');
assert.ok(rig.telemetry().mounts.filter(m=>m.kind==='heavy').every(m=>m.yaw===0&&m.elevation===0),'main batteries do not chase fighters');
assert.equal(view.combat.player.hp,100,'allied support fire cannot damage the player');
assert.ok(rig.telemetry().mounts.filter(m=>m.side<0).every(m=>m.elevation<=0),'underside arcs stay below deck');
assert.strictEqual(rig.geometry()[0].vertices,initial[0].vertices,'static hull buffers are reused');
const animated=rig.geometry();assert.strictEqual(animated,initial,'frame batching allocates no replacement array');
assert.ok(animated.every((b,i)=>b.vertices===buffers[i]&&b.basis===bases[i]),'animation changes transforms rather than vertex/GPU buffers');
assert.ok(animated.some((b,i)=>b.basis&&b.basis.some((v,k)=>Math.abs(v-beforeMatrices[i][k])>1e-4)),'GPU rotation bases follow tracking');
for(const b of animated.filter(b=>b.basis)){
 const a=b.basis;for(let i=0;i<3;i++)for(let j=0;j<3;j++){let dot=0;for(let k=0;k<3;k++)dot+=a[i*3+k]*a[j*3+k];assert.ok(Math.abs(dot-(i===j?1:0))<1e-5,'GPU basis stays orthonormal');}
}
for(const b of rig.geometry())for(const value of b.vertices)assert.ok(Number.isFinite(value));
rig.reset();const below=fixture(-250);
for(let i=0;i<300;i++){below.combat.time+=1/60;rig.step(1/60,below);}
assert.ok(rig.telemetry().shots>0&&below.enemy.hp<10000,'ventral batteries engage below the ship');
// A crossing fighter at combat speed must be hit with actual moving projectiles.
rig.reset();const crossing=fixture(220);crossing.enemy.pose.eye=position(-650,-500,220);crossing.enemy.pose.velocity=[0,170,0];
for(let i=0;i<300;i++){
 crossing.combat.time+=1/120;crossing.enemy.pose.eye=crossing.enemy.pose.eye.map((v,k)=>v+crossing.enemy.pose.velocity[k]/120/U);
 rig.step(1/120,crossing);
}
assert.ok(rig.telemetry().hits>=5&&crossing.enemy.hp<10000,'PD intercepts a fighter crossing at 170 m/s');
rig.reset();const blocked=fixture(0);
for(let i=0;i<240;i++)rig.step(1/60,blocked);
assert.equal(rig.telemetry().shots,0,'targets behind the hull plane do not draw fire');
const hit=rig.hit(position(0,-100,0),position(0,100,0));assert.ok(hit);assert.ok(hit[1]<0,'first hull surface wins');
assert.equal(rig.hit(position(0,-100,100),position(0,100,100)),null);
rig.reset();const contact=fixture();contact.state.eye=position(0,-100,0);rig.step(.01,contact);
contact.state.eye=position(0,100,0);rig.step(.01,contact);
assert.equal(rig.telemetry().contacts,1);assert.ok(contact.state.eye[1]<0);assert.equal(contact.state.throttle,0);
rig.reset();assert.equal(rig.telemetry().shots,0);assert.equal(rig.telemetry().seconds,0);
const disabled=fixture();disabled.combat.enabled=false;for(let i=0;i<300;i++)rig.step(1/60,disabled);assert.equal(rig.telemetry().shots,0);
// Cosmetic scorch projection is bounded; projectile damage is never throttled.
const markView=fixture(),fakeModel={id:'mark-test'},savedPacks=DW.shipPackModels;let marks=0;
markView.enemy.collision={kind:'model',modelId:fakeModel.id};
DW.shipPackModels={find:()=>({model:fakeModel}),hullHit:()=>({fraction:.5,point:markView.enemy.pose.eye,local:[0,0,0],normal:[0,0,1],model:fakeModel}),addScorch:()=>{marks++;}};
const bolt={weapon:{...DW.retailWeapons[0],damage:1},age:0,position:position(-1001,0,250),direction:[1,0,0]};
for(let i=0;i<100;i++){markView.combat.time=i*.01;DW.flightSim.trace(markView.combat,position(-1001,0,250),position(-999,0,250),bolt,'player',undefined,markView.state,.25);}
assert.equal(marks,4,'PD marks are limited to four per victim per second');assert.ok(markView.enemy.hp<9950,'all projectile damage is still applied');
DW.flightSim.trace(markView.combat,position(-1001,0,250),position(-999,0,250),bolt,'player',undefined,markView.state);assert.equal(marks,5,'ordinary fighter marks retain existing behavior');
DW.shipPackModels=savedPacks;
console.log('PASS Aegis flight: baked pivots, bounded tracking, upper/lower arcs, real projectile damage, allied safety, hull contact, pause/reset and static buffer reuse');

// Hit accounting reports real damage directly, once per trace, including lethal hits.
const reportView=fixture();let reports=0;
function reportTrace(weapon,terrain){return DW.flightSim.trace(reportView.combat,position(-1001,0,250),position(-999,0,250),{...bolt,weapon},'player',terrain,reportView.state,undefined,()=>reports++);}
reportTrace({...bolt.weapon,damage:0});assert.equal(reports,0,'zero damage does not count');
reportTrace({...bolt.weapon,damage:1},()=>position(-1001,0,250));assert.equal(reports,0,'terrain occlusion does not count');
reportView.enemy.shield=10;reportTrace({...bolt.weapon,damage:1});assert.equal(reports,1,'shield damage counts once');
reportView.enemy.shield=0;reportView.enemy.hp=.01;reportTrace({...bolt.weapon,damage:100});assert.equal(reports,2,'lethal hull damage counts once');
reportTrace({...bolt.weapon,damage:100});assert.equal(reports,2,'dead targets do not count');
// A retained target wins over a newly closer contact, then death triggers reacquisition.
const lockedView=fixture(),lockRig=DW.aegisFlight.create();lockedView.enemy.pose.eye=position(0,0,500);lockedView.combat.enabled=false;
for(let i=0;i<120;i++)lockRig.step(1/60,lockedView);
const lockedAngles=lockRig.telemetry().mounts.map(m=>m.yaw);
const intruder=DW.flightSim.createCraft('closer',DW.arcade.create(0),'enemy');intruder.pose.eye=position(0,100,250);lockedView.combat.enemies.unshift(intruder);
for(let i=0;i<120;i++)lockRig.step(1/60,lockedView);
assert.deepEqual(lockRig.telemetry().mounts.map(m=>m.yaw),lockedAngles,'valid lock is retained despite a nearer contact');
lockedView.enemy.hp=0;for(let i=0;i<120;i++)lockRig.step(1/60,lockedView);
assert.ok(lockRig.telemetry().mounts.some((m,i)=>Math.abs(m.yaw-lockedAngles[i])>.1),'dead lock reacquires');
console.log('PASS Aegis accounting and targeting: shield/lethal/zero/occluded/dead hits, lock retention and reacquisition');

// Capital rounds use the standard allied fighter projectile appearance and speed.
const visibleRig=DW.aegisFlight.create(),visibleView=fixture();
let sawRound=false;
for(let i=0;i<360&&!sawRound;i++){
 visibleView.combat.time+=1/60;visibleRig.step(1/60,visibleView);
 const batches=visibleRig.effects(visibleView.state);
 sawRound=batches.some(b=>b.vertices.length&&b.color[0]===.15&&b.color[1]===1&&b.color[2]===.35);
}
assert.ok(sawRound,'real AA rounds reach renderer in allied fighter green');
console.log('PASS AA projectile appearance: standard green fighter rounds reach the effect renderer');

const originalGunStep=DW.flightGuns.step,capturedWeapons=[];
DW.flightGuns.step=function(guns,pose,weapon,...rest){capturedWeapons.push(weapon);return originalGunStep(guns,pose,weapon,...rest);};
const speedRig=DW.aegisFlight.create();speedRig.step(1/60,fixture());DW.flightGuns.step=originalGunStep;
assert.equal(capturedWeapons.length,12);
for(const weapon of capturedWeapons)for(const key of ['speed','lifetime','length','headRadius','tailRadius'])assert.equal(weapon[key],DW.retailWeapons[0][key],'AA uses standard fighter '+key);
console.log('PASS AA flight tuning: ordinary fighter speed, lifetime and bolt dimensions; predictive unguided firing retained');

// A target jink cannot steer a projectile that has already left the muzzle.
const ballistic=DW.flightGuns.create(),launch=DW.arcade.create(0);launch.eye=[0,0,0];launch.right=[1,0,0];launch.up=[0,0,1];launch.back=[0,-1,0];
let aim=[0,500/U,0];DW.flightGuns.step(ballistic,launch,capturedWeapons[0],true,1/60,undefined,()=>aim);
const launched=ballistic.bolts[0],heading=Array.from(launched.direction),start=Array.from(launched.position);
aim=[300/U,500/U,0];DW.flightGuns.step(ballistic,launch,capturedWeapons[0],false,.1,undefined,()=>aim);
assert.deepEqual(Array.from(launched.direction),heading,'bolts are unguided after target direction changes');
for(let k=0;k<3;k++)assert.ok(Math.abs(launched.position[k]-start[k]-heading[k]*450*.1/U)<1e-10);
console.log('PASS AA ballistics: existing rounds keep their launch heading when the target jinks');

// Independent random acquisition spreads a shared contact list, including farther craft.
const spread=fixture();spread.combat.enabled=false;spread.combat.enemies=[];
for(let i=0;i<4;i++){const e=DW.flightSim.createCraft('spread-'+i,DW.arcade.create(0),'enemy');e.pose.eye=position(0,i*30,350);spread.combat.enemies.push(e);}
const spreadRig=DW.aegisFlight.create();spreadRig.step(1/60,spread);
const locks=spreadRig.telemetry().mounts.map(m=>m.targetId),chosen=new Set(locks.filter(Boolean));
assert.ok(chosen.size>=3,'six upper AA mounts distribute across at least three available enemies');
assert.ok([...chosen].some(id=>id!=='spread-0'),'non-closest targets are eligible');
for(let i=0;i<120;i++)spreadRig.step(1/60,spread);
assert.deepEqual(spreadRig.telemetry().mounts.map(m=>m.targetId),locks,'random acquisition does not cause frame-to-frame retarget jitter');
spreadRig.reset();spreadRig.step(1/60,spread);assert.deepEqual(spreadRig.telemetry().mounts.map(m=>m.targetId),locks,'reset restores reproducible independent random streams');
spread.combat.enemies.find(e=>e.id===locks.find(Boolean)).hp=0;spreadRig.step(1/60,spread);
assert.ok(spreadRig.telemetry().mounts.every(m=>m.targetId!==locks.find(Boolean)),'dead targets release their locks');
console.log('PASS randomized AA acquisition: spread, non-nearest contacts, lock retention, deterministic reset and dead-target replacement');

// Observe real volley times, not the burst implementation's private timers.
const burstView=fixture(),burstRig=DW.aegisFlight.create();burstView.enemy.hp=burstView.enemy.maxHp=1e9;
const fireStep=DW.flightGuns.step,volleys=new Map();let burstNow=0;
DW.flightGuns.step=function(guns,pose,weapon,trigger,...rest){
 const before=guns.fired;const result=fireStep(guns,pose,weapon,trigger,...rest);
 if(guns.fired>before){if(!volleys.has(guns))volleys.set(guns,[]);volleys.get(guns).push(burstNow);}
 return result;
};
for(let i=0;i<720;i++){burstNow=(i+1)/60;burstView.combat.time=burstNow;burstRig.step(1/60,burstView);}
DW.flightGuns.step=fireStep;
assert.ok(volleys.size>=2,'several mounts engage');
for(const times of volleys.values()){
 const groups=[[]];for(const t of times){const group=groups.at(-1);if(group.length&&t-group.at(-1)>.4)groups.push([t]);else group.push(t);}
 assert.ok(groups.some(g=>g.length>=3),'aligned mount fires a short multi-volley burst');
 assert.ok(groups.every(g=>g.length<=5&&g.at(-1)-g[0]<.7),'no sustained continuous fire');
 assert.ok(times.some((t,i)=>i&&t-times[i-1]>.7),'burst followed by a real quiet pause');
}
assert.ok(new Set([...volleys.values()].map(t=>t[0])).size>1,'mounts do not start firing in unison');
const beforePause=burstRig.telemetry();burstRig.step(0,burstView);assert.deepEqual(burstRig.telemetry(),beforePause,'paused clock cannot advance burst or shots');
// Force a large aim change while bursts are active: no mount may fire while turning hard.
const snapshotBeforeTurn=burstRig.telemetry().mounts;
burstView.enemy.pose.eye=position(-600,500,250);
const turnChecks=[];
DW.flightGuns.step=function(guns,pose,weapon,trigger,...rest){turnChecks.push({guns,trigger});return fireStep(guns,pose,weapon,trigger,...rest);};
burstRig.step(1/60,burstView);DW.flightGuns.step=fireStep;
const afterTurn=burstRig.telemetry().mounts.filter(m=>m.kind==='point-defense'),priorTurn=snapshotBeforeTurn.filter(m=>m.kind==='point-defense');
let hardTurns=0;for(let i=0;i<afterTurn.length;i++)if(Math.hypot(afterTurn[i].yaw-priorTurn[i].yaw,afterTurn[i].elevation-priorTurn[i].elevation)*60>.8+1e-8){hardTurns++;assert.equal(turnChecks[i].trigger,false,'hard slewing suppresses burst fire');}
assert.ok(hardTurns>0,'fixture actually induces hard slewing');
console.log('PASS AA bursts: short aligned volleys, quiet gaps, independent timing, pause and hard-slew inhibition');

// A rapidly jinking contact should get occasional imperfect barrel-directed shots,
// not silence or a frame-by-frame stream aimed magically at the intercept.
const showView=fixture(),showRig=DW.aegisFlight.create();showView.enemy.hp=showView.enemy.maxHp=1e9;
const speculativeShots=new Map();let showTime=0;
DW.flightGuns.step=function(guns,pose,weapon,trigger,dt,hitTest,aimPoint,...rest){
 const before=guns.fired;const result=fireStep(guns,pose,weapon,trigger,dt,hitTest,aimPoint,...rest);
 if(guns.fired>before&&!aimPoint){
  assert.equal(guns.fired-before,2,'one twin volley per speculative opportunity');
  if(!speculativeShots.has(guns))speculativeShots.set(guns,[]);speculativeShots.get(guns).push(showTime);
  for(const bolt of guns.bolts.slice(-2))assert.ok(-bolt.direction.reduce((n,v,k)=>n+v*pose.back[k],0)>.9999,'imperfect round follows barrel heading, not a redirected aim point');
 }
 return result;
};
for(let i=0;i<1500;i++){
 showTime=(i+1)/60;showView.combat.time=showTime;
 showView.enemy.pose.eye=position(180*Math.cos(showTime*1.6),180*Math.sin(showTime*1.6),200);
 showView.enemy.pose.velocity=[-288*Math.sin(showTime*1.6),288*Math.cos(showTime*1.6),0];
 showRig.step(1/60,showView);
}
DW.flightGuns.step=fireStep;
assert.ok(speculativeShots.size>0,'jinking target elicits occasional speculative shots');
for(const times of speculativeShots.values()){
 assert.ok(times.length<=9,'opportunistic fire stays sparse over 25 seconds');
 for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=2.8-1/60-1e-8,'long gap separates speculative volleys');
}
const stoppedShow=showRig.telemetry();showRig.step(0,showView);assert.deepEqual(showRig.telemetry(),stoppedShow,'pause freezes speculative fire too');
showView.combat.enabled=false;for(let i=0;i<360;i++)showRig.step(1/60,showView);assert.equal(showRig.telemetry().shots,stoppedShow.shots,'disabled combat suppresses speculative shots');
showView.combat.enabled=true;showView.enemy.pose.eye=position(10000,0,200);const noContactShots=showRig.telemetry().shots;for(let i=0;i<600;i++)showRig.step(1/60,showView);assert.equal(showRig.telemetry().shots,noContactShots,'no speculative fire without an enemy in range');
console.log('PASS speculative AA: sparse twin volleys against jinking targets, barrel-directed flight, long gaps, pause/disable/range guards');

// The baked mixed fit owns both its visible through-bay and its collision opening.
const bay=DW.aegisFlightAsset.hangars[0];assert.ok(bay);
assert.equal(bay.halfHeight,10,'flight opening is reduced to twenty meters high');
assert.ok(new Set(DW.aegisFlightAsset.modules.map(m=>m.type)).size>=3,'default flight hull mixes armored, hangar and utility segments');
const bayRig=DW.aegisFlight.create(),cx=bay.position[0],cz=bay.position[2];
assert.equal(bayRig.hit(position(cx,-100,cz),position(cx,100,cz)),null,'collision passage goes in one side and out the other');
assert.ok(bayRig.hit(position(cx,-100,cz+14),position(cx,100,cz+14)),'upper portion of former opening is now solid');
assert.ok(bayRig.hit(position(cx,-100,cz-14),position(cx,100,cz-14)),'lower portion of former opening is now solid');
assert.ok(bayRig.hit(position(cx+bay.halfWidth+2,-100,cz),position(cx+bay.halfWidth+2,100,cz)),'solid end wall remains');
assert.ok(bayRig.hit(position(cx,0,cz),position(cx,0,cz-40)),'deck blocks movement');
assert.ok(bayRig.hit(position(cx,0,cz),position(cx,0,cz+40)),'ceiling blocks movement');
const passage=fixture();passage.state.eye=position(cx,-100,cz);bayRig.step(.01,passage);passage.state.eye=position(cx,100,cz);bayRig.step(.01,passage);assert.equal(bayRig.telemetry().contacts,0,'player can cross the bay');
const bayView=fixture();bayView.enemy.pose.eye=position(10000,0,200);bayRig.reset(bayView.combat);
for(let i=0;i<65;i++)bayRig.step(1/60,bayView);
const firstLaunch=bayView.combat.enemies.find(e=>e.team==='ally');assert.ok(firstLaunch);assert.ok(firstLaunch.hangarLaunch);assert.ok(firstLaunch.pose.right[0]*firstLaunch.pose.up[2]*-firstLaunch.pose.back[1]>.99,'launch pose retains the flight model handedness');assert.ok(firstLaunch.pose.velocity[1]<0);assert.equal(firstLaunch.pose.eye[0],cx/U);assert.equal(firstLaunch.pose.eye[2],1200+cz/U);
for(let i=0;i<180;i++)bayRig.step(1/60,bayView);
const otherMouth=bayView.combat.enemies.filter(e=>e.team==='ally')[1];assert.ok(otherMouth.pose.velocity[1]>0,'successive craft launch through opposite sides');
for(let i=0;i<2400;i++)bayRig.step(1/60,bayView);
assert.equal(bayView.combat.enemies.filter(e=>e.team==='ally'&&e.hp>0).length,8,'bounded reinforcement wing');
const cappedLaunches=bayRig.telemetry().launches;bayView.combat.enabled=false;for(let i=0;i<360;i++)bayRig.step(1/60,bayView);assert.equal(bayRig.telemetry().launches,cappedLaunches,'disabled combat cannot launch');
bayView.combat.enabled=true;firstLaunch.hp=0;for(let i=0;i<240;i++)bayRig.step(1/60,bayView);assert.equal(bayRig.telemetry().launches,cappedLaunches+1,'lost wingman gets a replacement');
const bayPause=bayRig.telemetry();bayRig.step(0,bayView);assert.deepEqual(bayRig.telemetry(),bayPause);
// Use the real training loop to hold a launched ship straight until clear, then hand off to AI.
vm.runInContext(fs.readFileSync(path.join(root,'experiments/flight-missions.js'),'utf8'),ctx);
const launchCombat=DW.flightSim.create('furball');launchCombat.wave=1;launchCombat.hangarSupport=true;launchCombat.enabled=true;DW.flightSim.bindPlayer(launchCombat,bayView.state);
firstLaunch.hp=firstLaunch.maxHp;firstLaunch.pose.eye=position(cx,0,cz);firstLaunch.pose.velocity=[0,-60,0];firstLaunch.hangarLaunch={remaining:2.2};firstLaunch.fire=false;
const passive=DW.flightSim.createCraft('passive',DW.arcade.create(0),'enemy');passive.pose.eye=position(10000,0,200);passive.controller='input';
launchCombat.enemies=[firstLaunch,passive];
for(let i=0;i<132;i++)DW.flightSim.step(launchCombat,bayView.state,1/60,0);
assert.ok(firstLaunch.pose.eye[1]*U< -125,'craft reaches clear space beyond the hull');
assert.ok(Math.abs(firstLaunch.pose.eye[0]*U-cx)<1e-7&&Math.abs((firstLaunch.pose.eye[2]-1200)*U-cz)<1e-7,'launch path stays straight in the tunnel');
DW.flightSim.step(launchCombat,bayView.state,1/60,0);assert.equal(firstLaunch.hangarLaunch,undefined,'launch phase hands off to normal AI');
launchCombat.enemies=[passive];DW.flightSim.step(launchCombat,bayView.state,1/60,0);assert.equal(launchCombat.roundOver,false,'pending hangar reinforcements keep furball alive without wingmen');
bayRig.reset(bayView.combat);assert.equal(bayRig.telemetry().launches,0);assert.ok(bayView.combat.enemies.every(e=>e.team!=='ally'),'reset restages wingmen instead of leaving old launches');
console.log('PASS Aegis hangars: mixed hull, through collision/deck/walls, alternating launch mouths, bounded replenishment, straight departure, AI handoff and reset');

launchCombat.enemies=[firstLaunch,passive];const survivorPosition=firstLaunch.pose.eye.slice();DW.flightSim.spawn(launchCombat,bayView.state,0);
assert.equal(launchCombat.enemies.filter(e=>e.team==='ally').length,1,'new enemy wave does not teleport in an allied wing');
assert.ok(launchCombat.enemies.includes(firstLaunch),'surviving hangar fighters remain across waves');assert.deepEqual(firstLaunch.pose.eye,survivorPosition);
console.log('PASS hangar wave continuity: survivors remain in flight and fresh allies still require launches');

// The battle facade preserves the single-rig API, with independently moving factions.
const battle=DW.aegisFlight.createBattle(),battleView=fixture();
battleView.combat.enemies=[];battleView.state.eye=position(0,-5000,1000);
const battleStart=battle.telemetry(),battleGeometry=battle.geometry(),half=battleGeometry.length/2;
assert.equal(battleStart.mounts.length,48);
assert.equal(battleStart.capitals.length,2);
assert.equal(battleStart.capitals[1].team,'enemy');
assert.equal(battleStart.capitals[1].heading,Math.PI,'red ship faces the opposite direction');
assert.ok(battleGeometry.slice(0,half).every((b,i)=>b.vertices===battleGeometry[i+half].vertices),'both ships share immutable GPU mesh buffers');
assert.ok(battleGeometry.slice(0,half).some((b,i)=>b.color.some((v,k)=>v!==battleGeometry[i+half].color[k])),'red ship has its own illuminated livery');
const hullPaint=battleGeometry.slice(0,half).findIndex(b=>Math.max(...b.color)>.28&&b.color[0]>b.color[2]*1.12&&b.color[1]>b.color[2]*1.08);
assert(hullPaint>=0);assert(battleGeometry[hullPaint+half].color[0]>battleGeometry[hullPaint+half].color[1]*2,'red faction paints major armor rather than only gun barrels');
battleGeometry.slice(0,half).forEach((b,i)=>{if(Math.max(...b.color)<=.28)assert.deepEqual(battleGeometry[i+half].color,b.color,'dark machinery stays neutral across liveries');});
const bakedWindows=DW.aegisFlightAsset.interiors.find(b=>b.kind==='windows');
assert.equal(bakedWindows.finish.atlas,'belt-atlas.png');assert(bakedWindows.vertices.length<480*216,'baked belts replace individual window boxes');
assert.equal(bakedWindows.finish.uv.length,bakedWindows.vertices.length/3,'every baked window vertex has UVs');
const redSurface=battle.hit(position(120,1400,180),position(120,1600,180));
assert.ok(redSurface&&redSurface[1]<1500/U,'collision includes the opposing capital');
let greenBolts=false,redBolts=false;
const heavyEvents=Array.from({length:48},()=>[]),aimPoints=new Set();let previousMountShots=Array(48).fill(0);
for(let i=0;i<2400;i++){
 battleView.combat.time+=1/60;battle.step(1/60,battleView);
 const report=battle.telemetry();report.mounts.forEach((m,k)=>{if(m.kind==='heavy'){aimPoints.add(m.aimPoint.join(','));if(m.shots>previousMountShots[k])heavyEvents[k].push(i/60);}previousMountShots[k]=m.shots;});
 if(i%30===0){const effects=battle.effects(battleView.state);greenBolts ||= effects.some(b=>b.color[1]===1&&b.vertices.length>0);redBolts ||= effects.some(b=>b.color[0]===1&&b.color[1]===.12&&b.vertices.length>0);}
}
const fought=battle.telemetry();
assert.ok(fought.capitals.every(c=>c.shots>20&&c.hits>10),'both main-battery banks fire and physically hit the opposing hull');
assert.ok(greenBolts&&redBolts,'both factions submit visible team-colored projectiles');
assert.ok(aimPoints.size>12,'main batteries independently scatter and renew their hull aim points');
for(let axis=0;axis<3;axis++){const values=[...aimPoints].map(p=>Number(p.split(',')[axis]));assert.ok(Math.max(...values)-Math.min(...values)>[500,40,35][axis],'aim points spread continuously over each hull axis');}
assert.ok(new Set(heavyEvents.filter(e=>e.length).map(e=>e[0])).size>=6,'initial main-battery salvos are independently staggered');
for(const events of heavyEvents){let volleys=0;for(let i=0;i<events.length;i++){if(i===0||events[i]-events[i-1]>1.2)volleys=0;volleys++;assert.ok(volleys<=2,'desynchronizing preserves at most two twin volleys per burst');if(i)assert.ok(events[i]-events[i-1]>=.54,'main-gun cyclic fire rate stays unchanged');}}
assert.ok(fought.mounts.filter(m=>m.kind==='heavy').every(m=>m.targetId.startsWith('capital-')),'main guns exclusively track capitals');
assert.ok(fought.mounts.filter(m=>m.kind==='point-defense').every(m=>m.targetId===''),'AA does not substitute a capital target');
assert.equal(fought.capitals[0].integrity,20000-fought.capitals[1].hits*20,'red hits reduce green integrity exactly once');
assert.equal(fought.capitals[1].integrity,20000-fought.capitals[0].hits*20,'green hits reduce red integrity exactly once');
assert.equal(battleView.combat.flashes.length,fought.capitals.reduce((n,c)=>n+c.hits,0),'every main-battery hull hit emits one explosion');
assert.ok(battleView.combat.flashes.every(f=>f.destruction&&f.age===0&&f.scale===5&&f.velocity.every(Number.isFinite)),'capital impacts reuse fighter destruction animation at a smaller scale, with inherited scene-space velocity');
assert.ok(battleView.combat.flashes.some(f=>f.velocity[0]>0)&&battleView.combat.flashes.some(f=>f.velocity[0]<0),'explosions drift with either struck hull');
assert.equal(view.combat.flashes.filter(f=>f.destruction).length,0,'ordinary AA hits do not create destruction explosions');
assert.ok(fought.capitals.every((c,i)=>Math.hypot(...c.position.map((v,k)=>v-battleStart.capitals[i].position[k]))*U>100),'both capitals slowly maneuver');
assert.ok(fought.capitals.every((c,i)=>Math.abs(c.heading-battleStart.capitals[i].heading)>.01),'heading and hull orientation change together');
assert.strictEqual(battle.geometry(),battleGeometry,'battle geometry keeps a stable batching array');
assert.ok(battleGeometry.every((b,i)=>b.vertices===battleGeometry[i%half].vertices),'movement never replaces shared vertex buffers');
battle.reset();assert.deepEqual(battle.telemetry(),battleStart,'reset restores both transforms, integrity, weapons and timers');
// The zone-defense sortie keeps its existing squadrons and positions capitals
// in the real sortie frame instead of the high-altitude standalone sandbox.
const zoned=fixture(),zonedRig=DW.aegisFlight.createBattle({battlefield:true});
zoned.state.eye=[0,-3250/U,0];zoned.combat.player.pose=zoned.state;
const roster=zoned.combat.enemies.slice();zonedRig.reset(zoned.combat);
assert.deepEqual(zoned.combat.enemies,roster,'capital reset preserves zone fighters');
assert.ok(!zoned.combat.hangarSupport,'zone sortie does not acquire standalone hangar ownership');
const placed=zonedRig.telemetry().capitals;
assert.ok(placed[0].position.every((v,k)=>Math.abs(v-[-1100/U,(-3250+1800)/U,300/U][k])<1e-10));
assert.ok(placed[1].position.every((v,k)=>Math.abs(v-[1100/U,(-3250+2100)/U,650/U][k])<1e-10));
const toward=placed[1].position.map((v,k)=>v-placed[0].position[k]),horizontal=Math.hypot(toward[0],toward[1]);
placed.forEach((capital,i)=>{const sign=i===0?1:-1,bow=[-Math.cos(capital.heading),-Math.sin(capital.heading)];assert.ok(Math.abs((bow[0]*toward[0]+bow[1]*toward[1])*sign/horizontal-Math.cos(Math.PI/9))<1e-10,'bows face the opponent with twenty degrees of turret clearance');});
const zoneMeshes=zonedRig.geometry(),zoneVertices=zoneMeshes.map(b=>b.vertices);
for(let i=0;i<600;i++){zoned.combat.time+=1/60;zonedRig.step(1/60,zoned);}
assert.ok(zonedRig.telemetry().capitals.every(c=>c.shots>0&&c.hits>0),'both battlefield capitals exchange real main-battery hits');
assert.ok(zonedRig.geometry().every((b,i)=>b.vertices===zoneVertices[i]),'battlefield movement retains GPU buffers');
zonedRig.reset(zoned.combat);assert.deepEqual(zonedRig.telemetry().capitals.map(c=>c.position),placed.map(c=>c.position));
console.log('PASS zone-defense capitals: sortie-relative placement, real battery fire, stable buffers, reset and preserved fighter ownership');
const pausedBattle=fixture();pausedBattle.combat.enabled=false;pausedBattle.combat.enemies=[];
for(let i=0;i<600;i++)battle.step(1/60,pausedBattle);
assert.equal(battle.telemetry().shots,0,'combat-disabled capitals never fire');
// A rotated hostile AA mount uses world-space barrels, enemy damage and red bolts.
const hostileView=fixture();hostileView.state.eye=position(0,-5000,1000);hostileView.enemy.team='ally';hostileView.enemy.pose.eye=position(0,-500,250);
const friendly=DW.flightSim.createCraft('red-friendly',DW.arcade.create(0),'enemy');friendly.pose.eye=position(0,-300,250);friendly.hp=10000;hostileView.combat.enemies.push(friendly);
const hostileRig=DW.aegisFlight.create({state:{team:'enemy',position:[0,0,1200],heading:Math.PI/2,velocity:[0,0,0],integrity:20000},opponent:{team:'ally',position:position(0,10000,0),heading:0,velocity:[0,0,0],integrity:20000}});
for(let i=0;i<600;i++){hostileView.combat.time+=1/60;hostileRig.step(1/60,hostileView);}
assert.ok(hostileRig.telemetry().hits>0&&hostileView.enemy.hp<10000,'rotated hostile AA aims and damages allied fighters');
assert.equal(friendly.hp,10000,'hostile AA ignores its own team');
assert.ok(hostileRig.telemetry().mounts.filter(m=>m.kind==='point-defense').every(m=>m.targetId!=='red-friendly'),'hostile locks remain faction-correct');
console.log('PASS capital battle: two factions, shared GPU buffers, moving/rotating hulls, heavy intercepts and actual damage, colored rounds, hostile AA, reset and combat disable');

// Scenery traverses both charts indefinitely without firing or allocating meshes.
const patrol=DW.aegisFlight.createEllisPatrol(),patrolBatches=patrol.geometry(),patrolBuffers=patrolBatches.map(b=>b.vertices);
assert.equal(patrolBatches[0].region,0);
assert(patrolBatches.every(b=>b.lensCenter===patrolBatches[0].origin&&b.lensRadius>650),'all capital materials share one complete-hull optical image');
assert.equal(patrolBatches.reduce((n,b)=>n+b.vertices.length,0),initial.reduce((n,b)=>n+b.vertices.length,0),'material batching preserves all hull and turret triangles');
assert.equal(patrolBatches.length,new Set(DW.aegisFlightAsset.batches.map(b=>b.color.join(','))).size+(DW.aegisFlightAsset.interiors||[]).length+1,'one draw per compatible hull material plus separate interior textures');
const localX=patrolBatches.flatMap(b=>Array.from(b.vertices).filter((v,i)=>i%6===0));
assert((localX.reduce((a,b)=>Math.max(a,b),-Infinity)-localX.reduce((a,b)=>Math.min(a,b),Infinity))*U>1300,'batching preserves authored metre-scale length and pivots');
assert.equal(patrol.telemetry().capitals[0].position[1]*U,-8000);
let crossings=0,lastRegion=0,turning=false,lastProper=patrolBatches[0].lensTransit.proper;
for(let i=0;i<24000;i++){
 patrol.step(.05,view);
 const batches=patrol.geometry(),region=batches[0].region,ship=patrol.telemetry().capitals[0];
 const proper=batches[0].lensTransit.proper,travel=Math.abs(proper-lastProper);lastProper=proper;
 assert(travel<1e-7||Math.abs(travel-9)<1e-7,'patrol advances at 180 m/s in proper distance, including throat transit');
 assert(batches.every(b=>b.lensTransit===batches[0].lensTransit),'all material batches share intrinsic hull placement');
 if(region!==lastRegion){assert(Math.abs(proper)<9.000001);crossings++;lastRegion=region;assert(Math.abs(ship.position[1]*U+2000)<310,'crosses along throat axis');}
 assert(Math.abs(ship.position[0]*U-region*12000)<1e-7);
 assert(Math.abs(ship.position[2]*U-1550)<1e-7);
 assert(batches.every((b,k)=>b.vertices===patrolBuffers[k]&&b.region===region&&b.lensCenter===patrolBatches[0].origin));
 assert.equal(batches[0].basis[8],region===1?-1:1,'capital transports transverse hull axes across the throat');
 const firstBasis=Array.from(batches[0].basis);patrol.geometry();assert.deepEqual(Array.from(batches[0].basis),firstBasis,'repeated geometry reads do not accumulate chart rotations');
 if(Math.abs(Math.cos(ship.heading))>.1)turning=true;
}
assert(crossings>=10,'patrol repeatedly crosses outward and back');assert(turning,'turns between passes');
assert.equal(patrol.telemetry().shots,0);assert.equal(patrol.hit([0,0,0],[1,1,1]),null);
const patrolTime=patrol.telemetry().seconds;patrol.step(0,view);assert.equal(patrol.telemetry().seconds,patrolTime);
patrol.reset();assert.equal(patrol.geometry()[0].region,0);assert.equal(patrol.telemetry().seconds,0);
console.log('PASS Ellis capital patrol: repeated centerline crossings, turnarounds, region ownership, reset and immutable mesh reuse');

// The optimized representation belongs to the shared ship factory, independent of maps.
const sourceAsset=DW.aegisFlightAsset;
function sceneryShip(x=0,heading=0){const state={team:'ally',position:[x,0,1200],heading,velocity:[0,0,0],integrity:20000};return DW.aegisFlight.create({state,opponent:state,unarmed:true});}
const idleOne=sceneryShip(),idleTwo=sceneryShip(700,1.2),idleGeometry=idleOne.geometry(),idleOther=idleTwo.geometry();
assert(idleGeometry.every((b,i)=>b.vertices===idleOther[i].vertices),'all maps and instances reuse the prepared unarmed asset buffers');
assert(idleGeometry.every((b,i)=>b.origin!==idleOther[i].origin&&b.basis!==idleOther[i].basis),'shared geometry never shares actor poses');
assert(idleGeometry.every((b,i)=>b.vertices===patrol.geometry()[i].vertices),'Ellis consumes the common optimized asset');
assert(idleGeometry.length<initial.length,'generic unarmed factory receives material batching without mission code');
const expectedIdle=new Map();
function expectedPart(b,pivot){const key=b.color.join(',');if(!expectedIdle.has(key))expectedIdle.set(key,[]);const out=expectedIdle.get(key);for(let i=0;i<b.vertices.length;i++)out.push(i%6<3?(b.vertices[i]+pivot[i%6])/U:b.vertices[i]);}
sourceAsset.batches.forEach(b=>expectedPart(b,[0,0,0]));sourceAsset.turrets.forEach(t=>t.batches.forEach(b=>expectedPart(b,t.position)));
for(const b of idleGeometry.slice(0,idleGeometry.length-(sourceAsset.interiors||[]).length-1)){const expected=expectedIdle.get(b.color.join(','));assert.equal(b.vertices.length,expected.length);for(let i=0;i<expected.length;i++)assert(Math.abs(b.vertices[i]-expected[i])<1e-5,'all authored vertices, pivot offsets and normals survive shared batching');}
const engineExpected=[];for(const e of sourceAsset.engines)for(const b of e.batches)for(let i=0;i<b.vertices.length;i++)engineExpected.push(i%6<3?(b.vertices[i]+e.position[i%6])/U:b.vertices[i]);
assert.equal(idleGeometry.at(-1).vertices.length,engineExpected.length);engineExpected.forEach((v,i)=>assert(Math.abs(v-idleGeometry.at(-1).vertices[i])<1e-5,'all nozzle vertices and normals survive idle batching'));
const noWeapons=fixture();noWeapons.combat.hangarSupport=true;idleOne.reset(noWeapons.combat);
for(let i=0;i<120;i++)idleOne.step(1/60,noWeapons);
assert.equal(idleOne.telemetry().shots,0);assert.equal(idleOne.telemetry().launches,0,'unarmed factory disables hangar launches');
assert.equal(DW.aegisFlight.create().geometry()[0].vertices,initial[0].vertices,'idle preparation preserves armed resource sharing');
DW.aegisFlightAsset={...sourceAsset};const revisedIdle=sceneryShip().geometry();assert.notEqual(revisedIdle[0].vertices,idleGeometry[0].vertices,'asset revision invalidates prepared resources');DW.aegisFlightAsset=sourceAsset;
assert.equal(sourceAsset.turrets.length,24,'authoring hierarchy and armed pivots remain intact');
console.log('PASS shared capital optimization: map-independent factory, cross-instance buffers, independent poses, exact authored geometry and revision invalidation');

// Component health follows the articulated asset, with finalized-impact routing.
const systemsRig=DW.aegisFlight.create(),systemsView=fixture();
const systemsBefore=systemsRig.geometry().map(b=>b.vertices);
assert.equal(systemsRig.components().length,29);
assert.equal(systemsRig.damage([99999,99999,99999],500,systemsView.combat),false,'asteroid impacts cannot damage a distant ship');
for(const turret of sourceAsset.turrets){
 const p=turret.position,side=turret.side;
 const a=position(p[0],p[1],p[2]+side*80),b=position(p[0],p[1],p[2]-side*2);
 const surface=systemsRig.hit(a,b);assert(surface,'every authored mount exposes a collision surface');
 const id='capital-ally-'+turret.id;
 assert.equal(systemsRig.components().find(p=>p.id===id).hp,systemsRig.components().find(p=>p.id===id).maxHp,'queries never damage mounts');
 assert(systemsRig.damage(surface,1000,systemsView.combat));
 assert.equal(systemsRig.components().find(p=>p.id===id).hp,0,'each individual gun can be destroyed');
}
for(const engine of sourceAsset.engines){
 const p=engine.position,surface=systemsRig.hit(position(750,p[1],p[2]),position(600,p[1],p[2]));assert(surface);
 assert(systemsRig.damage(surface,1000,systemsView.combat));
 assert.equal(systemsRig.components().find(p=>p.id==='capital-ally-'+engine.id).hp,0,'each rear drive can be destroyed');
}
assert.equal(systemsView.combat.flashes.length,29,'one explosion per system');
systemsRig.damage(systemsRig.components()[0].position,1000,systemsView.combat);
assert.equal(systemsView.combat.flashes.length,29,'wrecks never explode twice');
const burned=systemsRig.geometry();assert(burned.some(b=>b.stride===8),'destroyed modules receive persistent local scorch UVs');
const burnedBuffers=burned.map(b=>b.vertices);systemsRig.geometry();assert(burned.every((b,i)=>b.vertices===burnedBuffers[i]),'wreck geometry is cached across frames');
for(let i=0;i<300;i++)systemsRig.step(1/60,systemsView);
assert.equal(systemsRig.telemetry().shots,0,'destroyed guns cannot fire');
systemsRig.reset();assert(systemsRig.components().every(p=>p.hp===p.maxHp));assert(systemsRig.geometry().every((b,i)=>b.vertices===systemsBefore[i]&&!b.stride),'reset restores shared intact geometry');
const crippled=DW.aegisFlight.createBattle(),crippledView=fixture();
crippled.components().filter(p=>p.kind==='engine'&&p.id.startsWith('capital-enemy-')).forEach(p=>crippled.damage(p.position,1000,crippledView.combat));
const stopped=crippled.telemetry().capitals[1];for(let i=0;i<120;i++)crippled.step(1/120,crippledView);
assert.deepEqual(crippled.telemetry().capitals[1].position,stopped.position,'loss of all five engines stops patrol translation');
assert.equal(crippled.telemetry().capitals[1].heading,stopped.heading,'loss of all engines stops powered turns');
assert.notDeepEqual(crippled.telemetry().capitals[0].position,battleStart.capitals[0].position,'undamaged opponent continues moving');
// Terrain callbacks fire only after nearest fighter/hull resolution, never on a probe.
const impactView=fixture(),impactBolt={...bolt,weapon:{...DW.retailWeapons[0],damage:1}};let finalized=0;
const surfaceTrace=()=>position(-998,0,250);surfaceTrace.onImpact=()=>finalized++;
DW.flightSim.convergencePoint(impactView.combat,impactView.combat.player,impactBolt.weapon,surfaceTrace);assert.equal(finalized,0);
DW.flightSim.trace(impactView.combat,position(-1001,0,250),position(-997,0,250),impactBolt,'player',surfaceTrace,impactView.state);assert.equal(finalized,0,'a nearer fighter occludes component damage');
impactView.enemy.hp=0;DW.flightSim.trace(impactView.combat,position(-1001,0,250),position(-997,0,250),impactBolt,'player',surfaceTrace,impactView.state);assert.equal(finalized,1,'final environment impact damages exactly once');
console.log('PASS capital systems: all 24 guns + 5 engines, localized destruction, disabled firing, engine consequences, cached wrecks, reset, probe/occlusion safety');

// Production capital shield feedback is driven only by finalized damage.
for(const file of ['assets/ships/aegis-kit/shield-envelope.js','experiments/combat-shields.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
const glowState={team:'ally',position:[0,0,1200],heading:0,velocity:[0,0,0],integrity:20000},glowRig=DW.aegisFlight.create({state:glowState,opponent:glowState}),glowView=fixture();glowView.combat.enabled=false;
assert.equal(glowRig.effects(glowView.state).filter(b=>b.color[0]!==.25).flatMap(b=>Array.from(b.vertices)).length,0,'no idle shield geometry');
const glowPoint=glowRig.hit(position(-2000,0,0),position(2000,0,0),{weapon:DW.retailWeapons[0],direction:[1,0,0],position:position(-2000,0,0),age:0});assert.ok(glowPoint);assert.equal(glowRig.effects(glowView.state).filter(b=>b.color[0]!==.25).filter(b=>b.vertices.length).length,0,'collision probes never spawn shield effects');
assert.ok(glowRig.damage(glowPoint,5,glowView.combat));assert.equal(glowState.integrity,19995,'shield visuals preserve damage rules');glowRig.step(.1,glowView);
const glowBatch=glowRig.effects(glowView.state).filter(b=>b.color[0]!==.25).filter(b=>b.color[2]===1&&b.color[0]===.035);assert.ok(glowBatch.length);assert.ok(glowBatch.every(b=>b.vertices.every(Number.isFinite)));assert.equal(glowRig.effects(glowView.state,false).filter(b=>b.color[0]!==.25).filter(b=>b.vertices.length).length,0,'shield override does not fabricate weapon effects');
for(let i=0;i<8;i++)glowRig.step(.1,glowView);assert.equal(glowRig.effects(glowView.state).filter(b=>b.color[0]!==.25).filter(b=>b.vertices.length).length,0,'capital waves expire');glowRig.reset();assert.equal(glowRig.effects(glowView.state).filter(b=>b.color[0]!==.25).filter(b=>b.vertices.length).length,0,'reset clears transient history');
console.log('PASS default capital shields: finalized hull damage, preserved integrity, no probe/idle feedback, expiry and reset');

// Capital exhaust reuses the fighter effect and respects independent engine damage.
const flameState={team:'ally',position:[12,34,1200],heading:Math.PI/2,velocity:[0,0,0],integrity:20000};
const flameRig=DW.aegisFlight.create({state:flameState,opponent:flameState});
const flameBatch=()=>flameRig.effects(glowView.state,false).find(b=>b.color[0]===.25);
assert.equal(flameBatch().vertices.length,5*12*6,'two six-vertex flame cards per capital nozzle');
assert.ok(flameBatch().vertices.every(Number.isFinite));
const engines=flameRig.components().filter(p=>p.kind==='engine');
assert.ok(flameRig.damage(engines[0].position,1000,glowView.combat));
assert.equal(flameBatch().vertices.length,4*12*6,'destroyed engine loses its flame');
flameState.integrity=0;
assert.equal(flameBatch().vertices.length,0,'destroyed hull loses all flames');
console.log('PASS capital exhaust: nozzle count, finite rotated geometry, individual engine and hull destruction');
