'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{createCanvas}=require('@napi-rs/canvas');
const root=path.join(__dirname,'..'),ctx=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(path.join(root,'assets/ships/aegis-kit/flight-rig.js'),'utf8'),ctx);
const canvas=createCanvas(1024,512);require('./lib/aegis-nozzle.cjs')([],ctx.window.Driftworks.aegisFlightAsset,1,canvas);
fs.writeFileSync(path.join(root,'assets/ships/aegis-kit/engine-atlas.png'),canvas.toBuffer('image/png'));
console.log('Baked approved nozzle atlas: 1024 x 512');
