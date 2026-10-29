# Retained studies and evidence

This directory contains reusable review pages, their source assets and baselines,
and retained measurements and referenced visual evidence. Serve these pages from
the repository root, like the rest of the static site. Relative imports are local.

Use `output/` for disposable screenshots, logs, profiles and scratch scripts.
That directory is ignored. Promote selected evidence here or into
`docs/benchmarks/` deliberately; do not force-add generated output.

Existing review pages and baking/test tools that consume these studies use this
location. Some studies retain large historical geometry snapshots for A/B review.
They are development assets, not flight runtime dependencies.
