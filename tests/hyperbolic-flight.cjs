const assert=require('node:assert/strict');
const {loadRuntime,createFlight}=require('../tools/headless.cjs');
const DW=loadRuntime(),H=DW.flightHyperbolic,U=DW.sim.METERS_PER_UNIT,dt=1/120;
const near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=v=>v.map(x=>x/Math.hypot(...v));
function volley(radius,onPip){
 const t=DW.training.create('hyperbolic'),p=t.player.pose;p.curvature=radius;p.eye=[0,0,0];
 const e=DW.training.createCraft('crossing',DW.arcade.create(0),'enemy');
 Object.assign(e.pose,{curvature:radius,eye:H.offset(p.eye,[90,20,-500].map(v=>v/U),radius),right:[1,0,0],up:[0,1,0],back:[0,0,1],velocity:[100,0,0]});
 const model=DW.shipPackModels.find('concept-trio:raptor');assert.ok(model,'real fighter model required');
 e.collision={kind:'model',modelId:model.model.id};t.player.collision={kind:'model',modelId:model.model.id};t.enemies=[e];t.targetId=e.id;
 const weapon=DW.retailWeapons[0],lead=DW.training.firingSolution(t,t.player,e,weapon);assert.ok(lead);
 const d=onPip?lead.direction:H.path(p.eye,e.pose.eye,radius).direction;p.back=d.map(v=>-v);p.right=unit(cross(d,[0,1,0]));p.up=cross(p.back,p.right);
 const future=H.offset(e.pose.eye,e.pose.velocity.map(v=>v*lead.time/U),radius),route=H.path(p.eye,future,radius);const anchors=DW.training.gunAnchors(t.player),launch=anchors.reduce((sum,p)=>sum+Math.max(0,p[1]),0)/anchors.length;near(route.distance*U-launch,weapon.speed*lead.time,.002);
 const shield=e.shield;
 for(let i=0;i<Math.ceil((lead.time+.2)/dt);i++){
  const next=H.offset(e.pose.eye,e.pose.velocity.map(v=>v*dt/U),radius);e.pose.velocity=H.transport(e.pose.eye,next,e.pose.velocity,radius);e.pose.eye=next;t.time+=dt;
  DW.flightGuns.step(t.player.guns,p,weapon,i===0,dt,(a,b,bolt)=>DW.training.trace(t,a,b,bolt,t.player,undefined,p),()=>DW.training.convergencePoint(t,t.player,weapon),t.player.profile.gunMounts,anchors,radius);
 }
 if(onPip){assert.ok(t.player.guns.hits>0,'on-pip native volley hits authored hull');assert.ok(e.shield<shield);near(e.hp,e.maxHp);}else{assert.equal(t.player.guns.hits,0,'off-pip crossing shot misses');near(e.shield,shield);}
 assert.equal(t.player.guns.fired,anchors.length);
}
for(const radius of [350,650,1800,100000]){
 const p=DW.arcade.create(0);Object.assign(p,{curvature:radius,eye:H.offset([0,0,0],[80,30,-120].map(v=>v/U),radius),velocity:[0,70,0],throttle:1,ramp:[0,0,70]});
 const before=p.eye.slice();DW.arcade.step(p,DW.arcade.profiles[0],{},dt);near(H.path(before,p.eye,radius).distance*U,70*dt,2e-5);[p.right,p.up,p.back].forEach(a=>near(Math.hypot(...a),1));
 const report=DW.flightDialogue.contactData(p,H.offset(p.eye,[0,500/U,0],radius));near(report.distance,500,.001);
 volley(radius,true);volley(radius,false);
}
console.log('PASS hyperbolic geometry and pip: native volleys, authored hulls/shields, off-pip negative controls and transported frames at four radii');
const f=createFlight({mission:'hyperbolic',seed:29}),flat=createFlight({mission:'furball',seed:29});let v=f.snapshot();assert.equal(v.combat.enabled,true);
assert.equal(JSON.stringify(v.combat.enemies.map(c=>[c.team,c.profile.name,c.hp,c.maxHp,c.shield,c.maxShield,c.skill,c.weaponIndex])),JSON.stringify(flat.snapshot().combat.enemies.map(c=>[c.team,c.profile.name,c.hp,c.maxHp,c.shield,c.maxShield,c.skill,c.weaponIndex])));
assert.ok(v.combat.enemies.every(c=>c.pose.curvature===400&&c.controller==='ai'&&c.collision.kind==='model'));
f.advance(2,{fire:true});v=f.snapshot();assert.ok(v.guns.fired>0);assert.ok(v.combat.enemies.some(c=>['attack','break','evade','recover'].includes(c.mode)));assert.ok(v.combat.enemies.some(c=>c.guns.fired>0));near(Math.hypot(...v.state.eye),0);
v.combat.enemies=[];v.combat.countdown=1000;v.state.throttle=0;const shield=v.combat.shield;f.DW.training.damagePlayer(v.combat,f.DW.retailWeapons[0]);const damaged=v.combat.shield;assert.ok(damaged<shield);f.advance(6.9);near(v.combat.shield,damaged);f.advance(.6);near(v.combat.shield-damaged,6,.11);
v.combat.player.hp=0;const time=v.combat.time;f.advance(10);near(v.combat.time,time);assert.equal(v.combat.player.hp,0);
console.log('PASS native pipeline parity: roster/loadouts, retail guns, pursuit AI, shields/recharge, chart rebasing and sortie death without respawn');

const far=DW.training.create('hyperbolic');far.player.pose.curvature=650;far.player.pose.eye=[0,0,0];const remote=DW.training.createCraft('remote',DW.arcade.create(0),'enemy');remote.pose.curvature=650;remote.pose.eye=H.offset([0,0,0],[0,6000/U,0],650);far.enemies=[remote];far.targetId=null;DW.training.acquireTarget(far,far.player.pose);assert.equal(far.targetId,'remote','geometry must not impose a new five-kilometre acquisition cap');
