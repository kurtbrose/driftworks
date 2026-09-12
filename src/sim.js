(function (global) {
  'use strict';

  var Driftworks = (global.Driftworks = global.Driftworks || {});
  var WORLD_VERSION = 1;
  var SAVE_KEY = 'driftworks.save.v1';
  var ARRIVAL_DISTANCE = 5;
  var MINE_DISTANCE = 18;
  var DOCK_DISTANCE = 44;
  var MINING_RATE = 10;

  function createInitialWorld() {
    return {
      version: WORLD_VERSION,
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
      mothership: {
        storage: {
          ore: 0
        }
      },
      contract: {
        id: 'contract-ore-01',
        name: 'Starter Regolith Lot',
        quotaOre: 240,
        reward: 18000
      },
      asteroids: [
        createAsteroid('ast-ceres-01', 'Carbonaceous Chunk', -330, 220, 180),
        createAsteroid('ast-ceres-02', 'Nickel-Iron Slab', 220, -240, 150),
        createAsteroid('ast-ceres-03', 'Hydrated Rubble', 470, 95, 210)
      ],
      ships: [
        createShip('msv-hardshell', 'MSV Hardshell', 'mothership', 0, 0, 0),
        createShip('miner-01', 'Prospector One', 'miner', -180, -90, 82),
        createShip('miner-02', 'Prospector Two', 'miner', -220, 100, 78),
        createShip('tug-01', 'Linehorse', 'tug', 160, 120, 62),
        createShip('escort-01', 'Watchdog', 'escort', 210, -125, 115)
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
      radius: Math.max(20, Math.min(42, 18 + ore / 10))
    };
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
      cargoCapacity: type === 'tug' ? 180 : 80,
      damage: 0,
      speed: speed,
      acceleration: speed > 0 ? Math.max(42, speed * 1.3) : 0
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
      if (selected[ship.id] && ship.speed > 0) {
        ship.order = {
          kind: 'move',
          target: { x: target.x, y: target.y }
        };
      }
    });
    return next;
  }

  function issueContextOrder(world, target) {
    var asteroid = findNearestAsteroid(world, target, 38);
    var mothership = findMothership(world);

    if (asteroid) {
      return issueMineOrder(world, asteroid.id);
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
      if (selected[ship.id] && ship.type === 'miner') {
        ship.order = {
          kind: 'mine',
          asteroidId: asteroid.id,
          target: { x: asteroid.position.x, y: asteroid.position.y }
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
      if (selected[ship.id] && ship.speed > 0) {
        ship.order = {
          kind: 'return',
          target: { x: mothership.position.x, y: mothership.position.y }
        };
      }
    });
    return next;
  }

  function stepWorld(world, dt) {
    var next = normalizeWorld(world);
    var asteroids = next.asteroids.map(clonePlain);
    var mothership = clonePlain(next.mothership);
    var contract = clonePlain(next.contract);
    var mothershipShip = findMothership(next);

    return {
      version: next.version,
      seed: next.seed,
      elapsedSeconds: next.elapsedSeconds + dt,
      campaign: clonePlain(next.campaign),
      camera: clonePlain(next.camera),
      selectedShipIds: next.selectedShipIds.slice(),
      mothership: mothership,
      contract: contract,
      asteroids: asteroids,
      ships: next.ships.map(function (ship) {
        return stepShip(ship, dt, asteroids, mothership, mothershipShip);
      })
    };
  }

  function stepShip(ship, dt, asteroids, mothership, mothershipShip) {
    var next = clonePlain(ship);
    next.previousPosition = { x: ship.position.x, y: ship.position.y };
    next.previousVelocity = { x: ship.velocity.x, y: ship.velocity.y };
    next.previousCargo = ship.cargo;

    if (next.order.kind === 'mine') {
      return stepMiningShip(next, dt, asteroids, mothershipShip);
    }

    if (next.order.kind === 'return') {
      return stepReturningShip(next, dt, mothership, mothershipShip);
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

    ship.order.target = clonePlain(asteroid.position);
    if (distance(ship.position, asteroid.position) > MINE_DISTANCE) {
      return stepTowardOrderTarget(ship, dt, MINE_DISTANCE, false);
    }

    var room = ship.cargoCapacity - ship.cargo;
    var extracted = Math.min(room, asteroid.ore, MINING_RATE * dt);
    ship.velocity = { x: 0, y: 0 };
    ship.cargo += extracted;
    asteroid.ore -= extracted;

    if (ship.cargo >= ship.cargoCapacity || asteroid.ore <= 0) {
      ship.order = mothershipShip ? { kind: 'return', target: clonePlain(mothershipShip.position) } : { kind: 'idle' };
    }

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

  function stepTowardOrderTarget(ship, dt, arrivalDistance, snapOnArrival) {
    var toTarget = {
      x: ship.order.target.x - ship.position.x,
      y: ship.order.target.y - ship.position.y
    };
    var distance = Math.hypot(toTarget.x, toTarget.y);

    if (distance <= arrivalDistance) {
      if (snapOnArrival) {
        ship.position = { x: ship.order.target.x, y: ship.order.target.y };
        ship.previousPosition = { x: ship.position.x, y: ship.position.y };
        ship.order = { kind: 'idle' };
      }
      ship.velocity = { x: 0, y: 0 };
      return ship;
    }

    var direction = {
      x: toTarget.x / distance,
      y: toTarget.y / distance
    };
    var currentSpeed = Math.hypot(ship.velocity.x, ship.velocity.y);
    var stoppingDistance = Math.max(0, distance - arrivalDistance);
    var stoppingSpeed = Math.sqrt(2 * ship.acceleration * stoppingDistance);
    var desiredSpeed = Math.min(ship.speed, stoppingSpeed);
    var desiredVelocity = {
      x: direction.x * desiredSpeed,
      y: direction.y * desiredSpeed
    };
    var deltaVelocity = {
      x: desiredVelocity.x - ship.velocity.x,
      y: desiredVelocity.y - ship.velocity.y
    };
    var deltaLength = Math.hypot(deltaVelocity.x, deltaVelocity.y);
    var maxDelta = ship.acceleration * dt;

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

    var travel = Math.min(distance, nextSpeed * dt);
    if (nextSpeed > 0.001) {
      ship.position.x += (ship.velocity.x / nextSpeed) * travel;
      ship.position.y += (ship.velocity.y / nextSpeed) * travel;
      ship.rotation = Math.atan2(ship.velocity.y, ship.velocity.x);
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
    next.mothership = next.mothership || initial.mothership;
    next.contract = next.contract || initial.contract;
    next.asteroids = next.asteroids || initial.asteroids;
    next.ships = next.ships || initial.ships;
    next.selectedShipIds = next.selectedShipIds || [];
    next.camera = next.camera || initial.camera;
    next.campaign = next.campaign || initial.campaign;
    next.elapsedSeconds = typeof next.elapsedSeconds === 'number' ? next.elapsedSeconds : 0;
    next.version = next.version || WORLD_VERSION;
    return next;
  }

  function selectedLookup(world) {
    var selected = {};
    world.selectedShipIds.forEach(function (id) {
      selected[id] = true;
    });
    return selected;
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
      var currentDistance = distance(target, asteroid.position);
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

  Driftworks.sim = {
    WORLD_VERSION: WORLD_VERSION,
    createInitialWorld: createInitialWorld,
    createShip: createShip,
    createAsteroid: createAsteroid,
    cloneWorld: cloneWorld,
    createRng: createRng,
    randomBetween: randomBetween,
    selectShips: selectShips,
    issueMoveOrder: issueMoveOrder,
    issueContextOrder: issueContextOrder,
    issueMineOrder: issueMineOrder,
    issueReturnOrder: issueReturnOrder,
    stepWorld: stepWorld,
    serializeWorld: serializeWorld,
    deserializeWorld: deserializeWorld,
    saveWorld: saveWorld,
    loadWorld: loadWorld
  };
})(window);
