(function (global) {
  'use strict';

  /** @typedef {import('./types').World} World */
  /** @typedef {import('./types').Ship} Ship */
  /** @typedef {import('./types').Vec2} Vec2 */
  /** @typedef {import('./types').Drone} Drone */
  /** @typedef {import('./types').CombatState} CombatState */
  /** @typedef {import('./types').Rng} Rng */
  /** @typedef {import('./types').DriftworksNamespace} DriftworksNamespace */
  /** @type {DriftworksNamespace} */
  var Driftworks = (global.Driftworks = global.Driftworks || {});
  var DIRECTOR_MAX_WAVES = 3;
  var DEFENDER_DWELL_SECONDS = 1.35;
  var FIGHTER_RANGE = 280;
  var RAIDER_RANGE = 220;
  // At the default camera zoom this is comfortably beyond every viewport edge.
  // Raiders exist and travel in world space before entering the local area.
  // Gives passive sensors roughly a minute to refine an inbound track before
  // the group reaches the 700-unit local operating boundary.
  var HOSTILE_APPROACH_DISTANCE = 4800;

  /**
   * @param {{
   *   createRng: (seed: number) => Rng,
   *   clonePlain: <T>(value: T) => T,
   *   distance: (a: Vec2, b: Vec2) => number,
   *   findMothership: (world: World) => Ship | undefined,
   *   normalizeWorld: (world: World) => World,
   *   appendWreck: (world: World, destroyed: { position: Vec2, velocity: Vec2 }) => void,
   *   applyFighterDamage: (ship: Ship, amount: number) => void
   * }} dependencies
   */
  function create(dependencies) {
    var createRng = dependencies.createRng;
    var clonePlain = dependencies.clonePlain;
    var distance = dependencies.distance;
    var findMothership = dependencies.findMothership;
    var normalizeWorld = dependencies.normalizeWorld;
    var appendWreck = dependencies.appendWreck;
    var applyFighterDamage = dependencies.applyFighterDamage;

    /** @param {number} seed @returns {CombatState} */
    function createCombat(seed) {
      return { drones: [], nextDroneId: 1, rngState: seed >>> 0, weaponTimers: {}, events: [],
        director: { state: 'idle', timer: 0, cooldown: 10, wavesSpawned: 0 } };
    }

    /** @param {CombatState} combat @returns {number} */
    function combatRandom(combat) {
      var rng = createRng(combat.rngState);
      combat.rngState = (combat.rngState + 0x6d2b79f5) >>> 0;
      return rng();
    }

    /** @param {World} world */
    function industrialTargets(world) {
      /** @type {{ id: string, kind: string, position: Vec2 }[]} */
      var targets = [];
      world.ships.forEach(function (ship) {
        if (ship.type === 'tug' && (ship.cargo > 0 || ship.platformId || ship.carryingSection || ship.order.kind === 'build')) {
          targets.push({ id: ship.id, kind: 'ship', position: ship.position });
        }
      });
      if (world.depot.builtStages < world.depot.totalStages) {
        targets.push({ id: 'depot', kind: 'depot', position: world.depot.position });
      }
      var home = findMothership(world);
      if (home) targets.push({ id: home.id, kind: 'ship', position: home.position });
      return targets;
    }

    /** @param {World} world */
    function spawnWave(world) {
      var combat = world.combat;
      var targets = industrialTargets(world);
      var center = targets[0] ? targets[0].position : { x: 0, y: 0 };
      var count = combat.director.wavesSpawned >= 2 ? 4 : 3;
      var angle = combatRandom(combat) * Math.PI * 2;
      var approach = { x: Math.cos(angle), y: Math.sin(angle) };
      var tangent = { x: -approach.y, y: approach.x };
      for (var i = 0; i < count; i += 1) {
        var target = targets[i % targets.length] || { id: 'msv-hardshell', kind: 'ship' };
        var spread = (i - (count - 1) / 2) * 90;
        var position = { x: center.x + approach.x * (HOSTILE_APPROACH_DISTANCE + i * 35) + tangent.x * spread,
          y: center.y + approach.y * (HOSTILE_APPROACH_DISTANCE + i * 35) + tangent.y * spread };
        var speed = 58 + i * 8;
        combat.drones.push({
          id: 'drone-' + combat.nextDroneId++, targetId: target.id, targetKind: target.kind,
          position: position, previousPosition: clonePlain(position),
          velocity: { x: -approach.x * speed, y: -approach.y * speed },
          speed: speed, hp: 3, flash: 0, underFire: 0, fireCooldown: 0.6 + i * 0.12
        });
      }
      combat.events.push({ kind: 'wave-spawned', position: { x: center.x, y: center.y - 86 } });
    }

    /** @param {World} world @returns {World} */
    function spawnHostileWave(world) {
      var next = normalizeWorld(world);
      next.combat.events = [];
      spawnWave(next);
      return next;
    }

    /** @param {World} world */
    function operationExposure(world) {
      var exposure = (world.platforms || []).filter(function (p) { return p.state === 'deployed'; }).length;
      if (world.mothership.storage.constructionMass > 0 || world.mothership.storage.depotSections > 0) exposure += 1;
      if (world.depot && world.depot.builtStages > 0) exposure += 1;
      world.ships.forEach(function (ship) {
        if (ship.type === 'tug' && (ship.cargo > 20 || ship.order.kind === 'deploy' || ship.platformId)) exposure += 1;
        if (ship.type === 'tug' && (ship.carryingSection || ship.order.kind === 'build')) exposure += 1;
      });
      return exposure;
    }

    /** @param {World} world @param {number} dt */
    function stepDirector(world, dt) {
      var combat = world.combat, director = combat.director;
      if (director.wavesSpawned >= DIRECTOR_MAX_WAVES || combat.drones.length ||
          world.depot.builtStages >= world.depot.totalStages) return;
      if (director.state === 'warning') {
        director.timer = Math.max(0, director.timer - dt);
        if (director.timer === 0) {
          director.state = 'cooldown';
          director.cooldown = 44 + combatRandom(combat) * 8;
          director.wavesSpawned += 1;
          spawnWave(world);
        }
        return;
      }
      if (director.state === 'cooldown') {
        director.cooldown = Math.max(0, director.cooldown - dt);
        if (director.cooldown > 0) return;
        director.state = 'idle';
      }
      if (operationExposure(world) >= 1) {
        director.state = 'warning';
        director.timer = 8 + combatRandom(combat) * 2;
        var targets = industrialTargets(world);
        var p = targets[0] ? targets[0].position : { x: 0, y: 0 };
        combat.events.push({ kind: 'contact-warning', position: { x: p.x, y: p.y - 96 } });
      }
    }

    /** @param {World} world @param {Drone} drone */
    function nearestFighter(world, drone) {
      return world.ships.filter(function (ship) {
        return ship.type === 'escort' && !ship.disabled && !ship.docked && ship.launchElapsed == null && distance(ship.position, drone.position) <= 300;
      }).sort(function (a, b) {
        return distance(a.position, drone.position) - distance(b.position, drone.position);
      })[0];
    }

    /** @param {World} world @param {number} dt */
    function stepHostiles(world, dt) {
      world.combat.drones.forEach(function (drone) {
        drone.previousPosition = clonePlain(drone.position);
        var fighter = nearestFighter(world, drone);
        var industrial = world.ships.filter(function (ship) { return ship.id === drone.targetId; })[0];
        var home = findMothership(world);
        var target = fighter ? fighter.position : drone.targetKind === 'depot' ? world.depot.position :
          industrial ? industrial.position : home ? home.position : { x: 0, y: 0 };
        var dx = target.x - drone.position.x, dy = target.y - drone.position.y;
        var gap = Math.hypot(dx, dy);
        var speed = gap > 20 ? Math.min(drone.speed, (gap - 20) / dt) : 0;
        drone.velocity = { x: gap ? dx / gap * speed : 0, y: gap ? dy / gap * speed : 0 };
        drone.position.x += drone.velocity.x * dt;
        drone.position.y += drone.velocity.y * dt;
        drone.flash = Math.max(0, drone.flash - dt * 5);
        drone.underFire = Math.max(0, drone.underFire - dt * 0.35);
        drone.fireCooldown = Math.max(0, drone.fireCooldown - dt);
      });
    }

    /** @param {Ship} escort @param {Drone[]} drones @param {Record<string, number>} timers @param {number} dt @returns {{ target: Drone, paint: boolean } | null} */
    function stepDefenderWeapon(escort, drones, timers, dt) {
      if (escort.disabled || escort.docked || escort.launchElapsed != null) return null;
      timers[escort.id] = Math.max(0, (timers[escort.id] || 0) - dt);
      /** @type {Drone | null} */
      var target = null;
      var bestDistance = Infinity;
      drones.forEach(function (drone) {
        var gap = Math.hypot(drone.position.x - escort.position.x, drone.position.y - escort.position.y);
        var anchor = escort.order && escort.order.kind === 'defend' ? escort.order.anchor : escort.position;
        var priority = Math.hypot(drone.position.x - anchor.x, drone.position.y - anchor.y);
        if (escort.order && escort.order.kind === 'defend') {
          priority = priority * 0.25 + gap * 0.75 - (drone.underFire || 0) * 100;
          if (gap < RAIDER_RANGE + 20) priority -= 80;
        }
        if (gap <= FIGHTER_RANGE && priority < bestDistance) {
          target = drone;
          bestDistance = priority;
        }
      });
      if (!target) return null;
      var paint = timers[escort.id] === 0;
      if (paint) timers[escort.id] = 0.08;
      return { target: target, paint: paint };
    }

    // All operational ships choose shots from the same post-movement state.
    // Damage is resolved after selection, so a ship killed this tick still fires.
    /** @param {World} world @param {number} dt */
    function stepWeapons(world, dt) {
      var combat = world.combat;
      /** @type {{ id: string, amount: number }[]} */
      var hits = [];
      /** @type {Record<string, number>} */
      var dwell = {};
      combat.drones.forEach(function (drone) {
        var fighter = nearestFighter(world, drone);
        if (!fighter || distance(fighter.position, drone.position) > RAIDER_RANGE || drone.fireCooldown > 0) return;
        drone.fireCooldown = 0.75;
        hits.push({ id: fighter.id, amount: 0.4 });
        combat.events.push({ kind: 'weapon-fired', sourceId: drone.id, targetId: fighter.id,
          source: clonePlain(drone.position), position: clonePlain(fighter.position), velocity: clonePlain(fighter.velocity), amount: 0.4 });
      });
      world.ships.forEach(function (ship) {
        if (ship.type !== 'escort' || ship.disabled || ship.docked || ship.launchElapsed != null) return;
        var attack = stepDefenderWeapon(ship, combat.drones, combat.weaponTimers, dt);
        if (!attack) return;
        var target = attack.target;
        dwell[target.id] = (dwell[target.id] || 0) + dt;
        if (attack.paint) combat.events.push({ kind: 'weapon-fired', sourceId: ship.id, targetId: target.id,
          source: clonePlain(ship.position), position: clonePlain(target.position), velocity: clonePlain(target.velocity), amount: dt });
      });
      hits.forEach(function (hit) {
        var ship = world.ships.filter(function (candidate) { return candidate.id === hit.id; })[0];
        if (!ship || ship.disabled) return;
        applyFighterDamage(ship, hit.amount);
        combat.events.push({ kind: 'ship-damaged', targetId: ship.id, position: clonePlain(ship.position), amount: hit.amount });
        if (ship.disabled) combat.events.push({ kind: 'ship-disabled', targetId: ship.id, position: clonePlain(ship.position),
          velocity: clonePlain(ship.velocity) });
      });
      var destroyed = combat.drones.filter(function (drone) {
        if (dwell[drone.id]) {
          drone.underFire += dwell[drone.id];
          drone.flash = 1;
          combat.events.push({ kind: 'ship-damaged', targetId: drone.id, position: clonePlain(drone.position), amount: dwell[drone.id] });
        }
        return drone.underFire >= DEFENDER_DWELL_SECONDS || drone.hp <= 0;
      });
      destroyed.forEach(function (drone, index) {
        appendWreck(world, drone);
        combat.events.push({ kind: 'ship-destroyed', targetId: drone.id, position: clonePlain(drone.position),
          velocity: clonePlain(drone.velocity), final: destroyed.length === combat.drones.length && index === destroyed.length - 1 });
      });
      combat.drones = combat.drones.filter(function (drone) { return destroyed.indexOf(drone) === -1; });
    }

    return {
      createCombat: createCombat,
      spawnHostileWave: spawnHostileWave,
      stepDirector: stepDirector,
      stepHostiles: stepHostiles,
      stepWeapons: stepWeapons,
      stepDefenderWeapon: stepDefenderWeapon,
      operationExposure: operationExposure,
      DIRECTOR_MAX_WAVES: DIRECTOR_MAX_WAVES,
      FIGHTER_RANGE: FIGHTER_RANGE,
      RAIDER_RANGE: RAIDER_RANGE
    };
  }

  Driftworks.combat = { create: create };
})(window);
