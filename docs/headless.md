# Headless development in JavaScript

Use `tools/headless.cjs` for a first pass on flight behavior without starting the
renderer. It loads the actual ordinary application scripts into an isolated Node
VM. There is no DOM, WebGL context, audio context, server, or network access.
No installation or build step is needed.

For a repeatable fleet-size CPU sweep, run `node tools/stress-flight.cjs`.
It tests 16/50/100 AI fighters in stock and compact layouts, reporting mean and
tail times, overlapping stage costs, shot/hit counts, population and invariants.
`--counts 16,50,100 --seconds 12` sets the sweep; `--profile 100 --layout dense`
collects a separate V8 sampling profile. Graphics and real audio are excluded.
See [the recorded scaling test](benchmarks/flight-scale-2026-10-23.md) for results
and the distinction between CPU batches and browser FPS.

## Start in a REPL

In a Node REPL opened at the repository root (`node`):

```js
var {createFlight, loadRuntime, dt} = require('./tools/headless.cjs');
var flight = createFlight({mission: 'ohio', seed: 29});
flight.advance(8, {stop: true});
flight.snapshot().combat.enemies.map(c => ({id: c.id, team: c.team, name: c.callsign}));
flight.transcript.map(line => ({seconds: line.seconds, text: line.text}));
```

Codex's persistent JavaScript REPL can load this CommonJS module with
`createRequire` (direct `.cjs` imports are unsupported there):

```js
var {createRequire} = await import('node:module');
var requireLocal = createRequire(nodeRepl.cwd + '/tools/headless.cjs');
var {createFlight, loadRuntime, dt} = requireLocal('./headless.cjs');
var flight = createFlight({mission: 'ohio', seed: 29});
flight.advance(8, {stop: true});
nodeRepl.write(flight.transcript.map(line => ({seconds: line.seconds, text: line.text})));
```

Use ordinary JS to walk/filter the data. `snapshot()` is the production session's
live view, not a copied inspection schema. `flight.session` exposes the actual
session controller; `flight.DW` exposes its actual `window.Driftworks` namespace.
Reacquire snapshots after transitions: resets can replace state and entity objects.
To preserve a before-state, use `JSON.parse(JSON.stringify(flight.snapshot()))`.
Direct edits to a snapshot affect the simulation and are useful for deliberate
test setup; they are not simulated player actions.

## Time, controls, and reset

`createFlight({mission, seed, profile, weapon, enabled})` defaults to training,
seed 1729, profile index 0, that profile's default weapon, and enabled combat.
Mission names include `training`, `furball`, `asteroid-patrol`, and `ohio`.
Profile and weapon indices address `flight.DW.arcade.profiles` and
`flight.DW.retailWeapons`. Unknown missions and invalid options fail explicitly.

`flight.advance(seconds, controls)` executes complete 1/120-second ticks, retaining
fractional time. Controls are the production `Demand` fields in
`experiments/types.d.ts`: `throttle`, `throttleRate`, `stop`, `fire`, `pitch`,
`yaw`, `roll`, `side`, `vertical`, and `boost`. Omitted controls preserve throttle
and request no steering or firing. Each call applies its controls to all ticks
completed by that call. Nothing advances between calls; no pause command is needed.
The driver stops on player death, matching the browser's automatic pause.

`flight.ticks` and `flight.seconds` report completed ticks and elapsed time.
`flight.config` contains the production profile/weapon objects used when stepping.
`flight.reset()` creates a fresh production session with the original mission,
seed and enabled flag, using the current config. It resets clocks, comms RNG,
transcript and event history. Reacquire `flight.session` and snapshots afterward.
Create a new flight to change mission or seed. Each new flight reads current
source files and has its own namespace and caches, even within one REPL session.

## Reproduce losses and replacement launches

Call the existing gameplay API instead of inventing a second command system:

```js
var {combat} = flight.snapshot();
var victim = combat.enemies.find(c => c.team === 'ally' && c.hp > 0);
flight.DW.training.damageCraft(combat, victim,
  {damage: 1e6, shieldFactor: 1, armorFactor: 1}, combat.player);
flight.advance(dt, {stop: true});
flight.events.filter(event => event.kind === 'destroyed' || event.kind === 'spawn');
flight.snapshot().combat.enemies.map(c => ({
  id: c.id, name: c.callsign, team: c.team, launch: c.hangarLaunch, position: c.pose.eye
}));
```

This exercises the real roster, hull selection, rotating barn launch origin,
terrain queries and physics. Positions use scene units; velocities use m/s as
defined by the production APIs. Use `flight.DW.sim.METERS_PER_UNIT` for conversion.
Avoid holding a craft reference after a replacement; find the new ID in the current
snapshot. Inspect `flight.comms` for real cooldowns, pending facts, conversations,
and emotions when diagnosing callout selection.

## Events and transcripts

`flight.events` is a JS array of detached, timestamped records:

- `source: 'combat'`: copies of the production `combat.radioEvents`, including
  damage-related radio facts and destruction. Original fields/serials are preserved.
- `source: 'session'`: observed AI `spawn`/`removed` records and the session's
  `gunshot`/`impact` callbacks. These observations are not a second gameplay event bus.

`flight.transcript` contains the actual lines returned by `flightComms.step`,
including text, speaker, event, craft ID and voice settings. Both arrays add
`tick` and `seconds` and remain available across advance calls. Reset clears them.
Histories grow until cleared/reset; use bounded runs for inspection.

The driver coordinates `session.advance`, target acquisition, scenery time and
comms. Call `flight.advance` to keep capture and clocks together. Direct calls to
`flight.session.advance`, `reset` or `setCombat` bypass this coordination; use the
underlying API independently only when intentionally testing that subsystem.

The radio uses a seeded RNG and the production speech analyzer's duration plus
one second, matching the browser's muted/no-AudioContext channel. It does not
render PCM or emulate audio-device callbacks. Tick-driven scheduling is repeatable
but does not promise identical timestamps to variable browser frames or audible
playback. Transcripts prove selection/text behavior, not how a line sounds.
The core flight driver does not mount optional browser composition extensions
such as the Aegis capital-ship rig.

## Other production APIs

For tactical behavior, duels, or CPU effect geometry, use the same loader directly:

```js
var DW = loadRuntime();
var world = DW.sim.createInitialWorld(29);
world = DW.sim.spawnHostileWave(world);
world = DW.sim.stepWorld(world, 1 / 30);
world.combat.drones;

var duel = DW.flightDuel.create({seed: 29, duration: 5});
duel.advance(5);
duel.summary();

var batches = DW.explosions.build({position: [0,0,0], velocity: [1,0,0],
  age: .3, size: 1, seed: 29}, [1,0,0], [0,0,1]);
batches.map(batch => ({finish: batch.finish, vertices: batch.vertices.length}));
```

These expose existing APIs without adding another representation of their state.
Tactical JSON regressions continue to use [scenario replay](scenarios.md).

For the optional TensorFlow.js pilot evolution experiment built on real duels,
see [pilot training](pilot-training.md). It exports local weights, checkpoints,
held-out comparisons and deterministic control replays without changing gameplay.

## Turn an investigation into a regression

Write a focused `.cjs` test using `require('../tools/headless.cjs')` and Node's
`assert`, then register it in `tests/run.cjs`. Prefer assertions about outcomes
(roster counts, a replacement's launch phase, callout content/eligibility) over
large state snapshots. Run `node tests/headless.cjs` for the driver's own regression.
VM objects have a different realm's prototypes: use `Array.from(...)` for arrays
or a JSON copy before Node `assert.deepStrictEqual` comparisons with host literals.
It checks deterministic stepping/reset, real-session parity, scripted opening
comms, and destruction/replacement capture.

Use headless validation first for spawning, targeting, mission rules, callout
selection and timing. Browser checks remain necessary for layout, visual effects,
real input, audio quality and device behavior. CPU geometry tests can check
transforms, finite vertices and expiry without establishing visual quality.
