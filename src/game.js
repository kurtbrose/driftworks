(function (global) {
  'use strict';

  var Driftworks = (global.Driftworks = global.Driftworks || {});
  var sim = Driftworks.sim;
  var PIXI = global.PIXI;
  var STEP_SECONDS = 1 / 30;
  var MAX_FRAME_SECONDS = 0.2;

  var SHIP_STYLES = {
    mothership: { radius: 34, fill: 0x7d8790, stroke: 0xd7dee4 },
    miner: { radius: 14, fill: 0xd3a449, stroke: 0xf3d99b },
    tug: { radius: 18, fill: 0x6fb6a7, stroke: 0xc3eee5 },
    escort: { radius: 13, fill: 0xb76c6f, stroke: 0xf0b7b9 }
  };

  function boot() {
    var sceneHost = document.querySelector('#scene');
    var hudHost = document.querySelector('#hud');

    if (!sceneHost || !hudHost) {
      throw new Error('Driftworks could not find its root DOM nodes.');
    }
    if (!PIXI) {
      throw new Error('Vendored PixiJS did not load.');
    }

    createApp(sceneHost, hudHost);
  }

  function createApp(sceneHost, hudHost) {
    var world = loadOrInitial();
    var accumulator = 0;
    var lastTime = performance.now();

    var scene = createScene(sceneHost, function () {
      return world;
    }, function (nextWorld) {
      world = nextWorld;
      scene.sync(world);
      hud.update(world, scene.getStats());
    });

    var hud = createHud(hudHost, {
      onSave: function () {
        sim.saveWorld(world);
        hud.update(world, scene.getStats());
      },
      onLoad: function () {
        world = loadOrInitial();
        scene.sync(world);
        hud.update(world, scene.getStats());
      },
      onReset: function () {
        world = sim.createInitialWorld();
        scene.sync(world);
        hud.update(world, scene.getStats());
      },
      onStressToggle: function () {
        scene.setStressEnabled(!scene.getStats().stressEnabled);
        hud.update(world, scene.getStats());
      }
    });

    scene.sync(world);
    hud.update(world, scene.getStats());

    function frame(now) {
      var frameSeconds = Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS);
      lastTime = now;
      accumulator += frameSeconds;

      while (accumulator >= STEP_SECONDS) {
        world = sim.stepWorld(world, STEP_SECONDS);
        accumulator -= STEP_SECONDS;
      }

      scene.render(world, accumulator / STEP_SECONDS, frameSeconds);
      hud.update(world, scene.getStats());
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  function loadOrInitial() {
    try {
      return sim.loadWorld();
    } catch (error) {
      console.warn('Save could not be loaded. Starting a fresh world.', error);
      return sim.createInitialWorld();
    }
  }

  function createHud(host, actions) {
    host.innerHTML =
      '<section class="panel brand">' +
      '<div class="eyebrow">DRIFTWORKS</div>' +
      '<h1>Tactical Deployment Sandbox</h1>' +
      '<p>Static prototype: select, move, persist, and stress-test a small industrial fleet.</p>' +
      '</section>' +
      '<section class="panel readout">' +
      '<div class="row"><span>Location</span><strong data-role="location"></strong></div>' +
      '<div class="row"><span>Cash</span><strong data-role="money"></strong></div>' +
      '<div class="row"><span>Sim Clock</span><strong data-role="clock"></strong></div>' +
      '<div class="row"><span>Entities</span><strong data-role="entities"></strong></div>' +
      '<div class="row"><span>Selection</span><strong data-role="selection"></strong></div>' +
      '</section>' +
      '<section class="panel controls">' +
      '<button type="button" data-action="save">Save</button>' +
      '<button type="button" data-action="load">Load</button>' +
      '<button type="button" data-action="reset">Reset</button>' +
      '<button type="button" data-action="stress">Stress</button>' +
      '</section>' +
      '<section class="hint">LMB select/drag-box · RMB move · wheel zoom · Space/MMB drag pan</section>';

    var stressButton = host.querySelector('[data-action="stress"]');
    host.querySelector('[data-action="save"]').addEventListener('click', actions.onSave);
    host.querySelector('[data-action="load"]').addEventListener('click', actions.onLoad);
    host.querySelector('[data-action="reset"]').addEventListener('click', actions.onReset);
    stressButton.addEventListener('click', actions.onStressToggle);

    return {
      update: function (world, stats) {
        host.querySelector('[data-role="location"]').textContent = world.campaign.location;
        host.querySelector('[data-role="money"]').textContent = '$' + world.campaign.money.toLocaleString();
        host.querySelector('[data-role="clock"]').textContent = world.elapsedSeconds.toFixed(1) + ' s';
        host.querySelector('[data-role="entities"]').textContent = stats.entityCount + ' @ ' + (stats.fps || '--') + ' FPS';

        if (world.selectedShipIds.length === 0) {
          host.querySelector('[data-role="selection"]').textContent = 'None';
        } else {
          host.querySelector('[data-role="selection"]').textContent = world.ships
            .filter(function (ship) {
              return world.selectedShipIds.indexOf(ship.id) !== -1;
            })
            .map(function (ship) {
              return ship.name;
            })
            .join(', ');
        }

        stressButton.dataset.active = stats.stressEnabled ? 'true' : 'false';
        stressButton.textContent = stats.stressEnabled ? 'Stress On' : 'Stress';
      }
    };
  }

  function createScene(host, getWorld, setWorld) {
    var app = new PIXI.Application({
      background: '#080c10',
      antialias: true,
      resizeTo: host
    });
    var worldLayer = new PIXI.Container();
    var grid = new PIXI.Graphics();
    var selectionBox = new PIXI.Graphics();
    var readout = new PIXI.Text('', {
      fontFamily: 'Consolas, monospace',
      fontSize: 12,
      fill: 0xd8e4ea
    });
    var shipGraphics = {};
    var stressLayer = null;
    var stressEnabled = false;
    var dragMode = 'none';
    var dragStart = { x: 0, y: 0 };
    var lastPointer = { x: 0, y: 0 };
    var spaceDown = false;
    var frames = 0;
    var fps = 0;
    var fpsTimer = 0;

    host.appendChild(app.view);
    host.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });
    app.stage.addChild(worldLayer);
    worldLayer.addChild(grid);
    app.stage.addChild(selectionBox);
    app.stage.addChild(readout);
    readout.position.set(14, 14);
    drawGrid(grid);

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;
    app.stage.on('pointerdown', onPointerDown);
    app.stage.on('pointermove', onPointerMove);
    app.stage.on('pointerup', onPointerUp);
    app.stage.on('pointerupoutside', onPointerUp);

    host.addEventListener(
      'wheel',
      function (event) {
        event.preventDefault();
        var bounds = host.getBoundingClientRect();
        var world = getWorld();
        setWorld(withCamera(world, zoomCameraAt(
            world.camera,
            { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
            viewport(),
            event.deltaY
          )));
      },
      { passive: false }
    );

    window.addEventListener('keydown', function (event) {
      if (event.code === 'Space') spaceDown = true;
    });
    window.addEventListener('keyup', function (event) {
      if (event.code === 'Space') spaceDown = false;
    });

    function sync(world) {
      worldLayer.position.set(app.renderer.width / 2, app.renderer.height / 2);
      worldLayer.scale.set(world.camera.zoom);
      worldLayer.pivot.set(world.camera.x, world.camera.y);

      world.ships.forEach(function (ship) {
        var graphic = shipGraphics[ship.id];
        if (!graphic) {
          graphic = createShipGraphic(ship.id);
          shipGraphics[ship.id] = graphic;
          worldLayer.addChild(graphic);
        }
        paintShip(graphic, ship, world.selectedShipIds.indexOf(ship.id) !== -1);
      });
    }

    function render(world, alpha, dt) {
      world.ships.forEach(function (ship) {
        var graphic = shipGraphics[ship.id];
        if (!graphic) return;
        var x = ship.previousPosition.x + (ship.position.x - ship.previousPosition.x) * alpha;
        var y = ship.previousPosition.y + (ship.position.y - ship.previousPosition.y) * alpha;
        graphic.position.set(x, y);
        graphic.rotation = ship.rotation;
      });

      if (stressLayer && stressEnabled) {
        stressLayer.update(dt);
      }
      updateFps(dt, world);
    }

    function createShipGraphic(shipId) {
      var graphic = new PIXI.Graphics();
      graphic.eventMode = 'static';
      graphic.cursor = 'pointer';
      graphic.on('pointerdown', function (event) {
        if (event.button === 0) {
          event.stopPropagation();
          setWorld(sim.selectShips(getWorld(), [shipId]));
        }
      });
      return graphic;
    }

    function onPointerDown(event) {
      var point = { x: event.global.x, y: event.global.y };
      dragStart = point;
      lastPointer = point;

      if (event.button === 2) {
        setWorld(sim.issueMoveOrder(getWorld(), screenToWorld(point, getWorld().camera, viewport())));
        return;
      }

      dragMode = event.button === 1 || spaceDown ? 'pan' : 'select';
    }

    function onPointerMove(event) {
      var point = { x: event.global.x, y: event.global.y };
      if (dragMode === 'pan') {
        var world = getWorld();
        setWorld(withCamera(world, panCamera(world.camera, {
            x: point.x - lastPointer.x,
            y: point.y - lastPointer.y
          })));
      } else if (dragMode === 'select') {
        drawSelectionBox(selectionBox, dragStart, point);
      }
      lastPointer = point;
    }

    function onPointerUp(event) {
      var point = { x: event.global.x, y: event.global.y };
      if (dragMode === 'select') {
        var distance = Math.hypot(point.x - dragStart.x, point.y - dragStart.y);
        if (distance > 8) {
          setWorld(sim.selectShips(getWorld(), shipsInsideScreenRect(getWorld(), dragStart, point, viewport())));
        } else {
          setWorld(sim.selectShips(getWorld(), []));
        }
      }
      dragMode = 'none';
      selectionBox.clear();
    }

    function setStressEnabled(enabled) {
      stressEnabled = enabled;
      if (enabled && !stressLayer) {
        stressLayer = createStressLayer();
        worldLayer.addChildAt(stressLayer.container, 1);
      }
      if (stressLayer) {
        stressLayer.container.visible = enabled;
      }
    }

    function getStats() {
      var count = stressEnabled && stressLayer ? stressLayer.count + getWorld().ships.length : getWorld().ships.length;
      return {
        fps: fps,
        stressEnabled: stressEnabled,
        entityCount: count
      };
    }

    function updateFps(dt, world) {
      frames += 1;
      fpsTimer += dt;
      if (fpsTimer >= 0.5) {
        fps = Math.round(frames / fpsTimer);
        frames = 0;
        fpsTimer = 0;
      }
      readout.text = 'FPS ' + (fps || '--') + ' · entities ' + getStats().entityCount + ' · sim ' + world.elapsedSeconds.toFixed(1) + 's';
    }

    function viewport() {
      return {
        width: app.renderer.width,
        height: app.renderer.height
      };
    }

    return {
      sync: sync,
      render: render,
      setStressEnabled: setStressEnabled,
      getStats: getStats
    };
  }

  function screenToWorld(point, camera, viewport) {
    return {
      x: (point.x - viewport.width / 2) / camera.zoom + camera.x,
      y: (point.y - viewport.height / 2) / camera.zoom + camera.y
    };
  }

  function worldToScreen(point, camera, viewport) {
    return {
      x: (point.x - camera.x) * camera.zoom + viewport.width / 2,
      y: (point.y - camera.y) * camera.zoom + viewport.height / 2
    };
  }

  function panCamera(camera, screenDelta) {
    return {
      x: camera.x - screenDelta.x / camera.zoom,
      y: camera.y - screenDelta.y / camera.zoom,
      zoom: camera.zoom
    };
  }

  function zoomCameraAt(camera, screenPoint, viewport, wheelDelta) {
    var before = screenToWorld(screenPoint, camera, viewport);
    var zoom = Math.max(0.35, Math.min(2.6, camera.zoom * (wheelDelta > 0 ? 0.9 : 1.1)));
    var after = screenToWorld(screenPoint, { x: camera.x, y: camera.y, zoom: zoom }, viewport);
    return {
      x: camera.x + before.x - after.x,
      y: camera.y + before.y - after.y,
      zoom: zoom
    };
  }

  function withCamera(world, camera) {
    return {
      version: world.version,
      seed: world.seed,
      elapsedSeconds: world.elapsedSeconds,
      campaign: world.campaign,
      camera: camera,
      selectedShipIds: world.selectedShipIds,
      ships: world.ships
    };
  }

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

  function drawGrid(graphics) {
    graphics.clear();
    graphics.lineStyle(1, 0x24323b, 0.52);
    for (var x = -2400; x <= 2400; x += 120) {
      graphics.moveTo(x, -1800);
      graphics.lineTo(x, 1800);
    }
    for (var y = -1800; y <= 1800; y += 120) {
      graphics.moveTo(-2400, y);
      graphics.lineTo(2400, y);
    }
    graphics.lineStyle(2, 0x536877, 0.75);
    graphics.moveTo(-2400, 0);
    graphics.lineTo(2400, 0);
    graphics.moveTo(0, -1800);
    graphics.lineTo(0, 1800);
  }

  function paintShip(graphics, ship, selected) {
    var style = SHIP_STYLES[ship.type];
    graphics.clear();
    graphics.lineStyle(selected ? 3 : 1.5, selected ? 0xffffff : style.stroke, selected ? 1 : 0.9);
    graphics.beginFill(style.fill, ship.type === 'mothership' ? 0.88 : 0.96);

    if (ship.type === 'mothership') {
      graphics.drawRoundedRect(-36, -17, 72, 34, 5);
      graphics.drawRect(-10, -28, 20, 56);
    } else {
      graphics.moveTo(style.radius, 0);
      graphics.lineTo(-style.radius * 0.72, -style.radius * 0.62);
      graphics.lineTo(-style.radius * 0.45, 0);
      graphics.lineTo(-style.radius * 0.72, style.radius * 0.62);
      graphics.closePath();
    }

    graphics.endFill();

    if (ship.order.kind === 'move') {
      graphics.lineStyle(1, 0x7aa9c2, 0.5);
      graphics.moveTo(0, 0);
      graphics.lineTo(ship.order.target.x - ship.position.x, ship.order.target.y - ship.position.y);
    }
  }

  function drawSelectionBox(graphics, a, b) {
    graphics.clear();
    graphics.lineStyle(1, 0xc6e6f2, 0.9);
    graphics.beginFill(0x89c9e2, 0.08);
    graphics.drawRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    graphics.endFill();
  }

  function createStressLayer() {
    var container = new PIXI.Container();
    var rng = sim.createRng(9503);
    var bounds = 1800;
    var sprites = [];
    var count = 3000;

    for (var i = 0; i < count; i += 1) {
      var graphic = new PIXI.Graphics();
      var tint = i % 3 === 0 ? 0x9bb6c8 : i % 3 === 1 ? 0xd5b66f : 0x7fc2b4;
      var x = sim.randomBetween(rng, -bounds, bounds);
      var y = sim.randomBetween(rng, -bounds, bounds);
      graphic.beginFill(tint, 0.72);
      graphic.drawRect(-3, -1, 6, 2);
      graphic.endFill();
      graphic.position.set(x, y);
      container.addChild(graphic);
      sprites.push({
        graphic: graphic,
        x: x,
        y: y,
        vx: sim.randomBetween(rng, -45, 45),
        vy: sim.randomBetween(rng, -45, 45),
        spin: sim.randomBetween(rng, -2.8, 2.8)
      });
    }

    return {
      container: container,
      count: count,
      update: function (dt) {
        sprites.forEach(function (sprite) {
          sprite.x += sprite.vx * dt;
          sprite.y += sprite.vy * dt;
          if (sprite.x < -bounds || sprite.x > bounds) sprite.vx *= -1;
          if (sprite.y < -bounds || sprite.y > bounds) sprite.vy *= -1;
          sprite.graphic.position.set(sprite.x, sprite.y);
          sprite.graphic.rotation += sprite.spin * dt;
        });
      }
    };
  }

  Driftworks.game = {
    boot: boot
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
