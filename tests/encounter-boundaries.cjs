"use strict";
const assert=require('node:assert/strict'),{createFlight}=require('../tools/headless.cjs');
const copy=value=>JSON.parse(JSON.stringify(value));
const flight=createFlight({mission:'training',seed:29}),{DW,session}=flight,units=DW.sim.METERS_PER_UNIT;
const before=copy(session.snapshot()),oldEye=before.state.eye,start=[-200/units,-1100/units,1200+220/units];
session.prepareAegisStudy();
let snapshot=session.snapshot();
assert.deepEqual(copy(snapshot.state.eye),start);
assert.deepEqual(copy(snapshot.state.velocity),[0,0,0]);
assert.equal(snapshot.state.throttle,0);
for(const craft of DW.flightSim.participants(snapshot.combat).filter(c=>c.controller!=='input')){
    const old=DW.flightSim.participants(before.combat).find(c=>c.id===craft.id);
    assert.deepEqual(copy(craft.pose.eye),old.pose.eye.map((v,i)=>v+start[i]-oldEye[i]));
}
const {right,up,back}=snapshot.state;
for(const axis of [right,up,back])assert(Math.abs(Math.hypot(...axis)-1)<1e-12);
assert(Math.abs(right.reduce((sum,v,i)=>sum+v*up[i],0))<1e-12);
assert(back.every((v,i)=>Math.abs(v+[200,1100,-220][i]/Math.hypot(200,1100,-220))<1e-12));
session.prepareCinematicObserver();snapshot=session.snapshot();
assert.deepEqual(copy(snapshot.state.eye),[0,-10000/units,5000/units]);
assert.equal(snapshot.combat.player.hp,1e9);assert.equal(snapshot.combat.player.maxHp,1e9);
assert.equal(snapshot.combat.hull,1e9);assert.equal(snapshot.combat.maxHull,1e9);assert(snapshot.combat.enabled);
session.reset({mode:'training',enabled:true,profile:flight.config.profile});
assert(session.snapshot().combat.player.hp<1e9,'ordinary reset restores normal health');
// The physical layout remains useful without scene3d, DOM, artwork or asset loading.
assert(!DW.scene3d);
for(const scale of [1/3,1,2])for(const yaw of [0,.7,Math.PI]){
    const asteroid={radius:125},definition={scale,anchor:[10,-20],offset:[30,40]},building={x:90,y:-50,size:20,yaw};
    let queries=0;
    const layout=DW.roadsideLayout.describe(asteroid,definition,(_rock,direction)=>{queries++;return {point:[0,0,(direction[0]+2*direction[1]+4000)/10000]};});
    assert.equal(queries,9);
    const ground=layout.ground(building.x,building.y),launch=layout.launchOrigin(building),front=building.size*scale*.3;
    assert(Math.abs(launch[0]-(ground.point[0]*asteroid.radius+Math.sin(yaw)*front/units))<1e-12);
    assert(Math.abs(launch[1]-(ground.point[1]*asteroid.radius-Math.cos(yaw)*front/units))<1e-12);
    assert(Math.abs(launch[2]-(layout.deckHeight+8/units))<1e-12,'launch stays eight metres above pavement');
    assert.equal(queries,9,'anchors reuse the support samples');
}
console.log('PASS encounter boundaries: headless study/observer setup, reset, shared deck and launch anchors');
