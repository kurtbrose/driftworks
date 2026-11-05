'use strict';
const assert = require('node:assert/strict');
const {loadRuntime, createFlight, dt} = require('../tools/headless.cjs');
const {assertFlightInvariants} = require('../tools/flight-invariants.cjs');
const modes = ['legacy', 'grid', 'tree', 'grid-events', 'tree-events'];
function random(seed) {
  let state = seed >>> 0;
  return () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const seeds = process.argv[2] === undefined ? [29, 1729, 0xffffffff] : [Number(process.argv[2])];
assert(seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff), 'Expected a uint32 seed');
const DW = loadRuntime(), api = DW.flightCollision, U = DW.sim.METERS_PER_UNIT;
// Independent closest-point reference; does not call production collision helpers.
function overlaps(craft, a, b, padding) {
  const d = b.map((v, i) => v - a[i]);
  const length2 = d.reduce((sum, v) => sum + v * v, 0);
  const t = length2 ? Math.max(0, Math.min(1, d.reduce((sum, v, i) => sum + v * (craft.pose.eye[i] - a[i]), 0) / length2)) : 0;
  return Math.hypot(...a.map((v, i) => v + t * d[i] - craft.pose.eye[i])) <= (craft.collision.radiusM + padding) / U;
}
for (const seed of seeds) {
  const rng = random(seed), between = (lo, hi) => lo + rng() * (hi - lo);
  const craft = id => ({id, hp: 10, team: 'enemy', pose: {eye: [between(-500, 500), between(-500, 500), between(-500, 500)]}, collision: {kind: 'sphere', radiusM: between(.01, 400)}});
  const initial = {player: craft('player'), enemies: Array.from({length: 40}, (_, i) => craft('ship-' + i)), time: 0};
  const combats = modes.map(mode => {const c = structuredClone(initial); api.setMode(c, mode); return c;});
  for (let step = 0; step < 160; step++) {
    const a = [between(-500, 500), between(-500, 500), between(-500, 500)];
    const b = step % 7 === 0 ? a.slice() : [between(-500, 500), between(-500, 500), between(-500, 500)];
    const padding = between(0, 20);
    // Force frequent positive hits as well as arbitrary misses and zero-length segments.
    const moved = step % 40, position = step % 2 ? a.slice() : b.slice();
    for (const combat of combats) {
      const target = combat.enemies.find(c => c.id === 'ship-' + moved);
      target.pose.eye = position.slice(); target.hp = step % 5 ? 10 : 0;
      combat.time += dt;
      // Reorder after indexes have been populated; set membership must stay stable.
      if (step % 11 === 0) combat.enemies.reverse();
    }
    const reference = combats[0];
    const expected = [reference.player, ...reference.enemies].filter(c => c.hp > 0 && overlaps(c, a, b, padding)).map(c => c.id).sort();
    for (let i = 0; i < modes.length; i++) {
      const actual = Array.from(api.sweep(combats[i], a, b, padding), e => e.craft)
        .filter(c => api.hullHit(c, a, b, padding)).map(c => c.id).sort();
      assert.deepEqual(actual, expected, JSON.stringify({seed, step, mode: modes[i], a, b, padding}));
    }
  }
  const flight = createFlight({mission: 'furball', seed}), controls = [];
  const hashes = [];
  const digest = () => require('node:crypto').createHash('sha256').update(JSON.stringify({view: flight.snapshot(), events: flight.events, transcript: flight.transcript})).digest('hex');
  for (let tick = 0; tick < 480; tick++) {
    const demand = {fire: rng() < .7, throttle: rng(), pitch: between(-1, 1), yaw: between(-1, 1), roll: between(-1, 1), boost: rng() < .2};
    controls.push(demand);
    try {flight.advance(dt, demand); assertFlightInvariants(flight.snapshot());}
    catch (error) {throw new Error('seed=' + seed + ' tick=' + tick + ': ' + error.message, {cause: error});}
    hashes.push(digest());
  }
  flight.reset();
  controls.forEach((demand, tick) => {
    flight.advance(dt, demand);
    assertFlightInvariants(flight.snapshot());
    assert.equal(digest(), hashes[tick], 'Replay diverged: seed=' + seed + ' tick=' + tick);
  });
  // Demonstrate that the checker detects corruption rather than silently accepting it.
  const broken = JSON.parse(JSON.stringify(flight.snapshot()));
  broken.combat.enemies[0].id = broken.combat.player.id;
  assert.throws(() => assertFlightInvariants(broken), /duplicate/);
  broken.combat.enemies[0].id = 'unique';
  broken.combat.enemies[0].pose.eye[0] = NaN;
  assert.throws(() => assertFlightInvariants(broken), /must be finite/);
  console.log('PASS flight properties seed=' + seed + ': 800 collision comparisons, 480 invariant ticks and replay');
}
