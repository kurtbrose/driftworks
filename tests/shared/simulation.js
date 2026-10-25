(function () {
  'use strict';

  window.DriftworksSharedTests = window.DriftworksSharedTests || {};
  window.DriftworksSharedTests.simulation = function (harness, fixtures) {
    var sim = window.Driftworks.sim;
    var game = window.Driftworks.game;
    var hud = window.Driftworks.hud;
    var test = harness.test, assert = harness.assert, assertClose = harness.assertClose;
    var createFreshWorld = fixtures.createFreshWorld;
    var createDeployedWorld = fixtures.createDeployedWorld;
    var deployTestFormation = fixtures.deployTestFormation;
    var findShip = fixtures.findShip;


  test('simulation', 'missing world defaults stay seeded, independent and stable across reloads', function () {
    [1729, 42].forEach(function (seed) {
      var base = sim.createInitialWorld(seed);
      var expected = sim.deserializeWorld(sim.serializeWorld(base));
      function assertWorld(actual, message) {
        assert(Object.keys(actual).length === Object.keys(expected).length, message);
        Object.keys(expected).forEach(function (key) {
          assert(JSON.stringify(actual[key]) === JSON.stringify(expected[key]), message + ': ' + key);
        });
      }
      var fields = ['combat', 'mothership', 'depot', 'contract', 'asteroids', 'ships', 'camera', 'campaign'];
      // Exercise individual fallback paths and several defaults in the same load.
      fields.map(function (field) { return [field]; }).concat([fields]).forEach(function (missing) {
        var old = JSON.parse(JSON.stringify(base));
        missing.forEach(function (field) { delete old[field]; });
        var saved = sim.serializeWorld(old);
        var loaded = sim.deserializeWorld(saved);
        assertWorld(loaded, 'Seeded defaults for ' + missing.join(', '));
        assert(JSON.stringify(sim.deserializeWorld(sim.serializeWorld(loaded))) === JSON.stringify(loaded),
          'Repeated default repair must be stable');
        loaded.asteroids[0].excavation.depthM = 123;
        loaded.ships[0].position.x = 456;
        assertWorld(sim.deserializeWorld(saved),
          'Default objects must not leak between loads');
        assert(JSON.stringify(old) === JSON.stringify(JSON.parse(saved).world), 'Loading must preserve its input');
      });
    });
  });

  test('simulation', 'explicit order recipients are independent of selection and preserve legacy commands', function () {
    var base=sim.createInitialWorld();
    base.ships.forEach(function(ship){ship.docked=false;ship.order={kind:'move',target:{x:100,y:100}};});
    base.selectedShipIds=['escort-02'];base.selectedPlatformId='platform-02';
    base.platforms[0].state='deployed';base.platforms[0].asteroidId=base.asteroids[0].id;
    base.wrecks=[{id:'test-wreck',position:{x:500,y:500},velocity:{x:0,y:0},ore:10,towedBy:null}];
    var cases=[
      ['issueMoveOrder',[{x:800,y:800}],['tug-01','missing','tug-01']],
      ['issueContextOrder',[{x:800,y:800}],['tug-01','escort-01']],
      ['issueMineOrder',[base.asteroids[0].id],['msv-hardshell']],
      ['issueBuildOrder',[],['tug-01']],['issueReturnOrder',[],['tug-01']],
      ['issueDefendOrder',[{x:900,y:900},null],['escort-01']],
      ['issueRecoveryOrder',[{kind:'wreck',id:'test-wreck'}],['tug-01']],
      ['issuePlatformRecovery',['platform-01'],['tug-01']]
    ];
    cases.forEach(function(c){
      var before=JSON.stringify(base),ids=c[2],expected=sim[c[0]].apply(null,[sim.selectShips(base,ids)].concat(c[1]));
      expected.selectedShipIds=base.selectedShipIds.slice();expected.selectedPlatformId=base.selectedPlatformId;
      var actual=sim[c[0]].apply(null,[base].concat(c[1],[ids]));
      assert(JSON.stringify(actual)===JSON.stringify(expected),c[0]+' must use explicit recipients');
      assert(JSON.stringify(base)===before,c[0]+' mutated the source');
    });
    base.ships[1].order={kind:'idle'};
    var next=sim.issueSalvageAllOrder(base,['tug-01']);
    assert(next.ships[1].order.kind==='recover'&&next.selectedShipIds[0]==='escort-02');
    next=sim.issueMoveOrder(base,{x:1,y:2},[]);
    assert(next.ships[1].order.kind==='idle'&&next.ships[3].order.kind==='move','Empty recipients must not fall back to selection');
    var visual=game.issueVisualContextOrder(base,{x:800,y:800},['tug-01','escort-01']);
    assert(visual.ships[1].order.kind==='move'&&visual.ships[2].order.kind==='defend');
    assert(JSON.stringify(visual.selectedShipIds)===JSON.stringify(base.selectedShipIds)&&visual.selectedPlatformId===base.selectedPlatformId);
  });

  test('simulation', 'automatic defense leaves both ship and platform selection untouched', function () {
    var world=sim.createInitialWorld();world.selectedShipIds=['tug-01'];world.selectedPlatformId='platform-01';
    world=sim.spawnHostileWave(world);var next=sim.stepWorld(world,1/30);
    assert(next.ships.some(function(ship){return ship.order.kind==='defend'&&ship.order.automatic;}));
    assert(next.selectedShipIds.join(',')==='tug-01'&&next.selectedPlatformId==='platform-01');
  });

  test('simulation', 'asteroid excavation persists, repairs old saves and reserves mining clearance', function () {
    var world = createFreshWorld();
    var excavation = world.asteroids[0].excavation;
    assert(excavation && excavation.level === 0 && excavation.pocketRadius > 0 && excavation.depthM === 500);
    var old = JSON.parse(JSON.stringify(world));
    delete old.asteroids[0].excavation;
    var repaired = sim.deserializeWorld(sim.serializeWorld(old));
    assert(JSON.stringify(repaired.asteroids[0].excavation) === JSON.stringify(excavation),
      'Old saves should gain the deterministic starter cavern');
    var shallowLegacy = JSON.parse(JSON.stringify(world));
    delete shallowLegacy.asteroids[0].excavation.depthM;
    assert(sim.deserializeWorld(sim.serializeWorld(shallowLegacy)).asteroids[0].excavation.depthM === 500,
      'Existing excavation saves should gain physical depth');
    repaired = sim.selectShips(repaired, ['msv-hardshell']);
    repaired = sim.issueMineOrder(repaired, repaired.asteroids[0].id);
    var order = repaired.ships.filter(function (ship) { return ship.id === 'tug-01'; })[0].order;
    assert(order.kind === 'deploy');
    var a = repaired.asteroids[0], normalizedRadius = sim.surfaceRadius(a, order.siteAngle) / a.radius * order.siteDepth;
    var siteX = Math.cos(order.siteAngle) * normalizedRadius, siteY = Math.sin(order.siteAngle) * normalizedRadius;
    assert(Math.hypot(siteX - excavation.pocketOffset.x, siteY - excavation.pocketOffset.y) > excavation.pocketRadius + 0.1,
      'Mining sites should not overlap the cavern');
  });

  test('simulation', 'dev excavation toggle preserves its geometry and round-trips through saves', function () {
    var world = createFreshWorld();
    var asteroid = world.asteroids[0], geometry = JSON.stringify(asteroid.excavation);
    world = sim.toggleAsteroidExcavation(world, asteroid.id);
    assert(world.asteroids[0].excavation.level === 1);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assert(world.asteroids[0].excavation.level === 1, 'Excavated state should survive loading');
    world = sim.toggleAsteroidExcavation(world, asteroid.id);
    assert(world.asteroids[0].excavation.level === 0);
    assert(JSON.stringify(world.asteroids[0].excavation) === geometry, 'Toggling should preserve cavern placement');
  });

  test('simulation', 'fresh fleet is stored inside the mothership and launches only on assignment', function () {
    var world = createFreshWorld();
    var home = findShip(world, 'msv-hardshell');
    ['tug-01', 'escort-01', 'escort-02'].forEach(function (id) {
      var ship = findShip(world, id);
      assert(ship.docked && ship.order.kind === 'idle', id + ' should start stored and idle');
      assertClose(ship.position.x, home.position.x);
      assertClose(ship.position.y, home.position.y);
    });
    world = sim.issueMoveOrder(sim.selectShips(world, ['tug-01']), { x: 600, y: 0 });
    world = sim.stepWorld(world, 0.5);
    var tug = findShip(world, 'tug-01');
    assert(!tug.docked && tug.launchElapsed === 0.5, 'A job should begin a one-second emergence');
    assertClose(tug.position.x, home.position.x + 36);
    world = sim.issueMoveOrder(world, { x: -500, y: 0 });
    assert(findShip(world, 'tug-01').order.target.x === 600, 'New orders must wait until emergence clears');
    world = sim.stepWorld(world, 0.5);
    tug = findShip(world, 'tug-01');
    assert(tug.launchElapsed === null && tug.position.x > 0, 'Guidance should begin once emergence clears');
  });

  test('simulation', 'hostile appearance scrambles docked fighters and returns only automatic defenders', function () {
    var world = createFreshWorld();
    findShip(world, 'escort-02').disabled = true;
    world = sim.spawnHostileWave(world);
    world = sim.stepWorld(world, 1 / 30);
    ['escort-01', 'escort-02'].forEach(function (id) {
      var fighter = findShip(world, id);
      if (id === 'escort-01') assert(fighter.order.kind === 'defend' && fighter.order.automatic, 'Available docked fighters should scramble automatically');
      else assert(fighter.disabled && fighter.order.kind === 'idle', 'Disabled fighters should not scramble');
    });
    var manual = createFreshWorld();
    manual = sim.issueDefendOrder(sim.selectShips(manual, ['escort-01']), { x: 200, y: 0 });
    manual = sim.spawnHostileWave(manual);
    manual = sim.stepWorld(manual, 1 / 30);
    assert(findShip(manual, 'escort-01').order.kind === 'defend' && !findShip(manual, 'escort-01').order.automatic,
      'A player-assigned fighter must keep its own deployment order');
    world.combat.drones = [];
    world = sim.stepWorld(world, 1 / 30);
    assert(findShip(world, 'escort-01').order.kind === 'return' && findShip(world, 'escort-01').order.automatic,
      'Automatically scrambled fighters should return when the last hostile is gone');
  });

  test('simulation', 'normalization preserves an already deployed craft in older saves', function () {
    var world = createFreshWorld();
    var tug = findShip(world, 'tug-01');
    tug.docked = false;
    tug.position = { x: 700, y: -300 };
    var loaded = sim.deserializeWorld(sim.serializeWorld(world));
    assert(!findShip(loaded, tug.id).docked, 'Loading must not force a deployed craft into internal storage');
    assertClose(findShip(loaded, tug.id).position.x, 700);
    assert(JSON.stringify(sim.deserializeWorld(sim.serializeWorld(loaded))) === JSON.stringify(loaded), 'Repeated loading should stay stable');
  });

  test('simulation', 'seeded initialization and scenario replay are deterministic without rendering', function () {
    var replay = window.Driftworks.scenario;
    var scenario = { version: 1, seed: 12345, ticks: 300, commands: [
      { tick: 0, action: 'select', args: [['tug-01']] },
      { tick: 0, action: 'move', args: [{ x: 200, y: 120 }] },
      { tick: 299, action: 'return', args: [] }
    ] };
    var a = replay.run(scenario), b = replay.run(scenario);
    assert(JSON.stringify(a) === JSON.stringify(b), 'Same seed and commands must yield identical worlds');
    assert(createDeployedWorld(12345).asteroids[0].angularVelocity !== createDeployedWorld(12346).asteroids[0].angularVelocity, 'Seed must control initialization');
    var initial = createDeployedWorld(12345), serialized = JSON.stringify(initial);
    var actual = replay.run({ version: 1, world: initial, ticks: 1, commands: scenario.commands.slice(0, 2) });
    var expected = sim.stepWorld(sim.issueMoveOrder(sim.selectShips(initial, ['tug-01']), { x: 200, y: 120 }), 1 / 30);
    assert(JSON.stringify(actual) === JSON.stringify(expected), 'Tick zero commands precede the first step, in listed order');
    assert(JSON.stringify(initial) === serialized, 'Replay must not mutate a captured world');
    assert(replay.run({ version: 1, world: initial, ticks: 0 }).elapsedSeconds === 0, 'Zero ticks must not advance');
    replay.check(actual, [{ path: 'ships.tug-01.order.kind', op: 'equal', value: 'move' }]);
    [function () { replay.check(actual, []); },
      function () { replay.check(actual, [{ path: 'ships.missing.damage', op: 'equal', value: 0 }]); },
      function () { replay.check(actual, [{ path: 'elapsedSeconds', op: 'near', value: 100, tolerance: 0.1 }]); },
      function () { replay.run({ version: 1, ticks: 1, commands: [{ tick: 1, action: 'return', args: [] }] }); },
      function () { replay.run({ version: 1, ticks: 1, commands: [{ tick: 0, action: 'typo', args: [] }] }); }
    ].forEach(function (reject) {
      var threw = false;
      try { reject(); } catch (error) { threw = true; }
      assert(threw, 'Malformed or failing scenarios must fail loudly');
    });
  });

  test('simulation', 'combat scenario replay produces the same complete world twice', function () {
    var replay = window.Driftworks.scenario;
    var scenario = { version: 1, seed: 12345, ticks: 2400, commands: [
      { tick: 0, action: 'select', args: [['escort-01', 'escort-02']] },
      { tick: 0, action: 'defend', args: [{ x: 360, y: 300 }] },
      { tick: 0, action: 'spawnHostileWave', args: [] }
    ] };
    var first = replay.run(scenario);
    var second = replay.run(scenario);
    assert(first.wrecks.length > 0 || first.ships.some(function (ship) { return ship.type === 'escort' && ship.disabled; }),
      'Determinism replay must exercise combat consequences');
    assert(JSON.stringify(first) === JSON.stringify(second),
      'Running the same combat scenario twice must produce identical complete worlds');
  });

  test('simulation', 'combat scenario matches after saving and reloading midway', function () {
    var replay = window.Driftworks.scenario;
    var commands = [
      { tick: 0, action: 'select', args: [['escort-01', 'escort-02']] },
      { tick: 0, action: 'defend', args: [{ x: 360, y: 300 }] },
      { tick: 0, action: 'spawnHostileWave', args: [] }
    ];
    var uninterrupted = replay.run({ version: 1, seed: 12345, ticks: 2400, commands: commands });
    var midpoint = replay.run({ version: 1, seed: 12345, ticks: 1200, commands: commands });
    var reloaded = sim.deserializeWorld(sim.serializeWorld(midpoint));
    var resumed = replay.run({ version: 1, world: reloaded, ticks: 1200 });
    assert(JSON.stringify(resumed) === JSON.stringify(uninterrupted),
      'A midpoint save/load must preserve the complete final combat world');
  });

  test('simulation', 'old saves gain deterministic combat defaults and repeated loading preserves encounters', function () {
    var old = createDeployedWorld(12345);
    delete old.combat;
    var repaired = sim.deserializeWorld(sim.serializeWorld(old));
    assert(repaired.combat.drones.length === 0 && repaired.combat.director.state === 'idle', 'Old saves should start with no encounters');
    var active = sim.spawnHostileWave(repaired);
    active = sim.stepWorld(active, 1 / 30);
    var loaded = sim.deserializeWorld(sim.serializeWorld(active));
    assert(JSON.stringify(loaded) === JSON.stringify(active), 'Encounter, cooldowns, RNG and IDs must survive loading');
    assert(JSON.stringify(sim.deserializeWorld(sim.serializeWorld(loaded))) === JSON.stringify(loaded), 'Loading must be idempotent');
    var spawned = sim.spawnHostileWave(loaded);
    assert(new Set(spawned.combat.drones.map(function (d) { return d.id; })).size === 6, 'Spawn IDs must remain unique across loading');
  });

  test('simulation', 'director warning and random sequence survive a save during the warning', function () {
    var world = sim.issueMineOrder(sim.selectShips(createDeployedWorld(12345), ['msv-hardshell']), 'ast-ceres-01');
    world = sim.stepWorld(world, 1 / 30);
    assert(world.combat.director.state === 'warning', 'Exposed work starts a warning');
    assert(world.combat.events.some(function (e) { return e.kind === 'contact-warning'; }), 'Warning originates in the simulation');
    var loaded = sim.deserializeWorld(sim.serializeWorld(world));
    for (var tick = 0; tick < 310; tick += 1) {
      world = sim.stepWorld(world, 1 / 30);
      loaded = sim.stepWorld(loaded, 1 / 30);
    }
    assert(world.combat.director.wavesSpawned === 1 && world.combat.drones.length > 0, 'Director spawns without Pixi');
    assert(JSON.stringify(world) === JSON.stringify(loaded), 'Warning continuation must reproduce the same wave');
  });

  test('simulation', 'battle replay matches after save/load and across render-frame groupings for 10000 ticks', function () {
    var initial = sim.spawnHostileWave(createDeployedWorld(12345));
    var a = initial, b = initial, ticks = 0, sawShot = false, sawDamage = false;
    // These are identical fixed ticks grouped as if frames ran at 30 Hz versus 5 Hz.
    while (ticks < 10000) {
      var count = Math.min(6, 10000 - ticks);
      for (var i = 0; i < count; i += 1) {
        a = sim.stepWorld(a, 1 / 30);
        sawShot = sawShot || a.combat.events.some(function (e) { return e.kind === 'weapon-fired'; });
        sawDamage = sawDamage || a.combat.events.some(function (e) { return e.kind === 'ship-damaged'; });
      }
      for (var j = 0; j < count; j += 1) b = sim.stepWorld(b, 1 / 30);
      ticks += count;
      if (ticks === 300) b = sim.deserializeWorld(sim.serializeWorld(b));
    }
    assert(sawShot && sawDamage, 'The replay must exercise weapons and damage');
    assert(JSON.stringify(a) === JSON.stringify(b), 'Frame grouping and mid-battle loading cannot affect outcomes');
    assert(initial.elapsedSeconds === 0 && initial.combat.drones.length === 3, 'Stepping must preserve the input world');
  });

  test('simulation', 'combat resolves simultaneous lethal fire once and leaves a recoverable wreck', function () {
    var world = sim.spawnHostileWave(createDeployedWorld(42));
    world.ships = world.ships.filter(function (ship) { return ship.id !== 'escort-02'; });
    var fighter = findShip(world, 'escort-01');
    fighter.damage = 0.8;
    var drone = world.combat.drones[0];
    world.combat.drones = [drone];
    drone.position = { x: fighter.position.x + 100, y: fighter.position.y };
    drone.underFire = 1.34;
    drone.fireCooldown = 0;
    var next = sim.stepWorld(world, 1 / 30);
    assert(findShip(next, fighter.id).disabled, 'A drone killed this tick still gets its final shot');
    assert(next.combat.drones.length === 0 && next.wrecks.length === 1, 'A fighter disabled this tick still completes its laser dwell');
    assert(next.combat.events.filter(function (e) { return e.kind === 'ship-destroyed'; }).length === 1, 'Destruction emits once');
    var later = sim.stepWorld(next, 1 / 30);
    assert(later.wrecks.length === 1 && later.combat.events.length === 0, 'Events and salvage must not repeat on later ticks');
  });

  test('simulation', 'disabled fighters and destroyed wrecks keep coasting on their last vectors', function () {
    var world = createDeployedWorld();
    var fighter = findShip(world, 'escort-01');
    fighter.position = { x: 100, y: 200 };
    fighter.velocity = { x: 12, y: -4 };
    world = sim.damageFighter(world, fighter.id, 1);
    fighter = findShip(world, fighter.id);
    assertClose(fighter.velocity.x, 12);
    assertClose(fighter.velocity.y, -4);
    world = sim.stepWorld(world, 2);
    fighter = findShip(world, fighter.id);
    assertClose(fighter.position.x, 124);
    assertClose(fighter.position.y, 192);
    assertClose(fighter.velocity.x, 12);
    assertClose(fighter.velocity.y, -4);

    world = sim.addWreck(world, { position: { x: 10, y: 20 }, velocity: { x: -3, y: 5 } });
    world = sim.stepWorld(world, 2);
    assertClose(world.wrecks[0].position.x, 4);
    assertClose(world.wrecks[0].position.y, 30);
    assertClose(world.wrecks[0].velocity.x, -3);
    assertClose(world.wrecks[0].velocity.y, 5);

    world.wrecks.push({ id: 'legacy-stationary-wreck', position: { x: 7, y: 9 } });
    world = sim.stepWorld(world, 2);
    assertClose(world.wrecks[1].position.x, 7);
    assertClose(world.wrecks[1].position.y, 9);
  });

  test('simulation', 'seeded RNG produces deterministic output', function () {
    var a = sim.createRng(1234);
    var b = sim.createRng(1234);
    var valuesA = [a(), a(), a(), a()];
    var valuesB = [b(), b(), b(), b()];
    assert(JSON.stringify(valuesA) === JSON.stringify(valuesB), 'Matching seeds should match exactly');
    assertClose(valuesA[0], 0.07329497812315822);
  });

  test('simulation', 'fixed-step advancement is deterministic', function () {
    var world = sim.issueMoveOrder(sim.selectShips(createDeployedWorld(), ['tug-01']), { x: 100, y: -90 });
    var a = sim.stepWorld(sim.stepWorld(world, 1 / 30), 1 / 30);
    var b = sim.stepWorld(sim.stepWorld(world, 1 / 30), 1 / 30);
    assert(JSON.stringify(a) === JSON.stringify(b), 'Repeated stepping from the same state should match');
    assert(a.elapsedSeconds > world.elapsedSeconds, 'Simulation clock should advance');
  });

  test('simulation', 'move orders transition to arrival', function () {
    var world = sim.issueMoveOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 240, y: -125 });
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

  test('simulation', 'acceleration limits sudden direction reversal', function () {
    var world = sim.selectShips(createDeployedWorld(), ['tug-01']);
    var miner = findShip(world, 'tug-01');
    miner.position = { x: 0, y: 0 };
    miner.previousPosition = { x: 0, y: 0 };
    miner.velocity = { x: miner.speed, y: 0 };
    world = sim.issueMoveOrder(world, { x: -300, y: 0 });
    world = sim.stepWorld(world, 1 / 30);
    miner = findShip(world, 'tug-01');
    assert(miner.velocity.x > 0, 'Miner should not instantly reverse horizontal velocity');
  });

  test('simulation', 'industrial loads reduce acceleration through mass while retaining guidance speed', function () {
    ['tug-01'].forEach(function (id) {
      function cruise(load, ticks) {
        var world = sim.selectShips(createDeployedWorld(), [id]);
        var ship = findShip(world, id);
        ship.cargo = 1500 * load;
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
      assert(loaded.acceleration < empty.acceleration, 'Wet payload mass must reduce acceleration');
      if (id === 'tug-01') {
        var half = findShip(cruise(0.5, 1), id);
        assert(half.acceleration > loaded.acceleration && half.acceleration < empty.acceleration, 'Partial ore load should have an intermediate penalty');
      }
      loaded.cargo = 0;
      loaded.carryingSection = false;
      for (var i = 0; i < 180; i += 1) loadedWorld = sim.stepWorld(loadedWorld, 1 / 30);
      assertClose(findShip(loadedWorld, id).velocity.x, empty.velocity.x);
    });
  });

  test('simulation', 'picking up cargo does not instantly clamp existing velocity', function () {
    var world = sim.selectShips(createDeployedWorld(), ['tug-01']);
    var miner = findShip(world, 'tug-01');
    miner.velocity = { x: miner.speed, y: 0 };
    miner.cargo = miner.cargoCapacity;
    world = sim.issueMoveOrder(world, { x: miner.position.x + 10000, y: miner.position.y });
    var next = findShip(sim.stepWorld(world, 1 / 30), 'tug-01');
    assertClose(next.velocity.x, miner.speed);
    assert(miner.speed - next.velocity.x <= miner.acceleration / 30, 'Loaded ship should decelerate gradually');
  });

  test('simulation', 'rotation limits sudden in-place facing changes', function () {
    var world = sim.selectShips(createDeployedWorld(), ['escort-01']);
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

  test('simulation', 'rotateToward uses the shortest wrapped angle', function () {
    var current = Math.PI - 0.02;
    var target = -Math.PI + 0.02;
    var next = sim.rotateToward(current, target, 0.03);
    assert(next > current, 'Wrapped target should rotate through +pi instead of the long way around');
    assertClose(sim.angleDelta(next, target), 0.01);
  });

  test('simulation', 'platform deployment waits through setup before extraction while carrier returns empty', function () {
    var world = sim.issueMineOrder(sim.selectShips(createDeployedWorld(), ['msv-hardshell']), 'ast-ceres-01');
    for (var i = 0; i < 1500; i++) world = sim.stepWorld(world, 1 / 30);
    assert(world.platforms[0].state === 'setting-up');
    assert(world.asteroids[0].ore === world.asteroids[0].oreInitial, 'No ore is mined during setup');
    for (i = 0; i < 6700; i++) world = sim.stepWorld(world, 1 / 30);
    assert(world.platforms[0].state === 'deployed');
    assert(world.asteroids[0].ore < world.asteroids[0].oreInitial);
    assert(findShip(world, 'tug-01').cargo === 0);
    assert(findShip(world, 'tug-01').docked);
  });

  test('simulation', 'hostile waves begin beyond the local map and approach from their entry bearing', function () {
    var world = createFreshWorld();
    var target = findShip(world, 'msv-hardshell').position;
    world = sim.spawnHostileWave(world);
    assert(world.combat.drones.length === 3, 'A debug wave should contain three raiders');
    world.combat.drones.forEach(function (drone) {
      var dx = drone.position.x - target.x, dy = drone.position.y - target.y;
      assert(Math.hypot(dx, dy) > 4700, 'Raiders should begin far enough out for sensor tracks to develop');
      assert(dx * drone.velocity.x + dy * drone.velocity.y < 0, 'Initial velocity should carry raiders inward');
    });
    var before = world.combat.drones.map(function (drone) {
      return Math.hypot(drone.position.x - target.x, drone.position.y - target.y);
    });
    world = sim.stepWorld(world, 1 / 30);
    world.combat.drones.forEach(function (drone, index) {
      assert(Math.hypot(drone.position.x - target.x, drone.position.y - target.y) < before[index],
        'Raiders should approach continuously rather than appearing at the battle line');
    });
  });

  test('simulation', 'platform transfer holds a zero-relative-velocity rendezvous for fifteen physical minutes', function () {
    var world = sim.issueMineOrder(sim.selectShips(createDeployedWorld(), ['msv-hardshell']), 'ast-ceres-01');
    var carrier;
    for (var i = 0; i < 2500; i += 1) {
      world = sim.stepWorld(world, 1 / 30);
      carrier = findShip(world, 'tug-01');
      if (carrier.cargoOperation) break;
    }
    assert(carrier.cargoOperation && carrier.cargoOperation.kind === 'deploy-platform', 'EVA handling should start after rendezvous');
    assert(world.platforms[0].state === 'carried', 'Platform must remain strapped on during handling');
    world = sim.deserializeWorld(sim.serializeWorld(world));
    var before = findShip(world, 'tug-01').cargoOperation.remainingSeconds;
    world = sim.stepWorld(world, 1 / 30);
    carrier = findShip(world, 'tug-01');
    assertClose(carrier.cargoOperation.remainingSeconds, before - 2);
    var asteroid = world.asteroids[0], platform = world.platforms[0];
    var angle = carrier.order.siteAngle + asteroid.rotation;
    var radius = sim.surfaceRadius(asteroid, carrier.order.siteAngle) * carrier.order.siteDepth;
    assertClose(carrier.position.x, asteroid.position.x + Math.cos(angle) * radius);
    assertClose(carrier.position.y, asteroid.position.y + Math.sin(angle) * radius);
    assertClose(carrier.velocity.x, -Math.sin(angle) * radius * asteroid.angularVelocity);
    assertClose(carrier.velocity.y, Math.cos(angle) * radius * asteroid.angularVelocity);
    for (i = 0; i < 500 && world.platforms[0].state === 'carried'; i += 1) world = sim.stepWorld(world, 1 / 30);
    assert(world.platforms[0].state === 'setting-up', 'Platform should release after the handling timer');
  });

  test('simulation', 'ore packets deliver platform production to mothership storage', function () {
    var world = sim.issueMineOrder(sim.selectShips(createDeployedWorld(), ['msv-hardshell']), 'ast-ceres-01');
    var guard = 0;
    while (world.mothership.storage.ore <= 0 && guard < 9000) {
      world = sim.stepWorld(world, 1 / 30);
      guard += 1;
    }
    assert(world.mothership.storage.ore > 0, 'Mothership should receive ore');
    assert(findShip(world, 'tug-01').cargo === 0, 'Miner cargo should empty after deposit');
  });

  test('simulation', 'mothership processes ore into depot construction sections', function () {
    var world = createDeployedWorld();
    world.mothership.storage.ore = 1500;
    world = sim.stepWorld(world, 1 / 30);
    assertClose(world.mothership.storage.ore, 0);
    assertClose(world.mothership.storage.depotSections, 1);
    assertClose(world.mothership.storage.constructionMass, 0);
  });

  test('simulation', 'tug carries a fabricated section to the depot site', function () {
    var world = createDeployedWorld();
    world.mothership.storage.depotSections = 1;
    world = sim.issueBuildOrder(sim.selectShips(world, ['tug-01']));
    var guard = 0;
    while (world.depot.builtStages < 1 && guard < 1200) {
      world = sim.stepWorld(world, 1 / 30);
      guard += 1;
    }
    assert(world.depot.builtStages === 1, 'Tug should deliver one depot section');
    assert(world.mothership.storage.depotSections === 0, 'Delivered section should leave mothership storage');
    assert(findShip(world, 'tug-01').carryingSection === false, 'Tug should no longer carry the section');
  });

  test('simulation', 'escorts can engage the same hostile with independent laser timers', function () {
    var escorts = createDeployedWorld().ships.filter(function (ship) { return ship.type === 'escort'; });
    escorts.forEach(function (ship) { ship.position = { x: 0, y: 0 }; });
    var drone = { id: 'shared-target', position: { x: 100, y: 0 } };
    var timers = {};
    var first = sim.stepDefenderWeapon(escorts[0], [drone], timers, 0.01);
    var second = sim.stepDefenderWeapon(escorts[1], [drone], timers, 0.01);
    assert(first.target === drone && second.target === drone, 'Both escorts should engage the same hostile');
    assert(first.paint && second.paint, 'Both escorts should visibly fire on the same frame');
    assert(!sim.stepDefenderWeapon(escorts[0], [drone], timers, 0.02).paint, 'First escort should respect its own laser cadence');
    assert(sim.stepDefenderWeapon(escorts[1], [drone], timers, 0.08).paint, 'Second escort should fire independently of the first timer');
    assert(sim.stepDefenderWeapon(escorts[0], [], timers, 0.1) === null, 'Destroyed targets should not remain reserved');
    drone.position.x = 1000;
    assert(sim.stepDefenderWeapon(escorts[0], [drone], timers, 0.1) === null, 'Escorts must still respect weapon range');
  });

  test('simulation', 'destroyed drones persist as distinct salvage wrecks across save and camera changes', function () {
    var world = createDeployedWorld();
    var destroyed = { position: { x: 300, y: 100 }, velocity: { x: 10, y: -5 } };
    world = sim.addWreck(sim.addWreck(world, destroyed), destroyed);
    assert(world.wrecks.length === 2 && world.wrecks[0].id !== world.wrecks[1].id, 'Each wreck needs a stable unique identity');
    var restored = sim.deserializeWorld(sim.serializeWorld(world));
    restored = game.withCamera(restored, { x: 100, y: 100, zoom: 2 });
    assert(JSON.stringify(restored.wrecks) === JSON.stringify(world.wrecks), 'Camera and save changes must preserve wrecks');
  });

  test('simulation', 'hauler picks up a wreck beneath its frame and salvages it exactly once', function () {
    var world = sim.addWreck(createDeployedWorld(), { position: { x: 165, y: 120 }, velocity: { x: 0, y: 1 } });
    world = sim.issueContextOrder(sim.selectShips(world, ['tug-01']), world.wrecks[0].position);
    assert(findShip(world, 'tug-01').order.kind === 'recover', 'Right-click should dispatch recovery');
    for (var rendezvousTick = 0; rendezvousTick < 300 && !findShip(world, 'tug-01').cargoOperation; rendezvousTick += 1) {
      world = sim.stepWorld(world, 1 / 30);
    }
    var hauler = findShip(world, 'tug-01');
    assert(hauler.cargoOperation && hauler.cargoOperation.kind === 'recover', 'Matched wreck pickup should begin EVA securing');
    assertClose(hauler.position.x, world.wrecks[0].position.x);
    assertClose(hauler.position.y, world.wrecks[0].position.y);
    assertClose(hauler.velocity.x, world.wrecks[0].velocity.x);
    assertClose(hauler.velocity.y, world.wrecks[0].velocity.y);
    assert(!hauler.towTarget && !world.wrecks[0].towedBy, 'Wreck must remain free until securing finishes');
    world = sim.deserializeWorld(sim.serializeWorld(world));
    for (var handlingTick = 0; handlingTick < 500 && !findShip(world, 'tug-01').towTarget; handlingTick += 1) {
      world = sim.stepWorld(world, 1 / 30);
    }
    hauler = findShip(world, 'tug-01');
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
    assertClose(sim.physicalStats(world, hauler).massKg, 3075000 + hauler.propulsion.fuelKg);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    world = sim.issueReturnOrder(world);
    for (var tick = 0; tick < 1500; tick += 1) world = sim.stepWorld(world, 1 / 30);
    assert(!world.wrecks.some(function (wreck) { return wreck.id === 'wreck-1'; }), 'Delivered wreck should disappear even when combat creates new wrecks');
    assertClose(world.recovery.salvagedOre, 24);
    assertClose(world.mothership.storage.ore + world.mothership.storage.constructionMass, 24);
    assert(!findShip(world, 'tug-01').towTarget, 'Hauler should be free after delivery');
  });

  test('simulation', 'salvage-all is opt-in and sends the tug for every recoverable target', function () {
    var world = createDeployedWorld();
    world.combat.director.wavesSpawned = 3;
    world = sim.addWreck(world, { position: { x: 165, y: 120 }, velocity: { x: 0, y: 0 } });
    world = sim.addWreck(world, { position: { x: 175, y: 120 }, velocity: { x: 0, y: 0 } });
    assert(findShip(world, 'tug-01').order.kind === 'idle', 'The tug should not salvage automatically');
    world = sim.issueSalvageAllOrder(sim.selectShips(world, ['tug-01']));
    assert(findShip(world, 'tug-01').order.kind === 'recover' && findShip(world, 'tug-01').order.salvageAll,
      'Explicit salvage-all should begin a recovery trip');
    for (var i = 0; i < 6000 && world.wrecks.length; i += 1) world = sim.stepWorld(world, 1 / 30);
    assert(world.wrecks.length === 0, 'The tug should deliver every untowed wreck in successive trips');
    assertClose(world.recovery.salvagedOre, 48);
    assert(findShip(world, 'tug-01').docked, 'The tug should finish at the mothership');
  });

  test('simulation', 'disabled fighters cannot move or fire and recover after being carried home', function () {
    var world = createDeployedWorld();
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
    assert(sim.stepDefenderWeapon(fighter, [{ position: fighter.position }], {}, 1) === null, 'Disabled fighter must not shoot');
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

  test('simulation', 'recovery approach builds speed and arrives from a distance', function () {
    var world = sim.addWreck(createDeployedWorld(), { position: { x: 400, y: 120 }, velocity: { x: 1, y: 0 } });
    world = sim.issueContextOrder(sim.selectShips(world, ['tug-01']), world.wrecks[0].position);
    for (var i = 0; i < 30; i += 1) world = sim.stepWorld(world, 1 / 30);
    assert(findShip(world, 'tug-01').velocity.x > 35, 'Approach should retain velocity between ticks');
    for (var j = 0; j < 1500 && !findShip(world, 'tug-01').towTarget; j += 1) world = sim.stepWorld(world, 1 / 30);
    assert(findShip(world, 'tug-01').towTarget, 'Hauler should rendezvous and secure a nearby wreck');
  });

  test('simulation', 'repaired fighters launch slowly from inside the mothership before accepting orders', function () {
    var world = sim.damageFighter(createDeployedWorld(), 'escort-01', 1);
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

  test('simulation', 'recovery cannot double-claim a wreck or stack payloads', function () {
    var world = sim.addWreck(createDeployedWorld(), { position: { x: 165, y: 120 }, velocity: { x: 1, y: 0 } });
    world.ships.push(sim.createShip('tug-02', 'Second Hauler', 'tug', 160, 120, 62));
    world = sim.issueContextOrder(sim.selectShips(world, ['tug-01', 'tug-02']), world.wrecks[0].position);
    for (var rendezvousTick = 0; rendezvousTick < 300 && !world.ships.some(function (ship) { return ship.cargoOperation; }); rendezvousTick += 1) {
      world = sim.stepWorld(world, 1 / 30);
    }
    assert(world.ships.filter(function (ship) { return ship.cargoOperation; }).length === 1, 'Only one hauler can secure each wreck');
    for (var claimTick = 0; claimTick < 500 && !world.ships.some(function (ship) { return ship.towTarget; }); claimTick += 1) {
      world = sim.stepWorld(world, 1 / 30);
    }
    assert(world.ships.filter(function (ship) { return ship.towTarget; }).length === 1, 'Only the securing hauler can attach the wreck');
    var loaded = findShip(world, 'tug-01');
    world = sim.issueBuildOrder(sim.selectShips(world, [loaded.id]));
    assert(findShip(world, loaded.id).order.kind === 'return', 'Carried hull prevents accepting a module');
    var other = findShip(world, 'tug-02');
    other.carryingSection = true;
    world = sim.addWreck(world, { position: { x: 400, y: 100 }, velocity: { x: 1, y: 0 } });
    world = sim.issueContextOrder(sim.selectShips(world, [other.id]), world.wrecks[1].position);
    assert(findShip(world, other.id).order.kind !== 'recover', 'Carried module prevents accepting a hull');
  });

  test('simulation', 'legacy saves receive empty recovery defaults', function () {
    var world = createDeployedWorld();
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

  test('simulation', 'operation exposure starts quiet and rises with industrial work', function () {
    var world = createDeployedWorld();
    assertClose(sim.operationExposure(world), 0);
    world = sim.issueMineOrder(sim.selectShips(world, ['msv-hardshell']), 'ast-ceres-01');
    assert(sim.operationExposure(world) > 0, 'Mining work should expose the operation to contact risk');
    world.mothership.storage.depotSections = 1;
    assert(sim.operationExposure(world) > 1, 'Ready construction sections should add operational exposure');
  });

  test('simulation', 'salvage-all intercepts a wreck moving faster than the tug work-zone speed', function () {
    var world = sim.addWreck(createDeployedWorld(), {
      position: { x: 400, y: 120 }, velocity: { x: 82, y: 0 }
    });
    world = sim.issueSalvageAllOrder(sim.selectShips(world, ['tug-01']));
    for (var i = 0; i < 1800 && !findShip(world, 'tug-01').cargoOperation; i += 1) {
      world = sim.stepWorld(world, 1 / 30);
    }
    var hauler = findShip(world, 'tug-01');
    var wreck = world.wrecks[0];
    assert(hauler.cargoOperation && hauler.cargoOperation.kind === 'recover',
      'Moving-frame guidance should catch a fast outbound wreck');
    assertClose(hauler.position.x, wreck.position.x);
    assertClose(hauler.position.y, wreck.position.y);
    assertClose(hauler.velocity.x, wreck.velocity.x);
    assertClose(hauler.velocity.y, wreck.velocity.y);
  });

  test('simulation', 'gameplay landing persists, attaches to the rotating site and gates setup', function () {
    var world=sim.createInitialWorld(),p=world.platforms[0],a=world.asteroids[0];
    p.state='setting-up';p.asteroidId=a.id;p.siteAngle=0;p.siteDepth=.5;
    p.setupRemainingSeconds=10800;p.landingElapsedSeconds=0;p.landingReleaseRotation=a.rotation;p.landingSitePending=true;
    var start=JSON.stringify(world),next=sim.stepWorld(world,1);
    assert(JSON.stringify(world)===start,'Public stepping must replace the world');
    assertClose(next.platforms[0].landingElapsedSeconds,1);
    assertClose(next.platforms[0].setupRemainingSeconds,10800);
    assert(!next.platforms[0].landingSitePending,'The game chooses a free nearby footprint');
    var loaded=sim.deserializeWorld(sim.serializeWorld(next));
    loaded=sim.deserializeWorld(sim.serializeWorld(loaded));
    assertClose(loaded.platforms[0].landingElapsedSeconds,1);
    next=sim.stepWorld(loaded,20);assertClose(next.platforms[0].landingElapsedSeconds,21);
    assertClose(game.platformDeployment(next.platforms[0]),1);
    assertClose(next.platforms[0].setupRemainingSeconds,10800);
    next=sim.stepWorld(next,17);assertClose(next.platforms[0].landingElapsedSeconds,38);
    assertClose(next.platforms[0].setupRemainingSeconds,10800);
    next=sim.stepWorld(next,1);assertClose(next.platforms[0].setupRemainingSeconds,10740);
    var runtime=window.Driftworks.miningLanding;
    assert(runtime.sample(32).contact && runtime.sample(32).ramps===0);
    assert(runtime.sample(38).done && runtime.sample(38).ramps===1);
    delete next.platforms[0].landingElapsedSeconds;
    loaded=sim.deserializeWorld(sim.serializeWorld(next));
    assert(loaded.platforms[0].landingElapsedSeconds===undefined,'Old saves retain setup instead of replaying a landing');
    assertClose(loaded.platforms[0].setupRemainingSeconds,10740);
  });

  test('simulation', 'save serialization round-trips world state', function () {
    var world = sim.issueMoveOrder(sim.selectShips(createDeployedWorld(), ['tug-01']), { x: -40, y: 90 });
    var restored = sim.deserializeWorld(sim.serializeWorld(world));
    assert(JSON.stringify(restored) === JSON.stringify(world), 'Restored world should match saved world');
  });

  test('simulation', 'unsupported save versions are rejected', function () {
    var rejected = false;
    try {
      sim.deserializeWorld(JSON.stringify({ version: 99, world: createDeployedWorld() }));
    } catch (error) {
      rejected = /Unsupported Driftworks save version/.test(error.message);
    }
    assert(rejected, 'Unsupported versions should throw a useful error');
  });

  test('simulation', 'short move orders accelerate instead of teleporting within the old arrival radius', function () {
    var world = createDeployedWorld();
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

  test('simulation', 'deployed platforms retain rotating surface sites across saves', function () {
    [-0.012, 0.012].forEach(function (spin) {
      var world = createDeployedWorld(); world.asteroids[0].angularVelocity = spin;
      world = sim.issueMineOrder(sim.selectShips(world, ['msv-hardshell']), world.asteroids[0].id);
      for (var i = 0; i < 1200; i++) world = sim.stepWorld(world, 1 / 30);
      assert(world.platforms[0].state === 'setting-up');
      world = sim.deserializeWorld(sim.serializeWorld(world));
      world = sim.stepWorld(world, 1);
      var p = world.platforms[0], a = world.asteroids[0], angle = p.siteAngle + a.rotation;
      var landing=window.Driftworks.miningLanding.sample(p.landingElapsedSeconds);
      var dx=landing.offset[0]/sim.METERS_PER_UNIT,dy=landing.offset[1]/sim.METERS_PER_UNIT;
      assertClose(p.position.x, a.position.x + Math.cos(angle) * (sim.surfaceRadius(a, p.siteAngle) * p.siteDepth+dx)-Math.sin(angle)*dy);
      assertClose(p.position.y, a.position.y + Math.sin(angle) * (sim.surfaceRadius(a, p.siteAngle) * p.siteDepth+dx)+Math.cos(angle)*dy);
      assertClose(a.radius, 300);
    });
  });

  test('simulation', 'legacy fields merge ore into one large asteroid', function () {
    var world = createDeployedWorld();
    world.asteroids.push(sim.createAsteroid('old', 'Old rock', 100, 100, 80));
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assert(world.asteroids.length === 1);
    assertClose(world.asteroids[0].ore, 10205);
  });

  test('simulation', 'mothership dispatches the existing cargo ship and rejects duplicate jobs', function () {
    var world = createDeployedWorld();
    assert(world.ships.length === 4 && world.ships.every(function (s) { return s.type !== 'miner' && s.type !== 'cargo'; }));
    assert(world.platforms.every(function (p) { return p.state === 'stored'; }));
    world = sim.issueMineOrder(sim.selectShips(world, ['msv-hardshell']), 'ast-ceres-01');
    var carrier = findShip(world, 'tug-01');
    assert(carrier.order.kind === 'deploy' && !carrier.platformId, 'Cargo ship must collect platform at mothership first');
    assert(carrier.order.siteDepth >= 0.3 && carrier.order.siteDepth <= 0.75);
    var order = JSON.stringify(carrier.order);
    assert(!sim.canDeployPlatform(world));
    world = sim.issueMineOrder(world, 'ast-ceres-01');
    assert(JSON.stringify(findShip(world, 'tug-01').order) === order);
  });

  test('simulation', 'physical scale and payload masses have canonical values', function () {
    var world = createDeployedWorld();
    var miner = findShip(world, 'tug-01');
    assertClose(sim.asteroidPhysicalStats(world.asteroids[0]).diameterM, 10000);
    assertClose(sim.physicalStats(world, miner).accelerationMps2, 588399 / 3450000);
    miner.cargo = 1500;
    assertClose(sim.physicalStats(world, miner).massKg, 4950000);
    assertClose(sim.physicalStats(world, miner).accelerationMps2, 588399 / 4950000);
    miner.cargo = 0;
    var tug = findShip(world, 'tug-01');
    var fighter = findShip(world, 'escort-01');
    fighter.disabled = true;
    tug.towTarget = { kind: 'ship', id: fighter.id };
    assertClose(sim.physicalStats(world, tug).massKg, 3537000);
    fighter.physical.dryMassKg = 3000000;
    assertClose(sim.physicalStats(world, tug).accelerationMps2, 588399 / 6462000);
  });

  test('simulation', 'legacy physical-unit migration preserves load fraction and runs once', function () {
    var world = createDeployedWorld();
    delete world.physicalUnitsVersion;
    world.asteroids[0].ore = 540;
    world.asteroids[0].oreInitial = 540;
    world.contract.quotaOre = 240;
    var miner = findShip(world, 'tug-01');
    delete miner.physical;
    miner.cargo = 40;
    miner.cargoCapacity = 80;
    world.mothership.storage.constructionMass = 40;
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assertClose(findShip(world, 'tug-01').cargo, 750);
    assertClose(world.asteroids[0].ore, 10125);
    assertClose(world.mothership.storage.constructionMass, 750);
    assertClose(world.contract.quotaOre, 4500);
    assert(JSON.stringify(sim.deserializeWorld(sim.serializeWorld(world))) === JSON.stringify(world));
  });

  test('simulation', 'fighter groups form up and retain their defense anchor', function () {
    for (var count = 2; count <= 7; count += 1) {
      var world = createDeployedWorld();
      while (world.ships.filter(function (s) { return s.type === 'escort'; }).length < count) world = sim.spawnFighter(world);
      var ids = world.ships.filter(function (s) { return s.type === 'escort'; }).map(function (s) { return s.id; });
      world = game.issueVisualContextOrder(sim.selectShips(world, ids), { x: 900, y: -500 });
      for (var i = 0; i < 600; i += 1) world = sim.stepWorld(world, 1 / 30);
      var slots = {};
      ids.forEach(function (id) {
        var s = findShip(world, id);
        assert(s.order.kind === 'defend');
        assert(Math.hypot(s.position.x - s.order.target.x, s.position.y - s.order.target.y) < 6.1, 'Formation should settle within slot tolerance');
        slots[s.order.offset.x + ':' + s.order.offset.y] = true;
      });
      assert(Object.keys(slots).length === count, 'Each fighter needs a distinct slot');
    }
  });

  test('simulation', 'fighters slide at the leash and return after threats leave', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    deployTestFormation(world);
    var s = findShip(world, 'escort-01');
    s.position = { x: sim.FIGHTER_LEASH - 1, y: 0 };
    var startY = s.position.y;
    for (var i = 0; i < 300; i += 1) {
      s = findShip(world, s.id);
      var threat = { position: { x: s.position.x - 50, y: s.position.y } };
      world = sim.stepWorld(world, 1 / 30, [threat]);
      s = findShip(world, s.id);
      assert(Math.hypot(s.position.x, s.position.y) <= sim.FIGHTER_LEASH + 35, 'Guidance should stay near leash without teleporting');
    }
    assert(Math.abs(s.position.y - startY) > 50, 'Must slide instead of stopping at boundary');
    for (i = 0; i < 600; i += 1) world = sim.stepWorld(world, 1 / 30);
    s = findShip(world, s.id);
    assert(Math.hypot(s.position.x, s.position.y) < 14, 'Must reclaim the anchor neighborhood');
  });

  test('simulation', 'ship defense follows its anchor and survives saves', function () {
    var world = createDeployedWorld();
    var miner = findShip(world, 'tug-01');
    world = game.issueVisualContextOrder(sim.selectShips(world, ['escort-01']), miner.position);
    assert(findShip(world, 'escort-01').order.anchorShipId === miner.id);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    findShip(world, miner.id).position.x += 100;
    world = sim.stepWorld(world, 1 / 30);
    assertClose(findShip(world, 'escort-01').order.anchor.x, miner.position.x + 100);
  });

  test('simulation', 'formation travels together at the slower wingmate pace', function () {
    var world = createDeployedWorld();
    findShip(world, 'escort-02').speed = 55;
    world = sim.issueDefendOrder(sim.selectShips(world, ['escort-01', 'escort-02']), { x: 1800, y: -150 });
    var arrival = {};
    for (var i = 0; i < 1600; i += 1) {
      world = sim.stepWorld(world, 1 / 30);
      var a = findShip(world, 'escort-01'), b = findShip(world, 'escort-02');
      if (i > 120) {
        var ax = a.position.x - a.order.offset.x, ay = a.position.y - a.order.offset.y;
        var bx = b.position.x - b.order.offset.x, by = b.position.y - b.order.offset.y;
        assert(Math.hypot(ax - bx, ay - by) < 20, 'Fast fighter must stay within a loose formation throughout transit');
      }
      [a, b].forEach(function (s) {
        if (!arrival[s.id] && Math.hypot(s.position.x - s.order.anchor.x - s.order.offset.x, s.position.y - s.order.anchor.y - s.order.offset.y) < 15) arrival[s.id] = i;
      });
    }
    assert(arrival['escort-01'] && arrival['escort-02'], 'Both fighters must reach the destination');
    assert(Math.abs(arrival['escort-01'] - arrival['escort-02']) <= 30, 'Wingmates should arrive within one second');
  });

  test('simulation', 'formation waits for stragglers and releases disabled wingmates', function () {
    var world = createDeployedWorld();
    findShip(world, 'escort-02').position.x = -700;
    world = sim.issueDefendOrder(sim.selectShips(world, ['escort-01', 'escort-02']), { x: 1800, y: 0 });
    var start = findShip(world, 'escort-01').order.formation.position.x;
    for (var i = 0; i < 30; i += 1) world = sim.stepWorld(world, 1 / 30);
    assertClose(findShip(world, 'escort-01').order.formation.position.x, start);
    world = sim.damageFighter(world, 'escort-02', 1);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    for (i = 0; i < 900; i += 1) world = sim.stepWorld(world, 1 / 30);
    var s = findShip(world, 'escort-01');
    assert(Math.hypot(s.position.x - s.order.anchor.x - s.order.offset.x, s.position.y - s.order.anchor.y - s.order.offset.y) < 14, 'Survivor must continue without waiting forever');
  });

  test('simulation', 'fighter slot tolerance leaves small deviations alone and corrects large ones', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    for (var i = 0; i < 600; i += 1) world = sim.stepWorld(world, 1 / 30);
    var s = findShip(world, 'escort-01');
    s.position = { x: s.order.target.x + 3, y: s.order.target.y };
    s.velocity = { x: 0, y: 0 };
    var start = { x: s.position.x, y: s.position.y };
    for (i = 0; i < 60; i += 1) world = sim.stepWorld(world, 1 / 30);
    s = findShip(world, s.id);
    assert(Math.hypot(s.position.x - start.x, s.position.y - start.y) < 0.01, 'Harmless slot deviation must not trigger correction');
    s.position.x += 40;
    for (i = 0; i < 180; i += 1) world = sim.stepWorld(world, 1 / 30);
    s = findShip(world, s.id);
    assert(Math.hypot(s.position.x - s.order.target.x, s.position.y - s.order.target.y) < 6.1, 'Large errors must still be corrected');
    var saved = sim.deserializeWorld(sim.serializeWorld(world));
    assert(JSON.stringify(sim.stepWorld(saved, 1 / 30)) === JSON.stringify(sim.stepWorld(world, 1 / 30)), 'Style must remain deterministic across saves');
  });

  test('simulation', 'combat loosens the wing gradually without reassigning slots', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01', 'escort-02']), { x: 0, y: 0 });
    for (var i = 0; i < 600; i += 1) world = sim.stepWorld(world, 1 / 30);
    var slots = world.ships.filter(function (s) { return s.type === 'escort'; }).map(function (s) { return JSON.stringify(s.order.offset); });
    var threats = [{ position: { x: 200, y: 0 } }];
    world = sim.stepWorld(world, 1 / 30, threats);
    assert(findShip(world, 'escort-01').order.formation.looseness < 0.05, 'Combat transition should not jump');
    for (i = 0; i < 180; i += 1) world = sim.stepWorld(world, 1 / 30, threats);
    assert(findShip(world, 'escort-01').order.formation.looseness > 0.9, 'Nearby threats should open the formation');
    for (i = 0; i < 900; i += 1) world = sim.stepWorld(world, 1 / 30);
    world.ships.filter(function (s) { return s.type === 'escort'; }).forEach(function (s, index) {
      assert(JSON.stringify(s.order.offset) === slots[index], 'Nominal slots must remain stable');
      assert(s.order.formation.looseness < 0.01, 'Wing should tighten after combat');
      assert(Math.hypot(s.position.x - s.order.target.x, s.position.y - s.order.target.y) < 6.1, 'Wing should regroup within tolerance');
    });
  });

  test('simulation', 'defender kites a closing raider before entering its firing range', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    deployTestFormation(world);
    var s = findShip(world, 'escort-01');
    s.position = { x: 0, y: 0 };
    s.velocity = { x: 80, y: 0 }; // Already approaching: the AI must brake proactively.
    var threat = { position: { x: 290, y: 0 }, velocity: { x: -60, y: 0 } };
    var firingFrames = 0;
    for (var i = 0; i < 150; i += 1) {
      s = findShip(world, s.id);
      var dx = s.position.x - threat.position.x, dy = s.position.y - threat.position.y, d = Math.hypot(dx, dy);
      threat.velocity = { x: dx / d * 60, y: dy / d * 60 };
      world = sim.stepWorld(world, 1 / 30, [threat]);
      threat.position.x += threat.velocity.x / 30; threat.position.y += threat.velocity.y / 30;
      s = findShip(world, s.id);
      var gap = Math.hypot(s.position.x - threat.position.x, s.position.y - threat.position.y);
      assert(gap > sim.RAIDER_RANGE, 'Defender should avoid raider fire throughout approach');
      if (gap <= sim.FIGHTER_RANGE) firingFrames += 1;
    }
    assert(firingFrames > 100, 'Kiting must retain enough range to return fire');
  });

  test('simulation', 'defender avoids retreating into a second raider', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    deployTestFormation(world);
    var s = findShip(world, 'escort-01');
    s.position = { x: 0, y: 0 };
    var threats = [{ position: { x: 230, y: 0 } }, { position: { x: -240, y: 0 } }];
    for (var i = 0; i < 60; i += 1) {
      world = sim.stepWorld(world, 1 / 30, threats);
      s = findShip(world, s.id);
      threats.forEach(function (t) { assert(Math.hypot(t.position.x - s.position.x, t.position.y - s.position.y) > sim.RAIDER_RANGE, 'Escape route must respect both threats'); });
    }
    assert(Math.abs(s.position.y) > 30, 'Fighter should escape sideways between opposing threats');
  });

  test('simulation', 'defenders favor finishing an enemy already under sustained fire', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    var s = findShip(world, 'escort-01');
    s.position = { x: 0, y: 0 };
    var fresh = { position: { x: 250, y: 0 }, underFire: 0 };
    var damaged = { position: { x: 265, y: 0 }, underFire: 1 };
    assert(sim.stepDefenderWeapon(s, [fresh, damaged], {}, 1 / 30).target === damaged, 'Finish reachable weakened enemies');
  });

  test('simulation', 'out-of-leash contact cannot crash the entire simulation', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    deployTestFormation(world);
    findShip(world, 'escort-01').position = { x: 650, y: 0 };
    world = sim.issueMoveOrder(sim.selectShips(world, ['tug-01']), { x: -400, y: -90 });
    var start = findShip(world, 'tug-01').position.x;
    var threat = { position: { x: 1100, y: 0 } }; // Nearby fighter scan sees it; anchor scan excludes it.
    for (var i = 0; i < 30; i += 1) world = sim.stepWorld(world, 1 / 30, [threat]);
    assert(world.elapsedSeconds > 0.9 && findShip(world, 'tug-01').position.x < start, 'Clock and unrelated ships must keep moving');
  });

  test('simulation', 'new formation orders disengage from old combat and reach their destination', function () {
    var world = sim.issueDefendOrder(sim.selectShips(createDeployedWorld(), ['escort-01']), { x: 0, y: 0 });
    deployTestFormation(world);
    findShip(world, 'escort-01').position = { x: 0, y: 0 };
    var id = findShip(world, 'escort-01').order.groupId;
    var threat = { position: { x: 270, y: 0 } };
    world = sim.issueDefendOrder(world, { x: -450, y: 0 });
    assert(findShip(world, 'escort-01').order.groupId === id, 'Whole-wing orders retain the formation identity');
    var reached = false;
    for (var i = 0; i < 300; i += 1) {
      world = sim.stepWorld(world, 1 / 30, [threat]);
      if (findShip(world, 'escort-01').position.x < -420) reached = true;
    }
    assert(reached, 'Kiting must not pin a retreating formation in its old fight');
  });

  test('simulation', 'persistent formations close gaps after casualties and reassignment', function () {
    var world = sim.spawnFighter(sim.spawnFighter(createDeployedWorld()));
    var ids = world.ships.filter(function (s) { return s.type === 'escort'; }).map(function (s) { return s.id; });
    world = sim.issueDefendOrder(sim.selectShips(world, ids), { x: 500, y: 0 });
    var id = findShip(world, ids[0]).order.groupId;
    world = sim.damageFighter(world, ids[3], 1);
    world = sim.stepWorld(world, 1 / 30);
    assert(world.formations[id].memberIds.length === 3, 'Disabled member leaves the persistent wing');
    var offsets = world.formations[id].memberIds.map(function (member) { return findShip(world, member).order.offset; });
    assert(Math.abs(offsets.reduce(function (sum, p) { return sum + p.x; }, 0)) < 0.001, 'Three survivors form a centered V');
    world = sim.issueDefendOrder(sim.selectShips(world, [ids[2]]), { x: -800, y: 0 });
    world = sim.stepWorld(world, 1 / 30);
    assert(world.formations[id].memberIds.length === 2, 'Reassigned fighter leaves its old wing');
    var a = findShip(world, ids[0]).order.offset, b = findShip(world, ids[1]).order.offset;
    assertClose(a.x + b.x, 0); assertClose(a.y + b.y, 0);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assert(world.formations[id].memberIds.length === 2, 'Membership survives saves');
    world = sim.damageFighter(world, ids[1], 1);
    world = sim.stepWorld(world, 1 / 30);
    assertClose(findShip(world, ids[0]).order.offset.x, 0);
    assertClose(findShip(world, ids[0]).order.offset.y, 0);
    world = sim.damageFighter(world, ids[0], 1);
    world = sim.stepWorld(world, 1 / 30);
    assert(!world.formations[id], 'Empty formations are retired');
  });

  test('simulation', 'moving wings preserve momentum and wheel through direction changes', function () {
    [Math.PI / 9, Math.PI * 2 / 9].forEach(function (turn) {
      var world = sim.spawnFighter(sim.spawnFighter(createDeployedWorld()));
      var ids = world.ships.filter(function (s) { return s.type === 'escort'; }).map(function (s) { return s.id; });
      world = sim.issueDefendOrder(sim.selectShips(world, ids), { x: 3000, y: -100 });
      for (var i = 0; i < 240; i += 1) world = sim.stepWorld(world, 1 / 30);
      var groupId = findShip(world, ids[0]).order.groupId;
      var before = world.formations[groupId];
      var angle = before.angle + turn;
      var destination = { x: before.position.x + Math.cos(angle) * 1000, y: before.position.y + Math.sin(angle) * 1000 };
      var offsets = ids.map(function (id) { return findShip(world, id).order.offset; });
      world = sim.issueDefendOrder(world, destination);
      assertClose(world.formations[groupId].velocity.x, before.velocity.x);
      assertClose(world.formations[groupId].velocity.y, before.velocity.y);
      assertClose(world.formations[groupId].angle, before.angle);
      ids.forEach(function (id, index) {
        assertClose(findShip(world, id).order.offset.x, offsets[index].x);
        assertClose(findShip(world, id).order.offset.y, offsets[index].y);
      });
      var maxTurn = 0;
      for (i = 0; i < 180; i += 1) {
        var prior = world.formations[groupId];
        world = sim.stepWorld(world, 1 / 30);
        var current = world.formations[groupId];
        maxTurn = Math.max(maxTurn, Math.abs(sim.angleDelta(prior.angle, current.angle)));
        assert(Math.hypot(current.velocity.x, current.velocity.y) > 20, 'Center should carry speed through the wheel');
        ids.forEach(function (id, index) {
          var ship = findShip(world, id);
          assert(Math.hypot(ship.velocity.x, ship.velocity.y) > 10, 'Wingmates should not stop midway through a turn');
          ids.slice(index + 1).forEach(function (otherId) {
            var other = findShip(world, otherId);
            assert(Math.hypot(ship.position.x - other.position.x, ship.position.y - other.position.y) > 25, 'Turning wingmates must not cut through each other');
          });
        });
      }
      assert(maxTurn <= 0.65 / 30 + 0.00001, 'Heading changes must remain gradual');
      for (i = 0; i < 900; i += 1) world = sim.stepWorld(world, 1 / 30);
      assert(Math.hypot(world.formations[groupId].position.x - destination.x, world.formations[groupId].position.y - destination.y) < 1, 'Wheeling must still converge on the destination');
    });
  });

  test('simulation', 'stopped wings and sharp turns pivot promptly instead of making huge arcs', function () {
    [4, 10].forEach(function (count) {
      [0, Math.PI / 2, Math.PI].forEach(function (turn) {
        var world = createDeployedWorld();
        while (world.ships.filter(function (s) { return s.type === 'escort'; }).length < count) world = sim.spawnFighter(world);
        var ids = world.ships.filter(function (s) { return s.type === 'escort'; }).map(function (s) { return s.id; });
        world = sim.issueDefendOrder(sim.selectShips(world, ids), { x: 3000, y: -100 });
        for (var i = 0; i < 240; i += 1) world = sim.stepWorld(world, 1 / 30);
        var id = findShip(world, ids[0]).order.groupId, formation = world.formations[id];
        if (turn === 0) {
          formation.velocity = { x: 0, y: 0 };
          ids.forEach(function (member) { findShip(world, member).velocity = { x: 0, y: 0 }; });
        }
        var heading = formation.angle + (turn || Math.PI / 6);
        var start = { x: formation.position.x, y: formation.position.y };
        var goal = { x: start.x + Math.cos(heading) * 900, y: start.y + Math.sin(heading) * 900 };
        world = sim.issueDefendOrder(world, goal);
        assert(world.formations[id].pivoting, 'Stopped or sharply redirected wings should pivot');
        var pivotFinished = false;
        for (i = 0; i < 90; i += 1) {
          world = sim.stepWorld(world, 1 / 30);
          formation = world.formations[id];
          assert(Math.hypot(formation.position.x - start.x, formation.position.y - start.y) < 80, 'Pivot must not send the group on a wide arc');
          if (!formation.pivoting) { pivotFinished = true; break; }
        }
        assert(pivotFinished, 'Pivot should finish within three seconds even for a large wing');
        for (i = 0; i < 900; i += 1) world = sim.stepWorld(world, 1 / 30);
        assert(Math.hypot(world.formations[id].position.x - goal.x, world.formations[id].position.y - goal.y) < 1, 'Rearranged wing must continue to its destination');
      });
    });
  });

  test('simulation', 'reversed diamonds keep occupants in place and turn while accelerating', function () {
    var world = sim.spawnFighter(sim.spawnFighter(createDeployedWorld()));
    var ids = world.ships.filter(function (s) { return s.type === 'escort'; }).map(function (s) { return s.id; });
    world = sim.issueDefendOrder(sim.selectShips(world, ids), { x: 1800, y: 0 });
    var id = findShip(world, ids[0]).order.groupId;
    var formation = world.formations[id];
    var originalAngle = formation.angle;
    var offsets = ids.map(function (member) {
      var ship = findShip(world, member);
      ship.position = { x: formation.position.x + ship.order.offset.x, y: formation.position.y + ship.order.offset.y };
      ship.velocity = { x: 0, y: 0 };
      ship.rotation = originalAngle;
      return { x: ship.order.offset.x, y: ship.order.offset.y };
    });
    world = sim.issueDefendOrder(world, { x: formation.position.x - Math.cos(originalAngle) * 900, y: formation.position.y - Math.sin(originalAngle) * 900 });
    world = sim.stepWorld(world, 1 / 30);
    ids.forEach(function (member, index) {
      var offset = findShip(world, member).order.offset;
      assert(Math.hypot(offset.x - offsets[index].x, offset.y - offsets[index].y) < 0.001, 'Reversal must relabel slots instead of swapping occupants');
    });
    for (var i = 0; i < 10; i += 1) world = sim.stepWorld(world, 1 / 30);
    ids.forEach(function (member) {
      var ship = findShip(world, member);
      assert(Math.hypot(ship.velocity.x, ship.velocity.y) > 5, 'Acceleration must begin before the turn finishes');
      assert(Math.abs(sim.angleDelta(ship.rotation, originalAngle + Math.PI)) > 0.4, 'Test must observe simultaneous rotation and translation');
    });
  });

  test('simulation', 'rocket equation charges velocity changes and payload reduces delta-v', function () {
    var world = createDeployedWorld(), ship = findShip(world, 'escort-01');
    var mass = sim.physicalStats(world, ship).massKg, fuel = ship.propulsion.fuelKg;
    var available = sim.remainingDeltaV(world, ship);
    assertClose(available, 3000 * Math.log(mass / (mass - fuel)));
    ship.cargo = 100;
    assert(sim.remainingDeltaV(world, ship) < available);
    ship.cargo = 0;
    var fraction = window.Driftworks.propulsion.burn(ship, mass, 25);
    assertClose(fraction, 1);
    assertClose(fuel - ship.propulsion.fuelKg, mass * (1 - Math.exp(-25 / 3000)));
  });

  test('simulation', 'empty tanks coast without speed caps, arrival snaps or negative fuel', function () {
    var world = createDeployedWorld(), ship = findShip(world, 'escort-01');
    ship.position = { x: 900, y: 0 }; ship.velocity = { x: 500, y: 20 };
    ship.propulsion.fuelKg = 0;
    world = sim.issueMoveOrder(sim.selectShips(world, [ship.id]), { x: 901, y: 0 });
    world = sim.stepWorld(world, 1);
    ship = findShip(world, ship.id);
    assertClose(ship.position.x, 1400); assertClose(ship.position.y, 20);
    assertClose(ship.velocity.x, 500); assertClose(ship.propulsion.fuelKg, 0);
    assert(ship.order.kind === 'return' && ship.order.automatic);
  });

  test('simulation', 'launch and catch share a finite relative velocity envelope', function () {
    var world = createDeployedWorld(), ship = findShip(world, 'escort-01'), home = world.ships[0];
    ship.position = { x: 30, y: 0 }; ship.velocity = { x: -100, y: 0 };
    assert(sim.canCatch(ship, home));
    ship.velocity.x = -200; assert(!sim.canCatch(ship, home));
    ship.velocity.x = -100;
    world = sim.issueReturnOrder(sim.selectShips(world, [ship.id]));
    world = sim.stepWorld(world, 0);
    ship = findShip(world, ship.id); assert(ship.docked);
    var fuel = ship.propulsion.fuelKg;
    world = sim.issueMoveOrder(world, { x: 2000, y: 0 });
    world = sim.stepWorld(world, 1);
    ship = findShip(world, ship.id);
    assert(!ship.docked && Math.hypot(ship.velocity.x, ship.velocity.y) > 100);
    assertClose(ship.propulsion.fuelKg, fuel);
    assert(Math.hypot(ship.velocity.x, ship.velocity.y) * sim.METERS_PER_UNIT / sim.PHYSICAL_SECONDS_PER_SECOND <= sim.EXCHANGE_MPS);
  });

  test('simulation', 'fuel reserves recall fighters and allow a catch before exhaustion', function () {
    var world = createDeployedWorld(), ship = findShip(world, 'escort-01');
    ship.position = { x: 1000, y: 0 }; ship.velocity = { x: 100, y: 0 };
    ship.propulsion.fuelKg = 2500;
    world = sim.issueDefendOrder(sim.selectShips(world, [ship.id]), { x: 2000, y: 0 });
    world = sim.stepWorld(world, 1 / 30);
    ship = findShip(world, ship.id);
    assert(ship.order.kind === 'return' && ship.order.automatic);
    for (var i = 0; i < 900 && !findShip(world, ship.id).docked; i++) world = sim.stepWorld(world, 1 / 30);
    ship = findShip(world, ship.id); assert(ship.docked);
    assert(ship.propulsion.fuelKg < ship.propulsion.capacityKg && ship.unloadRemainingSeconds > 0,
      'Docking should begin refueling rather than filling the tank instantly');
    world = sim.stepWorld(world, 5);
    ship = findShip(world, ship.id);
    assertClose(ship.propulsion.fuelKg, ship.propulsion.capacityKg);
  });

  test('simulation', 'packets use the catch envelope and conserve ore exactly once', function () {
    var world = createDeployedWorld();
    world.packets = [{ id: 1, position: { x: 100, y: 0 }, velocity: { x: -100, y: 0 }, ore: 50 },
      { id: 2, position: { x: 100, y: 0 }, velocity: { x: -200, y: 0 }, ore: 75 }];
    world = sim.stepWorld(world, 2);
    assert(world.packets.length === 1 && world.packets[0].id === 2);
    assertClose(world.mothership.storage.ore, 50);
    world = sim.stepWorld(world, 2);
    assertClose(world.mothership.storage.ore + world.mothership.storage.constructionMass, 50);
  });

  test('simulation', 'end mining retrieves all platforms, drains packets and conserves material across saves', function () {
    var world = sim.issueMineOrder(sim.selectShips(createFreshWorld(), ['msv-hardshell']), 'ast-ceres-01');
    for (var i = 0; i < 7500 && world.platforms[0].state !== 'deployed'; i++) world = sim.stepWorld(world, 1 / 30);
    assert(world.platforms[0].state === 'deployed');
    for (i = 0; i < 6000 && !findShip(world, 'tug-01').docked; i++) world = sim.stepWorld(world, 1 / 30);
    world = sim.issueMineOrder(world, 'ast-ceres-01');
    for (i = 0; i < 7500 && world.platforms[1].state !== 'deployed'; i++) world = sim.stepWorld(world, 1 / 30);
    assert(world.platforms.every(function (p) { return p.state === 'deployed'; }));
    assert(world.asteroids[0].ore < world.asteroids[0].oreInitial, 'Operational platforms have produced ore');
    world = sim.endMining(sim.deserializeWorld(sim.serializeWorld(world)));
    var ore = world.asteroids[0].ore;
    for (var j = 0; j < 24000 && world.miningMission !== 'complete'; j++) {
      world = sim.stepWorld(world, 1 / 30);
      if (j === 300) world = sim.deserializeWorld(sim.serializeWorld(world));
    }
    assert(world.miningMission === 'complete', 'The single cargo ship must return both platforms to mothership storage');
    assert(world.platforms.every(function (p) { return p.state === 'stored'; }));
    assertClose(world.asteroids[0].ore, ore);
    assert(world.packets.length === 0);
    var storage = world.mothership.storage;
    assertClose(ore + storage.ore + storage.constructionMass + storage.depotSections * 1500, 10125, 0.001);
  });

  test('simulation', 'legacy miners migrate once without losing ore or manufacturing platforms twice', function () {
    var world = createDeployedWorld();
    delete world.logisticsVersion; delete world.platforms; delete world.packets;
    var ship = sim.cloneWorld(findShip(world, 'tug-01')); ship.id = 'old-miner'; ship.type = 'miner'; ship.cargo = 123;
    world.ships.push(ship);
    delete ship.propulsion;
    ship.order = { kind: 'mine' };
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assert(!findShip(world, ship.id));
    assertClose(world.mothership.storage.ore, 123);
    assert(world.platforms.length === 2);
    world = sim.deserializeWorld(sim.serializeWorld(world));
    assert(world.platforms.length === 2);
  });

  test('simulation', 'saved mining phases restore control state and pending deployment', function () {
    var slots = {};
    var storage = { setItem: function (key, value) { slots[key] = value; }, getItem: function (key) { return slots[key]; } };
    var world = sim.selectShips(createDeployedWorld(), ['msv-hardshell']);
    assert(hud.miningControlState(world).canDeploy);
    assert(!hud.miningControlState(world).canEnd);
    world = sim.issueMineOrder(world, world.asteroids[0].id);
    var order = JSON.stringify(findShip(world, 'tug-01').order);
    sim.saveWorld(world, storage);
    world = sim.loadWorld(storage);
    assert(JSON.stringify(findShip(world, 'tug-01').order) === order);
    assert(!hud.miningControlState(world).canDeploy && hud.miningControlState(world).canEnd);
    world = sim.endMining(world);
    sim.saveWorld(world, storage);
    world = sim.loadWorld(storage);
    assert(world.miningMission === 'recovering');
    assert(hud.miningControlState(world).endLabel === 'Recovering platforms…');
    assert(!hud.miningControlState(world).canDeploy && !hud.miningControlState(world).canEnd);
    for (var i = 0; i < 300 && world.miningMission !== 'complete'; i++) world = sim.stepWorld(world, 1 / 30);
    sim.saveWorld(world, storage);
    world = sim.loadWorld(storage);
    assert(world.miningMission === 'complete');
    assert(hud.miningControlState(world).endLabel === 'Mining ended · platforms recovered');
  });

  test('simulation', 'reset clears mining progress in memory and in the saved world', function () {
    var slots = {};
    var storage = { setItem: function (key, value) { slots[key] = value; }, getItem: function (key) { return slots[key]; } };
    var world = sim.endMining(createDeployedWorld());
    world.platforms[0].state = 'deployed';
    world.packets.push({ id: 1, ore: 10, position: { x: 100, y: 0 }, velocity: { x: -50, y: 0 } });
    sim.saveWorld(world, storage);
    var reset = sim.resetWorld(storage), reloaded = sim.loadWorld(storage);
    [reset, reloaded].forEach(function (fresh) {
      assert(fresh.miningMission === 'active');
      assert(fresh.platforms.length === 2 && fresh.platforms.every(function (p) { return p.state === 'stored'; }));
      assert(fresh.packets.length === 0 && fresh.elapsedSeconds === 0);
      assert(!hud.miningControlState(fresh).canEnd);
      assert(hud.miningControlState(fresh).endLabel === 'End mining & recover');
      fresh = sim.selectShips(fresh, ['msv-hardshell']);
      assert(hud.miningControlState(fresh).canDeploy);
    });
  });

  window.registerPopulationTests(function (name, fn) {test('simulation', name, fn);}, assert, assertClose);
  };
})();
