(function (global) {
  'use strict';

  /** @typedef {import('./types').DriftworksNamespace} DriftworksNamespace */
  /** @typedef {import('./types').World} World */
  /** @typedef {import('./types').Ship} Ship */
  /** @typedef {import('./types').Vec2} Vec2 */
  /** @typedef {import('./types').Threat} Threat */
  /** @typedef {import('./types').FighterStyle} FighterStyle */
  /** @typedef {import('./types').Formation} Formation */
  /** @typedef {import('./types').DefendOrder} DefendOrder */
  /** @typedef {import('./types').Rng} Rng */
  /** @typedef {import('./types').Order} Order */
  /** @typedef {import('./types').FormationModule} FormationModule */
  /** @type {DriftworksNamespace} */
  var Driftworks = (global.Driftworks = global.Driftworks || {});

  /** @param {Parameters<FormationModule['create']>[0]} api */
  function create(api) {
    var FIGHTER_RANGE = api.fighterRange;
    var FIGHTER_LEASH = FIGHTER_RANGE * 2.5;
    var SLOT_TOLERANCE = 6;

    /** @param {Ship} ship @param {Threat[]} threats @param {Vec2} anchor @param {number} radius @param {FighterStyle} style @param {Vec2} nominal @param {Ship[]} ships */
    function combatVelocity(ship, threats, anchor, radius, style, nominal, ships) {
      var nearby = threats.filter(function (t) { return api.distance(t.position, ship.position) < FIGHTER_RANGE + 240; });
      if (!nearby.length) return null;
      var closest = nearby.slice().sort(function (a, b) { return api.distance(a.position, ship.position) - api.distance(b.position, ship.position); })[0];
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
        var edge = api.distance(ship.position, anchor);
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
            var d = api.distance(p, { x: t.position.x + tv.x * horizon, y: t.position.y + tv.y * horizon });
            nearest = Math.min(nearest, d);
            score += Math.pow(Math.max(0, api.raiderRange + 20 - d), 2) * 8;
          });
          score += Math.pow(Math.max(0, nearest - 270), 2) * 0.12;
          score += Math.pow(Math.max(0, api.distance(p, anchor) - radius), 2) * 40;
          score += Math.pow(Math.max(0, api.distance(p, nominal) - 150), 2) * 0.0005;
          ships.forEach(function (ally) {
            if (ally.id === ship.id || ally.type !== 'escort' || ally.disabled) return;
            var separation = api.distance(p, { x: ally.position.x + ally.velocity.x * horizon, y: ally.position.y + ally.velocity.y * horizon });
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
      var random = api.createRng(hash);
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
      /** @type {{ member: number, slot: number, cost: number }[]} */
      var choices = [];
      members.forEach(function (ship, member) {
        slots.forEach(function (slot, index) {
          choices.push({ member: member, slot: index, cost: api.distance(ship.position, { x: formation.position.x + slot.x, y: formation.position.y + slot.y }) });
        });
      });
      choices.sort(function (a, b) { return a.cost - b.cost || a.member - b.member || a.slot - b.slot; });
      /** @type {Record<number, boolean>} */ var usedMembers = {};
      /** @type {Record<number, boolean>} */ var usedSlots = {};
      choices.forEach(function (choice) {
        if (usedMembers[choice.member] || usedSlots[choice.slot]) return;
        usedMembers[choice.member] = true; usedSlots[choice.slot] = true;
        if (members[choice.member].order.kind !== 'defend') return;
        var order = /** @type {DefendOrder} */ (members[choice.member].order);
        order.offset = slots[choice.slot]; order.side = choice.slot % 2 ? -1 : 1;
      });
      formation.memberIds = members.map(function (s) { return s.id; });
    }

    /** @param {World} world @param {Vec2} target @param {string | null | undefined} shipId @returns {World} */
    function issueDefendOrder(world, target, shipId) {
      var next = api.cloneWorld(world);
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
      var formation = prior ? api.clonePlain(prior) : { position: api.clonePlain(center), velocity: { x: 0, y: 0 }, angle: angle };
      formation.pivoting = Math.hypot(formation.velocity.x, formation.velocity.y) < 15 || Math.abs(api.angleDelta(formation.angle, angle)) > Math.PI / 3;
      formation.directTravel = false; formation.relocating = true;
      next.formations[groupId] = formation;
      members.forEach(function (s, i) {
        s.order = { kind: 'defend', anchor: api.clonePlain(target), anchorShipId: shipId || null,
          groupId: groupId, leashRadius: FIGHTER_LEASH, side: i % 2 ? -1 : 1,
          target: api.clonePlain(target), offset: { x: 0, y: 0 } };
      });
      assignFormationSlots(members, formation, shipId);
      members.forEach(function (s) { if (s.order.kind === 'defend') s.order.formation = api.clonePlain(formation); });
      return next;
    }

    /** @param {Ship[]} members @param {Formation} formation @param {string | null | undefined} shipId */
    function assignDefendOrderSlots(members, formation, shipId) {
      assignFormationSlots(members, formation, shipId);
    }

    /** @param {Ship} ship @param {World} world @param {Threat[]} threats @param {number} dt @returns {Ship} */
    function stepDefender(ship, world, threats, dt) {
      if (ship.order.kind !== 'defend') return ship;
      var order = /** @type {DefendOrder} */ (ship.order);
      var protectedShip = world.ships.filter(function (s) { return s.id === order.anchorShipId; })[0];
      if (protectedShip) order.anchor = api.clonePlain(protectedShip.position);
      var anchor = order.anchor, radius = order.leashRadius || FIGHTER_LEASH;
      var formation = order.formation, center = formation ? formation.position : anchor;
      var style = fighterStyle(ship), looseness = formation ? formation.looseness || 0 : 0;
      var tolerance = SLOT_TOLERANCE + looseness * 24;
      var target = occupiedSlot(order, center, style, looseness), nominal = target;
      var eligible = threats.filter(function (t) { return api.distance(t.position, anchor) <= radius + FIGHTER_RANGE; });
      var relocating = formation && formation.relocating;
      var tacticalVelocity = !relocating && api.distance(ship.position, anchor) <= radius ?
        combatVelocity(ship, eligible, anchor, radius, style, nominal, world.ships) : null;
      var fighting = !!tacticalVelocity;
      if (!relocating && !fighting && eligible.length && api.distance(ship.position, anchor) <= radius) {
        var threat = eligible.slice().sort(function (a, b) { return api.distance(a.position, ship.position) - api.distance(b.position, ship.position); })[0];
        var gap = api.distance(ship.position, threat.position);
        if (gap > FIGHTER_RANGE) {
          target = { x: threat.position.x + (ship.position.x - threat.position.x) / gap * 260,
            y: threat.position.y + (ship.position.y - threat.position.y) / gap * 260 };
          fighting = true;
        }
      }
      var tx = target.x - anchor.x, ty = target.y - anchor.y, length = Math.hypot(tx, ty);
      if (length > radius && (fighting || !formation || api.distance(center, anchor) < radius - 400)) target = { x: anchor.x + tx / length * radius, y: anchor.y + ty / length * radius };
      order.target = target;
      var error = api.distance(target, ship.position);
      var moving = formation && Math.hypot(formation.velocity.x, formation.velocity.y) > 15 && error < 35;
      var correction = error > tolerance ? Math.min((error - tolerance) * (moving ? 0.65 : 1.5), moving ? ship.speed * 0.22 : ship.speed) / error : 0;
      var omega = formation ? formation.angularVelocity || 0 : 0;
      var rx = target.x - center.x, ry = target.y - center.y;
      var velocity = formation && !fighting ? {
        x: formation.velocity.x - omega * ry + (target.x - ship.position.x) * correction,
        y: formation.velocity.y + omega * rx + (target.y - ship.position.y) * correction
      } : null;
      if (tacticalVelocity) { velocity = tacticalVelocity; order.target = { x: ship.position.x + velocity.x, y: ship.position.y + velocity.y }; }
      api.stepTowardOrderTarget(ship, dt, api.arrivalDistance, false, velocity, style);
      return ship;
    }

    /** @param {World} world @param {number} dt @param {Threat[]} threats */
    function step(world, dt, threats) {
      world.formations = world.formations || {};
      /** @type {Record<string, Ship[]>} */ var groups = {};
      world.ships.forEach(function (s) {
        if (s.disabled || s.order.kind !== 'defend' || !s.order.formation) return;
        (groups[s.order.groupId] || (groups[s.order.groupId] = [])).push(s);
      });
      Object.keys(world.formations).forEach(function (id) { if (!groups[id]) delete world.formations[id]; });
      Object.keys(groups).forEach(function (id) {
        var members = groups[id];
        if (!members || members[0].order.kind !== 'defend') return;
        var order = /** @type {DefendOrder} */ (members[0].order);
        var guarded = world.ships.filter(function (s) { return s.id === order.anchorShipId; })[0];
        var anchor = guarded ? guarded.position : order.anchor;
        var formation = api.clonePlain(world.formations[id] || order.formation);
        var memberIds = members.map(function (s) { return s.id; });
        if (!formation.memberIds || formation.memberIds.join('|') !== memberIds.join('|')) assignFormationSlots(members, formation, order.anchorShipId);
        if (api.distance(formation.position, anchor) < 20) formation.relocating = false;
        var formationLooseness = formation.looseness || 0;
        var contact = threats.some(function (t) {
          return api.distance(t.position, anchor) <= (order.leashRadius || FIGHTER_LEASH) + FIGHTER_RANGE &&
            (api.distance(formation.position, anchor) < 80 || members.some(function (s) { return api.distance(s.position, t.position) < FIGHTER_RANGE * 1.25; }));
        });
        formation.looseness = formationLooseness + ((contact ? 1 : 0) - formationLooseness) * (1 - Math.exp(-dt / 2));
        formationLooseness = formation.looseness;
        var error = 0, speed = Infinity, acceleration = Infinity, extent = 1;
        members.forEach(function (s) {
          var style = fighterStyle(s);
          if (s.order.kind !== 'defend') return;
          error = Math.max(error, Math.max(0, api.distance(s.position, occupiedSlot(s.order, formation.position, style, formationLooseness)) - SLOT_TOLERANCE - formationLooseness * 24));
          speed = Math.min(speed, s.speed * style.speed);
          acceleration = Math.min(acceleration, s.acceleration * style.acceleration);
          var offset = s.order.kind === 'defend' && s.order.offset ? s.order.offset : { x: 0, y: 0 };
          extent = Math.max(extent, Math.hypot(offset.x, offset.y) * (1 + formationLooseness * 0.65));
        });
        var cohesion = Math.max(error < 120 ? 0.35 : 0, Math.min(1, (85 - error) / 60));
        var gap = api.distance(formation.position, anchor), oldAngle = formation.angle || 0;
        var turn = gap > 35 ? api.angleDelta(oldAngle, Math.atan2(anchor.y - formation.position.y, anchor.x - formation.position.x)) : 0;
        if (Math.abs(turn) > Math.PI / 3) formation.pivoting = true;
        var pivoting = formation.pivoting;
        var turnLimit = Math.min(0.65, speed * 0.25 / extent);
        var desiredTurn = Math.max(-turnLimit, Math.min(turnLimit, turn * 1.2));
        var angularVelocity = formation.angularVelocity || 0;
        angularVelocity += Math.max(-0.7 * dt, Math.min(0.7 * dt, desiredTurn - angularVelocity));
        var rotation = pivoting ? (gap > 1 ? api.angleDelta(oldAngle, Math.atan2(anchor.y - formation.position.y, anchor.x - formation.position.x)) : 0) : angularVelocity * dt;
        formation.angle = oldAngle + rotation;
        formation.angularVelocity = pivoting ? 0 : angularVelocity;
        if (pivoting) {
          assignFormationSlots(members, formation, order.anchorShipId);
          formation.pivoting = false; formation.directTravel = true;
        } else {
          members.forEach(function (s) {
            if (s.order.kind !== 'defend') return;
            var offset = s.order.offset || { x: 0, y: 0 };
            s.order.offset = { x: offset.x * Math.cos(rotation) - offset.y * Math.sin(rotation), y: offset.x * Math.sin(rotation) + offset.y * Math.cos(rotation) };
          });
        }
        var cruise = Math.min(speed * 0.72 * cohesion, Math.sqrt(2 * acceleration * 0.5 * gap), gap * 2);
        cruise *= 1 - Math.min(1, Math.abs(turn) / Math.PI) * 0.35;
        var currentSpeed = Math.hypot(formation.velocity.x, formation.velocity.y);
        currentSpeed += Math.max(-acceleration * 0.35 * dt, Math.min(acceleration * 0.35 * dt, cruise - currentSpeed));
        if (formation.directTravel) {
          var desired = { x: gap ? (anchor.x - formation.position.x) / gap * cruise : 0, y: gap ? (anchor.y - formation.position.y) / gap * cruise : 0 };
          var dx = desired.x - formation.velocity.x, dy = desired.y - formation.velocity.y;
          var change = Math.hypot(dx, dy), blend = change ? Math.min(1, acceleration * 0.35 * dt / change) : 0;
          formation.velocity.x += dx * blend; formation.velocity.y += dy * blend;
        } else if (gap > 35) {
          formation.velocity = { x: Math.cos(formation.angle) * currentSpeed, y: Math.sin(formation.angle) * currentSpeed };
        } else {
          formation.velocity = { x: gap ? (anchor.x - formation.position.x) / gap * currentSpeed : 0, y: gap ? (anchor.y - formation.position.y) / gap * currentSpeed : 0 };
        }
        formation.position.x += formation.velocity.x * dt; formation.position.y += formation.velocity.y * dt;
        world.formations[id] = formation;
        members.forEach(function (s) { if (s.order.kind === 'defend') s.order.formation = api.clonePlain(formation); });
      });
    }

    return { issueDefendOrder: issueDefendOrder, assignFormationSlots: assignDefendOrderSlots,
      stepDefender: stepDefender, step: step, fighterStyle: fighterStyle };
  }

  /** @type {DriftworksNamespace} */
  var namespace = Driftworks;
  namespace.formations = { create: create };
})(window);
