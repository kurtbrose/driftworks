'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({window:{Driftworks:{}},Float32Array,Math});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/explosions.js'),'utf8'),context);
const api=context.window.Driftworks.explosions,right=[1,0,0],up=[0,1,0];
const blast={position:[10,20,30],velocity:[3,-2,1],age:.3,size:1.75,seed:27};
const snapshot=b=>api.build(b,right,up).map(x=>({...x,vertices:Array.from(x.vertices),color:Array.from(x.color)}));
const initial=snapshot(blast);
// A fighter rupture must throw scraps, not pieces comparable to the whole hull.
// At age zero every fragment shares its origin, isolating size from travel.
const hull=snapshot({...blast,age:0}).find(b=>b.finish===0).vertices;
for(let axis=0;axis<3;axis++){
  const values=hull.filter((_,i)=>i%6===axis);
  assert(Math.max(...values)-Math.min(...values)<blast.size*.6,'Scraps stay small relative to the fighter blast');
}
assert.deepEqual(initial,snapshot(blast),'Paused/scrubbed snapshots are repeatable');
assert(initial.some(b=>b.finish===10)&&initial.some(b=>b.finish===11));
assert(!snapshot({...blast,age:.4}).some(b=>b.finish===11),'Shockwave expires early');
assert(!snapshot({...blast,age:1.3}).some(b=>b.finish===10),'Fireball expires before wreckage');
assert.equal(snapshot({...blast,age:5.5}).length,0,'All visual layers expire');
assert.equal(snapshot({...blast,age:-1}).length,0);
for(const age of [0,.03,.2,.8,1.8,5.4])for(const b of snapshot({...blast,age})){
  assert.equal(b.vertices.length%18,0);assert(b.vertices.every(Number.isFinite));
}
const stationary=snapshot({...blast,velocity:[0,0,0]});
initial.forEach((b,j)=>b.vertices.forEach((v,i)=>{
  const component=i%6;if(component<3)assert(Math.abs(v-stationary[j].vertices[i]-blast.velocity[component]*blast.age)<.00001,'All layers inherit ship drift');
}));
const translated=snapshot({...blast,position:[110,220,330]});
initial.forEach((b,j)=>b.vertices.forEach((v,i)=>{const c=i%6;if(c<3)assert(Math.abs(translated[j].vertices[i]-v-[100,200,300][c])<.0001);}));
console.log('PASS explosions: deterministic pause/scrub, finite geometry, inherited drift, world anchoring and layer expiry');

// Exercise the real presentation adapter across an actual hyperbolic rebase.
// The renderer is stubbed; the native blast builder still supplies every lobe.
const flight=require('../tools/headless.cjs').createFlight({mission:'hyperbolic',seed:29});
const D=flight.DW,U=D.sim.METERS_PER_UNIT,view=flight.snapshot(),noop=()=>{};
view.world.asteroids=[];view.world.ships=[];view.combat.enemies=[];view.combat.wrecks=[];
const flash={position:[30/U,60/U,-100/U],velocity:[0,0,0],age:.24,scale:14,destruction:true};
view.combat.flashes=[flash];
let submitted;
const scene=new Proxy({setStudyExplosions(blasts){submitted=blasts;}},{get:(o,k)=>k in o?o[k]:noop});
D.scene3d={create:()=>scene,miningPlatformGeometry:D.miningRig.geometry,surfaceFrame:D.asteroidTerrain.surfaceFrame};D.flightSkybox={create:()=>({render:noop,setOccluders:noop})};
D.shipPackModels.loadTextures=()=>Promise.resolve(new Map());D.shipPackModels.populate=noop;
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,insertBefore:noop});return nodes.get(id);};
D.experimentDom=()=>get;
const document={body:{classList:{contains:()=>false}},getElementById:get,createElement:()=>({})};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiments/flight-presentation.js'),'utf8'),{window:{Driftworks:D},document,location:{search:'?mission=hyperbolic'},URLSearchParams});
const presentation=D.flightPresentation.mount({},()=>view.world,noop,{document});
function present(p=presentation){p.render(view,p.appearance(),{mode:'normal',scale:1,flat:false,mothership:false,actors:true},0);return submitted[0];}
const beforeBlast=present(),beforeGeometry=snapshot(beforeBlast),beforePosition=flash.position.slice(),source=JSON.stringify(flash);
assert.equal(beforeBlast.seed,Math.round(flash.position[0]*31+flash.position[1]*17));
assert.equal(JSON.stringify(flash),source,'Presentation does not add render state to simulation flashes');
for(let step=0;step<4;step++){
  view.state.eye=D.flightHyperbolic.offset(view.state.eye,[70/U,15/U,-40/U],650);
  D.flightHyperbolic.rebase(view.combat,()=>undefined);
  assert.notDeepEqual(flash.position,beforePosition,'Real recentering changes the retained flash coordinates');
  const afterBlast=present(),afterGeometry=snapshot(afterBlast);
  assert.equal(afterBlast.seed,beforeBlast.seed,'A retained explosion keeps its pattern across chart changes');
  beforeGeometry.forEach((batch,j)=>{
    assert.deepEqual(afterGeometry[j].color,batch.color,'Fire texture offsets stay stable');
    batch.vertices.forEach((value,i)=>{
      const axis=i%6,shift=axis<3?flash.position[axis]-beforePosition[axis]:0;
      assert(Math.abs(afterGeometry[j].vertices[i]-value-shift)<.0001,'Fixed-age blast geometry translates without reshuffling');
    });
  });
}
const secondView=D.flightPresentation.mount({},()=>view.world,noop,{document});
assert.equal(present(secondView).seed,beforeBlast.seed,'Independent camera views share the event pattern');
view.combat.flashes=[{...flash,position:[7/U,11/U,-90/U]}];
assert.notEqual(present().seed,beforeBlast.seed,'New explosion events receive their own patterns');
console.log('PASS flight explosions: stable shape and texture across real chart rebases and independent camera views');
