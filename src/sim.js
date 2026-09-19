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
  /** @typedef {import('./types').DriftworksNamespace} DriftworksNamespace */
  /** @type {DriftworksNamespace} */
  var Driftworks = (global.Driftworks = global.Driftworks || {});
  /** @type {PropulsionApi} */
  var propulsion = /** @type {PropulsionApi} */ (Driftworks.propulsion);
  var VELOCITY_TO_MPS = 10000 / 600 / 60;
  var PLATFORM_MASS_KG = 100000;
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
  /** @type {Record<string, { lengthM: number, dryMassKg: number, thrustN: number }>} */
  var HULLS = {
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
      (ship.carryingSection ? DEPOT_SECTION_MASS * 1000 : 0) + payloadKg;
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
  var FIGHTER_RANGE = 280;
  var FIGHTER_LEASH = FIGHTER_RANGE * 2.5;
  var SLOT_TOLERANCE = 6;
  var RAIDER_RANGE = 220;

  /** @param {Ship} ship @param {Threat[]} threats @param {Vec2} anchor @param {number} radius @param {FighterStyle} style @param {Vec2} nominal @param {Ship[]} ships */
  function combatVelocity(ship, threats, anchor, radius, style, nominal, ships) {
    var nearby = threats.filter(function (t) { return distance(t.position, ship.position) < FIGHTER_RANGE + 240; });
    if (!nearby.length) return null;
    var closest = nearby.slice().sort(function (a, b) { return distance(a.position, ship.position) - distance(b.position, ship.position); })[0];
    var dx = ship.position.x - closest.position.x, dy = ship.position.y - closest.position.y;
    var gap = Math.max(0.001, Math.hypot(dx, dy)), ux = dx / gap, uy = dy / gap;
    var enemyVelocity = closest.velocity || { x: 0, y: 0 };
    var closing = Math.max(0, enemyVelocity.x * ux + enemyVelocity.y * uy);
    var radial = Math.max(-ship.speed * 0.5, Math.min(ship.speed, closing + (260 - gap) * 2.5));
    var side = ship.order.kind === 'defend' ? ship.order.side : 1;
    var desired = { x: ux * radial - uy * 12 * side, y: uy * radial + ux * 12 * side };
    var best = { x: 0, y: 0 }, bestScore = Infinity;
    var candidates = [best, desired];
    for (var i = 0; i < 24; i += 1) {
      [0.5, 1].forEach(function (scale) {
        candidates.push({ x: Math.cos(i * Math.PI / 12) * ship.speed * scale, y: Math.sin(i * Math.PI / 12) * ship.speed * scale });
      });
    }
    candidates.forEach(function (candidate) {
      var v = { x: candidate.x, y: candidate.y };
      var speed = Math.hypot(v.x, v.y), cap = ship.speed * style.speed;
      if (speed > cap) { v.x *= cap / speed; v.y *= cap / speed; }
      // Start turning along the boundary before outward momentum carries us over it.
      var edge = distance(ship.position, anchor);
      if (edge > radius - 35 && edge > 0) {
        var nx = (ship.position.x - anchor.x) / edge, ny = (ship.position.y - anchor.y) / edge;
        var outward = Math.max(0, v.x * nx + v.y * ny);
        v.x -= nx * outward; v.y -= ny * outward;
      }
      var score = ((v.x - desired.x) * (v.x - desired.x) + (v.y - desired.y) * (v.y - desired.y)) * 0.002;
      [0.4, 1].forEach(function (horizon) {
        var change = Math.hypot(v.x - ship.velocity.x, v.y - ship.velocity.y);
        var ramp = Math.min(horizon, change / (ship.acceleration * style.acceleration));
        var p = { x: ship.position.x + v.x * horizon + (ship.velocity.x - v.x) * ramp * 0.5,
          y: ship.position.y + v.y * horizon + (ship.velocity.y - v.y) * ramp * 0.5 };
        var nearest = Infinity;
        nearby.forEach(function (t) {
          var tv = t.velocity || { x: 0, y: 0 };
          var d = distance(p, { x: t.position.x + tv.x * horizon, y: t.position.y + tv.y * horizon });
          nearest = Math.min(nearest, d);
          // Every nearby enemy counts: never kite one target straight into another.
          score += Math.pow(Math.max(0, RAIDER_RANGE + 20 - d), 2) * 8;
        });
        score += Math.pow(Math.max(0, nearest - 270), 2) * 0.12;
        score += Math.pow(Math.max(0, distance(p, anchor) - radius), 2) * 40;
        score += Math.pow(Math.max(0, distance(p, nominal) - 150), 2) * 0.0005;
        ships.forEach(function (ally) {
          if (ally.id === ship.id || ally.type !== 'escort' || ally.disabled) return;
          var separation = distance(p, { x: ally.position.x + ally.velocity.x * horizon, y: ally.position.y + ally.velocity.y * horizon });
          score += Math.pow(Math.max(0, 45 - separation), 2) * 0.2;
        });
      });
      if (score < bestScore) { bestScore = score; best = v; }
    });
    return best;
  }

  /** @param {Ship} ship @returns {FighterStyle} */
  function fighterStyle(ship) {
    var hash = 0;
    for (var i = 0; i < ship.id.length; i += 1) hash = Math.imul(hash, 31) + ship.id.charCodeAt(i) | 0;
    var random = createRng(hash);
    var angle = random() * Math.PI * 2, radius = 3 + random() * 4;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius,
      speed: 0.94 + random() * 0.06, acceleration: 0.88 + random() * 0.12 };
  }

  /** @param {{ offset?: Vec2 }} order @param {Vec2} center @param {FighterStyle} style @param {number} looseness @returns {Vec2} */
  function occupiedSlot(order, center, style, looseness) {
    var offset = order.offset || { x: 0, y: 0 };
    return { x: center.x + offset.x * (1 + looseness * 0.65) + style.x * (1 + looseness * 3),
      y: center.y + offset.y * (1 + looseness * 0.65) + style.y * (1 + looseness * 3) };
  }

  /** @param {Ship[]} members @param {Formation} formation @param {string | null | undefined} shipId */
  function assignFormationSlots(members, formation, shipId) {
    /** @type {Record<number, number[][]>} */
    var shapes = { 1: [[0, 0]], 2: [[24, -32], [-24, 32]], 3: [[42, 0], [-21, -48], [-21, 48]], 4: [[64, 0], [0, -48], [0, 48], [-64, 0]] };
    var angle = formation.angle || 0;
    var slots = members.map(function (s, i) {
      var slot = shapes[members.length] ? shapes[members.length][i] : [Math.cos(i * Math.PI * 2 / members.length) * Math.min(220, members.length * 16), Math.sin(i * Math.PI * 2 / members.length) * Math.min(220, members.length * 16)];
      if (shipId && members.length === 1) slot = [0, 80];
      if (shipId) slot = [slot[0] * 1.7, slot[1] * 1.7];
      return { x: slot[0] * Math.cos(angle) - slot[1] * Math.sin(angle), y: slot[0] * Math.sin(angle) + slot[1] * Math.cos(angle) };
    });
    // Match nearby occupants once when the shape changes, not on every frame.
    /** @type {{ member: number, slot: number, cost: number }[]} */
    var choices = [];
    members.forEach(function (ship, member) {
      slots.forEach(function (slot, index) {
        choices.push({ member: member, slot: index, cost: distance(ship.position, { x: formation.position.x + slot.x, y: formation.position.y + slot.y }) });
      });
    });
    choices.sort(function (a, b) { return a.cost - b.cost || a.member - b.member || a.slot - b.slot; });
    /** @type {Record<number, boolean>} */
    var usedMembers = {};
    /** @type {Record<number, boolean>} */
    var usedSlots = {};
    choices.forEach(function (choice) {
      if (usedMembers[choice.member] || usedSlots[choice.slot]) return;
      usedMembers[choice.member] = true; usedSlots[choice.slot] = true;
      if (members[choice.member].order.kind !== 'defend') return;
      var order = /** @type {DefendOrder} */ (members[choice.member].order);
      order.offset = slots[choice.slot];
      order.side = choice.slot % 2 ? -1 : 1;
    });
    formation.memberIds = members.map(function (s) { return s.id; });
  }

  /** @param {World} world @param {Vec2} target @param {string | null | undefined} shipId @returns {World} */
  function issueDefendOrder(world, target, shipId) {
    var next = cloneWorld(world);
    var members = next.ships.filter(function (s) {
      return s.type === 'escort' && !s.disabled && s.id !== shipId && next.selectedShipIds.indexOf(s.id) !== -1;
    });
    var center = members.reduce(function (p, s) { p.x += s.position.x / members.length; p.y += s.position.y / members.length; return p; }, { x: 0, y: 0 });
    var angle = Math.atan2(target.y - center.y, target.x - center.x);
    if (!members.length) return next;
    next.formations = next.formations || {};
    var oldId = members[0].order.kind === 'defend' ? members[0].order.groupId : 0;
    var oldMembers = next.ships.filter(function (s) { return !s.disabled && s.order.kind === 'defend' && s.order.groupId === oldId; });
    var reuse = oldId && oldMembers.length === members.length && members.every(function (s) { return s.order.kind === 'defend' && s.order.groupId === oldId; });
    var groupId = reuse ? oldId : Math.max(next.nextFormationId || 1, next.ships.reduce(function (id, s) {
      return Math.max(id, (s.order.kind === 'defend' ? s.order.groupId : 0) + 1);
    }, 1));
    next.nextFormationId = Math.max(next.nextFormationId || 1, groupId + 1);
    var prior = reuse && (next.formations[oldId] || (members[0].order.kind === 'defend' ? members[0].order.formation : null));
    var formation = prior ? clonePlain(prior) : { position: clonePlain(center), velocity: { x: 0, y: 0 }, angle: angle };
    formation.pivoting = Math.hypot(formation.velocity.x, formation.velocity.y) < 15 || Math.abs(angleDelta(formation.angle, angle)) > Math.PI / 3;
    formation.directTravel = false;
    formation.relocating = true;
    next.formations[groupId] = formation;
    members.forEach(function (s, i) {
      s.order = { kind: 'defend', anchor: clonePlain(target), anchorShipId: shipId || null,
        groupId: groupId,
        leashRadius: FIGHTER_LEASH, side: i % 2 ? -1 : 1,
        target: clonePlain(target), offset: { x: 0, y: 0 } };
    });
    assignFormationSlots(members, formation, shipId);
    members.forEach(function (s) { if (s.order.kind === 'defend') s.order.formation = clonePlain(formation); });
    return next;
  }

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

  /** @param {Ship} ship @param {World} world @param {Threat[]} threats @param {number} dt @returns {Ship} */
  function stepDefense(ship, world, threats, dt) {
    if (ship.order.kind !== 'defend') return ship;
    /** @type {DefendOrder} */
    var order = ship.order;
    var protectedShip = world.ships.filter(function (s) { return s.id === order.anchorShipId; })[0];
    if (protectedShip) order.anchor = clonePlain(protectedShip.position);
    var anchor = order.anchor;
    var radius = order.leashRadius || FIGHTER_LEASH;
    var formation = order.formation;
    var center = formation ? formation.position : anchor;
    var style = fighterStyle(ship);
    var looseness = formation ? formation.looseness || 0 : 0;
    var tolerance = SLOT_TOLERANCE + looseness * 24;
    var target = occupiedSlot(order, center, style, looseness);
    var nominal = target;
    var eligible = threats.filter(function (t) { return distance(t.position, anchor) <= radius + FIGHTER_RANGE; });
    var relocating = formation && formation.relocating;
    // New player destinations take priority over voluntarily staying in a fight.
    var tacticalVelocity = !relocating && distance(ship.position, anchor) <= radius ?
      combatVelocity(ship, eligible, anchor, radius, style, nominal, world.ships) : null;
    var fighting = !!tacticalVelocity;
    if (!relocating && !fighting && eligible.length && distance(ship.position, anchor) <= radius) {
      var threat = eligible.slice().sort(function (a, b) { return distance(a.position, ship.position) - distance(b.position, ship.position); })[0];
      var gap = distance(ship.position, threat.position);
      // Intercept distant threats without driving all the way into their position.
      if (gap > FIGHTER_RANGE) {
        target = { x: threat.position.x + (ship.position.x - threat.position.x) / gap * 260,
          y: threat.position.y + (ship.position.y - threat.position.y) / gap * 260 };
        fighting = true;
      }
    }
    var tx = target.x - anchor.x, ty = target.y - anchor.y, length = Math.hypot(tx, ty);
    if (length > radius && (fighting || !formation || distance(center, anchor) < radius - 400)) target = { x: anchor.x + tx / length * radius, y: anchor.y + ty / length * radius };
    order.target = target;
    var before = distance(ship.position, anchor);
    var error = distance(target, ship.position);
    var moving = formation && Math.hypot(formation.velocity.x, formation.velocity.y) > 15 && error < 35;
    var correction = error > tolerance ? Math.min((error - tolerance) * (moving ? 0.65 : 1.5), moving ? ship.speed * 0.22 : ship.speed) / error : 0;
    var omega = formation ? formation.angularVelocity || 0 : 0;
    var rx = target.x - center.x, ry = target.y - center.y;
    var velocity = formation && !fighting ? {
      x: formation.velocity.x - omega * ry + (target.x - ship.position.x) * correction,
      y: formation.velocity.y + omega * rx + (target.y - ship.position.y) * correction
    } : null;
    if (tacticalVelocity) {
      velocity = tacticalVelocity;
      order.target = { x: ship.position.x + velocity.x, y: ship.position.y + velocity.y };
    }
    stepTowardOrderTarget(ship, dt, ARRIVAL_DISTANCE, false, velocity, style);
    return ship;
  }

  /** @param {World} world @param {number} dt @param {Threat[]} threats */
  function stepFormations(world, dt, threats) {
    world.formations = world.formations || {};
    /** @type {Record<string, Ship[]>} */
    var groups = {};
    world.ships.forEach(function (s) {
      if (s.disabled || s.order.kind !== 'defend' || !s.order.formation) return;
      (groups[s.order.groupId] || (groups[s.order.groupId] = [])).push(s);
    });
    Object.keys(world.formations).forEach(function (id) { if (!groups[id]) delete world.formations[id]; });
    Object.keys(groups).forEach(function (id) {
      var members = groups[id];
      if (!members || members[0].order.kind !== 'defend') return;
      /** @type {DefendOrder} */
      var order = members[0].order;
      var guarded = world.ships.filter(function (s) { return s.id === order.anchorShipId; })[0];
      var anchor = guarded ? guarded.position : order.anchor;
      /** @type {Formation} */
      var formation = clonePlain(world.formations[id] || order.formation);
      var memberIds = members.map(function (s) { return s.id; });
      if (!formation.memberIds || formation.memberIds.join('|') !== memberIds.join('|')) {
        assignFormationSlots(members, formation, order.anchorShipId);
      }
      if (distance(formation.position, anchor) < 20) formation.relocating = false;
      var formationLooseness = formation.looseness || 0;
      var contact = threats.some(function (t) {
        return distance(t.position, anchor) <= (order.leashRadius || FIGHTER_LEASH) + FIGHTER_RANGE &&
          (distance(formation.position, anchor) < 80 || members.some(function (s) { return distance(s.position, t.position) < FIGHTER_RANGE * 1.25; }));
      });
      formation.looseness = formationLooseness + ((contact ? 1 : 0) - formationLooseness) * (1 - Math.exp(-dt / 2));
      formationLooseness = formation.looseness;
      var error = 0, speed = Infinity, acceleration = Infinity, extent = 1;
      members.forEach(function (s) {
        var style = fighterStyle(s);
        if (s.order.kind !== 'defend') return;
        error = Math.max(error, Math.max(0, distance(s.position, occupiedSlot(s.order, formation.position, style, formationLooseness)) - SLOT_TOLERANCE - formationLooseness * 24));
        speed = Math.min(speed, s.speed * style.speed);
        acceleration = Math.min(acceleration, s.acceleration * style.acceleration);
        var offset = s.order.kind === 'defend' && s.order.offset ? s.order.offset : { x: 0, y: 0 };
        extent = Math.max(extent, Math.hypot(offset.x, offset.y) * (1 + formationLooseness * 0.65));
      });
      // Reserve catch-up speed and ease to a halt when any wingmate loses its slot.
      var cohesion = Math.max(error < 120 ? 0.35 : 0, Math.min(1, (85 - error) / 60));
      var gap = distance(formation.position, anchor);
      var oldAngle = formation.angle || 0;
      var turn = gap > 35 ? angleDelta(oldAngle, Math.atan2(anchor.y - formation.position.y, anchor.x - formation.position.x)) : 0;
      if (Math.abs(turn) > Math.PI / 3) formation.pivoting = true;
      var pivoting = formation.pivoting;
      // Leave headroom for the outside of the wheel instead of forcing those ships to cut across it.
      var turnLimit = Math.min(0.65, speed * 0.25 / extent);
      var desiredTurn = Math.max(-turnLimit, Math.min(turnLimit, turn * 1.2));
      var angularVelocity = formation.angularVelocity || 0;
      angularVelocity += Math.max(-0.7 * dt, Math.min(0.7 * dt, desiredTurn - angularVelocity));
      var rotation = pivoting ? (gap > 1 ? angleDelta(oldAngle, Math.atan2(anchor.y - formation.position.y, anchor.x - formation.position.x)) : 0) : angularVelocity * dt;
      formation.angle = oldAngle + rotation;
      formation.angularVelocity = pivoting ? 0 : angularVelocity;
      if (pivoting) {
        assignFormationSlots(members, formation, order.anchorShipId);
        formation.pivoting = false;
        formation.directTravel = true;
      } else {
        members.forEach(function (s) {
          if (s.order.kind !== 'defend') return;
          var offset = s.order.offset || { x: 0, y: 0 };
          s.order.offset = { x: offset.x * Math.cos(rotation) - offset.y * Math.sin(rotation), y: offset.x * Math.sin(rotation) + offset.y * Math.cos(rotation) };
        });
      }
      var cruise = Math.min(speed * 0.72 * cohesion, Math.sqrt(2 * acceleration * 0.5 * gap), gap * 2);
      // Tight turns slow the center moderately, while keeping forward motion through the arc.
      cruise *= 1 - Math.min(1, Math.abs(turn) / Math.PI) * 0.35;
      var currentSpeed = Math.hypot(formation.velocity.x, formation.velocity.y);
      currentSpeed += Math.max(-acceleration * 0.35 * dt, Math.min(acceleration * 0.35 * dt, cruise - currentSpeed));
      if (formation.directTravel) {
        var desired = { x: gap ? (anchor.x - formation.position.x) / gap * cruise : 0, y: gap ? (anchor.y - formation.position.y) / gap * cruise : 0 };
        var dx = desired.x - formation.velocity.x, dy = desired.y - formation.velocity.y;
        var change = Math.hypot(dx, dy);
        var blend = change ? Math.min(1, acceleration * 0.35 * dt / change) : 0;
        formation.velocity.x += dx * blend; formation.velocity.y += dy * blend;
      } else if (gap > 35) {
        formation.velocity = { x: Math.cos(formation.angle) * currentSpeed, y: Math.sin(formation.angle) * currentSpeed };
      } else {
        // Final arrival may brake normally; don't wheel around an almost-reached destination.
        formation.velocity = { x: gap ? (anchor.x - formation.position.x) / gap * currentSpeed : 0, y: gap ? (anchor.y - formation.position.y) / gap * currentSpeed : 0 };
      }
      formation.position.x += formation.velocity.x * dt; formation.position.y += formation.velocity.y * dt;
      world.formations[id] = formation;
      members.forEach(function (s) { if (s.order.kind === 'defend') s.order.formation = clonePlain(formation); });
    });
  }

  function createInitialWorld() {
    var world = {
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
      formations: {},
      nextFormationId: 1,
      logisticsVersion: 2,
      miningMission: 'active',
      platforms: [createPlatform('platform-01'), createPlatform('platform-02')],
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
        createAsteroid('ast-ceres-01', 'Carbonaceous Monolith', -650, 400, 10125)
      ],
      ships: [
        createShip('msv-hardshell', 'MSV Hardshell', 'mothership', 0, 0, 0),
        createShip('tug-01', 'Linehorse', 'tug', 160, 120, 62),
        createShip('escort-01', 'Watchdog', 'escort', 210, -125, 115),
        createShip('escort-02', 'Longbow', 'escort', 250, -165, 110)
      ]
    };
    world.ships.forEach(function (ship) { ship.acceleration = movementAcceleration(world, ship); });
    return world;
  }

  /** @param {string} id @param {string} name @param {number} x @param {number} y @param {number} ore @returns {Asteroid} */
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
      if (selected[ship.id] && ship.speed > 0 && !ship.disabled) {
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
    var platform = (world.platforms || []).filter(function (p) { return p.state === 'deployed' && distance(target, p.position) < 22; })[0];
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
    ship.order = { kind: 'deploy', asteroidId: asteroid.id, platformId: platform.id,
      siteDepth: miningSiteDepth(platform.id),
      siteAngle: Math.atan2(home.position.y - asteroid.position.y, home.position.x - asteroid.position.x) - asteroid.rotation,
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
      if (selected[ship.id] && ship.speed > 0 && !ship.disabled) {
        ship.order = {
          kind: 'return',
          target: { x: returnHome.position.x, y: returnHome.position.y }
        };
      }
    });
    return next;
  }

  /** @param {World} world @param {number} dt @param {Threat[]} threats @returns {World} */
  function stepWorld(world, dt, threats) {
    var next = normalizeWorld(world);
    stepFormations(next, dt, threats || []);
    var asteroids = next.asteroids.map(function (asteroid) {
      asteroid.rotation = (asteroid.rotation || 0) + (asteroid.angularVelocity || 0) * dt;
      return asteroid;
    });
    /** @type {MothershipState} */
    var mothership = /** @type {MothershipState} */ (clonePlain(next.mothership));
    var contract = clonePlain(next.contract);
    var depot = /** @type {Depot} */ (clonePlain(next.depot));
    var mothershipShip = findMothership(next);
    processConstructionMass(mothership, depot);

    var stepped = {
      logisticsVersion: 2,
      miningMission: next.miningMission,
      platforms: next.platforms,
      packets: next.packets,
      nextPacketId: next.nextPacketId,
      version: next.version,
      physicalUnitsVersion: 1,
      seed: next.seed,
      elapsedSeconds: (next.elapsedSeconds || 0) + dt,
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
      formations: next.formations,
      nextFormationId: next.nextFormationId,
      ships: next.ships.map(function (ship) {
        return stepShip(ship, dt, asteroids, mothership, mothershipShip, depot, next, threats || []);
      })
    };
    stepRecovery(stepped, dt);
    stepLogistics(stepped, dt);
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
      next.velocity = { x: 0, y: 0 };
      return next;
    }
    if (next.docked && next.order.kind === 'idle' && mothershipShip) {
      next.position = berthPosition(next, mothershipShip);
      next.velocity = clonePlain(mothershipShip.velocity);
      return next;
    }
    launchShip(next, mothershipShip);
    next.burnMassKg = physicalStats(world, next).massKg;
    if (next.propulsion && !next.docked && next.order.kind !== 'return' && mothershipShip &&
        remainingDeltaV(world, next) < returnReserve(next, mothershipShip)) {
      next.order = { kind: 'return', target: clonePlain(mothershipShip.position), automatic: true };
    }
    if (next.order.kind === 'deploy' || next.order.kind === 'retrieve-platform') return stepPlatformCarrier(next, world, dt);
    if (next.order.kind === 'recover') return next;
    if (next.order.kind === 'defend') return stepDefense(next, world, threats, dt);


    if (next.order.kind === 'return') {
      return stepReturningShip(next, dt, mothership, mothershipShip);
    }

    if (next.order.kind === 'build') {
      return stepBuildingShip(next, dt, mothership, mothershipShip, depot);
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
    ship.docked = true;
    ship.position = berthPosition(ship, home);
    ship.velocity = clonePlain(home.velocity);
    if (ship.propulsion) ship.propulsion.fuelKg = ship.propulsion.capacityKg;
  }

  /** @param {Ship} ship @param {Ship} home @returns {Vec2} */
  function berthPosition(ship, home) {
    var angle = fighterStyle(ship).x;
    return { x: home.position.x + Math.cos(angle) * 35, y: home.position.y + Math.sin(angle) * 35 };
  }

  /** @param {Ship} ship @param {Ship | undefined} home */
  function launchShip(ship, home) {
    if (!ship.docked || !home || ship.order.kind === 'idle' || !('target' in ship.order) || !ship.order.target || ship.order.kind === 'return') return;
    var target = ship.order.target;
    if (ship.order.kind === 'build' && !ship.carryingSection) return;
    var dx = target.x - home.position.x, dy = target.y - home.position.y;
    var gap = Math.hypot(dx, dy);
    ship.docked = false;
    if (gap <= ARRIVAL_DISTANCE) return;
    var speed = Math.min(ship.speed, propulsion.exchangeMps / VELOCITY_TO_MPS,
      Math.sqrt(ship.acceleration * gap));
    ship.velocity = { x: home.velocity.x + dx / gap * speed, y: home.velocity.y + dy / gap * speed };
    ship.docked = false;
  }

  /** @param {string} id @returns {Platform} */
  function createPlatform(id) {
    return { id: id, carrierId: null, state: 'stored', position: { x: 0, y: 0 },
      asteroidId: null, siteAngle: 0, siteDepth: 0.5, ore: 0, packetTimer: 0 };
  }

  /** @param {World} world */
  function migrateLogistics(world) {
    world.platforms = world.platforms || [createPlatform('platform-01'), createPlatform('platform-02')];
    if (!world.mothership) return;
    world.ships = world.ships.filter(function (ship) {
      if (ship.type !== 'miner' && ship.type !== 'cargo') return true;
      // Retire obsolete mining hulls, preserving any ore already aboard.
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
      !s.platformId && !s.carryingSection && !s.towTarget && s.order.kind === 'idle'; })[0];
  }

  /** @param {World} world @returns {boolean} */
  function canDeployPlatform(world) {
    return world.miningMission === 'active' && !!availablePlatformCarrier(world) &&
      world.platforms.some(function (p) { return p.state === 'stored'; }) &&
      world.asteroids.some(function (a) { return a.ore > 0; });
  }

  /** @param {Platform} platform @param {Asteroid} asteroid @returns {{ position: Vec2, velocity: Vec2 }} */
  function platformSite(platform, asteroid) {
    var siteAngle = platform.siteAngle || 0;
    var rotation = asteroid.rotation || 0;
    var angularVelocity = asteroid.angularVelocity || 0;
    var angle = siteAngle + rotation;
    var radius = surfaceRadius(asteroid, siteAngle) * (platform.siteDepth || 0.5);
    return { position: { x: asteroid.position.x + Math.cos(angle) * radius,
      y: asteroid.position.y + Math.sin(angle) * radius },
      velocity: { x: -Math.sin(angle) * radius * angularVelocity,
        y: Math.cos(angle) * radius * angularVelocity } };
  }

  /** @param {World} world @param {string} id @returns {World} */
  function issuePlatformRecovery(world, id) {
    var next = cloneWorld(world), selected = selectedLookup(next);
    var platform = (next.platforms || []).filter(function (p) { return p.id === id && p.state === 'deployed'; })[0];
    if (!platform) return next;
    var carrier = next.ships.filter(function (s) { return selected[s.id] && s.type === 'tug' &&
      !s.disabled && !s.platformId && !s.carryingSection && !s.towTarget; })[0];
    if (carrier) carrier.order = { kind: 'retrieve-platform', platformId: id, target: clonePlain(platform.position) };
    return next;
  }

  /** @param {World} world @returns {World} */
  function endMining(world) {
    var next = cloneWorld(world);
    next.miningMission = 'recovering';
    var home = findMothership(next);
    if (!home) return next;
    var homePosition = clonePlain(home.position);
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
    var platform = world.platforms.filter(function (p) { return p.id === (deploying ? order.platformId : order.platformId); })[0];
    var asteroidId = order.kind === 'deploy' ? order.asteroidId : platform && platform.asteroidId;
    var asteroid = findAsteroid(world, asteroidId);
    if (!platform || !asteroid || (!deploying && platform.state !== 'deployed')) {
      ship.order = { kind: 'idle' }; return ship;
    }
    var home = findMothership(world);
    if (deploying && !ship.platformId) {
      if (platform.state !== 'stored') { ship.order = { kind: 'idle' }; return ship; }
      if (!home) return ship;
      ship.order.target = clonePlain(home.position);
      if (!canCatch(ship, home)) return stepTowardOrderTarget(ship, dt, 0, false);
      dockShip(ship, home);
      platform.state = 'carried'; platform.carrierId = ship.id;
      ship.platformId = platform.id;
      ship.acceleration = movementAcceleration(world, ship);
      ship.burnMassKg = physicalStats(world, ship).massKg;
    }
    var siteAngle = order.kind === 'deploy' ? order.siteAngle : platform.siteAngle;
    var siteDepth = order.kind === 'deploy' ? order.siteDepth : platform.siteDepth;
    var site = platformSite(deploying ? { id: platform.id, state: platform.state, position: platform.position, carrierId: null, asteroidId: null, ore: 0, packetTimer: 0, siteAngle: siteAngle, siteDepth: siteDepth } : platform, asteroid);
    ship.order.target = site.position;
    launchShip(ship, home);
    var dx = site.position.x - ship.position.x, dy = site.position.y - ship.position.y;
    var gap = Math.hypot(dx, dy);
    var speed = Math.min(ship.speed, Math.sqrt(2 * ship.acceleration * gap), gap * 1.5);
    stepTowardOrderTarget(ship, dt, 0, false, { x: site.velocity.x + dx / Math.max(gap, 0.001) * speed,
      y: site.velocity.y + dy / Math.max(gap, 0.001) * speed });
    if (gap > 1 || distance(ship.velocity, site.velocity) > 1) return ship;
    if (deploying) {
      platform.state = 'deployed'; platform.carrierId = null;
      platform.asteroidId = asteroid.id; platform.siteAngle = siteAngle; platform.siteDepth = siteDepth;
      platform.position = site.position;
      ship.platformId = null;
    } else {
      platform.state = 'carried'; platform.carrierId = ship.id;
      ship.platformId = platform.id;
      ship.cargo += platform.ore || 0; platform.ore = 0;
    }
    var home = findMothership(world);
    if (!home) return ship;
    ship.order = { kind: 'return', target: clonePlain(home.position) };
    return ship;
  }

  /** @param {World} world @param {number} dt */
  function stepLogistics(world, dt) {
    var home = findMothership(world);
    if (!home) return;
    var logisticsHome = home;
    world.platforms.forEach(function (platform) {
      if (platform.state === 'stored') { platform.position = clonePlain(logisticsHome.position); return; }
      if (platform.state === 'carried') {
        var carrier = world.ships.filter(function (s) { return s.id === platform.carrierId; })[0];
        if (carrier) {
          platform.position = clonePlain(carrier.position);
          if (carrier.docked && carrier.order.kind === 'idle') {
            platform.state = 'stored'; platform.carrierId = null; carrier.platformId = null;
          }
        }
        return;
      }
      var asteroid = findAsteroid(world, platform.asteroidId);
      if (!asteroid) return;
      platform.position = platformSite(platform, asteroid).position;
      if (world.miningMission !== 'active') return;
      var extracted = Math.min(asteroid.ore || 0, MINING_RATE * dt);
      asteroid.ore -= extracted; platform.ore += extracted; platform.packetTimer += dt;
      if (platform.ore > 0 && (platform.packetTimer >= 4 || asteroid.ore === 0)) {
        var dx = logisticsHome.position.x - platform.position.x, dy = logisticsHome.position.y - platform.position.y;
        var gap = Math.max(0.001, Math.hypot(dx, dy));
        var speed = propulsion.exchangeMps / VELOCITY_TO_MPS * 0.8;
        world.packets.push({ id: world.nextPacketId++, position: clonePlain(platform.position),
          velocity: { x: logisticsHome.velocity.x + dx / gap * speed, y: logisticsHome.velocity.y + dy / gap * speed }, ore: platform.ore });
        platform.ore = 0; platform.packetTimer = 0;
      }
    });
    world.packets = world.packets.filter(function (packet) {
      // Closest point on the swept relative trajectory prevents tunnelling past the catcher.
      var dx = (packet.velocity.x - logisticsHome.velocity.x) * dt, dy = (packet.velocity.y - logisticsHome.velocity.y) * dt;
      var t = Math.max(0, Math.min(1, ((logisticsHome.position.x - packet.position.x) * dx +
        (logisticsHome.position.y - packet.position.y) * dy) / Math.max(1e-12, dx * dx + dy * dy)));
      var closest = { x: packet.position.x + dx * t, y: packet.position.y + dy * t };
      if (propulsion.canCatch(closest, packet.velocity, logisticsHome, DOCK_DISTANCE, VELOCITY_TO_MPS)) {
        world.mothership.storage.ore += packet.ore; return false;
      }
      packet.position.x += packet.velocity.x * dt; packet.position.y += packet.velocity.y * dt;
      return true;
    });
    if (world.miningMission !== 'recovering') return;
    /** @type {Record<string, boolean>} */
    var reserved = {};
    world.ships.forEach(function (s) { if (s.order.kind === 'retrieve-platform') reserved[s.order.platformId] = true; });
    world.ships.forEach(function (s) {
      if (s.type !== 'tug' || s.disabled || s.order.kind !== 'idle' || s.carryingSection || s.towTarget) return;
      if (s.platformId) {
        if (!s.docked) s.order = { kind: 'return', target: clonePlain(logisticsHome.position) };
        return;
      }
      var platform = world.platforms.filter(function (p) { return p.state === 'deployed' && !reserved[p.id]; })[0];
      if (platform) {
        reserved[platform.id] = true;
        s.order = { kind: 'retrieve-platform', platformId: platform.id, target: clonePlain(platform.position) };
      }
    });
    if (!world.packets.length && world.platforms.every(function (p) {
      return p.state === 'stored';
    })) world.miningMission = 'complete';
  }

  /** @param {Ship} ship @param {number} dt @param {MothershipState} mothership @param {Ship | undefined} mothershipShip @param {Depot | undefined} depot @returns {Ship} */
  function stepBuildingShip(ship, dt, mothership, mothershipShip, depot) {
    if (ship.order.kind !== 'build') return ship;
    if (!mothershipShip || !depot || depot.builtStages >= depot.totalStages) {
      ship.order = { kind: 'idle' };
      ship.carryingSection = false;
      return ship;
    }

    if (!ship.carryingSection) {
      ship.order.target = clonePlain(mothershipShip.position);
      if (!canCatch(ship, mothershipShip)) {
        return stepTowardOrderTarget(ship, dt, DOCK_DISTANCE, false);
      }
      dockShip(ship, mothershipShip);
      if (mothership.storage.depotSections <= 0) {
        ship.velocity = { x: 0, y: 0 };
        return ship;
      }
      mothership.storage.depotSections -= 1;
      ship.carryingSection = true;
      ship.acceleration = movementAcceleration({ ships: [], wrecks: [] }, ship);
      ship.burnMassKg = physicalStats({ ships: [], wrecks: [] }, ship).massKg;
    }

    ship.order.target = clonePlain(depot.position);
    launchShip(ship, mothershipShip);
    if (distance(ship.position, depot.position) > ARRIVAL_DISTANCE || Math.hypot(ship.velocity.x, ship.velocity.y) > 0.01) {
      return stepTowardOrderTarget(ship, dt, ARRIVAL_DISTANCE, false);
    }

    depot.builtStages += 1;
    ship.carryingSection = false;
    ship.velocity = { x: 0, y: 0 };
    ship.order = { kind: 'idle' };
    return ship;
  }

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
    mothership.storage.ore += ship.cargo;
    ship.cargo = 0;
    ship.velocity = { x: 0, y: 0 };
    ship.order = { kind: 'idle' };
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
    var initial = createInitialWorld();
    var next = clonePlain(world);
    next.formations = next.formations || {};
    next.nextFormationId = next.nextFormationId || 1;
    next.wrecks = next.wrecks || [];
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

  /** @param {World} world @param {string} id @param {number} amount @returns {World} */
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
      var payloadEntity = payload;
      payload.position = clonePlain(hauler.position);
      if (hauler.towTarget.kind === 'ship') payload.previousPosition = clonePlain(hauler.previousPosition);
      payload.rotation = hauler.rotation;
      if (mothership && canCatch(hauler, mothership)) {
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
        hauler.order = { kind: 'idle' };
        hauler.velocity = { x: 0, y: 0 };
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
    remainingDeltaV: remainingDeltaV,
    returnReserve: returnReserve,
    canCatch: canCatch,
    endMining: endMining,
    issuePlatformRecovery: issuePlatformRecovery,
    canDeployPlatform: canDeployPlatform,
    EXCHANGE_MPS: propulsion.exchangeMps,
    RAIDER_RANGE: RAIDER_RANGE,
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
    loadWorld: loadWorld,
    resetWorld: resetWorld
  };
})(window);
