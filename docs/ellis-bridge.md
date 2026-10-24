# Ellis bridge playtest

Serve the repository and open `experiments/flight.html?mission=ellis`, or choose
Ellis Bridge in Missions / the main index. Four wingmen and four hostiles are
split between the asteroid range and Rime. The 300 m radius mouths are at
(0, -2000, 1550) m and (12000, -2000, 1550) m. The first is directly ahead of the
default start. Fly through its center, then turn around to return. Standard
controls apply; reset restores the encounter. Deployment remains static/local.

The asteroid sky uses the existing baked hero galaxy panorama. Rime uses its
existing Jade/Rime cube faces and detailed moon disk.

## Shared optics

`experiments/ellis-optics.js` starts from null geodesics in the static Ellis metric
`dsÂ² = -dtÂ² + dlÂ² + (lÂ² + aÂ²)dÎ©Â²` to a normalized radial integral, setting `a=1`.
The current presentation smoothly flattens the exterior as described below; it
is a compact visual approximation, not the unmodified infinite Ellis metric.
Spherical symmetry keeps each ray in a plane. Both charts and all physical sizes
reuse the same 512 Ã— 512 RGBA8 table (1 MiB CPU data, cached once per page).
Its two 16-bit channel pairs store transmitted and turning branches.

For conserved normalized angular momentum `b`, angular motion obeys
`dphi/dl = b / ((1+lÂ²) sqrt(1-bÂ²/(1+lÂ²)))` on an outward branch. Substitutions
`l = sqrt(1-bÂ²) sinh(u)` for transmitted rays and
`l = sqrt(bÂ²-1) cosh(u)` for turning rays remove the radial square-root endpoint.
The table stores their cumulative integrals, not merely an asymptotic sky warp.
A logarithmic impact-parameter coordinate concentrates samples near `b=1`.
Both `skybox.js` and the geometry compositor use the same GLSL mapping.
Inside the integration-entry sphere, inward and outward initial rays are both
traced. Outward rays start on the escaping branch and remain in their current
chart; curvature must not be disabled immediately after emergence.

This follows the analytic-geodesic/precomputation approach discussed by
[MÃ¼ller, Exact geometric optics in a Morrisâ€“Thorne wormhole spacetime (2008)](https://journals.aps.org/prd/abstract/10.1103/PhysRevD.77.044043)
and the symmetry-based lookup strategy demonstrated for Schwarzschild geometry by
[Bruneton (2020)](https://ebruneton.github.io/black_hole_shader/).
The table is an original numerical implementation for Ellis geometry; it is not
a copied Schwarzschild table or a claim of implementing those renderers verbatim.
[James et al. (2015)](https://arxiv.org/html/1502.03809) supplies the wormhole
camera/sky and traversal reference.

## Nearby geometry and depth

The rendering route follows the practical environment-map strategy described in
[SpaceEngine's GR beta notes](https://spaceengine.org/news/blog220920/): two maps
per wormhole with updates spread over successive frames. Its earlier
[warp/wormhole post](https://spaceengine.org/news/blog220812/) also discusses a
color/depth approximation specifically for warp bubbles; it does not claim that
this exact depth-shell algorithm was used for its wormholes.

`experiments/ellis-renderer.js` uses two 3 Ã— 2 atlases of 384 px cube faces, each
with color and depth, captured from the fixed mouth centers. Existing production
geometry, raw materials and native PBR transforms are reused; scene composition
and uploads happen once. Main-camera static actor culling is disabled only in
this optional pass so offscreen actors remain available to the curved view.
Captures temporarily rebind view uniforms and native object matrices, then restore
them before returning. Ordinary sorties retain their original renderer path.

A full-resolution primary color/depth target preserves geometry in front of the
2a integration-entry sphere. Inside the affected image, the compositor samples
32 ordered points along the curved trajectory, brackets a negative-to-positive
radial depth residual, and refines that crossing with nine bisection steps. Hits
whose residual remains larger than a capture footprint are rejected as depth or
silhouette discontinuities. Captured color is sampled at the refined crossing. With no hit the
compositor is transparent, exposing the identically lensed sky beneath it.
This addresses the former unconditional asteroid/ship foreground layer.

The first rendered frame and chart changes fill all twelve faces. Steady frames
update one face per chart; `bridgeFaces=6` updates all twelve each frame for a
quality/cost comparison. Captures are viewer-owned, allocated only for this
mission, and disposed by `setStudyBridge(false)`. Primary targets are disposed
and recreated on resolution changes. `bridge=legacy` and `bridge=sky` retain
comparison paths. See the [measured comparison](benchmarks/ellis-bridge-2026-10-23.md).

## Deliberate limits

This is a depth-shell approximation, not triangle intersection against every
curved ray. Each capture direction stores only its nearest surface. Concavity,
transparency/additive effects, very close geometry, fine critical-ring images
and temporally stale moving ships can be inaccurate. Secondary images have
384 px capture resolution and 32 finite trajectory samples (with crossing refinement). The primary
postprocess target does not add multisampling. Lensing is restricted to an entry
sphere of radius 2a; the exit radial bound is 24a, and critical trajectories are
clamped by the finite logarithmic table. These limits need further visual work.

Gameplay still uses swept spherical crossing and antipodal position identification
between Euclidean exterior charts. At a crossing, the antipodal identification
transports the ship basis, velocity, projectile directions and residual tick
travel by a proper half-turn around the crossing radial axis (`2nnáµ€ - I`).
This preserves speed, radial motion, orthonormality and handedness while reversing
tangent components in the destination chart. They do not follow curved spacetime
geodesics during ordinary exterior flight.
The chart is selected by x < 6000 m versus x >= 6000 m. Targeting, HUD markers,
AI route planning and projectile collision use the existing Euclidean rules;
collision is evaluated before traversal in each physics tick. Cross-mouth combat
is still experimental.

## Validation

`node tests/ellis.cjs` exercises both crossing directions, high-speed overshoot,
near misses, no immediate bounce, gunfire and live combat in the actual session.
`node tests/ellis-optics.cjs` compares finite-distance transmitted integrals against
independent proper-radial quadrature, checks turning rays and shared cache reuse.
The sampled worst angular difference was 0.000221 radians; this is not an error
bound at the critical orbit. `tests/three-production.cjs` checks shared geometry,
raw/native pose restoration, rolling capture counts, chart refresh and disabling.

Browser inspection covers approach, oblique rim, return-side sky/asteroid,
foreground fighter occlusion, actual forward/return crossings and a short live fight. Labeled cases and raw timing
results are in the benchmark report. Prolonged free maneuvering, close concave
objects, transparent effects and cross-mouth aim alignment remain unresolved.

### Throat continuity regression

The first version traced inward rays only and kept world-space attitudes unchanged
at the antipodal teleport. These caused a discontinuous sky at the crossing.
The outward branch and matching chart transport now make the limiting camera views
agree. `node tools/prepare-ellis-continuity.cjs` generates an opt-in browser check;
`--return` generates its reverse-direction counterpart. Both use poses immediately
before and after a crossing executed by the real headless flight session, then
compile the actual shared GLSL shader and compare 4096 rendered exit rays.

Both directions passed with a maximum one-byte RGB difference and zero destination
mismatches. Negative controls that disable outward curvature or skip attitude
transport produce maximum differences of 65 and 227 bytes, respectively, so the
check detects the original failures. This is a boundary continuity check away from
the critical orbit, not validation of every ray near the ring. The main scene was
also inspected in matched before/after throat stills. The existing finite 2a outer
integration boundary, depth-shell artifacts and screen-space HUD markers remain
separate limitations.

[Raw continuity results](benchmarks/ellis-continuity-2026-10-23.json),
[before](benchmarks/ellis-throat-before-2026-10-23.png) and
[after](benchmarks/ellis-throat-after-2026-10-23.png).

### Local additive effects

Gun bolts and engine glows (`uFinish=9`) are separated from opaque geometry and
captured into a full-resolution color/depth target. The regular scene keeps
additive depth writes disabled; the effects-only pass writes depth and discards
nearly transparent fragments. The compositor adds this layer only in the current
chart, in front of the ordinary opaque depth, and before the first throat
intersection. It excludes these effects from the radial environment captures.
This prevents firing toward the wormhole from silently disappearing merely
because additive materials do not write opaque depth.

This is a local straight-segment approximation, not transparent curved-ray
transport. For rays entering the lens volume the contribution fades over the last
third of a range ending 150 m beyond the lens entry; from inside the volume this
means 100â€“150 m. The physical throat clips it sooner when nearer. Distant bolts,
bolts observed through the other mouth, and explosions still need further work.
Simulation bolts continue moving and crossing charts independently of this fade.
One additional full-resolution effects pass/target is used only when additive
batches exist (the allocated target persists until resize/disposal). Existing draw
statistics conservatively include effects in capture counts, so they overestimate
actual capture submissions.

Validation: real-session forward firing inside the lens volume emits bolts and
advances them forward (`tests/ellis.cjs`); the production submission regression
checks effect-only depth, exclusion from shells, and restoration of visibility and
normal additive state (`tests/three-production.cjs`). Browser inspection at
100 m before the throat shows the yellow forward bolt glow while live projectiles
cross into the destination chart. See the [firing still](benchmarks/ellis-firing-2026-10-23.png).

A live eight-second firing sample at 1920Ã—1080 on the RTX 3070 Ti averaged
14.02 ms/frame (about 71 fps), 2.74 ms presentation CPU and 1.46 ms bridge CPU.
There were 571 samples and seven surviving fighters at the end. This is a live
workload observation, not a matched before/after optimization comparison or GPU
timing; no GPU timer extension was available. [Raw firing timings](benchmarks/ellis-firing-2026-10-23.json).

### Sampling artifacts and quality pass (2026-10-24)

The sky formerly estimated its exit direction by subtracting points at `t=.999`
and `t=1`. This differentiated the quantized lookup field and amplified small
phase errors into visible bands and planet/space slices. The exit direction now
uses the radial/tangent basis and conserved impact parameter analytically at the
same finite outer endpoint. The table itself remains unchanged. Across 248
noncritical test rays, maximum direction error against high-resolution quadrature
fell from 0.018791 rad to 0.000358 rad. This is a sampled regression, not a bound
near the critical orbit. The real GLSL crossing fixture still differs by at most
one RGB byte across either throat direction.

The former geometry test accepted any point behind a captured depth. A captured
ship texel could therefore become an extended radial wedge, producing floating
rectangles and repeated strips. The compositor now seeks and refines a shell
crossing and rejects large residuals at depth jumps. Capture faces increased from
192 to 384 px. This reduces the artifacts rather than making a nearest-surface
map equivalent to full scene ray tracing. Very small or occluded objects can
still be missed, and rolling captures can still lag moving objects by five frames.
The physical critical ring and genuine magnification remain visible.

The first refined version retained 64 coarse steps and cost 31.46 ms/frame in the
frozen magnified-limb fixture. Using 32 coarse steps plus local refinement reduced
that to 17.93 ms (about 56 fps); presentation CPU averaged 1.52 ms. The old coarse
shell acceptance at the same 384 px capture resolution averaged 13.34 ms (75 fps),
but reproduced the floating rectangles. All runs used 1920Ã—1080 backing size,
the RTX 3070 Ti, eight frozen fighters, the same pose and two rolling faces/frame.
These are frame timings without a GPU timer, measured while the full test suite
was also running; they are workload observations rather than universal budgets.
Raw results: [coarse](benchmarks/ellis-quality-coarse-2026-10-24.json),
[64-step refined](benchmarks/ellis-quality-refined-2026-10-24.json), and
[32-step refined](benchmarks/ellis-quality-refined32-2026-10-24.json).

Visual inspection covered the oblique rim and magnified limb, plus slow actual
flight toward/through the throat. The [coarse control](benchmarks/ellis-limb-coarse-2026-10-24.png)
shows the patches; the [refined view](benchmarks/ellis-limb-quality-2026-10-24.png)
has a smooth limb and omits those wedges. Subpixel silhouette aliasing,
nearest-shell occlusion, critical-orbit sampling and long dogfights remain limits.
The benchmark generator's `quality=coarse` option restores the former shell
acceptance only in that development page for comparisons; production has one path.

The final 32-step version was also inspected during actual 2 m/s flight from the
magnified-limb fixture through the throat. The camera emerged in the destination
chart, and the enlarged limb remained smooth in the inspected views. The live
sample averaged 18.93 ms/frame (about 53 fps), with 51.5 ms p95 while the test suite
was running; there is still frame-time variation to investigate. See the
[final live sample](benchmarks/ellis-quality-live32-2026-10-24.json),
[moving still](benchmarks/ellis-limb-moving-2026-10-24.png), and
[updated GPU continuity checks](benchmarks/ellis-quality-continuity-2026-10-24.json).
`npm run check`, the focused optics and production-renderer tests, asset hash
validation, and `git diff --check` passed after this quality pass.


### Opt-in geometry-budget experiments (2026-10-24)

The default remains the full-resolution, unlimited-angle geometry tracer. Two
experimental controls are available for testing without altering sky lensing or
simulation:

- `bridgeGeometry=adaptive`: render an RGBA8 hit-coordinate map at half width and
  height, using nearest filtering and manually decoded 16-bit path parameters.
  Reconstruct colors from the existing capture atlases at full resolution. Mixed
  hit/miss or chart neighborhoods, steep path changes, large depth residuals and
  critical-orbit rays request a separate full-resolution refinement pass. Foreground
  color/depth tests and the local additive effect layer stay full resolution.
- `bridgeAngle=180` (or `360`): stop the geometry search once angular travel exceeds
  the specified degree budget. Zero/omission means unlimited. This restricts the
  searched path prefix, so an early hit is retained even when the rest of its ray
  would wind much farther. The sky remains unrestricted. This does not guarantee
  exactly one image per object: image order also depends on source/camera geometry,
  and a hard angular boundary may omit primary views or cause a moving image to pop.

The shared GLSL `ellisPointPhase` returns the same point/chart as `ellisPoint`, plus
continuous angular travel in the ray plane before the antipodal chart-coordinate
flip. It uses the already computed phase; the angular test adds no extra integral
lookup per march step. Coarse and refined geometry paths use the same budget.
`ellisPoint` remains the original point-only wrapper used by the sky.

An initial adaptive version called the long traversal conditionally inside the
same full-size shader. It cost about 2.93 ms for the hit map **plus 11.57 ms** for
composition in the magnified-limb fixture, so it did not reduce GPU work. It was
replaced by distinct fast-composition and refinement shaders, with the latter
rejecting non-refinement pixels before tracing. No speedup is claimed for this
replacement or the angular budgets yet.

Validation is incomplete: the in-app browser stopped accepting WebGL contexts,
including a fresh full-resolution control tab (`GL_RENDERER = Disabled`,
`BindToCurrentSequence failed`). A zero-sized/zero-geometry pixel comparison was
rejected, not counted as a pass. A fresh Chrome test surface was unavailable. The
browser/app GPU backend needs restarting before matched GPU timings and visual
acceptance can finish. The default was kept full-resolution/unlimited for this
reason. Existing nearest-shell and capture-update limitations still apply; coarse
all-miss cells can miss subpixel geometry and require explicit thin-object tests.

After recovery, generate `output/ellis-benchmark.html` with
`node tools/prepare-ellis-benchmark.cjs`. Use the same `view=limb&gpu=1` pose for
`bridgeGeometry=full`, `bridgeGeometry=adaptive`, and each angular budget. Alternate
full/adaptive/adaptive/full with no tests running. The **Compare hit map** button
on an adaptive page compares same-frame final pixels against the full tracer. The
**Compare angular cutoff** button on a full page compares its budget to unlimited.
Both require positive render dimensions and visible opaque geometry; an all-sky
comparison cannot validate geometry. Test `view=foreground`, `view=warped` (a real
fighter placed near the other mouth), rim/approach/return, live firing, and slow
motion before enabling a new default. Check the planet edge and critical ring in
actual screenshots as well as pixel counts.

GPU recovery follow-up (2026-10-24): fully restarting Codex restored WebGL1/2
on the RTX 3070 Ti. Matched 1920x1080 limb samples measured full geometry
composition at 12.05 ms, a 180-degree geometry budget at 10.80 ms, and adaptive
hit-map/composition/refinement at 2.87 + 0.085 + 1.24 = 4.20 ms. These are
single samples, not visual acceptance or a power measurement. The limb comparison
correctly rejected zero opaque geometry (the visible planet is sky content).
The subsequent warped-fighter comparison lost its WebGL context; the cause is
unresolved. Both experiments remain opt-in and the default remains full/unlimited.
Raw timings: [recovery measurements](benchmarks/ellis-recovery-2026-10-24.json).
Focused optics/renderer tests, type checking, and npm run check passed before
this recovery run. Positive-geometry and motion QA remain outstanding.

## Region ownership

Flight poses, projectiles, impact effects and submitted geometry carry a numeric
`region` (0 = asteroid range, 1 = Rime; omitted means 0 for existing callers).
Crossing the swept throat transfers membership along with position and basis.
Wrecks also traverse. Wave spawning distributes both teams across the regions.
The existing 12,000 m coordinate offset remains a storage transform, not a
physical separation or a rule for determining membership: moving across x=6000
cannot change region. Sky and geometry optics receive the camera region explicitly.

The ordinary color/depth pass includes only the camera's region. Each radial
capture independently includes only the region it represents. Fleet hulls,
scorches, engines, projectiles and explosions retain region when batched; static
asteroid-range scenery defaults to region 0. Thus other-region objects can be
seen only on traced paths into that region, regardless of coordinate proximity.

Radar, HUD markers, target acquisition/cycling, gun convergence, AI opponents and
projectile damage use local membership. Asteroid terrain applies only to region 0.
Radar marks the local throat; telemetry identifies the region and throat range.
Cross-throat radar/target locks are intentionally unsupported until there is an
optical bearing/path-distance solution, rather than displaying storage distances.
This remains an approximate Ellis renderer and throat transport, not a general
curved-space physics engine. The adaptive renderer remains opt-in.

Region verification: focused real-session tests cover two-way player/projectile
membership transfer, colocated remote hulls being untargetable/non-collidable,
and wreck/explosion ownership. Renderer tests place two regions at identical
coordinates and inspect the primary pass and all twelve capture faces. Browser
checks covered asteroid approach, Rime facing toward and away from the throat,
and live forward crossing with continuous fire (Rime telemetry, 372 shots,
no console errors). Captures: [approach](benchmarks/ellis-region-approach.png),
[Rime away](benchmarks/ellis-region-rime-away.png),
[live crossing](benchmarks/ellis-region-live-crossing.png).


Temporal hit-map reuse is available only with `bridgeTemporal=1` and remains an
experiment. Preliminary frozen-view measurements show 4.05 -> 3.08 ms total
adaptive geometry GPU time using alternating 8x8 tiles; one-pixel alternation
saved essentially nothing. Scene motion currently invalidates the whole history,
so this is not yet a demonstrated dogfight improvement. See the
[temporal report](benchmarks/ellis-temporal-2026-10-24.md) for revision ownership,
rotation-only reprojection, one-frame age bounds, invalidation, context-loss
findings and incomplete browser acceptance.


## Context-loss investigation, 24 October 2026

The post-process geometry shaders now use GLSL 3 `textureLod(..., 0.)` by
 default. The LUT and render targets have no mipmaps, so level zero is the
 intended source. This avoids implicit texture derivatives inside divergent
 traversal/refinement loops. `bridgeLod=implicit` retains the previous shader
 for controlled diagnosis; avoid using it for normal adaptive rendering.

A matched isolation fixture reproduced simultaneous context loss across the
 Three renderer, sky, and HUD canvases with adaptive geometry and implicit
 sampling. Sky-only, direct geometry, captures without the curved search,
 full geometry, and explicit-sampling adaptive cases completed their samples.
 A subsequent explicit adaptive repeat and a rapid camera-rotation fixture
 each completed 240 frames at 1920×1080 with zero context losses. These are
 bounded stability checks, not proof that every crash is resolved or GPU
 performance measurements. See [investigation](benchmarks/ellis-crash-isolation-2026-10-24.md).

Flight pages persist context loss/restoration/creation errors and JavaScript
 errors locally under `driftworks.gpu-diagnostics.v1`. `gpuDebug=1` adds a
 graphics log panel and recent submission markers. Markers show queued work,
 not the exact GPU instruction responsible. The benchmark now reuses known
 context handles instead of probing incompatible context types, which had
 produced misleading creation-error events.


## Primary object-patch experiment

Add `bridgeGeometry=objects` to the flight URL to replace the curved per-pixel
geometry search with a primary-image mesh warp. The ordinary full geometry
renderer remains the default. The sky retains its shared Ellis lensing.

Each nontrivial object patch solves a center path and three 4 m world-axis
neighbor paths, then interpolates a 3D virtual-view position for mesh vertices.
A fifth diagonal path probes screen error at the object radius; it does not
bound error over the whole hull. Ordinary direct objects need one path.
`bridgeWarpDebug=1` tints patches whose probe error exceeds two pixels.
Hull, scorch and engine batches share the craft anchor; individual bolts and
impacts have their own anchors. The prototype draws the existing mesh buffers
once, with no radial captures or full-screen geometry intersection shader.

This is one affine patch per object, without adaptive subdivision or persistent
image-branch tracking. It omits secondary images, uses approximate depth overlap,
and uses the production raw material fallback rather than native PBR parity.
Large/crossing hulls and caustic transitions are not visually accepted.

A frozen matched fighter scene measured approximately 63% less total timed GPU
work at 1920x1080, with little change in CPU time. This is not a 63% FPS gain
or an accepted 8v8/capital-ship budget. See the
[object experiment report](benchmarks/ellis-objects-2026-10-24.md).


## Observation lab

Open `experiments/ellis-study.html` (also linked on the main index) for a
combat-free, fixed-camera test. Front, close, side, rim, elevated and Rime-side
presets observe the same deterministic 24-second ship tracks. One ship crosses
both ways at 6 and 18 seconds; two escorts orbit in separate charts. Select
crossing-only or orbit-only to isolate them. The crossing follows signed proper
radius mapped to exterior areal radius, with antipodal position and transverse
basis transport. It is a scripted optical fixture, not an AI/physics replay.

Pause/play, frame stepping, a range scrubber, exact time entry, playback speed
and source ship selection let reviewers repeat a view. Switching between object
patches and full ray search reloads this isolated page while retaining camera,
time, pause, pass, model and speed. Ordinary player flight is unaffected. The
scene uses the production presentation/optics and real meshes at source metre
scale, with asteroid and mothership scenery removed. Hidden tabs do not advance
the timeline. The view is capped at 30 render submissions per second.

Browser checks covered all six camera presets, exact-time scrubbing, a frame
step from 5.99 through 6.02 s, and paused renderer switching. The close crossing
exposes 44–57 px object-patch probe errors and a visible shape change; the full
ray-search fixture also loses the crossing ship immediately after the mouth.
Neither renderer is a visual ground truth. These are unresolved renderer issues,
made reproducible by this lab; this change does not fix them. No new performance
claim is made by the lab's submission counts.

Captures: [before](benchmarks/ellis-study-close-before.png),
[after](benchmarks/ellis-study-close-after.png),
[full search](benchmarks/ellis-study-full-close.png),
[Rime view](benchmarks/ellis-study-rime.png).


## Throat orientation feedback

Player flight now adds a soft two-note field-entry chime, a three-note crossing
chord, and a descending field-exit cue. They use the shared SFX bus and mute /
volume controls. Entry arms at 550 m from the local mouth center; exit requires
620 m to prevent repeated cues near the boundary. A region change, not a skybox
change or image distortion, triggers the crossing chord and arrival label.
Initialization, reset, paused motion and observer playback do not fabricate cues.

The existing controller rumble path mixes a gentle continuous field load (up to
0.08 strong / 0.14 weak) with a 0.3 crossing pulse. Hit, contact and shield-break
pulses retain priority. Existing rumble opt-out, controller selection, mouse
 takeover, pause/disconnect handling and 75 ms submission throttling apply.

The persistent throat-status box and camera-relative HUD meridians have been
replaced by the spatial lattice described below. Only the brief 1.8-second
chart-crossing confirmation remains; the entry/crossing audio and rumble are
unchanged. The scaffold's colors provide the ongoing local/remote reference.

`ellis-feedback.js` owns only transient presentation state; simulation/world save
rules are unchanged. Both flight entry points load it before `flight.js`.
The optical observation lab remains free of cockpit sounds and controller events.

Verification covers entry/exit hysteresis, actual two-way region changes,
pause/reset and mission isolation; real audio-facade scheduling and SFX mute;
controller mixing/opt-out via a simulated actuator; finite projected HUD paths,
arrival labels and painter restoration. Browser captures exercise a production
flight throat crossing and field view with no captured console errors:
[arrival](benchmarks/ellis-arrival-feedback.png),
[field guide](benchmarks/ellis-field-guide.png).
Physical controller feel and subjective sound balance still need a playtest.


## Lensed spatial lattice

The Ellis flight and observation lab enable a world-anchored spherical lattice
by default. Three concentric layers span approximately 300–600 m around each
300 m mouth, with 30-degree latitude/longitude lines. Amber belongs to the
asteroid chart and cyan to Rime. Their axes and spacing never follow the camera
or advance with time. The antipodal throat identification preserves this grid's
angular pattern. This is a spherical coordinate lattice, not a Cartesian volume
or an external embedding-diagram mesh.

The sky shader analytically intersects each curved ray with the three fixed
areal-radius shells in the existing geodesic's u coordinate. It uses three extra
radial-integral lookups from the existing cached 512-square table, then tests the
two possible shell crossings. It does not perform another depth search, capture
geometry or allocate another ray table. The expensive radial integral is already
baked; the observer-dependent projection is evaluated at runtime. Grid lookup
sampling uses explicit level zero through EXT_shader_texture_lod when available.

The grid is an additive navigation scaffold in the sky pass. Opaque scene
objects mask it; this does not implement exact grid/geometry depth ordering.
Angular travel above 2.7 radians fades out, reaching zero at pi, to avoid filling
the critical region with higher-order grid copies. Anti-alias width is an
approximation; chart storage offsets are excluded from its distance estimate.
It is intended to expose the primary structure, not every possible lensed image.

Toggle **Wormhole spatial lattice** in flight Settings, or **Spatial lattice**
in the observation lab. `bridgeGrid=0` starts without it and is required when
reproducing pre-lattice benchmarks. The observation lab retains the toggle when
switching geometry renderers. Flight's toggle is session-local and applies live.

Visual checks cover front, close, rim and Rime views; both chart colors and the
live on/off control. Numerical optics regressions still cover finite-source and
turning rays; sky tests cover lattice integration, fixed-level sampling and toggle
uniforms. Captures: [front](benchmarks/ellis-lattice-front.png),
[close](benchmarks/ellis-lattice-close.png),
[Rime](benchmarks/ellis-lattice-rime.png).

The initial five-layer matched 1920x1080 GPU check added roughly 0.55–0.82 ms of sky
work with no context loss. See the [lattice report](benchmarks/ellis-lattice-2026-10-24.md)
for setup, raw evidence and approximation limits.

### Lensing-region outline

The lookup sky pass adds a thin antialiased outline around the local 600 m
integration sphere: all rays that enter the bent-ray renderer lie inside this
silhouette, including same-chart returning rays. Orange marks the asteroid
chart's lensing region; green marks Rime's. This replaces the narrower outline
of only throat-crossing rays, which left distorted returning images outside it.
Angular distance to the sphere's silhouette keeps the line width stable.
Inside the sphere every direction can be bent, so the silhouette is suppressed
rather than suggesting some part of the sky is unaffected. This is a navigation
overlay marking the renderer's cutoff, not a physical wall. It remains enabled
when the spatial lattice is hidden; foreground geometry can occlude it. Objects
in front of the region can still appear inside its projected outline without
being distorted. The legacy integration pass is unchanged.

Focused tests exercise the production cone-distance math at near and distant
radii, both sides of the edge, backward rays, chart colors, interior suppression
and containment of returning distorted images.

Visual check: the flight starting view has a larger orange outline enclosing
both the throat and the stretched same-chart scenery; the old inner green ring
is absent. Lab front/close views can fill the viewport with the lensing region,
leaving its outline off-screen. No browser renderer errors were logged.

## Smooth outer optical boundary

The 600 m entry sphere previously switched outward sky rays from a curved path
to a straight path abruptly. A real shared-GLSL probe reproduced a worst change
of about 0.1155 direction-vector chord (6.62 degrees) between radii 599.99 m and
600.01 m. The new model prioritizes visual continuity while retaining the cutoff
and its navigation outline.

The inner region through 450 m keeps the Ellis radial metric. From 450 to 600 m,
a quintic taper changes q(r) from 1 to 0 in the areal-radius metric
`dr²/(1-q(r)/r²) + r² dΩ²`, with r measured in throat radii. The table integrand
is multiplied by `sqrt((r²-1)/(r²-q(r)))`; the factor is 1 in the inner region.
The taper and its first two derivatives join smoothly. Beyond 600 m the metric
is Euclidean. Its remaining angular integral is evaluated analytically from
the 600 m table value, so LUT quantization cannot leave a residual tail at the
cutoff. The escaping direction also uses the flat exterior tangent. CPU inverse
paths and path lengths use the same compact model. No second lookup texture or
per-frame table rebuild is introduced. Gameplay movement and throat transport
are unchanged; the opt-in legacy shader remains an old comparison.

The navigation outline fades over the last 15 m of exterior approach rather
than disappearing abruptly as the camera enters the volume. `bridgeOutline=0`
hides it independently of `bridgeGrid=0` for controlled sky studies.

### Continuity verification and reproduction

- `node tests/ellis-optics.cjs` checks independent finite-source quadrature,
  inverse paths, outward convergence to straight rays and the exact flat tail.
- `node tools/prepare-ellis-boundary.cjs` prepares
  [the actual-GLSL probe](../output/ellis-boundary-continuity.html): 1,024 rays
  per view, both charts, five view directions around 600 m and a grazing sweep.
  Its hard-cutoff negative control is reconstructed explicitly, independent of
  Git HEAD. The maximum chord falls from 0.115517 to 0.000183 (about 0.0105
  degrees); the pass threshold is 0.0005. There are no destination mismatches
  in these boundary fixtures. This is sampled evidence, not a global bound.
- `node tools/prepare-ellis-continuity.cjs` and the `--return` variant regenerate
  actual production-session throat poses. The fixture now supplies explicit
  region ownership to both the session and GLSL, matching the current API.
  Both directions retain maximum one-byte RGB differences and zero destination
  mismatches across 4,096 tested rays, with working unbent/untransported negative
  controls.
- [Sky-only study](../experiments/ellis-sky-study.html) uses the production sky
  renderer with ships, lattice and outline absent. It has exact distance entry,
  both charts, five viewing directions and 0.7/7/70 m/s playback. The default
  speed is 1/100 of 70 m/s and playback sweeps 550–650 m. Visually inspected
  tangent views at 599.99 and 600.01 m in both charts without a visible snap.

This resolves the demonstrated outer sky cutoff. Depth-shell sampling misses,
object-patch branch switching and fast landmark motion near the critical ring
remain separate issues; this change does not establish their continuity.
Historical rendering/performance captures above predate this optical profile.
