'use strict';
// Optional offline authoring convenience. The site still loads kit.js directly.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');

function loadKit(){
  const context={console,AbortController,btoa:s=>Buffer.from(s,'binary').toString('base64')};
  context.window=context;vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'vendor/three/build/three.global.js'),'utf8'),context);
  const source=fs.readFileSync(path.join(root,'assets/ships/industrial-kit/kit.js'),'utf8')
    .replace(/^import .*?;\s*/m,'const T=THREE;\n').replace(/^export (?=(?:const|function) )/gm,'');
  vm.runInContext(source+'\nglobalThis.kit={moduleStandard,routePresets,standardBay,buildConsist,dimensions,part,assembly,shipNames,setSurfaceTexture,setCranePose,setArmExtension,setHoistPayout,batchStatic,disposeBatch,exportGLTF};',context);
  context.kit.setSurfaceTexture(new context.THREE.Texture(),'data:image/png;base64,'+fs.readFileSync(path.join(root,'assets/ships/industrial-kit/panels.png')).toString('base64'));
  return {kit:context.kit,THREE:context.THREE};
}

function main(args){
  const {kit}=loadKit(),names=[...Object.keys(kit.dimensions),...kit.shipNames,'modular','kit'];
  const selection=args[0]||'all';
  if(selection!=='all'&&!names.includes(selection))throw new Error('Choose all or: '+names.join(', '));
  const destination=path.resolve(args[1]||path.join(root,'output/industrial-kit/gltf'));
  fs.mkdirSync(destination,{recursive:true});
  for(const name of selection==='all'?names:[selection]){
    const obj=[...kit.shipNames,'modular','kit'].includes(name)?kit.assembly(name):kit.part(name);
    const filename=path.join(destination,'industrial-'+name+'-study02.gltf');
    fs.writeFileSync(filename,kit.exportGLTF(obj)+'\n');console.log(path.relative(root,filename));
  }
}
module.exports={loadKit};
if(require.main===module){try{main(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}}
