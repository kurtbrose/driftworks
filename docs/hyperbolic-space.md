# Hyperbolic flight in the production flight lab

Open `experiments/flight.html?mission=hyperbolic`. The index bookmark
`experiments/hyperbolic-flight.html` redirects there. The earlier
`hyperbolic.html` remains the independent 2D Asteroids study.

This mode uses the normal `flight.js`, `flightSession`, `training`, `flightGuns`,
`flightPresentation`, shield pass, HUD, controls, audio and comms. Its open-space
furball uses the normal 16 NPC roster, ship profiles, weapons, defenses, AI
skills/decision timing, waves, destruction, wrecks and sortie-death behavior.
There is no separate cannon, forced-zero shield, hit-sphere replacement,
experiment AI or three-second respawn. Ship/model and weapon-bank controls are
the normal flight lab controls. Settings adds a curvature radius selector
(300 / 350 / 400 / 650 / 1800 / 100000 metres); changing it resets the sortie.

## Geometry boundary

`flight-hyperbolic.js` implements constant negative curvature on the Lorentz
hyperboloid. Positions use the Gans chart in scene units. Directions, velocities
and ship bases use a radially transported orthonormal gauge. Retail acceleration,
damping, throttle and rotation still run in `arcade.step`; its displacement and
frame transport are then mapped through the hyperbolic exponential map.

The shared AI retains its tactical state machine, skill-based position
observations, targeting, attack/break/evade/recover timing and flight inputs.
Spatial bearings, distances, goals, radio reports and observed-velocity transport
use the metric. Geodesic interception uses the selected native weapon's speed/lifetime
and authored gun anchors. The normal firing solution drives the normal aiming
pip. Convergence changes range along the gun ray, never snaps a shot to a target.

The native gun controller still owns muzzle count, convergence, cadence, damage,
bolt-head radius and lifetime. Existing bolts travel along geodesics. A
conservative global Klein-space rejection test precedes the normal authored
hull query in a target-local Klein chart. Geodesics are straight in that chart;
the existing triangle hierarchy, swept bolt head, impact/scorch coordinates and
damage resolver remain authoritative. A sphere only rejects distant candidates;
it never awards damage.

After each fixed tick an exact Lorentz isometry recentres the player. It also
transforms every craft, tactical goal, private AI observation, existing bolt,
impact, flash and wreck. This is a coordinate change, not a respawn or teleport
relative to other participants. The accumulated isometry remains available for
world-fixed grids and retained trajectory samples. The distant sky artwork is a
translation-invariant background: only the camera orientation controls sampling.
It is not a finite shell, and sustained afterburner travel cannot magnify it.
This background convention does not model observer-dependent magnification of
an ideal boundary texture. Gameplay space remains unbounded hyperbolic space.
The radar uses intrinsic logarithmic distance. The existing dot grid
and predicted trajectory guides use curved positions and transported frames.

Presentation retains immutable source meshes, GPU poses, materials, authored
scale/anchors and the production projectile, engine, shield and explosion
painters. Explosion randomness is cached by flash-event identity in presentation,
shared across camera views, so chart recentring cannot reshuffle an active blast.
The cache is weak and does not add render state to simulation flashes.
Fighter hull/engine presentation uses transported local tangent frames. Two
stationary, unarmed Aegis references now use finite-size geometry, at initial
intrinsic center ranges of approximately 0.90 km and 1.60 km. Each retains its
authored 1,305 m main hull and original materials, windows, engines and fixed
turrets. They are visual scenery: they do not fire, launch fighters, block flight
or receive projectile damage. Normal missions retain their existing geometry.
No persistent RTS world/save schema or runtime network dependency is added.

## Finite capital hulls

The body convention is a single Riemann normal-coordinate placement per ship:
`X(v) = P cosh(|v|/R) + lift(P,Bv) sinh(|v|/R)/|v|`, with consistent physical
units. Thus authored displacement from the center is intrinsic distance, and the
axial main hull remains 1,305 m from bow to stern. A Euclidean rigid solid cannot
preserve every pairwise distance in curved space; this explicit convention fixes
the hull at its center and maps its entire interior consistently. It is not a
screen-space bend or a different exponential map for each panel or turret.

The existing unarmed Aegis bake merges fixed mounts into shared material batches.
Immutable triangles are adaptively split until all edges are at most 20 m,
including interpolated paint UVs, armor-normal UVs and baked lighting channels.
Both instances share the prepared buffers. Each frame supplies only the Lorentz
point and three tangent axes, re-expressed through the player's accumulated
isometry. The vertex shader evaluates the exponential map; both production PBR
and custom interior materials use it. Surface normals and armor normal maps use
the cofactor of the exact position Jacobian. A conservative metric-ball bound
replaces flat-box culling for these batches, retaining near-plane intersections
and views from inside their bounds.

At the starting camera the nearer ship sits below/left, the farther above/right.
Compare Settings' 400 m default with 350 m and nearly-flat 100000 m. Transverse
angular size decreases much faster with range in negative curvature. Straight
geodesic features need not look like bananas; changes in apparent proportions,
size versus range and perspective during a flyby are the useful cues.

A more decisive motion cue is geodesic separation. Two craft initially 100 m
apart, with equal parallel-transported headings and constant local speeds, remain
100 m apart in flat space regardless of speed. At R=650 m, unsteered 70 m/s
flight separates them to 164 m after 10 s and 429 m after 20 s; at 150 m/s the
corresponding distances are 496 m and 2,688 m. These are intrinsic distances,
checked with `offset`/`path`. For this symmetric setup the exact separation is
`2 R asinh(sinh(d0/(2 R)) cosh(v t/R))`. Steering AI does not preserve those
initial conditions, so an ordinary furball is a poor direct demonstration.
Those physical gaps are not screen gaps. For a stationary observer at the starting
midpoint, the receding pair's angular separation is
`2 atan(sinh(d0/(2 R)) coth(v t/R))`. At 70 m/s and R=650 m this is 17.8 degrees
after 5 s, 11.1 after 10 s and 9.0 after 20 s, versus flat-space 16.3, 8.2 and
4.1 degrees. The initially parallel-transported geodesics approach distinct ideal
endpoints (8.8 degrees apart in this example), rather than one vanishing point.
Short encounters can still resemble ordinary perspective with unfamiliar speeds
or distances; intrinsic divergence alone does not establish perceptual salience.

`flightHyperbolic.createCapitals()` supplies the reference rig. The capital rig's
`geometry(camera?)` interface accepts the observer pose; flat rigs ignore it.
Batch `hyperbolicRadius` is in scene units and `hyperbolicFrame` is a column-major
4x4 matrix containing `(P, lift(right), lift(up), lift(back))`, in Lorentz
`(time,x,y,z)` order. Finite batches use already assembled body-local geometry;
their ordinary origin/basis/scale are not reapplied to that placement.

## Clean flyby and controlled fighter passes

Open `experiments/flight.html?mission=hyperbolic&flyby=1`, also linked from the
index. It autoplays one stationary, full-scale Aegis and ten identical Raptor
fighters against black at a 400 m curvature radius. There are no HUD numbers,
markers, grids or reticles. Space pauses/resumes; Esc opens the controls.

The strong-curvature camera starts from normal coordinates (-35, -100, 60) m
and travels a geodesic at 3 m/s with parallel-transported attitude. For radii
100 m and above, the wider reference pass uses (-350, -600, 170) m and 30 m/s.
The visible source-time segment is 8–22 seconds, with a fade at the loop reset.
The observer chart is an exact Lorentz boost, not a Euclidean translation.

Ten original-scale Raptor meshes occupy a five-column, two-row box beside the
capital. A common longitudinal Lorentz isometry preserves their mutual intrinsic
spacing. This is a formation-keeping path, not ten freely drifting geodesics;
noses follow the actual velocity tangent. At 30 m radius, the slots start at
(x, -65, +/-35) m with x=-50,-25,0,25,50, and the axial boost rate is 6/30 per
second. The wider reference uses 95 m column spacing, y=-120 m, z=+/-70 m and
70/R per second. Physical hull sizes are unchanged. There is no combat.

Foreground geometry has been audited against both angular-size and parallax
relations. For small transverse features at intrinsic range d, static H3 gives
`D_size=R*sinh(d/R)` and `D_parallax=R*tanh(d/R)` for a small sideways baseline
with parallel-transported attitude. Tests exercise the actual hull placement
frames after real session rebasing. An ignored browser probe additionally checks
rasterized marker positions through the unmodified production renderer, using
both raw and textured capital materials and the actual capital atlas: 18 cases,
maximum centroid residual 0.275 backing pixels against analytic ray bearings.

The ordinary flight sky intentionally remains translation-invariant. It is not
an ideal-boundary texture transported through H3. The flyby uses black specifically
to omit that convention as a conflicting depth cue; production environment
lighting/materials remain in use. `flightPresentation.mount` accepts an optional
`emptySky` flag in its environment argument for this purpose.

This demonstrates the foreground mapping and isolates visual relationships; it
does not establish that an uncalibrated viewer must recognize curvature. Moving
fighters add their own motion, and their small distant images can suppress the
cue. Perceptual salience must be judged from playback separately from the
mechanical/GPU checks.

## Verification

`node tests/hyperbolic-flight.cjs` compares native loadouts/defenses with the
normal furball and verifies production AI firing, shield damage/recharge and
sortie death. At four radii, actual native Raptor-anchor volleys hit a moving
Raptor hull when aimed on the pip; current-bearing negative controls miss.
`node tests/hyperbolic-performance.cjs` steps the real session at four radii and
checks finite positions, transported frames and existing projectile ownership.
`node tests/hyperbolic-capitals.cjs` checks shared tessellation, intrinsic scale,
the nearly-flat limit, actual-session chart invariance and conservative curved
culling. See [capital visual and performance checks](benchmarks/hyperbolic-capitals-2026-10-28.md).

`node tools/benchmark-hyperbolic.cjs` compares the conservative rejection test
with an exact unculled local-chart reference in ABBA order. It checks identical
final native-session state hashes. It measures CPU simulation work only. The
normal flight lab offers a frozen fleet ON/OFF render comparison; rendering,
CPU submission and browser cadence must be reported separately from GPU time.
Old measurements in `benchmarks/hyperbolic-flight-2026-10-27.json` belong to the
removed standalone prototype and do not describe this integration.

## Performance readiness: 2026-10-28

The paired headless reference/optimized/optimized/reference run used the real
17-craft session, R=650 m, seed 29, Ulysses/Subach HL-7, 2 s warm-up and 5 s
sampling, two 120 Hz ticks per sample. Player plot armor kept the workload alive;
it is benchmark configuration only. Median CPU work changed from 22.06 / 22.93
ms in the unculled reference blocks to 10.65 / 10.98 ms with conservative
rejection; p95 changed from 32.52 / 31.31 to 20.97 / 19.53 ms. All four final
native-session SHA-256 hashes are identical, with 545 native shots and 137 hits.
This isolates collision-query CPU cost; it is not a whole-game or GPU speedup.
The additional geodesic transport and aiming work still costs more than the
Euclidean mission. Source fingerprints are recorded alongside the timings.

The normal flight renderer's frozen fleet OFF/ON/ON/OFF comparison used mixed
native hulls, initial camera, R=650 m, 1280 × 720 CSS pixels, DPR 1.5 and
1920 × 1080 scene backing. Each block used 20 warm-up + 90 sample frames, with
simulation frozen and no concurrent tests. Fleet OFF measured CPU submission
median/p95 0.30 / 0.40 ms, 2 draws / 2 triangles; fleet ON measured 0.70 / 0.90
ms, 11 draws / 24,870 triangles. Browser frame median/p95 was 14.80 / 15.20 ms
OFF and 15.00 / 15.10 ms ON. The separate HUD and live simulation are outside
that render-only comparison; GPU execution was not timed. Existing immutable
source buffers/GPU poses and native culling remain in use. No source model,
material, metre scale or gun anchor was reduced to obtain those numbers.

See [raw native simulation comparison](benchmarks/hyperbolic-native-2026-10-28.json).

A brief live keyboard-mode combat pass retained the 60 FPS cap (16.6 ms/frame),
with reported average frame CPU 11.60 ms and frame p95 29.5 ms. This was a moving
camera with changing visible counts, so it is not the frozen fleet comparison.
It identifies simulation/HUD cost and occasional longer frames as the remaining
performance risk; refresh-limited FPS does not establish spare GPU budget.
Native weapon-bank switching, player/target shield meters, radar, geodesic pip,
curvature reset and pause were checked in the browser without console errors.


### Material interpretation of the capital mapping

The default mission and clean flyby now both use R=400 m. The normal exponential
map preserves centre-to-point radial distances and angles between initial radial
directions. It is not an isometry of the original Euclidean solid: at radial
distance r its transverse differential scale is sinh(r/R)/(r/R), and its volume
Jacobian is that factor squared. It therefore does not conserve authored material
volume or every internal beam length. The renderer models geometry, not elastic
strain, material density, stress or failure during a change of curvature.
Translations within one fixed homogeneous hyperbolic space are isometries and
can move the mapped body without changing its internal distances or volume.
