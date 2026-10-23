# Orbital planet and animated impact

Approved replacement for the original animated planet. Generated with built-in
ImageGen using the existing palette and user-supplied real orbital imagery as
geometry references. Exact prompts and rejected first pass are retained in
provenance.json and first-edit.png. Master is native 1254 x 1254; no upscale.

Review: /experiments/planet-hero-review.html?mission=planet-orbital-watch
Empty flight: /experiments/flight.html?mission=planet-orbital-watch

Six-camera baked review: /experiments/planet-hero-review.html?mission=planet-orbital-cube
Six-camera baked flight: /experiments/flight.html?mission=planet-orbital-cube
`cube-recipe.json` places the original planet/sun cards. `cube-v1/manifest.json`
records six 1024-square 90-degree software perspective captures from one origin,
with explicit camera bases, row convention and hashes. The cube mission loads
these six PNGs only, not the source sprites. Axis diagnostic faces accompany the
bake. The original card mission remains a separate comparison.

The active `planet-orbital-cube` mission now uses `animation-cube-v1/`: nine
stages with six 1024-square faces each. `impact-art-v1/prompts.json` records
the new ImageGen plates; `impact-registered-v1/` contains their frozen-baseline,
feathered composites. `tools/bake-orbital-impact.py` reproduces registration,
fire/smoke compositing and every six-camera bake. Contact is light-only. The
main aftermath stays unchanged when the separately masked land fires and smoke
appear. Existing Impact Watch/dogfight links select this replacement.
Use `planet-orbital-static` for the static six-face baseline comparison.

Uses the existing 110-degree tangent card and star occlusion during baking. Terrain relief is substantially
flatter, but small clouds still have some exaggerated volume. At the 45-degree
flight lens, source magnification remains visibly soft. A larger output bake
cannot recover absent source detail; higher native resolution or carefully
registered detail patches would be a separate experiment before hero approval.
