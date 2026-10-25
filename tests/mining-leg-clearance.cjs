const assert=require('node:assert/strict');
const {bounds,overlaps,tree,trianglesIntersect,query,sweepPoses}=require('./fixtures/mining-clearance.cjs');
assert.ok(trianglesIntersect([[0,0,0],[2,0,0],[0,2,0]],[[.5,.5,-1],[.5,.5,1],[1,.5,0]]),'Detector catches penetrating rigid faces');
assert.ok(!trianglesIntersect([[0,0,0],[2,0,0],[0,2,0]],[[3,3,-1],[3,3,1],[4,3,0]]),'Detector rejects separated faces');
const {openingValues,poses}=sweepPoses();
let collisions=[];
for(const deployment of Array.from({length:11},(_,i)=>i/10)){
 const groups=global.Driftworks.scene3d.miningPlatformLegGeometry(deployment),triangles=[];
 for(const [material,data] of Object.entries(groups))for(let i=0;i<data.length;i+=18){const points=[0,6,12].map(k=>data.slice(i+k,i+k+3));triangles.push({points,box:bounds(points),material,index:i/18});}
 const bvh=tree(triangles);
 pose: for(let step=0;step<poses.length;step++)for(let index=0;index<poses[step].length;index++){
  const triangle=poses[step][index],hit=query(bvh,triangle,bounds(triangle));
  if(hit){collisions.push({deployment,opening:openingValues[step],panelTriangle:index,legMaterial:hit.material,legTriangle:hit.index,points:hit.points});break pose;}
 }

}
assert.ok(!collisions.length,'Ramp/leg overlap: '+JSON.stringify(collisions));
console.log('PASS bay ramps: '+poses.length+' rigid hinge poses clear the actual legs at eleven deployment settings');

module.exports={poses,tree,query,bounds,overlaps,trianglesIntersect};
