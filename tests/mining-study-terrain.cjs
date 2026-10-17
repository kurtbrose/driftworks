const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const T=require('./mining-study-terrain.js');
const length=v=>Math.hypot(...v),distance=(a,b)=>length(a.map((v,k)=>v-b[k]));
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} differs from ${b}`);
const plane=new Float32Array([-100,-100,0,0,0,1,100,-100,0,0,0,1,100,100,0,0,0,1,-100,-100,0,0,0,1,100,100,0,0,0,1,-100,100,0,0,0,1]);
const sampler=T.meshSampler(plane,1,[0,0]);
near(sampler.ray([0,0,10],[0,0,-1]).point[2],0);
near(sampler.ray([-5,0,5],[1,0,-1]).point[0],0);
assert.equal(sampler.ray([0,0,10],[0,0,1]),null,'A ray pointing away misses the rock');
const flat=T.fit(sampler,[0,0]);assert.ok(flat.valid);assert.equal(flat.contacts.length,8);
for(const c of flat.contacts){assert.ok(c.reachable);near(distance(c.mount,c.knee),4.8);near(distance(c.knee,c.tip),Math.hypot(3.2,2.6));near(flat.world(c.point)[2],0);}
assert.ok(!T.solveKnee([0,0,0],[20,0,0]).reachable,'Unreachable targets are reported');
assert.equal(T.fit({at:()=>null},[0,0]),null,'No surface is not a landing site');
const slope={at:(x,y)=>({point:[x,y,.12*x-.08*y],normal:[-.118771,.079181,.989759]})};
const tilted=T.fit(slope,[0,0]);assert.ok(tilted.valid);assert.ok(Math.abs(tilted.basis[2][0])>.1);assert.ok(tilted.clearance>=.69);
// Use the actual shared asteroid mesh at renderer resolution for the landing regression.
const asteroid=global.Driftworks.sim.createInitialWorld().asteroids[0];asteroid.radius=400;
const mesh=global.Driftworks.scene3d.asteroidMesh(asteroid),rock=T.meshSampler(mesh,400,[0,0]),fit=T.fit(rock,[0,0]);
assert.ok(fit.valid,'Default real asteroid site must fit all eight anchors');
for(const c of fit.contacts){near(distance(c.mount,c.knee),4.8);near(distance(c.knee,c.tip),Math.hypot(3.2,2.6));
 const ground=rock.at(c.worldPoint[0],c.worldPoint[1]);near(ground.point[2],c.worldPoint[2]);
 // Jaw pads end 1.56 units below the carrier in its local terrain frame.
 const projection=c.out.reduce((s,v,k)=>s+v*c.normal[k],0),raw=c.out.map((v,k)=>v-c.normal[k]*projection),forward=raw.map(v=>v/length(raw));
 const pad=c.tip.map((v,k)=>v+forward[k]*1.8-c.normal[k]*1.56);near(distance(pad,c.point),0);
 const tangent=[c.normal[1]*forward[2]-c.normal[2]*forward[1],c.normal[2]*forward[0]-c.normal[0]*forward[2],c.normal[0]*forward[1]-c.normal[1]*forward[0]];
 for(const side of [-1,1]){const toe=fit.world(pad.map((v,k)=>v+tangent[k]*side*.45)),hit=rock.at(toe[0],toe[1]);assert.ok(Math.abs(toe[2]-hit.point[2])<.12,'Both jaw pads conform to the rock within blockout tolerance');}

}
assert.ok(new Set(fit.contacts.map(c=>c.tip[2].toFixed(2))).size>3,'Rock fit creates independent asymmetric leg poses');
const limits=T.rampStops(rock,fit,t=>global.Driftworks.scene3d.miningPlatformGeometry(1,0,false,t));
assert.equal(limits.length,8);assert.ok(limits.every(t=>t>0&&t<=1));
assert.ok(new Set(limits.map(t=>t.toFixed(3))).size>3,'Each ramp finds its own ground stop');
function panelTriangles(groups){const data=groups.ochre,out=[];for(let i=0;i<160;i++){const offset=i*18,tri=[0,6,12].map(k=>data.slice(offset+k,offset+k+3));out.push({bay:Math.floor(i/20),points:tri.map(fit.world)});if(i%10<2)out.push({bay:Math.floor(i/20),points:tri.map(p=>fit.world(p.map((v,k)=>v-data[offset+3+k]*.22)))});}return out;}
for(const t of [0,.25,.5,.75,.9,1])for(const tri of panelTriangles(global.Driftworks.scene3d.miningPlatformContactGeometry(1,t,'',fit.contacts,limits)))assert.ok(!rock.collides(tri.points),'Ground-limited thick leaves stay clear throughout opening');
for(let bay=0;bay<8;bay++)if(limits[bay]<1){const beyond=panelTriangles(global.Driftworks.scene3d.miningPlatformGeometry(1,0,false,limits[bay]+.001)).filter(t=>t.bay===bay);assert.ok(beyond.some(t=>rock.collides(t.points)),'A stopped ramp is actually near first rock contact');}
assert.deepEqual(T.rampStops({collides:()=>false},fit,t=>global.Driftworks.scene3d.miningPlatformGeometry(1,0,false,t)),Array(8).fill(1),'Ramps with no obstruction keep their full travel');
console.log('PASS mining ramps: independent first-contact stops, full travel when clear, thick-leaf clearance throughout opening');

const geometry=global.Driftworks.scene3d.miningPlatformContactGeometry(1,0,'',fit.contacts);
for(const data of Object.values(geometry))assert.ok(data.every(Number.isFinite),'Solved mesh has finite positions and normals');
// Inline study wiring must remain valid JavaScript too.
const html=fs.readFileSync(require('node:path').join(__dirname,'mining-platform-orbit.html'),'utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(!match[0].includes('importmap'))new vm.Script(match[1]);
console.log('PASS mining terrain: actual-mesh raycasts, chassis clearance, eight fixed-length IK chains, gripper contact, missing/unreachable targets and study wiring');

// Context caches both successful and unsuccessful sites; camera redraws must not resample.
let builds=0,fits=0;
const stub={shipPackModels:{find:()=>({model:{vertices:[0,0,0,0,0,1]}})},sim:{createInitialWorld:()=>({asteroids:[{}]})},scene3d:{surfaceHeight:()=>0,asteroidMesh:()=>{builds++;return [];}},miningStudyTerrain:{rampStops:()=>Array(8).fill(.8),meshSampler:()=>({stats:{raycasts:0,rampQueries:0}}),fit:(sample,site)=>{fits++;sample.stats.raycasts+=3;return site[0]===8?null:{contacts:[]};}}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'mining-study-context.js'),'utf8'),{window:{Driftworks:stub}});
const context=stub.miningStudyContext;
const cached=context.landing(0);for(let i=0;i<100;i++)assert.equal(context.landing(0),cached);
assert.equal(context.landing(8),null);for(let i=0;i<100;i++)assert.equal(context.landing(8),null);
assert.equal(builds,1);assert.equal(fits,2);assert.equal(context.performance().raycasts,6);
console.log('PASS mining terrain cache: one mesh, one solve per site, including failed sites; cache reads perform no raycasts');

const rampCached=context.ramps(0);for(let i=0;i<100;i++)assert.equal(context.ramps(0),rampCached);assert.equal(context.performance().rampSolves,1);assert.equal(fits,2);assert.equal(context.performance().raycasts,6);
console.log('PASS mining ramp cache: one sweep per site, no repeated terrain queries');
