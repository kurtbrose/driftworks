# Ellis wormhole performance evaluation — 2026-10-23

The full-resolution geometry-lensing shader is the demonstrated bottleneck. Skipping rolling capture updates removes approximately 808k submitted triangles/frame without improving cadence. Bypassing only geometry ray traversal retains captures and returns to the ~75 Hz presentation limit. Lowering resolution improves cadence but does not by itself reduce power when the extra headroom is spent on more frames.

## Conditions

Windows / ANGLE D3D11, NVIDIA RTX 3070 Ti, 1280×720 CSS viewport, DPR 1.5; full 3D backing 1920×1080. The 75% run uses 1440×810 for 3D scene/compositor rendering while the sky canvas remains 1920×1080. All frozen limb cases use the same eight fighters, seed 29, pose [80, -2320, 1550] m, 384 px capture faces, and default two capture faces/frame. Each sample has two seconds warm-up and eight seconds collection. No test suite or rebuild ran during sampling. The original game tab was backgrounded; the measured tab reported visible. Full and geometry-bypass blocks were repeated around the other tests to check drift.

NVIDIA telemetry was sampled once per second and aligned to each eight-second sample (eight hardware observations/run). Power/utilization cover the whole GPU, not an isolated render pass. Fan speed lags workload because of temperature; it is not an instantaneous optimization score. The initial helper incorrectly checked a WebGL2 timer extension on the WebGL1 sky context. Both render contexts support timer queries; follow-up direct GPU measurements and the correction are recorded below. The old `gpuTimerAvailable` fields in the first ten runs are unreliable. Presentation CPU excludes simulation and most DOM/HUD work. Frame timings include browser scheduling and display cadence; subtracting refresh-limited frame times is not an exact GPU pass duration.

## Results

| Case | Mean FPS | Frame median / p95 ms | Presentation CPU ms | GPU mean % | Board power W |
|---|---:|---:|---:|---:|---:|
| full-a | 47.3 | 17.2 / 45.7 | 1.16 | 91.6 | 255.2 |
| no-geometry | 75.2 | 13.3 / 13.9 | 1.10 | 40.8 | 190.8 |
| no-capture-updates | 47.7 | 16.6 / 55.1 | 0.86 | 85.1 | 254.1 |
| sky-only | 75.1 | 13.4 / 16.7 | 0.70 | 56.6 | 200.0 |
| no-geometry-b | 75.2 | 13.3 / 14.0 | 1.11 | 44.1 | 192.1 |
| full-b | 47.6 | 16.5 / 41.2 | 1.16 | 86.4 | 255.7 |
| scale75 | 73.7 | 13.3 / 18.0 | 1.11 | 83.9 | 254.5 |
| cap30 | 30.0 | 38.6 / 40.6 | 1.37 | 74.8 | 227.2 |
| approach-cap60 | 56.2 | 14.5 / 35.3 | 1.26 | 91.1 | 255.5 |
| live-fire-cap60 | 46.7 | 17.6 / 44.3 | 2.26 | 87.4 | 254.3 |

`no-geometry` bypasses the post shader's geometry tracing while retaining the sky lens, primary render, effects path and capture renders; geometry is deliberately unwarped, so this is diagnostic. `no-capture-updates` fills all twelve faces first, then retains those textures while skipping subsequent capture clears/draws; only valid for the frozen scene. `sky-only` is the existing `bridge=sky` control. The 30 FPS cap uses full image quality. The approach case uses the normal start at [0, -3250, 1550] m and cap 60. Live firing is a separate moving combat workload and cannot be subtracted from frozen cases.

Counters come from Three renderer.info after each submitted render, rather than the main renderer's conservative capture estimate. The frozen full path averages 58 capture draws / 807,858 triangles, 30 primary/effect draws / 404,009 triangles, and about 2.3 screen draws (including the independently throttled target monitor). The primary/effect group can contain more than one full-resolution pass. Raw per-stage counters are in the JSON.

## Interpretation and next experiment

- Full close-up rendering averages about 47.5 FPS and 255 W. Presentation CPU is about 1.16 ms, while the GPU averages 86–92% utilization. Geometry tracing is the primary target, not model simplification or capture frequency.
- The live firing sample averages 46.7 FPS, 2.26 ms presentation CPU and 254 W, with variable actor/effect counts. Its p95 frame interval is 44.3 ms: the current renderer still has substantial pacing variation.
- A 75% render scale gives 73.7 FPS but still about 254 W. It improves speed, not quietness, when uncapped.
- The full-quality 30 FPS cap lowers measured power to about 227 W (roughly 11% below the full uncapped mean), with the expected loss in motion smoothness. The original game settings were verified unchanged at cap 60 / scale 100%.
- The next bounded prototype should reduce the number of pixels doing expensive geometry intersection work while keeping full-resolution sky/texture sampling and refining silhouettes/critical-ring regions. A separate long-term experiment can replace general depth marching with precomputed intersections against simplified scene proxies. Neither proposal has yet been implemented or benchmarked.

## Literature and applicability

[SpaceEngine's two-stage rendering](https://spaceengine.org/news/blog220812/) separates low-resolution geodesic work from full-resolution background distortion for its warp/black-hole effects. Applying a similar split to our geometry-hit mapping, with full-resolution fallback at discontinuities, is an engineering adaptation; the post does not establish that coarse interpolation is safe at an Ellis critical ring.

[Bruneton 2020](https://arxiv.org/pdf/2010.08735) precomputes ray deflection and accretion-disc intersections, exploiting spherical symmetry. We already precompute the Ellis integral, but still march to find arbitrary geometry. An Ellis intersection/proxy scheme would need a new derivation and validation; Schwarzschild tables cannot simply be reused.

[James et al. 2015](https://arxiv.org/html/1502.03809) treats distant sources as two celestial spheres, and uses finite light-beam footprints plus spatial/time filtering for high-quality images. This supports the sky/near-geometry separation, not a free solution for nearby fighters. [SpaceEngine's capture scheduling](https://spaceengine.org/news/blog220920/) is already represented by our rolling faces; the measured capture bypass makes it a low-priority optimization here.

## Reproduction and artifacts

Run `node tools/prepare-ellis-benchmark.cjs`, then open `/studies/ellis-benchmark.html?mission=ellis&view=limb`. Use `ablate=geometry`, `ablate=captures`, `bridge=sky`, `scale=0.75`, or `cap=30` for the corresponding controls. Keep one profiler tab, fixed viewport, and no competing tests/rebuilds. GPU monitoring command: `nvidia-smi --query-gpu=timestamp,utilization.gpu,power.draw,temperature.gpu,fan.speed --format=csv -l 1`.

[Raw frame/counter data and source hashes](ellis-performance-2026-10-23.json) · [aligned GPU samples](ellis-performance-gpu-2026-10-23.csv). Production rendering and play settings were not changed by this evaluation.


## Direct GPU timer follow-up

The timer helper was corrected to use `EXT_disjoint_timer_query` for the WebGL1
sky and `EXT_disjoint_timer_query_webgl2` for Three's WebGL2 context. Queries are
polled asynchronously only after availability, and disjoint batches are discarded.
All five follow-up runs reported zero invalid queries. A few final queries can
remain pending when the eight-second sample ends; they are omitted rather than
forcing a GPU synchronization. These runs happened after the test suite finished.

For the separately tagged full renderer, the compositor averages **11.54 ms GPU**
(p95 12.14 ms), the sky 0.20 ms, capture faces 0.223 ms each (about 0.45 ms/frame),
and primary/effect renders 0.958 ms each (about 1.92 ms/frame). Other screen work
includes the throttled target camera. These are execution timings, not CPU render
submission or frame-interval subtraction. The geometry-bypass control reduces the
combined screen render time to about 0.19 ms/frame, corroborating the main diagnosis.
Raw follow-up data are stored in `gpuTimingRuns` in the JSON.

The initial timer-capability claim in this report and prior Ellis benchmark reports
was incorrect: their helper used only the WebGL2 extension name on the first
(WebGL1 sky) canvas. Historical timing samples remain frame/CPU measurements; do
not reinterpret them as GPU timings. The main findings from ablation and NVIDIA
power telemetry remain unchanged.

Validation: `npm run check` passed after the initial profiling-tool changes. Later
optional timer instrumentation was checked with Node syntax validation and the
actual WebGL runs above; production sources were not changed during this task.


## Explicit hoisting and the proposed next approximations

A development-only `hoist=1` shader variant moves the impact root and start/end
path parameters into `EllisRay` initialization. The generated GLSL was checked to
remove that work from `ellisPoint`, and compiled/rendered without browser errors.
Tagged compositor GPU times were 11.54 ms (control), 11.32 ms (hoisted), then
11.63 ms (control repeat). This suggests about 0.22–0.31 ms, or 2–3%, improvement
in this sample; it does not establish what the driver compiler already hoisted,
or a significant whole-game FPS improvement. The variant remains in the benchmark
only; production optics and quality are unchanged.

The suggested empty-space skipping and adaptive traversal should be designed
together: a conservative occupancy/depth hierarchy can reject whole curved-path
intervals, while the existing bracket/refinement and residual rejection handle
potential hits. Ordinary straight camera-ray bounds alone would miss lensed
branches. Reducing steps without conservative rejection risks reintroducing missed
surfaces and moving strips.

The next bounded prototype remains a separate geometry-hit map: use fewer expensive
intersection evaluations in smooth regions, preserve native sky/texture sampling,
and refine full-resolution silhouettes, depth/chart discontinuities and critical
ring regions. The existing scene resolution control already leaves the sky at
native resolution; the new split would additionally preserve foreground geometry
and reconstruct hit data rather than blur a completed color image. This is our
engineering adaptation of the two-stage reference, not a result already validated
by those papers for arbitrary Ellis geometry.
