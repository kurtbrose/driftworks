# Rendering reference

[Architecture overview](architecture.md) · [Script loading](script-loading.md) · [Test groups](testing.md)

## Flight effect capacity

Flight retains every active projectile, impact and destruction flash. Explosions
and wrecks expire through their existing 5.5-second and 120-second lifecycles;
count-based 12/48-effect truncation is removed. Tactical transient effects also
expire by age rather than an insertion-count cap. Scorch/history budgets are
separate from live weapon effects.

`scene3d.getRenderStats()` reports `explosions` (active blast records submitted),
`explosionBatches` (their submitted material/layer batches), and `effectVertices`
(additive study-effect vertices, including engines). These count submissions,
not guaranteed visible pixels: camera clipping, depth occlusion and optical-region
rules still apply. The browser stress probe additionally compares active bolt
and impact counts against the actual quads emitted by `flightGuns.geometry`,
and compares live destruction records with scene explosion submissions.
See [the engaged battle and capacity audit](benchmarks/flight-effects-2026-10-25.md).

## CPU terrain boundary

`src/asteroid-terrain.js` owns asteroid descriptions used by 3D terrain, relief,
impact frames/packing, excavation fields, marching-tetrahedra meshes, surface
frames and mining contact fitting. It needs simulation, shared geology and mining
geometry, and creates no DOM, Pixi, Three or GPU resources. World data stays
JSON-safe and unchanged by these derived queries. Flight collision and headless
sessions call `Driftworks.asteroidTerrain` directly.

CPU caches belong to that module. `setStudyParameters` replaces a visual and
invalidates relief/impact caches; mesh/contact keys retain their radius,
excavation and visual-identity checks. `release(id)` drops only that asteroid's
CPU caches. The renderer calls it when removing an asteroid, alongside disposal
of its own GPU resources. Contact geometry remains keyed by the surface object.

`scene3d` retains the old terrain methods as direct aliases for browser viewers
and existing tests. It owns camera projection, ray picking, materials, GPU
uploads and scene lifecycle. Shaders remain in the renderer and consume the same
CPU-derived impact data. The standalone CPU regression checks field/frame values,
mesh bytes and study invalidation against a pre-extraction fixture; mechanical
parity is separate from visual verification.

### 3D scene prototype

Authored flight skies supply cached environment lighting through a host-local
`sky-environment` event. `skybox.js` owns probe/image loading; `scene3d.js` owns
world-normal transforms, diffuse SH evaluation and rough-reflection texture
sampling for shared materials. Asteroid geology retains its directional sun and
terminator gate under environment lighting; the sky colors the .17 ambient fill
rather than replacing the normal-dependent sun response. `tools/bake-sky-lighting.py` performs normalization
and SH convolution during asset preparation. No environment resources enter world
state or mission logic. See [sky authoring](skybox-authoring.md) for cache generation,
coordinate conventions, coverage and reflection-filtering limits.

`src/scene3d.js` supplies `Driftworks.scene3d.create(host, getWorld, setWorld)`
with the same scene controller interface as the Pixi scene. `game.createScene`
selects it only with `?renderer=3d`; the default and `?renderer=2d` use the existing
Pixi implementation with its detailed artwork.
Load `mesh-builder.js`, `mining-rig.js` and the vendored
`vendor/three/build/three.global.js` before `scene3d.js`, after
simulation/camera/audio and CPU asteroid terrain, and before game. The backend uses Three.js with authored
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
surface relief are presentation geometry. `Driftworks.asteroidArt`, supplied by
`src/asteroid-art.js` after simulation and before either renderer, shares the
seeded visual description, CPU relief,
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
contact fitting and fitted-pose caching live in `asteroid-terrain.js`/`mining-terrain.js`;
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


Source-textured ships now use native `MeshStandardMaterial` under sky-derived
lighting, with source glTF rough/nonmetal settings and sRGB textures. PMREM targets
are cached per sky and renderer from the normalized lighting assets. Custom
asteroid/mining/procedural materials remain independent and preserve their
existing surface and lighting shaders. See [skybox authoring](skybox-authoring.md)
for probe limits, coordinate conventions and the original-color comparison.


`src/explosions.js` owns visual destruction geometry and the turbulent fire and
shockwave shaders shared with `experiments/explosion-lab.html`. Load it before
`scene3d.js`. Flight supplies `setStudyExplosions` snapshots (position, velocity in
world units/second, simulation age, size, seed); tactical scenes consume
`ship-destroyed` events directly. Flight destruction flashes are separate from
bullet impacts, retain inherited velocity, and expire after 5.5 simulation seconds.
Pause freezes their age. Geometry and draw pools are reused; only the newest twelve
explosions are drawn. Effects add no damage rules or persistent world state.
