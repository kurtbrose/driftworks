'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const {loadRuntime} = require('../headless.cjs');
const P = require('./policy.cjs');
const S = require('./scenarios.cjs');
const {episode, cases} = S;
function configureRuntime(DW, scorches = false) {
  // Headless fitness never reads burn-mark geometry. Keep collision/damage and
  // the production trace intact; skip only its presentation-side mesh builder.
  if (!scorches) DW.shipPackModels.addScorch = () => {};
  return DW;
}
function evaluate(DW, weights, scenarios) {
  const episodes = scenarios.map(options => episode(DW, weights, options));
  return {score: episodes.reduce((s, e) => s + e.score, 0) / episodes.length,
    wins: episodes.filter(e => e.summary.outcome === 'player-win').length,
    losses: episodes.filter(e => e.summary.outcome === 'opponent-win').length,
    timeouts: episodes.filter(e => e.summary.outcome === 'timeout').length,
    hullDamage: episodes.reduce((s, e) => s + e.summary.metrics.hullDamage, 0),
    shieldDamage: episodes.reduce((s, e) => s + e.summary.metrics.shieldDamage, 0),
    damagingHits: episodes.reduce((s, e) => s + e.summary.metrics.damagingHits, 0),
    kills: episodes.reduce((s, e) => s + e.summary.metrics.kills, 0),
    range: episodes.reduce((s, e) => s + e.summary.metrics.rangeIntegral / e.summary.seconds, 0) / episodes.length,
    shotsPerSecond: episodes.reduce((s, e) => s + e.summary.playerShots / e.summary.seconds, 0) / episodes.length,
    episodes};
}
function niche(result) {
  return `${result.range < 250 ? 'close' : result.range < 600 ? 'medium' : 'far'}-${result.shotsPerSecond < 1 ? 'selective' : 'frequent'}`;
}
function tfPredict(tf, weights, input) {
  return tf.tidy(() => {
    const a = P.INPUTS * P.HIDDEN, b = a + P.HIDDEN, c = b + P.HIDDEN * P.OUTPUTS;
    const hidden = tf.tensor2d([input]).matMul(tf.tensor2d(weights.slice(0, a), [P.INPUTS, P.HIDDEN]))
      .add(tf.tensor1d(weights.slice(a, b))).tanh();
    return Array.from(hidden.matMul(tf.tensor2d(weights.slice(b, c), [P.HIDDEN, P.OUTPUTS]))
      .add(tf.tensor1d(weights.slice(c))).tanh().dataSync());
  });
}
function benchmark(tf, weights) {
  const input = Array.from({length: P.INPUTS}, (_, i) => Math.sin(i));
  const reference = tfPredict(tf, weights, input), actual = P.predict(weights, input);
  const maxError = Math.max(...actual.map((x, i) => Math.abs(x - reference[i])));
  if (maxError > 1e-5) throw new Error('Exported inference differs from TensorFlow.js');
  for (let i = 0; i < 2000; i++) P.predict(weights, input);
  const start = performance.now();
  for (let i = 0; i < 100000; i++) P.predict(weights, input);
  return {parameters: P.COUNT, float32Bytes: P.COUNT * 4,
    plainJsMicroseconds: (performance.now() - start) * 1000 / 100000, maxTensorFlowError: maxError};
}
function save(file, value) {
  fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(file + '.tmp', file);
}
async function main() {
  const args = process.argv.slice(2), config = {mode: 'kill', generations: 100, population: 16,
    duration: 45, cases: 8, heldout: 24, seed: 1729, out: '.pilot-training/kill-v2', resume: false, scorches: false};
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, '');
    if (!(key in config)) throw new Error('Unknown option: ' + args[i]);
    if (key === 'resume' || key === 'scorches') config[key] = true;
    else config[key] = typeof config[key] === 'number' ? Number(args[++i]) : args[++i];
  }
  if (!['kill', 'diverse'].includes(config.mode) || !Number.isInteger(config.generations) || config.generations < 1 ||
      !Number.isInteger(config.population) || config.population < 2 || !Number.isFinite(config.duration) || config.duration < 1 || config.duration > 120 ||
      !Number.isInteger(config.cases) || config.cases < 8 || config.cases > 128 || !Number.isInteger(config.heldout) || config.heldout < 8 || config.heldout > 128 ||
      !Number.isInteger(config.seed) || config.seed < 0 || config.seed > 1000000000 || typeof config.out !== 'string') throw new Error('Invalid training options');
  const tf = require('@tensorflow/tfjs');
  await tf.setBackend('cpu'); await tf.ready();
  const DW = configureRuntime(loadRuntime(), config.scorches), out = path.resolve(config.out);
  fs.mkdirSync(out, {recursive: true});
  const scenarios = cases(DW, config.seed, config.duration, config.cases), checkpoint = path.join(out, 'checkpoint.json');
  let state;
  if (config.resume) {
    state = JSON.parse(fs.readFileSync(checkpoint, 'utf8'));
    if (state.version !== 2) throw new Error('Unsupported checkpoint; v1 used a different reward and fixed duel suite. Use a new output directory.');
    for (const key of ['mode', 'population', 'duration', 'seed', 'cases', 'heldout']) if (state.config[key] !== config[key]) throw new Error('Resume configuration mismatch: ' + key);
    state.elites.forEach(e => P.validate(e.weights));
  } else {
    if (fs.existsSync(checkpoint)) throw new Error('Output already contains a run; use --resume or a new --out');
    const weights = new Array(P.COUNT).fill(0), result = evaluate(DW, weights, scenarios);
    state = {version: 2, config, generation: 0, elites: [{weights, result}], history: [], baseline: result};
    save(checkpoint, state);
  }
  let stopping = false;
  process.on('SIGINT', () => { stopping = true; });
  for (let iteration = 0; iteration < config.generations && !stopping; iteration++) {
    const generation = state.generation + 1;
    // Disjoint seed intervals for training, final selection and held-out tests.
    if (generation >= 10000) throw new Error('Generation seed range exhausted');
    const freshCases = cases(DW, config.seed + generation * 1000, config.duration, config.cases);
    const candidates = state.elites.map(e => ({weights: e.weights, result: evaluate(DW, e.weights, freshCases)}));
    for (let i = 0; i < config.population && !stopping; i++) {
      const parent = state.elites[i % state.elites.length];
      // Seeded Gaussian weight mutation is evolution, not gradient descent.
      // TF owns the numerical mutation; exported CPU inference drives rollouts.
      const weights = tf.tidy(() => Array.from(tf.tensor1d(parent.weights)
        .add(tf.randomNormal([P.COUNT], 0, .08, 'float32', config.seed + generation * config.population + i)).dataSync()));
      candidates.push({weights, result: evaluate(DW, weights, freshCases)});
    }
    if (stopping) break; // Last complete generation remains resumable.
    candidates.sort((a, b) => b.result.score - a.result.score);
    if (config.mode === 'kill') state.elites = candidates.slice(0, Math.max(2, Math.floor(config.population / 4)));
    else {
      const archive = new Map();
      for (const candidate of candidates) if (!archive.has(niche(candidate.result))) archive.set(niche(candidate.result), candidate);
      state.elites = Array.from(archive.values());
    }
    state.generation = generation;
    const best = state.elites[0];
    state.history.push({generation, bestScore: best.result.score, wins: best.result.wins,
      losses: best.result.losses, kills: best.result.kills, hullDamage: best.result.hullDamage,
      shieldDamage: best.result.shieldDamage, damagingHits: best.result.damagingHits,
      scenarios: freshCases, niches: state.elites.map(e => niche(e.result))});
    save(checkpoint, state);
    const {scenarios: sampledCases, ...progress} = state.history.at(-1);
    console.log(JSON.stringify(progress));
  }
  // Final selection uses a separate validation suite, never the test suite.
  const validationCases = cases(DW, config.seed + 20000000, config.duration, config.heldout);
  const finalists = state.elites.map(e => ({weights: e.weights, result: evaluate(DW, e.weights, validationCases)})).sort((a, b) => b.result.score - a.result.score);
  const best = finalists[0];
  const heldoutCases = cases(DW, config.seed + 30000000, config.duration, config.heldout);
  const report = {config, generation: state.generation, architecture: [P.INPUTS, P.HIDDEN, P.OUTPUTS],
    version: 2, benchmark: benchmark(tf, best.weights), baselineTraining: state.baseline,
    baselineHeldout: evaluate(DW, new Array(P.COUNT).fill(0), heldoutCases),
    championValidation: best.result, championHeldout: evaluate(DW, best.weights, heldoutCases),
    archive: state.elites.map(e => ({niche: niche(e.result), score: e.result.score})), history: state.history,
    caveat: 'Diversity is not evidence of fun. The network sees only its current target; target selection is authored. No human perception, health awareness or crew memory.'};
  save(path.join(out, 'report.json'), report);
  save(path.join(out, 'champion.json'), {version: 1, observation: 'pilot-residual-v1', architecture: report.architecture, weights: best.weights});
  state.elites.forEach((elite, i) => save(path.join(out, `pilot-${i}.json`), {version: 1, observation: 'pilot-residual-v1', architecture: report.architecture, weights: elite.weights}));
  const watch = episode(DW, best.weights, heldoutCases[0], true);
  save(path.join(out, 'replay.json'), watch.replay);
  console.log(JSON.stringify({out, generation: state.generation, benchmark: report.benchmark,
    baselineHeldout: {score: report.baselineHeldout.score, wins: report.baselineHeldout.wins, losses: report.baselineHeldout.losses, timeouts: report.baselineHeldout.timeouts},
    championHeldout: {score: report.championHeldout.score, wins: report.championHeldout.wins, losses: report.championHeldout.losses, timeouts: report.championHeldout.timeouts}}));
}
if (require.main === module) main().catch(error => {console.error(error); process.exitCode = 1;});
module.exports = {episode, evaluate, cases, niche, tfPredict, benchmark, replay: S.replay, configureRuntime};
