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

## Angular flight and own-shield experiments (2026-10-26)

The study links now include two opt-in real flight views:

- `flight.html?duel=1&shields=whole&shieldUnits=angle&seed=29&start=crossing&duration=120`
  uses the existing chase-view duel with external fighter bubbles.
- `flight.html?duel=1&shields=own&shieldUnits=angle&seed=29&start=crossing&duration=120`
  selects the cockpit camera and responds only to the player's own shield loss.

The strength menu offers legacy 2 backing pixels and 0, 0.05, 0.15, 0.35, 0.75
and 1.5 degree caps. Legacy behavior remains the default for existing links.
Angular mode reconstructs each view ray using the actual camera projection's
X/Y scale, rotates it along a tangent by the damped wave amplitude times the
degree cap, then reprojects it to source UVs. Thus backing resolution changes
do not change the angle. FOV changes affect the corresponding screen pixels
through the projection. A zero-slope guard avoids normalizing zero vectors.
These are maximum angular settings; most pixels bend by less. External bubbles
additionally cap displacement at 25% of their projected minor radius so very
distant fighters are not displaced by a large fraction of their own size.
That cap intentionally makes their effective angle distance-dependent.

Own shields use a full-screen quad and perspective view directions instead of
an external hemisphere proxy. Only active hit waves produce this pass; there
is no idle capture. The same source-scene capture contains native geometry,
bolts and other native effects, while the sky is sampled at the displaced UV.
The GPU HUD, targeting markers, instruments, DOM controls and target-monitor
canvas are drawn separately and remain sharp. This is a first-person shield
presentation experiment, not a cockpit mesh, damage rule or physically traced
shield volume. Directional hits outside the forward view may not cross the
visible field before damping. Own waves use a narrower cosine-space pulse and
lower glow gain than the external bubble; no persistent rim is drawn.

**Freeze scripted shield hit** pauses the real duel and injects a presentation-
only forward hit at age 0.12 seconds. It does not alter combat damage, shields,
AI or physics. In own mode it temporarily replaces the visual hit list with one
scripted wave; external mode replaces the nearest bubble’s wave list. Resume to watch its
motion. **Displacement ZERO / same glow** toggles only refraction in angular
mode; **Blue glow** independently disables the additive blue component.
**Measure frozen displacement** compares the selected angle against zero on the
same frozen source using the same glow/capture pipeline. It excludes the HUD,
counts changed RGB pixels and ≥3/255 / ≥10/255 maximum-channel differences,
and rejects nonidentical A/A, B/B or return-to-A repeat controls. This button is
for angular mode; the existing performance benchmark still compares the whole
shield pass on/off, including glow. It is not an isolated distortion timing.

Browser checks at 0.35 degrees:

| View | Frozen time | Backing size | Any RGB change | ≥3/255 | ≥10/255 | Max channel difference |
| --- | --- | --- | --- | --- | --- | --- |
| Own shield, glow on | 2.233 s | 1353 × 1409 | 698,326 (36.631%) | 209,576 | 33,299 | 220/255 |
| Same own frame, glow off | 2.233 s | 1353 × 1409 | 611,969 (32.101%) | 200,534 | 32,746 | 220/255 |
| External fighter | 22.167 s | 1920 × 1080 | 21,822 (1.052%) | 7,348 | 2,683 | 219/255 |

All repeat controls were exact. The own-view zero-degree negative control
changed zero pixels. These are different frames, cameras and viewport sizes,
not matched performance or perceptual comparisons; whole-viewport percentages
also reflect coverage. The own source used one scripted wave, temporarily replacing retained real
impacts for inspection. Default duel hull/profile selections were used. PNGs:
`output/own-shield-angular-on.png`, `output/own-shield-angular-zero.png`,
`output/fighter-shield-angular.png`. Browser inspection checked the frozen
on/zero switch, glow-off isolation and sharp HUD text/markers/instruments.
No new GPU/CPU performance claim is made for these angular variants.

Focused regressions in `tests/flight-shields.cjs` exercise real own-shield damage,
bounded full-screen history, immutable combat state, camera projection uniforms,
resolution-independent degree settings and zero-displacement controls. The
original isolated orthographic WebGL lab retains its pixel units; angular tuning
is in these actual perspective flight views.

A final single-scripted-wave cockpit check at 4.750 s, 1353 × 1409, 1.5 degrees,
glow disabled, changed 848,841 pixels (44.526%); 463,890 ≥3/255 and 149,468
≥10/255, maximum 244/255. Repeat controls matched exactly and browser logs had
no errors. The same frozen frame was inspected with zero displacement and
restored to the selected angle. Captures: `output/own-shield-angular-strong.png`
and `output/own-shield-angular-strong-zero.png`. This is an intentionally stronger
inspection setting, not a default recommendation or evidence of motion comfort.

## Repeating directional cockpit preview

The own-shield panel now has **Play repeating hits / 0.7 s**, six presets
(Front, Left, Right, Behind, Above, Below), a draggable equirectangular direction
box and accessible yaw/elevation sliders. Horizontal drag spans yaw -180° to
180°, with front in the middle and rear at either edge; vertical drag spans
+90° above to -90° below. Positive yaw is right. Presets and dragging update
both sliders and the marker/readout. During playback the direction changes
existing waves immediately while the emission cadence continues. The box captures the pointer so dragging outside it stays bounded.

Playing pauses the duel/camera and advances only a presentation clock from
requestAnimationFrame timestamps. A hit is emitted every 0.7 seconds with the
existing 1.2-second lifetime, so at most two waves overlap. Starting playback
explicitly enables blue glow and displacement; an existing nonzero angular
strength is retained, otherwise it selects 0.75°. The user can then disable
glow or toggle displacement to zero independently. **Pause hit animation**
holds the last phase. Measurement and benchmark controls also hold the preview
phase; **Pause / resume dogfight** exits the preview and returns to real damage.
The scripted frozen-hit button exits the loop and retains its existing behavior.
No combat state, health or AI changes are made by preview waves.

Rear impacts remain directional: they can fade before reaching the forward
camera field. The readout states this explicitly. This preview does not invent
a front-facing flash for a rear hit. Side and vertical hits enter the forward
field later than a front hit; the 0.7-second loop makes that timing inspectable.

`flightShields.preview(yaw,pitch,seconds)` produces bounded, deterministic,
camera-local unit directions and ages. `flightPresentation.setShieldPreview`
accepts a packed wave array (including empty for an idle preview) or null to
restore ordinary real/scripted hit handling. Focused regressions cover all six
cardinal directions, continuous normalization, overlap, cadence and expiry.
Browser verification exercised all preset controls, a drag to yaw 78° / elevation
44°, repeated left/right/lower waves across the fixed starfield, and sharp HUD
instruments. The preview was left playing with left hits and blue glow enabled.
Capture: `output/shield-direction-preview.png`.

### Directional preview render cost

Foreground frozen ABBA measurement after project checks finished, with no
concurrent tests or asset generation: own-shield left-hit preview, two active
waves, 0.35°, blue glow enabled, duel source frozen at 1.66 s, 2463 × 1454 backing
pixels, DPR 1.5. Same source/camera/settings per block; 10 warmup and 60 recorded
frames/block, 120 samples/path. The source includes the ordinary duel scenery
and native effects; simulation/AI and the separately rendered HUD are outside
the timed presentation call. Draw counts include scene and sky.

| Case | CPU median/p95 ms | Synchronized median/p95 ms | Cadence median/p95 ms | Draws / triangles |
| --- | --- | --- | --- | --- |
| Entire shield path off | 0.90 / 1.20 | 3.30 / 3.90 | 13.30 / 13.40 | 16 / 157,538 |
| Shield capture + angular refraction + glow | 1.00 / 1.40 | 3.90 / 4.40 | 13.30 / 13.40 | 18 / 157,542 |

Added median: 0.10 ms CPU and 0.60 ms synchronized, two draws/four triangles.
This includes source target/resolve, scene/sky sampling and the two full-screen
quads. It does not isolate distortion from glow, nor measure live emitter/AI
cost or establish a GPU-only time; synchronization uses a one-pixel readback
and includes driver/GPU wait. This is a fixed two-wave frame, not a temporal
worst-case scan. Preview emission is bounded to at most two overlapping waves.
The animation was resumed after measurement. Capture:
`output/shield-direction-cost.png`. Full project check: 125/125 entries passed.
