# Hyperbolic capital references: visual and performance checks

Measured 2026-10-28 in the production hyperbolic flight scene.

## Asset and placement

Source: `assets/ships/aegis-kit/flight-rig.js`, SHA-256
`1beda87c9e3b41bfb29f31f56634443720e88698b05d9075a95e9fa39997a5fc`.
The existing unarmed bake merges fixed turret/engine parts by compatible material.
Both references retain the authored 1,305 m main hull; normal-coordinate center
placements in metres are `(-120,890,-115)` and `(480,1510,190)`, with headings
0.20 and -0.35 radians. Initial intrinsic ranges are approximately 0.90 / 1.60 km.

Twenty-metre maximum triangle edges produce 177,126 submitted capital triangles
for the pair, in 26 logical batches. Both ships share their prepared immutable
vertex/UV/normal buffers. A local Node preparation probe measured about 410 ms
once for idle-rig creation plus subdivision; repeated placement generation was
about 0.022 ms/frame over 1,000 calls and replaced no vertex buffers. This is
preparation CPU evidence, not a frame-rate or GPU claim.

## Actual-scene matched comparison

Production URL: `experiments/flight.html?mission=hyperbolic`.
Use Flight lab & diagnostics -> Renderer diagnostics -> Benchmark capital ships
on / off. The separate fleet button keeps capitals present and varies fighters.

Initial frozen camera at player origin, looking +Y with +Z up; curvature radius
650 m; GTF Ulysses, Subach HL-7, normal 16-NPC initial roster, production artwork,
shields enabled, 100% render scale. Most initial fighters are outside this camera's
frustum. Foreground in-app browser, CSS viewport 884 x 888, DPR 1.5, backing
1326 x 1332. No other review renderer or tests ran during sampling. OFF/ON/ON/OFF,
20 warm-up and 90 retained rAF samples per block; simulation and projectiles frozen.

| Final run | CPU submission median / p95 | Browser interval median / p95 | Draws | Triangles |
| --- | --- | --- | --- | --- |
| Capitals OFF | 1.00 / 1.40 ms | 13.30 / 13.40 ms | 3 | 166 |
| Capitals ON | 1.70 / 2.10 ms | 13.30 / 13.40 ms | 25 | 177,292 |

An earlier run of the same finite-hull path before moving the nearer center from
(-260,860,-100) to (-120,890,-115) measured CPU medians 0.60 / 1.00 ms OFF/ON,
with the same draw/triangle counts and 13.30 ms browser median. This is a placement
iteration, not an optimization comparison. The final matched run adds about
0.70 ms median CPU submission. No GPU timer was used; refresh-paced cadence does
not prove GPU headroom. Main-renderer submission excludes target-camera/HUD and
simulation costs. This check establishes a modest local submission cost, not a
universal hardware budget or a full-combat speedup.

## Visual and numerical checks

An ignored review harness mounts the production flight presentation, source asset,
sky and first-person camera. Captures are in `output/hyperbolic-capitals/`;
the harness is in `.scratch/hyperbolic-capitals/`. Those are local evidence, not
deployment resources.

Inspected both complete hull references at the starting camera with radii 350,
650 and 100000 m. At 650 m, the near ship is broadside below/left and the far ship
above/right. Negative curvature reduces transverse apparent size markedly with
range; the distant ship is especially small at 350 m. Near-flat images are larger
and some hull extremities cross the screen edge, as expected from ordinary
perspective. Straight geodesic features remain straight; no decorative screen bend
is applied.

Inspected bow, stern/engines, underside, windows, hangar openings and panel joins
at 650 m, plus an intrinsic close bow view at 350 m. Checked camera-inside bounds
and near-plane clipping at 650 m: geometry remains drawn rather than disappearing
through flat-box culling. Close cameras are constructed intrinsically from the
near hull's normal-coordinate placement, not guessed Euclidean chart offsets.
No detached fixed turrets, material seams or visible tessellation cracks were
observed in these views. This is inspection of these two unarmed references;
animated mounts, combat damage and physical hull collision are outside their role.

A development WebGL oracle compiled the exact shared production hull shader and
checked 192 GPU samples at four radii (350,650,1800,100000 m), three center
placements and four local samples/normals. Positions were compared with intrinsic
CPU offsets; normals with independently finite-differenced CPU position Jacobians.
All passed 0.002 scene-unit position and 0.002 unit-normal tolerances. No shader
errors were reported; the existing multiple-Three-import warning remains.

Tracked regressions in `tests/hyperbolic-capitals.cjs` cover intrinsic radial and
axial scale, nearly-flat perspective, immutable sharing, bounded subdivision and
auxiliary-channel interpolation, real-session chart-rebase invariance, and
conservative culling at four radii. Existing hyperbolic combat and static culling
checks also pass. `npm run check` completed type, script-list and asset checks,
then finished with 137/138 test entries passing. The cinematic demo entry failed
in that run and passed when rerun standalone together with its camera checks.
Concurrent shield work was changing the shared checkout during verification;
that work and its generated URL edits are excluded from the capital-reference
commit. This is not a claim of a clean all-green full-suite run.

## Clean flyby follow-up: renderer audit and controlled passes

The overlay-free playback is `experiments/flight.html?mission=hyperbolic&flyby=1`.
It reuses the same prepared hull and production material paths. One capital stays
at the canonical origin. A 30 m/s observer follows a geodesic at about 1.30 km
closest range, holding a parallel-transported attitude. Four original-scale
Raptors cross at two depths, all with 70 m/s local speed and matching initial
headings. Their diagonal geodesics allow rear craft to emerge outside the capital
silhouette; the depth buffer supplies foreground/background occlusion. Space
pauses a clean frame; Esc opens controls, including a fighter visibility toggle.

The sky is black because normal flight's rotation-only sky is a deliberate
background convention, not an H3 ideal-boundary texture. Environment lighting is
retained. No optical warp, screen offset, fighter enlargement, camera tracking,
HUD, grid or numerical overlay is used during the live take. The local source
clock covers 8–22 s; the 14 s pass fades out before resetting, with a 14 s loop.

The extended headless regression checks the actual capital-frame representation
at intrinsic distances 350 / 650 / 1300 m. Small-feature angular sizes recover
`R*sinh(d/R)` and small transported sideways baselines recover `R*tanh(d/R)` at
R=650 m. It also checks observer speed and transport, four fighter speeds and
chart ownership at four radii, and the midpoint foreground/capital/background
sightline and depth order.

An ignored browser oracle (`.scratch/hyperbolic-flyby/qa.html`) adds calibration
features through `flightPresentation.setCalibration` in the unmodified production
renderer. It uses static source buffers, the actual capital texture atlas and
controlled uniform environment lighting for marker visibility. For each of three
ranges and three 50 m/zero/negative-50 m baselines, both raw and textured material
paths were compared with analytic hyperbolic ray bearings: all 18 cases passed,
maximum centroid error 0.275 backing pixels, tolerance 1 pixel. The original
uniform 1-pixel test texture was unsuitable for this audit; final results use the
real asset atlas. This audit checks projected positions; ordinary-material visual
inspection is a separate check.

A matched foreground ABBA comparison sampled the actual frozen flyby at source
time 14 s: 884 x 888 CSS, DPR 1.5, 1326 x 1332 backing, native render scale,
production materials, four-craft roster (one outside the view), no AI or projectiles,
black sky, identical camera/actors/resolution. OFF/ON/ON/OFF, 20 warm-up + 90 retained
rAF samples per block. Other review renderers/tests were not running during it.

| Single capital in final flyby | CPU submission median / p95 | Browser interval median / p95 | Draws | Triangles |
| --- | --- | --- | --- | --- |
| OFF, fighters retained | 0.70 / 0.90 ms | 13.30 / 13.40 ms | 4 | 13,034 |
| ON, fighters retained | 0.90 / 1.20 ms | 13.30 / 13.40 ms | 15 | 101,597 |

This is about 0.20 ms added median renderer CPU submission on this local run.
It is not a GPU timer or an optimization comparison against the earlier, different
camera/two-capital workload. No measured bottleneck justified changing the source
asset, material batching, authored scale or scene resolution. Prepared hull
buffers remain shared and immutable.

Local evidence is in `output/hyperbolic-flyby/`, including the GPU audit JSON,
frozen view captures and the matched comparison. Inspected the midpoint foreground
crossing, rear-lane appearance outside the silhouette, and early/late hull screen
edges. Distant fighters are small, which can weaken the cue. Mechanical accuracy
and perceptual distinctiveness remain separate; moving fighters do not by
themselves rule out every flat-space explanation with different velocities.

The follow-up full `npm run check` passed type checking, script lists, generated
asset validation and all 138/138 test entries. Browser checks also verified clean
Space-pause, Esc controls, Replay, fighter visibility toggling and no runtime
errors. The final clean playback capture is `output/hyperbolic-flyby/clean-playback.png`.


## Close ten-fighter formation, 300 m radius

The flyby now uses a five-column, two-row formation beside the hull. Its default
radius is 300 m; the wider camera and 30 m/s camera path are retained for this
setting. Original fighter and capital metre scales are unchanged. The 30 m
experiment used a closer/slower camera and is not a controlled comparison.

Measured the actual production presentation at source time 14, with ten Raptor
fighters, shields disabled and the black sky. Foreground viewport 1280x720 CSS,
DPR 1.5, backing 1920x1080. Capital-off/on/on/off blocks each used 20 warm-up
frames and 90 retained samples, after the test suite finished. Capital off:
CPU submission median 0.8 ms, p95 1.1 ms, 11 draws and 43,420 triangles. Capital
on: median 1.0 ms, p95 1.6 ms, 22 draws and 131,983 triangles. Browser cadence
was 13.3 ms median / 13.4 ms p95 in both cases. These are CPU and cadence
measurements, not GPU execution timings or evidence of spare GPU capacity.
No demonstrated bottleneck required an asset change.

Inspected the actual 300 m playback and the 30 m experiment. The 300 m pose
regression checks all ten fighters' intrinsic spacing and nose alignment; the
30 m close pass has finite-pose coverage. The full project check passed 138/138
entries, with strict types and generated-file checks also passing. The free-flight
mission retains its 650 m default; 300 m is available in its curvature selector.


## Axial cross-section placement, R=400 m

Replaced the centre-normal exponential placement with axial Fermi coordinates.
The centreline length and repeated section geometry are preserved; there is no
transverse scale growth with distance along the axis. Prepared source buffers,
textures, material batching, authored scale, ten-fighter formation, camera and
lighting remain the same. Normal maps and surface normals use the cofactor of
the new analytic Jacobian in the existing PBR and custom-material paths. The
culling radius uses the hyperbolic right-triangle distance of the Fermi box.

Matched before/after ABBA measurements used the real production presentation,
source time 14, R=400 m, ten Raptor fighters, black sky and shields disabled.
CSS viewport 884x888, DPR 1.5, backing 1326x1332. Each off/on/on/off block used
20 warm-up frames and 90 retained frames; no test suite or rebuild ran during
sampling. Before: capital off CPU median/p95 0.8/1.1 ms; on 1.0/1.3 ms. After:
off 0.8/1.2 ms; on 0.9/1.2 ms. Both mappings submitted 11 draws / 43,420 triangles
off and 22 draws / 131,983 triangles on. All cadence medians/p95s were 13.3/13.4 ms.
These are CPU submission and browser cadence measurements, not GPU execution
measurements; differences are too small to claim a speedup. No asset optimization
was needed for a demonstrated cost regression.

The actual shader passed 320 transform-feedback position/normal checks across
R=300,400,650,100000, axial locations -650,-400,0,400,650 m, four cross-section
positions and four normal directions. Position references use sequential intrinsic
axis travel and transverse offsets; normals use finite differences of that
independent placement. Maximum position residual was 0.00573 m and maximum
1-cos(normal angle) was 1.37e-7. The existing 18 raw/PBR GPU angular projection
checks passed with maximum centroid residual 0.275 px. Focused headless checks
verify congruent cross-sections, unchanged 1,305 m centreline, near-flat limit,
actual-session rebasing and an explicit visible corner outside the obsolete
centre-map bounding ball. Early, midpoint and late rendered flyby views were
inspected for materials, normals and hull-edge visibility; no browser errors.
Evidence is under output/hyperbolic-flyby/axis-* (ignored).

The final full `npm run check` passed strict types, generated-file validation and
all 138/138 test entries. The clean playback capture is
`output/hyperbolic-flyby/axial-clean.png`.
