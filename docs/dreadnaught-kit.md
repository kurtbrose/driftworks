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
stepping and damage resolver. The player flies a fighter alongside a stationary
allied 1,305 m battleship preset; customized bench configurations are not passed
through. Capital hull damage and capital piloting are not modeled in this pass.

Each battery has a fixed pedestal, yaw joint and pitch joint. The generated
flight asset separates the immutable hull from twelve main batteries and twelve
small point-defense mounts, with meter-based pivots and Z-up geometry. The main
batteries remain at rest in the fighter-only scenario. Small PD mounts use 22%
of the main turret geometry scale and handle fighter threats.
`experiments/aegis-flight.js` limits PD yaw to 2.8 rad/s and elevation to 2.2 rad/s,
retains valid targets within 1,800 m, solves a constant-velocity intercept and
fires only after alignment. Its rounds travel at 2,200 m/s, live for 0.9 seconds
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

