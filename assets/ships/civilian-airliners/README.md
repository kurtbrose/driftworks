# Civilian airliner studies

Original procedural Blender meshes based on the four visual concepts supplied
in the civilian airliner request. Reference lettering and specifications were
treated as visual reference, not implementation requirements. Ships use no
external asset packs, image textures, or runtime dependencies. Studio scale crew
reuse the repository's CC0 Quaternius astronaut; see
`assets/characters/quaternius-astronaut/README.md` for source and provenance.

- `commuter`: 72 m hull, 22 m beam before stabilizers, 16 m height, single cabin deck.
- `double-decker`: 180 m hull, 43 m beam before stabilizers, 29 m height, two cabin decks.
- Both use metres, +Y bow and +Z dorsal. Drives extend behind the nominal hull.
- `.blend` files contain named editable parts plus studio lighting and cameras.
- `.glb` files contain the ship geometry and materials only.
- Six PNG inspection views per ship, including bridge and scale close-ups, are shown in
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

## Flight deck visibility

The flight deck now has a forward-facing raked windshield and quarter windows,
with an actual opening cut through the pressure hull and paint overlays. The
bridge has 2.3 m forward headroom, two seat references 1.44 m apart, seated eyes
1.25 m above its floor, low consoles and a narrow central windshield post.
The larger ship uses a wider bridge rather than scaling the crew furniture.

The builder casts 30 rays per ship from the two eye positions, combining yaw
angles -30, -15, 0, 15 and 30 degrees with pitches -10, 0 and 15 degrees.
It excludes windshield glass, includes all other exported ship geometry, writes
`*-visibility.json`, and fails generation if a sampled ray is blocked. This
checks selected forward/docking sightlines, not a continuous field of view or
an aviation certification standard. Glazing is rendered as opaque smoked glass
for the exterior study; the seat and console geometry remains editable inside.

## Scale crew

Three astronauts stand beside each ship on the studio floor. The existing
Quaternius `Idle_Neutral` animation is frozen at frame 6, evaluated with its skin,
and normalized to exactly 1.80 m from boot soles to helmet top. Furniture and
astronauts keep the same dimensions for both ships. Crew belong to a separately
named studio collection in the Blender files and are added after ship GLB export.
Refresh their placement and hero/side/top/rear/scale renders without rebuilding
the ships using `-- --refresh-crew` after the builder command above.
