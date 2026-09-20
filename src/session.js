(function (global) {
  'use strict';
  /** @typedef {import('./types').Session} Session */
  /** @typedef {import('./types').World} World */
  /** @type {import('./types').DriftworksNamespace} */
  var namespace = global.Driftworks = global.Driftworks || {};
  var sim = /** @type {import('./types').SimApi} */ (namespace.sim);
  var population = /** @type {import('./types').PopulationApi} */ (namespace.population);
  var SAVE_KEY = 'driftworks.save.v1';
  var SHIFT_SECONDS = 8 * 3600;

  /** @param {Session} session */
  function now(session) { return session.campaignOffsetSeconds + session.world.elapsedSeconds * sim.PHYSICAL_SECONDS_PER_SECOND; }

  /** @param {World} [world] @param {boolean} [legacy] @returns {Session} */
  function create(world, legacy) {
    world = sim.cloneWorld(world || sim.createInitialWorld());
    world.staffingEnabled = true;
    var home = world.ships.filter(function (s) { return s.type === 'mothership'; })[0];
    if (!world.ships.some(function (s) { return s.type === 'shuttle'; })) {
      var shuttle = sim.createShip('shuttle-01', 'Shuttle 01', 'shuttle', home.position.x, home.position.y, 100);
      shuttle.docked = true;
      world.ships.push(shuttle);
    }
    var state = population.create(world.seed);
    var session = { version: /** @type {1} */ (1), world: world, population: state, nextEventId: 1,
      campaignOffsetSeconds: world.campaign.timeDays * 86400 };
    population.advanceTo(state, now(session));
    world.ships.forEach(function (ship) { ship.crewIds = []; ship.passengerIds = []; });
    world.platforms.forEach(function (platform) {
      platform.workerIds = [];
      if (legacy && platform.state === 'deployed') {
        platform.workerIds = population.assign(state, 'platform worker', platform.id + ':initial', 5);
        platform.shiftStartedSeconds = world.elapsedSeconds * sim.PHYSICAL_SECONDS_PER_SECOND;
        platform.workerIds.forEach(function (id) {
          state.people[id].location = platform.id;
          state.people[id].dutyStartedSeconds = now(session);
        });
      }
    });
    prepare(session);
    reconcile(session);
    return session;
  }

  /** @param {Session} session */
  function prepare(session) {
    var world = session.world, state = session.population;
    world.ships.forEach(function (ship) {
      if (ship.type === 'mothership') return;
      if (!ship.crewIds || !ship.crewIds.length) {
        ship.crewIds = population.assign(state, ship.type === 'tug' ? 'tug operator' : ship.type === 'shuttle' ? 'shuttle pilot' : 'fighter pilot', ship.id, 1);
      }
    });
    var shuttle = world.ships.filter(function (s) { return s.type === 'shuttle' && s.docked && !s.disabled && s.order.kind === 'idle' && !(s.passengerIds || []).length && (s.crewIds || []).length; })[0];
    if (!shuttle) return;
    var time = world.elapsedSeconds * sim.PHYSICAL_SECONDS_PER_SECOND;
    /** @param {import('./types').Platform} p */
    function priority(p) {
      if (p.evacuationRequested || world.miningMission !== 'active') return (p.workerIds || []).length ? 0 : 9;
      if (!(p.workerIds || []).length) return 1;
      return time - (p.shiftStartedSeconds || 0) >= SHIFT_SECONDS ? 2 : 9;
    }
    var platform = world.platforms.filter(function (p) { return p.state === 'deployed' && priority(p) < 9; })
      .sort(function (a, b) { return priority(a) - priority(b) || a.id.localeCompare(b.id); })[0];
    if (!platform) return;
    var evacuation = priority(platform) === 0;
    var passengers = evacuation ? [] : population.assign(state, 'platform worker', platform.id + ':shift:' + time, 5);
    if (!evacuation && passengers.length !== 5) return;
    shuttle.passengerIds = passengers;
    shuttle.order = { kind: 'shuttle', platformId: platform.id, evacuation: evacuation, target: Object.assign({}, platform.position) };
  }

  // Only active references are inspected; background residents and histories are never scanned per tick.
  /** @param {Session} session */
  function reconcile(session) {
    var world = session.world, state = session.population, time = now(session);
    /** @type {Record<string, string>} */
    var locations = {};
    world.ships.forEach(function (ship) {
      (ship.crewIds || []).forEach(function (id) { locations[id] = ship.docked ? 'home' : ship.id; });
      (ship.passengerIds || []).forEach(function (id) { locations[id] = ship.id; });
    });
    world.platforms.forEach(function (p) { (p.workerIds || []).forEach(function (id) { locations[id] = p.id; }); });
    // Returning passengers are supplied explicitly by the preceding snapshot, not a population scan.
    var arrivals = session.world.returnedPersonIds || [];
    arrivals.forEach(function (id) { locations[id] = 'home'; });
    delete session.world.returnedPersonIds;
    Object.keys(locations).forEach(function (id) {
      var person = state.people[id];
      if (!person || !person.alive) throw new Error('Invalid active crew reference ' + id);
      var location = locations[id];
      if (person.location === location) return;
      /** @type {import('./types').PopulationEvent['kind']} */
      var kind = location === 'home' ? 'duty-completed' : person.location === 'home' ? 'deployment' : 'arrival';
      population.consume(state, [{ id: session.nextEventId++, personId: id, kind: kind, atSeconds: time,
        location: location, assignment: location === 'home' && person.role === 'platform worker' ? null : person.assignment,
        missionId: world.contract.id }]);
    });
    if (time - state.timeSeconds >= 60) population.advanceTo(state, time);
  }

  /** @param {Session} session @param {(world: World) => World} command @returns {Session} */
  function transition(session, command) {
    session.world = command(session.world);
    prepare(session);
    reconcile(session);
    return session;
  }
  /** @param {Session} session @param {number} dt @returns {Session} */
  function step(session, dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid simulation interval');
    if (dt === 0) return session;
    prepare(session);
    reconcile(session);
    var before = session.world;
    session.world = sim.stepWorld(before, dt);
    reconcile(session);
    session.world.ships.forEach(function (ship) {
      var previous = before.ships.filter(function (s) { return s.id === ship.id; })[0];
      if (previous && previous.disabled && !ship.disabled) (ship.crewIds || []).forEach(function (id) {
        population.consume(session.population, [{ id: session.nextEventId++, personId: id, kind: 'recovery',
          atSeconds: now(session), location: session.population.people[id].location, assignment: ship.id, missionId: session.world.contract.id }]);
      });
    });
    return session;
  }
  /** @param {Session} session @param {number} days @returns {Session} */
  function advanceCampaign(session, days) {
    if (!Number.isFinite(days) || days < 0) throw new Error('Invalid campaign interval');
    if (session.world.ships.some(function (s) { return s.type !== 'mothership' && (!s.docked || s.order.kind !== 'idle' || (s.passengerIds || []).length); }) ||
        session.world.platforms.some(function (p) { return p.state !== 'stored'; })) throw new Error('Recover the fleet before advancing campaign time');
    session.campaignOffsetSeconds += days * 86400;
    session.world = sim.cloneWorld(session.world);
    session.world.campaign.timeDays += days;
    population.advanceTo(session.population, now(session));
    return session;
  }
  /** @param {Session} session */
  function serialize(session) {
    population.advanceTo(session.population, now(session));
    return JSON.stringify({ version: 1, sessionVersion: 1, world: session.world,
      population: /** @type {import('./types').PopulationState} */ (JSON.parse(population.serialize(session.population))),
      nextEventId: session.nextEventId, campaignOffsetSeconds: session.campaignOffsetSeconds });
  }
  /** @param {string} text @returns {Session} */
  function deserialize(text) {
    var saved = /** @type {Session & {sessionVersion?: number}} */ (JSON.parse(text));
    if (saved.sessionVersion === undefined) return create(sim.deserializeWorld(text), true);
    if (saved.sessionVersion !== 1) throw new Error('Unsupported session save');
    var state = population.deserialize(JSON.stringify(saved.population));
    if (saved.nextEventId !== state.lastEventId + 1 || !Number.isFinite(saved.campaignOffsetSeconds)) throw new Error('Invalid session checkpoint');
    return { version: 1, world: sim.deserializeWorld(text), population: state,
      nextEventId: saved.nextEventId, campaignOffsetSeconds: saved.campaignOffsetSeconds };
  }
  /** @param {Session} session @param {Storage} [storage] */
  function save(session, storage) { (storage || global.localStorage).setItem(SAVE_KEY, serialize(session)); }
  /** @param {Storage} [storage] */
  function load(storage) {
    var text = (storage || global.localStorage).getItem(SAVE_KEY);
    return text ? deserialize(text) : create();
  }
  namespace.session = { create: create, transition: transition, step: step, advanceCampaign: advanceCampaign,
    serialize: serialize, deserialize: deserialize, save: save, load: load };
})(window);
