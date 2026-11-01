# Convoy reception fleet readiness — 2026-10-31

Two production Aegis capitals receive the thirty-freighter convoy at its 7.5 km
arrival corridor. Source geometry is unchanged, roughly 1.3 km long per ship.
The idle Aegis path batches fixed mounts and shares immutable vertex buffers
between both actors; each actor retains its own position/basis, collision and
material/texture state. The stationary combined draw list is prepared once.
No new geometry converter, reduced-detail mesh or runtime dependency was needed.

## Matched scene measurements

Actual convoy flight page, in-app browser foreground, production artwork,
100% scene render scale, 1326 x 1332 backing pixels, DPR 1.5, Open Void sky.
No tests or asset rebuilds ran during sampling. Simulation, AI and projectiles
were frozen in each comparison; only the capital actors were toggled.
OFF / ON / ON / OFF, 20 warm-up and 90 sampled frames per block.

### Approach

Camera: eye [0,3000 m,1200 + 120 m/U], looking toward the reception midpoint. Positions convert metres through the existing scene-unit scale.

```text
Capital ships / Frozen scene / ABBA / 20 warm-up + 90 samples per block
Rendering only; AI and projectiles frozen.
Asset OFF: CPU median/p95 0.90 / 1.20 ms, frame median/p95 13.30 / 13.40 ms, 3 draws, 498 triangles
Asset ON: CPU median/p95 1.30 / 1.60 ms, frame median/p95 13.30 / 13.40 ms, 27 draws, 81266 triangles
Backing 1326 x 1332; DPR 1.5; capital preparation 1518.90 ms
CPU submission only; rAF includes browser pacing, not a GPU timer.
```

### Close underside

Camera: eye [-1450 m,8450 m,1200 - 400 m/U], looking upward at Bastion. Positions convert metres through the existing scene-unit scale.

```text
Capital ships / Frozen scene / ABBA / 20 warm-up + 90 samples per block
Rendering only; AI and projectiles frozen.
Asset OFF: CPU median/p95 0.90 / 1.10 ms, frame median/p95 13.30 / 13.40 ms, 3 draws, 498 triangles
Asset ON: CPU median/p95 1.10 / 1.40 ms, frame median/p95 13.30 / 13.40 ms, 15 draws, 37242 triangles
Backing 1326 x 1332; DPR 1.5; capital preparation 1518.90 ms
CPU submission only; rAF includes browser pacing, not a GPU timer.
```

The pair adds 24 draws / 80,768 triangles in the approach view and about
0.4 ms of median CPU render submission on this machine. In the underside view,
only Bastion contributes: 12 draws / 36,744 triangles and about 0.2 ms. Browser
cadence remains refresh limited. These are submission/cadence observations,
not GPU execution timings or a guarantee of combat frame budget. Initial
preparation measured about 1.52 seconds once; it is not a per-frame cost.

The close camera is inside the capital's broad bounding radius. Inspected the
approach pair, close underside with the hull crossing screen boundaries, and
stern/engine view during live rendering. Original hull structure, armor finishes,
engine hardware and scale remain intact; no disappearing large actor or observed
culling seam. A first draft review-camera comparison was discarded because the
paused scene camera had not been updated; the presets now call the production
camera setter explicitly before rendering or measuring.

The normal convoy/cargo simulation and friendly reception hull contacts remain
active outside the frozen comparison. The pair is idle: it does not launch an
unrequested capital engagement. CPU replay/asset regressions separately check
original scale, shared buffers, separate poses, weapon traces and reset. Full
combat GPU execution remains unmeasured.

Local evidence (ignored): `output/convoy-tactics/arrival-abba.txt`,
`underside-abba.txt`, `arrival-approach.png`, `arrival-underside.png`,
`arrival-stern.png`, and `loaded-scripts.json`. Loaded script version URLs pin
the measured working revision, including concurrent engine-effects edits that
are intentionally outside this convoy commit.

Source Aegis flight asset SHA-256: `1beda87c9e3b41bfb29f31f56634443720e88698b05d9075a95e9fa39997a5fc`.
