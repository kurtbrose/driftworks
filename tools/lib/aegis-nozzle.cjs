/* Review-only open bell with an 13.8 m recessed throat; existing engine batch ownership. */
'use strict';
module.exports=function(batches,asset,U,c){
 c.width=1024;c.height=512;const g=c.getContext('2d');
 g.fillStyle='#151b20';g.fillRect(0,0,512,512);
 const grad=g.createRadialGradient(256,256,8,256,256,250);
 for(const [stop,color] of [[0,'#c6e4e8'],[.14,'#8fb9c4'],[.24,'#326274'],[.32,'#132630'],[.5,'#0b1219'],[.7,'#202b31'],[.89,'#4a5355'],[.94,'#222c31'],[1,'#6b7372']])grad.addColorStop(stop,color);
 g.fillStyle=grad;g.beginPath();g.arc(256,256,250,0,Math.PI*2);g.fill();
 for(let i=0;i<32;i++){const a=i*Math.PI/16;g.save();g.translate(256,256);g.rotate(a);g.strokeStyle='#121c23';g.lineWidth=5;g.beginPath();g.moveTo(94,0);g.lineTo(226,0);g.stroke();g.strokeStyle='#596367';g.lineWidth=2;g.beginPath();g.moveTo(157,4);g.lineTo(225,4);g.stroke();g.restore();}
 for(const [r,color,w] of [[240,'#8a8e86',4],[224,'#182329',6],[168,'#3d4c51',3],[91,'#1c3d4c',5],[58,'#537e8b',3]]){g.strokeStyle=color;g.lineWidth=w;g.beginPath();g.arc(256,256,r,0,Math.PI*2);g.stroke();}
 const palettes=asset.engines[0].batches.map(b=>b.color);palettes.forEach((color,i)=>{g.fillStyle='rgb('+color.map(v=>Math.round(v*255)).join(',')+')';g.fillRect(520+i*96,0,88,512);});
 return batches.map(b=>{const engine=asset.engines.find(e=>Math.abs(b.origin[0]-e.position[0]/U)<.001&&Math.abs(b.origin[1]-e.position[1]/U)<.001&&Math.abs(b.origin[2]-1200-e.position[2]/U)<.001);if(!engine)return b;
 const index=engine.batches.findIndex(e=>e.vertices.length===b.vertices.length&&e.color.every((v,i)=>Math.abs(v-b.color[i])<.0001));if(index<0)return b;
 const out=[],plain=[(564+index*96)/1024,.5];
 const emit=(p,uv=plain)=>out.push(...p,...uv);
 // Clip the old capped exhaust at the bell root, retaining the original barrel.
 for(let i=0;i<b.vertices.length;i+=18){let poly=[0,1,2].map(j=>Array.from(b.vertices.subarray(i+j*6,i+j*6+6)));const cut=[];
 for(let j=0;j<poly.length;j++){const a=poly[j],z=poly[(j+1)%poly.length],inside=a[0]*U<=18,other=z[0]*U<=18;if(inside)cut.push(a);if(inside!==other){const t=(18/U-a[0])/(z[0]-a[0]);const p=a.map((v,k)=>v+(z[k]-v)*t);const n=Math.hypot(...p.slice(3));for(let k=3;k<6;k++)p[k]/=n;cut.push(p);}}
 for(let j=1;j+1<cut.length;j++)for(const p of [cut[0],cut[j],cut[j+1]])emit(p);
 }
 const uv=(r,a)=>[(256+Math.cos(a)*r/22.5*250)/1024,(256-Math.sin(a)*r/22.5*250)/512];
 const point=(x,r,a,n)=>[x/U,r*Math.cos(a)/U,r*Math.sin(a)/U,...n];
 const segments=32;
 if(index===1){
 const profile=[[18,18.9],[30.8,22.5],[32,22.5],[32,20.7],[25,17.4],[21,11],[18.2,6.2]];
 for(let k=0;k<profile.length-1;k++){const [x,r]=profile[k],[xx,rr]=profile[k+1],dx=xx-x,dr=rr-r,l=Math.hypot(dx,dr);
 for(let j=0;j<segments;j++){const a=j*2*Math.PI/segments,z=(j+1)*2*Math.PI/segments;
 const v=(x,r,a)=>point(x,r,a,[-dr/l,dx/l*Math.cos(a),dx/l*Math.sin(a)]);
 const A=v(x,r,a),B=v(xx,rr,a),C=v(xx,rr,z),D=v(x,r,z);
 for(const [p,radius,angle] of [[A,r,a],[C,rr,z],[B,rr,a],[A,r,a],[D,r,z],[C,rr,z]])emit(p,uv(radius,angle));
 }}
 }
 if(index===4){for(let j=0;j<segments;j++){const a=j*2*Math.PI/segments,z=(j+1)*2*Math.PI/segments;emit([18.2/U,0,0,1,0,0],uv(0,0));emit(point(18.2,6.2,a,[1,0,0]),uv(6.2,a));emit(point(18.2,6.2,z,[1,0,0]),uv(6.2,z));}}
 return Object.assign({},b,{vertices:new Float32Array(out),stride:8,texture:c,color:[1,1,1],finish:0});
 });
};
