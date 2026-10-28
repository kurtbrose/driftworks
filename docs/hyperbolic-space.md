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
