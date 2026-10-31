# Industrial family — geometry study 02

Open [the shipyard](../../../studies/industrial-kit.html) through the repository
HTTP server. All geometry, paint and inspection controls run locally with the
vendored Three.js library. No build step, package install or runtime service is
needed. This remains a standalone modeling study, not a flight-integrated asset.

## Construction language

Shared hardware: ivory pressure cabins, dark structural steel, ochre handling
fittings, oxide/slate cargo panels, replaceable service machinery, exposed feed
lines, hollow expansion bells and three-axis maneuvering cassettes.

| Vessel | Approximate external L × W × H | Layout |
| --- | --- | --- |
| Yard tug | 23.0 × 10.4 × 8.0 m | Offset pressure capsule, auxiliary pod, three-point capture fitting, twin drives |
| Spine hauler | 55.4 × 15.5 × 10.4 m | Three open truss bays, staggered external cargo, small upper pod |
| Orbital tanker | 58.8 × 15.0 × 11.0 m | Three caged spheres, connected transfer line and EVA service bus |
| Salvage carrier | 44.9 × 22.5 × 10.4 m | Open recovery bed, offset cabin, external stores, two radial capture arms |
| Bulk-fluid carrier | 77.4 × 19.3 × 13.0 m | Two large domed vessels, restraint frames, linked plumbing, radial manipulator |

Dimensions include antennas, fittings and the default crane pose; they are
design-study proportions rather than gameplay collision envelopes. The family
view retains the same metre scale for all five ships. Individual inspection
views frame each object separately.

## Editable parts and coordinates

The source is **kit.js**, an ordinary ES module importing the local Three.js
mapping supplied by the review page. Eleven factories are available through
part(name, options): cabin, truss, cargo, tank, engine, coupler, service, crane,
rcs, bulkTank, latticeCrane. assembly(name) accepts the five vessel names, kit, or fleet.

Units are metres; +X is aft, +Y is the authoring dorsal axis, +Z starboard.
These are zero-G craft: the authoring axis does not define a gravity vector. Part origins are at their
structural centres. The dimensions export lists nominal module envelopes;
use actual geometry bounds for clearance including fittings. Truss and tank
bays connect at X ±6 m and repeat every 12 m. Adjacent bays omit the second
copy of their shared front frame. Tank joints include transfer couplers and
bridging equipment buses. The tug uses a shortened truss; the salvage bed uses shallow
side rails. Small cargo/crew variants are explicit scaled child groups.

Module socket coordinates are stored in userData.sockets and exported to glTF
node extras. Handling shoulder, elbow, telescoping carriage and capture-wrist groups remain
separate. setCranePose(root, deployment) accepts the review's 0–1 range; exports
retain the current joint transforms and named pivots, without animation clips.

The mesh helpers build closed chamfered panels with outward flat face normals,
indexed spheres, structural beams, curved pipes and hollow lathed engine bells.
Geometry and materials are shared across repeated modules. Markings and paint
wear are atlas pixels, not individual stripe meshes.

## Paint and portable exports

panels.png is a deterministic 2048 × 2048 atlas with sixteen local panel tiles.
Rebuild it with Pillow using:

    python tools/build-industrial-atlas.py

The atlas has no dependency on the concept images. It uses an available local
monospace font; font rasterization can differ between authoring machines.

The review's **Download editable glTF** embeds the paint atlas and mesh buffers,
shares repeated mesh/accessor data, preserves part/joint transforms and exports
emissive strength. glTF UVs are converted from the Three texture origin; panel
text remains outward-facing on every side. **Preview exported glTF** re-imports
the embedded file with the vendored GLTFLoader and displays that result. It
checks bounds and mapped mesh counts; visual comparison remains a separate step.

Optional dependency-free offline export:

    node tools/export-industrial-kit.cjs
    node tools/export-industrial-kit.cjs salvager

Default destination: output/industrial-kit/gltf/ (ignored). Select any part or
vessel by name; an optional second argument selects an output directory.
These files contain textures and can be imported individually into a DCC.
The authoring source stays procedural; no editable Blender source is claimed.

## Display batching and measured cost

batchStatic(root) makes a root-local static review copy, baking child transforms
and grouping compatible triangles by material. The viewer attaches it at an
identity root. The editable source tree remains intact for export and arm
pose updates. A pose change rebuilds only the review copy; ordinary frames
reuse the same GPU geometry. disposeBatch releases that copy's geometry without
disposing the shared source geometry/materials. This is a review helper, not a
production flight renderer integration.

Historical pre-zero-G measurements, recorded in the foreground shipyard, 624 × 888 CSS viewport, 936 × 1332 backing
resolution, DPR 1.5. Fixed fitted 3/4 camera, grid/wireframe/rotation off, current
textured ship only, four directional lights plus hemisphere lighting, cached
2048-pixel static shadows. No simulation, effects, traffic or collision work.
Each A/B/B/A leg warms for 25 frames and samples 90 frames. Source and batched
legs preserve camera, resolution and every triangle. Render submission is timed
with performance.now; GPU execution is **not** measured.

| Ship | Triangles retained | Main draws source → batched | CPU submit median | CPU submit p95 | Frame cadence median |
| --- | ---: | ---: | ---: | ---: | ---: |
| Hauler | 37,564 | 765 → 9 | 2.55 → 0.20 ms | 2.95 → 0.30 ms | 14.8 → 14.8 ms |
| Salvager | 31,552 | 674 → 9 | 2.40 → 0.20 ms | 2.80 → 0.25 ms | 14.7 → 14.6 ms |

These measurements justify batching the detailed static display; they do not
establish a gameplay speedup or a universal frame budget. The sampler downloads
its configuration and raw leg summaries. Workspace summaries and labeled
captures are under output/industrial-kit/ (ignored).

## Verification and remaining work

node tests/industrial-kit.cjs checks finite geometry/unit normals, outward atlas
orientation, index/buffer validity, UV-origin conversion, embedded materials,
mesh reuse, transformed batch bounds/triangle counts, crane pivots, sockets and
an unobstructed ray into the engine throat. It is registered in the artwork group.

Browser inspection included all four ships in 3/4 view, hauler/tanker/salvager
undersides, tug/engine aft views, the salvage bed from above, crane deployment at
0/0.5/1, and textured hauler/tanker export previews. Captures are labeled in
output/industrial-kit/. These checks establish this modeling iteration, not
approval of every surface from every angle.

Still open: richer surface-specific wear, interiors, engineering load/mass and
thermal plausibility, collision/LOD/breakup contracts and a measured performance
pass in an actual flight scene before runtime readiness. The review's articulated
cranes are modeling pivots, not a physical recovery solver.

## Suited crew and fighter scale references

The vessel views now start with **Suited crew + fighter** enabled. Three frozen
1.80 m Quaternius astronauts in high-visibility orange suits float in mixed
orientations beside each vessel; a
calibrated 12 m Spitfire sits clear alongside. The family view has three crew
per ship and one fighter. Smaller component views omit these references; the large tank/crane views retain them.

The figures reuse quaternius-astronaut/poses.js and its existing local CC0 source;
the fighter reuses aegis-kit/reference-fighter.js with its authored 9 metres per
unit conversion. scale.js caches shared static geometry/materials and preserves
these physical sizes across every view. The camera includes visible references
in its framing. Ship dimension readouts and editable glTF exports remain ship-only;
the benchmark temporarily hides references to preserve its ship-only workload.
References are included in PNG renders. The earlier performance table excludes them.

## Zero-G pressure cabins and cargo handling

The primary cabin is an ellipsoidal pressure shell with three recessed octagonal
viewports, sealed lateral access collars, radial EVA handholds, external service
packs and a circular aft connector. Auxiliary crew pods use rounded pressure
vessels too. There are no windshields, road-style doors or steps.

bulkTank is a 28 m transport module around a continuous 24 m × 11 m vessel:
a 16 m barrel with two 4 m ellipsoidal heads. Circumferential restraints,
structural bands, equipment buses, manifold valves and a pump cassette remain
separate geometry. Tile 15 supplies weld seams and small fluid stencils.
No rated fluid capacity, mass or engineering certification is assigned.

The legacy factory names crane and latticeCrane now create small and large
rigid handling arms. Both have shoulder/elbow joints, a telescoping carriage,
a rotating wrist and three positive capture jaws. There are no hoist ropes,
counterweights or world-vertical compensation. The large arm mounts radially
between the bulk carrier's tanks; salvage arms mount on opposing hull faces.

**Arm configuration** calls setCranePose(root, fraction). **Arm reach** calls
setArmExtension(root, fraction), translating the carriage along its local axis:
2.2 m on the large arm and 1.2 m on the small arm. Fractions clamp to 0–1.
setHoistPayout remains a compatibility alias for setArmExtension; it no longer
models a hanging load. Exports preserve named joints and the current pose.
This is articulated modeling geometry, not a physical cargo-recovery solver.

The tank's service strips use ribbed equipment covers and short EVA handholds,
rather than guarded walkways. Lower frame members carry structural connections;
they do not act as landing skids. The tug uses a radial three-point capture
fitting. Crew references float in different attitudes and retain 1.80 m stature
independently of their world-space Y bounds.

Focused checks cover finite geometry, transformed batching, export integrity,
tank dimensions/outward winding, preserved actor scale, rigid arm extension
and covariance under arbitrary whole-rig rotation. Browser captures for this
iteration live under output/industrial-kit/zero-g/ (ignored).

Direct review links accept ?model=bulkCarrier, ?model=cabin, ?model=bulkTank or
?model=latticeCrane. Flight integration, collision, rated loading and fluid
gameplay remain outside this modeling pass.

### Zero-G carrier review measurement

Kit revision 2235656bffbe retains **68,802 triangles** with **630 → 8** ship-only
main draws. At 624 × 888 CSS / 936 × 1332 backing, DPR 1.5, matched A/B/B/A
sampling recorded CPU submission median **1.90 → 0.15 ms**, p95 **2.20 → 0.20 ms**.
Frame cadence median was **13.3 → 13.3 ms**, p95 **13.5 → 13.7 ms**. GPU execution
was unmeasured. Each leg warmed for 25 frames and sampled 90, with a fixed fitted
3/4 camera, references hidden, cached 2048 shadows and no simulation/effects.
The reference actors returned after timing. Full npm run check passed 145/145.

Visual inspection covered the cabin close-up, large arm at both articulation
extremes and full extension, tug 3/4, salvager top, carrier 3/4 and belly, plus
the textured carrier after glTF re-import. These checks cover this study only;
flight-scene performance, collision and engineering loads remain unmeasured.

## DW-14 route assembly study

Open ?model=modular in the shipyard. The route builder treats the ship as a
sequence of rigid scaffold modules, with interchangeable contents inside. This
extends the original fleet study using its existing containers, pressure cabins,
service cassettes, drives and large domed fluid vessel. Existing fleet views
remain available for comparison. The new module standard is an explicit study;
it does not silently rescale the original 12 m truss or every legacy ship.

A structural bay is 14 m long. Four longerons occupy Y/Z ±6.2 m, with braced
perimeter faces, end frames, four corner locks and paired utility connections.
Adjacent bay socket planes coincide exactly; the joint is rigid, with loads
carried around the perimeter rather than through a flexible train coupling.
There is no gravity-defined floor. A single cabin assembly and a drive bank
connect through load-spreading terminal adapters.

| Insert | Standard bays | Contents |
| --- | ---: | --- |
| Container rack | 1 | Four unchanged box cargo modules and corner restraints |
| Fluid sphere | 1 | 9.6 m sphere, restraint rings and transfer fittings |
| Service machinery | 1 | Four service cassettes, radiators and radial handling arm |
| Crew pressure module | 1 | Rounded cabin, auxiliary vessel and service packs |
| Empty scaffold | 1 | Open structure for inspection or later payload designs |
| Bulk vessel | 2 | Shared continuous 24 × 11 m domed fluid vessel |

The **Route loadout** presets are Container run, Mixed freight, Bulk-fluid
transfer and Field support. Change each module's insert, use its arrows to
reorder it, or add/remove modules. The study accepts one to six modules, with
double-length fluid modules counting as two structural bays. Terminal cabin
and drive assemblies remain attached at the ends. **Assembly separation**
translates modules apart for inspection; separated views are exploded diagrams,
not operating ships. Changing a preset restores coupled spacing.

Source APIs: moduleStandard, routePresets, standardBay(type), and
buildConsist(types, {separation}). For example,
buildConsist(['cargo','bulkFluid','empty']) creates four structural bays.
assembly('modular') returns the default mixed consist. Per-module sockets,
payload identity, span, manifest and bay bounds are JSON-safe node metadata
and survive embedded glTF export. Each bay is a separate named hierarchy.
The UI exports its current arrangement and articulation.

Focused regressions cover interface alignment, double-bay spacing, payload
validation, cargo containment, explosion without rescaling, exact static
batching, embedded exports and viewer syntax. Browser inspection additionally
checks route switching, payload swaps, reordering, count limits and round trips.
Captures, timing evidence and individual module/route exports are stored in
output/industrial-kit/modular/ (ignored). Route planning, mass/fuel budgets,
collision, cargo operations and actual flight integration remain future work.

### DW-14 measured review cost

Kit revision ff90512804d8, foreground shipyard, 624 × 888 CSS / 936 × 1332
backing, DPR 1.5. Fixed fitted 3/4 view with every module visible. References
were included in framing and hidden during timing. Each A/B/B/A leg warmed
for 25 frames and sampled 90; 2048 static shadows were cached. This task's tests and asset builds finished before timing; no simulation or effects ran.

| Six-module consist | Triangles retained | Draws source → batched | CPU submit median | CPU submit p95 | Cadence median | Cadence p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Container racks | 103,802 | 1,951 → 9 | 5.20 → 0.20 ms | 6.80 → 0.20 ms | 13.3 → 13.3 ms | 17.9 → 18.5 ms |
| Crew pressure modules | 208,238 | 1,255 → 8 | 3.55 → 0.15 ms | 4.25 → 0.20 ms | 13.3 → 13.3 ms | 13.9 → 14.1 ms |

These compare editable sources with exact static material batches. GPU time
was not measured; cadence medians stayed unchanged and occasional longer frames
persisted, so this does not establish GPU headroom or a whole-game speedup.
The full repository check passed **145/145 entries**. Visual inspection covered
all four route presets, the mixed consist coupled/exploded, six-module limits,
reordering/swapping/removal, and textured mixed-consist glTF re-import.
