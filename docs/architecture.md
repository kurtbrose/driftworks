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

`src/scene3d.js` supplies `Driftworks.scene3d.create(host, getWorld, setWorld)`
with the same scene controller interface as the Pixi scene. `game.createScene`
selects it only with `?renderer=3d`; the default and `?renderer=2d` use the existing
Pixi implementation with its detailed artwork.
Load `scene3d.js` after simulation/camera/audio and before game. The backend uses
browser WebGL directly, ordinary scripts and relative assets, with no new
runtime dependency or build step. Game timing, session ownership and the DOM HUD
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
subtracts a sphere at `pocketOffset` and a bent capsule tunnel following
`tunnelAngle`/`tunnelTurn`, using `depthM / METERS_PER_UNIT` explicitly.
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

### Viewer surface rubble

Surface walking adds deterministic rubble tiles on a fixed 128-by-64 angular
partition. Tile RNG uses the asteroid ID and wrapped tile coordinates. Each
rock samples one continuous seeded shape at subdivision levels 0�4 (20 to
5,120 triangles). Refinement preserves existing vertices. Smooth vertex normals
and physical-space shader texture retain the surface palette.

Visible tile bounds select detail from projected pixel diameter. Tiles are
prioritized by apparent size and reserve their worst-case 18-rock triangle
cost before drawing; total submitted rubble cannot exceed 160,000 triangles.
New vertices and normals morph from the preceding topology in the vertex
shader, avoiding silhouette jumps at subdivision boundaries. Conservative tile
bounds cull off-screen tiles; partly visible tiles retain all their rocks.
An LRU cache retains 64 tile/level buffers, invalidated by geology changes.
Between 0.025 and 0.085 body radii, whole rocks smoothly sink along their
terrain normal until buried. Rocks stay opaque and depth-writing; per-rock
centers keep every vertex on the same transition, without transparency or
pixel stippling.
This budget covers rubble, not the base asteroid mesh, shader work, or total
frame time. Asteroid terrain still uses its existing fixed mesh; excavated
cutaways and orbit mode omit rubble. Cast shadows are not yet implemented.

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

`experiments/flight.html` loads the ordinary production script stack with boot
disabled, then a separate flight model and page controller. The model exposes
`Driftworks.arcade` (profiles, create, step, contact); it owns 3D cockpit position,
velocity and an orthonormal attitude basis. SI speeds convert through
`sim.METERS_PER_UNIT`, without tactical time acceleration. Its page controller
uses `scene3d.create(..., {study:true})` and `setSurfaceCamera` to reuse production
geology, with no changes to persistent simulation state or save rules. The
controller substeps at no more than 1/120 second, caps stalls at 0.1 second,
and clears input on pause/blur/visibility changes. Radial surface sampling stops
contact with 5 m clearance; this is an arcade stop, not a rigid-body collision.
Both dependency-free test entry points load the extracted retail maneuver data
before the flight model. The profile fields retain table units: seconds for
accel/decel constants and rotation times, m/s for speed vectors. Forward engine
ramping and lateral slip damping are separate; rotational damping and yaw banking
are also applied. See README for engine-power and afterburner assumptions.


Flight lab rubble caps subdivision at level 2 and submitted geometry at 40,000
triangles. Other study views retain level 4 and the 160,000 triangle ceiling.
`scene3d.create` accepts optional `rubbleMaxDetail` and `rubbleTriangleBudget`.
All study views build/upload at most one new rubble tile per rendered frame,
retaining a cached coarser mesh while waiting. Tile-center surface samples are
cached and cleared with geology changes. Overlay canvas data attributes
`rubbleTriangles` and `rubbleBuilds` expose the work submitted in the last frame.
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
against `scene3d.rockField`. Impacts do not excavate or damage the asteroid.
`scene3d.setStudyEffects` accepts up to four position/normal triangle batches
and colors; only study scenes draw them. Reused dynamic GPU buffers render
soft additive bolt billboards and flashes through the same camera/depth buffer as terrain.
Two generic barrels fire per volley, independent of the original POF gun mounts;
there is no linked-bank or energy simulation yet. Training combat supplies separate health and enemy logic. Existing synthesized audio
honors the main game's sound preferences.

Flight effect batches use their three normal slots as unnormalized UV/opacity
attributes, carried separately into the effect shader. Camera-facing ellipses
project the bolt length onto the view plane and retain a round end-on footprint.
A narrow bright core and fading glow replace crossed opaque rectangles. Depth
testing remains enabled while additive effects disable depth writes; impact
opacity fades with age. Weapon dimensions and ballistics are unchanged.


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

Projectile sweeps choose the nearest terrain or opposing training hit sphere
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

Rubble tiles whose center-distance bounds cannot intersect the shader's .085
normalized emergence range are culled before draw and mesh requests. The .04
tile bound matches the existing conservative visibility sphere; tiles near the
fade boundary remain eligible. This avoids invisible, fully buried boulder draws
at distant cockpit positions without removing close-up surface rocks.
