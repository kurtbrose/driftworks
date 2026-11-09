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
for(const mode of ['centered','centered-overlap']){
    guns.setVisualOptions({mode,radius:1.5,exposure:.8});
    const vertices=guns.geometry(state,pose)[0].vertices,centers=[],weights=[];
    for(let i=0;i<vertices.length;i+=36){let x=0;for(let j=0;j<6;j++)x+=vertices[i+j*6]/6;centers.push(x);weights.push(vertices[i+5]);}
    assert(centers.some(x=>x>bolt.position[0]+1e-5),'Faint samples ahead of the real bolt');
    assert(centers.some(x=>x<bolt.position[0]-1e-5),'Faint samples behind the real bolt');
    assert(Math.abs(centers.at(-1)-bolt.position[0])<1e-5,'Bright center stays at the true position');
    assert.equal(weights.at(-1),1);
    assert(weights.slice(0,-1).every(w=>w<1),'Both sides fade below the center brightness');
    assert(centers.length<=(mode==='centered'?5:23));
    const dying={...bolt,age:bolt.weapon.lifetime};
    const end=guns.geometry({bolts:[dying],impacts:[]},pose)[0].vertices;
    for(let i=0;i<end.length;i+=36){let x=0;for(let j=0;j<6;j++)x+=end[i+j*6]/6;assert(x<=bolt.position[0]+1e-5,'Forward exposures stop at weapon lifetime');}
}
guns.setVisualOptions({mode:'leading-edge',radius:1.5,exposure:.8});
const rim=guns.geometry(state,pose)[0].vertices;
for(let i=0;i<rim.length;i+=6){
    const x=(rim[i]-bolt.position[0])*U,z=(rim[i+2]-bolt.position[2])*U,r=Math.hypot(x,z);
    assert(x>=-1e-5,'Only the leading hemisphere is drawn for crossing fire');
    assert(r>1.5*.63&&r<1.5*.99,'The body center stays hollow');
}
assert.equal(JSON.stringify(state),original,'All new treatments are presentation-only');
guns.setVisualOptions({mode:'current',radius:3,exposure:.8});
assert.deepEqual(guns.geometry(state,pose),baseline,'Current mode exactly preserves the production reference');
console.log('PASS gameplay projectile visuals: production reference, 3D samples, launch clipping, energy, impacts and physics isolation');

// Independently switch each treatment, then return exactly to the production reference.
const flags=['compactHeads','wakes','muzzleLight','layeredImpacts','barrelHeat'];
for(let mask=0;mask<32;mask++){
    const options={mode:'current',radius:3,exposure:.8};
    flags.forEach((key,i)=>options[key]=!!(mask&(1<<i)));
    guns.setVisualOptions(options);
    const result=guns.geometry(state,pose);
    assert(result.every(b=>Array.from(b.vertices).every(Number.isFinite)));
    assert.equal(result[0].vertices.length,options.wakes?216:36,'Wake toggle adds five bounded path samples');
    assert.equal(result.at(-1).vertices.length,options.layeredImpacts?288:36,'Impact layers switch independently');
    assert.equal(JSON.stringify(state),original,'Combinations preserve simulation state');
}
guns.setVisualOptions({mode:'current',radius:3,exposure:.8});
assert.deepEqual(guns.geometry(state,pose),baseline,'Current resets every experimental treatment');
const live=guns.create();
guns.step(live,pose,DW.retailWeapons[0],true,.01);
assert.equal(guns.muzzlePulse(live).age,0);
assert(guns.muzzlePulse(live).heat>0);
const hot=guns.muzzlePulse(live);hot.heat=999;
assert(guns.muzzlePulse(live).heat<1,'Pulse observations are copies');
guns.step(live,pose,DW.retailWeapons[0],false,0);
assert.equal(guns.muzzlePulse(live).age,0,'Pause preserves flash age');
guns.step(live,pose,DW.retailWeapons[0],false,1.8);
assert(Math.abs(guns.muzzlePulse(live).heat-.24/Math.E)<1e-9,'Heat cools by elapsed simulation seconds');
assert.equal(guns.muzzlePulse(guns.create()).heat,0,'Reset guns have no stale glow');
console.log('PASS independent gun effects: 32 combinations, baseline reset, bounded layers, pause and cooling');
