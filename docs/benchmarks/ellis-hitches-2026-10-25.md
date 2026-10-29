# Ellis near-throat hitch investigation (2026-10-25)

The reported case is the Ellis dogfight while maneuvering with the wormhole
occupying most of the view. A live near-throat run reproduced a frame-time tail
above the 16.7 ms budget. This investigation identifies an expensive CPU path and
makes a small improvement; it does not establish that the user's exact hitch is
fixed.

## Reproduce and capture

Run `node tools/prepare-ellis-benchmark.cjs`, then `npm run refresh:assets` and
serve the repository. Open:

`http://localhost:8000/studies/ellis-benchmark.html?mission=ellis&gpu=1&view=before-throat&pan=fast&live=1&fire=1`

Press **Measure (2 s warmup + 8 s sample)**. The setup uses the production flight
composition, eight fighters, the Ellis capital patrol, scenery and gunfire. The
player is held just outside the throat and the camera pans. Omitting `fire=1`
retains AI gunfire. `scale=0.5` selects the existing half-resolution comparison.
These live runs use real elapsed time and are not identical trajectory replays.

The exported JSON now includes `rafFrame`, `fullCpu`, `sim`, `bolts`, p99/max values and the
twelve worst CPU frames. `stageStats` also includes `boltGeometry`,
`opticalInverse`, `engines`, `hud`, `radio`, capital, speech and portrait stages.
`rafFrame` uses rAF timestamps; the legacy `frame` field measures time between
presentation completions (the earlier measurements below use that field).
Optical-inverse time is nested inside other stages;
do not add those timings together. Full CPU timing ends before the diagnostic
text update. Asynchronous GPU timers reject disjoint/context-loss results.
GPU stage distributions describe individual submissions, not summed frame GPU
latency. The existing Ellis performance overlay shows simulation, point-defense, scene
and HUD CPU stages. P opens the paused diagnostics; resume flight to observe
active timings.

The `ellisBenchmark` script profile loads the generated
`tests/fixtures/ellis-benchmark-probe.js` before flight boot. Previously, inserting
inline instrumentation inside a managed script block let the next asset refresh
silently remove it. Script-manifest coverage now checks ordering and preservation.

## Measurements before the finite-segment change

Browser: ANGLE / NVIDIA GeForce RTX 3070 Ti / Direct3D11. Viewport 1280 x 720,
device pixel ratio 1.5; the reported first-canvas backing was 1920 x 1080.
All three live samples had valid asynchronous GPU timing and no context loss.
The first-canvas dimensions do not describe every intermediate render target.

| Workload | Frame median / p95 (ms) | Simulation p95 (ms) | Presentation p95 (ms) | Bolt geometry p95 (ms) | Compositor GPU mean / p95 (ms) |
| --- | --- | --- | --- | --- | --- |
| Live, player firing, full scale | 14.8 / 20.8 | 4.0 | 12.4 | not instrumented | 1.79 / 2.71 |
| Live, player firing, half scale | 15.0 / 22.4 | 4.6 | 12.9 | 7.1 | 0.64 / 1.31 |
| Live, no player fire, full scale | 14.8 / 20.5 | 3.3 | 11.8 | 6.5 | 1.73 / 2.51 |

The half-scale run reduced compositor GPU cost without resolving the frame-time
tail. This implicates CPU preparation in this workload; it does not exclude GPU
limits at other resolutions or views. AI rounds continue to exercise the path
when player firing is disabled. Bolt geometry performs a finite-source optical
inversion for each visible-image candidate, and near-throat inversions can require
24 midpoint samples for each of 24 root-search evaluations. A Node-only lead
probe reached 25 ms, but its matched browser lead was roughly 1-2 ms: Node timings
were not treated as evidence of the browser hitch's absolute duration.

## Small optimization and controlled comparison

`ellisOptics.primary` still uses the same 24 midpoint samples for a finite
segment. It now advances the hyperbolic position and slope together using the
addition identities, avoiding a fresh sinh/cosh evaluation at every midpoint.
There is no table-resolution reduction, fewer ray samples, temporal reuse,
projectile culling, shader change or reduction in physical collision detail.

A 1,200-case comparison against the preceding implementation found identical
output directions and a maximum arc-distance difference of 2.05e-12 metres.
The median Node numerical-sweep time was 414.3 ms before and 394.6 ms after.
Independent optical quadrature, live ballistic hit tests and the new analytic
near-throat radial-distance cases validate the numerical behavior.

A separate frozen browser fixture retained the asteroid, eight fighters, a
selected target and 160 optical bolts. A deterministic camera orbit at 350 m
radius was sampled for 240 frames after 20 warmup frames. Runs used ABBA order
(old, new, new, old), with identical positions in every run:

| Version / pass | Presentation median / p95 (ms) | Presentation + HUD median / p95 (ms) | Frame median / p95 (ms) |
| --- | --- | --- | --- |
| Old A1 | 4.9 / 5.9 | 6.8 / 8.1 | 13.3 / 13.4 |
| New B1 | 4.5 / 5.3 | 6.3 / 7.7 | 13.3 / 13.4 |
| New B2 | 4.5 / 5.5 | 6.4 / 8.3 | 13.3 / 13.4 |
| Old A2 | 4.8 / 6.0 | 6.6 / 8.0 | 13.3 / 13.4 |

This supports a modest CPU saving, roughly 7% in median presentation time.
It demonstrates no frame-cadence improvement in the frozen fixture and does not
prove the live hitch eliminated. Next work should use the new worst-frame records
to distinguish accumulated bolt-projection work, simulation catch-up, expensive
lead-search fallbacks and GPU pressure at the user's actual view size. The first
frozen fixture also excludes the capital patrol, so it is not a whole-scene asset
readiness measurement.

## Large radio-start stall

The extended recorder also exposed a distinct intermittent stall. In a subsequent
live capture, the largest completion interval was 93.1 ms and its full-frame CPU
was 90.7 ms. That frame had 1.0 ms simulation, 8.2 ms presentation, 4.0 ms HUD and
77.1 ms in `flightRadio.update`. Substage timers attributed 66.0 ms to
`mumble.render` and 10.0 ms to `mumble.transmit`; radio noise was 0.1 ms and portrait
show was 0.3 ms. Another capture recorded 40.5 ms of radio work in a 50.3 ms CPU
frame. A previous isolated 125.9 ms CPU frame lacked radio substage timers, so its
cause remains unattributed rather than being inferred from these later captures.

`flight-radio.js` currently generates the complete speech PCM and radio processing
synchronously when a line starts. This is independent of wormhole pixel coverage,
but consumes the same main-thread budget as the expensive near-throat scene. It
is a demonstrated source of intermittent hitches, alongside sustained optical
projection costs. Moving or preparing speech generation off the frame-critical
path is the highest-value next fix for those large outliers. That audio lifecycle
change is not part of this patch; mouth cues, channel occupancy, mute/pause and
late-result cancellation will need to remain aligned with actual playback.

Validation: `npm run check` passed all 116 test entries. After the benchmark
instrumentation/profile changes, focused script-manifest and asset validation
also passed. The benchmark ran in the browser after asset refresh, retaining its
controls and reporting full-frame and radio/speech substage timings. No claim is
made that all user-reported hitches are fixed.

## Synchronous speech follow-up

Hoist harmonic brightness weights once per utterance, resolve formant controls
once, and calculate moving formant centers once per sample instead of once per
harmonic. Hoist pitch-curve fallback and envelope timing out of the sample loop.
Skip nasal/creak calculations only when their controls are zero. Preserve all 24
harmonics, sample rate, RNG calls, arithmetic order, cue timing and normalization.

Browser comparison used the same analyzed line, “Wormhole ahead. Keep your weapons
ready!”, at 22,050 Hz. Twelve preset runs alternated old/new execution order, with
the first two runs discarded as warmup. The remaining ten paired utterances
averaged **90.27 ms before / 32.18 ms after** (2.81x faster; 64% less synthesis
CPU); observed ranges were 61–119 ms and 21.7–44.3 ms. Both versions ran in the
same browser document, using the pre-change source captured before editing.
This is isolated synthesis timing, not an Ellis FPS measurement or a promise that
all radio hitches disappear. Radio transmission processing remains synchronous.

The browser comparison produced identical Float32 samples. Frozen pre-change
PCM hashes additionally cover all 15 presets across vowel-groups, flowing and
syllables styles (45 cases), including nasal and creak controls, in
`tests/fixtures/mumble-pcm.json`, checked by `tests/comms-signal.cjs`.

A follow-up live Ellis dogfight run (same near-throat/fast-pan/fire URL) captured
one transmission: synthesis 34.8 ms, radio processing 9.0 ms, radio update 46.5 ms,
and full frame CPU 61.0 ms. This confirms the remaining synchronous stall; the
utterance differs from the earlier capture, so these are not paired before/after
measurements. Full checks were running concurrently; use the isolated paired
comparison above for the speedup, not this integration run's frame percentiles.

Validation: focused audio checks and `npm run check` passed (116/116 entries),
including strict types, script manifests, asset versions and all PCM regressions.

## Background speech follow-up

Flight now runs synthesis and radio filtering in a persistent classic Web Worker,
with a transferred Float32 PCM buffer. Main-thread analysis retains the existing
subtitle/voice plan, and playback/portrait cues start together when the result
arrives. Cancellation terminates an in-flight job and rejects late replies.
Failures retain subtitles rather than falling back to synchronous synthesis.
See `docs/flight-presentation.md` for lifecycle and asset-versioning contracts.

The normal live near-throat/fast-pan/fire benchmark recorded 536 frames after
worker integration: main-thread synthesis and radio-filter calls were both zero;
radio-update mean/p95 was 0.32/0.90 ms. Full-frame CPU p95/max was 21.5/39.3 ms.
These scene timings are observations, not a matched before/after FPS comparison.

A temporary instrumented copy of that production benchmark additionally wrapped
native Worker messages and Web Audio source starts. Nine requests returned nine
PCM results and started nine 22,050 Hz sources, with zero worker errors and zero
main-thread synthesis/filter calls. Observed request-to-delivery latency ranged
from 26.8 to 109.7 ms (including scheduling/startup), during which the scene kept
running. The recorder's sample in this integration run still contained a 61.6 ms
CPU frame, demonstrating that other hitches remain. No claim is made that all
near-wormhole stalls have disappeared.

Focused regressions use a real background thread to compare speech/filter PCM,
noise plans and timing byte-for-byte, and deferred transport tests cover busy
channel ownership, playback-clock cues, pause/reset/mute/pagehide, stale jobs,
worker failures, timeout and suspended audio contexts.

Validation: focused audio/worker/portrait checks passed. After updating the old
synchronous portrait fixture to deliver an explicit worker reply, the complete
`npm run check` rerun passed all 117 entries, types, manifests and asset checks.

## Optical arc-length follow-up

After the worker migration (`f6bcbf45`), the next measured busy-frame CPU cost
remained optical weapon-trail geometry (roughly 6–7 ms in earlier live captures).
Its primary-path arc-length integral evaluated sinh/cosh for every Simpson
sample. Advance both hyperbolic components with the addition identity instead,
retaining the same two 33-sample Simpson parts, compact metric and analytic
exterior tail. Skip a part entirely when its interval is zero (common for
near-throat endpoints inside the constant core). This follows the finite-segment recurrence already used by the
inverse solver; it does not reduce quadrature resolution or change gun behavior.

In 1,600 deterministic old/new queries spanning both charts, near-throat and
exterior radii, and transmitted/turning/direct paths, all 1,596 existing paths
kept identical direction vectors. Maximum path-length difference was
1.82e-12 m. A separate proper-radial quadrature oracle covers 36 transmitted and
15 turning paths through the core, transition shell and exterior; worst distance
error was 0.000122 m (regression limit 0.002 m).

A same-document native-browser comparison alternated execution order over 12
rounds and discarded two warmup rounds. Per 1,600 queries, ten-run mean fell from
**16.85 to 14.34 ms (14.9% less solver CPU)** for the final version. Full checks
were running concurrently, so absolute wall timings vary with machine load; both
versions ran in the same document with alternating order. The earlier recurrence
change alone measured 24.86 to 23.10 ms (7.1%) in a separate paired run.

Initial recurrence-only production-renderer orbit checks used an asteroid, eight fighters, a
selected remote target, 160 bolts and a 350 m camera radius (20 warmup + 240
samples). Scene median/p95 in old/new/new/old order was 3.5/4.2, 5.5/6.8,
5.5/6.6 and 5.7/7.3 ms. The first run differed substantially from later runs;
these results do not establish a scene-time speedup. All four runs retained
13.3/13.4 ms rAF median/p95. Claim only the paired isolated solver saving, not
an FPS gain or resolution of all near-wormhole hitches.

The final zero-span-skipping version also completed the same renderer orbit: scene
median/p95 5.7/7.5 ms and rAF median/p95 13.3/13.4 ms, with full checks running
concurrently. The final rendered view was inspected; this run is an integration
check, not evidence of an FPS improvement.

Validation: optical, ballistic and effect-batching checks passed; `npm run check`
passed all 117 entries. Strict types and asset versions were also rechecked after
the final zero-span skip.
