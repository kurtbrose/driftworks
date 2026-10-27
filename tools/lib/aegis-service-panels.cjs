'use strict';
module.exports=function(c){c.save();c.translate(1024,0);
 c.fillStyle='#a6b1b4';c.fillRect(0,0,512,512);
 for(let row=0;row<3;row++)for(let col=0;col<2;col++){
  const x=18+col*244,y=20+row*158,w=232,h=145;
  c.fillStyle=row===1?'#b3bbbd':'#a4aeb1';c.fillRect(x,y,w,h);
  c.strokeStyle='#45545a';c.lineWidth=3;c.strokeRect(x,y,w,h);
  c.strokeStyle='#ccd0cc';c.lineWidth=2;c.strokeRect(x+4,y+4,w-8,h-8);
  if(row===1&&col===0){for(let i=0;i<7;i++){c.fillStyle='#4d5b61';c.fillRect(x+28,y+32+i*11,w-56,5);c.fillStyle='#b8c1c0';c.fillRect(x+28,y+37+i*11,w-56,1);}}
  else if(row===1){c.strokeStyle='#6b7a7f';c.lineWidth=3;c.strokeRect(x+30,y+24,w-60,h-48);c.fillStyle='#d5d4be';c.fillRect(x+w-50,y+65,8,20);c.fillStyle='#45535a';c.fillRect(x+25,y+35,10,14);c.fillRect(x+25,y+h-49,10,14);}
  for(const xx of [x+10,x+w-10])for(const yy of [y+10,y+h-10]){c.fillStyle='#58666b';c.fillRect(xx-2,yy-2,4,4);}
 }
 c.restore();
};
