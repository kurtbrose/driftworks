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
`dsÃ‚Â² = -dtÃ‚Â² + dlÃ‚Â² + (lÃ‚Â² + aÃ‚Â²)dÃŽÂ©Ã‚Â²` to a normalized radial integral, setting `a=1`.
The current presentation smoothly flattens the exterior as described below; it
is a compact visual approximation, not the unmodified infinite Ellis metric.
Spherical symmetry keeps each ray in a plane. Both charts and all physical sizes
reuse the same 512 Ãƒâ€” 512 RGBA8 table (1 MiB CPU data, cached once per page).
Its two 16-bit channel pairs store transmitted and turning branches.

For conserved normalized angular momentum `b`, angular motion obeys
`dphi/dl = b / ((1+lÃ‚Â²) sqrt(1-bÃ‚Â²/(1+lÃ‚Â²)))` on an outward branch. Substitutions
`l = sqrt(1-bÃ‚Â²) sinh(u)` for transmitted rays and
`l = sqrt(bÃ‚Â²-1) cosh(u)` for turning rays remove the radial square-root endpoint.
The table stores their cumulative integrals, not merely an asymptotic sky warp.
A logarithmic impact-parameter coordinate concentrates samples near `b=1`.
Both `skybox.js` and the geometry compositor use the same GLSL mapping.
Inside the integration-entry sphere, inward and outward initial rays are both
traced. Outward rays start on the escaping branch and remain in their current
chart; curvature must not be disabled immediately after emergence.

This follows the analytic-geodesic/precomputation approach discussed by
[MÃƒÂ¼ller, Exact geometric optics in a MorrisÃ¢â‚¬â€œThorne wormhole spacetime (2008)](https://journals.aps.org/prd/abstract/10.1103/PhysRevD.77.044043)
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

`experiments/ellis-renderer.js` uses two 3 Ãƒâ€” 2 atlases of 384 px cube faces, each
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
travel by a proper half-turn around the crossing radial axis (`2nnÃ¡Âµâ‚¬ - I`).
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
means 100Ã¢â‚¬â€œ150 m. The physical throat clips it sooner when nearer. Distant bolts,
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

A live eight-second firing sample at 1920Ãƒâ€”1080 on the RTX 3070 Ti averaged
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
but reproduced the floating rectangles. All runs used 1920Ãƒâ€”1080 backing size,
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
 each completed 240 frames at 1920Ã—1080 with zero context losses. These are
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
exposes 44â€“57 px object-patch probe errors and a visible shape change; the full
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
by default. Three concentric layers span approximately 300â€“600 m around each
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

The initial five-layer matched 1920x1080 GPU check added roughly 0.55â€“0.82 ms of sky
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
`drÂ²/(1-q(r)/rÂ²) + rÂ² dÎ©Â²`, with r measured in throat radii. The table integrand
is multiplied by `sqrt((rÂ²-1)/(rÂ²-q(r)))`; the factor is 1 in the inner region.
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
  speed is 1/100 of 70 m/s and playback sweeps 550â€“650 m. Visually inspected
  tangent views at 599.99 and 600.01 m in both charts without a visible snap.

This resolves the demonstrated outer sky cutoff. Depth-shell sampling misses,
object-patch branch switching and fast landmark motion near the critical ring
remain separate issues; this change does not establish their continuity.
Historical rendering/performance captures above predate this optical profile.

### Capital performance pass (2026-10-24)

Measured the actual Ellis flight renderer at a frozen 31-second patrol pose
(region 0, center `[0, -2420, 1550]` metres, heading `-pi/2`), with the initial
mission camera and fighter snapshot. Asset revision: `857eb4969b70`. The visible
stern and engines were inspected before/after batching; a near hull pose at 28 s
and a destination-chart pose at 35 s were also inspected. The latter does not
establish visual continuity for a hull spanning the throat; that remains unresolved.

The foreground in-app browser used 902 x 939 CSS pixels, DPR 1.5, 1353 x 1409
main backing resolution, 100% render scale, production materials and default
Ellis effects/lattice. No tests or asset rebuilds ran during these measurements.
Each comparison froze simulation and used OFF/ON/ON/OFF blocks with 20 warm-up
and 90 recorded frames per block. The capital pose was pre-stepped using the
production patrol and then held fixed in a temporary copy of the flight page.

| Metric | Before batching | After batching |
| --- | --- | --- |
| Total ON draws | 405 | 117 |
| Total OFF draws | 96 | 96 |
| Total ON triangles | 1,309,783 | 1,309,783 |
| Total OFF triangles | 1,177,027 | 1,177,027 |
| ON CPU median / p95 | 5.0 / 5.9 ms | 2.2 / 2.6 ms |
| OFF CPU median / p95 | 1.9 / 2.3 ms | 1.8 / 2.5 ms |
| ON frame median / p95 | 26.6 / 40.1 ms | 26.7 / 53.3 ms |
| OFF frame median / p95 | 13.3 / 13.4 ms | 13.3 / 26.7 ms |

This resolves the demonstrated submission overhead without reducing geometry or
resolution. It does **not** establish improved browser cadence or GPU execution:
frame timing remained uneven, and no GPU timer was used. This fixed close-up
comparison excludes live combat update cost. Automated checks cover repeated
outbound/return crossings, turnarounds, region ownership, pause/reset, retained
triangle count, material grouping, metre-scale length and immutable buffer reuse.

## Nearby contact readability and moon-edge filtering

Nearby same-chart geometry now uses a local visual frame: full ordinary shape
through 100 m, smoothly blended toward the optical representation from 100 to
200 m. The full depth-shell compositor restores the ordinary foreground image
and suppresses its nearby atlas copies. Object patches and HUD contact markers
use the corresponding CPU primary-image direction. The ballistic lead cue
retains its firing-direction projection. Cross-chart targets never receive the
local bypass. To preserve chart-crossing continuity, the local approximation
fades to zero as either endpoint approaches the 300 m throat, over 330â€“300 m
areal radius. Very close to the throat, depth-shell misses and secondary images
can therefore still occur; this is not a complete near-throat geometry solution.

The observation lab's **Near ship** camera selects a reproducible 42 m contact
(12 m lateral, 40 m forward). It was visually inspected in full ray-search and
object-patch modes with the Bob mesh; both show one intact nearby ship. Tests
cover both chart identities, remote isolation, 100/200 m blending, the existing
antipodal primary-image limit, ordinary geometry restoration and HUD projection.

For lensed moon silhouettes, the sky renderer now measures the final bent-ray
screen footprint outside destination branches (when OES_standard_derivatives is
available). Analytic moon coverage uses this bounded footprint, and stretched
Rime disk edges receive four-tap reconstruction. Unlensed skies retain their
ordinary footprint; unsupported contexts keep the previous sampling. This is
an aliasing mitigation, not a change to the optical paths. A Rime-side 380 m,
oblique-inward sky-only view was inspected. The user's exact jagged-angle pose
was not captured as a replay, so its artifact is not yet visually closed out.

## Readable fighter images across the chase range

The near-field blend did not prevent ships outside its band from turning into
large distorted shapes. The default Ellis presentation now separates fighters,
wrecks, their scorch geometry and engine images by craft and renders one rigid
hull at the primary optical image position. Vertex offsets retain lengths and
angles at all ranges; no affine stretch or depth-shell reconstruction is applied
to these ships. Across charts, a half-turn about the target's radial axis
transports the transverse frame so the rigid-image approximation does not add
a hull flip at a radial throat crossing. The sky remains fully lensed.

In full/adaptive geometry modes these craft are excluded from the primary and
mouth-capture passes and drawn once after background composition, with ordinary
ship-to-ship depth. Object-patch mode uses the same rigid ship rule. This is an
explicit gameplay approximation: the late ship pass does not inherit reconstructed
background depth, so static lensed geometry can be incorrectly occluded by a
fighter. It does not model optical hull magnification, shear or secondary images.
An unsolved remote primary path can still hide an image. `bridgeShips=warped`
restores the previous ship rendering for controlled comparison. NPC targeting,
projectile trajectories, region ownership and physical hull dimensions are
unchanged. Other large/static scene meshes retain their existing renderer.

The observation lab's **Pursuit** camera follows a crossing craft 1.5 seconds
behind. The leader crosses at 3 and 15 seconds; the observer at 4.5 and 16.5.
Tests assert one ship submission (no captured copies) and orthonormal vertex
transforms at near/far ranges, in both charts and full/object rendering modes.
The pursuit fixture checks the intervals where leader and observer occupy
opposite charts. This replaces the distance-limited readability workaround as
the default fighter shape policy; the primary-image position still uses its
existing smooth optical/local direction mapping.


## Capital hull dropout at the throat

The unarmed Aegis patrol was not tagged as a complete ship image, so it still
entered the sparse radial depth-shell reconstruction. The side-camera lab view
at 5.99 / 6.01 s reproduces the missing hull with `bridgeShips=warped`, despite
submission of its geometry to the captures. This is a visibility reconstruction
failure, not evidence that continuous distortion of a mesh is impossible.

The patrol now supplies a shared image center and a conservative radius computed
once from its existing mesh buffers. All seven material batches use one primary
optical path and draw their complete triangles once, like the fighters. Existing
material batching, shared buffers, metre scale and unarmed behavior are retained.
The patrol transports its transverse hull basis when it changes charts; the
renderer undoes that transport about the target radius, rather than the observer
radius. Off-axis views otherwise introduced a visible orientation flip.

Choose **Aegis crossing** in the observation lab and scrub through 6 s. The
regression uses the actual patrol and authored asset in both full/object routes,
checking every material and vertex before/after crossing, one shared path, and
continuous hull orientation from the side camera. Patrol tests cover repeated
crossings, turnarounds, reset and immutable buffers. This remains the same rigid
image approximation and background occlusion limitation described above.

`node tools/prepare-ellis-capital.cjs` generates a frozen observation-scene
benchmark at `output/ellis-capital-benchmark.html`. It alternates asset off/on/on/off
with 20 warmup and 60 recorded frames per block. It instruments actual Three
render submissions rather than the scene's estimated capture multiplier.


Measured 2026-10-24 with the asset SHA-256
`857eb4969b70b418f32635920c188f07e38c6b12f25cd13b87472c9ebeeee607`,
side camera, 5.99 s, full geometry, grid off, no AI/projectiles, scale 1,
1280 x 720 layout, DPR 1.5 (1920 x 1080 scene/sky backing). Only the measured
tab was active; no tests ran during sampling. Corrected asset OFF/ON CPU
submission median/p95 was 0.50/0.70 and 0.70/0.90 ms respectively; frame cadence
was 13.30/13.40 ms in both. Geometry update median/p95 was 0.00/0.10 ms at the
browser timer precision. Actual totals were 3 draws / 4 triangles without the
asset and 10 draws / 44,256 triangles with it: seven material draws and all
44,252 hull triangles once. The old reconstruction submitted 17 draws / 88,508
triangles with CPU 0.70/0.90 ms and frame 13.30/13.50 ms, but the hull was missing
in its final image. That baseline is not an equivalent-image speedup comparison.
No GPU execution timer or gameplay AI cost was measured. Raw output is in
`output/ellis-capital-performance.txt`.

Visually checked side view at 5.99 and 6.01 s, above at 6.01 s, and Rime rear
view at 5.99 and 6.01 s. These retain solid hull geometry; perspective size can
still change quickly near the throat with the current patrol trajectory and
primary-path distance. This change addresses dropped hull surfaces, not all
optical position/size continuity or correct clipping of a hull straddling charts.


## Ship pose and surface continuity follow-up

Off-axis pursuit exposed three independent problems in the finite-source ship
path. Turning rays were assigned an outward observer tangent whenever the target
radius exceeded the observer radius, even though the ray first travels inward.
Crossing equal radii could therefore flip the viewing direction abruptly (the
250 m lateral / 500 m target-radius probe jumped about 25 degrees). Finite direct
segments also subtracted large quantized integrals near critical impact, creating
small gaps and false branches. They now integrate only the finite segment, using
24 midpoint samples in the regularized u coordinate. Turning/transmitted paths
retain the shared table. The renderer no longer falls back to the ordinary pose
when an optical center is behind the camera: it retains that center and lets
near-plane clipping determine visibility.

The finite-source solver now returns the optical tangent at both endpoints.
Rigid hulls are transported by the rotation between the source tangent and the
observer tangent, including antipodal frame transport. This preserves hull lengths
and angles while allowing orientation to follow a curved viewing path. The old
rigid rule moved the center without rotating the hull with the light path. This
is still a primary-image approximation: some oblique appearance is legitimate,
and magnification/shear, caustic image multiplicity and background depth remain
approximate. No temporal smoothing or change to simulation positions is added.

Focused tests sweep 100/250/400 m lateral pursuit offsets, including equal-radius,
critical-impact and flat-exterior transitions, and check reversed-path source
tangents. Renderer tests check endpoint-tangent alignment, every capital material,
antipodal pose continuity and behind-camera ownership. The lab adds **Offset
pursuit**; `bridgeScenery=1` retains the actual local asteroid for surface checks.

Radial captures used nearest depth texels as a stair-stepped surface, producing
comb-like contours after strong lensing. Shell depths now use explicit bilinear
reconstruction within coherent occupied surface patches, with nearest fallback
at silhouettes and separated depth layers. Empty capture pixels cannot establish
a false surface crossing. `bridgeDepth=nearest` retains the old rule for A/B.
`node tools/prepare-ellis-surface.cjs` builds a WebGL2 regression using the actual
production shellDepth GLSL on an independently defined tilted plane. It measured
mean surface-depth error 57.0 mm with nearest sampling versus 7.7 mm reconstructed
(maximum 160.8 vs 31.4 mm, including float-depth and byte readback precision).
Its empty-pixel guard test is exact. The above-camera asteroid view at 5.8 s was
visually compared; edge stipple is reduced, although highly stretched silhouettes
and surfaces hidden from the mouth captures remain limitations.


The final surface path retains cheap nearest-depth coarse bracketing and uses
continuous reconstruction for hit refinement/validation. The performance pass
kept the same source asset revision, 1280 x 720 layout / DPR 1.5, scale 1, grid
off, frozen scene and ABBA warmup/sample conditions as the capital pass above.
The side-camera ship-only scene measured CPU OFF 0.60/0.80 ms, ON 0.90/1.20 ms
(median/p95), frame OFF 13.30/13.40 ms, ON 13.30/13.50 ms. Counts remain
3 / 10 draws and 4 / 44,256 triangles: no extra hull buffers or mesh complexity.
The previous matched pass was CPU ON 0.70/0.90 ms, frame 13.30/13.40 ms. This is
an added CPU cost for stable finite-segment inversion and optical orientation,
not a speedup. Geometry-update time remained 0.00/0.10 ms at timer resolution.

With the actual asteroid retained, the above-camera scene at 5.99 s measured
nearest-depth OFF/ON CPU 0.80/1.10 and 1.00/1.20 ms; frame 13.30/13.40 and
13.30/13.70 ms. Reconstructed depth had the same CPU medians/p95 and frame
medians, but the asset-ON frame p95 rose to 26.60 ms. Actual counts were identical
(OFF 27 draws / 698,154 triangles; ON 34 / 742,406). Restricting filtering to hit
refinement did not improve that measured tail. This is a known shader/cadence
cost in a strongly stretched view, not evidence of spare GPU budget; GPU
execution was not timed separately. Raw measurements are in
`output/ellis-pose-performance.txt` and `output/ellis-surface-performance.txt`.

Visual inspection covered the radial capital at lab time 12 s (rear face aligned
with the image), offset pursuit at 3.01 s, and the above-camera asteroid at
5.8 s. The user's exact live chase was not recorded as a deterministic replay;
these controlled poses and numerical sweeps provide the present acceptance scope.

The off-axis observer crossing regression additionally compares all nine optical
orientation coefficients and the three image-center components at 4.5 s and
16.5 s, immediately before/after the camera changes charts. Both directions
remain continuous without an ordinary-pose fallback.


## Actionable lead near the throat

Ship images, firing directions and live bolts share the compact Ellis optical
metric. `flightGuns.ballisticPath` now delegates to `ellisOptics.primary`, returning
its direction and arc distance in scene units. A stationary target's visible image
supplies its firing bearing, including across the throat. The former straight
per-chart projectile inverse is no longer used.

`ellisOptics.ray` and `advanceRay` use metres. Each bolt stores signed proper
radial coordinate l, local radial velocity p, conserved impact b and angular
phase. With r^2=1+l^2 and shared compact radial scale A, RK4 integrates
`dl/ds=p/A`, `dp/ds=b^2*l/(A*r^4)`, `dphi/ds=b/r^2`. Curved collision segments
are at most six metres long. Throat crossings are refined and split into
chart-local segments; the 12 km storage translation never becomes a collision
sweep. Outside the compact field, motion is straight. Speed is optical arc length
per second; bolts are unguided and receive no target data after emission.

Rigid ships no longer use the nearby straight-image blend. Finite-source optics
already approach locally straight rays at small separation. Scenery's local
ordinary/depth-shell composition is separate. Arc lengths use split Simpson
integration in the compact core and an analytic flat tail, avoiding the former
coarse flight-time error.

Target prediction still advances the current ship velocity through antipodal
craft transport (`crossBridge`, `bridgeVector`, `bridgeTravel`). Those helpers no
longer advance live Ellis bolts. Shooter velocity is not inherited. `lead` solves
optical travel time within weapon lifetime, including target transit events;
it returns FiringSolution or null. The bounded fast iteration retains exhaustive
fallback. Invalid/expired solutions have no pip; friendlies have no damaging cue.

Convergence uses only the selected solution's RANGE on the curved crosshair ray.
Each muzzle accounts for its lateral anchor and routes to that common point;
there is no target-direction snapping or homing. Off-pip shots miss. Automatic
acquisition uses the primary image's apparent hull bound.

Bolt/impact artwork uses the same optical image and source tangent frame, then
batches both charts into four team/color groups in observer space. Its explicit
`projected` draw flag excludes it from captures and a second warp/fade. The full
renderer submits this overlay once after rigid ships, retaining ship depth tests
and additive blending. Scenery occlusion of the overlay remains approximate;
actual projectile collision still stops rounds on physical terrain/hulls. Engines
retain their existing treatment.
`training.firingSolution` supplies the same solution to HUD and convergence.
The optional afterMovement hook on training.step/stepControlled lets the session
transport all craft before Ellis gun collision queries. Non-Ellis NPC ordering is
unchanged. Collision indices refresh after a transit.

Locks/cycling may span both charts in Ellis. Physical collision eligibility remains
region-specific on each leg; merely sharing storage coordinates cannot cause a
cross-chart hit. Displayed target range follows the physical route rather than
the 12 km storage translation. Radar remains local-chart. A lead prediction cannot
foresee a subsequent new maneuver or guarantee clearance against future moving
cover; it is an instantaneous firing solution, not a promised future hit.

`tests/ellis-ballistics.cjs` checks an independent metre-space transit oracle,
near-throat moving-target intercepts in both charts, lifetime/unreachable rejection,
real-session pip-to-damage with multiple muzzles, source/exit collision ordering,
moving shooters, target crossings during flight, and off-pip misses. Held yaw,
pitch and roll trials use the production flight model next to the throat and
confirm damage while both participants maneuver. HUD tests check that cross-chart
lead projects onto the crosshair and invalid solutions draw no pip.
`node tools/prepare-ellis-aim.cjs` builds `output/ellis-aim-study.html`: a controlled
real scene/HUD/session with Aim at pip, Fire, Off-pip test, both chart directions,
and target-transit/muzzle-straddle cases. Camera alignment is a test control only.

Browser validation of the aiming fixture produced four actual hits from four
bolts for the moving remote target, target transit, and muzzle-straddling cases;
the off-pip control produced zero hits. Focused headless checks also exercise
authored hull triangles and real gun-bank anchors. The old straight-chart cue
misses the crossing-target negative control by 36.4 m; the corrected volley hits.

### Combat performance follow-up (earlier straight-shot implementation)

Readable ships had inadvertently enabled per-bolt/per-impact effect batches in
full geometry mode. Their `lensCenter` did not make these effects rigid ship
patches (they have no positive `lensRadius`); they still used the same additive
pass. Batch them by chart and team/color again. Per-craft engine centers and
rigid hull placement stay independent; `bridgeGeometry=objects` retains its
individual effect optical centers. `tests/ellis-effects.cjs` runs the production
presentation with 160 bolts and 12 impacts: eight nonempty effect batches,
identical vertices, colors and chart membership, and 172 individual batches in
the explicit object experiment.

The lead solver now first tries a bounded fixed-point flight-time solve when
target speed is below 45% of bolt speed. Candidates use the same physical
endpoint validation, with less than 1 mm flight-distance error. Unreachable
intermediate routes, fast targets and failed convergence retain the exhaustive
search. There is no temporal cache or reduced HUD update rate. The existing
independent transit and actual gun-hit checks pass, including added fast-target
fallback cases.

Reproduce the browser measurements with:

```
node tools/prepare-ellis-aim.cjs
node tools/prepare-ellis-aim-performance.cjs
node tools/prepare-ellis-effects-performance.cjs
```

Open `output/ellis-aim-performance.html` and click Measure aiming. On the local
RTX 3070 Ti desktop, 2,000 calls/block in exhaustive/fast/fast/exhaustive order
measured 0.2181 versus 0.038625 ms/call (5.65x). Across 300 moving target cases,
maximum launch-direction vector difference was 4.45e-7 and flight-time
difference 2.22 microseconds.

Open `output/ellis-effects-performance.html?mission=ellis&bridgeGrid=0` and
click Compare effect batching. The exact same frozen 160-bolt scene alternates
individual/batched/batched/individual, with 20 warmup + 60 measured frames per
block. At 1280x720 CSS pixels, DPR 1.5, total scene draw calls fell from 485 to 14;
CPU median/p95 fell from 6.2/7.8 to 3.1/3.5 ms. Frame median remained 14.6 ms
and p95 15.1 ms in both modes: this is measured CPU savings, not a demonstrated
FPS doubling. The default grid, sky optics, shell quality, ship motion and
projectile physics are unchanged. The real on-pip browser volley still produced
four hits from four bolts after optimization.

## Shared optical gunfire validation

The shared metric above supersedes earlier independent ballistic-image policies
and straight-shot timing measurements. Tests now check image inversion against
forward live rays, independent craft transit predictions, pip-to-hit against real
hull triangles, automatic visible-image acquisition, stationary visible-hull shots
nearby/across charts in both directions, moving targets, simultaneous maneuvers,
off-pip misses and lifetime rejection. Conserved-energy and reverse-path checks
cover transmitted/turning rays. Production submission tests verify one projected
effect overlay, no capture/double warp, and cleared pooled draws. Existing rigid
ship position/orientation continuity checks pass.

`node tools/prepare-ellis-aim.cjs` adds Stationary visible-image shot. In-browser,
the authored remote hull took one hit from one emitted bolt; the moving remote
case took four hits from four bolts, and the off-pip control took zero hits.
These use the real HUD, session, anchors, collision and damage callbacks.

`node tools/prepare-ellis-curved-performance.cjs` builds the 160-live-bolt stress
fixture. Click Measure 160 curved bolts. Local RTX 3070 Ti, 1280x720 CSS / DPR 1.5,
20 warmup + 80 samples: motion median/p95 0.3/0.5 ms (collision callback work
excluded), render+HUD 4.8/5.8 ms, frame 13.3/13.4 ms, 15 scene draw calls; all 160
bolts remained active. This is a bounded scene measurement, not a universal
hardware budget. Current-motion leads cannot predict later jinks or moving cover.

## Growth study

`experiments/ellis-growth.html` animates a 1 micrometre throat diameter to
50 m with stationary cameras 100 m from each centre. It opens paused at 50 m.
Play, restart, scrub, loop, or compare logarithmic/linear growth over 8/16/30 s.
The side selector switches between the asteroid and Rime skies.

Five simple solid fixtures exercise foreground occlusion, local geometry behind
the mouth and remote geometry. They use the production Three scene and full
Ellis geometry ray search, with all six capture faces refreshed each frame.
These are small diagnostic meshes, not ship assets. Objects and cameras keep
fixed physical sizes/positions while the reference coordinates scale by
`300 / animatedRadius` about their own chart centres. The ruler marks a 50 m
span at centre depth. Below 0.2 m diameter, only local straight geometry is drawn
to avoid enormous coordinates; the sky continues to use the microscopic radius.
That cutoff is an approximation and can introduce a small geometry discontinuity.

The study mounts the production `flightHud` with a real `flightSession` snapshot.
Fixture cubes are registered craft/models, so contacts, target status, live target
preview, radar, reticle and firing pip use the same code as flight. Tab calls
`training.cycle`, L calls `toggleTargetLock`, and V cycles the real radar range.
There is no separately drawn study HUD. The flight HUD accepts optional
`HudView.distanceScale` (default 1) to convert normalized presentation distances
back to physical metres for contact/target ranges and radar. The study scales
weapon speed into the same reference coordinates for its stationary-target
firing solution. It does not advance combat or fire shots. Below the tiny-throat
geometry cutoff it supplies ordinary training-mode contacts to avoid applying
a 300 m reference lens to unscaled local positions.

This is a sequence of static optical solutions, not a time-dependent metric or
physical formation model. It does not alter flight transport or combat.
Visual checks cover both ends at 50 m, the asteroid end at 25 m, and the
microscopic readout/local-only path. Inspected sky, rear arcs, remote beacons,
fixed foreground and production HUD. Also checked real Tab target cycling,
L lock, V radar change, physical 26 m foreground range, and a valid remote firing
solution. Live gunfire remains outside this study.


## Near-throat frame-time investigation (2026-10-25)

See the [hitch investigation](benchmarks/ellis-hitches-2026-10-25.md) for the live
reproduction, CPU/GPU stage measurements, finite-segment optimization and remaining
limits. The benchmark now preserves instrumentation across asset refresh, records
full-frame CPU tails and bolt counts, and reports the twelve worst CPU frames.
The report also explains how to use the existing live CPU-stage overlay.


### Repeatable approximation stress cases

The observation lab Pass selector includes three single-fighter, 24-second loops:

- `pass=axis-sweep`: a remote-chart fighter sweeps +/-30 m across the front/detail
  camera optical axis, crossing alignment at 0 and 12 seconds.
- `pass=throat-orbit`: a local fighter circles at chart radius 330 m, 30 m
  outside the throat, heading tangent to the path.
- `pass=tumble`: a remote fighter holds its center while changing heading and
  roll, isolating orientation-dependent silhouette failures.

Use Throat detail (`camera=detail`) for a resolved fighter image: the camera is
15 m outside the throat and the remote source is near the opposite mouth.
Stress cases default to this camera when the URL omits `camera`.
Combine these with the fixed cameras. Pause, enter an exact time, step frames,
and slow playback to compare failures. Geometry distinguishes the rigid hull
baseline from the original single affine patch
(`bridgeGeometry=objects&bridgeShips=warped`). Switching geometry preserves time,
camera, pass, ship, speed, lattice and playback state. Full ray search remains
an existing renderer comparison, not ground truth for all image branches;
its readable-ship policy still uses rigid hulls.

Example: `experiments/ellis-study.html?pass=axis-sweep&camera=front&time=3&paused=1&bridgeGeometry=objects&bridgeShips=warped`.

These fixtures establish a baseline for subsequent connected-patch experiments.
They do not add subdivision or additional optical images, or establish visual
continuity. The displayed affine error measures one probe, not a hull-wide bound.
The axis sweep crosses the transmitted radial image; it is not an axial-caustic
branch discovery test.


### Combat-shaped pursuit fixtures and numerical baseline

The observation lab includes `pass=dogfight` and `pass=dogfight-crossing`.
The corresponding Dogfight chase / Crossing chase cameras follow the leader by
0.7 seconds and aim at its primary optical bearing. Selecting either pass also
selects its chase camera; fixed cameras remain available for external views.
Both loops take two laps around the throat with vertical jinks. The crossing
variant oscillates in signed proper radius, changing charts at 6 and 18 seconds;
the camera crosses at 6.7 and 18.7 seconds. Chart radii stay between 300 and 350 m,
inside the 600 m lensing volume. These are scripted rendering fixtures, not
flight-dynamics, AI, weapons or aiming acceptance tests. Keeping the optical
center in view deliberately isolates hull distortion from camera tracking loss.

Open `experiments/ellis-study.html?pass=dogfight-crossing&camera=dogfight-crossing&bridgeGeometry=objects&bridgeShips=warped`.

Run `node tools/measure-ellis-pursuit.cjs --out output/ellis-pursuit-metrics.json`
for an offline single-affine-patch baseline. It samples vertices and centroids
from 63 evenly spaced triangles of the real Bob fighter (252 samples per pose),
at 0.25-second intervals over each 24-second loop. It reproduces the current
4-metre finite-difference affine projection and compares it with direct primary
solves at those posed mesh samples. Pixel units use a 1920x1080 viewport and the
normal 45-degree vertical field of view. Samples are unweighted; this is not a
hull-wide error bound. Temporal measurements are residual changes per 0.25 s,
not per rendered frame. CPU time and solve counts cover the measurement itself,
including reference solves, not runtime rendering performance.

Initial baseline (26 October 2026):

| Path | Median error | 95th percentile | Maximum | Invalid samples |
| --- | --- | --- | --- | --- |
| Turning pursuit | 0.34 px | 3.08 px | 8.59 px | 0 / 24,192 |
| Crossing pursuit | 1.33 px | 187.21 px | 1,340.52 px | 0 / 24,192 |

After the chase-frame correction below, the crossing case has 146 reference samples outside the viewport; the error
statistics include them. Worst sampled error occurs at 17.5 s. Browser inspection
at 6.35 s also shows a strongly stretched strip in the affine renderer. This is
a recorded approximation failure, not an approved image. The headless regression
checks all 720 center poses at 30 Hz: primary solutions exist throughout, optical
range is 114-130 m, and there are 42 split-chart frames in the crossing case.
Neither check certifies raster coverage, secondary branches, or optical-solver
accuracy; full multi-patch convergence and image-space acceptance remain open.

Raw baseline: [JSON](benchmarks/ellis-pursuit-2026-10-26.json).


For an automated before/after check, run:

```
node tools/measure-ellis-pursuit.cjs --baseline docs/benchmarks/ellis-pursuit-2026-10-26.json --out output/ellis-pursuit-comparison.json
```

The command exits nonzero if missing/offscreen sample counts increase, or if
median, p95, maximum, or temporal residual error grows by more than the larger
of 0.05 px and 1% of baseline. It rejects incompatible model/viewport/sample/fixture-source
settings and excludes measurement CPU time from comparison. This prevents
regressions against a known failing baseline; passing does not approve that
baseline or establish a quality budget. Repeat runs are deterministic for the
error metrics. The full offline measurement is opt-in; the fast center-path
regressions run in the normal suite.


### Yo yo test: local physical-frame limit

Select **Yo yo / near throat** (`pass=yoyo`) or **Yo yo / on throat**
(`pass=yoyo-throat`) in the observation lab. The fixed observer has signed
proper radial position 120 m or exactly 0 m. A 3 m calibration square moves
radially inward and back over a 24-second loop, at proper separations 10-240 m;
the near-throat variant places the target in both charts during the loop.
An amber filled square uses the selected renderer. Amber corner dots are direct
point-solver projections; the dashed cyan square is ordinary perspective.
The readout's flat-reference error compares direct corner solves with cyan,
not the affine renderer with cyan. The separate existing single-probe error
still measures the renderer's affine approximation at one probe only.

Source-plane tangent axes are parallel transported along the radial center
trajectory. Corner placement integrates the intrinsic Ellis equations from that
source-centered physical frame using independent RK4 steps <=0.1 m, with at
least eight steps. It does not use the primary inverse or projectile integrator
to construct targets. All fixture points stay in the compact metric's unmodified
Ellis core. Thus chart-space stretching is not built into the reference square.
The small plane is represented by two triangles; its rasterized interior is not
an independently ray-traced reference.

Open `experiments/ellis-study.html?pass=yoyo&bridgeGeometry=objects&bridgeShips=warped&bridgeGrid=0`.

Run `node tools/measure-ellis-yoyo.cjs --out output/ellis-yoyo-metrics.json`.
The offline check uses observer proper radii 120, 10, 1, 0.1 and 0 m, and target distances
120, 30, 10, 3, 1, 0.3 and 0.1 m. It shrinks the square proportionally to distance
(half-width = 0.05 * distance) to retain a fixed angular footprint while taking
the local limit. It checks corner bearings and the exact radial center distance,
using a 1920x1080 viewport and 45-degree vertical FOV. The local acceptance check
at separations <=1 m is: no missing solutions, maximum corner error <0.05 px,
and center-distance error <0.005 m. This is a finite-scale engineering check,
not a proof of convergence or a requirement that distant targets look flat.

Add `--assert-local-flatness` to exit nonzero when any observer case fails.
The ordinary suite covers fixture geometry and near-throat convergence; it logs
the exact-neck diagnostic separately without declaring that optics accepted.

Initial result (26 October 2026): the 120 m and 10 m observers pass. At 0.1 m
separation their corner errors are about 0.000005 and 0.000011 px respectively.
The observer on or very close to the throat fails: error remains 7.66-7.85 px over
0.1-1 m separations. No corners are missing. The 0.1 m observer also fails the local threshold; the 1 m observer fails when
the target is exactly on the neck at 1 m separation, while its closer samples
converge. This is an unresolved direct-solver
local-limit issue, distinct from the single-affine-patch failure. No optical
solver repair is included in this fixture change.

The presentation API `setCalibration(batches)` submits optional transient study
batches alongside ships, without manufacturing a capital rig or changing world
state. Call it with an empty array to clear the calibration target.

Raw yo yo diagnostic: [JSON](benchmarks/ellis-yoyo-2026-10-26.json).


### Chase grid investigation: frame continuity and critical lookup range

The three latitude/longitude shells remain at approximately 300.03, 450.015 and
600 m areal radius in both charts. The chase study did not change their strength
or replace them with a planar grid. Near 6.7 and 18.7 s the observer is inside all
three shells in its own chart, looking nearly tangentially. The front fixture,
by contrast, views the volume from 900 m radius. Far-side shell images still use
wormhole paths; being inside local shells does not by itself validate those
images. The grid uses the sky shader, independently of ship affine patches.

The original chase frame used global Z as its up reference, then negated its
transverse axes at a chart crossing. Off the equator this caused a 13.2086-degree
roll jump. The corrected frame projects its up reference into the throat's
angular tangent plane and applies chart parity there. At +/-1 microsecond from
each observer crossing, the remaining axis mismatch after the chart half-turn
is at most 0.00431 degrees, dominated by the optical bearing; up mismatch is
about 0.000118 degrees. A normal-suite regression checks all three frame axes
at both crossings. This fixes a camera artifact, not the ship or sky optics.

Run `node tools/measure-ellis-lattice.cjs --baseline-camera 22d5a780 --out output/ellis-lattice-comparison.json`.
The diagnostic transcribes the grid shell intersections and compares packed
lookup phases with direct 2048/4096-step midpoint quadrature. It samples front,
rim and 18 chase poses using a 13x13 perspective ray grid, and includes explicit
critical probes so a camera sample cannot silently miss the table boundary.
This is a CPU check of intersection phases, not final GPU raster validation or
an independent proof of the full optical model.

Most sampled phase errors remain around 0.0003 rad. An initial camera sample
missed a much larger failure, exposed after correcting the camera roll: at
6.35 / 18.35 s, a ray with b=1.00000366124 has phase error 0.153941 rad (8.82
degrees) at the 600 m shell. Quadrature refinement changes the reference by
less than 0.000000125 rad. The ray is closer to the critical b=1 than the packed
table's nearest entry, b=1+exp(-12)=1.00000614421. The lookup clamps the impact
parameter coordinate while retaining u derived from the actual ray. This is a
range-limit problem visible even in CPU double precision, distinct from the
previous cancellation problem in differences of large finite-source integrals.
The affected grid copy is partially faded, not completely suppressed.

No grid/sky shader repair is included in this investigation. The strong grid
bending is therefore not visually accepted as wholly correct. The current
single-affine ship strip is also a recorded failure and cannot validate or
invalidate the independently rendered grid. Raw shell/frame measurements:
[JSON](benchmarks/ellis-lattice-chase-2026-10-26.json).

The pursuit baseline now records a fixture source hash and rejects comparisons
across fixture changes. The corrected roll changes rectangular-viewport clipping
(142 to 146 offscreen reference samples), while leaving the measured spatial
projection error statistics effectively unchanged. The baseline was regenerated
for the corrected frame; the old frame and data remain in commit 22d5a780.


### Automated mathematical invariants

`node tests/ellis-invariants.cjs` is part of the normal rendering test group.
It checks geometry and transport independently of screenshots:

- Rotate both endpoint offsets and directions about the chart centers (without
  rotating the 12 km storage translation). In 108 configurations across both
  charts, core, transition and exterior, primary existence, branch flags,
  observer/source directions and optical length must transform consistently.
  Direction covariance tolerance is 1e-8 in unit-vector distance; length
  covariance tolerance is 0.00001 m.
- Reverse each connecting path. Both endpoint tangent directions must reverse
  within 0.004 in unit-vector distance. Core endpoint lengths must agree within
  0.005 m. Exterior/transition length differences are measured separately below.
- Advance real rays 600 m in 3 m increments. Unit direction, intrinsic unit-speed
  energy, angular momentum reconstructed from public positions/directions and
  membership of the initial central plane must be preserved. Cases include both
  charts, transmitted/turning rays and the compact metric's flattening shell.
  Energy and momentum tolerances are 2e-6; plane residual tolerance is 1e-10.
- Reverse each forward ray from its endpoint and advance 600 m back. It must
  return to the starting chart within 0.02 m and recover the reversed launch
  direction within 0.0001 in unit-vector distance.
- Compare 48 intersections across all three grid shells with `tools/ellis-ray-oracle.cjs`, an independent
  proper-coordinate RK4 solver using the compact metric, no packed lookup and
  no production ray integrator. Intersections must be on their specified shell and
  match the oracle point within 0.005 m. Resolved lookup phases must agree within
  0.001 rad. The critical oracle must converge within 1e-8 rad when its step is
  halved. These finite tolerances are engineering checks, not proofs.

Measured initial worst errors: rotation 9.60e-15 in unit-vector distance,
ray energy 1.10e-11, angular momentum 5.49e-12, central-plane residual 4.84e-14,
forward/reverse return 0.00000263 m, and oracle shell-point error 0.00000244 m.
Resolved shell lookup phase error is at most 0.000267 rad on these fixtures.

Strict diagnostics deliberately preserve known failures:

```
node tests/ellis-invariants.cjs --strict --out output/ellis-invariants.json
node tools/measure-ellis-lattice.cjs --max-phase-error 0.001 --out output/ellis-lattice-validation.json
```

The first command exits nonzero for critical lookup error >=0.001 rad or any
inverse primary-path length asymmetry >=0.005 m. The second exits nonzero for
out-of-tolerance sampled shell phases or explicit unsuppressed critical probes.
The regular suite does not assert that these known failing optics are accepted.

Currently 20 inverse paths with exterior/transition endpoints exceed the strict
5 mm reciprocity limit, worst 0.29653 m. Their endpoint tangents pass. The two
solve directions use different finite-quadrature/analytic-tail routes; repairing
this asymmetry is separate from adding the checks. The independent ODE also
confirms the critical phase error of 0.153941 rad, so the earlier lookup finding
is not merely an artifact of comparing two versions of the same integral code.

Raw invariant measurements: [JSON](benchmarks/ellis-invariants-2026-10-26.json).
Screen-space grid intersections need not remain right angles under lensing;
these tests use intrinsic geometry, path conservation and symmetry instead.

### Analytic limits and far-side visibility

The invariant suite also checks 18 radial core paths against exact proper
radial distance, six exterior paths against Euclidean projection, and 12
chart-label exchanges. Eight radial distances exceed 2 mm and fail the strict
mode; exterior and chart-label checks pass. Raw errors are in the invariant JSON.

`node tests/ellis-visibility.cjs` checks the transmission cone independently
of skybox colors: a ray initially points inward and has conserved impact B<a.
It compares that classification with 56 forward-integrated rays and checks
112 opposite-chart finite-source endpoints. All agree, on both charts.

An extended synthetic hull uses the renderer's four-path affine construction
(4 m forward differences). At observer radii 330, 450 and 800 m, respectively,
1, 10 and 9 of 121 hull samples spill outside the transmission cone; individually
solved samples have zero spill. This is a pre-fragment geometric diagnostic,
not a raster/pixel-coverage acceptance test. It does not exercise fragment masks,
occlusion, antialiasing or the exact screenshot's mesh. Rigid presentation and
shader clipping need a rendered identification-mask test before claiming zero
visible spill. The affine diagnostic is intentionally retained as a known failure:

```
node tests/ellis-visibility.cjs --strict --out output/ellis-visibility.json
```

Strict mode exits nonzero for any affine sample outside the transmission cone.
Raw measurements: [visibility JSON](benchmarks/ellis-visibility-2026-10-26.json).

Far-side hull visibility correction: readable rigid ships now use the existing
transmitted-aperture fragment mask whenever their chart differs from the camera,
in both full and object render routes. Same-chart readable ships retain their
unmasked local presentation. Production submission tests verify the material
mask and chart-dependent mode, including every material of the capital patrol.
This clips invalid hull spill; it does not repair the underlying affine shape
or establish pixel-perfect lensing inside the aperture.

Critical lookup correction: the impact-coordinate extent is now 16 while the
independent hyperbolic-coordinate extent stays 12. CPU and GLSL mappings both
cover |1-b| down to exp(-16), instead of clamping at exp(-12). Texture dimensions
and storage remain unchanged. The independent critical-shell error drops from
0.153941 rad to about 0.000064 rad; both branches through exp(-15) now have
mandatory 0.001 rad assertions. The sampled lattice diagnostic also passes its
0.001 rad gate. This does not establish accuracy arbitrarily close to b=1,
where finite table extent and float precision still limit resolution.
