'use strict';

// Development-only loader: execute ordinary production scripts without browser boot.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const files = [
  'src/asset-versions.js', 'src/propulsion.js', 'src/combat.js',
  'src/mining-lights.js', 'src/mining-terrain.js', 'src/mining-landing.js',
  'src/logistics.js', 'src/formations.js', 'src/sim.js',
  'src/population.js', 'src/session.js', 'src/tactical/camera.js',
  'src/mesh-builder.js', 'src/mining-rig.js', 'src/explosions.js',
  'src/scene3d.js', 'src/ship-models.js', 'src/game.js',
  'experiments/retail-profiles.js', 'experiments/flight-missions.js',
  'experiments/mission-ohio.js', 'experiments/retail-weapons.js',
  'experiments/guns.js', 'experiments/training.js', 'experiments/flight-model.js',
  'assets/ships/quaternius-ultimate-spaceships/meshes.js','assets/ships/concept-trio/meshes.js',
  'assets/ships/ohio-vehicles/meshes.js', 'experiments/ship-packs.js',
  'experiments/mumble.js', 'experiments/flight-dialogue.js',
  'experiments/flight-comms.js', 'experiments/flight-session.js',
  'experiments/flight-ai.js', 'experiments/flight-duel.js', 'experiments/flight-study.js'
];

function loadRuntime() {
  const context = vm.createContext({console});
  // No document, RAF, Pixi, Three, Web Audio, fetch, or browser-resource mocks.
  context.window = context;
  context.DRIFTWORKS_TEST_MODE = true;
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
  }
  return context.Driftworks;
}

function randomSequence(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const dt = 1 / 120;
const copy = value => JSON.parse(JSON.stringify(value));

function createFlight(options = {}) {
  const {mission = 'training', seed = 1729, profile: profileIndex = 0,
    weapon: weaponIndex, enabled = true} = options;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid seed');
  if (typeof enabled !== 'boolean') throw new Error('Invalid enabled flag');
  const DW = loadRuntime();
  if (typeof mission !== 'string' || (mission !== 'training' && DW.flightMissions.resolve(mission).id !== mission)) {
    throw new Error('Unknown mission: ' + mission);
  }
  const profile = DW.arcade.profiles[profileIndex];
  if (!Number.isInteger(profileIndex) || !profile) throw new Error('Invalid profile index');
  const weapon = DW.retailWeapons[weaponIndex === undefined ? DW.training.defaultWeapon(profile) : weaponIndex];
  if ((weaponIndex !== undefined && !Number.isInteger(weaponIndex)) || !weapon) throw new Error('Invalid weapon index');
  const config = {profile, weapon};
  const transcript = [], events = [];
  let session, comms, random, tick, remainder, channelRemaining, radioSerial, known;

  function emit(event) { events.push({tick, seconds: tick * dt, ...copy(event)}); }
  function observe() {
    const {combat} = session.snapshot();
    for (const event of combat.radioEvents) {
      if (event.serial > radioSerial) {
        emit({source: 'combat', ...event});
        radioSerial = event.serial;
      }
    }
    const current = new Set();
    for (const craft of combat.enemies) {
      current.add(craft.id);
      if (!known.has(craft.id)) emit({source: 'session', kind: 'spawn', craftId: craft.id,
        callsign: craft.callsign, team: craft.team, index: craft.index,
        modelId: craft.modelId, position: craft.pose.eye});
    }
    for (const id of known) if (!current.has(id)) emit({source: 'session', kind: 'removed', craftId: id});
    known = current;
  }

  function reset() {
    tick = 0; remainder = 0; channelRemaining = 0; radioSerial = 0; known = new Set();
    transcript.length = 0; events.length = 0;
    random = randomSequence(seed);
    comms = DW.flightComms.create();
    // Use the same CPU surface and terrain intersection functions as flight.js.
    session = DW.flightSession.create({seed,
      surfaceFrame: (asteroid, direction) => DW.scene3d.surfaceFrame(asteroid, direction),
      terrainHit(start, end) {
        const {asteroid} = session.snapshot();
        return DW.flightGuns.intersect(start, end, asteroid.radius, point =>
          DW.scene3d.rockField(asteroid, DW.flightSession.rotateVector(point, -asteroid.rotation)));
      },
      onGunshot: () => emit({source: 'session', kind: 'gunshot'}),
      onImpact: () => emit({source: 'session', kind: 'impact'})
    });
    session.reset({mode: mission, enabled, profile: config.profile});
    observe();
    return session.snapshot();
  }

  function advance(seconds, controls = {}) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid elapsed time');
    const demand = {throttle: null, throttleRate: 0, fire: false, ...controls};
    remainder += seconds;
    while (remainder + 1e-10 >= dt) {
      if (session.snapshot().combat.dead) { remainder = 0; break; }
      remainder = Math.max(0, remainder - dt);
      tick++;
      session.advance(dt, demand, config);
      // The browser pauses immediately on death, before scenery/comms updates.
      if (session.snapshot().combat.dead) { observe(); remainder = 0; break; }
      session.acquireTarget();
      session.advanceScenery(dt);
      observe();
      const {combat, state} = session.snapshot();
      // Model the browser's muted/no-AudioContext channel, not synthesized playback.
      const busy = channelRemaining > 0;
      channelRemaining = Math.max(0, channelRemaining - dt);
      const line = DW.flightComms.step(comms, dt, combat, busy, random, state);
      if (line) {
        const plan = DW.mumble.analyze(line.text, Object.assign(
          DW.flightDialogue.voiceOptions(line.voiceSettings || DW.mumble.presets[line.voice], line.emotion),
          {seed: line.seed, volume: .42}));
        channelRemaining = plan.duration + 1;
        transcript.push({tick, seconds: tick * dt, ...copy(line)});
      }
    }
    return session.snapshot();
  }

  reset();
  return {DW, config, transcript, events, advance, reset,
    snapshot: () => session.snapshot(),
    get session() { return session; }, get comms() { return comms; },
    get ticks() { return tick; }, get seconds() { return tick * dt; }};
}

module.exports = {loadRuntime, createFlight, dt};
