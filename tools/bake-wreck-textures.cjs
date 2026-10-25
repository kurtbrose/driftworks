'use strict';
// Offline only: NODE_PATH may point to the bundled sharp installation.
// No authoring library is loaded by the deployed site.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const context={window:{Driftworks:{}}};
for(const pack of ['quaternius-ultimate-spaceships','concept-trio','ohio-vehicles'])vm.runInNewContext(fs.readFileSync(path.join(root,'assets/ships',pack,'meshes.js'),'utf8'),context);
function burn(data,width,height){
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,u=x/width,v=y/height;
  const field=Math.sin(u*23+Math.sin(v*19)*2)+Math.sin(v*31-u*11)*.65+Math.sin(u*83+v*67)*.22;
  const grain=(Math.sin(x*127.1+y*311.7)*43758.5453)%1;
  const soot=Math.max(0,Math.min(1,(field+.65)*.65)),metal=Math.max(0,-field-.35)*.22,heat=Math.max(0,1-Math.abs(field+.25)*3)*.13;
  const luma=data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722,base=12+luma*(.19+metal-soot*.13)+grain*5;
  // Uint8ClampedArray matches Canvas ImageData's rounding and clamping.
  const rgb=new Uint8ClampedArray([base+heat*95,base*.98+heat*38,base*1.06+heat*12]);
  data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];
 }
 return data;
}
async function main(){
 const seen=new Set(),manifest=[];
 for(const pack of context.window.Driftworks.shipPacks)for(const model of pack.models){
  const relative='assets/ships/'+pack.id+'/'+model.texture;if(seen.has(relative))continue;seen.add(relative);
  const source=fs.readFileSync(path.join(root,relative)),decoded=await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width,height}=decoded.info,data=burn(decoded.data,width,height),output=relative.replace(/\.[^.]+$/,'.wreck.webp');
  // Lossless retains the approved pixel treatment, resolution and alpha exactly.
  const result=await sharp(data,{raw:{width,height,channels:4}}).webp({lossless:true,effort:6}).toBuffer();
  fs.writeFileSync(path.join(root,output),result);manifest.push({source:relative,sha256:crypto.createHash('sha256').update(source).digest('hex'),output,outputSha256:crypto.createHash('sha256').update(result).digest('hex'),width,height,bytes:result.length});
 }
 fs.writeFileSync(path.join(root,'assets/ships/wreck-textures.json'),JSON.stringify({version:1,recipe:'approved-soot-v1',format:'lossless WebP',textures:manifest},null,2)+'\n');
 console.log('Baked '+manifest.length+' wreck textures, '+manifest.reduce((n,t)=>n+t.bytes,0)+' bytes');
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={burn};
