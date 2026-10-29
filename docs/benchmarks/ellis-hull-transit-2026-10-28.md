# Continuous Aegis hull transit, 2026-10-28

The capital no longer changes the entire hull's aperture membership when its
center changes charts. A shared 33-sample optical spine places each longitudinal
section in its own chart; all materials interpolate the same continuous field.
The patrol uses signed proper distance at 180 m/s. Source geometry, metre scale,
material groups, textures, pivots and GPU buffer identities are retained. The
previous clearance guard still permits tip-first needles and blocks cross-sections
that cannot fit.

## Visual inspection

The actual production presentation/Three renderer was inspected in the Ellis
observation lab at 5.99 and 6.01 s (center crosses at 6 s), with the lattice off.
Paired object-route stills were inspected from Side, Above and Rime-side cameras.
The previously protruding hull section stays in place across center membership
change. Full-compositor Side stills were also inspected at those times; there
were no browser errors or shader failures. This is visual acceptance for these
radial capital fixtures, not arbitrary off-axis hulls or optical caustics.

- Side: [before](ellis-transit-side-before-2026-10-28.png), [after](ellis-transit-side-after-2026-10-28.png).
- Above: [before](ellis-transit-above-before-2026-10-28.png), [after](ellis-transit-above-after-2026-10-28.png).
- Receiving chart: [before](ellis-transit-rime-before-2026-10-28.png), [after](ellis-transit-rime-after-2026-10-28.png).

The wide transverse shape is approximated by transported tangent frames; this is
not per-fragment finite-body ray tracing. Observer-on-hull/near-plane cases,
arbitrary maneuvering capitals and caustics remain outside this visual review.

## Matched runtime measurement

Use `studies/ellis-capital-benchmark.html?pass=capital&camera=side&time=6&paused=1&bridgeGrid=0&benchMotion=1&bridgeGeometry=full`.
Add `bridgeTransit=legacy` for the center-only control. `benchMotion=1` advances
the real patrol over 5.0--6.975 s during each 80-frame block, including the center
crossing. The capital-off control uses the same background and camera. Each run
uses OFF/ON/ON/OFF blocks, each with 20 warmup and 60 retained frames. Full-route
runs were ordered continuous / legacy / legacy / continuous. This chat did not start other renders, tests or asset rebuilds during sampling;
unrelated desktop workloads were not controlled.

Viewport and every backing canvas: 1280 x 720, DPR approximately 1, render scale
1. Fixed Side observer, lattice off, ordinary sky/compositor, one unarmed Aegis,
no active fighter combat. Production armor normals from base `ecb7b132` were
loaded. Source capital asset SHA-256:
`1beda87c9e3b41bfb29f31f56634443720e88698b05d9075a95e9fa39997a5fc`.

| Full compositor, capital on | CPU median / p95, ms | rAF median / p95, ms | Actual submitted draws / triangles |
| --- | --- | --- | --- |
| Legacy run 1 | 1.00 / 1.30 | 13.30 / 13.40 | 15 / 40,370 |
| Legacy run 2 | 0.90 / 1.10 | 13.30 / 13.40 | 15 / 40,370 |
| Continuous run 1 | 1.80 / 2.10 | 13.30 / 13.40 | 15 / 40,370 |
| Continuous run 2 | 1.90 / 2.10 | 13.30 / 13.40 | 15 / 40,370 |

Capital-off full-route submissions were 4 draws / 6 triangles, with median CPU
0.50--0.60 ms. Geometry preparation remained below 0.10 ms at p95. The object
route likewise retained 14 draws / 40,368 triangles including the sky, with moving
continuous CPU 1.80 / 2.40 ms versus legacy 0.90 / 1.30 ms. These are CPU submission
and browser-cadence measurements, not GPU execution timings. Refresh-limited
cadence does not establish spare GPU budget or loaded-combat performance.

The measured additional moving cost is approximately 0.8--1.0 ms here. It is
bounded by one 33-point solve per hull, not per material or source vertex; frozen
fields are cached. Mesh uploads, material draw count and submitted triangles do
not increase. A frozen object-route sample was 1.00 / 1.40 ms CPU, demonstrating
the cache but not substituting for the moving measurement. An earlier DPR-1.5
sample was excluded from the matched comparison.

The lab HUD's full-route triangle/draw totals are estimates that multiply source
geometry by capture count, even for excluded capital captures. The table uses
actual `WebGLRenderer.info` submissions collected by the benchmark hook.

## Regression coverage

`tests/three-production.cjs` evaluates the production shader's sampled transform
at bow, stern and transverse points immediately before/after real center transit.
It checks outbound/return transit, both observer charts, both compositor routes,
shared material fields,
unchanged source vertices and automatic handling of long needle hulls.
`tests/aegis-flight.cjs` checks proper speed through repeated outbound/return
crossings, clearance and immutable geometry reuse. These checks are separate
from the visual review above.
