# Aegis modular capital ship study

For the separate fitted shield surface, short local waves and measured patch
comparison, see [Capital shield patches](capital-shields.md). The shield bake
does not change the capital's visible mesh, articulation or collision geometry.

Open `experiments/dreadnaught-kit.html` through the ordinary static server. This
self-contained Three.js experiment uses only the vendored library and controls.
It is separate from gameplay and does not change simulation or saved ships.

The supplied Aegis concept is visual reference, not a mesh source. These are
original procedural blockouts: lance/command prows, armored/hangar/utility hulls,
standard/heavy drives, and turret/cargo/sensor dorsal attachments. The preset
selector assembles three sample families. Mid-hull count and mission controls
allow recombination; nonstandard mission sections alternate with armored hulls.
The battleship preset uses continuous armored sections; utility sections remain
an explicit option rather than the default battleship silhouette.

## Reference study, second pass

The reference's visual hierarchy is a dark structural spine wrapped in broad,
chamfered armor, with narrow recessed service bands and relatively sparse raised
equipment. The second pass replaces rectangular roof slabs with faceted armor
segments, uses open octagonal coupling rings, and makes the prow progressively
thicker through multiple tapered stations. The dark bow core is smaller than
its armor shell to avoid coplanar surface flicker.

Armor hatches, vent grooves, fasteners and paired window strips provide scale
without textures. A stepped command citadel, cylindrical twin barrels, reinforced
engine housings and swept stern fins establish larger silhouette landmarks.
Lighting is less blue so the neutral warm armor remains readable. Camera presets
account for viewport aspect ratio, including tall embedded panels.

This remains a geometry study: there are no authored textures, baked occlusion,
weathering or decals. Small-scale material wear and less repetitive equipment
layouts are useful future passes after the kit's silhouettes are settled.

### Armor bevel comparison / review only

Open [the side-by-side bevel study](../studies/aegis-bevel-review.html) through the
static server. The default now compares real bevels (left) with the baked normal
map (right); both selectors retain the earlier original/flat-shading controls.
It extracts the first armor band of `M_1_standard` from the current
authoring source, in metres, and compares the original flat-shaded geometry with
a 0.6 m edge-setback bevel. Both sides use the same neutral material and camera.
The candidate menu separates bevel-only flat shading from face-area-weighted
normals; Current on both sides is a camera/lighting control. Drag, zoom, orbit,
and three-quarter/side/close/underside/distant presets are synchronized.

`node tools/bake-aegis-bevel.cjs` regenerates the isolated data; `--check` checks
freshness. `tools/lib/convex-bevel.cjs` merges coplanar source triangles into face
planes, adds bisector cutting planes at manifold edges, intersects the resulting
convex half-spaces, and weights shared vertex normals by complete polygon area.
It rejects nonconvex/open input or a bevel that consumes an original face. This
is deliberately a convex-section experiment, not a general imported-mesh beveler.
The source geometry, production rig, textures, collision and pivots are unchanged.

Run `node tools/check-aegis-bevel.cjs` for immutable-source, watertightness,
normal-length and bounds checks. Its optional `--browser` uses a development-only
Playwright installation selected by `DRIFTWORKS_BROWSER_MODULES`. Captures in
`output/aegis-bevel-*.png` were visually inspected at three-quarter, edge close-up,
underside and distant views, plus flat-bevel and matching-original controls.
The weighted version softens narrow edge transitions; broad faces remain quiet.
At distance the difference is small. This is a neutral geometry review, without
approval for full-ship appearance or production integration.

The earlier geometry-only foreground ABBA measurement uses the existing `scene3d` renderer,
one active viewport while measuring, 20 warmup + 90 measured frames per block,
719 x 673 backing pixels at DPR approximately 1, and no combat/effects. It reports
60 to 316 triangles, one draw each, approximately 0.2 ms median / 0.3 ms p95 CPU
submission and 13.3 / 13.4 ms frame cadence for both. See
`studies/aegis-bevel-metrics.json` for the source hash and conditions. These small
timings do not establish a GPU or whole-combat performance budget; those remain
unmeasured until a full-ship integration is requested.

#### Baked normals and GPU comparison

For the follow-up with complete ships, open the
[fleet comparison](../studies/aegis-fleet-review.html). It offers six or twelve
Aegis ships, overview, close-flyby, distant and underside cameras, and a GPU ABBA
button. Twenty standard armor bands per ship are replaced; all other production
triangles, textures and authored component poses are retained. Replacement armor
uses the same neutral finish in both variants. This is a frozen rendering
workload, not a combat simulation or a full production material integration.

`tools/bake-aegis-fleet.cjs` extracts the band centers from the authoring source
and records its hash plus the production rig hash. `studies/aegis-fleet-build.js`
removes the corresponding production surfaces (88 UV-split triangles per band),
then substitutes either 316 geometric-bevel triangles or 60 baked-normal
triangles. The frozen rest of the ship is grouped by compatible material.
Geometry is prepared once and shared between ships in **both** modes. The baked
mode shares one image, one GPU texture and one armor buffer between all ships;
the browser check verifies those identities. The atlas remains 10.7 MiB total
with mipmaps, not 10.7 MiB per ship. Geometry savings likewise are shared:
339,840 vertex-buffer bytes, while submitted work falls by 5,120 triangles per
fully visible ship. The review adapter now transforms object-space normals by
the actor basis and heading; the fleet includes opposing small headings.

At 1600 x 753 backing pixels / DPR 1 on the RTX 3070 Ti (ANGLE D3D11), overview
submission is 96 draws and 269,544 versus 238,824 triangles for six ships, or 192
draws and 539,088 versus 477,648 for twelve. Each ABBA block warms for 60 frames
and samples 180 frames, giving 360 samples per mode per run. Two runs per view
were recorded. Frustum culling is retained, so flyby views submit fewer batches;
both modes have matching draw counts. Pose, viewport, visibility and positive
draw checks are enforced; invalid/disjoint GPU samples reject the run.

Default Chrome presentation gave highly variable GPU elapsed measurements, many
near the 13.3 ms refresh interval. Those runs did not establish a winner. The
diagnostic repeat using `--disable-frame-rate-limit --disable-gpu-vsync` gave:

| Fleet / view | Real bevel median GPU ms (two runs) | Shared baked median GPU ms (two runs) |
| --- | --- | --- |
| Six / overview | 1.233, 1.244 | 1.139, 1.147 |
| Six / close flyby | 0.369, 0.364 | 0.336, 0.327 |
| Twelve / overview | 1.323, 1.403 | 1.282, 1.297 |
| Twelve / close flyby | 0.428, 0.430 | 0.432, 0.416 |

The uncapped results favor baked normals by about 8-10% for six ships and 3-8%
for the twelve-ship overview; the twelve-ship close flyby is effectively tied.
CPU submission and frame cadence change little, and GPU p95 has large outliers
in flyby views. This supports a modest, view-dependent GPU benefit in this
rendering workload, not a general FPS improvement or a claim that texture
mapping always wins. The fixed shared texture memory cost still exceeds the
saved shared vertex storage. Production combat, effects and other GPUs remain
unmeasured. No production asset or gameplay behavior is changed.

Per-block summaries, device, poses, source hashes and both presentation modes
are saved in `studies/aegis-fleet-results.json`. Regenerate raw samples and
screenshots in ignored `output/` with `node tools/check-aegis-fleet.cjs --browser`
and `--browser --uncapped` (using the same development Playwright path as the
section check). Without `--browser`, the check verifies immutable input and
triangle conservation outside the replaced bands. Overview, close-up, distant
and underside captures were visually inspected in both modes for six and twelve
ships. These are geometry-comparison checks, not full-ship visual approval.

`node tools/bake-aegis-normal.cjs` projects the actual weighted bevel mesh onto
26 coplanar charts of the original 60-triangle section. Each atlas texel stores
an interpolated high-mesh object-space normal, not color or a fixed highlight.
The offline rasterizer selects the frontmost projected surface, normalizes its
normal, and dilates chart gutters. The 2048 x 1024 RGBA8 atlas is approximately
490 KiB on disk, 8 MiB uncompressed, or 10.7 MiB including mipmaps per context.
The original positions/normals are exact; only UVs are appended. `--check`
verifies deterministic bake freshness. All authoring dependencies are built-in
Node modules and locally vendored assets; no runtime network dependency is added.

The review-only `studies/aegis-normal-renderer.js` adapter uses the existing
`scene3d` shader with a compile-time baked-normal variant: one linear-data texture
sample, decode and normalization. No runtime edge finding occurs, and the real
bevel shader does not execute this sample. The isolated section uses identity transforms; the fleet adapter also applies
actor basis and heading. Nonuniform scale and the production material pipeline
would require separate integration. Neither runtime
ship geometry nor the production renderer is changed. The normal map cannot
round silhouettes or alter geometric shadows. Close-up chart edges are slightly
sharper than the real bevels at this resolution. Three-quarter, close-up,
underside, distant and dragged views were visually inspected in
`output/aegis-normal-*.png`; this is a comparison, not full-ship visual approval.

The GPU button always measures real weighted bevels versus the baked version,
independently of the display selectors. It uses asynchronous
`EXT_disjoint_timer_query_webgl2` around the complete `scene3d` render (including
clear), with the second viewport paused. Each ABBA block has 30 warmup and 120
measured frames. Hidden/resized views, wrong draw counts, disjoint timing,
invalid results and query timeouts reject the run. Unsupported timers report
unavailable, never substitute CPU or frame cadence. UI results identify their
camera preset; repeat measurements before inferring a speedup.

Two ABBA runs per view on an RTX 3070 Ti / ANGLE D3D11, at 719 x 673 backing
pixels and DPR approximately 1, produced these ranges of run medians:

| View | Real bevel GPU ms | Baked normal GPU ms |
| --- | --- | --- |
| Three-quarter | 0.056-0.178 | 0.102-0.166 |
| Edge close-up | 0.100-0.224 | 0.110-0.127 |
| Distant | 0.075-0.078 | 0.081-0.088 |

Both submit one draw, with 316 versus 60 triangles. The runs show substantial
timing variability (p95 values reach 3.4 ms) and the apparent winner changes
between runs. These measurements establish **no reliable baked-map speedup**;
they are not evidence of equivalent performance or a whole-ship/fleet budget.
The memory cost is clear even though the timing difference is inconclusive.
Raw samples, per-block summaries, source hashes, device and view conditions are
saved in `studies/aegis-normal-gpu-metrics.json` (240 valid GPU samples per mode
per run). No disjoint/invalid samples were retained.

`node tools/check-aegis-normal.cjs` verifies geometry preservation, UV bounds and
source hashes. `--browser` checks actual shader variants and linear texture
handling, captures the comparison and repeats the GPU runs; `--browser --guards`
checks rejection of disjoint timers and the unavailable-timer fallback.

### Approved surface treatment / production default

The approved panel treatment is the default on armed and unarmed capital ships.
The [surface taste test](../studies/aegis-surface-review.html) retains the original
comparison in the production `scene3d` renderer.
Use A/B with a fixed camera, or the armor, service belt, underside, hangar, stern,
whole-ship and combat-distance presets. Drag/wheel and slow orbit inspect motion;
the damage toggle exercises the original rig's destruction/reset presentation.
Studio and flight-environment lighting use the same settings for both candidates.

This candidate adds a shared 2048 × 1024 surface atlas, per-source-mesh UVs,
restrained panel layouts, cavity-edge shading and maintenance markings. It keeps
the original positions, normals, hull scale, material batch boundaries, turret
pivots and gameplay collision. Moving/damageable assemblies retain their original
rig-owned batches. `aegisFlight.load()` awaits the local baked atlas before the
rig is created; immutable UV buffers are shared across instances. It adds no
triangles, lights, transparent layers or draw calls. Unarmed ships keep seven
material batches; atlas swatches preserve the plain finish of merged idle parts.
The approved BAY 01 stencil occupies atlas tile six and twelve existing hangar
roof-bevel triangles. Both sides have independently oriented UVs. The remaining
hull, turrets, lights and gameplay geometry are unchanged by this marking pass.
The [marking comparison](../studies/aegis-markings-review.html) keeps the previous
unmarked UVs as A and the current production finish as B.

Regenerate the source-bound review UVs with
`node tools/bake-aegis-flight.cjs --surface-study`; add `--check` to verify freshness.
This option writes only `studies/aegis-surface-data.js`, and refuses a stale
production rig. The normal bake embeds hull and heavy-turret surface metadata in `flight-rig.js`.
`tools/lib/aegis-surface-uv.cjs` owns UV layout;
`studies/aegis-surface-study.js` owns the atlas and reversible batch adapter.
`node tests/aegis-surface-study.cjs` checks exact geometry/normals, atlas bounds,
shared poses, damage ownership and the source hash; it is in the artwork group.
It also exercises production loading, default textures, unchanged idle draw count,
exact positions/normals, cross-instance sharing and stride-aware optical bounds.
The atlas is authored offline with `node tools/bake-aegis-surface-atlas.cjs`
using a local `@napi-rs/canvas` package (set `NODE_PATH` if needed). The offline
bake uses Consolas Bold to match the approved browser lettering; set
`AEGIS_MARKING_FONT` to that font file when it is not in the default Windows path.
This font is used only by the offline bake; the runtime loads the PNG.
These authoring dependencies are not required to serve the site. Re-bake the shield envelope
after regenerating the rig so its source fingerprint stays current.

`rig.setSurfaceDetail(enabled, scope?)` switches presentation only, without replacing
actor arrays or changing damage, targeting, simulation or pivot ownership.
Battle and unarmed patrol wrappers forward it. The optional `turrets` scope
compares the heavy-turret finish against the approved hull-only baseline.
Turret damage uses original collision vertices; reset restores the selected finish. The flight diagnostics include
**Benchmark capital surface detail** and **Benchmark turret finish**, which freezes the same real combat scene
and toggles only this finish in ABBA order, restoring the default afterward.

The review's Measure A/B button freezes its camera and runs ABBA with 20 warm-up
and 90 measured frames per block. Hidden/resized views invalidate the run.
Measurements cover scene synchronization and render submission, not GPU execution
or combined combat simulation. See [candidate evidence](benchmarks/aegis-surface-2026-10-26.md).
The user approved this visual direction. The recorded production comparison uses
both capitals, eight hostiles and two wingmen; GPU timing remains unmeasured.

## Kit convention

- Long axis is X; bow is negative X; dorsal is positive Y.
- Every spine interface has a nominal 10 wide by 8 high octagonal profile.
- Mid-hull modules are 16 units long. Connectors belong to each module.
- Dorsal attachment origins are local (0, 4.1, 0), shifted 3.5 units toward the bow on the final hull. The final hull also carries
  a fixed command tower aft of its attachment socket.
- Each mid-hull also has an independently configured ventral socket. The same
  attachment geometry rotates 180 degrees around X, preserving forward-pointing
  weapons and outward normals. Explosion offsets move each bank away from its
  own hull surface. The Underside camera preset exposes the lower bank.
- One model unit represents 9 meters for the optional nominal length readout.
  This is an art study, independent of simulation calibration.
- Major modules are named groups. Armor and details remain separate meshes
  within those groups. Explosion offsets are inspection transforms only.

The OBJ button exports assembled positions with stable named spine, dorsal and ventral attachment objects,
regardless of explosion or turntable settings. It exports geometry only, without
materials, UVs, lights or socket metadata. These intersecting component meshes
are intended for visual modeling, not watertight fabrication. The three saved
OBJ examples in `assets/ships/aegis-kit/` can be imported directly into Blender.

Run `node tests/dreadnaught-kit.cjs` for finite geometry and OBJ export checks.
Use `node tests/dreadnaught-kit.cjs --export` to regenerate all three OBJ samples.
The Node test executes the HTML module with the real vendored Three.js geometry
and stubs browser rendering. Orbiting, lighting and controls need browser review.

## Escort scale references

Four 12 m Spitfire stand-ins accompany the hull at true scale (12/9 model units
long), with an independent visibility toggle. Escort detail frames the formation
next to the hull for a close scale comparison without enlarging the fighters.
These reuse the Quaternius CC0
Spitfire used by `studyViewer.referenceFighter` in the other model studies.
`tools/bake-aegis-reference.cjs` extracts only that mesh and its existing surface
finishes from the vendored ship pack into `assets/ships/aegis-kit/reference-fighter.js`.
The generated asset includes source identity, license and source mesh hash.
Run that script after changing the source fighter or shared finish generator.
Escorts are separate scene objects: they neither explode with the kit nor appear
in its OBJ export. Their small size alongside the capital hull is intentional.

## Live flight scenario

Open `experiments/flight.html?aegis=1` or choose Aegis from the mission list.
This uses the ordinary flight simulator controls, physics, HUD, NPCs, projectile
stepping and damage resolver. The player flies between allied and red-team
1,305 m battleships exchanging main-battery fire. Customized bench configurations
are not passed through. The ships patrol on bounded opposing arcs at about
12 m/s, with a gentle heading swing. Red starts 1,500 m across the beam and
180 m higher, allowing the allied dorsal and hostile ventral batteries clear
firing arcs. Red illumination and red bolts distinguish the opposing ship.

Each battery has a fixed pedestal, yaw joint and pitch joint. The generated
flight asset separates the immutable hull from twelve main batteries and twelve
small point-defense mounts, with meter-based pivots and Z-up geometry. The main
batteries track only the opposing capital. They slew at 0.35 rad/s in yaw and
0.25 rad/s in elevation, settle before short twin-barrel salvos, and pause
an independently randomized 2.8-5.2 seconds between salvos, keeping the
original average cadence and two twin volleys per burst. Initial delays vary
per gun and per faction. Each battery
chooses a continuous random 3D hull point for the next salvo: longitudinal,
lateral and vertical offsets vary independently. Empty through-hangar volume
is excluded. The guns do not converge on a midline or fire in an ordered sequence. Unguided main rounds travel at 700 m/s
with an 8-second lifetime, 35 m visual length and 20 damage. Swept proxy-hull
contacts emit the fighter destruction effect at a smaller 5 m scale, inherit
the struck ship's drift, and reduce the opponent's 20,000 integrity;
zero integrity disables propulsion, weapons and allied hangar launches, without
a capital breakup effect. Reset restores both ships. Small PD mounts use 22%
of the main turret geometry scale and handle opposing fighters (including the
player for red AA).
`experiments/aegis-flight.js` limits PD yaw to 2.8 rad/s and elevation to 2.2 rad/s,
retains valid targets within 900 m, solves a constant-velocity intercept and
fires only after alignment. Its rounds travel at 450 m/s, live for 2 seconds
and deal 3 damage before the shared weapon modifiers. Upper and lower banks use
their own outward hemispheres, with an elevation limit of 84.6 degrees. The
readout counts confirmed enemy shield/hull hits separately from hull impacts.
Conservative hull and bridge boxes block firing lines and projectiles. These
same coarse boxes stop player hull crossings; they are not mesh-accurate
collision shapes. Turrets use the existing projectile renderer and shared
fighter damage resolver. Pausing freezes their clocks and projectiles; Reset
clears tracking and shots. Static hull buffers are reused between frames.
Turret vertices are also immutable and shared between identical meshes. Each
mount updates one column-major rotation basis; the existing scene shader applies
rotation and pivot translation on the GPU. Drawing or pausing allocates no new
turret vertex buffers or batch arrays. PD rounds request at most four cosmetic
scorch projections per fighter per second; collision, hit reporting and damage
still run for every round. Ordinary fighter weapons retain their mark behavior.

`node tools/benchmark-aegis.cjs` measures geometry preparation and scorch cost
locally. The original CPU transform path recreated 1,230,336 vertex bytes per
frame and took about 2 ms in the development benchmark. The matrix path recreates
zero vertex bytes and took roughly 0.02 ms on the same machine. These are CPU
microbenchmarks, not end-to-end FPS measurements.
Projectile collision also reuses a source-mesh triangle hierarchy, traversed in
entry-distance order and pruned once a closer hit is known. Scalar face/edge/
vertex sweeps retain the spherical bolt-head rules. Differential tests compare
2,400 indexed sweeps with the original implementation, including stationary and
degenerate cases. The performance overlay's optional Aegis stage timings separate
simulation, PD, scene preparation and HUD work to identify future regressions.
Scorch projection reuses that hierarchy to visit only triangles near the impact;
80 additional comparisons check exact agreement with full-mesh clipping.
Fighter and wreck scorch meshes likewise stay in model-local coordinates and
use GPU poses. `sourceScorchGeometry` rebuilds cached layers only when mark
identity or hull ownership changes; the legacy posed-vertex method remains
available. This prevents accumulating burns and drifting wrecks from adding
per-frame projection and vertex-upload work.

Aegis mode and the Ellis centerline patrol load
`assets/ships/aegis-kit/flight-rig.js`. Normal flight and the asteroid mission
retain their existing setup. Regenerate that asset with
`node tools/bake-aegis-flight.cjs` after changing ship geometry or pivots, then run
`node tools/refresh-flight-assets.cjs` after changing simulator scripts.
`node tests/aegis-flight.cjs` checks asset freshness, tracking limits, both firing
hemispheres, shared damage, allied safety, collision, reset and buffer reuse.
It includes a fighter crossing at 170 m/s, rather than relying only on stationary
targets. The dreadnaught remains at its designed 1,305 m length.



## Repeatable performance comparison

In Aegis flight, press F3 and choose **Benchmark Aegis on / off** under
Renderer diagnostics. It pauses flight and renders the same snapshot, camera,
resolution, sky and fighters in OFF/ON/ON/OFF order. Each block discards 20 warm-up
frames and measures 90 frames using uncapped requestAnimationFrame scheduling,
independent of the normal active/paused caps. Results report CPU submission,
browser frame interval and actual submitted draws/triangles. The ship and its
current projectile effects are the only rendering difference. Simulation stays
frozen; this is not a total-game or GPU-timer benchmark. The ship is restored and
flight stays paused afterwards. Keep the tab foreground and avoid changing
settings or resizing while it runs.

`node tools/benchmark-aegis-encounter.cjs` supplies the complementary CPU test:
eight scripted fighters cross upper/lower PD banks for six seconds at 60 updates
per second, using the actual Spitfire collision mesh, projectiles and damage.
It warms both cases and reports six samples per case plus median update cost.
The OFF case performs the same scripted fighter movement without the capital
update; ordinary fighter AI, rendering and audio are excluded. Large target HP
keeps the collision workload fixed. `--compare path/to/result.json` checks exact
shot counts, confirmed hits and remaining health against a saved result.
`--reference COMMIT` alternates six AB/BA pairs with that commit's targeting,
training resolver and hull-query module, keeping assets and other modules identical, and asserts exact
combat agreement. `--contacts 128 --no-fire` isolates the targeting workload at a larger contact
count. Timing is diagnostic, never a pass/fail threshold. See the
[recorded comparison](benchmarks/aegis-2026-10-20.md) for measurements and limits.
The [projectile collision comparison](benchmarks/collision-2026-10-23.md) records
the later spatial broad phase, conservative sleeping and allocation reductions.

Target positions are converted once per update, then each mount retains its
valid lock or randomly samples a valid contact. Independent seeded per-mount reservoir
sampling spreads acquisition beyond the closest fighter, avoids sorting and
keeps resets reproducible. Locks persist until the target dies or leaves range
or the mount hemisphere. The damage resolver's optional `onDamage` callback reports only
real shield/hull loss, once per trace, including lethal hits. PD uses this rather
than scanning all fighters' health before and after every projectile segment;
existing trace callers still receive the same impact point.

The study renderer caches bounds for immutable static vertex arrays. It tests
the transformed source box against the exact camera clip planes before issuing
actor draw calls. Rotation, scale, turret bases and source stride are respected;
near-plane intersections and camera-inside cases stay visible. Off-screen actors
remain in simulation and retain their GPU buffers. Shadow passes and model-viewer
picking retain their prior behavior, and dynamic effects retain their existing
submission path. This applies to static fighter and wreck batches as well as
capital hulls. `tests/study-culling.cjs` compares 1,500 transformed cases against
an independent corner/clip-plane oracle.


AA rounds use standard allied fighter green bolts, including the source weapon's
10 m trail, 0.9 m collision/visual head radius, 450 m/s speed and 2 s lifetime.
Their maximum acquisition range follows speed times lifetime (900 m); predicted
intercepts must also fit the lifetime. PD damage and firing cadence remain as
configured for the capital mount.

The study effect setter retains the complete submitted batch list. Fighter shots
(three color groups and impacts) plus fighter engines already consume five
batches; capital projectile/impact batches are appended after them. The old
five-batch cutoff discarded all AA artwork even while its damage simulation
continued. The regression checks all nine batches survive the renderer boundary.

AA aim still solves a constant-velocity intercept; projectiles remain unguided
after launch. A fighter changing velocity during the longer flight time can
naturally evade them. No extra spread, homing or deliberate aim penalty is added.
Historical performance replays recorded with 2,200 m/s AA are not combat-equivalent
to this tuning; use a reference with matching weapon settings for exact replay
comparisons.


AA mounts wait for 0.12 s of aligned tracking below 0.8 rad/s of combined yaw/pitch
slew before starting a 0.55–0.65 s burst (usually 3–5 twin volleys). They then pause
for 0.8–1.32 s while continuing to track. Mount durations and initial delays differ
to avoid synchronized salvos. Losing alignment, clear firing line, target or slow
tracking interrupts the burst and starts the pause. This gates only new shots;
existing rounds continue their normal flight and collisions. All timers use the
paused simulation clock and reset with the rig.


For viewing variety, a mount with a live in-range enemy and no recent shots may
fire one speculative twin volley after 2.8–4.6 seconds of silence. These shots
follow the current barrel direction (standard twin-gun convergence), rather than
snapping to the predicted intercept. The barrels must point within 45 degrees of
the target/lead and have a clear forward ray past the ship hull. Each such volley
starts a normal rest interval and resets the silence timer; any accurate shot
also resets it. Normal aligned bursts remain preferred. Pausing freezes these
timers and disabled combat or missing/out-of-range enemies cannot trigger them.


## Through-hull hangars and mixed segments

Open **Individual hull segments** in the kit to choose each segment's hull,
upper attachment and lower attachment independently. The Dreadnaught preset uses
armored / hangar / armored / utility / armored / armored hulls. Preset changes
reset the overrides; the reset button returns to the bulk controls' layout.
OBJ export retains separate named segment and attachment objects.

The hangar is an open box across the beam, with a deck, ceiling, end walls,
portal frames and runway lights. Its center has no spine or closed rear wall.
The flight bake records module positions and conservative 90 m × 20 m clear
apertures. Runtime collision partitions the hull around these apertures so a
player or projectile can pass through either side while floors, ceilings and
end walls remain solid. Flight currently uses the baked mixed Dreadnaught
preset; edits in the kit are authoring previews and do not automatically replace
the running flight asset. Regenerate with `node tools/bake-aegis-flight.cjs`.

In the Aegis encounter the initial allied wing is staged inside the hangar.
The first fighter launches after one second, then one every three seconds,
alternating port and starboard mouths (and cycling hangars if several are baked).
Each craft spends 2.2 seconds moving straight at 60 m/s before normal combat AI
takes control in clear space. Launch poses use the flight model's handedness,
and collision hulls follow the same selected fleet artwork as other fighters.
The hangar maintains up to eight live wingmen and replaces losses; dead launched
craft are removed from the active list once their ordinary wreck copy exists.
Existing wreck limits remain in force. Pause, disabled combat, player death and
between-wave countdowns suppress launches.

`AegisFlightRig.reset(combat)` stages the allied wing and opts that experiment
combat into `hangarSupport`. Subsequent furball waves retain surviving allied craft and their original hull
art while spawning their enemies, leaving new allies for the hangar; an empty allied roster does not end a wave while
reinforcements are available. Other flight modes retain their ordinary spawn and
wave behavior. Temporary `Craft.hangarLaunch.remaining` is JSON-safe and is
removed when departure hands over to AI. Tests cover independent slot choices,
mesh and collision through-rays, deck/end-wall solidity, alternating departures,
launch pose orientation, AI handoff, wing limits, replenishment and reset.

`aegisFlight.createBattle()` composes two independent rigs behind the existing
flight-rig interface. `create()` remains the stationary single-ship harness for
benchmarks and focused tests. Both ships share immutable mesh buffers; hull and
turret bases, muzzle vectors, launch poses and collision queries transform
through each ship's current heading and position. The battle telemetry includes
per-capital position, heading, integrity, round count and confirmed hits.

Hangar roof and deck armor reuse the neighboring hull's four ribbed plate bays,
pale/armor alternation, dark service recesses, cyan/amber lights and maintenance
hatches. Interior light strips stand clear of the floor and ceiling to prevent
depth fighting at flight-view distances; the through passage stays open.

## Shared runtime optimization policy

Capital rendering preparation belongs to `aegis-flight.js`, not mission code.
`aegisFlight.create({state, opponent, unarmed: true})` uses the shared unarmed
representation: hull and fixed idle turrets are combined into seven material
batches, with mount offsets baked in authored metres. This prepared resource
and its immutable GPU vertex arrays are cached per source asset revision and
shared by every instance; origins and rotation bases remain actor-owned.
The Ellis patrol only supplies its route and region ownership and requests this
common representation. Other unarmed capital traffic can use the same factory.

Armed ships use the same factory with the default articulated representation.
They retain independently tracked turret pivots, shared immutable meshes and GPU
pose transforms on every map. The seven-draw whole-ship representation applies
to fixed turrets; armed ships require separate articulated draws. Batching must
never freeze working guns to reproduce an unarmed benchmark. Changing source
asset identity invalidates both preparations together, without editing authoring
geometry, collision, weapon rules, scale or livery. Regression coverage checks
cross-instance resource sharing, exact authored vertices/normals and pivot
translation, independent poses, revision invalidation, and live armed combat.

## Zone-defense sortie integration

`flight.html?mission=battle` automatically loads the same local Aegis asset and
uses `aegisFlight.createBattle({battlefield:true})`. `reset(combat)` anchors the
pair in the player's sortie frame at offsets (-1100, 1800, 300) and
(1100, 2100, 650) metres (right, forward, up). Their authored -X bows face one another with a
20-degree offset from the engagement line to expose their gun decks. The two rigs retain their original
1,305 m hulls, independent articulated mounts, faction livery, SI weapons,
bounded motion and shared immutable mesh buffers. Heavy batteries damage the
opposing capital; point defense uses the existing fighter targeting/damage path.
Player hull contact and projectile interception use the existing capital boxes.

Battlefield mode leaves the thirty zone-owned fighters intact on reset and does
not enable the standalone sandbox's hangar/replacement ownership. The five fighter
zones retain their existing centers and pursuit rules. Default `createBattle()`
keeps the standalone high-altitude engagement and hangar behavior unchanged.

The battle's lab offers two separate frozen ABBA comparisons: distant squadrons
on/off with capitals retained, and capital ships on/off with fighters retained.
Use a camera where the hulls are visibly submitted; an offscreen pair mostly
measures effect work and cannot establish the cost of drawing the ships. See
[the battlefield comparison](benchmarks/battle-capitals-2026-10-25.md).

## Targetable flight systems

Armed rigs expose 24 turret assemblies and five separate drives. The kit keeps
named `engine_*` groups with nozzle pivots; the bake exports `engines` alongside
`turrets`. Hull batches exclude those assemblies. Unarmed traffic merges both
back into its shared material batches, retaining its existing draw cost.

`rig.components()` returns stable IDs, current/max HP and world positions for
HUD targeting. U cycles living enemy systems, then clears selection. Heavy guns
have 180 HP, point defense 70 HP, and engines 240 HP. Projectile queries use
cached component-local bounds before exact triangle intersection in the current
articulated frame. They remain read-only. `TerrainHit.onImpact(point, bolt,
combat)` runs only after the training resolver selects the nearest struck
surface, so convergence probes and nearer fighters cannot damage a component.
`rig.damage` routes the finalized hit to that surface; hull impacts below a gun
do not damage its bounding box. Damage also reduces parent hull integrity once.
The structural stern proxy ends at 652.5 m; exposed engine meshes resolve their
own rear contacts.

A destroyed mount freezes its aim and cannot fire; already launched rounds
continue their normal damage resolution. Each destroyed drive removes one fifth
of the capital's patrol/turn rate. With all five gone it stays at its current
pose. Each part emits one inherited-velocity destruction flash and receives a
local tiled soot texture, including extinguished engine faces. Wreck buffers are
created once on destruction; reset restores shared intact buffers and health.
These are encounter-local states, not additions to saved RTS worlds.

Use [the component inspection lab](../studies/capital-systems-check.html) for
whole-ship, turret and drive views, individual destruction/reset and matched
intact/damaged rendering samples. See [measured readiness](benchmarks/capital-systems-2026-10-26.md).

## Approved hangar interior

The flight bake removes the old raised stripe and light blocks and stores three
`interiors` batches: deck, ceiling and bulkheads. Each has six-float authored
vertices; deck and bulkheads carry an `AegisSurfaceFinish` with a local `atlas`
override. The loader shares those textures and prepared buffers across ships.
Idle ships retain seven hull batches plus the interior batches. Surface
toggles/reset preserve the selected textures; collision dimensions, launch
anchors and articulated component ownership are unchanged.

Art and flight-operations intent are recorded in
`assets/ships/aegis-kit/hangar-v1/design.txt`. Lift, taxiing and recovery remain
design intent; the existing launch logic is unchanged. The original review
baseline is frozen in `studies/aegis-hangar-before-rig.js`.

Ship albedo textures use trilinear mipmaps, including non-power-of-two images
(WebGL2), plus anisotropic filtering capped at 4x or the hardware limit. Raw
and PBR variants share these sampler settings. This keeps thin deck markings
and bulkhead seams stable under minification; MSAA alone does not filter
texture-internal edges. Source artwork is retained for close approaches.

## Approved windows

All 480 authored windows, including the 48 narrower nose windows, retain their
original geometry and normals. The flight bake moves them into a fourth
`interiors` batch with a shared 1024 x 256 `window-atlas.png`. Rebuild that atlas
with `tools/bake-aegis-window-atlas.cjs`; its painter lives in
`tools/lib/aegis-window-atlas.cjs`. Frames, rooms, partitions and reflections
are painted depth, without transparency, dynamic lights or added triangles.

`AegisSurfaceFinish.shader` optionally selects the renderer finish. Windows use
`-2`, retaining the custom shader with an interior albedo illumination floor
instead of the exterior PBR material. Surface toggles and reset restore this
selection. The window-only revision had eleven logical idle batches; empty source batches and
visibility affect submitted draw counts. The pre-window review baseline is
frozen in `studies/aegis-windows-before-rig.js`.

## Approved service panels

The service belt uses atlas tile two for recessed panels, a maintenance hatch
and ventilation slats. The approved painter lives in
`tools/lib/aegis-service-panels.cjs` and is included by the existing surface
atlas bake. Its finish color is `[.065,.075,.08]`; geometry, UV layouts, texture
dimensions, material ownership and draw batching are unchanged.
The original atlas is retained in `studies/aegis-service-before-atlas.png` for
the review comparison.

## Approved open engine bells

The nozzle bake replaces capped exhaust discs with a 32-sided bell: outer
wall, defined lip, tapered inner liner and throat recessed 13.8 m. Across five
engines this adds 480 triangles (3180 to 3660 engine triangles). The original
engine pivots and five material batches per engine remain independent for hits,
destruction and reset. Engine batches may carry `AegisSurfaceFinish`; the loader
deduplicates local atlas overrides across interiors and engines. The turret-only
finish switch excludes engines. Wrecks replace the nozzle finish and reset
restores shared intact buffers. Exact component collision follows the new bell.

`tools/lib/aegis-nozzle.cjs` authors geometry and the shared 1024 x 512 atlas.
Run `tools/bake-aegis-flight.cjs`, then `tools/bake-aegis-engine-atlas.cjs` with
the offline canvas dependency. The idle ship combines finished engine geometry
into one static atlas batch, giving twelve logical batches rather than eleven.
The engine texture and GPU geometry are shared across instances; no new dynamic
lights or transparent glow passes are introduced.

## Constant window illumination

Lit windows use a constant 1.95x albedo illumination boost at every distance.
The original two unlit atlas tiles remain dark; original geometry, atlas detail,
frames, mipmaps and window size are retained. There is no distance-dependent
brightness fade. Finish `-1` remains the original interior treatment for A/B
review; finish `-2` adds this boost on the existing 4 x 2 window atlas.

## Structural finish coverage

The exposed utility frame, couplings, rails and ventral pods use the dark
charcoal material in `assets/ships/aegis-kit/structure-v1/`. Its ImageGen prompt
and original asset are retained there. The flight baker selects substantial
dark/trim source meshes, excludes thin service belts and tiny vents, and maps
every dominant face before batching, including narrow sides and end caps.

The bake moves 283 source meshes (6000 triangles) to one `structure` interior
batch. Positions, normals and winding are unchanged. This adds one shared
static material draw per visible ship; the idle rig has thirteen logical batches.
Textures and prepared buffers remain shared across instances. The shield baker
includes the redistributed structure so the shield geometry does not change.
Use `node tools/bake-aegis-flight.cjs --structure-study` to regenerate the
review data against `studies/aegis-structure-before-rig.js`.

## Armor wrap candidate (review only)

`node tools/bake-aegis-flight.cjs --armor-study` exports source-mesh ranges and
continuous cross-section UVs to `studies/aegis-armor-wrap-data.js`, without
changing the production rig. The authoring helper in
`studies/aegis-armor-wrap.cjs` unwraps the contour around each armor piece,
with a UV cut on the negative-Z side in authoring space at the window belt.
Crossing triangles are split on that plane; the shape and flat normals stay
unchanged. The atlas layout mirrors the generated upper strip for the lower
half. Axial end surfaces sample a quiet painted region instead of a white
flat-color swatch. Bay identification retains its separate atlas tile.

The candidate covers the nose, exposed inner ends and articulated armor too.
It adds 1068 triangles per complete ship, retains the existing draw/material
batch count, and uses the same 2048 x 1024 atlas footprint. It is awaiting visual
approval at `studies/aegis-armor-review.html`; production still uses the approved
original armor. The area/bounds/UV-continuity probe and review-only flight rig
are generated with `node studies/aegis-armor-wrap-probe.cjs`.

## Baked-window and scale review

`studies/aegis-belt-review.html` compares the existing individual window boxes
with flat painted belts and shallow inset openings. The study reuses all 480
approved room images at their authored silhouettes. `--belt-study` exports the
78 source backing-panel ranges. `studies/bake-aegis-belt-study.cjs` clips the
actual armor surfaces, preserving their bends, and packs twenty reused belt
layouts into a 2048 x 1280 opaque atlas. The flat version removes 4608 triangles
per ship; the inset version removes 2964. Both retain the window material draw.
The atlas costs about 13.3 MiB with RGBA mipmaps, versus 1.3 MiB for the old
window atlas. This remains a review candidate, not the production default.

Scale references in `studies/aegis-scale-study.js` use the existing Quaternius
astronaut normalized to 2.0 m including the suit, the shared 12 m Spitfire,
and one-metre ruler ticks. The optional one-sided cutaway has provisional
3.3 m deck spacing. Temporary platforms and references are authoring aids only.
Each hangar contains two calibrated fighters and eleven suited crew on its
actual deck plane. Toggle Scale references to inspect the ship without them.
The belt probe checks 1182 visibility rays per variant, finite buffers and UVs.

The review also offers a 2.5 m personnel-door texture comparison, with crew
beside the bulkheads. The large cargo shutter stays unchanged. The generated
replacement keeps the original 2172 x 724 dimensions and material sampling;
it adds no texture allocation, triangles or draws. This remains preview-only.

## Production baked windows and faction livery

The production bake now replaces all 480 individual window boxes with the
approved shallow inset belts on the existing production armor. It uses the
shared local `belt-atlas.png`; no production resource depends on `output/`.
`tools/lib/aegis-window-belts.cjs` clips the real hull facets, cuts the openings,
and adds their shallow returns. The main bake preserves all moving parts,
anchors and metre coordinates. The broader generated armor-wrap study remains
separate; promoting the windows does not promote its armor texture.

The personnel frames in `hangar-v1/bulkhead.png` now measure approximately
2.5 m rather than 4.3 m. The large cargo shutter is unchanged. This replacement
keeps the same dimensions, material and draw cost. Source edit prompts and the
2 m suited-crew comparison are retained in `output/aegis-hangar-door-scale-*`.

Both factions share the same geometry and texture images. Enemy armor receives
a muted oxide-red material tint, while dark machinery, room lights, engine
textures and hangar interiors retain their original colors. This replaces the
old rule that raised dark blue-gray metal to bright red. It requires neither
an extra atlas nor a shader variant. `studies/aegis-belt-production-review.html`
compares allied and red-faction materials using the production loader.
