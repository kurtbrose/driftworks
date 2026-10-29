'use strict';
// Offline, from-scratch neural attitude control using the production integrator.
const fs = require('node:fs');
const path = require('node:path');
const {loadRuntime} = require('../headless.cjs');
function randomSequence(seed) {
  let state = seed >>> 0;
  return () => {state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296;};
}
const COUNT = 12, DT = 1 / 120, HOLD = 6, THROTTLE = .5;
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
function validate(weights) {
  if (!Array.isArray(weights) || weights.length !== COUNT || weights.some(x => !Number.isFinite(x))) throw Error('Invalid marker weights');
}
function predict(weights, input) {
  return [0, 1].map(j => Math.tanh(weights[j * 6 + 5] + input.reduce((s, x, i) => s + x * weights[j * 6 + i], 0)));
}
function observe(state, marker) {
  const delta = marker.map((x, i) => x - state.eye[i]), length = Math.hypot(...delta);
  const direction = delta.map(x => x / length);
  return [dot(direction, state.right), dot(direction, state.up), -dot(direction, state.back), state.rates[0], state.rates[1]];
}
function cases(seed, count, maxAngle = 150) {
  const random = randomSequence(seed);
  return Array.from({length: count}, () => {
    const angle = (5 + random() * (maxAngle - 5)) * Math.PI / 180, azimuth = random() * Math.PI * 2;
    return {angle, azimuth, rates: [(random() - .5) * .6, (random() - .5) * .6, 0]};
  });
}
function episode(DW, weights, fixture, duration = 8, capture = false) {
  validate(weights);
  const state = DW.arcade.create(0), profile = DW.arcade.profiles[0];
  state.throttle = THROTTLE; state.rates = fixture.rates.slice();
  // Metres converted explicitly; distant enough that translation barely changes bearing.
  const radius = 100000 / DW.sim.METERS_PER_UNIT;
  const marker = [Math.sin(fixture.angle) * Math.cos(fixture.azimuth) * radius,
    Math.cos(fixture.angle) * radius, Math.sin(fixture.angle) * Math.sin(fixture.azimuth) * radius];
  let held = [0, 0], previous = [0, 0], loss = 0, variation = 0, terminalError = 0, terminalRate = 0, tail = 0;
  let settledAt = null, streak = 0, finalSecondMaxErrorDegrees = 0, finalSecondMaxRate = 0;
  const trace = [], ticks = Math.round(duration / DT);
  for (let tick = 0; tick < ticks; tick++) {
    if (tick % HOLD === 0) {
      held = predict(weights, observe(state, marker));
      const change = held.reduce((s, x, i) => s + (x - previous[i]) ** 2, 0);
      loss += .02 * change; variation += Math.abs(held[0] - previous[0]) + Math.abs(held[1] - previous[1]);
      previous = held.slice();
    }
    DW.arcade.step(state, profile, {pitch: held[0], yaw: held[1], roll: 0, side: 0, vertical: 0, boost: false}, DT);
    const input = observe(state, marker), error = Math.acos(Math.max(-1, Math.min(1, input[2])));
    const rate = Math.hypot(state.rates[0], state.rates[1]);
    loss += DT * (error ** 2 + .025 * rate ** 2 + .002 * (held[0] ** 2 + held[1] ** 2));
    // Acquisition alone can favor a fast turn with a small permanent offset.
    // Explicit terminal settling cost keeps the requested task in the objective.
    if (tick >= ticks - 240) loss += DT * (5 * error + .5 * rate);
    if (error < Math.PI / 180 && rate < .05) streak += DT; else streak = 0;
    if (streak >= .5 && settledAt === null) settledAt = (tick + 1) * DT - streak;
    if (tick >= ticks - 120) {
      terminalError += error * 180 / Math.PI; terminalRate += rate; tail++;
      finalSecondMaxErrorDegrees = Math.max(finalSecondMaxErrorDegrees, error * 180 / Math.PI);
      finalSecondMaxRate = Math.max(finalSecondMaxRate, rate);
    }
    if (capture && tick % HOLD === 0) trace.push({seconds: tick * DT, errorDegrees: error * 180 / Math.PI, rate, pitch: held[0], yaw: held[1]});
  }
  return {loss: loss / duration, finalSecondErrorDegrees: terminalError / tail, finalSecondRate: terminalRate / tail,
    finalSecondMaxErrorDegrees, finalSecondMaxRate,
    controlVariationPerSecond: variation / duration, settledAt, ...(capture ? {trace} : {})};
}
function evaluate(DW, weights, fixtures, duration = 8, capture = false) {
  const rows = fixtures.map(f => episode(DW, weights, f, duration, capture));
  const mean = key => rows.reduce((s, r) => s + r[key], 0) / rows.length;
  return {loss: mean('loss'), finalSecondErrorDegrees: mean('finalSecondErrorDegrees'), finalSecondRate: mean('finalSecondRate'),
    controlVariationPerSecond: mean('controlVariationPerSecond'), settled: rows.filter(r => r.settledAt !== null).length, count: rows.length,
    stableFinalSecond: rows.filter(r => r.finalSecondMaxErrorDegrees < 1 && r.finalSecondMaxRate < .05).length,
    worstFinalSecondErrorDegrees: Math.max(...rows.map(r => r.finalSecondErrorDegrees)), rows};
}
function train(DW, {seed = 1729, generations = 70, population = 32} = {}) {
  const random = randomSequence(seed), normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
  let mean = Array(COUNT).fill(0), sigma = Array(COUNT).fill(.7), best = null;
  const validation = cases(seed + 100000, 16), history = [];
  for (let generation = 0; generation < generations; generation++) {
    const fixtures = cases(seed + generation * 100, 6, generation < 20 ? 70 : 150);
    const candidates = Array.from({length: population}, () => {
      const weights = mean.map((x, i) => x + normal() * sigma[i]);
      return {weights, loss: evaluate(DW, weights, fixtures, 6).loss};
    }).sort((a, b) => a.loss - b.loss);
    const elite = candidates.slice(0, Math.max(4, Math.floor(population / 4)));
    mean = mean.map((x, i) => .2 * x + .8 * elite.reduce((s, e) => s + e.weights[i], 0) / elite.length);
    sigma = sigma.map((x, i) => Math.max(.025, .3 * x + .7 * Math.sqrt(elite.reduce((s, e) => s + (e.weights[i] - mean[i]) ** 2, 0) / elite.length)));
    if (generation % 5 === 0 || generation === generations - 1) {
      const result = evaluate(DW, mean, validation);
      if (!best || result.loss < best.result.loss) best = {weights: mean.slice(), result, generation};
      const progress = {generation, validationLoss: result.loss, errorDegrees: result.finalSecondErrorDegrees, settled: result.settled};
      history.push(progress); console.log(JSON.stringify(progress));
    }
  }
  return {best, history};
}
function main() {
  const args = process.argv.slice(2), option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  for (let i = 0; i < args.length; i += 2) {
    if (!['--seed', '--generations', '--out'].includes(args[i]) || args[i + 1] === undefined) throw Error('Expected --seed, --generations or --out with a value');
  }
  const seed = Number(option('--seed', 1729)), generations = Number(option('--generations', 70));
  const out = path.resolve(option('--out', 'output/marker-training/seed-1729'));
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff - 200000 || !Number.isInteger(generations) || generations < 1 || generations > 999) throw Error('Invalid training configuration');
  if (fs.existsSync(path.join(out, 'report.json'))) throw Error('Choose a fresh output directory');
  const DW = loadRuntime(), started = Date.now(), result = train(DW, {seed, generations});
  const fixtures = cases(seed + 200000, 64), zero = Array(COUNT).fill(0);
  const report = {version: 1, seed, generations, architecture: [5, 2], parameters: COUNT, dt: DT, policyHz: 1 / (DT * HOLD), throttle: THROTTLE,
    task: 'Stationary marker at 100 km; ' + DW.arcade.profiles[0].name + '; production physics including automatic yaw bank; random initial bearing 5-150 degrees and pitch/yaw rates.',
    selection: 'Validation every five generations; test split used only after selection.',
    reward: 'Minimize integrated squared angular error + .025 rate squared + .002 control effort; .02 squared control changes; final two seconds additionally 5 absolute angular error + .5 angular speed. Divide by duration.',
    weights: result.best.weights, selectedGeneration: result.best.generation, history: result.history,
    baseline: evaluate(DW, zero, fixtures), trained: evaluate(DW, result.best.weights, fixtures, 8, true), elapsedSeconds: (Date.now() - started) / 1000};
  fs.mkdirSync(out, {recursive: true}); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'champion.json'), JSON.stringify({version: 1, architecture: [5, 2], weights: report.weights}, null, 2) + '\n');
  console.log(JSON.stringify({out, seconds: report.elapsedSeconds, baselineError: report.baseline.finalSecondErrorDegrees,
    trainedError: report.trained.finalSecondErrorDegrees, settled: report.trained.settled, count: fixtures.length}));
}
if (require.main === module) main();
module.exports = {COUNT, DT, HOLD, THROTTLE, validate, predict, observe, cases, episode, evaluate, train};
