# Architecture

## Static type checks

All application scripts in `src/` are checked with strict TypeScript via
JSDoc and `src/types.d.ts`. Run `npm run check:types` (or
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

The site loads ordinary scripts into `window.Driftworks`; there are no ES module
imports or build artifacts. `index.html` loads Pixi, propulsion, combat,
simulation, audio, HUD, then game. The test entry points load the same application scripts without
Pixi and set `DRIFTWORKS_TEST_MODE` to suppress browser boot.

| Module | Responsibility and interface |
| --- | --- |
| `src/propulsion.js` | `Driftworks.propulsion`: tank initialization, rocket-equation burns/remaining delta-v, catcher envelope. Uses kg and m/s; `burn` mutates the supplied ship's fuel and returns the achievable burn fraction. |
| `src/combat.js` | `Driftworks.combat`: deterministic combat state, threat director, hostile movement, weapon selection, damage resolution, and combat events. |
| `src/sim.js` | `Driftworks.sim`: constructors, commands, fixed-step movement/industry/recovery, combat update orchestration, physical conversions, and save migration. Public commands and `stepWorld(world, dt)` return replacement worlds. Internal helpers mutate those working copies. |
| `src/game.js` | `Driftworks.game` exposes testable UI/geometry helpers; `createApp` owns the current world, timing, scene and HUD. `createScene` owns Pixi objects, input, camera focus and effects, communicating through `getWorld`/`setWorld` and observing combat events. |
| `src/audio.js` | `Driftworks.audio`: lazily unlocked Web Audio resources, sound events, engine telemetry and separately persisted volume settings. No simulation ownership. |
| `src/hud.js` | `Driftworks.hud`: DOM panels, fleet/readouts, control availability and event binding. Reads simulation queries and audio status; delegates actions to the app. No Pixi or scene dependency. |
| `styles.css`, `index.html` | DOM layout and static entry point. |
| `tests/tests.js` | Shared browser/headless regression suite for simulation and exposed game helpers. |
| `tests/scenario.js`, `tests/scenarios.cjs` | Shared deterministic replay/assertion helpers and Node JSON fixture entry point; see [scenario replay](scenarios.md). |

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
4. Reconstruct the next top-level world and step ships. Each ship snapshots its
   previous motion/cargo before guidance; disabled/docked states take precedence.
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

## Asteroid artwork

Asteroid artwork in `game.js` uses `asteroidVisualDescription` to derive a stable
four-material bulk composition and a body-local composition field from the
asteroid ID. Every point is a normalized mixture of ice, volatiles, metals and
silicates; there is no generic host rock or deposit overlay. Low- and
medium-frequency fields plus sparse radial blobs bias the local mixture around
the bulk average. High-heterogeneity bodies reach roughly 2.6 log units of broad
variation, enough for regional dominance to differ from the bulk. Heterogeneity
also lowers softmax temperature. Local fractions are clamped away from pure
materials.

The display path is a Pixi fragment shader over a transparent body-sized quad.
It evaluates the continuous composition field per visible screen pixel, so no
mesh or backing-texture resolution appears at inspection zoom. A seeded
pseudo-height field combines the exact `sim.surfaceRadius` silhouette, a rounded
spheroid dome, five broad bulges/basins, low-frequency undulation, crater bowls,
raised rims and fine relief. Finite differences across that field derive the
local normal. The same shader applies diffuse light, limb rolloff and crater
occlusion. Fine texture comes only from the relief response; explicit dot and
line texture marks are not drawn. Relief and material variation use seeded 2D
value noise. Microrelief is a seven-octave asteroid-local fBm hierarchy. Camera
zoom supplies the local-space pixel footprint; each octave fades out before it becomes
subpixel and fades back in as zoom makes it resolvable. Zoom therefore refines
the same seeded surface instead of resampling or replacing it, while unresolved
high-frequency work contributes neither aliasing nor visible crawling.

Crater parameters are packed once into a one-row RGBA8 data texture, using two
16-bit values in raw byte storage uploaded through `Texture.fromBuffer`; canvas
must not intermediate this upload because alpha conversion can corrupt data.
The silhouette fades inward over approximately one screen pixel, using the
camera-derived footprint, so zoom does not enlarge its antialiasing fringe.
The packing uses two
16-bit fixed-point values per texel and four texels per crater. This avoids
fragment-uniform limits while remaining compatible with WebGL implementations
that do not expose floating-point textures. Crater work is a single bounded pass per fragment. A conservative axis-aligned
bound rejects distant craters before ellipse transforms. For contributing
craters, the shader accumulates age-ordered height, analytic height gradients
and occlusion together; finite-difference normal samples evaluate only the cheap
dome, broad relief and microrelief fields. Crater cost is one candidate
test per crater per pixel rather than four relief passes plus an occlusion pass.

Each visual description also derives a `surfaceProfile` by blending the four
material presets according to bulk composition, then applying one independently
seeded history state: fresh, dusty, battered, fractured or rubble-pile. The
profile biases roughness frequency/amplitude, grazing response, pitting,
fractures, crater sharpness, rims and broad lumpiness. Microrelief perturbs the
shared height field and receives an additional restrained grazing-angle contrast
term, keeping frontal faces quiet while revealing texture near the terminator.

Craters are stamped oldest to newest into the same relief field. New bowls erase
older crater relief locally, so surviving rims, concave wall counter-shading and
overlap shadows all follow the combined geometry rather than drawn ellipse
bands. Parabolic bowls and Gaussian raised rims retain their full analytic
slopes, with native surface relief continuing through their floors.
Each body carries a bounded 102–144-impact population: roughly 70% small,
24% medium, 5% large and 1% basin-scale. Older rims soften, basin-scale impacts
are broad and shallow, and independently sampled centers may overlap naturally
or approach the limb so the silhouette clips their geometry. Centers are sampled
uniformly over visible-hemisphere surface area and then projected through the
directional silhouette, rather than sampled uniformly from screen pixels. This
accounts for the larger amount of edge-on terrain compressed near the limb. The
container rotates with the body; `paintAsteroid` inverse-transforms a
fixed world light into a shader uniform every frame without rebuilding geology.
The shader silhouette uses the same directional-radius equation as
`sim.surfaceRadius`, keeping artwork, mining sites and hit testing aligned.
Descriptions contain bounded normalized uniform data and are cached by ID and
radius; no artwork fields are serialized. `tests/asteroid-art.html` displays twenty
fixed seeded examples using the production painter;
`tests/asteroid-playground.html` generates a fresh random panel on every load for
visual exploration without changing the deterministic study or test fixtures.

## Population session boundary

`population.js` loads after simulation and before `session.js`; both precede HUD
and game. The app owns a session containing separate world and population state.
Operational transitions pass through the coordinator; rendering only reads it.
Population is never included in tactical cloning or fixed-step normalization.
See [population](population.md) for clock, event, transport, and save contracts.
