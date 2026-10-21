# Direct imagegen cubemap study

This tests whether imagegen can directly generate geometrically consistent cube
faces. It is not an active flight background.

- `atlas.png`: first built-in imagegen result; exact prompt in `provenance.json`.
- `atlas-repair.png`: targeted edge-repair edit; prompt in `repair-provenance.json`.
- Both results are 1536 × 1024, six 512 × 512 faces. Larger requested dimensions
  were not returned. No upscaling was used in the inspection.
- `inside-cube-preview.png` and `repair-inside-cube-preview.png` show rectilinear
  camera views assembled from the actual face pixels, including a two-face join
  and a three-face corner. These expose discontinuities hidden by the flat atlas.
- `inspection.json` and `repair-inspection.json` retain edge measurements.

Face order is +X, -X, +Y on the top row and -Y, +Z, -Z on the bottom. For each
ray choose the face with the largest positive dot product with its face normal.
Face horizontal coordinates are dot(ray, right)/dot(ray, normal); vertical
coordinates are dot(ray, up)/dot(ray, normal). Image row zero is the face's top.
Normal/right/up vectors are:

| Face | Normal | Right | Up |
| --- | --- | --- | --- |
| +X | 1,0,0 | 0,0,-1 | 0,1,0 |
| -X | -1,0,0 | 0,0,1 | 0,1,0 |
| +Y | 0,1,0 | 1,0,0 | 0,0,-1 |
| -Y | 0,-1,0 | 1,0,0 | 0,0,1 |
| +Z | 0,0,1 | 1,0,0 | 0,1,0 |
| -Z | 0,0,-1 | -1,0,0 | 0,1,0 |

Inspection uses bilinear sampling, 512 × 384 views, vertical FOV 75°, headings
0° and 45°, and pitch 35.264° for the three-face corner. Edge metrics sample
512 rays on both sides of each geometric edge (face coordinates 0.9999 and
1.0001), excluding the extreme 2% near corners. Raw absolute differences are
also averaged in groups of 16 samples to reveal cloud mismatch. The repair is
brighter, so its larger absolute error is not a brightness-normalized ranking.

## Result

The generator follows the six-cell atlas format. It does **not** reliably meet
the adjoining-face geometry/continuity constraints in these two trials. Both
show obvious two-face seams and three-face discontinuities. The repair changed
brightness and interior artwork despite instructions to preserve them. Neither
is a production-ready seamless cubemap. This small atlas also supplies less
native detail than the individual-panel approach, not more.

`user-panorama-reference.png` is the user's separately generated 1774 × 887
equirectangular example; its original prompt is unknown. The equator and ±70°
inspection views are in `user-panorama-spherical-views.png`, sampled with a 45°
vertical field of view and the same atan2/acos convention as flight. Equatorial
views are attractive; polar views exhibit pinching/streaking. Apparent polar
stretching in a flat image is not sufficient proof of correct equirectangular
geometry. This reference is retained for comparison only.
