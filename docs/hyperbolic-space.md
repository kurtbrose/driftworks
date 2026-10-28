# Hyperbolic space: 3D flight

Open `experiments/hyperbolic-flight.html`. This is a playable H³ flight experiment
using Driftworks' existing `scene3d`, textured fighter source meshes, arcade
flight dynamics, mouse-stick math, radar painter and explosion renderer. The
earlier `hyperbolic.html` remains a separate 2D experiment.

Twelve fighters fight continuously. Autopilot starts enabled; Take control
switches the player to arrows for pitch/yaw, Q/E roll, W/S throttle, Shift boost,
Space fire and X stop. Dragging the view steers with the existing virtual-stick
response. Tab cycles hostile markers, P/Esc pauses and R restarts. Changing
curvature resets the battle; changing the fighter selector changes artwork.
The cyan circle is the selected target's lead aiming pip: put the central gun
crosshair on it to intercept the target at its current velocity. It connects to
the target box with a dashed line and displays flight time. It disappears when
the target is dead, behind the camera, or unreachable within bolt lifetime.

The new simulation is isolated from the Euclidean flight session and the Ellis
bridge scenarios. It calls the real `arcade.step` in each craft's orthonormal
tangent frame, then applies its physical displacement as a hyperbolic exponential
map and parallel-transports the frame. The local rotation, velocity damping,
engine ramp and retail profile remain the production flight model. Combat AI,
reinforcement rules and collision are experiment-specific, not the production
threat director or authored hull collision.

## Metric and projection

Positions are unit future-timelike Lorentz four-vectors. Tangent right/up/back
vectors have norm +1 and are orthogonal to position under `diag(-1,1,1,1)`.
Physical distances are `R acosh(-<p,q>)`, with sectional curvature `-1/R²`.
Motion by `s` metres follows `cosh(s/R)p + sinh(s/R)v`. Tangent transport follows
the same boost. All objects are rebased into the player frame every 1/120 s;
Gram-Schmidt removes floating-point frame drift. These are spatial Lorentz
coordinates, not special-relativistic velocities or time dilation.

Unlike an Ellis wormhole's varying radial/angular geometry, this experiment has
constant negative sectional curvature in every direction and no throat or second
region. No Ellis optical lookup table is used. It retains the existing separation
of physical transport and optical projection.

The observer sees the spatial components of `R*q` after rebasing. Perspective
division therefore gives the exact center bearing. Small hulls use the spatial
components of their transported tangent basis as a local affine optical map.
This includes radial stretch and the transverse `R*sinh(d/R)` angular-distance
law without baking posed vertices every frame. It is a first-order small-hull
approximation, not a full nonlinear per-vertex or curved-surface ray tracer.
Authored metre scale, textures and model pivots are retained. Large capital ships
are deliberately not offered by this experiment. Lighting uses the existing
renderer rather than a curved-space light-transport solution.

Radar uses the logarithmic map, giving true local bearing, altitude and distance
on a linear 2.5 km scale. HUD markers and bolts use the same optical bearing as
the ship centers. The beacons are fixed intrinsic points. Stars at infinity are
null directions and are transformed by each player-frame boost. The 100 km
setting is a near-flat comparison, not exactly zero curvature.

## Combat and limits

Shots travel at 1,000 m/s along exact geodesics. Collision finds the closest point
on each finite projectile segment against 12 m fighter spheres. Targets are
sampled after their movement each tick; this is not exact moving-hull collision.
Five hits destroy a fighter; respawn takes three seconds. Allies cannot damage
one another. AI and the HUD share a geodesic intercept solver that extrapolates
the target's current tangent velocity and solves projectile travel time, including
the 16 m muzzle offset. Later acceleration and turning can still cause a miss.

Contacts beyond `min(2,800 m, 5R)` become fresh reinforcements near the player.
This bounds numerical separation and keeps the battle nearby; it is not a wall.
Beacons beyond 5R leave the finite test field. Trails, bolt streaks and impact
rings are schematic overlays without depth occlusion. There is no sound or
persistent save state. Hidden tabs stop simulation and measurement sampling.

## Verification

`node tests/hyperbolic-flight.cjs` loads the actual headless production runtime
and tests intrinsic distance, tangent transport, finite-segment hits, a minute
of combat at each curvature setting, and two minutes of manual boosted escape.
`Measure fleet cost` freezes the state and runs OFF/ON/ON/OFF comparisons with
30 warmup and 120 sampled frames per phase. It reports frame work on the CPU,
browser cadence and renderer draws/triangles; it does not measure GPU execution.
It uses the existing immutable `sourceDraw` buffers and GPU per-actor transforms.

Paused scenes now render only when invalidated by controls, model readiness,
viewport changes or target selection. Benchmarks continue to render their full
sampling sequence and restore the fleet afterward. Changing the scene, resizing,
or hiding the tab cancels a measurement instead of publishing mixed conditions.
The lifecycle regression is `node tests/hyperbolic-performance.cjs`.

Measured on 2026-10-27 with the initial paused 650 m-radius scene, V-1 Raptor,
target 5 and the lead pip visible: viewport 1280 × 720, DPR 1.5, backing
1920 × 1080, full render scale. OFF/ON/ON/OFF median CPU frame work was
1.20 / 2.70 / 2.00 / 1.30 ms; p95 was 7.60 / 9.00 / 8.90 / 7.90 ms.
Median cadence stayed 13.3 ms (p95 13.4 ms). The visible fleet submitted
11 draws and 47,674 triangles; OFF submitted zero. This is a frozen-scene
asset-cost comparison with 30 warmup and 120 sample frames per phase, not a
whole-game speedup or GPU timing. Existing immutable mesh reuse avoids a new
per-frame hull vertex bake; no additional asset optimization was indicated by
this measurement. Front/rear hulls and marker alignment were inspected in the
initial view and moving combat. Other model choices were not exhaustively
visually approved or benchmarked.
Loaded mesh revision: `concept-trio/meshes.js?v=5f1109282945`;
renderer revision: `scene3d.js?v=be72cb90b8e8`.

## Performance audit

The 3D feature was committed as `dc34df3f` before this audit. Its default startup
requested every catalog live/wreck texture: 32 files totaling 70,264,658 bytes.
The page now calls the shared loader with only the selected model ID. The
default Raptor pair totals 256,631 bytes; other pairs load when selected and
reuse the existing image cache. These are source file sizes, not measured
compressed network transfer or GPU memory. Shared mesh catalog scripts are
still loaded at startup. `shipPackModels.loadTextures(ids?)` retains full catalog
loading when no argument is supplied, so existing flight consumers keep their
readiness contract.

The simulation previously allocated fresh arrays for all star and trail vectors
on every 120 Hz tick, sorted candidate lists using repeated `acosh`, and built
temporary geodesic points for each projectile/craft test. It now rebases owned
star/trail vectors in place, selects the nearest opponent with a stable Lorentz
dot scan, and evaluates the identical swept-hit predicate directly in the
Lorentz product. Meshes, flight dynamics, curvature, targeting, hit radii and
projectile lifetime are unchanged. Independent swept-distance fixtures and
vector-reuse checks cover the hot-path changes.

Reproduce the CPU comparison with
`node tools/benchmark-hyperbolic.cjs --compare dc34df3f`. It alternates
BEFORE/AFTER/AFTER/BEFORE for combat and boosted escape at R=350 and R=650 m,
with three simulated warmup seconds and 15 sample seconds per run. Each sample
measures two 120 Hz ticks, corresponding to a 60 Hz simulation frame. Reports
include median/p95 time, peak bolts, shots, hits, scores and a final state digest.
The digest is a determinism check, not visual approval or a whole-game speedup.

Paired local results (mean of the two run medians/p95s, milliseconds per two
ticks; Node v24.21.0) were:

| Workload | Median before → after | p95 before → after |
| --- | --- | --- |
| 350 m combat | 1.74 → 1.05 | 2.47 → 1.60 |
| 350 m boosted escape | 2.01 → 1.24 | 2.86 → 1.78 |
| 650 m combat | 2.02 → 1.02 | 2.76 → 1.47 |
| 650 m boosted escape | 1.82 → 1.12 | 2.59 → 1.57 |

All paired runs retained identical final states, shot/hit counts and scores.
See [raw comparison data](benchmarks/hyperbolic-flight-2026-10-27.json).
These CPU-only results do not measure renderer or GPU speedups.

The post-fix foreground render check at viewport 1642 × 969, DPR 1.5, backing
2463 × 1454, Raptor, initial paused R=650 m scene and target 5 used the same
30-warmup/120-sample OFF/ON/ON/OFF sequence. Median CPU frame work was
2.00 / 3.20 / 3.00 / 1.70 ms and p95 2.50 / 3.90 / 3.70 / 2.30 ms.
Fleet ON submitted 10 draws / 43,340 triangles; cadence median/p95 remained
13.3 / 13.4 ms. This larger viewport differs from the earlier render study,
so it establishes current scene cost, not an overall before/after speedup.
Raptor and Bulldog selection, hull visibility and the aiming pip were checked
in the browser. The shared mesh catalogs and full-resolution rendering remain
startup/pixel costs worth revisiting for substantially larger fleets or displays.
