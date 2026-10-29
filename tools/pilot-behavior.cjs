'use strict';

// Observational AI-vs-AI runs: no changes to damage, emotions or radio eligibility.
const {fixture} = require('./stress-flight.cjs');
const fs = require('node:fs');
const crypto = require('node:crypto');
const sampleSeconds = .1;
const helpPattern = /cover me|need a hand|little help|help me|get this (?:fighter|guy)|on my tail|can't shake/i;

function run({seconds = 120, seed = 29, count = 16, layout = 'stock'} = {}) {
  if (!Number.isFinite(seconds) || seconds < sampleSeconds || seconds > 600) throw new Error('seconds must be 0.1–600');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid seed');
  if (!Number.isInteger(count) || count < 2 || count > 100) throw new Error('count must be 2–100');
  if (!['stock', 'dense'].includes(layout)) throw new Error('layout must be stock or dense');
  const f = fixture(count, seed, layout), U = f.DW.sim.METERS_PER_UNIT;
  // Keep the unarmed player away from the NPC fight, without granting invulnerability.
  f.snapshot().state.eye = [100000 / U, 100000 / U, 100000 / U];
  const pilots = new Map(), timeline = [];
  const steps = Math.floor(seconds / sampleSeconds + 1e-8);
  for (let step = 0; step < steps; step++) {
    const before = f.seconds;
    f.advance(sampleSeconds, {stop: true});
    const elapsed = f.seconds - before, combat = f.snapshot().combat;
    for (const c of combat.enemies) {
      const previous = pilots.get(c.id);
      if (previous) { previous.shots = c.guns.fired; previous.hits = c.guns.hits; }
    }
    const living = combat.enemies.filter(c => c.hp > 0);
    const sample = {seconds: f.seconds, wave: combat.wave, pilots: []};
    for (const c of living) {
      let p = pilots.get(c.id);
      if (!p) {
        p = {id: c.id, callsign: c.callsign, team: c.team, aliveSeconds: 0,
          stressSeconds: 0, afraidSeconds: 0, panickedSeconds: 0, pursuedSeconds: 0,
          maxStress: 0, modes: {}, targetSwitches: 0, shots: 0, hits: 0, lines: 0, helpCalls: 0};
        pilots.set(c.id, p);
      }
      const e = f.comms.emotions[c.id];
      const pursuers = living.filter(other => other.team !== c.team && other.targetId === c.id && other.mode === 'attack').length;
      p.aliveSeconds += elapsed;
      p.stressSeconds += (e ? e.stress : 0) * elapsed;
      p.maxStress = Math.max(p.maxStress, e ? e.stress : 0);
      if (e && e.current === 'afraid') p.afraidSeconds += elapsed;
      if (e && e.current === 'panicked') p.panickedSeconds += elapsed;
      if (pursuers) p.pursuedSeconds += elapsed;
      p.modes[c.mode] = (p.modes[c.mode] || 0) + elapsed;
      if (p.lastTarget && c.targetId && p.lastTarget !== c.targetId) p.targetSwitches++;
      p.lastTarget = c.targetId;
      p.shots = c.guns.fired; p.hits = c.guns.hits;
      sample.pilots.push({id: c.id, hp: c.hp, shield: c.shield, mode: c.mode,
        targetId: c.targetId, pursuers, stress: e ? e.stress : null,
        mood: e ? e.current : null, shots: c.guns.fired, hits: c.guns.hits});
    }
    timeline.push(sample);
    if (combat.dead) break;
  }
  for (const line of f.transcript) {
    const p = pilots.get(line.craftId);
    if (p) { p.lines++; if (helpPattern.test(line.text)) p.helpCalls++; }
  }
  const rows = [...pilots.values()].map(({lastTarget, ...p}) => ({...p, meanStress: p.stressSeconds / p.aliveSeconds}));
  const eventCounts = {};
  for (const line of f.transcript) eventCounts[line.event] = (eventCounts[line.event] || 0) + 1;
  const helpCalls = f.transcript.filter(line => helpPattern.test(line.text)).length;
  const report = {config: {seconds, seed, count, layout, sampleSeconds}, simulatedSeconds: f.seconds,
    sources: Object.fromEntries(require('./script-manifest.cjs').files('headless').map(file =>
      [file, crypto.createHash('sha256').update(fs.readFileSync(require('node:path').join(__dirname, '..', file))).digest('hex')])),
    playerDead: f.snapshot().combat.dead, summary: {pilotsObserved: rows.length,
      shots: rows.reduce((n,p) => n+p.shots,0), hits: rows.reduce((n,p) => n+p.hits,0),
      lines: f.transcript.length, helpCalls, helpFraction: helpCalls / (f.transcript.length || 1), eventCounts},
    pilots: rows, transcript: f.transcript, timeline};
  report.digest = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2), options = {};
  let output;
  for (let i=0; i<args.length; i+=2) {
    const key = args[i].replace(/^--/, ''), value = args[i+1];
    if (!value || !['seconds','seed','count','layout','output'].includes(key)) throw new Error('Use --seconds, --seed, --count, --layout, --output');
    if (key === 'output') output = value;
    else options[key] = key === 'layout' ? value : Number(value);
  }
  const report = run(options);
  if (output) fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({config: report.config, simulatedSeconds: report.simulatedSeconds,
    playerDead: report.playerDead, summary: report.summary, digest: report.digest, output}, null, 2));
}
module.exports = {run};
