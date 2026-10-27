# Fighter shield rendering study

Serve the repository and open [the study](../experiments/fighter-shields.html).
It is also linked from the index under Technical tests / Performance.
This is an isolated real WebGL render, not integrated flight gameplay. It changes
no shield rules, damage, saves or existing flight effects.

## Visual comparisons

- **Off:** star/grid background and the existing Quaternius Spitfire geometry.
- **Glow:** one additive shield quad per fighter. Reconstruct a front-hemisphere
  normal and evaluate up to 16 cosine-distance wavefronts. No scene capture or
  bloom. Blue highlights are analytic, not illumination cast onto nearby objects.
- **Background refraction:** capture the background once into a shared RGBA8
  target, sample it under each shield, then draw the opaque hulls last. This
  preserves hull edges, but the hull occludes even front-surface waves. A flight
  integration would separate background refraction from the foreground glow.
- **Whole-image refraction:** capture hulls too. This deliberately exposes
  resampling artifacts on recognizable silhouettes. The non-MSAA capture target
  can also soften/jag hull edges even at zero displacement; compare that setting
  before attributing every difference to distortion.

Click a bubble for an impact; repeated impacts keep the effect running. Freeze
waves to compare modes at the same phase. Increasing backing resolution to 2×
provides four times as many source pixels and four times the raster area. The
grid is an intentionally demanding diagnostic background, not the flight sky.

Displacement is bounded below the selected backing-pixel limit by normalizing
the summed direction with `1 + length`. It fades at the silhouette. This is not
a bound on the displacement Jacobian: narrow waves and near-limb changes can
still shimmer. The width control is cosine-space width, so angular thickness
varies during propagation. This is a front hemisphere / orthographic proxy,
not a full ellipsoid with back-face waves, arbitrary camera or depth sorting.
No new capital-ship geometry is integrated.

## Cost measurements — 2026-10-26

Foreground Codex in-app WebGL browser, 602 × 939 CSS-pixel canvas. Browser
reports `WebKit WebGL`; physical GPU was not identified. Existing Spitfire
geometry: 3,512 triangles, neutral lighting, shared immutable vertex buffer.
Source `assets/ships/quaternius-ultimate-spaceships/meshes.js`, SHA-256 prefix
`1da423c13c1f`; original geometry, normals and source bytes unchanged.
No simulation, weapons, postprocessing or concurrent benchmark. Fixed impacts
populate every selected wave slot during measurement; camera and waves freeze.
Each A/B/B/A pass warms eight renders, then samples 24: 48 samples per mode.
Controls lock during sampling; hidden-tab and viewport changes reject the run.

These are **readback-synchronized total render times**, including CPU submission,
driver overhead, GPU completion and a one-pixel readback. They are not GPU timer
queries or whole-game frame costs. CPU submission median/p95 is reported
separately in the page. Early `gl.finish()`-only measurements returned near-zero
times and were rejected; the timings below use readback. Results are noisy and
rounded to 0.1 ms by the browser clock.

| Case | Backing pixels | Baseline median / p95 ms | Effect median / p95 ms | Median difference |
| --- | --- | --- | --- | --- |
| 1 fighter, 4 waves, glow | 602 × 939 | 0.9 / 3.4 | 0.9 / 2.5 | below noise |
| 1 fighter, 4 waves, background refraction | 602 × 939 | 0.9 / 3.4 | 1.0 / 4.3 | +0.1 ms |
| 64 fighters, 16 waves each, glow | 602 × 939 | 1.3 / 3.1 | 1.8 / 3.7 | +0.5 ms |
| 64 fighters, 16 waves each, background refraction | 602 × 939 | 1.2 / 3.4 | 1.8 / 3.6 | +0.6 ms |
| 1 oversized shield, 16 waves, background refraction, 2× backing | 1204 × 1878 | 1.5 / 3.8 | 1.9 / 4.5 | +0.4 ms |

Default size 0.85, bend 2 pixels, width 0.24. Oversized case uses size 1.4,
clipping the bubble horizontally. Its CPU submission baseline median/p95 was
0.0 / 0.1 ms; effect 0.1 / 0.2 ms. Increasing fighter count tiles smaller
bubbles: it increases draws but roughly holds total shield area constant. This
is **not** 64 overlapping close-up shields. Change size and backing resolution
separately to explore fill cost. The large-shield case approximates pixel load,
not capital-ship geometry or hundreds of distinct simultaneous impacts.

Baseline draws: `1 + N`; glow: `1 + 2N`; background refraction: `2 + 2N`;
whole-image refraction: `2 + 3N`. Whole-image mode submits the hull geometry
twice. Source render targets are allocated on resize and reused, with one shared
capture per frame, never one per shield. Geometry is uploaded once, reused
across fighters and moved by uniforms; no per-frame vertex rebuilding.

## Practical direction

The measured cases support proceeding with fighter shields. Start with glow,
four active waves and broad fronts; use 1–2 backing-pixel background-only
distortion on close fighters. The glow supplies most of the visual identity.
Far fighters can use a brief blue flash or a pre-rendered ripple sprite. Reuse
an existing scene-color capture when integrating, and batch/instance shield
quads if draw submission becomes material. Avoid adding a bloom pass solely
for these small shields before testing its incremental cost.

Unlike a fixed scorch texture, this shader evaluates the active wave list for
every covered shield fragment. Work grows with shield area × active waves,
plus draw submission and capture bandwidth. The wave list is capped at 16;
new impacts evict the oldest. This bounds sustained-fire cost but does not
retain every hit. For capitals, compare capped/coalesced waves with thin
wavefront geometry before committing to a disturbance-texture simulation.
Neither that simulation nor ring geometry is implemented or benchmarked here.

Browser visual inspection covered glow, background refraction at 2 pixels,
whole-image distortion at 12 pixels, and a large 2×-resolution bubble. Hull
edges remain distinct when composited last; whole-image mode exhibits the
expected resampled edge steps. Traveling blue fronts are visible. The dogfight
follow-up below covers actual flight camera motion and weapons. Multiple
overlapping shields, back surfaces and capital barrages remain unverified.

`node tests/fighter-shields.cjs` checks pass order, bounded impact storage,
immutable buffer reuse and draw counts with a GL stub. It does not compile GLSL
or visually approve the effect; browser inspection is separate. Run the page's
benchmark on the target hardware and again inside flight before assigning a
gameplay performance budget.

## Real dogfight follow-up — 2026-10-26

Use the **Watch a real dogfight** link in the shield study. It opens ordinary
`flight.html` with `duel=1&shields=whole`: expert human simulator versus ace AI,
crossing start, seed 29, two existing Quaternius Spitfires, retail Ulysses hull,
shields and default cannons. The normal duel physics, collision and damage run
unchanged. Chase camera shows the observing pilot's actual fighter. The study
starts after textures are ready and repeats completed duels. Pause/resume and
the shield toggle are in the upper-left panel.

The renderer now captures hulls, scenery, engines and weapons into a **shared
native Three.js target**, drawing the source scene once. A full-screen copy and
one rectangle per visible shield sample this capture with displacement bounded
below **2 backing pixels**. The sky comes from the existing sky renderer via one
shared canvas texture update per rendered effect frame. This upload/sync cost
is included; a future common-context sky pipeline could avoid it. The HUD and
target-camera inset remain undistorted. There is no added bloom pass.

This improves on the isolated whole-image lab: a second submission of every hull
is unnecessary. The target is reused, uses four-sample MSAA and RGBA8 display
color storage. Native ship PBR ordinarily outputs linear color to offscreen
targets; `scene3d` temporarily enables its display encoding during this capture
so the raw compositor preserves the direct renderer's hull brightness. The
uniform resets in `finally`; ordinary rendering keeps its existing output.

`flightShields.tracker()` derives four recent impact waves per fighter from real
shield decreases, using the nearest fresh collision flash to estimate direction.
Directions follow the fighter's local basis. Shield depletion removes the bubble.
History and targets are presentation resources, never saved or written into
combat state. Normal flight does not create a tracker unless this study is
requested. `scene.setStudyShields(discs, skyCanvas)` supplies projected rectangles
and waves; passing a null sky releases the pass. `completeFrame()` is the opt-in
benchmark's one-pixel synchronization readback, not part of live rendering.

**Benchmark next shield hit** waits for a nearby bubble with a wave at least
0.2 seconds old, then freezes the actual combat frame. **Benchmark frozen frame**
repeats that exact snapshot. Each ABBA block warms 10 renders and samples 60,
giving 120 samples per mode. Camera, ships, projectiles, wave phase and resolution
remain fixed; hidden or resized viewports reject the run. AI/physics are frozen,
so frame cadence is browser pacing, not a live AI performance measurement.

Accepted final captures at 2.62 seconds: two visible shields, two retained waves;
902 × 939 CSS pixels, 1353 × 1409 backing, DPR 1.5, render scale 1, normal scene,
normal sky and HUD. No tests or asset rebuilding overlapped these measurements.

| Final run | CPU submission median / p95, off → on (ms) | Readback-synchronized median / p95, off → on (ms) | Frame cadence median / p95 (both) |
| --- | --- | --- | --- |
| A | 1.2 / 1.4 → 1.3 / 1.5 | 4.8 / 5.6 → 3.2 / 5.8 | 13.3 / 13.4 ms |
| Same snapshot repeat | 1.4 / 1.9 → 1.8 / 5.3 | 2.6 / 3.6 → 3.8 / 7.6 | 13.3 / 13.4 ms |

Both runs submit 23 → 26 draws and 163,951 → 163,957 triangles, including sky.
Submission median increases by about 0.1–0.4 ms in these samples. There is no
observed loss of paced frame cadence for this two-fighter case. Readback changes
the synchronization/presentation path; its medians change sign between runs and
its tails are noisy. These data establish neither a GPU-only cost nor a speedup.
They do not establish headroom for a fleet or a capital barrage.

Earlier dogfight samples with a missing standard position attribute or mismatched
offscreen PBR brightness were rejected. Final visual inspection compared the same
paused frame on/off: both hulls, engines and projectiles remain present, native
hull brightness is preserved, and the struck opponent displays a blue wave.
The saved on/off images are `output/shield-dogfight-preview.png` and
`output/shield-dogfight-off.png`. Motion and repeated duel reset were also viewed.

This remains a screen-space spherical proxy: intersections and overlapping bubbles
are approximate, impact positions are inferred, and the shader displays only the
front hemisphere. It has not been integrated with the Ellis capture path. Keep
the opt-in study separate from a production shield decision until those cases
and larger fights are measured.

`node tests/flight-shields.cjs` advances a real deterministic duel, verifies that
real hits produce bounded waves without combat mutation, and checks frozen phase,
depleted shields, one source-scene submission, target reuse/resize and display
capture configuration with a renderer stub. Browser inspection remains necessary
for GLSL compilation, materials, resampling and motion.
