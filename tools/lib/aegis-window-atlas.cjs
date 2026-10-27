'use strict';
module.exports=function(c){
  for(let tile=0;tile<8;tile++){
   const x=(tile%4)*256,y=Math.floor(tile/4)*128,lit=tile!==2&&tile!==6,warm=tile%3!==0;
   c.save();c.translate(x,y);c.fillStyle='#101719';c.fillRect(0,0,256,128);
   c.fillStyle='#505959';c.fillRect(4,4,248,120);
   c.fillStyle='#252e31';c.fillRect(7,8,242,112);
   c.fillStyle='#080f13';c.fillRect(15,15,226,98);
   // Deep reveal around a smaller, lit back wall makes this read as an opening.
   c.fillStyle=lit?(warm?'#69675b':'#52636b'):'#19252b';c.fillRect(29,30,198,68);
   c.fillStyle=lit?(warm?'#aca48a':'#80989e'):'#26343a';
   c.beginPath();c.moveTo(15,15);c.lineTo(241,15);c.lineTo(227,30);c.lineTo(29,30);c.fill();
   c.fillStyle=lit?'#333d3e':'#111b20';c.beginPath();c.moveTo(15,113);c.lineTo(241,113);c.lineTo(227,98);c.lineTo(29,98);c.fill();
   c.fillStyle=lit?(warm?'#c4bba0':'#9db6bd'):'#263a44';c.fillRect(48,31,155,3);
   c.fillStyle=lit?'#3b4545':'#142127';c.fillRect(56+(tile%3)*23,43,3,55);c.fillRect(29,76,198,2);
   c.fillStyle=lit?'#263034':'#101b20';c.fillRect(154,66,46,32);c.fillRect(34,88,50,10);
   // Subtle reflections across the glass, without an opaque luminous fill.
   c.fillStyle='rgba(159,192,205,.08)';c.beginPath();c.moveTo(62,16);c.lineTo(108,16);c.lineTo(61,112);c.lineTo(18,112);c.fill();
   if(tile%2===0){c.fillStyle='#131d21';c.fillRect(125,15,6,98);c.fillStyle='#627274';c.fillRect(125,15,1,98);}
   c.fillStyle='#89928d';c.fillRect(9,119,238,2);c.restore();
  }
};
