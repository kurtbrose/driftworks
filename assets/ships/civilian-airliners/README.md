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
occupancy is suggested through warm glowing glazing and darker unlit panes; there is no
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

## Flight mission render copies

`python tools/export-civilian-flight.py` derives `*-flight.bin` and
`*-flight.json` from the approved GLBs. These retain the authored metre geometry,
node transforms, normals and all nine material groups, converted back to +Y bow
and +Z dorsal for the shared flight renderer. The manifest records the source
SHA-256 and a ray-tested ventral service contact. The originals stay editable.
The binary contains interleaved position/normal float32 triangles; manifest
batch offsets are bytes, counts are floats. Runtime positions alone convert to
scene units once at loading. The flight shader approximates PBR finishes while
retaining base colors and emissive material classification.

The evacuation cockpit imports the same refueling timeline and arm solver used
by the depot study. Its dock basis maps the authored bow to flight +Z, with
vertical clearance/departure and independent retracting arm links. See
`docs/flight-missions.md` for the first-cycle scope and benchmark control.

## Passenger window detail pass

Passenger windows retain their 0.65 × 0.80 m dimensions and 1.00 m pitch. Narrow
titanium seals surround clipped corners; a deterministic
pattern of darker panes break up the cabin lighting without animation, alpha
blending or textures. The original amber cabin material and emission strength
are preserved. Opaque repeated seat cutouts have been removed.
The warm light material now contributes its amber emission alone: its reflective
base is black and metallic, suppressing both diffuse paint lighting and the white
dielectric highlight. Sunlit and shaded windows therefore retain the same bulb
color. This reuses the existing material group, including the warm service lamps.
The flight exporter uses emission as the visible color for a pure emitter, so a
black reflective base cannot turn its flight-rendered windows black.
The 2026-10-30 material follow-up was visually checked on both ships with studio
lights on/off and with the liner rolled 180 degrees. The updated depot sample
retained 187 draws / 984,562 triangles, 13.3/13.4 ms frame median/p95 and 0.8 ms
CPU submission under the overview conditions below. Flight geometry binaries
are unchanged by this material-only follow-up.
Seal rings and glazing meet edge-to-edge on the same surface instead of layering
cards a few millimetres apart, avoiding depth fighting at viewing distance.

Each window assembly uses twenty-two triangles (sixteen seal, six glazing),
replacing ninety-six triangles from three subdivided patches. The flight
and depot material batches retain their existing cabin finish and draw count.
The regression checks fitting dimensions, six-triangle glazing and seal counts.

| Asset | Before triangles | Window pass triangles | Saved |
| --- | ---: | ---: | ---: |
| 72 m commuter | 248,507 | 242,291 | 6,216 (2.5%) |
| 180 m liner | 380,774 | 347,918 | 32,856 (8.6%) |

The window-only flight exports retain nine material batches per ship. The depot's
static batching helper produced thirteen groups per ship versus fourteen
for the originals (geometry layouts can split a material into several groups).
These are geometry/submission counts, not a measured frame-rate improvement.

In the fixed depot overview on 2026-10-29 (906 × 1332 backing pixels, DPR 1.5,
both ships visible, static batching, five-second samples after warm-up), the
originals submitted 189 draws / 1,023,634 scene triangles; the window pass submits
187 / 984,562. With ships hidden the scene submits 159 / 394,353. Before and after
frame median/p95 remained 13.3/13.4 ms at the display cap; CPU submission was
0.9/0.8 ms including the sky. GPU completion and a busy flight/combat workload
were not measured. The neutral-gray review independently shows 14 → 13 draws
per ship at 1326 × 931, DPR 1.5, with unchanged 13.3/13.4 ms frame cadence.

## Recessed drive throats

The engine detail pass replaces the stacked solid cylinders with an open nacelle,
an annular red shoulder, a hollow titanium collar and a tapered graphite liner.
The blue throat sits 0.85 nozzle radii behind the mouth: 2.2185 m on the commuter,
3.57 m on the liner. A separate titanium hub meets its inner edge. These are real
surfaces, so camera movement reveals depth without extra lights or textures.

The mouth occupies the original rearmost hub plane. Full exported bounds remain
the same within float precision; engine positions, radii, hulls, navigation lights,
refueling contacts and amber window materials are preserved. There are still two
drives on the commuter and three on the liner.

Compared with the approved window pass, the commuter drops from 242,291 to
242,131 triangles and the liner from 347,918 to 347,678: 400 fewer triangles total.
Both still use nine flight material batches. The existing depot batching helper
now produces twelve groups per ship, down from thirteen, because the open red
nacelles can share the hull's material/attribute layout. The regression checks
the open collar topology, actual throat recession and original rear bound.

The matched depot overview (same 906 × 1332 backing pixels and DPR 1.5 as above)
now submits 185 draws / 984,162 triangles, versus 187 / 984,562 after the window
pass. Frame median/p95 remains 13.3/13.4 ms at the display cap; CPU submission
remains 0.8 ms including the sky. GPU completion is not measured. The full
`npm run check` passed all 145 test entries for this engine pass.
