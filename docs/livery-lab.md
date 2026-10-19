# Procedural hull construction bench

Open `experiments/livery-lab.html` through the local static server. The scene holds
26 hulls, including all 11 locally vendored Quaternius ships used in flight.
The collection filter and solo inspection share the same geometry pipeline.

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
5. Partition eligible regions along their own dominant axis, clipping their
   actual source triangles. Inset only welded exterior and hole boundaries;
   triangle edges inside a plate never become seams. Emit conforming caps,
   beveled borders and thickness walls above the source shell. Neither concave
   outlines nor openings are replaced by a convex hull or bounding rectangle.
6. Some treatments add limited service housings or vent assemblies. Candidate
   sites maximize clearance from the actual cell boundary, and every housing
   corner must be supported by the local surface with compatible normals.
   Fasteners belong to selected housings rather than every triangle.

`Show detected surface regions` displays chart colors independently of the finish.
The readout includes total regions, regions omitted by the common size/budget
rules, actual plate count and functional detail sites. Split view shows source
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
Service placement checks surface support, not actual ship function or interior
access. Source buffers are retained, so this is additive dressing rather than
production topology reconstruction.

`tests/hull-panels.cjs` checks adjacency, coplanar tessellation independence,
determinism, explicit exclusions, concave boundaries, openings and finite cap,
bevel and wall normals. `tests/livery-lab.cjs` exercises all subjects and the
original artist payload. Browser inspection covers curved plates, diagnostic
colors, source/treated comparison and controls. Run `npm run check`.
