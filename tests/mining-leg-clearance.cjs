const assert=require('node:assert/strict');
const {doorTriangles,sub,dot,cross}=require('./mining-ramp-clearance.cjs');
function bounds(tri){return [0,1,2].map(k=>[Math.min(...tri.map(p=>p[k])),Math.max(...tri.map(p=>p[k]))]);}
function overlaps(a,b){return a.every((r,k)=>r[1]>b[k][0]+1e-6&&b[k][1]>r[0]+1e-6);}
function tree(triangles){
 triangles=triangles.slice();
 const box=[0,1,2].map(k=>[Math.min(...triangles.map(t=>t.box[k][0])),Math.max(...triangles.map(t=>t.box[k][1]))]);
 if(triangles.length<=8)return {box,triangles};
 const axis=box.map(r=>r[1]-r[0]).indexOf(Math.max(...box.map(r=>r[1]-r[0])));
 triangles.sort((a,b)=>(a.box[axis][0]+a.box[axis][1])-(b.box[axis][0]+b.box[axis][1]));const half=Math.floor(triangles.length/2);
 return {box,left:tree(triangles.slice(0,half)),right:tree(triangles.slice(half))};
}
function trianglesIntersect(a,b){
 const ea=[sub(a[1],a[0]),sub(a[2],a[1]),sub(a[0],a[2])],eb=[sub(b[1],b[0]),sub(b[2],b[1]),sub(b[0],b[2])];
 const na=cross(ea[0],ea[1]),nb=cross(eb[0],eb[1]);
 const axes=[na,nb,...ea.flatMap(e=>eb.map(f=>cross(e,f)))];
 for(const axis of axes){const length=Math.hypot(...axis);if(length<1e-10)continue;const x=a.map(p=>dot(p,axis)/length),y=b.map(p=>dot(p,axis)/length);if(Math.max(...x)<=Math.min(...y)+1e-6||Math.max(...y)<=Math.min(...x)+1e-6)return false;}
 return true;
}
function query(node,tri,box){
 if(!overlaps(node.box,box))return null;
 if(node.triangles){for(const t of node.triangles)if(overlaps(t.box,box)&&trianglesIntersect(tri,t.points))return t;return null;}
 return query(node.left,tri,box)||query(node.right,tri,box);
}
assert.ok(trianglesIntersect([[0,0,0],[2,0,0],[0,2,0]],[[.5,.5,-1],[.5,.5,1],[1,.5,0]]),'Detector catches penetrating rigid faces');
assert.ok(!trianglesIntersect([[0,0,0],[2,0,0],[0,2,0]],[[3,3,-1],[3,3,1],[4,3,0]]),'Detector rejects separated faces');
const openingValues=process.env.MINING_SWEEP_AT?[Number(process.env.MINING_SWEEP_AT)]:Array.from({length:401},(_,i)=>i/400);
const poses=openingValues.map(doorTriangles);
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
