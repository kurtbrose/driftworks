Plate boundary insets are reduced when they would reverse a cap triangle. Fine tessellation therefore cannot fold a narrow border triangle into a sawtooth overlap.

Raised plate clearance uses the geometric region normal rather than interpolated artist shading normals, which can point along the surface at hard corners. Source triangle ownership is retained when adding material sampling vertices.

Generated treatment panels retain their source region ID through material assignment. Their material owner is never re-guessed per vertex; fallback source-surface lookup uses the geometric face normal. Local boundary-distance treatments still use their owning region contours.

The default comparison shows six construction treatments of one hull, each with guided design preferences enabled. The coloration selector and material controls apply to all six. Authored / baseline / guided remains available as an explicit diagnostic comparison.

## Local tubular sections

Structural section contrast now gives whole geometric sections final material ownership, so earlier island, contour and coherence passes cannot break them up at full strength. Local axis candidates come from repeated normal-cross-product directions on shared facet edges. Surfaces approximately perpendicular to each axis are reassembled for cylindrical fitting, including low-poly faceted barrels. Fits need sufficient radial-normal coverage; a small one-sided curved patch is not accepted as a whole tube.

All coaxial patches are reprojected into one component frame before comparing their bounds. Previously, comparing bounds measured along slightly different fitted axes created false boundaries inside a single pod. The longest axial run supplies the barrel reference. Actual fitted runs and geometric transitions outside it form complete end assemblies, including collars whose radius happens to match the barrel. Barrel surfaces receive Primary; outer end assemblies receive Accent; inward-facing cavity walls or recessed inner ends receive Detail. A coplanar solid end disk remains part of the end assembly rather than being mistaken for a hole.

Assignment uses a triangle's shared geometric anchor and face normal, with whole-region ownership as a fallback, rather than independently classifying each vertex's interpolated normal. At full strength, each accepted section overrides previous material islands and contour masks. The Accent slot is deliberately used for structural end assemblies, so this coherent section coverage is independent of the earlier sparse random-accent budget. These roles are geometric, not engine/inlet/exhaust labels. Straight uninterrupted barrels receive no arbitrary axial bands, and boxes are rejected. No source paint, ship identifier or semantic equipment hint is used. Geometry is unchanged.

The Structural section contrast slider affects only the guided copy; zero restores the previous guided behavior. It shares the existing mirror folding and material slots. The readout reports candidate assemblies and profile transitions. These are approximate fits, not a solid-model decomposition: disconnected shells, nearby overlapping tubes and bevels can remain ambiguous, and accepted cylinders elsewhere on a ship may also receive section treatment. The implementation does not infer operational engine direction, add exhaust glow, or use per-model identifiers. A near-open center is not enough by itself: material assignment still evaluates actual sampled surfaces and normals.

## Authored / baseline / guided exercise

The new default comparison puts three copies of the selected hull next to one another in the same hangar: original authored/source appearance, existing procedural baseline, and the same generator with design preferences. Both generated copies share geometry, source mesh, algorithm, material slots, seed and symmetry. Baseline algorithms remain available in Chunk coloration; this adds preferences rather than replacing them. Neutral colors provide a useful ablation.

Visual inspection of the Quaternius Spitfire and Challenger suggested these hypotheses:

| Authored cue observed | Procedural weakness | Implemented preference |
| --- | --- | --- |
| Spitfire's paired pod shells read as repeated whole forms around a contrasting central area. | Independent chart colors fragment repeated housings. | Merge adjacent nearly coplanar charts into coherent groups; use whole-group material targets and retain mirror folding. |
| Challenger's dominant body field and darker central insert establish a large/medium hierarchy. | Small chart islands compete with broad surfaces. | Keep the largest groups quiet, budget secondary coverage, and suppress tiny bevel islands. |
| Their strong material breaks tend to follow changes in form. | Boundary enamel outlines every chart, including artificial atlas cuts. | Distinguish actual signed creases from smooth chart boundaries: contrast convex ridges, blend concave joins toward Detail. |
| Contrasting areas form bounded, readable groups rather than equal-strength scattered flecks. | Random eligible charts can consume accent material. | Rank small/medium crease-rich groups using geometric edge length rather than triangle count; allocate at most 3% of total source area before reflection (up to roughly 6% after reflection). |
| Large surfaces provide quiet space around already complex geometry. | Dense material islands add competition to small parts. | Large-form coherence blends noisy baseline assignments toward coherent targets; Accent restraint removes unbudgeted accent islands. |

These are visual observations from two models, not statistics learned from their textures. Gold can be a dominant body material rather than an accent; the rule concerns hierarchy, not a mandatory color ratio. The generator never samples source paint to make these decisions. Geometry-only operation still applies to arbitrary greyboxes and solids.

The adjustable preferences are Structural section contrast, Contour emphasis, Large-form coherence and Accent restraint. Setting all four to zero reproduces the selected baseline. Material slots remain independent and should offer useful contrast; the pass does not assume orange is always an edge highlight. Existing normal-map/detail controls remain independent. No cockpit, gun or engine recognizer is added.

Signed convexity/concavity uses two-manifold shared mesh edges and adjacent face normals/centroids. Open and nonmanifold edges are left unclassified. This is not ambient occlusion: disconnected overlapping parts and T-junctions without shared edges do not produce reliable valley information. The readout exposes chart/group counts, accent candidate area and signed crease counts so these limitations remain visible.

## Chunk coloration (current)

Choose Chunk coloration to compare four CPU-generated material assignments on the same selected Surface grammar. Geometry and coloration are independent; the four editable palette slots are Primary, Secondary, Accent and Detail. The original/source and region diagnostic remain beside the four treated copies in one hangar.

Connected region materials assigns a stable material to each detected chart. Boundary-distance enamel interpolates inward from the chart's actual boundary segments. Irregular material islands distributes unequal Voronoi zones in each chart's local tangent frame. Layer edges / dark boundaries darkens chart boundaries and newly exposed plate sidewalls. This last operation is not recess detection or ambient occlusion.

These replace the previous hull-space stripe recipes. The shader renders precomputed palette weights; it no longer chooses color using hull-axis bands. Source geometry remains immutable. Additional coplanar sampling vertices support color gradients without changing the silhouette. Spatially clustered face centroids with a normal penalty associate generated plate vertices with source charts; very close overlapping surfaces can still be ambiguous. Chart fragmentation on finished artist models remains visible rather than receiving model-specific fixes.

Surface finish remains independently switchable. Construction grammars still compare the original six geometry algorithms. The unused earlier color-field/marking controls are hidden. No automatic gun/exhaust recognition has been introduced.

## Four surface materials

The four assignment slots now each define a surface material: editable base color, roughness, metalness, fine detail strength, wear and emission. The same normalized region weights blend all properties. Presets include satin paint, glazed ceramic, polished alloy, brushed titanium, matte rubber/composite, quilted thermal fabric and luminous ceramic. Material sets offer four starting combinations, without changing the assignment algorithm, geometry or seed.

Neutral colors / inspect materials replaces albedo with neutral grey while retaining finish and fine structure. Uniform grey / compare geometry continues to disable material shading. Material finishes and fine detail can be disabled separately. Material edits update uniforms without rebuilding the mesh. Construction grammars also shade their generated paint-weight masks with these surfaces; exposed source hull defaults to Detail. Original/source and diagnostic copies keep their previous rendering.

This remains a lightweight local preview renderer, not full PBR: analytic highlights, roughness-dependent environment response, emission without bloom, and shader relief without displacement. Fine material patterns use surface-oriented projections and fade at small screen scales. They do not select the coarse material regions; those remain CPU geometry assignments. Mirror folding applies to their coordinates and normals. Wear currently uses the existing geometric normal-variation proxy, not a measured recess or edge-distance field. No canopy or exhaust classifier or extra semantic slots are added.

## Automatic bilateral symmetry

Auto mirror symmetry is enabled by default. The detector tests coordinate axes and covariance-derived axes, including rotated models, against reflected source vertex positions. It accepts a plane only when at least 90% of sampled vertices match within 1.2% of hull extent and normalized error remains below 2.5%. The analysis readout reports the chosen plane normal and match percentage; ambiguous multiple-plane shapes use deterministic candidate order. Asymmetric hulls without a confident match keep their original treatment.

Generated treatment triangles are clipped to the positive half-space and reflected with corrected winding. Coloration queries fold position and normal into that same half, so region selection, island seeds and boundary gradients agree across the mirror plane. Original artist geometry, diagnostic region colors, source textures and lighting remain unchanged. This is a bilateral reflection plane, not rotational symmetry detection. Vertex-based confidence can miss models with very different triangulation on each side; approximate detections can also overrun small asymmetric details. The checkbox provides an explicit opt-out for evaluation.

# Procedural hull construction bench

Open `experiments/livery-lab.html` through the local static server. The scene holds
26 hulls, including all 11 locally vendored Quaternius ships used in flight.
The collection filter and solo inspection share the same geometry pipeline.
The default coloration workflow places six copies on the same deck: original, four coloration treatments and detected regions. Construction comparison places eight copies: original, six grammars and detected regions. Change the subject to compare another
hull without leaving this mode. This is the primary reusable greyboxing workflow;
the many-hull collection is a secondary generalization check. One orbit camera and common controls apply to the
whole scene. There are no independent viewports. `Uniform grey` removes material
variation from source and treated hulls while keeping diagnostic colors visible.

## Evaluation contract

The objective is a general procedural algorithm, not a curated set of attractive
ships. **Geometry only is the default.** Every subject passes positions and
normals through the same detector, with material batches merged for inference.
The generator receives no subject ID, primitive class, cockpit hints, predesigned
regions, or per-hull parameter presets. The same settings apply across the hangar.
Artist source UVs are carried through cuts for optional paint blending; they do
not drive geometry-only segmentation. Base meshes and source arrays stay intact.

`Use authored material exclusions` is an explicit assisted comparison. It keeps
source material boundaries, excludes tagged cockpit/machinery/structure/markings
and translucent batches, and uses original texture colors to mask dark or blue
source areas. It is a heuristic, not a reliable semantic classifier. The mode is
shown in the readout; this extra input is never silently enabled.

## Geometry pipeline

`hull-panels.js` is a pure module, with no DOM, renderer, asset loading, or shape
names. Its inputs use the normalized display hull coordinates (longest extent 2).

1. Weld coincident triangle edges with a 0.00001 position tolerance. Traverse
   manifold edge pairs whose geometric normals differ by less than about 20
   degrees. Disconnected islands and sharp edges separate components.
2. Keep almost planar components coherent. For curved components, clip the
   interpolated normal field against a shared six-direction normal-space atlas,
   then split disconnected chart islands. This is used for every mesh, not only
   spheres or cylinders. Source positions, normals and UVs interpolate at cuts.
3. Derive each region's dominant tangent axis from its area-weighted geometric
   covariance, using exact triangle moments so added tessellation does not change
   the principal direction. No authored front/back axis is required.
4. Keep at most the 24 largest eligible regions. The area floor is the greater of
   0.018 display units squared and 0.75% of total analyzed area. Narrow cells are
   also rejected. These shared budgets intentionally leave small parts quiet.
5. Pass the same region analysis into one of six independent construction rules.
   They share clipping, boundary extraction and mesh primitives, but do not all
   subdivide into raised strips. No port, weapon or equipment identification is
   attempted; the target is quick visual exploration of greyboxes.

| Grammar | Construction operation |
| --- | --- |
| Clean armor | One or two broad conforming shell caps per region, with quiet seams. |
| Layered armor | A retained lower shell plus overlapping upper courses at stepped heights; underlying margins remain exposed. |
| Structural bays | Infer a whole-hull principal axis, schedule common transverse frames, and fit narrow stringers and diagonal braces over the existing shell. There are no bay-sized armor caps. |
| Thermal blankets | Subdivide the original surface and inflate interiors according to distance from actual boundaries, with smooth generated normals. Edges stay nearly flush. |
| Industrial paint | Flush source-surface recoloring and a broad identification band. No armor extrusion; matching the original in uniform grey is expected. |
| Faceted armor | Clip on an oblique axis, project broad caps onto tilted planes and stitch skirts toward the source boundary. This changes the facets rather than simply their colors. |

The global axis used by the bay grammar comes from surface-area-weighted hull
covariance, without a provided forward direction. Structural pieces are only an
approximation of a construction language, not an inferred working ship design.

`Show detected surface regions` displays chart colors independently of the finish.
The readout includes total regions, regions omitted by the common size/budget
rules, generated mesh piece count and structural part count. Split view shows source
geometry/paint on the left and generated geometry on the right. Plate divisions,
thickness, seed and all six treatments are shared settings. Colors, source-paint
blend and restrained wear affect shading without changing the source hull.

Shape fixtures remain separate from detailing. Barracuda/fleet shapes are fixed
snapshots of the existing greybox builders; artist ships retain their complete
source mesh, normals, UVs and local textures. All subjects are fitted individually
for inspection, not shown at true relative scale. Original dimensions are labeled.

## Verified prior art and comparison

- [SideFX Labs SciFi Panels](https://www.sidefx.com/docs/houdini/nodes/sop/labs--scifi_panels.html)
  uses lot subdivision with borders, bevels and notches, with alignment and
  minimum-size controls. It emphasizes coherent UV islands. This bench takes the
  region/subdivision idea but derives charts from mesh geometry instead of
  requiring artist-authored UV layouts.
- [Lazy Panel Generator](https://superhivemarket.com/products/lazy-panel-generator?num=1&src=gems)
  uses marked sharp edges and material slots, independent panel groups, bevel
  controls and boundary-aware fasteners. The optional assisted mode makes the
  benefit of that authored information explicit; geometry-only remains the test.
- [FI ShipKit](https://github.com/savannah-i-g/fi-shipkit)
  separates hull-generator families and dressing passes. Its README describes
  constrained working machinery and recursive paneling. It is a useful reference
  for construction hierarchy, but it does not establish that arbitrary imported
  hulls can be detailed automatically. No code or assets were copied from it.

## Limits and checks

This is still an algorithm experiment. The six-direction atlas is orientation
biased; it is not intrinsic curvature parameterization. Disconnected/T-junction
or nonmanifold input can fragment the analysis. Overlapping primitives are not
boolean-unioned, and internal faces are not removed. Geometry-only cannot know
that a surface is a cockpit or exhaust; incorrect plating there is a visible
failure to evaluate, not a reason to add a hidden hull exception. Outward source
normals are expected. Very narrow/irregular boundary insets can still distort.
Planar reconstruction and added frames can extend beyond the original silhouette;
there is no boolean union or collision reconstruction. Source buffers are retained, so this is additive dressing rather than
production topology reconstruction.

`tests/hull-panels.cjs` checks adjacency, coplanar tessellation independence,
determinism, explicit exclusions, concave boundaries, openings and finite cap,
bevel and wall normals. `tests/livery-lab.cjs` exercises all subjects and the
original artist payload, art recipe/layer controls, shared source geometry across comparison copies, and
comparison mode persistence. Six distinct operation identifiers and flush-paint
geometry are also checked. Browser inspection covers curved plates, diagnostic
colors, source/treated comparison and controls. Run `npm run check`.

## Depth and decals

The perspective depth range is 0.2 to 100 display units. Paint coats and chart
colors keep the exact source surface, with separate polygon-offset render passes
for base paint and markings. These decal passes cull backfaces and retain depth
testing against the scene. Raised armor uses unbiased depth testing. This avoids
normal-offset seams and competing near-coplanar shells, while preserving real
occlusion. The depth coefficients and ordered paint passes have regressions.

`tests/livery-art.cjs` covers recipe metadata, immutable geometric curvature
analysis and sparse surface-supported decal graphics.

### Fine-detail filtering

Material harmonics use screen-space derivatives to fade before becoming subpixel, including at grazing angles. Quilted seams use a filtered harmonic profile instead of hard periodic borders. Smooth triplanar blending avoids dominant-axis texture switches on curved surfaces; normal variance broadens unresolved specular highlights. WebGL contexts without standard derivatives use a conservative distance-based footprint fallback. The region masks and generated geometry are unchanged.

Packed wear/curvature data is decoded relative to the stabilized integer surface role, rather than with `fract`. Interpolation just below an integer must yield zero wear rather than wrapping to nearly full wear; that discontinuity previously produced camera-dependent fingerprint/diagonal artifacts even with microdetail disabled.
