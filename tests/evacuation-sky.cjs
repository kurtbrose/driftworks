'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('experiments/refueling-depot.html','utf8'),context={window:{Driftworks:{}}};
vm.runInNewContext(fs.readFileSync('experiments/flight-missions.js','utf8'),context);
const mission=context.window.Driftworks.flightMissions.resolve('evacuation');
assert.equal(mission.sky.cubeStages,'planet-hero-orbital-v2/animation-cube-v1/');assert.equal(mission.sky.cubeFaces.length,6);assert.equal(mission.sky.bakedImpact,true);
assert.ok(html.includes("location.pathname+'?mission=evacuation'"));assert.ok(!html.includes('planet-impact.js'));assert.ok(!html.includes('DW.planetImpact'));assert.ok(!html.includes('setPlanetImage'));
const calls=[],stage={value:'before'},sky={resetImpact:()=>calls.push(['reset']),cueImpact:(...args)=>calls.push(args)};
vm.runInNewContext(html.slice(html.indexOf('const sky=DW.flightSkybox.create'),html.indexOf('const right=new THREE.Vector3')),{DW:{flightSkybox:{create:(host,config)=>{assert.equal(config.fov,45);assert.equal(config.cueControls,false);return sky;}}},el:id=>id==='stage'?stage:{}});
for(const id of ['contact','ejecta','plume','cooling','fallout','aftermath','fires','smoke']){assert.ok(html.includes('value="'+id+'"'));stage.value=id;stage.onchange();assert.deepEqual(calls.at(-1),[id,8]);}
stage.value='before';stage.onchange();assert.deepEqual(calls.at(-1),['reset']);
console.log('PASS evacuation sky: approved six-face animation, retired compositor removed, all nine stage controls and 45-degree presentation');
