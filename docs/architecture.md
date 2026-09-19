# Architecture

## Intended boundaries

The site loads ordinary scripts into `window.Driftworks`; there are no ES module
imports or build artifacts. `index.html` loads Pixi, propulsion, simulation,
audio, then game. The test entry points load the same application scripts without
Pixi and set `DRIFTWORKS_TEST_MODE` to suppress browser boot.

| Module | Responsibility and interface |
| --- | --- |
| `src/propulsion.js` | `Driftworks.propulsion`: tank initialization, rocket-equation burns/remaining delta-v, catcher envelope. Uses kg and m/s; `burn` mutates the supplied ship's fuel and returns the achievable burn fraction. |
| `src/sim.js` | `Driftworks.sim`: plain-data constructors, commands, fixed-step movement/industry/recovery, physical conversions, and save migration. Public world commands and `stepWorld(world, dt, threats)` return replacement worlds. Internal helpers mutate those working copies. |
| `src/game.js` | `Driftworks.game` exposes testable UI/geometry helpers; `createApp` owns the current world, timing, scene and HUD. `createScene` owns Pixi objects, input, camera focus, combat and effects, communicating through `getWorld`/`setWorld`. |
| `src/audio.js` | `Driftworks.audio`: lazily unlocked Web Audio resources, sound events, engine telemetry and separately persisted volume settings. No simulation ownership. |
| `styles.css`, `index.html` | DOM layout and static entry point. |
| `tests/tests.js` | Shared browser/headless regression suite for simulation and exposed game helpers. |

New durable gameplay rules belong in simulation transitions. Rendering should
consume world snapshots, and input should translate gestures into commands.
Browser objects, audio nodes and functions must never enter the world. See
[world-state](world-state.md) for the data contract and
[physical units](../PHYSICAL_UNITS.md) for conversions and tuning.

## Update and render sequence

`createApp.frame` runs on `requestAnimationFrame`:

1. Clamp wall-clock frame time to 0.2 seconds and add it, multiplied by the
   session playback speed, to the accumulator.
2. While the accumulator holds at least 1/30 second, replace world with
   `sim.stepWorld(world, 1/30, scene.getThreats())` and subtract that interval.
3. Apply camera focus using wall-clock time, then synchronize scene graphics.
4. Render ships between `previousPosition` and `position` using the remaining
   accumulator fraction. Rotation is rendered directly. Run the scene's combat,
   effects and audio updates, then update the DOM HUD and request another frame.

Within `stepWorld`, order matters:

1. Clone/normalize the incoming world, including compatibility defaults.
2. Reconcile and advance shared formations using the supplied threats.
3. Rotate asteroids; process stored ore into construction feedstock/sections.
4. Reconstruct the next top-level world and step ships. Each ship snapshots its
   previous motion/cargo before guidance; disabled/docked states take precedence.
   Low fuel can replace an assignment with an automatic return.
5. Advance recovery/repair/towing, then platform logistics and ballistic packets.
6. Recompute loaded accelerations and return the world with advanced mission time.

Consequently, ore delivered by recovery or packets becomes construction input
on a later tick. Ship stepping uses the normalized pre-step ship collection for
cross-ship lookups, while storage/depot and platform working data are shared
within the tick. Do not assume every subsystem sees a fully advanced world.

## Existing exceptions to the boundaries

- **Combat is partly frame-driven.** `createScene` owns hostile drones, weapon
  timers and the threat director. `render` advances these using scaled frame
  time, and calls `sim.damageFighter`/`sim.addWreck` through `setWorld` to persist
  consequences. `scene.getThreats()` supplies drones to fixed-step fighter
  guidance. Multiple ticks in one frame see threats before that frame's combat
  update; simulation tests alone do not cover an entire encounter.
- **Final-kill slow motion is scene-local.** `visualTimeScale` affects combat and
  effects, not the fixed-step accumulator. Playback speed affects both; pause
  leaves camera/selection usable. Do not infer simulation timing from effects.
- **Camera and selection are saved UI state.** They live in world even though
  game input owns their changes. Playback speed, focus animation, graphics,
  stress sprites, effects and hostile encounters remain session state. Load and
  reset clear combat; audio preferences use their own localStorage key.
- **Two context-order paths exist.** `sim.issueContextOrder` uses simulation
  distances; `game.issueVisualContextOrder` uses semantic-zoom hit areas before
  dispatching simulation commands. Changes to right-click priority or eligible
  targets need inspection of both paths.
- **Formation state is duplicated.** Shared groups live in `world.formations`,
  with per-order snapshots for steering and compatibility. Membership is derived
  from active defense orders, not solely from the group's cached member list.

These are descriptions of current behavior, not reasons to extend those
exceptions. New state must survive the explicit `stepWorld` reconstruction and
save normalization; new browser behavior needs browser verification in addition
to the shared helper tests.
