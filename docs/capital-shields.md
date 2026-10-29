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

## Combined impact draw experiment (2026-10-26)

The Impact submission control selects either cached per-hit geometry (default)
or one combined draw. Comparison / Individual / batched impacts runs matched
ABBA blocks with the same local triangles, shader kernel and source scene.
The combined path expands position, normal, impact position, impact normal and
age/lifetime/radius into a reusable 15-float interleaved vertex buffer. Capacity
grows geometrically and the draw range shrinks with active impacts. It fills and
uploads the buffer each frame, including in the frozen benchmark; that work is
included in the CPU and synchronized measurements. No per-frame geometry object
is created after capacity warmup. Empty batches submit no shield geometry.

Measured in the foreground study, Aegis source SHA `19ff1c719d6f`, 903 x 1409
backing pixels, DPR 1.5, scale 1, local patches, broadside yaw 0 / tilt 1.030,
zoom 15.153, no AI, 2-pixel refraction. This is a closer view than the earlier
measurements above; compare within each row, not against those earlier runs.
Each case used 15 warmup + 60 recorded frames per block, ABBA, 120 samples per
path, loaded sky and frozen camera/impacts/source streaks. No concurrent tests
or asset generation. Browser cadence median/p95 was 13.30/13.40 ms throughout.
CPU includes buffer preparation/uploads/submission; synchronized time includes
the one-pixel readback, driver overhead and GPU wait, not GPU-only execution.

| Mode / impacts | Individual CPU median/p95 ms | Batched CPU median/p95 ms | Individual synchronized median/p95 ms | Batched synchronized median/p95 ms | Total draws individual → batched | Triangles, identical per comparison |
| --- | --- | --- | --- | --- | --- | --- |
| Refraction / 4 | 0.80 / 1.00 | 0.80 / 1.10 | 5.10 / 7.50 | 4.80 / 5.80 | 16 → 13 | 44,603 |
| Refraction / 32 | 1.00 / 1.40 | 1.10 / 1.50 | 5.30 / 6.50 | 5.20 / 6.90 | 44 → 13 | 47,118 |
| Refraction / 128 | 2.00 / 2.80 | 2.00 / 2.70 | 6.20 / 7.70 | 5.60 / 7.10 | 140 → 13 | 55,372 |
| Glow / 4 | 0.60 / 0.80 | 1.00 / 1.10 | 5.30 / 6.80 | 5.80 / 6.60 | 15 → 12 | 44,601 |
| Glow / 32 | 0.90 / 1.00 | 1.20 / 1.40 | 4.40 / 5.20 | 5.20 / 6.20 | 43 → 12 | 47,114 |
| Glow / 128 | 1.60 / 2.20 | 1.70 / 2.40 | 5.00 / 6.40 | 5.90 / 7.60 | 139 → 12 | 55,368 |

This combined-buffer implementation is not a general performance win. At 128
refractive impacts, synchronized median improved by 0.6 ms; at 32 it barely
changed. Glow became slower in these runs. CPU did not improve. The default
therefore remains cached individual draws; batching remains available for
inspection. The evidence does not establish a purely draw-bound or bandwidth-
bound workload. A possible next experiment is immutable patch geometry with
small per-impact GPU parameters (instancing/atlas), avoiding expanded per-frame
uploads; it has not been implemented or measured here.

Visual validation of the combined path covered frozen broadside reference/batch
switching with identical impacts, overlap under sustained fire, underside and
bow views. Labeled UI captures are `studies/capital-shields-individual.png` and
`studies/capital-shields-batched.png`. No visible change to wave shapes or hull
occlusion was observed in those views. Tests additionally compare every submitted
position, normal and impact attribute with the reference patch data and cover
aging, heavy-hit parameters, buffer reuse and empty-batch suppression. These
checks do not establish moving-capital or full-battle performance.

## Refraction-only pixel comparison

Click **Compare refraction pixels**. This freezes the visible-anchor fixture
using the selected frozen impact count (ages 0.04–0.28 seconds), omits live
incoming streaks and synchronously captures the same camera/source twice.
A uses the refraction pipeline with zero displacement, B uses the selected
pixel cap. Glow, source capture, field, resolution and shader path are identical.
Each capture composites the sky and scene canvas into opaque 8-bit RGB. It does
not compare direct glow against refraction, which would conflate pipeline changes.

The review offers A, B, side-by-side and amplified RGB difference views without
rerendering. Live drawing/clock advancement pauses while the review is open.
Metrics count pixels with any RGB change, max-channel differences of at least
3/255 and 10/255, maximum channel difference and mean absolute RGB difference
over the whole viewport. These are byte thresholds, not perceptual guarantees.
The heatmap maps maximum channel difference to red ×16 and green ×4. Counts
exclude alpha because the compared captures are already composed over the sky.

A/A, B/B and return-to-A repeat controls must match exactly; otherwise the
result is explicitly marked INVALID. Unsupported float refraction reports an
error rather than claiming a zero-change success. A zero-pixel negative control
was verified in the browser: zero differences and zero repeat-control noise.

Observed at 903 × 1409, 32 deterministic gun waves, individual local patches,
zoom 6.161, yaw 0, tilt 1.030, 2-pixel cap: **2,368 changed pixels (0.186% of the
viewport), 1,226 at ≥3/255 and 375 at ≥10/255**. Maximum channel change 60/255;
whole-viewport mean absolute RGB difference 0.0082/255. Repeat-control noise was
zero. This establishes a small, localized image change, not that viewers can
reliably perceive it in motion. Most of this viewport is dark background; the
percentage is explicitly relative to the entire viewport, not shield area.
The same count was observed after removing the live source streaks. Close views
and different impact counts can produce different results.

The pure `shield-pixel-diff.js` helper has synthetic regressions for per-pixel
counting, thresholds, RGB-only comparison, repeat instability, heatmap values
and mismatched dimensions. Actual WebGL/canvas capture is verified separately
in the browser. Preview: `studies/capital-shields-pixel-comparison.png`.

A closer broadside at zoom 9.662 with the same 32-wave fixture and 2-pixel cap
changed 4,292 pixels (0.337%), with 2,162 ≥3/255 and 812 ≥10/255; max 92/255,
mean 0.0176/255 and zero repeat-control noise. The A/B/single-difference view
buttons were exercised in this close view. Capture:
`studies/capital-shields-pixel-comparison-close.png`.
