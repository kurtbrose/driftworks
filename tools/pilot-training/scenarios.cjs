'use strict';
const P = require('./policy.cjs');
const DT = 1 / 120;
const KINDS = ['head-on', 'crossing', 'on-tail', 'hunted', '2v1', '1v2', 'wounded-pilot', 'wounded-opponent'];
function rng(seed) {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function cases(DW, seed, duration, count = 8) {
  const random = rng(seed);
  return Array.from({length: count}, (_, i) => {
    const scenario = KINDS[i % KINDS.length];
    return {scenario, seed: (seed + i) >>> 0, duration,
      start: ['on-tail', 'hunted'].includes(scenario) ? 'tail' : scenario === 'crossing' ? 'crossing' : 'headOn',
      opponentStyle: DW.flightDuel.styles[Math.floor(random() * DW.flightDuel.styles.length)],
      skill: Math.floor(random() * 3)};
  });
}
function create(DW, options) {
  const {scenario = 'head-on', ...duelOptions} = options;
  if (!KINDS.includes(scenario)) throw new Error('Unknown training scenario');
  const duel = DW.flightDuel.create(duelOptions), combat = duel.combat;
  const own = combat.player, enemy = duel.enemy, U = DW.sim.METERS_PER_UNIT;
  if (scenario === 'hunted') [own.pose.eye, enemy.pose.eye] = [enemy.pose.eye, own.pose.eye];
  const random = rng(duelOptions.seed ?? 1);
  // Seed now changes geometry, rather than only an unused scripted pilot RNG.
  const angle = (random() - .5) * .7, c = Math.cos(angle), s = Math.sin(angle);
  const rotate = v => [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
  for (const craft of [own, enemy]) {
    for (const key of ['eye', 'right', 'up', 'back', 'velocity']) craft.pose[key] = rotate(craft.pose[key]);
  }
  enemy.pose.eye = enemy.pose.eye.map((x, i) => x + (random() - .5) * (i === 2 ? 40 : 80) / U);
  if (scenario === '2v1' || scenario === '1v2') {
    const team = scenario === '2v1' ? 'ally' : 'enemy', original = team === 'ally' ? own : enemy;
    const pose = JSON.parse(JSON.stringify(original.pose));
    pose.eye = pose.eye.map((x, i) => x + (original.pose.right[i] * 100 + original.pose.up[i] * 45) / U);
    const extra = DW.flightSim.createCraft('training-' + team + '-2', pose, team);
    DW.flightSim.equip(extra, original.profile, original.weaponIndex);
    Object.assign(extra, {controller: 'ai', index: 2, skill: enemy.skill, opponentStyle: enemy.opponentStyle,
      mode: 'approach', goal: (team === 'ally' ? enemy : own).pose.eye.slice()});
    combat.enemies.push(extra);
    // Use the production model collider/loadout setup for added participants too.
    DW.flightSim.configureHulls(combat, duel.replay.options.allyHull, duel.replay.options.enemyHull);
  }
  if (scenario === 'wounded-pilot') {own.hp *= .5; own.shield *= .5; own.damagedAt = 0;}
  if (scenario === 'wounded-opponent') {enemy.hp *= .5; enemy.shield *= .5; enemy.damagedAt = 0;}
  combat.slots = combat.enemies.map(e => e.id);
  return {duel, scenario, options: {...duel.replay.options, scenario}};
}
function tally(entries) {
  const totals = {hullDamage: 0, shieldDamage: 0, kills: 0};
  for (const e of entries) {
    totals.hullDamage += Math.min(e.initialHull, e.hullDamage);
    totals.shieldDamage += Math.min(e.initialShield, e.shieldDamage);
    totals.kills += e.kills;
  }
  return totals;
}
function score(metrics) {
  // No reward for shots or survival time. Regenerated shields cannot replenish
  // the credit budget. Starting damage and wingmate damage earn no own credit.
  return 4 * metrics.hullDamage / metrics.enemyMaxHull
    + metrics.shieldDamage / Math.max(1, metrics.enemyMaxShield)
    + 2 * metrics.kills / metrics.enemyCount
    + Math.min(.1, metrics.damagingHits * .002)
    + (metrics.victory ? 1 : 0) - (metrics.dead ? 1 : 0)
    - .5 * metrics.hullLost / metrics.playerMaxHull
    - .1 * metrics.shieldLost / Math.max(1, metrics.playerMaxShield);
}
function episode(DW, weights, options, capture = false, recordedInputs) {
  P.validate(weights);
  const setup = create(DW, options), {duel} = setup, combat = duel.combat, own = combat.player;
  const enemies = combat.enemies.filter(e => e.team !== own.team);
  const ledger = enemies.map(craft => ({craft, initialHull: craft.hp, initialShield: craft.shield || 0,
    hullDamage: 0, shieldDamage: 0, kills: 0}));
  const weapon = DW.retailWeapons[own.weaponIndex], inputs = [];
  const initialHull = own.hp, initialShield = own.shield || 0;
  let tick = 0, held, target = null, rangeIntegral = 0, hullLost = 0, shieldLost = 0, damagingHits = 0;
  let shots = 0, targetChanges = 0;
  const limit = Math.ceil(setup.options.duration * 120);
  while (tick < limit && !combat.dead && enemies.some(e => e.hp > 0)) {
    if (tick % 12 === 0) {
      if (!target || target.hp <= 0 || tick % 60 === 0) {
        const nearest = enemies.filter(e => e.hp > 0).sort((a, b) =>
          Math.hypot(...a.pose.eye.map((x, i) => x - own.pose.eye[i])) - Math.hypot(...b.pose.eye.map((x, i) => x - own.pose.eye[i])))[0];
        if (nearest !== target) targetChanges++;
        target = nearest;
      }
      held = P.controls(DW, weights, own.pose, target.pose, weapon);
    }
    const input = recordedInputs ? DW.flightAI.validate(recordedInputs[tick]) : held;
    if (capture) inputs.push({...input});
    rangeIntegral += Math.hypot(...target.pose.eye.map((x, i) => x - own.pose.eye[i])) * DW.sim.METERS_PER_UNIT * DT;
    const hp = own.hp, shield = own.shield || 0;
    let before;
    // Production NPC combat happens first; snapshot here so only damage from
    // controlled pilot projectiles earns credit, never its supporting wingmate.
    DW.flightSim.stepControlled(combat, {...input, throttleRate: 0}, weapon, DT, 0, undefined, () => {
      hullLost += Math.max(0, hp - own.hp);
      shieldLost += Math.max(0, shield - (own.shield || 0));
      before = ledger.map(e => ({hp: e.craft.hp, shield: e.craft.shield || 0}));
      shots = own.guns.hits;
    });
    ledger.forEach((entry, i) => {
      entry.hullDamage += Math.max(0, before[i].hp - entry.craft.hp);
      entry.shieldDamage += Math.max(0, before[i].shield - (entry.craft.shield || 0));
      if (before[i].hp > 0 && entry.craft.hp <= 0) entry.kills++;
    });
    damagingHits += own.guns.hits - shots;
    tick++;
  }
  const seconds = tick * DT, victory = enemies.every(e => e.hp <= 0);
  const metrics = {...tally(ledger), damagingHits, hullLost: Math.min(initialHull, hullLost),
    shieldLost: Math.min(initialShield, shieldLost), enemyMaxHull: enemies.reduce((s, e) => s + e.maxHp, 0),
    enemyMaxShield: enemies.reduce((s, e) => s + (e.maxShield || 0), 0), enemyCount: enemies.length,
    playerMaxHull: own.maxHp, playerMaxShield: own.maxShield || 0, victory, dead: combat.dead, rangeIntegral, targetChanges};
  const summary = {ticks: tick, seconds, done: true, outcome: combat.dead ? 'opponent-win' : victory ? 'player-win' : 'timeout',
    scenario: setup.scenario, playerHull: own.hp, playerShield: own.shield || 0,
    opponentHull: enemies.reduce((s, e) => s + e.hp, 0), opponentShield: enemies.reduce((s, e) => s + (e.shield || 0), 0),
    playerShots: own.guns.fired, opponentShots: enemies.reduce((s, e) => s + e.guns.fired, 0),
    alliedShots: combat.enemies.filter(e => e.team === own.team).reduce((s, e) => s + e.guns.fired, 0),
    allies: combat.enemies.filter(e => e.team === own.team).length, enemies: enemies.length, initialHull, initialShield, metrics};
  return {score: score(metrics), summary,
    ...(capture ? {replay: {version: 2, policy: 'pilot-residual-v1', observation: 'instantaneous-pose-velocity',
      cadence: DT, options: setup.options, inputs}} : {})};
}
function replay(DW, record) {
  if (record.version !== 2 || record.cadence !== DT || !Array.isArray(record.inputs)) throw new Error('Unsupported training replay');
  record.inputs.forEach(DW.flightAI.validate);
  const result = episode(DW, Array(P.COUNT).fill(0), record.options, false, record.inputs);
  if (record.inputs.length !== result.summary.ticks) throw new Error('Replay input length does not match terminal state');
  return result;
}
module.exports = {KINDS, cases, create, tally, score, episode, replay};
