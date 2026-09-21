(function (global) {
  'use strict';

  /** @typedef {import('./types').DriftworksNamespace} DriftworksNamespace */
  /** @typedef {import('./types').World} World */
  /** @typedef {import('./types').HudActions} HudActions */
  /** @typedef {import('./types').GameStats} GameStats */
  /** @typedef {import('./types').SimApi} SimApi */
  /** @typedef {import('./types').AudioApi} AudioApi */
  /** @type {DriftworksNamespace} */
  var Driftworks = (global.Driftworks = global.Driftworks || {});
  var sim = /** @type {SimApi} */ (Driftworks.sim);
  var audio = /** @type {AudioApi} */ (Driftworks.audio);

  /** @param {string} selector @returns {HTMLElement} */
  function requiredElement(selector) {
    var element = /** @type {HTMLElement | null} */ (document.querySelector(selector));
    if (!element) throw new Error('Missing HUD element: ' + selector);
    return element;
  }

  /** @param {HTMLElement} host @param {HudActions} actions */
  function createHud(host, actions) {
    host.innerHTML =
      '<header class="top-bar" aria-label="Mission status" aria-live="off">' +
      '<div class="mission-clock" data-role="clock"></div>' +
      '<div class="time-buttons" role="group" aria-label="Simulation speed">' +
      '<button type="button" data-speed="0" aria-label="Pause simulation" title="Pause"><span aria-hidden="true">Ⅱ</span></button>' +
      '<button type="button" data-speed="1" aria-label="Play at normal speed" title="Normal speed">▶ 1×</button>' +
      '<button type="button" data-speed="2" aria-label="Fast forward at 2 times speed" title="Fast forward 2×">2×</button>' +
      '<button type="button" data-speed="4" aria-label="Fast forward at 4 times speed" title="Fast forward 4×">4×</button>' +
      '</div><strong class="sr-only" data-role="time-speed" aria-live="polite"></strong>' +
      '<div class="mission-summary"><strong data-role="location"></strong><span aria-hidden="true">·</span><strong data-role="money"></strong><span aria-hidden="true">·</span>' +
      '<div class="quota"><strong>ORE <span data-role="quota"></span></strong><progress data-role="quota-progress" max="1" value="0"></progress></div></div></header>' +
      '<section class="command-shelf" aria-label="Command shelf">' +
      '<section class="shelf-region fleet-panel" aria-label="Fleet delta-v"><div class="shelf-heading">FLEET <span>REMAINING Δv</span></div><div class="fleet-list" data-role="fleet"></div></section>' +
      '<section class="shelf-region selection-panel" aria-label="Selection and local operations"><div class="selection-card"><div class="shelf-heading">SELECTION</div>' +
      '<strong class="selection-title" data-role="selection"></strong><span class="selection-status" data-role="selection-status"></span>' +
      '<div class="selection-metrics"><div><span>Δv remaining</span><strong data-role="selection-dv">—</strong></div><div><span>Fuel</span><strong data-role="selection-fuel">—</strong></div></div></div></section>' +
      '<section class="shelf-region operations-panel" aria-label="Local operations"><div class="operations-card"><div class="shelf-heading">LOCAL OPERATIONS</div><div class="selection-readouts"><div><span>Asteroid ore</span><strong data-role="field"></strong></div><div><span>Mining</span><strong data-role="mining"></strong></div><div><span>Recovery</span><strong data-role="recovery"></strong></div><div><span>Depot</span><strong data-role="depot"></strong></div><div><span>Sections</span><strong data-role="sections"></strong></div><div><span>Launch / catch</span><strong>32 m/s Δv</strong></div></div>' +
      '<details class="population-panel"><summary><span>People aboard</span><strong data-role="population"></strong></summary><div data-role="platform-staff"></div><div data-role="crew"></div><div data-role="person" aria-live="polite"></div></details></div></section>' +
      '<section class="shelf-region controls" aria-label="Commands"><div class="shelf-heading">COMMANDS</div><div class="command-buttons">' +
      '<button type="button" class="primary-command" data-action="return-home">Return to mothership</button>' +
      '<button type="button" data-action="deploy-platform">Deploy mining platform</button>' +
      '<button type="button" data-action="end-mining">End mining & recover</button>' +
      '<button type="button" data-action="salvage-all">Salvage all</button>' +
      '</div><div class="shelf-status"><strong data-role="contacts"></strong><span>Salvaged <strong data-role="salvaged"></strong></span></div>' +
      '<div class="shelf-menus"><details><summary>Menu</summary><div class="menu-popover"><button type="button" data-action="save">Save</button><button type="button" data-action="export">Export scenario</button><button type="button" data-action="load">Load</button><button type="button" data-action="reset">Reset</button></div></details>' +
      '<details><summary>Settings</summary><div class="menu-popover"><label class="volume-control">SFX<input type="range" min="0" max="100" step="1" data-action="sfx" aria-label="Sound effects volume"><output data-role="sfx-volume"></output></label><label class="volume-control">Music<input type="range" min="0" max="100" step="1" data-action="music" aria-label="Music volume"><output data-role="music-volume"></output></label></div></details>' +
      '<details><summary>Help</summary><div class="menu-popover hint">RMB: order / return · Wheel: zoom · Space or MMB: pan · F: focus selection</div></details>' +
      '<details><summary>Dev</summary><div class="menu-popover"><button type="button" data-action="stress">Stress</button><span data-role="entities"></span></div></details></div></section></section>';

    var deployButton = /** @type {HTMLButtonElement} */ (host.querySelector('[data-action="deploy-platform"]'));
    if (!deployButton) throw new Error('Missing deploy button');
    requiredElement('[data-action="end-mining"]').addEventListener('click', actions.onEndMining);
    requiredElement('[data-action="salvage-all"]').addEventListener('click', actions.onSalvageAll);
    requiredElement('[data-action="return-home"]').addEventListener('click', actions.onReturnHome);
    deployButton.addEventListener('click', actions.onDeployPlatform);
    var stressButton = /** @type {HTMLButtonElement} */ (host.querySelector('[data-action="stress"]'));
    var fleet = /** @type {HTMLElement} */ (host.querySelector('[data-role="fleet"]'));
    var crewPanel = requiredElement('[data-role="crew"]');
    var personPanel = requiredElement('[data-role="person"]');
    var inspectedPerson = '';
    var crewSignature = '';
    crewPanel.addEventListener('click', function (event) {
      var target = /** @type {Element | null} */ (event.target);
      var button = target && target.closest('[data-person]');
      if (button) inspectedPerson = /** @type {HTMLElement} */ (button).dataset.person || '';
    });
    if (!stressButton || !fleet) throw new Error('Missing HUD controls');
    fleet.addEventListener('click', function (event) {
      var eventTarget = /** @type {Element | null} */ (event.target);
      var button = eventTarget && eventTarget.closest('[data-ship]');
      if (button) actions.onSelectShip((/** @type {HTMLElement} */ (button)).dataset.ship);
    });
    var timeButtons = /** @type {NodeListOf<HTMLButtonElement>} */ (host.querySelectorAll('[data-speed]'));
    timeButtons.forEach(function (button) {
      button.addEventListener('click', function () { actions.onTimeScale(Number(button.dataset.speed)); });
    });
    var sfxSlider = /** @type {HTMLInputElement} */ (host.querySelector('[data-action="sfx"]'));
    var musicSlider = /** @type {HTMLInputElement} */ (host.querySelector('[data-action="music"]'));
    if (!sfxSlider || !musicSlider) throw new Error('Missing audio controls');
    requiredElement('[data-action="save"]').addEventListener('click', actions.onSave);
    requiredElement('[data-action="export"]').addEventListener('click', actions.onExport);
    requiredElement('[data-action="load"]').addEventListener('click', actions.onLoad);
    requiredElement('[data-action="reset"]').addEventListener('click', actions.onReset);
    stressButton.addEventListener('click', actions.onStressToggle);
    sfxSlider.addEventListener('input', function () { actions.onSfxVolume(Number(sfxSlider.value) / 100); });
    musicSlider.addEventListener('input', function () { actions.onMusicVolume(Number(musicSlider.value) / 100); });

    return {
      /** @param {World} world @param {GameStats} stats */
      update: function (world, stats) {
        if (actions.getPopulation) {
          var population = actions.getPopulation();
          var populationTime = Math.max(population.timeSeconds, world.campaign.timeDays * 86400 + world.elapsedSeconds * sim.PHYSICAL_SECONDS_PER_SECOND);
          requiredElement('[data-role="population"]').textContent = population.total.toLocaleString() + ' residents · ' + Math.round(population.civilianShare * 100) + '% civilian background';
          requiredElement('[data-role="platform-staff"]').textContent = world.platforms.filter(function (p) {
            return p.state === 'deployed' || p.state === 'setting-up' || p.state === 'packing-up';
          }).map(function (p) {
            var count = (p.workerIds || []).length;
            var remaining = 8 * 3600 - (world.elapsedSeconds * sim.PHYSICAL_SECONDS_PER_SECOND - (p.shiftStartedSeconds || 0));
            var operation = p.state === 'setting-up' ? 'setting up · ' + formatMissionTime(p.setupRemainingSeconds || 0) :
              p.state === 'packing-up' ? 'packing up · ' + formatMissionTime(p.packRemainingSeconds || 0) :
              p.evacuationRequested || world.miningMission !== 'active' ? 'awaiting recovery' :
              !count ? 'waiting for crew' : remaining > 0 ? 'shift ends in ' + formatMissionTime(remaining) : 'replacement overdue ' + formatMissionTime(-remaining);
            return p.id + ' · ' + count + '/5 workers · ' + operation;
          }).join('\n');
          var selected = world.ships.filter(function (s) { return world.selectedShipIds.indexOf(s.id) !== -1; });
          var ids = selected.reduce(function (all, s) { return all.concat(s.crewIds || [], s.passengerIds || []); }, /** @type {string[]} */ ([]));
          // Home inspection also exposes deployed workers, so their stories remain reachable.
          if (selected.some(function (s) { return s.type === 'mothership'; })) world.platforms.forEach(function (p) { ids = ids.concat(p.workerIds || []); });
          var selectedPlatform = world.platforms.filter(function (p) { return p.id === world.selectedPlatformId; })[0];
          if (selectedPlatform) ids = ids.concat(selectedPlatform.workerIds || []);
          var signature = ids.join(',') + ':' + population.seed + ':' + world.selectedPlatformId;
          if (signature !== crewSignature) {
            crewSignature = signature;
            crewPanel.replaceChildren();
            ids.forEach(function (id) {
              var person = population.people[id];
              if (!person) return;
              var button = document.createElement('button');
              button.type = 'button'; button.dataset.person = id;
              button.textContent = person.name + ' · ' + person.role;
              crewPanel.appendChild(button);
            });
          }
          var person = population.people[inspectedPerson];
          if (person) {
            var locationShip = world.ships.filter(function (s) { return s.id === person.location; })[0];
            var location = person.location === 'home' ? 'Mothership' : locationShip ? locationShip.name : person.location;
            personPanel.textContent = person.name + ' · ' + person.role + '\n' + location + (person.alive ? '' : ' · deceased') +
              '\nAboard for ' + Math.floor((populationTime - person.joinedSeconds) / 86400) + ' days · duty ' + formatMissionTime(person.dutySeconds + (person.dutyStartedSeconds === null ? 0 : populationTime - person.dutyStartedSeconds)) +
              '\nOvertime ' + formatMissionTime(person.overtimeSeconds) + '\n' + (person.history.length ? person.history.slice(-6).map(function (e) {
                return e.kind.replace(/-/g, ' ') + ' · ' + e.location + ' · ' + e.missionId + ' · day ' + (e.atSeconds / 86400).toFixed(2);
              }).join('\n') : 'No deployments yet.');
          } else personPanel.textContent = 'Select a crew member to inspect their service history.';
        }
        var miningControls = miningControlState(world);
        var salvageButton = /** @type {HTMLButtonElement} */ (host.querySelector('[data-action="salvage-all"]'));
        var homeSelected = world.ships.some(function (ship) {
          return ship.type === 'mothership' && world.selectedShipIds.indexOf(ship.id) !== -1;
        });
        var selectedTug = world.ships.some(function (ship) {
          return ship.type === 'tug' && !ship.disabled && world.selectedShipIds.indexOf(ship.id) !== -1 &&
            !ship.carryingSection && !ship.platformId && !ship.towTarget &&
            (ship.order.kind === 'idle' || ship.order.kind === 'return');
        });
        var selectedShips = world.ships.filter(function (ship) { return world.selectedShipIds.indexOf(ship.id) !== -1; });
        var canReturnHome = selectedShips.some(function (ship) {
          return ship.type !== 'mothership' && ship.type !== 'shuttle' && ship.speed > 0 && !ship.disabled && !ship.docked;
        });
        var returnButton = /** @type {HTMLButtonElement} */ (host.querySelector('[data-action="return-home"]'));
        returnButton.hidden = !canReturnHome;
        salvageButton.disabled = !selectedTug || !world.wrecks.some(function (wreck) { return !wreck.towedBy; }) &&
          !world.ships.some(function (ship) { return ship.type === 'escort' && ship.disabled && !ship.repairRemaining && ship.launchElapsed == null && !ship.towedBy; });
        salvageButton.hidden = !selectedTug;
        deployButton.disabled = !miningControls.canDeploy;
        deployButton.hidden = !homeSelected;
        deployButton.title = miningControls.deployHint;
        var endMiningButton = /** @type {HTMLButtonElement} */ (host.querySelector('[data-action="end-mining"]'));
        endMiningButton.disabled = !miningControls.canEnd;
        endMiningButton.hidden = !homeSelected;
        endMiningButton.textContent = miningControls.endLabel;
        world.ships.forEach(function (ship) {
          var button = /** @type {HTMLButtonElement | undefined} */ (Array.from(fleet.children).filter(function (b) { return /** @type {HTMLElement} */ (b).dataset.ship === ship.id; })[0]);
          if (!button) {
            button = document.createElement('button'); button.type = 'button'; button.dataset.ship = ship.id;
            fleet.appendChild(button);
          }
          var label = ship.name + ' · ' + Math.floor(sim.remainingDeltaV(world, ship)) + ' m/s' +
            (ship.disabled ? ' · disabled' : ship.docked ? ' · docked' : ship.order.kind === 'return' && ship.order.automatic ? ' · returning' : '');
          if (ship.type === 'mothership') label = ship.name + ' · ' + world.platforms.filter(function (p) { return p.state === 'stored'; }).length + ' platforms aboard';
          if (ship.type === 'tug' && (ship.passengerIds || []).length) label += ' · ' + (ship.passengerIds || []).length + ' platform crew';
          if (ship.type === 'tug' && (ship.unloadRemainingSeconds || 0) > 0) label += ' · unloading ' + formatMissionTime(ship.unloadRemainingSeconds || 0);
          if (ship.type === 'shuttle') label += ' · ' + (ship.passengerIds || []).length + '/5 passengers · ' + (ship.order.kind === 'shuttle' ? (ship.order.evacuation ? 'evacuating ' : 'crew to ') + ship.order.platformId : ship.order.kind === 'return' ? 'returning home' : 'automatic');
          if (button.textContent !== label) button.textContent = label;
          button.dataset.active = String(world.selectedShipIds.indexOf(ship.id) !== -1);
        });
        Array.from(fleet.children).forEach(function (b) {
          var fleetButton = /** @type {HTMLElement} */ (b);
          if (!world.ships.some(function (s) { return s.id === fleetButton.dataset.ship; })) fleetButton.remove();
        });
        var audioStatus = audio ? audio.status() : { sfxVolume: 0, musicVolume: 0, available: false };
        requiredElement('[data-role="location"]').textContent = world.campaign.location;
        requiredElement('[data-role="money"]').textContent = '$' + world.campaign.money.toLocaleString();
        requiredElement('[data-role="quota"]').textContent =
          Math.floor(world.mothership.storage.ore) + ' / ' + world.contract.quotaOre + ' t';
        var quotaProgress = /** @type {HTMLProgressElement} */ (host.querySelector('[data-role="quota-progress"]'));
        quotaProgress.value = Math.min(1, world.mothership.storage.ore / world.contract.quotaOre);
        requiredElement('[data-role="field"]').textContent = Math.floor(totalOreRemaining(world)) + ' t accessible · ' +
          (sim.asteroidPhysicalStats(world.asteroids[0]).diameterM / 1000).toFixed(1) + ' km body';
        requiredElement('[data-role="depot"]').textContent =
          world.depot.builtStages + ' / ' + world.depot.totalStages + ' modules · ' + sim.DEPOT_FRAME.lengthM + ' × ' + sim.DEPOT_FRAME.widthM + ' m';
        requiredElement('[data-role="sections"]').textContent =
          world.mothership.storage.depotSections + ' ready · ' + sim.DEPOT_SECTION.lengthM + ' × ' + sim.DEPOT_SECTION.widthM + ' m · ' + Math.floor(world.mothership.storage.constructionMass) + ' t feedstock';
        requiredElement('[data-role="mining"]').textContent = world.miningMission + ' · ' +
          world.platforms.filter(function (p) { return p.state === 'deployed'; }).length + ' deployed · ' + world.packets.length + ' packets';
        requiredElement('[data-role="contacts"]').textContent = String(stats.contacts);
        requiredElement('[data-role="contacts"]').hidden = String(stats.contacts).toLowerCase() === 'quiet';
        requiredElement('[data-role="recovery"]').textContent = (world.wrecks || []).length + ' wrecks · ' +
          world.ships.filter(function (ship) { return ship.disabled; }).length + ' disabled';
        requiredElement('[data-role="salvaged"]').textContent = (world.recovery ? world.recovery.salvagedOre : 0) + ' t';
        requiredElement('[data-role="clock"]').textContent = formatMissionTime((world.elapsedSeconds || 0) * sim.PHYSICAL_SECONDS_PER_SECOND);
        var speed = actions.getTimeScale();
        var speedLabel = speed === 0 ? 'PAUSED' : speed + '× SPEED';
        var speedReadout = requiredElement('[data-role="time-speed"]');
        if (speedReadout.textContent !== speedLabel) speedReadout.textContent = speedLabel;
        timeButtons.forEach(function (button) {
          var active = Number(button.dataset.speed) === speed;
          button.dataset.active = String(active);
          button.setAttribute('aria-pressed', String(active));
        });
        requiredElement('[data-role="entities"]').textContent = stats.entityCount + ' @ ' + (stats.fps || '--') + ' FPS';

        if (world.selectedPlatformId) {
          var selectedPlatform = world.platforms.filter(function (platform) { return platform.id === world.selectedPlatformId; })[0];
          requiredElement('[data-role="selection"]').textContent = selectedPlatform ? selectedPlatform.id : 'None';
          requiredElement('[data-role="selection-status"]').textContent = selectedPlatform ? 'Mining platform · ' +
            (selectedPlatform.workerIds || []).length + '/5 workers · ' + selectedPlatform.state : '';
          requiredElement('[data-role="selection-dv"]').textContent = '—';
          requiredElement('[data-role="selection-fuel"]').textContent = '—';
        } else if (world.selectedShipIds.length === 0) {
          requiredElement('[data-role="selection"]').textContent = 'None';
          requiredElement('[data-role="selection-status"]').textContent = 'Select an entity in the viewport or fleet.';
          requiredElement('[data-role="selection-dv"]').textContent = '—';
          requiredElement('[data-role="selection-fuel"]').textContent = '—';
        } else {
          var selectedDetails = selectedShips.map(function (ship) {
              var status = ship.cargoOperation && ship.cargoOperation.remainingSeconds > 0 ?
                (ship.cargoOperation.kind === 'deploy-platform' || ship.cargoOperation.kind === 'deploy-section' ?
                  'EVA unstrapping ' : 'EVA securing ') + Math.ceil(ship.cargoOperation.remainingSeconds / 60) + 'm' :
                (ship.unloadRemainingSeconds || 0) > 0 ? 'unloading cargo' : ship.repairRemaining ? 'repair ' + Math.ceil(ship.repairRemaining) + 's' :
                ship.launchElapsed != null ? 'launching' : ship.disabled ? 'disabled' : ship.towTarget ? 'hauling ' + (ship.towTarget.kind === 'wreck' ? 'wreck' : 'fighter') : ship.order.kind === 'recover' ? 'recovering' : '';
              if (!status) status = ship.docked ? 'docked / refuelled' : ship.order.kind === 'return' ?
                (ship.order.kind === 'return' && ship.order.automatic ? 'fuel reserve / returning' : 'returning') : ship.order.kind === 'deploy' ? 'deploying platform' :
                ship.order.kind === 'retrieve-platform' ? 'retrieving platform' : ship.propulsion && ship.propulsion.fuelKg < 0.001 ? 'fuel empty / coasting' : '';
              var physical = sim.physicalStats(world, ship);
              return { ship: ship, status: status, physical: physical };
            });
          requiredElement('[data-role="selection"]').textContent = selectedDetails.map(function (detail) { return detail.ship.name; }).join(', ');
          requiredElement('[data-role="selection-status"]').textContent = selectedDetails.map(function (detail) {
            return (detail.status || 'active') + ' · ' + detail.physical.lengthM + ' m · ' + Math.round(detail.physical.massKg / 1000) + ' t · ' + detail.physical.accelerationMps2.toFixed(3) + ' m/s²' + (detail.ship.platformId ? ' · platform aboard' : '');
          }).join(', ');
          requiredElement('[data-role="selection-dv"]').textContent = selectedDetails.length === 1 && selectedDetails[0].ship.propulsion ? Math.floor(sim.remainingDeltaV(world, selectedDetails[0].ship)) + ' m/s' : '—';
          requiredElement('[data-role="selection-fuel"]').textContent = selectedDetails.length === 1 && selectedDetails[0].ship.propulsion ? (selectedDetails[0].ship.propulsion.fuelKg / 1000).toFixed(1) + ' t' : '—';
        }

        stressButton.dataset.active = stats.stressEnabled ? 'true' : 'false';
        stressButton.textContent = stats.stressEnabled ? 'Stress On' : 'Stress';
        sfxSlider.value = String(Math.round(audioStatus.sfxVolume * 100));
        sfxSlider.disabled = !audioStatus.available;
        requiredElement('[data-role="sfx-volume"]').textContent = sfxSlider.value + '%';
        musicSlider.value = String(Math.round(audioStatus.musicVolume * 100));
        musicSlider.disabled = !audioStatus.available;
        requiredElement('[data-role="music-volume"]').textContent = musicSlider.value + '%';
      }
    };
  }

  /** @param {number} seconds @returns {string} */
  function formatMissionTime(seconds) {
    var wholeSeconds = Math.floor(Math.max(0, seconds));
    return String(Math.floor(wholeSeconds / 3600)).padStart(2, '0') + 'h ' +
      String(Math.floor(wholeSeconds / 60) % 60).padStart(2, '0') + 'm ' +
      String(wholeSeconds % 60).padStart(2, '0') + 's';
  }

  /** @param {World} world */
  function miningControlState(world) {
    var homeSelected = world.ships.some(function (s) {
      return s.type === 'mothership' && world.selectedShipIds.indexOf(s.id) !== -1;
    });
    var working = world.platforms.some(function (p) { return p.state !== 'stored'; }) ||
      world.ships.some(function (s) { return s.order.kind === 'deploy'; });
    return {
      canDeploy: homeSelected && sim.canDeployPlatform(world),
      deployHint: !homeSelected ? 'Select the mothership to deploy a mining platform.' :
        world.miningMission !== 'active' ? 'Mining has ended for this mission.' :
        !sim.canDeployPlatform(world) ? 'Requires a stored platform, accessible ore, and an idle cargo ship with an empty hold.' :
        'Send the blue cargo ship to collect and deploy a stored platform.',
      canEnd: world.miningMission === 'active' && working,
      endLabel: world.miningMission === 'recovering' ? 'Recovering platforms…' :
        world.miningMission === 'complete' ? 'Mining ended · platforms recovered' : 'End mining & recover'
    };
  }

  /** @param {World} world @returns {number} */
  function totalOreRemaining(world) {
    return world.asteroids.reduce(function (total, asteroid) {
      return total + asteroid.ore;
    }, 0);
  }

  Driftworks.hud = {
    create: createHud,
    miningControlState: miningControlState
  };
})(window);
