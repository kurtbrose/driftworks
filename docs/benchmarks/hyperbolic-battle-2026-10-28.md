# Hyperbolic carrier battle readiness — 2026-10-28

The default hyperbolic mission now has two armed Aegis carriers, the ordinary
fighter roster, carrier reinforcement, and player-only hangar respawn at R=400 m.
The unarmed comparison flyby remains separately available with `flyby=1`.
Original metre scale, source meshes, materials, pivots and GPU buffer reuse are
retained. Articulated batches apply model-local origin/basis before the shared
axial Fermi map. No runtime asset-network dependency or reduced render scale was
introduced.

## CPU bottlenecks and changes

The previous shared curved-space collision query explicitly returned every ship.
It now queries conservative global-Klein metric-ball AABBs using the existing
spatial grid/tree, with full-scan parity regressions. Capital rounds share one
collision batch instead of independently synchronizing the index. Flat-space
trajectory sleep/deadline reuse remains flat-only.

The new capital controller initially repeated numerical tangent differentiation,
full pose chart transformations for point-only queries, and continuous firing.
It now uses analytic cached tangents, cached point-only Lorentz transforms,
conservative hull rejection, staggered aim sampling and the existing battle's
settled burst/rest cadence. Private rounds are re-expressed only when their
observer chart changes. Exact narrow-phase damage remains authoritative.

## Actual-scene measurements

An ignored browser harness mounts the real production presentation, session,
fighter combat and armed carrier rig. It runs 200 frames with one 1/60-second
simulation advance per frame, discarding 20 warm-up frames and retaining 180.
The viewpoint is the friendly hangar, with black sky and the standard production
materials. CSS 1280x720, DPR 1.5, backing 1920x1080. No other rendering, tests or
asset rebuild ran during each sample. The harness omits the normal HUD/audio and
is not a whole-application or GPU timing measurement.

| Stage | Initial sampled implementation median / p95 | Final sampled implementation median / p95 |
| --- | --- | --- |
| Fighter/session CPU | 2.3 / 6.1 ms | 2.2 / 6.8 ms |
| Capital combat CPU | 7.3 / 15.9 ms | 1.6 / 4.0 ms |
| Presentation CPU | 7.1 / 12.4 ms | 6.4 / 9.1 ms |
| Browser frame interval | 13.4 / 39.9 ms | 13.3 / 26.6 ms |

Both sampled runs submitted a median 255 draws; triangles were 175,392 before and
175,310 after. The source models and resolution are identical. The restored
burst cadence changes the projectile workload: 342 rounds / 74 capital hits
before versus 166 / 47 after in the sampled opening. These are combined gains;
they do not isolate the spatial index alone. A separate point-cache-only sample
reported capital CPU 6.1 / 15.4 ms with the original continuous-fire workload.
The remaining visible cost is principally rendering the fully articulated rigs.
The first sampled implementation already had analytic tangents and coarse hull
rejection; the table does not measure those earlier optimizations separately.

A frozen initial-hangar asset-off/on/on/off comparison used 20 warm-up plus 90
retained frames in each block, at the same 1280x720 / DPR1.5 resolution. Carrier
off: CPU submission 0.7 ms median / 0.8 ms p95, 1 draw and 164 triangles. Carrier
on: 6.0 / 6.9 ms, 247 draws and 174,058 triangles. The outside fighters are out of
this initial hangar frustum; off is expected to contain almost no foreground
geometry. All frame medians/p95s were 13.3/13.4 ms. Refresh-limited cadence does
not demonstrate spare GPU budget; no GPU execution timer was used.

## Correctness and acceptance

- The full project check passed strict types, generated-file validation and all
  140/140 test entries. Existing flat-space grid/tree/event parity checks pass.
- New curved-index regressions cover full-scan parity, authored hulls, spheres,
  shields, grazing shots, near/far poses, four radii and observer rebasing. A batch
  of 20 queries synchronizes the index once and uses spatial queries throughout.
- The real carrier/session regression checks both factions firing/taking damage,
  fighter defense, reinforcement, reused geometry buffers and repeated player-only
  respawns retaining NPCs, world/combat ownership, clocks and carrier damage.
- The actual browser death handler was exercised after 11.6 seconds of combat:
  hull/shields restored to 180/380, combat and NPCs retained, world clock preserved,
  carrier integrity still 18,892 / 18,960. Keyboard launch was also inspected.
- Actual GPU transform feedback passed 640 position/normal cases, including
  articulated pivots/bases. Maximum position residual was 0.0131 m; maximum
  1-cos(normal angle) was 1.37e-7. Eighteen raw/PBR angular projection cases passed
  with maximum centroid residual 0.399 px.
- A follow-up lifecycle regression verifies dead launched fighters retire on
  replacement without discarding their independent wrecks; focused battle tests,
  strict types and generated-asset checks were repeated after that final guard.
- Browser startup reaches Ready; unexpected startup errors now show a failure
  status instead of leaving an indefinite loading message.

Ignored evidence is under `output/hyperbolic-battle/`; disposable harnesses are
under `.scratch/hyperbolic-battle/` and `.scratch/hyperbolic-flyby/`.
