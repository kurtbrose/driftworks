# Retained studies and evidence

This directory contains reusable review pages, their source assets and baselines,
and retained measurements and referenced visual evidence. Serve these pages from
the repository root, like the rest of the static site. Relative imports are local.

Driftworks is primarily a 3D space simulator. New flight visual studies should
use real 3D ships, world-space trajectories, perspective and depth, preferably
through the production renderer. A 2D schematic is not a substitute for an
in-scene flight review. See [flight visual reviews](../docs/flight-presentation.md#flight-visual-reviews).

Use `output/<task>/` for disposable screenshots, logs and profiles, and
`.scratch/<task>/` for scratch scripts and probes. Both directories are ignored.
Promote selected evidence here or into
`docs/benchmarks/` deliberately; do not force-add generated output.

Existing review pages and baking/test tools that consume these studies use this
location. Some studies retain large historical geometry snapshots for A/B review.
They are development assets, not flight runtime dependencies.
