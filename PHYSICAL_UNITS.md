# Physical units: first calibration

These are design values, intended to be tuned. `src/sim.js` owns the hull
catalogue and conversions; each ship saves its own `physical` hull values.
`physicalStats(world, ship)` computes current mass and available acceleration.

| Object | Length | Dry mass | Installed thrust | Empty acceleration |
| --- | ---: | ---: | ---: | ---: |
| Escort | 20 m | 75 t | 73.55 kN | 0.981 m/s² (0.10 g) |
| Cargo carrier | 40 m | 500 t | 196.13 kN | 0.392 m/s² (0.04 g) |
| Tug | 80 m | 3,000 t | 588.40 kN | 0.196 m/s² (0.02 g) |
| Mothership | 1,000 m | 3,000,000 t | 2.94 MN | 0.000981 m/s² (0.0001 g) |

The mothership remains parked by gameplay policy. Its stored ore, fabrication
feedstock, and ready sections count toward its reported mass.

## Space and time

- One world distance unit is 16⅔ metres. Positions and asteroid geometry use this
  conversion; the asteroid's nominal radius of 300 units means a 10 km diameter.
- One tactical simulation second represents 60 physical seconds. Pausing and
  combat slow motion slow that same simulation clock. The HUD clock remains
  tactical seconds; campaign days are a separate, currently inactive clock.
- Physical velocity is tactical velocity × 16⅔ / 60, in m/s.
- Tactical acceleration is physical acceleration × 60² / 16⅔.
- Existing ship `speed` values are work-zone guidance limits, not engine maximum
  speeds. Loading changes acceleration and braking, not that limit. A loaded
  ship can eventually reach the same cruise speed if it has enough room.
- Artwork remains schematic and uses semantic zoom. Hull length is canonical
  metadata, not a measurement of its current screen silhouette. Interaction
  radii and docking/repair animations remain gameplay abstractions.

## Asteroid

The Carbonaceous Monolith is nominally 10 km across, modelled as a sphere of
bulk density 2,000 kg/m³ for mass estimation: approximately 1.047 × 10¹⁵ kg,
or 1.047 trillion tonnes. Its irregular drawn silhouette is not a volume mesh.
The current spin range corresponds to a physical period of about 7.5–13.1 hours.
`asteroidPhysicalStats` returns diameter, estimated mass, density, and period.

The initial 10,125 t ore pool is an accessible working deposit, not the entire
asteroid. Exhausting it does not shrink the body. Gravity and orbital dynamics
are not simulated.

## Industrial loads

All economy quantities labelled tonnes are metric tonnes; physical mass is kg.
Thrust is in newtons. Acceleration follows `thrustN / totalMassKg`.

- Cargo carrier: 500 t dry hull, 180 t propellant and one 100 t platform: 780 t at deployment load, giving 0.251 m/s². Platforms extract 187.5 t/tactical second and send buffered ore every four tactical seconds. Retrieval adds the platform and any unsent ore to carrier mass.
- Depot section: 60 × 40 m, 1,500 t. The fully fuelled tug plus section is 4,950 t, giving
  0.119 m/s². Three sections consume 4,500 t
  and occupy an 80 × 160 m frame. These are ship-scale structures. Carried and
  installed modules share the same schematic dimensions and tug-like semantic
  zoom, so deploying a section does not magnify it into a mothership-scale body.
  `DEPOT_SECTION` and `DEPOT_FRAME` define their canonical dimensions.
- Disabled escort: its actual saved hull mass and cargo contribute to towing
  mass. A fully fuelled standard escort adds 87 t.
- Drone wreck: 75 t tow mass with 24 t recoverable ore. Salvage yield and the
  mass being hauled are distinct. Legacy wrecks without mass default to 75 t.

Approach, surface matching, movement and braking use the same mass-based
acceleration. Cargo transfer is instantaneous at docking, as before. Towing
uses a rigid attachment without momentum exchange on pickup. Turn rates remain
guidance limits (reported in physical rad/s); torque, payload inertia,
and structural tow limits are future work.

## Saves and tuning

The existing v1 save key remains valid. A `physicalUnitsVersion: 1` marker
ensures the one-time conversion scales legacy ore, carried cargo, construction
feedstock and quota by 18.75, preserving their progress against the larger
capacity and section size. Ready/built section counts and salvage yields remain
unchanged. Legacy hulls receive canonical defaults. Repeated loads do not
rescale quantities.

Tune hull `lengthM`, `dryMassKg`, and `thrustN` together with propellant capacity,
extraction rate and section mass. Keep the distance/time conversions explicit:
changing time compression changes tactical acceleration quadratically.

## Propulsion and momentum exchange

src/propulsion.js owns tank defaults, effective exhaust velocity and the shared 32 m/s launcher/catcher envelope. All engine changes use Δv = vₑ ln(m₀/m₁); fuel mass is included in m₀ and falls after each burn. Remaining Δv uses current payload mass. Exhaust velocity is 3,000 m/s for the initial profiles; fighter/carrier/tug tanks hold 12/180/450 t. The catalogue acceleration column above is dry-hull acceleration, not full-tank acceleration.

Ships retain velocity on fuel exhaustion. Cruise speeds are guidance targets, never instantaneous physical caps. Return reserves budget the current relative velocity plus homeward cruise, with a 50% guidance margin and 35 m/s contingency; this is a conservative heuristic for the current parked-mothership scene, not an orbital transfer planner. The catcher supplies terminal braking inside 44 world units at relative speeds ≤32 m/s. Packet collision uses a swept segment to avoid tunnelling. Ship arrivals retain a tiny numerical settling tolerance.

Docking instantly refills from an unlimited depot supply for this slice. An outbound order from a docked craft receives a free impulse capped at 32 m/s, its guidance speed and a nearby stopping-distance limit. Launcher energy and mothership recoil are not modelled. Platform packet launchers similarly have no propellant budget yet. Mining lifecycle and all in-flight packets are saved. A separate logisticsVersion: 1 migration converts old miners once, preserving their ore and replacing old extraction orders with idle carriers.
