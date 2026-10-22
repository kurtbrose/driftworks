# Refueling depot prototype

Original Driftworks geometry, guided by the user-supplied depot concept image.
The reference image is not embedded in the asset or used as a texture.

Rebuild from the repository root:

    blender --background --python tools/build-refueling-depot.py

`depot.blend` is the editable authoring source. `depot.json` contains evaluated,
triangulated Blender meshes batched by named module and material, plus arm pivot
positions. Coordinates are metres, Z up. The study rotates these into Three's
Y-up space. This is a static local asset; Blender is only an offline authoring
dependency. Named modules reserve future breakup boundaries, not damage rules.
Curved cylinder walls, tank caps and rings use smooth corner normals; cylinder
end caps and eight-sided structural beams retain hard shading. The export uses
evaluated per-corner normals, rather than replacing them with face normals.

The 336 m spine, 32 tank slots and service-arm dimensions are provisional artwork.
Twenty-eight tanks are installed; four empty cradles retain capped feed stubs.
Tank numbers keep their gaps. Orange tank bands,
painted edge markings, coating loss and occasional replacement panels give
the depot an industrial, maintained-but-used appearance. Compact guarded red,
green and white fixtures replace the tall antenna masts as navigation and
clearance cues. Fixtures mark spine ends, outer tank-rack frame corners,
roof edges and coupling extremities. There are no central roof beacons.
The worn `caution-paint.png` is UV-mapped onto existing collars, joint rims,
isolated feed caps and exposed rack-rail ends. Paint has no raised stripe meshes,
warning boards or separate panels. Empty bays remain open frames.
Tank feet land on crossmembers beneath each tank row. Feeds terminate at the
frame; empty-bay caps sit on short connected branches. There are no free-standing
vertical cage rods or upper light stalks. Rack lights mount directly to the
outer structural corners, including the corners beside empty bays.
Visible splice plates and paired bolts articulate the repeatable truss sections.
Service hub C (`hub-112`) is inactive: its windows and fitted navigation fixtures
have dark, non-emissive materials and a closed isolation valve. Its arm stays
folded at a 24 m reach and -8 m wrist height while the
other two arms respond to the study controls. The Blender source uses the same
parked pose. This is authored visual state, not a fuel or mission simulation.
Three arms have independent 32 m upper/forearm links and a 6 m coupling head.
`experiments/depot-arm.js` solves wrist position in the bearing/height plane,
limits extension to 62 m and folds the elbow upward. The browser adds coupler
tilt, swivel and roll. Fuel feeds follow the rigid links; there are no dangling
hoses. Local link meshes use +Y along their length and zero pivot origins.
The editable Blender source is arranged into the default study pose by
`tools/pose-refueling-depot.py` after the local-coordinate browser bake.
Ship attachment, self/ship collision avoidance and fuel transfer remain future
work. The optional wire boxes show fighter/transport scale envelopes.
Five actual Quaternius Spitfire references also surround
the depot, restored from the shared Aegis asset's nine-metres-per-unit bake to
12 m length. They share geometry/materials and have a separate visibility toggle
and close-up view. Original CC0 provenance remains in the ship pack and shared
reference asset. Tank-bank positions stay fixed in this study.

Open `experiments/refueling-depot.html` through the static server to inspect the
export against the existing registered planet-impact sky stages. Lighting is
fixed art-study lighting, not automatic sky-derived illumination. No flight
mission, persistent world state or existing ship catalog is changed.

The depot now loads the user-authored `civilian-airliners/commuter.glb` and
`double-decker.glb` directly through the vendored GLTFLoader. These replace the
earlier evacuation-shuttle study in this scene. The selector can show either or
both at authored metre scale (72 m and 180 m hulls, respectively); drives extend
aft of those hull lengths. Original materials and glazing are retained.
Blender's GLB export is already Y-up; the viewer only rotates the -Z bow to +X
and positions the models outside the tank racks. No rescaling or rebaking is
applied. Transport envelopes use their actual loaded world bounds. Separate
close-up views and the shared scale view support inspection. Both remain static
references pending approach/refueling/departure behavior.
