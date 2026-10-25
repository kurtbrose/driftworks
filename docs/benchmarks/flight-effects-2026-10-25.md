# Engaged fighter battle and effects capacity - 2026-10-25

The cinematic target is roughly 50-60 fighters. Larger fleets are headroom
experiments. The corrected 60-fighter battle averages 72.8 FPS on this machine,
with both wings firing, hundreds of active projectiles and overlapping deaths.
This supersedes the battle-readiness interpretation of the earlier
[population sweep](flight-scale-2026-10-25.md).

## What was hiding load

The old spawn used `decision = index * 0.13`. At 512 fighters the first enemy
had to wait 33.28 seconds before making an attack decision. A two-second warm-up
and 12-second sample therefore measured many inactive pilots. At 60, the old
startup also favored one wing. Spawn decisions now stagger modulo 16 within
1.95 seconds, preserving the existing 16-fighter startup pattern. The dense
headless/browser fixtures explicitly apply that bounded stagger so source-reference
comparisons can use the same engaged workload.

There were also real visual truncation points: the flight presentation, scene
setter and draw loop each retained only the last 12 explosions. Flight simulation
dropped destruction flashes and wrecks above 48; the tactical renderer dropped
transient effects above 260. These insertion-count limits are removed. Existing
age cleanup remains: impacts 0.22 seconds, destruction effects 5.5 seconds, flight
wrecks 120 seconds, other tactical transients 0.5 seconds. Persistent scorch/history
budgets are separate and unchanged.

No hard active-bolt count limit was found in fleet aggregation, gun geometry or
scene effect submission. Fleet aggregation now appends each effect once instead
of repeatedly concatenating all preceding fighters' arrays. The audit checks
active simulation bolts/impacts against emitted geometry, and destruction flashes
against native scene explosion submissions on every measured frame. Those counts
do not imply every effect occupies a visible pixel: normal camera clipping,
physical size, depth occlusion and region rules still apply. This work does not
add artificial misses, damage, shooting frequency or cosmetic duplicate shots.

## Measurements

Visible, hardware-accelerated Chrome; Ryzen 9 3900X, RTX 3070 Ti / ANGLE D3D11,
1280 x 720, DPR approximately 1, full scene resolution, mixed production fighter
hulls, sky/scenery, HUD, target monitor and ordinary audio paths. Uncapped browser
scheduling is near 75 Hz. The dense fixture uses seed 29, player stop/fire demand, the pilot camera with
no user camera motion, and ordinary weapon, shield, damage, steering and aiming rules. Checks/other benchmarks were stopped.
GPU timing is unavailable; CPU stage times do not measure GPU execution.

| Workload | Mean frame | Mean reciprocal FPS | Frame p95 | Mean CPU | CPU p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 60 engaged AI fighters, live | 13.73 ms | 72.8 | 13.5 ms | 8.60 ms | 15.5 ms |
| 128 engaged AI fighters, live | 15.66 ms | 63.8 | 26.7 ms | 14.13 ms | 26.2 ms |
| 60-craft frozen scene, 30 explosions | 13.50 ms | 74.1 | 13.5 ms | 10.83 ms | 13.8 ms |

The live cases warm two wall seconds and sample twelve wall seconds. Both advance
approximately twelve simulated seconds. The 60-fighter sample fires **1,442 shots**
(855 allied/player and 587 enemy) and registers 705 additional hits. Peak active
load is **569 bolts, 96 impacts and seven destruction effects**. Every active bolt
and impact emits its quad; all destruction records reach the renderer. The final
population is 53. At 128, 2,012 shots are fired during the sample, with peaks of
718 bolts, 101 impacts and four destruction effects, ending at 124 survivors.

The frozen pressure test is deliberately synthetic and separate from live FPS.
After normal startup it emits one real weapon volley per craft, destroys 30
alternating participants through the production damage resolver, sets those
blast snapshots to age 0.2 seconds, then disables session advancement. The scene
contains 30 surviving fighters plus 30 retained wrecks, **268 bolt quads, two
impact quads and all 30 explosions / 360 explosion layer batches**. Total scene
and sky submission is 427 draws / 479,550 triangles. It warms this snapshot for
two seconds, then samples twelve seconds. Its zero simulation cost must not be
interpreted as the cost of running a live battle with 30 simultaneous fresh deaths.
Mean presentation preparation/submission is 9.39 ms, p95 12 ms.

The live 60-fighter case has useful typical headroom, but intermittent long
frames remain: its worst frame is 53.3 ms and the HUD timer reaches 50.9 ms.
The 128-fighter case misses the 60 FPS tail budget. Larger-population results from
the earlier under-engaged fixture are not equivalent combat workloads and cannot
establish the new fully engaged fleet limit. Camera, battle age and deaths alter
rendered geometry, so these short live runs are not frame-identical A/B replays.
Long battles with accumulated wrecks, moving cinematic cameras and other GPUs
remain unmeasured.

## Verification

- `tests/flight-effects-capacity.cjs` preserves 60 simultaneous destructions and
  wrecks through the actual presentation expression, emits all 4,096 synthetic
  active bolt quads plus 128 impacts, includes shots owned by destroyed shooters,
  and checks lifetime cleanup and bounded large-wing startup.
- `tests/three-production.cjs` queues every native material layer for 60 complete
  explosions, verifies scene list ownership, and checks empty-frame pool cleanup.
- The separation and target-choice session oracle still checks original-order
  steering and stable target semantics; the GPU UI buffer oracle verifies exact
  submitted vertex bytes, transforms, UVs and growth.
- The live 60-fighter and frozen 30-explosion captures were visually inspected.
  Mixed hulls, scenery, tracer colors, explosion fireballs/debris, HUD text/bars,
  radar and the target preview were present. The burst visibly contains far more
  fireballs than the previous 12-effect cap. This is not cast/portrait acceptance.
- `npm run check` passes strict types, script/asset validation and all 120/120
  dependency-free test entries.
- Browser reports contain no page errors. Geometry/submission count assertions
  pass on every sampled frame. Source hashes accompany the reports.

The F3 performance overlay now includes submitted explosion count, explosion
layer batches and additive effect vertices. These expose effect load alongside
frame time and triangle/draw counts.

## Artifacts and reproduction

- [Engaged battle measurements](flight-engaged-2026-10-25.json)
- [Live 60-fighter capture](flight-engaged-2026-10-25-60-1.png)
- [Frozen pressure measurements](flight-effects-burst-2026-10-25.json)
- [30-explosion pressure capture](flight-effects-burst-2026-10-25-60-1.png)
- [F3 counts readout](flight-effects-diagnostics-2026-10-25-60-1-diagnostics.png)
  (paused UI verification during checks, not a performance comparison)

Serve the static site on port 8000. Use the optional external Playwright setup
described in the [earlier sweep](flight-scale-2026-10-25.md#reproduce).

```text
node tools/stress-flight-browser.cjs --counts 60,128 --output docs/benchmarks/my-engaged-run.json
node tools/stress-flight-browser.cjs --counts 60 --effect-burst 30 --output docs/benchmarks/my-burst.json
```

`--effect-burst` is an explicit frozen renderer pressure fixture, not a gameplay
mode. It does not change shipped weapon or damage rules. Continue optimizing from
the fully engaged 50-60 fighter case and its effect peaks; further work should
address intermittent stalls and measured costs of larger simultaneous bursts.
