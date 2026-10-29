'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {performance} = require('node:perf_hooks');
const E = require('./executive.cjs');
const INPUTS = 13, COUNT = INPUTS + 1, ZERO = Array(E.COUNT).fill(0);
const clamp = x => Math.max(0, Math.min(1, x));
function rng(seed) {let x = seed >>> 0; return () => {x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296;};}
function validate(weights) {
  if (!Array.isArray(weights) || weights.length !== COUNT || weights.some(x => !Number.isFinite(x))) throw Error('Invalid curriculum weights');
}
function observe({own, g, state, seconds}) {
  return E.observe(own, g, state, seconds).concat([
    clamp((seconds - state.since) / 5), Number(state.entries > 0),
    state.entries > 0 && state.mode === 'attack' ? clamp((seconds - state.since) / 10) : 0
  ]);
}
function predict(weights, input) {return Math.tanh(weights[INPUTS] + input.reduce((s, x, i) => s + x * weights[i], 0));}
function choose(weights, context) {
  const value = predict(weights, observe(context));
  return value > .2 ? 'break' : value < -.2 ? 'attack' : context.state.mode;
}
function episode(DW, weights, fixture, capture = false) {
  validate(weights);
  const result = E.episode(DW, ZERO, fixture, 'learned', capture, null, context => choose(weights, context));
  if (capture) result.replay.policy = {version: 2, task: 'tactical-curriculum-v2', architecture: [INPUTS, 1], weights};
  return result;
}
function evaluate(DW, weights, fixtures) {
  const rows = fixtures.map(f => episode(DW, weights, f)), mean = key => rows.reduce((s, r) => s + r[key], 0) / rows.length;
  return {score: mean('score'), wins: rows.filter(r => r.outcome === 'win').length, losses: rows.filter(r => r.outcome === 'loss').length,
    timeouts: rows.filter(r => r.outcome === 'timeout').length, meanBreakEntries: mean('breakEntries'), meanSeconds: mean('seconds'), rows};
}
function schedule(fixture, at) {return Array.from({length: Math.ceil(fixture.duration * 5)}, (_, i) => i / 5 >= at && i / 5 < at + 2 ? 'break' : 'attack');}
function mine(DW, seed, wanted = 8, candidates = 64, duration = 25) {
  const fixtures = E.cases(seed, candidates * 4, duration).filter(f => f.scenario === 'hunted');
  const accepted = [], audit = [];
  for (const fixture of fixtures) {
    const attack = E.episode(DW, ZERO, fixture, 'attack');
    if (attack.outcome === 'win') {audit.push({fixture, attack: {outcome: attack.outcome, score: attack.score}, accepted: false}); continue;}
    const trials = [1, 3, 5, 7].map(at => {
      const r = E.episode(DW, ZERO, fixture, 'learned', false, null, schedule(fixture, at));
      return {at, outcome: r.outcome, score: r.score};
    });
    const best = trials.slice().sort((a, b) => b.score - a.score)[0];
    const useful = best.outcome === 'win' && best.score > attack.score + .75;
    audit.push({fixture, attack: {outcome: attack.outcome, score: attack.score}, trials, accepted: useful});
    if (useful) accepted.push({fixture, at: best.at, attackScore: attack.score, breakScore: best.score});
    if (accepted.length === wanted) break;
  }
  if (accepted.length < wanted) throw Error(`Only ${accepted.length}/${wanted} useful-break cases from ${fixtures.length}; retain audit and increase candidate cap explicitly`);
  return {seed, wanted, accepted, audit};
}
function key(f) {return [f.scenario, f.seed, f.skill, f.opponentStyle].join(':');}
function assertDisjoint(groups) {
  const seen = new Map();
  for (const [name, fixtures] of Object.entries(groups)) for (const f of fixtures) {
    if (seen.has(key(f)) && seen.get(key(f)) !== name) throw Error('Dataset overlap: ' + key(f));
    seen.set(key(f), name);
  }
}
function buildDataset(DW, seed = 40421) {
  const pools = {};
  for (const [name, offset] of [['train', 0], ['validation', 10000], ['challengeTest', 20000]]) {
    pools[name] = mine(DW, seed + offset);
    console.log(JSON.stringify({mined: name, accepted: pools[name].accepted.length, examined: pools[name].audit.length}));
  }
  const validationOrdinary = E.cases(seed + 30000, 8), ordinaryTest = E.cases(seed + 40000, 32), unseenTest = E.cases(seed + 50000, 32, 25, true);
  assertDisjoint({train: pools.train.audit.map(x => x.fixture), validation: pools.validation.audit.map(x => x.fixture),
    challengeTest: pools.challengeTest.audit.map(x => x.fixture), validationOrdinary, ordinaryTest, unseenTest});
  return {version: 2, seed, method: 'Useful-break pools select hunted cases where attack fails and one predeclared two-second break wins by >0.75 score. All splits mined separately before training; ordinary/unseen tests are unfiltered.',
    pools, validationOrdinary, ordinaryTest, unseenTest};
}
function demonstrations(DW, dataset) {
  const rows = [];
  const eligible = c => c.state.mode === 'attack' ? c.seconds - c.state.since >= 1
    : c.seconds - c.state.since >= 2 && c.seconds - c.state.since < 5 && c.g.range < 550;
  for (const example of dataset.pools.train.accepted) {
    E.episode(DW, ZERO, example.fixture, 'learned', false, null, context => {
      const label = context.seconds >= example.at && context.seconds < example.at + 2 ? 'break' : 'attack';
      // Forced commitment frames are not choices; otherwise the many mandatory
      // break frames swamp the sparse decisions that actually initiate a break.
      if (eligible(context)) rows.push({input: observe(context), label: label === 'break' ? 1 : 0, fixture: key(example.fixture)});
      return label;
    });
  }
  // Include successful ordinary attacks; no validation/test labels enter this fit.
  const ordinary = E.cases(dataset.seed + 1000, 12).filter(f => f.scenario !== 'hunted');
  for (const fixture of ordinary) E.episode(DW, ZERO, fixture, 'attack', false, null, context => {
    if (eligible(context)) rows.push({input: observe(context), label: 0, fixture: key(fixture)}); return 'attack';
  });
  return rows;
}
function fit(rows, epochs = 500) {
  let weights = Array(COUNT).fill(0);
  const positives = rows.filter(r => r.label).length, negatives = rows.length - positives;
  if (!positives || !negatives) throw Error('Demonstrations need attack and break labels');
  // Weighted logistic initialization from combat-verified demonstrations.
  // Combat fitness, not this classification loss, chooses the final policy.
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradient = Array(COUNT).fill(0);
    for (const row of rows) {
      const x = row.input.concat([1]), z = x.reduce((s, v, i) => s + v * weights[i], 0);
      const p = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
      const balance = row.label ? rows.length / (2 * positives) : rows.length / (2 * negatives);
      for (let i = 0; i < COUNT; i++) gradient[i] += (p - row.label) * x[i] * balance / rows.length;
    }
    weights = weights.map((w, i) => w - .2 * (gradient[i] + .0005 * w));
  }
  return weights;
}
function train(DW, dataset, {seed = 31415, generations = 20, population = 16, out}) {
  const random = rng(seed), normal = () => Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
  const validation = dataset.pools.validation.accepted.map(x => x.fixture).concat(dataset.validationOrdinary);
  const demoRows = demonstrations(DW, dataset), imitation = fit(demoRows);
  const ordinaryTraining = E.cases(dataset.seed + 1000, 12).filter(f => f.scenario !== 'hunted')
    .concat(Array.from({length: generations}, (_, i) => E.cases(dataset.seed + 2000 + i * 100, 3)).flat());
  assertDisjoint({train: dataset.pools.train.audit.map(x => x.fixture).concat(ordinaryTraining),
    validation: dataset.pools.validation.audit.map(x => x.fixture).concat(dataset.validationOrdinary),
    challengeTest: dataset.pools.challengeTest.audit.map(x => x.fixture), ordinaryTest: dataset.ordinaryTest, unseenTest: dataset.unseenTest});
  const seeds = [Array(COUNT).fill(0), imitation];
  let best = seeds.map(weights => ({weights, result: evaluate(DW, weights, validation), generation: -1})).sort((a, b) => b.result.score - a.result.score)[0];
  let elites = seeds, mean = imitation.slice(), sigma = Array(COUNT).fill(.8);
  const history = [], trainingSuites = [], hard = dataset.pools.train.accepted;
  for (let generation = 0; generation < generations; generation++) {
    const shuffled = hard.map(x => ({x, order: random()})).sort((a, b) => a.order - b.order);
    const fixtures = shuffled.slice(0, 3).map(x => x.x.fixture).concat(E.cases(dataset.seed + 2000 + generation * 100, 3));
    trainingSuites.push(fixtures);
    const candidates = elites.map(weights => ({weights, result: evaluate(DW, weights, fixtures)}));
    for (let i = 0; i < population; i++) {
      const parent = i % 4 === 0 ? mean : elites[i % elites.length];
      const weights = parent.map((x, j) => x + normal() * sigma[j] * (i % 8 === 0 ? 2 : 1));
      candidates.push({weights, result: evaluate(DW, weights, fixtures)});
    }
    candidates.sort((a, b) => b.result.score - a.result.score);
    elites = candidates.slice(0, 4).map(x => x.weights);
    mean = mean.map((x, i) => .2 * x + .8 * elites.reduce((s, w) => s + w[i], 0) / elites.length);
    sigma = sigma.map((x, i) => Math.max(.06, .3 * x + .7 * Math.sqrt(elites.reduce((s, w) => s + (w[i] - mean[i]) ** 2, 0) / elites.length)));
    if (generation % 4 === 0 || generation === generations - 1) {
      for (const weights of elites.concat([mean])) {
        const result = evaluate(DW, weights, validation);
        if (result.score > best.result.score) best = {weights: weights.slice(), result, generation};
      }
      const progress = {generation, score: best.result.score, wins: best.result.wins, losses: best.result.losses, breaks: best.result.meanBreakEntries};
      history.push(progress); console.log(JSON.stringify(progress));
      if (out) fs.writeFileSync(path.join(out, 'checkpoint.json'), JSON.stringify({version: 2, seed, generation, best, history}, null, 2) + '\n');
    }
  }
  return {best, history, trainingSuites, demonstrationRows: demoRows.length, demonstrationBreakRows: demoRows.filter(x => x.label).length,
    initialValidation: {zero: evaluate(DW, seeds[0], validation), imitation: evaluate(DW, imitation, validation)}};
}
function compare(DW, weights, fixtures) {
  return {learned: evaluate(DW, weights, fixtures), ...Object.fromEntries(['attack', 'break', 'authored'].map(selector => [selector, E.evaluate(DW, ZERO, fixtures, selector)]))};
}
function fingerprint() {
  return Object.fromEntries(['tools/pilot-training/executive-curriculum.cjs', 'tools/pilot-training/executive.cjs', 'tools/pilot-training/scenarios.cjs',
    ...require('../script-manifest.cjs').files('headless')].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
}
function main() {
  const args = process.argv.slice(2), config = {mode: 'train', seed: 31415, generations: 20, population: 16,
    dataset: 'output/pilot-executive-curriculum/dataset.json', out: 'output/pilot-executive-curriculum/seed-31415'};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, ''); if (!(key in config) || args[i + 1] === undefined) throw Error('Invalid curriculum option');
    config[key] = ['seed', 'generations', 'population'].includes(key) ? Number(args[i + 1]) : args[i + 1];
  }
  if (!['mine', 'train'].includes(config.mode) || !Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff - 100000 || !Number.isInteger(config.generations) || config.generations < 1 || config.generations > 100 || !Number.isInteger(config.population) || config.population < 8 || config.population > 128) throw Error('Invalid curriculum configuration');
  const DW = E.runtime(), sources = fingerprint(), started = performance.now();
  if (config.mode === 'mine') {
    if (fs.existsSync(config.dataset)) throw Error('Choose a fresh dataset path');
    const dataset = buildDataset(DW, config.seed); dataset.sources = sources;
    fs.mkdirSync(path.dirname(config.dataset), {recursive: true}); fs.writeFileSync(config.dataset, JSON.stringify(dataset, null, 2) + '\n');
    console.log(JSON.stringify({dataset: config.dataset, seconds: (performance.now() - started) / 1000})); return;
  }
  const out = path.resolve(config.out); if (fs.existsSync(path.join(out, 'checkpoint.json')) || fs.existsSync(path.join(out, 'report.json'))) throw Error('Choose a fresh output directory');
  const datasetBytes = fs.readFileSync(config.dataset), datasetHash = crypto.createHash('sha256').update(datasetBytes).digest('hex');
  const dataset = JSON.parse(datasetBytes);
  if (dataset.version !== 2) throw Error('Invalid curriculum dataset');
  fs.mkdirSync(out, {recursive: true});
  const result = train(DW, dataset, {...config, out});
  assert.deepEqual(fingerprint(), sources, 'Sources changed during training; keep checkpoint but do not publish mixed-source results');
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(config.dataset)).digest('hex'), datasetHash, 'Dataset changed during training');
  const report = {version: 2, config, sources, datasetHash,
    architecture: [INPUTS, 1], parameters: COUNT, policyHz: 5, controllerHz: 120, weights: result.best.weights,
    selectedGeneration: result.best.generation, history: result.history, trainingSuites: result.trainingSuites, demonstrationRows: result.demonstrationRows,
    demonstrationBreakRows: result.demonstrationBreakRows, initialValidation: result.initialValidation, validation: result.best.result,
    challenge: compare(DW, result.best.weights, dataset.pools.challengeTest.accepted.map(x => x.fixture)),
    ordinary: compare(DW, result.best.weights, dataset.ordinaryTest), unseen: compare(DW, result.best.weights, dataset.unseenTest),
    elapsedSeconds: (performance.now() - started) / 1000};
  const watch = episode(DW, report.weights, dataset.pools.challengeTest.accepted[0].fixture, true);
  const {replay, ...original} = watch; assert.deepEqual(E.replay(DW, replay), original);
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'champion.json'), JSON.stringify({version: 2, task: 'tactical-curriculum-v2', architecture: [INPUTS, 1], weights: report.weights}, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'replay.json'), JSON.stringify(replay, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'maneuver-events.json'), JSON.stringify(E.maneuverEvents(replay.decisions), null, 2) + '\n');
  console.log(JSON.stringify({out, seconds: report.elapsedSeconds, scores: Object.fromEntries(['challenge', 'ordinary', 'unseen'].map(k => [k, {learned: report[k].learned.score, attack: report[k].attack.score, wins: report[k].learned.wins, breaks: report[k].learned.meanBreakEntries}]))}));
}
if (require.main === module) main();
module.exports = {INPUTS, COUNT, validate, observe, predict, choose, episode, evaluate, schedule, mine, key, assertDisjoint, buildDataset, demonstrations, fit, train, compare, fingerprint};
