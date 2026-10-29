/* Review-only nozzle finish on existing engine triangles. */
(function(){'use strict';window.AegisEngineFlatStudy=function(batches,asset,U){
 const c=document.createElement('canvas');c.width=1024;c.height=512;const g=c.getContext('2d');
 g.fillStyle='#151b20';g.fillRect(0,0,512,512);
 const grad=g.createRadialGradient(256,256,8,256,256,250);
 for(const [stop,color] of [[0,'#c6e4e8'],[.14,'#8fb9c4'],[.24,'#326274'],[.32,'#132630'],[.5,'#0b1219'],[.7,'#202b31'],[.89,'#4a5355'],[.94,'#222c31'],[1,'#6b7372']])grad.addColorStop(stop,color);
 g.fillStyle=grad;g.beginPath();g.arc(256,256,250,0,Math.PI*2);g.fill();
 for(let i=0;i<32;i++){const a=i*Math.PI/16;g.save();g.translate(256,256);g.rotate(a);g.strokeStyle='#121c23';g.lineWidth=5;g.beginPath();g.moveTo(94,0);g.lineTo(226,0);g.stroke();g.strokeStyle='#596367';g.lineWidth=2;g.beginPath();g.moveTo(157,4);g.lineTo(225,4);g.stroke();g.restore();}
 for(const [r,color,w] of [[240,'#8a8e86',4],[224,'#182329',6],[168,'#3d4c51',3],[91,'#1c3d4c',5],[58,'#537e8b',3]]){g.strokeStyle=color;g.lineWidth=w;g.beginPath();g.arc(256,256,r,0,Math.PI*2);g.stroke();}
 const palettes=asset.engines[0].batches.map(b=>b.color);palettes.forEach((color,i)=>{g.fillStyle='rgb('+color.map(v=>Math.round(v*255)).join(',')+')';g.fillRect(520+i*96,0,88,512);});
 return batches.map(b=>{const engine=asset.engines.find(e=>Math.abs(b.origin[0]-e.position[0]/U)<.001&&Math.abs(b.origin[1]-e.position[1]/U)<.001&&Math.abs(b.origin[2]-1200-e.position[2]/U)<.001);if(!engine)return b;
 const index=engine.batches.findIndex(e=>e.vertices.length===b.vertices.length&&e.color.every((v,i)=>Math.abs(v-b.color[i])<.0001));if(index<0)return b;
 const out=[];for(let i=0;i<b.vertices.length;i+=6){const p=Array.from(b.vertices.subarray(i,i+6));let u=(564+index*96)/1024,v=.5;if(p[0]*U>29){u=(256+p[1]*U/22.5*250)/1024;v=(256-p[2]*U/22.5*250)/512;}out.push(...p,u,v);}
 return Object.assign({},b,{vertices:new Float32Array(out),stride:8,texture:c,color:[1,1,1],finish:0});
 });
};})();
