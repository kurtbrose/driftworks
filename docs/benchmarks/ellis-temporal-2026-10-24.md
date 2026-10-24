# Ellis temporal reuse experiment

Opt-in URL: `experiments/flight.html?mission=ellis&bridgeTemporal=1`.
The default remains full geometry; `bridgeGeometry=adaptive` remains a separate
spatial-only control. Temporal mode adds spatial adaptation automatically.
`bridgeTemporalTile=1` selects the rejected single-pixel pattern; default tiles
are 8x8 hit-map texels (16x16 display pixels at half-resolution mapping).

## Preliminary measured result

RTX 3070 Ti / ANGLE D3D11, 1280x720 CSS at DPR 1.5 (1920x1080 scene),
seed 29, frozen limb view, 2 s warm-up + 8 s sample, same capture sizes.
Measurements preceded the full check suite; no power measurement was made.

| Variant | Hit-map GPU ms | Total geometry GPU ms | Presentation CPU ms |
| --- | ---: | ---: | ---: |
| Spatial adaptive control | 2.791 | 4.053 | 1.346 |
| Temporal, alternating single pixels | 2.789 | 4.049 | 1.513 |
| Temporal, alternating 8x8 tiles | 1.813 | 3.078 | 1.464 |

Total geometry includes hit map, full-resolution composition and masked refinement.
Tiles saved about 35% of hit-map time and 24% of adaptive geometry time in this
static view. Single-pixel alternation saved essentially nothing; coherent GPU
execution is a plausible explanation, not a verified driver-level attribution.
These are single matched samples, not a general gameplay or FPS improvement.
Raw results and excluded preliminary cases: [JSON](ellis-temporal-2026-10-24.json).

## Algorithm and limits

Two persistent nearest-filtered hit maps ping-pong; a map is never sampled while
being written. Alternate tiles attempt history reuse; the rest trace fresh.
History stores path parameter, region, hit/miss and one-frame freshness, not color.
Accepted hits sample current capture colors. Reused samples cannot themselves be
reused, limiting history age to one frame even during rotation. The live sky and
additive weapons/engines are not cached.

Rotation-only reprojection maps the current world ray into the old camera basis.
With the same eye and static geometry, the curved optical path is unchanged.
Translation is rejected rather than applying straight-line depth reprojection.
Mixed hit/chart neighborhoods, the critical band, invalid angular budgets and
surface residuals trigger fresh tracing. Tiny details remain a limitation of the
underlying spatial hit map. No claim of full moving-silhouette acceptance is made.

The caller supplies a conservative geometry revision including simulation time,
poses, lifetime, appearance, scenery and batch/asset descriptors. Any change,
translation, region switch, resize, focal change, fast turn or missing revision
invalidates history. Therefore normal simulation-driven dogfighting currently
gets little or no reuse. This prototype demonstrates a static-scene saving;
localized moving-object rejection or curved-path motion tracking would be needed
to retain it during gameplay. Default rendering is unchanged.

The benchmark's frozen mode originally advanced scenery time and correctly had
zero eligible history. It now freezes both clocks. The first pan fixture also
passed an outdated world camera snapshot after changing pose; those results are
excluded and the fixture is corrected.

## GPU context-loss finding

The far-side fighter fixture repeatedly lost WebGL contexts, including with
`bridgeTemporal` absent and no synchronous pixel comparison. Thus the earlier
comparison-readback hypothesis does not account for every failure. Logs show
context loss/restoration, not a proven shader compilation error or root cause.
Moving-fighter, corrected rotation and throat-crossing browser acceptance remain
incomplete. Do not enable this by default based on the static timings.

Context loss/restoration now invalidates cached hits and forces both radial
capture charts to refill. Benchmark runs expose a context-loss count and are
marked invalid if it is nonzero; timer queries stop after loss. Synchronous
reference comparison is disabled for temporal runs. The tests exercise ping-pong
ownership, motion/region/rotation/resize/missing-revision rejection and context
recovery. These mechanical tests do not replace browser visual acceptance.

## Reference

[Epic's volumetric fog documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/volumetric-fog-in-unreal-engine#temporalreprojection)
describes temporal reprojection and trails from rapidly changing light. Applying
history reuse to finite-geometry Ellis rays is this experiment's engineering
adaptation, not a result established by that source.
