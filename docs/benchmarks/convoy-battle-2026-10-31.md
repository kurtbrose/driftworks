# Convoy battlefield readiness pass — 2026-10-31

The convoy now starts with 108 real background fighters, 54 per side in four
screens, plus the player's three-ship wing. The 30 authored freighters and two
1.2 km Aegis reception ships remain. Standard weapons, health, collision,
projectiles and effects are enabled; all background AI starts within 0.3 seconds.
This pass establishes working integration, not a 60 FPS performance sign-off.

## Browser measurements

The production convoy page was foreground in the in-app Chromium browser at
884 × 888 CSS pixels, 1326 × 1332 backing, DPR 1.5, normal quality and 60 FPS cap.
The camera was the normal forward cockpit view. No other tests, renders or asset
rebuilds ran during the samples. Source is the commit containing this document;
raw snapshots and captures are under ignored `output/convoy-fronts/`.

A frozen background-fighter OFF/ON/ON/OFF comparison used 20 warm-up and 90
sample frames per block. Camera, resolution, cargo, capitals and frozen effects
were identical within each run. Only background fighter presentation was hidden;
this is a renderer ablation, not a simulation comparison.

| Snapshot | Background | CPU submit median / p95 | rAF median / p95 | Draws | Triangles |
| --- | --- | --- | --- | --- | --- |
| Initial battle snapshot | OFF | 3.0 / 3.6 ms | 14.6 / 15.1 ms | 64 | 2,008,380 |
| Initial battle snapshot | ON | 4.6 / 5.4 ms | 14.6 / 15.1 ms | 106 | 2,076,691 |
| Revised collision, fresh sortie | OFF | 2.7 / 3.1 ms | 15.0 / 15.2 ms | 107 | 2,044,725 |
| Revised collision, fresh sortie | ON | 4.2 / 4.6 ms | 15.0 / 15.1 ms | 147 | 2,116,120 |

These are two different evolving battle snapshots, so their absolute timings
are not a before/after speedup claim. Each matched pair demonstrates a modest
1.5–1.6 ms background rendering submission cost and nonzero submitted geometry.
No GPU timer was used. Cadence includes browser pacing and does not establish
GPU headroom. Capital preparation was 312–321 ms at load, outside frame sampling.

The initial live sample reported 33 FPS, 30.3 ms/frame, p95 44.1 ms, with the
simulation stage at 27.4 ms. The revised fresh sortie had startup spikes, then
reported 30.5 FPS, 32.8 ms/frame, p95 44.7 ms; simulation was 25.1 ms, scene 3.5 ms
and HUD 1.9 ms. Those workloads differ and stage times overlap. Live combat
remains CPU-bound on this host; this is playable for behavior feedback but does
not yet meet a consistent 60 FPS budget. No population, physics rate, mesh,
material or physical scale was reduced to conceal that limit.

## Demonstrated bottleneck and bounded optimization

A V8 sample of the real seed-29 headless sortie (four simulated seconds warm-up,
four measured) attributed about 5.0 seconds of self samples to convoy hull
tracing, more than any other function. Every projectile checked all 30 cargo
bounds, even when well outside the convoy.

Gun updates now build a convoy and five packet bounds once per synchronous
collision batch. A segment outside those bounds cannot reach cargo; possible
hits still traverse the original per-ship bounds and exact authored hull BVH.
Bounds are discarded in `finally`; direct trace calls, moved hulls and swept
ramming retain the uncached path. This preserves hollow scaffolding and damage.

A CPU-only OFF/ON/ON/OFF replay used seed 29, one simulated second warm-up and
120 measured 60 Hz batches (two production 120 Hz ticks each):

| Bounds optimization | Batch median / p95 |
| --- | --- |
| OFF | 40.21 / 71.93 ms |
| ON | 37.67 / 55.85 ms |
| ON | 39.59 / 61.01 ms |
| OFF | 50.76 / 91.35 ms |

All four produced 1,284 shots and identical complete snapshot SHA-256 digests.
There is substantial timing drift; this supports removing redundant cargo
queries, not a precise whole-game speedup. Headless VM timings do not predict
browser FPS. Broader projectile/collision profiling is the next performance task.

## Behavioral and visual verification

Headless regression covers real fire and casualties, untouched cargo through the
first minute, four fronts, dispatch ranking and hysteresis, urgent interception,
physical transfer of an existing enemy wing, player target-lock agency, victory
with distant survivors and reset. Batch trace regression compares exact results
against unbatched hull tests, checks generic return values and exception cleanup.

The actual forward cockpit composite was inspected with live shots/effects,
freighter packets, radar contacts, target monitor and both reception ships.
The distant individual-bracket filter keeps the immediate convoy readable;
selected distant targets remain marked. A live unmodified sortie naturally
produced `CONTROL / ASSIST FORWARD SCREEN` before local raiders arrived, with
all 30 freighters surviving (`control-dispatch.png`). This pass does not visually approve new
portraits or change the authored capital artwork.
