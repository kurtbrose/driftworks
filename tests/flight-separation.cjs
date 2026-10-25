"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture}=require('../tools/stress-flight.cjs');
const source=fs.readFileSync(require.resolve('../experiments/training.js'),'utf8');
// Keep the exhaustive roster scan as an independent candidate oracle. Both paths
// run production steering, sequential movement, guns, damage and session updates.
let reference=source.replace('neighbors.nearby(e).forEach', 'living.forEach');
const targetStart=reference.indexOf('                    var target = e.targetId ?'),targetEnd=reference.indexOf('                    if (!target ||',targetStart);
assert.ok(targetStart>0&&targetEnd>targetStart);
reference=reference.slice(0,targetStart)+`                    var target=living.find(function(other){return other.id===e.targetId&&other.hp>0&&other.team!==e.team&&(other.pose.region||0)===(e.pose.region||0);});
`+reference.slice(targetEnd);
const nearestStart=reference.indexOf('                        // Only the nearest three'),nearestEnd=reference.indexOf('                        e.targetId = target ?',nearestStart);
assert.ok(nearestStart>0&&nearestEnd>nearestStart);
reference=reference.slice(0,nearestStart)+`                        var choices=living.filter(function(other){return other.hp>0&&other.team!==e.team&&(other.pose.region||0)===(e.pose.region||0);});
                        choices.sort(function(a,b){return length(sub(a.pose.eye,e.pose.eye))-length(sub(b.pose.eye,e.pose.eye));});
                        target=choices[e.index%Math.min(3,choices.length)];
`+reference.slice(nearestEnd);
assert.notEqual(reference,source);
const copy=f=>JSON.parse(JSON.stringify({view:f.snapshot(),events:f.events,transcript:f.transcript}));
for(const [count,frames] of [[16,180],[64,240],[128,60]]){
 const a=fixture(count,29,'dense'),b=fixture(count,29,'dense');
 vm.runInNewContext(reference,{window:{Driftworks:b.DW}});
 for(const f of [a,b]){
  const {combat}=f.snapshot(),U=f.DW.sim.METERS_PER_UNIT,origin=combat.enemies[0].pose.eye.slice();
  origin[0]=Math.floor(origin[0]*U/64)*64/U;
  // Adjacent cells, the exact separation boundary, overlap, both regions and
  // craft moving across cells during the sequential update.
  combat.enemies.slice(0,10).forEach((e,i)=>{e.pose.eye=origin.map((v,k)=>v+(k===0?[0,0,49.999,50,50.001,63.999,64,64.001,-.001,-64.001][i]/U:0));e.pose.region=i===9?1:0;});
 }
 for(let frame=0;frame<frames;frame++){
  if(frame===10)for(const f of [a,b]){const enemies=f.snapshot().combat.enemies;enemies[2].hp=0;enemies[3].pose.eye=enemies[4].pose.eye.slice();}
  a.advance(1/60,{stop:true,fire:true});b.advance(1/60,{stop:true,fire:true});
  assert.deepEqual(copy(a),copy(b),'Exhaustive separation agrees at '+count+' fighters, frame '+frame);
 }
}
console.log('PASS fighter separation: exhaustive session agreement, stable nearest-three targeting, cell/50m boundaries, overlap, sequential movement, regions, death and teleport');
