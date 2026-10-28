'use strict';
// Offline atlas packing only: generated tiles replace armor; approved other tiles stay byte-identical.
const fs=require('node:fs'),{createCanvas,loadImage}=require('@napi-rs/canvas');
(async()=>{
 const original=await loadImage('assets/ships/aegis-kit/surface-atlas.png'),armor=await loadImage('output/aegis-armor-source-v1.png');
 const canvas=createCanvas(original.width,original.height),ctx=canvas.getContext('2d');ctx.drawImage(original,0,0);
 for(const [index,tile] of [0,1,4,5].entries())ctx.drawImage(armor,index%2*armor.width/2,Math.floor(index/2)*armor.height/2,armor.width/2,armor.height/2,tile%4*512,Math.floor(tile/4)*512,512,512);
 fs.writeFileSync('output/aegis-armor-atlas-v1.png',canvas.toBuffer('image/png'));
 const baseline=createCanvas(original.width,original.height),b=baseline.getContext('2d');b.drawImage(original,0,0);
 for(const tile of [2,3,6,7]){const x=tile%4*512,y=Math.floor(tile/4)*512;if(!Buffer.from(ctx.getImageData(x,y,512,512).data).equals(Buffer.from(b.getImageData(x,y,512,512).data)))throw Error('Preserved atlas tile changed: '+tile);}
 console.log('Packed four complete ImageGen armor tiles; unchanged 2048 x 1024 atlas and four approved non-armor tiles.');
})().catch(e=>{console.error(e);process.exitCode=1;});
