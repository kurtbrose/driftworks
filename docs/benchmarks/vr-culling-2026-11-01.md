# VR static-actor culling

Flight VR now rejects static actor batches only when their transformed bounds
are outside both current XR eye frusta. Previously it bypassed actor culling
entirely. This addresses the CPU submission penalty identified in the
[asset comparison](vr-asset-proxy-2026-11-01.md). It does not change asteroid
surface shading, double-sided materials, simulation, model scale or geometry.

## Matched desktop proxy

RTX 3070 Ti / ANGLE D3D11, foreground browser, 1280 x 720 CSS, DPR 1.5,
1920 x 1080 backing. Production battle mission, 30 fighters and both capital
rigs; time-zero camera, actors, weapons and sky animation frozen. All assets
stay present in both conditions. Only static actor rejection is toggled.

Two repeats each use OFF/ON/ON/OFF blocks, 20 warm-up plus 90 measured frames
per block. Every condition has 180 valid asynchronous GPU timer samples;
no disjoint state was reported. Viewport and visibility checks reject invalid
comparisons. No concurrent tests or other benchmark renders ran during sampling.

The probe calls production `flightVr.frusta()` with synthetic asymmetric,
physically separated eyes, then passes those planes through the production
renderer culling branch. The synthetic vertical FOV is 45 degrees, the same
as the desktop camera; physical eye separation is 64 mm. This isolates the
new culling logic without pretending to reproduce headset optics or stereo GPU
execution. The actual native XR path is checked separately below.

| Frozen view | Culling | Presentation CPU median | Main-scene GPU median | Draws | Triangles |
| --- | --- | --- | --- | --- | --- |
| Launch | OFF | 5.0 ms | 5.82 ms | 316 | 547,775 |
| Launch | ON | 4.3 ms | 5.82-5.84 ms | 253 | 481,325 |
| Asteroid-facing | OFF | 4.8-5.2 ms | 5.92 ms | 316 | 547,775 |
| Asteroid-facing | ON | 1.3 ms | 5.75-5.76 ms | 26 | 377,319 |

Ranges span the two runs' medians. CPU includes presentation preparation,
sky rendering, synchronization and scene submission; GPU timing measures only
the main scene. GPU tail timing is variable; there is no consistent GPU-tail
improvement. Browser cadence remains around 13.3 ms. The demonstrated
improvement is reduced CPU submission, not a whole-game GPU or FPS claim.
The asteroid and parked mothership remain visible in the asteroid-facing view.

## Native WebXR integration and visual checks

A disposable XR emulator exercises the vendored Three WebXR manager and the
production `prepare -> frusta -> renderSky -> render` path. Its wider synthetic
per-eye projection uses horizontal tangents +/-0.85 and vertical +/-1, with
64 mm eye separation. This is not the 45-degree timing fixture above.

Inspected both eye images looking forward with culling ON/OFF, then left 90
degrees, backward, right 90 degrees, downward, and forward again. Both capital
ships, asteroid and mothership return in the forward view; the side/rear views
retain the expected stars/distant fighter where visible. No browser errors
were reported. Entry/exit and tracking reported correctly in the emulator.
Forward submission is 280 draws ON versus 316 OFF; side/rear views submit
13-15 draws ON, and the downward view submits 143. These are submitted batch
counts, not per-eye GPU timing. The asteroid/mothership's existing non-actor
submission path remains outside this optimization.

Automated regressions cover 8,000 independent comparisons between extracted
eye planes and actual per-eye projection, including head and ship rotations,
asymmetric eye visibility, metre conversion and missing/invalid tracking data.
Another 1,500 transformed source boxes are checked against an asymmetric
plane/corner oracle, including negative scales and source bases; explicit edge
and near-plane/camera-inside cases remain visible.

Quest frame misses, compositor behavior, sustained battle simulation and
in-headset visual acceptance still need a hardware trial. This does not establish
that culling alone resolves the reported large-battle failure.

## Local evidence

Ignored sources: `.scratch/vr-culling/build.py`, `probe.js`, `build-xr.py`,
`emulate.js` and `xr-monitor.js`. The builders copy current production source;
the profiling hooks do not ship. Serve and open
`/.scratch/vr-culling/index.html?mission=battle` for the matched proxy, or
`/.scratch/vr-culling/xr.html?mission=battle` for the native XR emulator.

Ignored evidence: `output/vr-culling/first-raw.json`, `repeat-raw.json` and
`xr-*.png` captures. Early desktop ON/OFF screenshot attempts with an unretained
canvas buffer yielded blank-world captures and are rejected as visual evidence;
they do not affect the nonzero measured rendering samples. The accepted visual
checks use the continuously rendering native WebXR emulator and its captures.

Validation: focused VR and culling tests pass, including when the staged
renderer is loaded independently of concurrent convoy edits. Strict type/any
checks, generated script lists and asset validation pass. The full `npm run check`
encountered a convoy-mission engine-wash clearance assertion in the concurrently
edited convoy implementation, so repository-wide validation is not green.
