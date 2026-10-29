'use strict';
// Offline authoring only. NODE_PATH may point at a local @napi-rs/canvas install.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createCanvas,GlobalFonts}=require('@napi-rs/canvas');
// Match the browser's approved Windows monospace glyphs during offline baking.
const font=process.env.AEGIS_MARKING_FONT||'C:/Windows/Fonts/consolab.ttf';
if(!fs.existsSync(font))throw new Error('Set AEGIS_MARKING_FONT to the approved Consolas Bold font for a reproducible atlas bake');
GlobalFonts.registerFromPath(font,'Consolas');
const root=path.join(__dirname,'..'),ctx=vm.createContext({window:{},document:{createElement:()=>createCanvas(2048,1024)}});
for(const f of ['assets/ships/aegis-kit/flight-rig.js','studies/aegis-surface-study.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),ctx);
const source=ctx.window.Driftworks.aegisFlightAsset;
const canvas=ctx.window.AegisSurfaceStudy.atlas(source.surface,source);
require('./lib/aegis-service-panels.cjs')(canvas.getContext('2d'));
fs.writeFileSync(path.join(root,'assets/ships/aegis-kit/surface-atlas.png'),canvas.toBuffer('image/png'));
console.log('Baked approved Aegis surface atlas (2048 x 1024)');
