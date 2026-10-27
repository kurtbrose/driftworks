# Local capital shield study

Open [Capital shield patches](../experiments/capital-shields.html) through the
ordinary static server. The index and fighter shield study link to it. This is
a rendering experiment on the original Aegis flight asset, with scripted incoming
fire. It does not add shield rules or damage to capital combat.

Gun hits propagate at 100 m/s, reach at most 36 m, and expire after 0.36 seconds.
The heavy-hit button uses 80 m and 0.65 seconds. A brief white/blue flash starts
each hit, followed by a smooth ring with five-metre width and rapid damping.
There is no idle tint or wave crossing the entire hull. Distortion is bounded
below two backing pixels by default, including overlapping hits.

## Baked envelope

`node tools/bake-shield-envelope.cjs` rebuilds
`assets/ships/aegis-kit/shield-envelope.js`; `--check` verifies it without writing.
The dependency-free baker reads the exact original `flight-rig.js` bytes and
records their SHA-256. Source prefix for this study: `19ff1c719d6f`.

The fit is a swept surface, not a voxel SDF. It takes 97 triangle/plane sections
along the ship's long axis, includes small features between sections, then
conservatively broadens and smooths the width/top/bottom profiles. Rounded
rectangular cross-sections close over recesses and hangar openings. The minimum
profile inflation parameter is 12 m; this is not an exact constant-distance
offset. Conservative section fitting leaves extra space around corners and
protrusions. Caps make one closed surface without tunnels.

The result has 6,208 triangles and 384 impact anchors. Each anchor has baked
conservative triangle lists for gun and heavy hits. Gun patches average 104
triangles (range 39–321). Geometry is uploaded lazily and reused as a wave ages;
there is no runtime clipping, remeshing or vertex deformation. Clicks select the
nearest visible anchor, rather than an exact shield raycast.

The automated check verifies that every original rest-pose hull, turret and
engine vertex is enclosed. Original mesh bytes, colours, normals, metre scale,
pivots and collision geometry remain unchanged. The study uses the existing
unarmed/static batching path, retaining the weapons at rest. Animated turret
clearance and moving capital transforms are not validated for this envelope.
Wire mode exposes the fit; the bridge/engine shoulders remain deliberately coarse.

## Rendering paths

- **Glow:** render the source scene normally, then add local patches directly.
  No scene capture, disturbance texture or sky upload is needed.
- **Refraction:** render the source scene once into a shared full-resolution,
  four-sample MSAA RGBA8 target with depth. Local patches accumulate signed
  displacement, ring brightness and flash into a shared half-resolution RGBA16F
  target. A single full-screen resolve samples the full-resolution hull/weapon
  image and sky. Contributions overlap additively; the field is not a physical
  wave simulation. No bloom pass is added.
- **Whole-envelope reference:** use the same kernels and impacts but submit
  the entire envelope for each hit. This isolates the benefit of local geometry.
- **Wire:** inspect the entire fitted envelope with the source hull visible.

Only the ring/flash region samples scene colour. Surface-normal agreement and
source depth reject opposite-facing/occluded patches. Straight-line distance
approximates propagation over a small neighborhood; these are not geodesic waves.
The field's additive material uses premultiplied ONE/ONE blending so negative
displacement survives and flash alpha does not suppress the ring. Double-sided
patches use one draw, with facing rejection in the shader.

Refraction requires `EXT_color_buffer_float`; unavailable devices use direct
glow and report that fallback. Native ship PBR uses the existing display-space
capture encoding and restores it after the pass. A frame with no live shield
impacts uses ordinary rendering and skips the capture/field/resolve entirely.
Targets remain cached between bursts. Explicitly clearing the sky reference
releases the pass.

`scene.setStudyCapitalShield(frame, skyCanvas)` supplies the envelope, target
offset, impact anchors/ages, strategy and effect mode. This study keeps the ship
at the origin and moves the real scene camera. The effect is not wired into
the Ellis renderer or capital combat; no persistent world fields are introduced.

## Measured render comparison — 2026-10-26

Foreground Codex in-app WebGL browser, 602 × 939 CSS pixels, 903 × 1409 backing,
DPR 1.5, scene scale 1. Aegis at original metre scale; close broadside camera:
zoom 9.662, yaw 0, tilt 1.03. Hero galaxy sky, ordinary source lighting, stationary
capital and frozen incoming streaks. All native assets/lighting were loaded and
warmed. No tests or asset rebuilding overlapped these measurements.

Each ABBA block warms 15 frames and samples 60, giving 120 samples per mode.
Benchmark hits are explicitly injected at fixed visible anchors and ages
0.04–0.28 seconds; they are not live damage or AI events. Camera, source effects,
clock and viewport are held fixed. Hidden/resized/moved comparisons are rejected.
CPU below includes sky, presentation preparation and render submission. The
synchronized time additionally includes a one-pixel readback, driver overhead
and GPU wait. It is not a GPU timer, and rAF cadence is browser pacing.

| Case | CPU median / p95 ms | Synchronized median / p95 ms | Cadence median / p95 ms | Draws / triangles |
| --- | --- | --- | --- | --- |
| 32-hit refraction comparison, off | 0.50 / 0.60 | 4.50 / 5.10 | 14.60 / 15.20 | 11 / 44,294 |
| 32 local refractive waves | 0.80 / 1.00 | 5.30 / 6.00 | 14.70 / 15.10 | 44 / 47,030 |
| 32-hit glow comparison, off | 0.50 / 0.60 | 4.90 / 5.80 | 14.70 / 15.10 | 11 / 44,294 |
| 32 local glow waves | 0.70 / 0.90 | 5.10 / 5.60 | 14.60 / 15.10 | 43 / 47,028 |
| 128 waves, whole-envelope reference | 1.20 / 1.40 | 5.70 / 7.10 | 14.60 / 15.10 | 140 / 838,920 |
| 128 waves, local patches | 1.40 / 1.60 | 5.60 / 6.90 | 14.60 / 15.10 | 140 / 55,426 |

Local patches reduce overlay geometry at 128 hits from 794,624 to 11,130
triangles, about 98.6%. This did **not** demonstrate a substantial total render
speedup: CPU submission was slightly higher, synchronized times were close,
and cadence was unchanged. Draw submission, capture/resolve, source rendering
and synchronization remain costs. Do not infer a whole-game frame gain from
the geometry count.

For this view, 32 local refractive hits added about 0.3 ms CPU submission and
0.8 ms synchronized median. Direct glow added about 0.2 ms to both medians.
These are local measurements on this browser/hardware, not universal budgets.
Emitter scheduling and allocation costs during live barrages are outside the
frozen render comparison. The visual pool is capped at 128, including incoming
streaks, and evicts the oldest entries when saturated; the page reports evictions.

## Verification and limits

`node tests/capital-shields.cjs` checks deterministic baking, source hashes,
closed topology, finite unit normals, original-vertex containment, conservative
patch coverage, expiry, signed blending configuration, one source capture,
half-resolution field, geometry/target reuse and the direct glow path.
`tests/three-production.cjs` covers source-render routing, capture encoding,
quiet frames and explicit resource disposal. Browser inspection is separate.

Visual inspection covered the wire envelope broadside, toward the bow and
underneath, broadside and underside gun ripples, overlapping hits, a frozen
heavy hit and source-hull visibility. Native capital
movement, articulated clearances, live combat impacts, multiple capitals,
cross-shield occlusion and target hardware beyond this browser remain unverified.
The fitted surface is an authoring candidate, not a production shield contract.
