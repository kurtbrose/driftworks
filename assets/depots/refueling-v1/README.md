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

The liner docking-attitude slider defaults to 90 degrees: bows point world +Y
(up in the study), ventral surfaces point world -Z toward the depot. Zero restores
the horizontal cruise pose. Quaternion interpolation preserves rigid geometry
and true scale; loaded transport envelopes update with each pose. Berth origins
stay fixed during this attitude study. This does not attach the arms or solve
approach trajectories/collision avoidance.

The on-demand performance button samples five seconds after ten warm-up frames.
It reports frame cadence, frame p95, median combined sky/main render-submission
time, and main-renderer draw/triangle counts at the current resolution. Camera
controls pause during measurement; changing liner selection, resizing or hiding
the page cancels the run. Counts exclude the separate sky renderer. Timings do
not wait for GPU completion and are not isolated GPU measurements. Compare
visibility settings with the same camera and resolution and without other
workloads running. The result is a static-view sample, not a gameplay benchmark.

Local fixed-camera samples on 2026-10-22, scale view, vertical attitude, envelopes
hidden, main canvas 1732 x 1602 at DPR 1.5:

| Visibility | Mean fps | Frame p95 | Median render submission | Main draws | Main triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| Liners hidden | 75.1 | 13.5 ms | 1.8 ms | 159 | 394,505 |
| Both liners | 75.1 | 13.4 ms | 7.6 ms | 2,380 | 991,186 |

Each sample contained 376 measured frames. These are observations of the loaded
asset snapshot and local browser, not portable performance guarantees. An earlier
camera-away sample with zero foreground draws was discarded. The high draw-count
increase suggests static material batching as the first optimization to investigate.

Static liner batching (2026-10-22): the depot study now prepares a render copy
once per load, merging opaque compatible geometry by shared material, attribute
layout and render state. The original GLBs, named hierarchy, authored metres and
materials remain intact. The checkbox switches between original and batched
copies without moving the camera. Poses move cached geometry with the liner root.
Transparent/transmissive and special meshes remain independent; animated exports
are excluded from merging. This is a static reference-asset path, not a rigged
vehicle animation system. Batching trades some per-part culling granularity and
extra study-only A/B memory for fewer submissions.

The real-GLB regression loads both exports through GLTFLoader and verifies equal
triangle counts and bounds (0.1 mm tolerance), plus the synthetic nested-transform,
glass, animation-exclusion and buffer-reuse checks:

| Asset | Original mesh submissions | Prepared batches | Triangles retained |
| --- | ---: | ---: | ---: |
| Commuter | 654 | 14 | 248,507 |
| Double-decker | 2,113 | 14 | 380,774 |

Measured GLB SHA-256 prefixes: commuter `c9bbacc61e75`, double-decker
`a361d561863d`.

These are full-asset structural counts: 2,767 meshes become 28 batches (99% fewer).
They are not visible-scene draw counts or timing results. The exports differ from
the older timing snapshot above. A fresh matched browser timing/visual comparison
was blocked by a zero-width preview; its stalled sample is invalid. No FPS or GPU
speedup is claimed. Use the original/batched switch and five-second sampler in a
visible preview for that comparison. Source GLBs and Blender files are unchanged.

## Refueling cycle prototype

The depot study can run either civilian liner through approach (12 s), final
settling (4 s), coupling (4 s), fueling (10 s), uncoupling (4 s), clearance (4 s)
and departure (10 s). The ship eases between poses with quintic interpolation.
The liner arrives already bow-up from below, eases into the berth, and continues
upward after arm retraction. There is no lateral slide or attitude turnover; the
ventral hull faces the depot throughout the cycle.
Only the selected liner is shown during the cycle so the other reference hull
does not obscure the berth. Reset restores the authored reference positions.
Replay restarts the selected cycle; Pause freezes the ship, arm and fueling clock.
A hidden tab freezes the presentation clock. Benchmark sampling also holds it.

The underside contact is found once by raycasting the existing GLB ventral
surface. No dot, marker or extra hull fitting is added.
The berth position is derived from that model-local contact and its normal.
The same two-link IK solver poses the rigid arm, with the wrist seven metres
behind the surface along the outward normal: six metres of wrist boom plus
one metre to the end of the coupling. No links are scaled. The ship stays fixed
through coupling, fueling and retraction; clearance starts after retraction.
Movement reuses the existing static liner batches and arm geometry. The inactive
A/B hierarchy is detached from the moving root, and envelope bounds use a cached
local box, avoiding thousands of hidden-node updates and bounds scans each frame.

Enable **Hold until fueling-complete trigger** before starting to wait indefinitely
in the connected phase. **Finish fueling** releases that hold (or ends the timed
hold early). It is accepted only during fueling. Future prototype integration:

```js
window.Driftworks.depotRefueling.finishFueling();
// Or dispatch a completion for the currently serviced ship:
window.dispatchEvent(new CustomEvent('refueling-complete', {
  detail: {shipId: 'commuter'} // or 'double-decker'; omit to release current ship
}));
```

`depotRefueling` also exposes `start()`, `reset()` and `getState()`, returning a
snapshot with `shipId`, phase, elapsed phase seconds and pause state. Each phase
transition dispatches `refueling-cycle-stage` with `{shipId, phase}`. The pure,
renderer-free timeline is `experiments/refueling-cycle.js`; the real-GLB
regression in `tests/refueling-cycle.cjs` checks both ports, contact error,
reachable rigid IK, phase order, stationary fueling and manual release.
This is a visual single-berth prototype. It does not yet implement traffic
collision avoidance, fuel transfer quantities or persistent mission state.
