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
console.log('Pilot training: varied team scenarios, wounded starts, attributed bounded damage reward and deterministic replay passed');
