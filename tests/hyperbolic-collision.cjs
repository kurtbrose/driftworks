'use strict';
const assert=require('node:assert/strict'),{loadRuntime}=require('../tools/headless.cjs'),DW=loadRuntime(),H=DW.flightHyperbolic,U=DW.sim.METERS_PER_UNIT;
const modes=['legacy','grid','tree','grid-events','tree-events'];
function run(radius,location,offset,shield,mode,rebase){
 const t=DW.flightSim.create('hyperbolic');t.player.pose.curvature=radius;t.player.pose.eye=[0,0,0];t.player.pose.spaceFrame=undefined;
 const center=H.offset([0,0,0],location.map(v=>v/U),radius),pose=DW.arcade.create(0);Object.assign(pose,{curvature:radius,eye:center});
 const target=DW.flightSim.createCraft('victim',pose,'enemy');target.collision=offset===6||offset===30?{kind:'model',modelId:'concept-trio:raptor'}:{kind:'sphere',radiusM:7};target.shield=shield?120:0;
 t.enemies=[target];for(let i=0;i<64;i++){const p=DW.arcade.create(0);p.curvature=radius;p.eye=H.offset(center,[(i%2?1:-1)*(800+i*19)/U,(400+i*31)/U,(300+i*11)/U],radius);const c=DW.flightSim.createCraft('far-'+i,p,i%3?'enemy':'ally');c.collision={kind:'sphere',radiusM:7};t.enemies.push(c);}
 let a=H.offset(center,[-100/U,offset/U,0],radius),b=H.offset(center,[100/U,offset/U,0],radius);
 const bolt={position:a,direction:H.path(a,b,radius).direction,curvature:radius,age:0,weapon:Object.assign({},DW.retailWeapons[0],{damage:9,headRadius:.2})};
 if(rebase){const old={...t.player.pose};t.player.pose.eye=H.offset([0,0,0],[-300/U,100/U,70/U],radius);t.player.guns.bolts=[bolt];H.rebase(t,()=>undefined);b=H.chartPose({...old,eye:b},t.player.pose).eye;a=bolt.position;}
 DW.flightSim.setCollisionMode(t,mode);let count,point;
 DW.flightSim.collisionBatch(t,()=>{count=DW.flightCollision.query(t,a,b,bolt,'player').candidates.length;point=DW.flightSim.trace(t,a,b,bolt,'player',undefined,t.player.pose);});
 assert.ok(target.hp>=0&&target.shield>=0);
 return {hit:!!point,distance:point?H.path(a,point,radius).distance*U:null,hp:target.hp,shield:target.shield,count};
}
for(const radius of [300,400,650,100000])for(const location of [[0,0,0],[700,250,-50],[-1200,900,100]])for(const offset of [0,6,8,30])for(const shield of [false,true])for(const rebase of [false,true]){
 const expected=run(radius,location,offset,shield,'legacy',rebase);
 for(const mode of modes.slice(1)){const actual=run(radius,location,offset,shield,mode,rebase);assert.equal(actual.hit,expected.hit);assert.equal(actual.hp,expected.hp);assert.equal(actual.shield,expected.shield);if(actual.hit)assert.ok(Math.abs(actual.distance-expected.distance)<.0001);assert.ok(actual.count<65,'curved query must reject distant actors');}
}
// Managed capital gun batches must share a spatial-index synchronization.
{
 const t=DW.flightSim.create('hyperbolic');t.player.pose.curvature=400;t.enemies=[];
 const b={position:[0,0,0],direction:[1,0,0],curvature:400,age:0,weapon:DW.retailWeapons[0]},before=DW.flightSim.collisionStats(t);
 DW.flightSim.collisionBatch(t,()=>{for(let i=0;i<20;i++)DW.flightCollision.query(t,[0,0,0],[1,0,0],b,'player');});
 const after=DW.flightSim.collisionStats(t);assert.equal(after.syncs-before.syncs,1);assert.equal(after.queries-before.queries,20);
}
console.log('PASS hyperbolic spatial collision: grid/tree parity with full scan, shields, grazing rays, near/far poses, chart rebasing and one synchronization per gun batch');
