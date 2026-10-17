const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
global.window=global;global.DRIFTWORKS_TEST_MODE=true;global.addEventListener=()=>{};global.document={};
for(const name of ['propulsion','combat','logistics','formations','sim','population','session','tactical/camera','audio','hud','scene3d','game']){
  vm.runInThisContext(fs.readFileSync(require('node:path').join(__dirname,'../src',name+'.js'),'utf8'),{filename:name});
}
(async()=>{
  const THREE=await import('../vendor/three/build/three.module.js');
  const {geometryFromInterleaved,applyCameraFrame}=await import('./asteroid-three-bridge.js');
  const api=Driftworks.scene3d,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} differs from ${b}`);
  const asteroid=Driftworks.sim.createInitialWorld().asteroids[0],data=api.asteroidMesh(asteroid),geometry=geometryFromInterleaved(data);
  assert.equal(geometry.attributes.position.data.array,data,'Three consumes the original mesh buffer');
  assert.equal(geometry.attributes.position.count,data.length/6);
  for(let i=0;i<data.length/6;i+=137){for(let k=0;k<3;k++){near(geometry.attributes.position.getComponent(i,k),data[i*6+k]);near(geometry.attributes.normal.getComponent(i,k),data[i*6+k+3]);}}
  const perspective=new THREE.PerspectiveCamera(),viewport={width:640,height:480};
  let comparisons=0;
  function check(camera,orbit,points){
    const basis=api.view(camera,viewport,orbit),eye=[camera.x+basis.back[0]*basis.distance,camera.y+basis.back[1]*basis.distance,(orbit.height||0)+basis.back[2]*basis.distance];
    applyCameraFrame(perspective,eye,basis,viewport.width/viewport.height);
    for(const point of points){const raw=api.project(point,camera,viewport,orbit);if(raw.depth<=.1)continue;
      const projected=new THREE.Vector3(...point).project(perspective);
      near((projected.x*.5+.5)*viewport.width,raw.x);near((-.5*projected.y+.5)*viewport.height,raw.y);comparisons++;
    }
  }
  for(const yaw of [0,.7,2.4])for(const tilt of [.06,.9,Math.PI-.06])for(const zoom of [.4,4])check({x:17,y:-23,zoom},{yaw,tilt,height:9},[[0,0,0],[30,20,10],[-40,-10,20],[17,-23,9]]);
  check({x:0,y:-1,zoom:4},{yaw:0,tilt:1,height:2,surface:{right:[1,0,0],up:[0,0,1],back:[0,-1,0],distance:1,focal:1/Math.tan(Math.PI/8)}},[[0,3,0],[1,4,2],[-1,5,3]]);
  assert.ok(comparisons>60);
  const shader=api.rockSurfaceShader();assert.ok(shader.startsWith(Driftworks.asteroidArt.shaderSource));assert.ok(shader.includes('vec3 rockBump')&&shader.includes('vec4 globeCraters'));
  geometry.dispose();
  console.log(`PASS Three.js asteroid bridge: original interleaved positions/normals and ${comparisons} projected landmarks across orbit, underside, pan, zoom and surface cameras`);
})().catch(error=>{console.error(error);process.exitCode=1;});
