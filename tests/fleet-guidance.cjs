'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const context={window:{Driftworks:{}}};vm.runInNewContext(fs.readFileSync('src/fleet-guidance.js','utf8'),context);
const api=context.window.Driftworks.fleetGuidance;
const distance=(a,b)=>Math.hypot(...a.map((v,k)=>v-b[k]));
function bodies(count){return Array.from({length:count},(_,i)=>({id:'ship-'+i,position:[(i%6)*160,Math.floor(i/6)*160,0],velocity:[0,20,0],radius:25+i%3*5}));}
for(const count of [1,7,30]){
    const ships=bodies(count),group=api.create(ships),initial=JSON.stringify(group.slots),origin=group.anchor.slice();group.velocity=[0,20,0];
    for(let i=0;i<ships.length;i++)for(let j=i+1;j<ships.length;j++){
        const a=group.slots[ships[i].id],b=group.slots[ships[j].id];
        assert(Math.hypot(a[0]-b[0],a[2]-b[2])>=150-1e-6,'Every fore/aft pair has a separate engine-wash corridor');
    }
    if(count>=7){
        const spans=[0,1,2].map(k=>Math.max(...Object.values(group.slots).map(p=>p[k]))-Math.min(...Object.values(group.slots).map(p=>p[k])));
        assert(Math.max(...spans)/Math.min(...spans)<3,'Vulnerable ships occupy a compact ball');
    }
    let worstAcceleration=0;
    for(let i=0;i<2400;i++){
        const old=ships.map(b=>b.velocity.slice());
        api.step(group,ships,[origin[0],origin[1]+(i+1)*2,origin[2]],[0,20,0],[],.1);
        ships.forEach((b,j)=>{worstAcceleration=Math.max(worstAcceleration,distance(old[j],b.velocity)/.1);});
    }
    assert(worstAcceleration<=1.200001,'Physical acceleration remains bounded');
    assert.equal(JSON.stringify(group.slots),initial,'No reassignment churn while assembling');
    for(const b of ships)assert(distance(b.position,group.slots[b.id].map((v,k)=>v+group.anchor[k]))<2,'Scattered ships acquire generated slots');
    const joined={id:'newcomer',position:[-800,group.anchor[1],100],velocity:[0,20,0],radius:35};ships.push(joined);
    api.step(group,ships,group.anchor,[0,20,0],[],.1);assert(group.slots.newcomer);
    for(const [id,p] of Object.entries(group.slots))if(id!=='newcomer')assert(Math.hypot(p[0]-group.slots.newcomer[0],p[2]-group.slots.newcomer[2])>=150-1e-6,'Newcomers preserve engine-wash clearance');
    for(const [id,slot] of Object.entries(JSON.parse(initial)))assert.deepEqual(Array.from(group.slots[id]),slot,'Joining preserves existing slots');
    ships.splice(0,1);api.step(group,ships,group.anchor,[0,20,0],[],.1);
    assert(ships.every(b=>b.position.every(Number.isFinite)),'Losses do not invalidate guidance');
}
const cargo=bodies(8),group=api.create(cargo);group.velocity=[0,20,0];
const threat={position:[group.anchor[0]-700,group.anchor[1],0],radius:2500,weight:1};
for(let i=0;i<600;i++)api.step(group,cargo,[560,(i+1)*2,0],[0,20,0],[threat],.1);
assert(group.offset[0]>100,'Port threat produces a starboard diversion');
for(let i=0;i<1200;i++)api.step(group,cargo,[560,1200+(i+1)*2,0],[0,20,0],[],.1);
assert(Math.abs(group.offset[0])<.1,'Diversion relaxes after the threat leaves');
const escorts=[{id:'alpha',position:cargo[0].position.slice(),velocity:[0,20,0],radius:8},{id:'beta',position:cargo[7].position.slice(),velocity:[0,20,0],radius:8}];
const goals=api.cover(group,cargo,escorts,[]),assignments=JSON.stringify(group.assignments);
assert.equal(new Set(Object.values(group.assignments)).size,2,'Escorts distribute across different protected ships');
escorts[0].position[0]+=.01;api.cover(group,cargo,escorts,[]);assert.equal(JSON.stringify(group.assignments),assignments,'Small changes do not reshuffle coverage');
assert(Object.values(goals).every(g=>g.every(Number.isFinite)));
const endangered=cargo[3],newThreat={position:endangered.position.slice(),radius:150,weight:10};
api.cover(group,cargo,escorts,[newThreat]);assert(Object.values(group.assignments).includes(endangered.id),'A major new threat can preempt routine coverage');
assert.deepEqual(Object.keys(api.cover(group,[],escorts,[])),[]);
const rotated=api.create(bodies(12),[1,0,0]);
const stations=Object.values(rotated.slots);
for(let i=0;i<stations.length;i++)for(let j=i+1;j<stations.length;j++)assert(Math.hypot(stations[i][1]-stations[j][1],stations[i][2]-stations[j][2])>=150-1e-6,'Wash clearance uses supplied ship-forward, not a hardcoded world axis');
const lagging=bodies(7),hold=api.create(lagging);hold.velocity=[0,20,0];lagging[0].position[1]-=1500;
for(let i=0;i<300;i++)api.step(hold,lagging,[hold.anchor[0],5000,0],[0,20,0],[],.1);
assert(Math.hypot(...hold.velocity)<1,'Large slot error makes the convoy hold rather than string out');
console.log('PASS generic fleet guidance: variable membership, generated slots, bounded assembly, diversion, recovery and escort allocation');
