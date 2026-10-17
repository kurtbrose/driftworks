const assert=require('node:assert/strict');
const {poses,tree,query,bounds}=require('./mining-leg-clearance.cjs');
const model=global.Driftworks.scene3d.miningPlatformGeometry;
const closed=model(1,0,false,'rampdock',0),movingA=model(1,0,false,'rampdock',.257),movingB=model(1,0,false,'rampdock',.733);
assert.deepEqual(closed.dark,movingB.dark,'Black frame and infill remain stationary while yellow leaves fold');
const infill=global.Driftworks.scene3d.miningPlatformInfillGeometry();
assert.ok(infill.dark.length>0 && !infill.ochre.length,'Fixed infill uses black rather than moving yellow material');
const fixed=[];
for(const data of Object.values(infill))for(let i=0;i<data.length;i+=18){const points=[0,6,12].map(k=>data.slice(i+k,i+k+3));fixed.push({points,box:bounds(points)});}
const infillTree=tree(fixed),stationary=[];
for(const [material,data] of Object.entries(closed))for(let i=0;i<data.length;i+=18){
 const points=[0,6,12].map(k=>data.slice(i+k,i+k+3));
 if(!points.every(p=>Math.abs(p[0])<=7.2&&Math.abs(p[1])<=6&&p[2]>=7))continue;
 if(data.slice(i,i+18).some((v,k)=>v!==movingA[material][i+k]||v!==movingB[material][i+k]))continue;
 stationary.push({points,box:bounds(points),material,index:i/18});
}
const body=tree(stationary);
for(let step=0;step<poses.length;step++){
 const pose=poses[step],meshes=Array.from({length:8},(_,bay)=>pose.slice(bay*24,(bay+1)*24).map(points=>({points,box:bounds(points)}))),trees=meshes.map(tree);
 for(let bay=0;bay<8;bay++)for(const tri of meshes[bay]){
  const fillHit=query(infillTree,tri.points,tri.box);assert.ok(!fillHit,`Moving leaf hits fixed infill at opening ${step/400}, bay ${bay}: ${JSON.stringify({tri:tri.points,hit:fillHit})}`);
  const towerHit=query(body,tri.points,tri.box);assert.ok(!towerHit,`Moving leaf hits tower at opening ${step/400}, bay ${bay}: ${JSON.stringify(towerHit)}`);
  for(let other=bay+1;other<8;other++)assert.ok(!query(trees[other],tri.points,tri.box),`Bay ${bay} intersects bay ${other} at opening ${step/400}`);
 }
}
console.log('PASS fixed infill: stationary black roof/side panels clear yellow leaves, tower and neighboring bays across '+poses.length+' poses');
