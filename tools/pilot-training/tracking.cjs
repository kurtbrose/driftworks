'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {loadRuntime} = require('../headless.cjs');
const M = require('./marker.cjs');
const initial = require('./marker-example.json');
const DT = M.DT, HOLD = M.HOLD, INPUTS = 7, COUNT = 16;
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
function rng(seed) {let x = seed >>> 0; return () => {x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296;};}
function predict(weights, input) {
  return [0, 1].map(j => Math.tanh(weights[j * 8 + 7] + input.reduce((s, x, i) => s + x * weights[j * 8 + i], 0)));
}
function transfer(weights = initial.weights) {
  const result = Array(COUNT).fill(0);
  for (let j = 0; j < 2; j++) {for (let i = 0; i < 5; i++) result[j * 8 + i] = weights[j * 6 + i]; result[j * 8 + 7] = weights[j * 6 + 5];}
  return result;
}
function cases(seed, count, maxAngle = 150) {
  const random = rng(seed);
  return M.cases(seed, count, maxAngle).map((f, i) => ({...f,
    kind: ['stationary', 'circle', 'reverse', 'weave'][i % 4],
    speed: .04 + random() * .18, phase: random() * Math.PI * 2, turnAt: 3 + random() * 2}));
}
function target(f, seconds, units) {
  const a = f.angle, z = f.azimuth;
  const origin = [Math.sin(a) * Math.cos(z), Math.cos(a), Math.sin(a) * Math.sin(z)];
  const u = [Math.cos(a) * Math.cos(z), -Math.sin(a), Math.cos(a) * Math.sin(z)];
  const v = [-Math.sin(z), 0, Math.cos(z)];
  const tangent = u.map((x, i) => x * Math.cos(f.phase) + v[i] * Math.sin(f.phase));
  let phase = f.speed * seconds, rate = f.speed;
  if (f.kind === 'stationary') phase = rate = 0;
  if (f.kind === 'reverse' && seconds > f.turnAt) {phase = f.speed * (2 * f.turnAt - seconds); rate = -f.speed;}
  if (f.kind === 'weave') {phase = f.speed * Math.sin(seconds * .8) / .8; rate = f.speed * Math.cos(seconds * .8);}
  const radius = 100000;
  return {eye: origin.map((x, i) => radius * (x * Math.cos(phase) + tangent[i] * Math.sin(phase)) / units),
    velocity: origin.map((x, i) => radius * rate * (-x * Math.sin(phase) + tangent[i] * Math.cos(phase)))};
}
function observe(state, contact, units) {
  const delta = contact.eye.map((x, i) => (x - state.eye[i]) * units), range = Math.max(1e-9, Math.hypot(...delta));
  const direction = delta.map(x => x / range), relative = contact.velocity.map((x, i) => x - state.velocity[i]);
  // Current line-of-sight velocity, not future path or target intent.
  const radial = dot(relative, direction), angular = relative.map((x, i) => (x - radial * direction[i]) / range);
  return [dot(direction, state.right), dot(direction, state.up), -dot(direction, state.back),
    state.rates[0], state.rates[1], dot(angular, state.right), dot(angular, state.up)];
}
function episode(DW, weights, fixture, duration = 10, capture = false) {
  if (!Array.isArray(weights) || weights.length !== COUNT || weights.some(x => !Number.isFinite(x))) throw Error('Invalid tracking weights');
  if (!Number.isFinite(duration) || duration <= 3) throw Error('Tracking duration must exceed three-second acquisition window');
  const state = DW.arcade.create(0), U = DW.sim.METERS_PER_UNIT;
  state.throttle = .5; state.rates = fixture.rates.slice();
  let held = [0, 0], previous = [0, 0], loss = 0, errorSum = 0, maximum = 0, samples = 0, underOne = 0, variation = 0;
  let staticMaxRate = 0, finalSecondMaxErrorDegrees = 0;
  const trace = [], ticks = Math.round(duration / DT);
  for (let tick = 0; tick < ticks; tick++) {
    const contact = target(fixture, tick * DT, U);
    if (tick % HOLD === 0) {
      held = predict(weights, observe(state, contact, U));
      loss += .02 * held.reduce((s, x, i) => s + (x - previous[i]) ** 2, 0);
      variation += held.reduce((s, x, i) => s + Math.abs(x - previous[i]), 0); previous = held.slice();
    }
    DW.arcade.step(state, DW.arcade.profiles[0], {pitch: held[0], yaw: held[1], roll: 0, side: 0, vertical: 0, boost: false}, DT);
    const input = observe(state, target(fixture, (tick + 1) * DT, U), U);
    const error = Math.acos(Math.max(-1, Math.min(1, input[2]))), degrees = error * 180 / Math.PI;
    loss += DT * (error ** 2 + .002 * dot(held, held));
    if (tick >= ticks - 240) loss += DT * 5 * error;
    if (tick >= 3 / DT) {errorSum += degrees; maximum = Math.max(maximum, degrees); samples++; if (degrees < 1) underOne++;}
    if (tick >= ticks - 120) {
      staticMaxRate = Math.max(staticMaxRate, Math.hypot(state.rates[0], state.rates[1]));
      finalSecondMaxErrorDegrees = Math.max(finalSecondMaxErrorDegrees, degrees);
    }
    if (capture && tick % HOLD === 0) trace.push({seconds: (tick + 1) * DT, errorDegrees: degrees, pitch: held[0], yaw: held[1]});
  }
  return {kind: fixture.kind, loss: loss / duration, trackingErrorDegrees: errorSum / samples, maxTrackingErrorDegrees: maximum,
    withinOneDegreeFraction: underOne / samples, controlVariationPerSecond: variation / duration, staticMaxRate, finalSecondMaxErrorDegrees,
    ...(capture ? {trace} : {})};
}
function evaluate(DW, weights, fixtures, duration = 10, capture = false) {
  const rows = fixtures.map(f => episode(DW, weights, f, duration, capture));
  const group = values => {
    const mean = key => values.reduce((s, r) => s + r[key], 0) / values.length;
    return {count: values.length, loss: mean('loss'), trackingErrorDegrees: mean('trackingErrorDegrees'),
      stableFinalSecond: values.filter(r => r.finalSecondMaxErrorDegrees < 1 && r.staticMaxRate < .05).length,
      withinOneDegreeFraction: mean('withinOneDegreeFraction'), controlVariationPerSecond: mean('controlVariationPerSecond'),
      worstTrackingErrorDegrees: Math.max(...values.map(r => r.maxTrackingErrorDegrees))};
  };
  return {...group(rows), groups: Object.fromEntries([...new Set(rows.map(r => r.kind))].map(kind => [kind, group(rows.filter(r => r.kind === kind))])), rows};
}
function train(DW, {seed = 1729, generations = 70} = {}) {
  const random = rng(seed), normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
  let mean = transfer(), sigma = mean.map((_, i) => i % 8 >= 5 && i % 8 < 7 ? .7 : .06);
  const validation = cases(seed + 100000, 16), history = [];
  let best = {weights: mean.slice(), result: evaluate(DW, mean, validation), generation: -1};
  for (let generation = 0; generation < generations; generation++) {
    const fixtures = cases(seed + generation * 100, 8, generation < 15 ? 70 : 150);
    const candidates = Array.from({length: 32}, () => {
      const weights = mean.map((x, i) => x + normal() * sigma[i]);
      return {weights, loss: evaluate(DW, weights, fixtures, 8).loss};
    }).sort((a, b) => a.loss - b.loss), elite = candidates.slice(0, 8);
    mean = mean.map((x, i) => .2 * x + .8 * elite.reduce((s, e) => s + e.weights[i], 0) / elite.length);
    sigma = sigma.map((x, i) => Math.max(.006, .3 * x + .7 * Math.sqrt(elite.reduce((s, e) => s + (e.weights[i] - mean[i]) ** 2, 0) / elite.length)));
    if (generation % 5 === 0 || generation === generations - 1) {
      const result = evaluate(DW, mean, validation);
      if (result.loss < best.result.loss) best = {weights: mean.slice(), result, generation};
      const progress = {generation, loss: result.loss, error: result.trackingErrorDegrees, withinOne: result.withinOneDegreeFraction};
      history.push(progress); console.log(JSON.stringify(progress));
    }
  }
  return {best, history};
}
function main() {
  const args = process.argv.slice(2), config = {seed: 1729, generations: 70, out: 'output/pilot-tracking/seed-1729'};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (!(key in config) || args[i + 1] === undefined) throw Error('Expected --seed, --generations or --out with a value');
    config[key] = key === 'out' ? args[i + 1] : Number(args[i + 1]);
  }
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff - 200000 || !Number.isInteger(config.generations) || config.generations < 1 || config.generations > 999) throw Error('Invalid tracking configuration');
  const out = path.resolve(config.out); if (fs.existsSync(path.join(out, 'report.json'))) throw Error('Choose a fresh output directory');
  const DW = loadRuntime(), started = Date.now(), result = train(DW, config), fixtures = cases(config.seed + 200000, 64);
  const stationary = M.cases(config.seed + 300000, 64).map(f => ({...f, kind: 'stationary', speed: 0, phase: 0, turnAt: 4}));
  const report = {version: 1, config, architecture: [INPUTS, 2], parameters: COUNT, dt: DT, policyHz: 20, profile: DW.arcade.profiles[0].name,
    initialization: 'Expanded marker-example.json with zero new velocity weights; all weights trainable; no authored steering.',
    sources: Object.fromEntries(['tools/pilot-training/tracking.cjs', 'tools/pilot-training/marker-example.json', 'experiments/flight-model.js', 'experiments/retail-profiles.js'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),
    weights: result.best.weights, selectedGeneration: result.best.generation, history: result.history, fixtures,
    baseline: evaluate(DW, transfer(), fixtures), trained: evaluate(DW, result.best.weights, fixtures, 10, true),
    stationaryRegression: evaluate(DW, result.best.weights, stationary), elapsedSeconds: (Date.now() - started) / 1000};
  fs.mkdirSync(out, {recursive: true}); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'champion.json'), JSON.stringify({version: 1, task: 'moving-marker-v1', architecture: [INPUTS, 2], weights: report.weights}, null, 2) + '\n');
  console.log(JSON.stringify({out, baseline: report.baseline.trackingErrorDegrees, trained: report.trained.trackingErrorDegrees, withinOne: report.trained.withinOneDegreeFraction, stationary: report.stationaryRegression.trackingErrorDegrees}));
}
if (require.main === module) main();
module.exports = {COUNT, INPUTS, predict, transfer, cases, target, observe, episode, evaluate, train};
