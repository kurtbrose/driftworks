# Prebuilt hull trees and scorch clipping — 2026-10-23

Six alternating AB/BA pairs after one warm-up of each path, compared with
`d23bda76d394f5e47473792a452ef4b4d9627e63`. The reference uses its original
`ship-packs.js` and the identical mesh scripts with the generated hull-index
suffix removed. No authored geometry, materials, UVs, anchors, scale or combat
rules change. These are local CPU measurements with other machine workloads
possible; they are not GPU or FPS measurements.

| Workload | Before median | After median | CPU reduction |
| --- | ---: | ---: | ---: |
| First hull query for each of all 16 models, total | 1,809.08 ms | 6.03 ms | 99.7% |
| Warm repeated impact-scorch projection | 861.03 ms | 128.37 ms | 85.1% |
| Actual four-second headless combat sample | 1,757.73 ms | 765.58 ms | 56.4% |
| Warmed script evaluation/registration | 4.38 ms | 16.71 ms | setup cost increases |

Raw pairs, per-model cold-query timings, methodology and optimized runtime hash:
[benchmark JSON](hull-preparation-2026-10-23.json).

## What moved out of combat

`node tools/bake-hull-indices.cjs` appends the exact median-split triangle trees
and mesh radii to the three shipped fleet scripts. It fingerprints vertex content
and preserves signed zero and full double-precision bounds. All 16 models are
covered. The original script content precedes the generated suffix. Runtime tree
adoption is a cached reference lookup; it does not rebuild the tree on a first hit.
Unbaked procedural/test models retain the original builder.

The extra data is **1,568,528 bytes**, increasing the three script files from
24,349,117 to 25,917,645 bytes, approximately 6.4%. The warmed evaluation test
includes registration of all three packs and the runtime helper, with repeated
V8 code-cache reuse. It excludes disk/network transfer and does not establish a
fresh browser parsing budget. The added setup and memory cost is real; it trades
against sorting and tree construction during combat. There is no new runtime
fetch, dependency, or deployment build step. Authoring exports need a rebake;
`npm run check:assets` detects stale data, including same-size vertex edits.

## Recurring work

Scorches still produce the same five layers, original surface clipping,
triangulation order, offsets and 24-mark retention. Plane directions and limits
are prepared once per impact, rather than once per nearby triangle/layer. Polygon
clipping uses two reusable Float64 buffers instead of creating temporary arrays
for every clipping plane. Only completed numeric layers enter craft state.

The scorch fixture warms each model's tree and one mark, then projects eight
marks for every model intersected by the origin-through ray. Every A/B pair checks
the complete mark output with SHA-256. The cold fixture compares exact contact
fractions, points, local points and normals. Model loading is outside both timers.

The real-session fixture uses the production headless 16-fighter furball, seed 29,
stop/fire held, 0.5 simulated seconds of warm-up, then four measured seconds. It
includes simulation, target acquisition, scenery, comms and transcript generation,
and excludes graphics/audio/DOM and asset loading. The half-second warm-up precedes
first contact with several hulls: this is an early-combat sample, not a claim of
56% lower indefinitely warmed steady-state CPU. All six pairs assert identical
complete session state, events and dialogue. The warm scorch test separately
demonstrates a recurring benefit after tree preparation is finished.

## Validation and browser check

The focused regression validates all 16 vertex fingerprints, complete tree
bounds/triangle ownership against the deterministic generator (including signed
zero), exact radii, 192 baked-versus-runtime hull sweeps, real-model scorch output,
and one-time tree adoption. Existing coverage adds 2,400 swept-triangle oracle
comparisons, 80 full-mesh scorch comparisons, retained GPU scorch-buffer checks,
and Aegis damage, hangar and capital-battle tests.

The normal flight browser route was reloaded after asset version refresh. Its
mixed 8v8 scene rendered original textured ships in the target monitor and normal
sky, asteroid, mothership, HUD, moving contacts and NPC shield damage. Viewport
backing was 1920 × 1080 at DPR 1.5, 100% render scale, production artwork, faction
paint and ordinary effects. The console reported no errors; the existing multiple
Three.js-instance warning remains. This is an integration/appearance check, not
a matched browser FPS comparison. Renderer code and submitted source meshes are
unchanged; no GPU-performance improvement is claimed.

Reproduce:

```text
node tools/bake-hull-indices.cjs --check
node tests/baked-hull-indices.cjs
node tests/hull-sweep-index.cjs
node tools/benchmark-hull-preparation.cjs --reference d23bda76d394f5e47473792a452ef4b4d9627e63
```
