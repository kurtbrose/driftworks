'use strict';

// Development-time source of script order. Browsers load checked-in script tags,
// and workers retain a generated local list; neither loads this CommonJS module.
const groups = {
  simulation: [
    'src/propulsion.js', 'src/combat.js', 'src/mining-lights.js',
    'src/mining-terrain.js', 'src/mining-landing.js', 'src/logistics.js',
    'src/formations.js', 'src/sim.js'
  ],
  session: ['src/population.js', 'src/session.js', 'src/tactical/camera.js'],
  audio: ['src/engine-audio.js', 'src/audio-mixer.js', 'src/audio.js', 'src/hud.js'],
  meshes: ['src/mesh-builder.js', 'src/mining-rig.js'],
  missions: ['experiments/flight-missions.js', 'experiments/mission-ohio.js'],
  fleet: [
    'assets/ships/quaternius-ultimate-spaceships/meshes.js',
    'assets/ships/concept-trio/meshes.js', 'assets/ships/ohio-vehicles/meshes.js',
    'experiments/ship-packs.js'
  ],
  dialogue: ['experiments/mumble.js', 'experiments/flight-dialogue.js'],
  flightAi: ['experiments/flight-ai.js', 'experiments/flight-duel.js'],
  flightView: [
    'experiments/flight-presentation.js', 'experiments/flight-diagnostics.js',
    'experiments/flight-controls.js', 'experiments/flight-session.js'
  ]
};

const profiles = {
  tactical: {entries: [
    'src/asset-versions.js', 'vendor/pixi/pixi.min.js', '@simulation', '@session', '@audio',
    '@meshes', 'vendor/three/build/three.global.js', 'src/explosions.js',
    'src/asteroid-art.js', 'src/scene3d.js', 'src/game.js'
  ]},
  headless: {entries: [
    'src/asset-versions.js', '@simulation', 'src/asteroid-art.js', '@session', '@meshes',
    'src/explosions.js', 'src/scene3d.js', 'src/ship-models.js',
    'experiments/retail-profiles.js', '@missions', 'experiments/retail-weapons.js',
    'experiments/ellis-optics.js', 'experiments/guns.js', 'experiments/training.js',
    'experiments/flight-model.js', '@fleet', '@dialogue', 'experiments/evacuation-mission.js',
    'experiments/flight-comms.js', 'experiments/flight-session.js', '@flightAi', 'experiments/flight-study.js'
  ]},
  sharedTests: {entries: [
    'src/asset-versions.js', '@simulation', 'src/asteroid-art.js', '@session', '@audio',
    '@meshes', 'src/explosions.js', 'src/scene3d.js', 'src/ship-models.js', 'src/game.js',
    'tests/scenario.js', 'tests/population-tests.js', 'experiments/dom.js',
    'experiments/retail-profiles.js', '@missions', 'experiments/skybox.js',
    'experiments/retail-weapons.js', 'experiments/guns.js', 'experiments/training.js',
    'experiments/performance.js', 'experiments/input.js', 'experiments/flight-model.js',
    'experiments/radar.js', '@fleet', 'experiments/target-camera.js', '@dialogue',
    'experiments/evacuation-mission.js', 'experiments/flight-comms.js', 'experiments/flight-radio.js',
    '@flightView', 'experiments/flight-hud.js', '@flightAi', 'experiments/flight-watch.js',
    'experiments/flight-study.js', 'tests/shared-harness.js', 'tests/shared/fixtures.js',
    'tests/shared/simulation.js', 'tests/shared/flight.js', 'tests/shared/rendering.js', 'tests/shared/assets.js', 'tests/shared/artwork.js', 'tests/shared/audio.js', 'tests/shared/tooling.js',
    'tests/tests.js'
  ]},
  browserTests: {entries: ['@sharedTests'], before: [
    {src: 'src/explosions.js', entries: ['src/model-viewer.js', 'vendor/three/build/three.global.js']}
  ]},
  threeTests: {entries: [
    'vendor/three/build/three.global.js', '@simulation', 'src/asteroid-art.js',
    '@session', '@audio', '@meshes', 'src/explosions.js', 'src/scene3d.js', 'src/game.js'
  ], omit: ['src/mining-landing.js']},
  asteroidTests: {entries: ['@threeTests'], omit: ['vendor/three/build/three.global.js', 'src/explosions.js']},
  scenarios: {entries: ['@simulation', 'src/population.js', 'src/session.js', 'tests/scenario.js']},
  studyWorker: {entries: [
    '@simulation', 'experiments/retail-profiles.js', 'experiments/retail-weapons.js',
    'experiments/guns.js', '@missions', 'experiments/training.js', 'experiments/flight-model.js',
    '@fleet', '@flightAi', 'experiments/flight-study.js'
  ], omit: ['src/mining-lights.js', 'src/mining-terrain.js', 'src/mining-landing.js', 'assets/ships/ohio-vehicles/meshes.js']},
  flight: {entries: [
    'src/asset-versions.js', 'vendor/pixi/pixi.min.js', '@simulation', '@session', '@audio',
    'experiments/gpu-diagnostics.js', '@meshes', 'src/model-viewer.js',
    'vendor/three/build/three.global.js', 'src/explosions.js', 'src/asteroid-art.js',
    'src/scene3d.js', 'src/game.js', 'experiments/dom.js', 'experiments/retail-profiles.js',
    'experiments/flight-model.js', 'experiments/radar.js', '@missions', 'src/sky-effects.js',
    'experiments/ellis-feedback.js', 'experiments/ellis-optics.js', 'experiments/ellis-renderer.js',
    'experiments/skybox.js', 'experiments/retail-weapons.js', 'experiments/guns.js',
    'experiments/input.js', 'experiments/training.js', 'experiments/performance.js',
    '@fleet', '@dialogue', 'experiments/evacuation-mission.js',
    {src: 'experiments/evacuation-scenery.js', type: 'module'},
    'experiments/flight-comms.js', 'experiments/comms-display.js', 'experiments/face-blend.js',
    'experiments/flight-portraits.js', 'experiments/flight-radio.js', 'experiments/target-camera.js',
    'experiments/flight-scenery.js', '@flightView', 'experiments/gpu-ui.js', 'experiments/flight-hud.js',
    {imports: {three: 'vendor/three/build/three.module.js'}},
    {src: 'assets/characters/quaternius-astronaut/poses.js', type: 'module'},
    '@flightAi', 'experiments/flight-watch.js', {src: 'experiments/gas-giant-flight.js', type: 'module'},
    'experiments/aegis-flight.js', 'experiments/flight.js'
  ]}
};

// Required load-time boundaries. Optional renderer resources stay profile-owned.
const dependencies = {
  'src/sim.js': ['src/propulsion.js', 'src/combat.js', 'src/logistics.js', 'src/formations.js'],
  'src/asteroid-art.js': ['src/sim.js'],
  'src/audio.js': ['src/engine-audio.js', 'src/audio-mixer.js'],
  'src/scene3d.js': ['src/sim.js', 'src/asteroid-art.js', 'src/mesh-builder.js', 'src/mining-rig.js'],
  'src/game.js': ['src/sim.js', 'src/tactical/camera.js', 'src/asteroid-art.js'],
  'experiments/ship-packs.js': ['assets/ships/quaternius-ultimate-spaceships/meshes.js', 'assets/ships/concept-trio/meshes.js'],
  'experiments/flight-session.js': ['src/sim.js', 'experiments/flight-model.js', 'experiments/training.js', 'experiments/flight-comms.js'],
  'experiments/flight-duel.js': ['experiments/flight-ai.js'],
  'experiments/flight-study.js': ['experiments/flight-duel.js']
};

function resolve(name, definitions = {groups, profiles, dependencies}) {
  function expand(name, stack = []) {
    if (stack.includes(name)) throw new Error('Script manifest cycle: ' + [...stack, name].join(' -> '));
    const profile = definitions.profiles[name];
    const entries = profile ? profile.entries : definitions.groups[name];
    if (!entries) throw new Error('Unknown script profile/group: ' + name);
    const expandEntries = entries => entries.flatMap(entry =>
      typeof entry === 'string' && entry.startsWith('@') ? expand(entry.slice(1), [...stack, name]) :
        [typeof entry === 'string' ? {src: entry} : entry]);
    let scripts = expandEntries(entries);
    for (const src of profile?.omit || []) {
      if (!scripts.some(script => script.src === src)) throw new Error(name + ': cannot omit absent script ' + src);
      scripts = scripts.filter(script => script.src !== src);
    }
    for (const insertion of profile?.before || []) {
      const index = scripts.findIndex(script => script.src === insertion.src);
      if (index < 0) throw new Error(name + ': missing insertion point ' + insertion.src);
      scripts.splice(index, 0, ...expandEntries(insertion.entries));
    }
    return scripts;
  }
  if (!definitions.profiles[name]) throw new Error('Unknown script profile: ' + name);
  const scripts = expand(name);
  const positions = new Map();
  for (const [index, script] of scripts.entries()) {
    const paths = script.imports ? Object.values(script.imports) : [script.src];
    for (const file of paths) {
      if (typeof file !== 'string' || !/^(src|experiments|assets|tests|vendor)\/[\w/.-]+\.js$/.test(file) || file.split('/').includes('..')) {
        throw new Error(name + ': expected repository-relative JavaScript path: ' + file);
      }
    }
    if (script.imports) continue;
    if (positions.has(script.src)) throw new Error(name + ': duplicate script ' + script.src);
    if (script.type && script.type !== 'module') throw new Error(name + ': unsupported script type ' + script.type);
    positions.set(script.src, index);
  }
  for (const [consumer, prerequisites] of Object.entries(definitions.dependencies)) {
    if (!positions.has(consumer)) continue;
    for (const dependency of prerequisites) {
      if (!positions.has(dependency) || positions.get(dependency) >= positions.get(consumer)) {
        throw new Error(name + ': load ' + dependency + ' before ' + consumer);
      }
    }
  }
  return scripts;
}

function files(name) {
  return resolve(name).map(script => {
    if (!script.src || script.type) throw new Error(name + ': Node/classic-worker loader cannot execute module scripts or import maps');
    return script.src;
  });
}

module.exports = {groups, profiles, dependencies, resolve, files};
