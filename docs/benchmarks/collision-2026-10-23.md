# Projectile collision comparison — 2026-10-23

Local Node CPU measurements against commit
`bc588081f073e986e30469f5a25fe02b0f492b54`. Other machine workloads were active;
each case warms both implementations, then records six pairs alternating AB/BA.
Reported times are medians, not portable budgets or frame-rate predictions.
Every pair asserts identical combat outcomes. Both reference collision sources
(`training.js` and `ship-packs.js`) are loaded from the reference commit.

| Workload | Before | After | CPU reduction |
| --- | ---: | ---: | ---: |
| Aegis replay, 8 fighters, mean CPU/update | 1.740 ms | 1.311 ms | 24.7% |
| Trace fixture, 8 fighters, complete run | 63.98 ms | 20.78 ms | 67.5% |
| Trace fixture, 64 fighters, complete run | 433.40 ms | 92.08 ms | 78.8% |
| Trace fixture, 128 fighters, complete run | 854.27 ms | 142.54 ms | 83.3% |

The Aegis case includes targeting, gun updates, real mesh collisions, damage and
geometry preparation, but excludes rendering and ordinary fighter AI. Each run
has 360 updates and produces 166 shots / 162 hits, with exactly equal final health.
This current weapon workload differs from the historical October 20 recording.
Raw pairs and per-run p95: [Aegis JSON](collision-aegis-comparison.json).

The trace fixture submits 24 persistent projectile probes over 120 steps, with
moving Spitfire source meshes, mixed near/distant paths, damage, surface marks and
near misses. It isolates trace throughput; it does not simulate gun lifecycle,
terrain, AI or rendering. Probes intentionally persist after a hit, so this is
not a playable battle. Every pair matches hit count, hit-position checksum,
per-ship health and near-miss timestamps. All six pairs at every fleet size favor
the optimized path. Raw pairs: [fleet JSON](collision-fleet-comparison.json).

Spatial culling avoids distant mesh transforms, hull traversal and near-miss
scans. Empty-space clearance certificates skip spatial queries until projectile
travel plus observed ship displacement could consume their safe margin. Close
hits retain per-step precise hull checks. Allocation reduction replaces sorted
leaf lists and per-triangle padded vertex arrays with near-first traversal and
scratch storage.

There remains a linear, lightweight pose/state observation pass per trace. It
keeps certificates correct when callers move, teleport, spawn or replace ships
between queries at the same simulation time. The sum of all observed ship motion
also wakes certificates more conservatively than per-region motion bounds would.
These are future optimization opportunities; these results do not establish a
maximum ship count or a heavy-combat FPS guarantee.

Reproduce:

```text
node tools/benchmark-aegis-encounter.cjs --reference bc588081f073e986e30469f5a25fe02b0f492b54
node tools/benchmark-projectile-collision.cjs --reference bc588081f073e986e30469f5a25fe02b0f492b54
```

The fleet tool compares with HEAD by default. Regression coverage includes 240 traces against
the saved exhaustive resolver, 2,400 hull-sweep oracle comparisons, spawns, shape
changes, faction changes, deaths, oversized hulls, same-time teleports, terrain
occlusion, surface marks, near misses and the final projectile lifetime segment.
