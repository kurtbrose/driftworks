'use strict';
const assert=require('node:assert/strict');
const DW=require('../tools/headless.cjs').loadRuntime(),guns=DW.flightGuns,U=DW.sim.METERS_PER_UNIT;
const pose={eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
const bolt={position:[100/U,500/U,0],direction:[1,0,0],age:.1,team:'ally',weapon:DW.retailWeapons[0]};
const state={bolts:[bolt],impacts:[{position:[0,500/U,0],age:.05}]};
const original=JSON.stringify(state),baseline=guns.geometry(state,pose);
guns.visualFrame(0);guns.visualFrame(.2);
for(const mode of ['multiples','overlap','orb']) {
    guns.setVisualOptions({mode,radius:1.5,exposure:.8});
    const batches=guns.geometry(state,pose),vertices=batches[0].vertices;
    const count=vertices.length/36;
    assert(count>=1&&count<=(mode==='multiples'?5:mode==='overlap'?24:1));
    if(mode!=='orb')assert(count>1,'Exposures are generated for visible motion');
    let energy=0;
    for(let sample=0;sample<count;sample++) {
        const center=[0,0,0];
        for(let v=0;v<6;v++)for(let k=0;k<3;k++)center[k]+=vertices[sample*36+v*6+k]/6;
        assert(Math.abs(center[1]-bolt.position[1])<1e-5&&Math.abs(center[2])<1e-6,'Samples remain on the real shot path');
        assert(center[0]<=bolt.position[0]+1e-5&&center[0]>=bolt.position[0]-bolt.weapon.speed*bolt.age/U-1e-5,'No future or pre-launch positions');
        if(sample<count-1)energy+=vertices[sample*36+5];
        else {assert(Math.abs(center[0]-bolt.position[0])<1e-5);assert.equal(vertices[sample*36+5],1);}
    }
    if(count>1)assert(Math.abs(energy-(mode==='overlap'?1.6:.85))<1e-6,'Fixed tail energy budget');
    assert.deepEqual(batches[0].color,baseline[0].color,'Production team colors');
    assert.deepEqual(batches.at(-1),baseline.at(-1),'Impacts are unchanged');
    assert.equal(JSON.stringify(state),original,'Rendering leaves guns, physics and weapon data unchanged');
    guns.setVisualOptions({mode,radius:1.5,exposure:0});
    assert.equal(guns.geometry(state,pose)[0].vertices.length,36,'Zero exposure retains only the head');
}
guns.setVisualOptions({mode:'overlap',radius:1.5,exposure:.8});
const incoming={...bolt,position:[0,500/U,0],direction:[0,-1,0]};
assert.equal(guns.geometry({bolts:[incoming],impacts:[]},pose)[0].vertices.length,36,'Head-on shots remain round');
assert.equal(guns.geometry({bolts:[{...bolt,age:0}],impacts:[]},pose)[0].vertices.length,36,'New shots never acquire a pre-launch trail');
const curved=guns.geometry({bolts:[{...bolt,curvature:400}],impacts:[]},pose);
assert(Array.from(curved[0].vertices).every(Number.isFinite),'Curved-space samples remain finite');
assert.throws(()=>guns.setVisualOptions({mode:'invalid',radius:3,exposure:.8}));
const copy=guns.getVisualOptions();copy.radius=100;
assert.equal(guns.getVisualOptions().radius,1.5,'Preferences are returned by value');
guns.setVisualOptions({mode:'current',radius:3,exposure:.8});
assert.deepEqual(guns.geometry(state,pose),baseline,'Current mode exactly preserves the production reference');
console.log('PASS gameplay projectile visuals: production reference, 3D samples, launch clipping, energy, impacts and physics isolation');
