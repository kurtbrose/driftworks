'use strict';
const assert = require('node:assert/strict');
const {createFlight, loadRuntime, dt} = require('../tools/headless.cjs');
const copy = value => JSON.parse(JSON.stringify(value));

const flight = createFlight({mission: 'ohio', seed: 29});
assert.equal(flight.snapshot().combat, flight.session.snapshot().combat, 'Expose real session-owned objects');
assert.equal(flight.snapshot().combat.enemies.length, 8);
assert.deepEqual(copy(flight.DW.asteroidTerrain.visualFor(flight.snapshot().asteroid).bulk), [0.85, 0.15, 0, 0]);
flight.session.setAsteroidDiameter(2000);
assert.deepEqual(copy(flight.DW.asteroidTerrain.visualFor(flight.snapshot().asteroid).bulk), [0.85, 0.15, 0, 0]);
flight.session.setAsteroidDiameter(2500);
const initialSpawn = copy(flight.events[0]);
flight.advance(8, {stop: true});
assert.deepEqual(flight.transcript.filter(line => line.event === 'missionIntro').map(line => line.text),
  ["It's all Ohio?", 'Always has been.']);
assert(flight.snapshot().combat.openingStep > 2, 'Real comms releases the scripted combat gate');
assert.equal(flight.ticks, 960);
assert.deepEqual(flight.events[0], initialSpawn, 'Event records do not drift with live positions');
for (let i = 1; i < flight.transcript.length; i++) {
  assert(flight.transcript[i].seconds > flight.transcript[i - 1].seconds + 1, 'Channel occupancy spaces lines');
}
const expected = copy({view: flight.snapshot(), transcript: flight.transcript, events: flight.events});
const oldCombat = flight.snapshot().combat;
flight.reset();
assert.notEqual(flight.snapshot().combat, oldCombat, 'Reset replaces state; callers reacquire snapshots');
assert.equal(flight.transcript.length, 0);
for (let i = 0; i < 80; i++) flight.advance(.1, {stop: true});
assert.deepEqual(copy({view: flight.snapshot(), transcript: flight.transcript, events: flight.events}), expected,
  'Same seed, controls and elapsed time reproduce state, events and dialogue across call chunking');

const {combat} = flight.snapshot(), victim = combat.enemies[0];
flight.DW.flightSim.damageCraft(combat, victim, {damage: 1e6, shieldFactor: 1, armorFactor: 1}, combat.player);
flight.advance(dt, {stop: true});
assert(flight.events.some(event => event.source === 'combat' && event.kind === 'destroyed' && event.victim === victim.id));
const replacement = flight.snapshot().combat.enemies[0];
assert.notEqual(replacement.id, victim.id);
assert(replacement.hangarLaunch, 'Real session supplies the rotating barn launch');
assert(flight.events.some(event => event.kind === 'spawn' && event.craftId === replacement.id));
assert.equal(flight.snapshot().combat.enemies.filter(craft => craft.hp > 0 && craft.team === 'ally').length, 4);

// Compare against an independently driven production session, not a mock simulation.
const manual = createFlight({seed: 7});
const DW = manual.DW;
let direct = DW.flightSession.create({seed: 7,
  surfaceFrame: (asteroid, direction) => DW.asteroidTerrain.surfaceFrame(asteroid, direction),
  terrainHit(start, end) {
    const {asteroid} = direct.snapshot();
    return DW.flightGuns.intersect(start, end, asteroid.radius,
      point => DW.asteroidTerrain.rockField(asteroid, DW.flightSession.rotateVector(point, -asteroid.rotation)));
  }, onGunshot() {}, onImpact() {}
});
direct.reset({mode: 'training', enabled: true, profile: manual.config.profile});
const demand = {throttle: null, throttleRate: 0, fire: true, stop: true};
for (let i = 0; i < 480; i++) {
  direct.advance(dt, demand, manual.config);
  if (direct.snapshot().combat.dead) break;
  direct.acquireTarget(); direct.advanceScenery(dt);
}
manual.advance(4, demand);
assert.deepEqual(copy(manual.snapshot()), copy(direct.snapshot()), 'Headless stepping preserves production session behavior');

const isolated = createFlight({enabled: false});
assert.notEqual(isolated.DW, DW);
assert.equal(isolated.snapshot().combat.enemies.length, 0);
isolated.advance(dt / 2);
assert.equal(isolated.ticks, 0);
isolated.advance(dt / 2);
assert.equal(isolated.ticks, 1, 'Retain partial ticks');
isolated.snapshot().combat.dead = true;
isolated.advance(10);
assert.equal(isolated.ticks, 1, 'Stop advancing on player death, as the browser pauses');
for (const seconds of [-1, NaN, Infinity]) assert.throws(() => isolated.advance(seconds));
for (const options of [{mission: 'typo'}, {seed: -1}, {seed: 1.2}, {profile: 999}, {weapon: -1}, {enabled: 1}]) {
  assert.throws(() => createFlight(options));
}
const runtime = loadRuntime();
assert.equal(runtime.scene3d, undefined, 'Headless flight does not load the scene controller');
assert(runtime.sim && runtime.flightDuel && runtime.explosions && runtime.asteroidTerrain);
console.log('PASS headless API: production parity, live state, isolated runtimes, deterministic reset/chunking, scripted comms, destruction/replacements and clock bounds');

// Ohio's team dogfight selects NPC opponents; taunts must survive ordinary wing chatter.
const tauntFlight = createFlight({mission: 'ohio', seed: 29});
tauntFlight.advance(60, {stop: true});
const taunts = tauntFlight.transcript.filter(line => line.event === 'taunt');
assert(taunts.length > 0, 'A real Ohio dogfight offers rival taunts');
assert(taunts.every(line => line.hostile && line.craftId), 'Taunts belong to actual rivals');
for (let i = 1; i < taunts.length; i++) {
  assert(taunts[i].seconds - taunts[i - 1].seconds >= 20, 'Rival taunts retain category cooldown');
}
console.log('PASS Ohio rival taunts: real NPC target selection, occupied radio and category cooldown');

for (const target of ['missing', 'dead', 'enemy']) {
  const api = loadRuntime().flightComms, clock = api.create();
  const combat = {enabled: true, mode: 'furball', wave: 1, hull: 100,
    enemies: [{id: 'rival', team: 'enemy', hp: 90, mode: 'attack', targetId: target},
      {id: 'dead', team: 'ally', hp: 0, mode: 'approach'},
      {id: 'enemy', team: 'enemy', hp: 90, mode: 'approach'}]};
  api.step(clock, 0, combat, true, () => .4);
  clock.wait = 100; clock.quiet = 10;
  assert.equal(api.step(clock, 10, combat, false, () => .4), null,
    'A missing, dead or friendly rival target does not qualify for a team taunt');
}
