'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const context={window:{Driftworks:{}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiments/bolt-lab-model.js'),'utf8'),context);
const model=context.window.Driftworks.boltRangeModel;
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
for(const angles of [[0,0,0],[.7,-.4,.8],[-1.2,.6,-.3]]){
 const b=model.basis(...angles);for(const axis of [b.right,b.up,b.back])near(dot(axis,axis),1);
 near(dot(b.right,b.up),0);near(dot(b.right,b.back),0);near(dot(b.up,b.back),0);
 const forward=model.local(b,[0,0,-1100]);near(Math.hypot(...forward),1100);
}
const shot={position:[-2,0,-7],velocity:[0,0,-1100],age:0,style:0};model.advance(shot,.1);near(shot.position[2],-117);near(shot.age,.1);
const before=shot.position.slice();model.advance(shot,0);assert.deepEqual(shot.position,before);
const oldVelocity=shot.velocity.slice();model.basis(1,.2,.3);model.advance(shot,.2);assert.deepEqual(shot.velocity,oldVelocity);near(shot.position[2],-337);
for(const distance of [150,450,1500]){
 const p=model.crossing(distance,0);assert.ok(p.position[2]<0&&p.direction[0]>0&&p.direction[2]>0);
 const crossing={position:p.position.slice(),velocity:p.direction.map(n=>n*1100),age:0,style:0};
 model.advance(crossing,distance*.9/(p.direction[0]*1100));near(crossing.position[0],0);assert.ok(crossing.position[2]<0,'crosses while in front of observer');
}
console.log('PASS 3D bolt range: orthonormal camera, world-space ballistics, pause and crossing depth at three ranges');
for(const fps of [30,60,75,144])near(model.bodyLength(1100,1/fps,6,1),Math.max(6,1100/fps));
near(model.bodyLength(1100,1/75,6,2),2200/75);
near(model.bodyLength(1100,1/75,6,0),6);
near(model.bodyLength(0,1/75,6,1),6);
// Camera direction has no input into length; it only projects the flight axis.
const body=model.bodyLength(1100,1/75,6,1);
for(const yaw of [0,Math.PI/4,Math.PI/2]){
 const b=model.basis(yaw,0,0),axis=[0,0,-1];
 const projected=Math.hypot(dot(axis,b.right),dot(axis,b.up));
 near(6+(body-6)*projected,6+(body-6)*Math.abs(Math.sin(yaw)));
}
console.log('PASS flight-aligned bodies: frame travel coverage, compact/two-frame modes and head-on/side-on projection');
// Project two successive positions independently. Body axis must be collinear
// with that trajectory, including off-axis depth motion and camera banking.
for(const angles of [[0,0,0],[.25,-.2,.6]])for(const velocity of [[900,0,500],[0,0,-1100],[0,0,1100]]){
 const basis=model.basis(...angles),position=[-150,95,-500],eye=[12,-5,4];
 const body=model.projectedBody(position,velocity,eye,basis,100,6);assert.ok(body);
 const project=p=>{const r=p.map((n,i)=>n-eye[i]),z=-dot(r,basis.back);return [dot(r,basis.right)/z,dot(r,basis.up)/z];};
 const a=project(position),b=project(position.map((n,i)=>n+velocity[i]*.01));
 const dx=b[0]-a[0],dy=b[1]-a[1];
 near(body.span[0]*dy-body.span[1]*dx,0);
 assert.ok(body.span[0]*dx+body.span[1]*dy>0);
}
const straight=model.projectedBody([0,0,-500],[0,0,-1100],[0,0,0],model.basis(0,0,0),100,6);near(Math.hypot(...straight.span),0);
assert.equal(model.projectedBody([0,0,10],[0,0,1100],[0,0,0],model.basis(0,0,0),6,6),null);
const clipped=model.projectedBody([1,2,5],[0,0,1100],[0,0,0],model.basis(0,0,0),100,6);assert.ok([...clipped.center,...clipped.span].every(Number.isFinite));
console.log('PASS perspective alignment: off-axis crossing, axial travel, camera rotation and near-plane clipping');
