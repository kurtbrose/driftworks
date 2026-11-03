# Local fleet flocking

`src/fleet-guidance.js` exposes `Driftworks.fleetGuidance` to ordinary browser
scripts and headless Node sessions. Distances are metres and time is seconds.

## Behavior

The art direction is cinematic fleet choreography: deliberate capital-ship
arcs, readable breakaways and a coherent volume of traffic. Handling numbers
support that appearance; maximizing use of fictional thruster limits is not
the objective. Nose/travel alignment matters more than strict spaceflight
realism. Future maneuver policies should preserve local independence while
giving group turns and departures a readable shared intent.

The convoy's authored staggered packets are a launch condition and a qualitative
visual target. There are no assigned positions or moving formation frames that
pull the ships around. `create(bodies, forward)` observes the starting centre;
the legacy optional template argument is ignored. `group.slots` is retained as
an empty compatibility field and is never read by steering.

Each ship observes up to ten nearby neighbors within 500 m. A 10 Hz local
assessment combines predictive hull separation, velocity alignment, comfortable
distance cohesion, a route preference, and avoidance of a widening aft engine
wash region. Packet affinity strengthens local cohesion without prescribing
where any member must sit. Isolated ships get a gentle return preference.
Threat pressure acts separately on each ship according to its own distance.
Safety steering can reduce desired speed and steer away from future proximity.
These heuristics are not a formal collision-free planner.

Each body owns its heading. Heading changes are bounded (default 0.045 rad/s),
including a defined axis for a 180-degree reversal. Main thrust, braking and
lateral acceleration have separate limits (1.2 / 1.8 / 0.75 m/s²), with
combined acceleration capped at 1.83 m/s². Ships brake for sharp course changes,
and their turn rate also respects the transverse acceleration available at
their current speed (0.6 m/s² reserved for bending the flight path). This keeps
the nose and actual velocity aligned instead of letting the hull swing
broadside to its existing motion. Side thrust corrects slip; it does not
provide a separate sideways cruising goal. Physics runs
at the caller's timestep; local steering assessments are cached by body ID in
`group.controls`. This cache survives the mission adapter rebuilding body views.
The observed centre and mean velocity are recomputed after integration. Actors
never inherit a shared positional displacement or orientation.

Bodies supply `id`, `position`, `velocity`, `radius`; optional `crossRadius`,
`halfSize`, `packet`, `forward`, and `turnRate` specialize geometry and agility.
Derived local `intent`, `targetSpeed`, `neighborIds`, `localGoal`, and
`cohesionError` are review telemetry, not fixed destinations. `frame(forward)`
returns the common right/up/back pose used by hull rendering and collision.
`cover(group, protectedBodies, escorts, threats)` retains threat-aware escort
allocation with assignment hysteresis.

## Runtime integration

`src/convoy-mission.js` persists individual freighter forward vectors and adapts
authored hull dimensions to SI body views. Arrival occurs after every surviving
freighter has physically crossed the destination plane; the ships then stop
as an arrived fleet. Elapsed encounter time cannot teleport them to arrival.

`experiments/convoy-scenery.js` shares the original DW-14 mesh buffers, materials
and paint atlas. It updates small per-instance position/right/forward/up arrays.
Both production shader paths rotate positions and normals with those poses.
Frustum culling uses conservative rotation-independent instance bounds.
Derived target views and current hull queries use the same individual poses.
Moving contact queries sweep translation in the current oriented hull frame;
they are not exact continuous rotating-mesh sweeps.

## 3D review playground

Open `studies/convoy-guidance.html`. The primary view is the production Three.js
scene renderer and original textured ships, with the normal flight sky and
lighting. The camera is independent of the simulation: right-drag looks,
WASD flies, Q/E moves vertically, Shift speeds up, wheel dollies, and left-drag
orbits. Click a ship and choose Focus selected for a close view. Following the
fleet/selection translates the camera only; it never rotates the actors.

Cruise, 90-degree turn, flank pressure, joins/departures, and combined presets
remain available, alongside pause/step/scrub and PNG export. Steering, trails,
velocity and coverage overlays are optional and off by default. Preset seeking
clears manual orders. Pressure contacts exercise guidance, not weapon damage.
Review escorts and departing ships use a bounded transit adapter. Hull-bound
overlap counts are conservative review signals, not exact mesh contacts.

The important visual checks are compactness, readable independent turns, smooth
local merging, plausible clearances and absence of catastrophic traffic behavior.
A particular arrangement of ship coordinates is not an acceptance criterion.
Tests cover finite trajectories, bounded turn/acceleration, changing relative
positions, observed group centres, membership, replay and posed hull geometry.

Lighting can switch between the game skies and a brighter inspection light.
The expandable performance check freezes simulation and camera, then samples
without/with/with/without convoy geometry and engines. A local desktop pass at
1265 × 957 backing pixels (DPR 1.5), turn preset at 45 s, measured scene CPU
medians of 0.2 / 1.3 / 1.3 / 0.2 ms, with 57 draws and 1,922,552 submitted
triangles in the full view. Median frame cadence stayed 13.3 ms. These are
local observations, not GPU completion measurements or a VR performance claim.
Original geometry and materials remain shared across instances; only pose
buffers change as the ships turn.

## References

- Craig Reynolds, [Boids](https://red3d.com/cwr/boids/) and
  [Steering Behaviors](https://www.red3d.com/cwr/steer/gdc99/).
- Reynolds' [OpenSteer implementation and demos](https://opensteer.sourceforge.net/doc.html)
  provide practical steering examples and emphasize visual tuning.
- Dru Erridge, [Group Pathfinding & Movement in RTS Style Games](https://www.gamedeveloper.com/programming/group-pathfinding-movement-in-rts-style-games),
  discusses production group movement and game-specific priorities.
- Davis, Karamouzas and Guy, [NH-TTC](https://arxiv.org/abs/1907.05945),
  explores anticipatory avoidance with constrained vehicle motion models.
- Olfati-Saber, [Flocking with Obstacle Avoidance](https://authors.library.caltech.edu/records/nqd0k-mws17).

The current implementation borrows the local steering structure; it does not
claim the convergence or collision guarantees of those research models.
