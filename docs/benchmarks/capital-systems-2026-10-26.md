# Capital system damage readiness, 2026-10-26

Production `scene3d` renderer; source baseline `0306716c`, current Aegis bake
with the same 44,252 triangles, metre scale and materials. Foreground in-app
browser, 902 x 939 CSS viewport, 1,353 x 1,409 backing size, DPR 1.5, render
scale 100%. Fixed wide eye offset [500, -2100, 1200] m from ship origin;
no motion, fighter AI or effects during this isolated comparison. Each block
uses 20 warmup and 60 measured frames. Baseline/current/current/baseline, then
hidden/destroyed/destroyed/hidden. CPU includes geometry pose update, renderer
sync and submission. GPU execution is not timed.

| State | CPU median / p95 ms | Frame median / p95 ms | Draws | Triangles |
| --- | --- | --- | --- | --- |
| Baseline intact | 1.30 / 1.50 | 13.40 / 13.90 | 103 | 44,252 |
| Current intact | 1.50 / 1.80 | 13.20 / 13.60 | 128 | 44,252 |
| Current all systems destroyed | 1.60 / 1.80 | 13.10 / 13.60 | 128 | 44,252 |
| Hidden control | 0.20 / 0.30 | 14.40 / 15.00 | 0 | 0 |

Independent engine material groups add 25 submissions; no triangles were
removed. Immutable geometry remains shared and posed by GPU transforms.
Destruction changes only the affected assembly's cached UV buffer and material.
This preserves module independence rather than batching through damage boundaries.
The 0.2 ms intact submission increase is small in this fixture; frame cadence is
refresh limited and does not establish GPU headroom.

The actual Aegis flight encounter was also sampled after about 10 seconds of
combat, with 8 hostiles, 2 wingmen, both moving capitals and existing projectiles
then frozen by the built-in benchmark. Same backing size and DPR, production
artwork, ordinary sky/effects. ABBA asset off/on/on/off, 20 warmup + 90 measured
frames/block:

| Capitals | CPU median / p95 ms | Frame median / p95 ms | Draws | Triangles |
| --- | --- | --- | --- | --- |
| Off | 4.90 / 5.40 | 14.60 / 15.10 | 204 | 178,970 |
| On | 8.00 / 8.70 | 14.60 / 15.10 | 446 | 265,586 |

This includes the production presentation and target camera, but freezes AI and
projectiles. Separate deterministic 8-fighter / 360-step CPU replay measured
3.027 ms mean capital update (median of six runs), with 166 shots / 159 hits
and identical final HP across repetitions. Its baseline-reference equality check
against the earlier hull-only code intentionally fails (162 earlier hits):
new turret surfaces now intercept three previously unobstructed rounds. The
new narrow phase is bounded by cached local AABBs and excludes the firing gun.
The tools now load the shared collision module before training.

Visually inspected: full ship at range; upper heavy, point-defense and underside heavy turrets with their neighbors
intact; one central drive scorched with four neighboring drive faces lit; the
production U selection marker and keyboard cycling between heavy/PD mounts.
Mechanical regression strikes all 24 mounts and five drives, checks localized
health, one explosion, disabled firing, cached buffers, reset, all-engine stop,
and probe/nearer-fighter occlusion. These do not constitute a visual review of
every articulated mount angle. GPU timing and sustained high-fleet combined
simulation/rendering remain unmeasured.

Captured evidence lives in `studies/capital-*-scorched.png`,
`studies/capital-subsystem-target.png` and the two `capital-systems-*-metrics.txt`
files. The reusable inspection lab now compares current intact/damaged systems;
the temporary source-baseline copies used for this measurement were removed.
