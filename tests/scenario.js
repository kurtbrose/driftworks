(function (global) {
  'use strict';
  var sim = global.Driftworks.sim;
  var commands = {
    select: 'selectShips', move: 'issueMoveOrder', context: 'issueContextOrder',
    mine: 'issueMineOrder', build: 'issueBuildOrder', return: 'issueReturnOrder',
    defend: 'issueDefendOrder', recover: 'issueRecoveryOrder',
    recoverPlatform: 'issuePlatformRecovery', endMining: 'endMining',
    spawnFighter: 'spawnFighter', damageFighter: 'damageFighter', spawnHostileWave: 'spawnHostileWave'
  };

  function integer(value) { return Number.isSafeInteger(value) && value >= 0; }

  // Tick zero is the supplied snapshot. Commands at tick N run before step N+1.
  function run(scenario) {
    if (!scenario || scenario.version !== 1 || !integer(scenario.ticks)) {
      throw new Error('Scenario requires version 1 and a nonnegative integer ticks');
    }
    if (scenario.world && scenario.seed !== undefined) throw new Error('Use world OR seed');
    if (scenario.seed !== undefined && (!integer(scenario.seed) || scenario.seed > 4294967295)) {
      throw new Error('Seed must be an unsigned 32-bit integer');
    }
    var events = scenario.commands || [];
    if (!Array.isArray(events)) throw new Error('commands must be an array');
    events.forEach(function (event) {
      if (!integer(event.tick) || event.tick >= scenario.ticks ||
          !Object.prototype.hasOwnProperty.call(commands, event.action) || !Array.isArray(event.args)) {
        throw new Error('Invalid command: ' + JSON.stringify(event));
      }
    });
    var world = scenario.world
      ? sim.deserializeWorld(JSON.stringify({ version: sim.WORLD_VERSION, world: scenario.world }))
      : sim.createInitialWorld(scenario.seed);
    for (var tick = 0; tick < scenario.ticks; tick += 1) {
      events.forEach(function (event) {
        if (event.tick === tick) world = sim[commands[event.action]].apply(null, [world].concat(event.args));
      });
      world = sim.stepWorld(world, 1 / 30, scenario.threats || []);
    }
    return world;
  }

  // Paths use entity IDs for arrays, e.g. ships.escort-01.position.x.
  function check(world, assertions) {
    if (!Array.isArray(assertions) || !assertions.length) throw new Error('Add at least one assertion before promoting a capture to a regression');
    assertions.forEach(function (rule) {
      if (typeof rule.path !== 'string') throw new Error('Assertion needs a path');
      var actual = rule.path.split('.').reduce(function (value, key) {
        if (Array.isArray(value) && !/^\d+$/.test(key) && key !== 'length') {
          return value.find(function (item) { return item.id === key; });
        }
        return value && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
      }, world);
      var ok = false;
      if (rule.op === 'equal') ok = actual !== undefined && JSON.stringify(actual) === JSON.stringify(rule.value);
      else if (rule.op === 'near') ok = Number.isFinite(actual) && Number.isFinite(rule.value) &&
        Number.isFinite(rule.tolerance) && rule.tolerance >= 0 && Math.abs(actual - rule.value) <= rule.tolerance;
      else if (rule.op === 'min') ok = Number.isFinite(actual) && Number.isFinite(rule.value) && actual >= rule.value;
      else if (rule.op === 'max') ok = Number.isFinite(actual) && Number.isFinite(rule.value) && actual <= rule.value;
      else throw new Error('Unknown assertion operator: ' + rule.op);
      if (!ok) throw new Error(rule.path + ': expected ' + rule.op + ' ' + JSON.stringify(rule.value) +
        (rule.op === 'near' ? ' ± ' + rule.tolerance : '') + ', actual ' + JSON.stringify(actual));
    });
  }

  global.Driftworks.scenario = { run: run, check: check };
})(window);
