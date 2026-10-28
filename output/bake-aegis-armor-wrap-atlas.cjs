'use strict';
const fs=require('node:fs'),{createCanvas,loadImage}=require('@napi-rs/canvas');
(async()=>{const image=await loadImage('output/aegis-armor-atlas-v1.png'),canvas=createCanvas(2048,1024),c=canvas.getContext('2d');c.drawImage(image,0,0);
 // Atlas layout only. Reuse the generated upper wrap as a vertically mirrored lower wrap.
 c.drawImage(image,0,0,512,512,0,0,512,512);c.save();c.translate(0,1024);c.scale(1,-1);c.drawImage(image,0,0,512,512,0,0,512,512);c.restore();
 fs.writeFileSync('output/aegis-armor-atlas-v2.png',canvas.toBuffer('image/png'));console.log('Packed mirrored upper/lower wrap in existing atlas footprint.');
})().catch(e=>{console.error(e);process.exitCode=1;});
