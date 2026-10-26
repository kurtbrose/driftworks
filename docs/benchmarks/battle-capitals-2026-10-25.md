# Battle capital ships · 2026-10-25

Two existing 1,305 m Aegis ships now participate in the thirty-fighter zone-defense
sortie. There are no new model conversions or altered dimensions/materials.
The shared immutable GPU hull/turret buffers, independent mount pivots, physical
weapons, faction livery and collision boxes use the established Aegis pipeline.
The battlefield reset anchors both ships near the fighter zones and preserves
the complete fighter roster. Standalone Aegis hangar ownership remains separate.

## Actual-scene rendered comparison

In-app browser foreground, 1280 × 720 CSS viewport, 1280 × 720 backing,
DPR 1 (temporary viewport override, restored after sampling), production artwork/textures and 100% resolution. Starting cockpit camera,
all thirty fighters alive, both capital hulls visibly in frame, and both bows
turned toward the opponent with a twenty-degree offset for gun-deck clearance. Camera, actors,
AI, sky, asteroid and weapons frozen. Four ABBA blocks use 20 warm-up plus 90
measured rAF frames each. No concurrent tests or render probes during sampling.
OFF removes the capital pair and its own projectile geometry, retaining all
fighters, scenery and the sky; ON restores both ships. The ships retain shared
immutable buffers across the comparison and normal live movement.

| Capitals | Render CPU median / p95 | Frame median / p95 | Draws | Triangles |
| --- | --- | --- | --- | --- |
| OFF | 1.30 / 1.50 ms | 13.30 / 13.40 ms | 36 | 406,189 |
| ON | 4.30 / 4.70 ms | 13.30 / 13.40 ms | 218 | 490,853 |

The two visible hulls add 182 draws, 84,664 triangles and approximately 3.0 ms
median render CPU here. The existing buffer-sharing and GPU-pose path remains
in use; no per-frame mesh baking, silhouette reduction or resolution reduction
was introduced. These costs do not justify replacing the authored ships with
proxy art. Frame cadence was refresh-limited; it does not establish spare GPU
budget. GPU execution and sustained live frame p95 remain unmeasured.

An earlier sample after flying past the ships submitted only two additional
effect draws and 184 triangles. Both hulls had left the frustum, so that sample
was rejected and the comparison repeated at the starting camera. It is not used
as evidence of capital rendering cost.

## Behavior and visual checks

The real seeded headless battle session (seed 29, test-only extra player hull)
was stepped for twenty seconds alongside the Aegis pair. Twenty-six fighters
remained; hangar support stayed disabled. Capital integrity was 18,480 and
18,400 from the 20,000 start, confirming main-battery hits on both hulls. PD also
recorded fighter hits. These are live physical shots rather than authored
background exchanges. The focused Aegis regression covers sortie-relative
placement, both battery banks firing, stable mesh buffers, reset and preservation
of existing fighters, alongside the previous movement, hull contact, faction
safety, articulated mount, weapon accounting and default-sandbox tests.

Cockpit inspection checked both faction hulls at rest and during movement,
including firing effects and the fighter battle between them. The initial
placement was revised to bring both anchors into the starting cockpit view.
A subsequent heading change turned their authored -X bows toward one another;
the final table above was measured after that change. A prior broadside sample
used DPR 1.5 and is not a matched before/after speedup comparison.
Full nearby/underside flight inspection and sustained GPU profiling were not
performed for this placement-only reuse of the already-tested asset.

The full repository check passed 122/122 entries. The subsequent heading-only
change passed the focused Aegis regression (including both ships landing hits),
strict type checking and asset-version validation.

## Source revisions

- `experiments/aegis-flight.js`: `191abbf71a78`
- `experiments/flight.js`: `c2cd695b1947`
- `assets/ships/aegis-kit/flight-rig.js`: `857eb4969b70`
