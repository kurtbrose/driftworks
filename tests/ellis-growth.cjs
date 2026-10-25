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
const mapping = html.match(/function mapped\(p,side,scale\)\{[^\n]+\}/)[0];
// Use production metres/unit, not the sky-only study's former 60 m stub.
const mapped = vm.runInNewContext('(function(){const units=10000/600;return (' + mapping + ');})()');
for (const diameter of [.2, 1, 25, 50]) {
  const scale = 600 / diameter, units = 10000 / 600;
  for (const side of [0, 1]) {
    const eye = mapped([100, 0, 0], side, scale);
    const point = mapped([75, 6, -4], side, scale);
    assert.ok(Math.abs(Math.hypot(...point.map((v,i)=>(v-eye[i])*units/scale))-Math.hypot(25,6,4)) < 1e-9);
    assert.ok(Math.abs((point[0]*units-side*12000)/scale-75)<1e-9);
  }
}
assert.ok(html.includes('DW.flightHud.mount('));
assert.ok(html.includes('flightHud.render('));
assert.ok(html.includes('DW.training.cycle(snapshot.combat)'));
assert.ok(!html.includes("getContext('2d')"),'Growth study must use the production HUD, not a replacement overlay');
console.log('PASS Ellis growth integration: real flight HUD mount/render, real target cycling, no custom HUD canvas');
