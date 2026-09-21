/* Shared browser/Node population and transport regressions. */
window.registerPopulationTests = function (test, assert, assertClose) {
  var sim = window.Driftworks.sim, sessions = window.Driftworks.session, pop = window.Driftworks.population;
  function fresh() {
    var s = sessions.create(sim.createInitialWorld(123));
    s.world.combat.director.wavesSpawned = 3;
    return s;
  }
  function shuttle(s) { return s.world.ships.find(function (ship) { return ship.type === 'shuttle'; }); }
  function deploy(s, index) {
    var p = s.world.platforms[index || 0], a = s.world.asteroids[0];
    a.angularVelocity = 0;
    p.state = 'deployed'; p.asteroidId = a.id; p.siteAngle = 0; p.siteDepth = 0.5;
    p.position = { x: a.position.x + sim.surfaceRadius(a, 0) * 0.5, y: a.position.y };
    return p;
  }
  function arrive(s) {
    var craft = shuttle(s), p = s.world.platforms.find(function (p) { return p.id === craft.order.platformId; });
    craft.docked = false; craft.launchElapsed = null;
    craft.position = Object.assign({}, p.position); craft.velocity = { x: 0, y: 0 };
    sessions.step(s, 1 / 30);
  }
  function home(s) {
    var craft = shuttle(s), mothership = s.world.ships[0];
    craft.position = Object.assign({}, mothership.position); craft.velocity = { x: 0, y: 0 };
    craft.launchElapsed = null; craft.order = { kind: 'return', target: Object.assign({}, mothership.position) };
    sessions.step(s, 1 / 30);
  }
  test('Population identities are deterministic, conserved, exclusive and reused', function () {
    var a = pop.create(42), b = pop.create(42);
    var ids = pop.assign(a, 'pilot', 'fighter', 1);
    assert(JSON.stringify(ids) === JSON.stringify(pop.assign(b, 'pilot', 'fighter', 1)));
    assert(JSON.stringify(a) === JSON.stringify(b));
    assert(a.people[ids[0]].joinedSeconds < 0 && a.people[ids[0]].joinedSeconds >= -30.5 * 365.25 * 86400,
      'Initial residents should have a plausible, seeded history before campaign day zero');
    assert(a.total === 10000 && a.operationalCapacity === 3000);
    assert(pop.assign(a, 'pilot', 'other', 1)[0] !== ids[0]);
    pop.consume(a, [{ id: 1, personId: ids[0], kind: 'duty-completed', atSeconds: 0, location: 'home', assignment: null, missionId: 'test' }]);
    assert(pop.assign(a, 'pilot', 'fighter', 1)[0] === ids[0]);
    var small = pop.create(42, 10, 0.7);
    assert(pop.assign(small, 'worker', 'shift', 5).length === 0 && Object.keys(small.people).length === 0);
  });
  test('Population events persist duty, ignore duplicates and record explicit deaths once', function () {
    var p = pop.create(), id = pop.assign(p, 'worker', 'shift', 1)[0];
    var events = [
      { id: 1, personId: id, kind: 'deployment', atSeconds: 10, location: 'shuttle', assignment: 'shift', missionId: 'test' },
      { id: 2, personId: id, kind: 'duty-completed', atSeconds: 30010, location: 'home', assignment: null, missionId: 'test' },
      { id: 3, personId: id, kind: 'death', atSeconds: 31000, location: 'home', assignment: null, missionId: 'test' }
    ];
    pop.consume(p, events); pop.consume(p, events);
    assert(p.people[id].history.length === 3 && p.total === 9999 && !p.people[id].alive);
    assert(p.people[id].dutySeconds === 30000 && p.people[id].overtimeSeconds === 1200);
    assert(JSON.stringify(pop.deserialize(pop.serialize(p))) === JSON.stringify(p));
  });
  test('Population is sparse at design limits and absent from tactical cloning', function () {
    [1000, 100000].forEach(function (count) {
      var p = pop.create(1, count);
      assert(Object.keys(p.people).length === 0 && pop.serialize(p).length < 400);
    });
    var s = fresh(), state = s.population;
    Object.defineProperty(state, 'toJSON', { value: function () { throw new Error('Population entered tactical clone'); }, configurable: true });
    sessions.step(s, 1 / 30);
    assert(s.population === state && !('population' in s.world));
    delete state.toJSON;
    var time = s.population.timeSeconds;
    sessions.step(s, 0); assert(s.population.timeSeconds === time);
    sessions.advanceCampaign(s, 60); assertClose(s.population.timeSeconds, 60 * 86400 + s.world.elapsedSeconds * 60);
  });
  test('New platforms wait for five workers and exchange five without seat juggling', function () {
    var s = fresh(), p = deploy(s), ore = s.world.asteroids[0].ore;
    sessions.step(s, 1 / 30);
    assert(s.world.asteroids[0].ore === ore);
    assert(shuttle(s).crewIds.length === 1 && shuttle(s).passengerIds.length === 5);
    var first = shuttle(s).passengerIds.slice();
    arrive(s); p = s.world.platforms[0];
    assert(JSON.stringify(p.workerIds) === JSON.stringify(first));
    assert(shuttle(s).passengerIds.length === 0 && s.world.asteroids[0].ore < ore);
    home(s);
    s.world.elapsedSeconds = p.shiftStartedSeconds / 60 + 479.9;
    sessions.step(s, 1 / 30); assert(shuttle(s).order.kind === 'idle', 'No early replacement');
    s.world.elapsedSeconds += 1;
    sessions.step(s, 1 / 30);
    var replacement = shuttle(s).passengerIds.slice();
    assert(replacement.length === 5 && replacement.every(function (id) { return first.indexOf(id) < 0; }));
    arrive(s); p = s.world.platforms[0];
    assert(JSON.stringify(p.workerIds) === JSON.stringify(replacement));
    assert(JSON.stringify(shuttle(s).passengerIds) === JSON.stringify(first));
    first.forEach(function (id) { assert(s.population.people[id].location === shuttle(s).id); });
    home(s);
    first.forEach(function (id) { assert(s.population.people[id].location === 'home' && s.population.people[id].assignment === null); });
  });
  test('Linehorse delivers the initial platform crew and setup delays extraction for three hours', function () {
    var s = fresh();
    sessions.transition(s, function (w) { return sim.issueMineOrder(sim.selectShips(w, ['msv-hardshell']), w.asteroids[0].id); });
    var tug = s.world.ships.find(function (ship) { return ship.type === 'tug'; });
    var platform = s.world.platforms[0], asteroid = s.world.asteroids[0];
    assert(tug.passengerIds.length === 5 && shuttle(s).passengerIds.length === 0);
    asteroid.angularVelocity = 0; asteroid.rotation = 0; platform.state = 'carried'; platform.carrierId = tug.id;
    tug.platformId = platform.id; tug.docked = false; tug.launchElapsed = null;
    platform.asteroidId = asteroid.id; platform.siteAngle = 0; platform.siteDepth = 0.5;
    tug.order.siteAngle = 0; tug.order.siteDepth = 0.5;
    var radius = sim.surfaceRadius(asteroid, 0) * platform.siteDepth;
    tug.position = { x: asteroid.position.x + radius, y: asteroid.position.y }; tug.velocity = { x: 0, y: 0 };
    sessions.step(s, 1 / 30);
    for (var handlingTick = 0; handlingTick < 450; handlingTick += 1) sessions.step(s, 1 / 30);
    platform = s.world.platforms[0]; tug = s.world.ships.find(function (ship) { return ship.type === 'tug'; });
    assert(platform.state === 'setting-up' && platform.workerIds.length === 5);
    assert(tug.passengerIds.length === 0 && platform.setupRemainingSeconds <= 3 * 3600 - 2 &&
      platform.setupRemainingSeconds >= 3 * 3600 - 4);
    var ore = s.world.asteroids[0].ore;
    sessions.step(s, 179);
    assert(s.world.platforms[0].state === 'setting-up' && s.world.asteroids[0].ore === ore, 'Setup must last the full three physical hours');
    sessions.step(s, 1);
    assert(s.world.platforms[0].state === 'deployed' && s.world.asteroids[0].ore < ore, 'Extraction begins after setup is complete');
  });
  test('Cancelled delivery and low fuel keep passengers aboard until home', function () {
    var s = fresh(); deploy(s); sessions.step(s, 1 / 30);
    var ids = shuttle(s).passengerIds.slice();
    sessions.transition(s, sim.endMining);
    sessions.step(s, 2); sessions.step(s, 1 / 30);
    assert(shuttle(s).passengerIds.length === 5);
    assert(shuttle(s).order.kind === 'return');
    home(s); ids.forEach(function (id) { assert(s.population.people[id].location === 'home'); });
    s = fresh(); deploy(s); sessions.step(s, 1 / 30);
    var craft = shuttle(s); craft.docked = false; craft.launchElapsed = null; craft.position.x = 100; craft.propulsion.fuelKg = 100;
    sessions.step(s, 1 / 30);
    assert(shuttle(s).order.kind === 'return' && shuttle(s).passengerIds.length === 5);
  });
  test('Tug takes the final shift, packs the platform and unloads the crew at home', function () {
    var s = fresh(); deploy(s); sessions.step(s, 1 / 30); arrive(s); home(s);
    sessions.transition(s, function (w) { return sim.issuePlatformRecovery(sim.selectShips(w, ['tug-01']), w.platforms[0].id); });
    var tug = s.world.ships.find(function (ship) { return ship.type === 'tug'; });
    tug.docked = false; tug.launchElapsed = null; tug.position = Object.assign({}, s.world.platforms[0].position); tug.velocity = { x: 0, y: 0 };
    sessions.step(s, 1 / 30);
    assert(s.world.platforms[0].state === 'packing-up' && s.world.platforms[0].workerIds.length === 5);
    assert(shuttle(s).order.kind === 'idle' && shuttle(s).passengerIds.length === 0);
    var ids = s.world.platforms[0].workerIds.slice();
    s.world.platforms[0].ore = 50;
    var storedBefore = s.world.mothership.storage.ore + s.world.mothership.storage.constructionMass;
    sessions.step(s, 180);
    sessions.step(s, 1 / 30);
    sessions.step(s, 15);
    assert(s.world.platforms[0].state === 'carried' && s.world.platforms[0].workerIds.length === 0);
    tug = s.world.ships.find(function (ship) { return ship.type === 'tug'; });
    assert(JSON.stringify(tug.passengerIds) === JSON.stringify(ids));
    assert(ids.every(function (id) { return s.population.people[id].location === tug.id; }));
    var mothership = s.world.ships.find(function (ship) { return ship.type === 'mothership'; });
    tug.position = Object.assign({}, mothership.position); tug.velocity = { x: 0, y: 0 }; tug.order = { kind: 'return', target: Object.assign({}, mothership.position) };
    sessions.step(s, 1 / 30);
    tug = s.world.ships.find(function (ship) { return ship.type === 'tug'; });
    assert(tug.unloadRemainingSeconds > 0 && s.world.platforms[0].state === 'carried');
    assert(s.world.mothership.storage.ore + s.world.mothership.storage.constructionMass === storedBefore,
      'Cargo should stay aboard during the unloading delay');
    sessions.step(s, 3); sessions.step(s, 1 / 30);
    assert(s.world.platforms[0].state === 'stored');
    assert(s.world.mothership.storage.ore + s.world.mothership.storage.constructionMass === storedBefore + 50);
    assert(ids.every(function (id) { return s.population.people[id].location === 'home'; }));
  });
  test('End mining reserves the tug for retrieval without dispatching shuttle evacuation', function () {
    var s = fresh(); deploy(s); sessions.step(s, 1 / 30); arrive(s); home(s);
    sessions.transition(s, sim.endMining); sessions.step(s, 1 / 30);
    assert(s.world.ships.find(function (ship) { return ship.id === 'tug-01'; }).order.kind === 'retrieve-platform');
    assert(shuttle(s).order.kind === 'idle' && shuttle(s).passengerIds.length === 0);
  });
  test('Initial staffing outranks an overdue shift and overdue workers keep mining', function () {
    var s = fresh(); deploy(s); sessions.step(s, 1 / 30); arrive(s); home(s);
    deploy(s, 1);
    s.world.elapsedSeconds += 500;
    var old = s.world.platforms[0].workerIds.slice();
    s.world.asteroids[0].ore = 10000;
    sessions.step(s, 1 / 30);
    assert(shuttle(s).order.platformId === s.world.platforms[1].id);
    assert(s.world.asteroids[0].ore < 10000);
    assert(JSON.stringify(s.world.platforms[0].workerIds) === JSON.stringify(old));
  });
  test('Population-aware scenarios dispatch crews and replay deterministically', function () {
    var s = fresh(); deploy(s);
    var scenario = { version: 1, world: s.world, session: JSON.parse(sessions.serialize(s)), ticks: 2, commands: [] };
    var a = window.Driftworks.scenario.run(scenario), b = window.Driftworks.scenario.run(scenario);
    assert(JSON.stringify(a) === JSON.stringify(b));
    assert(a.ships.find(function (ship) { return ship.type === 'shuttle'; }).passengerIds.length === 5);
  });
  test('Session saves preserve in-flight manifests, shifts and legacy migration', function () {
    var s = fresh(); deploy(s); sessions.step(s, 1 / 30);
    var copy = sessions.deserialize(sessions.serialize(s));
    assert(JSON.stringify(copy.population) === JSON.stringify(s.population));
    assert(JSON.stringify(shuttle(copy)) === JSON.stringify(shuttle(s)));
    sessions.step(s, 0.1); sessions.step(copy, 0.1);
    assert(sessions.serialize(s) === sessions.serialize(copy));
    arrive(s); copy = sessions.deserialize(sessions.serialize(s));
    assert(JSON.stringify(copy.world.platforms) === JSON.stringify(s.world.platforms));
    var legacy = sim.createInitialWorld(123); var tmp = { world: legacy }; deploy(tmp);
    var migrated = sessions.deserialize(sim.serializeWorld(legacy));
    assert(migrated.world.platforms[0].workerIds.length === 5);
    var repeated = sessions.deserialize(sessions.serialize(migrated));
    assert(Object.keys(repeated.population.people).length === Object.keys(migrated.population.people).length);
    assert(fresh().world.platforms.every(function (p) { return !p.workerIds.length; }));
  });
  test('Disabled fighter retains its living pilot and shuttle ignores manual flight commands', function () {
    var s = fresh(), fighter = s.world.ships.find(function (ship) { return ship.type === 'escort'; });
    var id = fighter.crewIds[0]; fighter.docked = false; fighter.position.x = 100;
    sessions.transition(s, function (w) { return sim.damageFighter(w, fighter.id, 1); });
    sessions.step(s, 1 / 30);
    assert(s.population.people[id].alive && s.population.people[id].location === fighter.id);
    var w = sim.issueMoveOrder(sim.selectShips(s.world, [shuttle(s).id]), { x: 999, y: 999 });
    assert(w.ships.find(function (ship) { return ship.type === 'shuttle'; }).order.kind === 'idle');
  });
  test('Shuttle completes actual surface approach, worker delivery and return', function () {
    var s = fresh(); deploy(s);
    for (var i = 0; i < 2400; i++) {
      sessions.step(s, 0.1);
      if (s.world.platforms[0].workerIds.length === 5 && shuttle(s).docked) break;
    }
    assert(i < 2400, 'Shuttle must physically deliver and return within four tactical minutes');
    assert(s.world.platforms[0].workerIds.length === 5 && shuttle(s).passengerIds.length === 0);
  });
  test('Shuttle serves rotating platforms and fully evacuates an ended mission', function () {
    var s = fresh(); deploy(s); s.world.asteroids[0].angularVelocity = 0.01;
    for (var i = 0; i < 2400; i++) {
      sessions.step(s, 0.1);
      if (s.world.platforms[0].workerIds.length === 5 && shuttle(s).docked) break;
    }
    assert(i < 2400, 'Rotating surface rendezvous failed');
    sessions.transition(s, sim.endMining);
    for (i = 0; i < 4000 && s.world.miningMission !== 'complete'; i++) sessions.step(s, 0.1);
    assert(s.world.miningMission === 'complete', 'Evacuation and tug recovery failed');
    assert(Object.values(s.population.people).every(function (p) { return p.location === 'home'; }));
  });
};
