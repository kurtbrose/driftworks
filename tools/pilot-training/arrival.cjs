'use strict';
// A separately learned throttle skill layered on the learned tracking skill.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {loadRuntime} = require('../headless.cjs');
const T = require('./tracking.cjs');
const M = require('./marker.cjs');
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
function rng(seed) {let x = seed >>> 0; return () => {x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296;};}
function cases(seed, count) {
  const random = rng(seed);
  return M.cases(seed, count, 110).map(f => ({...f, distance: 100 + random() * 300, speed: random() * 35}));
}
function observe(state, marker, units) {
  const delta = marker.map((x, i) => (x - state.eye[i]) * units), range = Math.hypot(...delta);
  const direction = delta.map(x => x / Math.max(1e-9, range));
  return {range, input: [range / 400, dot(state.velocity, direction) / 70,
    -dot(state.velocity, state.back) / 70, -dot(direction, state.back)]};
}
function predict(weights, input) {return Math.tanh(weights[4] + input.reduce((s, x, i) => s + x * weights[i], 0));}
function episode(DW, trackingWeights, weights, fixture, duration = 20, capture = false) {
  if (!Array.isArray(weights) || weights.length !== 5 || weights.some(x => !Number.isFinite(x))) throw Error('Invalid arrival weights');
  const U = DW.sim.METERS_PER_UNIT, state = DW.arcade.create(0);
  state.rates = fixture.rates.slice(); state.ramp[2] = fixture.speed;
  state.velocity = state.back.map(x => -x * fixture.speed); state.throttle = fixture.speed / 70;
  const marker = [Math.sin(fixture.angle) * Math.cos(fixture.azimuth), Math.cos(fixture.angle), Math.sin(fixture.angle) * Math.sin(fixture.azimuth)].map(x => x * fixture.distance / U);
  let held = [0, 0], throttle = state.throttle, loss = 0, previous = throttle, maxFinalDistance = 0, maxFinalSpeed = 0, overshot = false;
  const trace = [], ticks = Math.round(duration / M.DT);
  for (let tick = 0; tick < ticks; tick++) {
    const observed = observe(state, marker, U);
    if (tick % M.HOLD === 0) {
      held = T.predict(trackingWeights, T.observe(state, {eye: marker, velocity: [0, 0, 0]}, U));
      throttle = predict(weights, observed.input); loss += .01 * (throttle - previous) ** 2; previous = throttle;
    }
    state.throttle = throttle;
    DW.arcade.step(state, DW.arcade.profiles[0], {pitch: held[0], yaw: held[1], roll: 0, side: 0, vertical: 0, boost: false}, M.DT);
    const after = observe(state, marker, U), speed = Math.hypot(...state.velocity);
    loss += M.DT * (after.range / fixture.distance + .005 * throttle ** 2);
    if (tick >= ticks - 480) loss += M.DT * (after.range / 20 + speed / 8);
    if (tick >= ticks - 240) {maxFinalDistance = Math.max(maxFinalDistance, after.range); maxFinalSpeed = Math.max(maxFinalSpeed, speed);}
    // Crossing the plane through the marker perpendicular to its initial bearing.
    if (dot(state.eye, marker) > dot(marker, marker)) overshot = true;
    if (capture && tick % M.HOLD === 0) trace.push({seconds: (tick + 1) * M.DT, distance: after.range, speed, throttle, pitch: held[0], yaw: held[1]});
  }
  return {loss: loss / duration, maxFinalDistance, maxFinalSpeed, success: maxFinalDistance < 15 && maxFinalSpeed < 3, overshot, ...(capture ? {trace} : {})};
}
function evaluate(DW, trackingWeights, weights, fixtures, duration = 20, capture = false) {
  const rows = fixtures.map(f => episode(DW, trackingWeights, weights, f, duration, capture));
  return {loss: rows.reduce((s, r) => s + r.loss, 0) / rows.length, count: rows.length,
    successes: rows.filter(r => r.success).length, meanFinalDistance: rows.reduce((s, r) => s + r.maxFinalDistance, 0) / rows.length,
    worstFinalDistance: Math.max(...rows.map(r => r.maxFinalDistance)), meanFinalSpeed: rows.reduce((s, r) => s + r.maxFinalSpeed, 0) / rows.length, rows};
}
function train(DW, trackingWeights, {seed = 1729, generations = 60} = {}) {
  const random = rng(seed), normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
  let mean = Array(5).fill(0), sigma = Array(5).fill(1), best = null;
  const validation = cases(seed + 100000, 12), history = [];
  for (let generation = 0; generation < generations; generation++) {
    const fixtures = cases(seed + generation * 100, 4);
    const candidates = Array.from({length: 24}, () => {
      const weights = mean.map((x, i) => x + normal() * sigma[i]);
      return {weights, loss: evaluate(DW, trackingWeights, weights, fixtures, 16).loss};
    }).sort((a, b) => a.loss - b.loss), elite = candidates.slice(0, 6);
    mean = mean.map((x, i) => .2 * x + .8 * elite.reduce((s, e) => s + e.weights[i], 0) / elite.length);
    sigma = sigma.map((x, i) => Math.max(.015, .3 * x + .7 * Math.sqrt(elite.reduce((s, e) => s + (e.weights[i] - mean[i]) ** 2, 0) / elite.length)));
    if (generation % 5 === 0 || generation === generations - 1) {
      const result = evaluate(DW, trackingWeights, mean, validation);
      if (!best || result.loss < best.result.loss) best = {weights: mean.slice(), result, generation};
      const progress = {generation, loss: result.loss, success: result.successes, distance: result.meanFinalDistance, speed: result.meanFinalSpeed};
      history.push(progress); console.log(JSON.stringify(progress));
    }
  }
  return {best, history};
}
function main() {
  const args = process.argv.slice(2), config = {seed: 1729, generations: 60, tracking: 'tools/pilot-training/marker-example.json', out: 'output/pilot-arrival/seed-1729'};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (!(key in config) || args[i + 1] === undefined) throw Error('Expected --seed, --generations, --tracking or --out with a value');
    config[key] = ['out', 'tracking'].includes(key) ? args[i + 1] : Number(args[i + 1]);
  }
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff - 200000 || !Number.isInteger(config.generations) || config.generations < 1 || config.generations > 999) throw Error('Invalid arrival configuration');
  const trackingPolicy = JSON.parse(fs.readFileSync(config.tracking, 'utf8'));
  if (trackingPolicy.task === 'distant-marker-v1' && trackingPolicy.weights.length === M.COUNT) trackingPolicy.weights = T.transfer(trackingPolicy.weights);
  if (!['moving-marker-v1', 'distant-marker-v1'].includes(trackingPolicy.task) || trackingPolicy.weights.length !== T.COUNT || trackingPolicy.weights.some(x => !Number.isFinite(x))) throw Error('Invalid tracking export');
  const out = path.resolve(config.out); if (fs.existsSync(path.join(out, 'report.json'))) throw Error('Choose a fresh output directory');
  const DW = loadRuntime(), started = Date.now(), result = train(DW, trackingPolicy.weights, config), fixtures = cases(config.seed + 200000, 64);
  const report = {version: 1, config, profile: DW.arcade.profiles[0].name, architecture: [4, 1], parameters: 5, dt: M.DT, policyHz: 20,
    trackingWeights: trackingPolicy.weights, weights: result.best.weights, selectedGeneration: result.best.generation, history: result.history, fixtures,
    sources: Object.fromEntries(['tools/pilot-training/arrival.cjs', 'tools/pilot-training/tracking.cjs', config.tracking, 'experiments/flight-model.js', 'experiments/retail-profiles.js'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),
    baseline: evaluate(DW, trackingPolicy.weights, Array(5).fill(0), fixtures), trained: evaluate(DW, trackingPolicy.weights, result.best.weights, fixtures, 20, true), elapsedSeconds: (Date.now() - started) / 1000};
  fs.mkdirSync(out, {recursive: true}); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'champion.json'), JSON.stringify({version: 1, task: 'arrival-v1', architecture: [4, 1], weights: report.weights, trackingWeights: trackingPolicy.weights}, null, 2) + '\n');
  console.log(JSON.stringify({out, successes: report.trained.successes, distance: report.trained.meanFinalDistance, speed: report.trained.meanFinalSpeed}));
}
if (require.main === module) main();
module.exports = {cases, observe, predict, episode, evaluate, train};
