(function (global) {
  'use strict';

  /** @typedef {import('./types').DriftworksNamespace} DriftworksNamespace */
  var Driftworks = (global.Driftworks = global.Driftworks || {});
  /** @typedef {import('./types').World} World */
  /** @typedef {import('./types').Ship} Ship */
  /** @typedef {import('./types').Asteroid} Asteroid */
  /** @typedef {import('./types').Platform} Platform */
  /** @typedef {import('./types').MothershipState} MothershipState */
  /** @typedef {import('./types').Depot} Depot */
  /** @typedef {import('./types').Vec2} Vec2 */

  var PLATFORM_SETUP_SECONDS = 3 * 3600;
  var PLATFORM_PACK_SECONDS = 3 * 3600;
  var CREW_TRANSFER_SECONDS = 5 * 60;
  /**
   * Industrial operations. Shared movement, docking, asteroid, and cloning
   * behavior is supplied by sim.js so logistics owns rules, not flight.
   * @param {Parameters<import('./types').LogisticsModule['create']>[0]} api
   */
  function create(api) {
    var MINING_RATE = 187.5;
    var DEPOT_SECTION_MASS = 1500;
    var CARGO_HANDLING_SECONDS = 15 * 60;

    /** @param {string} id @returns {Platform} */
    function createPlatform(id) {
      return { id: id, carrierId: null, state: 'stored', position: { x: 0, y: 0 },
        asteroidId: null, siteAngle: 0, siteDepth: 0.5, ore: 0, packetTimer: 0 };
    }

    /** @param {World} world */
    function migrate(world) {
      world.platforms = world.platforms || [createPlatform('platform-01'), createPlatform('platform-02')];
      if (!world.mothership) return;
      world.ships = world.ships.filter(function (ship) {
        if (ship.type !== 'miner' && ship.type !== 'cargo') return true;
        world.mothership.storage.ore += ship.cargo || 0;
        world.platforms.forEach(function (p) {
          if (p.carrierId === ship.id) { p.state = 'stored'; p.carrierId = null; }
        });
        return false;
      });
      world.selectedShipIds = world.selectedShipIds.filter(function (id) {
        return world.ships.some(function (s) { return s.id === id; });
      });
      world.logisticsVersion = 2;
    }

    /** @param {World} world @returns {Ship | undefined} */
    function availablePlatformCarrier(world) {
      return world.ships.filter(function (s) { return s.type === 'tug' && !s.disabled &&
        !s.platformId && !s.carryingSection && !s.towTarget && !(s.passengerIds || []).length &&
        !((s.unloadRemainingSeconds || 0) > 0) && s.order.kind === 'idle'; })[0];
    }

    /** @param {World} world @returns {boolean} */
    function canDeployPlatform(world) {
      return world.miningMission === 'active' && !!availablePlatformCarrier(world) &&
        world.platforms.some(function (p) { return p.state === 'stored'; }) &&
        world.asteroids.some(function (a) { return a.ore > 0; });
    }

    /** @param {Platform} platform @param {Asteroid} asteroid @param {number} [angleOverride] @param {number} [depthOverride] @returns {{ position: Vec2, velocity: Vec2 }} */
    function platformSite(platform, asteroid, angleOverride, depthOverride) {
      var siteAngle = angleOverride === undefined ? (platform.siteAngle || 0) : angleOverride;
      var angle = siteAngle + (asteroid.rotation || 0);
      var angularVelocity = asteroid.angularVelocity || 0;
      var siteDepth = depthOverride === undefined ? (platform.siteDepth || 0.5) : depthOverride;
      var radius = api.surfaceRadius(asteroid, siteAngle) * siteDepth;
      return { position: { x: asteroid.position.x + Math.cos(angle) * radius,
        y: asteroid.position.y + Math.sin(angle) * radius },
        velocity: { x: -Math.sin(angle) * radius * angularVelocity,
          y: Math.cos(angle) * radius * angularVelocity } };
    }

    /** @param {World} world @param {string} id @returns {World} */
    function issuePlatformRecovery(world, id) {
      var next = api.cloneWorld(world), selected = api.selectedLookup(next);
      var platform = (next.platforms || []).filter(function (p) {
        return p.id === id && (p.state === 'deployed' || p.state === 'setting-up');
      })[0];
      if (!platform) return next;
      var carrier = next.ships.filter(function (s) { return selected[s.id] && s.type === 'tug' &&
        !s.disabled && !s.platformId && !s.carryingSection && !s.towTarget &&
        !(s.passengerIds || []).length && !((s.unloadRemainingSeconds || 0) > 0); })[0];
      if (carrier) {
        platform.evacuationRequested = true;
        carrier.order = { kind: 'retrieve-platform', platformId: id, target: api.clonePlain(platform.position) };
      }
      return next;
    }

    /** @param {World} world @returns {World} */
    function endMining(world) {
      var next = api.cloneWorld(world);
      next.miningMission = 'recovering';
      var home = api.findMothership(next);
      if (!home) return next;
      var homePosition = api.clonePlain(home.position);
      next.ships.forEach(function (s) {
        if (s.type === 'tug' && s.order.kind === 'deploy') s.order = { kind: 'return', target: homePosition };
      });
      return next;
    }

    /** @param {Ship} ship @param {World} world @param {number} dt @returns {Ship} */
    function stepPlatformCarrier(ship, world, dt) {
      if (ship.order.kind !== 'deploy' && ship.order.kind !== 'retrieve-platform') return ship;
      var order = ship.order;
      var deploying = order.kind === 'deploy';
      var platform = world.platforms.filter(function (p) { return p.id === order.platformId; })[0];
      var asteroidId = order.kind === 'deploy' ? order.asteroidId : platform && platform.asteroidId;
      var asteroid = api.findAsteroid(world, asteroidId);
      if (!platform || !asteroid || (!deploying && platform.state !== 'deployed' && platform.state !== 'setting-up' && platform.state !== 'packing-up')) {
        ship.order = { kind: 'idle' }; return ship;
      }
      var home = api.findMothership(world);
      if (deploying && !ship.platformId) {
        if (platform.state !== 'stored') { ship.order = { kind: 'idle' }; return ship; }
        if (!home) return ship;
        ship.order.target = api.clonePlain(home.position);
        if (!api.canCatch(ship, home)) return api.stepTowardOrderTarget(ship, dt, 0, false);
        api.dockShip(ship, home);
        platform.state = 'carried'; platform.carrierId = ship.id;
        ship.platformId = platform.id;
        ship.acceleration = api.movementAcceleration(world, ship);
        ship.burnMassKg = api.physicalStats(world, ship).massKg;
      }
      var siteAngle = order.kind === 'deploy' ? order.siteAngle : platform.siteAngle;
      var siteDepth = order.kind === 'deploy' ? order.siteDepth : platform.siteDepth;
      var site = platformSite(platform, asteroid, siteAngle, siteDepth);
      ship.order.target = site.position;
      api.launchShip(ship, home);
      if (ship.launchElapsed != null) return ship;
      var dx = site.position.x - ship.position.x, dy = site.position.y - ship.position.y;
      var gap = Math.hypot(dx, dy);
      var speed = Math.min(ship.speed, Math.sqrt(2 * ship.acceleration * gap), gap * 1.5);
      api.stepTowardOrderTarget(ship, dt, 0, false, { x: site.velocity.x + dx / Math.max(gap, 0.001) * speed,
        y: site.velocity.y + dy / Math.max(gap, 0.001) * speed });
      if (gap > 1 || api.distance(ship.velocity, site.velocity) > 1) {
        ship.cargoOperation = null;
        return ship;
      }
      ship.position = api.clonePlain(site.position);
      ship.velocity = api.clonePlain(site.velocity);
      if (!deploying) {
        if (platform.state !== 'packing-up') {
          platform.state = 'packing-up';
          platform.packRemainingSeconds = PLATFORM_PACK_SECONDS;
          return ship;
        }
        if ((platform.packRemainingSeconds || 0) > 0) return ship;
      }
      var operationKind = /** @type {'deploy-platform' | 'retrieve-platform'} */ (
        deploying ? 'deploy-platform' : 'retrieve-platform');
      if (!ship.cargoOperation || ship.cargoOperation.kind !== operationKind) {
        ship.cargoOperation = { kind: operationKind, remainingSeconds: CARGO_HANDLING_SECONDS,
          totalSeconds: CARGO_HANDLING_SECONDS };
      }
      var cargoOperation = ship.cargoOperation;
      cargoOperation.remainingSeconds = Math.max(0, cargoOperation.remainingSeconds - dt * api.physicalSecondsPerSecond);
      if (cargoOperation.remainingSeconds > 0) return ship;
      ship.cargoOperation = null;
      if (deploying) {
        platform.state = 'setting-up'; platform.carrierId = null;
        platform.evacuationRequested = false; platform.shiftStartedSeconds = (world.elapsedSeconds + dt) * api.physicalSecondsPerSecond;
        platform.asteroidId = asteroid.id; platform.siteAngle = siteAngle; platform.siteDepth = siteDepth;
        platform.position = site.position;
        platform.setupRemainingSeconds = PLATFORM_SETUP_SECONDS;
        platform.packRemainingSeconds = undefined;
        platform.workerIds = ship.passengerIds || [];
        ship.passengerIds = [];
        ship.platformId = null;
      } else {
        if ((ship.passengerIds || []).length) return ship;
        ship.passengerIds = platform.workerIds || [];
        platform.workerIds = [];
        platform.state = 'carried'; platform.carrierId = ship.id;
        ship.platformId = platform.id;
        ship.unloadRemainingSeconds = Math.max(ship.unloadRemainingSeconds || 0, api.dockServiceSeconds);
        ship.cargo += platform.ore || 0; platform.ore = 0;
      }
      if (!home) return ship;
      ship.order = { kind: 'return', target: api.clonePlain(home.position) };
      return ship;
    }

    /** @param {Ship} ship @param {World} world @param {number} dt @returns {Ship} */
    function stepShuttle(ship, world, dt) {
      if (ship.order.kind !== 'shuttle') return ship;
      var order = ship.order;
      var home = api.findMothership(world);
      var platform = world.platforms.filter(function (p) { return p.id === order.platformId && p.state === 'deployed'; })[0];
      var asteroid = platform && api.findAsteroid(world, platform.asteroidId);
      if (!home) return ship;
      if (!platform || !asteroid || (!order.evacuation && (platform.evacuationRequested || world.miningMission !== 'active'))) {
        ship.order = { kind: 'return', target: api.clonePlain(home.position) };
        return ship;
      }
      var site = platformSite(platform, asteroid);
      order.target = site.position;
      var dx = site.position.x - ship.position.x, dy = site.position.y - ship.position.y;
      var gap = Math.hypot(dx, dy);
      var speed = Math.min(ship.speed, Math.sqrt(2 * ship.acceleration * gap), gap * 1.5);
      api.stepTowardOrderTarget(ship, dt, 0, false, { x: site.velocity.x + dx / Math.max(gap, 0.001) * speed,
        y: site.velocity.y + dy / Math.max(gap, 0.001) * speed });
      if (gap > 1 || api.distance(ship.velocity, site.velocity) > 1) return ship;
      if (!ship.cargoOperation || ship.cargoOperation.kind !== 'exchange-crew') {
        ship.cargoOperation = { kind: 'exchange-crew', remainingSeconds: CREW_TRANSFER_SECONDS,
          totalSeconds: CREW_TRANSFER_SECONDS };
      }
      ship.cargoOperation.remainingSeconds = Math.max(0,
        ship.cargoOperation.remainingSeconds - dt * api.physicalSecondsPerSecond);
      if (ship.cargoOperation.remainingSeconds > 0) return ship;
      ship.cargoOperation = null;
      var outgoing = platform.workerIds || [];
      if (order.evacuation) {
        if ((ship.passengerIds || []).length) { ship.order = { kind: 'return', target: api.clonePlain(home.position) }; return ship; }
        platform.workerIds = [];
      } else {
        if ((ship.passengerIds || []).length !== 5) { ship.order = { kind: 'return', target: api.clonePlain(home.position) }; return ship; }
        // Disembark first: platform capacity is not constrained by shuttle seats.
        platform.workerIds = ship.passengerIds;
        platform.shiftStartedSeconds = (world.elapsedSeconds + dt) * api.physicalSecondsPerSecond;
      }
      ship.passengerIds = outgoing;
      ship.order = { kind: 'return', target: api.clonePlain(home.position) };
      return ship;
    }

    /** @param {World} world @param {number} dt */
    function step(world, dt) {
      var home = api.findMothership(world);
      if (!home) return;
      var logisticsHome = home;
      world.ships.forEach(function (s) {
        var shuttleReturned = s.type === 'shuttle' && s.docked && (s.order.kind === 'idle' || s.order.kind === 'return') &&
          (s.unloadRemainingSeconds || 0) <= 0;
        var tugReturned = s.type === 'tug' && s.docked && s.order.kind === 'idle' && (s.unloadRemainingSeconds || 0) <= 0;
        if ((shuttleReturned || tugReturned) && (s.passengerIds || []).length) {
          world.returnedPersonIds = (world.returnedPersonIds || []).concat(s.passengerIds || []);
          s.passengerIds = [];
          if (s.type === 'shuttle') s.order = { kind: 'idle' };
        }
      });
      world.platforms.forEach(function (platform) {
        if (platform.state === 'stored') { platform.position = api.clonePlain(logisticsHome.position); return; }
        if (platform.state === 'carried') {
          var carrier = world.ships.filter(function (s) { return s.id === platform.carrierId; })[0];
          if (carrier) {
            platform.position = api.clonePlain(carrier.position);
            if (carrier.docked && carrier.order.kind === 'idle' && (carrier.unloadRemainingSeconds || 0) <= 0) {
              platform.state = 'stored'; platform.carrierId = null; carrier.platformId = null;
            }
          }
          return;
        }
        var asteroid = api.findAsteroid(world, platform.asteroidId);
        if (!asteroid) return;
        platform.position = platformSite(platform, asteroid).position;
        if (platform.state === 'setting-up') {
          platform.setupRemainingSeconds = Math.max(0, (platform.setupRemainingSeconds || 0) - dt * api.physicalSecondsPerSecond);
          if (platform.setupRemainingSeconds <= 0) {
            platform.setupRemainingSeconds = 0;
            platform.state = 'deployed';
          }
        } else if (platform.state === 'packing-up') {
          platform.packRemainingSeconds = Math.max(0, (platform.packRemainingSeconds || 0) - dt * api.physicalSecondsPerSecond);
        }
        if (platform.state === 'setting-up') return;
        if (platform.state === 'packing-up') return;
        if (world.miningMission !== 'active') return;
        if (world.staffingEnabled && (platform.workerIds || []).length < 5) return;
        var extracted = Math.min(asteroid.ore || 0, MINING_RATE * dt);
        asteroid.ore -= extracted; platform.ore += extracted; platform.packetTimer += dt;
        if (platform.ore > 0 && (platform.packetTimer >= 4 || asteroid.ore === 0)) {
          var dx = logisticsHome.position.x - platform.position.x, dy = logisticsHome.position.y - platform.position.y;
          var gap = Math.max(0.001, Math.hypot(dx, dy));
          var speed = api.exchangeMps / api.velocityToMps * 0.8;
          world.packets.push({ id: world.nextPacketId++, position: api.clonePlain(platform.position),
            velocity: { x: logisticsHome.velocity.x + dx / gap * speed, y: logisticsHome.velocity.y + dy / gap * speed }, ore: platform.ore });
          platform.ore = 0; platform.packetTimer = 0;
        }
      });
      world.packets = world.packets.filter(function (packet) {
        var dx = (packet.velocity.x - logisticsHome.velocity.x) * dt, dy = (packet.velocity.y - logisticsHome.velocity.y) * dt;
        var t = Math.max(0, Math.min(1, ((logisticsHome.position.x - packet.position.x) * dx +
          (logisticsHome.position.y - packet.position.y) * dy) / Math.max(1e-12, dx * dx + dy * dy)));
        var closest = { x: packet.position.x + dx * t, y: packet.position.y + dy * t };
        if (api.canCatchPacket(closest, packet.velocity, logisticsHome)) {
          world.mothership.storage.ore += packet.ore; return false;
        }
        packet.position.x += packet.velocity.x * dt; packet.position.y += packet.velocity.y * dt;
        return true;
      });
      world.ships.forEach(function (ship) {
        if (!((ship.unloadRemainingSeconds || 0) > 0) || !ship.docked) return;
        ship.unloadRemainingSeconds = Math.max(0, (ship.unloadRemainingSeconds || 0) - dt * api.physicalSecondsPerSecond);
        if (ship.unloadRemainingSeconds > 0) return;
        if (ship.propulsion) ship.propulsion.fuelKg = ship.propulsion.capacityKg;
        if (ship.cargo > 0) { world.mothership.storage.ore += ship.cargo; ship.cargo = 0; }
      });
      if (world.miningMission !== 'recovering') return;
      /** @type {Record<string, boolean>} */
      var reserved = {};
      world.ships.forEach(function (s) { if (s.order.kind === 'retrieve-platform') reserved[s.order.platformId] = true; });
      world.ships.forEach(function (s) {
        if (s.type !== 'tug' || s.disabled || s.order.kind !== 'idle' || s.carryingSection || s.towTarget) return;
        if (s.platformId) {
          if (!s.docked) s.order = { kind: 'return', target: api.clonePlain(logisticsHome.position) };
          return;
        }
        var platform = world.platforms.filter(function (p) {
          return (p.state === 'deployed' || p.state === 'setting-up') && !reserved[p.id];
        })[0];
        if (platform) {
          reserved[platform.id] = true;
          s.order = { kind: 'retrieve-platform', platformId: platform.id, target: api.clonePlain(platform.position) };
        }
      });
      if (!world.packets.length && world.platforms.every(function (p) { return p.state === 'stored' && !(p.workerIds || []).length; }) &&
          world.ships.every(function (s) { return (s.type !== 'shuttle' && s.type !== 'tug') ||
            (s.docked && !(s.passengerIds || []).length && !((s.unloadRemainingSeconds || 0) > 0)); })) world.miningMission = 'complete';
    }

    /** @param {MothershipState | undefined} mothership @param {Depot | undefined} depot */
    function processConstructionMass(mothership, depot) {
      if (!mothership || !mothership.storage || !depot) return;
      var needed = Math.max(0, depot.totalStages - depot.builtStages - mothership.storage.depotSections);
      if (needed <= 0) return;
      while (mothership.storage.ore > 0 && mothership.storage.constructionMass < DEPOT_SECTION_MASS) {
        var processed = Math.min(mothership.storage.ore, DEPOT_SECTION_MASS - mothership.storage.constructionMass);
        mothership.storage.ore -= processed;
        mothership.storage.constructionMass += processed;
      }
      while (mothership.storage.constructionMass >= DEPOT_SECTION_MASS && mothership.storage.depotSections < needed) {
        mothership.storage.constructionMass -= DEPOT_SECTION_MASS;
        mothership.storage.depotSections += 1;
      }
    }

    /** @param {Ship} ship @param {number} dt @param {MothershipState} mothership @param {Ship | undefined} mothershipShip @param {Depot | undefined} depot @returns {Ship} */
    function stepBuildingShip(ship, dt, mothership, mothershipShip, depot) {
      if (ship.order.kind !== 'build') return ship;
      if (!mothershipShip || !depot || depot.builtStages >= depot.totalStages) {
        ship.order = { kind: 'idle' }; ship.carryingSection = false; return ship;
      }
      if (!ship.carryingSection) {
        ship.order.target = api.clonePlain(mothershipShip.position);
        if (!api.canCatch(ship, mothershipShip)) return api.stepTowardOrderTarget(ship, dt, api.dockDistance, false);
        api.dockShip(ship, mothershipShip);
        if (mothership.storage.depotSections <= 0) { ship.velocity = { x: 0, y: 0 }; return ship; }
        mothership.storage.depotSections -= 1; ship.carryingSection = true;
        ship.unloadRemainingSeconds = Math.max(ship.unloadRemainingSeconds || 0, api.dockServiceSeconds);
        ship.acceleration = api.movementAcceleration({ ships: [], wrecks: [] }, ship);
        ship.burnMassKg = api.physicalStats({ ships: [], wrecks: [] }, ship).massKg;
      }
      ship.order.target = api.clonePlain(depot.position);
      api.launchShip(ship, mothershipShip);
      if (ship.launchElapsed != null) return ship;
      if (api.distance(ship.position, depot.position) > api.arrivalDistance || Math.hypot(ship.velocity.x, ship.velocity.y) > 0.01) {
        return api.stepTowardOrderTarget(ship, dt, api.arrivalDistance, false);
      }
      ship.position = api.clonePlain(depot.position);
      ship.velocity = { x: 0, y: 0 };
      if (!ship.cargoOperation || ship.cargoOperation.kind !== 'deploy-section') {
        ship.cargoOperation = { kind: 'deploy-section', remainingSeconds: CARGO_HANDLING_SECONDS,
          totalSeconds: CARGO_HANDLING_SECONDS };
      }
      ship.cargoOperation.remainingSeconds = Math.max(0,
        ship.cargoOperation.remainingSeconds - dt * api.physicalSecondsPerSecond);
      if (ship.cargoOperation.remainingSeconds > 0) return ship;
      ship.cargoOperation = null;
      depot.builtStages += 1; ship.carryingSection = false;
      ship.velocity = { x: 0, y: 0 };
      ship.order = mothershipShip ? { kind: 'return', target: api.clonePlain(mothershipShip.position) } : { kind: 'idle' };
      return ship;
    }

    return { createPlatform: createPlatform, migrate: migrate, availablePlatformCarrier: availablePlatformCarrier,
      canDeployPlatform: canDeployPlatform, issuePlatformRecovery: issuePlatformRecovery, endMining: endMining,
      stepPlatformCarrier: stepPlatformCarrier, stepShuttle: stepShuttle, step: step, processConstructionMass: processConstructionMass,
      stepBuildingShip: stepBuildingShip };
  }

  /** @type {DriftworksNamespace} */
  var namespace = Driftworks;
  namespace.logistics = { create: create, setupSeconds: PLATFORM_SETUP_SECONDS, packSeconds: PLATFORM_PACK_SECONDS };
})(window);
