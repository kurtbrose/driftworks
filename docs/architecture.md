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
palette uses smooth three-axis blending. Fine detail uses the cached cellular field described under Viewer asteroid
surface below. Rotated octave frames and non-integer frequency steps break
lattice alignment. A slow seeded sinusoidal domain warp bends repeating tiles;
its analytic Jacobian transforms shading gradients, and a conservative footprint
expansion filters the added stretch. This uses the same number of volume reads.
Viewer wheel zoom focuses on
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

### Viewer asteroid surface

Study views draw the base asteroid terrain and its procedural surface shading.
Four body-space cellular octaves (starting at 4 cells per normalized body unit,
with frequency multiplied by 3.73 and amplitude multiplied by 0.45) displace the shared closed terrain field after crater
relief. They sample radial direction rather than radius to keep a stable shell.
The CPU interpolates a cached 32-cubed height field; `rockVolume()` packs the same
periodic four-cell field into 32 padded RGBA slices for WebGL 1 (272 by 136).
RGB stores the derivative of the gap between the nearest two squared cellular
distances; alpha stores the bounded gap. This produces angular faces and seams
rather than differentiated value-noise ridges. Cellular peaks are capped into
seed-varied slab heights; cached gradients include the cap derivative (zero on
flat faces), encoded at 15.875 byte steps per slope unit. Fine octave strength
decays by 0.45, reducing the uniform tiny-bump covering while retaining fissures. Meshing and picking share this
field. Exterior mesh normals describe only the broad shell; a cached, padded six-face
RGBA8 atlas supplies full exterior normals per fragment, including crater and coarse terrain relief. This avoids
interpolating unresolved roughness across large triangles. `surfaceAtlas(a, n?)`
returns JSON-independent render bytes with six `(n+2)`-square faces (default 256
interior samples), encoding unit normals as RGB (128 + component * 127) and crater-floor suppression
in alpha. `craterRoughnessAt` returns 0.06 through 110% of a crater radius, fading
to 1 at 145%. Geometry and baked normals multiply cellular relief by this mask;
the fragment shader attenuates fine normals and crevice shading from the cached
alpha with no added texture reads or per-pixel impact loop. Alpha also supplies
a modest bowl ambient-occlusion term. In study surface-camera
views, nearby cached triangles receive five subdivision levels projected onto
the same field, fading to the cached mesh at the patch edge. The patch is cached
in body-space camera bins; ordinary orbit views keep the base mesh. Fragment normal detail
starts at frequency 80 with five cellular octaves (3.73-fold frequency steps) and fades each octave by its projected footprint, including
grazing incidence; unresolved octaves stop evaluation. Crater and roughness
budgets remain independent. The surface patch has a bounded refinement budget.
The orbit viewer provides whole-body, 8 m slope, 2 m horizon, and 12 m downward
presets over one surface location; heights use physical meters.
Separate surface boulder meshes are omitted to keep close flight and walking
views free of tile generation, uploads, and additional rock draw calls.

The asteroid viewer reuses `flightPerformance` for frame/p95/CPU timings and the
existing flat/boxes/empty/resolution diagnostics. It defaults to a selectable 60 FPS cap (30 or uncapped also available),
redraws static views only on input, and suspends rendering in hidden tabs. Continuous
measurement opts into repeated draws. CPU submission time is not a GPU timer.

Close study views (orbit or surface camera) refine the shared terrain field into
real geometry, with memoized edge projection and full-field vertex normals. Fine
fragment detail is restrained grain; there is no painted cellular crack tint.
The renderer keeps the base GPU mesh and a bounded refined mesh separately.
Two lazy 1024-square RGBA8 depth maps cache world-fixed directional cast shadows:
a whole-body map from the base mesh and a cropped map from the detailed mesh.
Packed depth uses dithering disabled and a depth renderbuffer; four comparisons
filter shadows. Where supported, receiver-plane derivatives correct each sample
for surface slope; a conservative bias is used without derivative support.
Only direct illumination and material highlights are shadowed, leaving ambient
fill. The cropped map survives switching to coarse visible geometry, keeping its
shadow positions anchored in asteroid coordinates. Maps rebuild on mesh/visual
changes or a light-frame rotation of more than 0.01 radians, not camera motion
within a cached detail bin. Diagnostic draw/triangle counters include rebuild
passes; steady frames reuse the maps. The viewer's Mesh cast shadows checkbox
isolates shadow contribution. Existing composition colors supply the material
variation and highlight strength; dark crack bands do not substitute for occlusion.

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

## Imported flight artwork experiment

`assets/ships/` keeps each creator pack in its own directory with its untouched ZIP, provenance manifest, source OBJ/MTL subset, and derived `meshes.js`. `tools/convert-ship-packs.py` is an optional offline standard-library converter; deployment needs no build. `experiments/ship-packs.js` transforms normalized meshes into existing study actor batches, shared by the inspection page and flight enemies. Flight and inspection render original Quaternius textures imported offline from archived glTF. Artwork fits an 8.5 m radius inside the training hit sphere, without changing flight or combat rules.

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
time; pause, reset, and page exit stop playback. Comms state is not persisted.
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
a varied 0.9-3.7 seconds of clear channel and ten seconds since that pilot last spoke; distress
precedes other transitions. Firing starts and target switches also offer calls,
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
after 14 active seconds or when invalid. Support replies have their own airtime
category, observe channel/pilot cooldowns, and consume the request once spoken;
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
14-second emotional exchange retains caller ID and emotional category. A living,
same-team pilot who is not afraid or panicked can reassure or acknowledge them,
without needing to attack the caller's pursuer. Replies share channel, pilot and
activity cooldowns; urgent tactical calls and verified cover replies retain
priority. Reassuring delivery is local to the reply and does not overwrite the
responding pilot's own emotion. Emotional observations continue on busy radio;
expired feelings never form a backlog of old emotional calls.

The ship inspection viewer now defaults to Quaternius Striker with original glTF base-color texture, UVs and normals; both inspection and flight use the original source appearance. The offline converter reads the archived self-contained glTF 2.0 triangle exports and writes inspection vertex data plus local PNGs in `textures/`. This supports these single-mesh exports, not general glTF/GLB, scene transforms, animation, or full PBR. Flight uses the same source textures, UVs and normals, grouping ships by model and texture. Deployment still uses only relative local assets and needs no build.

Quaternius engine exhaust uses explicit model-specific nozzle mounts in `experiments/ship-packs.js`, in normalized right-X / forward-Y / up-Z metres, plus nozzle radius. Mounts are presentation data and do not affect thrust physics. Four-engine ships retain all four outlets; plume dimensions follow nozzle radius and tails extend aft from each mount. The ship inspector provides an exhaust toggle and rear view for attachment review.

Faction paint in the ship inspection viewer and flight lab is an optional per-batch `paint` RGB vector (0�1) on source ship geometry. `sourceGeometry` and `sourceFleetGeometry` accept it as their last argument; omitting it restores the source texture. The shared scene shader selects saturated orange texels with feathered hue boundaries and substitutes the primary paint while preserving source texture variation and neutral/weathered detail. Texture images remain shared and unmodified. Orange markings in the same hue range also recolor; engines and untextured scenery do not. Flight exposes separate allied/enemy colors and a source-paint toggle; these preview settings are not saved world state.

The inspection viewer enables faction paint by default. Picking a primary color enables paint immediately (including after restoring source paint), without resetting the orbit or zoom. Turning off faction paint still restores the original texture.

Paint brightness follows the chosen RGB color rather than being normalized to the original orange luminance, so dark liveries remain dark. Default flight liveries are forest green (#607451) and burnt orange (#bd713f); color inputs also suggest dark navy (#415d7d).

Flight lab hull contacts use `shipPackModels.hullHit`: a cached sphere bounds
check followed by a swept triangle query against the selected artwork (including
the training blockout). `training.trace` resolves the nearest terrain or hull
contact and uses that point for impact flashes and damage. The optional hull
query is installed by `flight.js`; standalone training callers retain sphere
queries. Scorches are clipped surface geometry baked once per hit in local ship
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

`experiments/flight-hud.js` mounts the overlay canvas and target camera and owns
radar range, telemetry, instruments and contact/lead markers. `render(view)` takes
fresh session references and presentation/input values each frame; it does not
retain sortie references or control simulation. Both ordinary scripts load before
`flight.js`; the existing radar and target-camera modules remain subordinate.

`experiments/flight-controls.js` mounts keyboard, pointer-lock, mouse and gamepad
input. It owns held keys, the virtual stick, device discovery, editable bindings
and controller button edges, using `flightInput` for mapping math. `sample()`
polls devices, dispatches pause/bank actions, then returns merged flight demand;
the browser loop checks pause after sampling. `view()` exposes only mouse/mode/
stick-range data for HUD rendering. `clear()` resets held input; `resetButtons()`
is separately called on resume to preserve existing controller edge semantics.
`capture()`/`release()` own browser pointer-lock requests. Gameplay and diagnostic
shortcuts call injected actions; the adapter does not access session, HUD, comms
or weapon selectors. The optional environment argument supplies document/window/
navigator for adapter regressions. Load it after `input.js` and before `flight.js`.

`experiments/flight-presentation.js` owns the main study scene, skybox, texture
loading, artwork controls/credits, faction paint and fleet/effect submission.
`appearance()` returns a fresh selection/paint/image snapshot for both `render`
and the HUD. `model(craft,wave,appearance)` is their shared team-aware model
resolver; `hullHit` uses current artwork with the supplied combat wave. Wrecks
join hull/scorch batches, while only living craft emit engine effects. Submission
remains hulls, scorches, gun effects, engines, diagnostic settings, sky, scene
sync, scene render. `pose` forwards the player camera; `renderStats` supplies
scene and sky counters. It does not advance the session or own its world.

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

The mining study loads local Quaternius astronauts through `tests/mining-study-crew.js`, samples frozen neutral/interact poses and submits material batches through study actors. Suit height is 1.8 m; the adjustable main-hull length maps its 32 artwork units to 12�36 m, independent of simulation units. Four fixed placements target the workboat study: ground/gripper, mining head, deck and hatch. This does not add population behavior.

`tests/mining-study-context.js` mounts an existing world asteroid through the production mesh/geology renderer and uses its shared surface-height query to place the rig and ground crew. The existing Quaternius Spitfire is a frozen hovering reference. Its assumed 12 m nose-to-tail length shares the study metres/artwork mapping with crew. Both context layers are independently optional; they do not alter game state.

The `drydock` study treats the body as one cargo hold around a central eight-sided lookout tower. Optional fifth `miningPlatformGeometry` argument `panelOpen` (0�1) rotates twelve yellow cover segments about their outer rim hinges; cargo and tower remain fixed. It removes the rear hopper and cutter, retains a short transfer/launch interface and locks study scale to 36 m. This is manual deployment geometry, with no idle animation or new simulation state.

The `rampdock` study aligns eight doors and eight anchor roots to shared perimeter hardpoints. Door rotation is solved to lower their lips to local z=0 at full deployment. Dark stanchions, upper/lower perimeter rings and radial braces remain fixed as a protective cage; this is an artwork datum, not terrain-aware contact solving.

Rampdock doors use two rigid leaves: a vertical wall that seats against the fixed cage, plus an upper roof leaf covering the hold. Opening first unfolds the roof leaf, then lowers the wall to a 25-degree descending ramp; the outer leaf reaches the local ground datum at a steeper angle. Closing reverses that sequence. Plate thickness follows each moving face normal.

Rampdock tower roof hardware is a static shuttle docking blockout: a marked rectangular pad, octagonal airlock collar with recessed split hatch, and four raised alignment/clamp hardpoints. It remains attached to the tower independently of cargo-door deployment; no docking gameplay is implied.

Rampdock material grammar: yellow is outward-facing transit armor (including the tower docking roof); grey is the hold/work deck and the inward-facing door skins that become deployed ramp surfaces. Dark material identifies fixed cage/chassis and recesses. Door edges remain yellow so their motion stays readable. Docking collar/hatch hardware stays metallic within the yellow roof.

Rampdock lookout glazing uses a flared two-band cab profile: the lower faceted window cheeks face outward/down toward the worksite, while the upper horizontal band provides forward/side visibility. Yellow sills, corner posts and a roof brow frame both bands. The cabin remains sealed; there is no glass floor or underside blister, and docking-roof geometry is retained.

The drydock tower main egress is in its lower core at cargo-deck level (deck z=4.5, shallow threshold top z=4.8), with the access-study astronaut on that threshold. The lookout glazing and roof shuttle hatch are separate upper-level interfaces.

Rampdock medium door hardware shares the existing two-stage transforms: root knuckles and clevis cradles sit on the lower cage ring; fold-axis barrels move with the lower leaf; a telescoping jack spans a fixed frame pivot and moving panel pivot. Fixed stop blocks/closure receivers and moving registration tabs suggest load stops and captured closure. This remains visual articulation, with no actuator dynamics or independent latch simulation.

Door hinge refinement uses three discrete short pins per axis, with frame clevis ears, visible retaining caps and articulated panel lugs. Compact jack barrels/rods suggest controlled low-gravity deployment rather than Earth-weight lifting; fixed cage stops and receivers remain the securing structure. Geometry proportions are visual, not load-rated engineering dimensions.

The rampdock cage retains its original member centerlines and hardpoints, using rectangular box sections about 30�32% narrower in plan than the first square-bar pass. Lower perimeter members retain more depth, while radial cargo braces are lighter. Hinge hardware, leg geometry and panel motion are unchanged by this section-only study.

Cargo deck top (z=4.5) and belly (z=4.15) are separate surfaces with closed rim faces. The broad chassis top sits inside that slab at z=4.25. Do not put dark opposite faces or chassis caps directly on the grey deck plane: this causes angle-dependent depth flicker.

The sorting/transfer tray top is below deck at z=4.3; the tower core and cargo-load undersides penetrate their support surfaces slightly instead of ending exactly on them. The depth regression checks smaller overlapping faces too, not just full-width floor/chassis faces.

### Isolated terrain study

`tests/terrain-lab.html` keeps the rock-shape experiment outside the asteroid generator.
Seed 1729, meter coordinates, fixed sun elevation 25 degrees, and fixed cameras
(including 2 m altitude and 20/200 m viewing distances) make comparisons repeatable.
Block-on-plane, cellular-height-field, and structured-rock fixtures can be inspected
with plain geometric lighting, face normals, stored normals, wireframe, or materials
and actual cast shadows. Freeze disables seed, resolution, and lighting changes;
camera motion never regenerates the patch. Rock base/top boundaries, cap centers,
and materials are retained as formation data alongside the derived triangle mesh.
Future simplified geometry and relief approximations should derive from this same
source; this prototype does not yet implement representation transitions or asteroid LOD.

The original asteroid viewer also exposes geometry/normal/wireframe diagnostics
and a mesh-freeze switch. Its fixed benchmark records the seed, light, camera,
viewport, frame times, CPU submission cost, triangle counts, and transition stalls.
`tests/benchmarks/asteroid-baseline-2026-10-16.json` was captured before adding
these diagnostics: approximately 13.3 ms steady frames, but a 7863 ms cold
transition to the 2 m view and 496416 triangles. These are session observations,
not portable performance thresholds or GPU timings. The isolated laboratory
also records GPU time when EXT_disjoint_timer_query is available, rejecting
disjoint samples. Benchmarks warm up 30 frames and sample 90 per fixed case.
Use JSON exports and visual inspection together; the headless suite checks
determinism, finite normals and bounded geometry, not browser rendering quality.
