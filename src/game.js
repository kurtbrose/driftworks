(function (global) {
  'use strict';

  var Driftworks = (global.Driftworks = global.Driftworks || {});
  var sim = Driftworks.sim;
  var audio = Driftworks.audio;
  var PIXI = global.PIXI;
  var STEP_SECONDS = 1 / 30;
  var MAX_FRAME_SECONDS = 0.2;
  var DETAIL_ZOOM_START = 32;
  var MAX_ZOOM = 128;

  var SHIP_STYLES = {
    mothership: { radius: 34, fill: 0x7d8790, stroke: 0xd7dee4 },
    cargo: { radius: 14, fill: 0xd3a449, stroke: 0xf3d99b },
    tug: { radius: 18, fill: 0x6fb6a7, stroke: 0xc3eee5 },
    escort: { radius: 13, fill: 0xb76c6f, stroke: 0xf0b7b9 }
  };
  var ASTEROID_FILL = 0x655f57;
  var ASTEROID_STROKE = 0xb6aa9b;
  var MAX_EFFECTS = 260;
  var DEFENDER_RANGE = sim.FIGHTER_RANGE;
  var DEFENDER_DWELL_SECONDS = 1.35;
  var DIRECTOR_WARNING_SECONDS = 8;
  var DIRECTOR_COOLDOWN_SECONDS = 44;
  var DIRECTOR_MAX_WAVES = 3;

  // Local artwork scale; the camera still scales positions geometrically.
  // Through 32x, small craft shed their schematic magnification. Beyond that,
  // freeze local artwork scale so camera zoom magnifies every object together.
  // This preserves inspection proportions; it is not a physical hull calibration.
  function semanticScale(type, zoom) {
    if (type === 'asteroid') return 1;
    var large = type === 'mothership' || type === 'asteroid';
    var exponent = large ? 0.95 : (type === 'cargo' || type === 'tug' || type === 'depot' ? 0.12 : 0.08);
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

    createApp(sceneHost, hudHost);
  }

  function createApp(sceneHost, hudHost) {
    var world = loadOrInitial();
    var accumulator = 0;
    var timeScale = 1;
    var lastTime = performance.now();

    var scene = createScene(sceneHost, function () {
      return world;
    }, function (nextWorld) {
      world = nextWorld;
      scene.sync(world);
      hud.update(world, scene.getStats());
    });

    var hud = createHud(hudHost, {
      getTimeScale: function () { return timeScale; },
      onTimeScale: function (value) {
        timeScale = value;
        lastTime = performance.now();
        hud.update(world, scene.getStats());
      },
      onEndMining: function () {
        world = sim.endMining(world);
        scene.sync(world);
        hud.update(world, scene.getStats());
      },
      onSelectShip: function (id) {
        world = sim.selectShips(world, [id]);
        scene.sync(world);
        hud.update(world, scene.getStats());
      },
      onSave: function () {
        sim.saveWorld(world);
        hud.update(world, scene.getStats());
      },
      onLoad: function () {
        world = loadOrInitial();
        accumulator = 0;
        scene.resetCombat();
        scene.sync(world);
        hud.update(world, scene.getStats());
      },
      onReset: function () {
        world = sim.createInitialWorld();
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
    });

    scene.sync(world);
    hud.update(world, scene.getStats());

    function frame(now) {
      var frameSeconds = Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS);
      lastTime = now;
      accumulator += frameSeconds * timeScale;

      while (accumulator >= STEP_SECONDS) {
        world = sim.stepWorld(world, STEP_SECONDS, scene.getThreats());
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
      '<section class="panel time-panel" aria-label="Simulation time" aria-live="off">' +
      '<div class="time-heading"><span>MISSION TIME · IN-GAME</span><strong data-role="time-speed" aria-live="polite"></strong></div>' +
      '<div class="mission-clock" data-role="clock"></div>' +
      '<div class="time-buttons" role="group" aria-label="Simulation speed">' +
      '<button type="button" data-speed="0" aria-label="Pause simulation" title="Pause"><span aria-hidden="true">Ⅱ</span></button>' +
      '<button type="button" data-speed="1" aria-label="Play at normal speed" title="Normal speed">▶ 1×</button>' +
      '<button type="button" data-speed="2" aria-label="Fast forward at 2 times speed" title="Fast forward 2×">▶▶ 2×</button>' +
      '<button type="button" data-speed="4" aria-label="Fast forward at 4 times speed" title="Fast forward 4×">▶▶ 4×</button>' +
      '</div></section>' +
      '<section class="panel readout">' +
      '<div class="row"><span>Location</span><strong data-role="location"></strong></div>' +
      '<div class="row"><span>Cash</span><strong data-role="money"></strong></div>' +
      '<div class="row"><span>Ore Quota</span><strong data-role="quota"></strong></div>' +
      '<div class="row"><span>Asteroid Ore</span><strong data-role="field"></strong></div>' +
      '<div class="row"><span>Depot</span><strong data-role="depot"></strong></div>' +
      '<div class="row"><span>Sections</span><strong data-role="sections"></strong></div>' +
      '<div class="row"><span>Mining</span><strong data-role="mining"></strong></div>' +
      '<div class="row"><span>Launch / catch</span><strong>32 m/s Δv</strong></div>' +
      '<div class="row"><span>Contacts</span><strong data-role="contacts"></strong></div>' +
      '<div class="row"><span>Recovery</span><strong data-role="recovery"></strong></div>' +
      '<div class="row"><span>Salvaged</span><strong data-role="salvaged"></strong></div>' +
      '<div class="row"><span>Entities</span><strong data-role="entities"></strong></div>' +
      '<div class="row"><span>Selection</span><strong data-role="selection"></strong></div>' +
      '</section>' +
      '<section class="panel fleet-panel" aria-label="Fleet delta-v"><div class="time-heading">FLEET · REMAINING Δv</div><div data-role="fleet"></div></section>' +
      '<section class="panel controls">' +
      '<button type="button" data-action="end-mining">End mining & recover</button>' +
      '<button type="button" data-action="save">Save</button>' +
      '<button type="button" data-action="load">Load</button>' +
      '<button type="button" data-action="reset">Reset</button>' +
      '<button type="button" data-action="stress">Stress</button>' +
      '<label class="volume-control">SFX<input type="range" min="0" max="100" step="1" data-action="sfx" aria-label="Sound effects volume"><output data-role="sfx-volume"></output></label>' +
      '<label class="volume-control">Music<input type="range" min="0" max="100" step="1" data-action="music" aria-label="Music volume"><output data-role="music-volume"></output></label>' +
      '</section>' +
      '<section class="hint">LMB select/drag-box · RMB asteroid: deploy · RMB home: return · RMB platform: retrieve · wheel zoom · Space/MMB drag pan · F focus · H hostile vignette</section>';

    host.querySelector('[data-action="end-mining"]').addEventListener('click', actions.onEndMining);
    var stressButton = host.querySelector('[data-action="stress"]');
    var fleet = host.querySelector('[data-role="fleet"]');
    fleet.addEventListener('click', function (event) {
      var button = event.target.closest('[data-ship]');
      if (button) actions.onSelectShip(button.dataset.ship);
    });
    var timeButtons = host.querySelectorAll('[data-speed]');
    timeButtons.forEach(function (button) {
      button.addEventListener('click', function () { actions.onTimeScale(Number(button.dataset.speed)); });
    });
    var sfxSlider = host.querySelector('[data-action="sfx"]');
    var musicSlider = host.querySelector('[data-action="music"]');
    host.querySelector('[data-action="save"]').addEventListener('click', actions.onSave);
    host.querySelector('[data-action="load"]').addEventListener('click', actions.onLoad);
    host.querySelector('[data-action="reset"]').addEventListener('click', actions.onReset);
    stressButton.addEventListener('click', actions.onStressToggle);
    sfxSlider.addEventListener('input', function () { actions.onSfxVolume(Number(sfxSlider.value) / 100); });
    musicSlider.addEventListener('input', function () { actions.onMusicVolume(Number(musicSlider.value) / 100); });

    return {
      update: function (world, stats) {
        world.ships.filter(function (s) { return s.type !== 'mothership'; }).forEach(function (ship) {
          var button = Array.from(fleet.children).filter(function (b) { return b.dataset.ship === ship.id; })[0];
          if (!button) {
            button = document.createElement('button'); button.type = 'button'; button.dataset.ship = ship.id;
            fleet.appendChild(button);
          }
          var label = ship.name + ' · ' + Math.floor(sim.remainingDeltaV(world, ship)) + ' m/s' +
            (ship.disabled ? ' · disabled' : ship.docked ? ' · docked' : ship.order.automatic ? ' · returning' : '');
          if (button.textContent !== label) button.textContent = label;
          button.dataset.active = String(world.selectedShipIds.indexOf(ship.id) !== -1);
        });
        Array.from(fleet.children).forEach(function (b) {
          if (!world.ships.some(function (s) { return s.id === b.dataset.ship; })) b.remove();
        });
        var audioStatus = audio ? audio.status() : { sfxVolume: 0, musicVolume: 0, available: false };
        host.querySelector('[data-role="location"]').textContent = world.campaign.location;
        host.querySelector('[data-role="money"]').textContent = '$' + world.campaign.money.toLocaleString();
        host.querySelector('[data-role="quota"]').textContent =
          Math.floor(world.mothership.storage.ore) + ' / ' + world.contract.quotaOre + ' t';
        host.querySelector('[data-role="field"]').textContent = Math.floor(totalOreRemaining(world)) + ' t accessible · ' +
          (sim.asteroidPhysicalStats(world.asteroids[0]).diameterM / 1000).toFixed(1) + ' km body';
        host.querySelector('[data-role="depot"]').textContent =
          world.depot.builtStages + ' / ' + world.depot.totalStages + ' modules · ' + sim.DEPOT_FRAME.lengthM + ' × ' + sim.DEPOT_FRAME.widthM + ' m';
        host.querySelector('[data-role="sections"]').textContent =
          world.mothership.storage.depotSections + ' ready · ' + sim.DEPOT_SECTION.lengthM + ' × ' + sim.DEPOT_SECTION.widthM + ' m · ' + Math.floor(world.mothership.storage.constructionMass) + ' t feedstock';
        host.querySelector('[data-role="mining"]').textContent = world.miningMission + ' · ' +
          world.platforms.filter(function (p) { return p.state === 'deployed'; }).length + ' deployed · ' + world.packets.length + ' packets';
        host.querySelector('[data-action="end-mining"]').disabled = world.miningMission !== 'active';
        host.querySelector('[data-role="contacts"]').textContent = stats.contacts;
        host.querySelector('[data-role="recovery"]').textContent = (world.wrecks || []).length + ' wrecks · ' +
          world.ships.filter(function (ship) { return ship.disabled; }).length + ' disabled';
        host.querySelector('[data-role="salvaged"]').textContent = (world.recovery ? world.recovery.salvagedOre : 0) + ' t';
        host.querySelector('[data-role="clock"]').textContent = formatMissionTime(world.elapsedSeconds * sim.PHYSICAL_SECONDS_PER_SECOND);
        var speed = actions.getTimeScale();
        var speedLabel = speed === 0 ? 'PAUSED' : speed + '× SPEED';
        var speedReadout = host.querySelector('[data-role="time-speed"]');
        if (speedReadout.textContent !== speedLabel) speedReadout.textContent = speedLabel;
        timeButtons.forEach(function (button) {
          var active = Number(button.dataset.speed) === speed;
          button.dataset.active = String(active);
          button.setAttribute('aria-pressed', String(active));
        });
        host.querySelector('[data-role="entities"]').textContent = stats.entityCount + ' @ ' + (stats.fps || '--') + ' FPS';

        if (world.selectedShipIds.length === 0) {
          host.querySelector('[data-role="selection"]').textContent = 'None';
        } else {
          host.querySelector('[data-role="selection"]').textContent = world.ships
            .filter(function (ship) {
              return world.selectedShipIds.indexOf(ship.id) !== -1;
            })
            .map(function (ship) {
              var status = ship.repairRemaining ? 'repair ' + Math.ceil(ship.repairRemaining) + 's' :
                ship.launchElapsed != null ? 'launching' : ship.disabled ? 'disabled' : ship.towTarget ? 'hauling ' + (ship.towTarget.kind === 'wreck' ? 'wreck' : 'fighter') : ship.order.kind === 'recover' ? 'recovering' : ship.order.kind === 'mine' ? (ship.order.phase === 'landed' ? 'landed / mining' : ship.order.phase === 'matching' ? 'matching surface' : 'approaching site') : '';
              if (!status) status = ship.docked ? 'docked / refuelled' : ship.order.kind === 'return' ?
                (ship.order.automatic ? 'fuel reserve / returning' : 'returning') : ship.order.kind === 'deploy' ? 'deploying platform' :
                ship.order.kind === 'retrieve-platform' ? 'retrieving platform' : ship.propulsion && ship.propulsion.fuelKg < 0.001 ? 'fuel empty / coasting' : '';
              var physical = sim.physicalStats(world, ship);
              return ship.name + (status ? ' (' + status + ')' : '') + ' · ' + physical.lengthM + ' m · ' +
                Math.round(physical.massKg / 1000) + ' t · ' + physical.accelerationMps2.toFixed(3) + ' m/s²' + (ship.propulsion ? ' · Δv ' + Math.floor(sim.remainingDeltaV(world, ship)) + ' m/s · fuel ' + (ship.propulsion.fuelKg / 1000).toFixed(1) + ' t' : '') + (ship.platformId ? ' · platform aboard' : '');
            })
            .join(', ');
        }

        stressButton.dataset.active = stats.stressEnabled ? 'true' : 'false';
        stressButton.textContent = stats.stressEnabled ? 'Stress On' : 'Stress';
        sfxSlider.value = Math.round(audioStatus.sfxVolume * 100);
        sfxSlider.disabled = !audioStatus.available;
        host.querySelector('[data-role="sfx-volume"]').textContent = sfxSlider.value + '%';
        musicSlider.value = Math.round(audioStatus.musicVolume * 100);
        musicSlider.disabled = !audioStatus.available;
        host.querySelector('[data-role="music-volume"]').textContent = musicSlider.value + '%';
      }
    };
  }

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
    var shipGraphics = {};
    var asteroidGraphics = {};
    var droneGraphics = {};
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
    var lastMiningSoundAt = -Infinity;
    var previousSelected = {};
    var cameraFocusSelectionIds = null;
    var drones = [];
    var shotCooldown = 0;
    var combatTime = 0;
    var cameraShake = 0;
    var visualTimeScale = 1;
    var laserPaintTimers = {};
    var director = createThreatDirector();
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
      if (event.code === 'KeyH') spawnHostileDrones(getWorld());
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
      world.platforms.forEach(function (p) {
        if (p.state !== 'deployed') return;
        var size = 12 * semanticScale('cargo', world.camera.zoom);
        logisticsGraphic.lineStyle(1 / world.camera.zoom, 0xffda81, 1);
        logisticsGraphic.beginFill(0x77552a, 1);
        logisticsGraphic.drawRect(p.position.x - size, p.position.y - size, size * 2, size * 2);
        logisticsGraphic.endFill();
        logisticsGraphic.moveTo(p.position.x - size * 1.5, p.position.y);
        logisticsGraphic.lineTo(p.position.x + size * 1.5, p.position.y);
        logisticsGraphic.moveTo(p.position.x, p.position.y - size * 1.5);
        logisticsGraphic.lineTo(p.position.x, p.position.y + size * 1.5);
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
        paintShip(graphic, ship, selected, world.elapsedSeconds);
        graphic.visible = !ship.towedBy && !ship.repairRemaining;
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

      drones.forEach(function (drone) {
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

      if (dt > 0) {
        updateThreatDirector(world, visualDt);
        updateCombatVignette(world, visualDt);
      }
      world = getWorld();
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
      world.ships.forEach(function (ship) {
        if (ship.type === 'cargo' && ship.order.kind === 'mine' && ship.cargo > (ship.previousCargo || 0)) {
          var asteroid = findAsteroidById(world, ship.order.asteroidId);
          if (asteroid) {
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
        removed.graphic.destroy();
      }
    }

    function findAsteroidById(world, asteroidId) {
      return world.asteroids.filter(function (asteroid) {
        return asteroid.id === asteroidId;
      })[0];
    }

    function spawnHostileDrones(world) {
      spawnHostileWave(world, 'debug');
    }

    function spawnHostileWave(world, reason) {
      drones = [];
      Object.keys(droneGraphics).forEach(function (id) {
        droneGraphics[id].destroy();
      });
      droneGraphics = {};
      var targets = industrialTargets(world);
      var center = targets[0] ? targets[0].position : (selectedCenter(world) || { x: world.camera.x, y: world.camera.y });
      var count = reason === 'director' && director.wavesSpawned >= 2 ? 4 : 3;
      for (var i = 0; i < count; i += 1) {
        var target = targets[i % targets.length] || { id: 'mothership', kind: 'ship' };
        drones.push({
          id: 'drone-' + Math.floor(world.elapsedSeconds * 1000) + '-' + i,
          targetId: target.id,
          targetKind: target.kind,
          position: { x: center.x + 430 + i * 62, y: center.y - 180 + i * 120 },
          velocity: { x: 0, y: 0 },
          speed: 58 + i * 8,
          hp: 3,
          flash: 0,
          underFire: 0,
          fireCooldown: 0.6 + i * 0.12
        });
      }
      shotCooldown = 0.2;
      combatTime = 0;
      pushFloatText(effects, { x: center.x, y: center.y - 86 }, 'HOSTILE CONTACT');
      if (audio) audio.playWarning();
    }

    function createThreatDirector() {
      return {
        state: 'idle',
        timer: 0,
        cooldown: 10,
        wavesSpawned: 0
      };
    }

    function updateThreatDirector(world, dt) {
      if (director.wavesSpawned >= DIRECTOR_MAX_WAVES) return;
      if (drones.length) return;
      if (world.depot && world.depot.builtStages >= world.depot.totalStages) return;

      if (director.state === 'warning') {
        director.timer -= dt;
        if (director.timer <= 0) {
          director.state = 'cooldown';
          director.cooldown = DIRECTOR_COOLDOWN_SECONDS;
          director.wavesSpawned += 1;
          spawnHostileWave(world, 'director');
        }
        return;
      }

      if (director.state === 'cooldown') {
        director.cooldown -= dt;
        if (director.cooldown > 0) return;
        director.state = 'idle';
      }

      if (operationExposure(world) >= 1) {
        director.state = 'warning';
        director.timer = DIRECTOR_WARNING_SECONDS;
        pushFloatText(effects, incomingWarningPosition(world), 'CONTACT INBOUND');
        if (audio) audio.playWarning();
      }
    }

    function incomingWarningPosition(world) {
      var targets = industrialTargets(world);
      return targets[0] ? { x: targets[0].position.x, y: targets[0].position.y - 96 } : { x: world.camera.x, y: world.camera.y - 96 };
    }

    function industrialTargets(world) {
      var targets = [];
      world.ships.forEach(function (ship) {
        if (ship.type === 'cargo' && ship.cargo > 0) {
          targets.push({ id: ship.id, kind: 'ship', position: ship.position });
        }
        if (ship.type === 'tug' && (ship.carryingSection || ship.order.kind === 'build')) {
          targets.push({ id: ship.id, kind: 'ship', position: ship.position });
        }
      });
      if (world.depot && world.depot.builtStages < world.depot.totalStages) {
        targets.push({ id: 'depot', kind: 'depot', position: world.depot.position });
      }
      var mothership = findShipByType(world, 'mothership');
      if (mothership) {
        targets.push({ id: mothership.id, kind: 'ship', position: mothership.position });
      }
      return targets;
    }

    function droneTargetPosition(world, drone) {
      if (drone.targetKind === 'depot' && world.depot) return world.depot.position;
      var ship = findShipById(world, drone.targetId);
      if (ship) return ship.position;
      var mothership = findShipByType(world, 'mothership');
      return mothership ? mothership.position : { x: 0, y: 0 };
    }

    function updateCombatVignette(world, dt) {
      if (!drones.length) return;
      combatTime += dt;
      shotCooldown -= dt;

      drones.forEach(function (drone) {
        var fighter = getWorld().ships.filter(function (ship) {
          return ship.type === 'escort' && !ship.disabled &&
            Math.hypot(ship.position.x - drone.position.x, ship.position.y - drone.position.y) <= 300;
        }).sort(function (a, b) {
          return Math.hypot(a.position.x - drone.position.x, a.position.y - drone.position.y) -
            Math.hypot(b.position.x - drone.position.x, b.position.y - drone.position.y);
        })[0];
        var target = fighter ? fighter.position : droneTargetPosition(world, drone);
        var dx = target.x - drone.position.x;
        var dy = target.y - drone.position.y;
        var distance = Math.max(1, Math.hypot(dx, dy));
        drone.velocity = { x: (dx / distance) * drone.speed, y: (dy / distance) * drone.speed };
        if (distance > 20) {
          drone.position.x += drone.velocity.x * dt;
          drone.position.y += drone.velocity.y * dt;
        }
        drone.flash = Math.max(0, drone.flash - dt * 5);
        drone.underFire = Math.max(0, (drone.underFire || 0) - dt * 0.35);
        drone.fireCooldown = Math.max(0, (drone.fireCooldown || 0) - dt);
        if (fighter && distance <= sim.RAIDER_RANGE && drone.fireCooldown === 0) {
          drone.fireCooldown = 0.75;
          pushProjectile(effects, drone.position, fighter.position);
          pushImpactSparks(effects, fighter.position, fighter.velocity);
          if (audio) audio.playImpact(0.4);
          setWorld(sim.damageFighter(getWorld(), fighter.id, 0.4));
          if (getWorld().ships.some(function (ship) { return ship.id === fighter.id && ship.disabled; })) {
            pushFloatText(effects, fighter.position, 'DISABLED');
          }
        }
      });

      getWorld().ships.filter(function (ship) {
        return ship.type === 'escort' && !ship.disabled;
      }).forEach(function (escort) {
        var attack = stepDefenderWeapon(escort, drones, laserPaintTimers, dt);
        if (attack) {
          holdDefensiveLaser(escort, attack.target, dt, attack.paint);
        }
      });
    }

    function holdDefensiveLaser(escort, drone, dt, paint) {
      drone.underFire = (drone.underFire || 0) + dt;
      drone.flash = 1;
      if (paint) {
        pushProjectile(effects, escort.position, drone.position);
        pushImpactSparks(effects, drone.position, drone.velocity);
        if (audio) audio.playImpact(drone.underFire);
      }
      if (drone.underFire >= DEFENDER_DWELL_SECONDS) {
        if (audio) audio.playGunshot();
        destroyDrone(drone);
      }
    }

    function fireEscortShot(escort, drone) {
      drone.hp -= 1;
      drone.flash = 1;
      if (audio) {
        audio.playGunshot();
        audio.playImpact(3 - drone.hp);
      }
      pushProjectile(effects, escort.position, drone.position);
      pushMuzzleFlash(effects, escort.position, escort.rotation);
      pushImpactSparks(effects, drone.position, drone.velocity);
      if (drone.hp <= 0) {
        destroyDrone(drone);
      }
    }

    function destroyDrone(drone) {
      var wasFinal = drones.length === 1;
      pushExplosion(effects, drone.position, drone.velocity, wasFinal);
      cameraShake = wasFinal ? 1.8 : 0;
      if (wasFinal) {
        visualTimeScale = 0.25;
        pushFloatText(effects, { x: drone.position.x, y: drone.position.y - 36 }, 'DRONE KILL');
      }
      if (droneGraphics[drone.id]) {
        droneGraphics[drone.id].destroy();
        delete droneGraphics[drone.id];
      }
      drones = drones.filter(function (candidate) {
        return candidate.id !== drone.id;
      });
      setWorld(sim.addWreck(getWorld(), drone));
    }

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
      pushFocusPulse(effects, focus, selected.length > 1 ? 58 : 34);
      pushFloatText(effects, { x: focus.x, y: focus.y - 48 }, focusLabel(selected));
    }

    function focusLabel(selected) {
      if (selected.length === 1) return 'FOCUS ' + selected[0].name.toUpperCase();
      return 'FOCUS ' + selected.length + ' SHIPS';
    }

    function nearestDrone(position) {
      var best = null;
      var bestDistance = Infinity;
      drones.forEach(function (drone) {
        var d = Math.hypot(drone.position.x - position.x, drone.position.y - position.y);
        if (d < bestDistance) {
          best = drone;
          bestDistance = d;
        }
      });
      return best;
    }

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

    function selectedShips(world) {
      return world.ships.filter(function (ship) {
        return world.selectedShipIds.indexOf(ship.id) !== -1;
      });
    }

    function findShipByType(world, type) {
      return world.ships.filter(function (ship) {
        return ship.type === type;
      })[0];
    }

    function findShipById(world, shipId) {
      return world.ships.filter(function (ship) {
        return ship.id === shipId;
      })[0];
    }

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

    function onPointerUp(event) {
      var point = { x: event.global.x, y: event.global.y };
      var selecting = dragMode === 'select';
      // Clear input state before committing a selection, which invokes rendering.
      cancelDrag();
      if (selecting) {
        var distance = Math.hypot(point.x - dragStart.x, point.y - dragStart.y);
        if (distance > 8) {
          var selectedIds = shipsInsideScreenRect(getWorld(), dragStart, point, viewport());
          setWorld(sim.selectShips(getWorld(), selectedIds));
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
      var baseCount = world.ships.length + world.asteroids.length + drones.length + (world.wrecks || []).length;
      var count = stressEnabled && stressLayer ? stressLayer.count + baseCount : baseCount;
      return {
        fps: fps,
        stressEnabled: stressEnabled,
        entityCount: count,
        contacts: contactStatus()
      };
    }

    function contactStatus() {
      if (drones.length) return drones.length + ' active';
      if (director.state === 'warning') return 'inbound ' + Math.max(0, Math.ceil(director.timer)) + 's';
      if (director.wavesSpawned >= DIRECTOR_MAX_WAVES) return 'quiet';
      if (director.state === 'cooldown') return 'quiet ' + Math.max(0, Math.ceil(director.cooldown)) + 's';
      return 'quiet';
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
      return viewportFromApp(app);
    }

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

    function focusSelectionStillActive(world, shipIds) {
      return shipIds.every(function (shipId) {
        return world.selectedShipIds.indexOf(shipId) !== -1;
      });
    }

    function unlockAudio() {
      if (audio) audio.unlock();
    }

    function updateAudioTelemetry(world) {
      if (!audio) return;
      var level = selectedThrustLevel(world);
      audio.setEngineThrust(level);
    }

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
        drones = [];
        Object.keys(droneGraphics).forEach(function (id) { droneGraphics[id].destroy(); });
        droneGraphics = {};
        laserPaintTimers = {};
        director = createThreatDirector();
        previousRecovery = null;
      },
      sync: sync,
      getThreats: function () { return drones; },
      render: render,
      applyCameraFocus: applyCameraFocus,
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

  function issueVisualContextOrder(world, target) {
    var zoom = world.camera.zoom;
    function hits(entity, type, radius) {
      return Math.hypot(target.x - entity.position.x, target.y - entity.position.y) <=
        Math.max(12 / zoom, radius * semanticScale(type, zoom));
    }
    var homeHit = world.ships.filter(function (s) { return s.type === 'mothership' && hits(s, s.type, 38); })[0];
    if (homeHit) return sim.issueReturnOrder(world);
    var platformHit = (world.platforms || []).filter(function (p) { return p.state === 'deployed' && hits(p, 'cargo', 22); })[0];
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
      var recoverables = (world.wrecks || []).map(function (wreck) {
        return { entity: wreck, kind: 'wreck' };
      }).concat(world.ships.filter(function (ship) {
        return ship.disabled && !ship.repairRemaining && ship.launchElapsed == null;
      }).map(function (ship) { return { entity: ship, kind: 'ship' }; }));
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

  function viewportFromApp(app) {
    return {
      width: app.screen.width,
      height: app.screen.height
    };
  }

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

  function focusCameraToward(world, target, dt) {
    var t = Math.min(1, dt * 4.5);
    return withCamera(world, {
      x: world.camera.x + (target.x - world.camera.x) * t,
      y: world.camera.y + (target.y - world.camera.y) * t,
      zoom: world.camera.zoom + (target.zoom - world.camera.zoom) * t
    });
  }

  function stepDefenderWeapon(escort, drones, timers, dt) {
    if (escort.disabled) return null;
    timers[escort.id] = Math.max(0, (timers[escort.id] || 0) - dt);
    var target = null;
    var bestDistance = Infinity;
    drones.forEach(function (drone) {
      var distance = Math.hypot(drone.position.x - escort.position.x, drone.position.y - escort.position.y);
      var anchor = escort.order && escort.order.kind === 'defend' ? escort.order.anchor : escort.position;
      var priority = Math.hypot(drone.position.x - anchor.x, drone.position.y - anchor.y);
      if (escort.order && escort.order.kind === 'defend') {
        priority = priority * 0.25 + distance * 0.75 - (drone.underFire || 0) * 100;
        if (distance < sim.RAIDER_RANGE + 20) priority -= 80;
      }
      if (distance <= DEFENDER_RANGE && priority < bestDistance) {
        target = drone;
        bestDistance = priority;
      }
    });
    if (!target) return null;
    var paint = timers[escort.id] === 0;
    if (paint) timers[escort.id] = 0.08;
    return { target: target, paint: paint };
  }

  function operationExposure(world) {
    var exposure = (world.platforms || []).filter(function (p) { return p.state === 'deployed'; }).length;
    if (world.mothership.storage.constructionMass > 0 || world.mothership.storage.depotSections > 0) exposure += 1;
    if (world.depot && world.depot.builtStages > 0) exposure += 1;
    world.ships.forEach(function (ship) {
      if (ship.type === 'cargo' && (ship.cargo > 20 || ship.order.kind === 'deploy' || ship.order.kind === 'return')) exposure += 1;
      if (ship.type === 'tug' && (ship.carryingSection || ship.order.kind === 'build')) exposure += 1;
    });
    return exposure;
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
    var zoom = Math.max(0.35, Math.min(MAX_ZOOM, camera.zoom * (wheelDelta > 0 ? 0.9 : 1.1)));
    var after = screenToWorld(screenPoint, { x: camera.x, y: camera.y, zoom: zoom }, viewport);
    return {
      x: camera.x + before.x - after.x,
      y: camera.y + before.y - after.y,
      zoom: zoom
    };
  }

  function withCamera(world, camera) {
    return Object.assign({}, world, { camera: camera });
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

  function paintDefenderCoverage(graphics, world) {
    graphics.clear();
    var anchors = {};
    world.ships.forEach(function (ship) {
      if (ship.type !== 'escort' || ship.disabled || world.selectedShipIds.indexOf(ship.id) === -1) return;
      graphics.lineStyle(1.25 / world.camera.zoom, 0xf0b7b9, 0.32);
      graphics.beginFill(0xb76c6f, 0.035);
      graphics.drawCircle(ship.position.x, ship.position.y, DEFENDER_RANGE);
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

  function paintRecovery(graphics, world) {
    graphics.clear();
    (world.wrecks || []).forEach(function (wreck) {
      if (wreck.towedBy) return;
      var cos = Math.cos(wreck.rotation);
      var sin = Math.sin(wreck.rotation);
      var scale = semanticScale('escort', world.camera.zoom);
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

  function paintShip(graphics, ship, selected, elapsedSeconds) {
    var style = SHIP_STYLES[ship.type];
    graphics.clear();
    graphics.alpha = ship.disabled && ship.launchElapsed == null ? 0.45 : 1;
    drawEnginePlume(graphics, ship, style.radius, elapsedSeconds);
    drawMiningPlume(graphics, ship, style.radius, elapsedSeconds);
    if (ship.type === 'mothership') {
      paintMothership(graphics, selected, elapsedSeconds);
      drawShipOrderAndBadges(graphics, ship, style);
      return;
    }

    if (ship.type === 'tug' && ship.carryingSection) {
      paintConstructorCargo(graphics, style);
    }
    if (ship.type === 'tug' && ship.towTarget) {
      graphics.lineStyle(1.5, 0xe0aeb2, 0.95);
      graphics.beginFill(0xa86470, 0.95);
      graphics.drawPolygon(ship.towTarget.kind === 'wreck' ? [13, 0, -8, -8, -3, -1, -6, 3, -8, 8] :
        [24, 0, -15, -13, -9, 0, -15, 13]);
      graphics.endFill();
      graphics.lineStyle(2, style.stroke, 0.7);
      [-0.58, 0.58].forEach(function (x) {
        [-1, 1].forEach(function (side) {
          graphics.moveTo(x * style.radius, side * 0.4 * style.radius);
          graphics.lineTo(x * style.radius, side * 0.84 * style.radius);
        });
      });
    }
    graphics.lineStyle(selected ? 3 : 1.5, selected ? 0xffffff : style.stroke, selected ? 1 : 0.9);
    if (ship.type === 'cargo') {
      paintMiner(graphics, style);
    } else if (ship.type === 'tug') {
      paintConstructor(graphics, style);
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

  function paintMiner(graphics, style) {
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

    if (ship.type === 'cargo' && (ship.cargo > 0 || ship.platformId)) {
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

  function mothershipHullHalfWidthAtY(y) {
    var absY = Math.abs(y);
    if (absY <= 12) return 36;
    var cornerInset = absY - 12;
    return 31 + Math.sqrt(Math.max(0, 25 - cornerInset * cornerInset));
  }

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

  function drawEnginePlume(graphics, ship, radius, elapsedSeconds) {
    if (ship.disabled || !ship.previousVelocity || ship.speed <= 0 || ship.order.phase === 'landed') {
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
    var response = graphics.engineResponse;
    if (!response || time < response.time) response = { time: time, levels: {} };
    var dt = Math.max(0, Math.min(0.1, time - response.time));
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

  function enginePlumeGeometry(worldAccelX, worldAccelY, rotation, acceleration, radius, loadedReturn, shipType) {
    var accel = Math.hypot(worldAccelX, worldAccelY);
    if (accel < 0.18) return [];

    var local = worldDeltaToShipLocal(worldAccelX, worldAccelY, rotation);
    var plumes = [];
    addThrusterPlume(plumes, 'main-aft', Math.max(0, local.x), acceleration, radius, { x: -0.82, y: 0 }, { x: -1, y: 0 }, loadedReturn);
    addThrusterPlume(plumes, 'brake-port', Math.max(0, -local.x), acceleration, radius, { x: 0.72, y: -0.42 }, { x: 1, y: 0 }, loadedReturn);
    addThrusterPlume(plumes, 'brake-starboard', Math.max(0, -local.x), acceleration, radius, { x: 0.72, y: 0.42 }, { x: 1, y: 0 }, loadedReturn);
    addThrusterPlume(plumes, 'port-translate', Math.max(0, local.y), acceleration, radius, { x: -0.2, y: -0.82 }, { x: 0, y: -1 }, loadedReturn);
    addThrusterPlume(plumes, 'starboard-translate', Math.max(0, -local.y), acceleration, radius, { x: -0.2, y: 0.82 }, { x: 0, y: 1 }, loadedReturn);
    if (shipType === 'cargo' || shipType === 'tug') {
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

  function drawWorldOrderLine(graphics, ship) {
    var local = worldVectorToShipLocalLine(ship.position, ship.order.target, ship.rotation);
    graphics.moveTo(0, 0);
    graphics.lineTo(local.x / graphics.scale.x, local.y / graphics.scale.y);
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

  // Same schematic metres-to-artwork ratio as a carried module, at every zoom.
  function cargoModuleGeometry() {
    return { length: sim.DEPOT_SECTION.lengthM * 0.45, width: sim.DEPOT_SECTION.widthM * 0.45 };
  }

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

  function paintAsteroid(graphics, asteroid) {
    var radius = asteroid.radius;
    graphics.clear();
    graphics.position.set(asteroid.position.x, asteroid.position.y);
    graphics.rotation = asteroid.rotation;
    graphics.lineStyle(1, ASTEROID_STROKE, 0.82);
    graphics.beginFill(ASTEROID_FILL, 0.92);
    for (var i = 0; i <= 120; i += 1) {
      var angle = i / 120 * Math.PI * 2;
      var r = sim.surfaceRadius(asteroid, angle);
      if (i === 0) graphics.moveTo(r, 0);
      else graphics.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    graphics.closePath();
    graphics.endFill();
    graphics.lineStyle(1, 0x393632, 0.65);
    for (var j = 0; j < 18; j += 1) {
      var a = j * 2.39996;
      var d = radius * (0.2 + 0.52 * ((j * 7 % 17) / 17));
      graphics.drawEllipse(Math.cos(a) * d, Math.sin(a) * d, radius * (0.025 + (j % 4) * 0.012), radius * 0.025);
    }
  }

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

  function pushSelectionPulse(effects, position, radius, type) {
    var pulse = new PIXI.Graphics();
    pulse.lineStyle(2, 0xffffff, 0.9);
    pulse.drawCircle(0, 0, radius);
    pulse.position.set(position.x, position.y);
    effects.push({ graphic: pulse, age: 0, life: 0.34, vx: 0, vy: 0, scale: 0.75, alpha: 0.9, grow: 1.5, semanticType: type });
  }

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

  function pushProjectile(effects, from, to) {
    var streak = new PIXI.Graphics();
    streak.lineStyle(2, 0xdaf7ff, 0.95);
    streak.moveTo(from.x, from.y);
    streak.lineTo(to.x, to.y);
    effects.push({ graphic: streak, age: 0, life: 0.09, vx: 0, vy: 0, scale: 1, alpha: 1, screenSpace: false });
  }

  function pushMuzzleFlash(effects, position, rotation) {
    var flash = new PIXI.Graphics();
    flash.beginFill(0xf7f0c8, 0.95);
    flash.drawCircle(0, 0, 4);
    flash.endFill();
    flash.position.set(position.x + Math.cos(rotation) * 15, position.y + Math.sin(rotation) * 15);
    effects.push({ graphic: flash, age: 0, life: 0.08, vx: 0, vy: 0, scale: 1, alpha: 1, grow: 1.2 });
  }

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

  // Like engine exhaust, dust is drawn in hull-local coordinates so position,
  // rotation, interpolation and semantic zoom all follow the ship exactly.
  function drawMiningPlume(graphics, ship, radius, elapsedSeconds) {
    if (ship.disabled || ship.order.kind !== 'mine' || ship.order.phase !== 'landed') return;
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

  function formatMissionTime(seconds) {
    var wholeSeconds = Math.floor(Math.max(0, seconds));
    return String(Math.floor(wholeSeconds / 3600)).padStart(2, '0') + 'h ' +
      String(Math.floor(wholeSeconds / 60) % 60).padStart(2, '0') + 'm ' +
      String(wholeSeconds % 60).padStart(2, '0') + 's';
  }

  function totalOreRemaining(world) {
    return world.asteroids.reduce(function (total, asteroid) {
      return total + asteroid.ore;
    }, 0);
  }

  Driftworks.game = {
    boot: boot,
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
    operationExposure: operationExposure,
    stepDefenderWeapon: stepDefenderWeapon,
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
