'use strict';
const fs=require('node:fs'),{createCanvas}=require('@napi-rs/canvas');const canvas=createCanvas(1024,256);require('./lib/aegis-window-atlas.cjs')(canvas.getContext('2d'));fs.writeFileSync('assets/ships/aegis-kit/window-atlas.png',canvas.toBuffer('image/png'));
