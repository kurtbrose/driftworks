# Cinematic bridge prototype — 2026-10-26

The actual cinematic scene uses two metre-scale Aegis hulls, independent guns,
Ellis geometry and sky optics, and up to sixteen replenishing AI fighters.

## Frozen render comparison

Foreground in-app browser, 1641 × 969 CSS viewport, 100% render scale, production
materials, initial establishing camera on the terrestrial chart. The screenshot
`output/cinematic-ellis-establishing.jpg` records this framing. Backgrounds were
loaded; planet, nearby carrier and opposite-chart carrier were visibly present.
This records the initial bow-facing placement, before the subsequent broadside
rotation. The broadside placement has not been remeasured. Simulation and
projectiles were frozen. Existing Aegis on/off benchmark: OFF,
ON, ON, OFF, twenty warm-up frames and ninety recorded frames per block.

| Capital geometry/effects | CPU submission median / p95 | Frame median / p95 | Submitted draws | Triangles |
| --- | --- | --- | --- | --- |
| Off | 4.60 / 5.20 ms | 13.30 / 13.40 ms | 413 | 60,290 |
| On | 8.00 / 9.40 ms | 13.30 / 13.40 ms | 1,190 | 326,198 |

These are CPU submission and browser cadence, not GPU execution times. Physical
backing size and DPR were not recorded in this sample. It establishes the cost
of this frozen view, not an active dogfight frame budget or every camera angle.
The capital runtime meshes retain shared immutable buffers and GPU poses.

## Optical aim scheduling

The new bridge main batteries initially solved their optical route every step.
`node tools/benchmark-cinematic.cjs` compares that path against the final 120 ms
staggered cache, using the same two armed rigs and animated transforms, with no
fighters. Sixty warm-up steps and 180 samples per block, ABBA. Identical short
samples each emitted thirty main-battery rounds.

| Path | Median range across two blocks | p95 range |
| --- | --- | --- |
| Recompute every step | 16.24–16.41 ms | 19.49–19.53 ms |
| Staggered cache | 3.73–3.94 ms | 5.41–5.85 ms |

This measures capital simulation plus geometry preparation only, not the whole
game. It demonstrates the CPU aim-solver bottleneck and its reduction. The real
session regression separately requires damage to both capitals across the
wormhole. Active sixteen-fighter frame cost remains unmeasured.

## Visual observations

Inspected the terrestrial establishing view, Rime carrier view and a fighter
pursuit view in the actual browser. Both ships, authored materials, engines,
relative scale and opposite-chart images are visible. The first terrestrial
inspection exposed an unbound texture; the recorded establishing screenshot is
after that fix. The fighter camera can point into dark empty space. Remaining
shot compositions and long-duration combat need further visual review; these
observations are not approval of every cinematic cut.
