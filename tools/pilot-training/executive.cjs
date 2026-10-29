'use strict';
// Offline tactical learning. Every policy shares these frozen motor controllers.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const {loadRuntime} = require('../headless.cjs');
const S = require('./scenarios.cjs');
const DT = 1 / 120, DECISION_TICKS = 24, INPUTS = 10, COUNT = INPUTS + 1;
const SELECTORS = ['learned', 'attack', 'break', 'authored'];
const clamp = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const unit = a => {const n = Math.hypot(...a); return n > 1e-9 ? a.map(x => x / n) : [0, 1, 0];};
function rng(seed) {let x = seed >>> 0; return () => {x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296;};}
function validate(weights) {
  if (!Array.isArray(weights) || weights.length !== COUNT || weights.some(x => !Number.isFinite(x))) throw Error('Invalid executive weights');
}
function predict(weights, input) {return Math.tanh(weights[INPUTS] + input.reduce((s, x, i) => s + x * weights[i], 0));}
function geometry(DW, own, target, weapon) {
  const delta = sub(target.pose.eye, own.pose.eye), direction = unit(delta), relative = sub(own.pose.velocity, target.pose.velocity);
  return {direction, range: Math.hypot(...delta) * DW.sim.METERS_PER_UNIT, closure: dot(relative, direction),
    facing: -dot(own.pose.back, direction), threatFacing: dot(target.pose.back, direction),
    shot: DW.flightAI.solution(own.pose, target.pose.eye, target.pose.velocity, weapon)};
}
function observe(own, g, state, seconds) {
  return [clamp(g.range / 800 - 1), clamp(g.closure / 150), g.facing, g.threatFacing, g.shot.dot,
    own.hp / own.maxHp, own.shield / Math.max(1, own.maxShield), state.mode === 'break' ? 1 : -1,
    clamp((seconds - own.damagedAt) / 5, 0, 1), clamp(state.dry / 10, 0, 1)];
}
function createState() {return {mode: 'attack', since: 0, heading: null, dry: 0, entries: 0, switches: 0};}
function choose(selector, weights, own, g, state, seconds) {
  if (selector === 'attack') return 'attack';
  if (selector === 'break') return 'break';
  if (selector === 'authored') {
    // Fixed overshoot / stagnant-contact rule, authored before training.
    return g.range < 260 && g.closure > 25 && g.facing > .5 || g.range < 95 || state.dry > 7 && g.range < 800 ? 'break' : 'attack';
  }
  const value = predict(weights, observe(own, g, state, seconds));
  return value > .2 ? 'break' : value < -.2 ? 'attack' : state.mode;
}
function transition(state, requested, g, own, seconds) {
  const held = seconds - state.since;
  // Attack lasts >=1 s. Break lasts >=2 s and ends by 5 s or upon 550 m separation.
  if (state.mode === 'break' && held >= 2 && (requested === 'attack' || g.range >= 550 || held >= 5)) {
    state.mode = 'attack'; state.since = seconds; state.heading = null; state.switches++;
  } else if (state.mode === 'attack' && held >= 1 && requested === 'break') {
    state.mode = 'break'; state.since = seconds; state.entries++; state.switches++;
    state.heading = unit(g.direction.map((x, i) => -x - own.pose.back[i] * .5 + own.pose.right[i] * .35));
  }
  return state.mode;
}
function aim(own, direction) {
  const f = -dot(direction, own.pose.back);
  return {pitch: clamp(Math.atan2(dot(direction, own.pose.up), f) * 2.4 - own.pose.rates[0] * .32),
    yaw: clamp(-Math.atan2(dot(direction, own.pose.right), f) * 2.4 - own.pose.rates[1] * .32),
    roll: 0, side: 0, vertical: 0, throttle: 1, throttleRate: 0, boost: false, fire: false};
}
function controls(own, target, g, state) {
  if (state.mode === 'break') return aim(own, state.heading);
  const input = aim(own, unit(sub(g.shot.point, own.pose.eye)));
  const along = -dot(target.pose.velocity, own.pose.back);
  const desired = along + (g.range - 330) * .16 - g.closure * .35;
  input.throttle = g.facing < .3 ? .85 : clamp(desired / own.profile.maxVelocity[2], .45, 1);
  input.fire = g.range > 130 && g.shot.valid && g.shot.dot > .997;
  return input;
}
function cases(seed, count, duration = 25, unseen = false) {
  const random = rng(seed);
  return Array.from({length: count}, (_, i) => ({scenario: ['head-on', 'crossing', 'on-tail', 'hunted'][i % 4],
    start: ['headOn', 'crossing', 'tail', 'tail'][i % 4],
    seed: Math.floor(random() * 0x100000000), duration, skill: Math.floor(random() * 2),
    opponentStyle: unseen ? ['aggressor', 'passer', 'fso-breaker'][i % 3] : 'baseline'}));
}
function score(m) {
  return 4 * m.hullDamage / m.enemyMaxHull + .5 * m.shieldDamage / Math.max(1, m.enemyMaxShield)
    + 3 * Number(m.kill) - 2 * m.hullLost / m.playerMaxHull - .25 * m.shieldLost / Math.max(1, m.playerMaxShield) - 3 * Number(m.dead);
}
function episode(DW, weights, options, selector = 'learned', capture = false, recordedInputs = null, requestStream = null) {
  validate(weights); if (!SELECTORS.includes(selector)) throw Error('Invalid selector');
  if (!['head-on', 'crossing', 'on-tail', 'hunted'].includes(options.scenario)) throw Error('Executive requires one opponent');
  const setup = S.create(DW, options), {combat} = setup.duel, own = combat.player, enemy = setup.duel.enemy;
  const weapon = DW.retailWeapons[own.weaponIndex], state = createState(), inputs = [], decisions = [];
  const metrics = {hullDamage: 0, shieldDamage: 0, hullLost: 0, shieldLost: 0, enemyMaxHull: enemy.maxHp,
    enemyMaxShield: enemy.maxShield, playerMaxHull: own.maxHp, playerMaxShield: own.maxShield, kill: false, dead: false};
  let tick = 0, rangeIntegral = 0, attackSeconds = 0, breakSeconds = 0, facingThreatSeconds = 0;
  const limit = Math.ceil(options.duration / DT);
  while (tick < limit && !combat.dead && enemy.hp > 0) {
    const seconds = tick * DT, g = geometry(DW, own, enemy, weapon);
    if (tick % DECISION_TICKS === 0) {
      const requested = requestStream ? requestStream[tick / DECISION_TICKS] : choose(selector, weights, own, g, state, seconds);
      if (!['attack', 'break'].includes(requested)) throw Error('Invalid tactical request stream');
      transition(state, requested, g, own, seconds);
      if (capture) decisions.push({seconds, requested, mode: state.mode, range: g.range, closure: g.closure, facing: g.facing, threatFacing: g.threatFacing});
    }
    const input = recordedInputs ? DW.flightAI.validate(recordedInputs[tick]) : controls(own, enemy, g, state);
    if (capture) {
      const {throttleRate, ...pilotInput} = input;
      inputs.push(pilotInput);
    }
    const hp = own.hp, shield = own.shield;
    let enemyHp, enemyShield;
    DW.training.stepControlled(combat, {...input, throttleRate: 0}, weapon, DT, 0, undefined, () => {
      metrics.hullLost += Math.max(0, hp - own.hp); metrics.shieldLost += Math.max(0, shield - own.shield);
      enemyHp = enemy.hp; enemyShield = enemy.shield;
    });
    const dealt = Math.max(0, enemyHp - enemy.hp), shieldDealt = Math.max(0, enemyShield - enemy.shield);
    metrics.hullDamage += dealt; metrics.shieldDamage += shieldDealt;
    state.dry = dealt + shieldDealt + Math.max(0, hp - own.hp) + Math.max(0, shield - own.shield) > 0 ? 0 : state.dry + DT;
    rangeIntegral += g.range * DT;
    if (state.mode === 'attack') attackSeconds += DT; else breakSeconds += DT;
    if (g.threatFacing > .95 && g.range < 800) facingThreatSeconds += DT;
    tick++;
  }
  metrics.hullDamage = Math.min(enemy.maxHp, metrics.hullDamage); metrics.shieldDamage = Math.min(enemy.maxShield, metrics.shieldDamage);
  metrics.hullLost = Math.min(own.maxHp, metrics.hullLost); metrics.shieldLost = Math.min(own.maxShield, metrics.shieldLost);
  metrics.kill = enemy.hp <= 0; metrics.dead = combat.dead;
  const seconds = tick * DT;
  const result = {score: score(metrics), outcome: combat.dead ? 'loss' : metrics.kill ? 'win' : 'timeout', seconds, ticks: tick, metrics,
    playerHull: own.hp, playerShield: own.shield, enemyHull: enemy.hp, enemyShield: enemy.shield,
    shots: own.guns.fired, enemyShots: enemy.guns.fired, meanRange: rangeIntegral / seconds,
    attackSeconds, breakSeconds, breakEntries: state.entries, switches: state.switches, facingThreatSeconds};
  if (recordedInputs && recordedInputs.length !== tick) throw Error('Replay length does not match terminal state');
  if (capture) result.replay = {version: 1, task: 'tactical-executive-v1', cadence: DT, options, selector, weights, inputs, decisions};
  return result;
}
function replay(DW, record) {
  if (record.version !== 1 || record.task !== 'tactical-executive-v1' || record.cadence !== DT || !Array.isArray(record.inputs)
    || !Array.isArray(record.decisions) || record.decisions.length !== Math.ceil(record.inputs.length / DECISION_TICKS)) throw Error('Invalid executive replay');
  record.decisions.forEach((d, i) => {
    if (Math.abs(d.seconds - i * DECISION_TICKS * DT) > 1e-9 || !['attack', 'break'].includes(d.requested)) throw Error('Invalid replay decisions');
  });
  record.inputs.forEach(DW.flightAI.validate);
  return episode(DW, record.weights, record.options, record.selector, false, record.inputs, record.decisions.map(d => d.requested));
}
function maneuverEvents(decisions, actorId = 'controlled-pilot', targetId = 'duel-opponent') {
  // Facts about committed maneuvers, not explanations of a network's motives.
  const events = [];
  let previous = null, since = 0, lastTime = -Infinity;
  for (const d of decisions) {
    if (!Number.isFinite(d.seconds) || d.seconds < lastTime || !['attack', 'break'].includes(d.mode) || !['attack', 'break'].includes(d.requested)) throw Error('Invalid decision log');
    lastTime = d.seconds;
    if (d.mode === previous) continue;
    const reason = previous === null ? 'initial' : d.mode !== d.requested ? d.range >= 550 ? 'separation-limit' : 'duration-limit' : 'selector';
    if (previous !== null) events.push({kind: 'maneuver-ended', actorId, targetId, seconds: d.seconds, mode: previous, duration: d.seconds - since, reason});
    events.push({kind: 'maneuver-started', actorId, targetId, seconds: d.seconds, mode: d.mode, previousMode: previous, reason, range: d.range});
    previous = d.mode; since = d.seconds;
  }
  return events;
}
function evaluate(DW, weights, fixtures, selector = 'learned') {
  const rows = fixtures.map(f => episode(DW, weights, f, selector)), mean = key => rows.reduce((s, r) => s + r[key], 0) / rows.length;
  return {score: mean('score'), wins: rows.filter(r => r.outcome === 'win').length, losses: rows.filter(r => r.outcome === 'loss').length,
    timeouts: rows.filter(r => r.outcome === 'timeout').length, meanSeconds: mean('seconds'), meanRange: mean('meanRange'),
    meanBreakEntries: mean('breakEntries'), meanAttackSeconds: mean('attackSeconds'), meanBreakSeconds: mean('breakSeconds'),
    meanHullDamage: rows.reduce((s, r) => s + r.metrics.hullDamage, 0) / rows.length,
    meanHullLost: rows.reduce((s, r) => s + r.metrics.hullLost, 0) / rows.length, rows};
}
function runtime() {const DW = loadRuntime(); DW.shipPackModels.addScorch = () => {}; return DW;}
function train(DW, {seed, generations, population, duration}) {
  const random = rng(seed), normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
  let mean = Array(COUNT).fill(0), sigma = Array(COUNT).fill(.8), best = null;
  const validation = cases(seed + 100000, 12, duration), history = [];
  for (let generation = 0; generation < generations; generation++) {
    const fixtures = cases(seed + generation * 100, 4, duration);
    const candidates = Array.from({length: population}, () => {
      const weights = mean.map((x, i) => x + normal() * sigma[i]);
      return {weights, result: evaluate(DW, weights, fixtures)};
    }).sort((a, b) => b.result.score - a.result.score), elite = candidates.slice(0, Math.max(2, Math.floor(population / 4)));
    mean = mean.map((x, i) => .2 * x + .8 * elite.reduce((s, e) => s + e.weights[i], 0) / elite.length);
    sigma = sigma.map((x, i) => Math.max(.06, .3 * x + .7 * Math.sqrt(elite.reduce((s, e) => s + (e.weights[i] - mean[i]) ** 2, 0) / elite.length)));
    if (generation % 5 === 0 || generation === generations - 1) {
      const result = evaluate(DW, mean, validation);
      if (!best || result.score > best.result.score) best = {weights: mean.slice(), result, generation};
      const progress = {generation, score: result.score, wins: result.wins, losses: result.losses, breaks: result.meanBreakEntries};
      history.push(progress); console.log(JSON.stringify(progress));
    }
  }
  return {best, history};
}
function main() {
  const args = process.argv.slice(2), config = {seed: 1729, generations: 30, population: 16, duration: 25, out: 'output/pilot-executive/seed-1729'};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, ''); if (!(key in config) || args[i + 1] === undefined) throw Error('Expected --seed, --generations, --population, --duration or --out with a value');
    config[key] = key === 'out' ? args[i + 1] : Number(args[i + 1]);
  }
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff - 400000 || !Number.isInteger(config.generations) || config.generations < 1 || config.generations > 999 || !Number.isInteger(config.population) || config.population < 8 || config.population > 128 || !Number.isFinite(config.duration) || config.duration < 10 || config.duration > 120) throw Error('Invalid executive configuration');
  const out = path.resolve(config.out); if (fs.existsSync(path.join(out, 'report.json'))) throw Error('Choose a fresh output directory');
  const sources = Object.fromEntries(['tools/pilot-training/executive.cjs', 'tools/pilot-training/scenarios.cjs', 'experiments/training.js', 'experiments/flight-ai.js', 'experiments/flight-duel.js', 'experiments/flight-model.js', 'experiments/retail-profiles.js', 'experiments/retail-weapons.js', 'experiments/guns.js'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
  const DW = runtime(), started = performance.now(), result = train(DW, config);
  const fixtures = cases(config.seed + 200000, 32, config.duration), unseen = cases(config.seed + 300000, 32, config.duration, true);
  const compare = suite => Object.fromEntries(SELECTORS.map(selector => [selector, evaluate(DW, result.best.weights, suite, selector)]));
  const report = {version: 1, config, sources, architecture: [INPUTS, 1], parameters: COUNT, policyHz: 5, controllerHz: 120,
    profile: DW.arcade.profiles[0].name, weights: result.best.weights, selectedGeneration: result.best.generation, history: result.history,
    fixtures, unseenFixtures: unseen, heldout: compare(fixtures), unseenOpponents: compare(unseen), elapsedSeconds: (performance.now() - started) / 1000};
  const watch = episode(DW, report.weights, fixtures[0], 'learned', true);
  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'champion.json'), JSON.stringify({version: 1, task: 'tactical-executive-v1', architecture: [INPUTS, 1], weights: report.weights}, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'replay.json'), JSON.stringify(watch.replay, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'maneuver-events.json'), JSON.stringify(maneuverEvents(watch.replay.decisions), null, 2) + '\n');
  console.log(JSON.stringify({out, seconds: report.elapsedSeconds, heldout: Object.fromEntries(Object.entries(report.heldout).map(([k, v]) => [k, {score: v.score, wins: v.wins, losses: v.losses, breaks: v.meanBreakEntries}]))}));
}
if (require.main === module) main();
module.exports = {DT, DECISION_TICKS, INPUTS, COUNT, SELECTORS, validate, predict, geometry, observe, createState, choose, transition, aim, controls, cases, score, episode, replay, maneuverEvents, evaluate, runtime, train};
