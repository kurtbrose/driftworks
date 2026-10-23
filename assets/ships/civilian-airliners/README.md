# Civilian airliner studies

Original procedural Blender meshes based on the four visual concepts supplied
in the civilian airliner request. Reference lettering and specifications were
treated as visual reference, not implementation requirements. Ships use no
external asset packs, image textures, or runtime dependencies. Studio scale crew
reuse the repository's CC0 Quaternius astronaut; see
`assets/characters/quaternius-astronaut/README.md` for source and provenance.

- `commuter`: 72 m hull, 18 m beam before stabilizers, 11 m height, single cabin deck.
- `double-decker`: 180 m hull, 30 m beam before stabilizers, 16.5 m height, two cabin decks.
- Both use metres, +Y bow and +Z dorsal. Drives extend behind the nominal hull.
- `.blend` files contain named editable parts plus studio lighting and cameras.
- `.glb` files contain the ship geometry and materials only.
- Nine PNG inspection views per ship, including bridge, scale and underside close-ups, are shown in
  `experiments/civilian-airliners.html`.

Rebuild with Blender 5.2:

```text
blender --background --python tools/build-civilian-airliners.py
```

These are exterior art studies, not flight-ready simulation entities. Cabin
occupancy is suggested through glazing, sills and seat silhouettes; there is no
complete interior. Scale is an authoring choice rather than a passenger capacity
claim. The local render iteration smoothed hull stations, corrected outward
surface normals, lowered dorsal fairings and added layered glazing and panels.

## Human scale and flight deck

Roof livery and the ventral keel are material regions on the pressure hull's
single surface. Their boundaries share its vertices; they are not offset shells.
This avoids intersecting paint triangles and depth flicker in the game renderer.
The GLB regression checks that roof paint belongs to the hull and that its
material primitives contain no coincident duplicate triangles.

Both ships have 1.05 m wide by 2.10 m high passenger doors and 0.65 m wide by
0.80 m high windows on a 1.00 m pitch, measured along the ship's longitudinal
axis and vertical axis. Counts increase with hull length. The liner has two
passenger decks 3.10 m apart; it does not scale up the commuter's doors,
windows, seats or controls. Door surrounds include a small observation window
and handle. Side details follow the pressure hull rather than floating boxes.

The four windscreen panes sit 8 mm outside the original curved nose surface.
Their silhouettes cut real openings through the shell. There is no added
cockpit housing, roof or visor. Both use the same 5.50 m wide glazing layout,
with a narrow original-hull center post and quarter panes. Nose curvature
provides the forward-facing windshield rake. Pilot furniture remains human
sized, inside the nose.

The builder casts 30 rays per ship from the two seated eye positions, combining
yaw -30, -15, 0, 15 and 30 degrees with pitch -10, 0 and 15 degrees. It excludes
glass and includes the other exported ship geometry, writes `*-visibility.json`,
and fails generation if a sampled ray is blocked. This checks discrete forward
sightlines rather than a continuous field of view. `*-dimensions.json` records
physical dimensions and cabin layouts. `tests/civilian-airliners.cjs` measures
actual GLB vertex spans for doors and windows and checks windscreen vertices
against the continuous nose surface.

## Scale crew

Three astronauts accompany each ship: one on a boarding platform beside a
passenger door, two on the studio floor. The existing
Quaternius `Idle_Neutral` animation is frozen at frame 6, evaluated with its skin,
and normalized to exactly 1.80 m from boot soles to helmet top. Furniture and
astronauts keep the same dimensions for both ships. Crew belong to a separately
named studio collection in the Blender files and are added after ship GLB export.
Refresh their placement and hero/side/top/rear/scale renders without rebuilding
the ships using `-- --refresh-crew` after the builder command above.

The two scale close-ups share a 14 m orthographic camera width, so crew, doors
and windows appear at the same magnification. Their background hulls differ.

## Ventral equipment

The commuter has two 2.20 × 3.80 m cargo bays, four stowed landing-gear housings
and six recessed louver modules. The liner adds bays rather than enlarging the
fittings: six cargo bays, six gear housings and eighteen louver modules. Both
have paired protected service conduits, four downward maneuvering-thruster
sockets and four warm inspection lamps. Gear covers are modeled stowed; no
deployment mechanism or simulation behavior is implied.

Bay rims stand proud of their recessed floors; clamshell leaves, hinges and
louvers are separated solid geometry. Underside renders hide the studio floor,
boarding platform and scale crew, and add temporary lower softboxes. Those
inspection lights are removed before saving the editable scene. Re-render the
three belly views with `-- --refresh-underside` after the builder command.
