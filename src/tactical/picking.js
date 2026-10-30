(function(){
  'use strict';
  var DW=/** @type {Required<import('../types').DriftworksNamespace>} */(window.Driftworks);
  /** @typedef {import('../types').World} World */
  /** @typedef {import('../types').Vec2} Vec2 */
  /** @typedef {import('../types').Ship} Ship */
  /** @param {World} world @param {Vec2} target @param {(type:string,zoom:number)=>number} semanticScale @returns {import('../types').ContextPick} */
  function pickContext(world, target, semanticScale) {
    var zoom = world.camera.zoom;
    /** @param {{ position: Vec2 }} entity @param {string} type @param {number} radius */
    function hits(entity, type, radius) {
      return Math.hypot(target.x - entity.position.x, target.y - entity.position.y) <=
        Math.max(12 / zoom, radius * semanticScale(type, zoom));
    }
    var homeHit = world.ships.filter(function (s) { return s.type === 'mothership' && hits(s, s.type, 38); })[0];
    var platformHit = (world.platforms || []).filter(function (p) {
      return (p.state === 'deployed' || p.state === 'setting-up') && hits(p, 'platform', 22);
    })[0];
      var recoverables = (world.wrecks || []).map(/** @returns {{ entity: import('../types').Wreck | Ship, kind: 'ship' | 'wreck' }} */ function (wreck) {
        return { entity: wreck, kind: 'wreck' };
      }).concat(world.ships.filter(function (ship) {
        return ship.disabled && !ship.repairRemaining && ship.launchElapsed == null;
      }).map(function (ship) { return { entity: ship, kind: /** @type {const} */ ('ship') }; }));
      var recovery = recoverables.filter(function (item) {
        return !item.entity.towedBy && hits(item.entity, 'escort', 26);
      }).sort(function (a, b) {
        return Math.hypot(target.x - a.entity.position.x, target.y - a.entity.position.y) -
          Math.hypot(target.x - b.entity.position.x, target.y - b.entity.position.y);
      })[0];
    var asteroid = world.asteroids.filter(function (item) {
      return hits(item, 'asteroid', DW.sim.surfaceRadius(item, Math.atan2(target.y - item.position.y, target.x - item.position.x) - item.rotation));
    })[0];
    return {homeShipId:homeHit?homeHit.id:null,platformId:platformHit?platformHit.id:null,
      guardedShipIds:world.ships.filter(function(s){return hits(s,s.type,s.type==='mothership'?38:16);}).sort(function(a,b){return Math.hypot(a.position.x-target.x,a.position.y-target.y)-Math.hypot(b.position.x-target.x,b.position.y-target.y);}).map(function(s){return s.id;}),
      recovery:recovery?{kind:recovery.kind,id:recovery.entity.id}:null,asteroidId:asteroid?asteroid.id:null,
      depotHit:!!world.depot&&hits(world.depot,'depot',44)};
  }
  DW.tacticalPicking={pickContext:pickContext};
}());
