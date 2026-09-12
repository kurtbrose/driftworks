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
  var ASTEROID_FILL = 0x655f57;
  var ASTEROID_STROKE = 0xb6aa9b;
  var MAX_EFFECTS = 260;

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

      scene.sync(world);
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
      '<div class="row"><span>Ore Quota</span><strong data-role="quota"></strong></div>' +
      '<div class="row"><span>Ore Field</span><strong data-role="field"></strong></div>' +
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
        host.querySelector('[data-role="quota"]').textContent =
          Math.floor(world.mothership.storage.ore) + ' / ' + world.contract.quotaOre + ' t';
        host.querySelector('[data-role="field"]').textContent = Math.floor(totalOreRemaining(world)) + ' t';
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
    var starfield = createStarfield(app.renderer.width, app.renderer.height);
    var worldLayer = new PIXI.Container();
    var effectsLayer = new PIXI.Container();
    var grid = new PIXI.Graphics();
    var selectionBox = new PIXI.Graphics();
    var readout = new PIXI.Text('', {
      fontFamily: 'Consolas, monospace',
      fontSize: 12,
      fill: 0xd8e4ea
    });
    var shipGraphics = {};
    var asteroidGraphics = {};
    var stressLayer = null;
    var stressEnabled = false;
    var dragMode = 'none';
    var dragStart = { x: 0, y: 0 };
    var lastPointer = { x: 0, y: 0 };
    var spaceDown = false;
    var frames = 0;
    var fps = 0;
    var fpsTimer = 0;
    var effects = [];
    var lastStoredOre = null;

    host.appendChild(app.view);
    host.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });
    app.stage.addChild(starfield.container);
    app.stage.addChild(worldLayer);
    worldLayer.addChild(grid);
    worldLayer.addChild(effectsLayer);
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
      updateStarfield(starfield, world.camera, viewport());
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

      world.asteroids.forEach(function (asteroid) {
        var asteroidGraphic = asteroidGraphics[asteroid.id];
        if (!asteroidGraphic) {
          asteroidGraphic = new PIXI.Graphics();
          asteroidGraphics[asteroid.id] = asteroidGraphic;
          worldLayer.addChildAt(asteroidGraphic, 1);
        }
        paintAsteroid(asteroidGraphic, asteroid);
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

      spawnStateEffects(world, dt);
      updateEffects(effectsLayer, effects, dt);

      if (stressLayer && stressEnabled) {
        stressLayer.update(dt);
      }
      updateFps(dt, world);
    }

    function spawnStateEffects(world, dt) {
      world.ships.forEach(function (ship) {
        if (ship.type === 'miner' && ship.order.kind === 'mine' && ship.cargo > (ship.previousCargo || 0)) {
          var asteroid = findAsteroidById(world, ship.order.asteroidId);
          if (asteroid) {
            spawnMiningEffects(effects, asteroid.position, ship.position, ship.cargo - (ship.previousCargo || 0));
          }
        }
      });

      if (lastStoredOre === null) {
        lastStoredOre = world.mothership.storage.ore;
      } else if (world.mothership.storage.ore > lastStoredOre) {
        pushFloatText(effects, { x: 0, y: -52 }, '+' + Math.floor(world.mothership.storage.ore - lastStoredOre) + ' ore');
        lastStoredOre = world.mothership.storage.ore;
      } else {
        lastStoredOre = world.mothership.storage.ore;
      }

      while (effects.length > MAX_EFFECTS) {
        var removed = effects.shift();
        removed.graphic.destroy();
      }
    }

    function findAsteroidById(world, asteroidId) {
      return world.asteroids.filter(function (asteroid) {
        return asteroid.id === asteroidId;
      })[0];
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
        setWorld(sim.issueContextOrder(getWorld(), screenToWorld(point, getWorld().camera, viewport())));
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
      var world = getWorld();
      var baseCount = world.ships.length + world.asteroids.length;
      var count = stressEnabled && stressLayer ? stressLayer.count + baseCount : baseCount;
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
      mothership: world.mothership,
      contract: world.contract,
      asteroids: world.asteroids,
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
    drawEnginePlume(graphics, ship, style.radius);
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
      drawWorldOrderLine(graphics, ship);
    } else if (ship.order.kind === 'mine') {
      graphics.lineStyle(1, 0xd3a449, 0.65);
      drawWorldOrderLine(graphics, ship);
    } else if (ship.order.kind === 'return') {
      graphics.lineStyle(1, 0x9ed6c8, 0.65);
      drawWorldOrderLine(graphics, ship);
    }

    if (ship.type === 'miner' && ship.cargo > 0) {
      var filled = Math.max(0, Math.min(1, ship.cargo / ship.cargoCapacity));
      graphics.lineStyle(0);
      graphics.beginFill(0xd3a449, 0.95);
      graphics.drawRect(-10, style.radius + 6, 20 * filled, 3);
      graphics.endFill();
    }
  }

  function drawEnginePlume(graphics, ship, radius) {
    if (!ship.previousVelocity || ship.speed <= 0) return;
    var ax = ship.velocity.x - ship.previousVelocity.x;
    var ay = ship.velocity.y - ship.previousVelocity.y;
    var plumes = enginePlumeGeometry(ax, ay, ship.rotation, ship.acceleration, radius, ship.order.kind === 'return' && ship.cargo > 0);
    if (!plumes.length) return;

    graphics.lineStyle(0);
    plumes.forEach(function (plume) {
      graphics.beginFill(ship.cargo > 0 ? 0xe1b65b : 0x8fd7e4, plume.alpha);
      graphics.moveTo(plume.origin.x + plume.side.x * plume.width, plume.origin.y + plume.side.y * plume.width);
      graphics.lineTo(plume.origin.x + plume.direction.x * plume.length, plume.origin.y + plume.direction.y * plume.length);
      graphics.lineTo(plume.origin.x - plume.side.x * plume.width, plume.origin.y - plume.side.y * plume.width);
      graphics.closePath();
      graphics.endFill();
    });
  }

  function enginePlumeGeometry(worldAccelX, worldAccelY, rotation, acceleration, radius, loadedReturn) {
    var accel = Math.hypot(worldAccelX, worldAccelY);
    if (accel < 0.18) return [];

    var local = worldDeltaToShipLocal(worldAccelX, worldAccelY, rotation);
    var plumes = [];
    addThrusterPlume(plumes, 'main-aft', Math.max(0, local.x), acceleration, radius, { x: -0.82, y: 0 }, { x: -1, y: 0 }, loadedReturn);
    addThrusterPlume(plumes, 'brake-port', Math.max(0, -local.x), acceleration, radius, { x: 0.72, y: -0.42 }, { x: 1, y: 0 }, loadedReturn);
    addThrusterPlume(plumes, 'brake-starboard', Math.max(0, -local.x), acceleration, radius, { x: 0.72, y: 0.42 }, { x: 1, y: 0 }, loadedReturn);
    addThrusterPlume(plumes, 'port-translate', Math.max(0, local.y), acceleration, radius, { x: -0.2, y: -0.82 }, { x: 0, y: -1 }, loadedReturn);
    addThrusterPlume(plumes, 'starboard-translate', Math.max(0, -local.y), acceleration, radius, { x: -0.2, y: 0.82 }, { x: 0, y: 1 }, loadedReturn);
    return plumes;
  }

  function addThrusterPlume(plumes, id, thrust, acceleration, radius, originScale, direction, loadedReturn) {
    if (thrust < 0.12) return;
    var intensity = Math.min(1, thrust / Math.max(1, acceleration / 24));
    var normalized = normalize(direction);
    plumes.push({
      id: id,
      origin: { x: radius * originScale.x, y: radius * originScale.y },
      direction: normalized,
      side: { x: -normalized.y, y: normalized.x },
      length: (5 + 16 * intensity) * (loadedReturn ? 1.15 : 1),
      width: 2 + 3.5 * intensity,
      alpha: 0.12 + 0.5 * intensity
    });
  }

  function drawWorldOrderLine(graphics, ship) {
    var local = worldVectorToShipLocalLine(ship.position, ship.order.target, ship.rotation);
    graphics.moveTo(0, 0);
    graphics.lineTo(local.x, local.y);
  }

  function worldVectorToShipLocalLine(position, target, rotation) {
    var dx = target.x - position.x;
    var dy = target.y - position.y;
    var cos = Math.cos(-rotation);
    var sin = Math.sin(-rotation);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos
    };
  }

  function worldDeltaToShipLocal(dx, dy, rotation) {
    var cos = Math.cos(-rotation);
    var sin = Math.sin(-rotation);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos
    };
  }

  function normalize(vector) {
    var length = Math.max(0.0001, Math.hypot(vector.x, vector.y));
    return {
      x: vector.x / length,
      y: vector.y / length
    };
  }

  function paintAsteroid(graphics, asteroid) {
    var depletion = asteroid.oreInitial > 0 ? asteroid.ore / asteroid.oreInitial : 0;
    var radius = Math.max(12, asteroid.radius * (0.65 + 0.35 * depletion));
    graphics.clear();
    graphics.position.set(asteroid.position.x, asteroid.position.y);
    graphics.lineStyle(2, ASTEROID_STROKE, asteroid.ore > 0 ? 0.82 : 0.28);
    graphics.beginFill(ASTEROID_FILL, asteroid.ore > 0 ? 0.86 : 0.26);
    graphics.moveTo(radius, -3);
    graphics.lineTo(radius * 0.35, radius * 0.72);
    graphics.lineTo(-radius * 0.58, radius * 0.5);
    graphics.lineTo(-radius, -radius * 0.12);
    graphics.lineTo(-radius * 0.35, -radius * 0.78);
    graphics.lineTo(radius * 0.55, -radius * 0.48);
    graphics.closePath();
    graphics.endFill();
    graphics.lineStyle(1, 0x2c3337, 0.5);
    graphics.moveTo(-radius * 0.55, -radius * 0.08);
    graphics.lineTo(radius * 0.44, radius * 0.18);
  }

  function drawSelectionBox(graphics, a, b) {
    graphics.clear();
    graphics.lineStyle(1, 0xc6e6f2, 0.9);
    graphics.beginFill(0x89c9e2, 0.08);
    graphics.drawRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    graphics.endFill();
  }

  function createStarfield(width, height) {
    var container = new PIXI.Container();
    var rng = sim.createRng(40291);
    var layers = [
      createStarLayer(rng, width, height, 70, 0.08, 0.12),
      createStarLayer(rng, width, height, 46, 0.16, 0.18),
      createStarLayer(rng, width, height, 24, 0.26, 0.25)
    ];
    layers.forEach(function (layer) {
      container.addChild(layer.graphics);
    });
    return {
      container: container,
      layers: layers
    };
  }

  function createStarLayer(rng, width, height, count, parallax, alpha) {
    var stars = [];
    for (var i = 0; i < count; i += 1) {
      stars.push({
        x: sim.randomBetween(rng, 0, width),
        y: sim.randomBetween(rng, 0, height),
        size: sim.randomBetween(rng, 0.6, 1.7)
      });
    }
    return {
      graphics: new PIXI.Graphics(),
      stars: stars,
      parallax: parallax,
      alpha: alpha
    };
  }

  function updateStarfield(starfield, camera, viewport) {
    starfield.layers.forEach(function (layer) {
      var graphics = layer.graphics;
      graphics.clear();
      graphics.beginFill(0xc8d6dd, layer.alpha);
      layer.stars.forEach(function (star) {
        var x = wrap(star.x - camera.x * layer.parallax, viewport.width);
        var y = wrap(star.y - camera.y * layer.parallax, viewport.height);
        graphics.drawCircle(x, y, star.size);
      });
      graphics.endFill();
    });
  }

  function spawnMiningEffects(effects, source, target, amount) {
    var count = Math.max(1, Math.min(4, Math.ceil(amount * 8)));
    var dx = target.x - source.x;
    var dy = target.y - source.y;
    var distance = Math.max(1, Math.hypot(dx, dy));
    var dirX = dx / distance;
    var dirY = dy / distance;
    for (var i = 0; i < count; i += 1) {
      var t = i / Math.max(1, count - 1);
      var x = source.x + (target.x - source.x) * (0.2 + t * 0.22);
      var y = source.y + (target.y - source.y) * (0.2 + t * 0.22);
      var mote = new PIXI.Graphics();
      mote.beginFill(0xe4bd66, 0.92);
      mote.drawCircle(0, 0, 1.8);
      mote.endFill();
      mote.position.set(x, y);
      effects.push({
        graphic: mote,
        age: 0,
        life: 0.28 + t * 0.18,
        vx: dirX * 120 + (t - 0.5) * 28,
        vy: dirY * 120 - 20 + (0.5 - t) * 18,
        scale: 1,
        alpha: 1
      });
    }
  }

  function pushFloatText(effects, position, text) {
    var label = new PIXI.Text(text, {
      fontFamily: 'Consolas, monospace',
      fontSize: 13,
      fill: 0xf0d38a
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(position.x, position.y);
    effects.push({
      graphic: label,
      age: 0,
      life: 1.35,
      vx: 0,
      vy: -26,
      scale: 1,
      alpha: 1
    });
  }

  function updateEffects(container, effects, dt) {
    for (var i = effects.length - 1; i >= 0; i -= 1) {
      var effect = effects[i];
      if (!effect.graphic.parent) {
        container.addChild(effect.graphic);
      }
      effect.age += dt;
      effect.graphic.x += effect.vx * dt;
      effect.graphic.y += effect.vy * dt;
      effect.graphic.alpha = Math.max(0, 1 - effect.age / effect.life) * effect.alpha;
      effect.graphic.scale.set(effect.scale + effect.age * 0.25);
      if (effect.age >= effect.life) {
        effect.graphic.destroy();
        effects.splice(i, 1);
      }
    }
  }

  function wrap(value, size) {
    var wrapped = value % size;
    return wrapped < 0 ? wrapped + size : wrapped;
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

  function totalOreRemaining(world) {
    return world.asteroids.reduce(function (total, asteroid) {
      return total + asteroid.ore;
    }, 0);
  }

  Driftworks.game = {
    boot: boot,
    worldVectorToShipLocalLine: worldVectorToShipLocalLine,
    enginePlumeGeometry: enginePlumeGeometry
  };

  if (!global.DRIFTWORKS_TEST_MODE) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(window);
