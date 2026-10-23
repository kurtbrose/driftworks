require('./character-cast.cjs');
require('./crew-deck.cjs');
require('./civilian-portraits.cjs');
require('./campaign-intro.cjs');
require('./flight-aim-tracking.cjs');
require('./flight-evasion.cjs');
require('./asset-versions.cjs');
require('./skybox-factory.cjs');
require('./sky-effects.cjs');
require('./sky-environment.cjs');
require('./star-glare.cjs');
require('./impact-lab.cjs');
require('./impact-sky.cjs');
require('./planet-hero.cjs');
require('./sky-cube.cjs');
require('./gas-giant-weather.cjs');
require('./gas-giant-flight.cjs');
require('./orbital-impact-cube.cjs');
require('./evacuation-sky.cjs');
require('./planet-impact.cjs');
require('./planet-impact-baked.cjs');
require('./explosions.cjs');
require('./refueling-depot.cjs');
require('./civilian-airliners.cjs');
require('./gpu-ui.cjs');
require('./flight-hud-markers.cjs');
require('./flight-missions.cjs');
require('./evacuation-mission.cjs');
require('./evacuation-materials.cjs');
require('./civilian-flight.cjs');
require('./headless.cjs');
require('./pilot-training.cjs');
require('./flight-hit-reactions.cjs');
// Run the ordinary-script suite without adding a build or dependency pipeline.
require('./audio-modules.cjs');
require('./ohio-music.cjs');
require('./flight-skybox.cjs');
require('./ohio-sign.cjs');
require('./ohio-roadside.cjs');
require('./ohio-flying-roster.cjs');
require('./flight-furball-target-lock.cjs');
require('./flight-furball-telemetry.cjs');
require('./retail-gun-mounts.cjs');
const fs = require('fs');
const vm = require('vm');
global.window = global;
global.DRIFTWORKS_TEST_MODE = true;
// Browser-resource mounts register lifecycle cleanup; headless tests drive it directly.
global.addEventListener = () => {};
let failures = 0;
const summary = {};
global.document = {
  querySelector: selector => selector === '#summary' ? summary : {
    appendChild: item => { if (item.className === 'fail') { failures++; console.log(item.textContent); } }
  },
  createElement: () => ({ appendChild: () => {} })
};
for (const file of ['src/asset-versions.js', 'src/propulsion.js', 'src/combat.js', 'src/mining-lights.js', 'src/mining-terrain.js', 'src/mining-landing.js', 'src/logistics.js', 'src/formations.js', 'src/sim.js', 'src/population.js', 'src/session.js', 'src/tactical/camera.js', 'src/engine-audio.js', 'src/audio-mixer.js', 'src/audio.js', 'src/hud.js', 'src/mesh-builder.js', 'src/mining-rig.js', 'src/explosions.js', 'src/scene3d.js', 'src/ship-models.js', 'src/game.js', 'tests/scenario.js', 'tests/population-tests.js', 'experiments/dom.js', 'experiments/retail-profiles.js', 'experiments/flight-missions.js','experiments/mission-ohio.js','experiments/skybox.js', 'experiments/retail-weapons.js', 'experiments/guns.js', 'experiments/training.js', 'experiments/performance.js', 'experiments/input.js', 'experiments/flight-model.js', 'experiments/radar.js', 'assets/ships/quaternius-ultimate-spaceships/meshes.js','assets/ships/concept-trio/meshes.js', 'assets/ships/ohio-vehicles/meshes.js', 'experiments/ship-packs.js', 'experiments/target-camera.js', 'experiments/mumble.js', 'experiments/flight-dialogue.js', 'experiments/evacuation-mission.js', 'experiments/flight-comms.js', 'experiments/flight-radio.js', 'experiments/flight-presentation.js', 'experiments/flight-diagnostics.js', 'experiments/flight-controls.js', 'experiments/flight-session.js', 'experiments/flight-hud.js', 'experiments/flight-ai.js', 'experiments/flight-duel.js', 'experiments/flight-watch.js', 'experiments/flight-study.js', 'tests/tests.js']) {
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}
console.log(summary.textContent);
require('./flight-transitions.cjs')(global.Driftworks);
const path = require('node:path');
const scenarioDir = path.join(__dirname, 'scenarios');
failures += require('./scenarios.cjs').runFiles(fs.readdirSync(scenarioDir).filter(file => file.endsWith('.json')).sort().map(file => path.join(scenarioDir, file)));
process.exitCode = failures ? 1 : 0;


require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'ship-viewer.cjs')], {stdio: 'inherit'});
require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'character-assets.cjs')], {stdio: 'inherit'});
require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'character-paints.cjs')], {stdio: 'inherit'});
require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'character-bodies.cjs')], {stdio: 'inherit'});

require('./mining-study-navigation.cjs');

require('./mining-ramp-clearance.cjs');

require('./mining-leg-clearance.cjs');

require('./mining-roof-clearance.cjs');

require('./mining-study-terrain.cjs');

require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'asteroid-three.cjs')], {stdio: 'inherit'});

require('./mining-study-landing.cjs');

require('./mining-gameplay-contacts.cjs');

require('./mining-lights.cjs');

require('./mining-geometry.cjs');

require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'flight-study-worker.cjs')], {stdio: 'inherit'});

require('./fleet-greybox.cjs');

require('./model-viewer.cjs');

require('./fighter-greybox.cjs');

require('./study-viewer.cjs');

require('./study-zoom.cjs');

require('./livery-lab.cjs');

require('./livery-art.cjs');
require('./livery-materials.cjs');
require('./livery-sections.cjs');

require('./hull-panels.cjs');

require('./speech-sprites.cjs');
require('./flight-portraits.cjs');
require('./portrait-assets.cjs');
require('./ohio-portraits.cjs');

require('./comms-signal.cjs');
require('./comms-lab.cjs');
require('./comms-display.cjs');
require('./concept-ships.cjs');
require('./concept-flight.cjs');

require('./dreadnaught-kit.cjs');

require('./aegis-flight.cjs');

require('./hull-sweep-index.cjs');
require('./baked-hull-indices.cjs');
require('./projectile-broadphase.cjs');
require('./collision-events.cjs');

require('./study-culling.cjs');

require('./three-production.cjs');

require('./asteroid-detail-lab.cjs');

require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'liner-batching.cjs')], {stdio: 'inherit'});

require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'refueling-cycle.cjs')], {stdio: 'inherit'});
