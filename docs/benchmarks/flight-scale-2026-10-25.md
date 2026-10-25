# Fighter scaling and optimization - 2026-10-25

**Readiness interpretation superseded:** this initial fixture inherited an
index-proportional AI decision delay. At 512 fighters the first enemy waited
33 seconds, longer than the sample. These are population-scaling measurements,
not a fully engaged cinematic-battle budget. The subsequent effects/crossfire
work removes truncation and checks both teams firing; see
[the engaged battle and effects audit](flight-effects-2026-10-25.md).
The intended cinematic battle is roughly 50-60 fighters; larger populations
are headroom experiments.

The sweep reached 1,024 AI fighters plus the player. The current practical
60 FPS case is 128 fighters; 256 and above still exceed the budget. Simulation
scaling is the main limit, and HUD construction becomes significant as well.
No fighter meshes, materials, effects, physical scales or simulation rates were
reduced to obtain the improvement.

## Conditions

Visible Chrome, 1280 x 720 viewport, DPR approximately 1, full scene resolution,
uncapped frame scheduling, RTX 3070 Ti / ANGLE D3D11, Ryzen 9 3900X. Production
mixed fighter artwork, sky, scenery, target monitor, GPU HUD and normal audio
paths remain enabled. The production furball session uses seed 29 and the dense
fixture from `tools/stress-flight.cjs`, with player stop/fire demand. Counts
exclude the player. The camera and starting fixture are the same for each count.
The dense layout grows vertically with population; it does not place every
fighter mesh inside the viewport. Culling remains enabled.

Each configuration starts a new battle, warms for two wall seconds, measures
12 wall seconds, then disables only `session.advance`, warms for one second and
samples another four seconds. The latter is a diagnostic with other frame
maintenance still active, not a pure renderer or GPU benchmark. The active tab
must remain visible and submit geometry. Checks and other benchmarks were stopped
during measurement. No GPU timer extension was available. CPU stage timers
include nested work and should not be summed as independent components.

The baseline is commit `46da258a11399a657e6b1d035673f6b55b871c46`.
The initial sweep used the clean checkout. The later reference recheck intercepts
only `training.js` and `gpu-ui.js` with that commit's source; all other resources
remain the same. Later reports include hashes of the measured source modules.

## Changes driven by profiles

1. The 256-fighter baseline profile spends most of its sampled CPU time in
   exhaustive separation scans and their vector subtraction/distance helpers.
   A tick-local 64 m spatial grid narrows the unchanged 50 m separation rule.
   Entries move after each craft update. Candidates retain original roster order,
   including initially living craft destroyed during the tick, so sequential
   steering and accumulated avoidance corrections retain their original semantics.
2. The 512-fighter follow-up profile identifies grid string construction, fallback
   opponent scans, current-target scans and repeated distance sorting. Nested
   numeric maps replace string grid keys. Current targets use an ID map; fallback
   scans run only when needed. Stable insertion retains exactly the nearest three
   opponents used by the existing target-choice rule.
3. HUD `quad` construction is a measured hot path. It now writes into the retained
   interleaved vertex buffer directly instead of allocating/concatenating six
   vertex arrays per glyph or marker. Buffer growth and painter order are retained.

## Initial and final sweep

Mean frame interval and its reciprocal describe the sampled browser cadence,
not instantaneous FPS. The final column is frame interval p95.

| AI fighters | Baseline mean frame | Final mean frame | Final average FPS | Final frame p95 |
| --- | ---: | ---: | ---: | ---: |
| 128 | 15.41 ms | 14.89 ms | 67.2 | 15.1 ms |
| 256 | 162.87 ms | 29.07 ms | 34.4 | 59.1 ms |
| 512 | 532.20 ms | 128.17 ms | 7.8 | 177.3 ms |
| 1,024 | not sampled | 221.94 ms | 4.5 | 265.5 ms |

The intermediate grid-only pass measured 58.70 ms/frame at 256 and 164.49 ms at
512. The second simulation pass measured 37.05 ms and 136.26 ms respectively.
The final HUD pass reduces live mean HUD cost from 5.85 to 3.27 ms at 256 and
from 20.19 to 11.21 ms at 1,024. These are separate live runs, not fixed-snapshot
CPU microbenchmarks.

At 128 the final CPU mean/p95 is 10.14/12.30 ms, versus 14.65/18.40 ms in the
initial baseline. Individual long frames remain: final HUD maxima are around
54-73 ms. This work does not resolve every intermittent stall.

All 128/256/512/1,024 AI fighters remain alive throughout the final samples.
Normal hit/shield state is visible in the captures. At 16 fighters, where combat
kills ships during measurement, final mean CPU is 5.46 ms versus baseline 5.31 ms;
that small difference does not establish a speedup for ordinary small battles.

## Simulation progress and presentation limit

The production clock caps simulated elapsed time at 100 ms per rendered frame.
At overload, FPS alone hides slow simulation. The final 512-fighter run advances
9.00 simulated seconds in 11.92 sampled wall seconds; 1,024 advances only 5.40
in 11.99. The 256-fighter run advances approximately in real time. The clock cap
was preserved.

With only session advancement disabled, the final mean intervals are 14.78 ms
at 128, 14.76 ms at 256, 19.64 ms at 512 and 44.39 ms at 1,024. HUD means are
1.91/2.82/4.77/10.17 ms. Scene preparation/submission, contact/comms maintenance
and other frame work still contribute. GPU execution time remains unmeasured.
This supports further CPU work before reducing ship geometry or resolution.

A reversed-order original-code recheck gives 177.05 ms at 256 and 23.91 ms at
128. The 128-fighter baseline is sensitive to cadence and catch-up load; its two
runs span roughly 42-65 FPS. The 256-fighter improvement is visible in both
baseline runs. Do not treat these short samples as portable hardware budgets.
A final-code confirmation at 128/192/256 is recorded separately.

## Validation and artifacts

`tests/flight-separation.cjs` compares actual sessions against exhaustive
separation, linear current-target lookup and full stable target sorting. It checks
state, events and dialogue across sequential movement, overlap, exact 50 m and
cell boundaries, region differences, deaths, teleports and retargeting.
`tests/gpu-ui.cjs` compares complete submitted vertex bytes against the previous
quad writer, including transforms, glyph/image UVs, painter order and growth past
initial buffer capacity.

Baseline 256 and final 128/1,024 captures were visually inspected for real mixed
hulls, thrusters/projectiles, scenery, markers, target previews, bars, text and
comms composition. No missing geometry or displaced HUD primitives was apparent.
This is not portrait/cast acceptance. Dense marker overlap at large counts remains
a readability problem. Visual acceptance of new asset LODs is unnecessary here:
no asset LODs were introduced.

Reports and profiles:

- [Baseline sweep](flight-scale-before-2026-10-25.json)
- [Baseline V8 profile](flight-scale-profile-2026-10-25-256-profile.json)
- [Grid-only sweep](flight-scale-grid-2026-10-25.json)
- [Grid follow-up V8 profile](flight-scale-grid-profile-2026-10-25-512-profile.json)
- [Second simulation pass](flight-scale-after-2026-10-25.json)
- [Final sweep](flight-scale-final-2026-10-25.json)
- [Original-code recheck](flight-scale-baseline-confirm-2026-10-25.json)
- [Final-code confirmation](flight-scale-final-confirm-2026-10-25.json)

Screenshots beside each report use its filename followed by count and scale.
The next investigation should profile the remaining 256+ simulation workload at
fixed simulation age, followed by contact/comms processing and HUD stalls. Bigger
populations are not yet ready for smooth real-time battles.

## Reproduce

Start `python -m http.server 8000` from the repository root. The optional browser
driver uses a separately available Playwright package and installed Chrome;
there is no new runtime dependency or build step. Set `DRIFTWORKS_BROWSER_MODULES`
if Playwright is outside ordinary module resolution.

```text
node tools/stress-flight-browser.cjs --counts 16,32,64,128,256,512 --output docs/benchmarks/my-sweep.json
node tools/stress-flight-browser.cjs --counts 512 --profile --output docs/benchmarks/my-profile.json
node tools/stress-flight-browser.cjs --counts 256,128 --reference 46da258a11399a657e6b1d035673f6b55b871c46 --output docs/benchmarks/my-baseline.json
```

`--scales 1,0.5` adds a resolution comparison. `--confirm` retains the short
100-fighter full/half-resolution comparison. Population options support 2-2,048
fighters; these are experiment limits, not readiness claims. Profile-enabled runs
have profiler overhead and are diagnostic rather than cadence comparisons.
