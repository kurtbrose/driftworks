const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/scene3d.js'),'utf8');
const start=source.indexOf("    canvas.addEventListener('wheel', function (e)");
const handlerSource=source.slice(start,source.indexOf("    window.addEventListener('keydown'",start));
function zoom(terrainZoom,deltaY){
 let world={camera:{x:0,y:0,zoom:1},asteroids:[{}]},handler,picks=0;
 const ctx={terrainZoom,study:true,focus:true,studyHeight:8,orbit:{height:8},canvas:{addEventListener(name,fn){handler=fn;}},getWorld:()=>world,setWorld:w=>world=w,pointer:()=>({x:200,y:150}),viewport:()=>({width:400,height:300}),pickAsteroid:()=>{picks++;return {position:[100,200,300]};},unproject:()=>null};
 vm.runInNewContext(handlerSource,ctx);handler({deltaY,preventDefault(){}});return {world,picks,height:ctx.orbit.height};
}
const subject=zoom(false,-100);assert.equal(subject.picks,0);assert.equal(subject.height,8);assert.equal(subject.world.camera.x,0);assert.ok(subject.world.camera.zoom>1);
const terrain=zoom(true,-100);assert.equal(terrain.picks,1);assert.equal(terrain.height,300);assert.equal(terrain.world.camera.x,100);
const out=zoom(false,100);assert.equal(out.picks,0);assert.equal(out.height,8);assert.ok(out.world.camera.zoom<1);
console.log('PASS study zoom: subject plane preserved with background asteroid; terrain-focus default retained');
