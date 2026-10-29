/* Review-only surface treatment. Uses the production renderer without shader changes. */
(function(){
 'use strict';
 function atlas(surface,source){
  const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=1024;
  const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,2048,1024);
  let seed=7341;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  function rect(x,y,w,h,fill){c.fillStyle=fill;c.fillRect(x,y,w,h);}
  function line(x,y,x2,y2,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();}
  for(let tile=0;tile<7;tile++){
   c.save();c.translate((tile%4)*512,Math.floor(tile/4)*512);
   const service=tile===2,metal=tile===3;
   rect(0,0,512,512,service?'#a5acb0':metal?'#c2c8ca':'#ecece8');
   // Soft cavity at the perimeter; no directional baked highlights or shadows.
   const shade=c.createLinearGradient(0,0,512,0);shade.addColorStop(0,'#0005');shade.addColorStop(.05,'#0000');shade.addColorStop(.95,'#0000');shade.addColorStop(1,'#0005');c.fillStyle=shade;c.fillRect(0,0,512,512);
   const rows=service?5:tile===1||tile===5?3:4;
   for(let row=0;row<rows;row++){
    const y=22+row*(468/rows),h=468/rows-5;
    const split=service?185:tile>=4?310:260;
    for(const [x,w] of [[22,split-25],[split,490-split]]){
     rect(x,y,w,h,service?(row%2?'#a0a7aa':'#b2b7b9'):metal?'#cbd0d0':row%3===0?'#e1e3e1':'#f0f0eb');
     c.strokeStyle=service?'#555f64':'#a5aaa9';c.lineWidth=1.8;c.strokeRect(x,y,w,h);
     // Local access fittings: sparse, subordinate to large armor panels.
     if((row+tile)%3===0){
      const hx=x+13,hy=y+12;rect(hx,hy,Math.min(53,w-25),22,service?'#626c72':'#c4c9c8');
      line(hx+4,hy+6,hx+30,hy+6,'#949c9e',2);
      for(let j=0;j<3;j++)line(hx+5+j*8,hy+12,hx+5+j*8,hy+18,'#818b8e',2);
     }
     if(service){for(let j=0;j<8;j++)rect(x+12+j*9,y+h*.45,4,h*.32,'#4b565c');}
     else{
      for(const xx of [x+5,x+w-5])for(const yy of [y+5,y+h-5])rect(xx,yy,1.6,1.6,'#92999a');
     }
    }
   }
   // Restrained maintenance marks; no giant labels or repeated hazard stripes.
   if(!service&&!metal){
    const y=tile>=4?366:142;
    rect(28,y,4,32,'#969f9f');rect(36,y,13,3,'#969f9f');rect(36,y+29,13,3,'#969f9f');
    for(let i=0;i<4;i++)rect(428+i*8,465,4,9,'#a4aaa8');
   }
   // Low-contrast fine variation disappears naturally in mipmaps.
   for(let i=0;i<13000;i++){const k=random();c.fillStyle=k>.5?'rgba(255,255,255,.035)':'rgba(15,23,27,.025)';c.fillRect(random()*512,random()*512,1+random()*3,1);}
   c.restore();
  }
  // Tiny constant-color swatches keep merged idle guns/engines at their
  // original material color while sharing the hull's textured material draw.
  if(surface&&source)surface.batches.forEach((b,i)=>{if(!b)return;c.fillStyle='rgb('+source.batches[i].color.map((v,k)=>Math.round(255*v/b.color[k])).join(',')+')';c.fillRect(1552+i*60,540,32,32);});
  paintMarkings(c);
  return canvas;
 }
 function paintMarkings(c){
  c.save();c.translate(1024,512);c.fillStyle='#e6e7e2';c.fillRect(0,0,512,512);
  c.strokeStyle='#b6bcb8';c.lineWidth=2;
  for(let x=20;x<512;x+=118){c.beginPath();c.moveTo(x,0);c.lineTo(x,512);c.stroke();}
  c.fillStyle='#64706e';c.textAlign='center';c.save();c.translate(256,300);c.scale(1,2.2);c.font='bold 70px "Consolas", monospace';c.fillText('BAY 01',0,0);c.restore();
  c.fillStyle='#b38e50';c.fillRect(22,36,20,440);c.fillRect(470,36,20,440);
  c.restore();
 }
 function prepare(batches,data,image,hullCount){
  if(data.uv.length!==hullCount)throw new Error('Surface study does not match the hull batch count');
  return batches.map((b,index)=>{
   if(index>=hullCount)return b;
   const uv=data.uv[index];if(uv.length!==b.vertices.length/3)throw new Error('Surface study vertex mismatch');
   // All-white tiles have no detail and need no UV upload or texture sample.
   const hasDetail=uv.some((v,i)=>i%2===0&&Math.abs(v-.875)>1e-5);
   if(!hasDetail)return b;
   const vertices=new Float32Array(b.vertices.length/6*8);
   for(let i=0,j=0;i<b.vertices.length;i+=6,j+=8){vertices.set(b.vertices.subarray(i,i+6),j);vertices[j+6]=uv[i/3];vertices[j+7]=uv[i/3+1];}
   const brightness=Math.max(...b.color);
   const color=brightness<.05?[.026,.034,.04]:b.color.map(v=>Math.min(1,v*1.06));
   return Object.assign({},b,{vertices,stride:8,texture:image,color});
  });
 }
 function prepareTurrets(batches,data,image,source){
  const result=batches.slice();let offset=source.batches.length;
  source.turrets.forEach((t,i)=>{
   const originals=batches.slice(offset,offset+t.batches.length);
   const treated=prepare(originals,{uv:data.turrets[i]},image,t.batches.length);
   treated.forEach((b,j)=>result[offset+j]=b);offset+=t.batches.length;
  });
  return result;
 }
 window.AegisSurfaceStudy={atlas,prepare,prepareTurrets,paintMarkings};
})();
