(function (global) {
  'use strict';
    var assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);

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
  /** @typedef {{ container: PIXI.Container, mesh: PIXI.Mesh, shader: PIXI.Shader, craterBytes: Uint8Array, craterTexture: PIXI.Texture, visual: import('./types').AsteroidVisual | null, artworkKey: string, cavityParallax?: Vec2 }} AsteroidGraphic */
  /** @typedef {{ container: PIXI.Container, base: PIXI.Graphics, lighting: PIXI.Graphics, visual: import('./types').LegacyAsteroidVisual | null, artworkKey: string, lightBucket: number }} LegacyAsteroidGraphic */
  /** @type {DriftworksNamespace} */
  var Driftworks = (global.Driftworks = global.Driftworks || {});
  var sim = /** @type {SimApi} */ (Driftworks.sim);
  var audio = /** @type {AudioApi} */ (Driftworks.audio);
  var cameraTools = /** @type {import('./types').CameraApi} */ (Driftworks.camera);
  if (!cameraTools) {
    throw new Error('Tactical camera module did not load.');
  }
  var PIXI = global.PIXI;
  /** @typedef {{x: number, y: number, z: number}} AsteroidNormal */
  var asteroidArt = Driftworks.asteroidArt;
  if (!asteroidArt) throw new Error('Shared asteroid artwork module did not load.');
  // Compatibility aliases for existing viewers and the Pixi painting helpers.
  var asteroidVisualDescription = asteroidArt.describe;
  var legacyAsteroidVisualDescription = asteroidArt.legacyDescribe;
  var asteroidSurfaceSample = asteroidArt.surfaceSample;
  var asteroidShaderUniforms = asteroidArt.uniforms;
  var asteroidCraterBytes = asteroidArt.craterBytes;
  var asteroidReliefAt = asteroidArt.reliefAt;
  var asteroidColor = asteroidArt.color;
  var asteroidCompositionColor = asteroidArt.compositionColor;
  var ASTEROID_CRATER_TEXTURE_WIDTH = asteroidArt.craterTextureWidth;
  var WORLD_LIGHT = asteroidArt.light;
  var sessions = /** @type {import('./types').SessionApi} */ (Driftworks.session);
  var STEP_SECONDS = 1 / 30;
  var MAX_FRAME_SECONDS = 0.2;
  var DETAIL_ZOOM_START = 32;
  var LOCAL_OPERATING_AREA_RADIUS = 700;
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
  var ASTEROID_LIGHT_STEP = Math.PI / 60; // retained only by the dormant legacy painter
  var MAX_EFFECTS = 260;
  var BACKGROUND_SETTINGS_KEY = 'driftworks-background-settings-v1';
  var BACKGROUNDS = [
    { id: 'black', label: 'Pure black', url: '', credit: '', contrast: 1 },
    { id: 'all-sky-milky-way', label: 'Milky Way · all sky', url: './assets/backgrounds/all-sky-milky-way.jpg', credit: 'ESO/S. Brunier', contrast: 1 },
    { id: 'all-sky-low-exposure', label: 'Stars · low exposure', url: './assets/backgrounds/all-sky-milky-way.jpg', credit: 'ESO/S. Brunier', contrast: 1.65 },
    { id: 'all-sky-stars-only', label: 'Stars · very low exposure', url: './assets/backgrounds/all-sky-milky-way.jpg', credit: 'ESO/S. Brunier', contrast: 2.15 },
    { id: 'coalsack', label: 'Medium · Coalsack', url: './assets/backgrounds/coalsack-wide-field.jpg', credit: 'ESO/Digitized Sky Survey 2. Acknowledgment: Davide De Martin', contrast: 1 },
    { id: 'deep-field', label: 'Sparse · FORS deep field', url: './assets/backgrounds/deep-field.jpg', credit: 'ESO', contrast: 1 }
  ];

  /** @param {unknown} value @returns {{ image: string, brightness: number }} */
  function normalizeBackgroundSettings(value) {
    var candidate = value && typeof value === 'object' ? /** @type {{ image?: unknown, brightness?: unknown }} */ (value) : {};
    var image = typeof candidate.image === 'string' && BACKGROUNDS.some(function (option) { return option.id === candidate.image; }) ? candidate.image : 'all-sky-milky-way';
    var brightness = typeof candidate.brightness === 'number' && isFinite(candidate.brightness) ? candidate.brightness : 0.28;
    return { image: image, brightness: Math.max(0, Math.min(1, brightness)) };
  }

  /** @param {Storage=} storage */
  function loadBackgroundSettings(storage) {
    try {
      var text = (storage || global.localStorage).getItem(BACKGROUND_SETTINGS_KEY);
      return normalizeBackgroundSettings(text ? JSON.parse(text) : null);
    } catch (error) {
      return normalizeBackgroundSettings(null);
    }
  }

  /** @param {{ image: string, brightness: number }} settings @param {Storage=} storage */
  function saveBackgroundSettings(settings, storage) {
    try {
      (storage || global.localStorage).setItem(BACKGROUND_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      // Visual preferences are optional when storage is unavailable.
    }
  }

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
    if (!PIXI && (!Driftworks.scene3d || new URLSearchParams(global.location.search).get('renderer') !== '3d')) {
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
    var backgroundSettings = loadBackgroundSettings();

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
        setWorld(sim.issueSalvageAllOrder(world, world.selectedShipIds));
        scene.sync(world);
        hud.update(world, scene.getStats());
      },
      onReturnHome: function () {
        setWorld(sim.issueReturnOrder(world, world.selectedShipIds));
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
        if (asteroid) setWorld(sim.issueMineOrder(world, asteroid.id, world.selectedShipIds));
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
      onToggleExcavation: function () {
        var asteroid = world.asteroids[0];
        if (!asteroid) return;
        setWorld(sim.toggleAsteroidExcavation(world, asteroid.id));
        world = withCamera(world, { x: asteroid.position.x, y: asteroid.position.y,
          zoom: Math.min(world.camera.zoom, 0.8) });
        scene.sync(world);
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
      },
      getBackgroundOptions: function () { return BACKGROUNDS.slice(); },
      getBackgroundSettings: function () { return Object.assign({}, backgroundSettings); },
      onBackgroundImage: function (image) {
        backgroundSettings = normalizeBackgroundSettings({ image: image, brightness: backgroundSettings.brightness });
        saveBackgroundSettings(backgroundSettings);
        scene.setBackground(backgroundSettings);
        hud.update(world, scene.getStats());
      },
      onBackgroundBrightness: function (brightness) {
        backgroundSettings = normalizeBackgroundSettings({ image: backgroundSettings.image, brightness: brightness });
        saveBackgroundSettings(backgroundSettings);
        scene.setBackground(backgroundSettings);
        hud.update(world, scene.getStats());
      }
    }));

    scene.setBackground(backgroundSettings);
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
    if (Driftworks.scene3d && new URLSearchParams(global.location.search).get('renderer') === '3d') {
      return Driftworks.scene3d.create(host, getWorld, setWorld);
    }
    var app = new PIXI.Application({
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(global.devicePixelRatio || 1, 2),
      resizeTo: host
    });
    var background = document.createElement('div');
    background.className = 'night-sky-background';
    var worldLayer = new PIXI.Container();
    var effectsLayer = new PIXI.Container();
    var grid = new PIXI.Graphics();
    var depotGraphic = new PIXI.Graphics();
    var coverageGraphic = new PIXI.Graphics();
    var recoveryGraphic = new PIXI.Graphics();
    var logisticsGraphic = new PIXI.Graphics();
    var launchLayer = new PIXI.Container();
    var selectionBox = new PIXI.Graphics();
    var contactOverlay = new PIXI.Container();
    var contactMarker = new PIXI.Graphics();
    var contactLabel = new PIXI.Text('', {
      fontFamily: 'Consolas, monospace', fontSize: 12, fill: 0xf0c778,
      stroke: 0x080c10, strokeThickness: 4
    });
    /** @type {Record<string, PIXI.Graphics | PIXI.Container>} */
    var shipGraphics = {};
    /** @type {Record<string, PIXI.Graphics>} */
    var platformGraphics = {};
    /** @type {Record<string, { key: string, normal: AsteroidNormal }>} */
    var platformNormals = {};
    /** @type {Record<string,{surface:import('./types').PlatformSurface;key:string}>} */
    var platformContactPaint={};
    /** @type {Record<string, AsteroidGraphic>} */
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

    host.appendChild(background);
    host.appendChild(app.view);
    host.addEventListener('contextmenu', function (event) {
      event.preventDefault();
    });
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
    contactOverlay.eventMode = 'none';
    contactOverlay.addChild(contactMarker);
    contactOverlay.addChild(contactLabel);
    app.stage.addChild(contactOverlay);
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
        var surface=asteroid && Driftworks.scene3d?Driftworks.scene3d.platformSurface(p,asteroid,true):null;
        var fitted=surface && surface.fit.valid?surface:null;
        if(!fitted)graphic.clear();graphic.visible = true;
        var landing = p.state === 'setting-up' && p.landingElapsedSeconds !== undefined && Driftworks.miningLanding ? Driftworks.miningLanding.sample(p.landingElapsedSeconds) : null;
        var landingHeading=landing?landing.headingOffset-((asteroid?asteroid.rotation:0)-(p.landingReleaseRotation || 0))*(1-landing.match):0;
        var heading = landingHeading + p.siteAngle + (asteroid ? asteroid.rotation : 0) + Math.PI;
        var artworkScale = fitted?fitted.scale:semanticScale('platform', world.camera.zoom);
        if(fitted)heading=p.siteAngle+(asteroid?asteroid.rotation:0);
        var normal = { x: 0, y: 0, z: 1 };
        if (asteroid) {
          var rock = asteroidGraphics[asteroid.id];
          if (!rock) {
            rock = asteroidGraphics[asteroid.id] = createAsteroidGraphic();
            worldLayer.addChildAt(rock.container, 1);
          }
          if (!rock.visual) paintAsteroid(rock, asteroid, world.camera.zoom, world.camera, viewport().height);
          var normalKey = asteroid.id + ':' + asteroid.radius + ':' + p.siteAngle + ':' + p.siteDepth;
          var cached = platformNormals[p.id];
          if (!cached || cached.key !== normalKey) {
            var localSite = worldDeltaToShipLocal(p.position.x - asteroid.position.x,
              p.position.y - asteroid.position.y, asteroid.rotation);
            normal = rock.visual ? platformSurfaceNormal(rock.visual, localSite.x / asteroid.radius,
              localSite.y / asteroid.radius) : normal;
            cached = platformNormals[p.id] = { key: normalKey, normal: normal };
          }
          var rc = Math.cos(asteroid.rotation), rs = Math.sin(asteroid.rotation);
          normal = { x: cached.normal.x * rc - cached.normal.y * rs,
            y: cached.normal.x * rs + cached.normal.y * rc, z: cached.normal.z };
        }
        var localNormalXY = worldDeltaToShipLocal(normal.x, normal.y, heading);
        var localNormal = { x: localNormalXY.x, y: localNormalXY.y, z: normal.z };
        graphic.transform.setFromMatrix(new PIXI.Matrix(Math.cos(heading) * artworkScale,
          Math.sin(heading) * artworkScale, -Math.sin(heading) * artworkScale,
          Math.cos(heading) * artworkScale, p.position.x, p.position.y - (landing ? landing.altitude / sim.METERS_PER_UNIT : 0)));
        graphic.hitArea = new PIXI.Circle(0, 0, Math.max(28, 12 / (world.camera.zoom * artworkScale)));
        var working = platformIsWorking(p, world, asteroid);
        if(fitted){
          var rampOpen=landing?landing.ramps:p.state==='deployed'?1:p.state==='packing-up'?platformDeployment(p):0;
          var key=platformDeployment(p)+':'+rampOpen+':'+landingHeading+':'+Math.floor(heading*20)+':'+(world.selectedPlatformId===p.id)+':'+world.camera.zoom;
          var painted=platformContactPaint[p.id];
          if(!painted || painted.surface!==fitted || painted.key!==key){
            graphic.clear();paintTerrainPlatform(graphic,fitted,platformDeployment(p),rampOpen,landingHeading,heading);
            if(world.camera.zoom*artworkScale*32<8){graphic.beginFill(0xd4a34a,1);graphic.drawCircle(0,0,3/(world.camera.zoom*artworkScale));graphic.endFill();}
            if((!landing || landing.contact) && (p.state==='setting-up' || p.state==='packing-up'))drawPlatformWorkers(graphic,(p.workerIds || []).slice(0,5),world.elapsedSeconds,p.state==='packing-up',localNormal);
            if(world.selectedPlatformId===p.id)drawCraftBrackets(graphic,28,28,world.camera.zoom*artworkScale);
            platformContactPaint[p.id]={surface:fitted,key:key};
          }
        }else paintRaisedPlatform(graphic, platformDeployment(p), working, world.elapsedSeconds,
          world.camera.zoom, heading, localNormal);
        if (!fitted && world.selectedPlatformId === p.id) drawCraftBrackets(graphic, 28, 28, world.camera.zoom * artworkScale);
        if (!fitted && (!landing || landing.contact) && (p.state === 'setting-up' || p.state === 'packing-up')) {
          drawPlatformWorkers(graphic, (p.workerIds || []).slice(0, 5), world.elapsedSeconds, p.state === 'packing-up', localNormal);
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
          graphic = createShipGraphic(ship.id, ship.type);
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
          semanticScale('escort', world.camera.zoom) / semanticScale(ship.type, world.camera.zoom), world.camera.zoom);
        graphic.visible = !ship.docked && !ship.towedBy && !ship.repairRemaining;
        graphic.eventMode = ship.docked || ship.towedBy || ship.repairRemaining ? 'none' : 'static';
        var parent = ship.launchElapsed != null ? launchLayer : worldLayer;
        if (graphic.parent !== parent) parent.addChild(graphic);
      });
      previousSelected = selectedNow;

      world.asteroids.forEach(function (asteroid) {
        var asteroidGraphic = asteroidGraphics[asteroid.id];
        if (!asteroidGraphic) {
          asteroidGraphic = createAsteroidGraphic();
          asteroidGraphics[asteroid.id] = asteroidGraphic;
          worldLayer.addChildAt(asteroidGraphic.container, 1);
        }
        paintAsteroid(asteroidGraphic, asteroid, world.camera.zoom, world.camera, viewport().height);
        if(Driftworks.miningLights && Driftworks.scene3d){
          /** @type {import('./types').RigLighting[]} */ var rigs=[];
          world.platforms.forEach(function(p){if(p.asteroidId!==asteroid.id || rigs.length>=2 || (p.state!=='deployed' && p.state!=='setting-up' && p.state!=='packing-up'))return;
            var surface=Driftworks.scene3d && Driftworks.scene3d.platformSurface(p,asteroid);if(surface && surface.fit.valid && Driftworks.miningLights && Driftworks.scene3d)rigs.push(Driftworks.miningLights.rig(Driftworks.scene3d.platformSurfacePose(surface,p,asteroid),surface.scale));});
          var lighting=Driftworks.miningLights.uniforms(rigs,[asteroid.position.x,asteroid.position.y,0],asteroid.rotation,asteroid.radius);lighting.uRigProjected=1;Object.assign(asteroidGraphic.shader.uniforms,lighting);
        }
        asteroidGraphic.container.scale.set(semanticScale('asteroid', world.camera.zoom));
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
      paintContactOverlay(contactMarker, contactLabel, world, view);
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
          if (audio) audio.playWarning();
        } else if (event.kind === 'weapon-fired' && event.source) {
          pushProjectile(effects, event.source, event.position);
          pushImpactSparks(effects, event.position, event.velocity || { x: 0, y: 0 });
          if (audio) audio.playImpact(event.amount || 0.4);
        } else if (event.kind === 'ship-disabled') {
          pushDebris(effects, event.position, event.velocity || { x: 0, y: 0 }, 5);
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

    /** @param {string} shipId @param {string} type */
    function createShipGraphic(shipId, type) {
      var graphic = type === 'mothership' ? createMothershipGraphic() : new PIXI.Graphics();
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
        var orderWorld = getWorld();
        setWorld(issueVisualContextOrder(orderWorld, target, orderWorld.selectedShipIds));
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

    /** @param {{ image: string, brightness: number }} settings */
    function setBackground(settings) {
      var option = BACKGROUNDS.filter(function (candidate) { return candidate.id === settings.image; })[0] || BACKGROUNDS[0];
      background.style.backgroundImage = option.url ? 'url("' + assetUrl(option.url) + '")' : 'none';
      background.style.filter = 'contrast(' + option.contrast + ') brightness(' + settings.brightness + ')';
      background.dataset.background = option.id;
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
      setBackground: setBackground,
      getStats: getStats
    };
  }

  /** @param {World} world @param {Vec2} target @returns {World} @param {string[]} [shipIds] */
  function issueVisualContextOrder(world, target, shipIds) {
    var ids = shipIds === undefined ? world.selectedShipIds : shipIds;
    var zoom = world.camera.zoom;
    /** @param {{ position: Vec2 }} entity @param {string} type @param {number} radius */
    function hits(entity, type, radius) {
      return Math.hypot(target.x - entity.position.x, target.y - entity.position.y) <=
        Math.max(12 / zoom, radius * semanticScale(type, zoom));
    }
    var homeHit = world.ships.filter(function (s) { return s.type === 'mothership' && hits(s, s.type, 38); })[0];
    if (homeHit) return sim.issueReturnOrder(world, ids);
    var platformHit = (world.platforms || []).filter(function (p) {
      return (p.state === 'deployed' || p.state === 'setting-up') && hits(p, 'platform', 22);
    })[0];
    if (platformHit) return sim.issuePlatformRecovery(world, platformHit.id, ids);
    var fighters = world.ships.filter(function (s) { return s.type === 'escort' && ids.indexOf(s.id) !== -1; });
    if (fighters.length) {
      var guarded = world.ships.filter(function (s) {
        return ids.indexOf(s.id) === -1 && hits(s, s.type, s.type === 'mothership' ? 38 : 16);
      }).sort(function (a, b) {
        return Math.hypot(a.position.x - target.x, a.position.y - target.y) - Math.hypot(b.position.x - target.x, b.position.y - target.y);
      })[0];
      var selectedIds = ids.slice();
      var rest = selectedIds.filter(function (id) { return !fighters.some(function (s) { return s.id === id; }); });
      var next = rest.length ? issueVisualContextOrder(world, target, rest) : sim.cloneWorld(world);
      return sim.issueDefendOrder(next, guarded ? guarded.position : target, guarded && guarded.id, ids);
    }
    var hasTug = world.ships.some(function (ship) {
      return ship.type === 'tug' && ids.indexOf(ship.id) !== -1;
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
      if (recovery) return sim.issueRecoveryOrder(world, { kind: recovery.kind, id: recovery.entity.id }, ids);
    }
    var asteroid = world.asteroids.filter(function (item) {
      return hits(item, 'asteroid', sim.surfaceRadius(item, Math.atan2(target.y - item.position.y, target.x - item.position.x) - item.rotation));
    })[0];
    if (asteroid) return sim.issueMineOrder(world, asteroid.id, ids);
    if (hasTug && world.depot && hits(world.depot, 'depot', 44)) return sim.issueBuildOrder(world, ids);
    var home = world.ships.filter(function (ship) { return ship.type === 'mothership'; })[0];
    if (home && hits(home, 'mothership', 38)) return sim.issueReturnOrder(world, ids);
    return sim.issueMoveOrder(world, target, ids);
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

  /** @param {PIXI.Graphics | PIXI.Container} graphics @param {Ship} ship @param {boolean} selected @param {number} elapsedSeconds @param {Ship | Wreck | undefined} towedEntity @param {number} towedScale @param {number} zoom */
  function paintShip(graphics, ship, selected, elapsedSeconds, towedEntity, towedScale, zoom) {
    var style = SHIP_STYLES[ship.type];
    if (ship.type === 'mothership' && graphics.mothershipParts) {
      var parts = graphics.mothershipParts;
      parts.base.clear();
      parts.base.engineScreenScale = graphics.engineScreenScale;
      drawEnginePlume(parts.base, ship, style.radius, elapsedSeconds);
      paintMothershipShader(parts, selected, elapsedSeconds, ship.rotation || 0,
        zoom * (graphics.scale ? graphics.scale.x : 1));
      drawShipOrderAndBadges(parts.base, ship, style);
      return;
    }
    var g = /** @type {PIXI.Graphics} */ (graphics);
    g.clear();
    g.alpha = ship.disabled && ship.launchElapsed == null ? 0.45 : 1;
    drawEnginePlume(g, ship, style.radius, elapsedSeconds);
    if (ship.type === 'mothership') {
      paintMothership(g, selected, elapsedSeconds, ship.rotation || 0);
      drawShipOrderAndBadges(g, ship, style);
      return;
    }

    if (ship.type === 'tug' && ship.carryingSection) {
      paintConstructorCargo(g, style);
    }
    g.lineStyle(0);
    if (ship.type === 'tug') {
      if (ship.platformId) {
        paintIndustrialPlatform(g, 0, false, elapsedSeconds, zoom, ship.rotation);
      }
      if (ship.towTarget) paintTowedHull(g, ship.towTarget.kind, towedEntity, style, towedScale, zoom, ship.rotation);
      paintSlimTug(g, zoom, ship.rotation);
      if (ship.cargoOperation && ship.cargoOperation.remainingSeconds > 0) {
        drawCargoEvaWorkers(g, ship.id, elapsedSeconds,
          ship.cargoOperation.kind === 'deploy-platform' || ship.cargoOperation.kind === 'deploy-section');
      }
    } else if (ship.type === 'shuttle') {
      paintShuttleHull(g, zoom, ship.rotation);
    } else {
      paintFighterHull(g, zoom, ship.rotation, 1);
    }

    if (selected) {
      var halfX = ship.type === 'tug' ? 18 : style.radius + 1;
      var halfY = ship.type === 'tug' ? 18 : ship.type === 'shuttle' ? 5 : 11;
      if (ship.carryingSection) {
        halfX = Math.max(halfX, cargoModuleGeometry().length / 2);
        halfY = Math.max(halfY, cargoModuleGeometry().width / 2);
      }
      if (ship.towTarget) { halfX = Math.max(halfX, 14 * towedScale); halfY = Math.max(halfY, 9 * towedScale); }
      drawCraftBrackets(g, halfX, halfY, zoom * semanticScale(ship.type, zoom));
    }
    drawShipOrderAndBadges(g, ship, style);
  }

  /** @param {number} zoom */
  function craftDetail(zoom) {
    /** @param {number} start @param {number} end */
    function fade(start, end) {
      var t = Math.max(0, Math.min(1, (zoom - start) / (end - start)));
      return t * t * (3 - 2 * t);
    }
    return { machinery: fade(8, 32), fine: fade(32, 96) };
  }

  /** @param {import('./types').Platform} platform */
  function platformDeployment(platform) {
    var logistics = Driftworks.logistics;
    if (!logistics) return 0;
    if (platform.state === 'setting-up' && platform.landingElapsedSeconds !== undefined && Driftworks.miningLanding) return Driftworks.miningLanding.sample(platform.landingElapsedSeconds).deployment;
    var value = platform.state === 'deployed' ? 1 : platform.state === 'setting-up'
      ? 1 - (platform.setupRemainingSeconds || 0) / logistics.setupSeconds
      : platform.state === 'packing-up' ? (platform.packRemainingSeconds || 0) / logistics.packSeconds : 0;
    return Math.max(0, Math.min(1, value));
  }

  /** Slope-aligned tangent projection composed AFTER the platform heading.
   * @param {AsteroidNormal} normal @param {number} heading @param {number} scale
   */
  function platformProjection(normal, heading, scale) {
    var length = Math.hypot(normal.x, normal.y, normal.z) || 1;
    var compression = Math.max(0.2, Math.min(1, normal.z / length));
    var slopeSquared = normal.x * normal.x + normal.y * normal.y;
    var k = slopeSquared > 1e-12 ? (1 - compression) / slopeSquared : 0;
    var xx = 1 - normal.x * normal.x * k, xy = -normal.x * normal.y * k;
    var yy = 1 - normal.y * normal.y * k;
    var c = Math.cos(heading), s = Math.sin(heading);
    return { a: scale * (xx * c + xy * s), b: scale * (xy * c + yy * s),
      c: scale * (-xx * s + xy * c), d: scale * (-xy * s + yy * c), compression: compression };
  }

  /** Sample the shader's broad dome and shared relief, without pixel-level noise.
   * @param {import('./types').AsteroidVisual} visual @param {number} x @param {number} y
   * @returns {AsteroidNormal}
   */
  function platformSurfaceNormal(visual, x, y) {
    /** @param {number} px @param {number} py */
    function height(px, py) {
      var angle = Math.atan2(py, px);
      var boundary = 0.88 + 0.07 * Math.cos(angle * 3) + 0.05 * Math.sin(angle * 5);
      var q = Math.min(0.997, Math.hypot(px, py) / boundary);
      return Math.sqrt(Math.max(0.002, 1 - q * q)) * 0.78 + asteroidReliefAt(visual, px, py);
    }
    var e = 0.0035;
    var dx = (height(x + e, y) - height(x - e, y)) / (2 * e);
    var dy = (height(x, y + e) - height(x, y - e)) / (2 * e);
    var length = Math.hypot(dx, dy, 1);
    return { x: -dx / length, y: -dy / length, z: 1 / length };
  }

  /** @param {import('./types').Platform} platform @param {World} world @param {Asteroid | undefined} asteroid */
  function platformIsWorking(platform, world, asteroid) {
    return platform.state === 'deployed' && world.miningMission === 'active' && !!asteroid && asteroid.ore > 0 &&
      (!world.staffingEnabled || (platform.workerIds || []).length >= 5);
  }

  /** @param {PIXI.Graphics} g @param {number} color @param {number} x @param {number} y @param {number} w @param {number} h @param {number} [alpha] */
  function mechanicalBlock(g, color, x, y, w, h, alpha) {
    g.lineStyle(0); g.beginFill(color, alpha === undefined ? 1 : alpha);
    g.drawRect(x, y, w, h); g.endFill();
  }

  /** @param {number} color @param {number} rotation @param {number} side */
  function mechanicalFace(color, rotation, side) {
    var light = mothershipLocalLight(rotation);
    return shadeMechanicalColor(color, 0.48 + 0.6 * Math.max(0, light.z * 0.8 + side * light.y * 0.6));
  }

  /** @param {PIXI.Graphics} g @param {number} halfX @param {number} halfY @param {number} screenScale */
  function drawCraftBrackets(g, halfX, halfY, screenScale) {
    var length = 5 / screenScale, pad = 4 / screenScale;
    g.lineStyle(1 / screenScale, 0xd9f5ff, 0.75);
    [-1, 1].forEach(function (x) { [-1, 1].forEach(function (y) {
      var px = x * (halfX + pad), py = y * (halfY + pad);
      g.moveTo(px - x * length, py); g.lineTo(px, py); g.lineTo(px, py - y * length);
    }); });
  }

  /** @param {PIXI.Graphics} g @param {number} zoom @param {number} rotation @param {number} scale */
  function paintFighterHull(g, zoom, rotation, scale) {
    var detail = craftDetail(zoom);
    [-1, 1].forEach(function (side) {
      g.lineStyle(0); g.beginFill(mechanicalFace(0xb76c6f, rotation, side), 1);
      g.drawPolygon([13 * scale, 0, -9.36 * scale, side * 8.06 * scale, -5.85 * scale, 0]); g.endFill();
    });
    g.beginFill(0x263b47, 1);
    g.drawPolygon([7 * scale, 0, -3 * scale, -1.5 * scale, -5 * scale, 0, -3 * scale, 1.5 * scale]); g.endFill();
    mechanicalBlock(g, 0x162630, -10.66 * scale, -1.5 * scale, 3 * scale, 3 * scale);
    [-1, 1].forEach(function (side) {
      mechanicalBlock(g, 0x202d35, -7 * scale, side * 5 * scale - scale, 3 * scale, 2 * scale, detail.machinery);
      mechanicalBlock(g, 0xd1afb0, scale, side * 2.2 * scale, 2 * scale, 0.35 * scale, detail.fine);
    });
  }

  /** @param {PIXI.Graphics} g @param {number} zoom @param {number} rotation */
  function paintShuttleHull(g, zoom, rotation) {
    var detail = craftDetail(zoom);
    g.lineStyle(0); g.beginFill(mechanicalFace(0xdde4df, rotation, -1), 1);
    g.drawRoundedRect(-8, -4, 16, 8, 3); g.endFill();
    mechanicalBlock(g, mechanicalFace(0xdde4df, rotation, 1), -5, 0, 10, 3);
    mechanicalBlock(g, 0x243d4b, 2, -2, 3, 4);
    mechanicalBlock(g, 0x243039, -8, -1.5, 2, 3);
    mechanicalBlock(g, 0x839da7, -1, -4, 2, 1.2, detail.machinery);
    mechanicalBlock(g, 0x485d67, -3, -2.6, 0.35, 5.2, detail.fine);
  }

  /** @param {PIXI.Graphics} g @param {number} zoom @param {number} rotation */
  function paintSlimTug(g, zoom, rotation) {
    var detail = craftDetail(zoom), steel = mechanicalFace(0x79909d, rotation, -1);
    [-10.44, 10.44].forEach(function (x) {
      mechanicalBlock(g, 0x253640, x - 0.6, -15.84, 1.2, 31.68);
      mechanicalBlock(g, steel, x - 0.6, -15.84, 0.45, 31.68);
      [-1, 1].forEach(function (side) {
        mechanicalBlock(g, steel, x - 5.4, side * 16.2 - 0.55, 10.8, 1.1);
        mechanicalBlock(g, 0x1d2d37, x - 1.1, side * 16.2 - 1, 2.2, 2);
        g.lineStyle(0.45, 0x92aab4, detail.machinery * 0.7);
        g.moveTo(x, side * 7); g.lineTo(x - 4, side * 15.6);
        mechanicalBlock(g, 0xc6aa62, x - 2, side * 8 - 0.6, 4, 1.2, detail.machinery);
      });
    });
    mechanicalBlock(g, steel, -16.2, -0.65, 32.4, 1.3);
    mechanicalBlock(g, 0x345a70, -3, -2.4, 6, 4.8);
    mechanicalBlock(g, 0x83aec2, -2.7, -2.2, 5.4, 0.7);
    mechanicalBlock(g, 0x172b36, -1, -1.3, 3, 2.6, detail.machinery);
    mechanicalBlock(g, 0x192832, -16.8, -1.6, 2.5, 3.2);
    [-1, 1].forEach(function (side) {
      mechanicalBlock(g, 0x192832, 14.5, side * 2.88 - 0.8, 2, 1.6);
      mechanicalBlock(g, 0xe0bb67, 6, side * 0.7, 2, 0.3, detail.fine);
    });
  }

  /** Local tangent coordinates plus elevation along the outward surface normal.
   * @param {AsteroidNormal} normal @param {number} x @param {number} y @param {number} height
   */
  function platformRaisedPoint(normal, x, y, height) {
    var p = platformProjection(normal, 0, 1);
    return { x: p.a * x + p.c * y + normal.x * height,
      y: p.b * x + p.d * y + normal.y * height };
  }

  /** Project the same fitted rig mesh for the tactical 2D view; static poses are cached by the scene.
   * @param {PIXI.Graphics} g @param {import('./types').PlatformSurface} surface @param {number} deployment @param {number} ramps @param {number} yaw @param {number} heading */
  function paintTerrainPlatform(g,surface,deployment,ramps,yaw,heading){
    var scene=Driftworks.scene3d;if(!scene)return;
    var groups=scene.platformSurfaceGeometry(surface,deployment,ramps),c=Math.cos(yaw),s=Math.sin(yaw);
    /** @type {Record<string,number>} */ var colors={ochre:0xd4a34a,steel:0x758784,dark:0x1a2630,light:0xe3ca7d,lamp:0xfff0c7,marker:0x59f2d9};
    /** @type {{points:number[];depth:number;color:number}[]} */ var faces=[];
    Object.keys(groups).forEach(function(material){var data=groups[material];
      for(var i=0;i<data.length;i+=18){
        var nx=data[i+3]*c-data[i+4]*s,ny=data[i+3]*s+data[i+4]*c,n=surface.fit.rotate([nx,ny,data[i+5]]);if(n[2]<=0)continue;
        /** @type {number[]} */ var points=[];var depth=0;
        for(var j=0;j<18;j+=6){var x=data[i+j]*c-data[i+j+1]*s,y=data[i+j]*s+data[i+j+1]*c,v=surface.fit.world([x,y,data[i+j+2]]);points.push(v[0],v[1]);depth+=v[2];}
        var flood=Driftworks.miningLights?Driftworks.miningLights.irradiance(Driftworks.miningLights.model,[(data[i]+data[i+6]+data[i+12])/3,(data[i+1]+data[i+7]+data[i+13])/3,(data[i+2]+data[i+8]+data[i+14])/3],[data[i+3],data[i+4],data[i+5]])[0]:0;
        faces.push({points:points,depth:depth,color:material==='lamp'||material==='marker'?colors[material]:shadeMechanicalColor(colors[material],.45+flood*.65+.55*Math.max(0,n[2]*.8+n[0]*Math.cos(heading)*.4-n[1]*Math.sin(heading)*.4))});
      }
    });
    faces.sort(function(a,b){return a.depth-b.depth;});g.lineStyle(0);
    faces.forEach(function(face){g.beginFill(face.color,1);g.drawPolygon(face.points);g.endFill();});
  }

  /** @param {PIXI.Graphics} g @param {number} deployment @param {boolean} working @param {number} time @param {number} zoom @param {number} rotation @param {AsteroidNormal} normal */
  function paintRaisedPlatform(g, deployment, working, time, zoom, rotation, normal) {
    var light = mothershipLocalLight(rotation), detail = craftDetail(zoom);
    var plane = platformProjection(normal, 0, 1);
    // Tangent axes' Z components establish which side walls face the camera.
    var tx = { x: plane.a, y: plane.b, z: -normal.x };
    var ty = { x: plane.c, y: plane.d, z: -normal.y };
    /** @param {number} color @param {AsteroidNormal} face */
    function lit(color, face) {
      var denominator = Math.hypot(light.x, light.y, light.z) * Math.hypot(face.x, face.y, face.z);
      return shadeMechanicalColor(color, 0.38 + 0.8 * Math.max(0,
        (face.x * light.x + face.y * light.y + face.z * light.z) / Math.max(0.001, denominator)));
    }
    /** @param {number[][]} points @param {number} color @param {number} [alpha] */
    function polygon(points, color, alpha) {
      var flat = points.map(function (v) { return platformRaisedPoint(normal, v[0], v[1], v[2]); });
      g.lineStyle(0); g.beginFill(color, alpha === undefined ? 1 : alpha);
      g.drawPolygon(flat.reduce(function (out, point) { return out.concat([point.x, point.y]); }, /** @type {number[]} */ ([])));
      g.endFill();
    }
    /** @param {number} x @param {number} y @param {number} w @param {number} h @param {number} bottom @param {number} top @param {number} color */
    function box(x, y, w, h, bottom, top, color) {
      [-1, 1].forEach(function (side) {
        if (side * tx.z > 0) {
          var edgeX = side < 0 ? x : x + w;
          polygon([[edgeX,y,bottom],[edgeX,y+h,bottom],[edgeX,y+h,top],[edgeX,y,top]],
            lit(color, {x:side*tx.x,y:side*tx.y,z:side*tx.z}));
        }
        if (side * ty.z > 0) {
          var edgeY = side < 0 ? y : y + h;
          polygon([[x,edgeY,bottom],[x+w,edgeY,bottom],[x+w,edgeY,top],[x,edgeY,top]],
            lit(color, {x:side*ty.x,y:side*ty.y,z:side*ty.z}));
        }
      });
      polygon([[x,y,top],[x+w,y,top],[x+w,y+h,top],[x,y+h,top]], lit(color,normal));
    }
    // A restrained ground shadow separates the body from its contact plane.
    polygon([[-12,-8,0],[12,-8,0],[12,8,0],[-12,8,0]],0x080e12,0.24);
    /** @type {{x:number,side:number,depth:number}[]} */
    var legs = [];
    [-9,-3,3,9].forEach(function (x) { [-1,1].forEach(function (side) {
      legs.push({x:x,side:side,depth:-normal.x*x-normal.y*side*12});
    }); });
    legs.sort(function (a,b) { return a.depth-b.depth; });
    /** @param {{x:number,side:number,depth:number}} leg */
    function drawLeg(leg) {
      var x=leg.x, side=leg.side;
      var footX=x*(1+deployment*0.7), footY=side*(9+deployment*10);
      var kneeX=x*(1+deployment*0.25), kneeY=side*(7.5+deployment*5);
      var root=platformRaisedPoint(normal,x,side*5,5);
      var knee=platformRaisedPoint(normal,kneeX,kneeY,3.5);
      var foot=platformRaisedPoint(normal,footX,footY,0.6);
      box(footX-2.2,footY-1.7,4.4,3.4,0,0.6,0x77817a);
      g.lineStyle(3.5,lit(0xb99243,normal),1); g.moveTo(root.x,root.y); g.lineTo(knee.x,knee.y);
      g.lineStyle(2.7,lit(0x89928b,normal),1); g.moveTo(knee.x,knee.y); g.lineTo(foot.x,foot.y);
      box(kneeX-1.7,kneeY-1.3,3.4,2.6,3,4.3,0xb99243);
    }
    legs.filter(function (leg) { return leg.depth<=0; }).forEach(drawLeg);
    box(-12,-8,24,16,3.5,8,0xd3a449);
    // Recessed top compartment and raised sorting/excavation hardware.
    polygon([[-6,-4.5,8.02],[6,-4.5,8.02],[6,3,8.02],[-6,3,8.02]],0x253137);
    box(3,-3,6+deployment*5,3,8,10,0x9b8857);
    box(8+deployment*5,-4,3,7,6,10,0x35454a);
    if (detail.machinery>0) {
      [-1,1].forEach(function (side) { box(-9,side*5,4,1,8,8.5,0xe3bd68); });
    }
    legs.filter(function (leg) { return leg.depth>0; }).forEach(drawLeg);
  }

  /** @param {PIXI.Graphics} g @param {number} deployment @param {boolean} working @param {number} time @param {number} zoom @param {number} rotation */
  function paintIndustrialPlatform(g, deployment, working, time, zoom, rotation) {
    var detail = craftDetail(zoom);
    // Four independently articulated legs on each flank. Broad armored upper
    // links and angular feet keep these readable as excavator legs, not wheels.
    [-9, -3, 3, 9].forEach(function (rootX) { [-1, 1].forEach(function (side) {
      var kneeX = rootX * (1 + deployment * 0.25);
      var kneeY = side * (7.5 + deployment * 5);
      var footX = rootX * (1 + deployment * 0.7);
      var footY = side * (9 + deployment * 10);
      g.lineStyle(3.8, mechanicalFace(0xb99243, rotation, side), 1);
      g.moveTo(rootX, side * 5); g.lineTo(kneeX, kneeY);
      g.lineStyle(2.8, mechanicalFace(0x89928b, rotation, side), 1);
      g.moveTo(kneeX, kneeY); g.lineTo(footX, footY);
      g.lineStyle(0.65, 0xc8d0c8, 0.65);
      g.moveTo(kneeX - 0.65, kneeY); g.lineTo(footX - 0.65, footY);
      mechanicalBlock(g, 0x3a403a, kneeX - 1.9, kneeY - 1.5, 3.8, 3);
      mechanicalBlock(g, mechanicalFace(0xd3a449, rotation, side), kneeX - 1.4, kneeY - 1.1, 2.8, 1.5);
      mechanicalBlock(g, 0x263238, footX - 2.2, footY - 1.7, 4.4, 3.4);
      mechanicalBlock(g, 0x77817a, footX - 1.9, footY - 1.4, 3.8, 0.65);
    }); });
    g.lineStyle(0); g.beginFill(mechanicalFace(0xd3a449, rotation, -1), 1);
    g.drawRoundedRect(-12, -8, 24, 16, 4); g.endFill();
    mechanicalBlock(g, mechanicalFace(0xb28434, rotation, 1), -9, 3, 18, 4);
    mechanicalBlock(g, 0x273136, -6, -4.5, 12, 7.5);
    mechanicalBlock(g, 0x806e48, 3, -3, 6 + deployment * 5, 3);
    mechanicalBlock(g, 0x17272d, 8 + deployment * 5, -4, 3, 7);
    [-1, 1].forEach(function (side) {
      mechanicalBlock(g, 0xe3bd68, -9, side * 5, 4, 1, detail.machinery);
      mechanicalBlock(g, 0x514532, -10, side * 6, 18, 0.35, detail.fine);
    });

  }

  /** @param {PIXI.Graphics} graphics @param {string} kind @param {Ship | Wreck | undefined} entity @param {ShipStyle} tugStyle @param {number} hullScale @param {number} zoom @param {number} rotation */
  function paintTowedHull(graphics, kind, entity, tugStyle, hullScale, zoom, rotation) {
    var centerX = 0;
    var centerY = -1;
    if (kind === 'ship') {
      paintFighterHull(graphics, zoom, rotation, hullScale);
      return;
    }
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

  /** @param {PIXI.Graphics} graphics @param {string[]} workerIds @param {number} elapsedSeconds @param {boolean} packingUp @param {AsteroidNormal} [normal] */
  function drawPlatformWorkers(graphics, workerIds, elapsedSeconds, packingUp, normal) {
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
      if (normal) {
        var projectedWorker = platformRaisedPoint(normal, x, y, 1.8);
        x = projectedWorker.x; y = projectedWorker.y;
      }
      graphics.lineStyle(1, 0xc5d9d8, 0.9);
      graphics.beginFill(0xe7f0e5, 1);
      graphics.drawCircle(x, y, 1.8);
      graphics.endFill();
    });
  }

  /** @param {PIXI.Graphics} graphics @param {string} shipId @param {number} elapsedSeconds @param {boolean} deploying */
  function drawCargoEvaWorkers(graphics, shipId, elapsedSeconds, deploying) {
    var seed = 0;
    for (var i = 0; i < shipId.length; i += 1) seed = (seed * 31 + shipId.charCodeAt(i)) >>> 0;
    [0, 1].forEach(function (index) {
      var direction = index ? -1 : 1;
      var phase = elapsedSeconds * (0.7 + index * 0.11) + seed * 0.001 + index * Math.PI;
      var reach = 22 + Math.sin(phase * 0.63) * 4;
      var x = (deploying ? 1 : -1) * 4 + Math.cos(phase) * reach;
      var y = direction * 7 + Math.sin(phase * 0.83) * 12;
      graphics.lineStyle(0.8, 0xb8d2d5, 0.55);
      graphics.moveTo(x - Math.cos(phase) * 3, y - Math.sin(phase * 0.83) * 3);
      graphics.lineTo(x, y);
      graphics.beginFill(index ? 0xe7f0e5 : 0xd5b66f, 1);
      graphics.drawCircle(x, y, 1.9);
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
    graphics.lineStyle(0.45, 0x24343f, 0.6);
    graphics.beginFill(0x53616b, 1);
    graphics.drawRoundedRect(-module.length / 2, -module.width / 2, module.length, module.width, 1.5);
    graphics.endFill();
    graphics.lineStyle(1, 0x28353e, 0.8);
    [-0.36, 0.36].forEach(function (y) {
      graphics.moveTo(-0.48 * r, y * r);
      graphics.lineTo(0.48 * r, y * r);
    });
    graphics.lineStyle(0.7, 0x819ca9, 0.6);
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

  /** @param {PIXI.Graphics} graphics @param {boolean} selected @param {number} elapsedSeconds @param {number} shipRotation */
  function paintMothership(graphics, selected, elapsedSeconds, shipRotation) {
    drawMothershipHabitat(graphics, elapsedSeconds, shipRotation);
    drawMothershipBearing(graphics, elapsedSeconds);
    drawMothershipCore(graphics, shipRotation);
    if (selected) drawMothershipSelectionBrackets(graphics, elapsedSeconds);
  }

  var MOTHERSHIP_VERTEX_SHADER = [
    'precision highp float;',
    'attribute vec2 aVertexPosition;',
    'uniform mat3 translationMatrix;',
    'uniform mat3 projectionMatrix;',
    'varying vec2 vLocalCoord;',
    'void main(){vLocalCoord=aVertexPosition;vec3 p=projectionMatrix*translationMatrix*vec3(aVertexPosition,1.0);gl_Position=vec4(p.xy,0.0,1.0);}'
  ].join('\n');

  var MOTHERSHIP_FRAGMENT_SHADER = [
    'precision highp float;',
    'varying vec2 vLocalCoord;',
    'uniform vec3 uLight;',
    'uniform float uSpin;',
    'uniform float uPixelFootprint;',
    'const float PI=3.141592653589793;',
    'float roundedBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b;return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r;}',
    'float lineMask(float value,float center,float halfWidth,float aa){return 1.0-smoothstep(halfWidth,halfWidth+aa,abs(value-center));}',
    Driftworks.miningLights?Driftworks.miningLights.shaderSource:'vec3 rigIllumination(vec3 p,vec3 n){return vec3(0.);}',
    'void main(){',
    ' vec2 p=vLocalCoord;float aa=max(.035,uPixelFootprint);float dist=roundedBox(p,vec2(31.0,12.0),5.0);float alpha=1.0-smoothstep(-aa,aa,dist);',
    ' if(alpha<=0.0){gl_FragColor=vec4(0.0);return;}',
    ' float ny=clamp(p.y/17.0,-1.0,1.0);float nz=sqrt(max(0.0,1.0-ny*ny));vec3 n=vec3(0.0,ny,nz);float diffuse=max(0.0,dot(n,normalize(uLight)));',
    ' vec3 color=vec3(.49,.529,.565)*(.61+diffuse*.55);',
    ' float edge=1.0-smoothstep(0.0,2.2,-dist);color=mix(color,vec3(.20,.275,.314),edge*.72);',
    ' float theta=asin(ny);float bandWave=abs(sin((theta-uSpin)*3.0));float bands=1.0-smoothstep(.0,.055+aa*.018,bandWave);color=mix(color,vec3(.74,.85,.89),bands*.25*nz);',
    ' float ribs=0.0;ribs=max(ribs,lineMask(p.x,-25.0,.42,aa));ribs=max(ribs,lineMask(p.x,-15.0,.42,aa));ribs=max(ribs,lineMask(p.x,15.0,.42,aa));ribs=max(ribs,lineMask(p.x,25.0,.42,aa));color=mix(color,vec3(.21,.29,.33),ribs*.72);',
    ' float lightY=sin(uSpin)*15.0;float lampA=(1.0-smoothstep(1.25,1.25+aa,length(p-vec2(-26.0,lightY))))*max(0.0,cos(uSpin));float lampB=(1.0-smoothstep(1.25,1.25+aa,length(p-vec2(26.0,-lightY))))*max(0.0,cos(uSpin+PI));color=mix(color,vec3(.74,.88,.92),clamp(lampA+lampB,0.0,1.0)*nz);',
    ' float panelPhase=uSpin+.72;float panelY=sin(panelPhase)*16.5;float panelFront=max(0.0,cos(panelPhase));float panel=1.0-smoothstep(-aa,aa,roundedBox(p-vec2(22.5,panelY),vec2(3.5,1.0),1.0));color=mix(color,vec3(.23,.28,.30),panel*panelFront*.9);',
    ' float panelEdge=(1.0-smoothstep(-aa,aa,roundedBox(p-vec2(22.5,panelY),vec2(4.2,1.7),1.0)))-panel;color=mix(color,vec3(.91,.76,.43),max(0.0,panelEdge)*panelFront*.8);',
    ' gl_FragColor=vec4(color*alpha,alpha);',
    '}'
  ].join('\n');

  function createMothershipGraphic() {
    var container = new PIXI.Container();
    var base = new PIXI.Graphics();
    var geometry = new PIXI.Geometry()
      .addAttribute('aVertexPosition', [-37, -18, 37, -18, 37, 18, -37, 18], 2)
      .addIndex([0, 1, 2, 0, 2, 3]);
    var shader = PIXI.Shader.from(MOTHERSHIP_VERTEX_SHADER, MOTHERSHIP_FRAGMENT_SHADER,
      mothershipHabitatUniforms(0, 0, 1));
    var habitat = new PIXI.Mesh(geometry, shader);
    var overlay = new PIXI.Graphics();
    container.addChild(base, habitat, overlay);
    container.mothershipParts = { base: base, habitat: habitat, shader: shader, overlay: overlay };
    container.hitArea = new PIXI.Circle(0, 0, 42);
    return container;
  }

  /** @param {number} elapsedSeconds @param {number} shipRotation @param {number} screenScale */
  function mothershipHabitatUniforms(elapsedSeconds, shipRotation, screenScale) {
    var light = mothershipLocalLight(shipRotation);
    return { uLight: new Float32Array([light.x, light.y, light.z]),
      uSpin: elapsedSeconds * Math.PI * 2 / 38,
      uPixelFootprint: 1 / Math.max(1, screenScale || 1) };
  }

  /** CPU reference for the shader's front-hemisphere lamp rejection. @param {number} spin */
  function mothershipHabitatLampVisibility(spin) {
    return { left: Math.max(0, Math.cos(spin)), right: Math.max(0, Math.cos(spin + Math.PI)) };
  }

  /** @param {{base:PIXI.Graphics, habitat:PIXI.Mesh, shader:PIXI.Shader, overlay:PIXI.Graphics}} parts @param {boolean} selected @param {number} elapsedSeconds @param {number} shipRotation @param {number} screenScale */
  function paintMothershipShader(parts, selected, elapsedSeconds, shipRotation, screenScale) {
    var uniforms = mothershipHabitatUniforms(elapsedSeconds, shipRotation, screenScale);
    var light = /** @type {Float32Array} */ (parts.shader.uniforms.uLight);
    light.set(uniforms.uLight);
    parts.shader.uniforms.uSpin = uniforms.uSpin;
    parts.shader.uniforms.uPixelFootprint = uniforms.uPixelFootprint;
    parts.overlay.clear();
    drawMothershipBearing(parts.overlay, elapsedSeconds);
    drawMothershipCore(parts.overlay, shipRotation);
    if (selected) drawMothershipSelectionBrackets(parts.overlay, elapsedSeconds);
  }

  /** @param {number} angle */
  function drumSurfaceAt(angle) {
    return { y: Math.sin(angle) * 16.5, depth: Math.cos(angle) };
  }

  /** @param {number} color @param {number} factor */
  function shadeMechanicalColor(color, factor) {
    /** @param {number} shift */
    var channel = function (shift) {
      return Math.max(0, Math.min(255, Math.round(((color >> shift) & 255) * factor)));
    };
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
  }

  /** @param {number} shipRotation */
  function mothershipLocalLight(shipRotation) {
    var c = Math.cos(shipRotation), s = Math.sin(shipRotation);
    return { x: WORLD_LIGHT.x * c + WORLD_LIGHT.y * s,
      y: -WORLD_LIGHT.x * s + WORLD_LIGHT.y * c, z: WORLD_LIGHT.z };
  }

  /** @param {PIXI.Graphics} graphics @param {number} elapsedSeconds @param {number} shipRotation */
  function drawMothershipHabitat(graphics, elapsedSeconds, shipRotation) {
    var light = mothershipLocalLight(shipRotation);
    graphics.lineStyle(0);
    graphics.beginFill(0x55636d, 1);
    graphics.drawRoundedRect(-36, -17, 72, 34, 5);
    graphics.endFill();

    // Horizontal strips describe a lit cylinder while preserving the old silhouette.
    for (var y = -16; y < 17; y += 2) {
      var normalY = (y + 1) / 17;
      var normalZ = Math.sqrt(Math.max(0, 1 - normalY * normalY));
      var diffuse = Math.max(0, normalY * light.y + normalZ * light.z);
      var halfWidth = mothershipHullHalfWidthAtY(y + 1);
      graphics.beginFill(shadeMechanicalColor(SHIP_STYLES.mothership.fill, 0.61 + diffuse * 0.55), 1);
      graphics.drawRect(-halfWidth, y, halfWidth * 2, 2.15);
      graphics.endFill();
    }

    drawMothershipDrumSurface(graphics, elapsedSeconds);
    drawMothershipLights(graphics, elapsedSeconds);
    graphics.lineStyle(1.3, 0x354650, 0.72);
    [-25, -15, 15, 25].forEach(function (x) {
      graphics.moveTo(x, -15.5);
      graphics.lineTo(x, 15.5);
    });

    // One deliberately asymmetric service panel makes the drum's motion legible.
    var service = drumSurfaceAt(elapsedSeconds * Math.PI * 2 / 38 + 0.72);
    if (service.depth > 0) {
      graphics.lineStyle(0.8, 0xe7c36f, 0.75 * service.depth);
      graphics.beginFill(0x39464d, 0.7 * service.depth);
      graphics.drawRoundedRect(18, service.y - 2, 9, 4, 1);
      graphics.endFill();
      graphics.moveTo(20, service.y); graphics.lineTo(25, service.y);
    }

    graphics.lineStyle(0.65, 0x1d2b33, 0.62);
    graphics.beginFill(SHIP_STYLES.mothership.fill, 0);
    graphics.drawRoundedRect(-36, -17, 72, 34, 5);
    graphics.endFill();
  }

  /** @param {PIXI.Graphics} graphics @param {number} elapsedSeconds */
  function drawMothershipBearing(graphics, elapsedSeconds) {
    graphics.lineStyle(0.7, 0x101a20, 0.8);
    graphics.beginFill(0x142129, 1);
    graphics.drawRoundedRect(-12, -19, 24, 38, 3);
    graphics.endFill();
    graphics.lineStyle(1.1, 0x8fcfc5, 0.8);
    graphics.beginFill(0x33434c, 1);
    graphics.drawRoundedRect(-11, -15, 22, 5, 1.5);
    graphics.drawRoundedRect(-11, 10, 22, 5, 1.5);
    graphics.endFill();
    var travel = (elapsedSeconds * 4.5) % 16;
    [-1, 1].forEach(function (side) {
      graphics.beginFill(0xb9f3dc, 0.85);
      graphics.drawCircle(-8 + travel, side * 12.5, 0.9);
      graphics.endFill();
    });
  }

  /** @param {PIXI.Graphics} graphics @param {number} shipRotation */
  function drawMothershipCore(graphics, shipRotation) {
    var light = mothershipLocalLight(shipRotation);
    var coreFill = shadeMechanicalColor(0x657680, 0.82 + Math.max(0, light.x) * 0.18);
    graphics.lineStyle(0.75, 0x1b2a32, 0.72);
    graphics.beginFill(coreFill, 1);
    graphics.drawRoundedRect(-8.5, -29, 17, 58, 2.5);
    graphics.endFill();
    graphics.lineStyle(0.65, 0xb9cbd1, 0.38);
    graphics.moveTo(-7, -26); graphics.lineTo(-7, 25);
    graphics.lineStyle(1, 0x17242b, 0.65);
    graphics.moveTo(7, -25); graphics.lineTo(7, 26);
    graphics.lineStyle(1, 0x25343d, 0.8);
    graphics.moveTo(-4.5, -27); graphics.lineTo(-4.5, 27);
    graphics.moveTo(4.5, -27); graphics.lineTo(4.5, 27);

    [-21, 21].forEach(function (y) {
      graphics.beginFill(0x172932, 1);
      graphics.drawRoundedRect(-5.5, y - 4, 11, 8, 2);
      graphics.endFill();
      graphics.lineStyle(1, 0x9cb8c2, 0.7);
      graphics.moveTo(-3.5, y); graphics.lineTo(3.5, y);
    });
    graphics.lineStyle(1.2, 0x92aab3, 0.8);
    graphics.moveTo(0, -29); graphics.lineTo(0, -35);
    graphics.moveTo(0, -35); graphics.lineTo(5, -39);
    graphics.beginFill(0xb9f3dc, 0.9);
    graphics.drawCircle(5, -39, 1.2);
    graphics.endFill();
    graphics.lineStyle(1, 0x78909a, 0.9);
    graphics.beginFill(0x2b3d46, 1);
    graphics.drawRect(-15, -25, 6, 10);
    graphics.drawRect(9, 15, 6, 10);
    graphics.endFill();
    graphics.lineStyle(0.7, 0x9db3bc, 0.55);
    graphics.moveTo(-13, -24); graphics.lineTo(-13, -16);
    graphics.moveTo(11, 16); graphics.lineTo(11, 24);
  }

  /** @param {PIXI.Graphics} graphics @param {number} elapsedSeconds */
  function drawMothershipSelectionBrackets(graphics, elapsedSeconds) {
    var alpha = 0.68 + Math.sin(elapsedSeconds * 3.2) * 0.12;
    var left = -42, right = 42, top = -43, bottom = 43, length = 8;
    graphics.lineStyle(1.1, 0xd9f5ff, alpha);
    [[left, top, 1, 1], [right, top, -1, 1],
      [left, bottom, 1, -1], [right, bottom, -1, -1]].forEach(function (corner) {
      graphics.moveTo(corner[0], corner[1] + corner[3] * length);
      graphics.lineTo(corner[0], corner[1]);
      graphics.lineTo(corner[0] + corner[2] * length, corner[1]);
    });
  }

  /** @param {PIXI.Graphics} graphics @param {number} elapsedSeconds */
  function drawMothershipDrumSurface(graphics, elapsedSeconds) {
    var bands = mothershipDrumMarkers(elapsedSeconds);
    bands.forEach(function (band) {
      if (!band.visible) return;
      graphics.lineStyle(band.width, 0xbdd9e4, band.alpha);
      graphics.moveTo(-band.halfWidth, band.y);
      graphics.lineTo(band.halfWidth, band.y);
    });
  }

  /** @param {number} elapsedSeconds */
  function mothershipDrumMarkers(elapsedSeconds) {
    var spin = elapsedSeconds * Math.PI * 2 / 38;
    /** @type {{y: number; halfWidth: number; width: number; alpha: number; visible: boolean}[]} */
    var markers = [];
    for (var i = 0; i < 6; i += 1) {
      var phase = spin + i * Math.PI / 3;
      var surface = drumSurfaceAt(phase);
      var y = surface.y;
      // Depth hides the underside; the exposed surface spans both screen halves.
      var depth = surface.depth;
      var facing = Math.max(0, depth);
      markers.push({
        y: y,
        halfWidth: mothershipHullHalfWidthAtY(y),
        width: 0.55 + facing * 0.55,
        alpha: facing * 0.32,
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
        var surface = drumSurfaceAt(phase);
        var y = surface.y * 15 / 16.5;
        var depth = surface.depth;
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

  /** @param {number} value @returns {number} */
  function smoothstep(value) {
    value = Math.max(0, Math.min(1, value));
    return value * value * (3 - 2 * value);
  }

  /** @returns {LegacyAsteroidGraphic} */
  function legacyCreateAsteroidGraphic() {
    var container = new PIXI.Container();
    var base = new PIXI.Graphics();
    var lighting = new PIXI.Graphics();
    container.addChild(base, lighting);
    return { container: container, base: base, lighting: lighting,
      visual: null, artworkKey: '', lightBucket: Infinity };
  }

  /** @param {{ x: number, y: number, rx: number, ry: number, angle: number }} crater @param {number} scale @param {number} offsetX @param {number} offsetY @returns {number[]} */
  function asteroidCraterEllipse(crater, scale, offsetX, offsetY) {
    /** @type {number[]} */
    var points = [];
    for (var i = 0; i < 28; i += 1) {
      var a = i / 28 * Math.PI * 2;
      var x = Math.cos(a) * crater.rx * scale;
      var y = Math.sin(a) * crater.ry * scale;
      points.push(crater.x + offsetX + x * Math.cos(crater.angle) - y * Math.sin(crater.angle),
        crater.y + offsetY + x * Math.sin(crater.angle) + y * Math.cos(crater.angle));
    }
    return points;
  }

  /** @param {{ rimMask?: boolean[] }} crater @param {number} angle */
  function asteroidCraterRimVisible(crater, angle) {
    if (!crater.rimMask) return true;
    var wrapped = (angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return crater.rimMask[Math.round(wrapped / (Math.PI * 2) * 28) % 28];
  }

  /** @param {{x:number,y:number,rx:number,ry:number,angle:number}} crater @param {number} angle @param {number} scale */
  function asteroidCraterPoint(crater, angle, scale) {
    return {
      x: crater.x + Math.cos(angle) * crater.rx * scale * Math.cos(crater.angle) -
        Math.sin(angle) * crater.ry * scale * Math.sin(crater.angle),
      y: crater.y + Math.cos(angle) * crater.rx * scale * Math.sin(crater.angle) +
        Math.sin(angle) * crater.ry * scale * Math.cos(crater.angle)
    };
  }

  /** Draw a sampled half-wall as independent quads, avoiding stroke miters at inspection zoom.
   * @param {PIXI.Graphics} graphics
   * @param {{x:number,y:number,rx:number,ry:number,angle:number,rimMask?:boolean[]}} crater
   * @param {number} direction @param {number} innerScale @param {number} outerScale
   * @param {number} color @param {number} alpha
   */
  function paintAsteroidCraterBand(graphics, crater, direction, innerScale, outerScale, color, alpha) {
    graphics.lineStyle(0);
    graphics.beginFill(color, alpha);
    for (var step = -6; step < 6; step += 1) {
      var a = direction + step * 0.105, next = direction + (step + 1) * 0.105;
      if (!asteroidCraterRimVisible(crater, a) || !asteroidCraterRimVisible(crater, next)) continue;
      var outerA = asteroidCraterPoint(crater, a, outerScale);
      var outerB = asteroidCraterPoint(crater, next, outerScale);
      var innerB = asteroidCraterPoint(crater, next, innerScale);
      var innerA = asteroidCraterPoint(crater, a, innerScale);
      graphics.drawPolygon([outerA.x, outerA.y, outerB.x, outerB.y,
        innerB.x, innerB.y, innerA.x, innerA.y]);
    }
    graphics.endFill();
  }

  /** @param {PIXI.Graphics} graphics
   * @param {{x:number,y:number,rx:number,ry:number,angle:number,rimMask?:boolean[]}} crater
   * @param {number} innerScale @param {number} outerScale @param {number} color @param {number} alpha
   */
  function paintAsteroidCraterRing(graphics, crater, innerScale, outerScale, color, alpha) {
    graphics.lineStyle(0);
    graphics.beginFill(color, alpha);
    for (var step = 0; step < 28; step += 1) {
      var a = step / 28 * Math.PI * 2, next = (step + 1) / 28 * Math.PI * 2;
      if (!asteroidCraterRimVisible(crater, a) || !asteroidCraterRimVisible(crater, next)) continue;
      var outerA = asteroidCraterPoint(crater, a, outerScale), outerB = asteroidCraterPoint(crater, next, outerScale);
      var innerB = asteroidCraterPoint(crater, next, innerScale), innerA = asteroidCraterPoint(crater, a, innerScale);
      graphics.drawPolygon([outerA.x, outerA.y, outerB.x, outerB.y, innerB.x, innerB.y, innerA.x, innerA.y]);
    }
    graphics.endFill();
  }

  /** @param {PIXI.Graphics} graphics @param {import('./types').LegacyAsteroidVisual} visual */
  function paintAsteroidBase(graphics, visual) {
    graphics.clear();
    graphics.lineStyle(0);
    graphics.beginFill(asteroidCompositionColor(visual.bulk, 0.96), 1);
    graphics.drawPolygon(visual.shape);
    graphics.endFill();
    visual.cells.forEach(function (cell) {
      graphics.lineStyle(0);
      graphics.beginFill(cell.color, 1);
      graphics.drawPolygon(cell.points);
      graphics.endFill();
    });
    var outline = asteroidCompositionColor(visual.bulk, 1);
    var outlineRgb = [(outline >> 16) & 255, (outline >> 8) & 255, outline & 255];
    graphics.lineStyle(1, asteroidColor(outlineRgb, 1.28), 0.82);
    graphics.drawPolygon(visual.shape);
    visual.fractures.forEach(function (fracture) {
      graphics.lineStyle(1, fracture.color, 0.34);
      graphics.moveTo(fracture.points[0], fracture.points[1]);
      for (var point = 2; point < fracture.points.length; point += 2) {
        graphics.lineTo(fracture.points[point], fracture.points[point + 1]);
      }
    });
    visual.pits.forEach(function (pit) {
      graphics.lineStyle(0);
      graphics.beginFill(pit.color, 0.55);
      graphics.drawCircle(pit.x, pit.y, pit.radius);
      graphics.endFill();
    });
    visual.craters.forEach(function (crater) {
      graphics.lineStyle(0);
      graphics.beginFill(crater.floor, 0.96);
      graphics.drawPolygon(asteroidCraterEllipse(crater, 0.92, 0, 0));
      graphics.endFill();
      paintAsteroidCraterRing(graphics, crater, 1.01, 1.11, crater.rim, 0.38);
    });
  }

  /** @param {PIXI.Graphics} graphics @param {import('./types').LegacyAsteroidVisual} visual @param {{ x: number, y: number }} localLight */
  function paintAsteroidLighting(graphics, visual, localLight) {
    graphics.clear();
    var lightZ = 0.68;
    var lightScale = 1 / Math.hypot(localLight.x, localLight.y, lightZ);
    var lx = localLight.x * lightScale, ly = localLight.y * lightScale, lz = lightZ * lightScale;
    visual.cells.forEach(function (cell) {
      var diffuse = cell.normal.x * lx + cell.normal.y * ly + cell.normal.z * lz;
      var lit = Math.pow(Math.max(0, diffuse), 0.82);
      var brightness = (0.26 + lit * 0.94) * (0.68 + cell.limb * 0.32) - cell.occlusion;
      var delta = brightness - 0.76;
      graphics.lineStyle(0);
      graphics.beginFill(delta >= 0 ? 0xfff3d5 : 0x101722,
        Math.min(delta >= 0 ? 0.16 : 0.46, Math.abs(delta) * (delta >= 0 ? 0.36 : 0.68)));
      graphics.drawPolygon(cell.points);
      graphics.endFill();
    });
    visual.microBumps.forEach(function (bump) {
      var microDiffuse = bump.normal.x * lx + bump.normal.y * ly + bump.normal.z * lz;
      var grazing = Math.pow(1 - Math.max(0, Math.min(1, microDiffuse)), 0.9) *
        smoothstep((microDiffuse + 0.45) / 0.85);
      var alpha = Math.min(0.44, Math.abs(bump.strength) * visual.surfaceProfile.grazingBoost *
        grazing * (0.55 + bump.normal.z * 0.45) * 4);
      if (alpha < 0.01) return;
      // Fine roughness represents raised grains. Explicit pits and crater bowls
      // carry the inverse lighting language; mixing both here made half of this
      // field read as bumps with shadows pointing toward the light.
      var alongX = lx, alongY = ly;
      var acrossX = -alongY * bump.aspect, acrossY = alongX * bump.aspect;
      var reach = bump.radius * (1.1 + grazing * 0.75);
      graphics.lineStyle(0);
      graphics.beginFill(0xfff5dc, alpha * 0.82);
      graphics.drawPolygon([bump.x, bump.y,
        bump.x + alongX * reach + acrossX * bump.radius, bump.y + alongY * reach + acrossY * bump.radius,
        bump.x + alongX * reach - acrossX * bump.radius, bump.y + alongY * reach - acrossY * bump.radius]);
      graphics.endFill();
      graphics.beginFill(0x080d12, alpha);
      graphics.drawPolygon([bump.x, bump.y,
        bump.x - alongX * reach + acrossX * bump.radius, bump.y - alongY * reach + acrossY * bump.radius,
        bump.x - alongX * reach - acrossX * bump.radius, bump.y - alongY * reach - acrossY * bump.radius]);
      graphics.endFill();
    });
    visual.craters.forEach(function (crater) {
      var adjustedX = localLight.x - (crater.normal ? crater.normal.x * 0.32 : 0);
      var adjustedY = localLight.y - (crater.normal ? crater.normal.y * 0.32 : 0);
      var lightDirection = Math.atan2(adjustedY, adjustedX) - crater.angle;
      var shadowDirection = lightDirection + Math.PI;
      graphics.lineStyle(0);
      graphics.beginFill(crater.shadow, 0.18);
      graphics.drawPolygon(asteroidCraterEllipse(crater, 0.7,
        -adjustedX * crater.rx * 0.1, -adjustedY * crater.ry * 0.12));
      graphics.endFill();
      // The raised outer lip lights like a bump, but the concave inner wall is
      // counter-shaded: its near/lightward wall is dark and the far wall faces
      // back toward the light. Keeping these cues separate makes the bowl read.
      paintAsteroidCraterBand(graphics, crater, lightDirection, 1.04, 1.09, crater.rim, 0.42);
      paintAsteroidCraterBand(graphics, crater, lightDirection, 0.79, 0.91, crater.shadow, 0.82);
      paintAsteroidCraterBand(graphics, crater, shadowDirection, 0.8, 0.91, crater.rim, 0.7);
    });
  }

  /** @param {LegacyAsteroidGraphic} graphic @param {Asteroid} asteroid */
  function legacyPaintAsteroid(graphic, asteroid) {
    graphic.container.position.set(asteroid.position.x, asteroid.position.y);
    graphic.container.rotation = asteroid.rotation;
    var key = asteroid.id + ':' + asteroid.radius;
    if (graphic.artworkKey !== key || !graphic.visual) {
      graphic.visual = legacyAsteroidVisualDescription(asteroid);
      graphic.artworkKey = key;
      graphic.lightBucket = Infinity;
      paintAsteroidBase(graphic.base, graphic.visual);
    }
    var bucket = Math.round(asteroid.rotation / ASTEROID_LIGHT_STEP);
    if (graphic.lightBucket === bucket) return;
    graphic.lightBucket = bucket;
    var sampledRotation = bucket * ASTEROID_LIGHT_STEP;
    var c = Math.cos(-sampledRotation), s = Math.sin(-sampledRotation);
    paintAsteroidLighting(graphic.lighting, graphic.visual, {
      x: WORLD_LIGHT.x * c - WORLD_LIGHT.y * s,
      y: WORLD_LIGHT.x * s + WORLD_LIGHT.y * c
    });
  }

  var ASTEROID_FRAGMENT_SHADER = asteroidArt.shaderSource + [
    // A deliberately constructed cut plane: six unequal straight edges, not a
    // crater-like radial outline. This is only a stencil through the upper layer.
    'vec2 cavityField(vec2 p){',
    ' vec2 d=(p-uPocket.xy)/max(.001,uPocket.z);float ca=.982,sa=.189;vec2 q=vec2(d.x*ca-d.y*sa,d.x*sa+d.y*ca);q.y/=.78;',
    ' float shape=dot(q,vec2(.94,.34))/.96;shape=max(shape,dot(q,vec2(.12,.99))/.82);shape=max(shape,dot(q,vec2(-.78,.62))/.92);',
    ' shape=max(shape,dot(q,vec2(-.98,-.18))/.88);shape=max(shape,dot(q,vec2(-.28,-.96))/.84);shape=max(shape,dot(q,vec2(.72,-.69))/.91);',
    ' float aa=max(.006,uPixelFootprint/max(.001,uPocket.z));float mask=(1.0-smoothstep(1.0-aa,1.0+aa,shape))*uPocket.w;return vec2(shape,mask);',
    '}',
    // A flatter broken-rock height field with its own normals. Excavation removes
    // broad exterior geology, but the exposed material remains visibly rough.
    'float interiorHeight(vec2 p,float footprint){return filteredFbm(p,uSeed*2.31,16.0,footprint)*.026+wave(p,uSeed+149.0,4.2)*.012;}',
    'vec3 interiorNormal(vec2 p,float footprint){float e=max(.00045,min(.004,footprint*.8));float dx=(interiorHeight(p+vec2(e,0.0),footprint)-interiorHeight(p-vec2(e,0.0),footprint))/(2.0*e);float dy=(interiorHeight(p+vec2(0.0,e),footprint)-interiorHeight(p-vec2(0.0,e),footprint))/(2.0*e);return normalize(vec3(-dx,-dy,1.0));}',
    // Engineered access uses the same height/gradient/occlusion contract as a
    // crater, so it participates in exterior lighting instead of painting black.
    'vec4 engineeredOpening(vec2 p){',
    ' vec2 radial=vec2(cos(uTunnel.x),sin(uTunnel.x));vec2 tangent=vec2(-radial.y,radial.x);vec2 center=radial*boundary(radial)*.982;vec2 d=p-center;',
    ' float rx=max(.001,uTunnel.z),ry=max(.001,uTunnel.y);vec2 e=vec2(dot(d,radial)/rx,dot(d,tangent)/ry);float q=length(e);if(q>=1.22||uTunnel.w<=0.0)return vec4(0.0);',
    ' float safeQ=max(q,.00001);vec2 dq=(e.x*radial/rx+e.y*tangent/ry)/safeQ;float h=0.0;vec2 grad=vec2(0.0);float occ=0.0;',
    ' if(q<1.0){float bowl=1.0-q*q;h=-bowl*.052;grad=2.0*.052*q*dq;occ=(1.0-q)*.68;}',
    ' float rimD=(q-1.0)/.13;float rim=exp(-rimD*rimD)*.005;h+=rim;grad+=rim*(-2.0*(q-1.0)/(.13*.13))*dq;',
    ' return vec4(h,grad,occ)*uTunnel.w;',
    '}',
    Driftworks.miningLights?Driftworks.miningLights.shaderSource:'vec3 rigIllumination(vec3 p,vec3 n){return vec3(0.);}',
    'void main(){',
    ' vec2 p=vLocalCoord;float q=length(p)/boundary(p);float aa=uPixelFootprint/max(boundary(p),.001);float alpha=1.0-smoothstep(1.0-aa,1.0,q);if(alpha<=0.0){gl_FragColor=vec4(0.0);return;}',
    ' float footprint=uPixelFootprint;vec4 crater=craterSurface(p);vec4 opening=engineeredOpening(p);vec3 n=normalAt(p,crater.yz+opening.yz,footprint);vec3 light=normalize(uLight);float ndl=dot(n,light);float lit=pow(max(0.0,ndl),.82);float limb=sqrt(max(0.0,1.0-q*q));float grazing=pow(1.0-sat(ndl),1.25);',
    ' vec4 c=composition(p);vec3 albedo=materialColor(c);',
    ' float rough=microRelief(p,footprint)/max(.001,uProfile.x*.011);float brightness=(.22+lit*.98)*(.66+limb*.34)-crater.w-opening.w;brightness+=rough*uProfile.z*grazing*.16;',
    ' vec3 color=albedo*clamp(brightness,.12,1.28);color+=vec3(1.0,.94,.81)*pow(max(0.0,ndl),8.0)*.035;',
    ' vec2 cavity=cavityField(p);float reveal=cavity.y;float projectedLight=cavityField(p-uCavityShadow).y;',
    ' vec2 floorPoint=uPocket.xy+(p-uPocket.xy-uCavityParallax)*.62;vec3 floorAlbedo=materialColor(composition(floorPoint));',
    ' vec3 floorN=interiorNormal(floorPoint,footprint*.62);vec3 workLight=normalize(vec3(-.38,-.22,.9));float floorNdl=max(0.0,dot(floorN,light));float workNdl=max(0.0,dot(floorN,workLight));float floorGrain=interiorHeight(floorPoint,footprint*.62);',
    ' float workPool=.72+wave(floorPoint,uSeed+211.0,2.4)*.18;float castLight=.16+.84*projectedLight;float floorBrightness=.12+pow(floorNdl,.82)*.2*castLight+pow(workNdl,.72)*.2*workPool+floorGrain*.88;',
    ' vec3 floorColor=floorAlbedo*clamp(floorBrightness,.13,.64)+vec3(.052,.036,.018)*(.42+workNdl*.58)*workPool;',
    // The lower plane is unbounded: the aperture clips it, never its own edge.
    // Separation comes from texture parallax and the upper stencil's cast shadow.
    ' color=mix(color,floorColor,reveal);color+=albedo*rigIllumination(vec3(p,0.),n);',
    ' gl_FragColor=vec4(color*alpha,alpha);',
    '}'
  ].join('\n');

  var ASTEROID_VERTEX_SHADER = [
    'precision highp float;',
    'attribute vec2 aVertexPosition;',
    'uniform mat3 translationMatrix;',
    'uniform mat3 projectionMatrix;',
    'varying vec2 vLocalCoord;',
    'void main(){',
    ' vLocalCoord=aVertexPosition;',
    ' vec3 position=projectionMatrix*translationMatrix*vec3(aVertexPosition,1.0);',
    ' gl_Position=vec4(position.xy,0.0,1.0);',
    '}'
  ].join('\n');

  /** @param {AsteroidGraphic} graphic @param {import('./types').AsteroidVisual} visual */
  function updateAsteroidCraterTexture(graphic, visual) {
    graphic.craterBytes.set(asteroidCraterBytes(visual));
    graphic.craterTexture.baseTexture.update();
  }

  /** @returns {AsteroidGraphic} */
  function createAsteroidGraphic() {
    var container = new PIXI.Container();
    // Raw bytes must never pass through canvas alpha/color conversion.
    var craterBytes = new Uint8Array(ASTEROID_CRATER_TEXTURE_WIDTH * 4);
    var craterTexture = PIXI.Texture.fromBuffer(craterBytes, ASTEROID_CRATER_TEXTURE_WIDTH, 1);
    craterTexture.baseTexture.scaleMode = 0;
    craterTexture.baseTexture.alphaMode = 0;
    var geometry = new PIXI.Geometry()
      .addAttribute('aVertexPosition', [-1.02, -1.02, 1.02, -1.02, 1.02, 1.02, -1.02, 1.02], 2)
      .addIndex([0, 1, 2, 0, 2, 3]);
    var shader = PIXI.Shader.from(ASTEROID_VERTEX_SHADER, ASTEROID_FRAGMENT_SHADER,
      Object.assign({ uCraterData: craterTexture, uCraterTextureWidth: ASTEROID_CRATER_TEXTURE_WIDTH },Driftworks.miningLights?Driftworks.miningLights.uniforms([],[0,0,0],0,1):{}));
    var mesh = new PIXI.Mesh(geometry, shader);
    container.addChild(mesh);
    return { container: container, mesh: mesh, shader: shader, craterBytes: craterBytes,
      craterTexture: craterTexture, visual: null, artworkKey: '', cavityParallax: { x: 0, y: 0 } };
  }

  /** @param {AsteroidGraphic} graphic @param {Asteroid} asteroid @param {number} [zoom] @param {import('./types').Camera} [camera] @param {number} [viewportHeight] */
  function paintAsteroid(graphic, asteroid, zoom, camera, viewportHeight) {
    graphic.container.position.set(asteroid.position.x, asteroid.position.y);
    graphic.container.rotation = asteroid.rotation;
    var key = asteroid.id + ':' + asteroid.radius;
    if (graphic.artworkKey !== key || !graphic.visual) {
      graphic.visual = asteroidVisualDescription(asteroid);
      graphic.artworkKey = key;
      graphic.mesh.scale.set(asteroid.radius);
      if (graphic.craterBytes) updateAsteroidCraterTexture(graphic, graphic.visual);
      var nextUniforms = /** @type {Record<string, unknown>} */ (asteroidShaderUniforms(graphic.visual));
      Object.keys(nextUniforms).forEach(function (name) { graphic.shader.uniforms[name] = nextUniforms[name]; });
    }
    var c = Math.cos(-asteroid.rotation), s = Math.sin(-asteroid.rotation);
    var lightUniform = /** @type {Float32Array} */ (graphic.shader.uniforms.uLight);
    lightUniform[0] = WORLD_LIGHT.x * c - WORLD_LIGHT.y * s;
    lightUniform[1] = WORLD_LIGHT.x * s + WORLD_LIGHT.y * c;
    lightUniform[2] = WORLD_LIGHT.z;
    graphic.shader.uniforms.uPixelFootprint = 1 / Math.max(1, asteroid.radius * (zoom || 1));
    var excavation = asteroid.excavation;
    graphic.shader.uniforms.uPocket = new Float32Array(excavation ?
      [excavation.pocketOffset.x, excavation.pocketOffset.y, excavation.pocketRadius, excavation.level > 0 ? 1 : 0] : [0, 0, 0.001, 0]);
    graphic.shader.uniforms.uTunnel = new Float32Array(excavation ?
      [excavation.tunnelAngle, 0.021, 0.048, excavation.level > 0 ? 1 : 0] : [0, 0.001, 0.001, 0]);
    var cameraOffsetX = camera ? (camera.x - asteroid.position.x) / asteroid.radius : 0;
    var cameraOffsetY = camera ? (camera.y - asteroid.position.y) / asteroid.radius : 0;
    // Cast the view ray through the upper aperture onto the deeper plane. Convert
    // the world-space camera displacement into asteroid-local coordinates, then
    // move the visible floor in the opposite direction to the camera.
    var localCameraX = cameraOffsetX * c - cameraOffsetY * s;
    var localCameraY = cameraOffsetX * s + cameraOffsetY * c;
    var depthUnits = excavation ? excavation.depthM / sim.METERS_PER_UNIT : 0;
    var worldViewportHeight = (viewportHeight || 570) / Math.max(0.01, zoom || 1);
    var virtualCameraHeight = worldViewportHeight * 0.5 / Math.tan(Math.PI / 12);
    var depthToCamera = depthUnits / Math.max(depthUnits + 1, virtualCameraHeight);
    var desiredParallaxX = excavation ? Math.max(-0.085, Math.min(0.085, -localCameraX * depthToCamera)) : 0;
    var desiredParallaxY = excavation ? Math.max(-0.07, Math.min(0.07, -localCameraY * depthToCamera)) : 0;
    var cavityParallax = graphic.cavityParallax || (graphic.cavityParallax = { x: desiredParallaxX, y: desiredParallaxY });
    cavityParallax.x += (desiredParallaxX - cavityParallax.x) * 0.18;
    cavityParallax.y += (desiredParallaxY - cavityParallax.y) * 0.18;
    graphic.shader.uniforms.uCavityParallax = new Float32Array([cavityParallax.x, cavityParallax.y]);
    var shadowScale = depthUnits / asteroid.radius / Math.max(0.2, lightUniform[2]);
    graphic.shader.uniforms.uCavityShadow = new Float32Array(excavation ?
      [-lightUniform[0] * shadowScale, -lightUniform[1] * shadowScale] : [0, 0]);
  }

  /** Playground/debug control; azimuth and elevation are radians. */
  /** @param {number} azimuth @param {number} elevation */
  function setAsteroidLight(azimuth, elevation) {
    var horizontal = Math.cos(elevation);
    WORLD_LIGHT.x = Math.cos(azimuth) * horizontal;
    WORLD_LIGHT.y = Math.sin(azimuth) * horizontal;
    WORLD_LIGHT.z = Math.max(0.08, Math.sin(elevation));
  }

  /**
   * @param {Vec2} target @param {Viewport} view @param {number} [inset]
   * @returns {{ visible: boolean, position: Vec2, direction: Vec2 }}
   */
  function contactEdgeMarker(target, view, inset) {
    inset = inset === undefined ? 26 : inset;
    var center = { x: view.width / 2, y: view.height / 2 };
    var minX = inset, maxX = Math.max(inset, view.width - inset);
    var minY = inset, maxY = Math.max(inset, view.height - inset);
    var dx = target.x - center.x, dy = target.y - center.y;
    var length = Math.hypot(dx, dy) || 1;
    var direction = { x: dx / length, y: dy / length };
    if (target.x >= minX && target.x <= maxX && target.y >= minY && target.y <= maxY) {
      return { visible: false, position: target, direction: direction };
    }
    var tx = dx > 0 ? (maxX - center.x) / dx : dx < 0 ? (minX - center.x) / dx : Infinity;
    var ty = dy > 0 ? (maxY - center.y) / dy : dy < 0 ? (minY - center.y) / dy : Infinity;
    var scale = Math.min(tx > 0 ? tx : Infinity, ty > 0 ? ty : Infinity);
    return { visible: true, position: { x: center.x + dx * scale, y: center.y + dy * scale }, direction: direction };
  }

  /** @param {Drone} drone @param {Vec2} center @param {number} [radius] */
  function contactEtaSeconds(drone, center, radius) {
    radius = radius === undefined ? LOCAL_OPERATING_AREA_RADIUS : radius;
    var dx = drone.position.x - center.x, dy = drone.position.y - center.y;
    var distance = Math.hypot(dx, dy);
    if (distance <= radius) return 0;
    var closingSpeed = distance ? -(dx * drone.velocity.x + dy * drone.velocity.y) / distance : 0;
    return closingSpeed > 0.01 ? Math.max(0, (distance - radius) / closingSpeed) : Infinity;
  }

  /** @param {Drone[]} drones @param {Vec2} center */
  function contactTrackState(drones, center) {
    var nearest = drones.reduce(function (distance, drone) {
      return Math.min(distance, Math.hypot(drone.position.x - center.x, drone.position.y - center.y));
    }, Infinity);
    if (nearest > 3500) return { key: 'possible', label: 'POSSIBLE', uncertainty: 0.34, alpha: 0.42 };
    if (nearest > 2200) return { key: 'tracking', label: 'TRACKING', uncertainty: 0.2, alpha: 0.66 };
    if (nearest > 1000) return { key: 'resolved', label: 'RESOLVED', uncertainty: 0.08, alpha: 0.9 };
    return { key: 'local', label: 'LOCAL', uncertainty: 0, alpha: 1 };
  }

  /** @param {PIXI.Graphics} marker @param {PIXI.Text} label @param {World} world @param {Viewport} view */
  function paintContactOverlay(marker, label, world, view) {
    var offscreen = world.combat.drones.filter(function (drone) {
      return contactEdgeMarker(worldToScreen(drone.position, world.camera, view), view).visible;
    });
    marker.clear();
    marker.visible = offscreen.length > 0;
    label.visible = offscreen.length > 0;
    if (!offscreen.length) return;
    var average = offscreen.reduce(function (sum, drone) {
      var screen = worldToScreen(drone.position, world.camera, view);
      return { x: sum.x + screen.x / offscreen.length, y: sum.y + screen.y / offscreen.length };
    }, { x: 0, y: 0 });
    var edge = contactEdgeMarker(average, view);
    var d = edge.direction, side = { x: -d.y, y: d.x }, p = edge.position;
    marker.lineStyle(2, 0xf0c778, 0.95);
    marker.moveTo(p.x + side.x * 8, p.y + side.y * 8);
    marker.lineTo(p.x, p.y);
    marker.lineTo(p.x - side.x * 8, p.y - side.y * 8);
    marker.moveTo(p.x, p.y);
    marker.lineTo(p.x - d.x * 18, p.y - d.y * 18);
    marker.lineStyle(1, 0xf0c778, 0.28);
    marker.moveTo(p.x - d.x * 24 + side.x * 12, p.y - d.y * 24 + side.y * 12);
    marker.lineTo(p.x - d.x * 24 - side.x * 12, p.y - d.y * 24 - side.y * 12);
    var home = world.ships.filter(function (ship) { return ship.type === 'mothership'; })[0];
    var localCenter = home ? home.position : { x: 0, y: 0 };
    var track = contactTrackState(world.combat.drones, localCenter);
    marker.alpha = track.alpha;
    var angle = Math.atan2(d.y, d.x);
    if (track.uncertainty > 0) {
      var reach = track.key === 'possible' ? 38 : track.key === 'tracking' ? 31 : 25;
      marker.lineStyle(1, 0xb8cbd1, track.key === 'possible' ? 0.28 : 0.42);
      marker.moveTo(p.x, p.y);
      marker.lineTo(p.x - Math.cos(angle - track.uncertainty) * reach, p.y - Math.sin(angle - track.uncertainty) * reach);
      marker.moveTo(p.x, p.y);
      marker.lineTo(p.x - Math.cos(angle + track.uncertainty) * reach, p.y - Math.sin(angle + track.uncertainty) * reach);
    }
    if (track.key === 'local') {
      marker.lineStyle(1.5, 0xf0c778, 0.85);
      marker.drawCircle(p.x - d.x * 13, p.y - d.y * 13, 8);
    } else if (track.key === 'resolved') {
      marker.beginFill(0xf0c778, 0.9);
      marker.moveTo(p.x, p.y);
      marker.lineTo(p.x - d.x * 17 + side.x * 6, p.y - d.y * 17 + side.y * 6);
      marker.lineTo(p.x - d.x * 17 - side.x * 6, p.y - d.y * 17 - side.y * 6);
      marker.closePath();
      marker.endFill();
    }
    var eta = offscreen.reduce(function (soonest, drone) {
      return Math.min(soonest, contactEtaSeconds(drone, localCenter));
    }, Infinity);
    var etaStep = track.key === 'possible' ? 10 : track.key === 'tracking' ? 5 : 1;
    var etaText = Number.isFinite(eta) ? (track.key === 'possible' || track.key === 'tracking' ? '~' : '') +
      Math.max(0, Math.ceil(eta / etaStep) * etaStep) + 's' : '—';
    var sources = track.key === 'possible' ? 'MULTIPLE?' : track.key === 'tracking' ?
      Math.max(1, offscreen.length - 1) + '–' + (offscreen.length + 1) + ' SOURCES' :
      offscreen.length + (offscreen.length === 1 ? ' SOURCE' : ' SOURCES');
    label.alpha = track.alpha;
    label.text = 'CONTACT 01  ·  ' + track.label + '  ·  ' + sources + '  ·  ' + etaText;
    label.anchor.set(d.x > 0.35 ? 1 : d.x < -0.35 ? 0 : 0.5, d.y > 0.35 ? 1 : 0);
    label.position.set(p.x - d.x * 30, p.y - d.y * 30);
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

    pushDebris(effects, position, velocity, 9);
  }

  /** @param {VisualEffect[]} effects @param {Vec2} position @param {Vec2} velocity @param {number} count */
  function pushDebris(effects, position, velocity, count) {
    for (var i = 0; i < count; i += 1) {
      var fragment = new PIXI.Graphics();
      fragment.lineStyle(2, 0xd6b5aa, 0.9);
      fragment.moveTo(-3, 0);
      fragment.lineTo(3, 0);
      fragment.position.set(position.x, position.y);
      fragment.rotation = i * 0.7;
      effects.push({
        graphic: fragment,
        age: 0,
        life: 0.7 + (i % 3) * 0.12,
        vx: velocity.x * 0.7 + Math.cos(i * 0.7) * (55 + i * 5),
        vy: velocity.y * 0.7 + Math.sin(i * 0.7) * (55 + i * 5),
        scale: 1,
        alpha: 1
      });
    }
  }

  /** @param {Rng} rng @param {number} width @param {number} height @param {number} count @param {number} parallax @param {number} alpha */
  function createStarLayer(rng, width, height, count, parallax, alpha) {
    /** @type {{x: number; y: number; size: number}[]} */
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
    createScene: createScene,
    asteroidVisualDescription: asteroidVisualDescription,
    asteroidSurfaceSample: asteroidSurfaceSample,
    createAsteroidGraphic: createAsteroidGraphic,
    paintAsteroid: paintAsteroid,
    setAsteroidLight: setAsteroidLight,
    semanticScale: semanticScale,
    updateEffects: updateEffects,
    zoomCameraAt: zoomCameraAt,
    issueVisualContextOrder: issueVisualContextOrder,
    worldVectorToShipLocalLine: worldVectorToShipLocalLine,
    enginePlumeGeometry: enginePlumeGeometry,
    drawEnginePlume: drawEnginePlume,
    screenToWorld: screenToWorld,
    worldToScreen: worldToScreen,
    contactEdgeMarker: contactEdgeMarker,
    contactEtaSeconds: contactEtaSeconds,
    contactTrackState: contactTrackState,
    viewportFromApp: viewportFromApp,
    computeSelectionFocus: computeSelectionFocus,
    focusCameraToward: focusCameraToward,
    withCamera: withCamera,
    miningEffectGeometry: miningEffectGeometry,
    drawMiningPlume: drawMiningPlume,
    paintRecovery: paintRecovery,
    craftDetail: craftDetail,
    paintShip: paintShip,
    paintIndustrialPlatform: paintIndustrialPlatform,
    drawCraftBrackets: drawCraftBrackets,
    platformDeployment: platformDeployment,
    platformProjection: platformProjection,
    platformRaisedPoint: platformRaisedPoint,
    paintRaisedPlatform: paintRaisedPlatform,
    platformIsWorking: platformIsWorking,
    drumSurfaceAt: drumSurfaceAt,
    mothershipLocalLight: mothershipLocalLight,
    mothershipHabitatUniforms: mothershipHabitatUniforms,
    mothershipHabitatLampVisibility: mothershipHabitatLampVisibility,
    mothershipDrumMarkers: mothershipDrumMarkers,
    mothershipHullHalfWidthAtY: mothershipHullHalfWidthAtY,
    backgroundOptions: function () { return BACKGROUNDS.slice(); },
    normalizeBackgroundSettings: normalizeBackgroundSettings,
    loadBackgroundSettings: loadBackgroundSettings
  };

  if (!global.DRIFTWORKS_TEST_MODE) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(window);
