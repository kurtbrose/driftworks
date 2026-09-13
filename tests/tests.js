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

  test('industrial loads reduce acceleration through mass while retaining guidance speed', function () {
    ['miner-01', 'tug-01'].forEach(function (id) {
      function cruise(load, ticks) {
        var world = sim.selectShips(sim.createInitialWorld(), [id]);
        var ship = findShip(world, id);
        ship.cargo = ship.cargoCapacity * load;
        ship.carryingSection = ship.type === 'tug' && load > 0;
        world = sim.issueMoveOrder(world, { x: ship.position.x + 10000, y: ship.position.y });
        for (var i = 0; i < ticks; i += 1) world = sim.stepWorld(world, 1 / 30);
        return world;
      }
      var empty = findShip(cruise(0, 1), id);
      var loaded = findShip(cruise(1, 1), id);
      assert(loaded.velocity.x < empty.velocity.x, 'Payload should reduce acceleration');
      var loadedWorld = cruise(1, 180);
      loaded = findShip(loadedWorld, id);
      empty = findShip(cruise(0, 180), id);
      assertClose(loaded.velocity.x, empty.velocity.x);
      assertClose(loaded.speed, empty.speed);
      assertClose(loaded.acceleration / empty.acceleration, id === 'miner-01' ? 0.25 : 2 / 3);
      if (id === 'miner-01') {
        var half = findShip(cruise(0.5, 1), id);
        assert(half.acceleration > loaded.acceleration && half.acceleration < empty.acceleration, 'Partial ore load should have an intermediate penalty');
      }
      loaded.cargo = 0;
      loaded.carryingSection = false;
      for (var i = 0; i < 180; i += 1) loadedWorld = sim.stepWorld(loadedWorld, 1 / 30);
      assertClose(findShip(loadedWorld, id).velocity.x, empty.velocity.x);
    });
  });

  test('picking up cargo does not instantly clamp existing velocity', function () {
    var world = sim.selectShips(sim.createInitialWorld(), ['miner-01']);
    var miner = findShip(world, 'miner-01');
    miner.velocity = { x: miner.speed, y: 0 };
    miner.cargo = miner.cargoCapacity;
    world = sim.issueMoveOrder(world, { x: miner.position.x + 10000, y: miner.position.y });
    var next = findShip(sim.stepWorld(world, 1 / 30), 'miner-01');
    assertClose(next.velocity.x, miner.speed);
    assert(miner.speed - next.velocity.x <= miner.acceleration / 30, 'Loaded ship should decelerate gradually');
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

  test('mothership processes ore into depot construction sections', function () {
    var world = sim.createInitialWorld();
    world.mothership.storage.ore = 1500;
    world = sim.stepWorld(world, 1 / 30);
    assertClose(world.mothership.storage.ore, 0);
    assertClose(world.mothership.storage.depotSections, 1);
    assertClose(world.mothership.storage.constructionMass, 0);
  });

  test('tug carries a fabricated section to the depot site', function () {
    var world = sim.createInitialWorld();
    world.mothership.storage.depotSections = 1;
    world = sim.issueBuildOrder(sim.selectShips(world, ['tug-01']));
    var guard = 0;
    while (world.depot.builtStages < 1 && guard < 900) {
      world = sim.stepWorld(world, 1 / 30);
      guard += 1;
    }
    assert(world.depot.builtStages === 1, 'Tug should deliver one depot section');
    assert(world.mothership.storage.depotSections === 0, 'Delivered section should leave mothership storage');
    assert(findShip(world, 'tug-01').carryingSection === false, 'Tug should no longer carry the section');
  });

  test('escorts can engage the same hostile with independent laser timers', function () {
    var escorts = sim.createInitialWorld().ships.filter(function (ship) { return ship.type === 'escort'; });
    escorts.forEach(function (ship) { ship.position = { x: 0, y: 0 }; });
    var drone = { id: 'shared-target', position: { x: 100, y: 0 } };
    var timers = {};
    var first = game.stepDefenderWeapon(escorts[0], [drone], timers, 0.01);
    var second = game.stepDefenderWeapon(escorts[1], [drone], timers, 0.01);
    assert(first.target === drone && second.target === drone, 'Both escorts should engage the same hostile');
    assert(first.paint && second.paint, 'Both escorts should visibly fire on the same frame');
    assert(!game.stepDefenderWeapon(escorts[0], [drone], timers, 0.02).paint, 'First escort should respect its own laser cadence');
    assert(game.stepDefenderWeapon(escorts[1], [drone], timers, 0.08).paint, 'Second escort should fire independently of the first timer');
    assert(game.stepDefenderWeapon(escorts[0], [], timers, 0.1) === null, 'Destroyed targets should not remain reserved');
    drone.position.x = 1000;
    assert(game.stepDefenderWeapon(escorts[0], [drone], timers, 0.1) === null, 'Escorts must still respect weapon range');
  });

  test('destroyed drones persist as distinct salvage wrecks across save and camera changes', function () {
    var world = sim.createInitialWorld();
    var destroyed = { position: { x: 300, y: 100 }, velocity: { x: 10, y: -5 } };
    world = sim.addWreck(sim.addWreck(world, destroyed), destroyed);
    assert(world.wrecks.length === 2 && world.wrecks[0].id !== world.wrecks[1].id, 'Each wreck needs a stable unique identity');
    var restored = sim.deserializeWorld(sim.serializeWorld(world));
    restored = game.withCamera(restored, { x: 100, y: 100, zoom: 2 });
    assert(JSON.stringify(restored.wrecks) === JSON.stringify(world.wrecks), 'Camera and save changes must preserve wrecks');
  });

  test('hauler picks up a wreck beneath its frame and salvages it exactly once', function () {
    var world = sim.addWreck(sim.createInitialWorld(), { position: { x: 165, y: 120 }, velocity: { x: 0, y: 1 } });
    world = sim.issueContextOrder(sim.selectShips(world, ['tug-01']), world.wrecks[0].position);
    assert(findShip(world, 'tug-01').order.kind === 'recover', 'Right-click should dispatch recovery');
    world = sim.stepWorld(world, 1 / 30);
    var hauler = findShip(world, 'tug-01');
    assert(hauler.towTarget && world.wrecks[0].towedBy === hauler.id, 'Pickup should attach the wreck');
    assertClose(world.wrecks[0].position.x, hauler.position.x);
    assertClose(world.wrecks[0].position.y, hauler.position.y);
    world = sim.issueMoveOrder(world, { x: 600, y: -200 });
    for (var i = 0; i < 120; i += 1) {
      world = sim.stepWorld(world, 1 / 30);
      hauler = findShip(world, 'tug-01');
      assertClose(world.wrecks[0].position.x, hauler.position.x);
      assertClose(world.wrecks[0].position.y, hauler.position.y);
      assertClose(world.wrecks[0].rotation, hauler.rotation);
    }
    assertClose(sim.physicalStats(world, hauler).massKg, 3075000);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    world = sim.issueReturnOrder(world);
    for (var tick = 0; tick < 1500; tick += 1) world = sim.stepWorld(world, 1 / 30);
    assert(world.wrecks.length === 0, 'Delivered wreck should disappear');
    assertClose(world.recovery.salvagedOre, 24);
    assertClose(world.mothership.storage.ore + world.mothership.storage.constructionMass, 24);
    assert(!findShip(world, 'tug-01').towTarget, 'Hauler should be free after delivery');
  });

  test('disabled fighters cannot move or fire and recover after being carried home', function () {
    var world = sim.createInitialWorld();
    var fighter = findShip(world, 'escort-01');
    fighter.position = { x: 165, y: 120 };
    world = sim.damageFighter(world, fighter.id, 0.4);
    assert(!findShip(world, fighter.id).disabled, 'Partial damage should not disable the fighter');
    world = sim.damageFighter(world, fighter.id, 0.6);
    world = sim.issueMoveOrder(sim.selectShips(world, [fighter.id]), { x: 900, y: 900 });
    world = sim.stepWorld(world, 1 / 30);
    fighter = findShip(world, fighter.id);
    assert(fighter.disabled && fighter.order.kind === 'idle', 'Disabled fighter should reject movement');
    assertClose(fighter.position.x, 165);
    assert(game.stepDefenderWeapon(fighter, [{ position: fighter.position }], {}, 1) === null, 'Disabled fighter must not shoot');
    world = sim.issueContextOrder(sim.selectShips(world, ['tug-01']), fighter.position);
    for (var i = 0; i < 1000 && !findShip(world, fighter.id).repairRemaining; i += 1) world = sim.stepWorld(world, 1 / 30);
    fighter = findShip(world, fighter.id);
    assert(fighter.disabled && fighter.repairRemaining > 0 && !fighter.towedBy, 'Delivery should start a docked repair');
    var mothership = world.ships.filter(function (ship) { return ship.type === 'mothership'; })[0];
    assertClose(fighter.position.x, mothership.position.x);
    assertClose(fighter.position.y, mothership.position.y);
    assert(!findShip(world, 'tug-01').towTarget, 'Hauler can leave while repairs proceed');
    world = sim.deserializeWorld(sim.serializeWorld(world));
    for (var j = 0; j < 400; j += 1) world = sim.stepWorld(world, 1 / 30);
    fighter = findShip(world, fighter.id);
    assert(!fighter.disabled && fighter.damage === 0, 'Repair should restore fighter');
    assertClose(world.recovery.repairedShips, 1);
    assertClose(world.recovery.salvagedOre, 0);
    world = sim.issueMoveOrder(sim.selectShips(world, [fighter.id]), { x: 900, y: 900 });
    assert(findShip(sim.stepWorld(world, 1 / 30), fighter.id).velocity.x > 0, 'Repaired fighter should accept orders');
  });

  test('recovery approach builds speed and arrives from a distance', function () {
    var world = sim.addWreck(sim.createInitialWorld(), { position: { x: 400, y: 120 }, velocity: { x: 1, y: 0 } });
    world = sim.issueContextOrder(sim.selectShips(world, ['tug-01']), world.wrecks[0].position);
    for (var i = 0; i < 30; i += 1) world = sim.stepWorld(world, 1 / 30);
    assert(findShip(world, 'tug-01').velocity.x > 40, 'Approach should retain velocity between ticks');
    for (var j = 0; j < 150; j += 1) world = sim.stepWorld(world, 1 / 30);
    assert(findShip(world, 'tug-01').towTarget, 'Hauler should reach and collect a nearby wreck within six seconds');
  });

  test('repaired fighters launch slowly from inside the mothership before accepting orders', function () {
    var world = sim.damageFighter(sim.createInitialWorld(), 'escort-01', 1);
    var fighter = findShip(world, 'escort-01');
    var mothership = world.ships.filter(function (ship) { return ship.type === 'mothership'; })[0];
    mothership.rotation = Math.PI / 2;
    fighter.repairRemaining = 1 / 30;
    world = sim.stepWorld(world, 1 / 30);
    fighter = findShip(world, fighter.id);
    assert(fighter.launchElapsed === 0 && fighter.disabled, 'Repair should enter a protected launch phase');
    assertClose(fighter.position.x, mothership.position.x);
    assertClose(fighter.position.y, mothership.position.y);
    for (var i = 0; i < 90; i += 1) {
      var before = findShip(world, fighter.id).position;
      world = sim.stepWorld(world, 1 / 30);
      var after = findShip(world, fighter.id).position;
      assert(Math.hypot(after.x - before.x, after.y - before.y) <= 18 / 30 + 0.000001, 'Launch should ease out below normal flight speed');
    }
    fighter = findShip(world, fighter.id);
    assertClose(fighter.position.x, mothership.position.x);
    assertClose(fighter.position.y, mothership.position.y + 36);
    world = sim.issueMoveOrder(sim.selectShips(world, [fighter.id]), { x: 900, y: 900 });
    assert(findShip(world, fighter.id).order.kind === 'idle', 'Orders should not interrupt clearance from the dock');
    world = sim.deserializeWorld(sim.serializeWorld(world));
    for (var j = 0; j < 100; j += 1) world = sim.stepWorld(world, 1 / 30);
    fighter = findShip(world, fighter.id);
    assert(!fighter.disabled && fighter.launchElapsed === null, 'Cleared fighter should become operational');
    assertClose(fighter.position.y, mothership.position.y + 72);
    assertClose(world.recovery.repairedShips, 1);
  });

  test('recovery cannot double-claim a wreck or stack payloads', function () {
    var world = sim.addWreck(sim.createInitialWorld(), { position: { x: 165, y: 120 }, velocity: { x: 1, y: 0 } });
    world.ships.push(sim.createShip('tug-02', 'Second Hauler', 'tug', 160, 120, 62));
    world = sim.issueContextOrder(sim.selectShips(world, ['tug-01', 'tug-02']), world.wrecks[0].position);
    world = sim.stepWorld(world, 1 / 30);
    assert(world.ships.filter(function (ship) { return ship.towTarget; }).length === 1, 'Only one hauler can pick up each wreck');
    var loaded = findShip(world, 'tug-01');
    world = sim.issueBuildOrder(sim.selectShips(world, [loaded.id]));
    assert(findShip(world, loaded.id).order.kind === 'return', 'Carried hull prevents accepting a module');
    var other = findShip(world, 'tug-02');
    other.carryingSection = true;
    world = sim.addWreck(world, { position: { x: 400, y: 100 }, velocity: { x: 1, y: 0 } });
    world = sim.issueContextOrder(sim.selectShips(world, [other.id]), world.wrecks[1].position);
    assert(findShip(world, other.id).order.kind !== 'recover', 'Carried module prevents accepting a hull');
  });

  test('legacy saves receive empty recovery defaults', function () {
    var world = sim.createInitialWorld();
    delete world.wrecks;
    delete world.nextWreckId;
    delete world.recovery;
    world.ships.forEach(function (ship) {
      delete ship.towTarget;
      delete ship.towedBy;
      delete ship.disabled;
      delete ship.repairRemaining;
    });
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assert(world.wrecks.length === 0 && world.nextWreckId === 1, 'Legacy world should load without wrecks');
    assert(world.ships.every(function (ship) { return !ship.disabled && !ship.towTarget; }), 'Legacy ships should stay operational');
  });

  test('operation exposure starts quiet and rises with industrial work', function () {
    var world = sim.createInitialWorld();
    assertClose(game.operationExposure(world), 0);
    world = sim.issueMineOrder(sim.selectShips(world, ['miner-01']), 'ast-ceres-01');
    assert(game.operationExposure(world) > 0, 'Mining work should expose the operation to contact risk');
    world.mothership.storage.depotSections = 1;
    assert(game.operationExposure(world) > 1, 'Ready construction sections should add operational exposure');
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

  test('mothership drum bands roll top to bottom across the side silhouette', function () {
    var start = game.mothershipDrumMarkers(0);
    var later = game.mothershipDrumMarkers(4);
    var visibleCount = start.filter(function (marker) {
      return marker.visible;
    }).length;

    assert(start.length === 6, 'Drum should expose a few schematic surface bands');
    assert(visibleCount === 3, 'Only the exposed hemisphere should be visible');
    assert(start.some(function (marker) { return marker.visible && marker.y < -1; }), 'Exposed surface should reach above the center');
    assert(start.some(function (marker) { return marker.visible && marker.y > 1; }), 'Exposed surface should reach below the center');
    start.forEach(function (marker) {
      assert(marker.halfWidth > 31 && marker.halfWidth <= 36, 'Band should extend to the rounded hull edge');
      assert(marker.y >= -16.5 && marker.y <= 16.5, 'Band should stay on the visible cylindrical side');
    });
    assert(later[0].y > start[0].y, 'Surface bands should roll from top to bottom over time');
    assert(!game.mothershipDrumMarkers(19)[0].visible, 'A band should disappear underneath for the other half of its rotation');
    assert(game.mothershipDrumMarkers(38)[0].visible, 'A band should reappear after one full rotation');
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

  test('semantic zoom preserves baseline and reveals relative scale continuously', function () {
    ['escort', 'miner', 'tug', 'mothership', 'asteroid', 'depot'].forEach(function (type) {
      assertClose(game.semanticScale(type, 1), 1);
      assertClose(game.semanticScale(type, 1.000001), 1, 0.00001);
    });
    assertClose(game.semanticScale('escort', 0.35) * 0.35, 1);
    var fighter = game.semanticScale('escort', 32) * 32;
    var home = game.semanticScale('mothership', 32) * 32;
    assert(fighter >= 1 && fighter < 1.5, 'Fighters remain readable with modest growth');
    assert(home / fighter > 20, 'Close zoom reveals substantially smaller relative craft');
    assert(game.semanticScale('mothership', 32) > 0.8, 'Large bodies retain most world size');
  });

  test('extended zoom retains the world point under the pointer and respects limits', function () {
    var view = { width: 1200, height: 800 };
    var pointer = { x: 230, y: 570 };
    var camera = { x: 71, y: -83, zoom: 120 };
    var before = game.screenToWorld(pointer, camera, view);
    var next = game.zoomCameraAt(camera, pointer, view, -1);
    var after = game.screenToWorld(pointer, next, view);
    assertClose(next.zoom, 128);
    assertClose(after.x, before.x);
    assertClose(after.y, before.y);
    assertClose(game.zoomCameraAt({ x: 0, y: 0, zoom: 0.35 }, pointer, view, 1).zoom, 0.35);
  });

  test('detail zoom magnifies all hulls fourfold without changing relative proportions', function () {
    ['escort', 'miner', 'tug', 'mothership', 'asteroid', 'depot'].forEach(function (type) {
      var base = game.semanticScale(type, 32);
      assertClose(game.semanticScale(type, 32.000001), base, 0.000001);
      assertClose(game.semanticScale(type, 31.999999), base, 0.000001);
      [48, 64, 128].forEach(function (zoom) {
        assertClose(game.semanticScale(type, zoom), base);
      });
      assertClose(game.semanticScale(type, 128) * 128 / (base * 32), 4);
    });
    var view = { width: 1200, height: 800 };
    var pointer = { x: 230, y: 570 };
    [30, 32, 64, 128].forEach(function (zoom) {
      [-1, 1].forEach(function (wheel) {
        var camera = { x: 71, y: -83, zoom: zoom };
        var before = game.screenToWorld(pointer, camera, view);
        var next = game.zoomCameraAt(camera, pointer, view, wheel);
        var after = game.screenToWorld(pointer, next, view);
        assertClose(after.x, before.x);
        assertClose(after.y, before.y);
      });
    });
  });

  test('close zoom recovery targets do not capture empty-space move orders', function () {
    var world = sim.createInitialWorld();
    var escort = findShip(world, 'escort-01');
    escort.disabled = true;
    escort.position = { x: 900, y: 900 };
    world.camera.zoom = 32;
    var tug = world.ships.filter(function (ship) { return ship.type === 'tug'; })[0];
    world = sim.selectShips(world, [tug.id]);
    var move = game.issueVisualContextOrder(world, { x: 915, y: 900 });
    assert(findShip(move, tug.id).order.kind === 'move');
    var recover = game.issueVisualContextOrder(world, escort.position);
    assert(findShip(recover, tug.id).order.kind === 'recover');
  });

  test('zooming out preserves default size hierarchy for every object class', function () {
    [0.35, 0.5, 0.8, 1].forEach(function (zoom) {
      ['mothership', 'depot', 'escort', 'miner', 'tug'].forEach(function (type) {
        assertClose(game.semanticScale(type, zoom) * zoom, 1);
      });
    });
  });

  test('UI effects retain pixel size across live zoom changes while selection follows ships', function () {
    function graphic() {
      return { parent: true, x: 12, y: 34, scale: { set: function (value) { this.x = value; } } };
    }
    var marker = { graphic: graphic(), age: 0, life: 10, vx: 0, vy: 0, scale: 1, grow: 0, alpha: 1, screenSpace: true };
    var selection = { graphic: graphic(), age: 0, life: 10, vx: 0, vy: 0, scale: 1, grow: 0, alpha: 1, semanticType: 'escort' };
    var worldEffect = { graphic: graphic(), age: 0, life: 10, vx: 0, vy: 0, scale: 1, grow: 0, alpha: 1 };
    [1, 32, 0.35, 8].forEach(function (zoom) {
      game.updateEffects({}, [marker, selection, worldEffect], 0.01, zoom);
      assertClose(marker.graphic.scale.x * zoom, 1);
      assertClose(selection.graphic.scale.x, game.semanticScale('escort', zoom));
      assertClose(worldEffect.graphic.scale.x, 1);
      assertClose(marker.graphic.x, 12);
      assertClose(marker.graphic.y, 34);
    });
  });

  test('short move orders accelerate instead of teleporting within the old arrival radius', function () {
    var world = sim.createInitialWorld();
    var fighter = findShip(world, 'escort-01');
    var start = { x: fighter.position.x, y: fighter.position.y };
    var target = { x: start.x + 4, y: start.y };
    world = sim.issueMoveOrder(sim.selectShips(world, [fighter.id]), target);
    var arrived = false;
    for (var i = 0; i < 600; i += 1) {
      var before = findShip(world, fighter.id);
      world = sim.stepWorld(world, 1 / 30);
      var after = findShip(world, fighter.id);
      assertClose(after.previousPosition.x, before.position.x);
      assertClose(after.previousPosition.y, before.position.y);
      var travel = Math.hypot(after.position.x - before.position.x, after.position.y - before.position.y);
      var speed = Math.hypot(before.velocity.x, before.velocity.y);
      assert(travel <= (speed + after.acceleration / 30) / 30 + 0.001,
        'Every step must respect acceleration, including the final arrival');
      if (after.order.kind === 'idle') {
        assertClose(after.position.x, target.x);
        arrived = true;
        break;
      }
    }
    assert(arrived, 'Precision arrival must settle');
  });

  test('one large asteroid rotates and landed miners retain their surface site', function () {
    [-0.012, 0.012].forEach(function (spin) {
      var world = sim.createInitialWorld();
      assert(world.asteroids.length === 1 && world.asteroids[0].radius >= 300);
      world.asteroids[0].angularVelocity = spin;
      world = sim.issueMineOrder(sim.selectShips(world, ['miner-01']), world.asteroids[0].id);
      var landed = false;
      for (var i = 0; i < 1000; i += 1) {
        world = sim.stepWorld(world, 1 / 30);
        var miner = findShip(world, 'miner-01'), body = world.asteroids[0];
        if (miner.order.phase === 'landed') {
          landed = true;
          var angle = miner.order.siteAngle + body.rotation;
          assertClose(miner.position.x, body.position.x + Math.cos(angle) * sim.surfaceRadius(body, miner.order.siteAngle) * miner.order.siteDepth);
          assertClose(miner.position.y, body.position.y + Math.sin(angle) * sim.surfaceRadius(body, miner.order.siteAngle) * miner.order.siteDepth);
          assertClose(miner.rotation, angle + Math.PI);
          assertClose(miner.velocity.x, -(miner.position.y - body.position.y) * spin);
          world = sim.deserializeWorld(sim.serializeWorld(world));
        }
        if (miner.order.kind === 'return') {
          assertClose(miner.cargo, miner.cargoCapacity);
          assert(Math.hypot(miner.velocity.x, miner.velocity.y) > 0, 'Release retains surface velocity');
          break;
        }
      }
      assert(landed, 'Miner must attach before extracting');
      assert(findShip(world, 'miner-01').order.kind === 'return');
      assertClose(world.asteroids[0].radius, 300);
    });
  });

  test('legacy fields merge ore into one large asteroid', function () {
    var world = sim.createInitialWorld();
    world.asteroids.push(sim.createAsteroid('old', 'Old rock', 100, 100, 80));
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assert(world.asteroids.length === 1);
    assertClose(world.asteroids[0].ore, 10205);
  });

  test('miners choose distinct sites on the visible face', function () {
    var world = sim.issueMineOrder(sim.selectShips(sim.createInitialWorld(), ['miner-01', 'miner-02']), 'ast-ceres-01');
    var first = findShip(world, 'miner-01'), second = findShip(world, 'miner-02');
    [first, second].forEach(function (ship) {
      assert(ship.order.siteDepth >= 0.3 && ship.order.siteDepth <= 0.75, 'Site should be well inside the rim');
    });
    assert(first.order.siteDepth !== second.order.siteDepth, 'Miners should spread across the face');
  });

  test('mining plume uses hull-local geometry and only appears while landed', function () {
    var ship = findShip(sim.createInitialWorld(), 'miner-01');
    var circles = [];
    var graphics = { lineStyle: function () {}, beginFill: function () {}, endFill: function () {}, drawCircle: function (x, y, r) { circles.push([x, y, r]); } };
    ship.order = { kind: 'mine', phase: 'approach' };
    game.drawMiningPlume(graphics, ship, 14, 1);
    assert(circles.length === 0);
    ship.order.phase = 'landed';
    game.drawMiningPlume(graphics, ship, 14, 1);
    assert(circles.length === 13);
    var initial = JSON.stringify(circles);
    circles = [];
    ship.position = { x: 900, y: -1200 };
    ship.rotation = 2;
    game.drawMiningPlume(graphics, ship, 14, 1);
    assert(JSON.stringify(circles) === initial, 'Hull transform must handle anchoring, not world-space particle offsets');
  });

  test('physical scale and payload masses have canonical values', function () {
    var world = sim.createInitialWorld();
    var miner = findShip(world, 'miner-01');
    assertClose(sim.asteroidPhysicalStats(world.asteroids[0]).diameterM, 10000);
    assertClose(sim.physicalStats(world, miner).accelerationMps2, 0.392266);
    miner.cargo = 1500;
    assertClose(sim.physicalStats(world, miner).massKg, 2000000);
    assertClose(sim.physicalStats(world, miner).accelerationMps2, 0.0980665);
    var tug = findShip(world, 'tug-01');
    var fighter = findShip(world, 'escort-01');
    fighter.disabled = true;
    tug.towTarget = { kind: 'ship', id: fighter.id };
    assertClose(sim.physicalStats(world, tug).massKg, 3075000);
    fighter.physical.dryMassKg = 3000000;
    assertClose(sim.physicalStats(world, tug).accelerationMps2, 0.0980665);
  });

  test('legacy physical-unit migration preserves load fraction and runs once', function () {
    var world = sim.createInitialWorld();
    delete world.physicalUnitsVersion;
    world.asteroids[0].ore = 540;
    world.asteroids[0].oreInitial = 540;
    world.contract.quotaOre = 240;
    var miner = findShip(world, 'miner-01');
    delete miner.physical;
    miner.cargo = 40;
    miner.cargoCapacity = 80;
    world.mothership.storage.constructionMass = 40;
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assertClose(findShip(world, 'miner-01').cargo, 750);
    assertClose(world.asteroids[0].ore, 10125);
    assertClose(world.mothership.storage.constructionMass, 750);
    assertClose(world.contract.quotaOre, 4500);
    assert(JSON.stringify(sim.deserializeWorld(sim.serializeWorld(world))) === JSON.stringify(world));
  });

  test('textured thrusters ramp by ship role and stop on coast or disable', function () {
    function graphics() {
      var g = { scale: { x: 1 }, fills: 0 };
      ['lineStyle', 'moveTo', 'lineTo', 'closePath', 'endFill'].forEach(function (name) { g[name] = function () {}; });
      g.beginFill = function () { g.fills += 1; };
      return g;
    }
    var ship = { id: 'engine-test', type: 'escort', speed: 100, acceleration: 100,
      rotation: 0, velocity: { x: 20, y: 0 }, previousVelocity: { x: 0, y: 0 }, order: { kind: 'move' } };
    var fighter = graphics();
    var industrial = graphics();
    game.drawEnginePlume(fighter, ship, 10, 1);
    game.drawEnginePlume(fighter, ship, 10, 1.1);
    ship.type = 'miner';
    game.drawEnginePlume(industrial, ship, 10, 1);
    game.drawEnginePlume(industrial, ship, 10, 1.1);
    assert(fighter.engineResponse.levels['main-aft'] > industrial.engineResponse.levels['main-aft'], 'Fighters should ignite faster');
    assert(fighter.fills === 12, 'Each plume should have three layers and three nodes');
    ship.velocity.x = 0;
    game.drawEnginePlume(industrial, ship, 10, 1.2);
    assert(industrial.engineResponse === null && industrial.fills === 12, 'Coasting should clear exhaust');
    ship.velocity.x = 20;
    ship.disabled = true;
    game.drawEnginePlume(fighter, ship, 10, 1.2);
    assert(fighter.engineResponse === null && fighter.fills === 12, 'Disabled engines must stop immediately');
  });

  test('fighter groups form up and retain their defense anchor', function () {
    for (var count = 2; count <= 7; count += 1) {
      var world = sim.createInitialWorld();
      while (world.ships.filter(function (s) { return s.type === 'escort'; }).length < count) world = sim.spawnFighter(world);
      var ids = world.ships.filter(function (s) { return s.type === 'escort'; }).map(function (s) { return s.id; });
      world = game.issueVisualContextOrder(sim.selectShips(world, ids), { x: 900, y: -500 });
      for (var i = 0; i < 600; i += 1) world = sim.stepWorld(world, 1 / 30);
      var slots = {};
      ids.forEach(function (id) {
        var s = findShip(world, id);
        assert(s.order.kind === 'defend');
        assert(Math.hypot(s.position.x - s.order.target.x, s.position.y - s.order.target.y) < 1, 'Formation should settle');
        slots[s.order.offset.x + ':' + s.order.offset.y] = true;
      });
      assert(Object.keys(slots).length === count, 'Each fighter needs a distinct slot');
    }
  });

  test('fighters slide at the leash and return after threats leave', function () {
    var world = sim.issueDefendOrder(sim.selectShips(sim.createInitialWorld(), ['escort-01']), { x: 0, y: 0 });
    var s = findShip(world, 'escort-01');
    s.position = { x: sim.FIGHTER_LEASH - 1, y: 0 };
    var startY = s.position.y;
    for (var i = 0; i < 300; i += 1) {
      s = findShip(world, s.id);
      var threat = { position: { x: s.position.x - 50, y: s.position.y } };
      world = sim.stepWorld(world, 1 / 30, [threat]);
      s = findShip(world, s.id);
      assert(Math.hypot(s.position.x, s.position.y) <= sim.FIGHTER_LEASH + 0.001, 'Must remain inside leash');
    }
    assert(Math.abs(s.position.y - startY) > 50, 'Must slide instead of stopping at boundary');
    for (i = 0; i < 600; i += 1) world = sim.stepWorld(world, 1 / 30);
    s = findShip(world, s.id);
    assert(Math.hypot(s.position.x, s.position.y) < 1, 'Must reclaim anchor');
  });

  test('ship defense follows its anchor and survives saves', function () {
    var world = sim.createInitialWorld();
    var miner = findShip(world, 'miner-01');
    world = game.issueVisualContextOrder(sim.selectShips(world, ['escort-01']), miner.position);
    assert(findShip(world, 'escort-01').order.anchorShipId === miner.id);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    findShip(world, miner.id).position.x += 100;
    world = sim.stepWorld(world, 1 / 30);
    assertClose(findShip(world, 'escort-01').order.anchor.x, miner.position.x + 100);
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
