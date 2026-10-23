# Spatial indexing and projectile scheduling — 2026-10-23

The default is **grid plus event scheduling**. This pass compares against the
already optimized collision code in commit
`14a503c6d1ccee51c75119959bbbebe560bf8047`, not the original exhaustive resolver.
All measurements are local Node CPU timings with other machine workloads active.
Each variant warms up and records six alternating AB/BA pairs; reported values
are medians. Timings are diagnostic, never correctness thresholds or FPS claims.

## Trace throughput

24 persistent projectile probes over 120 steps, moving Spitfire source meshes,
mixed near/distant paths, damage, marks and near misses. Values are milliseconds
for the complete fixture, not per frame. Probes persist after hitting a ship:
this isolates trace throughput rather than simulating a playable battle.

| Fighters | Previous optimized path | Grid + events | CPU reduction |
| --- | ---: | ---: | ---: |
| 8 | 19.32 ms | 17.78 ms | 8.0% |
| 64 | 99.62 ms | 29.43 ms | 70.5% |
| 128 | 146.55 ms | 42.58 ms | 70.9% |

All implementations use the same precise hull queries. The new variants observe
ship state once per probe batch, updating only escaped padded proxies; the prior
path observes ships per trace. This observation change is part of the measured
optimization. Every pair asserts identical hit count, hit-position checksum,
per-ship health and near-miss timestamps.

| Variant | 8 fighters | 64 fighters | 128 fighters |
| --- | ---: | ---: | ---: |
| Maintained grid | 26.92 ms | 36.30 ms | 52.02 ms |
| Balanced AABB tree | 19.96 ms | 32.53 ms | 51.51 ms |
| Grid + events | 17.78 ms | 29.43 ms | 42.58 ms |
| Tree + events | 23.08 ms | 34.52 ms | 47.45 ms |

Each row has its own paired baseline measurements, so compare using the raw pairs
as well as absolute times. The grid plus events wins these fleet fixtures; the
tree variants remain selectable for testing mixed-size or differently distributed
scenes. Some variants regress small-fleet performance. No universal tree/grid
ranking follows from these workloads.

Raw samples: [fleet comparison](collision-scheduling-fleet.json).

## Real-session and Aegis checks

The real headless 16-fighter furball holds stop/fire with seed 29, warms 0.5
simulated seconds, then measures four seconds (480 substeps). It includes AI,
target acquisition, scenery, comms and transcript generation; graphics, real audio
and DOM work are excluded. Six alternating AB/BA pairs compare each mode against
the retained legacy collision path in the same current runtime. Each pair hashes
the complete session state, events and dialogue and asserts exact agreement.

Grid plus events reduces the measured run from **1,988.00 to 1,793.36 ms (9.8%)**.
The other session reductions are 1.2% for grid, 7.8% for tree, and 5.4% for tree
plus events. These smaller differences are more sensitive to machine noise than
the large-fleet trace results.

Counters include warmup. Both scheduled variants produce 294 shots and reduce
spatial queries from **46,671 to 1,869 (96.0%)**, reusing candidates 44,802 times.
There are 1,080 batch observations, 83 proxy insertions/replacements, 1,711 heap
pops, and 158 queued events remaining. This explains why query-count reduction
does not translate directly to equal total-session CPU reduction.

The current eight-fighter Aegis replay measures **1.2363 to 1.1712 ms/update
(5.3%)**, with identical 166 shots, 162 hits and final health in all six pairs.
It includes gun updates, targeting and geometry preparation but excludes ordinary
fighter AI and rendering. Its baseline loads the actual prior training, Aegis and
hull-query modules from the reference commit.

Raw samples: [session comparison](collision-scheduling-session.json),
[Aegis comparison](collision-scheduling-aegis.json).

## Algorithm and correctness

Ship bounds have a 32 m cushion. A projectile queries a corridor up to 250 ms
ahead, bounded by its lifetime, and caches the candidates. A min-heap schedules
refresh deadlines. The same corridor is spatially indexed in reverse: a ship
escaping its padded bounds wakes overlapping corridors before the next query.
An active-event flag plus state epochs handle superseded events and changes to
roster, order, hull, team or alive state. Stale heap entries are discarded lazily
and periodically compacted. Direct unbatched queries retain full observation for
compatibility with arbitrary same-time edits. Damage-only legacy bolts without
ballistic metadata use immediate queries.

This schedules conservative refreshes, not exact impact times. Nearby candidate
hulls still receive precise per-segment sweeps, and terrain still receives every
segment. Projectile advancement and rendering still visit live bolts normally.
No delayed damage or unchecked lifetime tail is introduced.

The regression suite compares 240 traces against the saved exhaustive resolver
in each of five modes, plus closing-target trajectories, reset, lifetime tails,
spawns, teleports, changing hulls/teams, deaths/revival, terrain, marks and near
misses. Dedicated scheduling cases verify unaffected corridors stay asleep,
inside-envelope motion avoids proxy updates, deadlines pop without new traces,
roster reorder preserves equal-hit ordering, and stale-event growth stays bounded.
Real six-second headless sessions match exactly across all five modes.

The design draws on dynamic bounding-volume trees and event-driven molecular
dynamics' bounding neighborhoods and neighbor lists, rather than requiring a
full physics engine or a general kinetic-data-structure implementation:
[Catto's dynamic BVH notes](https://box2d.org/files/ErinCatto_DynamicBVH_Full.pdf),
[Donev, Torquato and Stillinger](https://math.nyu.edu/inmemoriam/donev/Packing/EDMD.pdf).

Reproduce from the repository root:

```text
node tools/benchmark-projectile-collision.cjs --reference 14a503c6d1ccee51c75119959bbbebe560bf8047
node tools/benchmark-aegis-encounter.cjs --reference 14a503c6d1ccee51c75119959bbbebe560bf8047
node tools/benchmark-collision-session.cjs
```

The fleet tool defaults to all four new modes; `--mode grid-events` selects one.
The session report records source hashes. These tests establish neither a maximum
ship count nor a 5–10x increase in full-battle capacity; those require a fleet-size
sweep including AI, terrain and rendering after each bottleneck changes.
