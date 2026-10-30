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
const Executive = require('../tools/pilot-training/executive.cjs');
const executiveWeights = Array(Executive.COUNT).fill(0);
assert.throws(() => Executive.validate([NaN]), /Invalid executive/);
assert.equal(Executive.predict(executiveWeights, Array(Executive.INPUTS).fill(1)), 0);
assert.deepEqual(Executive.cases(42, 4), Executive.cases(42, 4));
assert.deepEqual(Executive.cases(42, 4).map(f => f.start), ['headOn', 'crossing', 'tail', 'tail']);
assert.ok(Executive.cases(42, 4, 5, true).every(f => f.opponentStyle !== 'baseline'));
const testOwn = DW.flightSim.createCraft('executive-probe', DW.arcade.create(0), 'ally');
DW.flightSim.equip(testOwn, DW.arcade.profiles[0], DW.flightSim.defaultWeapon(DW.arcade.profiles[0]));
const testTarget = DW.flightSim.createCraft('executive-target', DW.arcade.create(0), 'enemy');
testTarget.pose.eye = [0, 300 / DW.sim.METERS_PER_UNIT, 0];
const executiveWeapon = DW.retailWeapons[testOwn.weaponIndex], executiveState = Executive.createState();
const executiveGeometry = Executive.geometry(DW, testOwn, testTarget, executiveWeapon);
assert.equal(Executive.transition(executiveState, 'break', executiveGeometry, testOwn, .8), 'attack');
assert.equal(Executive.transition(executiveState, 'break', executiveGeometry, testOwn, 1), 'break');
const heldHeading = executiveState.heading.slice();
assert.equal(Executive.transition(executiveState, 'attack', executiveGeometry, testOwn, 2.8), 'break');
assert.deepEqual(executiveState.heading, heldHeading, 'break heading must remain latched');
assert.equal(Executive.controls(testOwn, testTarget, executiveGeometry, executiveState).fire, false);
for (let i = 0; i < 600; i++) {
  const g = Executive.geometry(DW, testOwn, testTarget, executiveWeapon);
  DW.flightSim.stepInput(testOwn, Executive.controls(testOwn, testTarget, g, executiveState), Executive.DT);
}
assert.ok(Executive.geometry(DW, testOwn, testTarget, executiveWeapon).range > 450, 'fixed break must demonstrate separation in production physics');
assert.equal(Executive.transition(executiveState, 'break', executiveGeometry, testOwn, 6), 'attack', 'break deadline must force recovery');
const executiveFixture = Executive.cases(42, 4, 3)[3];
const executiveEpisode = Executive.episode(DW, executiveWeights, executiveFixture, 'break', true);
assert.deepEqual(executiveEpisode, Executive.episode(DW, executiveWeights, executiveFixture, 'break', true));
const executiveReplay = Executive.replay(DW, executiveEpisode.replay);
const {replay: executiveRecord, ...executiveOriginal} = executiveEpisode;
assert.deepEqual(executiveReplay, executiveOriginal, 'replay must preserve physical outcomes and tactical occupancy');
assert.deepEqual(executiveReplay.metrics, executiveEpisode.metrics);
assert.equal(executiveReplay.playerHull, executiveEpisode.playerHull);
assert.equal(executiveReplay.enemyShield, executiveEpisode.enemyShield);
const executiveEvents = Executive.maneuverEvents(executiveEpisode.replay.decisions, 'pilot-7', 'enemy-2');
assert.equal(executiveEvents.filter(e => e.kind === 'maneuver-started').length, executiveEpisode.switches + 1);
assert.ok(executiveEvents.every(e => e.actorId === 'pilot-7' && e.targetId === 'enemy-2'));
assert.deepEqual(Executive.maneuverEvents([
  {seconds: 0, mode: 'attack', requested: 'attack', range: 300},
  {seconds: 1, mode: 'break', requested: 'break', range: 300},
  {seconds: 6, mode: 'attack', requested: 'break', range: 480}
]).at(-1).reason, 'duration-limit');
assert.throws(() => Executive.maneuverEvents([{seconds: 2, mode: 'attack', requested: 'attack'}, {seconds: 1, mode: 'attack', requested: 'attack'}]), /Invalid decision/);
assert.throws(() => Executive.replay(DW, {...executiveEpisode.replay, inputs: executiveEpisode.replay.inputs.slice(0, -1)}));
assert.deepEqual(Executive.episode(DW, executiveWeights, executiveFixture, 'attack'), Executive.episode(DW, executiveWeights, executiveFixture, 'learned'),
  'neutral selector must execute the same fixed attack controller');
const executiveAttackProbe = Executive.episode(DW, executiveWeights, Executive.cases(42, 4, 2)[2], 'attack');
assert.ok(executiveAttackProbe.shots > 0 && executiveAttackProbe.metrics.hullDamage + executiveAttackProbe.metrics.shieldDamage > 0,
  'fixed attack must score real swept-hull hits with production weapons');
assert.equal(Executive.score({hullDamage: 0, shieldDamage: 0, hullLost: 0, shieldLost: 0, enemyMaxHull: 180, enemyMaxShield: 380, playerMaxHull: 180, playerMaxShield: 380, kill: false, dead: false}), 0,
  'survival and time alone must not earn reward');
const fullRuntimeExecutive = require('../tools/headless.cjs').loadRuntime();
assert.deepEqual(Executive.episode(fullRuntimeExecutive, executiveWeights, executiveFixture), Executive.episode(Executive.runtime(), executiveWeights, executiveFixture),
  'omitting cosmetic scorch meshes must preserve the entire executive episode');
Executive.validate(require('../tools/pilot-training/executive-example.json').weights);
const breakBenefitFixture = {scenario: 'hunted', start: 'tail', seed: 1331364978, duration: 25, skill: 1, opponentStyle: 'baseline'};
const benefitRuntime = Executive.runtime();
const sustainedAttack = Executive.episode(benefitRuntime, executiveWeights, breakBenefitFixture, 'attack');
const breakRequests = Array.from({length: 125}, (_, i) => i >= 25 && i < 35 ? 'break' : 'attack');
const singleBreak = Executive.episode(benefitRuntime, executiveWeights, breakBenefitFixture, 'learned', false, null, breakRequests);
assert.equal(sustainedAttack.outcome, 'timeout');
assert.equal(singleBreak.outcome, 'win', 'a timely fixed break must retain its demonstrated combat benefit');
assert.ok(singleBreak.score > sustainedAttack.score);
const Curriculum = require('../tools/pilot-training/executive-curriculum.cjs');
const curriculumZero = Array(Curriculum.COUNT).fill(0);
assert.throws(() => Curriculum.validate([NaN]), /Invalid curriculum weights/);
assert.deepEqual(Curriculum.episode(DW, curriculumZero, executiveFixture), Executive.episode(DW, executiveWeights, executiveFixture),
  'adding tactical memory must preserve the same motor actions for a neutral selector');
const curriculumBreak = curriculumZero.slice(); curriculumBreak[Curriculum.INPUTS] = 2;
const curriculumCapture = Curriculum.episode(DW, curriculumBreak, executiveFixture, true);
const {replay: curriculumReplay, ...curriculumOriginal} = curriculumCapture;
assert.deepEqual(Executive.replay(DW, curriculumReplay), curriculumOriginal, 'v2 policy requests must replay through the v1 flight-input format');
const context = {own: testOwn, g: executiveGeometry, state: Executive.createState(), seconds: 2};
const withoutHistory = Curriculum.observe(context);
context.state.entries = 1; context.state.since = 1;
assert.notDeepEqual(Curriculum.observe(context), withoutHistory, 'recent-break memory must distinguish otherwise identical tactical states');
assert.equal(Curriculum.observe(context).length, Curriculum.INPUTS);
assert.ok(Curriculum.observe(context).every(Number.isFinite));
assert.throws(() => Curriculum.assertDisjoint({train: [breakBenefitFixture], test: [breakBenefitFixture]}), /Dataset overlap/);
const syntheticLabels = [-1, -.5, .5, 1].map(x => ({input: [x].concat(Array(Curriculum.INPUTS - 1).fill(0)), label: Number(x > 0)}));
const fittedSelector = Curriculum.fit(syntheticLabels, 100);
assert.ok(Curriculum.predict(fittedSelector, syntheticLabels[0].input) < -.2);
assert.ok(Curriculum.predict(fittedSelector, syntheticLabels[3].input) > .2, 'logistic initialization must learn the supplied action distinction');
const TimedBaseline = require('../tools/pilot-training/executive-timed-baseline.cjs');
const timedBenefit = TimedBaseline.evaluate(benefitRuntime, [breakBenefitFixture], 5);
assert.equal(timedBenefit.wins, 1);
assert.equal(timedBenefit.rows[0].score, singleBreak.score, 'fixed-timing baseline must use the same controllers and combat reward');
const curriculumModels = [require('../tools/pilot-training/executive-curriculum-example.json'),
  require('../tools/pilot-training/executive-curriculum-replication.json')];
// A version-2 validation encounter, never part of its final test selection.
const learnedBreakFixture = {scenario: 'hunted', start: 'tail', seed: 2991721438, duration: 25, skill: 0, opponentStyle: 'baseline'};
const learnedBreakRuntime = Executive.runtime();
const learnedBreakAttack = Executive.episode(learnedBreakRuntime, executiveWeights, learnedBreakFixture, 'attack');
assert.equal(learnedBreakAttack.outcome, 'timeout');
for (const model of curriculumModels) {
  Curriculum.validate(model.weights);
  const learnedBreak = Curriculum.episode(learnedBreakRuntime, model.weights, learnedBreakFixture, true);
  assert.equal(learnedBreak.outcome, 'win', 'both retained neural policies must rescue the documented validation pursuit');
  assert.ok(learnedBreak.breakEntries > 0 && learnedBreak.score > learnedBreakAttack.score);
  const {replay: learnedBreakReplay, ...learnedBreakOriginal} = learnedBreak;
  assert.deepEqual(Executive.replay(learnedBreakRuntime, learnedBreakReplay), learnedBreakOriginal);
  const ends = Executive.maneuverEvents(learnedBreakReplay.decisions).filter(e => e.kind === 'maneuver-ended' && e.mode === 'break');
  assert.ok(ends.length > 0 && ends.every(e => e.duration >= 2 - 1e-9), 'learned maneuver events must retain stable physical commitments');
}
console.log('Pilot training: combat scenarios and deterministic from-scratch marker control passed');
