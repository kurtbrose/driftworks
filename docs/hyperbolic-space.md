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
(350 / 650 / 1800 / 100000 metres); changing it resets the sortie.

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
relative to other participants. Sky directions at infinity use the accumulated
isometry. The radar uses intrinsic logarithmic distance. The existing dot grid
and predicted trajectory guides use curved positions and transported frames.

Presentation retains immutable source meshes, GPU poses, materials, authored
scale/anchors and the production projectile, engine, shield and explosion
painters. Hull/engine presentation uses transported local tangent frames;
large objects would require a separate finite-size geometry study. This mode
is an open-space fighter encounter, not an asteroid-surface or capital-ship
curved-scenery implementation. Normal missions retain their existing geometry.
No persistent RTS world/save schema or runtime network dependency is added.

## Verification

`node tests/hyperbolic-flight.cjs` compares native loadouts/defenses with the
normal furball and verifies production AI firing, shield damage/recharge and
sortie death. At four radii, actual native Raptor-anchor volleys hit a moving
Raptor hull when aimed on the pip; current-bearing negative controls miss.
`node tests/hyperbolic-performance.cjs` steps the real session at four radii and
checks finite positions, transported frames and existing projectile ownership.

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
