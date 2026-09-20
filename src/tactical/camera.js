(function (global) {
  'use strict';

  /** @typedef {import('../types').World} World */
  /** @typedef {import('../types').Vec2} Vec2 */
  /** @typedef {import('../types').Camera} Camera */
  /** @typedef {import('../types').Viewport} Viewport */
  /** @typedef {import('../types').DriftworksNamespace} DriftworksNamespace */

  /** @type {DriftworksNamespace} */
  var Driftworks = (global.Driftworks = global.Driftworks || {});
  var MAX_ZOOM = 128;

  /** @param {Vec2} point @param {Camera} camera @param {Viewport} viewport */
  function screenToWorld(point, camera, viewport) {
    return {
      x: (point.x - viewport.width / 2) / camera.zoom + camera.x,
      y: (point.y - viewport.height / 2) / camera.zoom + camera.y
    };
  }

  /** @param {Pick<PIXI.Application, "screen">} app */
  function viewportFromApp(app) {
    return {
      width: app.screen.width,
      height: app.screen.height
    };
  }

  /** @param {World} world @param {string[]} [shipIds] */
  function computeSelectionFocus(world, shipIds) {
    var ids = shipIds || world.selectedShipIds;
    var selected = world.ships.filter(function (ship) {
      return ids.indexOf(ship.id) !== -1;
    });
    if (!selected.length) return null;

    var minX = selected[0].position.x;
    var maxX = selected[0].position.x;
    var minY = selected[0].position.y;
    var maxY = selected[0].position.y;
    selected.forEach(function (ship) {
      minX = Math.min(minX, ship.position.x);
      maxX = Math.max(maxX, ship.position.x);
      minY = Math.min(minY, ship.position.y);
      maxY = Math.max(maxY, ship.position.y);
    });
    var span = Math.max(maxX - minX, maxY - minY, 120);
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2,
      zoom: Math.max(0.8, Math.min(1.75, 260 / span))
    };
  }

  /** @param {World} world @param {Camera} target @param {number} dt */
  function focusCameraToward(world, target, dt) {
    var t = Math.min(1, dt * 4.5);
    return withCamera(world, {
      x: world.camera.x + (target.x - world.camera.x) * t,
      y: world.camera.y + (target.y - world.camera.y) * t,
      zoom: world.camera.zoom + (target.zoom - world.camera.zoom) * t
    });
  }

  /** @param {Vec2} point @param {Camera} camera @param {Viewport} viewport */
  function worldToScreen(point, camera, viewport) {
    return {
      x: (point.x - camera.x) * camera.zoom + viewport.width / 2,
      y: (point.y - camera.y) * camera.zoom + viewport.height / 2
    };
  }

  /** @param {Camera} camera @param {Vec2} screenDelta */
  function panCamera(camera, screenDelta) {
    return {
      x: camera.x - screenDelta.x / camera.zoom,
      y: camera.y - screenDelta.y / camera.zoom,
      zoom: camera.zoom
    };
  }

  /** @param {Camera} camera @param {Vec2} screenPoint @param {Viewport} viewport @param {number} wheelDelta */
  function zoomCameraAt(camera, screenPoint, viewport, wheelDelta) {
    var before = screenToWorld(screenPoint, camera, viewport);
    var zoom = Math.max(0.35, Math.min(MAX_ZOOM, camera.zoom * (wheelDelta > 0 ? 0.9 : 1.1)));
    var after = screenToWorld(screenPoint, { x: camera.x, y: camera.y, zoom: zoom }, viewport);
    return {
      x: camera.x + before.x - after.x,
      y: camera.y + before.y - after.y,
      zoom: zoom
    };
  }

  /** @param {World} world @param {Camera} camera */
  function withCamera(world, camera) {
    return Object.assign({}, world, { camera: camera });
  }

  /** @param {World} world @param {Vec2} start @param {Vec2} end @param {Viewport} viewport */
  function shipsInsideScreenRect(world, start, end, viewport) {
    var minX = Math.min(start.x, end.x);
    var maxX = Math.max(start.x, end.x);
    var minY = Math.min(start.y, end.y);
    var maxY = Math.max(start.y, end.y);

    return world.ships
      .filter(function (ship) {
        var screen = worldToScreen(ship.position, world.camera, viewport);
        return screen.x >= minX && screen.x <= maxX && screen.y >= minY && screen.y <= maxY;
      })
      .map(function (ship) {
        return ship.id;
      });
  }

  Driftworks.camera = {
    screenToWorld: screenToWorld,
    viewportFromApp: viewportFromApp,
    computeSelectionFocus: computeSelectionFocus,
    focusCameraToward: focusCameraToward,
    worldToScreen: worldToScreen,
    panCamera: panCamera,
    zoomCameraAt: zoomCameraAt,
    withCamera: withCamera,
    shipsInsideScreenRect: shipsInsideScreenRect
  };
})(window);
