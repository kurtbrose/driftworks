'use strict';
// A stronger non-neural comparison, fitted on training cases only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const E = require('./executive.cjs');
const C = require('./executive-curriculum.cjs');
const ZERO = Array(E.COUNT).fill(0);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function evaluate(DW, fixtures, at) {
  const rows = fixtures.map(f => E.episode(DW, ZERO, f, 'learned', false, null, C.schedule(f, at)));
  return {score: rows.reduce((s, r) => s + r.score, 0) / rows.length, wins: rows.filter(r => r.outcome === 'win').length,
    losses: rows.filter(r => r.outcome === 'loss').length, timeouts: rows.filter(r => r.outcome === 'timeout').length,
    meanBreakEntries: rows.reduce((s, r) => s + r.breakEntries, 0) / rows.length, rows};
}
function fit(DW, dataset) {
  const training = dataset.pools.train.accepted.map(x => x.fixture)
    .concat(E.cases(dataset.seed + 1000, 12).filter(f => f.scenario !== 'hunted'));
  const candidates = [1, 3, 5, 7].map(at => ({at, result: evaluate(DW, training, at)}));
  candidates.sort((a, b) => b.result.score - a.result.score);
  return {at: candidates[0].at, candidates, trainingFixtures: training,
    method: 'Choose one fixed two-second break time from [1,3,5,7] by mean combat score on eight training challenge cases plus nine ordinary training cases. No validation/test cases used.'};
}
function main() {
  const args = process.argv.slice(2), config = {mode: 'fit', dataset: 'output/pilot-executive-curriculum/dataset.json',
    baseline: 'output/pilot-executive-curriculum/fixed-baseline.json', report: ''};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, ''); if (!(key in config) || args[i + 1] === undefined) throw Error('Invalid timed baseline option');
    config[key] = args[i + 1];
  }
  if (!['fit', 'evaluate'].includes(config.mode)) throw Error('Invalid timed baseline mode');
  const bytes = fs.readFileSync(config.dataset), dataset = JSON.parse(bytes), datasetHash = hash(bytes), DW = E.runtime();
  if (dataset.version !== 2) throw Error('Invalid curriculum dataset');
  if (config.mode === 'fit') {
    if (fs.existsSync(config.baseline)) throw Error('Choose a fresh baseline path');
    const result = {...fit(DW, dataset), datasetHash, sourceHash: hash(fs.readFileSync(__filename))};
    fs.mkdirSync(path.dirname(config.baseline), {recursive: true}); fs.writeFileSync(config.baseline, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({at: result.at, trainingScore: result.candidates[0].result.score})); return;
  }
  const baseline = JSON.parse(fs.readFileSync(config.baseline)), report = JSON.parse(fs.readFileSync(config.report));
  if (baseline.datasetHash !== datasetHash || report.datasetHash !== datasetHash) throw Error('Dataset does not match fitted baseline/report');
  const out = path.join(path.dirname(config.report), 'timed-baseline.json'); if (fs.existsSync(out)) throw Error('Timed baseline report exists');
  const result = {at: baseline.at, datasetHash, baselineHash: hash(fs.readFileSync(config.baseline)), sourceHash: hash(fs.readFileSync(__filename)),
    challenge: evaluate(DW, dataset.pools.challengeTest.accepted.map(x => x.fixture), baseline.at),
    ordinary: evaluate(DW, dataset.ordinaryTest, baseline.at), unseen: evaluate(DW, dataset.unseenTest, baseline.at)};
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({out, at: result.at, suites: Object.fromEntries(['challenge', 'ordinary', 'unseen'].map(k => [k, {score: result[k].score, wins: result[k].wins, losses: result[k].losses}]))}));
}
if (require.main === module) main();
module.exports = {evaluate, fit};
