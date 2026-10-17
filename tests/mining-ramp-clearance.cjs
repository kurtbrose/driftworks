const assert=require('node:assert/strict');
const perimeter=[[15,-6],[15,6],[5,10.5],[-5,10.5],[-17,4.5],[-17,-4.5],[-5,-10.5],[5,-10.5]];
const sub=(a,b)=>a.map((v,k)=>v-b[k]);
const dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function beam(a,b,w,d){const v=sub(b,a),length=Math.hypot(...v),x=v.map(v=>v/length),h=Math.hypot(x[0],x[1]),y=h>1e-8?[-x[1]/h,x[0]/h,0]:[0,1,0];return {center:a.map((v,k)=>(v+b[k])/2),axes:[x,y,cross(x,y)],half:[length/2,w,d]};}
const frame=[];
perimeter.forEach((p,i)=>{
 const q=perimeter[(i+1)%8],a=[...p,8.4],scale=Math.min(4.45/Math.max(.001,Math.abs(p[0])),3.45/Math.max(.001,Math.abs(p[1]))),seat=[p[0]*scale,p[1]*scale,8.8];
 frame.push(beam([...p,5.35],a,.31,.35),beam(a,[...q,8.4],.245,.285),beam([...p,4.5],[...q,4.5],.31,.38),beam(a,seat,.23,.30),{center:seat,axes:[[1,0,0],[0,1,0],[0,0,1]],half:[.38,.38,.30]});
});
function intersects(triangle,box){
 const tri=triangle.map(p=>box.axes.map(axis=>dot(sub(p,box.center),axis)));
 const edges=[sub(tri[1],tri[0]),sub(tri[2],tri[1]),sub(tri[0],tri[2])];
 const basis=[[1,0,0],[0,1,0],[0,0,1]],axes=basis.concat([cross(edges[0],edges[1])],edges.flatMap(e=>basis.map(a=>cross(e,a))));
 for(const axis of axes){if(dot(axis,axis)<1e-14)continue;const values=tri.map(p=>dot(p,axis)),radius=axis.reduce((s,v,k)=>s+Math.abs(v)*box.half[k],0);if(Math.min(...values)>=radius-1e-6||Math.max(...values)<=-radius+1e-6)return false;}
 return true;
}
for(let step=0;step<=40;step++){
 const t=step/40,data=global.Driftworks.scene3d.miningPlatformGeometry(1,0,false,t).ochre;
 // Ten ochre triangles per leaf (front and edges); reconstruct the steel back faces too.
 for(let i=0;i<8*20*18;i+=18){const tri=[0,6,12].map(k=>data.slice(i+k,i+k+3));const triangles=[tri];if((i/18)%10<2)triangles.push(tri.map(p=>p.map((v,k)=>v-data[i+3+k]*.22)));for(const face of triangles)for(let n=0;n<frame.length;n++)assert.ok(!intersects(face,frame[n]),`Door triangle ${i/18} intersects frame member ${n} at opening ${t}`);}
}
console.log('PASS bay ramps: thick panel sweep clears posts, perimeter rails, pod ribs and sockets at 41 positions');
function doorTriangles(t){
 const data=global.Driftworks.scene3d.miningPlatformGeometry(1,0,false,t).ochre,out=[];
 for(let i=0;i<8*20*18;i+=18){const tri=[0,6,12].map(k=>data.slice(i+k,i+k+3));out.push(tri);if((i/18)%10<2)out.push(tri.map(p=>p.map((v,k)=>v-data[i+3+k]*.22)));}
 return out;
}
module.exports={doorTriangles,sub,dot,cross};
