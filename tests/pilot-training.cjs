'use strict';
const assert = require('node:assert/strict');
const P = require('../tools/pilot-training/policy.cjs');
const T = require('../tools/pilot-training/train.cjs');
const S = require('../tools/pilot-training/scenarios.cjs');
const {loadRuntime} = require('../tools/headless.cjs');
const DW = loadRuntime(), weights = new Array(P.COUNT).fill(0);
assert.equal(P.COUNT, 221);
assert.throws(() => P.validate([NaN]), /Invalid pilot/);
const options = {seed: 92, duration: 2, start: 'crossing'};
const a = T.episode(DW, weights, options, true);
const b = T.episode(DW, weights, options, true);
assert.deepEqual(a, b, 'same weights and seed must reproduce the encounter');
assert.ok(Number.isFinite(a.score));
assert.equal(a.replay.inputs.length, a.summary.ticks);
const replayed = T.replay(DW, a.replay).summary;
assert.equal(replayed.playerHull, a.summary.playerHull);
assert.equal(replayed.opponentHull, a.summary.opponentHull);
assert.equal(replayed.playerShots, a.summary.playerShots);
assert.equal(replayed.outcome, a.summary.outcome);
assert.deepEqual(T.replay(DW, a.replay).summary, a.summary);
const changed = weights.slice(); changed[changed.length - 3] = -2;
const duel = DW.flightDuel.create(options), weapon = DW.retailWeapons[duel.combat.player.weaponIndex];
assert.notEqual(P.controls(DW, changed, duel.player, duel.enemy.pose, weapon).throttle,
  P.controls(DW, weights, duel.player, duel.enemy.pose, weapon).throttle);
const cases = T.cases(DW, 1729, 1);
assert.deepEqual(cases.map(c => c.scenario), S.KINDS);
assert.deepEqual(T.cases(DW, 1729, 1), cases);
assert.notDeepEqual(T.cases(DW, 2729, 1), cases);
for (const options of cases) {
  const result = T.episode(DW, weights, options, true);
  assert.deepEqual(T.replay(DW, result.replay).summary, result.summary);
  assert.equal(result.summary.enemies, options.scenario === '1v2' ? 2 : 1);
  assert.equal(result.summary.allies, options.scenario === '2v1' ? 1 : 0);
}
const healthy = S.create(DW, {duration: 1, seed: 1});
const wounded = S.create(DW, {duration: 1, seed: 1, scenario: 'wounded-pilot'});
assert.equal(wounded.duel.combat.player.hp, healthy.duel.combat.player.hp / 2);
assert.equal(wounded.duel.combat.player.shield, healthy.duel.combat.player.shield / 2);
const woundedEnemy = S.create(DW, {duration: 1, seed: 1, scenario: 'wounded-opponent'});
assert.equal(woundedEnemy.duel.enemy.hp, healthy.duel.enemy.hp / 2);
assert.notDeepEqual(S.create(DW, {duration: 1, seed: 2}).duel.enemy.pose.eye, healthy.duel.enemy.pose.eye);
const capped = S.tally([{initialHull: 90, initialShield: 60, hullDamage: 90, shieldDamage: 600, kills: 1}]);
assert.equal(capped.shieldDamage, 60, 'repeated regenerated shield damage cannot replenish reward budget');
assert.equal(capped.hullDamage, 90);
const empty = {hullDamage: 0, shieldDamage: 0, kills: 0, enemyMaxHull: 180, enemyMaxShield: 120,
  enemyCount: 1, damagingHits: 0, victory: false, dead: false, hullLost: 0, shieldLost: 0,
  playerMaxHull: 180, playerMaxShield: 120};
assert.equal(S.score(empty), 0, 'mere survival earns no reward');
assert.ok(S.score({...empty, hullDamage: 20}) > S.score(empty), 'partial hull damage earns credit without a kill');
assert.ok(S.score({...empty, shieldDamage: 20}) > S.score(empty), 'shield damage earns credit');
assert.ok(S.score({...empty, hullDamage: 20, damagingHits: 3}) > S.score({...empty, hullDamage: 20}));
const noFire = Array.from({length: 120 * 12}, () => ({pitch: 0, yaw: 0, roll: 0, side: 0, vertical: 0, throttle: 1, boost: false, fire: false}));
const support = T.episode(DW, weights, {duration: 12, seed: 1729, scenario: '2v1'}, false, noFire);
assert.ok(support.summary.alliedShots > 0, 'supporting wingmate participates in combat');
assert.equal(support.summary.metrics.hullDamage, 0, 'wingmate damage earns no personal credit');
assert.equal(support.summary.metrics.shieldDamage, 0);
assert.equal(support.summary.metrics.kills, 0);
assert.equal(support.summary.metrics.damagingHits, 0);
const hitting = T.episode(DW, weights, {duration: 2, seed: 1});
assert.ok(hitting.summary.metrics.damagingHits > 0);
assert.ok(hitting.summary.metrics.shieldDamage > 0);
assert.ok(hitting.score > 0, 'real partial damage earns reward before a kill');
const fastDW = T.configureRuntime(loadRuntime());
for (const options of T.cases(DW, 1729, 4)) {
  assert.deepEqual(T.episode(fastDW, weights, options), T.episode(DW, weights, options),
    'skipping visual scorch geometry must preserve reward, hits, damage, control and outcomes');
}
const alreadyDamaged = T.episode(DW, weights, {duration: .05, seed: 1, scenario: 'wounded-opponent'});
assert.equal(alreadyDamaged.summary.metrics.hullDamage, 0, 'pre-existing hull damage earns no reward');
assert.equal(alreadyDamaged.summary.metrics.shieldDamage, 0);
assert.equal(alreadyDamaged.score, 0);
assert.throws(() => T.replay(DW, {...a.replay, inputs: a.replay.inputs.slice(0, -1)}));
assert.throws(() => S.create(DW, {scenario: 'unknown'}), /Unknown training scenario/);
const M = require('../tools/pilot-training/marker.cjs');
const markerWeights = Array(M.COUNT).fill(0), fixture = M.cases(42, 1)[0];
assert.deepEqual(M.predict(markerWeights, [1, 0, 0, .2, -.3]), [0, 0], 'zero weights have no authored aiming scaffold');
assert.throws(() => M.validate([NaN]), /Invalid marker weights/);
assert.deepEqual(M.cases(42, 6), M.cases(42, 6));
assert.notDeepEqual(M.cases(42, 6), M.cases(43, 6));
const markerRun = M.episode(DW, markerWeights, fixture, 1, true);
assert.deepEqual(markerRun, M.episode(DW, markerWeights, fixture, 1, true));
assert.equal(markerRun.trace.length, 20, '20 Hz decisions use 120 Hz production integration');
assert.ok(Number.isFinite(markerRun.loss));
assert.ok(markerRun.trace.every(r => r.pitch === 0 && r.yaw === 0));
const explicitTurn = markerWeights.slice(); explicitTurn[5] = 1;
assert.notDeepEqual(M.episode(DW, explicitTurn, fixture, 1), M.episode(DW, markerWeights, fixture, 1));
const markerExample = require('../tools/pilot-training/marker-example.json');
const markerEvaluation = M.evaluate(DW, markerExample.weights, M.cases(424242, 8));
assert.equal(markerEvaluation.stableFinalSecond, 8, 'trained export must settle on independent bearings and angular rates');
assert.ok(markerEvaluation.worstFinalSecondErrorDegrees < 1);
assert.ok(markerEvaluation.finalSecondRate < .05, 'alignment must settle rather than merely cross the marker');
const Tracking = require('../tools/pilot-training/tracking.cjs');
const Arrival = require('../tools/pilot-training/arrival.cjs');
const trackingInput = [.2, -.3, .9, .05, -.1];
assert.deepEqual(Tracking.predict(Tracking.transfer(), trackingInput.concat([0, 0])), M.predict(markerExample.weights, trackingInput),
  'expanding observations must preserve the learned marker policy before training');
assert.deepEqual(Tracking.cases(42, 8), Tracking.cases(42, 8));
assert.deepEqual(Tracking.cases(42, 4).map(f => f.kind), ['stationary', 'circle', 'reverse', 'weave']);
for (const f of Tracking.cases(42, 4)) {
  const t = 1.3, h = .00001, units = DW.sim.METERS_PER_UNIT;
  const contact = Tracking.target(f, t, units), next = Tracking.target(f, t + h, units), before = Tracking.target(f, t - h, units);
  contact.velocity.forEach((v, i) => assert.ok(Math.abs((next.eye[i] - before.eye[i]) * units / (2 * h) - v) < .001,
    'observed target velocity must match the actual path derivative'));
}
const trackingFixture = Tracking.cases(42, 4)[2];
assert.deepEqual(Tracking.episode(DW, Tracking.transfer(), trackingFixture, 4, true), Tracking.episode(DW, Tracking.transfer(), trackingFixture, 4, true));
assert.throws(() => Tracking.episode(DW, [], trackingFixture), /Invalid tracking/);
assert.throws(() => Tracking.episode(DW, Tracking.transfer(), trackingFixture, 3), /duration/);
assert.ok(Tracking.observe(DW.arcade.create(0), {eye: [0, 0, 0], velocity: [0, 0, 0]}, DW.sim.METERS_PER_UNIT).every(Number.isFinite));
assert.deepEqual(Arrival.cases(42, 4), Arrival.cases(42, 4));
assert.equal(Arrival.predict(Array(5).fill(0), [1, .2, .3, 1]), 0, 'zero throttle weights do not contain an arrival controller');
const arrivalFixture = Arrival.cases(42, 1)[0];
assert.deepEqual(Arrival.episode(DW, Tracking.transfer(), Array(5).fill(0), arrivalFixture, 2, true),
  Arrival.episode(DW, Tracking.transfer(), Array(5).fill(0), arrivalFixture, 2, true));
const trackingExample = require('../tools/pilot-training/tracking-example.json');
const trackingEvaluation = Tracking.evaluate(DW, trackingExample.weights, Tracking.cases(424242, 8));
assert.ok(trackingEvaluation.trackingErrorDegrees < .8, 'trained tracking export must follow independent moving markers');
assert.ok(trackingEvaluation.withinOneDegreeFraction > .9);
const arrivalExample = require('../tools/pilot-training/arrival-example.json');
const arrivalEvaluation = Arrival.evaluate(DW, arrivalExample.trackingWeights, arrivalExample.weights, Arrival.cases(424242, 8));
assert.equal(arrivalEvaluation.successes, 8, 'learned throttle must arrive and remain slow, not merely pass the target');
console.log('Pilot training: combat scenarios and deterministic from-scratch marker control passed');
