'use strict';
const assert=require('node:assert/strict'),{createFlight,dt}=require('../tools/headless.cjs');
const flight=createFlight({mission:'ellis',enabled:false}),DW=flight.DW,U=DW.sim.METERS_PER_UNIT,g=DW.flightGuns;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),add=(a,b)=>a.map((x,i)=>x+b[i]),scale=(a,s)=>a.map(x=>x*s),sub=(a,b)=>a.map((x,i)=>x-b[i]),unit=a=>scale(a,1/Math.hypot(...a));
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const point=(x,y,z=1550)=>[x/U,y/U,z/U];
function pose(eye,region=0,velocity=[0,0,0]){return {eye,region,velocity,right:[1,0,0],up:[0,0,1],back:[0,-1,0]};}
// Independent specular/antipodal oracle in metres. No production transport calls.
function oracle(start,velocity,time,region){
 const O=start.map((x,i)=>x*U-[region*12000,-2000,1550][i]),V=scale(velocity,time),A=dot(V,V),B=dot(O,V),C=dot(O,O)-90000,D=B*B-A*C;
 let p=add(start.map(x=>x*U),V),side=region;
 if(A>0&&B<0&&D>=0){const t=(-B-Math.sqrt(D))/A;if(t>=0&&t<=1){const e=add(O,scale(V,t)),n=scale(e,1/300),remaining=scale(V,1-t),out=sub(scale(n,2*dot(n,remaining)),remaining);side=1-region;p=add([side*12000,-2000,1550],sub(out,e));}}
 return {point:p.map(x=>x/U),region:side};
}
// Forward live ray, independent of the inverse finite-source image solve.
function optical(start,direction,distance,region){const ray=DW.ellisOptics.ray(start.map(v=>v*U),direction,region);DW.ellisOptics.advanceRay(ray,distance*U);return {point:ray.eye.map(v=>v/U),region:ray.region,ray};}
for(const side of [0,1])for(const R of [301,350,600])for(const S of [301,400,900])for(const fraction of [0,.25,.8]){
 const limit=Math.PI-Math.asin(300/R)-Math.asin(300/S),angle=limit*fraction,eye=point(side*12000,-2000-R),target=point((1-side)*12000+S*Math.sin(angle),-2000+S*Math.cos(angle));
 const path=g.ballisticPath(eye,target,side,1-side,true);assert(path);
 const end=optical(eye,path.direction,path.distance,side);assert.equal(end.region,1-side);
 assert(Math.hypot(...sub(end.point,target))*U<.5,'image inverse agrees with forward optical projectile transport');
}
console.log('PASS ballistic bridge routes: image-to-forward-ray agreement, off-axis and near-throat, both directions');
const weapon={...flight.config.weapon,speed:450,lifetime:4};
for(const side of [0,1])for(const spec of [
 {eye:[0,-2350],target:[0,-2301],remote:false,velocity:[0,150,0]},
 {eye:[0,-2350],target:[0,-1699],remote:true,velocity:[0,-150,0]},
 {eye:[0,-2302],target:[20,-1660],remote:true,velocity:[-40,70,15]},
 {eye:[100,-2400],target:[-20,-2500],remote:false,velocity:[40,50,-10]},
 {eye:[0,-2400],target:[30,-1600],remote:true,velocity:[20,40,0]},
 {eye:[0,-2400],target:[30,-1600],remote:true,velocity:[0,260,0]},
 {eye:[0,-2400],target:[30,-2600],remote:false,velocity:[0,-260,0]}
]){
 const shooter=pose(point(side*12000+spec.eye[0],spec.eye[1]),side,[80,-20,10]),target=pose(point((spec.remote?1-side:side)*12000+spec.target[0],spec.target[1]),spec.remote?1-side:side,spec.velocity),lead=g.lead(shooter,target,weapon,true);
 assert(lead,'reachable near-mouth moving target has a firing solution');
 const targetEnd=oracle(target.eye,target.velocity,lead.time,target.region),boltEnd=optical(shooter.eye,lead.direction,lead.distance,side);
 assert.equal(boltEnd.region,targetEnd.region);assert(Math.hypot(...sub(boltEnd.point,targetEnd.point))*U<.5);
 assert(Math.abs((lead.distance*U-Math.min(4,lead.distance*U/2))/weapon.speed-lead.time)<1e-5,'flight time includes muzzle launch offset and no inherited shooter speed');
}
const long=g.lead(pose(point(0,-4000)),pose(point(0,-6000),0,[0,-100,0]),{...weapon,lifetime:8},false);assert(long&&long.time>2);assert(Math.abs(long.time-(2000-4)/350)<1e-5,'future point is not clamped to two seconds');
assert.equal(g.lead(pose(point(0,-2400)),pose(point(0,-6000)),weapon,false),null,'outside lifetime has no false pip');
assert.equal(g.lead(pose(point(0,-2400)),pose(point(12000,-2400),1),weapon,true),null,'unreachable remote hemisphere has no false pip');
console.log('PASS truthful lead: moving targets crossing either way, lifetime rejection, muzzle timing and absolute target velocity');

// Fire the real player guns at the solution through the actual fixed-step session.
function shoot({side=0,remote=true,shooterX=0,shooterY=-2350,targetY=-1660,targetX=0,velocity=[0,0,0],miss=false,movingShooter=false,detailed=false,visible=false}){
 const f=createFlight({mission:'ellis'}),D=f.DW,u=D.sim.METERS_PER_UNIT,s=f.snapshot(),region=remote?1-side:side;
 Object.assign(s.state,{region:side,eye:point(side*12000+shooterX,shooterY),velocity:movingShooter?[20,70,0]:[0,0,0],angularVelocity:[0,0,0]});
 const initial=point(region*12000+targetX,targetY),target=D.training.createCraft('pip-target',Object.assign(D.arcade.create(0),pose(initial,region,velocity)),'enemy');target.hp=target.maxHp=1000;target.shield=0;target.maxShield=0;target.collision={kind:'sphere',radiusM:7};
 s.combat.enemies=[target];s.combat.targetId=target.id;s.combat.targetLocked=true;
 if(detailed)D.training.configureHulls(s.combat,'mixed','mixed');
 const solution=D.training.firingSolution(s.combat,s.combat.player,target,f.config.weapon);assert(solution);
 let forward=visible?Array.from(D.ellisOptics.primary(s.state.eye.map(v=>v*u),target.pose.eye.map(v=>v*u),side,region).direction):Array.from(solution.direction);
 if(visible){assert(Math.hypot(...sub(forward,solution.direction))<.0001,'stationary visible hull and lead share one direction');}
 if(miss)forward=unit(add(forward,[.65,0,0]));
 s.state.back=scale(forward,-1);s.state.right=unit(cross(forward,[0,0,1]));s.state.up=cross(s.state.right,forward);
 if(visible){s.combat.targetId=null;s.combat.targetLocked=false;f.session.acquireTarget();assert.equal(s.combat.targetId,target.id,'aiming at the visible image acquires it across charts');}
 const before=target.hp;let time=0;
 for(let i=0;i<Math.ceil((solution.time+.15)/dt);i++){
  time+=dt;const p=oracle(initial,velocity,time,region);target.pose.eye=p.point;target.pose.region=p.region;
  if(p.region!==region){const moved=oracle(initial,velocity,time+.001,region);target.pose.velocity=scale(sub(moved.point,p.point),u/.001);}
  f.advance(dt,{stop:!movingShooter,throttle:movingShooter?.4:0,fire:i===0});
 }
 assert(s.guns.fired>0);if(miss)assert.equal(target.hp,before,'off-pip fire is not silently steered onto the target');else assert(target.hp<before,'crosshair on actual lead damages target through the mouth');
 return f;
}
for(const side of [0,1]){
 shoot({side});shoot({side,shooterY:-2302,targetY:-1690,targetX:0});
 shoot({side,remote:false,targetY:-2301,velocity:[0,150,0]});
 shoot({side,targetY:-1699,velocity:[0,-150,0]});
 shoot({side,targetX:25,velocity:[30,40,0],movingShooter:true});
 shoot({side,targetX:25,velocity:[30,40,0],miss:true});
}
console.log('PASS headless pip-to-hit: real sessions, twin muzzles across throat, moving shooter/target, both target transit directions and off-pip misses');

// Split a single fast tick at the mouth: collisions beyond the exit must not wait.
const f=createFlight({mission:'ellis'}),s=f.snapshot(),target=f.DW.training.createCraft('exit-hit',Object.assign(f.DW.arcade.create(0),pose(point(12000,-1688),1)),'enemy');target.hp=1000;target.shield=0;target.collision={kind:'sphere',radiusM:2};s.combat.enemies=[target];
Object.assign(s.state,{region:0,eye:point(0,-2400),velocity:[0,0,0]});
s.guns.bolts.push({region:0,position:point(0,-2301),direction:[0,1,0],age:0,weapon:{...f.config.weapon,speed:18000}});
f.advance(dt,{stop:true});assert(target.hp<1000,'same-tick post-transit leg hits the remote hull');
assert(s.guns.impacts.some(x=>x.region===1),'impact belongs to destination chart');
console.log('PASS physical projectile transit: source/exit collision legs and destination impact region');

for(const side of [0,1])for(const incoming of [false,true]){
 const f=createFlight({mission:'ellis'}),D=f.DW,s=f.snapshot(),region=incoming?1-side:side,sign=incoming?-1:1;
 Object.assign(s.state,{region:side,eye:point(side*12000,-2350),velocity:[0,60,0],ramp:[0,0,60],rates:[0,0,0]});
 const target=D.training.createCraft('maneuvering-target',Object.assign(D.arcade.create(0),pose(point(region*12000,incoming?-1699:-2301),region,[0,sign*70,0])),'enemy');
 target.profile={...target.profile,maxVelocity:[...target.profile.maxVelocity.slice(0,2),70]};target.pose.ramp=[0,0,70];target.pose.throttle=1;target.pose.back=[0,-sign,0];target.pose.right=[sign,0,0];target.hp=1000;target.shield=0;target.maxShield=0;s.combat.enemies=[target];s.combat.targetId=target.id;s.combat.targetLocked=true;
 const solution=D.training.firingSolution(s.combat,s.combat.player,target,f.config.weapon);assert(solution);
 s.state.back=scale(Array.from(solution.direction),-1);s.state.right=unit(cross(Array.from(solution.direction),[0,0,1]));s.state.up=cross(s.state.right,Array.from(solution.direction));
 let crossed=false;
 for(let i=0;i<Math.ceil((solution.time+.2)/dt);i++){
  const before=Array.from(target.pose.eye);D.training.stepInput(target,{throttle:1,throttleRate:0,fire:false,yaw:.35,pitch:.2,roll:.1},dt);
  const transit=D.flightGuns.crossBridge(before,target.pose.eye,target.pose.region||0);
  if(transit){crossed=true;target.pose.region=1-(target.pose.region||0);target.pose.eye=transit.eye;for(const key of ['right','up','back','velocity'])target.pose[key]=D.flightGuns.bridgeVector(target.pose[key],transit.normal);}
  f.advance(dt,{throttle:.5,yaw:.2,pitch:-.1,roll:.15,fire:i===0});
 }
 assert(crossed,'target actually traverses the mouth while turning');assert(target.hp<1000,'on-pip volley hits during simultaneous shooter/target maneuvering');
}
console.log('PASS close-throat maneuvers: real flight integration, held yaw/pitch/roll, moving shooter and target crossings in both charts');

const ally=DW.training.createCraft('friendly',Object.assign(DW.arcade.create(0),pose(point(0,-2330))),'ally');
assert.equal(DW.training.firingSolution(flight.snapshot().combat,flight.snapshot().combat.player,ally,weapon),null,'friendly contacts cannot advertise a damaging shot');
console.log('PASS lead eligibility: no firing pip for friendly/non-damageable contact');

// A witness for the old pip: straight-chart extrapolation misses by tens of
// metres once a target crosses, although the new physical lead remains hittable.
const witnessEye=point(180,-2350),witnessTarget=point(0,-2301),witnessVelocity=[50,150,0];
const old=DW.training.intercept(witnessEye,witnessTarget,scale(witnessVelocity,1/U),450/U),oldDirection=unit(sub(old.point,witnessEye));let oldMiss=Infinity;
for(let time=0;time<1;time+=.0005){const bolt=oracle(witnessEye,scale(oldDirection,4+450*time),1,0),target=oracle(witnessTarget,witnessVelocity,time,0);if(bolt.region===target.region)oldMiss=Math.min(oldMiss,Math.hypot(...sub(bolt.point,target.point))*U);}
assert(oldMiss>30,'negative control exposes the old cross-chart pip miss');
shoot({shooterX:180,remote:false,targetY:-2301,velocity:witnessVelocity});
console.log('PASS lead negative control: old straight-chart cue misses by '+oldMiss.toFixed(1)+' m; new on-pip volley damages target');

const eyeBefore=pose(point(0,-2300.00000001),0),eyeAfter=pose(point(12000,-1699.99999999),1),fixedTarget=pose(point(12030,-1600),1,[20,40,0]);
const beforeAim=g.lead(eyeBefore,fixedTarget,weapon,true),afterAim=g.lead(eyeAfter,fixedTarget,weapon,true);assert(beforeAim&&afterAim);
assert(Math.hypot(...sub(g.bridgeVector(beforeAim.direction,[0,-1,0]),afterAim.direction))<.001,'firing direction stays continuous in the transported shooter frame');
assert(Math.abs(beforeAim.time-afterAim.time)<.0001);
const observing=pose(point(180,-2350)),beforeTarget=pose(point(0,-2300.00000001),0,[50,150,0]),afterTarget=pose(point(12000,-1699.99999999),1,[-50,150,0]);
const a=g.lead(observing,beforeTarget,weapon,true),b=g.lead(observing,afterTarget,weapon,true);assert(a&&b);
assert(Math.hypot(...sub(a.direction,b.direction))<.001,'target transit does not switch to a different lead frame');assert(Math.abs(a.time-b.time)<.0001);
console.log('PASS firing-pip continuity: shooter and target chart transitions preserve launch direction and flight time');

shoot({targetX:25,velocity:[30,40,0],detailed:true});
shoot({side:1,shooterY:-2302,targetY:-1690,detailed:true});
console.log('PASS model-collision pip-to-hit: authored hull triangles and real gun-bank anchors across the mouth');

for(const side of [0,1]){
 shoot({side,targetX:80,visible:true,detailed:true});
 shoot({side,remote:false,targetX:12,targetY:-2340,visible:true,detailed:true});
 shoot({side,targetX:80,targetY:-1250,visible:true,detailed:true});
}
console.log('PASS aim at visible hull: stationary authored ships hit without a separate ballistic bearing; automatic image acquisition, nearby and remote, both charts');
for(const side of [0,1])for(const radius of [301,450,599])for(const angle of [0,.4,.9,1.4]){
 const eye=[side*12000,-2000-radius,1550],direction=[Math.sin(angle),Math.cos(angle),0],ray=DW.ellisOptics.ray(eye,direction,side);
 const segments=DW.ellisOptics.advanceRay(ray,1800);assert(segments.length);
 assert(segments.every(s=>Math.hypot(...sub(s.end,s.start))<=6.01||Math.hypot(...cross(sub(s.end,s.start),s.direction))<1e-4),'collision segments never sweep the inter-chart storage gap');
 assert(Math.abs(Math.hypot(...ray.direction)-1)<1e-10);
 if(ray.active)assert(Math.abs(ray.p*ray.p+ray.b*ray.b/(1+ray.l*ray.l)-1)<1e-6,'conserved optical ray energy');
 const reverse=DW.ellisOptics.ray(ray.eye,ray.direction.map(v=>-v),ray.region);DW.ellisOptics.advanceRay(reverse,1800);
 assert.equal(reverse.region,side);assert(Math.hypot(...reverse.eye.map((v,i)=>v-eye[i]))<.1,'unguided curved flight is reciprocal');
}
console.log('PASS optical projectile transport: conserved energy, normalized direction, reciprocal paths and bounded chart-local swept collision segments');

const visibleEye=point(0,-2350),visibleTarget=point(12080,-1660),visibleDirection=DW.ellisOptics.primary(visibleEye.map(v=>v*U),visibleTarget.map(v=>v*U),0,1).direction;
let shortcutMiss=Infinity;
for(let t=0;t<2;t+=.001){const end=oracle(visibleEye,scale(visibleDirection,4+450*t),1,0);if(end.region===1)shortcutMiss=Math.min(shortcutMiss,Math.hypot(...sub(end.point,visibleTarget))*U);}
assert(shortcutMiss>50,'Old straight-shot model misses the stationary visible hull even with perfect aim');
for(const distance of [8,30,100,180,250,350]){
 const end=optical(visibleEye,visibleDirection,distance/U,0),image=DW.ellisOptics.primary(visibleEye.map(v=>v*U),end.point.map(v=>v*U),0,end.region);assert(image);
 assert(Math.hypot(...sub(image.direction,visibleDirection))<.001,'Viewed positions of a fired ray stay on its original visible bearing through the throat');
}
console.log('PASS visible-ray negative control: old shortcut misses stationary image by '+shortcutMiss.toFixed(1)+' m; curved shot and rendered trail share the image bearing');
