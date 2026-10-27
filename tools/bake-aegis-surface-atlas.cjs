'use strict';
// Offline authoring only. NODE_PATH may point at a local @napi-rs/canvas install.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createCanvas}=require('@napi-rs/canvas');
const root=path.join(__dirname,'..'),ctx=vm.createContext({window:{},document:{createElement:()=>createCanvas(2048,1024)}});
for(const f of ['assets/ships/aegis-kit/flight-rig.js','output/aegis-surface-study.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
const source=ctx.window.Driftworks.aegisFlightAsset;
const canvas=ctx.window.AegisSurfaceStudy.atlas(source.surface,source);
fs.writeFileSync(path.join(root,'assets/ships/aegis-kit/surface-atlas.png'),canvas.toBuffer('image/png'));
console.log('Baked approved Aegis surface atlas (2048 x 1024)');
