(function (global) {
  'use strict';

  var Driftworks = (global.Driftworks = global.Driftworks || {});
  var WORLD_VERSION = 1;
  var SAVE_KEY = 'driftworks.save.v1';
  var ARRIVAL_DISTANCE = 5;

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
      ships: [
        createShip('msv-hardshell', 'MSV Hardshell', 'mothership', 0, 0, 0),
        createShip('miner-01', 'Prospector One', 'miner', -180, -90, 82),
        createShip('miner-02', 'Prospector Two', 'miner', -220, 100, 78),
        createShip('tug-01', 'Linehorse', 'tug', 160, 120, 62),
        createShip('escort-01', 'Watchdog', 'escort', 210, -125, 115)
      ]
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
      rotation: 0,
      order: { kind: 'idle' },
      cargo: 0,
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

  function stepWorld(world, dt) {
    return {
      version: world.version,
      seed: world.seed,
      elapsedSeconds: world.elapsedSeconds + dt,
      campaign: clonePlain(world.campaign),
      camera: clonePlain(world.camera),
      selectedShipIds: world.selectedShipIds.slice(),
      ships: world.ships.map(function (ship) {
        return stepShip(ship, dt);
      })
    };
  }

  function stepShip(ship, dt) {
    var next = clonePlain(ship);
    next.previousPosition = { x: ship.position.x, y: ship.position.y };

    if (next.order.kind !== 'move' || next.speed <= 0) {
      next.velocity = { x: 0, y: 0 };
      return next;
    }

    var toTarget = {
      x: next.order.target.x - next.position.x,
      y: next.order.target.y - next.position.y
    };
    var distance = Math.hypot(toTarget.x, toTarget.y);

    if (distance <= ARRIVAL_DISTANCE) {
      next.position = { x: next.order.target.x, y: next.order.target.y };
      next.previousPosition = { x: next.position.x, y: next.position.y };
      next.velocity = { x: 0, y: 0 };
      next.order = { kind: 'idle' };
      return next;
    }

    var direction = {
      x: toTarget.x / distance,
      y: toTarget.y / distance
    };
    var currentSpeed = Math.hypot(next.velocity.x, next.velocity.y);
    var brakingDistance = (currentSpeed * currentSpeed) / Math.max(1, 2 * next.acceleration);
    var desiredSpeed = distance <= brakingDistance + 12 ? Math.max(18, currentSpeed - next.acceleration * dt) : next.speed;
    var speed = Math.min(next.speed, currentSpeed + next.acceleration * dt, desiredSpeed);
    var travel = Math.min(distance, speed * dt);

    next.position.x += direction.x * travel;
    next.position.y += direction.y * travel;
    next.velocity = { x: direction.x * speed, y: direction.y * speed };
    next.rotation = Math.atan2(direction.y, direction.x);

    return next;
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
    return envelope.world;
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

  Driftworks.sim = {
    WORLD_VERSION: WORLD_VERSION,
    createInitialWorld: createInitialWorld,
    createShip: createShip,
    cloneWorld: cloneWorld,
    createRng: createRng,
    randomBetween: randomBetween,
    selectShips: selectShips,
    issueMoveOrder: issueMoveOrder,
    stepWorld: stepWorld,
    serializeWorld: serializeWorld,
    deserializeWorld: deserializeWorld,
    saveWorld: saveWorld,
    loadWorld: loadWorld
  };
})(window);
