(function (global) {
  'use strict';

  /** @typedef {import('./types').World} World */
  /** @typedef {import('./types').Ship} Ship */
  /** @typedef {import('./types').Asteroid} Asteroid */
  /** @typedef {import('./types').Vec2} Vec2 */
  /** @typedef {import('./types').Threat} Threat */
  /** @typedef {import('./types').FighterStyle} FighterStyle */
  /** @typedef {import('./types').Formation} Formation */
  /** @typedef {import('./types').DefendOrder} DefendOrder */
  /** @typedef {import('./types').Order} Order */
  /** @typedef {import('./types').PropulsionApi} PropulsionApi */
  /** @typedef {import('./types').Rng} Rng */
  /** @typedef {import('./types').Depot} Depot */
  /** @typedef {import('./types').MothershipState} MothershipState */
  /** @typedef {import('./types').Platform} Platform */
  /** @typedef {import('./types').WorldLike} WorldLike */
  /** @typedef {import('./types').Packet} Packet */
  /** @typedef {import('./types').RecoveryRef} RecoveryRef */
  /** @typedef {import('./types').Wreck} Wreck */
  /** @typedef {import('./types').CombatApi} CombatApi */
  /** @typedef {import('./types').DriftworksNamespace} DriftworksNamespace */
  /** @type {DriftworksNamespace} */
  var Driftworks = (global.Driftworks = global.Driftworks || {});
  /** @type {PropulsionApi} */
  var propulsion = /** @type {PropulsionApi} */ (Driftworks.propulsion);
  /** @type {CombatApi} */
  var combatSystem = /** @type {import('./types').CombatModule} */ (Driftworks.combat).create({
    createRng: createRng,
    clonePlain: clonePlain,
    distance: distance,
    findMothership: findMothership,
    normalizeWorld: normalizeWorld,
    appendWreck: appendWreck,
    applyFighterDamage: applyFighterDamage
  });
  var VELOCITY_TO_MPS = 10000 / 600 / 60;
  var PLATFORM_MASS_KG = 100000;
  var WORLD_VERSION = 1;
  var SAVE_KEY = 'driftworks.save.v1';
  // Precision arrival avoids a visible jump at inspection zoom (32x).
  var ARRIVAL_DISTANCE = 0.001;
  var DOCK_DISTANCE = 44;
  var DEPOT_SECTION_MASS = 1500;
  var DEPOT_SECTION = { lengthM: 60, widthM: 40, massKg: DEPOT_SECTION_MASS * 1000 };
  var DEPOT_FRAME = { lengthM: 80, widthM: 160 };
  var METERS_PER_UNIT = 10000 / 600;
  var PHYSICAL_SECONDS_PER_SECOND = 60;
  var DOCK_SERVICE_SECONDS = 5 * 60;
  var CARGO_HANDLING_SECONDS = 15 * 60;
  var MASS_MIGRATION = 1500 / 80;
  var logistics = /** @type {import('./types').LogisticsModule} */ (Driftworks.logistics).create({
    cloneWorld: cloneWorld, clonePlain: clonePlain, selectedLookup: selectedLookup,
    findMothership: findMothership, findAsteroid: findAsteroid, surfaceRadius: surfaceRadius,
    distance: distance, movementAcceleration: movementAcceleration, physicalStats: physicalStats,
    stepTowardOrderTarget: stepTowardOrderTarget, launchShip: launchShip, dockShip: dockShip, canCatch: canCatch,
    canCatchPacket: /** @param {Vec2} position @param {Vec2} velocity @param {Ship} home */ function (position, velocity, home) { return propulsion.canCatch(position, velocity, home, DOCK_DISTANCE, VELOCITY_TO_MPS); },
    exchangeMps: propulsion.exchangeMps, velocityToMps: VELOCITY_TO_MPS,
    dockDistance: DOCK_DISTANCE, arrivalDistance: ARRIVAL_DISTANCE, physicalSecondsPerSecond: PHYSICAL_SECONDS_PER_SECOND,
    dockServiceSeconds: DOCK_SERVICE_SECONDS
  });
  /** @type {Record<string, { lengthM: number, dryMassKg: number, thrustN: number }>} */
  var HULLS = {
    shuttle: { lengthM: 12, dryMassKg: 18000, thrustN: 22065 },
    escort: { lengthM: 20, dryMassKg: 75000, thrustN: 73549.875 },
    tug: { lengthM: 80, dryMassKg: 3000000, thrustN: 588399 },
    mothership: { lengthM: 1000, dryMassKg: 3000000000, thrustN: 2941995 }
  };

  /** @param {WorldLike} world @param {Ship} ship */
  function physicalStats(world, ship) {
    var hull = ship.physical || HULLS[ship.type];
    var payload = recoveryTarget(world, ship.towTarget);
    var payloadKg = payload ? (payload.physical ? payload.physical.dryMassKg + (payload.propulsion ? payload.propulsion.fuelKg : 0) + (payload.cargo || 0) * 1000 : ('massKg' in payload ? payload.massKg || 0 : 75000)) : 0;
    var massKg = hull.dryMassKg + (ship.propulsion ? ship.propulsion.fuelKg : 0) + (ship.platformId ? PLATFORM_MASS_KG : 0) + (ship.cargo || 0) * 1000 +
      (ship.carryingSection ? DEPOT_SECTION_MASS * 1000 : 0) + payloadKg + ((ship.crewIds || []).length + (ship.passengerIds || []).length) * 100;
    if (ship.type === 'mothership' && world.mothership) {
      var storage = world.mothership.storage;
      massKg += (storage.ore + storage.constructionMass + storage.depotSections * DEPOT_SECTION_MASS) * 1000;
      massKg += (world.platforms || []).filter(function (p) { return p.state === 'stored'; }).length * PLATFORM_MASS_KG;
    }
    return { lengthM: hull.lengthM, massKg: massKg, payloadKg: massKg - hull.dryMassKg,
      thrustN: hull.thrustN, accelerationMps2: hull.thrustN / massKg,
      turnRateRadps: ship.turnRate / PHYSICAL_SECONDS_PER_SECOND };
  }

  /** @param {WorldLike} world @param {Ship} ship */
  function movementAcceleration(world, ship) {
    return physicalStats(world, ship).accelerationMps2 * PHYSICAL_SECONDS_PER_SECOND * PHYSICAL_SECONDS_PER_SECOND / METERS_PER_UNIT;
  }

  /** @param {Asteroid} asteroid */
  function asteroidPhysicalStats(asteroid) {
    var radiusM = asteroid.radius * METERS_PER_UNIT;
    return { diameterM: radiusM * 2, massKg: 4 / 3 * Math.PI * Math.pow(radiusM, 3) * 2000, densityKgM3: 2000,
      rotationPeriodSeconds: asteroid.angularVelocity ? Math.PI * 2 / Math.abs(asteroid.angularVelocity) * PHYSICAL_SECONDS_PER_SECOND : Infinity };
  }
  var DEPOT_STAGE_COUNT = 3;
  var REPAIR_SECONDS = 6;
  var FIGHTER_RANGE = combatSystem.FIGHTER_RANGE;
  var RAIDER_RANGE = combatSystem.RAIDER_RANGE;
  var formations = /** @type {import('./types').FormationModule} */ (Driftworks.formations).create({
    cloneWorld: cloneWorld, clonePlain: clonePlain, createRng: createRng, distance: distance, angleDelta: angleDelta,
    stepTowardOrderTarget: stepTowardOrderTarget, arrivalDistance: ARRIVAL_DISTANCE,
    fighterRange: FIGHTER_RANGE, raiderRange: RAIDER_RANGE
  });

  /** @param {World} world @returns {World} */
  function spawnFighter(world) {
    var next = cloneWorld(world);
    var id = 1;
    while (next.ships.some(function (s) { return s.id === 'debug-fighter-' + id; })) id += 1;
    var home = findMothership(next);
    var p = home ? home.position : next.camera;
    next.ships.push(createShip('debug-fighter-' + id, 'Fighter ' + id, 'escort', p.x + 150 + (id % 6) * 35, p.y - 200 - Math.floor(id / 6) * 35, 115));
    return next;
  }

  /** @param {World} world @param {Vec2} target @param {string | null | undefined} shipId @returns {World} */
  function issueDefendOrder(world, target, shipId) {
    return formations.issueDefendOrder(world, target, shipId);
  }

  /** @param {number} [seed] */
  function createInitialWorld(seed) {
    seed = seed === undefined ? 1729 : seed >>> 0;
    var rng = createRng(seed);
    var world = {
      version: WORLD_VERSION,
      physicalUnitsVersion: 1,
      seed: seed,
      combat: combatSystem.createCombat(seed),
      elapsedSeconds: 0,
      campaign: {
        timeDays: 0,
        money: 120000,
        location: 'Cis-Lunar Transfer Depot'
      },
      camera: {
        x: 0,
        y: 0,
        zoom: 1
      },
      selectedShipIds: [],
      selectedPlatformId: null,
      formations: {},
      nextFormationId: 1,
      logisticsVersion: 2,
      miningMission: 'active',
      platforms: [logistics.createPlatform('platform-01'), logistics.createPlatform('platform-02')],
      packets: [],
      nextPacketId: 1,
      wrecks: [],
      nextWreckId: 1,
      recovery: { salvagedOre: 0, repairedShips: 0 },
      mothership: {
        storage: {
          ore: 0,
          constructionMass: 0,
          depotSections: 0
        }
      },
      depot: {
        name: 'Transfer Depot Site',
        position: { x: 360, y: 300 },
        builtStages: 0,
        totalStages: DEPOT_STAGE_COUNT
      },
      contract: {
        id: 'contract-ore-01',
        name: 'Starter Regolith Lot',
        quotaOre: 4500,
        reward: 18000
      },
      asteroids: [
        createAsteroid('ast-ceres-01', 'Carbonaceous Monolith', -650, 400, 10125, rng)
      ],
      ships: [
        createShip('msv-hardshell', 'MSV Hardshell', 'mothership', 0, 0, 0),
        createShip('tug-01', 'Linehorse', 'tug', 0, 0, 62),
        createShip('escort-01', 'Watchdog', 'escort', 0, 0, 115),
        createShip('escort-02', 'Longbow', 'escort', 0, 0, 110)
    ]
  };
    world.ships.filter(function (ship) { return ship.type !== 'mothership'; })
      .forEach(function (ship) { ship.docked = true; });
    world.ships.forEach(function (ship) { ship.acceleration = movementAcceleration(world, ship); });
    return world;
  }

  /** @param {string} id @param {string} name @param {number} x @param {number} y @param {number} ore @param {Rng} [rng] @returns {Asteroid} */
  function createAsteroid(id, name, x, y, ore, rng) {
    rng = rng || createRng(Math.round(x * 31 + y * 17 + ore));
    return {
      id: id,
      name: name,
      position: { x: x, y: y },
      ore: ore,
      oreInitial: ore,
      radius: 300,
      rotation: 0,
      angularVelocity: (rng() < 0.5 ? -1 : 1) * (0.008 + rng() * 0.006),
      excavation: { pocketOffset: { x: 0.08, y: -0.04 }, pocketRadius: 0.2,
        tunnelAngle: -0.58, tunnelTurn: 0.14, level: 1 }
    };
  }

  /** @param {string} id @returns {number} */
  function miningSiteDepth(id) {
    var hash = 0;
    for (var i = 0; i < id.length; i += 1) hash = Math.imul(hash, 31) + id.charCodeAt(i) | 0;
    return 0.3 + createRng(hash)() * 0.45;
  }

  /** @param {Asteroid} asteroid @param {number} angle @returns {number} */
  function surfaceRadius(asteroid, angle) {
    return asteroid.radius * (0.88 + 0.07 * Math.cos(angle * 3) + 0.05 * Math.sin(angle * 5));
  }

  /** @param {string} id @param {string} name @param {string} type @param {number} x @param {number} y @param {number} speed @returns {Ship} */
  function createShip(id, name, type, x, y, speed) {
    var ship = {
      id: id,
      name: name,
      type: type,
      position: { x: x, y: y },
      previousPosition: { x: x, y: y },
      velocity: { x: 0, y: 0 },
      previousVelocity: { x: 0, y: 0 },
      rotation: 0,
      /** @type {Order} */
      order: { kind: 'idle' },
      cargo: 0,
      previousCargo: 0,
      carryingSection: false,
      towTarget: null,
      towedBy: null,
      disabled: false,
      repairRemaining: 0,
      launchElapsed: null,
      cargoOperation: null,
      unloadRemainingSeconds: 0,
      cargoCapacity: 0,
      platformId: null,
      docked: false,
      physical: clonePlain(HULLS[type]),
      damage: 0,
      speed: speed,
      acceleration: 0,
      turnRate: speed > 0 ? Math.max(1.4, Math.min(2.8, 180 / speed)) : 0
    };
    propulsion.initialize(ship);
    ship.acceleration = movementAcceleration({ ships: [], wrecks: [] }, ship);
    return ship;
  }

  /** @param {World} world @returns {World} */
  function cloneWorld(world) {
    return JSON.parse(JSON.stringify(world));
  }

  /** @param {number} seed @returns {Rng} */
  function createRng(seed) {
    var state = seed >>> 0;
    return function next() {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** @param {Rng} rng @param {number} min @param {number} max @returns {number} */
  function randomBetween(rng, min, max) {
    return min + (max - min) * rng();
  }

  /** @param {World} world @param {string[]} shipIds @returns {World} */
  function selectShips(world, shipIds) {
    var next = cloneWorld(world);
    /** @type {Record<string, boolean>} */
    var knownIds = {};
    next.ships.forEach(function (ship) {
      knownIds[ship.id] = true;
    });
    next.selectedShipIds = shipIds.filter(function (id) {
      return knownIds[id];
    });
    next.selectedPlatformId = null;
    return next;
  }

  /** Pick a deterministic attachment site outside the inhabited cavern and its entrance. */
  /** @param {Asteroid} asteroid @param {string} platformId @param {number} preferredAngle */
  function miningSite(asteroid, platformId, preferredAngle) {
    var depth = miningSiteDepth(platformId);
    var excavation = asteroid.excavation;
    if (!excavation) return { angle: preferredAngle, depth: depth };
    for (var attempt = 0; attempt < 12; attempt += 1) {
      var angle = preferredAngle + attempt * Math.PI * 2 / 12;
      var normalizedRadius = surfaceRadius(asteroid, angle) / asteroid.radius * depth;
      var x = Math.cos(angle) * normalizedRadius, y = Math.sin(angle) * normalizedRadius;
      var clearPocket = Math.hypot(x - excavation.pocketOffset.x, y - excavation.pocketOffset.y) > excavation.pocketRadius + 0.1;
      var mouthDelta = Math.abs(angleDelta(angle, excavation.tunnelAngle));
      if (clearPocket && mouthDelta > 0.22) return { angle: angle, depth: depth };
    }
    return { angle: preferredAngle + Math.PI, depth: depth };
  }

  /** @param {World} world @param {string | null} platformId @returns {World} */
  function selectPlatform(world, platformId) {
    var next = cloneWorld(world);
    next.selectedShipIds = [];
    next.selectedPlatformId = next.platforms.some(function (platform) {
      return platform.id === platformId && (platform.state === 'deployed' || platform.state === 'setting-up' || platform.state === 'packing-up');
    }) ? platformId : null;
    return next;
  }

  /** @param {World} world @param {Vec2} target @returns {World} */
  function issueMoveOrder(world, target) {
    var next = cloneWorld(world);
    /** @type {Record<string, boolean>} */
    var selected = {};
    next.selectedShipIds.forEach(function (id) {
      selected[id] = true;
    });
    next.ships.forEach(function (ship) {
      if (selected[ship.id] && ship.type !== 'shuttle' && ship.speed > 0 && !ship.disabled && !ship.repairRemaining && ship.launchElapsed == null) {
        ship.order = {
          kind: 'move',
          target: { x: target.x, y: target.y }
        };
      }
    });
    return next;
  }

  /** @param {World} world @param {Vec2} target @returns {World} */
  function issueContextOrder(world, target) {
    var home = findMothership(world);
    if (home && distance(target, home.position) <= DOCK_DISTANCE + 18) return issueReturnOrder(world);
    var platform = (world.platforms || []).filter(function (p) {
      return (p.state === 'deployed' || p.state === 'setting-up') && distance(target, p.position) < 22;
    })[0];
    if (platform) return issuePlatformRecovery(world, platform.id);
    var fighters = world.ships.filter(function (s) { return s.type === 'escort' && world.selectedShipIds.indexOf(s.id) !== -1; });
    if (fighters.length) {
      var guarded = world.ships.filter(function (s) { return world.selectedShipIds.indexOf(s.id) === -1 && distance(s.position, target) <= (s.type === 'mothership' ? 38 : 16); })
        .sort(function (a, b) { return distance(a.position, target) - distance(b.position, target); })[0];
      var rest = world.selectedShipIds.filter(function (id) { return !fighters.some(function (s) { return s.id === id; }); });
      var next = rest.length ? issueContextOrder(selectShips(world, rest), target) : cloneWorld(world);
      return issueDefendOrder(selectShips(next, world.selectedShipIds), guarded ? guarded.position : target, guarded && guarded.id);
    }
    var recoverable = nearestRecoverable(world, target, 26);
    if (recoverable && selectedType(world, 'tug')) {
      return issueRecoveryOrder(world, recoverable);
    }
    var asteroid = findNearestAsteroid(world, target, 38);
    var mothership = findMothership(world);
    var depot = world.depot;

    if (asteroid) {
      return issueMineOrder(world, asteroid.id);
    }

    if (depot && distance(target, depot.position) <= 48 && selectedType(world, 'tug')) {
      return issueBuildOrder(world);
    }

    if (mothership && distance(target, mothership.position) <= DOCK_DISTANCE + 18) {
      return issueReturnOrder(world);
    }

    return issueMoveOrder(world, target);
  }

  /** @param {World} world @param {string} asteroidId @returns {World} */
  function issueMineOrder(world, asteroidId) {
    var next = cloneWorld(world);
    var asteroid = findAsteroid(next, asteroidId);
    var selected = selectedLookup(next);
    if (!asteroid || asteroid.ore <= 0) {
      return next;
    }

    if (next.miningMission !== 'active') return next;
    var home = findMothership(next);
    if (!home || !selected[home.id]) return next;
    var ship = availablePlatformCarrier(next);
    var platform = next.platforms.filter(function (p) { return p.state === 'stored'; })[0];
    if (!ship || !platform) return next;
    var site = miningSite(asteroid, platform.id,
      Math.atan2(home.position.y - asteroid.position.y, home.position.x - asteroid.position.x) - asteroid.rotation);
    ship.order = { kind: 'deploy', asteroidId: asteroid.id, platformId: platform.id,
      siteDepth: site.depth, siteAngle: site.angle,
      target: clonePlain(home.position) };
    return next;
  }

  /** @param {World} world @returns {World} */
  function issueBuildOrder(world) {
    var next = cloneWorld(world);
    var selected = selectedLookup(next);
    var mothership = findMothership(next);
    if (!mothership || !next.depot || next.depot.builtStages >= next.depot.totalStages) {
      return next;
    }
    var buildHome = mothership;

    next.ships.forEach(function (ship) {
      if (selected[ship.id] && ship.type === 'tug' && !ship.disabled && !ship.towTarget && !ship.platformId) {
        ship.order = {
          kind: 'build',
          target: clonePlain(ship.carryingSection ? next.depot.position : buildHome.position)
        };
      }
    });
    return next;
  }

  /** @param {World} world @returns {World} */
  function issueReturnOrder(world) {
    var next = cloneWorld(world);
    var mothership = findMothership(next);
    var selected = selectedLookup(next);
    if (!mothership) {
      return next;
    }
    var returnHome = mothership;

    next.ships.forEach(function (ship) {
      if (selected[ship.id] && ship.type !== 'shuttle' && ship.speed > 0 && !ship.disabled) {
        if (ship.docked) { ship.order = { kind: 'idle' }; ship.launchElapsed = null; return; }
        ship.order = {
          kind: 'return',
          target: { x: returnHome.position.x, y: returnHome.position.y }
        };
      }
    });
    return next;
  }

  /** @param {World} world @param {number} dt @param {Threat[]} [threats] @returns {World} */
  function stepWorld(world, dt, threats) {
    var next = normalizeWorld(world);
    next.combat.events = [];
    combatSystem.stepDirector(next, dt);
    combatSystem.stepHostiles(next, dt);
    if (next.combat.drones.length) {
      var homeForDefense = findMothership(next);
      var scrambleIds = next.ships.filter(function (ship) {
        return ship.type === 'escort' && !ship.disabled && ship.docked && ship.order.kind === 'idle' && !ship.repairRemaining;
      }).map(function (ship) { return ship.id; });
      if (homeForDefense && scrambleIds.length) {
        var priorSelection = next.selectedShipIds.slice();
        next = issueDefendOrder(selectShips(next, scrambleIds), homeForDefense.position, homeForDefense.id);
        next.ships.forEach(function (ship) {
          if (scrambleIds.indexOf(ship.id) !== -1 && ship.order.kind === 'defend') ship.order.automatic = true;
        });
        next.selectedShipIds = priorSelection;
      }
    } else {
      next.ships.forEach(function (ship) {
        if (ship.type === 'escort' && ship.order.kind === 'defend' && ship.order.automatic) {
          ship.order = { kind: 'return', target: clonePlain((findMothership(next) || ship).position), automatic: true };
        }
      });
    }
    /** @type {Threat[]} */
    var activeThreats = next.combat.drones;
    activeThreats = activeThreats.concat(threats || []);
    formations.step(next, dt, activeThreats);
    var asteroids = next.asteroids.map(function (asteroid) {
      asteroid.rotation = (asteroid.rotation || 0) + (asteroid.angularVelocity || 0) * dt;
      return asteroid;
    });
    /** @type {MothershipState} */
    var mothership = /** @type {MothershipState} */ (clonePlain(next.mothership));
    var contract = clonePlain(next.contract);
    var depot = /** @type {Depot} */ (clonePlain(next.depot));
    var mothershipShip = findMothership(next);
    logistics.processConstructionMass(mothership, depot);

    var stepped = {
      staffingEnabled: next.staffingEnabled,
      logisticsVersion: 2,
      miningMission: next.miningMission,
      platforms: next.platforms,
      packets: next.packets,
      nextPacketId: next.nextPacketId,
      version: next.version,
      physicalUnitsVersion: 1,
      seed: next.seed,
      combat: next.combat,
      elapsedSeconds: (next.elapsedSeconds || 0) + dt,
      campaign: clonePlain(next.campaign),
      camera: clonePlain(next.camera),
      selectedShipIds: next.selectedShipIds.slice(),
      selectedPlatformId: next.selectedPlatformId || null,
      mothership: mothership,
      depot: depot,
      contract: contract,
      asteroids: asteroids,
      wrecks: next.wrecks.map(function (wreck) {
        var moved = clonePlain(wreck);
        if (!moved.towedBy) {
          var wreckVelocity = moved.velocity || { x: 0, y: 0 };
          moved.position.x += wreckVelocity.x * dt;
          moved.position.y += wreckVelocity.y * dt;
        }
        return moved;
      }),
      nextWreckId: next.nextWreckId,
      recovery: next.recovery,
      formations: next.formations,
      nextFormationId: next.nextFormationId,
      ships: next.ships.map(function (ship) {
        return stepShip(ship, dt, asteroids, mothership, mothershipShip, depot, next, activeThreats);
      })
    };
    stepRecovery(stepped, dt);
    logistics.step(stepped, dt);
    combatSystem.stepWeapons(stepped, dt);
    stepped.ships.forEach(function (ship) { ship.acceleration = movementAcceleration(stepped, ship); });
    return stepped;
  }

  /** @param {Ship} ship @param {number} dt @param {Asteroid[]} asteroids @param {MothershipState} mothership @param {Ship | undefined} mothershipShip @param {Depot} depot @param {World} world @param {Threat[]} threats @returns {Ship} */
  function stepShip(ship, dt, asteroids, mothership, mothershipShip, depot, world, threats) {
    var next = clonePlain(ship);
    next.previousPosition = { x: ship.position.x, y: ship.position.y };
    next.previousVelocity = { x: ship.velocity.x, y: ship.velocity.y };
    next.previousCargo = ship.cargo;

    if (next.disabled) {
      next.position.x += next.velocity.x * dt;
      next.position.y += next.velocity.y * dt;
      return next;
    }
    if (world.staffingEnabled && next.type !== 'mothership' && !(next.crewIds || []).length) return next;
    if (next.docked && mothershipShip) {
      next.position = clonePlain(mothershipShip.position);
      next.velocity = clonePlain(mothershipShip.velocity);
      if (next.order.kind === 'idle' || next.order.kind === 'return') return next;
      if ((next.unloadRemainingSeconds || 0) <= 0 && next.launchElapsed == null && launchOrderIsValid(next)) next.launchElapsed = 0;
    }
    if (next.launchElapsed != null && next.launchElapsed < 1 && !next.disabled && mothershipShip) {
      next.launchElapsed = Math.min(1, next.launchElapsed + dt);
      next.docked = false;
      var launchT = next.launchElapsed;
      var clearance = 72 * launchT * launchT * (3 - 2 * launchT);
      next.position = { x: mothershipShip.position.x + Math.cos(mothershipShip.rotation) * clearance,
        y: mothershipShip.position.y + Math.sin(mothershipShip.rotation) * clearance };
      next.velocity = { x: mothershipShip.velocity.x, y: mothershipShip.velocity.y };
      next.rotation = mothershipShip.rotation;
      if (next.launchElapsed < 1) return next;
      next.launchElapsed = null;
      applyLauncherImpulse(next, mothershipShip);
    }
    next.burnMassKg = physicalStats(world, next).massKg;
    if (next.propulsion && !next.docked && next.order.kind !== 'return' && mothershipShip &&
        remainingDeltaV(world, next) < returnReserve(next, mothershipShip)) {
      next.order = { kind: 'return', target: clonePlain(mothershipShip.position), automatic: true,
        salvageAll: 'salvageAll' in next.order ? next.order.salvageAll : undefined };
    }
    if (next.order.kind === 'deploy' || next.order.kind === 'retrieve-platform') return logistics.stepPlatformCarrier(next, world, dt);
    if (next.order.kind === 'shuttle') return logistics.stepShuttle(next, world, dt);
    if (next.order.kind === 'recover') {
      if (next.cargoOperation && next.cargoOperation.kind === 'recover') {
        next.position.x += next.velocity.x * dt;
        next.position.y += next.velocity.y * dt;
      }
      return next;
    }
    if (next.order.kind === 'defend') return formations.stepDefender(next, world, threats, dt);


    if (next.order.kind === 'return') {
      return stepReturningShip(next, dt, mothership, mothershipShip);
    }

    if (next.order.kind === 'build') {
      return logistics.stepBuildingShip(next, dt, mothership, mothershipShip, depot);
    }

    if (next.order.kind !== 'move' || next.speed <= 0) {
      next.position.x += next.velocity.x * dt;
      next.position.y += next.velocity.y * dt;
      return next;
    }

    return stepTowardOrderTarget(next, dt, ARRIVAL_DISTANCE, true);
  }

  /** @param {World} world @param {Ship} ship @returns {number} */
  function remainingDeltaV(world, ship) {
    return propulsion.remaining(ship, physicalStats(world, ship).massKg);
  }

  /** @param {Ship} ship @param {Vec2} delta */
  function applyBurn(ship, delta) {
    var mass = ship.burnMassKg || physicalStats({ ships: [], wrecks: [] }, ship).massKg;
    var before = ship.propulsion ? ship.propulsion.fuelKg : 0;
    var fraction = propulsion.burn(ship, mass, Math.hypot(delta.x, delta.y) * VELOCITY_TO_MPS);
    ship.velocity.x += delta.x * fraction;
    ship.velocity.y += delta.y * fraction;
    ship.burnMassKg = mass - (before - (ship.propulsion ? ship.propulsion.fuelKg : 0));
  }

  /** @param {Ship} ship @param {Ship} home @returns {number} */
  function returnReserve(ship, home) {
    // Budget a full velocity reversal, a homeward cruise and a margin for guidance.
    // The catcher supplies terminal braking inside the exchange envelope.
    return (Math.hypot(ship.velocity.x - home.velocity.x, ship.velocity.y - home.velocity.y) +
      ship.speed) * VELOCITY_TO_MPS * 1.5 + 35;
  }

  /** @param {Ship} ship @param {Ship} home @returns {boolean} */
  function canCatch(ship, home) {
    return propulsion.canCatch(ship.position, ship.velocity, home, DOCK_DISTANCE, VELOCITY_TO_MPS);
  }

  /** @param {Ship} ship @param {Ship} home */
  function dockShip(ship, home) {
    var wasDocked = ship.docked;
    ship.docked = true;
    ship.position = clonePlain(home.position);
    ship.velocity = clonePlain(home.velocity);
    if (!wasDocked && ship.propulsion && ship.propulsion.fuelKg < ship.propulsion.capacityKg) {
      ship.unloadRemainingSeconds = Math.max(ship.unloadRemainingSeconds || 0, DOCK_SERVICE_SECONDS);
    }
  }

  /** @param {Ship} ship @returns {boolean} */
  function launchOrderIsValid(ship) {
    if (ship.order.kind === 'idle' || ship.order.kind === 'return') return false;
    if (!('target' in ship.order) || !ship.order.target) return false;
    if (ship.order.kind === 'build' && !ship.carryingSection) return false;
    if (ship.order.kind === 'deploy' && !ship.platformId) return false;
    return true;
  }

  /** @param {Ship} ship @param {Ship | undefined} home */
  function launchShip(ship, home) {
    if (!ship.docked || !home || (ship.unloadRemainingSeconds || 0) > 0 || !launchOrderIsValid(ship)) return;
    if (ship.launchElapsed == null) ship.launchElapsed = 0;
  }

  /** @param {Ship} ship @param {Ship | undefined} home */
  function applyLauncherImpulse(ship, home) {
    if (!home || !launchOrderIsValid(ship) || !('target' in ship.order) || !ship.order.target) return;
    var target = ship.order.target;
    var dx = target.x - home.position.x, dy = target.y - home.position.y;
    var gap = Math.hypot(dx, dy);
    if (gap <= ARRIVAL_DISTANCE) return;
    var speed = Math.min(ship.speed, propulsion.exchangeMps / VELOCITY_TO_MPS,
      Math.sqrt(ship.acceleration * gap));
    ship.velocity = { x: home.velocity.x + dx / gap * speed, y: home.velocity.y + dy / gap * speed };
  }

  /** @param {World} world */
  function migrateLogistics(world) {
    logistics.migrate(world);
  }

  /** @param {World} world @returns {Ship | undefined} */
  function availablePlatformCarrier(world) {
    return logistics.availablePlatformCarrier(world);
  }

  /** @param {World} world @returns {boolean} */
  function canDeployPlatform(world) {
    return logistics.canDeployPlatform(world);
  }

  /** @param {World} world @param {string} id @returns {World} */
  function issuePlatformRecovery(world, id) {
    return logistics.issuePlatformRecovery(world, id);
  }

  /** @param {World} world @returns {World} */
  function endMining(world) {
    return logistics.endMining(world);
  }

  /** @param {Ship} ship @param {World} world @param {number} dt @returns {Ship} */
  /** @param {Ship} ship @param {number} dt @param {MothershipState} mothership @param {Ship | undefined} mothershipShip @param {Depot | undefined} depot @returns {Ship} */
  /** @param {Ship} ship @param {number} dt @param {MothershipState} mothership @param {Ship | undefined} mothershipShip @returns {Ship} */
  function stepReturningShip(ship, dt, mothership, mothershipShip) {
    if (ship.order.kind !== 'return') return ship;
    if (!mothershipShip) {
      ship.order = { kind: 'idle' };
      return ship;
    }

    ship.order.target = clonePlain(mothershipShip.position);
    if (!canCatch(ship, mothershipShip)) {
      var gap = distance(ship.position, mothershipShip.position);
      var speed = Math.min(ship.speed, propulsion.exchangeMps / VELOCITY_TO_MPS * 0.9);
      return stepTowardOrderTarget(ship, dt, 0, false, {
        x: mothershipShip.velocity.x + (mothershipShip.position.x - ship.position.x) / Math.max(gap, 0.001) * speed,
        y: mothershipShip.velocity.y + (mothershipShip.position.y - ship.position.y) / Math.max(gap, 0.001) * speed
      });
    }
    dockShip(ship, mothershipShip);
    ship.velocity = { x: 0, y: 0 };
    if (ship.cargo > 0 || ship.platformId || (ship.passengerIds || []).length || ship.towTarget) {
      ship.unloadRemainingSeconds = Math.max(ship.unloadRemainingSeconds || 0, DOCK_SERVICE_SECONDS);
    }
    ship.order = ship.order.salvageAll ? { kind: 'return', target: clonePlain(mothershipShip.position), salvageAll: true } : { kind: 'idle' };
    return ship;
  }

  /** @param {Ship} ship @param {number} dt @param {number} arrivalDistance @param {boolean} snapOnArrival @param {Vec2 | null | undefined} [formationVelocity] @param {FighterStyle | undefined} [guidanceStyle] @returns {Ship} */
  function stepTowardOrderTarget(ship, dt, arrivalDistance, snapOnArrival, formationVelocity, guidanceStyle) {
    if (!('target' in ship.order) || !ship.order.target) return ship;
    var target = ship.order.target;
    var toTarget = {
      x: target.x - ship.position.x,
      y: target.y - ship.position.y
    };
    var distance = Math.hypot(toTarget.x, toTarget.y);

    if (distance <= arrivalDistance && !formationVelocity && Math.hypot(ship.velocity.x, ship.velocity.y) < 0.01 && (!ship.propulsion || ship.propulsion.fuelKg > 0)) {
      if (snapOnArrival) {
        ship.position = { x: target.x, y: target.y };
        ship.order = { kind: 'idle' };
      }
      ship.velocity = { x: 0, y: 0 };
      return ship;
    }

    var direction = {
      x: distance ? toTarget.x / distance : 0,
      y: distance ? toTarget.y / distance : 0
    };
    var currentSpeed = Math.hypot(ship.velocity.x, ship.velocity.y);
    var stoppingDistance = Math.max(0, distance - (arrivalDistance > 1 ? arrivalDistance : 0));
    var haulingSpeed = ship.speed * (guidanceStyle ? guidanceStyle.speed : 1); // Work-zone guidance limit, not a physical maximum.
    var haulingAcceleration = ship.acceleration * (guidanceStyle ? guidanceStyle.acceleration : 1);
    var stoppingSpeed = Math.sqrt(2 * haulingAcceleration * stoppingDistance);
    var desiredSpeed = Math.min(haulingSpeed, stoppingSpeed, stoppingDistance * 4);
    var desiredVelocity = {
      x: direction.x * desiredSpeed,
      y: direction.y * desiredSpeed
    };
    if (formationVelocity) desiredVelocity = formationVelocity;
    var deltaVelocity = {
      x: desiredVelocity.x - ship.velocity.x,
      y: desiredVelocity.y - ship.velocity.y
    };
    var deltaLength = Math.hypot(deltaVelocity.x, deltaVelocity.y);
    var maxDelta = haulingAcceleration * dt;

    if (deltaLength > maxDelta && deltaLength > 0) {
      deltaVelocity.x = (deltaVelocity.x / deltaLength) * maxDelta;
      deltaVelocity.y = (deltaVelocity.y / deltaLength) * maxDelta;
    }

    applyBurn(ship, deltaVelocity);

    var nextSpeed = Math.hypot(ship.velocity.x, ship.velocity.y);
    var travel = nextSpeed * dt;
    if (nextSpeed > 0.001) {
      ship.position.x += (ship.velocity.x / nextSpeed) * travel;
      ship.position.y += (ship.velocity.y / nextSpeed) * travel;
      ship.rotation = rotateToward(ship.rotation || 0, Math.atan2(ship.velocity.y, ship.velocity.x), ship.turnRate * dt);
    }

    return ship;
  }

  /** @param {World} world @returns {string} */
  function serializeWorld(world) {
    return JSON.stringify({
      version: WORLD_VERSION,
      savedAt: new Date().toISOString(),
      world: world
    });
  }

  /** @param {string} serialized @returns {World} */
  function deserializeWorld(serialized) {
    // Save normalization repairs historical fields; it is not schema validation.
    /** @type {{ version?: unknown, world?: World } | null} */
    var envelope = JSON.parse(serialized);
    if (!envelope || envelope.version !== WORLD_VERSION || !envelope.world) {
      throw new Error('Unsupported Driftworks save version: ' + (envelope && envelope.version));
    }
    if (envelope.world.version !== WORLD_VERSION) {
      throw new Error('Unsupported Driftworks world version: ' + envelope.world.version);
    }
    return normalizeWorld(envelope.world);
  }

  /** @param {World} world @param {Storage | undefined} storage */
  function saveWorld(world, storage) {
    (storage || global.localStorage).setItem(SAVE_KEY, serializeWorld(world));
  }

  /** @param {Storage | undefined} storage @returns {World} */
  function loadWorld(storage) {
    var serialized = (storage || global.localStorage).getItem(SAVE_KEY);
    return serialized ? deserializeWorld(serialized) : createInitialWorld();
  }

  /** @param {Storage | undefined} storage @returns {World} */
  function resetWorld(storage) {
    var world = createInitialWorld();
    saveWorld(world, storage);
    return world;
  }

  /** @template T @param {T} value @returns {T} */
  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /** @param {World} world @returns {World} */
  function normalizeWorld(world) {
    var initial = createInitialWorld(world.seed);
    var next = clonePlain(world);
    next.combat = next.combat || initial.combat;
    next.formations = next.formations || {};
    next.nextFormationId = next.nextFormationId || 1;
    next.wrecks = next.wrecks || [];
    next.wrecks.forEach(function (wreck) {
      wreck.velocity = wreck.velocity || { x: 0, y: 0 };
    });
    next.nextWreckId = next.nextWreckId || 1;
    next.recovery = next.recovery || { salvagedOre: 0, repairedShips: 0 };
    next.mothership = next.mothership || initial.mothership;
    next.mothership.storage = next.mothership.storage || { ore: 0, constructionMass: 0, depotSections: 0 };
    next.mothership.storage.ore = typeof next.mothership.storage.ore === 'number' ? next.mothership.storage.ore : 0;
    next.mothership.storage.constructionMass =
      typeof next.mothership.storage.constructionMass === 'number' ? next.mothership.storage.constructionMass : 0;
    next.mothership.storage.depotSections =
      typeof next.mothership.storage.depotSections === 'number' ? next.mothership.storage.depotSections : 0;
    next.depot = next.depot || initial.depot;
    next.depot.builtStages = typeof next.depot.builtStages === 'number' ? next.depot.builtStages : 0;
    next.depot.totalStages = next.depot.totalStages || DEPOT_STAGE_COUNT;
    next.contract = next.contract || initial.contract;
    next.asteroids = next.asteroids || initial.asteroids;
    if (next.asteroids.length > 1 || (next.asteroids[0] && typeof next.asteroids[0].angularVelocity !== 'number')) {
      var ore = next.asteroids.reduce(function (sum, item) { return sum + item.ore; }, 0);
      var body = initial.asteroids[0];
      body.ore = ore;
      body.oreInitial = Math.max(540, ore);
      body.angularVelocity = 0.01;
      next.asteroids = [body];
      (next.ships || []).forEach(function (ship) {
        if (ship.order.kind === 'mine') ship.order = { kind: 'mine', asteroidId: body.id };
      });
    }
    next.asteroids.forEach(function (body) {
      if (!body.excavation) body.excavation = clonePlain(initial.asteroids[0].excavation);
    });
    next.ships = next.ships || initial.ships;
    next.ships.forEach(function (ship) {
      if (typeof ship.turnRate !== 'number') {
        ship.turnRate = ship.speed > 0 ? Math.max(1.4, Math.min(2.8, 180 / ship.speed)) : 0;
      }
      ship.carryingSection = !!ship.carryingSection;
      ship.towTarget = ship.towTarget || null;
      ship.towedBy = ship.towedBy || null;
      ship.disabled = !!ship.disabled;
      ship.repairRemaining = ship.repairRemaining || 0;
      ship.launchElapsed = ship.launchElapsed == null ? null : ship.launchElapsed;
      ship.cargoOperation = ship.cargoOperation || null;
      ship.unloadRemainingSeconds = Math.max(0, ship.unloadRemainingSeconds || 0);
    });
    next.selectedShipIds = next.selectedShipIds || [];
    next.selectedPlatformId = next.selectedPlatformId || null;
    next.camera = next.camera || initial.camera;
    next.campaign = next.campaign || initial.campaign;
    next.elapsedSeconds = typeof next.elapsedSeconds === 'number' ? next.elapsedSeconds : 0;
    next.version = next.version || WORLD_VERSION;
    if (!next.physicalUnitsVersion) {
      if (world.asteroids) next.asteroids.forEach(function (body) { body.ore *= MASS_MIGRATION; body.oreInitial *= MASS_MIGRATION; });
      next.ships.forEach(function (ship) { ship.cargo *= MASS_MIGRATION; ship.previousCargo = ship.cargo; });
      next.mothership.storage.ore *= MASS_MIGRATION;
      next.mothership.storage.constructionMass *= MASS_MIGRATION;
      if (world.contract) next.contract.quotaOre *= MASS_MIGRATION;
      next.ships.forEach(function (ship) { ship.cargoCapacity = 0; });
      next.physicalUnitsVersion = 1;
    }
    if (next.logisticsVersion !== 2) migrateLogistics(next);
    next.platforms = next.platforms || [];
    next.packets = next.packets || [];
    next.nextPacketId = next.nextPacketId || 1;
    next.miningMission = next.miningMission || 'active';
    next.ships.forEach(function (ship) {
      propulsion.initialize(ship);
      ship.physical = ship.physical || clonePlain(HULLS[ship.type]);
      if (typeof ship.cargoCapacity !== 'number') ship.cargoCapacity = 0;
      ship.acceleration = movementAcceleration(next, ship);
    });
    return next;
  }

  /** @param {World} world @param {{ position: Vec2, velocity: Vec2 }} destroyed @returns {World} */
  function addWreck(world, destroyed) {
    var next = normalizeWorld(world);
    appendWreck(next, destroyed);
    return next;
  }

  /** @param {World} world @param {{ position: Vec2, velocity: Vec2 }} destroyed */
  function appendWreck(world, destroyed) {
    world.wrecks.push({
      id: 'wreck-' + world.nextWreckId++,
      position: clonePlain(destroyed.position),
      velocity: clonePlain(destroyed.velocity),
      rotation: Math.atan2(destroyed.velocity.y, destroyed.velocity.x),
      salvageOre: 24,
      massKg: 75000,
      towedBy: null
    });
  }

  /** @param {World} world @param {string} id @param {number} amount @returns {World} */
  function damageFighter(world, id, amount) {
    var next = normalizeWorld(world);
    var ship = next.ships.filter(function (candidate) { return candidate.id === id; })[0];
    if (!ship || ship.type !== 'escort' || ship.disabled) return next;
    applyFighterDamage(ship, amount);
    return next;
  }

  /** @param {Ship} ship @param {number} amount */
  function applyFighterDamage(ship, amount) {
    ship.damage = Math.min(1, (ship.damage || 0) + Math.max(0, amount));
    if (ship.damage >= 1) {
      ship.disabled = true;
      ship.order = { kind: 'idle' };
    }
  }

  /** @param {WorldLike} world @param {RecoveryRef | null | undefined} reference @returns {Ship | Wreck | null} */
  function recoveryTarget(world, reference) {
    if (!reference) return null;
    var candidates = reference.kind === 'wreck' ? world.wrecks : world.ships;
    return (candidates || []).filter(function (target) {
      return target.id === reference.id && (reference.kind === 'wreck' ||
        (target.type === 'escort' && target.disabled && !target.repairRemaining && target.launchElapsed == null));
    })[0] || null;
  }

  /** @param {World} world @param {Vec2} point @param {number} range @returns {RecoveryRef | null} */
  function nearestRecoverable(world, point, range) {
    /** @type {RecoveryRef | null} */
    var best = null;
    /** @type {RecoveryRef[]} */
    var references = (world.wrecks || []).map(function (wreck) { return /** @type {RecoveryRef} */ ({ kind: 'wreck', id: wreck.id }); })
      .concat(world.ships.filter(function (ship) { return ship.type === 'escort' && ship.disabled; })
        .map(function (ship) { return /** @type {RecoveryRef} */ ({ kind: 'ship', id: ship.id }); }));
    references.forEach(function (reference) {
        var target = recoveryTarget(world, reference);
        if (!target || target.towedBy) return;
        var gap = distance(target.position, point);
        if (gap <= range) {
          best = reference;
          range = gap;
        }
      });
    return best;
  }

  /** @param {World} world @param {RecoveryRef} reference @returns {World} */
  function issueRecoveryOrder(world, reference) {
    var next = normalizeWorld(world);
    var target = recoveryTarget(next, reference);
    if (!target || target.towedBy) return next;
    var targetPosition = clonePlain(target.position);
    next.ships.forEach(function (ship) {
      if (next.selectedShipIds.indexOf(ship.id) < 0 || ship.type !== 'tug' ||
        ship.disabled || ship.carryingSection || ship.platformId || ship.towTarget) return;
      ship.order = { kind: 'recover', recoveryTarget: clonePlain(reference), target: targetPosition };
    });
    return next;
  }

  /** @param {World} world @returns {World} */
  function issueSalvageAllOrder(world) {
    var next = normalizeWorld(world);
    var target = findMothership(next);
    if (!target) return next;
    var assigned = false;
    next.ships.forEach(function (ship) {
      if (next.selectedShipIds.indexOf(ship.id) < 0 || ship.type !== 'tug' || ship.disabled || ship.carryingSection ||
        ship.platformId || ship.towTarget || (ship.order.kind !== 'idle' && ship.order.kind !== 'return')) return;
      var reference = nearestRecoverable(next, ship.position, Infinity);
      if (!reference) return;
      var recoverable = recoveryTarget(next, reference);
      if (!recoverable) return;
      ship.order = { kind: 'recover', recoveryTarget: clonePlain(reference), target: clonePlain(recoverable.position), salvageAll: true };
      assigned = true;
    });
    return assigned ? next : world;
  }

  /** @param {World} world @param {number} dt */
  function stepRecovery(world, dt) {
    var mothership = findMothership(world);
    world.ships.forEach(function (ship) {
      if (ship.repairRemaining > 0) {
        if (mothership) {
          ship.position = clonePlain(mothership.position);
          ship.previousPosition = clonePlain(ship.position);
          ship.rotation = mothership.rotation;
        }
        ship.repairRemaining = Math.max(0, ship.repairRemaining - dt);
        if (ship.repairRemaining === 0) {
          ship.damage = 0;
          if (ship.propulsion) ship.propulsion.fuelKg = ship.propulsion.capacityKg;
          ship.launchElapsed = 0;
        }
      } else if (ship.launchElapsed != null && mothership && ship.disabled) {
        ship.launchElapsed = Math.min(6, ship.launchElapsed + dt);
        var t = ship.launchElapsed / 6;
        var offset = 72 * t * t * (3 - 2 * t);
        ship.rotation = mothership.rotation;
        ship.position = {
          x: mothership.position.x + Math.cos(ship.rotation) * offset,
          y: mothership.position.y + Math.sin(ship.rotation) * offset
        };
        ship.velocity = {
          x: (ship.position.x - ship.previousPosition.x) / Math.max(dt, 0.000001),
          y: (ship.position.y - ship.previousPosition.y) / Math.max(dt, 0.000001)
        };
        if (ship.launchElapsed >= 6) {
          ship.launchElapsed = null;
          ship.disabled = false;
          ship.velocity = { x: 0, y: 0 };
          world.recovery.repairedShips += 1;
        }
      }
    });
    world.ships.forEach(function (hauler) {
      if (hauler.type !== 'tug' || hauler.disabled) return;
      if (hauler.order.kind === 'salvage-all') {
        var nextTarget = nearestRecoverable(world, hauler.position, Infinity);
        var nextPayload = nextTarget && recoveryTarget(world, nextTarget);
        if (nextTarget && nextPayload) {
          hauler.order = { kind: 'recover', recoveryTarget: clonePlain(nextTarget), target: clonePlain(nextPayload.position), salvageAll: true };
        } else if (hauler.docked) {
          hauler.order = { kind: 'idle' };
        } else if (mothership) {
          hauler.order = { kind: 'return', target: clonePlain(mothership.position), salvageAll: true };
        }
      }
      if (hauler.order.kind === 'return' && hauler.order.salvageAll && hauler.docked && !hauler.towTarget) {
        hauler.order = { kind: 'salvage-all' };
      }
      if (hauler.order.kind === 'recover' && !hauler.towTarget) {
        var recoveryOrder = hauler.order;
        var pickup = recoveryTarget(world, hauler.order.recoveryTarget);
        if (!pickup || pickup.towedBy || hauler.carryingSection || !mothership) {
          hauler.order = { kind: 'idle' };
          return;
        }
        hauler.order.target = clonePlain(pickup.position);
        var pickupVelocity = 'velocity' in pickup && pickup.velocity ? pickup.velocity : { x: 0, y: 0 };
        var approachX = pickup.position.x - hauler.position.x;
        var approachY = pickup.position.y - hauler.position.y;
        var approachGap = Math.hypot(approachX, approachY);
        var relativeVelocity = Math.hypot(hauler.velocity.x - pickupVelocity.x, hauler.velocity.y - pickupVelocity.y);
        if (approachGap > ARRIVAL_DISTANCE || relativeVelocity > 0.01) {
          hauler.cargoOperation = null;
          var closingSpeed = Math.min(hauler.speed, Math.sqrt(2 * hauler.acceleration * approachGap), approachGap * 4);
          stepTowardOrderTarget(hauler, dt, 12, false, {
            x: pickupVelocity.x + approachX / Math.max(approachGap, 0.001) * closingSpeed,
            y: pickupVelocity.y + approachY / Math.max(approachGap, 0.001) * closingSpeed
          });
          return;
        }
        var claimedByAnother = world.ships.some(function (other) {
          return other.id !== hauler.id && other.cargoOperation && other.cargoOperation.kind === 'recover' &&
            other.order.kind === 'recover' && other.order.recoveryTarget.kind === recoveryOrder.recoveryTarget.kind &&
            other.order.recoveryTarget.id === recoveryOrder.recoveryTarget.id;
        });
        if (claimedByAnother) {
          hauler.order = { kind: 'idle' };
          hauler.cargoOperation = null;
          return;
        }
        // Clamp only the final sub-millimeter/sub-centimeter-per-second residual so
        // cargo work begins from an exact position and velocity match.
        hauler.position = clonePlain(pickup.position);
        hauler.velocity = clonePlain(pickupVelocity);
        if (!hauler.cargoOperation || hauler.cargoOperation.kind !== 'recover') {
          hauler.cargoOperation = { kind: 'recover', remainingSeconds: CARGO_HANDLING_SECONDS,
            totalSeconds: CARGO_HANDLING_SECONDS };
        }
        hauler.cargoOperation.remainingSeconds = Math.max(0,
          hauler.cargoOperation.remainingSeconds - dt * PHYSICAL_SECONDS_PER_SECOND);
        if (hauler.cargoOperation.remainingSeconds > 0) return;
        hauler.cargoOperation = null;
        hauler.towTarget = clonePlain(hauler.order.recoveryTarget);
        pickup.towedBy = hauler.id;
        hauler.order = { kind: 'return', target: clonePlain(mothership.position), salvageAll: hauler.order.salvageAll };
      }
      if (!hauler.towTarget) return;
      var payload = recoveryTarget(world, hauler.towTarget);
      if (!payload || payload.towedBy !== hauler.id) {
        hauler.towTarget = null;
        return;
      }
      var payloadEntity = payload;
      payload.position = clonePlain(hauler.position);
      if (hauler.towTarget.kind === 'ship') payload.previousPosition = clonePlain(hauler.previousPosition);
      payload.rotation = hauler.rotation;
      if (mothership && canCatch(hauler, mothership)) {
        if ((hauler.unloadRemainingSeconds || 0) > 0) return;
        if (hauler.towTarget.kind === 'wreck') {
          /** @type {Wreck} */
          var wreck = payloadEntity;
          var salvageOre = wreck.salvageOre || 0;
          world.mothership.storage.ore += salvageOre;
          world.recovery.salvagedOre += salvageOre;
          world.wrecks = world.wrecks.filter(function (wreck) { return wreck.id !== payloadEntity.id; });
        } else {
          payload.towedBy = null;
          payload.repairRemaining = REPAIR_SECONDS;
          payload.position = clonePlain(mothership.position);
          payload.rotation = mothership.rotation;
          payload.previousPosition = clonePlain(payload.position);
        }
        hauler.towTarget = null;
        dockShip(hauler, mothership);
        hauler.order = 'salvageAll' in hauler.order && hauler.order.salvageAll ? { kind: 'salvage-all' } : { kind: 'idle' };
      }
    });
  }

  /** @param {World} world @returns {Record<string, boolean>} */
  function selectedLookup(world) {
    /** @type {Record<string, boolean>} */
    var selected = {};
    world.selectedShipIds.forEach(function (id) {
      selected[id] = true;
    });
    return selected;
  }

  /** @param {World} world @param {string} type @returns {boolean} */
  function selectedType(world, type) {
    var selected = selectedLookup(world);
    return world.ships.some(function (ship) {
      return selected[ship.id] && ship.type === type;
    });
  }

  /** @param {World} world @returns {Ship | undefined} */
  function findMothership(world) {
    return world.ships.filter(function (ship) {
      return ship.type === 'mothership';
    })[0];
  }

  /** @param {World} world @param {string | null | undefined} asteroidId @returns {Asteroid | undefined} */
  function findAsteroid(world, asteroidId) {
    return (world.asteroids || []).filter(function (asteroid) {
      return asteroid.id === asteroidId;
    })[0];
  }

  /** @param {World} world @param {Vec2} target @param {number} maxDistance @returns {Asteroid | null} */
  function findNearestAsteroid(world, target, maxDistance) {
    /** @type {Asteroid | null} */
    var best = null;
    var bestDistance = maxDistance;
    (world.asteroids || []).forEach(function (asteroid) {
      var currentDistance = Math.max(0, distance(target, asteroid.position) - surfaceRadius(asteroid, Math.atan2(target.y - asteroid.position.y, target.x - asteroid.position.x) - asteroid.rotation));
      if (asteroid.ore > 0 && currentDistance <= bestDistance) {
        best = asteroid;
        bestDistance = currentDistance;
      }
    });
    return best;
  }

  /** @param {Vec2} a @param {Vec2} b @returns {number} */
  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** @param {MothershipState | undefined} mothership @param {Depot | undefined} depot */
  /** @param {number} from @param {number} to @returns {number} */
  function angleDelta(from, to) {
    var delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  /** @param {number} current @param {number} target @param {number} maxStep @returns {number} */
  function rotateToward(current, target, maxStep) {
    var delta = angleDelta(current, target);
    if (Math.abs(delta) <= maxStep) return target;
    return current + Math.sign(delta) * maxStep;
  }

  Driftworks.sim = {
    spawnHostileWave: combatSystem.spawnHostileWave,
    stepDefenderWeapon: combatSystem.stepDefenderWeapon,
    operationExposure: combatSystem.operationExposure,
    DIRECTOR_MAX_WAVES: combatSystem.DIRECTOR_MAX_WAVES,
    remainingDeltaV: remainingDeltaV,
    returnReserve: returnReserve,
    canCatch: canCatch,
    endMining: endMining,
    issuePlatformRecovery: issuePlatformRecovery,
    canDeployPlatform: canDeployPlatform,
    EXCHANGE_MPS: propulsion.exchangeMps,
    RAIDER_RANGE: RAIDER_RANGE,
    FIGHTER_RANGE: FIGHTER_RANGE,
    FIGHTER_LEASH: FIGHTER_RANGE * 2.5,
    issueDefendOrder: issueDefendOrder,
    spawnFighter: spawnFighter,
    DEPOT_SECTION: DEPOT_SECTION,
    DEPOT_FRAME: DEPOT_FRAME,
    physicalStats: physicalStats,
    asteroidPhysicalStats: asteroidPhysicalStats,
    METERS_PER_UNIT: METERS_PER_UNIT,
    PHYSICAL_SECONDS_PER_SECOND: PHYSICAL_SECONDS_PER_SECOND,
    DOCK_SERVICE_SECONDS: DOCK_SERVICE_SECONDS,
    surfaceRadius: surfaceRadius,
    WORLD_VERSION: WORLD_VERSION,
    createInitialWorld: createInitialWorld,
    createShip: createShip,
    createAsteroid: createAsteroid,
    cloneWorld: cloneWorld,
    createRng: createRng,
    randomBetween: randomBetween,
    angleDelta: angleDelta,
    rotateToward: rotateToward,
    selectShips: selectShips,
    selectPlatform: selectPlatform,
    issueMoveOrder: issueMoveOrder,
    issueContextOrder: issueContextOrder,
    issueMineOrder: issueMineOrder,
    issueBuildOrder: issueBuildOrder,
    issueReturnOrder: issueReturnOrder,
    issueRecoveryOrder: issueRecoveryOrder,
    issueSalvageAllOrder: issueSalvageAllOrder,
    addWreck: addWreck,
    damageFighter: damageFighter,
    stepWorld: stepWorld,
    serializeWorld: serializeWorld,
    deserializeWorld: deserializeWorld,
    saveWorld: saveWorld,
    loadWorld: loadWorld,
    resetWorld: resetWorld
  };
})(window);
