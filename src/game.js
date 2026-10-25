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

  var shipArt = Driftworks.shipArt;
  if (!shipArt) throw new Error('Ship artwork module did not load.');
  // Compatibility aliases for existing game callers and viewers.
  var SHIP_STYLES = shipArt.styles;
  var cargoModuleGeometry = shipArt.cargoModuleGeometry;
  var craftDetail = shipArt.craftDetail;
  var createMothershipGraphic = shipArt.createMothershipGraphic;
  var drawCraftBrackets = shipArt.drawCraftBrackets;
  var drawEnginePlume = shipArt.drawEnginePlume;
  var drawPlatformWorkers = shipArt.drawPlatformWorkers;
  var drumSurfaceAt = shipArt.drumSurfaceAt;
  var enginePlumeGeometry = shipArt.enginePlumeGeometry;
  var mothershipDrumMarkers = shipArt.mothershipDrumMarkers;
  var mothershipHabitatLampVisibility = shipArt.mothershipHabitatLampVisibility;
  var mothershipHabitatUniforms = shipArt.mothershipHabitatUniforms;
  var mothershipHullHalfWidthAtY = shipArt.mothershipHullHalfWidthAtY;
  var mothershipLocalLight = shipArt.mothershipLocalLight;
  var paintIndustrialPlatform = shipArt.paintIndustrialPlatform;
  var paintRaisedPlatform = shipArt.paintRaisedPlatform;
  var paintShip = shipArt.paintShip;
  var paintTerrainPlatform = shipArt.paintTerrainPlatform;
  var platformDeployment = shipArt.platformDeployment;
  var platformIsWorking = shipArt.platformIsWorking;
  var platformProjection = shipArt.platformProjection;
  var platformRaisedPoint = shipArt.platformRaisedPoint;
  var platformSurfaceNormal = shipArt.platformSurfaceNormal;
  var semanticScale = shipArt.semanticScale;
  var worldDeltaToShipLocal = shipArt.worldDeltaToShipLocal;
  var worldVectorToShipLocalLine = shipArt.worldVectorToShipLocalLine;
  var sessions = /** @type {import('./types').SessionApi} */ (Driftworks.session);
  var STEP_SECONDS = 1 / 30;
  var MAX_FRAME_SECONDS = 0.2;
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
