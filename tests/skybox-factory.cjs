'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const scope = vm.createContext({});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '../experiments/skybox-factory.js'), 'utf8'), scope);
const run = expression => vm.runInContext(expression, scope);
assert.equal(run('sunAdvance(12, 0.03, true, false)'), 12, 'pause freezes time');
assert.equal(run('sunAdvance(12, 4, false, true)'), 12, 'hidden tabs freeze time');
assert.equal(run('sunAdvance(12, 4, false, false)'), 12.05, 'resume does not jump ahead');
assert.equal(run('sunAdvance(12, -1, false, false)'), 12);
for (let t = 0; t < 100; t += 0.1) {
    scope.time = t;
    assert.equal(run('sunVariation(time, 2, 0)'), 1, 'zero amplitude is static');
    assert.ok(run('Math.abs(sunVariation(time, 2, 0.025) - 1) <= 0.0250001'), 'bloom stays bounded');
}
// Trace render commands: animation may change styles but cannot move geometry.
function trace(time, kind) {
    const geometry = [];
    const gradient = {addColorStop() {}};
    const canvas = {width: 512};
    const context = new Proxy({canvas, createRadialGradient: () => gradient}, {
        get(target, key) { return key in target ? target[key] : (...args) => geometry.push([key, ...args]); },
        set(target, key, value) { target[key] = value; return true; }
    });
    scope.ctx = context; scope.kind = kind; scope.time = time;
    run('sunPaint(ctx, kind, time, {motion:1,exposure:1,size:1,offset:0,stars:true}, null)');
    return geometry;
}
for (const kind of ['white', 'tight', 'anamorphic', 'asymmetric', 'spikes', 'hdr', 'surface', 'instrument']) {
    assert.deepEqual(trace(0, kind), trace(38, kind), kind + ' holds disk, cells and star geometry fixed');
}
console.log('PASS skybox factory: bounded brightness, stable geometry, pause, hidden-tab freeze and resume');
