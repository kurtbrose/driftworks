# Browser fighter-count sweep — 2026-10-23

The rendered browser scene does not show a sustained pixel-rendering bottleneck
at 16 or 50 fighters on this machine. At 100, simulation and HUD work grow while
scene preparation/submission stays close to 3 ms/frame. Reducing scene resolution
to 50% in each dimension (quarter pixels) does not improve frame timing.

## Setup and limits

Visible, hardware-accelerated Chrome; NVIDIA GeForce RTX 3070 Ti through
ANGLE/D3D11; Ryzen 9 3900X. Viewport 1280 × 720, DPR 1, production mixed hulls,
faction paint, normal sky/scenery, live target camera, HUD and real audio paths.
The active cap is disabled; requestAnimationFrame is still paced around 75 Hz
(13.3 ms). This cannot establish maximum throughput beyond that display cadence.
The WebGL GPU timer extension is unavailable, so there are no measured GPU
durations. Resolution comparisons are evidence about pixel sensitivity, not a
complete GPU profile or a claim about weaker hardware.

The development runner intercepts only the browser response for `flight.js`,
prepending wrappers around existing factories. It sets seed 29, fighter count,
the same dense layout as `tools/stress-flight.cjs`, and stop/fire player demand.
The production frame loop handles elapsed time, targeting, comms, scene and HUD.
No production game source, asset geometry, materials or gameplay rules change.
Counts exclude the player. Each configuration starts a new sortie, warms for
two wall-clock seconds and measures twelve wall-clock seconds. This is one
short scene per configuration, not a broad hardware or camera benchmark.

Full and half resolution runs share initial positions and demand but are not
frame-exact replays: real frame cadence changes simulation batches and encounter
evolution. Visibility culling remains enabled. These are total populations, not
100 detailed fighters simultaneously filling the screen.

## Initial sweep

| Fighters | Scene scale | Mean frame | Frame p95 | Mean CPU | Simulation | Scene prep/submit | HUD |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 16 | 100% | 14.03 ms | 13.4 ms | 6.34 ms | 1.10 ms | 2.76 ms | 1.65 ms |
| 16 | 50% | 13.90 ms | 13.4 ms | 6.55 ms | 1.14 ms | 2.82 ms | 1.64 ms |
| 50 | 100% | 13.57 ms | 13.4 ms | 7.86 ms | 2.15 ms | 2.74 ms | 2.01 ms |
| 50 | 50% | 13.56 ms | 13.4 ms | 8.08 ms | 2.22 ms | 2.87 ms | 2.05 ms |
| 100 | 100% | 14.06 ms | 13.5 ms | 12.52 ms | 5.24 ms | 2.94 ms | 3.14 ms |
| 100 | 50% | 14.26 ms | 13.5 ms | 12.50 ms | 5.25 ms | 2.91 ms | 3.05 ms |

The repository checks overlapped the end of the initial sweep, including the
100-fighter measurements. Use the separate confirmation run for conclusions at
100; those initial rows are retained transparently rather than discarded.
There were no browser page errors. CPU totals include additional frame work
outside the three displayed timers. CPU timers measure JavaScript work, not GPU
completion. Frame p95 can be lower than the mean because occasional stalls raise
the mean: initial worst intervals ranged from 53 to 120 ms. A separate trace is
needed to distinguish GC, first-use resources, portrait updates and other causes.

Mean submitted scene/sky draw calls were about 99, 145 and 142 at 16/50/100;
triangles about 444k, 530k and 656k. Different hulls, visibility and damage mean
draw calls need not rise monotonically with fleet population. Initial live mean
survivors were about 13.3, 49.2 and 100 respectively.

## Diagnostic simulation freeze

After each live run, the harness disables only `session.advance`, warms one
second and measures another four seconds at the final live snapshot. Other
frame maintenance, acquisition, scenery, comms display, HUD and rendering remain
active. This is a diagnostic, not a second gameplay mode or perfectly frozen
renderer benchmark. It consistently returns to a roughly 13.3 ms typical frame
cadence; initial mean CPU at full resolution was 3.56/5.22/7.97 ms. Its scene
composition differs from early combat, so subtracting these totals from live
totals would not isolate exact simulation cost.

## Clean 100-fighter confirmation

With the repository checks finished, repeating both resolutions gives:

| Scene scale | Mean frame | Frame p95 | Mean CPU | CPU p95 | Simulation | Scene prep/submit | HUD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100% | 13.88 ms | 13.4 ms | 11.15 ms | 14.7 ms | 4.61 ms | 2.68 ms | 2.79 ms |
| 50% | 13.87 ms | 13.4 ms | 11.17 ms | 14.7 ms | 4.64 ms | 2.58 ms | 2.82 ms |

All 100 fighters remain alive throughout both samples; no page errors occurred.
Typical cadence remains at the display limit, but worst frame intervals were
106.7/79.8 ms. HUD timer maxima were 50.9/54.2 ms; scene prep/submit maxima were
4.8/4.6 ms. This makes HUD spikes worth tracing, without proving their underlying
cause from these coarse timers. GPU completion is still unmeasured.

`npm run check` passed, including type checks, asset validation and the full
dependency-free suite. The browser runner also checks active sample count and
finite measurement values; its syntax check passed. Screenshots were reviewed
at 16 and 100 fighters to verify real ship artwork, scenery and the live HUD.

## Interpretation and reproduction

Continue with browser-measured simulation scaling before spending effort reducing
ship triangles or resolution. The existing nearby-ship separation and shared
roster lookup candidates remain relevant. HUD/contact processing is now also
worth profiling. Investigate intermittent long frames separately; good typical
cadence does not make those stalls disappear.

The earlier Node headless times are not browser CPU budgets. That harness uses
VM-hosted code, fixed simulation batches and observation/transcript work; this
test uses the real browser context and variable frame cadence. Differences in
warm-up and encounter age also matter. Use headless runs for reproducible
behavior and relative simulation diagnostics, and browser measurements for the
actual frame budget.

Start `python -m http.server 8000` at the repository root. The optional tool
requires a separately available Playwright package and installed Google Chrome;
it adds no site dependency or build step. If Playwright is outside normal Node
resolution, set `DRIFTWORKS_BROWSER_MODULES` to that `node_modules` directory.

```text
node tools/stress-flight-browser.cjs
node tools/stress-flight-browser.cjs --confirm
```

Run with other benchmarks/checks stopped. `--confirm` repeats just 100 fighters
and writes a separate report. Raw summaries:
[initial sweep](flight-browser-2026-10-23.json),
[confirmation](flight-browser-confirm-2026-10-23.json).
Screenshots alongside the JSON record each final live camera view.
