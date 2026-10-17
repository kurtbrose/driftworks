const assert=require('node:assert/strict');
(async()=>{
  const {sweepAxes,isStaticAirlock,viewDirections}=await import('data:text/javascript;base64,'+require('node:fs').readFileSync(require('node:path').join(__dirname,'mining-study-navigation.js')).toString('base64'));
  for(const yaw of [0,.7,1.5,Math.PI]){
    const {forward:f,right:r}=viewDirections(yaw,0);
    assert.ok(Math.abs(r[0]-f[1])<1e-10 && Math.abs(r[1]+f[0])<1e-10,'Strafe right matches camera forward cross Z-up');
    const turned=viewDirections(yaw-.01,0).forward;
    assert.ok((turned[0]-f[0])*r[0]+(turned[1]-f[1])*r[1]>0,'Mouse-right yaw turns toward camera right');
  }
  const position={x:0,y:0,z:6};const probes=[];
  sweepAxes(position,{x:1,y:2,z:0},(axis,sign,distance)=>{probes.push([axis,sign,distance]);return axis==='y';});
  assert.deepEqual(position,{x:1,y:0,z:6},'Blocked forward motion slides along the wall');
  assert.deepEqual(probes,[['x',1,1.22],['y',1,2.22]],'Sweeps include the full displacement and body clearance');
  sweepAxes(position,{x:0,y:0,z:3},()=>false);assert.equal(position.z,9,'Free-flight can traverse the well vertically');
  const model=global.Driftworks.scene3d.miningPlatformGeometry(1,0,false,'rampdock',1,'');let removed=0;
  for(const data of [model.light])for(let i=0;i<data.length;i+=18){const points=[0,6,12].map(j=>data.slice(i+j,i+j+3));if(isStaticAirlock(points))removed++;}
  assert.ok(removed===24,'Both static airlock leaves are removed before adding moving panels');
  assert.equal(isStaticAirlock([[.9,3.75,5],[1,3.75,5],[1,3.75,6]]),false,'Door jamb remains solid');
  assert.equal(isStaticAirlock([[0,1.1,5],[.5,1.1,5],[0,1.1,6]]),false,'Inner partition is preserved');
  console.log('PASS mining study: swept movement, wall sliding, vertical flight and static-door replacement');
})().catch(error=>{console.error(error);process.exitCode=1;});
