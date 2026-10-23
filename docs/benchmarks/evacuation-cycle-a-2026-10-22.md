# Evacuation Cycle A rendering readiness

Local cockpit dry run, October 22, 2026. Static-server route:
`experiments/flight.html?mission=evacuation`.

The approved commuter and double-decker are converted from their GLBs into nine
immutable material batches each, with source node transforms baked once.
Per-frame ship motion uses GPU bases/origins; no transport vertex data is rebuilt.
Depot module boundaries, independent arm links and caution-paint UVs remain.
This follows the depot study's demonstrated material-submission bottleneck;
there is no measured claim here against an unbatched flight implementation.

## Matched scene measurement

Foreground in-app browser; CSS viewport 1573 x 1068; scene and sky backing
2360 x 1602 (approximately 1.5 pixels per CSS pixel); render scale 100%; normal
materials, intact approved sky and ordinary effects. Initial camera
`[0, -30, 1200]` in scene units (16.6666667 metres per unit), facing +Y with +Z up.
Both civilian liners and the depot are visible. Two allied fighters are present;
the opening's four raiders have not spawned. AI, projectiles, camera, traffic and
story clocks are frozen during the comparison. The ordinary frame loop is
suspended and the benchmark submits one render per animation frame.

ABBA asset visibility order: off, on, on, off. Each block discards 20 warm-up
frames and records 90 samples, for 180 recorded samples per condition.

| Condition | CPU submission median / p95 | Frame interval median / p95 | Draws | Triangles |
| --- | --- | --- | --- | --- |
| Depot and liners off | 0.90 / 1.20 ms | 13.30 / 13.40 ms | 5 | 5,290 |
| Depot and liners on | 3.70 / 5.10 ms | 13.30 / 13.40 ms | 163 | 1,010,580 |

The scene adds 158 draws and approximately one million triangles. CPU submission
has measurable cost while browser cadence remains refresh limited. This supports
the rough cockpit pass at this viewpoint; it does not measure GPU completion,
prove spare GPU capacity, or establish a heavy-combat/finale budget. Asset parsing
and initial geometry upload are outside the warmed measurement. Source geometry
and materials were not simplified to obtain these results. The shared flight
shader approximates GLB PBR finishes while retaining base colors and emissive
classification.

## Revisions and checks

- Depot JSON SHA-256: `56ec8dd484b273a7d10700eb3c273b426a7d9d4b2ebe4e74633171c7c46e6c40`
- Commuter GLB SHA-256: `c9bbacc61e755b585d4db1763a252cc889b63e59f8ae44db0298e07a638cdaa7`
- Double-decker GLB SHA-256: `a361d561863d16dabbdf8a7b000f0bd3c7ef6c0d7ea2268dee0d57444560f29f`

Browser inspection confirms the approved silhouettes, true relative sizes,
vertical docking attitude, initial departure motion and intact planet. No browser
errors were logged. Headless tests cover channel occupancy, charges before
contact, threat-gated fuel completion, diversion, departure completion and reset.
The shared refueling-cycle suite covers manual hold, retract-before-clearance,
both original hull ports and vertical departure. Binary regressions verify
source revisions, material groups, metre spans and transformed unit normals.
`npm run check` passed, including the 343 browser-native tests and standalone
asset/flight checks.
