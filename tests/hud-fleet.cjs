'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {loadRuntime} = require('../tools/headless.cjs');

function fixture(source = fs.readFileSync(path.join(__dirname, '../src/hud.js'), 'utf8')) {
  const DW = loadRuntime(), nodes = new Map(), metrics = {shipReads: 0};
  class Element {
    constructor() {
      this.children = []; this.handlers = {}; this.textContent = '';
      this.dataset = new Proxy({}, {get(target, key) {
        if (key === 'ship') metrics.shipReads++;
        return target[key];
      }});
    }
    appendChild(child) { this.children.push(child); child.parent = this; }
    remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    setAttribute() {}
    closest(selector) { return selector === '[data-ship]' && this.dataset.ship ? this : null; }
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, new Element());
      return nodes.get(selector);
    }
    querySelectorAll() { return []; }
  }
  const host = new Element(), selected = [];
  const document = {querySelector: selector => host.querySelector(selector), createElement: () => new Element()};
  vm.runInNewContext(source, {window: {Driftworks: DW}, document});
  const hud = DW.hud.create(host, {
    onSelectShip: id => selected.push(id), getTimeScale: () => 1,
    getBackgroundOptions: () => [], getBackgroundSettings: () => ({image: 'black', brightness: 0})
  });
  const stats = {contacts: 'quiet', entityCount: 4, fps: 60, stressEnabled: false};
  return {DW, host, selected, metrics, fleet: host.querySelector('[data-role="fleet"]'),
    update: world => hud.update(world, stats)};
}

function run() {
  const app = fixture();
  let world = JSON.parse(JSON.stringify(app.DW.sim.createInitialWorld(42)));
  app.update(world);
  const original = app.fleet.children.slice();
  assert.deepEqual(original.map(button => button.dataset.ship), world.ships.map(ship => ship.id));
  app.update(world);
  assert.deepEqual(app.fleet.children, original, 'Unchanged frames reuse button nodes');

  world = JSON.parse(JSON.stringify(world));
  world.ships.reverse();
  world.ships.find(ship => ship.id === 'escort-01').name = 'Renamed escort';
  world.selectedShipIds = ['escort-01'];
  app.update(world);
  assert.deepEqual(app.fleet.children, original, 'Existing buttons keep their order across replacement worlds');
  const escort = original.find(button => button.dataset.ship === 'escort-01');
  assert.match(escort.textContent, /^Renamed escort/);
  assert.equal(escort.dataset.active, 'true');
  app.fleet.handlers.click({target: escort});
  assert.deepEqual(app.selected, ['escort-01'], 'Delegated selection still uses the ship ID');

  world.ships = world.ships.filter(ship => ship.id !== 'escort-01');
  world.selectedShipIds = [];
  app.update(world);
  assert.equal(escort.parent, null, 'Removed ships release their buttons');
  world.ships.push({...world.ships.find(ship => ship.type === 'escort'), id: 'escort-01', name: 'Replacement'});
  app.update(world);
  const replacement = app.fleet.children.at(-1);
  assert.equal(replacement.dataset.ship, 'escort-01');
  assert.notEqual(replacement, escort, 'Reintroduced IDs get a fresh button');
  assert.match(replacement.textContent, /^Replacement/);

  const template = world.ships.find(ship => ship.type === 'escort');
  for (const count of [128, 256]) {
    world.ships = Array.from({length: count}, (_, i) => ({...template, id: 'fleet-' + i}));
    app.update(world);
    app.metrics.shipReads = 0;
    app.update(world);
    assert.ok(app.metrics.shipReads <= count * 3, 'Steady-state button lookup work must grow linearly');
    assert.equal(app.fleet.children.length, count);
  }
  world.ships = [];
  app.update(world);
  assert.equal(app.fleet.children.length, 0, 'An empty fleet removes all stale buttons');
  console.log('PASS fleet HUD: button reuse/order, replacement worlds, labels, selection, removal/reintroduction and linear lookup work');
}
module.exports = {fixture};
if (require.main === module) run();
