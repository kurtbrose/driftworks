const assert=require('node:assert/strict');
const DW=global.Driftworks,T=DW.miningTerrain,scene=DW.scene3d;
assert.equal(require('./mining-study-terrain.js'),T,'Study adapter must use the production solver');
for(const t of [0,.2,.4,.75,1])assert.deepEqual(scene.miningPlatformRampGeometry(t).ochre,scene.miningPlatformGeometry(1,0,false,t).ochre.slice(0,160*18),'Sweep-only geometry exactly matches all sixteen moving leaves');
const world=DW.sim.createInitialWorld(),a=world.asteroids[0],p=world.platforms[0];
p.state='setting-up';p.asteroidId=a.id;p.siteAngle=.7;p.siteDepth=.5;p.landingElapsedSeconds=38;p.landingReleaseRotation=a.rotation;
function place(){const theta=p.siteAngle+a.rotation,r=DW.sim.surfaceRadius(a,p.siteAngle)*p.siteDepth;p.position={x:a.position.x+Math.cos(theta)*r,y:a.position.y+Math.sin(theta)*r};}
place();const before=JSON.stringify(world),surface=scene.platformSurface(p,a,true);
assert.ok(surface.fit.valid);assert.equal(surface.fit.contacts.filter(c=>c.reachable).length,8);assert.equal(surface.ramps.length,8);assert.ok(surface.ramps.every(t=>t>0&&t<=1));
assert.ok(surface.ramps.some(t=>t<1),'Production ramps stop on the actual mesh');
assert.equal(JSON.stringify(world),before,'Contact solving never mutates persistent world data');
const stats={...surface.sample.stats};
for(const zoom of [.5,1,8,32,80]){world.camera.zoom=zoom;assert.equal(scene.platformSurface(p,a,true),surface);}
assert.deepEqual(surface.sample.stats,stats,'Camera changes never repeat raycasts or ramp sweeps');
assert.equal(scene.platformSurfaceGeometry(surface,1,1),scene.platformSurfaceGeometry(surface,1,1),'Idle mesh reused');
const near=(a,b,tolerance=1e-4)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
for(const spin of [-.8,0,.9]){a.rotation=spin;place();const pose=scene.platformSurfacePose(surface,p,a),theta=p.siteAngle+spin,c=Math.cos(theta),s=Math.sin(theta);
  assert.equal(scene.platformSurface(p,a,true),surface,'Rotation reuses the same asteroid-local solution');
  for(const contact of surface.fit.contacts){const ground=contact.worldPoint,actual=pose.world(contact.point);
    near(actual[0],p.position.x+(c*ground[0]-s*ground[1])*surface.scale);
    near(actual[1],p.position.y+(s*ground[0]+c*ground[1])*surface.scale);
    near(actual[2],ground[2]*surface.scale);
  }
  const point=[1,2,3],normal=[0,0,1],batch=T.transform({vertices:new Float32Array(point.concat(normal))},pose),expected=pose.world(point),n=pose.rotate(normal);
  expected.concat(n).forEach((v,k)=>near(batch.vertices[k],v));near(Math.hypot(...n),1);
}
// Both hinges and thick underside faces stay clear throughout the production opening.
for(const progress of [0,.25,.5,.75,1]){
  const geometry=scene.platformSurfaceGeometry(surface,1,progress),data=geometry.ochre;
  for(let i=0;i<160;i++){
    const offset=i*18,tri=[0,6,12].map(k=>data.slice(offset+k,offset+k+3));
    assert.ok(!surface.sample.collides(tri.map(surface.fit.world)),'Production leaf stays above rock');
    if(i%10<2)assert.ok(!surface.sample.collides(tri.map(v=>surface.fit.world(v.map((x,k)=>x-data[offset+3+k]*.22)))),'Production thick underside stays above rock');
  }
}
p.landingElapsedSeconds=21;const hover=scene.platformSurfacePose(surface,p,a).world([0,0,0]);p.landingElapsedSeconds=32;const landed=scene.platformSurfacePose(surface,p,a).world([0,0,0]);near(hover[2]-landed[2],50/DW.sim.METERS_PER_UNIT);
const original=a.radius;a.radius*=1.01;assert.notEqual(scene.platformSurface(p,a),surface,'Changing physical terrain invalidates the fit');a.radius=original;
console.log('PASS production mining contacts: shared solver, exact ramp sweep mesh, eight anchors, physical scale, rotation/zoom cache reuse, thick-leaf clearance and airborne height');

const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'mining-platform-gameplay.html'),'utf8');
for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
const loaded=DW.sim.deserializeWorld(DW.sim.serializeWorld(world));
const rebuilt=scene.platformSurface(loaded.platforms[0],loaded.asteroids[0],true);
assert.ok(rebuilt.fit.valid,'Saved platform reconstructs valid contacts without storing renderer resources');
assert.deepEqual(rebuilt.ramps,surface.ramps,'Reload preserves the same independent ramp stops');

// Exercise the real preview wiring: its asteroid must keep spinning after touchdown.
const controls={time:{value:'38'},spin:{value:'0'},rotate:{checked:true},play:{},status:{},scene:{}};
let renderWorld,frame;
const fakeScene={setOrbit:()=>{},sync:w=>renderWorld=w,render:()=>{}};
const previewDW={...DW,scene3d:{...scene,create:()=>fakeScene,platformSurface:()=>({fit:{contacts:Array.from({length:8},()=>({reachable:true}))},ramps:Array(8).fill(.8)})}};
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
vm.runInNewContext(scripts[scripts.length-1][1],{window:{Driftworks:previewDW},document:{getElementById:id=>controls[id]},location:{search:''},URLSearchParams,innerWidth:1200,innerHeight:800,requestAnimationFrame:callback=>frame=callback});
frame(1000);const initialRotation=renderWorld.asteroids[0].rotation;
frame(1100);assert.notEqual(renderWorld.asteroids[0].rotation,initialRotation,'Asteroid rotates while the landed rig stays attached');
assert.equal(renderWorld.platforms[0].landingElapsedSeconds,38);
controls.rotate.checked=false;const pausedRotation=renderWorld.asteroids[0].rotation;frame(1200);assert.equal(renderWorld.asteroids[0].rotation,pausedRotation,'Rotation checkbox freezes the body');
controls.play.onclick();assert.equal(controls.time.value,'0','Replay resets the release clock');
console.log('PASS gameplay preview: continuous asteroid rotation, freeze control and replay reset');
