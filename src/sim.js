(function (global) {
  'use strict';

  var Driftworks = (global.Driftworks = global.Driftworks || {});
  var WORLD_VERSION = 1;
  var SAVE_KEY = 'driftworks.save.v1';
  // Precision arrival avoids a visible jump at inspection zoom (32x).
  var ARRIVAL_DISTANCE = 0.001;
  var DOCK_DISTANCE = 44;
  var MINING_RATE = 187.5; // tonnes per tactical second
  var DEPOT_SECTION_MASS = 1500;
  var DEPOT_SECTION = { lengthM: 60, widthM: 40, massKg: DEPOT_SECTION_MASS * 1000 };
  var DEPOT_FRAME = { lengthM: 80, widthM: 160 };
  var METERS_PER_UNIT = 10000 / 600;
  var PHYSICAL_SECONDS_PER_SECOND = 60;
  var MASS_MIGRATION = 1500 / 80;
  var HULLS = {
    escort: { lengthM: 20, dryMassKg: 75000, thrustN: 73549.875 },
    miner: { lengthM: 40, dryMassKg: 500000, thrustN: 196133 },
    tug: { lengthM: 80, dryMassKg: 3000000, thrustN: 588399 },
    mothership: { lengthM: 1000, dryMassKg: 3000000000, thrustN: 2941995 }
  };

  function physicalStats(world, ship) {
    var hull = ship.physical || HULLS[ship.type];
    var payload = recoveryTarget(world, ship.towTarget);
    var payloadKg = payload ? (payload.physical ? payload.physical.dryMassKg + (payload.cargo || 0) * 1000 : payload.massKg || 75000) : 0;
    var massKg = hull.dryMassKg + (ship.cargo || 0) * 1000 +
      (ship.carryingSection ? DEPOT_SECTION_MASS * 1000 : 0) + payloadKg;
    if (ship.type === 'mothership' && world.mothership) {
      var storage = world.mothership.storage;
      massKg += (storage.ore + storage.constructionMass + storage.depotSections * DEPOT_SECTION_MASS) * 1000;
    }
    return { lengthM: hull.lengthM, massKg: massKg, payloadKg: massKg - hull.dryMassKg,
      thrustN: hull.thrustN, accelerationMps2: hull.thrustN / massKg,
      turnRateRadps: ship.turnRate / PHYSICAL_SECONDS_PER_SECOND };
  }

  function movementAcceleration(world, ship) {
    return physicalStats(world, ship).accelerationMps2 * PHYSICAL_SECONDS_PER_SECOND * PHYSICAL_SECONDS_PER_SECOND / METERS_PER_UNIT;
  }

  function asteroidPhysicalStats(asteroid) {
    var radiusM = asteroid.radius * METERS_PER_UNIT;
    return { diameterM: radiusM * 2, massKg: 4 / 3 * Math.PI * Math.pow(radiusM, 3) * 2000, densityKgM3: 2000,
      rotationPeriodSeconds: asteroid.angularVelocity ? Math.PI * 2 / Math.abs(asteroid.angularVelocity) * PHYSICAL_SECONDS_PER_SECOND : Infinity };
  }
  var DEPOT_STAGE_COUNT = 3;
  var REPAIR_SECONDS = 6;
  var FIGHTER_RANGE = 280;
  var FIGHTER_LEASH = FIGHTER_RANGE * 2.5;

  function issueDefendOrder(world, target, shipId) {
    var next = cloneWorld(world);
    var members = next.ships.filter(function (s) {
      return s.type === 'escort' && !s.disabled && s.id !== shipId && next.selectedShipIds.indexOf(s.id) !== -1;
    });
    var center = members.reduce(function (p, s) { p.x += s.position.x / members.length; p.y += s.position.y / members.length; return p; }, { x: 0, y: 0 });
    var angle = Math.atan2(target.y - center.y, target.x - center.x);
    var groupId = next.ships.reduce(function (id, s) { return Math.max(id, s.order.groupId || 0); }, 0) + 1;
    var shapes = { 1: [[0, 0]], 2: [[24, -32], [-24, 32]], 3: [[42, 0], [-21, -48], [-21, 48]], 4: [[64, 0], [0, -48], [0, 48], [-64, 0]] };
    members.forEach(function (s, i) {
      var slot = shapes[members.length] ? shapes[members.length][i] : [Math.cos(i * Math.PI * 2 / members.length) * Math.min(220, members.length * 16), Math.sin(i * Math.PI * 2 / members.length) * Math.min(220, members.length * 16)];
      if (shipId && members.length === 1) slot = [0, 80];
      if (shipId) slot = [slot[0] * 1.7, slot[1] * 1.7];
      s.order = { kind: 'defend', anchor: clonePlain(target), anchorShipId: shipId || null,
        groupId: groupId, formation: { position: clonePlain(center), velocity: { x: 0, y: 0 } },
        leashRadius: FIGHTER_LEASH, side: i % 2 ? -1 : 1,
        offset: { x: slot[0] * Math.cos(angle) - slot[1] * Math.sin(angle), y: slot[0] * Math.sin(angle) + slot[1] * Math.cos(angle) }, target: clonePlain(target) };
    });
    return next;
  }

  function spawnFighter(world) {
    var next = cloneWorld(world);
    var id = 1;
    while (next.ships.some(function (s) { return s.id === 'debug-fighter-' + id; })) id += 1;
    var home = findMothership(next);
    var p = home ? home.position : next.camera;
    next.ships.push(createShip('debug-fighter-' + id, 'Fighter ' + id, 'escort', p.x + 150 + (id % 6) * 35, p.y - 200 - Math.floor(id / 6) * 35, 115));
    return next;
  }

  function stepDefense(ship, world, threats, dt) {
    var order = ship.order;
    var protectedShip = world.ships.filter(function (s) { return s.id === order.anchorShipId; })[0];
    if (protectedShip) order.anchor = clonePlain(protectedShip.position);
    var anchor = order.anchor;
    var radius = order.leashRadius;
    var formation = order.formation;
    var center = formation ? formation.position : anchor;
    var target = { x: center.x + order.offset.x, y: center.y + order.offset.y };
    var threat = threats.filter(function (t) { return distance(t.position, anchor) <= radius + FIGHTER_RANGE; }).sort(function (a, b) {
      return distance(a.position, anchor) - distance(b.position, anchor);
    })[0];
    var fighting = threat && distance(ship.position, anchor) <= radius && (!formation || distance(center, anchor) < 80 || distance(ship.position, threat.position) < FIGHTER_RANGE);
    if (fighting) {
      var dx = ship.position.x - threat.position.x, dy = ship.position.y - threat.position.y;
      var gap = Math.hypot(dx, dy);
      var ux = gap > 0.001 ? dx / gap : 1, uy = gap > 0.001 ? dy / gap : 0;
      var radial = gap < FIGHTER_RANGE * 0.72 ? 110 : gap > FIGHTER_RANGE * 0.9 ? -110 : 0;
      target = { x: ship.position.x + ux * radial - uy * 55 * order.side, y: ship.position.y + uy * radial + ux * 55 * order.side };
      world.ships.forEach(function (other) {
        if (other.id === ship.id || other.type !== 'escort' || other.disabled) return;
        var d = distance(ship.position, other.position);
        if (d < 45 && d > 0.001) {
          target.x += (ship.position.x - other.position.x) / d * (45 - d);
          target.y += (ship.position.y - other.position.y) / d * (45 - d);
        }
      });
    }
    var tx = target.x - anchor.x, ty = target.y - anchor.y, length = Math.hypot(tx, ty);
    if (length > radius && (fighting || !formation || distance(center, anchor) < radius - 400)) target = { x: anchor.x + tx / length * radius, y: anchor.y + ty / length * radius };
    order.target = target;
    var before = distance(ship.position, anchor);
    var velocity = formation && !fighting ? {
      x: formation.velocity.x + (target.x - ship.position.x) * 2,
      y: formation.velocity.y + (target.y - ship.position.y) * 2
    } : null;
    stepTowardOrderTarget(ship, dt, ARRIVAL_DISTANCE, false, velocity);
    // Remove outward momentum at the boundary; distant new orders still travel normally.
    var after = distance(ship.position, anchor);
    if (before <= radius && after > radius) {
      var nx = (ship.position.x - anchor.x) / after, ny = (ship.position.y - anchor.y) / after;
      ship.position = { x: anchor.x + nx * radius, y: anchor.y + ny * radius };
      var outward = Math.max(0, ship.velocity.x * nx + ship.velocity.y * ny);
      ship.velocity.x -= outward * nx; ship.velocity.y -= outward * ny;
    }
    return ship;
  }

  function stepFormations(world, dt) {
    var groups = {};
    world.ships.forEach(function (s) {
      if (s.disabled || s.order.kind !== 'defend' || !s.order.formation) return;
      (groups[s.order.groupId] || (groups[s.order.groupId] = [])).push(s);
    });
    Object.keys(groups).forEach(function (id) {
      var members = groups[id], order = members[0].order;
      var guarded = world.ships.filter(function (s) { return s.id === order.anchorShipId; })[0];
      var anchor = guarded ? guarded.position : order.anchor;
      var formation = clonePlain(order.formation);
      var error = 0, speed = Infinity, acceleration = Infinity;
      members.forEach(function (s) {
        error = Math.max(error, distance(s.position, { x: formation.position.x + s.order.offset.x, y: formation.position.y + s.order.offset.y }));
        speed = Math.min(speed, s.speed);
        acceleration = Math.min(acceleration, s.acceleration);
      });
      // Reserve catch-up speed and ease to a halt when any wingmate loses its slot.
      var cohesion = Math.max(0, Math.min(1, (85 - error) / 60));
      var gap = distance(formation.position, anchor);
      var cruise = Math.min(speed * 0.72 * cohesion, Math.sqrt(2 * acceleration * 0.5 * gap), gap * 2);
      var desired = { x: gap ? (anchor.x - formation.position.x) / gap * cruise : 0, y: gap ? (anchor.y - formation.position.y) / gap * cruise : 0 };
      var dx = desired.x - formation.velocity.x, dy = desired.y - formation.velocity.y;
      var change = Math.hypot(dx, dy), limit = acceleration * 0.5 * dt;
      var fraction = change ? Math.min(1, limit / change) : 0;
      formation.velocity.x += dx * fraction; formation.velocity.y += dy * fraction;
      formation.position.x += formation.velocity.x * dt; formation.position.y += formation.velocity.y * dt;
      members.forEach(function (s) { s.order.formation = clonePlain(formation); });
    });
  }

  function createInitialWorld() {
    return {
      version: WORLD_VERSION,
      physicalUnitsVersion: 1,
      seed: 1729,
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
        createAsteroid('ast-ceres-01', 'Carbonaceous Monolith', -650, 400, 10125)
      ],
      ships: [
        createShip('msv-hardshell', 'MSV Hardshell', 'mothership', 0, 0, 0),
        createShip('miner-01', 'Prospector One', 'miner', -180, -90, 82),
        createShip('miner-02', 'Prospector Two', 'miner', -220, 100, 78),
        createShip('tug-01', 'Linehorse', 'tug', 160, 120, 62),
        createShip('escort-01', 'Watchdog', 'escort', 210, -125, 115),
        createShip('escort-02', 'Longbow', 'escort', 250, -165, 110)
      ]
    };
  }

  function createAsteroid(id, name, x, y, ore) {
    return {
      id: id,
      name: name,
      position: { x: x, y: y },
      ore: ore,
      oreInitial: ore,
      radius: 300,
      rotation: 0,
      angularVelocity: (Math.random() < 0.5 ? -1 : 1) * (0.008 + Math.random() * 0.006)
    };
  }

  function miningSiteDepth(id) {
    var hash = 0;
    for (var i = 0; i < id.length; i += 1) hash = Math.imul(hash, 31) + id.charCodeAt(i) | 0;
    return 0.3 + createRng(hash)() * 0.45;
  }

  function surfaceRadius(asteroid, angle) {
    return asteroid.radius * (0.88 + 0.07 * Math.cos(angle * 3) + 0.05 * Math.sin(angle * 5));
  }

  function createShip(id, name, type, x, y, speed) {
    return {
      id: id,
      name: name,
      type: type,
      position: { x: x, y: y },
      previousPosition: { x: x, y: y },
      velocity: { x: 0, y: 0 },
      previousVelocity: { x: 0, y: 0 },
      rotation: 0,
      order: { kind: 'idle' },
      cargo: 0,
      previousCargo: 0,
      carryingSection: false,
      towTarget: null,
      towedBy: null,
      disabled: false,
      repairRemaining: 0,
      launchElapsed: null,
      cargoCapacity: type === 'miner' ? 1500 : 0,
      physical: clonePlain(HULLS[type]),
      damage: 0,
      speed: speed,
      acceleration: HULLS[type].thrustN / HULLS[type].dryMassKg * PHYSICAL_SECONDS_PER_SECOND * PHYSICAL_SECONDS_PER_SECOND / METERS_PER_UNIT,
      turnRate: speed > 0 ? Math.max(1.4, Math.min(2.8, 180 / speed)) : 0
    };
  }

  function cloneWorld(world) {
    return JSON.parse(JSON.stringify(world));
  }

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

  function randomBetween(rng, min, max) {
    return min + (max - min) * rng();
  }

  function selectShips(world, shipIds) {
    var next = cloneWorld(world);
    var knownIds = {};
    next.ships.forEach(function (ship) {
      knownIds[ship.id] = true;
    });
    next.selectedShipIds = shipIds.filter(function (id) {
      return knownIds[id];
    });
    return next;
  }

  function issueMoveOrder(world, target) {
    var next = cloneWorld(world);
    var selected = {};
    next.selectedShipIds.forEach(function (id) {
      selected[id] = true;
    });
    next.ships.forEach(function (ship) {
      if (selected[ship.id] && ship.speed > 0 && !ship.disabled) {
        ship.order = {
          kind: 'move',
          target: { x: target.x, y: target.y }
        };
      }
    });
    return next;
  }

  function issueContextOrder(world, target) {
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

  function issueMineOrder(world, asteroidId) {
    var next = cloneWorld(world);
    var asteroid = findAsteroid(next, asteroidId);
    var selected = selectedLookup(next);
    if (!asteroid || asteroid.ore <= 0) {
      return next;
    }

    next.ships.forEach(function (ship) {
      if (selected[ship.id] && ship.type === 'miner' && !ship.disabled) {
        ship.order = {
          kind: 'mine',
          asteroidId: asteroid.id,
          phase: 'approach',
          siteDepth: miningSiteDepth(ship.id),
          siteAngle: Math.atan2(ship.position.y - asteroid.position.y, ship.position.x - asteroid.position.x) - asteroid.rotation,
          target: { x: asteroid.position.x, y: asteroid.position.y }
        };
      }
    });
    return next;
  }

  function issueBuildOrder(world) {
    var next = cloneWorld(world);
    var selected = selectedLookup(next);
    var mothership = findMothership(next);
    if (!mothership || !next.depot || next.depot.builtStages >= next.depot.totalStages) {
      return next;
    }

    next.ships.forEach(function (ship) {
      if (selected[ship.id] && ship.type === 'tug' && !ship.disabled && !ship.towTarget) {
        ship.order = {
          kind: 'build',
          target: clonePlain(ship.carryingSection ? next.depot.position : mothership.position)
        };
      }
    });
    return next;
  }

  function issueReturnOrder(world) {
    var next = cloneWorld(world);
    var mothership = findMothership(next);
    var selected = selectedLookup(next);
    if (!mothership) {
      return next;
    }

    next.ships.forEach(function (ship) {
      if (selected[ship.id] && ship.speed > 0 && !ship.disabled) {
        ship.order = {
          kind: 'return',
          target: { x: mothership.position.x, y: mothership.position.y }
        };
      }
    });
    return next;
  }

  function stepWorld(world, dt, threats) {
    var next = normalizeWorld(world);
    stepFormations(next, dt);
    var asteroids = next.asteroids.map(function (asteroid) {
      asteroid.rotation += asteroid.angularVelocity * dt;
      return asteroid;
    });
    var mothership = clonePlain(next.mothership);
    var contract = clonePlain(next.contract);
    var depot = clonePlain(next.depot);
    var mothershipShip = findMothership(next);
    processConstructionMass(mothership, depot);

    var stepped = {
      version: next.version,
      physicalUnitsVersion: 1,
      seed: next.seed,
      elapsedSeconds: next.elapsedSeconds + dt,
      campaign: clonePlain(next.campaign),
      camera: clonePlain(next.camera),
      selectedShipIds: next.selectedShipIds.slice(),
      mothership: mothership,
      depot: depot,
      contract: contract,
      asteroids: asteroids,
      wrecks: next.wrecks,
      nextWreckId: next.nextWreckId,
      recovery: next.recovery,
      ships: next.ships.map(function (ship) {
        return stepShip(ship, dt, asteroids, mothership, mothershipShip, depot, next, threats || []);
      })
    };
    stepRecovery(stepped, dt);
    stepped.ships.forEach(function (ship) { ship.acceleration = movementAcceleration(stepped, ship); });
    return stepped;
  }

  function stepShip(ship, dt, asteroids, mothership, mothershipShip, depot, world, threats) {
    var next = clonePlain(ship);
    next.previousPosition = { x: ship.position.x, y: ship.position.y };
    next.previousVelocity = { x: ship.velocity.x, y: ship.velocity.y };
    next.previousCargo = ship.cargo;

    if (next.disabled) {
      next.velocity = { x: 0, y: 0 };
      return next;
    }
    if (next.order.kind === 'recover') return next;
    if (next.order.kind === 'defend') return stepDefense(next, world, threats, dt);

    if (next.order.kind === 'mine') {
      return stepMiningShip(next, dt, asteroids, mothershipShip);
    }

    if (next.order.kind === 'return') {
      return stepReturningShip(next, dt, mothership, mothershipShip);
    }

    if (next.order.kind === 'build') {
      return stepBuildingShip(next, dt, mothership, mothershipShip, depot);
    }

    if (next.order.kind !== 'move' || next.speed <= 0) {
      next.velocity = { x: 0, y: 0 };
      return next;
    }

    return stepTowardOrderTarget(next, dt, ARRIVAL_DISTANCE, true);
  }

  function stepMiningShip(ship, dt, asteroids, mothershipShip) {
    var asteroid = findAsteroid({ asteroids: asteroids }, ship.order.asteroidId);
    if (!asteroid || asteroid.ore <= 0 || ship.cargo >= ship.cargoCapacity) {
      ship.order = mothershipShip ? { kind: 'return', target: clonePlain(mothershipShip.position) } : { kind: 'idle' };
      return ship;
    }

    if (typeof ship.order.siteAngle !== 'number') {
      ship.order.siteAngle = Math.atan2(ship.position.y - asteroid.position.y, ship.position.x - asteroid.position.x) - asteroid.rotation;
    }
    var angle = ship.order.siteAngle + asteroid.rotation;
    // A top-down view exposes the face, not only the silhouette's rim.
    // Preserve old landed sites on load; new approaches choose an interior site.
    if (typeof ship.order.siteDepth !== 'number') ship.order.siteDepth = ship.order.phase === 'landed' ? 1 : miningSiteDepth(ship.id);
    var radius = surfaceRadius(asteroid, ship.order.siteAngle) * ship.order.siteDepth;
    var site = { x: asteroid.position.x + Math.cos(angle) * radius, y: asteroid.position.y + Math.sin(angle) * radius };
    var surfaceVelocity = { x: -Math.sin(angle) * radius * asteroid.angularVelocity, y: Math.cos(angle) * radius * asteroid.angularVelocity };
    ship.order.target = site;
    if (ship.order.phase !== 'landed') {
      var gap = distance(ship.position, site);
      ship.order.phase = gap < 30 ? 'matching' : 'approach';
      // Track the moving site with velocity feed-forward and a damped approach.
      var desired = { x: surfaceVelocity.x + (site.x - ship.position.x) * 1.5, y: surfaceVelocity.y + (site.y - ship.position.y) * 1.5 };
      var speed = Math.hypot(desired.x, desired.y);
      if (speed > ship.speed) { desired.x *= ship.speed / speed; desired.y *= ship.speed / speed; }
      var dx = desired.x - ship.velocity.x, dy = desired.y - ship.velocity.y;
      var change = Math.hypot(dx, dy), factor = Math.min(1, ship.acceleration * dt / Math.max(change, 0.000001));
      ship.velocity.x += dx * factor;
      ship.velocity.y += dy * factor;
      ship.position.x += ship.velocity.x * dt;
      ship.position.y += ship.velocity.y * dt;
      ship.rotation = rotateToward(ship.rotation, angle + Math.PI, ship.turnRate * dt);
      if (gap > 0.15 || Math.hypot(ship.velocity.x - surfaceVelocity.x, ship.velocity.y - surfaceVelocity.y) > 0.3 || Math.abs(angleDelta(ship.rotation, angle + Math.PI)) > 0.02) return ship;
      ship.order.phase = 'landed';
    }
    ship.position = site;
    ship.rotation = angle + Math.PI;
    ship.velocity = surfaceVelocity;

    var room = ship.cargoCapacity - ship.cargo;
    var extracted = Math.min(room, asteroid.ore, MINING_RATE * dt);
    ship.cargo += extracted;
    asteroid.ore -= extracted;

    if (ship.cargo >= ship.cargoCapacity || asteroid.ore <= 0) {
      ship.order = mothershipShip ? { kind: 'return', target: clonePlain(mothershipShip.position) } : { kind: 'idle' };
    }

    return ship;
  }

  function stepBuildingShip(ship, dt, mothership, mothershipShip, depot) {
    if (!mothershipShip || !depot || depot.builtStages >= depot.totalStages) {
      ship.order = { kind: 'idle' };
      ship.carryingSection = false;
      return ship;
    }

    if (!ship.carryingSection) {
      ship.order.target = clonePlain(mothershipShip.position);
      if (distance(ship.position, mothershipShip.position) > DOCK_DISTANCE) {
        return stepTowardOrderTarget(ship, dt, DOCK_DISTANCE, false);
      }
      if (mothership.storage.depotSections <= 0) {
        ship.velocity = { x: 0, y: 0 };
        return ship;
      }
      mothership.storage.depotSections -= 1;
      ship.carryingSection = true;
      ship.acceleration = movementAcceleration({ ships: [], wrecks: [] }, ship);
    }

    ship.order.target = clonePlain(depot.position);
    if (distance(ship.position, depot.position) > DOCK_DISTANCE) {
      return stepTowardOrderTarget(ship, dt, DOCK_DISTANCE, false);
    }

    depot.builtStages += 1;
    ship.carryingSection = false;
    ship.velocity = { x: 0, y: 0 };
    ship.order = { kind: 'idle' };
    return ship;
  }

  function stepReturningShip(ship, dt, mothership, mothershipShip) {
    if (!mothershipShip) {
      ship.order = { kind: 'idle' };
      return ship;
    }

    ship.order.target = clonePlain(mothershipShip.position);
    if (distance(ship.position, mothershipShip.position) > DOCK_DISTANCE) {
      return stepTowardOrderTarget(ship, dt, DOCK_DISTANCE, false);
    }

    mothership.storage.ore += ship.cargo;
    ship.cargo = 0;
    ship.velocity = { x: 0, y: 0 };
    ship.order = { kind: 'idle' };
    return ship;
  }

  function stepTowardOrderTarget(ship, dt, arrivalDistance, snapOnArrival, formationVelocity) {
    var toTarget = {
      x: ship.order.target.x - ship.position.x,
      y: ship.order.target.y - ship.position.y
    };
    var distance = Math.hypot(toTarget.x, toTarget.y);

    if (distance <= arrivalDistance && !formationVelocity) {
      if (snapOnArrival) {
        ship.position = { x: ship.order.target.x, y: ship.order.target.y };
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
    var stoppingDistance = Math.max(0, distance - arrivalDistance);
    var haulingSpeed = ship.speed; // Work-zone guidance limit, not a physical maximum.
    var haulingAcceleration = ship.acceleration;
    var stoppingSpeed = Math.sqrt(2 * haulingAcceleration * stoppingDistance);
    var desiredSpeed = Math.min(haulingSpeed, stoppingSpeed);
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

    ship.velocity = {
      x: ship.velocity.x + deltaVelocity.x,
      y: ship.velocity.y + deltaVelocity.y
    };

    var nextSpeed = Math.hypot(ship.velocity.x, ship.velocity.y);
    if (nextSpeed > ship.speed) {
      ship.velocity.x = (ship.velocity.x / nextSpeed) * ship.speed;
      ship.velocity.y = (ship.velocity.y / nextSpeed) * ship.speed;
      nextSpeed = ship.speed;
    }

    var travel = formationVelocity ? nextSpeed * dt : Math.min(distance, nextSpeed * dt);
    if (nextSpeed > 0.001) {
      ship.position.x += (ship.velocity.x / nextSpeed) * travel;
      ship.position.y += (ship.velocity.y / nextSpeed) * travel;
      ship.rotation = rotateToward(ship.rotation || 0, Math.atan2(ship.velocity.y, ship.velocity.x), ship.turnRate * dt);
    }

    return ship;
  }

  function serializeWorld(world) {
    return JSON.stringify({
      version: WORLD_VERSION,
      savedAt: new Date().toISOString(),
      world: world
    });
  }

  function deserializeWorld(serialized) {
    var envelope = JSON.parse(serialized);
    if (!envelope || envelope.version !== WORLD_VERSION || !envelope.world) {
      throw new Error('Unsupported Driftworks save version: ' + (envelope && envelope.version));
    }
    if (envelope.world.version !== WORLD_VERSION) {
      throw new Error('Unsupported Driftworks world version: ' + envelope.world.version);
    }
    return normalizeWorld(envelope.world);
  }

  function saveWorld(world, storage) {
    (storage || global.localStorage).setItem(SAVE_KEY, serializeWorld(world));
  }

  function loadWorld(storage) {
    var serialized = (storage || global.localStorage).getItem(SAVE_KEY);
    return serialized ? deserializeWorld(serialized) : createInitialWorld();
  }

  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeWorld(world) {
    var initial = createInitialWorld();
    var next = clonePlain(world);
    next.wrecks = next.wrecks || [];
    next.nextWreckId = next.nextWreckId || 1;
    next.recovery = next.recovery || { salvagedOre: 0, repairedShips: 0 };
    next.mothership = next.mothership || initial.mothership;
    next.mothership.storage = next.mothership.storage || {};
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
    });
    next.selectedShipIds = next.selectedShipIds || [];
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
      next.ships.forEach(function (ship) { ship.cargoCapacity = ship.type === 'miner' ? 1500 : 0; });
      next.physicalUnitsVersion = 1;
    }
    next.ships.forEach(function (ship) {
      ship.physical = ship.physical || clonePlain(HULLS[ship.type]);
      if (typeof ship.cargoCapacity !== 'number') ship.cargoCapacity = ship.type === 'miner' ? 1500 : 0;
      ship.acceleration = movementAcceleration(next, ship);
    });
    return next;
  }

  function addWreck(world, destroyed) {
    var next = normalizeWorld(world);
    next.wrecks.push({
      id: 'wreck-' + next.nextWreckId++,
      position: clonePlain(destroyed.position),
      rotation: Math.atan2(destroyed.velocity.y, destroyed.velocity.x),
      salvageOre: 24,
      massKg: 75000,
      towedBy: null
    });
    return next;
  }

  function damageFighter(world, id, amount) {
    var next = normalizeWorld(world);
    var ship = next.ships.filter(function (candidate) { return candidate.id === id; })[0];
    if (!ship || ship.type !== 'escort' || ship.disabled) return next;
    ship.damage = Math.min(1, (ship.damage || 0) + Math.max(0, amount));
    if (ship.damage >= 1) {
      ship.disabled = true;
      ship.order = { kind: 'idle' };
      ship.velocity = { x: 0, y: 0 };
      ship.previousVelocity = { x: 0, y: 0 };
    }
    return next;
  }

  function recoveryTarget(world, reference) {
    if (!reference) return null;
    var candidates = reference.kind === 'wreck' ? world.wrecks : world.ships;
    return (candidates || []).filter(function (target) {
      return target.id === reference.id && (reference.kind === 'wreck' ||
        (target.type === 'escort' && target.disabled && !target.repairRemaining && target.launchElapsed == null));
    })[0] || null;
  }

  function nearestRecoverable(world, point, range) {
    var best = null;
    (world.wrecks || []).map(function (wreck) { return { kind: 'wreck', id: wreck.id }; })
      .concat(world.ships.filter(function (ship) { return ship.type === 'escort' && ship.disabled; })
        .map(function (ship) { return { kind: 'ship', id: ship.id }; }))
      .forEach(function (reference) {
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

  function issueRecoveryOrder(world, reference) {
    var next = normalizeWorld(world);
    var target = recoveryTarget(next, reference);
    if (!target || target.towedBy) return next;
    next.ships.forEach(function (ship) {
      if (next.selectedShipIds.indexOf(ship.id) < 0 || ship.type !== 'tug' ||
        ship.disabled || ship.carryingSection || ship.towTarget) return;
      ship.order = { kind: 'recover', recoveryTarget: clonePlain(reference), target: clonePlain(target.position) };
    });
    return next;
  }

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
          ship.launchElapsed = 0;
        }
      } else if (ship.launchElapsed != null && mothership) {
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
      if (hauler.order.kind === 'recover' && !hauler.towTarget) {
        var pickup = recoveryTarget(world, hauler.order.recoveryTarget);
        if (!pickup || pickup.towedBy || hauler.carryingSection || !mothership) {
          hauler.order = { kind: 'idle' };
          return;
        }
        hauler.order.target = clonePlain(pickup.position);
        if (distance(hauler.position, pickup.position) > 18) {
          stepTowardOrderTarget(hauler, dt, 12, false);
          return;
        }
        hauler.towTarget = clonePlain(hauler.order.recoveryTarget);
        pickup.towedBy = hauler.id;
        hauler.order = { kind: 'return', target: clonePlain(mothership.position) };
      }
      if (!hauler.towTarget) return;
      var payload = recoveryTarget(world, hauler.towTarget);
      if (!payload || payload.towedBy !== hauler.id) {
        hauler.towTarget = null;
        return;
      }
      payload.position = clonePlain(hauler.position);
      if (hauler.towTarget.kind === 'ship') payload.previousPosition = clonePlain(hauler.previousPosition);
      payload.rotation = hauler.rotation;
      if (mothership && distance(hauler.position, mothership.position) <= DOCK_DISTANCE) {
        if (hauler.towTarget.kind === 'wreck') {
          world.mothership.storage.ore += payload.salvageOre;
          world.recovery.salvagedOre += payload.salvageOre;
          world.wrecks = world.wrecks.filter(function (wreck) { return wreck.id !== payload.id; });
        } else {
          payload.towedBy = null;
          payload.repairRemaining = REPAIR_SECONDS;
          payload.position = clonePlain(mothership.position);
          payload.rotation = mothership.rotation;
          payload.previousPosition = clonePlain(payload.position);
        }
        hauler.towTarget = null;
        hauler.order = { kind: 'idle' };
        hauler.velocity = { x: 0, y: 0 };
      }
    });
  }

  function selectedLookup(world) {
    var selected = {};
    world.selectedShipIds.forEach(function (id) {
      selected[id] = true;
    });
    return selected;
  }

  function selectedType(world, type) {
    var selected = selectedLookup(world);
    return world.ships.some(function (ship) {
      return selected[ship.id] && ship.type === type;
    });
  }

  function findMothership(world) {
    return world.ships.filter(function (ship) {
      return ship.type === 'mothership';
    })[0];
  }

  function findAsteroid(world, asteroidId) {
    return (world.asteroids || []).filter(function (asteroid) {
      return asteroid.id === asteroidId;
    })[0];
  }

  function findNearestAsteroid(world, target, maxDistance) {
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

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

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

  function angleDelta(from, to) {
    var delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  function rotateToward(current, target, maxStep) {
    var delta = angleDelta(current, target);
    if (Math.abs(delta) <= maxStep) return target;
    return current + Math.sign(delta) * maxStep;
  }

  Driftworks.sim = {
    FIGHTER_RANGE: FIGHTER_RANGE,
    FIGHTER_LEASH: FIGHTER_LEASH,
    issueDefendOrder: issueDefendOrder,
    spawnFighter: spawnFighter,
    DEPOT_SECTION: DEPOT_SECTION,
    DEPOT_FRAME: DEPOT_FRAME,
    physicalStats: physicalStats,
    asteroidPhysicalStats: asteroidPhysicalStats,
    METERS_PER_UNIT: METERS_PER_UNIT,
    PHYSICAL_SECONDS_PER_SECOND: PHYSICAL_SECONDS_PER_SECOND,
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
    issueMoveOrder: issueMoveOrder,
    issueContextOrder: issueContextOrder,
    issueMineOrder: issueMineOrder,
    issueBuildOrder: issueBuildOrder,
    issueReturnOrder: issueReturnOrder,
    issueRecoveryOrder: issueRecoveryOrder,
    addWreck: addWreck,
    damageFighter: damageFighter,
    stepWorld: stepWorld,
    serializeWorld: serializeWorld,
    deserializeWorld: deserializeWorld,
    saveWorld: saveWorld,
    loadWorld: loadWorld
  };
})(window);
