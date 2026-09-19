/** @param {Window} global */
(function (global) {
  'use strict';
  /** @typedef {import('./types').Ship} Ship */
  /** @typedef {import('./types').Vec2} Vec2 */
  /** @typedef {import('./types').PropulsionApi} PropulsionApi */
  /** @type {import('./types').DriftworksNamespace} */
  var Driftworks = global.Driftworks || {};
  global.Driftworks = Driftworks;
  // SI units at this boundary; the tactical simulation converts velocities once.
  /** @type {Record<string, { capacityKg: number, exhaustMps: number }>} */
  var PROFILES = {
    escort: { capacityKg: 12000, exhaustMps: 3000 },
    tug: { capacityKg: 450000, exhaustMps: 3000 }
  };
  var EXCHANGE_MPS = 32;
  /** @param {Ship} ship */
  function initialize(ship) {
    var profile = PROFILES[ship.type];
    if (!profile) return;
    if (!ship.propulsion) ship.propulsion = {
      capacityKg: profile.capacityKg, fuelKg: profile.capacityKg, exhaustMps: profile.exhaustMps
    };
    ship.propulsion.fuelKg = Math.max(0, Math.min(ship.propulsion.capacityKg, ship.propulsion.fuelKg));
  }
  /** @param {Ship} ship @param {number} massKg */
  function remaining(ship, massKg) {
    var engine = ship.propulsion;
    return engine ? engine.exhaustMps * Math.log(massKg / Math.max(1, massKg - engine.fuelKg)) : 0;
  }
  // Returns the achievable fraction of a requested velocity change.
  /** @param {Ship} ship @param {number} massKg @param {number} deltaMps */
  function burn(ship, massKg, deltaMps) {
    if (!ship.propulsion || deltaMps <= 0) return 1;
    var engine = ship.propulsion;
    var achieved = Math.min(deltaMps, remaining(ship, massKg));
    engine.fuelKg = Math.max(0, engine.fuelKg - massKg * (1 - Math.exp(-achieved / engine.exhaustMps)));
    return achieved / deltaMps;
  }
  /** @param {Vec2} position @param {Vec2} velocity @param {{ position: Vec2, velocity: Vec2 }} home @param {number} radius @param {number} unitsToMps */
  function canCatch(position, velocity, home, radius, unitsToMps) {
    return Math.hypot(position.x - home.position.x, position.y - home.position.y) <= radius &&
      Math.hypot(velocity.x - home.velocity.x, velocity.y - home.velocity.y) * unitsToMps <= EXCHANGE_MPS + 1e-8;
  }
  Driftworks.propulsion = { initialize: initialize, remaining: remaining, burn: burn,
    canCatch: canCatch, exchangeMps: EXCHANGE_MPS };
})(window);
