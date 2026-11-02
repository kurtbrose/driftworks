# Battle assets on the local RTX 3070 Ti

The asteroid is a meaningful GPU workload, particularly when centered in view.
The parked mothership is comparatively modest at launch. The dreadnaught pair
has the larger CPU submission cost. Disabling static-actor culling is a separate,
large CPU penalty when the player looks away from the capital ships.

These are desktop rendering measurements, not a headset budget or a diagnosis
of the complete live VR failure. No production rendering changes were made.

## Conditions and method

- NVIDIA GeForce RTX 3070 Ti, driver 610.88; browser reports ANGLE / D3D11 on
  that adapter. This is hardware rendering, not software WebGL.
- Foreground in-app browser, 1280 x 720 CSS, DPR 1.5, 1920 x 1080 scene backing,
  render scale 1, normal materials and production textures/environment.
- Production battle mission at time zero: 30 fighters, two armed dreadnaught
  rigs, asteroid and parked mothership. Simulation, weapons, rotation, sky
  animation and camera are frozen; this does not measure active point defense,
  projectile collision, AI, HUD updates, or the target-camera render loop.
- Starting eye is [0, -195, 93] scene units. Launch orientation is right
  [1, 0, 0], up [0, 0, 1], back [0, -1, 0]. The asteroid-facing case retains
  the eye and points at the asteroid origin, with up
  [0, 0.430472525, 0.902603681] and back
  [0, -0.902603681, 0.430472525]. No camera moves within a comparison.
- Each asset uses visible/hidden/hidden/visible blocks, each with 20 warm-up
  and 90 measured rAF frames: 180 samples per condition. Both camera tests
  were repeated. No concurrent tests, asset rebuilding, or other benchmark
  renders were intentionally run. CPU timing drift between runs is reported
  as ranges rather than collapsed into one precise estimate.
- The existing asynchronous EXT_disjoint_timer_query_webgl2 helper measures
  the main scene, excluding the separate sky context. Every condition returned
  all 180 GPU samples and the timer reported no disjoint/invalid state.
  CPU timing wraps presentation preparation, sky rendering, synchronization,
  and main-scene submission. CPU and GPU numbers must not be added as a
  prediction of frame cadence.
- Asset ablations skip the asteroid draw, use the existing mothership toggle,
  or detach the capital presentation rig. Geometry caches, physical state and
  sky occluders stay intact. Results are net scene-time savings: depth/occlusion,
  driver and scheduling interactions prevent interpreting them as isolated
  intrinsic asset costs or adding savings from different ablations.
- A second mode bypasses only the desktop static-batch visibility test, matching
  that aspect of VR. It does not simulate stereo, headset pixel density,
  compositor, headset CPU/GPU, or the rest of the XR rendering path.
- Nonzero foreground geometry was visually checked. At launch, the asteroid
  and mothership occupy the bottom of the image, and portions of both capitals
  are visible at the sides. In the asteroid-facing test, the asteroid is centered
  and the capitals are outside the view. No capital ablation speedup is claimed
  from that second camera.

## Launch camera: matched ablations with desktop culling

Ranges are the two runs' differences of visible and hidden medians. Triangle
and draw reductions are stable across both runs and describe submitted geometry.

| Hidden asset | Net GPU saving | Net presentation CPU saving | Draw reduction | Triangle reduction |
| --- | --- | --- | --- | --- |
| Asteroid | 0.99-1.12 ms | 0.1-0.3 ms | 1 | 125,668 |
| Parked mothership | 0.45-0.46 ms | 0.1-0.4 ms | 9 | 30,892 |
| Both dreadnaughts | 1.90-2.02 ms | 4.0-6.4 ms | 215 | 73,268 |

The full scene submits 249 draws and 479,455 triangles, with GPU medians
5.83-5.89 ms. The asteroid submits more triangles than both partially culled
capital rigs combined, but the capitals require far more draws. Triangle count
alone does not explain total cost. The two-capital row includes their presentation
effects, not just their hull meshes.

With static culling disabled, full-scene submission rises to 316 draws and
547,775 triangles. GPU medians remain around 5.83-5.85 ms. Asteroid-hidden GPU
savings vary substantially in this mode (0.05-0.37 ms); the desktop launch
asteroid delta should not be assumed to transfer unchanged to the VR path.

## Looking directly at the asteroid

| Mode | Full scene CPU median | Full scene GPU median | Asteroid-hidden GPU median | Net asteroid GPU saving |
| --- | --- | --- | --- | --- |
| Desktop culling, run 1 | 1.9 ms | 5.79 ms | 2.85 ms | 2.95 ms |
| Desktop culling, run 2 | 1.8 ms | 5.78 ms | 1.78 ms | 3.99 ms |
| Culling disabled, run 1 | 8.4 ms | 5.90 ms | 2.88 ms | 3.02 ms |
| Culling disabled, run 2 | 9.4 ms | 5.91 ms | 3.06 ms | 2.84 ms |

Desktop culling submits 26 draws / 377,319 triangles in this view; disabling it
submits 316 draws / 547,775 triangles. Both modes retain the visible asteroid.
The stable full-scene GPU time alongside the large CPU increase demonstrates
the cost of submitting the offscreen actor batches on this machine. Browser
frame intervals stay roughly 14.6-14.8 ms, so cadence alone conceals both costs.

## Implications and remaining work

The asteroid can cost more GPU time when centered than the dreadnaught pair's
net cost in the launch view. That is a view-dependent comparison, not proof
that it is universally more expensive. Its shader/coverage is worth a targeted
quality-preserving investigation. The mothership is not the first optimization
target supported by the launch measurements; close views remain unmeasured.

VR-aware static-actor culling is the strongest demonstrated CPU opportunity.
It must cover both eye frusta and tracked head rotation; enabling the existing
desktop camera test unchanged would be incorrect. A subsequent fix needs
matched measurements and headset validation. Active battle simulation, sustained
combat effects, stereo GPU time, headset frame misses and thermal behavior
remain unmeasured. These tests do not establish that either issue alone caused
the reported VR failure.

## Reproduction and local evidence

Base commit: `5b0b589052ad2572be0ef04fcd1024bda0acc940`. Relevant source SHA-256
prefixes: scene3d `e787d168661d`, flight `fa724c913f48`, presentation
`7176c5117d4f`, asteroid terrain `added36e3407`, station models `83eca9d90de0`,
Aegis flight rig `1beda87c9e3b`.

Ignored probe sources live in `.scratch/vr-asset-proxy/`: `build.py` generates
instrumented copies of the production HTML, flight composition and renderer,
and `probe.js` supplies the comparison button. Run the builder from the repo
root and serve normally; open
`/.scratch/vr-asset-proxy/index.html?mission=battle`, wait for Start flight to
become available, then use Run frozen asset comparison. Add
`&proxyView=asteroid` for the second camera. Production sources are unchanged.

Ignored evidence is in `output/vr-asset-proxy/`: launch and asteroid summaries,
raw per-frame samples for the launch repeat and both asteroid runs, and labeled
`launch.png` / `asteroid.png` captures. The initial launch pass retained its
summary only. Scratch probes and captures intentionally remain outside Git.
