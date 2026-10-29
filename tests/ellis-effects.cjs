'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const f=require('../tools/headless.cjs').createFlight({mission:'ellis'}),D=f.DW,U=D.sim.METERS_PER_UNIT,s=f.snapshot();
s.world.asteroids=[];s.world.ships=[];s.combat.enemies=[];s.combat.wrecks=[];s.combat.flashes=[];
const noop=()=>{},scene=new Proxy({setStudyEffects(b){this.effects=b;}},{get:(o,k)=>k in o?o[k]:noop});
D.scene3d={create:()=>scene,miningPlatformGeometry:D.miningRig.geometry,surfaceFrame:D.asteroidTerrain.surfaceFrame};const sky={render:noop,setOccluders:noop};D.flightSkybox={create:()=>sky};
D.shipPackModels.loadTextures=()=>Promise.resolve(new Map());D.shipPackModels.populate=noop;
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,insertBefore:noop});return nodes.get(id);};
D.experimentDom=()=>get;
let chase=false;
const document={body:{classList:{contains:()=>chase}},getElementById:get,createElement:()=>({})},location={search:'?mission=ellis'};
vm.runInNewContext(fs.readFileSync('experiments/flight-presentation.js','utf8'),{window:{Driftworks:D},document,location,URLSearchParams});
const p=D.flightPresentation.mount({},()=>s.world,noop,{document}),art=p.appearance();
s.guns.bolts=Array.from({length:160},(_,i)=>({position:[(i%2)*12000/U,(-2400-i)/U,1550/U],direction:[0,1,0],region:i%2,age:0,weapon:f.config.weapon,team:['ally','enemy','player'][i%3]}));
s.guns.impacts=Array.from({length:12},(_,i)=>({position:[(i%2)*12000/U,-2400/U,(1550+i)/U],region:i%2,age:.01}));
p.render(s,art,{mode:'normal',scale:1,flat:false,mothership:false,actors:true},0);
const batched=scene.effects.filter(b=>b.vertices.length);assert(batched.length<=4,'Both charts share at most four projected effect batches');
assert(batched.every(b=>b.projected&&b.region===(s.state.region||0)),'Optical effects are already in observer space, never warped or clipped again');
assert(batched.every(b=>Array.from(b.vertices).every(Number.isFinite)));
location.search='?mission=ellis&bridgeGeometry=objects';p.render(s,art,{mode:'normal',scale:1,flat:false,mothership:false,actors:true},0);
const individual=scene.effects.filter(b=>b.vertices.length);assert.equal(individual.length,172,'object-warp experiment retains individual optical centers');assert(individual.every(b=>b.lensCenter));
console.log('PASS Ellis effect batching: 160 bolts + 12 impacts in four projected draws; object-warp paths preserved');

let motionOpacity;sky.render=(...args)=>{motionOpacity=args[4];};
get('flight-lanes').checked=true;get('flight-guide-style').value='grid';get('flight-lanes-opacity').value='65';
function present(){p.render(s,art,{mode:'normal',scale:1,flat:false,mothership:false,actors:true},0);return motionOpacity;}
assert.equal(present(),.65,'Live sky receives motion-dot brightness');
get('flight-lanes').checked=false;assert.equal(present(),0,'Toggle removes optical dots');get('flight-lanes').checked=true;
get('flight-guide-style').value='roads';assert.equal(present(),0,'Other guide styles do not leave optical dots');get('flight-guide-style').value='grid';
s.combat.dead=true;assert.equal(present(),0,'Death removes optical dots');s.combat.dead=false;
chase=true;assert.equal(present(),0,'Chase camera removes optical dots');chase=false;
assert.equal(present(),.65,'Cockpit restoration restores optical dots');
console.log('PASS optical motion-dot controls: brightness, toggle, style, death and chase');

const order=[];scene.render=()=>order.push('scene');sky.render=()=>order.push('sky');
// The benchmark hook belongs to the scene submission, after the sky pass.
p.render(s,art,{mode:'normal',scale:1,flat:false,mothership:false,actors:true},0,()=>{order.push('begin');return ()=>order.push('end');});
assert.deepEqual(order,['sky','begin','scene','end']);
scene.render=()=>{throw new Error('test scene failure');};
assert.throws(()=>p.render(s,art,{mode:'normal',scale:1,flat:false,mothership:false,actors:true},0,()=>{order.push('begin');return ()=>order.push('end');}),/test scene failure/);
assert.equal(order.at(-1),'end','GPU query ends even when rendering throws');
console.log('PASS scene GPU hook: begins at scene submission and closes on render failure');
