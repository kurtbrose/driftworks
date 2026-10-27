'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {loadRuntime}=require('../tools/headless.cjs');
const DW=loadRuntime();
vm.runInNewContext(fs.readFileSync('experiments/skybox.js','utf8'),{window:{Driftworks:DW},Math});
vm.runInNewContext(fs.readFileSync('experiments/flight-shields.js','utf8'),{window:{Driftworks:DW},Float32Array,Map,Set,Math});
DW.flightPresentation={model:(craft,wave,art)=>DW.shipPackModels.craftModel(craft,craft.team==='ally'?art.allyArt:art.enemyArt,wave)};
const art={allyArt:'quaternius-ultimate-spaceships:Spitfire',enemyArt:'quaternius-ultimate-spaceships:Spitfire'};
const duel=DW.flightDuel.create({...art,allyHull:art.allyArt,enemyHull:art.enemyArt,seed:29,start:'crossing',category:'human',flavor:'expert',skill:2,duration:120});
const tracker=DW.flightShields.tracker();let seen=0,max=0;
function view(){const p=duel.player,U=DW.sim.METERS_PER_UNIT;return {state:p,combat:duel.combat,observerCraft:duel.combat.player,camera:{eye:p.eye.map((v,i)=>v+(p.back[i]*75+p.up[i]*18)/U),right:p.right,up:p.up,back:p.back}};}
for(let i=0;i<1200;i++){
    duel.advance(1/120);const v=view(),before=JSON.stringify(duel.combat),discs=tracker.collect(v,art,16/9);
    assert.equal(JSON.stringify(duel.combat),before,'presentation never mutates combat');
    for(const d of discs){assert.ok([...d.box,...d.waves].every(Number.isFinite));assert.ok(d.waves.length<=16);seen+=d.waves.length?1:0;max=Math.max(max,d.waves.length/4);}
}
assert.ok(seen>0,'real shield damage produces visible wave history');
assert.ok(max<=4);
const frozen=view();const one=JSON.stringify(tracker.collect(frozen,art,16/9));assert.equal(JSON.stringify(tracker.collect(frozen,art,16/9)),one,'frozen benchmark preserves wave phase');
for(let i=0;i<20;i++){duel.combat.time+=.01;duel.combat.player.shield=Math.max(1,(duel.combat.player.shield||100)-1);tracker.collect(view(),art,16/9);}
assert.ok(tracker.collect(view(),art,16/9).some(d=>d.waves.length===16),'sustained hits retain exactly four waves');
duel.combat.player.shield=0;duel.enemy.shield=0;assert.equal(tracker.collect(view(),art,16/9).length,0,'depleted shields disappear');

// Native pass submits the real scene exactly once; all bubbles share its target.
let targets=0,disposed=0,bound=null;const calls=[];
class Target{constructor(){this.texture={};targets++;}dispose(){disposed++;}}
class Geometry{setAttribute(name){assert.equal(name,'position','Three draw count requires the standard position attribute');}dispose(){}}
class Scene{constructor(){this.items=[];}add(o){this.items.push(o);}}
class Material{constructor(options){Object.assign(this,options);}dispose(){}}
class Texture{dispose(){}}
class Mesh{constructor(g,m){this.material=m;}}
const THREE={WebGLRenderTarget:Target,Texture,BufferGeometry:Geometry,BufferAttribute:class{},RawShaderMaterial:Material,Scene,Camera:class{},Mesh,DoubleSide:2,NoBlending:0,LinearFilter:1,LinearSRGBColorSpace:'linear'};
const renderer={setRenderTarget:t=>{bound=t;},setViewport(){},setClearColor(){},clear(){},render(s){calls.push({scene:s,target:bound});}};
const pass=DW.flightShields.create(THREE,renderer,{}),scene=new Scene(),discs=[{box:[0,0,.2,.3],waves:[0,0,1,.2],depth:1},{box:[.5,0,.1,.2],waves:[],depth:2}];
assert.equal(pass.render(scene,{},discs,800,600),3);
assert.equal(calls.filter(c=>c.scene===scene).length,1,'no second hull submission');
assert.ok(calls[0].target);assert.equal(calls[0].target.texture.colorSpace,'linear');assert.equal(calls[0].target.texture.internalFormat,'RGBA8');assert.ok(calls.slice(1).every(c=>c.target===null),'no capture feedback');
const allocated=targets;pass.render(scene,{},discs,800,600);assert.equal(targets,allocated,'target reused at fixed resolution');
pass.render(scene,{},discs,1600,1200);assert.equal(targets,allocated+1,'resize replaces target');assert.equal(bound,null);pass.dispose();assert.equal(disposed,targets);
console.log('Flight shields: real duel hits, bounded immutable history, frozen phase, one scene capture, target reuse and resize pass.');
