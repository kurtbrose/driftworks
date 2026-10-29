# Hyperbolic flight in the production flight lab

Open `experiments/flight.html?mission=hyperbolic`. The index bookmark
`experiments/hyperbolic-flight.html` redirects there. The earlier
`hyperbolic.html` remains the independent 2D Asteroids study.

This mode uses the normal `flight.js`, `flightSession`, `training`, `flightGuns`,
`flightPresentation`, shield pass, HUD, controls, audio and comms. It uses the normal 16-NPC roster, native fighter
profiles, defenses, AI and weapons. Two armed 1,305 m carriers now fight each other and the opposing
fighters. Both replenish their living fighter complement from their hangars; retired launch
actors are pruned while wrecks keep their independent lifecycle.
The player starts in the friendly hangar; death immediately replaces only the
player's fighter there, with four seconds of launch protection. Carrier integrity,
NPCs, projectiles, kills and battle time persist. Normal ship, model and weapon
controls remain available. Settings selects curvature radius
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
Fighter hull/engine presentation uses transported local tangent frames. The battle carriers use finite axial geometry, original materials and independent
rotating turrets. Capital rounds, damage, destroyed components, hull contact and
hangar launches use that same curved placement. The clean `flyby=1` comparison
still uses unarmed stationary reference geometry. Other missions retain their
existing geometry.
No persistent RTS world/save schema or runtime network dependency is added.

## Finite capital hulls

The body uses axial Fermi coordinates about its longitudinal X geodesic.
For local authored coordinates (x,y,z), let rho=hypot(y,z), A(x) be the point
x metres along the centreline, and Y,Z be the normal axes parallel transported
along it. In dimensionless hyperboloid coordinates the placement is
`Q = cosh(rho/R) A(x) + sinh(rho/R) (y Y + z Z)/rho` (with its smooth axis limit).
Every section is the same normal-plane geometry carried along the axis: section
radii and every within-section pairwise distance are independent of x. In
particular, the ends do not get the additional transverse widening of the old
centre-based exponential map. The centreline remains 1,305 m long. All panels,
turrets and interior points use this one placement; no screen-space warp is added.

The existing unarmed Aegis bake merges fixed mounts into shared material batches.
Immutable triangles are adaptively split until all edges are at most 20 m,
including interpolated paint UVs, armor-normal UVs and baked lighting channels.
Both instances share the prepared buffers. Each frame supplies only the Lorentz
point and three tangent axes, re-expressed through the player's accumulated
isometry. The vertex shader evaluates the axial map; both production PBR
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

The default mission and clean flyby both use R=400 m. The current axial map
preserves cross-section geometry along the ship, not every Euclidean distance.
Its intrinsic metric is
`ds^2=cosh(rho/R)^2 dx^2+d rho^2+R^2 sinh(rho/R)^2 d theta^2`.
Thus longitudinal lengths off-axis scale by cosh(rho/R), and within-section
circumferential lengths scale by sinh(rho/R)/(rho/R). The local volume Jacobian
is the product of these two factors and does not depend on distance along the
ship. Remaining strain depends on hull thickness rather than ship length.
The renderer does not simulate elasticity, density, stress or material failure.
Translations within one fixed homogeneous hyperbolic space are isometries and
can move the mapped body without changing its internal distances or volume.


## Armed battle and respawn ownership

`hyperbolic-battle.js` adapts the existing armed Aegis asset and component-damage
rigs. The friendly centre is the canonical origin; the enemy centre is offset by
(0,900,300) m with opposite longitudinal orientation. The carriers are stationary;
24 articulated mounts per ship retain their pivots and immutable source buffers.
Each material first applies its model-local pivot/basis, then the shared body
Fermi map. Normals use the composed analytic Jacobian. No turret gets a separate
centre-based body placement.

The normal gun controller owns geodesic rounds, head radius, damage and lifetime.
Mount controllers solve metric leads and slew actual barrel directions; they do
not redirect already-fired shots. Heavy guns use 700 m/s, 20-damage rounds and
point defense uses 600 m/s, 3-damage rounds. Settled bursts and rest periods follow
the existing capital battle pattern. Disabled mounts stop new fire; fired rounds
remain live. Native Aegis hull/component boxes are queried through the inverse
Fermi map in geodesic intervals at most 10 m long. Read-only hit/aim probes never
apply damage; finalized impacts call the existing component damage resolver.

Private capital rounds and impacts are explicitly re-expressed when the player
chart changes. Point-only chart matrices are cached instead of transforming three
unneeded pose axes for each hull sweep. Analytic body tangents replace numerical
differentiation. Conservative centreline bounds reject unreachable hull queries.

`flightSession.respawn(pose)` replaces the controlled pose and gun bank and restores
its configured defenses. It preserves combat/world ownership, enemies, wrecks,
radio history, battle clocks and carrier state. The browser uses the friendly
asset's actual first hangar anchor and clears input; normal missions still pause
on death. This is separate from a mission reset. Initial launch and subsequent
player respawns share this path.

## Curved-space collision broad phase

The former curved-space query returned every participant. Grid/tree modes now
index conservative metric-ball AABBs in global Klein coordinates, where each
geodesic sweep is a straight segment. A local Klein hull radius a is enclosed
by an intrinsic ball R*atanh(a/R); this also encloses the fighter shield envelope.
The global Klein image is an ellipsoid. Its exact AABB, plus movement padding,
updates the existing spatial proxies. Projectile queries use a conservative
padded segment box; authored hull/shield tests still decide actual hits.

All capital gun updates share one `training.collisionBatch`, and explicit roster
and movement notifications keep proxies current. The legacy full scan remains
available for parity tests. Flat-space event-deadline/sleep reuse remains flat-only;
curved queries currently use the spatial tree/grid without those trajectory sleeps.
`tests/hyperbolic-collision.cjs` compares all indexed modes with full scan across
radii, authored hulls, shields, grazing shots, near/far coordinates and rebasing.
`tests/hyperbolic-battle.cjs` covers real damage, reinforcement and repeated
player-only respawns preserving the fight.
