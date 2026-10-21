# Aegis modular capital ship study

Open `experiments/dreadnaught-kit.html` through the ordinary static server. This
self-contained Three.js experiment uses only the vendored library and controls.
It is separate from gameplay and does not change simulation or saved ships.

The supplied Aegis concept is visual reference, not a mesh source. These are
original procedural blockouts: lance/command prows, armored/hangar/utility hulls,
standard/heavy drives, and turret/cargo/sensor dorsal attachments. The preset
selector assembles three sample families. Mid-hull count and mission controls
allow recombination; nonstandard mission sections alternate with armored hulls.
The battleship preset uses continuous armored sections; utility sections remain
an explicit option rather than the default battleship silhouette.

## Reference study, second pass

The reference's visual hierarchy is a dark structural spine wrapped in broad,
chamfered armor, with narrow recessed service bands and relatively sparse raised
equipment. The second pass replaces rectangular roof slabs with faceted armor
segments, uses open octagonal coupling rings, and makes the prow progressively
thicker through multiple tapered stations. The dark bow core is smaller than
its armor shell to avoid coplanar surface flicker.

Armor hatches, vent grooves, fasteners and paired window strips provide scale
without textures. A stepped command citadel, cylindrical twin barrels, reinforced
engine housings and swept stern fins establish larger silhouette landmarks.
Lighting is less blue so the neutral warm armor remains readable. Camera presets
account for viewport aspect ratio, including tall embedded panels.

This remains a geometry study: there are no authored textures, baked occlusion,
weathering or decals. Small-scale material wear and less repetitive equipment
layouts are useful future passes after the kit's silhouettes are settled.

## Kit convention

- Long axis is X; bow is negative X; dorsal is positive Y.
- Every spine interface has a nominal 10 wide by 8 high octagonal profile.
- Mid-hull modules are 16 units long. Connectors belong to each module.
- Dorsal attachment origins are local (0, 4.1, 0), shifted 3.5 units toward the bow on the final hull. The final hull also carries
  a fixed command tower aft of its attachment socket.
- Each mid-hull also has an independently configured ventral socket. The same
  attachment geometry rotates 180 degrees around X, preserving forward-pointing
  weapons and outward normals. Explosion offsets move each bank away from its
  own hull surface. The Underside camera preset exposes the lower bank.
- One model unit represents 9 meters for the optional nominal length readout.
  This is an art study, independent of simulation calibration.
- Major modules are named groups. Armor and details remain separate meshes
  within those groups. Explosion offsets are inspection transforms only.

The OBJ button exports assembled positions with stable named spine, dorsal and ventral attachment objects,
regardless of explosion or turntable settings. It exports geometry only, without
materials, UVs, lights or socket metadata. These intersecting component meshes
are intended for visual modeling, not watertight fabrication. The three saved
OBJ examples in `assets/ships/aegis-kit/` can be imported directly into Blender.

Run `node tests/dreadnaught-kit.cjs` for finite geometry and OBJ export checks.
Use `node tests/dreadnaught-kit.cjs --export` to regenerate all three OBJ samples.
The Node test executes the HTML module with the real vendored Three.js geometry
and stubs browser rendering. Orbiting, lighting and controls need browser review.

## Escort scale references

Four 12 m Spitfire stand-ins accompany the hull at true scale (12/9 model units
long), with an independent visibility toggle. Escort detail frames the formation
next to the hull for a close scale comparison without enlarging the fighters.
These reuse the Quaternius CC0
Spitfire used by `studyViewer.referenceFighter` in the other model studies.
`tools/bake-aegis-reference.cjs` extracts only that mesh and its existing surface
finishes from the vendored ship pack into `assets/ships/aegis-kit/reference-fighter.js`.
The generated asset includes source identity, license and source mesh hash.
Run that script after changing the source fighter or shared finish generator.
Escorts are separate scene objects: they neither explode with the kit nor appear
in its OBJ export. Their small size alongside the capital hull is intentional.

## Live flight scenario

Open `experiments/flight.html?aegis=1` or choose Aegis from the mission list.
This uses the ordinary flight simulator controls, physics, HUD, NPCs, projectile
stepping and damage resolver. The player flies between allied and red-team
1,305 m battleships exchanging main-battery fire. Customized bench configurations
are not passed through. The ships patrol on bounded opposing arcs at about
12 m/s, with a gentle heading swing. Red starts 1,500 m across the beam and
180 m higher, allowing the allied dorsal and hostile ventral batteries clear
firing arcs. Red illumination and red bolts distinguish the opposing ship.

Each battery has a fixed pedestal, yaw joint and pitch joint. The generated
flight asset separates the immutable hull from twelve main batteries and twelve
small point-defense mounts, with meter-based pivots and Z-up geometry. The main
batteries track only the opposing capital. They slew at 0.35 rad/s in yaw and
0.25 rad/s in elevation, settle before short twin-barrel salvos, and pause
an independently randomized 2.8-5.2 seconds between salvos, keeping the
original average cadence and two twin volleys per burst. Initial delays vary
per gun and per faction. Each battery
chooses a continuous random 3D hull point for the next salvo: longitudinal,
lateral and vertical offsets vary independently. Empty through-hangar volume
is excluded. The guns do not converge on a midline or fire in an ordered sequence. Unguided main rounds travel at 700 m/s
with an 8-second lifetime, 35 m visual length and 20 damage. Swept proxy-hull
contacts emit the fighter destruction effect at a smaller 5 m scale, inherit
the struck ship's drift, and reduce the opponent's 20,000 integrity;
zero integrity disables propulsion, weapons and allied hangar launches, without
a capital breakup effect. Reset restores both ships. Small PD mounts use 22%
of the main turret geometry scale and handle opposing fighters (including the
player for red AA).
`experiments/aegis-flight.js` limits PD yaw to 2.8 rad/s and elevation to 2.2 rad/s,
retains valid targets within 900 m, solves a constant-velocity intercept and
fires only after alignment. Its rounds travel at 450 m/s, live for 2 seconds
and deal 3 damage before the shared weapon modifiers. Upper and lower banks use
their own outward hemispheres, with an elevation limit of 84.6 degrees. The
readout counts confirmed enemy shield/hull hits separately from hull impacts.
Conservative hull and bridge boxes block firing lines and projectiles. These
same coarse boxes stop player hull crossings; they are not mesh-accurate
collision shapes. Turrets use the existing projectile renderer and shared
fighter damage resolver. Pausing freezes their clocks and projectiles; Reset
clears tracking and shots. Static hull buffers are reused between frames.
Turret vertices are also immutable and shared between identical meshes. Each
mount updates one column-major rotation basis; the existing scene shader applies
rotation and pivot translation on the GPU. Drawing or pausing allocates no new
turret vertex buffers or batch arrays. PD rounds request at most four cosmetic
scorch projections per fighter per second; collision, hit reporting and damage
still run for every round. Ordinary fighter weapons retain their mark behavior.

`node tools/benchmark-aegis.cjs` measures geometry preparation and scorch cost
locally. The original CPU transform path recreated 1,230,336 vertex bytes per
frame and took about 2 ms in the development benchmark. The matrix path recreates
zero vertex bytes and took roughly 0.02 ms on the same machine. These are CPU
microbenchmarks, not end-to-end FPS measurements.
Projectile collision also reuses a source-mesh triangle hierarchy, traversed in
entry-distance order and pruned once a closer hit is known. Scalar face/edge/
vertex sweeps retain the spherical bolt-head rules. Differential tests compare
2,400 indexed sweeps with the original implementation, including stationary and
degenerate cases. The performance overlay's optional Aegis stage timings separate
simulation, PD, scene preparation and HUD work to identify future regressions.
Scorch projection reuses that hierarchy to visit only triangles near the impact;
80 additional comparisons check exact agreement with full-mesh clipping.
Fighter and wreck scorch meshes likewise stay in model-local coordinates and
use GPU poses. `sourceScorchGeometry` rebuilds cached layers only when mark
identity or hull ownership changes; the legacy posed-vertex method remains
available. This prevents accumulating burns and drifting wrecks from adding
per-frame projection and vertex-upload work.

Only Aegis mode loads `assets/ships/aegis-kit/flight-rig.js`. Normal flight and
the asteroid mission retain their existing setup. Regenerate that asset with
`node tools/bake-aegis-flight.cjs` after changing ship geometry or pivots, then run
`node tools/refresh-flight-assets.cjs` after changing simulator scripts.
`node tests/aegis-flight.cjs` checks asset freshness, tracking limits, both firing
hemispheres, shared damage, allied safety, collision, reset and buffer reuse.
It includes a fighter crossing at 170 m/s, rather than relying only on stationary
targets. The dreadnaught remains at its designed 1,305 m length.



## Repeatable performance comparison

In Aegis flight, press F3 and choose **Benchmark Aegis on / off** under
Renderer diagnostics. It pauses flight and renders the same snapshot, camera,
resolution, sky and fighters in OFF/ON/ON/OFF order. Each block discards 20 warm-up
frames and measures 90 frames using uncapped requestAnimationFrame scheduling,
independent of the normal active/paused caps. Results report CPU submission,
browser frame interval and actual submitted draws/triangles. The ship and its
current projectile effects are the only rendering difference. Simulation stays
frozen; this is not a total-game or GPU-timer benchmark. The ship is restored and
flight stays paused afterwards. Keep the tab foreground and avoid changing
settings or resizing while it runs.

`node tools/benchmark-aegis-encounter.cjs` supplies the complementary CPU test:
eight scripted fighters cross upper/lower PD banks for six seconds at 60 updates
per second, using the actual Spitfire collision mesh, projectiles and damage.
It warms both cases and reports three samples per case plus median update cost.
The OFF case performs the same scripted fighter movement without the capital
update; ordinary fighter AI, rendering and audio are excluded. Large target HP
keeps the collision workload fixed. `--compare path/to/result.json` checks exact
shot counts, confirmed hits and remaining health against a saved result.
`--reference COMMIT` alternates current code with that commit's targeting and
training resolver, keeping assets and other modules identical, and asserts exact
combat agreement. `--contacts 128 --no-fire` isolates the targeting workload at a larger contact
count. Timing is diagnostic, never a pass/fail threshold. See the
[recorded comparison](benchmarks/aegis-2026-10-20.md) for measurements and limits.

Target positions are converted once per update, then each mount retains its
valid lock or randomly samples a valid contact. Independent seeded per-mount reservoir
sampling spreads acquisition beyond the closest fighter, avoids sorting and
keeps resets reproducible. Locks persist until the target dies or leaves range
or the mount hemisphere. The damage resolver's optional `onDamage` callback reports only
real shield/hull loss, once per trace, including lethal hits. PD uses this rather
than scanning all fighters' health before and after every projectile segment;
existing trace callers still receive the same impact point.

The study renderer caches bounds for immutable static vertex arrays. It tests
the transformed source box against the exact camera clip planes before issuing
actor draw calls. Rotation, scale, turret bases and source stride are respected;
near-plane intersections and camera-inside cases stay visible. Off-screen actors
remain in simulation and retain their GPU buffers. Shadow passes and model-viewer
picking retain their prior behavior, and dynamic effects retain their existing
submission path. This applies to static fighter and wreck batches as well as
capital hulls. `tests/study-culling.cjs` compares 1,500 transformed cases against
an independent corner/clip-plane oracle.


AA rounds use standard allied fighter green bolts, including the source weapon's
10 m trail, 0.9 m collision/visual head radius, 450 m/s speed and 2 s lifetime.
Their maximum acquisition range follows speed times lifetime (900 m); predicted
intercepts must also fit the lifetime. PD damage and firing cadence remain as
configured for the capital mount.

The study effect setter retains the complete submitted batch list. Fighter shots
(three color groups and impacts) plus fighter engines already consume five
batches; capital projectile/impact batches are appended after them. The old
five-batch cutoff discarded all AA artwork even while its damage simulation
continued. The regression checks all nine batches survive the renderer boundary.

AA aim still solves a constant-velocity intercept; projectiles remain unguided
after launch. A fighter changing velocity during the longer flight time can
naturally evade them. No extra spread, homing or deliberate aim penalty is added.
Historical performance replays recorded with 2,200 m/s AA are not combat-equivalent
to this tuning; use a reference with matching weapon settings for exact replay
comparisons.


AA mounts wait for 0.12 s of aligned tracking below 0.8 rad/s of combined yaw/pitch
slew before starting a 0.55–0.65 s burst (usually 3–5 twin volleys). They then pause
for 0.8–1.32 s while continuing to track. Mount durations and initial delays differ
to avoid synchronized salvos. Losing alignment, clear firing line, target or slow
tracking interrupts the burst and starts the pause. This gates only new shots;
existing rounds continue their normal flight and collisions. All timers use the
paused simulation clock and reset with the rig.


For viewing variety, a mount with a live in-range enemy and no recent shots may
fire one speculative twin volley after 2.8–4.6 seconds of silence. These shots
follow the current barrel direction (standard twin-gun convergence), rather than
snapping to the predicted intercept. The barrels must point within 45 degrees of
the target/lead and have a clear forward ray past the ship hull. Each such volley
starts a normal rest interval and resets the silence timer; any accurate shot
also resets it. Normal aligned bursts remain preferred. Pausing freezes these
timers and disabled combat or missing/out-of-range enemies cannot trigger them.


## Through-hull hangars and mixed segments

Open **Individual hull segments** in the kit to choose each segment's hull,
upper attachment and lower attachment independently. The Dreadnaught preset uses
armored / hangar / armored / utility / armored / armored hulls. Preset changes
reset the overrides; the reset button returns to the bulk controls' layout.
OBJ export retains separate named segment and attachment objects.

The hangar is an open box across the beam, with a deck, ceiling, end walls,
portal frames and runway lights. Its center has no spine or closed rear wall.
The flight bake records module positions and conservative 90 m × 20 m clear
apertures. Runtime collision partitions the hull around these apertures so a
player or projectile can pass through either side while floors, ceilings and
end walls remain solid. Flight currently uses the baked mixed Dreadnaught
preset; edits in the kit are authoring previews and do not automatically replace
the running flight asset. Regenerate with `node tools/bake-aegis-flight.cjs`.

In the Aegis encounter the initial allied wing is staged inside the hangar.
The first fighter launches after one second, then one every three seconds,
alternating port and starboard mouths (and cycling hangars if several are baked).
Each craft spends 2.2 seconds moving straight at 60 m/s before normal combat AI
takes control in clear space. Launch poses use the flight model's handedness,
and collision hulls follow the same selected fleet artwork as other fighters.
The hangar maintains up to eight live wingmen and replaces losses; dead launched
craft are removed from the active list once their ordinary wreck copy exists.
Existing wreck limits remain in force. Pause, disabled combat, player death and
between-wave countdowns suppress launches.

`AegisFlightRig.reset(combat)` stages the allied wing and opts that experiment
combat into `hangarSupport`. Subsequent furball waves retain surviving allied craft and their original hull
art while spawning their enemies, leaving new allies for the hangar; an empty allied roster does not end a wave while
reinforcements are available. Other flight modes retain their ordinary spawn and
wave behavior. Temporary `Craft.hangarLaunch.remaining` is JSON-safe and is
removed when departure hands over to AI. Tests cover independent slot choices,
mesh and collision through-rays, deck/end-wall solidity, alternating departures,
launch pose orientation, AI handoff, wing limits, replenishment and reset.

`aegisFlight.createBattle()` composes two independent rigs behind the existing
flight-rig interface. `create()` remains the stationary single-ship harness for
benchmarks and focused tests. Both ships share immutable mesh buffers; hull and
turret bases, muzzle vectors, launch poses and collision queries transform
through each ship's current heading and position. The battle telemetry includes
per-capital position, heading, integrity, round count and confirmed hits.

Hangar roof and deck armor reuse the neighboring hull's four ribbed plate bays,
pale/armor alternation, dark service recesses, cyan/amber lights and maintenance
hatches. Interior light strips stand clear of the floor and ceiling to prevent
depth fighting at flight-view distances; the through passage stays open.
