# Fleet guidance

`src/fleet-guidance.js` exposes `Driftworks.fleetGuidance`. It is ordinary,
dependency-free JavaScript shared by the browser and headless runtime. Its
positions, radii, velocities and acceleration are in metres and seconds.
The mission adapter owns conversions to scene units.

- `create(bodies, forward?, template?)` derives a compact staggered ball from membership and
  the largest transverse hull radius plus clearance. A long hull’s axial length
  must not inflate sideways spacing. Slots occupy distinct transverse
  exhaust corridors; their longitudinal offsets fill a compact volume. Optional
  ship-forward (default +Y) sets the exhaust axis, independently of world axes.
  An optional list of template offsets preserves authored packet clustering;
  minimal transverse adjustments clear exhaust corridors. Infeasible templates
  throw rather than silently assign overlapping corridors. It assigns nearby
  slots in stable ID order. This is a deterministic greedy assignment, not a global optimizer.
- `step(group, bodies, routePoint, cruiseVelocity, threats, dt)` advances the
  formation reference and physical ships with bounded acceleration. Slot error
  slows or holds the reference instead of stretching the group. Predictive
  separation discourages close approaches, and
  nearby committed threats produce a bounded lateral diversion. Long steps are
  subdivided. Existing slots survive joins/losses; a newcomer gets a clear slot.
  Body position/velocity arrays may be replaced: consume the returned body state.
- `cover(group, protectedBodies, escorts, threats)` returns moving screen goals
  and records protected-ship assignments. Threat exposure, distance from the
  formation centre, travel distance, existing assignments and coverage already
  allocated influence selection. Goals sit outside a supporting plane enclosing
  the protected hull spheres, toward a threat or the exposed formation edge.

Bodies supply `id`, `position`, `velocity`, and a conservative `radius`.
Optional `crossRadius` supplies transverse beam clearance; `halfSize` supplies
world-axis-aligned hull half-extents for local avoidance. Without them, guidance
uses conservative spherical bounds. The convoy supplies both from authored hull
bounds, keeping its long freighters close alongside each other.
Threats supply `position`, influence `radius`, and `weight`. Formation state is
plain JSON data: `anchor`, `velocity`, filtered diversion `offset`, ship
`forward`, `slots` and escort `assignments`. No renderer objects or entity pointers are stored there.

## Convoy integration

`src/convoy-mission.js` initializes the formation from the 30 current freighters,
then advances their actual positions and velocities. The five radio packet
identities remain mission setup; the authored packet layout supplies the formation template. The generic solver
adjusts only transverse engine-wash conflicts and assigns launch stations. Small launch offsets let ships settle
into formation through flight. The mission still supplies the destination and
cruise speed.
Elapsed time advances encounter pacing, but cannot teleport ships to arrival.
Each freighter must physically cross its slot's destination plane to arrive.

Committed raiders influence diversion. Reserve, withdrawn and distant screen
fighters do not. `src/convoy-battle.js` attaches battle-front goals to the moving
formation reference. Coverage is assessed once a second; the two independent
escorts return to their coverage when no hostile is within 1.8 km of it, and
limit combat target selection to 2.2 km from that area. The player remains free
to fly elsewhere. Background battle-screen wings retain their existing AI.

`experiments/convoy-scenery.js` uses actual ship positions for instance offsets
and exhaust. Immutable hull geometry and material batching remain shared.
`Batch.dynamicInstances` tells `src/scene3d.js` to upload changed placement
attributes and recompute placement bounds, including when a previously culled
group moves into view. Static instance clients retain their cached path.

## Current scope

This first pass supports assembly, lateral diversion, speed/cohesion changes
and distributed escort coverage. Freighter hulls keep their authored heading;
full banking turns require matching render and collision orientation changes.
Predictive steering is not a general obstacle planner or a proof of collision
avoidance from arbitrary overlapping starting states. There is one convoy-wide
formation, no independent packet commanders, fighter-pair tactics or dedicated
reserve doctrine yet. Coverage uses current positions and threat influence;
it does not predict weapon cones or measure individual cargo damage priority.

Regression entry points: `node tests/fleet-guidance.cjs`, the convoy checks,
and `node tests/study-culling.cjs`. Inspect actual flight rendering separately;
headless checks do not establish VR performance or visual acceptance.

## First performance and clearance pass (initial, wider layout)

A 60-second, 30-freighter headless assembly probe at 50 ms sampling found no
pairwise overlap of the authored, axis-aligned hull bounds. Guidance plus the
mission adapter measured approximately 0.39 ms median / 0.53 ms p95 per probe
step on this machine. This is CPU timing, not a frame-rate or VR result.

The measured DW-14 asset revisions were `convoy-flight.json: db03bcbcf3b5`
and `convoy-flight.bin: a352de2cefe8` (deployment SHA-256 prefixes).
A foreground comparison in the actual convoy scene alternated cached/dynamic/
dynamic/cached placement updates with camera and simulation paused. Geometry,
textures, effects, camera and backing resolution stayed fixed (1898 × 1275,
DPR 1.5). Each phase warmed for 1.2 seconds and sampled 12 scene-submission
readings over 3.6 seconds. Median CPU submission was 1.10 / 1.20 / 1.10 / 1.00
ms; every phase submitted 65 draws and 2,045,998 triangles. The comparison
isolates placement-update overhead; it does not establish a whole-game speedup.
The renderer was capped at 15 FPS while paused, so cadence is not a spare-budget
measurement. GPU completion and headset VR remain unmeasured.

Temporary probes and the review harness are under `.scratch/fleet-guidance/`.

## Compactness correction

The first implementation used full hull bounding-sphere radii to allocate
transverse exhaust corridors and local separation. The approximately 120 m
fore/aft diameter of a freighter therefore inflated sideways spacing for a
15–17 m wide hull. The original formation envelope was roughly 660 × 800 × 420 m;
the first generated layout was approximately 993 × 1023 × 1059 m.

Using measured transverse radii for slots and actual axis-aligned hull extents
for avoidance removes that artificial ship-length spacing. A smaller uniform
ball still missed the visual intent: six-ship packet clustering. The convoy now
supplies its original clustered shape as a template to the generic solver.
Only local wash-clearance corrections are applied. The resulting launch extent
is about 675 × 833 × 440 m, with 2 m transverse / 8 m longitudinal assembly
offsets. Guidance still moves ships physically and responds to threats.
Regression checks bound both the whole convoy and individual six-ship packets.
A same-camera browser toggle in `.scratch/fleet-guidance/density.html` compares
the original authored geometry with the corrected guidance launch geometry.
