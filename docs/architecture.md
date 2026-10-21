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

### 3D scene prototype

Authored flight skies supply cached environment lighting through a host-local
`sky-environment` event. `skybox.js` owns probe/image loading; `scene3d.js` owns
world-normal transforms, diffuse SH evaluation and rough-reflection texture
sampling for shared materials. `tools/bake-sky-lighting.py` performs normalization
and SH convolution during asset preparation. No environment resources enter world
state or mission logic. See [sky authoring](skybox-authoring.md) for cache generation,
coordinate conventions, coverage and reflection-filtering limits.

`src/scene3d.js` supplies `Driftworks.scene3d.create(host, getWorld, setWorld)`
with the same scene controller interface as the Pixi scene. `game.createScene`
selects it only with `?renderer=3d`; the default and `?renderer=2d` use the existing
Pixi implementation with its detailed artwork.
Load `mesh-builder.js`, `mining-rig.js` and the vendored
`vendor/three/build/three.global.js` before `scene3d.js`, after
simulation/camera/audio and before game. The backend uses Three.js with authored
materials, ordinary scripts and relative assets, with no network dependency or
deployment build step. Game timing, session ownership and the DOM HUD
remain in the existing modules.

All objects render through one perspective camera. Simulation x/y map to the
z=0 movement plane. Orbit yaw/tilt, GPU buffers and effects are session state;
the existing saved camera x/y/zoom still describe the view target and scale.
`project` and `unproject` share the renderer's camera basis and perspective;
unprojection intersects the movement plane for panning, cursor-anchored zoom
and empty-space orders. Asteroid surface picks ray cast against the same solid
field used for mesh generation, transformed into the rotating body frame.
Object context picks dispatch through the existing visual context order rules.
The dim reference lattice sits below the bodies; selection/order cues use a
screen overlay projected with the same camera.

At inspection zoom, camera target height rises to the derived outer surface or
the exposed cut plane to avoid driving the eye inside the solid. Pan and zoom
intersect that inspection plane; empty-space commands still intersect z=0.
Height is derived presentation state and is never serialized.

Asteroid meshes use cached marching tetrahedra over a body-local solid field.
The equatorial silhouette matches `sim.surfaceRadius`; vertical extent and
surface relief are presentation geometry. `Driftworks.asteroidArt`, exposed by
game.js before boot, shares the existing seeded visual description, CPU relief,
GLSL geology functions, uniform packing and raw RGBA8 crater data across both
backends. The 3D backend lifts the authored crater centers onto a complete
spheroid, undoing their original .96 projected-radius compression so impact
density continues through the equator. A rotated lower-hemisphere population
extends the same seeded impact sizes, depths and age ordering around the back.
Each impact center sits on the uncratered broad surface. Finite differences of
that surface field establish its actual outward normal; circular world-space
footprints use distance in this local tangent plane, avoiding sphere-to-spheroid
stretching. The 3D backend packs these centers, normals, radii, depths and rims
into its own five-texel RGBA8 impact records. CPU meshing and GPU shading use the
same frames and age-ordered bowl/rim profile. Spatial bins accelerate CPU stamps
without changing overlap order. A periodic 128-by-64 angular table caches only
broad relief; crater displacements are evaluated in physical local coordinates
in the closed solid field used by meshing, attachments and ray picking.
The 88-cell marching-tetrahedra mesh stores broad surface normals on exterior
vertices and real geometric normals on exposed interior faces. The shader adds
crater gradients once, preserving fine impacts below mesh resolution without
doubling slopes already represented in the mesh. The original composition
palette uses smooth three-axis blending. Fine surface bumps use a seeded,
filtered fourteen-octave solid 3D noise field evaluated directly at the deformed
physical body position. Orthogonal octave rotations avoid repeated lattice-axis
patterns. There is no normalized-sphere or planar texture domain to stretch
under broad deformation; analytic trilinear-noise derivatives in those same physical coordinates
produce a world-metric gradient projected onto the actual surface tangent plane.
Per-fragment depth sets the pixel footprint; unresolved layers fade out and
terminate the loop before doing further noise work. One analytic evaluation per
layer replaces six finite-difference evaluations. Viewer wheel zoom focuses on
the picked surface and pauses orbit, allowing close inspection without entering
the body. Exterior and cut surfaces share this noise field, with no UV seam or pole mapping. Lighting is world-fixed diffuse plus a
small ambient fill, with crater occlusion reducing that fill. A broad-normal
terminator gate prevents normal-map bumps on the unlit hemisphere from receiving
sunlight. There is no camera-facing limb multiplier or additive grazing noise
that can make dark-side pixels glow while orbiting.
Real cut faces use their own mesh normals and shared material. The standalone `tests/asteroid-orbit.html` viewer uses `scene3d.create` with
`study: true` to disable the tactical grid, center the inspection camera on the
body, and use ordinary left-drag for orbiting. `getOrbit`/`setOrbit` expose only
renderer-owned camera angles to its animation loop. Its seed input changes only
the isolated specimen ID. `setStudyParameters` regenerates the seeded artwork
with an optional normalized bulk mix, then applies bounded roughness, crater-depth
and heterogeneity controls outside world state. Composition overrides participate
in the material-dependent surface profile, rather than merely tinting an existing
specimen. Reapplying parameters starts from authored defaults, never multiplying
previous edits. Replaced visual objects invalidate CPU geology and GPU mesh/impact
texture caches. The main game omits all study parameters. Surface walk keeps a viewer-local
radial position and transports its heading onto the terrain tangent plane.
`surfaceFrame` intersects the closed solid field and derives its outward normal;
the eye stays above that surface, and the camera up axis follows local terrain.
WASD/arrows and the on-screen step controls move tangentially; drag adjusts yaw
and pitch. The wheel raises/lowers normal-relative altitude exponentially between
0.004 and 0.3 body radii, with a physical-meter readout. Wheel input over the
parameter panel scrolls that panel instead. `setSurfaceCamera` supplies an orthonormal camera basis to the shared
projection path without changing simulation camera rules. Leaving walk restores
the previous orbit position, angles and inspection height. Cutaway and reseeding
exit walking; changing material parameters resamples the walking surface.
Pixel footprint is derived from focal length, viewport size and fragment depth
for both perspective camera modes. Alt-drag spans
both hemispheres; Underside provides a direct inspection view. The lattice plane
moves behind the body when viewing from below.
When excavation is active, the field
subtracts a chamber bounded by offset joint planes at `pocketOffset` and an octagonal tunnel following
`tunnelAngle`/`tunnelTurn`, using `depthM / METERS_PER_UNIT` explicitly.
Bounded piecewise-linear fracture displacement breaks up excavated walls while preserving
centerline clearance. `rockField(asteroid, point, false)` evaluates the excavated
solid with its roof intact; `asteroidMesh(asteroid, resolution, false)` meshes it.
Omitting the final argument retains the existing cutaway presentation. These
inspection arguments do not modify persistent excavation data.
`tests/excavation-study.html` inspects that shared geometry with the original
exterior geology material, terrain shadows, an inspection light, entrance/interior camera presets,
and a chamber-radius control in physical meters.
It opens with the roof intact. The study and renderer comparison both use
`tests/asteroid-rock-material.js` for exterior color, crater normals and fine
relief; excavated walls use a separate fractured-rock material and section
faces use a separate neutral material.
The study places two production mining rigs through `tests/excavation-rigs.js`.
It casts from inside the chamber onto the rendered floor, applies the production
eight-leg contact fit and ramp stops, and preserves the 36 m chassis scale.
Study spotlights follow the existing rig fixture mounts and physical ranges;
constant-power attenuation avoids Three.js's meter-scale inverse-square clamp
in this body's normalized coordinates. Rig view frames both sites; Rig lights
toggles the fixture beams. These are renderer-owned study actors, not saved platforms.
A horizontal cut through the chamber center removes the upper shell. The cut
face, inner walls, floor and outer shell belong to the same mesh, so depth testing
and orbiting provide real interior occlusion/parallax. Excavation parameters and
radius invalidate the mesh cache; camera motion and body spin do not.
Rendering never adds durable fields or mutates the world. Platform height and
inspection camera elevation derive from that same relief-bearing surface (or
exposed cut height). All geology and GPU caches remain renderer-owned.

This is a rendering/input prototype, with blockout craft, directional shading,
fixed mesh resolution and basic combat effects. The detailed Pixi artwork below
remains available through the previous renderer and study pages. The shared
headless suite checks camera inverse projection, depth parallax, full-shell continuity and body scale, excavation geometry and surface picking; browser verification is needed
for WebGL, native input and audio.

Small-craft artwork uses world-light shading and continuous detail fades at
8–32× and 32–96× zoom. Presentation geometry does not change physical dimensions
or simulation attachment points. Platform anchors derive their extension from
existing lifecycle timers using `logistics.setupSeconds` and `packSeconds`;
excavation effects require the same deployed, staffed, ore-available conditions
as extraction. Selection brackets use screen-scaled strokes independently of hull shading.
Attached platforms use a cached asteroid-local terrain normal (the shader's
broad dome plus shared relief, excluding microtexture). Rotate that normal into
world space and compose slope-aligned tangent projection after the platform
heading, with compression clamped to 0.2. Project individual footpads onto this
plane; chassis and machinery vertices additionally move by their height times
the surface normal's screen components. Shaded side walls and articulated legs
connect the elevated body to its ground contacts, with rear legs drawn first.
Workers use projected positions with a small height offset; selection brackets
stay uncompressed. Simulation positions and carried geometry remain unchanged.

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
| `src/engine-audio.js` | Shared procedural engine synth, presets, tuning persistence and spool response; caller owns its context. |
| `src/audio-mixer.js` | Flight channel balance, ducking, headroom and settings UI; receives context and master callbacks. |
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

## Mothership habitat artwork

The optional 3D backend translates the existing 72 x 34 rounded habitat into a
96-segment drum about the ship-local x axis, including rounded shoulders and
closed end caps. The original 38-second spin phase comes from
`game.mothershipHabitatUniforms`. Surface bands, ribs, lamps and the asymmetric
gold-edged service panel use angular coordinates around that actual cylinder;
mesh depth testing hides the far side. The bearing, raised spine, hatches,
antenna, status lamps and side modules are separate fixed meshes preserving
the existing plan-view layout and mechanical palette. They turn with the ship
but do not spin with the habitat. Close inspection derives camera height above
the raised machinery; geometry and presentation height remain outside saves.
The default Pixi implementation below remains unchanged.

The mothership remains a layered schematic. Only its horizontal rotating habitat
uses a fragment shader; the stationary bearing, center spine, antenna, attached
modules, selection brackets and order indicators remain Pixi vector graphics.
The habitat shader evaluates a rounded-box signed-distance silhouette on a small
transparent mesh, with a camera-derived pixel footprint providing a roughly
one-screen-pixel antialiasing transition at every zoom. It also computes the
cylinder normal continuously from the habitat-local vertical coordinate, applies
the same fixed world light used by the asteroid renderer, and generates rotating
bands, lamps, ribs and the service panel procedurally from one spin phase. This
keeps the rounded shoulders and lighting continuous instead of approximating them
with horizontal vector strips. The shader layer sits behind the ordinary bearing
and core layers, and none of its presentation state is serialized.

## Population session boundary

`population.js` loads after simulation and before `session.js`; both precede HUD
and game. The app owns a session containing separate world and population state.
Operational transitions pass through the coordinator; rendering only reads it.
Population is never included in tactical cloning or fixed-step normalization.
See [population](population.md) for clock, event, transport, and save contracts.

### Viewer asteroid surface

Study views draw the base asteroid terrain and its procedural surface shading.
Separate surface boulder meshes are omitted to keep close flight and walking
views free of tile generation, uploads, and additional rock draw calls.

The later surface-detail and shadow experiments are retained separately; see
[Retired asteroid surface experiments](#retired-asteroid-surface-experiments).

### Mothership 3D artwork

The game and `tests/mothership-orbit.html` share the production model in
`scene3d.js`. The habitat retains its schematic 72-by-34 silhouette; canonical
hull length remains 1,000 m, and semantic zoom does not alter physical rules.
A coaxial stationary truss extends from both habitat hubs with service modules, tank farms, radiator wings,
docking collars, a berthed utility shuttle and an aft propulsion cluster.
Stationary end-bearing cages surround the rotating habitat. The opaque outer
shell represents the interior floor, with insulation seams rather than windows.
Panel seams share the game habitat clock; a separate axial shader
transform rotates the batched external ribs and tracks about that same axis.

`mothershipHardware()` returns deterministic position/normal triangle arrays
grouped into eight finishes. Each refinement uploads once per scene and draws in eight
batches. Overview hardware stays below 30,000 triangles; the full ship,
including the habitat, stays below 240,000 triangles at the finest level. Metal receives
a directional highlight, insulated surfaces remain matte, and service lights
stay emissive. This pass uses the existing sun and fill without dynamic shadows.
The 2D painter retains its existing artwork; saves and hit radii are unchanged.

#### Mothership surface detail and refinement

The opaque drum uses cylindrical object-space panel coordinates tied to its
spin clock. A procedural height field adds paired fasteners and weld beads;
finite-difference gradients perturb the lighting normal. Access plates, cavity
grime, panel tone and insulation grain supply larger and smaller material cues.
Materials on fixed hardware receive restrained surface grain and joint marks.
The surface is shaded relief, not displaced geometry or physical damage.

Projected local units per pixel, adjusted by fragment depth and grazing angle,
filter masks and fade tiny details before they become subpixel noise. No texture
fetches, external assets, fragment loops or dynamic shadows are added.
`habitatLod(radiusPixels)` chooses 96, 192 or 384 circumferential segments;
rounded caps, bearing tori and service tubing refine with that level. Shared
levels are bounded and cached. The study allows zoom up to 512 and offers a
Hull detail preset; tactical zoom limits and simulation state are unchanged.

Hardware smart materials also use functional object-space masks: bearing bolt
patterns and machining grooves near the hubs, beaded welds at truss stations,
tank circumferential joints, equipment access seams and stencil bars, radiator
cooling channels and edge screws, and alternating safety bands on orange
collars. These add constant-cost arithmetic to the existing material branch;
no geometry, draw batches, textures or additional noise layers are added.
Masks use the same pixel-footprint filtering as the drum. Hardware detail in
the study frames the aft service section for visual inspection.

#### Mothership study navigation

The mothership study provides orbit and free-flight camera modes. Orbit stores
a focus with full three-dimensional height; free flight uses the existing
study pose interface (`setSurfaceCamera`) with a perspective-derived zoom
calibration. Mode transitions preserve viewpoint; presets and Reset restore
orbit navigation. Study mothership artwork holds a fixed scale, avoiding
semantic zoom changing the inspected geometry beneath a flying camera.

Mouse drag aims in free flight, WASD translates along view axes, Q/E changes
world altitude, Shift increases speed, and middle/Space drag slides in the
view plane. Keys clear on blur and mode changes. Inputs retain normal typing.
Escape returns to orbit. Double-click or Pick focus casts a two-sided ray
against cached habitat and fixed hardware triangles via `pickStudySurface`,
selects the nearest positive hit, and keeps the camera eye while retargeting
its orbit. Misses leave the view intact. Picking runs on demand, not per frame.
These controls do not modify the game camera or simulation rules.


### Isolated arcade flight lab

`flightSession` owns manual-flight state. Its `snapshot()` is a borrowed live
view for observers, not a copy or a mutation interface; reacquire it after
reset/combat/world replacement. Browser controls use `setAsteroidDiameter`
(physical metres, 200–4000; false rejects the edit), `setStartPosition` (scene
units; copies the eye, stops velocity, clears contact/fractional time and zeros
the scenery clock), `setOpponentStyle`, `configureHulls`, `acquireTarget`,
`toggleTargetLock` and `nextTarget`. Diameter edits are followed by sortie reset;
style/hull selections apply to the current combat and its subsequent waves.
Opponent style and hull selection belong to the session and survive sortie
reset and combat replacement; replacement combat receives them before spawning.
The composition root updates these settings when UI choices change.
Hull configuration is allowed while paused and
shares the training collision/muzzle rules. Renderers and HUDs observe these
choices rather than selecting simulation geometry.

`advanceScenery` owns writes to the current world's elapsed-seconds field.
Manual frames supply elapsed time; `flightWatch.create` receives a session
adapter with `snapshot` and `advanceScenery`, and advances scenery only by
completed duel ticks. This clock remains separate from manual physics ticks.
`setWorld` is the explicit renderer camera/world replacement boundary. Tests
may still mutate borrowed views to construct simulation fixtures.

`experiments/flight.html` loads the ordinary production script stack with boot
disabled, then a separate flight model and page controller. The model exposes
`Driftworks.arcade` (profiles, create, step, contact); it owns 3D cockpit position,
velocity and an orthonormal attitude basis. SI speeds convert through
`sim.METERS_PER_UNIT`, without tactical time acceleration. Its page controller
uses `scene3d.create(..., {study:true})` and `setSurfaceCamera` to reuse production
geology, with no changes to persistent simulation state or save rules. The
controller caps stalls at 0.1 second and clears input on pause/blur/visibility
changes. The session accumulates elapsed time and executes exact 1/120-second
ticks, matching the duel clock's cadence and rounding tolerance. Fractional time
survives between calls (including pauses and combat toggles); sortie reset and
death discard it. Each completed tick uses the controls and loadout supplied to
the call completing it; input changes are not timestamped or queued. Identical
per-tick inputs reproduce simulation state independently of frame batching;
sampling live input at different frame rates need not produce identical inputs.
Calls completing no ticks preserve the previous contact indication. Browser
presentation/audio clocks still use frame elapsed time. Radial surface sampling stops
contact with 5 m clearance; this is an arcade stop, not a rigid-body collision.
The flight session advances a six-hour +Z asteroid spin in simulation time (pause
freezes it; sortie resets preserve its phase). Rendering, surface crews and the
work light share that phase. Cockpit surface directions and projectile field
samples are inverse-rotated into body coordinates; sampled contact points return
to world coordinates. A craft stopped against terrain follows its rotation and
attitude while contact persists. This remains an arcade surface stop.
Flight surface rigs and crew cache immutable body-space vertex buffers. Rotation
and translation update study actor draw uniforms, without resampling terrain or
rebuilding/uploading those buffers. Radius, excavation or source pose changes
invalidate the attachment cache. Study batches opt into upload reuse with
`staticGeometry`; dynamic actors retain their existing upload behavior.
Both dependency-free test entry points load the extracted retail maneuver data
before the flight model. The profile fields retain table units: seconds for
accel/decel constants and rotation times, m/s for speed vectors. Forward engine
ramping and lateral slip damping are separate; rotational damping and yaw banking
are also applied. See README for engine-power and afterburner assumptions.


Flight collision queries skip detailed terrain outside its enclosing 1.12-radius
sphere; the original per-substep contact sampling remains active near terrain.


The flight lab uses `experiments/skybox.js` for a perspective environment at
infinity: a single full-screen panorama pass and one batch of 3,200 seeded star
points. Both use the cockpit basis and the production 45-degree vertical field
of view. Translation never enters sky projection. The locally vendored ESO
all-sky panorama supplies the Milky Way; sharper procedural points provide
rotation cues at its limited resolution. The opaque background canvas sits
behind the transparent production scene. Other viewers retain their backgrounds.


Flight guns live in `experiments/guns.js`, independently of tactical combat or
saves. The controller advances cadence, projectiles and short-lived impacts on
the same substeps as flight; pausing freezes them and reset clears them. Bolts
retain their weapon reference across bank changes. Collision uses an enclosing
sphere followed by swept samples at no more than 1 m spacing and bisection
against `scene3d.rockField`. Impacts do not excavate or damage the asteroid. Ship contacts use `shipPackModels.hullHit` with the weapon's head radius in metres: an expanded bounding sphere and triangle bounds reject misses, then a continuous sphere sweep checks faces, edge capsules and vertices. Contact fractions order the nearest impact; decals use the actual hull surface point. Zero-radius ray queries retain exact triangle picking for convergence and inspection. This prevents visible bolt edges overlapping a hull without damage.
`scene3d.setStudyEffects` accepts up to four position/normal triangle batches
and colors; only study scenes draw them. Reused dynamic GPU buffers render
soft additive bolt billboards and flashes through the same camera/depth buffer as terrain.
Two generic barrels fire per volley, independent of the original POF gun mounts.
Their mounts are 3 m left/right, 1.3 m down and 4 m forward of the eye;
normalized firing directions converge at a shared point on the crosshair ray,
retaining the weapon speed. At volley emission, `training.convergencePoint`
selects the nearest living hostile hull surface within weapon range, excluding
surfaces within 1 cm of the eye and terrain-occluded hulls. For a surface less
than 8 m ahead, launch points retract to half its forward distance (normally
4 m) so both shots approach it from behind without backward fire. The gun controller
accepts an optional lazy aim-point callback, called once per volley; a null point
falls back to 300 m forward of the eye. Player sessions, duels and AI craft use
the same query. This does not snap to off-axis targets or predict their motion;
there is no linked-bank or energy simulation yet. Training combat supplies separate health and enemy logic. Existing synthesized audio
honors the main game's sound preferences.

Flight effect batches use their three normal slots as unnormalized UV/opacity
attributes, carried separately into the effect shader. Camera-facing ellipses
project the bolt length onto the view plane and retain a round end-on footprint.
A narrow bright core and fading glow replace crossed opaque rectangles. Depth
testing remains enabled while additive effects disable depth writes; impact
opacity fades with age. Visible bolt length and width scale linearly with distance
from the camera, reaching full size at 30 metres to keep nearby fire from covering
targets. This maintains roughly constant angular size within that range; beyond
it, perspective shrinks the full-size artwork naturally. Weapon dimensions and
ballistics are unchanged.


`experiments/input.js` provides pure controller mapping and deadzone helpers.
The flight page polls `navigator.getGamepads` once per rendered frame and feeds
that snapshot into the flight substeps. Button edges control bank switching and
pause; axes and held fire/boost are continuous. Mouse deltas accumulate once per
frame and become rate demand normalized by frame time, then clear. Pointer lock
is acquired only from Fly's user gesture; success starts flight, while failure
leaves it paused. Pointer-lock loss, Escape, blur, hidden tabs and controller
disconnection clear transient input and pause. Controller/keyboard mode uses an
explicit Fly action without pointer lock. No controller mappings enter world
state or tactical saves. Standard and configurable raw mappings share the same
physical flight/weapon model.


### Flight training combat

`training.stepControlled` owns the common tick sequence used by manual sessions
and evaluation duels: `stepInput` for the controlled craft, `training.step` for
combat/NPCs, then the controlled craft's `flightGuns.step` using shared traces,
terrain queries, convergence and muzzle anchors. It reports shot/impact feedback
and whether combat damaged the controlled craft. An optional read-only observer
runs after combat and before controlled gun damage so duel damage/dry-spell
metrics retain their original sampling boundary. It always finishes the gun
tick after controlled-craft death, suppressing new fire but aging existing bolts.
The helper does not advance clocks or decide termination. Manual sessions retain
asteroid spin, body-frame terrain marks, audio callbacks and post-gun contact;
death skips contact and discards pending time. Duels pass radius zero without
terrain and retain metrics, replay inputs and death/opponent-death/duration stops.

`experiments/training.js` owns the isolated wave director, pilot decisions,
steering primitives, training health, target IDs, and simple enemy geometry.
The page calls its simulation on the same 1/120 s substeps as player flight.
The wave director spawns three to six craft and assigns no more than two attack
slots. Decisions update every 0.28–0.65 s, with committed break/evade/recover
windows; continuous steering supplies pitch/yaw/roll/throttle/boost to the same
`arcade.step` used by the player. Predictive aim uses target velocity with
pilot-dependent lead and deterministic error. Fire is gated by range, alignment,
attack assignment, and short burst windows. Steering separates nearby enemies
and avoids a conservative asteroid shell. It does not port FreeSpace source.

Projectile sweeps choose the nearest terrain or opposing hull contact
(triangles in flight/duels, explicit spheres in standalone legacy fixtures)
before applying damage. Dead targets cannot take repeated damage or score twice.
Destroyed enemies stop steering/firing but their already-fired bolts expire
normally. Clearing a wave starts a five-second countdown. Common lab shields,
hull and health tuning are separate from retail maneuver profiles. Death stops
the run; pause freezes all combat clocks. Reset creates a fresh training session
and respects the free-flight checkbox. No training state enters tactical saves.

`scene3d.setStudyActors` submits up to four opaque position/normal triangle
batches through reused dynamic buffers and the production depth test. The
training craft use six triangles each. Soft bolts, hit/death flashes share the
existing study-effects batches; a separate DOM-owned canvas draws contact
brackets, off-screen direction cues and a selected-target intercept pip.
Actor/effect buffers and UI resources stay outside simulation state.


### Renderer diagnostics and pacing

`scene3d.getRenderStats` reports actual submitted draw/triangle/line counts,
unique drawn buffers and finish/color variants, buffer size, pixel ratio, and CPU
submission duration. Counters are updated at the common draw function; no
synchronous WebGL state readback or GPU timing is performed. Cached but undrawn
meshes are excluded. `setStudyDiagnostics` controls study-only normal/empty/boxes
modes, flat fragment output, resolution scale and layer visibility. Boxes bypass
mothership detail selection and asteroid material setup; empty mode bypasses
scene submission and sync mesh generation. Existing resident caches remain
available when switching back. Non-study scenes retain production rendering.

Flight's sky renderer reports its own two draws / two triangles / 3,200 points;
the page combines those with scene counters. `experiments/performance.js` owns a
bounded timing window and a frame pacer. rAF continues to schedule, but skipped
frames do not simulate or draw. Accepted frames retain real elapsed time for the
existing simulation substeps and record unclamped display intervals for spikes.
The default cap is 60 FPS active and 15 paused. The full CPU number includes
input, simulation, geometry preparation, HUD and submission; it is not GPU time.

## Imported flight artwork experiment

`assets/ships/` keeps each creator pack in its own directory with its untouched ZIP, provenance manifest, source OBJ/MTL subset, and derived `meshes.js`. `tools/convert-ship-packs.py` is an optional offline standard-library converter; deployment needs no build. `experiments/ship-packs.js` transforms normalized meshes into existing study actor batches, shared by the inspection page and flight enemies. Flight and inspection render original Quaternius textures imported offline from archived glTF. Artwork is normalized to an 8.5 m radius; flight and duel collision queries use those same normalized model triangles.

Flight training state accepts a `furball` mode with two eight-ship wings. Craft IDs own committed opponent targets, decisions run at pilot intervals, and the existing arcade controller executes steering. Swept bolts filter same-team hulls and hit the nearest opposing ship or scenery; player fire belongs to the allied team. Round replacement is bounded to 16 craft. Ship artwork and soft bolt effects batch by team (two opaque and four effect batches maximum).

### Flight lab fighter finishes

`experiments/ship-packs.js` keeps the original neutral `geometry` API and offers
`detailedGeometry` for the flight lab and ship inspection viewer. It caches model-local
armor seams and flush service stripes, and classifies faces into four shared finishes:
painted armor, exposed metal, dark glazing and ochre markings. Surface placement is
heuristic across the CC0 packs, not an authored UV layout. Existing silhouettes and
source meshes remain intact. Pose transforms batch each finish across a fleet; the
study renderer accepts eight actor batches (four per team) and optional `finish`
values using its existing lighting. Friendly square and hostile diamond HUD contacts,
plus radar colors, carry allegiance independently of hull paint. No runtime assets or
network dependencies are added.

The flight lab defaults both artwork selectors to Mixed fleet. Model assignment
cycles through the Quaternius library by immutable pilot index and wave, covering all
11 models over successive waves; casualties never reshuffle survivors. Per-model
geometry is merged into one source-textured batch per model per team. The study
renderer accepts all model batches so mixed fleets do not lose ships. Selecting a specific model or the blockout still overrides the mix.

Disabled flight-lab pilots create presentation wrecks with a copied pose, inherited
SI velocity and a deterministic world-space tumble axis. These coast without flight
damping or thrust, persist across waves, and retain their original wave's mixed
model assignment. They are excluded from targeting, radar, weapon collision and
kill accounting after the initial disable. Terrain contact stops drift and spin.
Wrecks expire after 120 simulation seconds and the oldest is removed above 48;
restart clears them. They share live craft's material batches and use intact hulls.
This is isolated training state, not the main game's salvage/recovery lifecycle.

Flight-lab hull finishes use a brighter armor palette and a study-actor-only .18
fill contribution, leaving production geology and mothership lighting unchanged.
`shipPackModels.engineAnchors` caches one or two aft-facing surface anchors per
model. `engineGeometry` emits a blue-white halo and throttle-scaled exhaust per
anchor into one additive effect batch shared by both teams. Camera-facing quads
use the existing soft emissive shader and depth testing; they are visual cues,
not dynamic lights or bloom. Disabled/idle craft emit no exhaust. The study effect
budget is five batches (the existing four gun/impact batches plus engines).

Flight lab communications live in `experiments/flight-comms.js`. The pure
`create`/`step` scheduler consumes active flight seconds and living training
combatants. `mount` owns subtitles and a gesture-unlocked Web Audio context,
using `mumble.js` synthesis and radio processing. Only one voice plays at a
time; actual source completion restarts the silent-gap timer, and occupied frame intervals never count as silence. Completion callbacks are scoped to their transmission; pause, reset, and page exit stop playback. Comms state is not persisted.
`pilotVoice(craft)` assigns 16 curated adult timbres by stable craft index in
furball, mixing masculine and feminine voices on both teams. Lines carry fresh
`voiceSettings` and a character seed. Playback applies emotion over that stable
identity. Control has a separate profile; mumble owns output level matching.
Lines carry a separate `radioSeed` derived from transmission serial for varying
squelch and intermittent static without changing speaker identity.

Coordination, distress, combat reports, and emotional exchanges are audible only
from allies or control. Enemy broadcasts use only the ambient taunt pool; enemy
transitions and emotions cannot nominate reactive calls or start exchanges.

Comms observes living craft mode transitions each flight frame (attack, evade,
break, recover, reposition). It records transitions even while blocked and
drops those calls rather than queuing stale maneuvers. Reactive calls require
a varied 2-3.7 seconds of clear channel and ten seconds since that pilot last spoke; distress
precedes other transitions. Valid support replies, reassurance, and returning acknowledgments take first priority and bypass pilot/activity cooldowns. Each reply must start within five active flight seconds of the preceding line being selected, or it is discarded, including while the channel is busy. Support and emotional exchanges finish with an A/B/A acknowledgment; each turn still waits for a clear channel. Firing starts and target switches also offer calls,
and another speaker is preferred when several pilots have something to say. Speaker labels identify craft and maneuver. Tail
calls additionally require a pursuing opponent behind the speaker. Muted
subtitles reserve the estimated speech duration too. Reset clears observations.

Radio airtime is balanced by activity before selecting a pilot. Attack and firing
share an offense category. The last eight reactive calls bias selection toward
less-heard categories and extend category cooldowns (4 + 3 seconds per recent
call), leaving room for rarer maneuvers without inventing events or queuing them.

Comms retains one short-lived cover exchange using caller/threat IDs only.
Replies revalidate both living participants, the threat's target, and a same-team
helper attacking that threat while firing or moving toward it. Requests expire
after five active seconds or when invalid. Support replies have their own airtime
category, observe channel availability, and consume the request once spoken;
they observe AI behavior without issuing orders or changing combat decisions.

Training exposes a bounded `radioEvents` journal (64 entries, increasing
`radioSerial`) for attributed destruction, player shield depletion, and
projectile near misses. `damageEnemy` accepts an optional shooter ID source
(player string or AI craft); `trace` supplies it. `playerKills` counts only
player-attributed kills, unlike `kills`, which counts all hostile losses.
Near misses use segments clipped at the first hit, a 10-30 meter clearance,
and six seconds between reports per recipient. These are isolated lab fields.

Comms snapshots hull, pursuit, firing-pass outcome, wing counts, and relative
closing speed; `update` now accepts player pose. Important facts can wait up to
seven active seconds in a bounded 12-entry buffer, unlike transient maneuvers.
Wave changes and dead speakers invalidate buffered facts; remaining counts and
shield depletion are rechecked before speaking. Reactive activity balancing
still governs richer calls. `compose(kind,data)` expands templates, and
`numberWords` supplies spoken numeric fragments before full-line synthesis.
AI fighters have no shields; only the real player shield pool produces shield
callouts. Hull vulnerability is explicitly described as hull damage.

`flightComms.contactData(player,point)` projects contacts into the player basis
using SI distances, rounded 100-meter ranges, clock sectors and elevation.
Acquisition uses 2.5 km entry / 3 km exit hysteresis. A newly acquired contact
can offer a report; subsequent reports need a changed sector/range and 30 seconds
since its previous announcement. Only the nearest new contact is offered per
frame. Pending reports are deduplicated, expire with other facts, and revalidate
target survival, range and current geometry before playback. Contact airtime
has an 18-second base cooldown plus the usual recent-activity penalty.

The comms mount exposes `speakerId()`, the active transmission's craft ID or
null for control/anonymous chatter. It clears on completion, pause, mute and
reset; muted subsequent calls use the estimated speech duration. Flight HUD
contacts pass a `speaking` flag to radar. `flightRadar.speakerHalo` draws a shared
white ring with dark underlay on the radar tip, ship marker or edge arrow,
preserving faction and selected-target colors.

Comms line choice uses a bounded 24-record `recentLines` history of rendered
text and template keys. `compose` retains source keys on its returned array;
`pickLine` scores exact-text and template matches by frequency and recency,
selects randomly among the lowest scores, and avoids immediate exact repeats
when alternatives exist. This history is global across speakers, clears on
reset, and permits singleton choices. Work is bounded by variants times 24.

Flight radio tracks one continuous `stress` value (0 to 1) per living pilot in
its `emotions` map, keyed by craft ID. Observed pursuit adds .06 stress per
active second (.10 for multiple attackers); each hull point lost adds .015.
Critical hull damage raises stress to 1 and damage delays recovery for six
seconds. Safe flight then removes .035 per second. Fear enters at .35 and
exits below .25; panic enters at .80 and exits below .65. These separate entry
and exit thresholds prevent flickering near a boundary. Derived intensity
follows stress, so voice delivery also recovers gradually.

Losses/confusion, missed passes/frustration, kill praise/confidence, and escape/
relief create ten-second modifiers, fading during their final three seconds.
Confusion and frustration also add .08 stress; outnumbering raises it to at
least .85. Fear and panic always override modifiers, so positive events cannot
erase accumulated stress. Expired modifiers never reappear after recovery.
Maneuver changes do not reset stress. Death, disabling combat, wave changes,
and restart remove observations. These are presentation-only flight lab fields,
not persistent world fields or AI inputs.

Non-calm pilots can voice their feeling and use emotional variants for routine
maneuvers; factual reports retain their information. Transmissions carry a copied
`emotion` descriptor. `voiceOptions` adjusts the existing character preset's
pitch, pace, variation and tremor without changing voice identity. A single
five-second emotional exchange retains caller ID and emotional category. A living,
same-team pilot who is not afraid or panicked can reassure or acknowledge them,
without needing to attack the caller's pursuer. Replies wait for channel availability, bypass pilot and activity
cooldowns, and take priority over other calls. Reassuring delivery is local to the reply and does not overwrite the
responding pilot's own emotion. Emotional observations continue on busy radio;
expired feelings never form a backlog of old emotional calls.

The ship inspection viewer now defaults to Quaternius Striker with original glTF base-color texture, UVs and normals; both inspection and flight use the original source appearance. The offline converter reads the archived self-contained glTF 2.0 triangle exports and writes inspection vertex data plus local PNGs in `textures/`. This supports these single-mesh exports, not general glTF/GLB, scene transforms, animation, or full PBR. Flight uses the same source textures, UVs and normals, grouping ships by model and texture. Deployment still uses only relative local assets and needs no build.

Quaternius engine exhaust uses explicit model-specific nozzle mounts in `experiments/ship-packs.js`, in normalized right-X / forward-Y / up-Z metres, plus nozzle radius. Mounts are presentation data and do not affect thrust physics. Four-engine ships retain all four outlets; plume dimensions follow nozzle radius and tails extend aft from each mount. The ship inspector provides an exhaust toggle and rear view for attachment review.

Faction paint in the ship inspection viewer and flight lab is an optional per-batch `paint` RGB vector (0–1) on source ship geometry. `sourceGeometry` and `sourceFleetGeometry` accept it as their last argument; omitting it restores the source texture. The shared scene shader selects saturated orange texels with feathered hue boundaries and substitutes the primary paint while preserving source texture variation and neutral/weathered detail. Texture images remain shared and unmodified. Orange markings in the same hue range also recolor; engines and untextured scenery do not. Flight exposes separate allied/enemy colors and a source-paint toggle; these preview settings are not saved world state.

The inspection viewer enables faction paint by default. Picking a primary color enables paint immediately (including after restoring source paint), without resetting the orbit or zoom. Turning off faction paint still restores the original texture.

Paint brightness follows the chosen RGB color rather than being normalized to the original orange luminance, so dark liveries remain dark. Default flight liveries are forest green (#607451) and burnt orange (#bd713f); color inputs also suggest dark navy (#415d7d).

Flight lab hull contacts use `shipPackModels.hullHit`: a cached sphere bounds
check followed by a swept triangle query against a simulation-owned model ID
(including the training blockout). `training.trace` resolves the nearest terrain or hull
contact and uses that point for impact flashes and damage. Flight sessions assign
mixed-fleet collision model IDs by default. In normal flight, each frame samples
hull selections once and calls `training.configureHulls` before advancing or
rendering. That explicit simulation input assigns the same `craftModel` IDs used
by presentation to both teams and the player. Team selections are stored in
`combat.hullModels`, so new waves inherit them before firing. A changed mesh
clears old surface marks; unchanged IDs preserve marks and descriptors. Standalone training callers retain explicit sphere shapes. Watch and headless
duels call the same `configureHulls` API as normal flight for both participants.
Duel options `allyHull` and `enemyHull` resolve to canonical model IDs, included
in summaries, study links and version-4 replays. Hull changes restart watch
duels; the chase camera uses the actual player craft model. Versions 1 and 2
of duel replays are rejected because their collision rules differ. The worker
and CLI load and fingerprint the same vendored meshes and ship-pack code.
`training.hullHit` resolves a craft's JSON-safe `collision` descriptor using shared
mesh geometry, without a presentation callback; unknown model IDs fail explicitly. Scorches are clipped surface geometry baked once per hit in local ship
metres, rendered in five translucent soot layers, and transformed with the hull each frame.
Each craft retains at most 24 burns. Wrecks inherit them; round/restart lifecycle
and the existing wreck cap bound retention. Changing artwork hides marks from a
different model. These experimental cosmetic fields are not production saves.

Study actor batches may specify `opacity`; translucent batches blend over the
opaque hull with depth testing retained and depth writes disabled. Scorch layers
use this to preserve the underlying texture instead of covering it in solid black.

### Flight lab orchestration

All authored `src/**/*.js` and `experiments/**/*.js` scripts run through the
same strict TypeScript/JSDoc check and unchecked-`any` audit. The checker also
compares the configured files with both directories, and rejects scripts that
disable checking, so experiments cannot silently drop out of coverage.
`experiments/types.d.ts` owns lab contracts and augments the shared namespace;
production simulation types do not import the experiment contracts. Its vectors
use scene units for positions and SI metres/seconds for velocity and engine ramps.
`dom.js` supplies typed control lookups for the experiment HTML entry points and
reports missing IDs immediately. Load it before browser adapters, including the
standalone voice and ship previews.

Flight comms has three layers: `flight-dialogue.js` owns line templates, stable
pilot voices, contact phrasing and line repetition scoring; `flight-comms.js`
owns emotions, combat observations and airtime scheduling; `flight-radio.js`
owns subtitles, channel playback and Web Audio lifecycle. Load them in that
order after training and mumble, before flight boot. The existing
`flightComms` API forwards dialogue helpers and `mount` for compatibility.
Ohio radio templates resolve named addressees from living contacts at delivery.
Friendly banter and requests exclude the speaker and use their wing; enemy taunts
may name a living opponent. Cover, reassurance, and acknowledgments address the
actual caller/responder in the validated exchange. Named requests still require
real movement or firing toward the threat before a helper can claim cover.
`replyTo` also identifies an explicitly named addressee in Ohio banter or requests.
Ambient Ohio lines use a living pilot's normal voice and portrait. Template keys
retain `{pilot}` for repeat scoring, while history records the transmitted name.
Without an eligible neighbor, the radio keeps its ordinary unnamed variants.

Ohio wardrobe selection is presentation-only: `mission=ohio` chooses the seventeen
local atlases in `assets/portraits/ohio/runtime/` when the portrait panel mounts.
All other sorties use the standard cast. Slot order, voices, seven frame rectangles,
expression masks, speech timing, reduced-motion behavior, and the seventeen-bitmap
cache budget remain shared. The optional `tools/prepare-ohio-portraits.ps1` packs
ImageGen wardrobe masters while copying the original calibrated inner-face pixels
into every expression frame; it feathers only outside that protected face boundary.
Clothing and headwear are frozen across all poses. Generated masters, prompts,
source/output hashes, and a cast preview are retained under `assets/portraits/ohio/`.
`tests/ohio-portraits.cjs` verifies the shipped facial pixels and mission isolation.
Preview every animated Ohio pilot at `experiments/flight-cast.html?mission=ohio`.

`flight-portraits.js` adds a presentation-only caller portrait to the radio
adapter. It reuses `speech-sprites/generated-v1/face-blend.js` for fixed-master,
inner-face masking and Mumble syllable timing. Load face-blend and portraits
before flight-radio. Lines carry `portraitIndex`, copied from the same stable
craft index used by voices; sixteen distinct pilot portraits cover the sixteen
voice slots in matching masculine/feminine order. Control uses a dedicated silver-haired command portrait (slot 16). The original 4x2 atlas and six localized generated variants
live in `assets/portraits/dogfight/` as preparation sources. Nine additional per-character
4x2 expression sheets live under `cast/`, alongside their imagegen prompts. The optional Windows
tool `tools/prepare-flight-portraits.ps1` applies the eye/mouth calibration offline
and packs seven 256-square poses per character into the checked-in `runtime/`
PNGs. `experiments/flight-cast.html` previews all seventeen identities with speech,
blink and expression layers. Deploying still needs no build step. Source/builder/output hashes and PNG
dimensions are checked by `tests/portrait-assets.cjs` to catch stale exports.

Flight loads only the compact runtime images (about 12 MiB for all seventeen
characters versus about 36 MiB for the preparation sources). Idle-time warm-up fetches and decodes one character at a
time, beginning with Rook (Control loads on demand); a foreground transmission can start its own request
immediately or share the pending request. Up to seventeen compact ImageBitmaps remain
in a fixed cache of about 30 MiB decoded pixels, avoiding first-use popping once
warm-up finishes. No seven-canvas cache is retained per character: the compositor
reads frame rectangles directly from the bitmap. Working canvases belong only to
the active portrait and are disposed on caller changes/clear. Page exit aborts
warm-up and pending fetches, closes cached or late-decoded bitmaps, and a restored
page restarts warm-up. Failed requests can retry. Hair, uniform and background
belong to the frozen neutral master; the shared permission mask is computed once.

The radio adapter passes its actual AudioContext start time and radio speech
offset to portrait playback. Muted/locked-audio messages show a resting expressive
portrait; stop, pause and source completion close the mouth, while reset/channel
clear invalidates pending image loads. Asset failures retain the original radio
glyph and subtitles. Portrait draws are capped at 30 Hz and reduced motion keeps
the face still. Current caller emotions update from the existing comms clock;
fear/panic and high stress select the alarmed face, frustration/moderate stress
select tension, and confident/relieved/reassuring lines select the restrained
smile. Reassurance replies retain their own delivery instead of inheriting the
speaker's baseline fear. Expression and mouth cores render at full opacity to
avoid double lips, with feathering only around the surrounding skin. This module
does not write combat state, introduce emotion rules, or change airtime selection.
Comms may change its own clock, facts, conversations and emotions, but observes
gameplay without writing it. Regression tests pass deeply frozen gameplay views
through contacts, distress, combat events and lifecycle changes, and compare
seeded live sessions with and without comms after every tick, including resets.


`experiments/flight-session.js` owns the lab world fixture and mutable sortie,
combat and gun state. `reset(config)` replaces those three states and optionally
spawns combat; it retains the world, body size and elapsed clock. `setCombat`
replaces only combat, preserving the toggle's existing delayed-spawn behavior.
`snapshot()` returns current references, not a clone; its sortie, guns and combat
are initialized even before the first reset. The browser composition root reads
fresh views per callback or frame, without retaining replaceable session objects;
reset and combat-toggle callers do not synchronize local copies. `advance` executes at most
1/120-second substeps in movement, training, player guns, audio notifications,
and surface-contact order. Death finishes gun/audio processing and stops before
contact. Terrain/hull/surface queries and audio notifications are injected.
The browser loop owns pause, input, elapsed-world time and comms scheduling.
Pause/resume and sortie reset clear the diagnostics adapter's simulation timing
baseline; the first active frame advances zero seconds. Performance intervals
and measurement resets are independent of this simulation baseline. Status text
uses one resolver for death/completion, pause and active-flight/contact states,
so later frame work cannot overwrite a terminal message. The Node suite also
executes `flight.js` in an isolated browser-resource fixture, driving actual UI
callbacks and queued animation frames with real session, diagnostics and duel
implementations (`tests/flight-transitions.cjs`).

Flight-AI validation keeps three policies distinct: existing `training.js`
opponents shape the player experience; `experiments/flight-ai.js` provides a
best-effort perfect stress pilot and delayed-observation human simulators.
Testing pilots return complete validated controls and never mutate live flight
state. They share `arcade.step` and fixed-forward gun physics. The optional
`experiments/flight-duel.js` runs one testing pilot in the player seat against
the existing opponent policy, with fixed 1/120-second steps, no terrain and no respawn.
It is shared by both test entry points, the evaluator and the flight lab's optional
watch mode. `experiments/flight-watch.js` adapts it to fresh lab snapshots, tracks
simulated presentation time and adds a chase camera and player artwork only to
the rendered view. It rereads scenery after camera-driven world replacements;
no observer craft or camera pose enters the simulation. The lab composition root
owns watch controls, pause/reset, speed and cockpit/chase selection. Flight input
is ignored while watching, pointer lock is not requested, and the duel stops on
its terminal result. The dependency-free
`tools/evaluate-flight-ai.cjs` emits measurements and source-pinned input replays.
See [flight AI validation](flight-ai-validation.md) for contracts, baseline,
historical baselines and limits to human/optimal-play claims.

`tools/import-retail-flight.cjs` reads numeric retail VP tables offline into 35
small-craft profiles and ten bolt weapons. `training.configure` assigns player
class hull/shield maxima; `training.equip` assigns craft class defenses and primary
weapon. Configured spawns use those defenses, and both sides share shield
absorption/spillover, seven-second delay and 12-points/s recovery. Unconfigured
test fixtures retain legacy defaults. `DuelOptions` records both profile/weapon
choices, hull model IDs and a symmetric unshielded override; replay schema 3
rejects legacy defense/collision semantics. Watch controls choose handling and
defense stats independently from the visible/collision hull models. See [retail loadouts](retail-flight-loadouts.md) for unsupported
ETS, quadrant, energy, hardpoint and special-ability behavior.

`experiments/flight-hud.js` mounts the overlay canvas and target camera and owns
radar range, telemetry, instruments and contact/lead markers. `render(view)` takes
fresh session references and presentation/input values each frame; it does not
retain sortie references or control simulation. Both ordinary scripts load before
`flight.js`; the existing radar and target-camera modules remain subordinate.

`experiments/flight-controls.js` mounts keyboard, pointer-lock, mouse and gamepad
input. Flight lab and mission pages mount this same adapter and composition root.
Input mode, mouse sensitivity, and preferred device ID persist across pages in
localStorage, alongside per-device bindings, steering preset and rumble. Device
selection follows the saved ID even if browser gamepad indices change; unavailable
storage or invalid saved mode/sensitivity uses page defaults.
It owns held keys, the virtual stick, device discovery, editable bindings
and controller button edges, using `flightInput` for mapping math. The pause-screen Settings panel selects original, medium-soft, or wide-linear steering; the adapter stores the preset ID in localStorage, tolerates unavailable storage, and centers input while keeping flight paused on changes. `flightInput.stickDemand` accepts an optional response exponent (default 1; softened presets use 1.6). `sample()`
polls devices, dispatches pause/bank actions, then returns merged flight demand;
fresh button presses or above-deadzone stick changes select the active device
across all connected controllers and clear mouse steering without a mode change.
A fresh non-pause button starts/resumes a living ship without pointer lock;
held buttons, axis noise, hidden pages and dead ships do not auto-resume.
the browser loop checks pause after sampling. `view()` exposes only mouse/mode/
stick-range data and `showMouseStick` for HUD rendering. Above-deadzone mapped stick changes hide the guide and clear mouse displacement; captured mouse movement restores it. Unchanged held axes and small axis noise do not reclaim the guide. Pause Settings shows a fixed reference for standard gamepads: right-stick Y changes throttle at up to 0.5/s, with neutral holding the current throttle. Holding LB/L1 on standard pads routes right-stick X/Y to ship-relative side/vertical demand, suppressing right-stick roll and throttle adjustment while preserving left-stick steering and D-pad throttle. Keyboard A/D and R/F combine with that demand. `flight-model.js` normalizes translation demand to a 5 m/s target with a two-second ramp, independent of retail strafe limits; release targets zero. Manual throttle spans -1 to 1, with negative values targeting up to 5 m/s reverse. Absolute joystick throttle remains 0 to 1. Nonstandard joysticks retain device bindings. `clear()` resets held input; `resetButtons()`
is separately called on resume to preserve existing controller edge semantics.
`haptics(dt, feedback)` owns the selected device's dual-rumble actuator. The
composition root derives boost, player-hit, shield-break, fired-volley, and first
surface-contact feedback around each session advance. The adapter mixes short
priority pulses over light sustained boost, refreshes sustained effects at most
every 75 ms, and issues only bounded 110 ms effects. `clear()` also stops rumble;
pause, reset, focus loss, disconnect and device changes therefore cancel effects.
The saved rumble toggle defaults on; missing APIs, thrown errors and rejected
promises do not interrupt flight. Haptics remain browser state, outside saves.
`capture()`/`release()` own browser pointer-lock requests.
If pointer capture is missing or rejected in mouse mode, the adapter resumes
with absolute cursor steering using host bounds and the existing stick response.
`view().uncapturedMouse` identifies this mode; release, Esc, focus loss or leaving
the host clears it. Mouse firing is restricted to the host, and controller
selection remains explicit. The input selector is visible above Start/Resume.
Gameplay and diagnostic
shortcuts call injected actions; the adapter does not access session, HUD, comms
or weapon selectors. The optional environment argument supplies document/window/
navigator for adapter regressions. Load it after `input.js` and before `flight.js`.

The optional `?aegis=1` flight scenario loads a locally baked capital-ship rig
before creating the sortie. `experiments/aegis-flight.js` owns ephemeral turret
angles, projectile banks and collision proxies; it uses `flightGuns.step` and
`training.trace` for the existing projectile and damage rules. The flight
composition root advances the rig only while unpaused and resets it with the
sortie. Presentation receives the rig through `setCapital`, reuses static hull
buffers for both hull and turrets, with shared GPU meshes and per-mount rotation
bases rather than CPU vertex transforms or streaming uploads. Model projectile
queries use a weakly cached triangle hierarchy over immutable source geometry,
with earliest-entry pruning and the existing nearest face/edge/vertex semantics.
World-space poses remain query inputs; the cache contains no craft pointers.
PD passes a 0.25 s
cosmetic scorch interval to `training.trace`, rate-limiting surface projection
through a weak per-craft cache while retaining every damage event. The optional
interval defaults to existing behavior for all ordinary weapons.
Cached `sourceScorchGeometry` batches also retain fighter/wreck surface marks in
model-local space, invalidating on mark identity or hull changes and using GPU
pose transforms each frame. The older `scorchGeometry` posed output remains
available for callers that need world-space vertices. These
experimental objects are outside the tactical world's save contract. See
[the Aegis reference](dreadnaught-kit.md) for axes, units and prototype limits.

`experiments/flight-presentation.js` owns the main study scene, skybox, texture
loading, artwork controls/credits, faction paint and fleet/effect submission.
`appearance()` returns a fresh selection/paint/image snapshot for both `render`
and the HUD. `model(craft,wave,appearance)` is their shared team-aware model
resolver; `hullHit` uses current artwork with the supplied combat wave. Wrecks
join hull/scorch batches, while only living craft emit engine effects. Submission
remains hulls, scorches, surface scenery, gun effects, engines, diagnostic settings, sky, scene
sync, scene render. `pose` forwards the player camera; `renderStats` supplies
scene and sky counters. It does not advance the session or own its world.
Three design 07 (`rampdock`) mining rigs and their source Quaternius EVA crew use geometry anchored
with `scene3d.surfaceFrame`, at 36 m hull length and 1.8 m suit height. The flight and study share
`assets/characters/quaternius-astronaut/poses.js`. Material batches are cached by asteroid
identity, radius, pose and loaded crew poses; they introduce no simulation entities or saved state.

`experiments/flight-diagnostics.js` mounts render/performance controls and owns
frame pacing, elapsed timestamps and rolling measurements via `flightPerformance`.
`beginFrame(t,paused)` returns null for skipped frames, or elapsed/measurement
context; elapsed is capped at .1 seconds while diagnostics retain actual time.
`endFrame` records CPU time after scene and HUD work and reads renderer counters
only when refreshing the overlay (over 250 ms). Control changes and reset clear
pacing and elapsed timestamps as well as measurements. `settings` supplies study
options; toggle actions preserve F3/P behavior. Both modules load before flight
boot; the HUD uses the presentation resolver. Optional browser/clock environments
support focused headless orchestration tests without WebGL.

`scene3d.miningPlatformGeometry(deployment, time, working, variant?)` returns local triangle arrays grouped by paint, with unit normals and foot pads near z=0. Production rendering aligns this artwork to the asteroid slope and batches it into four reusable GPU buffers. Deployment derives from existing platform state; geometry never changes persistent world data. The mining platform study uses the same geometry.

Mining pod silhouette studies use optional `pod`, `anchors`, or `recessed` variants in the comparison viewer. The omitted variant retains production artwork. These are presentation-only alternatives with no new saved state.

The `fabricated` mining study uses a symmetric twelve-edge footprint, twelve vertical side plates, twelve shoulder plates and a flat deck/belly. Eight equal chassis-mounted grippers retain the pod arrangement. The viewer grey-material toggle changes batch color only, preserving lighting and geometry.

Mining platform artwork has no decorative idle machinery animation in either renderer. Cutting teeth remain static structural geometry; only deployment changes the rig pose. Geometry and paint functions retain their legacy time/working arguments for caller compatibility.

The `workboat` study retains the fabricated chassis and grippers, lowers the main deck, and separates a forward-central sealed crew cabin from an open rear hopper and side-mounted service cradle. These functional zones are presentation geometry only; they do not add crew capacity or cargo simulation.

The mining study loads local Quaternius astronauts through `tests/mining-study-crew.js`, samples frozen neutral/interact poses and submits material batches through study actors. Suit height is 1.8 m; the adjustable main-hull length maps its 32 artwork units to 12–36 m, independent of simulation units. Four fixed placements target the workboat study: ground/gripper, mining head, deck and hatch. This does not add population behavior.

`tests/mining-study-context.js` mounts an existing world asteroid through the production mesh/geology renderer and uses its shared surface-height query to place the rig and ground crew. The existing Quaternius Spitfire is a frozen hovering reference. Its assumed 12 m nose-to-tail length shares the study metres/artwork mapping with crew. Both context layers are independently optional; they do not alter game state.

The `drydock` study treats the body as one cargo hold around a central eight-sided lookout tower. Optional fifth `miningPlatformGeometry` argument `panelOpen` (0–1) rotates twelve yellow cover segments about their outer rim hinges; cargo and tower remain fixed. It removes the rear hopper and cutter, retains a short transfer/launch interface and locks study scale to 36 m. This is manual deployment geometry, with no idle animation or new simulation state.

The `rampdock` study aligns eight doors and eight anchor roots to shared perimeter hardpoints. Door rotation is solved to lower their lips to local z=0 at full deployment. Dark stanchions, upper/lower perimeter rings and radial braces remain fixed as a protective cage; this is an artwork datum, not terrain-aware contact solving.

Rampdock doors use two rigid leaves: a vertical wall that seats against the fixed cage, plus an upper roof leaf covering the hold. Opening first unfolds the roof leaf, then lowers the wall to a 25-degree descending ramp; the outer leaf reaches the local ground datum at a steeper angle. Closing reverses that sequence. Plate thickness follows each moving face normal.

Rampdock tower roof hardware is a static shuttle docking blockout: a marked rectangular pad, octagonal airlock collar with recessed split hatch, and four raised alignment/clamp hardpoints. It remains attached to the tower independently of cargo-door deployment; no docking gameplay is implied.

Rampdock material grammar: yellow is outward-facing transit armor (including the tower docking roof); grey is the hold/work deck and the inward-facing door skins that become deployed ramp surfaces. Dark material identifies fixed cage/chassis and recesses. Door edges remain yellow so their motion stays readable. Docking collar/hatch hardware stays metallic within the yellow roof.

Rampdock lookout glazing uses a flared two-band cab profile: the lower faceted window cheeks face outward/down toward the worksite, while the upper horizontal band provides forward/side visibility. Yellow sills, corner posts and a roof brow frame both bands. The cabin remains sealed; there is no glass floor or underside blister, and docking-roof geometry is retained.

The drydock tower main egress is in its lower core at cargo-deck level (deck z=4.5, shallow threshold top z=4.8), with the access-study astronaut on that threshold. The lookout glazing and roof shuttle hatch are separate upper-level interfaces.

Rampdock medium door hardware shares the existing two-stage transforms: root knuckles and clevis cradles sit on the lower cage ring; fold-axis barrels move with the lower leaf; a telescoping jack spans a fixed frame pivot and moving panel pivot. Fixed stop blocks/closure receivers and moving registration tabs suggest load stops and captured closure. This remains visual articulation, with no actuator dynamics or independent latch simulation.

Door hinge refinement uses three discrete short pins per axis, with frame clevis ears, visible retaining caps and articulated panel lugs. Compact jack barrels/rods suggest controlled low-gravity deployment rather than Earth-weight lifting; fixed cage stops and receivers remain the securing structure. Geometry proportions are visual, not load-rated engineering dimensions.

The rampdock cage retains its original member centerlines and hardpoints, using rectangular box sections about 30–32% narrower in plan than the first square-bar pass. Lower perimeter members retain more depth, while radial cargo braces are lighter. Hinge hardware, leg geometry and panel motion are unchanged by this section-only study.

Cargo deck top (z=4.5) and belly (z=4.15) are separate surfaces with closed rim faces. The broad chassis top sits inside that slab at z=4.25. Do not put dark opposite faces or chassis caps directly on the grey deck plane: this causes angle-dependent depth flicker.

The sorting/transfer tray top is below deck at z=4.3; the tower core and cargo-load undersides penetrate their support surfaces slightly instead of ending exactly on them. The depth regression checks smaller overlapping faces too, not just full-width floor/chassis faces.

### Retired asteroid surface experiments

The production surface retains the approved fixed-resolution crater geometry
and authored surface shader. The later experimental cellular/refinement terrain
was rejected for artificial patterns, weak geometry/shading correspondence,
shadow artifacts and generation/rendering cost. Its custom WebGL renderer,
standalone viewers/lab and experiment-only tests have been removed following
approval of the Three.js migration. Historical benchmark JSON remains under
`tests/benchmarks/`; source history remains in Git.

Rampdock crew interiors are architectural blockouts only: lower entry floor z=4.7 with vestibule, inner doorway, staging and utility niche; upper control floor z=10 with a shared opening through both supporting slabs. The microgravity circulation well stays open: slender guide rails, staggered individual grab handles, entry/staging grips and bridge arrival grips provide places to stop and redirect. A separate handhold route reaches the roof hatch; there are no stairs or ladder rungs. Optional sixth geometry argument `interiorCut` (`lower`/`upper`) removes the cabin shell/roof for inspection; lower mode sections wall height and removes upper slabs and sections the guide rails. No furniture, life-support systems, navigation or interior gameplay is added.

The mining study has a study-only first-person mode in `tests/mining-study-fps.js`, using vendored Three.js and the same rig triangles. It hides the asteroid and pauses the four-view renderer while active. WASD deck movement and toggleable direct microgravity flight use axis-separated swept rays at three body heights; this is inspection collision, not a simulation character controller. E operates two nearby sliding airlock panels. Entry/bridge/roof starting points support quick scale inspection. Escape releases pointer lock and Back to orbit restores the study. No persistent world state is added.

The tower docking pad has a top and four side faces, sharing the cabin roof as its underside. Do not add a box bottom coplanar with the roof at z=13.5: it causes ceiling depth fighting in first person.

The bridge floor at z=10 follows the faceted window waist (0.96 times cabinOutline), including its chamfered corners; both supporting slabs retain the translation opening. The upper sloped shoulder carries a third viewport band for overhead visibility, with transparent panes and mullions in first-person inspection.



First-person mining inspection includes two frozen 1.8 m astronaut references on each occupied interior floor, plus the cargo deck and roof. At the locked 36 m hull calibration (1 model unit = 1.125 m), the interior floors at z=4.7 and z=10 are 5.96 m apart; the z=9 slab is a supporting layer, not a third occupied deck.

The tower now has two occupied decks in its body (z=4.7 and z=7.35), with the glazed bridge at z=10: about 3 m between floors. The former supporting slab at z=9 is removed. The middle deck follows the rectangular tower body, shares the translation well, and has two astronaut references and a first-person starting point. Lower vestibule partitions terminate below its ceiling. This supersedes the previous two-level spacing study.

The current rampdock layout is a suspended two-level pod: entry/work floor z=7.35, bridge z=10, uninterrupted cargo floor z=4.5 beneath. The former z=4.7 crew floor, pedestal walls, side entry and mock cargo blocks are removed. Eight cage ribs meet a structural belt at z=8.8. The entry well contains a downward-facing sliding hatch at z=7.24 and a side pressure door, both operable in first person. Handhold guides continue to the cargo deck; no stairs or support columns cross that space. Interior lower cutaway now inspects the suspended entry level. This supersedes the earlier three-level body study.

Rampdock anchor/frame interfaces share chamfered tapered chassis pedestals, narrower steel adapters and split dark frame sockets. The post starts in the socket at z=5.35 instead of passing through a yellow cube. Leg roots use paired clevis plates and tangent-axis pivot barrels, boxed struts and a sleeve/rod actuator. Separate ankle pivots and jaw pins carry the two-prong gripper; contact positions and eight-leg distribution are retained. Other study variants keep their prior mounts.

Mining inspection cargo is study-only, shared by the orbit and first-person views through `tests/mining-study-cargo.js`. The Cargo slider fills 18 deterministic box/cylinder bays, reserving a longitudinal aisle and a crossing airlock approach lane. Cargo sits at z=4.5, contributes first-person collision, and does not change simulation state or the rig mesh. Empty remains the default.

The full cargo preset now packs larger stacked freight into the available bays and includes two roughly 9 m equipment placeholders (blocky chassis, tracks, cabin and blade). Packing respects the faceted deck boundary, frame hardpoints, center aisle, crossing airlock lane and pod underside clearance. This replaces the sparse 18-load preset.

Cargo blockout now mixes an approximately 20 m articulated truck, a 10 m folded mobile crane, a smaller dump truck and remaining freight. The two largest loads span substantial frame bays; simple wheels, separated cabs, chassis and boom/bed masses establish vehicle silhouettes. The longitudinal passage and immediate airlock approach remain clear; the former full-width crossing lane is no longer reserved through parked oversized vehicles.

Oversized cargo uses zero-G industrial masses, not road vehicles: a long three-vessel process assembly on transport rails, a folded twin-arm uncrewed manipulator sled and a stowed deployment cradle. Their earlier truck-scale envelopes and mixed freight layout remain, but wheels, cabs, trailers and dump bodies are removed. The forms remain coarse scale/clearance placeholders.

Rampdock door clearance uses a mitered hinge polygon offset 0.72 units outboard of the fixed frame. Thick wall leaves have relieved lower corners for the hardpoints; upper closures seat at z=9.45 (underside z=9.23), above the raised pod ribs and closure receivers. Fold pivots and receiver stand-offs follow this height, and the open-tip ground solution uses the new wall length. A triangle/OBB regression sweeps both faces and edges of all door leaves against the primary fixed frame at 41 opening positions.

Ramp/leg clearance is checked before fixed corner infill is designed. The rigid leaves now reserve 2.1 units at their roots and 2.9 units at the fold and roof edges, clearing upper struts, knees and grippers throughout the sampled leg envelope. `miningPlatformLegGeometry(deployment)` exposes the actual anchor-only mesh for diagnostics. `tests/mining-leg-clearance.cjs` uses a triangle BVH and separating-axis surface intersection checks at 401 door positions for 11 leg deployments; this sampled regression complements the primary-frame sweep and is not a formal continuous-collision proof. Fixed infill remains deferred.

The broad-ramp correction supersedes the temporary 2.9-unit relief: rampdock anchors and grippers now extend along each perimeter corner bisector, keeping their sweep out of adjacent bays. Door relief returns to 0.8 units at the fold/roof edges and 1.75 at the roots. The 401-by-11 leg sweep regression passes with these broad panels; no infill has been added.

The roof and side gaps now use stationary black infill attached to the cage, recessed behind the yellow closures. This supersedes the deferred-infill note: there are no auxiliary folding wings or extra moving hinges. Lower ramp cutouts remain. miningPlatformInfillGeometry() exposes these fixed panels for regression checks; the 401-pose mesh sweep checks the yellow leaves against infill, the tower and neighboring bays in addition to the frame and leg tests.

Upper roof leaves now terminate at a mitered eight-plane clearance envelope derived from the tower window shoulder, with a 0.40-unit allowance. This replaces uniform .65 footprint scaling: front/rear and side bays regain their length independently. A stationary black collar at z=9.05 fills from that envelope to the cabin wall beneath the yellow leaves; no extra hinges are introduced. The mesh sweep covers the collar as fixed infill, and reach assertions prevent the global-shortening regression.


The production 3D renderer includes a toggleable surface work light in its toolbar and asteroid orbit viewer. The fixture stays attached to the asteroid 2 m above a fixed surface point, aimed 12 m along the tangent with a 30 m range. SI conversions use METERS_PER_UNIT; camera zoom never changes lamp dimensions. Existing crater/microrelief normals and material color respond to the cone and distance attenuation. Enabling it in the asteroid viewer enters surface walk at 2 m altitude. A single optional 1024-square RG-packed linear-depth shadow map now covers the first asteroid work light. The fixture is offset 2 m sideways from the inspection camera, so shadows can be seen. Both passes use the same mesh transforms; opaque terrain, rigs, ships and study actors cast onto asteroid surfaces. Alpha-cutout textures are respected; translucent actors and effect billboards do not cast. Four depth comparisons soften the edge, with a 3 cm depth bias. The pass is skipped when the light or Shadows toggle is off. Draw/triangle statistics include the extra pass and report shadow counts separately. No persistent state is added. The asteroid viewer includes two metre-scale test posts placed on actual mesh triangles; append ?shadow-test=1 for a GPU readback regression that checks cast shadows on identical ground pixels, darkness-only changes and WebGL errors. Fine shader-only relief still does not cast shadows; local light reception on craft and additional shadow-casting lamps remain outside this trial.

The shared terrain fitter (`src/mining-terrain.js`; `tests/mining-study-terrain.js` is now a compatibility adapter) raycasts the actual `scene3d.asteroidMesh` triangles at the renderer resolution. The study context caches that mesh and landing solutions. With Asteroid surface and Fit anchors enabled, a sampled rigid chassis clearance pass establishes height, averaged contact normals establish tilt, and each anchor solves a fixed-length two-link chain to its own rock target. Gripper carriers align to triangle normals. The shared `miningPlatformContactGeometry` API accepts those local knee/tip/normal poses; gameplay and the study consume the same fitted geometry and landing phases. Landing-site, fit and contact-target controls expose reachable/failed targets and sampled underside clearance. Cargo and onboard crew follow the rigid chassis; ground crew remain on the sampled rock. Ramps retain their existing motion without terrain solving, and first-person inspection continues to disable the surface. The existing folding regression covers nominal anchor deployment; the new terrain regression covers contact and IK, not a continuous collision proof for terrain-fitted legs or ramps.

Mining study performance: the rock mesh is built once for fitting, and successful or failed landing results are cached per site. Actor batches are cached independently of camera state, so orbiting redraws without rebuilding rig geometry or rerunning IK/raycasts. Idle animation callbacks only compare a lightweight state key; no rendering or terrain queries occur. `window.miningStudyPerformance.snapshot()` exposes cumulative state-check, actor-build, view-render, mesh-build, site-fit, cache-hit and raycast counters for browser audits.

Terrain-fitted ramp opening now clamps each bay to its first rock intersection along the existing two-hinge motion. The study sweeps thick leaf triangles against the same displaced asteroid mesh, brackets the first hit at 0.01 opening increments and refines it with eleven bisections, leaving a tiny visual separation. Clear bays retain full travel; the shared Bay ramps slider requests opening up to each independent stop. Limits are solved lazily on first opening and cached per landing site, including camera-only redraws and subsequent slider changes. Performance counters include rampSolves/rampQueries. This is a sampled rigid sweep, not continuous collision certification; there are no extensions or attempts to force every panel to touch.

The mining rig now has one canonical implementation: retired original/pod/anchors/recessed/fabricated/workboat/drydock variants and their tests have been removed, including the duplicate mesh from the frozen terrain-renderer fixture. `miningPlatformGeometry(deployment,time,working,panelOpen,interiorCut)` no longer accepts a variant selector; the remaining diagnostic/contact arguments are internal. Time/working remain accepted by the main renderer without idle mechanical animation. `src/ship-models.js` registers the rig under `Driftworks.originalShipModels`, separately from imported `shipPacks`. The ship-model catalog shows a distinct Driftworks originals group, project provenance, canonical materials and a link to the detailed study; import-only paint and exhaust controls are disabled for original models.


The excavation study uses the shared Three.js geometry/camera bridge and
`asteroid-rock-material.js` for its physical-material experiment. The retired
side-by-side migration trial has been removed; these shared study helpers and
their geometry, camera, material and rig-placement regressions remain active.



The Three.js comparison now separates surface lighting layers. Geometry only retains procedural albedo but derives actual face normals from triangle derivatives (flat shading). This matters because legacy exterior vertex normals deliberately omit crater slopes, expecting the shader to restore them. + Fine texture adds only the shared microrelief gradient to those actual face normals. Legacy crater normals reproduces the broad-body normals plus analytic crater and microrelief gradients. + Legacy darkening additionally applies the cavity color multiplier. Legacy darkening is the default to preserve the established orbital appearance; only the Three.js pane changes. Distinct shader program keys let disabled layers be compiled out. Browser regressions verify the independent layers without changing legacy pixels. Measure performance runs each renderer/layer sequentially, with eight warm-up draws and 24 measured draws per configuration, reporting median CPU submission and draw-plus-one-pixel synchronous readback. Readback includes browser/driver overhead, so it is not pure GPU time or FPS. Static Three.js shadow maps are cached; the legacy shadow behavior and different lighting models remain part of the compared configurations. Controls and movement are frozen during measurement, and viewport changes abort the run.

The local orbit and floodlit-surface sample is recorded in tests/benchmarks/asteroid-three-detail-2026-10-17.json, including viewport, warm-up and readback methodology. These are one-session configuration comparisons, not a general engine ranking.

`src/mining-landing.js` owns the reusable landing phase sampler and optional rigid pose adapter. It has no DOM, study, renderer, mesh-sampling or wall-clock dependency. `src/logistics.js` starts and advances its persistent platform clock at cargo release, selects an unoccupied asteroid-relative footprint, holds setup until ramps finish, and delays recovery pickup while airborne. Both production renderers consume the same continuous phase values; the HUD reports the phase and height. The mining study is a consumer of that production behavior, with mesh-based fitting and local playback controls supplied by its adapter. Runtime poses accept units-per-metre and angular velocity explicitly. Geometry receives continuous progress directly; manual slider quantization is never an animation clock. Terrain batch transforms evaluate one affine matrix per batch to avoid per-vertex temporary arrays. Detailed triangle-level IK, gripper normals, deployment interpolation and thick-leaf ramp sweeps are shared through `src/mining-terrain.js`.


The comparison includes Three.js light-source isolation (sun, ambient, work lamp, and lamp with dim fill) and a specular-reflection toggle using MeshPhysicalMaterial. A source-isolation readback (?lighting-test=1) found strong grazing sunlight, rather than specular reflection alone, responsible for the incoherent bright grain in the initial worksite comparison. That site lies near the solar terminator; legacy shading attenuates sunlight using its broad normal, while the standard material illuminates micro-normals directly. Enabling the work light now selects an explicit lamp-plus-dim-fill inspection preset (sun disabled in the Three.js pane; ambient intensity .08 instead of the original .17). This isolates flashlight shape cues; it is not a new model of sunlight or a planet-wide fix. All sources remain selectable, and switching the work light off restores All when the preset was selected. Historical benchmark samples predate this lighting calibration; new samples record light source and specular settings.

The comparison rock material applies the legacy broad-normal smoothstep solar horizon gate to Three.js directional-light irradiance before its standard material response. Spotlights and ambient illumination bypass the gate. Crater and microrelief normals still shape the lit terrain. GPU regressions verify that the gate darkens solar terminator pixels and leaves ambient pixels unchanged.

Production terrain contacts: `scene3d.platformSurface(platform, asteroid, open)` fits the actual rendered triangle mesh in a fixed 36 m rig frame, rotated to the saved asteroid-relative site heading. The mesh cache is shared with rock rendering; site fits and lazy ramp stops are cached by terrain revision and saved site, independently of camera zoom, asteroid translation/spin or landing time. `platformSurfaceGeometry` caches each local pose and eases individual ramps toward their own first-contact stop. `platformSurfacePose` applies the simulation-owned approach position, 50 m descent and rotation matching without changing save data. Both production renderers consume those solutions; Pixi projects the same canonical fitted geometry and caches its paint, while WebGL submits the mesh in world units. Positions use scale, normals use only rotation. Distant rigs retain a tactical marker. Physical terrain changes invalidate cached solutions; unsupported/unreachable sites retain the existing fallback presentation rather than forcing invalid IK. These presentation fits do not replace logistics' persisted site/occupancy decisions. `game.createScene` exposes the existing renderer factory so the production regression fixture can exercise both backends without alternate rig logic.

`tests/mining-platform-gameplay.html` uses the production world-platform path (no study actors) for landing scrubbing, spin and zoom inspection; `?renderer=2d` selects the production Pixi path. The Node regression verifies shared solver identity, exact sweep-only leaf geometry, eight world-space contact points across spin, fixed scale and cache reuse across zoom, thick-leaf clearance during opening, and physical airborne height.

The comparison defaults to Original appearance rock response, with Standard physical available as an A/B control. The legacy renderer multiplies display-space geology colors by sunlight and fill; reusing its coefficients in linear-light PBR lifts shadows and changes surface contrast. The original response evaluates the shared broad-normal gate, .82 diffuse exponent, subtle solar highlight and crater-occluded fill in the original display space, then converts the result to linear light for Three.js output. This changes only the rock material: Three.js still supplies directional-light colors, shadow visibility, camera and geometry, and the local lamp retains its standard material response. Legacy cavity darkening affects fill and lamp contributions rather than multiplying sunlight globally in this mode. GPU tests disable cast shadows for the material-only comparison (the legacy renderer has no solar shadow map) and require the orbital result to reduce image error against the reference compared with Standard physical. With shadows enabled, Three.js solar terrain shadows remain an intentional visual difference. Performance exports record the response mode.

The migration comparison uses fixture-specific worksite camera presets. Selecting the rig or re-entering Worksite places the camera outside its deployed ramps, aimed at the lamp-lit ground by a leg; posts retain their close inspection view. The study rig is offset sideways from the fixed lamp so a ramp does not fill the beam. Both backends share the staging and camera. GPU checks cover unobstructed camera framing, repeatable orbit/worksite re-entry and visible rig cast-shadow pixels. This affects only the comparison fixture, not production rig placement.


Flight hull rendering uses `shipPackModels.sourceDraw` (or the transform option
of `sourceFleetGeometry`) to pair an immutable model buffer with origin, uniform
scale and a column-major orthonormal basis. The vertex shader applies the same
right / negative-back / up conversion as `sourceGeometry`, which remains the
CPU-baked API for other callers. Each renderer shares static actor GPU buffers
by vertex-array identity and deletes buffers when no submitted actor uses them.
Paint, texture and pose are draw state and do not invalidate mesh data. Replacing
a model's source array invalidates its CPU buffer cache. The target monitor uses
the same draw path and caches its fit radius by model/source-array identity.
Asteroid shader parameter packing is cached with the renderer's existing visual
cache; the tactical grid is neither built nor uploaded in study/flight scenes.

Run `node tools/profile-flight.cjs 240` for a repeatable CPU benchmark of a
16-craft sortie after warmup. It instruments production session and presentation
code, with browser resource stubs, and reports stage times and estimated vertex
upload bytes. Add `--baked` to compare the retained CPU-baked hull path under
the same workload. Stage rows include both parent and child timings; do not add
them together. It excludes GPU execution, DOM layout and audio. Use the flight
lab's F3 diagnostics to check real browser frame pacing and submission cost.

Mining rig fixtures live in scene3d's cached miningPlatformLights geometry. The shared mining-lights module separates 51 visible fixtures from three broad cargo, apron and docking illumination fields. Both renderers use the same rig-local fields; roof grazing heads illuminate the docking coaming even without sunlight. Coarse deck/pod occlusion preserves structural depth without per-fixture shadow maps or additional shadow passes. Lighting frames follow the fitted landing pose and remain derived renderer data.

The fixed upper pod uses miningLights.bakeDocking to cache a separate RGB vertex lighting attribute in model coordinates. Production and study renderers upload that attribute alongside geometry and add it after sun shading; toggling rig lights disables the contribution. Landing transformations carry the attribute unchanged. Meshes with the bake skip the docking field in the fragment shader, while cargo/apron fields and asteroid illumination remain dynamic. Custom consumers must carry bakedDocking alongside vertex positions and normals; raw triangles alone do not include illumination. The bake approximates broad illumination at existing vertices, not fine normal-map detail.

Use miningLights.visual(groups, optionalPose, scale) to construct a complete rig visual: material finishes, bakedDocking and rigLights metadata travel with the batches. scene3d automatically resolves attached light frames through each batch origin, rotation, basis and scale; study consumers do not need a separate setStudyLightRigs call for these batches. Dynamic illumination uses the nearest two rigs to bound fragment cost, while every fixture and baked docking wash remains visible. Flight scenery merges batches by material but preserves per-vertex bake arrays and all rig frames, cached in asteroid-local coordinates so asteroid spin and translation require no terrain queries or geometry rebuilds.

Flight terrain impacts retain up to 96 asteroid-local burn positions per sortie.
The presentation caches layered surface-projected burn meshes and rotates them
with the asteroid; only the nearest confirmed projectile collision creates a mark.

## Procedural assets

`src/mesh-builder.js` exposes `Driftworks.meshBuilder.create(groups)`. The caller
supplies material-name arrays; `block`, `link`, `plate`, and `barrel` append
interleaved xyz positions and xyz normals, six numbers per vertex, in local
coordinates. Blocks take half-extents and an optional orthonormal basis; links
use half-width/depth, and barrels are capped eight-sided cylinders. Plates use
fan triangulation and one face normal, so supply planar convex polygons with
consistent winding. Links/cylinders require distinct endpoints and plates require
non-collinear first three points. The private unit cube is generated once.
These are ordinary geometry operations, independent of rendering or gameplay.

`src/mining-rig.js` owns the reference asset. `bayAssembly` shares bay hinge
calculations and exposes separate leaf, mechanism/frame and infill emitters;
`buildDeck`, `buildChassis` and `buildEquipment` build fixed structural assemblies; `buildLeg` contains the mount, joints,
actuator and terrain-aligned gripper; `cabinGeometry` contains the pressure cabin,
roof docking interface and interior. `miningPlatformLights` constructs fixtures
from the mount definitions in `mining-lights.js`. Edit these functions to iterate
on the corresponding subassembly. No renderer edits are needed to change a model.
The asset accepts deployment, ramp opening, cutaway, contact poses and ramp limits;
it does not sample terrain, advance animation, or allocate GPU resources.

Cabin meshes are private and cached for the four distinct cutaway variants;
assembly copies their numbers into caller-owned arrays. Legs and bays rebuild
for their supplied pose. `fullGeometry` explicitly composes the bay leaves and
mechanisms, infill, deck, cached cabin, chassis, legs, equipment and fixtures in
the original material/vertex order. `miningRig.ramps(opening, limits)`,
`miningRig.infill()` and `miningRig.legs(deployment, contacts)` emit only the
requested components, without generating and discarding unrelated mesh data.
The legacy `geometry` flags are interpreted only by a compatibility facade;
combined flags retain their historical priority (ramps, then infill, then legs). Fixture
geometry retains its existing shared read-only cache contract. Terrain sampling,
contact fitting and fitted-pose caching remain in `scene3d.js`/`mining-terrain.js`;
animation timing stays with existing callers. `scene3d` retains its geometry
entry points as compatibility aliases. Custom WebGL and Three.js consumers use
the same asset output and keep their existing lighting/rendering behavior.

For the next asset, load an ordinary script after `mesh-builder.js`, define its
material groups, and use a builder to append its named subassemblies. Pass the
result to the existing study/batch rendering path. Introduce a new shared
operation only when another model needs the same construction pattern.

`tests/mining-geometry.cjs` checks per-material lengths and SHA-256 fingerprints
of the original numeric arrays for 49 deployment/ramp/cutaway/contact/component
cases. The checked-in fixture was captured before extraction; do not regenerate
it to make a refactor pass. Existing clearance, landing, terrain and lighting
tests cover interactions. Structural assertions also verify finite positions and
nonzero normals, unit normals on non-contact meshes, complete triangles, material
order, fixed door roots, rigid leaves and connected fold hinges, staged powered
jacks, independent ramp stops, knee lamps, ankle pins, gripper pad corners and
cutaway isolation. The artificial off-axis contact fixture has some existing
non-unit normals; their original magnitudes remain fingerprinted rather than
normalized in this behavior-preserving refactor. The browser studies remain the
visual review tools.

### Small performance review (2026-10-17)

`node tools/measure-mining-geometry.cjs` compares the current asset to the version
at `HEAD` in separate ordinary-script namespaces in the native JS realm. It reports emitted mesh numbers,
returned numbers and indicative warm-cache timings (100 warm-up builds, then
six samples of 20 builds with alternating before/after order).
The recorded result is `tests/benchmarks/mining-composition-2026-10-17.json`;
its `baselineCommit` identifies the version used before this composition change.
To repeat that comparison after committing, run
`node tools/measure-mining-geometry.cjs report.json <baselineCommit>`.
Timings are machine-specific Node measurements, not browser frame-time claims.

| Request | Previously emitted numbers | Now emitted numbers | Returned numbers |
| --- | ---: | ---: | ---: |
| Full rig, warm components | 262,728 | 262,728 | 313,020 |
| Legs | 88,704 | 88,704 | 88,704 |
| Ramp leaves | 3,456 | 3,456 | 3,456 |
| Fixed infill | 172,224 | 8,640 | 8,640 |

Only the infill path had discarded mesh construction to eliminate: about 95%
of emitted data was thrown away. The full-rig counts exclude copying the already
cached cabin/fixtures, which accounts for their larger returned size. Tests
ensure component-only requests do not emit discarded mesh. No additional cache,
shader, animation representation or GPU resource changes were introduced.

The four-view study already gates idle rendering and rebuilds actors only when
configuration changes. Camera edits reuse its cached actors. The comparison
viewer builds fixtures when the fixture/view changes; Three.js retains their
geometry, while custom WebGL study batches without `staticGeometry` are uploaded
on redraw. Production terrain fitting already caches meshes, contact solves,
ramp stops and local fitted geometry by deployment/opening; cabin, fixture and
docking-light bake caches are also retained. Rigid asteroid rotation and landing
poses still transform vertices and upload the resulting world coordinates for
each rendering pass. Non-fitted production rigs also regenerate local meshes.
These are remaining opportunities, but reducing those uploads safely needs
explicit per-rig geometry/pose ownership across shadow and color passes. That
renderer work is deferred; this change claims only the measured infill savings,
not a general frame-rate improvement.

The experimental [combat research page](../experiments/flight-study.html) runs shared fixed-step duels in a local Web Worker. Planning and aggregation live in `flight-study.js`, simulation dispatch in `flight-study-worker.js`, and DOM/download ownership in `flight-study-page.js`. It imports no renderer and does not introduce a second physics model. [Study design](combat-research.md) documents censoring, reproducibility and Watch links.


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

### Flight point-blank firing reference

The generic mount correction is a Driftworks playability rule, not an imported
FreeSpace rule. The older Icculus-derived [FreeSpace 2 firing source](https://github.com/ptitSeb/freespace2/blob/master/src/ship/ship.cpp#L4915-L4925)
transforms each model gunpoint into world space and creates the weapon with the
ship orientation. This is a port, not proof of every untouched retail behavior.
Modern [FreeSpace Open firing code](https://github.com/scp-fs2open/fs2open.github.com/blob/master/code/ship/ship.cpp#L12574-L12645)
uses model gunpoints and supports optional fixed, automatic and model-normal
convergence. Its automatic convergence has configurable minimum distances.
These paths do not establish a universal 4 m muzzle offset or the point-blank
retraction rule used here. Projectile billboard visibility is presentation only;
damage is determined by swept collision segments.

Primary gun counts in the flight lab come from retail POF GPNT bank records, imported offline by `tools/import-retail-flight.cjs` with `tools/retail-gun-mounts.cjs`. Profiles retain bank counts, totals and model hashes; no retail geometry is shipped. Manual, NPC and duel callers pass that count and `training.gunAnchors(craft)` to `flightGuns.step`. The latter resolves the same collision model used for visible artwork. `shipPackModels.gunAnchors` stores reviewed mesh-local muzzle centers (right X, forward Y, up Z), including asymmetric barrels. Because the assets lack named sockets, these attachments are authored from visible geometry. Each muzzle emits one unchanged bolt per volley; the interval is `weapon.fireWait * anchors.length / importedCount`, preserving nominal sustained DPS with smaller, faster volleys. Close-surface retraction and adaptive convergence apply to each muzzle. Legacy calls without anchors retain the old count/rack behavior; blockouts explicitly use two anchors. Energy and retail linked-bank behavior remain unmodeled. Replay schema 5 rejects earlier firing-rule recordings.

### Tether scale greyboxes

The flight lab accepts `?tether=100&start=hub` with spans 100, 50, 20, 10 or 2 km and hub/tip/overview starts. `flightPresentation.tetherGeometry(lengthKm)` emits cached static grey batches using mesh-builder, converted from metres to world units once. Presentation rotates them about a fixed hub 20 km above the asteroid origin using the flight elapsed-seconds clock (independent of combat) and `tetherSpin` angular speed. Flight composition owns the selector, reset pose and initial combat-off setting. These are unsaved visual scenery, with no collision or momentum exchange simulation; tactical worlds and propulsion rules are unchanged.

Operational spin assumes a symmetric hub at midspan: radius = span / 2, tip speed = sqrt(loadG * 9.80665 * radius), angular speed = tip speed / radius, and period = 2 pi / angular speed. The study defaults to 1 g tip acceleration, with 2 g and 3 g options (`spin=1g`, `spin=2g`, `spin=3g`). Old or invalid spin parameters fall back to 1 g. No material, taper, payload mass or safety-factor feasibility is calculated. Tether resets zero the local flight clock so tip starts align at phase zero; pausing freezes rotation. Rotation uses the real flight elapsed clock even with combat disabled.


### Shared model viewer navigation

Load `src/model-viewer.js` before `src/scene3d.js` on inspection pages.
`scene3d.create(..., {study:true, viewer:true})` opts into the shared toolbar;
ordinary gameplay retains its tactical controls. Embedded combat views pass
`{study:true, viewer:false}` so target cameras and flight presentation never mount
inspection UI or collect picking geometry. `Driftworks.modelViewer.create(host, adapter)`
returns `gesture(event, space)`, `isFlying()`, `isPicking()`, `reset()` and `dispose()`.
The optional adapter supplies `pose()`, `fly(pose)`, `orbit(pose, target)`,
`pick(eye, direction)` and `worldUp`. Camera poses contain eye, right/up/back
basis vectors, focus distance and perspective focal length, in scene units.
This also supports Three.js character inspection without a renderer dependency.

Each viewport owns its drag mode and flight state; only the last interacted
viewport receives flight keys. Click to switch Slide/Orbit; right/middle drag or
Space slides, both left and right buttons or Alt orbits. Free flight uses WASD,
Q/E vertical movement, Shift for speed, wheel forward/back, and Escape to return
to orbit with the same eye position. Flight speed defaults from the current
framing distance and is editable in scene units per second. Blur, pointer loss
and hidden tabs clear held inputs. `reset()` releases flight before a model or
preset change; `dispose()` also removes listeners and cancels its animation frame.

Pick focus followed by a surface click, or a double-click, moves the orbit target
to the nearest visible mesh hit while preserving the eye. A miss leaves the
camera unchanged. Scene3d captures lightweight references to the last rendered
triangle batches (excluding lines and effects); picking applies texture strides,
scale, basis, axial spin, rotation and translation from the actual draw calls.
These references are replaced each frame, and triangle conversion happens only
on an explicit pick. Three.js uses its mesh raycaster, including skinned geometry.

`viewer-interaction` lets pages pause automatic orbit without pausing model
animation. `viewer-navigation-start` lets optional page cameras (such as surface
walk) relinquish ownership before focus picking or flight. Pages retain models,
lighting, animation and presets; shared navigation owns focus/flight controls.
The archived surface experiment keeps its frozen renderer fixture.

Flight engine sound uses `audio.setFlightEngine(dt, throttle, boost, active, detail)`
once per rendered manual-flight frame. Optional detail supplies normalized damage,
maneuver and thrust. The reusable `audio.engine.create(context, destination, tuning)`
owns oscillators, turbulence, filters, a compressor and modulation; it exposes
update/tune/stop/dispose. The caller owns the context. No graph enters world state.
The independent tactical `setEngineThrust` noise bed remains available.

`audio.engine.step` applies nonlinear power response and frame-independent spool
inertia; boost has a separate fast envelope and an edge-triggered ignition.
Sine bass, structural harmonics, an air-led turbine with quiet detuned partials
and noise-driven pitch drift, colored exhaust, modulation and
a 32 Hz afterburner layer share one synth in both flight and
`experiments/engine-lab.html`. Cockpit filters the exhaust; exterior opens it up.
Damage increases irregular modulation; maneuvering raises turbine/exhaust load.
Impact sounds also include a 36 Hz thump.

The lab offers eight presets, layer mutes, tuning, A/B capture, a scripted
audition and JSON recipes. Only the explicit Use this mix in flight action saves
`driftworks-engine-tuning-v1`; the flight voice loads it on first activation.
Reload flight to apply later changes. Normalize tuning on import/load; storage
failures fall back to defaults. Lab mutes are audition-only. Stop/blur/visibility
loss silence the lab; pagehide disposes the graph and closes its context.
Pause/reset/focus loss clear flight sound. Contact/death disable it.
Audio does not add controller vibration; existing haptics stay independent.

Flight sound balance is stored separately as `driftworks-flight-mix-v1`.
The engine, weapons, impacts and comms have separate buses under the SFX master.
Flight radio uses `audio.commsChannel()` and shares the game AudioContext;
radio pause/mute/end clear `setCommsActive` without closing that context.
Audible radio ducks engine to 84% and guns to 60% of their selected levels.
Hits duck engine to 30% for 220 ms with a smooth release; impacts/comms retain
priority. Muted radio does not duck. The mix preference can disable ducking.
Gunshot starts are bounded to one per 45 ms to contain stacked volleys.
A final compressor provides shared headroom. Settings / Sound balance provides
persistent per-channel sliders plus an overall SFX control and reset.
The isolated engine lab bypasses flight channel balance for sound design;
its listening level describes the raw synth, before the flight engine trim.

The exhaust roar emphasizes low turbulence: a moving 110-800 Hz band, a
low-pass capped at 1600 Hz, and a broad 9 dB cut centered at 1700 Hz leave room
for speech. Slow filtered-noise modulation adds irregular amplitude and filter
motion independently of the mechanical texture layer; the roar control silences
its modulation too. Radio lowers engine level only 16% to preserve continuity.

Cruise exhaust is led by a filtered, rhythmically modulated low growl. Broadband
roar and turbine air swell with a smoothed acceleration envelope and afterburner,
then settle at steady throttle. Flight supplies normalized positive speed change
per frame as `detail.acceleration`; the isolated lab infers acceleration from
throttle/spool difference. Deceleration does not trigger the surge. This is
audio telemetry only, with no new persistent world fields.

Low engine weight now favors 24-180 Hz colored noise over quiet pitched
remnants. The growl uses a filtered sawtooth for harmonic grit, with slow
noise-driven pitch and amplitude variation on both low layers. Regular flutter
is restrained; the low noise loop spans 7.3 seconds to reduce obvious repetition.
Bass and roar controls also silence their associated roughness and modulation.

Audio modules remain ordinary scripts loaded in this order:
`src/engine-audio.js`, `src/audio-mixer.js`, then `src/audio.js`.
The synth publishes `Driftworks.engineAudio` (presets, tuning persistence,
spool math, graph factory). The mixer publishes `Driftworks.audioMixer.create`
(channel graph, balance persistence, ducking, limiter and settings UI).
`src/audio.js` owns the shared AudioContext, SFX/music, tactical engine bed
and compatibility facade. `audio.engine` is the exact shared synth object;
other public audio methods delegate to the mixer instance as appropriate.
The mixer receives master-volume callbacks and attaches to the context/buses
owned by the facade; it does not create or close a context.
The engine lab loads only the synth and owns its audition context. No game
mixer or SFX module is required there. Both Node and browser test harnesses
load helper modules before the facade. Tuning keys and acoustic parameters
are unchanged by this extraction. Definitions live in `engine-types.d.ts`
and `audio-types.d.ts`.

### Shared study panels

`src/study-viewer.js` provides `Driftworks.studyViewer.createView` for independent study panels: each owns its replacement-world closure, scene, interaction flag and resize fitting. Callers supply the host, world, axis/orbit preset and framing callback, and retain content and render scheduling. Manual interaction suspends automatic fitting until reset. The mining rig and fighter studies share this setup. `referenceFighter(lengthMeters, metersPerRendererUnit, origin, yaw)` reuses the local Spitfire geometry with an explicit physical length; origin is in renderer units. The mining study keeps its existing placement and scale conversion.

The fighter's four panels share immutable static vertex batches; a revision/camera/viewport key redraws only changed panels. Shape edits update all four; crew close-up changes the orbit panel alone. The reference toggle changes geometry and fits untouched views without resetting manually positioned cameras.

Study panel configuration accepts `zoomToTerrain` (default true). The fighter study disables it so wheel zoom preserves the current subject plane instead of refocusing on its background asteroid. Explicit surface focus remains available through the viewer controls; the mining study retains terrain zoom.

### Radio portraits and shared channel noise

Both flight simulators and the comms lab load `mumble.js`, `comms-display.js`, and `speech-sprites/generated-v1/face-blend.js` before their portrait/radio controllers. `mumble.radioNoise` creates a channel-noise plan independently of either output; audio transmission and display sampling receive the same object and the same playback clock. Local audio bypasses radio processing. Flight uses effects 0.45 and edgeScale 2.5 (0.4 s opening / 0.6 s closing); original radio timing remains available in the lab. Pilot identity, mood and speech cues remain in their existing owners.

`commsDisplay.create(canvas)` owns one 256 px treatment buffer. Its `draw` accepts the animated source canvas, shared noise plan, elapsed playback seconds, speech duration and optional palette/scanline/reduced-motion settings. It preserves the lab treatment: green phosphor by default, scanlines, fresh random strip/snow geometry and a visual peak hold of 250 ms at channel edges or 40 ms during speech. It never generates independent noise-event timings. Callers own scheduling and channel cutoff.

`flightPortraits` retains its fixed seventeen-atlas cache and uses one reusable animated source canvas plus the display buffer. `play` receives the noise plan alongside the audio context, start time and speech offset. Pause, mute and cancellation hide the portrait immediately and invalidate pending portrait loads; the playback clock also detects completion before a delayed `onended` callback. Natural playback completion closes the mouth and begins a 0.5 s visual sign-off: the portrait's static increases monotonically along a newly randomized progression for each sign-off, using coarse grain to obscure the face. Positive random timing and severity increments define the progression, sampled by sign-off progress even when the speech clock has stopped; horizontal displacement gets only a modest boost, then the panel hides. Subtitles, speaker labels and controls are player-facing UI and stay clean and readable throughout; no radio effects are applied to the panel. Cancellation hides it immediately. The audio clock drives the sign-off, with a simulation-clock fallback when no audio clock is available. Subtitle-only fallback uses the estimated transmission duration. The bounded comms history remains available independently. No audio context is created or closed by the portrait renderer.


### Static study actor visibility and projectile damage reporting

`scene3d.studyBatchVisible` conservatively tests an immutable batch's cached
source box against study-camera clip planes, using the same model basis, scale
and rotation as the vertex shader. The study actor pass skips invisible static
batches before upload/draw; retained batch ownership still controls buffer
lifetime. It does not cull simulation, shadows, dynamic effects or model-viewer
picking. Bounds depend on immutable vertex data, matching `staticGeometry`'s
existing upload-once contract. `setStudyEffects` retains the complete submitted
batch-list snapshot; it must not truncate to the original five fighter/engine
batches, because capital-ship projectiles and impacts follow those batches.

`training.trace` retains its impact-point return value. Its optional final
`onDamage` callback runs once when the chosen victim actually loses shield or
hull health; it reports neither terrain contact nor zero damage. Aegis confirmed
hit accounting uses this callback, avoiding whole-fleet health totals per trace.
The fixed-scene browser and scripted CPU benchmarks are described in
[dreadnaught kit](dreadnaught-kit.md#repeatable-performance-comparison).

### Static asset versions

`tools/refresh-site-assets.cjs` versions local HTML resources and generates the
checked-in `src/asset-versions.js` URL map. It loads before application scripts;
`window.Driftworks.assetUrl(value, base?)` resolves document-relative or manifest-relative
resources within the deployment root and appends a content hash, preserving other
query parameters and fragments. External URLs pass through. Skybox JSON and its
images are versioned independently; changing an image invalidates the map and all
HTML references to it. Text hashes normalize CRLF to LF; binary hashes do not.
Refresh and commit versions after edits; `npm run check` validates without writing.
HTML still needs host revalidation to discover a new deployment.


### Production Three.js renderer

`scene3d.create` submits the production 3D scene through vendored Three.js r180.
`BufferGeometry`, interleaved attributes, textures, `RawShaderMaterial` and
`WebGLRenderTarget` own GPU resource binding, shader compilation, drawing and
work-light targets. There are no direct WebGL calls in `src/scene3d.js`.
The approved display-space surface shaders, projection basis, packed work-light
depth and lighting response remain custom material logic. Replacing those with
physical materials/attenuation would change the approved appearance. Three.js
r180 requires WebGL2.

Each pass queues pooled draw objects with independent uniform snapshots and
submits one Three.js render. Opaque, alpha and additive batches retain submission
order; automatic sorting and culling are disabled, and explicit study culling
remains authoritative. Same-size dynamic buffers update in place; changed
layouts release old GPU attributes. Platform material geometry belongs to each
platform so queued draws cannot overwrite another platform's vertices.

Ordinary-script pages load `vendor/three/build/three.global.js` before scene3d.
It is a checked-in classic distribution of the local ES modules, reproduced by
`node tools/vendor-three-classic.cjs` when updating the vendor. Deployment needs
no build or network import. `src/three-types.d.ts` describes the used vendor API.

The migration is approved. Both custom asteroid WebGL backends, their standalone
archive/lab, live comparisons, comparison benchmarks and archive-only tests have
been retired. [Approved visual baseline](../tests/asteroid-migration.html) is a
static gallery of eleven saved comparisons: orbit, underside, cutaway, surface
lighting/shadows, 0.5 m inspection and composition extremes. Images and historical
timing JSON remain in `tests/benchmarks/three-migration/`; initial timings are
provisional because of machine contention. Future performance work optimizes
Three.js against the approved appearance, without a parallel asteroid backend.

The production orbit viewer's `?shadow-test=1` checks darkness-only changes and
post shadows on matching ground pixels. `tests/three-production.cjs` verifies
native Three.js resources, per-draw uniforms, blend order, pass submission and
resource reuse. `tests/asteroid-three.cjs` retains the shared study geometry,
camera projection, geology material and excavation rig regressions.
