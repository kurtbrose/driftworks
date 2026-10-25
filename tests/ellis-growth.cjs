'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../experiments/ellis-growth.html'), 'utf8');
const definition = html.match(/function sample\(t,duration,curve\)\{[^\n]+\}/)[0];
const sample = vm.runInNewContext('(' + definition + ')');
for (const curve of ['linear', 'log']) {
  for (const duration of [8, 16, 30]) {
    assert.equal(sample(-1, duration, curve), 1e-6);
    assert.ok(Math.abs(sample(duration, duration, curve) - 50) < 1e-12);
    assert.ok(Math.abs(sample(duration + 1, duration, curve) - 50) < 1e-12);
    let previous = 0;
    for (let i = 0; i <= 1000; i++) {
      const diameter = sample(i * duration / 1000, duration, curve);
      assert.ok(Number.isFinite(diameter) && diameter >= previous);
      previous = diameter;
    }
  }
}
assert.ok(Math.abs(sample(8, 16, 'log') - Math.sqrt(50e-6)) < 1e-12);
console.log('PASS Ellis growth: microscopic start, 50 m endpoint, monotone finite curves and duration scaling');
