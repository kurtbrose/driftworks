# Zone-defense battle prototype · 2026-10-25

The previous abstract light clusters and scripted straight tracer exchanges were
removed. The battle mission now runs thirty real model-backed fighters in five
fixed world-space zones. Each zone starts with three allies and three hostiles.
All firing, damage, collision, movement and aiming use production combat paths.

## Behavior checks

A seeded real headless session (seed 29) runs for 25 seconds with the stationary
player given extra test-only hull to prevent early termination. All five zones
retain survivors; active craft remain within 1,300 m of their home centers. The
regression checks actual weapon emission/hits, model hulls, fixed home ownership,
physical return without teleports, rejection of far-away fallback targets and
player intrusion. This does not assert that no pilot can ever overshoot that
radius: the return maneuver uses real turn/acceleration limits.

## Matched rendered comparison

Actual battle page in the in-app browser, 1280 × 720 CSS viewport, 1920 × 1080 backing size, DPR 1.5, 100%
render resolution, production mixed-fleet textures and faction paint. Camera was
unchanged, manually paused shortly after launch, all thirty fighters alive.
Projectile state, AI, asteroid rotation and camera were frozen. Existing static
model-local GPU buffers and per-craft transforms are reused; no mesh rebuild or
new simplified artwork was introduced. Four foreground ABBA blocks used 20
warm-up and 90 measured frames per block. No concurrent tests or render probes
were active during sampling.

OFF removes only the four distant squadrons and their weapon effects from the
render snapshot; the six local ships, camera, scenery and sky remain. ON restores
the complete snapshot. Nonzero geometry is submitted in both cases.

| Render snapshot | CPU median / p95 | Frame median / p95 | Draws | Triangles |
| --- | --- | --- | --- | --- |
| Six local ships | 1.00 / 1.10 ms | 13.30 / 13.40 ms | 34 | 378,115 |
| All thirty ships | 2.40 / 2.70 ms | 13.30 / 13.40 ms | 65 | 397,853 |

The additional real ships cost roughly 1.4 ms render CPU here. Cadence was
refresh-limited; this establishes neither spare GPU budget nor an FPS speedup.
GPU execution and sustained live-combat frame tails remain unmeasured. Existing
shared immutable hull buffers and visibility culling remain the appropriate path;
these measurements do not justify decimating the models or replacing them with
proxy lights. Close target-camera inspection confirmed actual textured hulls;
initial cockpit inspection confirmed normal fighter gunfire and varied headings.
No whole-fleet visual approval or universal performance budget is claimed.

## Source revisions

- `experiments/training.js`: `586c21088999`
- `experiments/flight-missions.js`: `10fcb8a91838`
- `experiments/flight.js`: `17382acdd3c3`
- `experiments/ship-packs.js`: `3589bc24992b`
