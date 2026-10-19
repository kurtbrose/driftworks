'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const sandbox = {window: {localStorage: {getItem: () => null}}};
vm.createContext(sandbox);
function load(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {filename: file}); }
load('src/engine-audio.js');
const synth = sandbox.window.Driftworks.engineAudio;
assert.equal(synth.presets.length, 8);
assert.equal(sandbox.window.Driftworks.audio, undefined, 'Synth must work without the game facade');
load('src/audio-mixer.js');
const mixerFactory = sandbox.window.Driftworks.audioMixer;
const options = {getMaster: () => 1, setMaster: () => {}};
const first = mixerFactory.create(options);
const second = mixerFactory.create(options);
first.set({engine: .2});
assert.equal(first.get().engine, .2);
assert.equal(second.get().engine, .55, 'Mixer instances must own independent preferences/state');
load('src/audio.js');
assert.equal(sandbox.window.Driftworks.audio.engine, synth, 'Facade must share the synth, not duplicate it');
assert.equal(sandbox.window.Driftworks.audio.status().available, false);
for (const directory of ['', 'tests', 'experiments']) {
  for (const file of fs.readdirSync(path.join(root, directory)).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(root, directory, file), 'utf8');
    const scripts = Array.from(html.matchAll(/<script[^>]*src="([^"]+)"/g), m => m[1].split('?')[0]);
    const facade = scripts.findIndex(src => src.endsWith('/audio.js'));
    if (facade < 0) continue;
    for (const module of ['engine-audio.js', 'audio-mixer.js']) {
      const position = scripts.findIndex(src => src.endsWith('/' + module));
      assert(position >= 0 && position < facade, directory + '/' + file + ': load ' + module + ' before audio.js');
      assert.equal(scripts.filter(src => src.endsWith('/' + module)).length, 1);
    }
  }
}
const lab = fs.readFileSync(path.join(root, 'experiments/engine-lab.html'), 'utf8');
assert(!/src="[^"]*\/(?:audio|audio-mixer)\.js/.test(lab), 'Engine bench must remain independent of game audio');
console.log('PASS audio modules: standalone synth, shared facade identity and all HTML dependency orders');
