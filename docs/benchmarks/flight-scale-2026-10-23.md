# Fighter-count stress test — 2026-10-23

The next bottleneck is **non-gun combat/AI work and comms roster scans**, rather
than precise projectile collision. Fifty fighters fit comfortably inside the
CPU-only mean budget on this machine, with much less spare time in the tail.
One hundred fighters exceed the 16.67 ms budget for 60 FPS before rendering.
This establishes a simulation limit for these fixtures, not a renderer capacity.

## Measurements

Production `tools/headless.cjs` session, baked hulls and ordinary weapons,
health/shields, damage, movement, target acquisition, scenery and comms. Each run
warms 0.5 simulated seconds and measures another 12 seconds in 60 Hz batches
(two 120 Hz simulation substeps per batch). Counts exclude the controlled player.
Three seeds/repeats use ascending and reversed count order. Other machine work
may affect timings; no timing threshold is a correctness assertion.

The stock mission spawn stretches its wings as count grows. A separate dense
fixture places each team in a compact 60 m grid, roughly 600–720 m apart, using
the normal facing, speed, controller and loadouts. It does not add ships at
overlapping positions, inflate health, bypass gun gates or force shots.

Values below are medians of the three runs' respective means/percentiles, not
percentiles pooled across all samples. Raw samples retain every run's summary,
stage totals, shot/hit counts, live population, frame-budget exceedances and
source hashes: [scale report](flight-scale-2026-10-23.json).

| Layout | Fighters | Mean CPU/batch | p50 | p95 | p99 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Stock | 16 | 2.81 ms | 2.16 ms | 6.47 ms | 9.32 ms |
| Stock | 50 | 7.97 ms | 7.16 ms | 13.23 ms | 17.56 ms |
| Stock | 100 | 19.00 ms | 18.62 ms | 23.50 ms | 26.24 ms |
| Dense | 16 | 3.66 ms | 2.23 ms | 9.90 ms | 15.10 ms |
| Dense | 50 | 7.94 ms | 7.39 ms | 12.40 ms | 15.41 ms |
| Dense | 100 | 19.12 ms | 18.79 ms | 22.03 ms | 25.58 ms |

Across 2,160 measured batches per row, stock 50 exceeds 16.67 ms 42 times (1.9%);
stock 100 does so 1,979 times (91.6%). Dense 50 exceeds it 11 times (0.5%);
dense 100 does so 2,144 times (99.3%). Rendering, GPU, DOM layout and real audio
are excluded. The headless harness's per-substep observation/transcript work is
included, so these are not exact browser-frame predictions. External invariant
scans and the final separation scan are outside timed regions. Instrumentation
adds overhead. No claim is made that 50 fighters achieve a full-scene 60 FPS.

## Where the time went

Median mean-stage costs in the dense fixture:

| Fighters | Combat excluding gun updates | Comms |
| --- | ---: | ---: |
| 16 | 0.65 ms | 0.20 ms |
| 50 | 4.32 ms | 1.05 ms |
| 100 | 12.92 ms | 3.27 ms |

The combat value is the inclusive combat-step timer minus the aggregate gun-step
timer. That also subtracts the controlled player's gun work, which runs outside
the combat step, so it slightly understates non-gun combat cost. It is an
approximation covering AI, steering, separation, target selection and other upkeep.
Parent/child timers overlap and must not be summed. In the representative dense
100-fighter run, gun updates cost 1.45 ms/batch, with precise mesh queries at
0.42 ms and scorch generation at 0.04 ms (both included in gun updates).

A separate V8 sampling run after four simulated seconds of warm-up, measuring
the next four seconds at 100 fighters, puts `training.length`, vector subtraction
and the per-craft loop at the top. Comms emotion cleanup and its per-craft scans
are also prominent. This agrees with the full-roster separation loop and repeated
lookup/filter loops in targeting and comms. The sampling profile is diagnostic,
includes profiler overhead, and is separate from the counter-instrumented runs:
[sampling report](flight-scale-profile-2026-10-23.json).

The next implementation candidates are:

1. Query nearby ships for the existing 50 m separation rule, retaining its exact
   steering behavior and participant ordering. Reuse the maintained spatial index.
2. Build ID and pursuer lookups once per update, replacing nested full-roster
   `find`, `filter` and `some` calls in AI and comms. Retain event and dialogue
   timing; lower-frequency polling is not necessary to get this benefit.

## What broke, and what this does not test

- Every run completed all 12 measured seconds. No duplicate entity IDs or
  non-finite health/pose/velocity/basis values were found. The controlled player
  survived, and no fixture advanced to another wave.
- Stock runs retained all fighters. Dense runs ended with 12/16, 49/50 and
  100/100 alive, so the large-fleet timings are not hiding population collapse.
- The existing 16-name callsign pool repeats: 34 duplicate labels at 50 fighters
  and 84 at 100. IDs remain distinct; expanding cast/name assignment is a separate
  presentation/comms task.
- The dense fight becomes less productive at 100 ships. Representative shot/hit
  counts over the observation interval, including initial warm-up counter values,
  are 828/404 at 16, 628/149 at 50, and 418/40 at 100. Minimum final center
  separation at 100 is about 10.1 m. This is evidence of crowding/engagement issues,
  not an assertion that hulls collided (the final scan is not a swept hull test).
- Stock 100 also fires fewer shots than stock 50. These are actual AI fights,
  not worst-case all-guns-firing projectile storms. More simultaneous fire could
  impose a higher cost after the AI bottleneck is reduced.
- Seeds affect comms variation, but these fixtures produce the same aggregate
  shots/hits and survivor counts across seeds. They are timing repeats, not three
  substantially different combat geometries.
- Renderer submission, GPU load, real input/audio, long battles, saves and wider
  fleet distributions were not evaluated. The next renderer sweep should follow
  the demonstrated simulation bottleneck rather than infer FPS from these numbers.

Reproduce without installing dependencies:

```text
node tools/stress-flight.cjs
node tools/stress-flight.cjs --counts 16,50,100 --seconds 12
node tools/stress-flight.cjs --profile 100 --layout dense
```

The fixture changes only the isolated runtime's mission resolver/spawn setup;
ordinary mission definitions and the production game remain unchanged. The
development tool asserts population setup, unique IDs and finite simulation data.
