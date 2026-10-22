'use strict';
const assert = require('node:assert/strict');
const {createFlight} = require('../tools/headless.cjs');
const flight = createFlight({mission: 'ohio', seed: 29});
flight.advance(8, {stop: true});
const DW = flight.DW, combat = flight.snapshot().combat, api = DW.flightComms;
for (const team of ['ally', 'enemy']) {
  for (const shield of [0, 20]) {
    const victim = combat.enemies.find(c => c.team === team);
    victim.hp = 90; victim.shield = shield;
    const clock = api.create();
    clock.radioSerial = combat.radioSerial;
    api.step(clock, 0, combat, true, () => .4);
    const serial = combat.radioSerial;
    DW.training.damageCraft(combat, victim, {damage: 2, shieldFactor: 1, armorFactor: 1});
    DW.training.damageCraft(combat, victim, {damage: 2, shieldFactor: 1, armorFactor: 1});
    assert.equal(combat.radioEvents.filter(e => e.serial > serial && e.kind === 'hit').length, 2);
    api.step(clock, 0, combat, true, () => .4);
    assert.equal(clock.facts.filter(e => e.event === 'hit' && e.craft.id === victim.id).length, 1);
    clock.quiet = 10;
    const line = api.step(clock, 0, combat, false, () => .4);
    assert.equal(line.event, 'hit');
    assert.equal(line.craftId, victim.id);
    assert.equal(line.hostile, team === 'enemy');
    assert(DW.flightMissions.resolve('ohio').comms.calls.hit.includes(line.text));
    DW.training.damageCraft(combat, victim, {damage: 1, shieldFactor: 1, armorFactor: 1});
    clock.quiet = 10;
    const next = api.step(clock, 1, combat, false, () => .4);
    assert(!next || next.event !== 'hit', 'Burst damage cannot spam reactions');
    api.step(clock, 8, combat, true, () => .4);
    assert(!clock.facts.some(e => e.event === 'hit'), 'Stale hit reactions expire');
    const before = combat.radioSerial;
    DW.training.damageCraft(combat, victim, {damage: 0, shieldFactor: 1, armorFactor: 1});
    assert.equal(combat.radioSerial, before, 'Zero damage creates no hit reaction');
  }
}
console.log('PASS hit reactions: real damage, both teams, shields/hull, Ohio lines, coalescing, cooldown, expiration and zero damage');

const victim = combat.enemies.find(c => c.team === 'ally');
victim.hp = 90; victim.shield = 0;
const critical = api.create(); critical.radioSerial = combat.radioSerial;
api.step(critical, 0, combat, true, () => .4);
DW.training.damageCraft(combat, victim, {damage: 1, shieldFactor: 1, armorFactor: 1});
api.step(critical, 0, combat, true, () => .4);
assert(critical.facts.some(e => e.event === 'hit'));
DW.training.damageCraft(combat, victim, {damage: 60, shieldFactor: 1, armorFactor: 1});
critical.quiet = 10;
assert.equal(api.step(critical, 0, combat, false, () => .4).event, 'damaged');
assert(!critical.facts.some(e => e.event === 'hit'), 'Critical damage supersedes a queued minor hit reaction');
