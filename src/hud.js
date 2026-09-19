(function (global) {
  'use strict';

  var Driftworks = (global.Driftworks = global.Driftworks || {});
  var sim = Driftworks.sim;
  var audio = Driftworks.audio;

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
      '<button type="button" data-action="deploy-platform">Deploy mining platform</button>' +
      '<button type="button" data-action="end-mining">End mining & recover</button>' +
      '<button type="button" data-action="save">Save</button>' +
      '<button type="button" data-action="load">Load</button>' +
      '<button type="button" data-action="reset">Reset</button>' +
      '<button type="button" data-action="stress">Stress</button>' +
      '<label class="volume-control">SFX<input type="range" min="0" max="100" step="1" data-action="sfx" aria-label="Sound effects volume"><output data-role="sfx-volume"></output></label>' +
      '<label class="volume-control">Music<input type="range" min="0" max="100" step="1" data-action="music" aria-label="Music volume"><output data-role="music-volume"></output></label>' +
      '</section>' +
      '<section class="hint">Select mothership → Deploy mining platform · RMB home: return · Cargo ship + RMB platform: retrieve · wheel zoom · Space/MMB drag pan · F focus</section>';

    host.querySelector('[data-action="end-mining"]').addEventListener('click', actions.onEndMining);
    var deployButton = host.querySelector('[data-action="deploy-platform"]');
    deployButton.addEventListener('click', actions.onDeployPlatform);
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
        var miningControls = miningControlState(world);
        deployButton.disabled = !miningControls.canDeploy;
        deployButton.title = miningControls.deployHint;
        var endMiningButton = host.querySelector('[data-action="end-mining"]');
        endMiningButton.disabled = !miningControls.canEnd;
        endMiningButton.textContent = miningControls.endLabel;
        world.ships.forEach(function (ship) {
          var button = Array.from(fleet.children).filter(function (b) { return b.dataset.ship === ship.id; })[0];
          if (!button) {
            button = document.createElement('button'); button.type = 'button'; button.dataset.ship = ship.id;
            fleet.appendChild(button);
          }
          var label = ship.name + ' · ' + Math.floor(sim.remainingDeltaV(world, ship)) + ' m/s' +
            (ship.disabled ? ' · disabled' : ship.docked ? ' · docked' : ship.order.automatic ? ' · returning' : '');
          if (ship.type === 'mothership') label = ship.name + ' · ' + world.platforms.filter(function (p) { return p.state === 'stored'; }).length + ' platforms aboard';
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
                ship.launchElapsed != null ? 'launching' : ship.disabled ? 'disabled' : ship.towTarget ? 'hauling ' + (ship.towTarget.kind === 'wreck' ? 'wreck' : 'fighter') : ship.order.kind === 'recover' ? 'recovering' : '';
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

  function formatMissionTime(seconds) {
    var wholeSeconds = Math.floor(Math.max(0, seconds));
    return String(Math.floor(wholeSeconds / 3600)).padStart(2, '0') + 'h ' +
      String(Math.floor(wholeSeconds / 60) % 60).padStart(2, '0') + 'm ' +
      String(wholeSeconds % 60).padStart(2, '0') + 's';
  }

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
