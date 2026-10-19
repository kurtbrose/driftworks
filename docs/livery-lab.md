# Procedural hull construction bench

Open `experiments/livery-lab.html` through the local static server. The scene holds
26 hulls, including all 11 locally vendored Quaternius ships used in flight.
The collection filter and solo inspection share the same geometry pipeline.
The default workflow, `One hull / all treatments`, places eight copies together on the same deck:
original, six grammars and detected regions. Change the subject to compare another
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
original artist payload, shared source geometry across comparison copies, and
comparison mode persistence. Six distinct operation identifiers and flush-paint
geometry are also checked. Browser inspection covers curved plates, diagnostic
colors, source/treated comparison and controls. Run `npm run check`.
