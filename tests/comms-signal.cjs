const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
function load(code){const scope={window:{Driftworks:{}}};vm.runInNewContext(code,scope);return scope.window.Driftworks.mumble;}
const api=load(fs.readFileSync('experiments/mumble.js','utf8'));
// Frozen hashes of the pre-refactor radio output (silence isolates radio noise).
const hashes=["de2a2bc3c0a8acd38631a2f63f5f86d9dfc7fd963900e231e8deae7ee976c82e","37bb480249b0e5f52ab2069d458f239ef85e382e8bcde00d3325537b44da6b7e","0d76d31c384a733cd6f9673b958a4db55bd60c4915e8f2a7d04cca73f417e79d","5341b5071557f202f85d3844b8577a5d1dec0e5bdeaff0cb705ba7a2c72d2c24","b93d38e88f4b09162940a6d4d271f31ebe1401fa81b25cec303fbe137f8c7efe","03c8112e7474a077ef1b023378d6510a3675ad5af0e0a7e3bf9a3a51815b7486","bbd6a3bf818ec134c04b91c4e24f3aa328a4ce9dc524bd0154a3455030924f31","f21341fab64077e05ea63b640441c067ca177990f14f37382263d8b0db36e1b6","201584ddf6aee7ae001304bb37cf8dcc937d4044819d3935ed4cf5767da7d8ed","dafcf6a8857258d23f798fb607a9ca1f426a277575d84991318cb51a9c76bc2f","d2c5b1d4472c86f6317c12469168f48d1b0f4af8b46d699e02c56e8d0f96cf99","b181e1f2ddf567b9f9e893437f3371a88bc6239c3fd58838d444d31052735cf0"];
const rate=4000, speech=new Float32Array(rate*10);
let middleBursts=0,cleanLines=0;
for(let seed=1;seed<=12;seed++){
  const settings={mode:'radio',seed,effects:.45};
  const pattern=api.radioNoise(speech.length,rate,settings);
  const shared=api.transmit(speech,rate,{...settings,noise:pattern});
  assert.equal(crypto.createHash('sha256').update(Buffer.from(shared.samples.buffer)).digest('hex'),hashes[seed-1],'shared input must preserve existing audio exactly');
  assert.equal(crypto.createHash('sha256').update(Buffer.from(api.transmit(speech,rate,settings).samples.buffer)).digest('hex'),hashes[seed-1],'default radio path unchanged');
  const values=[];for(let i=0;i<shared.samples.length;i++)values.push(api.radioNoiseAt(pattern,i/rate).strength);
  assert.ok(values.slice(0,rate*.16).some(v=>v>0),'opening squelch');
  assert.ok(values.slice(rate*10.16).some(v=>v>0),'closing squelch');
  if(pattern.bursts.length)middleBursts++;else cleanLines++;
  assert.ok(values.every(v=>v>=0&&v<=1));
  assert.equal(api.radioNoiseAt(pattern,-.1).strength,0);assert.equal(api.radioNoiseAt(pattern,pattern.duration).strength,0);
  const zero=api.radioNoise(speech.length,rate,{...settings,effects:0});
  assert.equal(api.radioNoiseAt(zero,.03).strength,0);
  assert.equal(api.radioNoise(speech.length,rate,{...settings,staticBursts:false}).bursts.length,0);
  const local=api.transmit(speech,rate,{mode:'local',noise:pattern});assert.equal(local.samples,speech);
}
const originalEdges=api.radioNoise(speech.length,rate,{seed:7});
const extended=api.radioNoise(speech.length,rate,{seed:7,edgeScale:2.5});
assert.equal(extended.lead,Math.round(.4*rate));
assert.equal(extended.closeLatch.duration,originalEdges.closeLatch.duration*2.5);
assert.equal(extended.openLatch.steps[0].gain,originalEdges.openLatch.steps[0].gain);
assert.equal(extended.bursts.length,originalEdges.bursts.length);
const longer=api.transmit(speech,rate,{mode:'radio',noise:extended});
assert.equal(longer.speechOffset,.4);
assert.equal(longer.duration,11);
assert.equal(api.radioNoiseAt(extended,extended.duration).strength,0);
assert.ok(middleBursts>0&&cleanLines>0,'existing mixture of clean lines and occasional bursts');
console.log('PASS shared radio noise: byte-identical existing audio, opening/closing gates, occasional middle bursts, clean/local bypass');

// Frozen synthesis output before hoisting harmonic/formant calculations. Cover
// every preset and synthesis style, including nonzero nasal and creak effects.
const synthesis = JSON.parse(fs.readFileSync('tests/fixtures/mumble-pcm.json', 'utf8'));
for (const entry of synthesis.cases) {
  const plan = api.analyze(synthesis.text, api.presets[entry.name]);
  const pcm = api.render(plan, synthesis.sampleRate, {style: entry.style});
  assert.equal(crypto.createHash('sha256').update(Buffer.from(pcm.buffer)).digest('hex'), entry.hash,
    'synthesis samples unchanged: ' + entry.name + ' / ' + entry.style);
}
console.log('PASS synthesis PCM: all presets and three styles preserve existing samples exactly');
