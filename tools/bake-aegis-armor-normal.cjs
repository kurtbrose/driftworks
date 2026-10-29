'use strict';
const fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};
for(const file of ['bevel','fleet'])vm.runInNewContext(fs.readFileSync(`studies/aegis-${file}-data.js`,'utf8'),context);
const source=context.window.AegisBevelData,faces=[];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
for(let i=0;i<source.original.length;i+=18){const n=source.original.slice(i+3,i+6),d=dot(n,source.original.slice(i,i+3));let f=faces.find(f=>dot(n,f.n)>1-1e-7&&Math.abs(d-f.d)<1e-4);if(!f){f={n,d,points:[]};faces.push(f);}for(let j=0;j<18;j+=6)f.points.push(source.original.slice(i+j,i+j+3));}
const charts=faces.map((f,id)=>{let u=cross(f.n,Math.abs(f.n[2])<.9?[0,0,1]:[0,1,0]);const length=Math.hypot(...u);u=u.map(v=>v/length);const v=cross(f.n,u),lo=[u,v].map(a=>Math.min(...f.points.map(p=>dot(p,a)))),span=[u,v].map((a,i)=>Math.max(...f.points.map(p=>dot(p,a)))-lo[i]);return {n:f.n,d:f.d,u:u.map(x=>x*240/span[0]/2048),v:v.map(x=>x*240/span[1]/1024),offset:[((id%8)*256+8-lo[0]*240/span[0])/2048,(Math.floor(id/8)*256+8-lo[1]*240/span[1])/1024]};});
const data={sourceHash:source.sourceHash,centers:context.window.AegisFleetData.centers,extent:[0,1,2].map(k=>Math.max(...source.original.filter((_,i)=>i%6===k).map(Math.abs))),charts};
for(const [file,bytes] of [['armor-normal.json',Buffer.from(JSON.stringify(data)+'\n')],['armor-normal.png',fs.readFileSync('studies/aegis-normal-atlas-512.png')]]){const path='assets/ships/aegis-kit/'+file;if(process.argv.includes('--check')){if(!fs.readFileSync(path).equals(bytes))throw Error('Stale '+path);}else fs.writeFileSync(path,bytes);}
console.log('Production armor normal: 512 × 256, 26 charts, 20 shared bands.');
