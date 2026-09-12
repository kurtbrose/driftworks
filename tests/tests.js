(function () {
  'use strict';

  var sim = window.Driftworks.sim;
  var tests = [];

  function test(name, fn) {
    tests.push({ name: name, fn: fn });
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  function assertClose(actual, expected, epsilon) {
    var limit = epsilon || 0.000001;
    assert(Math.abs(actual - expected) <= limit, 'Expected ' + actual + ' to be within ' + limit + ' of ' + expected);
  }

  test('seeded RNG produces deterministic output', function () {
    var a = sim.createRng(1234);
    var b = sim.createRng(1234);
    var valuesA = [a(), a(), a(), a()];
    var valuesB = [b(), b(), b(), b()];
    assert(JSON.stringify(valuesA) === JSON.stringify(valuesB), 'Matching seeds should match exactly');
    assertClose(valuesA[0], 0.07329497812315822);
  });

  test('fixed-step advancement is deterministic', function () {
    var world = sim.issueMoveOrder(sim.selectShips(sim.createInitialWorld(), ['miner-01']), { x: 100, y: -90 });
    var a = sim.stepWorld(sim.stepWorld(world, 1 / 30), 1 / 30);
    var b = sim.stepWorld(sim.stepWorld(world, 1 / 30), 1 / 30);
    assert(JSON.stringify(a) === JSON.stringify(b), 'Repeated stepping from the same state should match');
    assert(a.elapsedSeconds > world.elapsedSeconds, 'Simulation clock should advance');
  });

  test('move orders transition to arrival', function () {
    var world = sim.issueMoveOrder(sim.selectShips(sim.createInitialWorld(), ['escort-01']), { x: 240, y: -125 });
    var guard = 0;
    var escort = null;
    while (guard < 300) {
      escort = findShip(world, 'escort-01');
      if (escort.order.kind === 'idle') break;
      world = sim.stepWorld(world, 1 / 30);
      guard += 1;
    }
    escort = findShip(world, 'escort-01');
    assert(escort.order.kind === 'idle', 'Escort should arrive and clear its move order');
    assertClose(escort.position.x, 240);
    assertClose(escort.position.y, -125);
  });

  test('save serialization round-trips world state', function () {
    var world = sim.issueMoveOrder(sim.selectShips(sim.createInitialWorld(), ['tug-01']), { x: -40, y: 90 });
    var restored = sim.deserializeWorld(sim.serializeWorld(world));
    assert(JSON.stringify(restored) === JSON.stringify(world), 'Restored world should match saved world');
  });

  test('unsupported save versions are rejected', function () {
    var rejected = false;
    try {
      sim.deserializeWorld(JSON.stringify({ version: 99, world: sim.createInitialWorld() }));
    } catch (error) {
      rejected = /Unsupported Driftworks save version/.test(error.message);
    }
    assert(rejected, 'Unsupported versions should throw a useful error');
  });

  run();

  function findShip(world, id) {
    return world.ships.filter(function (ship) {
      return ship.id === id;
    })[0];
  }

  function run() {
    var summary = document.querySelector('#summary');
    var results = document.querySelector('#results');
    var passed = 0;

    tests.forEach(function (current) {
      var item = document.createElement('li');
      try {
        current.fn();
        item.className = 'pass';
        item.textContent = 'PASS: ' + current.name;
        passed += 1;
      } catch (error) {
        item.className = 'fail';
        item.textContent = 'FAIL: ' + current.name;
        var detail = document.createElement('pre');
        detail.textContent = error.stack || String(error);
        item.appendChild(detail);
        console.error(current.name, error);
      }
      results.appendChild(item);
    });

    var failed = tests.length - passed;
    summary.className = failed === 0 ? 'pass' : 'fail';
    summary.textContent = failed === 0 ? 'All ' + passed + ' browser-native tests passed.' : failed + ' of ' + tests.length + ' browser-native tests failed.';
  }
})();
