# Architecture

Driftworks deploys as static files with ordinary scripts and vendored renderers.
Persistent gameplay belongs in simulation; sessions own orchestration; renderers,
input, HUD and audio own browser resources. Keep those boundaries when adding features.

## Reference map

| Reference | Contents |
| --- | --- |
| [Rendering](rendering-reference.md) | Three scene, terrain, mining geometry, diagnostics and procedural assets |
| [Tactical artwork](tactical-artwork.md) | Pixi asteroid and mothership artwork |
| [Flight architecture](flight-architecture.md) | Session ownership, fixed ticks, combat, orchestration and Aegis sorties |
| [Flight artwork](flight-artwork.md) | Imported models, finishes, firing geometry and tether scale |
| [Flight presentation](flight-presentation.md) | Viewers, HUD, portraits, study actors and asset versions |
| [World state](world-state.md) | Persistence, lifecycle ownership and compatibility |
| [Script loading](script-loading.md) | Dependency profiles and generated static lists |
| [Testing](testing.md) | Focused groups, shared registration and isolated execution |

## Static type checks

All application scripts in `src/` and `experiments/` are checked with strict
TypeScript via JSDoc and their shared declarations. Run `npm run check:types` (or
`node tests/check-types.cjs`) after installing the optional development dependency.
The check also rejects explicit `any` annotations and identifiers inferred as
`any`, including values escaping from JSON parsing. Tests and vendored Pixi are
outside this static-check scope; `node tests/run.cjs` remains dependency-free.
The local Pixi declarations describe the browser API used here, not the full library.

JSON cloning and save/preferences parsing have explicit typed boundaries.
These do not provide full runtime schema validation: save normalization continues
to repair historical fields. Normalized worlds include camera zoom and elapsed
seconds; legacy wreck artwork defaults a missing rotation to zero. The game
exports `paintRecovery` alongside its other rendering helpers for regression checks.

## Intended boundaries

The core site loads ordinary scripts into `window.Driftworks`; the flight page
also declares its module scripts and import map explicitly. Shared loading order
lives in the development-only `tools/script-manifest.cjs`. Node loaders consume
profiles directly; tactical, flight, experiment and benchmark pages, browser tests and the
study worker retain checked-in generated lists. No manifest loader or generation
step is needed to serve the site. The test entry points share an application/test
profile and set `DRIFTWORKS_TEST_MODE` to suppress browser boot. See
[script loading](script-loading.md) for profile ownership and update commands.

| Module | Responsibility and interface |
| --- | --- |
| `src/propulsion.js` | `Driftworks.propulsion`: tank initialization, rocket-equation burns/remaining delta-v, catcher envelope. Uses kg and m/s; `burn` mutates the supplied ship's fuel and returns the achievable burn fraction. |
| `src/combat.js` | `Driftworks.combat`: deterministic combat state, threat director, hostile movement, weapon selection, damage resolution, and combat events. |
| `src/sim.js` | `Driftworks.sim`: constructors, commands, fixed-step movement/industry/recovery, combat update orchestration, physical conversions, and save migration. Public commands and `stepWorld(world, dt)` return replacement worlds. Internal helpers mutate those working copies. |
| `src/asteroid-art.js` | `Driftworks.asteroidArt`: deterministic descriptions, CPU relief/surface samples, shared geology GLSL, uniforms and raw crater bytes. Depends on simulation only; creates no browser or renderer resources. Owns the shared artwork light for viewer controls. Legacy polygon descriptions/color helpers remain data-only compatibility support. |
| `src/asteroid-terrain.js` | `Driftworks.asteroidTerrain`: renderer-independent relief, excavation fields, meshes and mining surface/contact fitting. Owns derived CPU caches; flight and headless sessions query it directly. |
| `src/ship-art.js` | Pixi craft/platform painters, semantic scale, thruster and mothership presentation. Reads world snapshots; does not own scene or input state. Existing game helpers remain compatibility aliases. |
| `src/game.js` | `Driftworks.game` exposes testable UI/geometry helpers; `createApp` owns the current world, timing, scene and HUD. `createScene` owns Pixi objects, input, camera focus and effects, communicating through `getWorld`/`setWorld` and observing combat events. Asteroid description/sample exports alias `asteroidArt`; Pixi textures, excavation shading and final shader assembly remain here. |
| `src/engine-audio.js` | Shared procedural engine synth, presets, tuning persistence and spool response; caller owns its context. |
| `src/audio-mixer.js` | Flight channel balance, ducking, headroom and settings UI; receives context and master callbacks. |
| `src/audio.js` | `Driftworks.audio`: lazily unlocked Web Audio resources, sound events, engine telemetry and separately persisted volume settings. No simulation ownership. |
| `src/hud.js` | `Driftworks.hud`: DOM panels, fleet/readouts, control availability and event binding. Reads simulation queries and audio status; delegates actions to the app. No Pixi or scene dependency. |
| `styles.css`, `rts.html` | Tactical DOM layout and game entry point. |
| `index.html` | Experiments landing page. |
| `tests/shared/*.js`, `tests/tests.js`, `tests/shared-harness.js` | Shared browser/Node assertions by group, reusable fixtures, the suite entry point and registration/filtering/result harness. All tests register before execution. |
| `tests/suites.cjs`, `tests/run.cjs`, `tests/helpers/` | Explicit standalone groups, isolated child-process execution and shared legacy setup; see [test groups](testing.md). |
| `tests/scenario.js`, `tests/scenarios.cjs` | Shared deterministic replay/assertion helpers and Node JSON fixture entry point; see [scenario replay](scenarios.md). |
| `tools/headless.cjs` | Development-only isolated production-script loader and fixed-tick flight driver, exposing real session state, comms transcripts and observed events without browser resources; see [headless development](headless.md). |

New durable gameplay rules belong in simulation transitions. Rendering should
consume world snapshots, and input should translate gestures into commands.
Browser objects, audio nodes and functions must never enter the world. See
[world-state](world-state.md) for the data contract and
[physical units](../PHYSICAL_UNITS.md) for conversions and tuning.

### HUD interface

`Driftworks.hud.create(host, actions)` builds the DOM once and returns
`{ update(world, stats) }`. `stats` supplies `contacts`, `entityCount`, `fps` and
`stressEnabled`; world is read-only to the HUD. Actions are `getTimeScale`,
`onTimeScale(speed)`, `onSelectShip(id)`, `onDeployPlatform`, `onEndMining`,
`onSave`, `onExport`, `onLoad`, `onReset`, `onStressToggle`, `onSfxVolume(volume)` and
`onMusicVolume(volume)` (volumes range from 0 to 1). The app owns these callbacks
and replaces world or changes session/audio state in response.
`Driftworks.hud.miningControlState(world)` exposes the control-availability query
for tests; formatting and ore aggregation remain private to the HUD.

## Update and render sequence

`createApp.frame` runs on `requestAnimationFrame`:

1. Clamp wall-clock frame time to 0.2 seconds and add it, multiplied by the
   session playback speed, to the accumulator.
2. While the accumulator holds at least 1/30 second, replace world with
   `sim.stepWorld(world, 1/30)` and subtract that interval. Immediately pass that
   tick's `world.combat.events` to `scene.consumeCombatEvents`, so events are not
   lost when one frame advances multiple ticks.
3. Apply camera focus using wall-clock time, then synchronize scene graphics.
4. Render friendly and hostile ships between `previousPosition` and `position`
   using the remaining accumulator fraction. Rotation is rendered directly.
   Update effects, audio and the DOM HUD, then request another frame.

Within `stepWorld`, order matters:

1. Clone/normalize the incoming world, including compatibility defaults.
2. Clear prior combat events, advance the director and hostile movement, then
   reconcile formations using those updated hostile positions.
3. Rotate asteroids; process stored ore into construction feedstock/sections.
4. Reconstruct the next top-level world, coast untowed wrecks, and step ships. Each
   ship snapshots its previous motion/cargo before guidance; disabled ships coast
   without guidance, while docked states take precedence for operational ships.
   Low fuel can replace an assignment with an automatic return.
5. Advance recovery/repair/towing, then platform logistics and ballistic packets.
6. Select all weapons from the post-movement state, then resolve damage. Both
   sides can fire on the tick they are disabled/destroyed; a disabled ship from
   a prior tick cannot fire. Multiple fighters add dwell to the same target;
   destruction produces exactly one wreck and one destruction event.
7. Recompute loaded accelerations and return the world with advanced mission time.

Consequently, ore delivered by recovery or packets becomes construction input
on a later tick. Ship stepping uses the normalized pre-step ship collection for
cross-ship lookups, while storage/depot and platform working data are shared
within the tick. Do not assume every subsystem sees a fully advanced world.

Combat and the director need neither Pixi nor a DOM. `createInitialWorld(seed)`
uses seeded asteroid spin; the director's RNG state advances only when making a
random decision and survives saves. Warning durations (8–10 seconds), cooldowns
(44–52 seconds) and wave approach angles vary reproducibly. The director still
caps automatic waves at three and suspends its timers while hostiles remain or
the depot is complete. Industrial objects remain approach targets; as before,
raider weapons damage fighters, not industrial hulls.

`stepWorld` retains an optional third `Threat[]` argument for isolated steering
tests. These are extra noncombat guidance probes, not renderer-owned hostiles;
the app and scenario runner do not need them. Weapon-selection/exposure helpers
now live on `Driftworks.sim`, not `Driftworks.game`.

## Existing exceptions to the boundaries

- **Final-kill slow motion is scene-local.** `visualTimeScale` affects only
  effects, not combat or the fixed-step accumulator. Playback speed affects both; pause
  leaves camera/selection usable. Do not infer simulation timing from effects.
- **Camera and selection are saved UI state.** They live in world even though
  game input owns their changes. Playback speed, focus animation, graphics,
  stress sprites and effects remain session state. Load restores combat and
  clears visual effects; reset creates a fresh world. Audio preferences use
  their own localStorage key.
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

## Population session boundary

`population.js` loads after simulation and before `session.js`; both precede HUD
and game. The app owns a session containing separate world and population state.
Operational transitions pass through the coordinator; rendering only reads it.
Population is never included in tactical cloning or fixed-step normalization.
See [population](population.md) for clock, event, transport, and save contracts.

## Single-player boundaries that preserve future multiplayer options

Tactical orders accept an optional final `shipIds` argument, including movement,
context, mining/deployment, construction, return, defense, recovery and salvage.
An explicit empty array commands nobody. Omitted IDs retain the old selection-based
API for existing callers and scenario captures. UI dispatch supplies its selected
IDs explicitly; simulation automation supplies entity IDs directly. Neither path
changes ship/platform selection. Defense's existing third `shipId` argument remains
the guarded anchor; recipients are the fourth argument. Context hit testing stays
local to presentation and dispatches the resolved orders to explicit recipients.
This changes no tactical save fields or version markers.

In flight experiments, `training.createCraft` constructs the same craft shape for
controlled and AI participants: stable ID, team, controller kind, pose, profile,
defenses, guns, lifecycle/feedback and collision descriptor. `combat.player` owns
the controlled craft; the historical `combat.enemies` collection owns the other
participants (including allied wingmen). `training.participants` reads both.
`training.stepInput` applies controller demand through the shared flight model;
input-controlled wingmen are not steered by AI. Session/duel gun state is the
controlled craft's gun state, rather than an independent combat copy.

All participants use `training.damageCraft` and the same team-aware nearest-hit
trace, shield recovery and destruction/wreck rules. Legacy `damagePlayer` and
`damageEnemy` calls delegate to that resolver. HUD properties such as `combat.hull`,
`shield`, `lastHit` and `dead` are non-serialized compatibility views of the
controlled craft, not separate authoritative health. Controlled-craft death does
not stop the combat clock, other craft or debris; the single-player session/UI
still decides when to pause/end a sortie. Flight experiments have no persistent
save format; these changes do not migrate tactical ships into flight craft.

No transport, network authority, prediction or lockstep requirement is introduced.


## Detailed section links

These anchors preserve links from the former single-file reference.

<a id="3d-scene-prototype"></a>
- [3D scene prototype](rendering-reference.md#3d-scene-prototype)

<a id="asteroid-artwork"></a>
- [Asteroid artwork](tactical-artwork.md#asteroid-artwork)

<a id="mothership-habitat-artwork"></a>
- [Mothership habitat artwork](tactical-artwork.md#mothership-habitat-artwork)

<a id="viewer-asteroid-surface"></a>
- [Viewer asteroid surface](rendering-reference.md#viewer-asteroid-surface)

<a id="mothership-3d-artwork"></a>
- [Mothership 3D artwork](rendering-reference.md#mothership-3d-artwork)

<a id="mothership-surface-detail-and-refinement"></a>
- [Mothership surface detail and refinement](rendering-reference.md#mothership-surface-detail-and-refinement)

<a id="mothership-study-navigation"></a>
- [Mothership study navigation](rendering-reference.md#mothership-study-navigation)

<a id="isolated-arcade-flight-lab"></a>
- [Isolated arcade flight lab](flight-architecture.md#isolated-arcade-flight-lab)

<a id="flight-training-combat"></a>
- [Flight training combat](flight-architecture.md#flight-training-combat)

<a id="renderer-diagnostics-and-pacing"></a>
- [Renderer diagnostics and pacing](rendering-reference.md#renderer-diagnostics-and-pacing)

<a id="imported-flight-artwork-experiment"></a>
- [Imported flight artwork experiment](flight-artwork.md#imported-flight-artwork-experiment)

<a id="flight-lab-fighter-finishes"></a>
- [Flight lab fighter finishes](flight-artwork.md#flight-lab-fighter-finishes)

<a id="flight-lab-orchestration"></a>
- [Flight lab orchestration](flight-architecture.md#flight-lab-orchestration)

<a id="retired-asteroid-surface-experiments"></a>
- [Retired asteroid surface experiments](rendering-reference.md#retired-asteroid-surface-experiments)

<a id="procedural-assets"></a>
- [Procedural assets](rendering-reference.md#procedural-assets)

<a id="small-performance-review-2026-10-17"></a>
- [Small performance review (2026-10-17)](rendering-reference.md#small-performance-review-2026-10-17)

<a id="flight-point-blank-firing-reference"></a>
- [Flight point-blank firing reference](flight-artwork.md#flight-point-blank-firing-reference)

<a id="tether-scale-greyboxes"></a>
- [Tether scale greyboxes](flight-artwork.md#tether-scale-greyboxes)

<a id="shared-model-viewer-navigation"></a>
- [Shared model viewer navigation](flight-presentation.md#shared-model-viewer-navigation)

<a id="shared-study-panels"></a>
- [Shared study panels](flight-presentation.md#shared-study-panels)

<a id="radio-portraits-and-shared-channel-noise"></a>
- [Radio portraits and shared channel noise](flight-presentation.md#radio-portraits-and-shared-channel-noise)

<a id="static-study-actor-visibility-and-projectile-damage-reporting"></a>
- [Static study actor visibility and projectile damage reporting](flight-presentation.md#static-study-actor-visibility-and-projectile-damage-reporting)

<a id="static-asset-versions"></a>
- [Static asset versions](flight-presentation.md#static-asset-versions)

<a id="production-threejs-renderer"></a>
- [Production Three.js renderer](rendering-reference.md#production-threejs-renderer)

<a id="aegis-hangar-departures"></a>
- [Aegis hangar departures](flight-architecture.md#aegis-hangar-departures)

<a id="aegis-capital-engagement"></a>
- [Aegis capital engagement](flight-architecture.md#aegis-capital-engagement)

<a id="gpu-flight-hud"></a>
- [GPU flight HUD](flight-presentation.md#gpu-flight-hud)

<a id="shared-touch-controls-and-asset-versions"></a>
- [Shared touch controls and asset versions](flight-presentation.md#shared-touch-controls-and-asset-versions)
