# Aegis surface candidate 01 — taste-test evidence

The user approved candidate 01; it is now the production default. Open
[`output/aegis-surface-review.html`](../../output/aegis-surface-review.html).
Source rig SHA-256: `19ff1c719d6f655dcf201a867b75280aa809f515fc1668511d067b3136320fce`.

## Matched measurements

Foreground Codex browser, 1642 × 797 CSS rendering area, DPR 1.5,
2463 × 1196 backing buffers, production `scene3d` renderer. One intact armed
rig, original scale, fixed camera, no fighter simulation, sky draw or effects.
Each comparison alternates A/B/B/A; each block discards 20 warm-up frames and
records 90 frames. No concurrent tests or asset builds ran during sampling.
CPU includes rig pose preparation, scene synchronization and render submission.
GPU execution is not measured; browser cadence is refresh-limited.

| View / lighting | Version | CPU median / p95 ms | Frame median / p95 ms | Draws | Triangles |
| --- | --- | --- | --- | --- | --- |
| Whole ship / studio | Original | 2.2 / 2.8 | 13.3 / 13.5 | 128 | 44,252 |
| Whole ship / studio | Candidate | 2.2 / 2.8 | 13.3 / 13.5 | 128 | 44,252 |
| Armor flyby / flight environment | Original | 1.1 / 1.6 | 13.3 / 13.4 | 60 | 33,800 |
| Armor flyby / flight environment | Candidate | 1.1 / 1.4 | 13.3 / 13.5 | 60 | 33,800 |

Whole-ship target [0, 0, 0] m and eye offset [-650, -1950, 1100] m;
flyby target [-245, 0, 0] m and offset [-80, -155, 125] m, relative to the
rig origin. Culling reduces close-up submissions equally for both versions.
Flight lighting loads the existing galaxy spherical harmonics and radiance
probe through the renderer's normal environment event. Textured candidate
batches use its existing PBR path; studio uses its existing raw shader.
Neither measurement establishes a GPU speedup or final gameplay budget.

Machine-readable evidence: `output/aegis-surface-wide-metrics.json` and
`output/aegis-surface-flight-metrics.json`. The wide run predates the lighting
selector and used the same studio setup and backing resolution.

## Resource changes

- No geometry, normal, material-batch-count or collision changes.
- Four neutral hull batches gain UVs; original lamps and articulated/damageable
  assemblies retain their existing batches and buffers.
- Hull vertex buffers increase from 1,726,848 to 2,123,232 bytes: +396,384 bytes.
  The review keeps both versions resident to allow immediate switching.
- One shared 2048 × 1024 RGBA atlas: approximately 10.67 MiB with mipmaps per
  GPU copy. The renderer can retain separate raw/PBR texture copies when both
  lighting modes have been visited. Browser image/canvas and UV-source storage
  are additional. This is an estimate, not measured VRAM.
- Atlas rasterization and UV-buffer preparation happen once at startup; no
  per-frame geometry or texture regeneration. No shader code or runtime network
  dependency was added. The review uses local assets and generated canvas pixels.

## Visual review and remaining decisions

Inspected original/candidate close armor in studio and flight lighting; candidate
whole ship, underside, service belt, hangar opening, stern, distant hull, and
destroyed/reset drives and neighboring turrets. Examined the armor during slow
orbit. Labeled stills are saved as `output/aegis-surface-*.png`.
The atlas adds quiet panel divisions and fittings while preserving broad armor
planes. Fine details recede at combat distance. Dark service details remain
subtle, especially in flight lighting. The repeated module silhouette remains.

The user should judge panel density, contrast, and whether the cleaner engineered
finish is the right direction. No normal/roughness maps, silhouette redesign,
turret texture pass, heavy weathering or fleet-wide rollout is included.
Per-mesh atlas mapping is a first art pass, not a final uniform texel-density
contract across every module. Full combat integration, moving gun angles,
all sky families, GPU timing, and multi-capital performance remain unmeasured.
The production pass below completes the two-capital scene comparison; additional
sky families and GPU timing remain outside this measurement.

## Production integration

The shipped rig now includes hull UV metadata and loads a local baked PNG.
Production rig SHA-256: `185463d3c438f5f7cc21833153e36128b00eb7182be7afe2ef5882f0aae30c28`.
Armed ships retain independently damageable guns and engines; unarmed ships
still combine all geometry into seven material batches. Small constant-color
atlas swatches compensate merged idle parts for the hull material tint.
The GPU buffers are shared per source revision; only poses change per frame.

Live `flight.html?aegis=1`, both ships visibly submitted, 8 hostiles and 2 launched
wingmen, production artwork and effects, DPR 1.5, 1920 × 1080 main backing size.
After live combat, freeze the snapshot and run **Benchmark capital surface detail**:
20 warm-up plus 90 measured frames per ABBA block. Ships, sky, fighters and
projectiles remain identical; only the approved surface treatment changes.

| Surface detail | CPU median / p95 ms | Frame median / p95 ms | Draws | Triangles |
| --- | --- | --- | --- | --- |
| Original | 7.30 / 8.30 | 13.30 / 13.40 | 317 | 250,702 |
| Approved default | 7.20 / 8.50 | 13.30 / 13.40 | 317 | 250,702 |

No demonstrated median submission regression; the 0.2 ms p95 difference is
within the small spread of this run, not evidence of a GPU speedup. GPU execution
is still unmeasured. Evidence: `output/aegis-surface-production-metrics.txt` and
`output/aegis-surface-production-benchmark.png`. Visually checked the actual
moving two-faction encounter with firing guns and hangar launches. The production
finish was also compared with the approved close-up in the review renderer.

## Validation

`npm run check` passed: types, script/asset freshness and all 130 test entries,
including the new surface-study regression. Log: `output/aegis-surface-check.log`.
Browser inspection reported no console errors. Mechanical checks and the visual
inspection above do not substitute for the pending user taste test.

After user approval and production integration, `npm run check` passed again:
all 130 entries, strict types, script lists and asset validation. The unrelated
parallel-work copy `output/alignment-stage/` was excluded through a process-local
Git excludes file for this validation; no repository ignore rule was changed.
Log: `output/aegis-surface-production-check.log`.

## Candidate 02: heavy turret finish

The approved hull finish is committed as `c10a5a61` and is the production default.
The next review-only candidate is at
`output/aegis-surface-review.html?pass=turrets`. A shows that approved default;
B adds restrained panels and fittings to twelve heavy turret housings using
the same loaded atlas. Hulls, barrels, small guns, geometry and pivots stay unchanged.

Studio heavy-turret ABBA comparison, 20 warm-up and 90 measured frames per block,
DPR 1.5 and 2463 x 1196 backing size:

| Finish | CPU median / p95 ms | Frame median / p95 ms | Draws | Triangles |
| --- | --- | --- | --- | --- |
| Approved default | 1.10 / 1.30 | 13.30 / 13.40 | 67 | 34,772 |
| Turret candidate | 1.10 / 1.20 | 13.30 / 13.40 | 67 | 34,772 |

Evidence: `output/aegis-surface-turret-metrics.json`. GPU execution was not timed.
Inspected the close-up in studio and flight lighting, underside and whole ship.
The focused surface-study test checks unchanged geometry and turret transforms.
This candidate awaits the user taste test; production damage integration and an
actual-scene readiness pass follow acceptance, before it becomes the next default.

### Turret approval and production integration (2026-10-27)

The user approved candidate 02. The production bake now carries heavy-turret UVs;
armed mounts retain their own poses and damage ownership, while idle capitals
retain seven material draws. Destruction reads the original six-float geometry,
and reset restores the selected surface buffers. A turret-only presentation
switch preserves the approved hull finish for matched comparisons.

Actual `experiments/flight.html?aegis=1`, production art, 100% resolution,
1920 x 1080 backing at DPR 1.5, default camera after live firing and launches:
8 hostiles and 8 wingmen, no disabled systems. The frozen ABBA comparison used
20 warm-up and 90 measured frames per block, with the test suite finished.

| Turret finish | CPU median / p95 ms | Frame median / p95 ms | Draws | Triangles |
| --- | --- | --- | --- | --- |
| Off, approved hull retained | 9.80 / 13.40 | 13.30 / 13.40 | 400 | 277,243 |
| Approved default | 9.50 / 12.80 | 13.30 / 13.40 | 400 | 277,243 |

No demonstrated submission regression; GPU execution was not measured.
Evidence: `output/aegis-turret-production-metrics.txt` and matching PNG.
`npm run check` passed all 130 entries, types and asset checks; log:
`output/aegis-turret-production-check.log`. The same process-local exclusion
for the unrelated partial HTML copy was used. Focused coverage also verifies
scorched turret buffers survive toggles and reset restores the approved finish.

## Approved hangar markings (2026-10-27)

Candidate 03 was approved. BAY 01 is baked into the existing 2048 x 1024 atlas;
36 existing vertices on the two hangar roof bevels receive different UVs.
No mesh, draw, shader, texture dimension, runtime code or gameplay rule changes.
Before revision: `f30af611`. Marked rig SHA-256: `9f30cd6558122ddefbff3345e5e5a88cfd7a8554bad2f7d1eae709616cef5715`.
The review page retains unmarked UVs for its historical A/B comparison.

Production readiness used the same initial paused capital encounter, default
camera, 8 hostiles, no launched wingmen/projectiles, 100% render scale and
1920 x 1080 backing at DPR 1.5. Both revisions submitted 265 draws and 232,956
triangles. Each revision used the existing surface on/off ABBA sampler with
20 warm-up and 90 measured frames per block. Tests were not running during timing.

| Revision | Surface off CPU median / p95 ms | Surface on CPU median / p95 ms |
| --- | --- | --- |
| Before markings | 3.90 / 4.70 | 3.70 / 4.20 |
| With markings | 5.70 / 6.40 | 5.60 / 6.30 |

Cadence was 13.30 / 13.40 ms in both runs. Both the off control and on treatment
shifted between reloads, so these timings do not isolate a marking cost or prove
a speedup. The same-tab candidate comparison recorded identical 1.0 / 1.5 ms
CPU median/p95 and 55 draws / 32,704 triangles. GPU execution is unmeasured.
Evidence is in `output/aegis-markings-production-before.txt`, `-after.txt`,
`output/aegis-markings-metrics.json`, and `output/aegis-markings-production.png`.
The final atlas explicitly uses the approved Consolas Bold glyphs for offline
and browser authoring; final visual review checks the actual baked PNG.
The final texture comparison confirms that only reserved tile six changed.
`npm run check` passed all 131 entries, strict types and asset validation;
log: `output/aegis-markings-production-check.log`. The focused regression checks
the 36 remapped vertices, both side orientations and preserved production rigs.
