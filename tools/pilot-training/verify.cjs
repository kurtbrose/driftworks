'use strict';
const assert = require('node:assert/strict');
const tf = require('@tensorflow/tfjs');
const P = require('./policy.cjs');
const {benchmark, tfPredict} = require('./train.cjs');
(async () => {
  await tf.setBackend('cpu'); await tf.ready();
  const weights = Array.from({length: P.COUNT}, (_, i) => Math.sin(i) * .2);
  const before = tf.memory().numTensors;
  for (let i = 0; i < 100; i++) tfPredict(tf, weights, Array(P.INPUTS).fill(i / 100));
  assert.equal(tf.memory().numTensors, before, 'reference inference must release tensors');
  console.log(benchmark(tf, weights));
})().catch(error => { console.error(error); process.exitCode = 1; });
