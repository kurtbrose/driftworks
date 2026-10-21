# Orbital cubemap prompt experiment

Both 1536 x 1024 atlases were generated with the built-in ImageGen tool. Each
contains six 512px square faces in row order: right, left, front / back, up, down.
Exact prompts and references are in the sibling JSON files.

Open `experiments/impact-cubemap-review.html` from the static server to inspect
the atlas using 90-degree rectilinear directional sampling. The projection
revision is available from a link in the viewer. No feathering, geometric warp,
seam repair, or perspective-plate overlay conceals the generated edges.

The original fails visual acceptance: the horizon develops a sharp corner at
the front/right boundary and cloud/star features do not continue across faces.
The revision also fails: a horizon corner remains at the front/right seam, and
the front/down view exposes hard cloud/coastline discontinuities. Explicit
numeric projection instructions changed the drawing but did not enforce the
required geometry or cross-face correspondence. At 512px per face, these are
projection proofs and cannot provide the requested hero detail.

Neither atlas replaces the flight sky or existing impact animation plates.
