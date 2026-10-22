'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
let allocations=0,draws=0;const stops=[];
const context={clearRect(){},fillRect(){draws++;},createRadialGradient(){return {addColorStop(at,color){stops.push({at,color});}};}};
const scope={window:{Driftworks:{}},document:{createElement(){allocations++;return {style:{},setAttribute(){},getContext(){return context;},remove(){}};}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/sky-effects.js'),'utf8'),scope);
const api=scope.window.Driftworks.skyEffects,source={direction:[0,1,0],radius:.01,strength:1,color:[1,.9,.8]};
assert.equal(api.visibility(source,[0,0,0],[{center:[0,5,0],radius:1}]).fraction,0);
assert.equal(api.visibility(source,[0,0,0],[{center:[0,-5,0],radius:1}]).fraction,1,'objects behind camera do not occlude');
const partial=api.visibility({...source,radius:.1},[0,0,0],[{center:[.4,5,0],radius:.4}]);
assert.ok(partial.fraction>0&&partial.fraction<1,'partial source visibility');
const host={clientWidth:800,clientHeight:600,appendChild(){}},effect=api.create(host),pose={eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
effect.render(pose,2,1,false);assert.equal(allocations,0,'unconfigured skies allocate no overlay');
effect.setSources([source]);effect.render(pose,2,2,false);assert.ok(draws>0);
effect.setOccluders([{center:[0,5,0],radius:1}]);draws=0;effect.render(pose,2,3,false);assert.equal(draws,0,'full occlusion suppresses glare');
effect.setOccluders([]);effect.setSources([{...source,radius:.5}]);draws=0;effect.render(pose,2,4,false);assert.equal(draws,0,'extended emitters do not create false central bloom');
effect.setEnabled(false);assert.equal(effect.render(pose,2,5,false),1,'disabled effect restores neutral exposure');
assert.throws(()=>effect.setSources([{...source,radius:NaN}]));
assert.equal(api.adapt(1,.4,0),1);assert.ok(api.adapt(1,.4,.1)>.4);
effect.dispose();
console.log('PASS shared sky effects: opt-in allocation, partial/full occlusion, source limits, neutral reset and bounded exposure');

const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/backgrounds/sky-camera-sources-v1.json'),'utf8'));
assert.ok(catalog.styles['4'].length&&catalog.styles['9'].length,'both authored selectable suns configured');
assert.equal(catalog.styles['8'],undefined,'nebula gets no invented sun');
for(const pitch of [30,35]){
 const features=[{asset:'planet.png',yaw:90,pitch:0,widthDeg:110,gain:1},{asset:'features/warm-sun-v1.png',yaw:225,pitch,widthDeg:7,gain:1}];
 const sources=api.fromFeatures(features,catalog.assets);
 assert.equal(sources.length,1,'planet/Ohio/impact sun derives from asset metadata');
 assert.ok(Math.abs(sources[0].direction[2]-Math.sin(pitch*Math.PI/180))<1e-9);
 assert.ok(sources[0].direction[0]<0&&sources[0].direction[1]<0,'same authored yaw as rendered sun');
 assert.equal(api.fromFeatures([{...features[1],gain:0}],catalog.assets).length,0,'hidden source emits no glare');
 assert.equal(api.fromFeatures([{...features[1],widthDeg:14}],catalog.assets)[0].radius,sources[0].radius*2,'card scale changes disk radius');
}
console.log('PASS source coverage: distant/hero suns, placement-derived landmark suns, hidden sources and angular scaling');

const missions={window:{Driftworks:{}}};vm.createContext(missions);
for(const file of ['flight-missions.js','mission-ohio.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../experiments',file),'utf8'),missions);
for(const id of ['ohio','planet-hero','planet-hero-80','planet-hero-140','planet-impact-baked','planet-impact-watch']){
 const mission=missions.window.Driftworks.flightMissions.resolve(id);
 const sources=api.fromFeatures(mission.sky.features,catalog.assets);
 assert.equal(sources.length,1,id+' enables exactly its authored sun');
 const feature=mission.sky.features.find(f=>catalog.assets[f.asset]);
 const yaw=Math.atan2(sources[0].direction[1],sources[0].direction[0])*180/Math.PI;
 assert.ok(Math.abs(((yaw-feature.yaw)%360+540)%360-180)<1e-6,id+' preserves source direction');
}
assert.equal(api.fromFeatures(missions.window.Driftworks.flightMissions.resolve().sky.features,catalog.assets).length,0,'default selectable skies do not invent a mission sun');
console.log('PASS mission sun effects: Ohio, planet variants and inherited baked-impact/watch placements');

const adapting=api.create(host);adapting.setSources([{...source,strength:.45}]);
let exposure=1;
for(let frame=0;frame<120;frame++)exposure=adapting.render(pose,2,10+frame/60,false);
assert.ok(exposure<.61&&exposure>.59,'authored sun visibly reduces exposure to about 60 percent');
const away={...pose,back:[0,1,0]};
for(let frame=0;frame<360;frame++)exposure=adapting.render(away,2,12+frame/60,false);
assert.ok(exposure>.98,'looking away restores exposure');
adapting.dispose();
console.log('PASS authored sun adaptation: visible exposure response and recovery');

assert.ok(stops.some(s=>s.at===0&&Number(s.color.split(',').pop().replace(')',''))>.65),'authored sun produces a bright bloom core, rather than an imperceptible veil');
assert.ok(stops.some(s=>s.at>.2&&s.at<.3&&Number(s.color.split(',').pop().replace(')',''))>.15),'broad glare spills beyond the tight core');
