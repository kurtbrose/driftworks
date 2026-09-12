(function () {
  'use strict';

  var sim = window.Driftworks.sim;
  var game = window.Driftworks.game;
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

  test('acceleration limits sudden direction reversal', function () {
    var world = sim.selectShips(sim.createInitialWorld(), ['miner-01']);
    var miner = findShip(world, 'miner-01');
    miner.position = { x: 0, y: 0 };
    miner.previousPosition = { x: 0, y: 0 };
    miner.velocity = { x: miner.speed, y: 0 };
    world = sim.issueMoveOrder(world, { x: -300, y: 0 });
    world = sim.stepWorld(world, 1 / 30);
    miner = findShip(world, 'miner-01');
    assert(miner.velocity.x > 0, 'Miner should not instantly reverse horizontal velocity');
  });

  test('rotation limits sudden in-place facing changes', function () {
    var world = sim.selectShips(sim.createInitialWorld(), ['escort-01']);
    var escort = findShip(world, 'escort-01');
    escort.position = { x: 0, y: 0 };
    escort.previousPosition = { x: 0, y: 0 };
    escort.velocity = { x: 0, y: escort.speed };
    escort.rotation = 0;
    escort.turnRate = 1.5;
    world = sim.issueMoveOrder(world, { x: 0, y: 300 });
    world = sim.stepWorld(world, 1 / 30);
    escort = findShip(world, 'escort-01');
    assert(escort.rotation > 0, 'Escort should begin rotating toward its travel direction');
    assert(escort.rotation <= escort.turnRate / 30 + 0.000001, 'Escort should not exceed max turn rate in one tick');
  });

  test('rotateToward uses the shortest wrapped angle', function () {
    var current = Math.PI - 0.02;
    var target = -Math.PI + 0.02;
    var next = sim.rotateToward(current, target, 0.03);
    assert(next > current, 'Wrapped target should rotate through +pi instead of the long way around');
    assertClose(sim.angleDelta(next, target), 0.01);
  });

  test('miners extract ore from asteroid nodes', function () {
    var world = sim.issueMineOrder(sim.selectShips(sim.createInitialWorld(), ['miner-01']), 'ast-ceres-01');
    var initialOre = findAsteroid(world, 'ast-ceres-01').ore;
    var guard = 0;
    while (findShip(world, 'miner-01').cargo <= 0 && guard < 500) {
      world = sim.stepWorld(world, 1 / 30);
      guard += 1;
    }
    assert(findShip(world, 'miner-01').cargo > 0, 'Miner should carry extracted ore');
    assert(findAsteroid(world, 'ast-ceres-01').ore < initialOre, 'Asteroid ore should decrease');
  });

  test('miners return cargo to mothership storage', function () {
    var world = sim.issueMineOrder(sim.selectShips(sim.createInitialWorld(), ['miner-01']), 'ast-ceres-01');
    var guard = 0;
    while (world.mothership.storage.ore <= 0 && guard < 1200) {
      world = sim.stepWorld(world, 1 / 30);
      guard += 1;
    }
    assert(world.mothership.storage.ore > 0, 'Mothership should receive ore');
    assert(findShip(world, 'miner-01').cargo === 0, 'Miner cargo should empty after deposit');
  });

  test('order line local vector rotates back to world target direction', function () {
    var position = { x: -180, y: -90 };
    var target = { x: 220, y: -240 };
    var rotation = Math.PI * 0.63;
    var local = game.worldVectorToShipLocalLine(position, target, rotation);
    var cos = Math.cos(rotation);
    var sin = Math.sin(rotation);
    var worldX = local.x * cos - local.y * sin;
    var worldY = local.x * sin + local.y * cos;
    assertClose(worldX, target.x - position.x);
    assertClose(worldY, target.y - position.y);
  });

  test('engine plume mixes fixed maneuvering thrusters', function () {
    var radius = 14;
    var forward = game.enginePlumeGeometry(20, 0, 0, 100, radius, false);
    var braking = game.enginePlumeGeometry(-20, 0, 0, 100, radius, false);
    var lateral = game.enginePlumeGeometry(0, 20, 0, 100, radius, false);
    var main = findPlume(forward, 'main-aft');
    var brakePort = findPlume(braking, 'brake-port');
    var brakeStarboard = findPlume(braking, 'brake-starboard');
    var portTranslate = findPlume(lateral, 'port-translate');

    assert(main, 'Forward acceleration should use aft main thruster');
    assert(brakePort && brakeStarboard, 'Braking should use paired forward brake ports');
    assert(portTranslate, 'Lateral acceleration should use a side maneuvering thruster');
    assertClose(main.origin.x, -radius * 0.82);
    assertClose(main.origin.y, 0);
    assertClose(brakePort.origin.x, radius * 0.72);
    assertClose(brakePort.origin.y, -radius * 0.42);
    assertClose(brakeStarboard.origin.y, radius * 0.42);
    assertClose(portTranslate.origin.y, -radius * 0.82);
  });

  test('camera math uses logical screen pixels under high-DPI rendering', function () {
    var viewport = game.viewportFromApp({
      screen: { width: 1280, height: 720 },
      renderer: { width: 1920, height: 1080 }
    });
    var camera = { x: 210, y: -125, zoom: 1.75 };
    var screen = game.worldToScreen({ x: 210, y: -125 }, camera, viewport);
    var world = game.screenToWorld({ x: 640, y: 360 }, camera, viewport);

    assertClose(viewport.width, 1280);
    assertClose(viewport.height, 720);
    assertClose(screen.x, 640);
    assertClose(screen.y, 360);
    assertClose(world.x, 210);
    assertClose(world.y, -125);
  });

  test('focus camera tracks the current selected ship position', function () {
    var world = sim.selectShips(sim.createInitialWorld(), ['escort-01']);
    world.camera = { x: 0, y: 0, zoom: 1 };
    var ids = ['escort-01'];
    var initialFocus = game.computeSelectionFocus(world, ids);
    var escort = findShip(world, 'escort-01');

    escort.position = { x: 520, y: -280 };
    var movedFocus = game.computeSelectionFocus(world, ids);
    var focusedWorld = game.focusCameraToward(world, movedFocus, 1);

    assertClose(initialFocus.x, 210);
    assertClose(movedFocus.x, 520);
    assertClose(movedFocus.y, -280);
    assertClose(focusedWorld.camera.x, 520);
    assertClose(focusedWorld.camera.y, -280);
  });

  test('mining effect becomes diffuse when miner overlaps asteroid', function () {
    var position = { x: 40, y: -20 };
    var rotation = Math.PI / 2;
    var geometry = game.miningEffectGeometry(position, position, rotation);

    assert(geometry.beamOrigin === null, 'Overlapped mining should not draw a directional beam');
    assertClose(geometry.contact.x, 40);
    assertClose(geometry.contact.y, -2);
    assertClose(geometry.seedAngle, Math.PI / 2);
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

  function findAsteroid(world, id) {
    return world.asteroids.filter(function (asteroid) {
      return asteroid.id === id;
    })[0];
  }

  function findPlume(plumes, id) {
    return plumes.filter(function (plume) {
      return plume.id === id;
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
