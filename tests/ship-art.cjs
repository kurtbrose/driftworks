'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('./helpers/shared-runtime.cjs').install();
const DW = global.Driftworks;
const game = DW.game;

// Captured before extraction: drawing-command parity, not visual acceptance.
function recorder() {
  const calls = [];
  const graphics = {scale: {x: 1, y: 1}};
  for (const name of ['clear', 'lineStyle', 'beginFill', 'endFill', 'moveTo', 'lineTo',
    'drawPolygon', 'drawCircle', 'drawRect', 'drawRoundedRect', 'drawEllipse', 'arc', 'closePath']) {
    graphics[name] = (...args) => calls.push([name, ...args]);
  }
  return {graphics, calls};
}

const captured = {};
for (const type of ['escort', 'shuttle', 'tug', 'mothership']) {
  for (const zoom of [1, 16, 64]) {
    const ship = DW.sim.createShip('paint-fixture', 'Fixture', type, 10, 20, 30);
    ship.rotation = .7;
    ship.previousVelocity = {x: 0, y: 0};
    ship.velocity = {x: .6, y: -.2};
    ship.order = {kind: 'move', target: {x: 90, y: -40}};
    const {graphics, calls} = recorder();
    game.paintShip(graphics, ship, true, 3.25, undefined, 1, zoom);
    captured[type + '/' + zoom] = calls;
  }
}
for (const deployment of [0, .5, 1]) {
  const {graphics, calls} = recorder();
  game.paintRaisedPlatform(graphics, deployment, true, 3.25, 64, .7, {x: .2, y: -.3, z: .93});
  captured['platform/' + deployment] = calls;
}
const hashes = Object.fromEntries(Object.entries(captured).map(([name, calls]) => {
  assert.ok(calls.length, name + ' must draw');
  assert.ok(calls.flat(Infinity).every(value => typeof value !== 'number' || Number.isFinite(value)), name + ' stays finite');
  return [name, crypto.createHash('sha256').update(JSON.stringify(calls)).digest('hex')];
}));
const fixture = path.join(__dirname, 'fixtures/ship-art.json');
assert.deepEqual(hashes, JSON.parse(fs.readFileSync(fixture, 'utf8')));
for (const name of ['paintShip', 'paintRaisedPlatform', 'enginePlumeGeometry', 'semanticScale']) {
  assert.equal(game[name], DW.shipArt[name], 'Existing game API delegates ' + name);
}
console.log('PASS ship artwork: craft, zoom, order lines, thrusters and platform drawing parity');
