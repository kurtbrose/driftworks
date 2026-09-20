(function (global) {
  'use strict';

  /** @typedef {import('./types').DriftworksNamespace} DriftworksNamespace */
  /** @typedef {import('./types').SimApi} SimApi */
  /** @typedef {import('./types').AudioApi} AudioApi */
  /** @typedef {import('./types').World} World */
  /** @typedef {import('./types').Vec2} Vec2 */
  /** @typedef {import('./types').Ship} Ship */
  /** @typedef {import('./types').Wreck} Wreck */
  /** @typedef {import('./types').Camera} Camera */
  /** @typedef {import('./types').Viewport} Viewport */
  /** @typedef {import('./types').Asteroid} Asteroid */
  /** @typedef {import('./types').Depot} Depot */
  /** @typedef {import('./types').Rng} Rng */
  /** @typedef {{ radius: number, fill: number, stroke: number }} ShipStyle */
  /** @typedef {{ id: string, origin: Vec2, direction: Vec2, side: Vec2, length: number, width: number, alpha: number }} Plume */
  /** @typedef {import('./types').HudController} HudController */
  /** @typedef {{ graphic: PIXI.DisplayObject, age: number, life: number, vx: number, vy: number, scale: number, alpha: number, grow?: number, screenSpace?: boolean, semanticType?: string }} VisualEffect */
  /** @typedef {import('./types').Drone} Drone */
  /** @typedef {import('./types').CombatEvent} CombatEvent */
  /** @type {DriftworksNamespace} */
  var Driftworks = (global.Driftworks = global.Driftworks || {});
  var sim = /** @type {SimApi} */ (Driftworks.sim);
  var audio = /** @type {AudioApi} */ (Driftworks.audio);
  var cameraTools = /** @type {import('./types').CameraApi} */ (Driftworks.camera);
  if (!cameraTools) {
    throw new Error('Tactical camera module did not load.');
  }
  var PIXI = global.PIXI;
  var sessions = /** @type {import('./types').SessionApi} */ (Driftworks.session);
  var STEP_SECONDS = 1 / 30;
  var MAX_FRAME_SECONDS = 0.2;
  var DETAIL_ZOOM_START = 32;
  var screenToWorld = cameraTools.screenToWorld;
  var viewportFromApp = cameraTools.viewportFromApp;
  var computeSelectionFocus = cameraTools.computeSelectionFocus;
  var focusCameraToward = cameraTools.focusCameraToward;
  var worldToScreen = cameraTools.worldToScreen;
  var panCamera = cameraTools.panCamera;
  var zoomCameraAt = cameraTools.zoomCameraAt;
  var withCamera = cameraTools.withCamera;
  var shipsInsideScreenRect = cameraTools.shipsInsideScreenRect;

  /** @type {Record<string, ShipStyle>} */
  var SHIP_STYLES = {
    mothership: { radius: 34, fill: 0x7d8790, stroke: 0xd7dee4 },
    platform: { radius: 14, fill: 0xd3a449, stroke: 0xf3d99b },
    tug: { radius: 18, fill: 0x6fa9ce, stroke: 0xc3e5ff },
    shuttle: { radius: 8, fill: 0xf4f5f0, stroke: 0xffffff },
    escort: { radius: 13, fill: 0xb76c6f, stroke: 0xf0b7b9 }
  };
  // Artwork-only mixes: simulation currently has one undifferentiated ore resource.
  var ASTEROID_PALETTES = [
    { name: 'ice', fill: 0x718d9b, stroke: 0xadc2cb, deposit: 0x859faa, detail: 0x49636e },
    { name: 'volatiles', fill: 0x625953, stroke: 0x9b9085, deposit: 0x897166, detail: 0x403d39 },
    { name: 'metals', fill: 0x707978, stroke: 0xaaa99c, deposit: 0x96978b, detail: 0x4d5656 },
    { name: 'silicates', fill: 0x655f57, stroke: 0xb6aa9b, deposit: 0x827b6f, detail: 0x393632 }
  ];
  /** @type {WeakMap<PIXI.Graphics, string>} */
  var asteroidArtworkKeys = new WeakMap();
  var MAX_EFFECTS = 260;

  // Local artwork scale; the camera still scales positions geometrically.
  // Through 32x, small craft shed their schematic magnification. Beyond that,
  // freeze local artwork scale so camera zoom magnifies every object together.
  // This preserves inspection proportions; it is not a physical hull calibration.
  /** @param {string} type @param {number} zoom @returns {number} */
  function semanticScale(type, zoom) {
    if (type === 'asteroid') return 1;
    var large = type === 'mothership' || type === 'asteroid';
    var exponent = large ? 0.95 : (type === 'platform' || type === 'tug' || type === 'depot' ? 0.12 : 0.08);
    // Every class stops shrinking on screen below the baseline. Keeping the
    // same floor for all classes preserves their tactical size hierarchy.
    var tacticalZoom = Math.min(DETAIL_ZOOM_START, zoom);
    return Math.pow(Math.max(1, tacticalZoom), exponent) / tacticalZoom;
  }

  function boot() {
    var sceneHost = document.querySelector('#scene');
    var hudHost = document.querySelector('#hud');

    if (!sceneHost || !hudHost) {
      throw new Error('Driftworks could not find its root DOM nodes.');
    }
    if (!PIXI) {
      throw new Error('Vendored PixiJS did not load.');
    }
    createApp(/** @type {HTMLElement} */ (sceneHost), /** @type {HTMLElement} */ (hudHost));
  }

  /** @param {HTMLElement} sceneHost @param {HTMLElement} hudHost */
  function createApp(sceneHost, hudHost) {
    var session = loadOrInitial();
    var world = session.world;
    /** @param {World} next */
    function setWorld(next) { session.world = next; sessions.transition(session, function (w) { return w; }); world = session.world; }
    var accumulator = 0;
    var timeScale = 1;
    var lastTime = performance.now();

    var scene = createScene(sceneHost, function () {
      return world;
      }, function (nextWorld) {
      setWorld(nextWorld);
      scene.sync(world);
      hud.update(world, scene.getStats());
    });

    if (!Driftworks.hud) throw new Error('HUD module did not load.');
    var hud = /** @type {HudController} */ (Driftworks.hud.create(hudHost, {
      getPopulation: function () { return session.population; },
      getTimeScale: function () { return timeScale; },
      onTimeScale: function (value) {
        timeScale = value;
        lastTime = performance.now();
        hud.update(world, scene.getStats());
      },
      onEndMining: function () {
        setWorld(sim.endMining(world));
        scene.sync(world);
        hud.update(world, scene.getStats());
      },
      onSalvageAll: function () {
        setWorld(sim.issueSalvageAllOrder(world));
        scene.sync(world);
        hud.update(world, scene.getStats());
      },
      onSelectShip: function (id) {
        if (id) world = sim.selectShips(world, [id]);
        scene.sync(world);
        hud.update(world, scene.getStats());
      },
      onDeployPlatform: function () {
        var asteroid = world.asteroids.filter(function (a) { return a.ore > 0; })[0];
        if (asteroid) setWorld(sim.issueMineOrder(world, asteroid.id));
        scene.sync(world);
        hud.update(world, scene.getStats());
      },
      onSave: function () {
        session.world = world;
        sessions.save(session);
        hud.update(world, scene.getStats());
      },
      onExport: function () {
        session.world = world;
        var scenario = { version: 1, name: 'gameplay-capture', world: world, session: /** @type {unknown} */ (JSON.parse(sessions.serialize(session))),
          ticks: 300, commands: [], assertions: [] };
        var dialog = document.createElement('dialog');
        dialog.className = 'scenario-export';
        dialog.innerHTML = '<h2>Export scenario</h2><p>Copy this snapshot or download it, then add commands and expected results for replay.</p>' +
          '<textarea aria-label="Scenario JSON" readonly></textarea><div><button type="button" data-export="download">Download JSON</button> ' +
          '<button type="button" data-export="close">Close</button></div>';
        var field = dialog.querySelector('textarea');
        var download = dialog.querySelector('[data-export="download"]');
        var close = dialog.querySelector('[data-export="close"]');
        if (!field || !download || !close) throw new Error('Missing scenario export controls');
        field.value = JSON.stringify(scenario, null, 2);
        var json = field.value;
        download.addEventListener('click', function () {
          var url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
          var link = document.createElement('a');
          link.href = url;
          link.download = 'driftworks-scenario.json';
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        });
        close.addEventListener('click', function () { dialog.close(); });
        dialog.addEventListener('close', function () { dialog.remove(); });
        document.body.appendChild(dialog);
        dialog.showModal();
        field.select();
      },
      onLoad: function () {
        session = loadOrInitial();
        world = session.world;
        accumulator = 0;
        scene.resetCombat();
        scene.sync(world);
        hud.update(world, scene.getStats());
      },
      onReset: function () {
        session = sessions.create();
        world = session.world;
        sessions.save(session);
        accumulator = 0;
        scene.resetCombat();
        scene.sync(world);
        hud.update(world, scene.getStats());
      },
      onStressToggle: function () {
        scene.setStressEnabled(!scene.getStats().stressEnabled);
        hud.update(world, scene.getStats());
      },
      onSfxVolume: function (value) {
        if (!audio) return;
        audio.setSfxVolume(value);
        hud.update(world, scene.getStats());
      },
      onMusicVolume: function (value) {
        if (!audio) return;
        audio.setMusicVolume(value);
        hud.update(world, scene.getStats());
      }
    }));

    scene.sync(world);
    hud.update(world, scene.getStats());

    /** @param {number} now */
    function frame(now) {
      var frameSeconds = Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS);
      lastTime = now;
      accumulator += frameSeconds * timeScale;

      while (accumulator >= STEP_SECONDS) {
        session.world = world;
        sessions.step(session, STEP_SECONDS);
        world = session.world;
        scene.consumeCombatEvents(world.combat.events);
        accumulator -= STEP_SECONDS;
      }

      world = scene.applyCameraFocus(world, frameSeconds);
      scene.sync(world);
      scene.render(world, accumulator / STEP_SECONDS, frameSeconds * timeScale, frameSeconds);
      hud.update(world, scene.getStats());
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }

  /** @returns {import('./types').Session} */
  function loadOrInitial() {
    try {
      return sessions.load();
    } catch (error) {
      console.warn('Save could not be loaded. Starting a fresh world.', error);
      return sessions.create();
    }
  }

  /** @param {HTMLElement} host @param {() => World} getWorld @param {(world: World) => void} setWorld */
  function createScene(host, getWorld, setWorld) {
    var app = new PIXI.Application({
      background: '#080c10',
      antialias: true,
      autoDensity: true,
      resolution: Math.min(global.devicePixelRatio || 1, 2),
      resizeTo: host
    });
    var starfield = createStarfield(app.screen.width, app.screen.height);
    var worldLayer = new PIXI.Container();
    var effectsLayer = new PIXI.Container();
    var grid = new PIXI.Graphics();
    var depotGraphic = new PIXI.Graphics();
    var coverageGraphic = new PIXI.Graphics();
    var recoveryGraphic = new PIXI.Graphics();
    var logisticsGraphic = new PIXI.Graphics();
    var launchLayer = new PIXI.Container();
    var selectionBox = new PIXI.Graphics();
    var readout = new PIXI.Text('', {
      fontFamily: 'Consolas, monospace',
      fontSize: 12,
      fill: 0xd8e4ea
    });
    /** @type {Record<string, PIXI.Graphics>} */
    var shipGraphics = {};
    /** @type {Record<string, PIXI.Graphics>} */
    var platformGraphics = {};
    /** @type {Record<string, PIXI.Graphics>} */
    var asteroidGraphics = {};
    /** @type {Record<string, PIXI.Graphics>} */
    var droneGraphics = {};
    /** @type {ReturnType<typeof createStressLayer> | null} */
    var stressLayer = null;
    var stressEnabled = false;
    var dragMode = 'none';
    var dragStart = { x: 0, y: 0 };
    var lastPointer = { x: 0, y: 0 };
    var spaceDown = false;
    var frames = 0;
    var fps = 0;
    var fpsTimer = 0;
    /** @type {VisualEffect[]} */
    var effects = [];
    /** @type {number | null} */
    var lastStoredOre = null;
    var lastMiningSoundAt = -Infinity;
    /** @type {Record<string, boolean>} */
    var previousSelected = {};
    /** @type {string[] | null} */
    var cameraFocusSelectionIds = null;
    var cameraShake = 0;
    var visualTimeScale = 1;
    /** @type {{ salvagedOre: number, repairedShips: number } | null} */
    var previousRecovery = null;

    host.appendChild(app.view);
    host.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });
    app.stage.addChild(starfield.container);
    app.stage.addChild(worldLayer);
    worldLayer.addChild(grid);
    worldLayer.addChild(depotGraphic);
    coverageGraphic.eventMode = 'none';
    worldLayer.addChild(coverageGraphic);
    recoveryGraphic.eventMode = 'none';
    worldLayer.addChild(recoveryGraphic);
    logisticsGraphic.eventMode = "none";
    worldLayer.addChild(logisticsGraphic);
    worldLayer.addChild(launchLayer);
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
    app.stage.on('pointercancel', cancelDrag);
    window.addEventListener('blur', cancelDrag);
    window.addEventListener('pointercancel', cancelDrag);
    // DOM release also covers a pointer released over the HUD or outside the canvas.
    window.addEventListener('pointerup', cancelDrag);

    host.addEventListener(
      'wheel',
      function (event) {
        event.preventDefault();
        var bounds = host.getBoundingClientRect();
        var world = getWorld();
        cameraFocusSelectionIds = null;
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
      unlockAudio();
      if (event.code === 'Space') spaceDown = true;
      if (event.code === 'KeyF') requestSelectionFocus(getWorld());
      if (event.code === 'KeyH' && !event.repeat) {
        var next = sim.spawnHostileWave(getWorld());
        setWorld(next);
        consumeCombatEvents(next.combat.events);
      }
      if (event.code === 'KeyK' && !event.repeat) setWorld(sim.spawnFighter(getWorld()));
      if (event.code === 'KeyJ' && !event.repeat) {
        var fighter = getWorld().ships.filter(function (ship) {
          return ship.type === 'escort' && !ship.disabled && getWorld().selectedShipIds.indexOf(ship.id) !== -1;
        })[0];
        if (fighter) {
          setWorld(sim.damageFighter(getWorld(), fighter.id, 1));
          pushFloatText(effects, fighter.position, 'DISABLED');
        }
      }
    });
    window.addEventListener('keyup', function (event) {
      if (event.code === 'Space') spaceDown = false;
    });

    /** @param {World} world */
    function sync(world) {
      if (grid.drawnZoom !== world.camera.zoom) {
        drawGrid(grid, world.camera.zoom);
        grid.drawnZoom = world.camera.zoom;
      }
      updateStarfield(starfield, world.camera, viewport());
      paintDepot(depotGraphic, world.depot);
      depotGraphic.scale.set(semanticScale('depot', world.camera.zoom));
      paintDefenderCoverage(coverageGraphic, world);
      paintRecovery(recoveryGraphic, world);
      logisticsGraphic.clear();
      Object.keys(platformGraphics).forEach(function (id) { platformGraphics[id].visible = false; });
      world.platforms.forEach(function (p) {
        if (p.state !== 'deployed' && p.state !== 'setting-up' && p.state !== 'packing-up') return;
        var graphic = platformGraphics[p.id];
        if (!graphic) {
          graphic = platformGraphics[p.id] = new PIXI.Graphics();
          graphic.eventMode = 'static';
          graphic.cursor = 'pointer';
          graphic.on('pointerdown', function (event) {
            unlockAudio();
            if (event.button === 0) {
              event.stopPropagation();
              setWorld(sim.selectPlatform(getWorld(), p.id));
              if (audio) audio.playSelect();
            }
          });
          worldLayer.addChild(graphic);
        }
        var asteroid = world.asteroids.filter(function (a) { return a.id === p.asteroidId; })[0];
        graphic.clear(); graphic.visible = true;
        graphic.position.set(p.position.x, p.position.y);
        graphic.rotation = p.siteAngle + (asteroid ? asteroid.rotation : 0) + Math.PI;
        graphic.scale.set(semanticScale('platform', world.camera.zoom));
        graphic.hitArea = new PIXI.Circle(0, 0, Math.max(17, 12 / (world.camera.zoom * graphic.scale.x)));
        graphic.lineStyle(2.5, world.selectedPlatformId === p.id ? 0xffffff : SHIP_STYLES.platform.stroke, 1);
        drawMiningPlume(graphic, p.state === 'deployed' && world.miningMission === 'active' && asteroid && asteroid.ore > 0, 14, world.elapsedSeconds);
        graphic.lineStyle(2.5, world.selectedPlatformId === p.id ? 0xffffff : SHIP_STYLES.platform.stroke, 1);
        paintMiningPlatform(graphic, SHIP_STYLES.platform);
        if (p.state === 'setting-up' || p.state === 'packing-up') {
          drawPlatformWorkers(graphic, (p.workerIds || []).slice(0, 5), world.elapsedSeconds, p.state === 'packing-up');
        }
      });
      world.packets.forEach(function (p) {
        logisticsGraphic.lineStyle(0);
        logisticsGraphic.beginFill(0x8ceac4, 1);
        logisticsGraphic.drawCircle(p.position.x, p.position.y, 3 / world.camera.zoom);
        logisticsGraphic.endFill();
      });
      var shakeX = cameraShake > 0 ? (Math.sin(world.elapsedSeconds * 97) * cameraShake) : 0;
      var shakeY = cameraShake > 0 ? (Math.cos(world.elapsedSeconds * 83) * cameraShake) : 0;
      var view = viewport();
      worldLayer.position.set(view.width / 2 + shakeX, view.height / 2 + shakeY);
      worldLayer.scale.set(world.camera.zoom);
      worldLayer.pivot.set(world.camera.x, world.camera.y);

      /** @type {Record<string, boolean>} */
      var selectedNow = {};
      world.ships.forEach(function (ship) {
        var graphic = shipGraphics[ship.id];
        if (!graphic) {
          graphic = createShipGraphic(ship.id);
          shipGraphics[ship.id] = graphic;
          worldLayer.addChild(graphic);
        }
        var selected = world.selectedShipIds.indexOf(ship.id) !== -1;
        if (selected) selectedNow[ship.id] = true;
        if (selected && !previousSelected[ship.id] && !ship.repairRemaining && ship.launchElapsed == null) {
          pushSelectionPulse(effects, ship.position, ship.type === 'mothership' ? 42 : 20, ship.type);
        }
        graphic.scale.set(semanticScale(ship.type, world.camera.zoom));
        graphic.engineScreenScale = world.camera.zoom * graphic.scale.x;
        if (ship.type !== 'mothership') {
          graphic.hitArea = new PIXI.Circle(0, 0, Math.max(SHIP_STYLES[ship.type].radius + 3,
            12 / (world.camera.zoom * graphic.scale.x)));
        }
        var towTarget = ship.towTarget;
        /** @type {Ship | Wreck | undefined} */
        var towedEntity;
        if (towTarget) {
          var targetId = towTarget.id;
          towedEntity = towTarget.kind === 'wreck'
            ? world.wrecks.filter(function (wreck) { return wreck.id === targetId; })[0]
            : world.ships.filter(function (target) { return target.id === targetId; })[0];
        }
        paintShip(graphic, ship, selected, world.elapsedSeconds, towedEntity,
          semanticScale('escort', world.camera.zoom) / semanticScale(ship.type, world.camera.zoom));
        graphic.visible = !ship.docked && !ship.towedBy && !ship.repairRemaining;
        graphic.eventMode = ship.docked || ship.towedBy || ship.repairRemaining ? 'none' : 'static';
        var parent = ship.launchElapsed != null ? launchLayer : worldLayer;
        if (graphic.parent !== parent) parent.addChild(graphic);
      });
      previousSelected = selectedNow;

      world.asteroids.forEach(function (asteroid) {
        var asteroidGraphic = asteroidGraphics[asteroid.id];
        if (!asteroidGraphic) {
          asteroidGraphic = new PIXI.Graphics();
          asteroidGraphics[asteroid.id] = asteroidGraphic;
          worldLayer.addChildAt(asteroidGraphic, 1);
        }
        paintAsteroid(asteroidGraphic, asteroid);
        asteroidGraphic.scale.set(semanticScale('asteroid', world.camera.zoom));
      });

      Object.keys(droneGraphics).forEach(function (id) {
        if (!world.combat.drones.some(function (drone) { return drone.id === id; })) {
          droneGraphics[id].destroy();
          delete droneGraphics[id];
        }
      });
      world.combat.drones.forEach(function (drone) {
        var droneGraphic = droneGraphics[drone.id];
        if (!droneGraphic) {
          droneGraphic = new PIXI.Graphics();
          droneGraphics[drone.id] = droneGraphic;
          worldLayer.addChild(droneGraphic);
        }
        paintDrone(droneGraphic, drone);
        droneGraphic.scale.set(semanticScale('escort', world.camera.zoom));
      });
    }

    /** @param {World} world @param {number} alpha @param {number} dt @param {number} realDt */
    function render(world, alpha, dt, realDt) {
      var visualDt = dt * visualTimeScale;
      world.ships.forEach(function (ship) {
        var graphic = shipGraphics[ship.id];
        if (!graphic) return;
        var x = ship.previousPosition.x + (ship.position.x - ship.previousPosition.x) * alpha;
        var y = ship.previousPosition.y + (ship.position.y - ship.previousPosition.y) * alpha;
        graphic.position.set(x, y);
        graphic.rotation = ship.rotation;
      });

      world.combat.drones.forEach(function (drone) {
        var graphic = droneGraphics[drone.id];
        if (graphic) graphic.position.set(
          drone.previousPosition.x + (drone.position.x - drone.previousPosition.x) * alpha,
          drone.previousPosition.y + (drone.position.y - drone.previousPosition.y) * alpha);
      });
      if (dt > 0) spawnStateEffects(world, visualDt);
      if (dt > 0) updateAudioTelemetry(world);
      else if (audio) audio.setEngineThrust(0);
      updateEffects(effectsLayer, effects, visualDt, world.camera.zoom);
      cameraShake = Math.max(0, cameraShake - dt * 18);
      visualTimeScale += (1 - visualTimeScale) * Math.min(1, dt * 3.5);

      if (stressLayer && stressEnabled) {
        stressLayer.update(visualDt);
      }
      updateFps(realDt, world);
    }

    /** @param {World} world @param {number} dt */
    function spawnStateEffects(world, dt) {
      if (world.recovery && previousRecovery) {
        var recovered = world.recovery.salvagedOre - previousRecovery.salvagedOre;
        var repaired = world.recovery.repairedShips - previousRecovery.repairedShips;
        var home = findShipByType(world, 'mothership');
        if (home && (recovered > 0 || repaired > 0)) {
          pushFloatText(effects, { x: home.position.x, y: home.position.y - 50 },
            recovered > 0 ? '+' + recovered + ' SALVAGE' : 'FIGHTER REPAIRED');
          if (audio) audio.playDelivery();
        }
      }
      previousRecovery = world.recovery ? Object.assign({}, world.recovery) : null;
      world.platforms.forEach(function (platform) {
        if (platform.state === 'deployed' && world.miningMission === 'active') {
          var asteroid = findAsteroidById(world, platform.asteroidId);
          if (asteroid && asteroid.ore > 0) {
            if (audio && world.elapsedSeconds - lastMiningSoundAt > 0.18) {
              audio.playMiningTick();
              lastMiningSoundAt = world.elapsedSeconds;
            }
          }
        }
      });

      if (lastStoredOre === null) {
        lastStoredOre = world.mothership.storage.ore;
      } else if (world.mothership.storage.ore > lastStoredOre) {
        pushFloatText(effects, { x: 0, y: -52 }, '+' + Math.floor(world.mothership.storage.ore - lastStoredOre) + ' ore');
        if (audio) audio.playDelivery();
        lastStoredOre = world.mothership.storage.ore;
      } else {
        lastStoredOre = world.mothership.storage.ore;
      }

      while (effects.length > MAX_EFFECTS) {
        var removed = effects.shift();
        if (removed) removed.graphic.destroy();
      }
    }

    /** @param {World} world @param {string | null} asteroidId */
    function findAsteroidById(world, asteroidId) {
      return world.asteroids.filter(function (asteroid) {
        return asteroid.id === asteroidId;
      })[0];
    }

    /** @param {CombatEvent[]} events */
    function consumeCombatEvents(events) {
      events.forEach(function (event) {
        if (event.kind === 'contact-warning' || event.kind === 'wave-spawned') {
          pushFloatText(effects, event.position, event.kind === 'contact-warning' ? 'CONTACT INBOUND' : 'HOSTILE CONTACT');
          if (audio) audio.playWarning();
        } else if (event.kind === 'weapon-fired' && event.source) {
          pushProjectile(effects, event.source, event.position);
          pushImpactSparks(effects, event.position, event.velocity || { x: 0, y: 0 });
          if (audio) audio.playImpact(event.amount || 0.4);
        } else if (event.kind === 'ship-disabled') {
          pushFloatText(effects, event.position, 'DISABLED');
        } else if (event.kind === 'ship-destroyed') {
          pushExplosion(effects, event.position, event.velocity || { x: 0, y: 0 }, !!event.final);
          if (audio) audio.playGunshot();
          if (event.final) {
            cameraShake = 1.8;
            visualTimeScale = 0.25;
            pushFloatText(effects, { x: event.position.x, y: event.position.y - 36 }, 'DRONE KILL');
          }
        }
      });
    }

    /** @param {World} world */
    function requestSelectionFocus(world) {
      var selected = selectedShips(world);
      if (!selected.length) {
        pushFloatText(effects, { x: world.camera.x, y: world.camera.y - 42 }, 'SELECT A SHIP');
        return;
      }

      cameraFocusSelectionIds = selected.map(function (ship) {
        return ship.id;
      });
      var focus = computeSelectionFocus(world, cameraFocusSelectionIds);
      if (!focus) return;
      pushFocusPulse(effects, focus, selected.length > 1 ? 58 : 34);
      pushFloatText(effects, { x: focus.x, y: focus.y - 48 }, focusLabel(selected));
    }

    /** @param {Ship[]} selected */
    function focusLabel(selected) {
      if (selected.length === 1) return 'FOCUS ' + selected[0].name.toUpperCase();
      return 'FOCUS ' + selected.length + ' SHIPS';
    }

    /** @param {World} world */
    function selectedCenter(world) {
      var selected = selectedShips(world);
      if (!selected.length) return null;
      var x = 0;
      var y = 0;
      selected.forEach(function (ship) {
        x += ship.position.x;
        y += ship.position.y;
      });
      return { x: x / selected.length, y: y / selected.length };
    }

    /** @param {World} world */
    function selectedShips(world) {
      return world.ships.filter(function (ship) {
        return world.selectedShipIds.indexOf(ship.id) !== -1;
      });
    }

    /** @param {World} world @param {string} type */
    function findShipByType(world, type) {
      return world.ships.filter(function (ship) {
        return ship.type === type;
      })[0];
    }

    /** @param {World} world @param {string} shipId */
    function findShipById(world, shipId) {
      return world.ships.filter(function (ship) {
        return ship.id === shipId;
      })[0];
    }

    /** @param {string} shipId */
    function createShipGraphic(shipId) {
      var graphic = new PIXI.Graphics();
      graphic.eventMode = 'static';
      graphic.cursor = 'pointer';
      graphic.on('pointerdown', function (event) {
        unlockAudio();
        if (event.button === 0) {
          event.stopPropagation();
          setWorld(sim.selectShips(getWorld(), [shipId]));
          if (audio) audio.playSelect();
        }
      });
      return graphic;
    }

    /** @param {PIXI.FederatedPointerEvent} event */
    function onPointerDown(event) {
      unlockAudio();
      cancelDrag();
      var point = { x: event.global.x, y: event.global.y };
      dragStart = point;
      lastPointer = point;

      if (event.button === 2) {
        var beforeOrder = getWorld();
        var target = screenToWorld(point, getWorld().camera, viewport());
        pushMoveReticle(effects, target);
        setWorld(issueVisualContextOrder(getWorld(), target));
        if (audio) {
          if (beforeOrder.selectedShipIds.length) audio.playMove();
          else audio.playInvalid();
        }
        return;
      }

      dragMode = event.button === 1 || spaceDown ? 'pan' : 'select';
    }

    /** @param {PIXI.FederatedPointerEvent} event */
    function onPointerMove(event) {
      var point = { x: event.global.x, y: event.global.y };
      if (dragMode === 'pan') {
        cameraFocusSelectionIds = null;
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

    /** @param {PIXI.FederatedPointerEvent} event */
    function onPointerUp(event) {
      var point = { x: event.global.x, y: event.global.y };
      var selecting = dragMode === 'select';
      // Clear input state before committing a selection, which invokes rendering.
      cancelDrag();
      if (selecting) {
        var distance = Math.hypot(point.x - dragStart.x, point.y - dragStart.y);
        if (distance > 8) {
          var selectedIds = shipsInsideScreenRect(getWorld(), dragStart, point, viewport());
          var world = getWorld();
          var minX = Math.min(dragStart.x, point.x), maxX = Math.max(dragStart.x, point.x);
          var minY = Math.min(dragStart.y, point.y), maxY = Math.max(dragStart.y, point.y);
          var selectedPlatform = world.platforms.filter(function (platform) {
            if (platform.state !== 'deployed' && platform.state !== 'setting-up' && platform.state !== 'packing-up') return false;
            var screen = worldToScreen(platform.position, world.camera, viewport());
            return screen.x >= minX && screen.x <= maxX && screen.y >= minY && screen.y <= maxY;
          })[0];
          setWorld(selectedPlatform && !selectedIds.length ? sim.selectPlatform(world, selectedPlatform.id) : sim.selectShips(world, selectedIds));
          if (audio && selectedIds.length) audio.playSelect();
        } else {
          setWorld(sim.selectShips(getWorld(), []));
        }
      }
    }

    function cancelDrag() {
      dragMode = 'none';
      selectionBox.clear();
    }

    /** @param {boolean} enabled */
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
      var baseCount = world.ships.length + world.asteroids.length + world.combat.drones.length + (world.wrecks || []).length;
      var count = stressEnabled && stressLayer ? stressLayer.count + baseCount : baseCount;
      return {
        fps: fps,
        stressEnabled: stressEnabled,
        entityCount: count,
        contacts: contactStatus()
      };
    }

    function contactStatus() {
      var combat = getWorld().combat;
      var drones = combat.drones, director = combat.director;
      if (drones.length) return drones.length + ' active';
      if (director.state === 'warning') return 'inbound ' + Math.max(0, Math.ceil(director.timer)) + 's';
      if (director.wavesSpawned >= sim.DIRECTOR_MAX_WAVES) return 'quiet';
      if (director.state === 'cooldown') return 'quiet ' + Math.max(0, Math.ceil(director.cooldown)) + 's';
      return 'quiet';
    }

    /** @param {number} dt @param {World} world */
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
      return viewportFromApp(app);
    }

    /** @param {World} world @param {number} dt */
    function applyCameraFocus(world, dt) {
      if (!cameraFocusSelectionIds) return world;
      if (!focusSelectionStillActive(world, cameraFocusSelectionIds)) {
        cameraFocusSelectionIds = null;
        return world;
      }
      var target = computeSelectionFocus(world, cameraFocusSelectionIds);
      if (!target) {
        cameraFocusSelectionIds = null;
        return world;
      }
      return focusCameraToward(world, target, dt);
    }

    /** @param {World} world @param {string[]} shipIds */
    function focusSelectionStillActive(world, shipIds) {
      return shipIds.every(function (shipId) {
        return world.selectedShipIds.indexOf(shipId) !== -1;
      });
    }

    function unlockAudio() {
      if (audio) audio.unlock();
    }

    /** @param {World} world */
    function updateAudioTelemetry(world) {
      if (!audio) return;
      var level = selectedThrustLevel(world);
      audio.setEngineThrust(level);
    }

    /** @param {World} world */
    function selectedThrustLevel(world) {
      var selected = selectedShips(world);
      var strongest = 0;
      selected.forEach(function (ship) {
        if (!ship.previousVelocity || ship.disabled) return;
        var ax = ship.velocity.x - ship.previousVelocity.x;
        var ay = ship.velocity.y - ship.previousVelocity.y;
        var level = Math.hypot(ax, ay) / Math.max(1, ship.acceleration / 30);
        strongest = Math.max(strongest, Math.min(1, level));
      });
      return strongest;
    }

    return {
      resetCombat: function () {
        Object.keys(droneGraphics).forEach(function (id) { droneGraphics[id].destroy(); });
        droneGraphics = {};
        effects.forEach(function (effect) { effect.graphic.destroy(); });
        effects.length = 0;
        cameraShake = 0;
        visualTimeScale = 1;
        previousRecovery = null;
      },
      sync: sync,
      consumeCombatEvents: consumeCombatEvents,
      render: render,
      applyCameraFocus: applyCameraFocus,
      setStressEnabled: setStressEnabled,
      getStats: getStats
    };
  }

  /** @param {World} world @param {Vec2} target @returns {World} */
  function issueVisualContextOrder(world, target) {
    var zoom = world.camera.zoom;
    /** @param {{ position: Vec2 }} entity @param {string} type @param {number} radius */
    function hits(entity, type, radius) {
      return Math.hypot(target.x - entity.position.x, target.y - entity.position.y) <=
        Math.max(12 / zoom, radius * semanticScale(type, zoom));
    }
    var homeHit = world.ships.filter(function (s) { return s.type === 'mothership' && hits(s, s.type, 38); })[0];
    if (homeHit) return sim.issueReturnOrder(world);
    var platformHit = (world.platforms || []).filter(function (p) {
      return (p.state === 'deployed' || p.state === 'setting-up') && hits(p, 'platform', 22);
    })[0];
    if (platformHit) return sim.issuePlatformRecovery(world, platformHit.id);
    var fighters = world.ships.filter(function (s) { return s.type === 'escort' && world.selectedShipIds.indexOf(s.id) !== -1; });
    if (fighters.length) {
      var guarded = world.ships.filter(function (s) {
        return world.selectedShipIds.indexOf(s.id) === -1 && hits(s, s.type, s.type === 'mothership' ? 38 : 16);
      }).sort(function (a, b) {
        return Math.hypot(a.position.x - target.x, a.position.y - target.y) - Math.hypot(b.position.x - target.x, b.position.y - target.y);
      })[0];
      var selectedIds = world.selectedShipIds.slice();
      var rest = selectedIds.filter(function (id) { return !fighters.some(function (s) { return s.id === id; }); });
      var next = rest.length ? issueVisualContextOrder(sim.selectShips(world, rest), target) : sim.cloneWorld(world);
      next = sim.selectShips(next, selectedIds);
      return sim.issueDefendOrder(next, guarded ? guarded.position : target, guarded && guarded.id);
    }
    var hasTug = world.ships.some(function (ship) {
      return ship.type === 'tug' && world.selectedShipIds.indexOf(ship.id) !== -1;
    });
    if (hasTug) {
      var recoverables = (world.wrecks || []).map(/** @returns {{ entity: import('./types').Wreck | Ship, kind: 'ship' | 'wreck' }} */ function (wreck) {
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
      if (recovery) return sim.issueRecoveryOrder(world, { kind: recovery.kind, id: recovery.entity.id });
    }
    var asteroid = world.asteroids.filter(function (item) {
      return hits(item, 'asteroid', sim.surfaceRadius(item, Math.atan2(target.y - item.position.y, target.x - item.position.x) - item.rotation));
    })[0];
    if (asteroid) return sim.issueMineOrder(world, asteroid.id);
    if (hasTug && world.depot && hits(world.depot, 'depot', 44)) return sim.issueBuildOrder(world);
    var home = world.ships.filter(function (ship) { return ship.type === 'mothership'; })[0];
    if (home && hits(home, 'mothership', 38)) return sim.issueReturnOrder(world);
    return sim.issueMoveOrder(world, target);
  }

  /** @param {PIXI.Graphics} graphics @param {number} [zoom] */
  function drawGrid(graphics, zoom) {
    zoom = zoom || 1;
    graphics.clear();
    graphics.lineStyle(1 / zoom, 0x24323b, 0.52);
    for (var x = -2400; x <= 2400; x += 120) {
      graphics.moveTo(x, -1800);
      graphics.lineTo(x, 1800);
    }
    for (var y = -1800; y <= 1800; y += 120) {
      graphics.moveTo(-2400, y);
      graphics.lineTo(2400, y);
    }
    graphics.lineStyle(2 / zoom, 0x536877, 0.75);
    graphics.moveTo(-2400, 0);
    graphics.lineTo(2400, 0);
    graphics.moveTo(0, -1800);
    graphics.lineTo(0, 1800);
  }

  /** @param {PIXI.Graphics} graphics @param {World} world */
  function paintDefenderCoverage(graphics, world) {
    graphics.clear();
    /** @type {Record<string, boolean>} */
    var anchors = {};
    world.ships.forEach(function (ship) {
      if (ship.type !== 'escort' || ship.disabled || world.selectedShipIds.indexOf(ship.id) === -1) return;
      graphics.lineStyle(1.25 / world.camera.zoom, 0xf0b7b9, 0.32);
      graphics.beginFill(0xb76c6f, 0.035);
      graphics.drawCircle(ship.position.x, ship.position.y, sim.FIGHTER_RANGE);
      graphics.endFill();
      if (ship.order.kind === 'defend') {
        var anchor = ship.order.anchor;
        var key = anchor.x + ':' + anchor.y + ':' + ship.order.leashRadius;
        if (!anchors[key]) {
          anchors[key] = true;
          graphics.lineStyle(1 / world.camera.zoom, 0x9ed6c8, 0.2);
          graphics.drawCircle(anchor.x, anchor.y, ship.order.leashRadius);
          graphics.moveTo(anchor.x - 6 / world.camera.zoom, anchor.y);
          graphics.lineTo(anchor.x + 6 / world.camera.zoom, anchor.y);
          graphics.moveTo(anchor.x, anchor.y - 6 / world.camera.zoom);
          graphics.lineTo(anchor.x, anchor.y + 6 / world.camera.zoom);
        }
      }
    });
  }

  /** @param {PIXI.Graphics} graphics @param {World} world */
  function paintRecovery(graphics, world) {
    graphics.clear();
    (world.wrecks || []).forEach(function (wreck) {
      if (wreck.towedBy) return;
      var cos = Math.cos(wreck.rotation || 0);
      var sin = Math.sin(wreck.rotation || 0);
      var scale = semanticScale('escort', world.camera.zoom);
      /** @type {number[]} */
      var points = [];
      [[13, 0], [-8, -8], [-3, -1], [-6, 3], [-8, 8]].forEach(function (point) {
        points.push(wreck.position.x + (point[0] * cos - point[1] * sin) * scale,
          wreck.position.y + (point[0] * sin + point[1] * cos) * scale);
      });
      graphics.lineStyle(1.2 * scale, 0x9d9095, 0.6);
      graphics.beginFill(0x5f5158, 0.45);
      graphics.drawPolygon(points);
      graphics.endFill();
      if (!wreck.towedBy) {
        graphics.lineStyle(scale, 0xc4ae7d, 0.65);
        graphics.moveTo(wreck.position.x - 5 * scale, wreck.position.y + 18 * scale);
        graphics.lineTo(wreck.position.x + 5 * scale, wreck.position.y + 18 * scale);
      }
    });
    world.ships.forEach(function (ship) {
      if (ship.disabled && !ship.towedBy && !ship.repairRemaining && ship.launchElapsed == null) {
        var scale = semanticScale(ship.type, world.camera.zoom);
        graphics.lineStyle(1.5 * scale, ship.repairRemaining ? 0x8fc6ba : 0xd5ae65, 0.85);
        graphics.moveTo(ship.position.x - 7 * scale, ship.position.y + 18 * scale);
        graphics.lineTo(ship.position.x + 7 * scale, ship.position.y + 18 * scale);
        if (!ship.repairRemaining) {
          graphics.moveTo(ship.position.x, ship.position.y + 15 * scale);
          graphics.lineTo(ship.position.x, ship.position.y + 21 * scale);
        }
      }
    });
  }

  /** @param {PIXI.Graphics} graphics @param {Ship} ship @param {boolean} selected @param {number} elapsedSeconds @param {Ship | Wreck | undefined} towedEntity @param {number} towedScale */
  function paintShip(graphics, ship, selected, elapsedSeconds, towedEntity, towedScale) {
    var style = SHIP_STYLES[ship.type];
    graphics.clear();
    graphics.alpha = ship.disabled && ship.launchElapsed == null ? 0.45 : 1;
    drawEnginePlume(graphics, ship, style.radius, elapsedSeconds);
    if (ship.type === 'mothership') {
      paintMothership(graphics, selected, elapsedSeconds);
      drawShipOrderAndBadges(graphics, ship, style);
      return;
    }

    if (ship.type === 'tug' && ship.carryingSection) {
      paintConstructorCargo(graphics, style);
    }
    graphics.lineStyle(selected ? 3 : 1.5, selected ? 0xffffff : style.stroke, selected ? 1 : 0.9);
    if (ship.type === 'tug') {
      if (ship.platformId) {
        graphics.lineStyle(1.5, SHIP_STYLES.platform.stroke, 0.9);
        paintMiningPlatform(graphics, SHIP_STYLES.platform);
        graphics.lineStyle(selected ? 3 : 1.5, selected ? 0xffffff : style.stroke, 0.9);
      }
      paintConstructor(graphics, style);
      if (ship.towTarget) paintTowedHull(graphics, ship.towTarget.kind, towedEntity, style, towedScale);
    } else if (ship.type === 'shuttle') {
      graphics.beginFill(style.fill, 1);
      graphics.drawRoundedRect(-8, -4, 16, 8, 3);
      graphics.endFill();
      graphics.beginFill(0x395366, 1);
      graphics.drawRoundedRect(2, -2.5, 3, 5, 1);
      graphics.endFill();
    } else {
      graphics.beginFill(style.fill, 0.96);
      graphics.moveTo(style.radius, 0);
      graphics.lineTo(-style.radius * 0.72, -style.radius * 0.62);
      graphics.lineTo(-style.radius * 0.45, 0);
      graphics.lineTo(-style.radius * 0.72, style.radius * 0.62);
      graphics.closePath();
      graphics.endFill();
    }

    drawShipOrderAndBadges(graphics, ship, style);
  }

  /** @param {PIXI.Graphics} graphics @param {string} kind @param {Ship | Wreck | undefined} entity @param {ShipStyle} tugStyle @param {number} hullScale */
  function paintTowedHull(graphics, kind, entity, tugStyle, hullScale) {
    var centerX = 0;
    var centerY = -1;
    var points = kind === 'wreck'
      ? [[11, 0], [-8, -7], [-2, -1], [-6, 3], [-8, 7]]
      : [[13, 0], [-9, -8], [-4, 0], [-9, 8]];
    /** @type {number[]} */
    var polygon = [];
    points.forEach(function (point) {
      polygon.push(centerX + point[0] * hullScale, centerY + point[1] * hullScale);
    });
    var stroke = kind === 'wreck' ? 0xc4ae7d : SHIP_STYLES.escort.stroke;
    var fill = kind === 'wreck' ? 0x5f5158 : SHIP_STYLES.escort.fill;
    graphics.lineStyle(1.5, stroke, kind === 'wreck' ? 0.9 : 1);
    graphics.beginFill(fill, kind === 'wreck' ? 0.8 : 0.98);
    graphics.drawPolygon(polygon);
    graphics.endFill();
    if (kind === 'ship' && entity && entity.disabled) {
      graphics.lineStyle(1, 0xffffff, 0.65);
      graphics.moveTo(centerX - 4 * hullScale, centerY);
      graphics.lineTo(centerX + 3 * hullScale, centerY);
    }
    graphics.lineStyle(1.5, tugStyle.stroke, 0.9);
    graphics.moveTo(-0.25 * tugStyle.radius, -0.25 * tugStyle.radius);
    graphics.lineTo(centerX - 4 * hullScale, centerY - 4 * hullScale);
    graphics.moveTo(-0.25 * tugStyle.radius, 0.25 * tugStyle.radius);
    graphics.lineTo(centerX - 4 * hullScale, centerY + 4 * hullScale);
  }

  /** @param {PIXI.Graphics} graphics @param {string[]} workerIds @param {number} elapsedSeconds @param {boolean} packingUp */
  function drawPlatformWorkers(graphics, workerIds, elapsedSeconds, packingUp) {
    var positions = workerIds.map(function (personId, index) {
      var seed = 0;
      for (var i = 0; i < personId.length; i += 1) seed = (seed * 31 + personId.charCodeAt(i)) >>> 0;
      var homeAngle = (seed % 6283) / 1000;
      var radius = 21 + (seed >>> 8) % 7;
      var period = 17 + (seed >>> 16) % 11;
      var activityTime = elapsedSeconds / period + (seed % 997) / 997;
      var segment = Math.floor(activityTime);
      var blend = activityTime - segment;
      blend = blend * blend * (3 - 2 * blend);
      var fromOffset = (Math.floor((seed % 37) / 11) - 1) * 0.45;
      var toOffset = (Math.floor(((seed >>> 5) % 37) / 11) - 1) * 0.45;
      if (packingUp) { fromOffset *= -1; toOffset *= -1; }
      var fromAngle = homeAngle + fromOffset + segment * (0.13 + index * 0.035);
      var toAngle = homeAngle + toOffset + (segment + 1) * (0.13 + index * 0.035);
      var angle = fromAngle + (toAngle - fromAngle) * blend;
      var distance = radius + Math.sin(elapsedSeconds * 0.17 + index * 1.7 + seed % 29) * 2.5;
      return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
    });
    var separationX = workerIds.map(function () { return 0; });
    var separationY = workerIds.map(function () { return 0; });
    positions.forEach(function (position, index) {
      positions.forEach(function (other, otherIndex) {
        if (index === otherIndex) return;
        var dx = position.x - other.x;
        var dy = position.y - other.y;
        var distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > 0 && distanceSquared < 12 * 12) {
          var strength = (12 - Math.sqrt(distanceSquared)) / 12;
          separationX[index] += dx / Math.sqrt(distanceSquared) * strength * 5;
          separationY[index] += dy / Math.sqrt(distanceSquared) * strength * 5;
        }
      });
    });
    positions.forEach(function (position, index) {
      var x = position.x + separationX[index];
      var y = position.y + separationY[index];
      var distance = Math.sqrt(x * x + y * y);
      if (distance > 32) { x *= 32 / distance; y *= 32 / distance; }
      graphics.lineStyle(1, 0xc5d9d8, 0.9);
      graphics.beginFill(0xe7f0e5, 1);
      graphics.drawCircle(x, y, 1.8);
      graphics.endFill();
    });
  }

  /** @param {PIXI.Graphics} graphics @param {ShipStyle} style */
  function paintMiningPlatform(graphics, style) {
    var r = style.radius;
    graphics.beginFill(style.fill, 0.85);
    [-0.55, 0, 0.55].forEach(function (x) {
      [-1, 1].forEach(function (side) {
        graphics.drawRoundedRect((x - 0.15) * r, (side < 0 ? -0.83 : 0.4) * r, 0.3 * r, 0.43 * r, 1);
      });
    });
    graphics.endFill();
    graphics.beginFill(style.fill, 1);
    graphics.drawRoundedRect(-0.86 * r, -0.56 * r, 1.72 * r, 1.12 * r, 0.35 * r);
    graphics.endFill();
    graphics.lineStyle(1, style.stroke, 0.35);
    graphics.moveTo(0.45 * r, -0.3 * r);
    graphics.lineTo(0.45 * r, 0.3 * r);
  }

  /** @param {PIXI.Graphics} graphics @param {ShipStyle} style */
  function paintConstructorCargo(graphics, style) {
    var r = style.radius;
    var module = cargoModuleGeometry();
    graphics.lineStyle(1, 0xaabac4, 0.85);
    graphics.beginFill(0x53616b, 1);
    graphics.drawRoundedRect(-module.length / 2, -module.width / 2, module.length, module.width, 1.5);
    graphics.endFill();
    graphics.lineStyle(1, 0x28353e, 0.8);
    [-0.36, 0.36].forEach(function (y) {
      graphics.moveTo(-0.48 * r, y * r);
      graphics.lineTo(0.48 * r, y * r);
    });
    graphics.lineStyle(2, style.stroke, 0.7);
    [-0.58, 0.58].forEach(function (x) {
      [-1, 1].forEach(function (side) {
        graphics.moveTo(x * r, side * module.width / 2);
        graphics.lineTo(x * r, side * 0.84 * r);
      });
    });
  }

  /** @param {PIXI.Graphics} graphics @param {ShipStyle} style */
  function paintConstructor(graphics, style) {
    var r = style.radius;
    graphics.beginFill(style.fill, 0.8);
    [-0.58, 0.58].forEach(function (x) {
      graphics.drawRoundedRect((x - 0.055) * r, -0.88 * r, 0.11 * r, 1.76 * r, 0.6);
    });
    [-1, 1].forEach(function (side) {
      graphics.drawRoundedRect(-0.88 * r, (side < 0 ? -0.96 : 0.84) * r, 0.66 * r, 0.12 * r, 0.6);
      graphics.drawRoundedRect(0.22 * r, (side < 0 ? -0.96 : 0.84) * r, 0.66 * r, 0.12 * r, 0.6);
    });
    graphics.endFill();
    graphics.beginFill(style.fill, 1);
    graphics.drawRoundedRect(-0.9 * r, -0.23 * r, 1.8 * r, 0.46 * r, 1.8);
    graphics.endFill();
    graphics.lineStyle(1, style.stroke, 0.4);
    graphics.moveTo(0.6 * r, -0.15 * r);
    graphics.lineTo(0.6 * r, 0.15 * r);
  }

  /** @param {PIXI.Graphics} graphics @param {Ship} ship @param {ShipStyle} style */
  function drawShipOrderAndBadges(graphics, ship, style) {
    if (ship.order.kind === 'move') {
      graphics.lineStyle(1, 0x7aa9c2, 0.5);
      drawWorldOrderLine(graphics, ship);
    } else if (ship.order.kind === 'deploy' || ship.order.kind === 'retrieve-platform') {
      graphics.lineStyle(1, 0xd3a449, 0.65);
      drawWorldOrderLine(graphics, ship);
    } else if (ship.order.kind === 'return') {
      graphics.lineStyle(1, 0x9ed6c8, 0.65);
      drawWorldOrderLine(graphics, ship);
    } else if (ship.order.kind === 'build' || ship.order.kind === 'recover') {
      graphics.lineStyle(1, 0xbfd6ea, 0.7);
      drawWorldOrderLine(graphics, ship);
    }

    if (ship.type === 'tug' && ship.cargo > 0) {
      var filled = 1;
      graphics.lineStyle(0);
      graphics.beginFill(0xd3a449, 0.95);
      graphics.drawRect(-10, style.radius + 6, 20 * filled, 3);
      graphics.endFill();
    }

    if (ship.type === 'escort' && ship.damage > 0 && !ship.disabled) {
      graphics.lineStyle(0);
      graphics.beginFill(0xd5ae65, 0.8);
      graphics.drawRect(-8, 13, 16 * Math.max(0, 1 - ship.damage), 2);
      graphics.endFill();
    }

  }

  /** @param {PIXI.Graphics} graphics @param {boolean} selected @param {number} elapsedSeconds */
  function paintMothership(graphics, selected, elapsedSeconds) {
    graphics.lineStyle(0);
    graphics.beginFill(SHIP_STYLES.mothership.fill, 1);
    graphics.drawRoundedRect(-36, -17, 72, 34, 5);
    graphics.endFill();

    drawMothershipDrumSurface(graphics, elapsedSeconds);
    drawMothershipLights(graphics, elapsedSeconds);

    graphics.lineStyle(selected ? 3 : 1.5, selected ? 0xffffff : SHIP_STYLES.mothership.stroke, selected ? 1 : 0.9);
    graphics.beginFill(SHIP_STYLES.mothership.fill, 0);
    graphics.drawRoundedRect(-36, -17, 72, 34, 5);
    graphics.endFill();

    graphics.lineStyle(selected ? 3 : 1.5, selected ? 0xffffff : SHIP_STYLES.mothership.stroke, selected ? 1 : 0.9);
    graphics.beginFill(0x6f7d86, 1);
    graphics.drawRect(-10, -28, 20, 56);
    graphics.endFill();
  }

  /** @param {PIXI.Graphics} graphics @param {number} elapsedSeconds */
  function drawMothershipDrumSurface(graphics, elapsedSeconds) {
    var bands = mothershipDrumMarkers(elapsedSeconds);
    graphics.lineStyle(1, 0xd3e4ea, 0.08);
    graphics.moveTo(-32, -13);
    graphics.lineTo(32, -13);

    bands.forEach(function (band) {
      if (!band.visible) return;
      graphics.lineStyle(band.width, 0xbdd9e4, band.alpha);
      graphics.moveTo(-band.halfWidth, band.y);
      graphics.lineTo(band.halfWidth, band.y);
    });

    graphics.lineStyle(1, 0x89c9e2, 0.09);
    graphics.moveTo(-36, 0);
    graphics.lineTo(36, 0);
  }

  /** @param {number} elapsedSeconds */
  function mothershipDrumMarkers(elapsedSeconds) {
    var spin = elapsedSeconds * Math.PI * 2 / 38;
    var markers = [];
    for (var i = 0; i < 6; i += 1) {
      var phase = spin + i * Math.PI / 3;
      var y = Math.sin(phase) * 16.5;
      // Depth hides the underside; the exposed surface spans both screen halves.
      var depth = Math.cos(phase);
      var facing = Math.max(0, depth);
      markers.push({
        y: y,
        halfWidth: mothershipHullHalfWidthAtY(y),
        width: 0.55 + facing * 0.55,
        alpha: facing * 0.18,
        visible: depth > 0
      });
    }
    return markers;
  }

  /** @param {number} y */
  function mothershipHullHalfWidthAtY(y) {
    var absY = Math.abs(y);
    if (absY <= 12) return 36;
    var cornerInset = absY - 12;
    return 31 + Math.sqrt(Math.max(0, 25 - cornerInset * cornerInset));
  }

  /** @param {PIXI.Graphics} graphics @param {number} elapsedSeconds */
  function drawMothershipLights(graphics, elapsedSeconds) {
    var spin = elapsedSeconds * Math.PI * 2 / 38;
    var xPositions = [-26, 26];
    graphics.lineStyle(0);
    xPositions.forEach(function (x, xIndex) {
      for (var i = 0; i < 2; i += 1) {
        var phase = spin + i * Math.PI + xIndex * 0.24;
        var y = Math.sin(phase) * 15;
        var depth = Math.cos(phase);
        if (depth <= 0) continue;
        var near = depth * 0.9;
        graphics.beginFill(0xbdd9e4, near);
        graphics.drawCircle(x, y, 1.6 + near * 0.9);
        graphics.endFill();
      }
    });
  }

  /** @param {PIXI.Graphics} graphics @param {Ship} ship @param {number} radius @param {number} elapsedSeconds */
  function drawEnginePlume(graphics, ship, radius, elapsedSeconds) {
    if (ship.disabled || !ship.previousVelocity || ship.speed <= 0 || ('phase' in ship.order && ship.order.phase === 'landed')) {
      graphics.engineResponse = null;
      return;
    }
    var ax = ship.velocity.x - ship.previousVelocity.x;
    var ay = ship.velocity.y - ship.previousVelocity.y;
    var plumes = enginePlumeGeometry(ax, ay, ship.rotation, ship.acceleration, radius, ship.order.kind === 'return' && ship.cargo > 0, ship.type);
    if (!plumes.length) {
      graphics.engineResponse = null;
      return;
    }

    var fighter = ship.type === 'escort';
    var time = elapsedSeconds || 0;
    var response = graphics.engineResponse && time >= graphics.engineResponse.time
      ? graphics.engineResponse : { time: time, levels: {} };
    var dt = Math.max(0, Math.min(0.1, time - response.time));
    /** @type {Record<string, number>} */
    var levels = {};
    var seed = 0;
    for (var i = 0; i < ship.id.length; i += 1) seed = (seed * 31 + ship.id.charCodeAt(i)) >>> 0;
    graphics.lineStyle(0);
    plumes.forEach(function (plume, index) {
      var previous = response.levels[plume.id];
      var level = previous == null ? 0.55 : previous;
      level += (1 - level) * (1 - Math.exp(-dt / (fighter ? 0.035 : 0.22)));
      levels[plume.id] = level;
      var phase = time * (fighter ? 24 : 7) + seed % 997 + index * 2.4;
      var pulse = Math.sin(phase) * 0.65 + Math.sin(phase * 1.73) * 0.35;
      var length = plume.length * (0.65 + level * 0.35) * (1 + pulse * (fighter ? 0.075 : 0.025));
      var alpha = plume.alpha * (0.7 + level * 0.3);
      drawPlumeDiamond(graphics, plume, 0, length * 0.16, length, plume.width, 0x73c9c1, alpha * 0.48);
      drawPlumeDiamond(graphics, plume, 0, length * 0.1, length * 0.84, plume.width * 0.48, 0x9fe9df, alpha * 0.72);
      drawPlumeDiamond(graphics, plume, 0, length * 0.06, length * 0.67, plume.width * 0.16, 0xe5fff3, alpha * 1.35);
      // Tiny distant exhaust keeps its silhouette without subpixel bands.
      if (length * Math.abs(graphics.engineScreenScale || graphics.scale.x) >= 10) {
        for (var node = 0; node < 3; node += 1) {
          var center = length * (0.2 + node * 0.2 + pulse * 0.008);
          var halfLength = length * (0.065 - node * 0.01);
          drawPlumeDiamond(graphics, plume, center - halfLength, center, center + halfLength,
            plume.width * (0.3 - node * 0.065), 0xeafff4, alpha * (1.3 - node * 0.23));
        }
      }
    });
    graphics.engineResponse = { time: time, levels: levels };
  }

  /** @param {PIXI.Graphics} graphics @param {Plume} plume @param {number} start @param {number} center @param {number} end @param {number} width @param {number} color @param {number} alpha */
  function drawPlumeDiamond(graphics, plume, start, center, end, width, color, alpha) {
    var x = plume.origin.x;
    var y = plume.origin.y;
    var dx = plume.direction.x;
    var dy = plume.direction.y;
    graphics.beginFill(color, Math.min(1, alpha));
    graphics.moveTo(x + dx * start, y + dy * start);
    graphics.lineTo(x + dx * center + plume.side.x * width, y + dy * center + plume.side.y * width);
    graphics.lineTo(x + dx * end, y + dy * end);
    graphics.lineTo(x + dx * center - plume.side.x * width, y + dy * center - plume.side.y * width);
    graphics.closePath();
    graphics.endFill();
  }

  /** @param {number} worldAccelX @param {number} worldAccelY @param {number} rotation @param {number} acceleration @param {number} radius @param {boolean} loadedReturn @param {string} shipType */
  function enginePlumeGeometry(worldAccelX, worldAccelY, rotation, acceleration, radius, loadedReturn, shipType) {
    var accel = Math.hypot(worldAccelX, worldAccelY);
    if (accel < 0.18) return [];

    var local = worldDeltaToShipLocal(worldAccelX, worldAccelY, rotation);
    /** @type {Plume[]} */
    var plumes = [];
    addThrusterPlume(plumes, 'main-aft', Math.max(0, local.x), acceleration, radius, { x: -0.82, y: 0 }, { x: -1, y: 0 }, loadedReturn);
    addThrusterPlume(plumes, 'brake-port', Math.max(0, -local.x), acceleration, radius, { x: 0.72, y: -0.42 }, { x: 1, y: 0 }, loadedReturn);
    addThrusterPlume(plumes, 'brake-starboard', Math.max(0, -local.x), acceleration, radius, { x: 0.72, y: 0.42 }, { x: 1, y: 0 }, loadedReturn);
    addThrusterPlume(plumes, 'port-translate', Math.max(0, local.y), acceleration, radius, { x: -0.2, y: -0.82 }, { x: 0, y: -1 }, loadedReturn);
    addThrusterPlume(plumes, 'starboard-translate', Math.max(0, -local.y), acceleration, radius, { x: -0.2, y: 0.82 }, { x: 0, y: 1 }, loadedReturn);
    if (shipType === 'tug') {
      plumes.forEach(function (plume) {
        var constructor = shipType === 'tug';
        if (plume.id === 'main-aft') {
          plume.origin.x = -(constructor ? 0.9 : 0.86) * radius;
        } else if (plume.id.indexOf('brake-') === 0) {
          plume.origin.x = (constructor ? 0.9 : 0.82) * radius;
          plume.origin.y = Math.sign(plume.origin.y) * (constructor ? 0.16 : 0.3) * radius;
        } else {
          plume.origin.x = (constructor ? -0.58 : 0) * radius;
          plume.origin.y = Math.sign(plume.origin.y) * (constructor ? 0.96 : 0.83) * radius;
        }
      });
    }
    return plumes;
  }

  /** @param {Plume[]} plumes @param {string} id @param {number} thrust @param {number} acceleration @param {number} radius @param {Vec2} originScale @param {Vec2} direction @param {boolean} loadedReturn */
  function addThrusterPlume(plumes, id, thrust, acceleration, radius, originScale, direction, loadedReturn) {
    if (thrust < 0.12) return;
    var intensity = Math.min(1, thrust / Math.max(1, acceleration / 24));
    var normalized = normalize(direction);
    plumes.push({
      id: id,
      origin: { x: radius * originScale.x, y: radius * originScale.y },
      direction: normalized,
      side: { x: -normalized.y, y: normalized.x },
      length: (4 + 13 * intensity) * (loadedReturn ? 1.08 : 1),
      width: 1.5 + 2.8 * intensity,
      alpha: 0.1 + 0.36 * intensity
    });
  }

  /** @param {PIXI.Graphics} graphics @param {Ship} ship */
  function drawWorldOrderLine(graphics, ship) {
    if (!('target' in ship.order) || !ship.order.target) return;
    var local = worldVectorToShipLocalLine(ship.position, ship.order.target, ship.rotation);
    graphics.moveTo(0, 0);
    graphics.lineTo(local.x / graphics.scale.x, local.y / graphics.scale.y);
  }

  /** @param {Vec2} position @param {Vec2} target @param {number} rotation */
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

  /** @param {number} dx @param {number} dy @param {number} rotation */
  function worldDeltaToShipLocal(dx, dy, rotation) {
    var cos = Math.cos(-rotation);
    var sin = Math.sin(-rotation);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos
    };
  }

  /** @param {Vec2} vector */
  function normalize(vector) {
    var length = Math.max(0.0001, Math.hypot(vector.x, vector.y));
    return {
      x: vector.x / length,
      y: vector.y / length
    };
  }

  // Same schematic metres-to-artwork ratio as a carried module, at every zoom.
  function cargoModuleGeometry() {
    return { length: sim.DEPOT_SECTION.lengthM * 0.45, width: sim.DEPOT_SECTION.widthM * 0.45 };
  }

  /** @param {PIXI.Graphics} graphics @param {Depot} depot */
  function paintDepot(graphics, depot) {
    graphics.clear();
    if (!depot) return;
    graphics.position.set(depot.position.x, depot.position.y);
    graphics.lineStyle(1.5, 0x9eb8c5, 0.55);
    graphics.beginFill(0x26333a, 0.16);
    var length = sim.DEPOT_FRAME.lengthM * 0.45;
    var width = sim.DEPOT_FRAME.widthM * 0.45;
    var module = cargoModuleGeometry();
    graphics.drawRoundedRect(-length / 2, -width / 2, length, width, 4);
    graphics.endFill();
    graphics.lineStyle(1, 0x9eb8c5, 0.25);
    graphics.moveTo(-length / 2 - 5, 0);
    graphics.lineTo(length / 2 + 5, 0);
    graphics.moveTo(0, -width / 2 - 5);
    graphics.lineTo(0, width / 2 + 5);

    for (var i = 0; i < depot.totalStages; i += 1) {
      var y = (i - (depot.totalStages - 1) / 2) * (module.width + 4.5);
      var built = i < depot.builtStages;
      graphics.lineStyle(1.5, built ? 0xd7dee4 : 0x6d828e, built ? 0.95 : 0.5);
      graphics.beginFill(built ? 0x788891 : 0x1b252b, built ? 0.72 : 0.22);
      graphics.drawRoundedRect(-module.length / 2, y - module.width / 2, module.length, module.width, 1.5);
      graphics.endFill();
    }
  }

  /** Deterministic body-local artwork, independent of simulation RNG and depletion.
   * @param {Asteroid} asteroid
   */
  function asteroidVisualDescription(asteroid) {
    var seed = 2166136261;
    for (var h = 0; h < asteroid.id.length; h += 1) seed = Math.imul(seed ^ asteroid.id.charCodeAt(h), 16777619);
    var rng = sim.createRng(seed >>> 0);
    var dominant = Math.floor(rng() * 4);
    var secondary = (dominant + 1 + Math.floor(rng() * 3)) % 4;
    var tertiary = [0, 1, 2, 3].filter(function (m) { return m !== dominant && m !== secondary; })[0];
    var composition = [0, 0, 0, 0];
    var secondaryCount = rng() < 0.15 ? 0 : (rng() < 0.65 ? 1 : 2);
    composition[dominant] = 0.55 + rng() * 0.2;
    composition[secondary] = (1 - composition[dominant]) * (0.6 + rng() * 0.25);
    composition[tertiary] = 1 - composition[dominant] - composition[secondary];
    if (secondaryCount < 2) { composition[secondary] += composition[tertiary]; composition[tertiary] = 0; }
    if (!secondaryCount) { composition[dominant] = 1; composition[secondary] = 0; }
    var radius = asteroid.radius;
    var shape = [];
    for (var i = 0; i < 120; i += 1) {
      var angle = i / 120 * Math.PI * 2;
      var r = sim.surfaceRadius(asteroid, angle);
      shape.push(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    /** @type {{ material: number, points: number[], x: number, y: number, extent: number, satellite: boolean }[]} */
    var deposits = [];
    var count = secondaryCount ? 1 + Math.floor(rng() * 3) : 0;
    for (var j = 0; j < count; j += 1) {
      var material = secondaryCount === 2 && rng() < 0.3 ? tertiary : secondary;
      // Surface exposure is deliberately independent of bulk abundance.
      var size = radius * (0.22 + rng() * (count === 1 ? 0.09 : 0.035));
      var a = 0, x = 0, y = 0;
      var placed = false;
      for (var attempt = 0; attempt < 80; attempt += 1) {
        a = rng() * Math.PI * 2;
        var distance = Math.sqrt(rng()) * sim.surfaceRadius(asteroid, a) * 0.98;
        x = Math.cos(a) * distance; y = Math.sin(a) * distance;
        if (deposits.every(function (other) {
          return Math.hypot(x - other.x, y - other.y) > size + other.extent;
        })) { placed = true; break; }
      }
      if (!placed) continue;
      var points = [];
      var corners = 15 + Math.floor(rng() * 5);
      var aspect = 0.72 + rng() * 0.2;
      // Elongate along the local limb tangent, derived from the shared surface.
      var before = sim.surfaceRadius(asteroid, a - 0.01);
      var after = sim.surfaceRadius(asteroid, a + 0.01);
      var tangent = Math.atan2(Math.sin(a + 0.01) * after - Math.sin(a - 0.01) * before,
        Math.cos(a + 0.01) * after - Math.cos(a - 0.01) * before);
      for (var k = 0; k < corners; k += 1) {
        var theta = k / corners * Math.PI * 2;
        var roughness = 0.68 + rng() * 0.32;
        var localX = Math.cos(theta) * size * roughness;
        var localY = Math.sin(theta) * size * aspect * roughness;
        points.push(x + localX * Math.cos(tangent) - localY * Math.sin(tangent),
          y + localX * Math.sin(tangent) + localY * Math.cos(tangent));
      }
      // Sample patch edges before trimming them to the exact rendered outline.
      // Dense samples follow the curved limb rather than joining cut ends with a chord.
      var trimmed = [];
      for (var edge = 0; edge < points.length; edge += 2) {
        var next = (edge + 2) % points.length;
        for (var sample = 0; sample < 8; sample += 1) {
          var blend = sample / 8;
          var px = points[edge] + (points[next] - points[edge]) * blend;
          var py = points[edge + 1] + (points[next + 1] - points[edge + 1]) * blend;
          var theta = (Math.atan2(py, px) + Math.PI * 2) % (Math.PI * 2);
          var segment = Math.floor(theta / (Math.PI * 2) * 120) * 2;
          var following = (segment + 2) % shape.length;
          var ax = shape[segment], ay = shape[segment + 1];
          var dx = shape[following] - ax, dy = shape[following + 1] - ay;
          var limit = (ax * dy - ay * dx) / (Math.cos(theta) * dy - Math.sin(theta) * dx);
          var scale = Math.min(1, limit / Math.hypot(px, py));
          trimmed.push(px * scale, py * scale);
        }
      }
      deposits.push({ material: material, points: trimmed, x: x, y: y, extent: size, satellite: false });
    }
    deposits.slice().forEach(function (parent) {
      if (rng() >= 0.25) return;
      var size = radius * (0.025 + rng() * 0.02);
      for (var attempt = 0; attempt < 16; attempt += 1) {
        var angle = rng() * Math.PI * 2;
        var distance = parent.extent + size + radius * 0.015;
        var x = parent.x + Math.cos(angle) * distance;
        var y = parent.y + Math.sin(angle) * distance;
        // Keep these tiny fragments on the body and clear of other inclusions.
        if (Math.hypot(x, y) + size > radius * 0.75 || !deposits.every(function (other) {
          return Math.hypot(x - other.x, y - other.y) > size + other.extent;
        })) continue;
        var points = [];
        for (var k = 0; k < 9; k += 1) {
          var theta = k / 9 * Math.PI * 2;
          var extent = size * (0.65 + rng() * 0.35);
          points.push(x + Math.cos(theta) * extent, y + Math.sin(theta) * extent);
        }
        deposits.push({ material: parent.material, points: points, x: x, y: y, extent: size, satellite: true });
        break;
      }
    });
    /** @type {{ x: number, y: number, rx: number, ry: number, angle: number }[]} */
    var craters = [];
    // An independent stream lets bare bodies be heavily cratered and rich ones quiet.
    rng = sim.createRng((seed ^ 0x9e3779b9) >>> 0);
    var craterCount = rng() < 0.25 ? 0 : 2 + Math.floor(rng() * 15);
    var cluster = rng() * Math.PI * 2;
    for (var c = 0; c < craterCount; c += 1) {
      var ca = cluster + (rng() - 0.5) * 3.8;
      var cd = radius * (0.15 + rng() * 0.48);
      var crater = { x: Math.cos(ca) * cd, y: Math.sin(ca) * cd,
        rx: radius * (0.025 + rng() * 0.055), ry: radius * (0.018 + rng() * 0.025), angle: rng() * Math.PI };
      var extent = Math.max(crater.rx, crater.ry);
      // Craters occupy exposed host rock rather than drawing across inclusions.
      if (deposits.every(function (deposit) {
        return Math.hypot(crater.x - deposit.x, crater.y - deposit.y) > deposit.extent + extent + radius * 0.012;
      }) && craters.every(function (other) {
        return Math.hypot(crater.x - other.x, crater.y - other.y) > extent + Math.max(other.rx, other.ry);
      })) craters.push(crater);
    }
    return { shape: shape, composition: composition, dominant: dominant, deposits: deposits, craters: craters };
  }

  /** @param {PIXI.Graphics} graphics @param {Asteroid} asteroid */
  function paintAsteroid(graphics, asteroid) {
    graphics.position.set(asteroid.position.x, asteroid.position.y);
    graphics.rotation = asteroid.rotation;
    var key = asteroid.id + ':' + asteroid.radius;
    if (asteroidArtworkKeys.get(graphics) === key) return;
    asteroidArtworkKeys.set(graphics, key);
    var visual = asteroidVisualDescription(asteroid);
    var palette = ASTEROID_PALETTES[visual.dominant];
    graphics.clear();
    graphics.lineStyle(1, palette.stroke, 0.82);
    graphics.beginFill(palette.fill);
    graphics.drawPolygon(visual.shape);
    graphics.endFill();
    visual.deposits.forEach(function (deposit) {
      var material = ASTEROID_PALETTES[deposit.material];
      graphics.lineStyle(0);
      graphics.beginFill(material.deposit, 1);
      graphics.drawPolygon(deposit.points);
      graphics.endFill();
    });
    graphics.lineStyle(1, palette.detail, 0.6);
    visual.craters.forEach(function (crater) {
      var points = [];
      for (var i = 0; i < 24; i += 1) {
        var a = i / 24 * Math.PI * 2;
        var x = Math.cos(a) * crater.rx;
        var y = Math.sin(a) * crater.ry;
        points.push(crater.x + x * Math.cos(crater.angle) - y * Math.sin(crater.angle),
          crater.y + x * Math.sin(crater.angle) + y * Math.cos(crater.angle));
      }
      graphics.drawPolygon(points);
    });
  }

  /** @param {PIXI.Graphics} graphics @param {Drone} drone */
  function paintDrone(graphics, drone) {
    var flash = drone.flash || 0;
    graphics.clear();
    graphics.position.set(drone.position.x, drone.position.y);
    graphics.rotation = Math.atan2(drone.velocity.y, drone.velocity.x);
    graphics.lineStyle(1.5, flash > 0 ? 0xffffff : 0xf0a1a8, 0.9);
    graphics.beginFill(flash > 0 ? 0xffd0d4 : 0x7b2f3c, 0.9);
    graphics.moveTo(13, 0);
    graphics.lineTo(-8, -8);
    graphics.lineTo(-4, 0);
    graphics.lineTo(-8, 8);
    graphics.closePath();
    graphics.endFill();
    graphics.lineStyle(1, 0xffb2b8, 0.45);
    graphics.drawCircle(0, 0, 15);
  }

  /** @param {PIXI.Graphics} graphics @param {Vec2} a @param {Vec2} b */
  function drawSelectionBox(graphics, a, b) {
    graphics.clear();
    graphics.lineStyle(1, 0xc6e6f2, 0.9);
    graphics.beginFill(0x89c9e2, 0.08);
    graphics.drawRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    graphics.endFill();
  }

  /** @param {number} width @param {number} height */
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

  /** @param {VisualEffect[]} effects @param {Vec2} position */
  function pushMoveReticle(effects, position) {
    var ring = new PIXI.Graphics();
    ring.lineStyle(1.5, 0xaed8e8, 0.85);
    ring.drawCircle(0, 0, 14);
    ring.lineStyle(1, 0xaed8e8, 0.6);
    ring.moveTo(-20, 0);
    ring.lineTo(-9, 0);
    ring.moveTo(9, 0);
    ring.lineTo(20, 0);
    ring.moveTo(0, -20);
    ring.lineTo(0, -9);
    ring.moveTo(0, 9);
    ring.lineTo(0, 20);
    ring.position.set(position.x, position.y);
    effects.push({ graphic: ring, age: 0, life: 0.65, vx: 0, vy: 0, scale: 0.7, alpha: 1, grow: 1.2, screenSpace: true });
  }

  /** @param {VisualEffect[]} effects @param {Vec2} position @param {number} radius @param {string} type */
  function pushSelectionPulse(effects, position, radius, type) {
    var pulse = new PIXI.Graphics();
    pulse.lineStyle(2, 0xffffff, 0.9);
    pulse.drawCircle(0, 0, radius);
    pulse.position.set(position.x, position.y);
    effects.push({ graphic: pulse, age: 0, life: 0.34, vx: 0, vy: 0, scale: 0.75, alpha: 0.9, grow: 1.5, semanticType: type });
  }

  /** @param {VisualEffect[]} effects @param {Vec2} position @param {number} radius */
  function pushFocusPulse(effects, position, radius) {
    var pulse = new PIXI.Graphics();
    pulse.lineStyle(1.5, 0xaed8e8, 0.8);
    pulse.drawCircle(0, 0, radius);
    pulse.lineStyle(1, 0xffffff, 0.45);
    pulse.moveTo(-radius - 8, 0);
    pulse.lineTo(-radius + 8, 0);
    pulse.moveTo(radius - 8, 0);
    pulse.lineTo(radius + 8, 0);
    pulse.moveTo(0, -radius - 8);
    pulse.lineTo(0, -radius + 8);
    pulse.moveTo(0, radius - 8);
    pulse.lineTo(0, radius + 8);
    pulse.position.set(position.x, position.y);
    effects.push({ graphic: pulse, age: 0, life: 0.55, vx: 0, vy: 0, scale: 0.85, alpha: 0.95, grow: 1.28, screenSpace: true });
  }

  /** @param {VisualEffect[]} effects @param {Vec2} from @param {Vec2} to */
  function pushProjectile(effects, from, to) {
    var streak = new PIXI.Graphics();
    streak.lineStyle(2, 0xdaf7ff, 0.95);
    streak.moveTo(from.x, from.y);
    streak.lineTo(to.x, to.y);
    effects.push({ graphic: streak, age: 0, life: 0.09, vx: 0, vy: 0, scale: 1, alpha: 1, screenSpace: false });
  }

  /** @param {VisualEffect[]} effects @param {Vec2} position @param {number} rotation */
  function pushMuzzleFlash(effects, position, rotation) {
    var flash = new PIXI.Graphics();
    flash.beginFill(0xf7f0c8, 0.95);
    flash.drawCircle(0, 0, 4);
    flash.endFill();
    flash.position.set(position.x + Math.cos(rotation) * 15, position.y + Math.sin(rotation) * 15);
    effects.push({ graphic: flash, age: 0, life: 0.08, vx: 0, vy: 0, scale: 1, alpha: 1, grow: 1.2 });
  }

  /** @param {VisualEffect[]} effects @param {Vec2} position @param {Vec2} velocity */
  function pushImpactSparks(effects, position, velocity) {
    for (var i = 0; i < 6; i += 1) {
      var angle = i * Math.PI * 0.35 + 0.4;
      var spark = new PIXI.Graphics();
      spark.beginFill(0xf4d29a, 0.95);
      spark.drawCircle(0, 0, 1.4);
      spark.endFill();
      spark.position.set(position.x, position.y);
      effects.push({
        graphic: spark,
        age: 0,
        life: 0.25,
        vx: velocity.x * 0.4 + Math.cos(angle) * 80,
        vy: velocity.y * 0.4 + Math.sin(angle) * 80,
        scale: 1,
        alpha: 1
      });
    }
  }

  /** @param {VisualEffect[]} effects @param {Vec2} position @param {Vec2} velocity @param {boolean} finalKill */
  function pushExplosion(effects, position, velocity, finalKill) {
    var flash = new PIXI.Graphics();
    flash.beginFill(0xffeef0, 0.95);
    flash.drawCircle(0, 0, finalKill ? 22 : 15);
    flash.endFill();
    flash.position.set(position.x, position.y);
    effects.push({ graphic: flash, age: 0, life: 0.18, vx: 0, vy: 0, scale: 0.6, alpha: 1, grow: 2.5 });

    var cloud = new PIXI.Graphics();
    cloud.beginFill(0xb7c0c5, 0.25);
    cloud.drawCircle(0, 0, finalKill ? 28 : 20);
    cloud.endFill();
    cloud.position.set(position.x, position.y);
    effects.push({ graphic: cloud, age: 0, life: 0.9, vx: velocity.x * 0.2, vy: velocity.y * 0.2, scale: 0.7, alpha: 0.9, grow: 1.8 });

    for (var i = 0; i < 9; i += 1) {
      var fragment = new PIXI.Graphics();
      fragment.lineStyle(2, 0xd6b5aa, 0.9);
      fragment.moveTo(-3, 0);
      fragment.lineTo(3, 0);
      fragment.position.set(position.x, position.y);
      fragment.rotation = i * 0.7;
      effects.push({
        graphic: fragment,
        age: 0,
        life: 0.7,
        vx: velocity.x * 0.7 + Math.cos(i * 0.7) * (55 + i * 5),
        vy: velocity.y * 0.7 + Math.sin(i * 0.7) * (55 + i * 5),
        scale: 1,
        alpha: 1
      });
    }
  }

  /** @param {Rng} rng @param {number} width @param {number} height @param {number} count @param {number} parallax @param {number} alpha */
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

  /** @param {ReturnType<typeof createStarfield>} starfield @param {Camera} camera @param {Viewport} viewport */
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

  // Like engine exhaust, dust is drawn in hull-local coordinates so position,
  // rotation, interpolation and semantic zoom all follow the ship exactly.
  /** @param {PIXI.Graphics} graphics @param {boolean} active @param {number} radius @param {number} elapsedSeconds */
  function drawMiningPlume(graphics, active, radius, elapsedSeconds) {
    if (!active) return;
    graphics.lineStyle(0);
    graphics.beginFill(0xd5bd82, 0.16);
    graphics.drawCircle(radius * 0.95, 0, radius * 0.28);
    graphics.endFill();
    for (var i = 0; i < 12; i += 1) {
      var age = (elapsedSeconds * 1.8 + i / 12) % 1;
      var angle = (i * 2.399963) % (Math.PI * 2);
      var travel = radius * age * 0.9;
      graphics.beginFill(i % 3 === 0 ? 0xf0d38a : 0xc7a762, (1 - age) * 0.6);
      graphics.drawCircle(radius * 0.95 + Math.cos(angle) * travel,
        Math.sin(angle) * travel, radius * (0.035 + age * 0.035));
      graphics.endFill();
    }
  }

  /** @param {Vec2} source @param {Vec2} target @param {number} rotation */
  function miningEffectGeometry(source, target, rotation) {
    var dx = target.x - source.x;
    var dy = target.y - source.y;
    var distance = Math.hypot(dx, dy);
    var separated = distance >= 18;
    var dir = separated
      ? { x: dx / distance, y: dy / distance }
      : { x: Math.cos(rotation), y: Math.sin(rotation) };
    var beamLength = Math.min(24, Math.max(10, distance * 0.55));
    var contactDistance = separated ? 13 + beamLength : 18;

    return {
      beamOrigin: separated ? {
        x: target.x - dir.x * 13,
        y: target.y - dir.y * 13
      } : null,
      contact: {
        x: target.x + dir.x * contactDistance * (separated ? -1 : 1),
        y: target.y + dir.y * contactDistance * (separated ? -1 : 1)
      },
      seedAngle: Math.atan2(dir.y, dir.x)
    };
  }

  /** @param {VisualEffect[]} effects @param {Vec2} position @param {string} text */
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
      alpha: 1,
      screenSpace: true
    });
  }

  /** @param {PIXI.Container} container @param {VisualEffect[]} effects @param {number} dt @param {number} zoom */
  function updateEffects(container, effects, dt, zoom) {
    zoom = zoom || 1;
    for (var i = effects.length - 1; i >= 0; i -= 1) {
      var effect = effects[i];
      if (!effect.graphic.parent) {
        container.addChild(effect.graphic);
      }
      effect.age += dt;
      var motionScale = effect.screenSpace ? 1 / zoom : 1;
      effect.graphic.x += effect.vx * dt * motionScale;
      effect.graphic.y += effect.vy * dt * motionScale;
      effect.graphic.alpha = Math.max(0, 1 - effect.age / effect.life) * effect.alpha;
      var grow = effect.grow === undefined ? 0.25 : effect.grow;
      var displayScale = effect.screenSpace ? 1 / zoom :
        (effect.semanticType ? semanticScale(effect.semanticType, zoom) : 1);
      effect.graphic.scale.set((effect.scale + effect.age * grow) * displayScale);
      if (effect.age >= effect.life) {
        effect.graphic.destroy();
        effects.splice(i, 1);
      }
    }
  }

  /** @param {number} value @param {number} size */
  function wrap(value, size) {
    var wrapped = value % size;
    return wrapped < 0 ? wrapped + size : wrapped;
  }

  function createStressLayer() {
    var container = new PIXI.Container();
    var rng = sim.createRng(9503);
    var bounds = 1800;
    /** @type {{ graphic: PIXI.Graphics, x: number, y: number, vx: number, vy: number, spin: number }[]} */
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
      /** @param {number} dt */
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
    boot: boot,
    asteroidVisualDescription: asteroidVisualDescription,
    paintAsteroid: paintAsteroid,
    semanticScale: semanticScale,
    updateEffects: updateEffects,
    zoomCameraAt: zoomCameraAt,
    issueVisualContextOrder: issueVisualContextOrder,
    worldVectorToShipLocalLine: worldVectorToShipLocalLine,
    enginePlumeGeometry: enginePlumeGeometry,
    drawEnginePlume: drawEnginePlume,
    screenToWorld: screenToWorld,
    worldToScreen: worldToScreen,
    viewportFromApp: viewportFromApp,
    computeSelectionFocus: computeSelectionFocus,
    focusCameraToward: focusCameraToward,
    withCamera: withCamera,
    miningEffectGeometry: miningEffectGeometry,
    drawMiningPlume: drawMiningPlume,
    paintRecovery: paintRecovery,
    mothershipDrumMarkers: mothershipDrumMarkers,
    mothershipHullHalfWidthAtY: mothershipHullHalfWidthAtY
  };

  if (!global.DRIFTWORKS_TEST_MODE) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(window);
